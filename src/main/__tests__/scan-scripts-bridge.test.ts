import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';
import { spawn } from 'child_process';

vi.mock('electron', () => ({
  app: { getAppPath: () => process.cwd() },
}));

import { MapGenerator } from '../map-generator';
import { MAP_ID_IDIOMS } from '../../shared/mapEventReferences';

/**
 * Round-trip tests for the Ruby `scan_scripts_for_map_ids` command.
 *
 * Each test rebuilds a fresh tmp project with a hand-crafted `Scripts.rxdata`
 * — an Array of [section_id, name, Zlib.deflate(text)] triples — so we control
 * exactly which idioms appear where and can assert line numbers and confidence.
 *
 * Requires Ruby in PATH (same expectation as event-preserving-patch.test.ts).
 */
describe('scan_scripts_for_map_ids (Ruby integration)', () => {
  let generator: MapGenerator;
  let projectPath: string;
  let scriptsPath: string;

  beforeEach(async () => {
    generator = new MapGenerator();
    projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'scan-scripts-test-'));
    await fs.ensureDir(path.join(projectPath, 'Data'));
    scriptsPath = path.join(projectPath, 'Data', 'Scripts.rxdata');
  });

  it('returns empty without invoking Ruby when candidateIds is empty', async () => {
    // Intentionally no Scripts.rxdata on disk — short-circuit must skip the spawn.
    const result = await generator.scanScriptsForMapIds(projectPath, {
      candidateIds: [],
      idioms: MAP_ID_IDIOMS,
    });
    expect(result.matches).toEqual([]);
    expect(result.sectionErrors).toEqual([]);
  });

  it('errors clearly when Scripts.rxdata is missing', async () => {
    await expect(
      generator.scanScriptsForMapIds(projectPath, {
        candidateIds: [5],
        idioms: MAP_ID_IDIOMS,
      })
    ).rejects.toThrow(/Scripts\.rxdata not found/);
  });

  it('flags a match in a line with an idiom as high confidence', async () => {
    await writeScriptsFixture(scriptsPath, [
      {
        id: 100,
        name: 'PField_Transfer',
        text: "def go\n  pbDirectTransfer(5, 8, 8)\nend\n",
      },
    ]);
    const result = await generator.scanScriptsForMapIds(projectPath, {
      candidateIds: [5],
      idioms: MAP_ID_IDIOMS,
    });
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({
      sectionIndex: 0,
      sectionName: 'PField_Transfer',
      line: 2,
      targetMapId: 5,
      confidence: 'high',
    });
    expect(result.matches[0].snippet).toContain('pbDirectTransfer');
  });

  it('does not flag a bare numeric line without a map idiom', async () => {
    await writeScriptsFixture(scriptsPath, [
      { id: 200, name: 'NumericConst', text: 'MAP_BASE = 7\n' },
    ]);
    const result = await generator.scanScriptsForMapIds(projectPath, {
      candidateIds: [7],
      idioms: MAP_ID_IDIOMS,
    });
    expect(result.matches).toEqual([]);
  });

  it('only scans lines that contain an idiom (bare line skipped, idiom line matched)', async () => {
    await writeScriptsFixture(scriptsPath, [
      {
        id: 300,
        name: 'Mixed',
        text: 'BASE = 5\nresult = Map.from_id(7)\n',
      },
    ]);
    const result = await generator.scanScriptsForMapIds(projectPath, {
      candidateIds: [5, 7],
      idioms: MAP_ID_IDIOMS,
    });
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({
      line: 2,
      targetMapId: 7,
      confidence: 'high',
    });
  });

  it('aggregates matches across multiple sections', async () => {
    await writeScriptsFixture(scriptsPath, [
      { id: 1, name: 'Header', text: '# nothing here\n' },
      { id: 2, name: 'TransferA', text: 'pbDirectTransfer(5, 0, 0)\n' },
      { id: 3, name: 'TransferB', text: '$game_temp.player_new_map_id = 7\n' },
      { id: 4, name: 'Unrelated', text: 'x = 999\n' },
    ]);
    const result = await generator.scanScriptsForMapIds(projectPath, {
      candidateIds: [5, 7],
      idioms: MAP_ID_IDIOMS,
    });
    const sectionNames = result.matches.map((m) => m.sectionName).sort();
    expect(sectionNames).toEqual(['TransferA', 'TransferB']);
    expect(result.matches.every((m) => m.confidence === 'high')).toBe(true);
  });

  it('records section-level inflate errors without aborting the rest of the scan', async () => {
    await writeScriptsFixture(
      scriptsPath,
      [
        { id: 1, name: 'GoodSection', text: 'pbDirectTransfer(5, 1, 1)\n' },
        // Corrupt section: pass a string that is NOT valid zlib data; Ruby's Zlib::Inflate
        // will raise. The scanner must record a sectionError and keep going.
        { id: 2, name: 'CorruptSection', text: '__RAW_BAD_DATA__', rawCompressed: 'not zlib data' },
        { id: 3, name: 'AnotherGood', text: 'Map.from_id(5)\n' },
      ]
    );
    const result = await generator.scanScriptsForMapIds(projectPath, {
      candidateIds: [5],
      idioms: MAP_ID_IDIOMS,
    });
    expect(result.sectionErrors).toHaveLength(1);
    expect(result.sectionErrors[0]).toMatchObject({
      sectionIndex: 1,
      sectionName: 'CorruptSection',
    });
    expect(result.sectionErrors[0].error).toMatch(/inflate failed/);
    expect(result.matches.map((m) => m.sectionName).sort()).toEqual(['AnotherGood', 'GoodSection']);
  });

  it('does NOT match a substring of a longer number (\\b\\d+\\b)', async () => {
    await writeScriptsFixture(scriptsPath, [
      { id: 1, name: 'Boundaries', text: 'x = 1234\ny = 5678\n' },
    ]);
    // Asking for id 123 (substring of 1234) — must not fire because \b doesn't break mid-digit.
    const result = await generator.scanScriptsForMapIds(projectPath, {
      candidateIds: [123],
      idioms: MAP_ID_IDIOMS,
    });
    expect(result.matches).toEqual([]);
  });

  it('snippet is trimmed and capped (≤ 81 chars including ellipsis)', async () => {
    const longLine = `pbDirectTransfer(5, ${'#'.repeat(150)})\n`;
    await writeScriptsFixture(scriptsPath, [{ id: 9, name: 'LongLine', text: longLine }]);
    const result = await generator.scanScriptsForMapIds(projectPath, {
      candidateIds: [5],
      idioms: MAP_ID_IDIOMS,
    });
    expect(result.matches[0].snippet.length).toBeLessThanOrEqual(81);
    expect(result.matches[0].snippet.endsWith('…')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test helper — build a Scripts.rxdata fixture via inline Ruby.
//
// Scripts.rxdata is Marshal.dump([[section_id, name, Zlib.deflate(text)], ...]).
// We need real zlib output for the success cases, but also occasionally a raw
// (non-zlib) payload to exercise the inflate-failure branch. The `rawCompressed`
// escape hatch lets a fixture entry skip the Zlib.deflate step.
// ---------------------------------------------------------------------------
interface FixtureSection {
  id: number;
  name: string;
  text: string;
  /** If set, used verbatim as the 3rd slot instead of Zlib.deflate(text). For corrupt-section tests. */
  rawCompressed?: string;
}

async function writeScriptsFixture(scriptsPath: string, sections: FixtureSection[]): Promise<void> {
  const sectionsRuby = sections
    .map((s) => {
      const compressed = s.rawCompressed != null
        ? JSON.stringify(s.rawCompressed)
        : `Zlib.deflate(${JSON.stringify(s.text)})`;
      return `[${s.id}, ${JSON.stringify(s.name)}, ${compressed}]`;
    })
    .join(',\n  ');

  const script = `
require 'zlib'
sections = [
  ${sectionsRuby}
]
File.open(${JSON.stringify(scriptsPath)}, 'wb') { |f| Marshal.dump(sections, f) }
`.trim();

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('ruby', ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    proc.on('error', (err) => reject(new Error(`Failed to spawn Ruby for fixture: ${err.message}`)));
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Ruby fixture exited ${code}: ${stderr}`));
    });
  });
}

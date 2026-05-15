import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';
import { spawn } from 'child_process';

vi.mock('electron', () => ({
  app: { getAppPath: () => process.cwd() },
}));

import { MapGenerator } from '../map-generator';
import { handleDeleteMaps } from '../handlers';

/**
 * Round-trip tests for the Ruby `delete_maps` command.
 *
 * Each test rebuilds a fresh tiny project under `os.tmpdir()` with 4 maps in a small
 * hierarchy plus a System.rxdata fixture that pins start_x / start_y / party_members
 * so we can verify those fields survive the delete (round-trip Marshal — not rebuild).
 *
 * Requires Ruby in PATH. Mirrors the pattern in `event-preserving-patch.test.ts`.
 */
describe('delete_maps (Ruby integration)', () => {
  let generator: MapGenerator;
  let tmpRoot: string;
  let projectPath: string;
  let dataDir: string;

  beforeAll(() => {
    generator = new MapGenerator();
  });

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'delete-maps-test-'));
    projectPath = tmpRoot;
    dataDir = path.join(projectPath, 'Data');
    await fs.ensureDir(dataDir);

    // 4 map files. Tiny grids so the test runs fast.
    for (const id of [1, 2, 3, 4]) {
      await generator.generateMapFile(projectPath, id, {
        width: 3,
        height: 3,
        tilesetId: 1,
        layers: Array.from({ length: 3 }, () =>
          Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => 384))
        ),
        events: [],
      } as any);
    }

    // MapInfos: register each id (registerMapInInfos appends with parent_id=0), then
    // write the full hierarchy so 3 is under 2 and 4 is under 3.
    await generator.registerMapInInfos(projectPath, 1, 'Root One');
    await generator.registerMapInInfos(projectPath, 2, 'Root Two');
    await generator.registerMapInInfos(projectPath, 3, 'Child of 2');
    await generator.registerMapInInfos(projectPath, 4, 'Grandchild of 3');
    await generator.writeMapInfosHierarchy(projectPath, [
      { id: 1, parentId: 0, order: 0 },
      { id: 2, parentId: 0, order: 1 },
      { id: 3, parentId: 2, order: 0 },
      { id: 4, parentId: 3, order: 0 },
    ]);

    // System.rxdata — built via an inline Ruby snippet that requires the production
    // marshal_handler.rb purely for its RPG::System class definition. We pin a handful
    // of non-target fields so we can assert they survive the round-trip.
    await writeSystemFixture(path.join(dataDir, 'System.rxdata'), {
      startMapId: 1,
      editMapId: 2,
      startX: 7,
      startY: 11,
      partyMembers: [3, 9],
    });
  });

  afterAll(async () => {
    // Each test gets a fresh tmp dir; leftover dirs from previous runs are harmless.
    // beforeEach creates a new dir, so afterAll is a no-op.
  });

  it('removes the deleted ids from MapInfos and surviving rows keep their fields', async () => {
    await generator.deleteMaps(projectPath, {
      ids: [3, 4],
      newStartMapId: 1,
      newEditMapId: 1,
    });

    const infos = await generator.readMapInfos(projectPath);
    const surviving = Object.values(infos).map((m: any) => m.id).sort();
    expect(surviving).toEqual([1, 2]);
    expect(infos['1'].name).toBe('Root One');
    expect(infos['2'].name).toBe('Root Two');
    expect(infos['2'].parentId).toBe(0);
    expect(infos['2'].order).toBe(1);
  });

  it('deletes the Map###.rxdata file from disk for each removed id', async () => {
    await generator.deleteMaps(projectPath, {
      ids: [3, 4],
      newStartMapId: 1,
      newEditMapId: 1,
    });

    expect(fs.existsSync(path.join(dataDir, 'Map001.rxdata'))).toBe(true);
    expect(fs.existsSync(path.join(dataDir, 'Map002.rxdata'))).toBe(true);
    expect(fs.existsSync(path.join(dataDir, 'Map003.rxdata'))).toBe(false);
    expect(fs.existsSync(path.join(dataDir, 'Map004.rxdata'))).toBe(false);
  });

  it('patches start_map_id and edit_map_id, preserving other System fields', async () => {
    await generator.deleteMaps(projectPath, {
      ids: [1],
      newStartMapId: 2,
      newEditMapId: 2,
    });

    const system = await generator.readSystem(projectPath);
    expect(system.startMapId).toBe(2);
    expect(system.editMapId).toBe(2);
    // Pinned non-target fields must round-trip untouched.
    expect(system.startX).toBe(7);
    expect(system.startY).toBe(11);
    expect(system.partyMembers).toEqual([3, 9]);
  });

  it('cleans up .bak files on the success path', async () => {
    await generator.deleteMaps(projectPath, {
      ids: [4],
      newStartMapId: 1,
      newEditMapId: 1,
    });

    expect(fs.existsSync(path.join(dataDir, 'MapInfos.rxdata.bak'))).toBe(false);
    expect(fs.existsSync(path.join(dataDir, 'System.rxdata.bak'))).toBe(false);
    expect(fs.existsSync(path.join(dataDir, 'Map004.rxdata.bak'))).toBe(false);
  });

  it('reports requestedIds / mapFilesDeleted counts in the resolution payload', async () => {
    const result = await generator.deleteMaps(projectPath, {
      ids: [3, 4],
      newStartMapId: 1,
      newEditMapId: 1,
    });

    expect(result.mapFilesDeleted).toBe(2);
    expect(result.deletedFromMapInfos).toBe(2);
    expect(result.requestedIds.sort()).toEqual([3, 4]);
  });

  it('errors when MapInfos.rxdata is missing (and leaves disk untouched)', async () => {
    await fs.remove(path.join(dataDir, 'MapInfos.rxdata'));

    await expect(
      generator.deleteMaps(projectPath, {
        ids: [4],
        newStartMapId: 1,
        newEditMapId: 1,
      })
    ).rejects.toThrow(/MapInfos\.rxdata not found/);

    // Map files were not touched (Phase 1 backups never ran since validation failed first).
    expect(fs.existsSync(path.join(dataDir, 'Map004.rxdata'))).toBe(true);
  });

  // ---------- handleDeleteMaps argument validation (no Ruby spawn) ----------

  it('handleDeleteMaps rejects an empty ids array without invoking Ruby', async () => {
    const result = await handleDeleteMaps(projectPath, {
      ids: [],
      newStartMapId: 1,
      newEditMapId: 1,
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/non-empty array/i);
    // Disk untouched.
    expect(fs.existsSync(path.join(dataDir, 'Map001.rxdata'))).toBe(true);
  });

  it('handleDeleteMaps rejects a non-positive id', async () => {
    const result = await handleDeleteMaps(projectPath, {
      ids: [0, 2],
      newStartMapId: 1,
      newEditMapId: 1,
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid id/);
  });

  it('handleDeleteMaps rejects a negative newStartMapId', async () => {
    const result = await handleDeleteMaps(projectPath, {
      ids: [2],
      newStartMapId: -1,
      newEditMapId: 1,
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid newStartMapId/);
  });

  it('handleDeleteMaps round-trips and refreshes mapInfos + system in one response', async () => {
    const result = await handleDeleteMaps(projectPath, {
      ids: [4],
      newStartMapId: 1,
      newEditMapId: 1,
    });
    expect(result.success).toBe(true);
    expect(result.data?.mapInfos).toBeDefined();
    expect(Object.keys(result.data!.mapInfos!).sort()).toEqual(['1', '2', '3']);
    expect(result.data?.system?.startMapId).toBe(1);
    expect(result.data?.system?.editMapId).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Test helper — build a System.rxdata fixture via an inline Ruby snippet.
//
// We can't use `mapGenerator.writeSystem(...)` because that method doesn't exist (the app
// never *writes* full System.rxdata — only `delete_maps` patches two fields). For tests we
// need to bootstrap a valid System file, so we shell out to Ruby with `-e` and require the
// production marshal_handler.rb just for its RPG::System class definition (the dispatcher
// at the bottom is guarded by `if __FILE__ == $0`, so requiring is side-effect-free).
// ---------------------------------------------------------------------------
async function writeSystemFixture(
  systemPath: string,
  fields: { startMapId: number; editMapId: number; startX: number; startY: number; partyMembers: number[] }
): Promise<void> {
  const handlerPath = path.join(process.cwd(), 'src', 'bridge', 'marshal_handler.rb');
  const script = `
require ${JSON.stringify(handlerPath)}
sys = RPG::System.new
sys.magic_number = 12345
sys.party_members = ${JSON.stringify(fields.partyMembers)}
sys.elements = ['', 'Fire', 'Water']
sys.switches = ['', 'TestSwitch']
sys.variables = ['', 'TestVar']
sys.windowskin_name = 'window'
sys.title_name = 'title'
sys.gameover_name = 'gameover'
sys.battle_transition = 'graphics'
sys.battleback_name = 'bg'
sys.start_map_id = ${fields.startMapId}
sys.start_x = ${fields.startX}
sys.start_y = ${fields.startY}
sys.edit_map_id = ${fields.editMapId}
File.open(${JSON.stringify(systemPath)}, 'wb') { |f| Marshal.dump(sys, f) }
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

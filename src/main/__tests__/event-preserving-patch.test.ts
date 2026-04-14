import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';

vi.mock('electron', () => ({
  app: { getAppPath: () => process.cwd() },
}));

import { MapGenerator } from '../map-generator';

/**
 * Integration tests for the event-preserving tile patch path.
 *
 * These tests use the real Ruby bridge (marshal_handler.rb) to round-trip
 * map data through create_map → patch_map_tiles → read_map and verify
 * that events survive tile patching.
 *
 * Requires Ruby to be installed and in PATH.
 */
describe('event-preserving patch (Ruby integration)', () => {
  let generator: MapGenerator;
  let tmpDir: string;
  let dataDir: string;

  beforeAll(async () => {
    generator = new MapGenerator();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'epatch-test-'));
    dataDir = path.join(tmpDir, 'Data');
    await fs.ensureDir(dataDir);
  });

  afterAll(async () => {
    await fs.remove(tmpDir);
  });

  it('patch_map_tiles preserves events after tile patching', async () => {
    const mapId = 1;

    const originalMapData = {
      width: 5,
      height: 5,
      tilesetId: 1,
      layers: Array.from({ length: 3 }, () =>
        Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 384))
      ),
      events: [
        { x: 2, y: 3, name: 'TestNPC' },
        { x: 4, y: 1, name: 'WarpPad' },
      ],
    };

    await generator.generateMapFile(tmpDir, mapId, originalMapData as any);

    const beforePatch = await generator.readMap(tmpDir, mapId);
    expect(beforePatch.events.length).toBe(2);
    expect(beforePatch.events.map((e) => e.name).sort()).toEqual(['TestNPC', 'WarpPad']);

    const patchLayers = Array.from({ length: 3 }, (_, z) =>
      Array.from({ length: 5 }, () =>
        Array.from({ length: 5 }, () => (z === 0 ? 400 : 0))
      )
    );

    const patchData = {
      id: mapId,
      name: 'Patched',
      width: 5,
      height: 5,
      tilesetId: 1,
      layers: patchLayers,
      events: [],
    };

    await generator.patchMapData(tmpDir, mapId, patchData as any, true, true);

    const afterPatch = await generator.readMap(tmpDir, mapId);

    expect(afterPatch.events.length).toBe(2);
    expect(afterPatch.events.map((e) => e.name).sort()).toEqual(['TestNPC', 'WarpPad']);

    const npc = afterPatch.events.find((e) => e.name === 'TestNPC')!;
    expect(npc.x).toBe(2);
    expect(npc.y).toBe(3);

    const warp = afterPatch.events.find((e) => e.name === 'WarpPad')!;
    expect(warp.x).toBe(4);
    expect(warp.y).toBe(1);

    expect(afterPatch.layers[0][0][0]).toBe(400);
  });

  it('patch_map_data (preserveEvents=false) still wipes events', async () => {
    const mapId = 2;

    const originalMapData = {
      width: 3,
      height: 3,
      tilesetId: 1,
      layers: Array.from({ length: 3 }, () =>
        Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => 384))
      ),
      events: [{ x: 1, y: 1, name: 'ShouldBeWiped' }],
    };

    await generator.generateMapFile(tmpDir, mapId, originalMapData as any);

    const beforePatch = await generator.readMap(tmpDir, mapId);
    expect(beforePatch.events.length).toBe(1);

    const patchData = {
      id: mapId,
      name: 'Wiped',
      width: 3,
      height: 3,
      tilesetId: 1,
      layers: Array.from({ length: 3 }, () =>
        Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => 400))
      ),
      events: [],
    };

    await generator.patchMapData(tmpDir, mapId, patchData as any, true, false);

    const afterPatch = await generator.readMap(tmpDir, mapId);
    expect(afterPatch.events.length).toBe(0);
  });

  it('preserves encounter_list during tile patching', async () => {
    const mapId = 3;

    await generator.generateMapFile(tmpDir, mapId, {
      width: 3,
      height: 3,
      tilesetId: 1,
      layers: Array.from({ length: 3 }, () =>
        Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => 384))
      ),
      events: [{ x: 0, y: 0, name: 'Guard' }],
    } as any);

    const before = await generator.readMap(tmpDir, mapId);
    const originalEncounterCount = before.encounterList.length;
    const originalEventCount = before.events.length;

    await generator.patchMapData(
      tmpDir,
      mapId,
      {
        id: mapId,
        name: 'EncounterTest',
        width: 3,
        height: 3,
        tilesetId: 1,
        layers: Array.from({ length: 3 }, () =>
          Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => 400))
        ),
        events: [],
      } as any,
      true,
      true
    );

    const after = await generator.readMap(tmpDir, mapId);
    expect(after.encounterList.length).toBe(originalEncounterCount);
    expect(after.events.length).toBe(originalEventCount);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { runDeletePreflight } from '../delete-preflight';
import type { DeletePreflightDeps, DeletePreflightProgress } from '../delete-preflight';
import type {
  EventData,
  MapInfoData,
  MapInfosReadData,
  MapReadData,
  SystemReadData,
} from '../../shared/types';
import type { ScriptScanResult } from '../map-generator';

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function mi(id: number, parentId = 0, order = id, name = `Map${id}`): MapInfoData {
  return { id, name, parentId, order, expanded: false, scrollX: 0, scrollY: 0 };
}
function infos(...rows: MapInfoData[]): MapInfosReadData {
  const out: MapInfosReadData = {};
  for (const r of rows) out[String(r.id)] = r;
  return out;
}

function system(over: Partial<SystemReadData> = {}): SystemReadData {
  return {
    startMapId: 1,
    startX: 0,
    startY: 0,
    editMapId: 1,
    partyMembers: [],
    elements: [],
    switches: [],
    variables: [],
    windowskinName: '',
    titleName: '',
    gameoverName: '',
    battleTransition: '',
    battlebackName: '',
    ...over,
  };
}

function mapWithEvents(events: EventData[] = []): MapReadData {
  return {
    tilesetId: 1,
    width: 3,
    height: 3,
    autoplayBgm: false,
    bgm: null,
    autoplayBgs: false,
    bgs: null,
    encounterStep: 30,
    encounterList: [],
    layers: [],
    events,
  };
}

function makeDeps(over: Partial<DeletePreflightDeps> = {}): DeletePreflightDeps {
  return {
    readMapInfos: vi.fn(async () => ({}) as MapInfosReadData),
    readSystem: vi.fn(async () => system()),
    readMap: vi.fn(async () => mapWithEvents()),
    scanScriptsForMapIds: vi.fn(async (): Promise<ScriptScanResult> => ({
      matches: [],
      sectionErrors: [],
    })),
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runDeletePreflight — survivors / deletion math', () => {
  it('expands a folder seed to all descendants in deletedIds', async () => {
    const deps = makeDeps({
      readMapInfos: async () => infos(mi(1, 0, 0), mi(2, 1, 0), mi(3, 2, 0), mi(4, 0, 1)),
      readSystem: async () => system({ startMapId: 4, editMapId: 4 }),
    });
    const result = await runDeletePreflight({ projectPath: '/p', ids: [1], deps });
    expect(result.deletedIds).toEqual([1, 2, 3]);
    expect(result.survivorIds).toEqual([4]);
  });
});

describe('runDeletePreflight — start_map_id policy', () => {
  it('keeps newStartMapId when the old one survives (no blocker, no pick required)', async () => {
    const deps = makeDeps({
      readMapInfos: async () => infos(mi(1), mi(2), mi(3)),
      readSystem: async () => system({ startMapId: 1, editMapId: 1 }),
    });
    const result = await runDeletePreflight({ projectPath: '/p', ids: [3], deps });
    expect(result.newStartMapId).toBe(1);
    expect(result.startMapPickRequired).toBe(false);
    expect(result.blockers.find((b) => b.kind === 'start-map-invalidated')).toBeUndefined();
  });

  it('blocks + flags startMapPickRequired when the start map is deleted but survivors remain', async () => {
    const deps = makeDeps({
      readMapInfos: async () => infos(mi(1), mi(2)),
      readSystem: async () => system({ startMapId: 1, editMapId: 1 }),
    });
    const result = await runDeletePreflight({ projectPath: '/p', ids: [1], deps });
    expect(result.startMapPickRequired).toBe(true);
    expect(result.newStartMapId).toBe(0); // pending user pick
    expect(result.blockers).toContainEqual({ kind: 'start-map-invalidated', oldStartMapId: 1 });
  });

  it('emits delete-to-zero warning when the operation removes all maps', async () => {
    const deps = makeDeps({
      readMapInfos: async () => infos(mi(1), mi(2)),
      readSystem: async () => system({ startMapId: 1, editMapId: 1 }),
    });
    const result = await runDeletePreflight({ projectPath: '/p', ids: [1, 2], deps });
    expect(result.warnings).toContainEqual({ kind: 'delete-to-zero' });
    expect(result.startMapPickRequired).toBe(false); // nothing to pick from
    expect(result.newStartMapId).toBe(0);
    expect(result.newEditMapId).toBe(0);
  });
});

describe('runDeletePreflight — edit_map_id auto-fix', () => {
  it('sets newEditMapId to newStartMapId when start survives', async () => {
    const deps = makeDeps({
      readMapInfos: async () => infos(mi(1), mi(2), mi(3)),
      readSystem: async () => system({ startMapId: 2, editMapId: 3 }),
    });
    const result = await runDeletePreflight({ projectPath: '/p', ids: [3], deps });
    expect(result.newEditMapId).toBe(2);
    expect(result.warnings).toContainEqual({ kind: 'edit-map-changed', from: 3, to: 2 });
  });

  it('falls back to first preorder survivor when start map is deleted', async () => {
    const deps = makeDeps({
      readMapInfos: async () => infos(mi(1), mi(2), mi(3)),
      readSystem: async () => system({ startMapId: 1, editMapId: 1 }),
    });
    const result = await runDeletePreflight({ projectPath: '/p', ids: [1], deps });
    // After deletion: survivors are [2, 3] in preorder. newStartMapId is 0 (pending pick).
    // Auto-fix → 2.
    expect(result.newEditMapId).toBe(2);
  });

  it('no edit-map-changed warning when value is unchanged', async () => {
    const deps = makeDeps({
      readMapInfos: async () => infos(mi(1), mi(2), mi(3)),
      readSystem: async () => system({ startMapId: 1, editMapId: 1 }),
    });
    const result = await runDeletePreflight({ projectPath: '/p', ids: [3], deps });
    // start survives; newEdit = startMapId = 1; oldEdit = 1 → no change.
    expect(result.warnings.find((w) => w.kind === 'edit-map-changed')).toBeUndefined();
  });
});

describe('runDeletePreflight — reference aggregation', () => {
  it('collects event refs from each survivor map via injected readMap', async () => {
    const readMap = vi.fn(async (_pp: string, mapId: number): Promise<MapReadData> => {
      if (mapId === 2) {
        return mapWithEvents([
          {
            id: 1,
            name: 'TransferToDeleted',
            x: 0,
            y: 0,
            pages: [
              {
                index: 0,
                trigger: 0,
                moveType: 0,
                moveSpeed: 3,
                moveFrequency: 3,
                walkAnime: true,
                stepAnime: false,
                directionFix: false,
                through: false,
                alwaysOnTop: false,
                graphic: {
                  tileId: 0,
                  characterName: '',
                  characterHue: 0,
                  direction: 2,
                  pattern: 0,
                  opacity: 255,
                  blendType: 0,
                },
                commands: [{ code: 201, indent: 0, parameters: [0, 1, 0, 0, 2, 0] }],
              },
            ],
          },
        ]);
      }
      return mapWithEvents();
    });

    const deps = makeDeps({
      readMapInfos: async () => infos(mi(1), mi(2), mi(3)),
      readSystem: async () => system({ startMapId: 2, editMapId: 2 }),
      readMap,
    });
    const result = await runDeletePreflight({ projectPath: '/p', ids: [1], deps });
    expect(result.references).toHaveLength(1);
    expect(result.references[0]).toMatchObject({
      sourceKind: 'event',
      sourceMapId: 2,
      targetMapId: 1,
    });
    expect(result.blockers).toContainEqual({ kind: 'references-found', refCount: 1 });
  });

  it('passes the canonical idiom list to the scripts scanner', async () => {
    const scanScriptsForMapIds = vi.fn(async (): Promise<ScriptScanResult> => ({
      matches: [],
      sectionErrors: [],
    }));
    const deps = makeDeps({
      readMapInfos: async () => infos(mi(1), mi(2)),
      readSystem: async () => system({ startMapId: 2, editMapId: 2 }),
      scanScriptsForMapIds,
    });
    await runDeletePreflight({ projectPath: '/p', ids: [1], deps });
    expect(scanScriptsForMapIds).toHaveBeenCalledTimes(1);
    const call = scanScriptsForMapIds.mock.calls[0]!;
    expect(call[1].candidateIds).toEqual([1]);
    expect(call[1].idioms).toContain('pbDirectTransfer');
  });

  it('maps script matches into MapReference rows with sourceKind="script"', async () => {
    const deps = makeDeps({
      readMapInfos: async () => infos(mi(1), mi(2)),
      readSystem: async () => system({ startMapId: 2, editMapId: 2 }),
      scanScriptsForMapIds: async () => ({
        matches: [
          {
            sectionIndex: 3,
            sectionName: 'PField_Transfer',
            line: 42,
            targetMapId: 1,
            confidence: 'high',
            snippet: 'pbDirectTransfer(1, 0, 0)',
          },
        ],
        sectionErrors: [],
      }),
    });
    const result = await runDeletePreflight({ projectPath: '/p', ids: [1], deps });
    expect(result.references).toContainEqual(
      expect.objectContaining({
        sourceKind: 'script',
        sourceScriptName: 'PField_Transfer',
        sourceLine: 42,
        confidence: 'high',
        targetMapId: 1,
      })
    );
    expect(result.blockers).toContainEqual({ kind: 'references-found', refCount: 1 });
  });

  it('promotes scripts sectionErrors into a warning', async () => {
    const deps = makeDeps({
      readMapInfos: async () => infos(mi(1), mi(2)),
      readSystem: async () => system({ startMapId: 2, editMapId: 2 }),
      scanScriptsForMapIds: async () => ({
        matches: [],
        sectionErrors: [
          { sectionIndex: 5, sectionName: 'Corrupt', error: 'inflate failed: invalid' },
        ],
      }),
    });
    const result = await runDeletePreflight({ projectPath: '/p', ids: [1], deps });
    expect(result.warnings).toContainEqual({ kind: 'script-section-errors', count: 1 });
  });
});

describe('runDeletePreflight — short-circuits', () => {
  it('does NOT call readMap or scanScriptsForMapIds when seeds resolve to empty deletedIds', async () => {
    const readMap = vi.fn(async () => mapWithEvents());
    const scanScriptsForMapIds = vi.fn(async (): Promise<ScriptScanResult> => ({
      matches: [],
      sectionErrors: [],
    }));
    const deps = makeDeps({
      readMapInfos: async () => infos(mi(1)),
      readMap,
      scanScriptsForMapIds,
    });
    await runDeletePreflight({ projectPath: '/p', ids: [9999], deps }); // not in MapInfos
    expect(readMap).not.toHaveBeenCalled();
    expect(scanScriptsForMapIds).not.toHaveBeenCalled();
  });
});

describe('runDeletePreflight — progress events', () => {
  it('emits system → map-events (final) → scripts → done in order', async () => {
    const events: DeletePreflightProgress[] = [];
    const deps = makeDeps({
      readMapInfos: async () => infos(mi(1), mi(2), mi(3)),
      readSystem: async () => system({ startMapId: 2, editMapId: 2 }),
    });
    await runDeletePreflight({
      projectPath: '/p',
      ids: [1],
      deps,
      onProgress: (p) => events.push(p),
    });
    const steps = events.map((e) => e.step);
    expect(steps[0]).toBe('system');
    expect(steps).toContain('map-events');
    expect(steps).toContain('scripts');
    expect(steps[steps.length - 1]).toBe('done');
    // Verify map-events monotonic current.
    const mapEvts = events.filter((e) => e.step === 'map-events') as Array<
      Extract<DeletePreflightProgress, { step: 'map-events' }>
    >;
    for (let i = 1; i < mapEvts.length; i += 1) {
      expect(mapEvts[i].current).toBeGreaterThanOrEqual(mapEvts[i - 1].current);
    }
    expect(mapEvts[mapEvts.length - 1]?.current).toBe(mapEvts[mapEvts.length - 1]?.total);
  });
});

describe('runDeletePreflight — readMap failure handling', () => {
  it('counts failed map reads in scanCounts.mapsFailed without aborting the scan', async () => {
    const readMap = vi.fn(async (_pp: string, mapId: number): Promise<MapReadData> => {
      if (mapId === 3) throw new Error('simulated read failure');
      return mapWithEvents();
    });
    const deps = makeDeps({
      readMapInfos: async () => infos(mi(1), mi(2), mi(3)),
      readSystem: async () => system({ startMapId: 2, editMapId: 2 }),
      readMap,
    });
    const result = await runDeletePreflight({ projectPath: '/p', ids: [1], deps });
    expect(result.scanCounts.mapsFailed).toBe(1);
    expect(result.scanCounts.mapsScanned).toBe(2);
    expect(result.scanCounts.mapsTotal).toBe(2);
  });
});

describe('runDeletePreflight — concurrency', () => {
  it('runs at most `concurrency` parallel readMap calls', async () => {
    let active = 0;
    let peak = 0;
    const readMap = vi.fn(async (): Promise<MapReadData> => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return mapWithEvents();
    });
    const ten = Array.from({ length: 10 }, (_, i) => mi(i + 1));
    const deps = makeDeps({
      readMapInfos: async () => infos(...ten, mi(99)), // 11 maps total; delete 99 → 10 survivors to scan
      readSystem: async () => system({ startMapId: 1, editMapId: 1 }),
      readMap,
    });
    await runDeletePreflight({ projectPath: '/p', ids: [99], deps, concurrency: 3 });
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThanOrEqual(2); // sanity: did actually batch
  });
});

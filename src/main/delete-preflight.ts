/**
 * Delete preflight pipeline — TypeScript orchestrator.
 *
 * Runs the three-stage scan documented in the design plan:
 *
 *     system  →  map events (n / total)  →  scripts
 *
 * and aggregates the result into a single `DeletePreflightResult` that the
 * confirmation modal renders into stepped progress + a blockers/warnings panel.
 *
 * Why TS-side orchestration (vs. one fat Ruby command): per-step progress
 * events are free in JS (every `await` is a natural emit point), the event-code
 * whitelist (commit 2) is unit-testable as pure TS, and the only new Ruby
 * surface we need is `scan_scripts_for_map_ids` (commit 4). Bounded parallelism
 * on `readMap` keeps spawn overhead manageable for small-to-medium projects.
 *
 * Dependencies are injected (`DeletePreflightDeps`) so the orchestrator is
 * exhaustively testable without spawning Ruby. Production wires the deps to
 * `MapGenerator.*` in `handlers.ts`.
 */

import type { MapInfosReadData, MapReadData, SystemReadData } from '../shared/types';
import { pickEditMapIdAutoFix, simulateDelete } from '../shared/deleteIntegrity';
import type { MapReference } from '../shared/deleteIntegrity';
import { MAP_ID_IDIOMS, extractMapReferencesFromEvents } from '../shared/mapEventReferences';
import type { ScriptScanResult } from './map-generator';

// ---------------------------------------------------------------------------
// Public types — also consumed by the renderer modal (commit 7).
// ---------------------------------------------------------------------------

/** Stepped progress event. Emitted at the start of each stage and once per completed map read. */
export type DeletePreflightProgress =
  | { step: 'system' }
  | { step: 'map-events'; current: number; total: number }
  | { step: 'scripts' }
  | { step: 'done' };

/** Conditions that prevent confirm. Modal disables the destructive button until empty. */
export type DeletePreflightBlocker =
  | { kind: 'start-map-invalidated'; oldStartMapId: number }
  | { kind: 'references-found'; refCount: number };

/** Non-blocking notices. */
export type DeletePreflightWarning =
  | { kind: 'delete-to-zero' }
  | { kind: 'edit-map-changed'; from: number; to: number }
  | { kind: 'script-section-errors'; count: number };

export interface DeletePreflightResult {
  /** Seed ids the user selected (echoed for traceability). */
  requestedIds: number[];
  /** Expanded delete set: seeds + every descendant by `parent_id` (from `simulateDelete`). */
  deletedIds: number[];
  /** Post-delete survivor ids in MapInfos preorder. */
  survivorIds: number[];
  /**
   * What `start_map_id` will be persisted on confirm:
   *   - if `system.startMapId` survives → that value;
   *   - else if survivors remain → 0 until the user picks one (`startMapPickRequired`);
   *   - else (delete-to-zero) → 0.
   */
  newStartMapId: number;
  /** Per-policy auto-fix of `edit_map_id` (see `pickEditMapIdAutoFix`). */
  newEditMapId: number;
  /** True when the modal must block confirm until the user picks a new start map. */
  startMapPickRequired: boolean;
  /** All references found in surviving maps' events + scripts. */
  references: MapReference[];
  blockers: DeletePreflightBlocker[];
  warnings: DeletePreflightWarning[];
  scanCounts: {
    mapsScanned: number;
    mapsTotal: number;
    mapsFailed: number;
    scriptsScanned: boolean;
    sectionErrors: number;
  };
}

export interface DeletePreflightDeps {
  readMapInfos: (projectPath: string) => Promise<MapInfosReadData>;
  readSystem: (projectPath: string) => Promise<SystemReadData>;
  readMap: (projectPath: string, mapId: number) => Promise<MapReadData>;
  scanScriptsForMapIds: (
    projectPath: string,
    payload: { candidateIds: number[]; idioms: ReadonlyArray<string> }
  ) => Promise<ScriptScanResult>;
}

export interface RunDeletePreflightParams {
  projectPath: string;
  ids: number[];
  deps: DeletePreflightDeps;
  /** Fires at each stage boundary and once per completed map read. */
  onProgress?: (p: DeletePreflightProgress) => void;
  /** Max concurrent `readMap` calls. Default 6 (~50–150 ms spawn overhead each on Windows). */
  concurrency?: number;
}

const DEFAULT_CONCURRENCY = 6;

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function runDeletePreflight(
  params: RunDeletePreflightParams
): Promise<DeletePreflightResult> {
  const { projectPath, ids, deps, onProgress } = params;
  const concurrency = params.concurrency ?? DEFAULT_CONCURRENCY;

  // ---- Stage 1: system + simulate ----
  onProgress?.({ step: 'system' });
  const [mapInfos, system] = await Promise.all([
    deps.readMapInfos(projectPath),
    deps.readSystem(projectPath),
  ]);

  const { deletedIds, survivorIds } = simulateDelete(mapInfos, ids);
  const deletedSet = new Set(deletedIds);

  const oldStartMapId = Number(system.startMapId ?? 0);
  const oldEditMapId = Number(system.editMapId ?? 0);
  const startSurvives = oldStartMapId >= 1 && !deletedSet.has(oldStartMapId) && survivorIds.includes(oldStartMapId);
  const hasSurvivors = survivorIds.length > 0;

  // Pre-pick newStartMapId. If invalidated AND survivors exist → 0 (modal must collect a
  // pick from the user before they can confirm). If invalidated AND no survivors →
  // delete-to-zero path; we persist 0.
  const newStartMapId = startSurvives ? oldStartMapId : 0;
  const startMapPickRequired = !startSurvives && hasSurvivors && oldStartMapId >= 1;
  const newEditMapId = pickEditMapIdAutoFix(survivorIds, newStartMapId);

  const blockers: DeletePreflightBlocker[] = [];
  const warnings: DeletePreflightWarning[] = [];

  if (startMapPickRequired) {
    blockers.push({ kind: 'start-map-invalidated', oldStartMapId });
  }
  if (!hasSurvivors && deletedSet.size > 0) {
    warnings.push({ kind: 'delete-to-zero' });
  }
  if (oldEditMapId !== newEditMapId) {
    warnings.push({ kind: 'edit-map-changed', from: oldEditMapId, to: newEditMapId });
  }

  // ---- Stage 2: map events (bounded parallel readMap) ----
  const totalMaps = survivorIds.length;
  onProgress?.({ step: 'map-events', current: 0, total: totalMaps });

  // Store per-map results in a positional array so the final order is deterministic — race
  // conditions on Array.push() across parallel workers are technically safe in single-
  // threaded JS, but a stable order helps the modal's references list stay consistent.
  const perMapRefs: MapReference[][] = new Array(survivorIds.length).fill(null).map(() => []);
  let mapsScanned = 0;
  let mapsFailed = 0;

  if (deletedSet.size > 0 && totalMaps > 0) {
    const { failures } = await runWithConcurrency(
      survivorIds,
      concurrency,
      async (mapId, idx) => {
        const mapData = await deps.readMap(projectPath, mapId);
        perMapRefs[idx] = extractMapReferencesFromEvents(mapId, mapData.events, deletedSet);
      },
      (done, total) => {
        mapsScanned = done;
        onProgress?.({ step: 'map-events', current: done, total });
      }
    );
    mapsFailed = failures.length;
  } else if (totalMaps > 0) {
    // Nothing to scan for, but still emit a completed map-events stage for UI consistency.
    onProgress?.({ step: 'map-events', current: totalMaps, total: totalMaps });
  }

  const eventRefs = perMapRefs.flat();

  // ---- Stage 3: scripts ----
  onProgress?.({ step: 'scripts' });
  const scriptResult: ScriptScanResult =
    deletedSet.size > 0
      ? await deps.scanScriptsForMapIds(projectPath, {
          candidateIds: Array.from(deletedSet),
          idioms: MAP_ID_IDIOMS,
        })
      : { matches: [], sectionErrors: [] };

  const scriptRefs: MapReference[] = scriptResult.matches.map((m) => ({
    sourceKind: 'script',
    sourceScriptName: m.sectionName,
    sourceLine: m.line,
    confidence: m.confidence,
    targetMapId: m.targetMapId,
    summary: `${m.sectionName}:L${m.line} → Map${pad(m.targetMapId)}: ${m.snippet}`,
  }));

  if (scriptResult.sectionErrors.length > 0) {
    warnings.push({ kind: 'script-section-errors', count: scriptResult.sectionErrors.length });
  }

  // ---- Aggregate + final blocker check ----
  const references = [...eventRefs, ...scriptRefs];
  if (references.length > 0) {
    blockers.push({ kind: 'references-found', refCount: references.length });
  }

  onProgress?.({ step: 'done' });

  return {
    requestedIds: [...ids],
    deletedIds,
    survivorIds,
    newStartMapId,
    newEditMapId,
    startMapPickRequired,
    references,
    blockers,
    warnings,
    scanCounts: {
      mapsScanned,
      mapsTotal: totalMaps,
      mapsFailed,
      scriptsScanned: deletedSet.size > 0,
      sectionErrors: scriptResult.sectionErrors.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Internal: bounded concurrency runner
// ---------------------------------------------------------------------------

async function runWithConcurrency<T>(
  items: ReadonlyArray<T>,
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>,
  onProgress: (done: number, total: number) => void
): Promise<{ failures: Array<{ item: T; index: number; error: Error }> }> {
  const failures: Array<{ item: T; index: number; error: Error }> = [];
  let nextIdx = 0;
  let doneCount = 0;
  const total = items.length;

  async function worker(): Promise<void> {
    for (;;) {
      const idx = nextIdx;
      nextIdx += 1;
      if (idx >= total) return;
      try {
        await fn(items[idx], idx);
      } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e));
        failures.push({ item: items[idx], index: idx, error: err });
      } finally {
        doneCount += 1;
        onProgress(doneCount, total);
      }
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, total));
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);
  return { failures };
}

function pad(id: number): string {
  return String(id).padStart(3, '0');
}

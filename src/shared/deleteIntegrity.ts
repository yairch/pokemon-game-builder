/**
 * Pure helpers used by the delete preflight pipeline (see `map_worktree_editor_design.plan.md`).
 *
 * Two responsibilities:
 *   1. `simulateDelete(mapInfos, seedIds)` — expand a user-selected set of map ids to the
 *      full subtree(s) that would actually be removed (folder delete removes descendants),
 *      and return the post-delete survivor id list in MapInfos preorder.
 *   2. `pickEditMapIdAutoFix(survivorIds, startMapId)` — decide the new `System#edit_map_id`
 *      after a delete, per the policy in the design plan:
 *        a. If the (resolved) `start_map_id` survives → use it.
 *        b. Else if any maps survive       → first preorder survivor.
 *        c. Else (empty post-delete tree)  → 0.
 *
 * `MapReference` is the shared aggregation type used by event + script scans (commits 2, 4, 5).
 * Kept in this module so every layer (renderer modal, main orchestrator, scan helpers) imports
 * from the same place.
 */

import type { MapInfosReadData } from './types';
import { buildMapInfosTree, preorderMapTreeIds } from './mapInfosTree';

// ---------------------------------------------------------------------------
// Reference aggregation (consumed by commits 2 + 4 + 5)
// ---------------------------------------------------------------------------

/**
 * One reference from a surviving event or script to a map id that is *about to be deleted*.
 *
 * The pipeline aggregates these into `DeletePreflightResult.references` (commit 5) so the
 * confirmation modal can list "you must fix these before deleting."
 *
 * For scripts we cannot always know the user's intent from a bare integer literal — see the
 * `confidence` tag. Events are always `'high'` because we walk the documented RPGXP event
 * command whitelist (codes 201, 202, 209) where map-id parameter slots are explicit.
 */
export interface MapReference {
  /** Whether this came from a map event-command walk or a Scripts.rxdata text scan. */
  sourceKind: 'event' | 'script';
  /** Map id whose event tripped the reference (events only). */
  sourceMapId?: number;
  /** Event id within `sourceMapId` (events only). */
  sourceEventId?: number;
  /** 1-based line number (scripts) or 0-based command index (events) for context. */
  sourceLine?: number;
  /** Script section name (e.g. `'PField_Field'`) — scripts only. */
  sourceScriptName?: string;
  /**
   * Confidence tag, scripts only:
   *   - `'high'`     — match sits inside a known map-id idiom (`pbDirectTransfer`, `Map.from_id`,
   *                    `$game_temp.player_new_map_id`, `transfer`, `"Map ID"`, etc.).
   *   - `'possible'` — bare numeric-literal match; flagged because the design plan prefers
   *                    false-positives over silent allows.
   *
   * Events do not carry a confidence tag (always definite) — leave undefined for events.
   */
  confidence?: 'high' | 'possible';
  /** Short, human-readable summary used by the modal references list. */
  summary?: string;
  /** Map id being referenced — must be one of the ids that would be deleted. */
  targetMapId: number;
}

// ---------------------------------------------------------------------------
// simulateDelete
// ---------------------------------------------------------------------------

export interface SimulateDeleteResult {
  /** Full set of ids removed by the operation (seeds + every descendant by parent_id). Sorted ascending. */
  deletedIds: number[];
  /** Ids that remain in MapInfos after the delete, in MapInfos preorder (parent_id + order). */
  survivorIds: number[];
}

/**
 * Expand a user-selected set of map ids to the **subtree(s)** that would actually be removed,
 * and compute the post-delete survivor id list in preorder.
 *
 * Why expand: in RPG Maker XP the tree is `parent_id`/`order`; deleting a "folder" map means
 * deleting it **and every descendant**. The modal copy already promises this ("This removes
 * N maps including nested maps under …"), so the simulation must mirror it.
 *
 * Behavior:
 *   - Seeds not present in `mapInfos` are silently ignored (defensive: tree may have churned
 *     between the user's right-click and confirm).
 *   - Duplicate seeds are deduped.
 *   - A cycle in `parent_id` (corrupt data) terminates instead of looping — the `visited` set
 *     guards every push.
 *
 * Returns ordered arrays so test assertions are stable.
 */
export function simulateDelete(
  mapInfos: MapInfosReadData | null | undefined,
  seedIds: ReadonlyArray<number>
): SimulateDeleteResult {
  if (!mapInfos) return { deletedIds: [], survivorIds: [] };

  // children-by-parent index over the *current* MapInfos. Built once; visited handles cycles.
  const childrenByParent = new Map<number, number[]>();
  const allIds = new Set<number>();
  for (const v of Object.values(mapInfos)) {
    if (!v || typeof v.id !== 'number') continue;
    allIds.add(v.id);
    const bucket = childrenByParent.get(v.parentId) ?? [];
    bucket.push(v.id);
    childrenByParent.set(v.parentId, bucket);
  }

  const deleted = new Set<number>();
  const stack: number[] = [];
  for (const seed of seedIds) {
    if (allIds.has(seed) && !deleted.has(seed)) stack.push(seed);
  }
  while (stack.length > 0) {
    const id = stack.pop() as number;
    if (deleted.has(id)) continue;
    deleted.add(id);
    for (const childId of childrenByParent.get(id) ?? []) {
      if (!deleted.has(childId)) stack.push(childId);
    }
  }

  // Build a survivor view of MapInfos and reuse the existing preorder walker so we don't
  // duplicate sibling-sort logic (order, then id tie-break).
  const survivorInfos: MapInfosReadData = {};
  for (const [k, v] of Object.entries(mapInfos)) {
    if (v && !deleted.has(v.id)) survivorInfos[k] = v;
  }
  const survivorIds = preorderMapTreeIds(buildMapInfosTree(survivorInfos));

  return {
    deletedIds: Array.from(deleted).sort((a, b) => a - b),
    survivorIds,
  };
}

// ---------------------------------------------------------------------------
// pickEditMapIdAutoFix
// ---------------------------------------------------------------------------

/**
 * Decide the post-delete `System#edit_map_id` per the design-plan policy.
 *
 * The `startMapId` argument is the *resolved* new `start_map_id`:
 *   - If the user's old `start_map_id` survives the delete, that's passed through.
 *   - If it doesn't survive (and any maps remain), the modal blocks the user into picking
 *     one before confirm — the picked id is then passed here.
 *   - If the post-delete tree is empty, pass `0` (or any value < 1).
 *
 * Returns:
 *   - `startMapId` itself when it survives.
 *   - Otherwise the first preorder survivor (deterministic, mirrors RMXP browse order).
 *   - `0` when nothing remains. The renderer relies on this to render the empty state.
 *
 * @param survivorIds  Survivor ids in MapInfos preorder (from `simulateDelete`).
 * @param startMapId   Resolved post-delete `start_map_id` (see above).
 */
export function pickEditMapIdAutoFix(
  survivorIds: ReadonlyArray<number>,
  startMapId: number
): number {
  if (startMapId >= 1 && survivorIds.includes(startMapId)) return startMapId;
  if (survivorIds.length > 0) return survivorIds[0];
  return 0;
}

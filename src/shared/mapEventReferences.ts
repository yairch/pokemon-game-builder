/**
 * Extract map-id references from a `MapReadData`'s events. Pure TS — used by the delete
 * preflight pipeline (commit 5) when walking surviving maps in bounded parallel.
 *
 * Whitelist of RPGXP event command codes (v1):
 *
 *   201  Transfer Player
 *        params = [appoint_type, map_id, x, y, direction, fade_type]
 *        When `appoint_type === 0` (direct), params[1] is a literal map id → flagged.
 *        When `appoint_type === 1` (by variable), params[1] is a *variable index*, not
 *        a map id — we cannot statically resolve it without running the game. Documented
 *        limitation; not flagged.
 *
 *   108 / 408  Comment / Comment Continuation
 *        params[0] is the comment text. Run the same broad numeric-literal scan that the
 *        Scripts.rxdata phase uses (commit 4) so we don't silently miss in-event hints.
 *
 *   355 / 655  Script / Script Continuation
 *        params[0] is the Ruby script line. This is where Pokemon Essentials puts
 *        `pbDirectTransfer(...)`, `$game_temp.player_new_map_id = ...`, etc. Same broad scan.
 *
 * Codes deliberately NOT in the whitelist (documented so reviewers don't think it's an oversight):
 *
 *   202  Set Event Location
 *        params = [event_id, appoint_type, x, y, direction]. Operates on events in the
 *        *current* map only — no map id parameter. Not flagged.
 *
 *   209  Set Move Route
 *        params = [event_id, move_route]. Move commands carry x/y/direction, never map ids
 *        in stock RPGXP. Not flagged.
 *
 *   117  Call Common Event
 *        params[0] is a *common event* id, not a map id. Not flagged.
 *
 * Extend the whitelist as Essentials projects reveal new patterns. Keep `MAP_ID_IDIOMS`
 * in sync with the Ruby scripts scan (commit 4).
 */

import type { EventCommandData, EventData } from './types';
import type { MapReference } from './deleteIntegrity';

/**
 * Substring tokens (case-insensitive) that, when present in a comment / script body,
 * upgrade every numeric-literal match in that body from `'possible'` → `'high'` confidence.
 *
 * Sourced from Pokemon Essentials script idioms and stock RPGXP Ruby helpers. This is the
 * **canonical** idiom list — Ruby's `scan_scripts_for_map_ids` (commit 4) receives this
 * via stdin so both scanners agree.
 */
export const MAP_ID_IDIOMS: ReadonlyArray<string> = Object.freeze([
  'pbDirectTransfer',
  'pbTransfer',
  '$game_temp.player_new_map_id',
  '$game_map.setup',
  'Map.from_id',
  'transferPlayer',
  'transfer',
  'Map ID',
  'MAP_ID',
  'map_id',
]);

const COMMENT_CODES = new Set([108, 408]);
const SCRIPT_CODES = new Set([355, 655]);

interface TextScanMatch {
  targetMapId: number;
  confidence: 'high' | 'possible';
  /** Trimmed slice of the surrounding text for display in the modal references list. */
  snippet: string;
}

/**
 * Broad numeric-literal scanner. Flags every standalone integer literal `\b\d+\b` that
 * appears in `deletedIds`. Confidence is `'high'` when the text contains any
 * `MAP_ID_IDIOMS` token (case-insensitive), else `'possible'`.
 *
 * Edge cases / known noise (accepted; design plan prefers false-positives over silent allows):
 *   - Hex literals like `0x123` split at the `x`; `123` will match if `123` is in delete set.
 *   - Decimals like `1.5` split at the `.`; `1` and `5` match separately if in delete set.
 *   - Negative numbers — `-1` is matched as `1`. (Map ids are positive, so seeing literal
 *     `1` is what we want anyway.)
 */
export function scanTextForMapIds(
  text: string,
  deletedIds: ReadonlySet<number>
): TextScanMatch[] {
  if (!text || deletedIds.size === 0) return [];
  const lowerText = text.toLowerCase();
  const idiomHit = MAP_ID_IDIOMS.some((idiom) => lowerText.includes(idiom.toLowerCase()));
  const confidence: 'high' | 'possible' = idiomHit ? 'high' : 'possible';
  const out: TextScanMatch[] = [];
  // `\b\d+\b` matches a complete digit run, so `123` inside `1234` will NOT double-fire —
  // the whole `1234` is the match and word boundaries don't fire mid-digit.
  const re = /\b(\d+)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1]);
    if (!Number.isFinite(n) || !deletedIds.has(n)) continue;
    out.push({
      targetMapId: n,
      confidence,
      snippet: surroundingSnippet(text, m.index, m[0].length, 24),
    });
  }
  return out;
}

/**
 * Walk every event/page/command on the map and yield references pointing at any of the
 * candidate (to-be-deleted) ids. The aggregator (commit 5) then merges results across all
 * surviving maps into `DeletePreflightResult.references`.
 *
 * Empty results when `deletedIds` is empty — useful so callers don't need to guard.
 */
export function extractMapReferencesFromEvents(
  sourceMapId: number,
  events: ReadonlyArray<EventData> | undefined | null,
  deletedIds: ReadonlySet<number>
): MapReference[] {
  if (!events || deletedIds.size === 0) return [];
  const refs: MapReference[] = [];

  for (const event of events) {
    for (const page of event.pages ?? []) {
      const commands: EventCommandData[] = page.commands ?? [];
      for (let i = 0; i < commands.length; i += 1) {
        const cmd = commands[i];
        if (!cmd) continue;
        const code = cmd.code;
        const params = cmd.parameters ?? [];

        // 201 Transfer Player — only flag when appoint_type === 0 (direct map id).
        if (code === 201) {
          const appointType = params[0];
          const targetMapId = params[1];
          if (
            appointType === 0 &&
            typeof targetMapId === 'number' &&
            deletedIds.has(targetMapId)
          ) {
            refs.push({
              sourceKind: 'event',
              sourceMapId,
              sourceEventId: event.id,
              sourceLine: i,
              targetMapId,
              summary: `Transfer Player → Map${pad(targetMapId)}`,
            });
          }
          continue;
        }

        // 108/408/355/655 — text scan with confidence tagging.
        const isComment = COMMENT_CODES.has(code);
        const isScript = SCRIPT_CODES.has(code);
        if (!isComment && !isScript) continue;
        const text = typeof params[0] === 'string' ? (params[0] as string) : '';
        if (!text) continue;

        for (const match of scanTextForMapIds(text, deletedIds)) {
          refs.push({
            sourceKind: 'event',
            sourceMapId,
            sourceEventId: event.id,
            sourceLine: i,
            confidence: match.confidence,
            targetMapId: match.targetMapId,
            summary: isScript
              ? `Script ref → Map${pad(match.targetMapId)}: ${truncate(match.snippet, 48)}`
              : `Comment ref → Map${pad(match.targetMapId)}: ${truncate(match.snippet, 48)}`,
          });
        }
      }
    }
  }
  return refs;
}

function surroundingSnippet(text: string, idx: number, len: number, radius: number): string {
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + len + radius);
  return text.slice(start, end).trim();
}

function pad(id: number): string {
  return String(id).padStart(3, '0');
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

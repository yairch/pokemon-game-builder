import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import type { MapInfosReadData, SystemReadData } from '../../shared/types';
import type { MapInfosTreeNode } from '../../shared/mapInfosTree';
import type { DeletePreflightProgress, DeletePreflightResult } from '../../shared/deletePreflightTypes';
import { pickEditMapIdAutoFix, simulateDelete } from '../../shared/deleteIntegrity';
import { bridge } from '../services/bridge';

export interface DeleteMapModalProps {
  node: MapInfosTreeNode | null;
  projectPath: string | null;
  mapInfos: MapInfosReadData | null;
  onClose: () => void;
  /**
   * Disk delete succeeded — parent should merge refreshed registry data.
   * Either field may be null if read-back failed while delete still applied on disk.
   */
  onDeleted: (next: { mapInfos: MapInfosReadData | null; system: SystemReadData | null }) => void;
}

function formatMapId(id: number): string {
  return `Map${String(id).padStart(3, '0')}`;
}

function mapOptionLabel(mapInfos: MapInfosReadData | null, id: number): string {
  const row = mapInfos?.[String(id)];
  const name = row?.name?.trim();
  const core = formatMapId(id);
  return name ? `${name} (${core})` : core;
}

/** Short headline for the active preflight step (present tense, what is running now). */
function progressPrimaryLine(p: DeletePreflightProgress | null): string {
  if (!p) return 'Starting integrity checks…';
  switch (p.step) {
    case 'system':
      return 'Checking System.rxdata';
    case 'map-events':
      return `Checking map events (${p.current}/${p.total})`;
    case 'scripts':
      return 'Checking Scripts.rxdata';
    case 'done':
      return 'Integrity checks complete';
    default:
      return 'Working…';
  }
}

/** One line describing what this step is scanning (shown under the headline). */
function progressDetailLine(p: DeletePreflightProgress | null): string {
  if (!p) return 'Loading System data next.';
  switch (p.step) {
    case 'system':
      return 'Reading start map and edit-map pointers so we know what must stay valid after deletion.';
    case 'map-events':
      return 'Walking event commands on maps that would remain after this delete — looking for transfers or embedded scripts that reference the map id(s) you are removing.';
    case 'scripts':
      return 'Scanning Scripts.rxdata for known map-transfer patterns that mention removed map id(s).';
    case 'done':
      return 'Review blockers or warnings below. Delete stays disabled until prerequisites are met.';
    default:
      return '';
  }
}

function computeResolvedStart(result: DeletePreflightResult, picked: number | null): number {
  if (result.survivorIds.length === 0) return 0;
  if (result.startMapPickRequired) {
    if (picked != null && result.survivorIds.includes(picked)) return picked;
    return 0;
  }
  return result.newStartMapId;
}

const DeleteLearnMoreBody: React.FC = () => (
  <div className="mt-2 space-y-2 border-t border-amber-200/90 pt-2 text-[12px] leading-snug text-amber-950/85">
    <p>
      RPG Maker XP stores the starting location in <span className="font-mono text-[11px]">System.rxdata</span>{' '}
      (<span className="font-mono text-[11px]">start_map_id</span> plus coordinates). After removing every map, there is no valid starting map — the
      builder clears this field to <span className="font-mono text-[11px]">0</span> so the project matches an empty MapInfos tree.
    </p>
    <p>
      Restore maps or create a new starter map in RPG Maker XP before expecting “New Game” to launch from a valid location.
    </p>
  </div>
);

/**
 * Portal modal — delete confirmation with stepped preflight, reference listing, and optional start-map picker.
 * Matches workbench modal stacking (`fixed inset-0`, high z-index above context menus).
 */
const DeleteMapModal: React.FC<DeleteMapModalProps> = ({
  node,
  projectPath,
  mapInfos,
  onClose,
  onDeleted,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [retryNonce, setRetryNonce] = useState(0);
  const [phase, setPhase] = useState<'preflight' | 'ready' | 'error'>('preflight');
  const [progress, setProgress] = useState<DeletePreflightProgress | null>(null);
  const [result, setResult] = useState<DeletePreflightResult | null>(null);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [pickedStartMapId, setPickedStartMapId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [learnEmptyOpen, setLearnEmptyOpen] = useState(false);

  const previewDeletedCount = useMemo(() => {
    if (!node || !mapInfos) return null;
    try {
      return simulateDelete(mapInfos, [node.info.id]).deletedIds.length;
    } catch {
      return null;
    }
  }, [node, mapInfos]);

  const subtreeWording =
    (previewDeletedCount != null && previewDeletedCount > 1) || (node != null && node.children.length > 0);

  useEffect(() => {
    if (!node || !projectPath) return;
    let cancelled = false;
    setPhase('preflight');
    setProgress(null);
    setResult(null);
    setPreflightError(null);
    setPickedStartMapId(null);
    setDeleting(false);
    setDeleteError(null);
    setLearnEmptyOpen(false);

    void (async () => {
      try {
        const out = await bridge.runDeletePreflight(projectPath, [node.info.id], (p) => {
          if (!cancelled) setProgress(p);
        });
        if (cancelled) return;
        if (!out.success || !out.data) {
          setPreflightError(out.error ?? 'Preflight failed.');
          setPhase('error');
          return;
        }
        setResult(out.data);
        if (out.data.startMapPickRequired && out.data.survivorIds.length > 0) {
          setPickedStartMapId(out.data.survivorIds[0]);
        }
        setProgress({ step: 'done' });
        setPhase('ready');
      } catch (err) {
        if (cancelled) return;
        setPreflightError(err instanceof Error ? err.message : String(err));
        setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [node, projectPath, retryNonce]);

  useEffect(() => {
    if (!node || !projectPath || deleting) return;
    const onDocKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onDocKey, true);
    return () => document.removeEventListener('keydown', onDocKey, true);
  }, [node, projectPath, deleting, onClose]);

  useEffect(() => {
    if (!node || !projectPath) return;
    const root = dialogRef.current;
    if (!root) return;

    const selector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const els = [...root.querySelectorAll<HTMLElement>(selector)].filter((el) => !el.hasAttribute('disabled'));
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!e.shiftKey) {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      } else if (active === first) {
        e.preventDefault();
        last.focus();
      }
    };

    root.addEventListener('keydown', onKeyDown);
    return () => root.removeEventListener('keydown', onKeyDown);
  }, [node, projectPath, phase, deleting, result]);

  useEffect(() => {
    if (!node || !projectPath) return;
    cancelRef.current?.focus();
  }, [node, projectPath, phase, retryNonce]);

  const hasRefsBlocker = Boolean(result?.blockers.some((b) => b.kind === 'references-found'));
  const hasStartBlocker = Boolean(result?.blockers.some((b) => b.kind === 'start-map-invalidated'));
  const startMapInvalidated = result?.blockers.find(
    (b): b is { kind: 'start-map-invalidated'; oldStartMapId: number } => b.kind === 'start-map-invalidated',
  );
  const startBlockerOldId = startMapInvalidated?.oldStartMapId ?? 0;

  const resolvedStart =
    result != null ? computeResolvedStart(result, pickedStartMapId) : 0;
  const resolvedEdit =
    result != null ? pickEditMapIdAutoFix(result.survivorIds, resolvedStart) : 0;

  const confirmBlocked =
    phase !== 'ready' ||
    deleting ||
    result == null ||
    hasRefsBlocker ||
    (hasStartBlocker &&
      (pickedStartMapId == null || !result.survivorIds.includes(pickedStartMapId)));

  const handleConfirm = async () => {
    if (!node || !projectPath || result == null || confirmBlocked) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await bridge.invoke('delete-maps', {
        projectPath,
        payload: {
          ids: result.deletedIds,
          newStartMapId: resolvedStart,
          newEditMapId: resolvedEdit,
        },
      });
      if (!res?.success) {
        setDeleteError(res?.error ?? 'Delete failed.');
        setDeleting(false);
        return;
      }
      onDeleted({
        mapInfos: res.data?.mapInfos ?? null,
        system: res.data?.system ?? null,
      });
    } catch (e: unknown) {
      setDeleteError(e instanceof Error ? e.message : 'Delete failed.');
      setDeleting(false);
    }
  };

  if (!node || !projectPath) return null;

  const mapCore = formatMapId(node.info.id);
  const mapTitle = node.info.name?.trim() ? `${node.info.name.trim()} (${mapCore})` : mapCore;

  const shell = (
    <div
      className="fixed inset-0 z-[10001] overflow-y-auto bg-black/50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !deleting) onClose();
      }}
    >
      <div className="flex min-h-full items-center justify-center p-4 py-8">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="flex max-h-[min(85vh,calc(100vh-4rem))] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl ring-1 ring-black/[0.06]"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="border-b border-zinc-100 px-5 py-4">
            <h2 id={titleId} className="text-[17px] font-semibold text-zinc-900">
              Delete map?
            </h2>
            <p className="mt-2 text-[13px] leading-snug text-zinc-600">
              {subtreeWording ? (
                <>
                  This removes{' '}
                  <strong className="font-semibold text-zinc-800">
                    {previewDeletedCount ?? result?.deletedIds.length ?? '…'} maps
                  </strong>
                  , including nested maps under{' '}
                  <span className="font-medium text-zinc-800">{mapTitle}</span>. Those maps are deleted from the project; the steps below scan for anything that still references them.
                </>
              ) : (
                <>
                  Permanently delete <span className="font-medium text-zinc-800">{mapTitle}</span>. The map is removed from the project; the steps below scan for anything that still references it.
                </>
              )}
            </p>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div className="rounded-lg border border-zinc-200/90 bg-zinc-50/80 px-3 py-2.5">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500">Integrity checks</p>
              <p className="mt-1 text-[13px] font-medium leading-snug text-zinc-800">{progressPrimaryLine(progress)}</p>
              <p className="mt-1 text-[12px] leading-snug text-zinc-600">{progressDetailLine(progress)}</p>
              {phase === 'preflight' ? (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200/90">
                  <div className="h-full w-1/3 animate-pulse rounded-full bg-blue-500/70" />
                </div>
              ) : null}
            </div>

            {phase === 'error' && preflightError ? (
              <div className="rounded-lg border border-red-200 bg-red-50/90 px-3 py-2 text-[13px] text-red-900">
                {preflightError}
                <button
                  type="button"
                  className="mt-2 block text-[12px] font-semibold text-red-800 underline-offset-2 hover:underline"
                  onClick={() => setRetryNonce((n) => n + 1)}
                >
                  Try again
                </button>
              </div>
            ) : null}

            {result?.warnings.some((w) => w.kind === 'delete-to-zero') ? (
              <div
                role="region"
                aria-label="Deleting last maps warning"
                className="rounded-xl border border-amber-300/90 bg-amber-50/95 px-3 py-2.5 shadow-sm ring-1 ring-amber-400/25"
              >
                <div className="flex gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold leading-snug text-amber-950">
                      You are deleting every remaining map
                    </p>
                    <p className="mt-1 text-[12px] leading-snug text-amber-950/90">
                      After this delete, <span className="font-mono text-[11px]">start_map_id</span> will be cleared (stored as{' '}
                      <span className="font-mono text-[11px]">0</span>). RPG Maker XP / Essentials may require you to set a new starting map before “New
                      Game” works again.
                    </p>
                    <button
                      type="button"
                      aria-expanded={learnEmptyOpen}
                      className="mt-2 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] font-medium text-amber-900/95 underline-offset-2 hover:bg-amber-100/90 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600/60 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-50"
                      onClick={() => setLearnEmptyOpen((v) => !v)}
                    >
                      <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${learnEmptyOpen ? 'rotate-180' : ''}`} aria-hidden />
                      Learn more
                    </button>
                    {learnEmptyOpen ? <DeleteLearnMoreBody /> : null}
                  </div>
                </div>
              </div>
            ) : null}

            {result?.warnings.some((w) => w.kind === 'edit-map-changed') ? (
              <p className="text-[12px] leading-snug text-zinc-600">
                The editor&apos;s current map pointer (<span className="font-mono text-[11px]">edit_map_id</span>) will be adjusted automatically to stay valid after deletion.
              </p>
            ) : null}

            {result?.warnings.some((w) => w.kind === 'script-section-errors') ? (
              <p className="text-[12px] leading-snug text-amber-900/90">
                Some script sections could not be read completely — hidden references may exist. Review Scripts.rxdata in RPG Maker XP if delete still worries you.
              </p>
            ) : null}

            {result && result.scanCounts.mapsFailed > 0 ? (
              <p className="text-[12px] leading-snug text-amber-900/90">
                {result.scanCounts.mapsFailed} map file(s) could not be read; the reference scan may be incomplete for those maps.
              </p>
            ) : null}

            {hasStartBlocker && result ? (
              <div className="space-y-2">
                <label htmlFor="delete-modal-start-map" className="block text-[13px] font-medium text-zinc-800">
                  New player start map
                </label>
                <p className="text-[12px] leading-snug text-zinc-600">
                  The current start map ({formatMapId(startBlockerOldId)}) would be removed. Pick where players should begin after this delete.
                </p>
                <select
                  id="delete-modal-start-map"
                  data-testid="delete-modal-start-map-select"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-[13px] text-zinc-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  value={pickedStartMapId ?? ''}
                  onChange={(e) => setPickedStartMapId(parseInt(e.target.value, 10))}
                >
                  {result.survivorIds.map((id) => (
                    <option key={id} value={id}>
                      {mapOptionLabel(mapInfos, id)}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {hasRefsBlocker && result && result.references.length > 0 ? (
              <div className="rounded-lg border border-red-200 bg-red-50/80 px-3 py-2">
                <p className="text-[13px] font-semibold text-red-900">
                  Delete blocked — {result.references.length} dependenc
                  {result.references.length === 1 ? 'y' : 'ies'} on removed map id(s)
                </p>
                <p className="mt-1 text-[12px] leading-snug text-red-900/90">
                  Something in your project still targets a map you are deleting (see list below). Completing delete could strand players on a missing map or leave scripts inconsistent. Fix or remove those references in RPG Maker XP / Essentials, then try delete again.
                </p>
                <p className="mt-2 text-[11px] leading-snug text-red-900/75">
                  This scan only sees literal map ids and known transfer patterns; destinations chosen purely from variables are not detected.
                </p>
                <ul className="mt-2 max-h-36 list-disc space-y-1 overflow-y-auto pl-4 font-mono text-[11px] leading-snug text-red-950/90">
                  {result.references.slice(0, 80).map((ref, i) => (
                    <li key={`${ref.sourceKind}-${ref.targetMapId}-${i}`}>{ref.summary ?? `${ref.sourceKind} → ${formatMapId(ref.targetMapId)}`}</li>
                  ))}
                </ul>
                {result.references.length > 80 ? (
                  <p className="mt-2 text-[11px] text-red-900/80">Showing first 80 references.</p>
                ) : null}
              </div>
            ) : null}

            {deleteError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-900">{deleteError}</div>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 border-t border-zinc-100 px-5 py-4">
            <button
              ref={cancelRef}
              type="button"
              data-testid="delete-modal-cancel"
              disabled={deleting}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-[13px] font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:opacity-50"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="delete-modal-confirm"
              disabled={confirmBlocked}
              className="rounded-lg bg-red-600 px-4 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => void handleConfirm()}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(shell, document.body) : null;
};

export default DeleteMapModal;

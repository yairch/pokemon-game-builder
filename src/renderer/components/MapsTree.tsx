import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Folder, Map as MapIcon, Loader2 } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type Modifier,
} from '@dnd-kit/core';
import { getEventCoordinates } from '@dnd-kit/utilities';
import type { MapInfosTreeNode } from '../../shared/mapInfosTree';
import type { DropPosition, HierarchyMoveIntent } from '../../shared/mapInfosHierarchyMove';
import MapsTreeContextMenu from './MapsTreeContextMenu';

interface MapsTreeProps {
  roots: MapInfosTreeNode[];
  selectedMapId: number | null;
  onSelectMap: (mapId: number) => void;
  loading?: boolean;
  /** Changes when the project changes — resets expansion to "all folders open". */
  resetKey: string;
  /** Fill a vertical split in the workbench (scroll inside pane). */
  fillWorkbench?: boolean;
  /** Emitted after a drop; parent decides whether/how to persist the new hierarchy. */
  onMoveMap?: (intent: HierarchyMoveIntent) => void;
  /** Disables drag interactions while a move is being persisted. */
  reorderDisabled?: boolean;
  /**
   * Fires when the user invokes Delete from the right-click context menu on a row.
   * Non-destructive at this layer — parent (App.tsx) handles the modal flow (commit 7).
   * When omitted, the context menu still renders but Delete is a no-op (the menu closes).
   */
  onDeleteMap?: (node: MapInfosTreeNode) => void;
}

/**
 * Where a drop will land. `row` targets a specific map at one of three bands;
 * `tree-end` is the virtual zone at the bottom of the tree that always means
 * "append at root level after the last root sibling" — the only way to drag
 * an item out of a folder that's the last entry in the tree.
 */
type DropTargetState =
  | { kind: 'row'; id: number; position: DropPosition }
  | { kind: 'tree-end'; lastRootId: number };

interface TreeDndCtx {
  activeId: number | null;
  dropTarget: DropTargetState | null;
  reorderDisabled: boolean;
  /** True when a drag is in progress and this id is a descendant of the dragged map. */
  isInvalidTarget: (id: number) => boolean;
  /** Open the right-click menu at viewport-relative (x, y) for `node`. */
  openContextMenu: (node: MapInfosTreeNode, x: number, y: number) => void;
}

const TreeDndContext = React.createContext<TreeDndCtx>({
  activeId: null,
  dropTarget: null,
  reorderDisabled: false,
  isInvalidTarget: () => false,
  openContextMenu: () => {},
});

function collectFolderIds(nodes: MapInfosTreeNode[]): number[] {
  const out: number[] = [];
  for (const n of nodes) {
    if (n.children.length > 0) {
      out.push(n.info.id, ...collectFolderIds(n.children));
    }
  }
  return out;
}

function findPathToId(nodes: MapInfosTreeNode[], targetId: number): MapInfosTreeNode[] | null {
  for (const node of nodes) {
    if (node.info.id === targetId) return [node];
    const sub = findPathToId(node.children, targetId);
    if (sub) return [node, ...sub];
  }
  return null;
}

/** Collect a node + all its descendant ids; used to forbid drops inside the dragged subtree. */
function collectSubtreeIds(node: MapInfosTreeNode): Set<number> {
  const out = new Set<number>();
  const stack: MapInfosTreeNode[] = [node];
  while (stack.length > 0) {
    const n = stack.pop() as MapInfosTreeNode;
    out.add(n.info.id);
    for (const c of n.children) stack.push(c);
  }
  return out;
}

/**
 * Position the DragOverlay so its center sits on the cursor at all times. Without this,
 * dnd-kit positions the overlay at the initial click point + cursor delta — which means
 * the floating chip is offset from the cursor by however far you clicked from the row's
 * center. Users instinctively aim the *chip* at the target, but the hit-test math uses
 * the *cursor*, so the chip-on-target ends up cursor-on-row-edge → `inside` never fires.
 */
const snapCenterToCursor: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  if (!draggingNodeRect || !activatorEvent) return transform;
  const activatorCoordinates = getEventCoordinates(activatorEvent);
  if (!activatorCoordinates) return transform;
  const offsetX = activatorCoordinates.x - draggingNodeRect.left;
  const offsetY = activatorCoordinates.y - draggingNodeRect.top;
  return {
    ...transform,
    x: transform.x + offsetX - draggingNodeRect.width / 2,
    y: transform.y + offsetY - draggingNodeRect.height / 2,
  };
};

function findNodeById(roots: MapInfosTreeNode[], id: number): MapInfosTreeNode | null {
  for (const n of roots) {
    if (n.info.id === id) return n;
    const sub = findNodeById(n.children, id);
    if (sub) return sub;
  }
  return null;
}

function MapsTreeBranch({
  node,
  depth,
  selectedMapId,
  expandedIds,
  onToggleExpand,
  onSelectMap,
}: {
  node: MapInfosTreeNode;
  depth: number;
  selectedMapId: number | null;
  expandedIds: Set<number>;
  onToggleExpand: (id: number) => void;
  onSelectMap: (mapId: number) => void;
}) {
  const { info, children } = node;
  const hasChildren = children.length > 0;
  const expanded = expandedIds.has(info.id);
  const isSelected = selectedMapId === info.id;
  const mapIdLabel = `Map${String(info.id).padStart(3, '0')}`;
  const name = String(info.name || 'Untitled map');

  // Bigger per-level indent so the hierarchy reads at a glance and the user has
  // ample horizontal room to aim a drop "in" or "out" of a folder by hovering
  // a row at a different depth.
  const pad = 8 + depth * 18;

  const dnd = React.useContext(TreeDndContext);
  const isDraggingThis = dnd.activeId === info.id;
  const invalidTarget = dnd.isInvalidTarget(info.id);

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
  } = useDraggable({
    id: `map-${info.id}`,
    data: { type: 'map', mapId: info.id },
    disabled: dnd.reorderDisabled,
  });

  const { setNodeRef: setDropRef } = useDroppable({
    id: `drop-${info.id}`,
    data: { type: 'map', mapId: info.id },
    disabled: dnd.reorderDisabled || invalidTarget,
  });

  const setRowRef = (el: HTMLDivElement | null) => {
    setDragRef(el);
    setDropRef(el);
  };

  const dt = dnd.dropTarget;
  const isRowTarget = dnd.activeId != null && dt?.kind === 'row' && dt.id === info.id;
  const showBeforeLine = isRowTarget && dt!.position === 'before';
  const showAfterLine = isRowTarget && dt!.position === 'after';
  const showInsideRing = isRowTarget && dt!.position === 'inside';
  // Indent the drop line so it starts under the row's icon/text area. The depth-aware
  // left offset (pad + chevron column) communicates "this drop lands at this depth"
  // — critical for disambiguating "after last child in folder" from "before next root sibling".
  const dropLineLeft = pad + 28;

  return (
    <li
      role="treeitem"
      aria-expanded={hasChildren ? expanded : undefined}
      aria-selected={isSelected}
      className="list-none select-none"
    >
      <div
        ref={setRowRef}
        {...attributes}
        {...listeners}
        // `onContextMenu` is independent of dnd-kit's pointer listeners (which gate on
        // button === 0). Right-click opens the menu at the cursor and the native browser
        // menu is suppressed so users don't see "Inspect / Save Image…" over a map row.
        onContextMenu={(e) => {
          e.preventDefault();
          dnd.openContextMenu(node, e.clientX, e.clientY);
        }}
        data-testid={`maps-tree-row-${info.id}`}
        className={`group relative flex items-stretch rounded-lg transition-colors min-h-9 ${
          isDraggingThis ? 'opacity-40' : ''
        } ${
          showInsideRing
            ? 'bg-blue-100/80 ring-2 ring-inset ring-blue-500 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.7)]'
            : ''
        }`}
        style={{ paddingLeft: pad }}
      >
        {showBeforeLine && (
          <div
            className="pointer-events-none absolute right-1 -top-0.5 h-0.5 rounded-full bg-blue-500 shadow-[0_0_0_2px_rgba(59,130,246,0.25)]"
            style={{ left: dropLineLeft }}
            aria-hidden
          />
        )}
        {showAfterLine && (
          <div
            className="pointer-events-none absolute right-1 -bottom-0.5 h-0.5 rounded-full bg-blue-500 shadow-[0_0_0_2px_rgba(59,130,246,0.25)]"
            style={{ left: dropLineLeft }}
            aria-hidden
          />
        )}
        <div className="flex w-7 shrink-0 items-center justify-center mr-0.5">
          {hasChildren ? (
            <button
              type="button"
              tabIndex={-1}
              className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-200/80 hover:text-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
              aria-label={expanded ? `Collapse ${name}` : `Expand ${name}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(info.id);
              }}
            >
              <ChevronRight
                className={`h-4 w-4 shrink-0 transition-transform duration-150 ease-out ${
                  expanded ? 'rotate-90' : ''
                }`}
                strokeWidth={2}
              />
            </button>
          ) : (
            <span className="block w-7" aria-hidden />
          )}
        </div>

        <button
          type="button"
          className={`flex min-w-0 flex-1 items-center gap-2 rounded-md py-2 pr-2.5 pl-1 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-white ${
            isSelected
              ? 'bg-blue-50 text-blue-950 ring-1 ring-inset ring-blue-200/90 shadow-sm'
              : 'text-zinc-800 hover:bg-zinc-100/90'
          }`}
          onClick={() => onSelectMap(info.id)}
        >
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
              isSelected ? 'bg-white/70 text-blue-700' : 'bg-zinc-100/80 text-zinc-500 group-hover:bg-zinc-200/80'
            }`}
            aria-hidden
          >
            {hasChildren ? (
              <Folder className="h-3.5 w-3.5" strokeWidth={2} />
            ) : (
              <MapIcon className="h-3.5 w-3.5" strokeWidth={2} />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium leading-tight tracking-tight">{name}</span>
            <span
              className={`mt-0.5 block font-mono text-[11px] tabular-nums leading-none ${
                isSelected ? 'text-blue-600/90' : 'text-zinc-400'
              }`}
            >
              {mapIdLabel}
            </span>
          </span>
        </button>
      </div>

      {hasChildren && expanded && (
        // pb-2 gives a clear vertical buffer between the last nested child and
        // the next sibling at the parent's level — so the "after last child
        // (inside folder)" and "before next root sibling (out of folder)" drop
        // lines aren't visually stacked 2 px apart.
        <ul role="group" className="relative m-0 list-none space-y-0.5 p-0 pb-2 pt-0.5">
          {/* Indent guide: subtle vertical line aligned with the parent's chevron column,
              so nesting depth is visually obvious and the user can aim drops at any depth. */}
          <span
            className="pointer-events-none absolute bottom-2 top-0 w-px bg-zinc-200"
            style={{ left: `${pad + 14}px` }}
            aria-hidden
          />
          {children.map((c) => (
            <MapsTreeBranch
              key={c.info.id}
              node={c}
              depth={depth + 1}
              selectedMapId={selectedMapId}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              onSelectMap={onSelectMap}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * A virtual drop target at the bottom of the root list, always at root depth.
 * Lets the user drop a map "outside" a folder when the folder is the last entry
 * in the tree — otherwise there's no shallower row below the folder's children
 * to aim for. Resolves to `{ targetId: lastRoot, position: 'after' }` on drop.
 */
function EndOfRootDropZone({
  enabled,
  isActive,
}: {
  enabled: boolean;
  isActive: boolean;
}) {
  const { setNodeRef } = useDroppable({
    id: 'drop-tree-end',
    data: { type: 'tree-end' },
    disabled: !enabled,
  });
  if (!enabled) return null;
  return (
    <li
      ref={setNodeRef}
      role="presentation"
      aria-hidden
      className="relative list-none"
    >
      <div className="min-h-8 w-full" />
      {isActive && (
        <div
          className="pointer-events-none absolute top-1 h-0.5 rounded-full bg-blue-500 shadow-[0_0_0_2px_rgba(59,130,246,0.25)]"
          // Align with root-level row content (pad 8 + chevron column 28 = 36).
          style={{ left: 36, right: 4 }}
          aria-hidden
        />
      )}
    </li>
  );
}

const MapsTree: React.FC<MapsTreeProps> = ({
  roots,
  selectedMapId,
  onSelectMap,
  loading,
  resetKey,
  fillWorkbench = false,
  onMoveMap,
  reorderDisabled = false,
  onDeleteMap,
}) => {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set());
  const [activeId, setActiveId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTargetState | null>(null);
  // Right-click menu state. `null` = closed. Setting it to a fresh `{x,y,node}` re-positions
  // the menu when the user right-clicks another row (the menu's own listener calls onClose
  // then the new contextmenu handler sets new state; React batches both into one update).
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: MapInfosTreeNode } | null>(null);
  // Mirror state to refs so handleDragEnd sees the most recent values even when
  // a pointermove → pointerup pair runs before React flushes a re-render.
  const activeIdRef = useRef<number | null>(null);
  const dropTargetRef = useRef<DropTargetState | null>(null);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);
  useEffect(() => {
    dropTargetRef.current = dropTarget;
  }, [dropTarget]);
  /**
   * Live cursor Y during a drag. Captured inside `collisionDetection` so it stays
   * in sync with the `over` rect that dnd-kit reports in the same pointer event —
   * otherwise the before/inside/after band flickers by one frame.
   */
  const pointerYRef = useRef<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  /**
   * Pointer-only collision. We deliberately do NOT fall back to rectIntersection: when the
   * cursor is over the dragged row's own slot the row is a disabled droppable, so dnd-kit
   * (correctly) yields no hit. Falling back to rectIntersection would snap `over` to an
   * unrelated neighbor based on the dragged element's rect, producing nonsense ratios.
   * If the cursor is over a non-droppable area, `over` is null and no indicator shows.
   */
  const collisionDetection: CollisionDetection = (args) => {
    if (args.pointerCoordinates) {
      pointerYRef.current = args.pointerCoordinates.y;
    }
    return pointerWithin(args);
  };

  /** Lookup the dragged node + its subtree once per drag to forbid drops inside it. */
  const draggedSubtree = useMemo<Set<number>>(() => {
    if (activeId == null) return new Set();
    const node = findNodeById(roots, activeId);
    return node ? collectSubtreeIds(node) : new Set();
  }, [activeId, roots]);

  const isInvalidTarget = (id: number) => draggedSubtree.has(id);

  const handleDragStart = (event: DragStartEvent) => {
    const id = (event.active.data.current as { mapId?: number } | undefined)?.mapId;
    const next = typeof id === 'number' ? id : null;
    setActiveId(next);
    setDropTarget(null);
    activeIdRef.current = next;
    dropTargetRef.current = null;
  };

  // NOTE: we use onDragMove (fires on every pointer event during drag) rather than
  // onDragOver (only fires when the `over` droppable id changes). With onDragOver, the
  // ratio is only recomputed at row-boundary crossings — so the band can never resolve
  // to "inside" because the cursor at a boundary always has ratio ≈ 0 or 1.
  const handleDragMove = (event: DragMoveEvent) => {
    const overData = event.over?.data.current as
      | { mapId?: number; type?: string }
      | undefined;
    const activeData = event.active.data.current as { mapId?: number } | undefined;
    const draggedId = activeData?.mapId;
    if (draggedId == null) return;

    // Tree-end virtual zone: always resolves to "after the last root sibling at root level".
    if (overData?.type === 'tree-end') {
      const lastRoot = roots[roots.length - 1];
      if (
        lastRoot &&
        lastRoot.info.id !== draggedId &&
        !draggedSubtree.has(lastRoot.info.id)
      ) {
        setDropTarget((prev) => {
          const next: DropTargetState = { kind: 'tree-end', lastRootId: lastRoot.info.id };
          if (prev && prev.kind === 'tree-end' && prev.lastRootId === next.lastRootId) {
            return prev;
          }
          dropTargetRef.current = next;
          return next;
        });
      }
      return;
    }

    const targetId = overData?.mapId;
    // Sticky behavior: when the cursor crosses an area without a valid drop target
    // (e.g. over the dragged row's own slot, the gap between rows, or outside the tree),
    // we leave the previously-resolved dropTarget in place. The user keeps their visual
    // highlight and can release confidently. Cancel still clears via onDragCancel.
    if (
      targetId == null ||
      targetId === draggedId ||
      draggedSubtree.has(targetId)
    ) {
      return;
    }

    const overRect = event.over?.rect;
    if (!overRect) {
      return;
    }

    // Prefer live pointer Y; fall back to dragged rect midpoint if pointer is unknown.
    let probeY = pointerYRef.current;
    if (probeY == null) {
      const activeRect = event.active.rect.current.translated;
      if (!activeRect) {
        return;
      }
      probeY = activeRect.top + activeRect.height / 2;
    }

    const ratio = (probeY - overRect.top) / Math.max(1, overRect.height);
    // 0.0–0.2 = before, 0.2–0.8 = inside (reparent / make folder), 0.8–1.0 = after.
    let position: DropPosition;
    if (ratio < 0.2) position = 'before';
    else if (ratio > 0.8) position = 'after';
    else position = 'inside';

    // Disambiguation: when the target is an EXPANDED folder, the bottom 20% of its
    // row sits at the same vertical area as the top of its first visible child —
    // and "after folder at root level" is already reachable via the next sibling's
    // `before` zone or the EndOfRootDropZone. So we remap `after` → `inside` for
    // expanded folders, leaving only one unambiguous intent for each row band:
    //   • `before`  → sibling slot above the folder
    //   • `inside`  → append to folder's children (also the visual the user expects
    //                 when hovering the folder body)
    //   • `after`   → still works on COLLAPSED folders and on non-folder rows
    const targetNode = findNodeById(roots, targetId);
    if (
      position === 'after' &&
      targetNode &&
      targetNode.children.length > 0 &&
      expandedIds.has(targetId)
    ) {
      position = 'inside';
    }

    setDropTarget((prev) => {
      const next: DropTargetState = { kind: 'row', id: targetId, position };
      if (
        prev &&
        prev.kind === 'row' &&
        prev.id === targetId &&
        prev.position === position
      ) {
        return prev;
      }
      dropTargetRef.current = next;
      return next;
    });
  };

  const resetDrag = () => {
    setActiveId(null);
    setDropTarget(null);
    activeIdRef.current = null;
    dropTargetRef.current = null;
    pointerYRef.current = null;
  };

  const handleDragEnd = (_event: DragEndEvent) => {
    const draggedId = activeIdRef.current;
    const target = dropTargetRef.current;
    resetDrag();
    if (draggedId == null || !target) return;
    if (target.kind === 'tree-end') {
      if (draggedSubtree.has(target.lastRootId) || target.lastRootId === draggedId) return;
      onMoveMap?.({ draggedId, targetId: target.lastRootId, position: 'after' });
      return;
    }
    if (draggedSubtree.has(target.id)) return;
    onMoveMap?.({ draggedId, targetId: target.id, position: target.position });
  };

  useEffect(() => {
    setExpandedIds(new Set(collectFolderIds(roots)));
  }, [resetKey, roots]);

  useEffect(() => {
    if (selectedMapId == null || roots.length === 0) return;
    const path = findPathToId(roots, selectedMapId);
    if (!path || path.length < 2) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      for (let i = 0; i < path.length - 1; i += 1) {
        next.add(path[i].info.id);
      }
      return next;
    });
  }, [selectedMapId, roots]);

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openContextMenu = (node: MapInfosTreeNode, x: number, y: number) => {
    setContextMenu({ node, x, y });
  };

  const dndCtxValue: TreeDndCtx = {
    activeId,
    dropTarget,
    reorderDisabled,
    isInvalidTarget,
    openContextMenu,
  };

  const activeNode = activeId != null ? findNodeById(roots, activeId) : null;
  const activeName = activeNode?.info?.name?.trim() ? activeNode.info.name : null;
  const activeIdLabel = activeNode ? `Map${String(activeNode.info.id).padStart(3, '0')}` : '';

  const outerPad = fillWorkbench ? 'p-3' : 'p-4';

  return (
    <section
      className={`rounded-xl border border-zinc-200/90 bg-white shadow-sm ring-1 ring-black/[0.03] ${outerPad} ${fillWorkbench ? 'flex h-full min-h-0 flex-1 flex-col overflow-hidden' : ''}`}
    >
      <div className="mb-3 flex shrink-0 items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Map browser</h2>
          <p className="mt-1 text-[13px] leading-snug text-zinc-600">
            Same order as RPG Maker MapInfos. Drag a map onto another to nest it, or between rows to reorder.
          </p>
        </div>
      </div>

      <div
        className={`overflow-hidden rounded-lg border border-zinc-200/80 bg-zinc-50/50 ${fillWorkbench ? 'flex min-h-0 flex-1 flex-col' : ''}`}
      >
        <div
          className={`custom-scrollbar px-1 py-1.5 ${fillWorkbench ? 'min-h-0 flex-1 overflow-y-auto overflow-x-auto' : 'max-h-72 overflow-y-auto overflow-x-auto'}`}
        >
          {loading && (
            <div className="flex items-center gap-2 px-3 py-8 text-sm text-zinc-500" role="status">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-zinc-400" aria-hidden />
              Loading maps…
            </div>
          )}
          {!loading && roots.length === 0 && (
            <p className="px-3 py-8 text-center text-[13px] text-zinc-500">No maps in this project yet.</p>
          )}
          {!loading && roots.length > 0 && (
            <DndContext
              sensors={sensors}
              collisionDetection={collisionDetection}
              // Re-measure droppable rects on every drag move. Cheap enough for this tree
              // (handful to a few hundred rows) and prevents stale rects when expansion or
              // selection states change mid-drag.
              measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
              onDragCancel={resetDrag}
            >
              <TreeDndContext.Provider value={dndCtxValue}>
                <ul role="tree" aria-label="Maps in project" className="m-0 list-none space-y-0.5 p-0">
                  {roots.map((r) => (
                    <MapsTreeBranch
                      key={r.info.id}
                      node={r}
                      depth={0}
                      selectedMapId={selectedMapId}
                      expandedIds={expandedIds}
                      onToggleExpand={toggleExpand}
                      onSelectMap={onSelectMap}
                    />
                  ))}
                  <EndOfRootDropZone
                    enabled={
                      activeId !== null &&
                      roots.length > 0 &&
                      roots[roots.length - 1].info.id !== activeId &&
                      !draggedSubtree.has(roots[roots.length - 1].info.id)
                    }
                    isActive={dropTarget?.kind === 'tree-end'}
                  />
                </ul>
              </TreeDndContext.Provider>
              <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
                {activeNode ? (
                  // Compact chip — bounded width keeps the geometric center close to the
                  // visual center-of-mass so snapCenterToCursor lands the cursor on the
                  // chip's middle, matching where the hit-test math evaluates.
                  <div className="pointer-events-none flex w-max max-w-[14rem] items-center gap-2 rounded-lg border border-blue-300 bg-white/95 px-2.5 py-1.5 shadow-lg ring-1 ring-blue-200">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-700">
                      {activeNode.children.length > 0 ? (
                        <Folder className="h-3.5 w-3.5" strokeWidth={2} />
                      ) : (
                        <MapIcon className="h-3.5 w-3.5" strokeWidth={2} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium leading-tight text-zinc-900">
                        {activeName ?? 'Untitled map'}
                      </span>
                      <span className="mt-0.5 block font-mono text-[11px] leading-none tabular-nums text-zinc-500">
                        {activeIdLabel}
                      </span>
                    </span>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      </div>
      {contextMenu ? (
        <MapsTreeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          node={contextMenu.node}
          onClose={() => setContextMenu(null)}
          onDelete={(node) => onDeleteMap?.(node)}
        />
      ) : null}
    </section>
  );
};

export default MapsTree;

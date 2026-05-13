import React, { useEffect, useState } from 'react';
import { ChevronRight, Folder, Map as MapIcon, Loader2 } from 'lucide-react';
import type { MapInfosTreeNode } from '../../shared/mapInfosTree';

interface MapsTreeProps {
  roots: MapInfosTreeNode[];
  selectedMapId: number | null;
  onSelectMap: (mapId: number) => void;
  loading?: boolean;
  /** Changes when the project changes — resets expansion to “all folders open”. */
  resetKey: string;
  /** Fill a vertical split in the workbench (scroll inside pane). */
  fillWorkbench?: boolean;
}

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

  const pad = 6 + depth * 12;

  return (
    <li
      role="treeitem"
      aria-expanded={hasChildren ? expanded : undefined}
      aria-selected={isSelected}
      className="list-none select-none"
    >
      <div className="group flex items-stretch rounded-lg transition-colors min-h-9" style={{ paddingLeft: pad }}>
        <div className="flex w-7 shrink-0 items-center justify-center mr-0.5">
          {hasChildren ? (
            <button
              type="button"
              tabIndex={-1}
              className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-200/80 hover:text-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
              aria-label={expanded ? `Collapse ${name}` : `Expand ${name}`}
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
        <ul role="group" className="relative m-0 list-none p-0">
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

const MapsTree: React.FC<MapsTreeProps> = ({
  roots,
  selectedMapId,
  onSelectMap,
  loading,
  resetKey,
  fillWorkbench = false,
}) => {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set());

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

  const outerPad = fillWorkbench ? 'p-3' : 'p-4';

  return (
    <section
      className={`rounded-xl border border-zinc-200/90 bg-white shadow-sm ring-1 ring-black/[0.03] ${outerPad} ${fillWorkbench ? 'flex h-full min-h-0 flex-1 flex-col overflow-hidden' : ''}`}
    >
      <div className="mb-3 flex shrink-0 items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Map browser</h2>
          <p className="mt-1 text-[13px] leading-snug text-zinc-600">
            Same order as RPG Maker MapInfos. Select a map to preview it from disk.
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
            <ul role="tree" aria-label="Maps in project" className="m-0 list-none p-0">
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
            </ul>
          )}
        </div>
      </div>
    </section>
  );
};

export default MapsTree;

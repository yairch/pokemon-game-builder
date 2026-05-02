import React from 'react';
import type { MapInfosTreeNode } from '../../shared/mapInfosTree';

interface MapsTreeProps {
  roots: MapInfosTreeNode[];
  selectedMapId: number | null;
  onSelectMap: (mapId: number) => void;
  loading?: boolean;
}

function MapsTreeBranch({
  node,
  depth,
  selectedMapId,
  onSelectMap,
}: {
  node: MapInfosTreeNode;
  depth: number;
  selectedMapId: number | null;
  onSelectMap: (mapId: number) => void;
}) {
  const { info, children } = node;
  const isSelected = selectedMapId === info.id;
  const label = `${String(info.name || '(unnamed)')} · Map${String(info.id).padStart(3, '0')}`;

  return (
    <li className="list-none">
      <button
        type="button"
        className={`w-full text-left text-xs px-2 py-1 rounded border border-transparent truncate focus:outline-none focus:ring-2 focus:ring-blue-400 ${
          isSelected ? 'bg-blue-100 text-blue-900 font-medium border-blue-200' : 'hover:bg-gray-50 text-gray-800'
        }`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => onSelectMap(info.id)}
        aria-selected={isSelected}
        aria-label={label}
        title={label}
      >
        {label}
      </button>
      {children.length > 0 && (
        <ul className="pl-0 m-0">
          {children.map((c) => (
            <MapsTreeBranch
              key={c.info.id}
              node={c}
              depth={depth + 1}
              selectedMapId={selectedMapId}
              onSelectMap={onSelectMap}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

const MapsTree: React.FC<MapsTreeProps> = ({ roots, selectedMapId, onSelectMap, loading }) => {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
      <h2 className="text-lg font-semibold mb-2">Maps</h2>
      <p className="text-[11px] text-gray-500 mb-2 leading-snug">
        Tree order follows MapInfos (parent and order fields, like RPG Maker XP). Selecting a map reloads tiles from disk.
      </p>
      <div className="max-h-52 overflow-y-auto custom-scrollbar rounded border border-gray-100 bg-gray-50 p-1">
        {loading && (
          <p className="text-xs text-gray-500 px-2 py-3" role="status">
            Loading maps…
          </p>
        )}
        {!loading && roots.length === 0 && (
          <p className="text-xs text-gray-500 px-2 py-3">No maps in MapInfos.</p>
        )}
        {!loading && roots.length > 0 && (
          <ul className="pl-0 m-0 py-1">
            {roots.map((r) => (
              <MapsTreeBranch
                key={r.info.id}
                node={r}
                depth={0}
                selectedMapId={selectedMapId}
                onSelectMap={onSelectMap}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default MapsTree;

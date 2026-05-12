import React from 'react';
import type { MapInfoData } from '../../../../shared/types';

export interface WorkbenchTemplatePanelProps {
  currentPath: string | null;
  mapListLoading: boolean;
  mapList: Pick<MapInfoData, 'id' | 'name'>[];
  selectedTemplateMapId: number | null;
  onTemplateMapChange: (mapId: number | null) => void;
  tilesetInspectorLoading: boolean;
  tilesetInspectorError: string;
  onOpenTilesetInspector: () => void;
}

export const WorkbenchTemplatePanel: React.FC<WorkbenchTemplatePanelProps> = ({
  currentPath,
  mapListLoading,
  mapList,
  selectedTemplateMapId,
  onTemplateMapChange,
  tilesetInspectorLoading,
  tilesetInspectorError,
  onOpenTilesetInspector,
}) => (
  <>
    <p className="mb-3 max-w-full break-words text-[12px] leading-snug text-gray-600">
      Template map used for sanity / AI / object tests and chat generation. Separate from the map selected in the tree for
      preview.
    </p>
    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">
      Template (for generation)
    </label>
    <div className="flex min-w-0 w-full flex-col gap-2 sm:flex-row sm:items-stretch">
      <select
        value={selectedTemplateMapId ?? ''}
        onChange={(e) => {
          const val = e.target.value;
          onTemplateMapChange(val === '' ? null : Number(val));
        }}
        disabled={!currentPath || mapListLoading}
        className="min-w-0 w-full rounded border border-gray-300 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 sm:flex-1"
      >
        {!currentPath ? (
          <option value="">Select a project first</option>
        ) : mapListLoading ? (
          <option value="">Loading maps…</option>
        ) : (
          <>
            <option value="">None (blank map)</option>
            {mapList.map((m) => (
              <option key={m.id} value={m.id}>
                Map{String(m.id).padStart(3, '0')} — {m.name}
              </option>
            ))}
          </>
        )}
      </select>
      <button
        type="button"
        onClick={onOpenTilesetInspector}
        disabled={tilesetInspectorLoading || !selectedTemplateMapId}
        className="shrink-0 whitespace-nowrap rounded bg-gray-800 px-3 py-2 text-xs text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 sm:self-start"
      >
        {tilesetInspectorLoading ? 'Loading…' : 'Tileset IDs'}
      </button>
    </div>
    {tilesetInspectorError && <div className="mt-2 text-xs text-red-600">{tilesetInspectorError}</div>}
  </>
);

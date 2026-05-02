import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Layers, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { bridge } from '../services/bridge';
import type { MapData, TilesetInspectorData } from '../../shared/types';
import {
  DEFAULT_TILE_SIZE,
  drawMapPreviewLayers,
  mapPixelSize,
  type MapPreviewTilesetImages,
} from '../mapPreview/mapPreviewCanvas';

interface MapPreviewProps {
  mapData: MapData | null;
  projectPath: string | null;
  /** Map is loading from bridge `read-map` */
  previewLoading?: boolean;
  previewLoadError?: string | null;
  /** True when MapInfos has no maps (project may still be selected) */
  noMapsInProject?: boolean;
  onInspectTileset?: () => void;
}

function loadImageFromSrc(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image failed to load'));
    img.src = src;
  });
}

const MapPreview: React.FC<MapPreviewProps> = ({
  mapData,
  projectPath,
  previewLoading = false,
  previewLoadError,
  noMapsInProject = false,
  onInspectTileset,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [tilesetError, setTilesetError] = useState<string | null>(null);
  const [tilesetLoading, setTilesetLoading] = useState(false);
  const [images, setImages] = useState<MapPreviewTilesetImages | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hoverTile, setHoverTile] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ active: boolean; lastX: number; lastY: number }>({
    active: false,
    lastX: 0,
    lastY: 0,
  });

  useEffect(() => {
    setImages(null);
    setTilesetError(null);
    setHoverTile(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    if (!mapData || !projectPath) return;

    let cancelled = false;
    (async () => {
      setTilesetLoading(true);
      try {
        const result = await bridge.invoke('tileset-inspector', {
          projectPath,
          mapId: mapData.id,
        });
        if (cancelled) return;
        if (!result?.success || !result.data) {
          setTilesetError(result?.error || 'Could not load tileset for this map.');
          return;
        }
        const d = result.data as TilesetInspectorData;
        const tw = d.tileWidth || DEFAULT_TILE_SIZE;
        const th = d.tileHeight || DEFAULT_TILE_SIZE;
        const main = await loadImageFromSrc(d.tilesetImageDataUrl || d.tilesetImageUrl);
        if (cancelled) return;
        const rawData = d.autotileImageDataUrls || [];
        const rawUrl = d.autotileImageUrls || [];
        const slotCount = Math.max(rawData.length, rawUrl.length);
        const autotiles: (HTMLImageElement | null)[] = Array.from({ length: slotCount }, () => null);
        for (let i = 0; i < slotCount; i += 1) {
          const src = rawData[i] || rawUrl[i];
          if (!src) continue;
          try {
            autotiles[i] = await loadImageFromSrc(src);
          } catch {
            /* skip broken autotile */
          }
        }
        if (cancelled) return;
        setImages({
          main,
          autotiles,
          tileWidth: tw,
          tileHeight: th,
          mainSheetWidth: main.naturalWidth,
        });
      } catch (e: any) {
        if (!cancelled) setTilesetError(e?.message || 'Failed to load tileset.');
      } finally {
        if (!cancelled) setTilesetLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mapData, projectPath]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mapData || !images) return;
    const { w, h } = mapPixelSize(mapData, images.tileWidth, images.tileHeight);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    drawMapPreviewLayers(ctx, { map: mapData, images });
  }, [mapData, images]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    setZoom((z) => Math.min(6, Math.max(0.12, z * factor)));
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY };
  }, []);

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const vp = viewportRef.current;
      if (dragRef.current.active) {
        const dx = e.clientX - dragRef.current.lastX;
        const dy = e.clientY - dragRef.current.lastY;
        dragRef.current.lastX = e.clientX;
        dragRef.current.lastY = e.clientY;
        setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      }
      if (!vp || !mapData || !images) {
        setHoverTile(null);
        return;
      }
      const rect = vp.getBoundingClientRect();
      const vx = e.clientX - rect.left;
      const vy = e.clientY - rect.top;
      const tw = images.tileWidth;
      const th = images.tileHeight;
      const mapX = Math.floor((vx - pan.x) / zoom / tw);
      const mapY = Math.floor((vy - pan.y) / zoom / th);
      if (mapX >= 0 && mapY >= 0 && mapX < mapData.width && mapY < mapData.height) {
        setHoverTile({ x: mapX, y: mapY });
      } else {
        setHoverTile(null);
      }
    },
    [mapData, images, pan.x, pan.y, zoom]
  );

  const onMouseUp = useCallback(() => {
    dragRef.current.active = false;
  }, []);

  const onMouseLeave = useCallback(() => {
    dragRef.current.active = false;
    setHoverTile(null);
  }, []);

  return (
    <section className="rounded-xl border border-zinc-200/90 bg-white p-4 shadow-sm ring-1 ring-black/[0.03]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Preview</h2>
          {projectPath && mapData && onInspectTileset && (
            <button
              type="button"
              onClick={() => onInspectTileset()}
              className="rounded-md border border-transparent p-1.5 text-zinc-500 transition-colors hover:border-zinc-200 hover:bg-zinc-50 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
              title="Inspect tileset for previewed map"
              aria-label="Inspect tileset for previewed map"
            >
              <Layers size={18} strokeWidth={1.75} />
            </button>
          )}
        </div>
        {mapData && (
          <div className="flex items-center gap-0.5 rounded-lg border border-zinc-200/90 bg-zinc-50/80 p-0.5">
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-white hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
              onClick={() => setZoom((z) => Math.min(6, z * 1.25))}
              aria-label="Zoom in"
              title="Zoom in"
            >
              <ZoomIn size={17} strokeWidth={2} />
            </button>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-white hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
              onClick={() => setZoom((z) => Math.max(0.12, z / 1.25))}
              aria-label="Zoom out"
              title="Zoom out"
            >
              <ZoomOut size={17} strokeWidth={2} />
            </button>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-white hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              aria-label="Reset pan and zoom"
              title="Reset view"
            >
              <RotateCcw size={16} strokeWidth={2} />
            </button>
            <span className="mx-2 min-w-[2.75rem] text-center font-mono text-[11px] font-medium tabular-nums text-zinc-500">
              {Math.round(zoom * 100)}%
            </span>
          </div>
        )}
      </div>

      {!projectPath && (
        <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50/70 px-4 text-center">
          <p className="text-[13px] text-zinc-500">Choose a Pokémon Essentials project to browse maps.</p>
        </div>
      )}

      {projectPath && noMapsInProject && (
        <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50/70 px-4 text-center">
          <p className="text-[13px] text-zinc-500">No maps listed in MapInfos yet.</p>
        </div>
      )}

      {projectPath && !noMapsInProject && previewLoadError && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-6 text-center text-sm text-amber-900">
          Could not load map: {previewLoadError}
        </div>
      )}

      {projectPath &&
        !noMapsInProject &&
        !previewLoadError &&
        previewLoading &&
        !mapData && (
          <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50/70 px-4 text-center">
            <p className="text-[13px] text-zinc-500" role="status">
              Loading map from disk…
            </p>
          </div>
        )}

      {projectPath && !noMapsInProject && !previewLoadError && !mapData && !previewLoading && (
        <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50/70 px-4 text-center">
          <p className="text-[13px] text-zinc-500">Select a map in the browser to preview it.</p>
        </div>
      )}

      {mapData && !previewLoadError && (
        <div className="space-y-2">
          <div className="text-[13px] text-zinc-600">
            <span className="font-semibold text-zinc-900">{mapData.name}</span>
            <span className="mx-2 text-zinc-300">·</span>
            <span className="text-zinc-500">
              {mapData.width}×{mapData.height} tiles
            </span>
            {hoverTile && (
              <>
                <span className="mx-2 text-zinc-300">·</span>
                <span className="font-mono text-[11px] text-zinc-600">
                  {hoverTile.x}, {hoverTile.y}
                </span>
              </>
            )}
          </div>

          {previewLoading && (
            <p className="text-[12px] text-blue-700/90" role="status">
              Refreshing from disk…
            </p>
          )}
          {tilesetLoading && (
            <p className="text-[12px] text-zinc-500">Loading tileset…</p>
          )}
          {tilesetError && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">{tilesetError}</p>
          )}

          <div
            ref={viewportRef}
            className="relative h-[280px] w-full cursor-grab overflow-hidden rounded-lg border border-zinc-900/90 bg-neutral-950 shadow-inner ring-1 ring-black/20 active:cursor-grabbing"
            onWheel={onWheel}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseLeave}
          >
            <div
              className="absolute left-0 top-0"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: '0 0',
              }}
            >
              <canvas ref={canvasRef} className="block shadow-lg" style={{ imageRendering: 'pixelated' }} />
            </div>
            {!images && !tilesetLoading && !tilesetError && (
              <div className="absolute inset-0 flex items-center justify-center text-neutral-400 text-sm pointer-events-none">
                Waiting for tileset…
              </div>
            )}
          </div>
          <p className="text-[11px] leading-snug text-zinc-400">
            Drag to pan · Scroll to zoom · Autotiles use a single static frame (MVP)
          </p>
        </div>
      )}
    </section>
  );
};

export default MapPreview;

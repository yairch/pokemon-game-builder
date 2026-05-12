import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { TilesetInspectorData } from '../../../../shared/types';

export interface WorkbenchTilesetInspectorModalProps {
  data: TilesetInspectorData | null;
  onClose: () => void;
}

export const WorkbenchTilesetInspectorModal: React.FC<WorkbenchTilesetInspectorModalProps> = ({
  data,
  onClose,
}) => {
  const tilesetCanvasRef = useRef<HTMLCanvasElement>(null);
  const tilesetImageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!data) return;

    const img = tilesetImageRef.current;
    const canvas = tilesetCanvasRef.current;
    if (!img || !canvas) return;

    const handleDraw = () => {
      const tileSize = data.tileWidth;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      const cols = Math.floor(img.naturalWidth / tileSize);
      const rows = Math.floor(img.naturalHeight / tileSize);

      let tileId = 384;
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          const px = x * tileSize;
          const py = y * tileSize;

          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(px, py, 26, 12);
          ctx.fillStyle = '#ffffff';
          ctx.fillText(String(tileId), px + 2, py + 1);

          tileId += 1;
        }
      }
    };

    if (img.complete) {
      handleDraw();
    } else {
      img.onload = handleDraw;
    }
  }, [data]);

  if (!data) return null;

  const shell = (
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-black/50">
      <div className="flex min-h-full items-center justify-center p-4 py-8">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="tileset-inspector-title"
          className="flex max-h-[min(90vh,calc(100vh-4rem))] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white p-6 shadow-xl"
        >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 id="tileset-inspector-title" className="text-lg font-bold text-gray-800">
              Tileset IDs
            </h3>
            <p className="text-xs text-gray-500">
              Map: {data.mapName} (ID {data.mapId}) · Tileset {data.tilesetId}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex flex-col">
            <h4 className="mb-2 text-xs font-semibold text-gray-700">Regular tiles</h4>
            <div className="max-h-[60vh] flex-1 overflow-auto rounded border border-gray-200 bg-gray-50 p-2">
              <div className="relative inline-block">
                <img
                  ref={tilesetImageRef}
                  src={data.tilesetImageDataUrl || data.tilesetImageUrl}
                  alt="Tileset"
                  className="block h-auto max-w-full"
                />
                <canvas ref={tilesetCanvasRef} className="pointer-events-none absolute left-0 top-0" />
              </div>
            </div>
          </div>

          <div className="flex flex-col">
            <h4 className="mb-2 text-xs font-semibold text-gray-700">Autotiles</h4>
            <div className="max-h-[60vh] flex-1 overflow-auto rounded border border-gray-200 bg-gray-50 p-2">
              {(data.autotileImageDataUrls || []).some((u, i) => !!(u || data.autotileImageUrls?.[i])) ? (
                <div className="grid grid-cols-2 gap-3">
                  {(data.autotileImageDataUrls || []).map((imageDataUrl, index) => {
                    const src = imageDataUrl || data.autotileImageUrls?.[index];
                    if (!src) return null;
                    return (
                      <div key={index} className="rounded border border-gray-200 bg-white p-2">
                        <img
                          src={src}
                          alt={`Autotile ${index + 1}`}
                          className="block h-auto max-h-28 w-full object-contain"
                        />
                        <div className="mt-1 truncate text-[10px] text-gray-500">
                          {data.autotileImagePaths?.[index] || `Autotile ${index + 1}`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs text-gray-500">No autotiles configured.</div>
              )}
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(shell, document.body) : null;
};

import type { MapData, MapEventSpec } from '../../shared/types';

export const DEFAULT_TILE_SIZE = 32;

/** RPG Maker XP: regular tiles start at 384, laid out in `cols`-wide rows on the chip sheet. */
export function regularTileSourceRect(
  tileId: number,
  tileW: number,
  tileH: number,
  sheetPixelWidth: number
): { sx: number; sy: number; sw: number; sh: number } | null {
  if (tileId < 384) return null;
  const cols = Math.max(1, Math.floor(sheetPixelWidth / tileW));
  const idx = tileId - 384;
  const sx = (idx % cols) * tileW;
  const sy = Math.floor(idx / cols) * tileH;
  return { sx, sy, sw: tileW, sh: tileH };
}

/** Autotile IDs 48–383: 48 patterns per named autotile slot (MVP uses pattern 0, top-left 32×32 of each autotile sheet). */
export function autotileSlotIndex(tileId: number): number | null {
  if (tileId < 48 || tileId >= 384) return null;
  return Math.floor((tileId - 48) / 48);
}

export interface MapPreviewTilesetImages {
  main: CanvasImageSource;
  /** Index matches RPG Maker autotile slot (tile id 48+48*slot); empty slots are null. */
  autotiles: (CanvasImageSource | null)[];
  tileWidth: number;
  tileHeight: number;
  mainSheetWidth: number;
}

export interface DrawMapPreviewOptions {
  map: MapData;
  images: MapPreviewTilesetImages;
}

/**
 * Draws all non-empty tiles bottom-to-top (layer 0, then 1, then 2).
 * Returns how many drawImage calls were made (for tests).
 */
export function drawMapPreviewLayers(
  ctx: CanvasRenderingContext2D,
  { map, images }: DrawMapPreviewOptions
): number {
  const { tileWidth: tw, tileHeight: th, main, autotiles, mainSheetWidth } = images;
  let draws = 0;
  const layers = map.layers ?? [];
  for (let zi = 0; zi < layers.length; zi += 1) {
    const layer = layers[zi];
    if (!layer) continue;
    for (let y = 0; y < map.height; y += 1) {
      const row = layer[y];
      if (!row) continue;
      for (let x = 0; x < map.width; x += 1) {
        const tid = row[x] ?? 0;
        if (!tid) continue;
        const dx = x * tw;
        const dy = y * th;
        const slot = autotileSlotIndex(tid);
        const autoImg = slot !== null ? autotiles[slot] : null;
        if (autoImg) {
          ctx.drawImage(autoImg, 0, 0, tw, th, dx, dy, tw, th);
          draws += 1;
          continue;
        }
        const rect = regularTileSourceRect(tid, tw, th, mainSheetWidth);
        if (rect) {
          ctx.drawImage(main, rect.sx, rect.sy, rect.sw, rect.sh, dx, dy, tw, th);
          draws += 1;
        }
      }
    }
  }
  return draws;
}

export function mapPixelSize(map: MapData, tileW: number, tileH: number): { w: number; h: number } {
  return { w: map.width * tileW, h: map.height * tileH };
}

export function getEventAtTile(
  events: MapEventSpec[] | undefined,
  tileX: number,
  tileY: number
): MapEventSpec | null {
  if (!events || events.length === 0) return null;
  return events.find((event) => event.x === tileX && event.y === tileY) ?? null;
}

/**
 * Draws small marker badges for event positions on top of map layers.
 * Returns number of markers drawn (for tests).
 */
export function drawMapEventMarkers(
  ctx: CanvasRenderingContext2D,
  map: MapData,
  tileW: number,
  tileH: number
): number {
  if (!map.events?.length) return 0;
  const radius = Math.max(5, Math.floor(Math.min(tileW, tileH) * 0.18));
  let count = 0;

  ctx.save();
  for (const event of map.events) {
    if (event.x < 0 || event.y < 0 || event.x >= map.width || event.y >= map.height) continue;
    const cx = event.x * tileW + Math.floor(tileW / 2);
    const cy = event.y * tileH + Math.floor(tileH / 2);
    ctx.beginPath();
    ctx.fillStyle = 'rgba(217, 70, 239, 0.95)';
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.lineWidth = 2;
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    count += 1;
  }
  ctx.restore();
  return count;
}

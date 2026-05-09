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
  eventCharacters?: Record<string, CanvasImageSource>;
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

export function drawMapGrid(
  ctx: CanvasRenderingContext2D,
  map: MapData,
  tileW: number,
  tileH: number
): number {
  const widthPx = map.width * tileW;
  const heightPx = map.height * tileH;
  let lines = 0;

  ctx.save();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.58)';
  ctx.lineWidth = 1;

  for (let x = 0; x <= map.width; x += 1) {
    const px = x * tileW + 0.5;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, heightPx);
    ctx.stroke();
    lines += 1;
  }
  for (let y = 0; y <= map.height; y += 1) {
    const py = y * tileH + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(widthPx, py);
    ctx.stroke();
    lines += 1;
  }
  ctx.restore();

  return lines;
}

export function drawSelectedTileHighlight(
  ctx: CanvasRenderingContext2D,
  tileX: number,
  tileY: number,
  tileW: number,
  tileH: number
): void {
  const x = tileX * tileW;
  const y = tileY * tileH;

  ctx.save();
  ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
  ctx.strokeStyle = 'rgba(59, 130, 246, 0.95)';
  ctx.lineWidth = 2;
  ctx.fillRect(x, y, tileW, tileH);
  // Align border for crisp pixel-like edge
  ctx.strokeRect(x + 1, y + 1, Math.max(0, tileW - 2), Math.max(0, tileH - 2));
  ctx.restore();
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
  images: MapPreviewTilesetImages,
  tileW: number,
  tileH: number
): number {
  if (!map.events?.length) return 0;
  const eventsByTile = new Map<string, MapEventSpec>();
  for (const event of map.events) {
    if (event.x < 0 || event.y < 0 || event.x >= map.width || event.y >= map.height) continue;
    const key = `${event.x},${event.y}`;
    // RPG Maker behavior: one event per tile in this UX flow; first wins if duplicates exist.
    if (!eventsByTile.has(key)) eventsByTile.set(key, event);
  }

  const overlayInset = Math.max(3, Math.floor(Math.min(tileW, tileH) * 0.12));
  let rendered = 0;
  ctx.save();
  for (const event of eventsByTile.values()) {
    const baseX = event.x * tileW;
    const baseY = event.y * tileH;
    const ox = baseX + overlayInset;
    const oy = baseY + overlayInset;
    const ow = Math.max(2, tileW - overlayInset * 2);
    const oh = Math.max(2, tileH - overlayInset * 2);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.98)';
    ctx.lineWidth = 2;
    ctx.fillRect(ox, oy, ow, oh);
    ctx.strokeRect(ox + 0.5, oy + 0.5, Math.max(0, ow - 1), Math.max(0, oh - 1));

    const characterName = (event.characterName || '').trim();
    const characterSheet = characterName ? images.eventCharacters?.[characterName] : null;
    if (characterSheet) {
      // RMXP charset sheets are 4x4 frames; use the standing "down" frame.
      const sheet: any = characterSheet as any;
      const fw = Math.floor((sheet.naturalWidth || sheet.width || tileW) / 4);
      const fh = Math.floor((sheet.naturalHeight || sheet.height || tileH) / 4);
      if (fw > 0 && fh > 0) {
        const directionToRow: Record<number, number> = {
          2: 0, // down
          4: 1, // left
          6: 2, // right
          8: 3, // up
        };
        const row = directionToRow[event.direction ?? 2] ?? 0;
        const col = Math.max(0, Math.min(3, event.pattern ?? 0));
        const sx = col * fw;
        const sy = row * fh;
        const scale = Math.min(ow / fw, oh / fh);
        const dw = fw * scale;
        const dh = fh * scale;
        const dx = ox + (ow - dw) / 2;
        const dy = oy + (oh - dh);
        ctx.save();
        ctx.globalAlpha = 0.95;
        ctx.drawImage(characterSheet, sx, sy, fw, fh, dx, dy, dw, dh);
        ctx.restore();
      }
    } else {
      const graphicTileId = event.graphicTileId ?? 0;
      if (graphicTileId > 0) {
        const rect = regularTileSourceRect(graphicTileId, tileW, tileH, images.mainSheetWidth);
        if (rect) {
          ctx.save();
          ctx.globalAlpha = 0.95;
          ctx.drawImage(images.main, rect.sx, rect.sy, rect.sw, rect.sh, ox, oy, ow, oh);
          ctx.restore();
        }
      }
    }
    rendered += 1;
  }
  ctx.restore();
  return rendered;
}

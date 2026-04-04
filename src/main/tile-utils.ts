export const TILESET_COLUMNS = 8; // RPG Maker XP tilesets are 8 tiles wide (256px / 32px)

export interface TileBlock {
  id: string;
  layer: number;
  width: number;
  height: number;
  tiles: Array<{ dx: number; dy: number; tileId: number }>;
  occurrences: number;
}

/**
 * Check if a tile is a regular tileset tile (not autotile, not empty).
 * Autotiles occupy IDs 48-383, regular tiles start at 384.
 */
export function isRegularTile(tileId: number): boolean {
  return tileId >= 384;
}

/**
 * Check if four tiles form a 2x2 block where IDs are adjacent in the tileset grid.
 * In RPG Maker XP, the tileset image is 8 tiles wide, so:
 *   - Horizontal neighbor: tileId + 1 (same row in tileset)
 *   - Vertical neighbor: tileId + 8 (next row in tileset)
 */
export function is2x2TilesetBlock(tl: number, tr: number, bl: number, br: number): boolean {
  if (!isRegularTile(tl) || !isRegularTile(tr) || !isRegularTile(bl) || !isRegularTile(br)) {
    return false;
  }
  return (
    tr === tl + 1 &&
    bl === tl + TILESET_COLUMNS &&
    br === tl + TILESET_COLUMNS + 1
  );
}

/**
 * Extract 2x2 multi-tile objects from map layers by finding groups of tiles
 * that are adjacent both in map space and in the tileset grid.
 * Returns deduplicated blocks sorted by occurrence frequency.
 */
export function extractTileBlocks(layers: number[][][]): TileBlock[] {
  const patternCounts = new Map<string, TileBlock>();

  for (let z = 0; z < layers.length; z++) {
    const layer = layers[z];
    if (!layer) continue;
    const height = layer.length;
    const width = layer[0]?.length || 0;

    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width - 1; x++) {
        const tl = layer[y][x];
        const tr = layer[y][x + 1];
        const bl = layer[y + 1]?.[x];
        const br = layer[y + 1]?.[x + 1];

        if (tl === undefined || tr === undefined || bl === undefined || br === undefined) continue;

        if (is2x2TilesetBlock(tl, tr, bl, br)) {
          const key = `${z}:${tl}`;
          const existing = patternCounts.get(key);
          if (existing) {
            existing.occurrences++;
          } else {
            patternCounts.set(key, {
              id: key,
              layer: z,
              width: 2,
              height: 2,
              tiles: [
                { dx: 0, dy: 0, tileId: tl },
                { dx: 1, dy: 0, tileId: tr },
                { dx: 0, dy: 1, tileId: bl },
                { dx: 1, dy: 1, tileId: br },
              ],
              occurrences: 1
            });
          }
        }
      }
    }
  }

  const blocks = [...patternCounts.values()];
  blocks.sort((a, b) => b.occurrences - a.occurrences);
  return blocks;
}

/**
 * Fallback: extract horizontal tile pairs (2 wide x 1 tall) from map layers.
 * Used when no 2x2 blocks are found.
 */
export function extractTilePairs(layers: number[][][]): TileBlock[] {
  const patternCounts = new Map<string, TileBlock>();

  for (let z = 0; z < layers.length; z++) {
    const layer = layers[z];
    if (!layer) continue;
    const height = layer.length;
    const width = layer[0]?.length || 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width - 1; x++) {
        const left = layer[y][x];
        const right = layer[y][x + 1];

        if (!isRegularTile(left) || !isRegularTile(right)) continue;

        const leftRow = Math.floor((left - 384) / TILESET_COLUMNS);
        const rightRow = Math.floor((right - 384) / TILESET_COLUMNS);
        if (leftRow === rightRow && right === left + 1) {
          const key = `h:${z}:${left}`;
          const existing = patternCounts.get(key);
          if (existing) {
            existing.occurrences++;
          } else {
            patternCounts.set(key, {
              id: key,
              layer: z,
              width: 2,
              height: 1,
              tiles: [
                { dx: 0, dy: 0, tileId: left },
                { dx: 1, dy: 0, tileId: right },
              ],
              occurrences: 1
            });
          }
        }
      }
    }
  }

  const blocks = [...patternCounts.values()];
  blocks.sort((a, b) => b.occurrences - a.occurrences);
  return blocks;
}

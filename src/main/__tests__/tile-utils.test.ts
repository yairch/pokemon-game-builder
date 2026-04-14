import { describe, it, expect } from 'vitest';
import {
  TILESET_COLUMNS,
  isRegularTile,
  is2x2TilesetBlock,
  extractTileBlocks,
  extractTilePairs,
} from '../tile-utils';

describe('isRegularTile', () => {
  it('returns false for tile 0 (empty)', () => {
    expect(isRegularTile(0)).toBe(false);
  });

  it('returns false for autotile IDs (48-383)', () => {
    expect(isRegularTile(48)).toBe(false);
    expect(isRegularTile(200)).toBe(false);
    expect(isRegularTile(383)).toBe(false);
  });

  it('returns true for regular tiles starting at 384', () => {
    expect(isRegularTile(384)).toBe(true);
    expect(isRegularTile(400)).toBe(true);
    expect(isRegularTile(1000)).toBe(true);
  });
});

describe('is2x2TilesetBlock', () => {
  it('detects a valid 2x2 block at the start of regular tiles', () => {
    // Tile 384 is at tileset grid position (0,0)
    // A valid 2x2 block: tl=384, tr=385, bl=392, br=393
    const tl = 384;
    const tr = 385;
    const bl = 384 + TILESET_COLUMNS;     // 392
    const br = 384 + TILESET_COLUMNS + 1; // 393
    expect(is2x2TilesetBlock(tl, tr, bl, br)).toBe(true);
  });

  it('rejects when any tile is an autotile', () => {
    expect(is2x2TilesetBlock(100, 101, 108, 109)).toBe(false);
  });

  it('rejects non-adjacent tiles', () => {
    expect(is2x2TilesetBlock(384, 386, 392, 394)).toBe(false);
  });
});

describe('extractTileBlocks', () => {
  it('finds a single 2x2 block in a 3-layer grid', () => {
    // 3x3 map, 3 layers. Place a valid 2x2 block on layer 1 at position (0,0).
    const tl = 384;
    const tr = 385;
    const bl = 384 + TILESET_COLUMNS;
    const br = 384 + TILESET_COLUMNS + 1;

    const layer0 = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const layer1 = [
      [tl, tr, 0],
      [bl, br, 0],
      [0,  0,  0],
    ];
    const layer2 = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];

    const blocks = extractTileBlocks([layer0, layer1, layer2]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].layer).toBe(1);
    expect(blocks[0].width).toBe(2);
    expect(blocks[0].height).toBe(2);
    expect(blocks[0].occurrences).toBe(1);
    expect(blocks[0].tiles).toEqual([
      { dx: 0, dy: 0, tileId: tl },
      { dx: 1, dy: 0, tileId: tr },
      { dx: 0, dy: 1, tileId: bl },
      { dx: 1, dy: 1, tileId: br },
    ]);
  });

  it('counts multiple occurrences of the same block', () => {
    const tl = 400;
    const tr = 401;
    const bl = 400 + TILESET_COLUMNS;
    const br = 400 + TILESET_COLUMNS + 1;

    // 6x3 map with the same 2x2 block placed twice on layer 0
    const layer = [
      [tl, tr, 0, tl, tr, 0],
      [bl, br, 0, bl, br, 0],
      [0,  0,  0, 0,  0,  0],
    ];

    const blocks = extractTileBlocks([[...layer.map(r => [...r])]]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].occurrences).toBe(2);
  });

  it('returns empty array when no 2x2 blocks exist', () => {
    const layer = [
      [0, 0, 0],
      [0, 384, 0],
      [0, 0, 0],
    ];
    expect(extractTileBlocks([layer])).toEqual([]);
  });

  it('sorts by occurrence count descending', () => {
    const blockA_tl = 384;
    const blockB_tl = 400;
    const C = TILESET_COLUMNS;

    // Block B appears 3x, Block A appears 1x
    const layer = [
      [blockA_tl, blockA_tl + 1, 0,          blockB_tl, blockB_tl + 1, 0,          blockB_tl, blockB_tl + 1, 0,          blockB_tl, blockB_tl + 1],
      [blockA_tl + C, blockA_tl + C + 1, 0,  blockB_tl + C, blockB_tl + C + 1, 0, blockB_tl + C, blockB_tl + C + 1, 0, blockB_tl + C, blockB_tl + C + 1],
    ];

    const blocks = extractTileBlocks([layer]);

    expect(blocks).toHaveLength(2);
    expect(blocks[0].tiles[0].tileId).toBe(blockB_tl);
    expect(blocks[0].occurrences).toBe(3);
    expect(blocks[1].tiles[0].tileId).toBe(blockA_tl);
    expect(blocks[1].occurrences).toBe(1);
  });
});

describe('extractTilePairs', () => {
  it('finds horizontal tile pairs', () => {
    const left = 384;
    const right = 385;

    const layer = [
      [left, right, 0],
      [0,    0,     0],
    ];

    const pairs = extractTilePairs([layer]);

    expect(pairs).toHaveLength(1);
    expect(pairs[0].width).toBe(2);
    expect(pairs[0].height).toBe(1);
    expect(pairs[0].tiles).toEqual([
      { dx: 0, dy: 0, tileId: left },
      { dx: 1, dy: 0, tileId: right },
    ]);
  });

  it('ignores non-adjacent tiles in the tileset', () => {
    const layer = [
      [384, 390, 0],
      [0,   0,   0],
    ];

    expect(extractTilePairs([layer])).toEqual([]);
  });
});

import { describe, it, expect, vi } from 'vitest';
import type { MapData } from '../../shared/types';
import {
  autotileSlotIndex,
  drawMapEventMarkers,
  drawMapGrid,
  drawMapPreviewLayers,
  drawSelectedTileHighlight,
  getEventAtTile,
  mapPixelSize,
  regularTileSourceRect,
} from './mapPreviewCanvas';

describe('regularTileSourceRect', () => {
  it('maps tile 384 to top-left of an 8-column 32px sheet', () => {
    const r = regularTileSourceRect(384, 32, 32, 256);
    expect(r).toEqual({ sx: 0, sy: 0, sw: 32, sh: 32 });
  });

  it('maps tile 385 one step right in the chip grid', () => {
    const r = regularTileSourceRect(385, 32, 32, 256);
    expect(r).toEqual({ sx: 32, sy: 0, sw: 32, sh: 32 });
  });

  it('returns null for autotile range', () => {
    expect(regularTileSourceRect(100, 32, 32, 256)).toBeNull();
  });
});

describe('autotileSlotIndex', () => {
  it('returns slot 0 for id 48', () => {
    expect(autotileSlotIndex(48)).toBe(0);
  });

  it('returns slot 1 for id 96', () => {
    expect(autotileSlotIndex(96)).toBe(1);
  });

  it('returns null outside autotile range', () => {
    expect(autotileSlotIndex(47)).toBeNull();
    expect(autotileSlotIndex(384)).toBeNull();
  });
});

describe('mapPixelSize', () => {
  it('multiplies map dimensions by tile size', () => {
    const map = { width: 5, height: 4 } as MapData;
    expect(mapPixelSize(map, 32, 32)).toEqual({ w: 160, h: 128 });
  });
});

describe('drawMapPreviewLayers', () => {
  it('issues drawImage for each non-zero regular tile across layers', () => {
    const map: MapData = {
      id: 1,
      name: 'Mini',
      width: 2,
      height: 2,
      tilesetId: 1,
      layers: [
        [
          [384, 0],
          [0, 385],
        ],
        [
          [0, 0],
          [0, 0],
        ],
        [
          [0, 0],
          [0, 0],
        ],
      ],
      events: [],
    };
    const ctx = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      imageSmoothingEnabled: true,
    } as unknown as CanvasRenderingContext2D;
    const main = { naturalWidth: 256 } as unknown as HTMLImageElement;
    const draws = drawMapPreviewLayers(ctx, {
      map,
      images: {
        main,
        autotiles: [],
        tileWidth: 32,
        tileHeight: 32,
        mainSheetWidth: 256,
      },
    });
    expect(draws).toBe(2);
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
  });

  it('draws autotile when slot image exists', () => {
    const map: MapData = {
      id: 1,
      name: 'Mini',
      width: 1,
      height: 1,
      tilesetId: 1,
      layers: [[[48]]],
      events: [],
    };
    const auto = { naturalWidth: 96 } as unknown as HTMLImageElement;
    const ctx = {
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const autotiles: (HTMLImageElement | null)[] = [auto];
    const draws = drawMapPreviewLayers(ctx, {
      map,
      images: {
        main: { naturalWidth: 256 } as unknown as HTMLImageElement,
        autotiles,
        tileWidth: 32,
        tileHeight: 32,
        mainSheetWidth: 256,
      },
    });
    expect(draws).toBe(1);
    expect(ctx.drawImage).toHaveBeenCalledWith(auto, 0, 0, 32, 32, 0, 0, 32, 32);
  });
});

describe('getEventAtTile', () => {
  it('returns event when tile has one', () => {
    const event = getEventAtTile(
      [
        { id: 2, type: 'event', name: 'Greeter', x: 3, y: 4 },
        { id: 3, type: 'event', name: 'Sign', x: 5, y: 6 },
      ],
      3,
      4
    );
    expect(event?.id).toBe(2);
    expect(event?.name).toBe('Greeter');
  });

  it('returns null when tile has no event', () => {
    const event = getEventAtTile([{ id: 2, type: 'event', name: 'Greeter', x: 3, y: 4 }], 0, 0);
    expect(event).toBeNull();
  });
});

describe('drawMapEventMarkers', () => {
  it('draws one overlay per in-bounds event tile', () => {
    const map: MapData = {
      id: 1,
      name: 'WithEvents',
      width: 8,
      height: 8,
      tilesetId: 1,
      layers: [[[0]]],
      events: [
        { id: 1, type: 'event', name: 'NPC', x: 1, y: 2, graphicTileId: 384 },
        { id: 2, type: 'event', name: 'Sign', x: 4, y: 6 },
      ],
    };

    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      globalAlpha: 1,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
    } as unknown as CanvasRenderingContext2D;

    const drawn = drawMapEventMarkers(
      ctx,
      map,
      {
        main: { naturalWidth: 256 } as unknown as HTMLImageElement,
        autotiles: [],
        eventCharacters: {},
        tileWidth: 32,
        tileHeight: 32,
        mainSheetWidth: 256,
      },
      32,
      32
    );
    expect(drawn).toBe(2);
    expect(ctx.fillRect).toHaveBeenCalledTimes(2);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
  });

  it('keeps only one event overlay when multiple events share tile', () => {
    const map: MapData = {
      id: 2,
      name: 'Overlap',
      width: 4,
      height: 4,
      tilesetId: 1,
      layers: [[[0]]],
      events: [
        { id: 1, type: 'event', name: 'A', x: 2, y: 1 },
        { id: 2, type: 'event', name: 'B', x: 2, y: 1 },
        { id: 3, type: 'event', name: 'C', x: 2, y: 1 },
      ],
    };
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      globalAlpha: 1,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
    } as unknown as CanvasRenderingContext2D;
    const drawn = drawMapEventMarkers(
      ctx,
      map,
      {
        main: { naturalWidth: 256 } as unknown as HTMLImageElement,
        autotiles: [],
        eventCharacters: {},
        tileWidth: 32,
        tileHeight: 32,
        mainSheetWidth: 256,
      },
      32,
      32
    );
    expect(drawn).toBe(1);
    expect(ctx.fillRect).toHaveBeenCalledTimes(1);
  });

  it('prefers character sprite rendering and uses direction/pattern frame', () => {
    const map: MapData = {
      id: 3,
      name: 'CharacterEvent',
      width: 3,
      height: 3,
      tilesetId: 1,
      layers: [[[0]]],
      events: [{ id: 1, type: 'event', name: 'NPC', x: 1, y: 1, characterName: 'npc001', direction: 6, pattern: 2 }],
    };
    const characterSheet = { naturalWidth: 128, naturalHeight: 192 } as unknown as HTMLImageElement;
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      globalAlpha: 1,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
    } as unknown as CanvasRenderingContext2D;
    const drawn = drawMapEventMarkers(
      ctx,
      map,
      {
        main: { naturalWidth: 256 } as unknown as HTMLImageElement,
        autotiles: [],
        eventCharacters: { npc001: characterSheet },
        tileWidth: 32,
        tileHeight: 32,
        mainSheetWidth: 256,
      },
      32,
      32
    );
    expect(drawn).toBe(1);
    expect(ctx.drawImage).toHaveBeenCalledWith(
      characterSheet,
      64,
      96,
      32,
      48,
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number)
    );
  });
});

describe('drawMapGrid', () => {
  it('draws width+1 vertical and height+1 horizontal lines', () => {
    const map = {
      width: 4,
      height: 3,
    } as MapData;

    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      strokeStyle: '',
      lineWidth: 0,
    } as unknown as CanvasRenderingContext2D;

    const lines = drawMapGrid(ctx, map, 32, 32);
    expect(lines).toBe(9);
    expect(ctx.stroke).toHaveBeenCalledTimes(9);
  });
});

describe('drawSelectedTileHighlight', () => {
  it('draws a fill and stroke for selected tile', () => {
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
    } as unknown as CanvasRenderingContext2D;

    drawSelectedTileHighlight(ctx, 2, 3, 32, 32);

    expect(ctx.fillRect).toHaveBeenCalledWith(64, 96, 32, 32);
    expect(ctx.strokeRect).toHaveBeenCalledWith(65, 97, 30, 30);
  });
});

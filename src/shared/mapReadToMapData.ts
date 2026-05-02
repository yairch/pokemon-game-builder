import type { MapData, MapReadData } from './types';

/**
 * MapPreview uses `MapData`; bridge `read_map` returns richer `MapReadData`.
 * Layers/size/tileset are identical; preview does not consume full events yet.
 */
export function mapReadDataToMapData(mapId: number, mapName: string, read: MapReadData): MapData {
  return {
    id: mapId,
    name: mapName,
    width: read.width,
    height: read.height,
    tilesetId: read.tilesetId,
    layers: read.layers,
    events: [],
  };
}

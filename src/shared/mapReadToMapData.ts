import type { MapData, MapReadData } from './types';

/**
 * MapPreview uses `MapData`; bridge `read_map` returns richer `MapReadData`.
 * Layers/size/tileset are identical; preview consumes event markers from read-map.
 */
export function mapReadDataToMapData(mapId: number, mapName: string, read: MapReadData): MapData {
  return {
    id: mapId,
    name: mapName,
    width: read.width,
    height: read.height,
    tilesetId: read.tilesetId,
    layers: read.layers,
    events: (read.events || []).map((event) => ({
      id: event.id,
      type: 'event',
      x: event.x,
      y: event.y,
      name: event.name || `Event ${event.id}`,
    })),
  };
}

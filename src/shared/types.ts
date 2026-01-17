// Type definitions for shared use
export interface MapData {
  id: number;
  name: string;
  width: number;
  height: number;
  tilesetId: number;
  layers: number[][][]; // [layer][y][x]
  events: MapEventSpec[];
}

export interface MapEventSpec {
  type: 'npc' | 'item';
  x: number;
  y: number;
  name: string;
}

export interface MapSpec {
  name: string;
  width: number;
  height: number;
  tilesetId: number;
  groundTileId: number;
  waterTileId?: number;
  waterRegions?: Array<{ x: number; y: number; width: number; height: number }>;
  events?: MapEventSpec[];
}

export interface ChatResponse {
  text: string;
  mapData?: MapData;
}

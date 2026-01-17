// Type definitions for shared use
export interface MapData {
  id: number;
  name: string;
  width: number;
  height: number;
  tilesetId: number;
  data: number[][][]; // [layer][y][x]
  events: any[];
}

export interface ChatResponse {
  text: string;
  mapData?: MapData;
}

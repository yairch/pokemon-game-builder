// Type definitions for shared use

// ============================================================
// MAP SPEC - Input for map generation
// ============================================================

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
  patchTiles?: boolean;
}

// ============================================================
// MAP DATA - Output from map generation / read
// ============================================================

export interface MapData {
  id: number;
  name: string;
  width: number;
  height: number;
  tilesetId: number;
  layers: number[][][]; // [layer][y][x]
  events: MapEventSpec[];
}

// ============================================================
// READ RESPONSES - Data returned from Ruby bridge read commands
// ============================================================

export interface AudioFileData {
  name: string;
  volume: number;
  pitch: number;
}

export interface EventGraphicData {
  tileId: number;
  characterName: string;
  characterHue: number;
  direction: number;
  pattern: number;
  opacity: number;
  blendType: number;
}

export interface EventCommandData {
  code: number;
  indent: number;
  parameters: any[];
}

export interface EventPageData {
  index: number;
  trigger: number;
  moveType: number;
  moveSpeed: number;
  moveFrequency: number;
  walkAnime: boolean;
  stepAnime: boolean;
  directionFix: boolean;
  through: boolean;
  alwaysOnTop: boolean;
  graphic: EventGraphicData;
  commands: EventCommandData[];
}

export interface EventData {
  id: number;
  name: string;
  x: number;
  y: number;
  pages: EventPageData[];
}

export interface MapReadData {
  tilesetId: number;
  width: number;
  height: number;
  autoplayBgm: boolean;
  bgm: AudioFileData | null;
  autoplayBgs: boolean;
  bgs: AudioFileData | null;
  encounterStep: number;
  encounterList: any[];
  layers: number[][][]; // [layer][y][x]
  events: EventData[];
}

export interface MapInfoData {
  id: number;
  name: string;
  parentId: number;
  order: number;
  expanded: boolean;
  scrollX: number;
  scrollY: number;
}

export interface MapInfosReadData {
  [mapId: string]: MapInfoData;
}

export interface TilesetData {
  id: number;
  name: string;
  tilesetName: string;
  autotileNames: string[];
  panoramaName: string;
  panoramaHue: number;
  fogName: string;
  fogHue: number;
  fogOpacity: number;
  fogBlendType: number;
  fogZoom: number;
  fogSx: number;
  fogSy: number;
  battlebackName: string;
  passages: number[];
  priorities: number[];
  terrainTags: number[];
}

export interface SystemReadData {
  startMapId: number;
  startX: number;
  startY: number;
  editMapId: number;
  partyMembers: number[];
  elements: string[];
  switches: string[];
  variables: string[];
  windowskinName: string;
  titleName: string;
  gameoverName: string;
  battleTransition: string;
  battlebackName: string;
}

// ============================================================
// CHAT / AI RESPONSE
// ============================================================

export interface ChatResponse {
  text: string;
  mapData?: MapData;
}

// ============================================================
// PROJECT CONTEXT - Aggregated project data for AI context
// ============================================================

export interface ProjectContext {
  projectPath: string;
  mapInfos: MapInfosReadData;
  tilesets: TilesetData[];
  system: SystemReadData | null;
}

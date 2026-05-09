/**
 * Pure business logic — no Electron, no Express, no transport concerns.
 * Both the Electron IPC layer and the Express HTTP layer delegate here.
 */

import { IAIService, AIProvider } from './ai-service-base';
import { AIServiceFactory } from './ai-service-factory';
import { ProjectService } from './project-service';
import { MapGenerator } from './map-generator';
import { MapSpec, TilesetInspectorData } from '../shared/types';
import { TileBlock, extractTileBlocks, extractTilePairs } from './tile-utils';
import { handleChatMapPipeline } from './chat-map-pipeline';
import * as path from 'path';
import { pathToFileURL } from 'url';
import * as fs from 'fs-extra';

// ---------------------------------------------------------------------------
// Config persistence
// ---------------------------------------------------------------------------

export interface AIConfig {
  useClaude?: boolean;
  claudeApiKey?: string;
  geminiApiKey?: string;
  modelName?: string;
}

let configPathOverride: string | null = null;

/** Allow the host to override where config is stored (e.g. Electron userData). */
export function setConfigPath(p: string) {
  configPathOverride = p;
}

function getConfigPath(): string {
  if (configPathOverride) return configPathOverride;
  const os = require('os');
  return path.join(os.homedir(), '.pokemon-game-builder', 'config.json');
}

export function loadConfig(): AIConfig {
  try {
    const p = getConfigPath();
    if (fs.existsSync(p)) return fs.readJsonSync(p);
  } catch (err) {
    console.error('Failed to load config:', err);
  }
  return {};
}

export function saveConfig(cfg: AIConfig) {
  try {
    const p = getConfigPath();
    fs.ensureDirSync(path.dirname(p));
    fs.writeJsonSync(p, cfg);
  } catch (err) {
    console.error('Failed to save config:', err);
  }
}

// ---------------------------------------------------------------------------
// Service state  (singleton — shared by all transports in the same process)
// ---------------------------------------------------------------------------

let config: AIConfig = loadConfig();
let aiService: IAIService | null = null;
const mapGenerator = new MapGenerator();

export function getConfig(): AIConfig { return config; }

export function getCurrentProvider(): AIProvider {
  return config.useClaude ? 'claude' : 'gemini';
}

export function getCurrentApiKey(): string {
  return AIServiceFactory.getApiKey(getCurrentProvider(), config);
}

export function createAIService(): IAIService | null {
  const provider = getCurrentProvider();
  const apiKey = getCurrentApiKey();
  if (!apiKey) {
    console.log(`No API key found for provider: ${provider}`);
    return null;
  }
  console.log(`Creating ${provider} service with API key: ${apiKey.substring(0, 10)}...`);
  try {
    return AIServiceFactory.create(provider, apiKey, config.modelName);
  } catch (err) {
    console.error(`Failed to create ${provider} service:`, err);
    return null;
  }
}

function ensureAIService() { return aiService; }

/** Call once at startup (after setConfigPath if needed). */
export function boot() {
  config = loadConfig();
  aiService = createAIService();
}

// ---------------------------------------------------------------------------
// Handlers — pure functions returning plain data (no res.json, no ipcMain)
// ---------------------------------------------------------------------------

// --- Config ---

export function handleGetApiKey() {
  return { apiKey: getCurrentApiKey(), provider: getCurrentProvider() };
}

export function handleHasApiKey() {
  return { hasKey: !!getCurrentApiKey() };
}

export function handleSetApiKey(newApiKey: string, providerParam?: AIProvider) {
  const provider = providerParam || getCurrentProvider();
  if (provider === 'claude') {
    config.claudeApiKey = newApiKey;
  } else {
    config.geminiApiKey = newApiKey;
  }
  saveConfig(config);
  aiService = createAIService();
  return true;
}

export function handleGetProvider() {
  return { provider: getCurrentProvider() };
}

export function handleSetProvider(useClaude: boolean) {
  config.useClaude = useClaude;
  saveConfig(config);
  aiService = createAIService();
  return { success: true, provider: getCurrentProvider() };
}

export function handleSetActiveModel(modelName: string) {
  console.log(`Setting active model to: ${modelName}`);
  config.modelName = modelName;
  saveConfig(config);
  aiService = createAIService();
  return true;
}

export function handleGetQuotaInfo() {
  if (!aiService || !aiService.getCachedQuota) {
    return { hasData: false, info: null, provider: getCurrentProvider() };
  }
  return { ...aiService.getCachedQuota(), provider: getCurrentProvider() };
}

// --- Ping ---

export async function handlePing() {
  if (!aiService) return { success: false, error: 'No API key configured' };
  return aiService.ping();
}

// --- Debug ---

export async function handleDebugListModels() {
  if (!aiService) return { error: 'No API key configured' };
  try { return await aiService.listModels(); }
  catch (err: any) { return { error: err.message }; }
}

// --- Project init ---

export async function handleInitProject(projectPath: string) {
  try {
    const templatePath = path.join(__dirname, '../../templates/essentials');
    if (fs.existsSync(templatePath)) {
      await fs.copy(templatePath, projectPath);
      return true;
    }

    const folders = [
      'Data', 'Graphics/Tilesets', 'Graphics/Characters', 'Graphics/Autotiles',
      'Audio/BGM', 'Audio/SE', 'PBS', 'Fonts', 'Plugins'
    ];
    for (const folder of folders) {
      const fullPath = path.join(projectPath, folder);
      if (!fs.existsSync(fullPath)) await fs.ensureDir(fullPath);
    }

    const gameExePath = path.join(projectPath, 'Game.exe');
    if (!fs.existsSync(gameExePath)) await fs.writeFile(gameExePath, '');

    const gameIniPath = path.join(projectPath, 'Game.ini');
    if (!fs.existsSync(gameIniPath)) {
      await fs.writeFile(gameIniPath,
        `[Game]\r\nLibrary=RGSS104E.dll\r\nScripts=Data\\Scripts.rxdata\r\nTitle=New Pokemon Game\r\nRTP1=\r\nRTP2=\r\nRTP3=`);
    }
    return true;
  } catch (error) {
    console.error('Failed to init project:', error);
    return false;
  }
}

// --- AI chat ---

export async function handleAIChat(message: string, projectPath: string, templateMapId?: number | null) {
  return handleChatMapPipeline(
    {
      aiService,
      mapGenerator,
      createProjectService: (p) => new ProjectService(p),
      getCurrentProvider: () => getCurrentProvider(),
    },
    message,
    projectPath,
    templateMapId
  );
}

// --- Stub map spec ---

export function handleGetStubMapSpec(): MapSpec {
  // RPG Maker XP tile ID ranges:
  // 0 = empty/transparent
  // 48-383 = autotiles (7 slots × 48 patterns each)
  // 384+ = regular tileset tiles
  return {
    name: 'POC Meadow',
    width: 20,
    height: 15,
    tilesetId: 1,
    groundTileId: 384,
    waterTileId: 48,
    waterRegions: [{ x: 6, y: 6, width: 4, height: 3 }],
    events: [],
    patchTiles: true
  };
}

// --- Compile map spec ---

export async function handleCompileMapSpec(projectPath: string, spec: MapSpec, templateMapId?: number | null) {
  if (!projectPath) return { success: false, error: 'Please select a Pokemon Essentials project first.' };

  const projectService = new ProjectService(projectPath);
  if (!projectService.isValidProject()) return { success: false, error: 'The selected directory does not appear to be a valid Pokemon Essentials project.' };
  if (!spec || !spec.name) return { success: false, error: 'Invalid map spec.' };

  try {
    const nextId = await projectService.getNextMapId();
    let mapData = mapGenerator.compileMapSpec(nextId, spec);

    if (templateMapId) {
      let templateMapData: TemplateMapShape | null = null;
      try { templateMapData = await mapGenerator.readMap(projectPath, templateMapId); } catch {
        return { success: false, error: `Failed to read template map ${templateMapId}.` };
      }
      if (templateMapData) mapData = createPatternedMapDataFromTemplate(nextId, spec, templateMapData);
      await mapGenerator.cloneMapFile(projectPath, templateMapId, nextId);
      if (spec.patchTiles !== false) await mapGenerator.patchMapData(projectPath, nextId, mapData);
    } else {
      const mapFiles = await projectService.getMapList();
      const mapIds = mapFiles.map((f) => parseInt(f.match(/\d+/)?.[0] || '0', 10)).filter((id) => id > 0).sort((a, b) => a - b);

      if (mapIds.length > 0) {
        let fallbackTemplateId = mapIds[0];
        let fallbackTemplateData: TemplateMapShape | null = null;
        for (const candidateId of mapIds) {
          try {
            const candidateMap = await mapGenerator.readMap(projectPath, candidateId);
            if (candidateMap.tilesetId === mapData.tilesetId) {
              fallbackTemplateId = candidateId;
              fallbackTemplateData = candidateMap;
              break;
            }
          } catch { /* skip */ }
        }
        if (fallbackTemplateData) mapData = createPatternedMapDataFromTemplate(nextId, spec, fallbackTemplateData);
        await mapGenerator.cloneMapFile(projectPath, fallbackTemplateId, nextId);
        if (spec.patchTiles !== false) await mapGenerator.patchMapData(projectPath, nextId, mapData);
      } else {
        await mapGenerator.generateMapFile(projectPath, nextId, mapData);
      }
    }
    await mapGenerator.registerMapInInfos(projectPath, nextId, mapData.name);
    return { success: true, mapId: nextId, mapData };
  } catch (error: any) {
    console.error('[handleCompileMapSpec] Error:', error.message || error);
    return { success: false, error: error.message || 'Failed to compile map spec.' };
  }
}

// --- Run map test ---

type MapTestType = 'ai' | 'sanity' | 'object';

export async function handleRunMapTest(projectPath: string, mapName: string, mapId: number | undefined, testType: MapTestType) {
  if (!projectPath) return { success: false, error: 'Project path is required.' };
  if (!mapId) return { success: false, error: 'Select a map via Tileset Inspector before running tests.' };

  const projectService = new ProjectService(projectPath);
  if (!projectService.isValidProject()) return { success: false, error: 'The selected directory does not appear to be a valid Pokemon Essentials project.' };

  const normalizedType = testType || 'ai';
  const validTypes: MapTestType[] = ['ai', 'sanity', 'object'];
  if (!validTypes.includes(normalizedType)) return { success: false, error: `Invalid test type: ${testType}` };

  try {
    const mapInfos = await mapGenerator.readMapInfos(projectPath);
    const mapEntry = Object.values(mapInfos).find((info) => info.id === mapId);
    if (!mapEntry) return { success: false, error: `Map "${mapName}" not found in MapInfos.` };

    const templateMap = await mapGenerator.readMap(projectPath, mapEntry.id);
    console.log(`[handleRunMapTest] Read template map: ${mapEntry.name} (ID: ${mapEntry.id}), size: ${templateMap.width}x${templateMap.height}, tileset: ${templateMap.tilesetId}`);
    console.log(`[handleRunMapTest] Template map layers structure: layer0=${templateMap.layers[0]?.length} rows, layer1=${templateMap.layers[1]?.length} rows, layer2=${templateMap.layers[2]?.length} rows`);
    if (templateMap.layers[0]?.[0]) {
      console.log(`[handleRunMapTest] Sample tiles from template (first row, first 10 tiles):`, templateMap.layers[0][0].slice(0, 10));
      console.log(`[handleRunMapTest] Sample tiles from template (row 10, first 10 tiles):`, templateMap.layers[0][10]?.slice(0, 10));
      console.log(`[handleRunMapTest] Sample tiles from template (row 20, first 10 tiles):`, templateMap.layers[0][20]?.slice(0, 10));
    }
    const tilesets = await mapGenerator.readTilesets(projectPath);
    const tileset = tilesets.find((t) => t.id === templateMap.tilesetId);
    const nextId = await projectService.getNextMapId();

    const mapResult = normalizedType === 'ai'
      ? await createAiTestMap(nextId, templateMap, tileset, projectPath)
      : normalizedType === 'object'
      ? await createObjectTestMap(nextId, templateMap, tileset, projectPath)
      : createSanityTestMap(nextId, templateMap, tileset);
    const mapData = mapResult.mapData;

    console.log(`[handleRunMapTest] Cloning map file from ${mapEntry.id} to ${nextId}...`);
    await mapGenerator.cloneMapFile(projectPath, mapEntry.id, nextId);

    console.log(`[handleRunMapTest] Patching map data for map ${nextId}...`);
    console.log(`[handleRunMapTest] MapData dimensions: ${mapData.width}x${mapData.height}, layers: ${mapData.layers.length} layers`);
    try {
      await mapGenerator.patchMapData(projectPath, nextId, mapData);
      console.log(`[handleRunMapTest] Map patching completed successfully`);
    } catch (error: any) {
      console.error(`[handleRunMapTest] Map patching failed:`, error);
      throw error;
    }

    console.log(`[handleRunMapTest] Registering map ${nextId} in MapInfos...`);
    await mapGenerator.registerMapInInfos(projectPath, nextId, mapData.name);
    console.log(`[handleRunMapTest] Map ${nextId} registered successfully`);

    return { success: true, mapId: nextId, mapData, debug: mapResult.debug, sourceMapId: mapEntry.id, sourceMapName: mapEntry.name };
  } catch (error: any) {
    console.error('[handleRunMapTest] Error:', error.message || error);
    return { success: false, error: error.message || 'Failed to run map test.' };
  }
}

// --- Read project data ---

export async function handleReadMap(projectPath: string, mapId: number) {
  if (!projectPath) return { success: false, error: 'Project path is required.' };
  if (!mapId || mapId < 1) return { success: false, error: 'Valid map ID is required.' };
  try { return { success: true, data: await mapGenerator.readMap(projectPath, mapId) }; }
  catch (error: any) { return { success: false, error: error.message || 'Failed to read map.' }; }
}

export async function handleReadMapInfos(projectPath: string) {
  if (!projectPath) return { success: false, error: 'Project path is required.' };
  try { return { success: true, data: await mapGenerator.readMapInfos(projectPath) }; }
  catch (error: any) { return { success: false, error: error.message || 'Failed to read map infos.' }; }
}

export async function handleReadTilesets(projectPath: string) {
  if (!projectPath) return { success: false, error: 'Project path is required.' };
  try { return { success: true, data: await mapGenerator.readTilesets(projectPath) }; }
  catch (error: any) { return { success: false, error: error.message || 'Failed to read tilesets.' }; }
}

export async function handleReadSystem(projectPath: string) {
  if (!projectPath) return { success: false, error: 'Project path is required.' };
  try { return { success: true, data: await mapGenerator.readSystem(projectPath) }; }
  catch (error: any) { return { success: false, error: error.message || 'Failed to read system data.' }; }
}

export async function handleReadProjectContext(projectPath: string) {
  if (!projectPath) return { success: false, error: 'Project path is required.' };
  const ps = new ProjectService(projectPath);
  if (!ps.isValidProject()) return { success: false, error: 'The selected directory does not appear to be a valid Pokemon Essentials project.' };
  try {
    const [mapInfos, tilesets, system] = await Promise.all([
      mapGenerator.readMapInfos(projectPath).catch(() => ({})),
      mapGenerator.readTilesets(projectPath).catch(() => []),
      mapGenerator.readSystem(projectPath).catch(() => null)
    ]);
    return { success: true, data: { projectPath, mapInfos, tilesets, system } };
  } catch (error: any) { return { success: false, error: error.message || 'Failed to read project context.' }; }
}

// --- Tileset inspector ---

export async function handleTilesetInspector(projectPath: string, mapId?: number, mapName?: string) {
  if (!projectPath) return { success: false, error: 'Project path is required.' };
  try {
    const mapInfos = await mapGenerator.readMapInfos(projectPath);
    let mapEntry;
    if (mapId) {
      mapEntry = Object.values(mapInfos).find((info) => info.id === mapId);
      if (!mapEntry) return { success: false, error: `Map ID ${mapId} not found in MapInfos.` };
    } else if (mapName) {
      mapEntry = Object.values(mapInfos).find((info) => info.name.toLowerCase() === mapName.toLowerCase());
      if (!mapEntry) return { success: false, error: `Map "${mapName}" not found in MapInfos.` };
    } else {
      return { success: false, error: 'Please provide a map ID or map name.' };
    }

    const map = await mapGenerator.readMap(projectPath, mapEntry.id);
    const tilesets = await mapGenerator.readTilesets(projectPath);
    const tileset = tilesets.find((t) => t.id === map.tilesetId);
    if (!tileset) return { success: false, error: `Tileset ${map.tilesetId} not found.` };

    const tilesetImagePath = resolveTilesetImagePath(projectPath, tileset.tilesetName);
    const names = tileset.autotileNames || [];
    const autotileImagePaths = names.map((n) => (n ? resolveAutotileImagePath(projectPath, n) : ''));
    const autotileImageUrls = autotileImagePaths.map((p) => (p ? toFileUrl(p) : ''));
    const autotileImageDataUrls = autotileImagePaths.map((p) => (p ? toDataUrl(p) : ''));
    const eventCharacterImageDataUrls: Record<string, string> = {};
    for (const evt of map.events || []) {
      const previewPage =
        evt.pages?.find((page: any) => {
          const g = page?.graphic;
          return Boolean((g?.characterName && String(g.characterName).trim()) || (g?.tileId ?? 0) > 0);
        }) || evt.pages?.[0];
      const characterName = previewPage?.graphic?.characterName;
      if (!characterName || eventCharacterImageDataUrls[characterName]) continue;
      const characterPath = resolveCharacterImagePath(projectPath, characterName);
      const dataUrl = toDataUrl(characterPath);
      if (dataUrl) eventCharacterImageDataUrls[characterName] = dataUrl;
    }

    const data: TilesetInspectorData = {
      mapName: mapEntry.name, mapId: mapEntry.id,
      tilesetId: map.tilesetId, tilesetName: tileset.tilesetName,
      tilesetImagePath, tilesetImageUrl: toFileUrl(tilesetImagePath), tilesetImageDataUrl: toDataUrl(tilesetImagePath),
      autotileImagePaths, autotileImageUrls, autotileImageDataUrls,
      eventCharacterImageDataUrls,
      tileWidth: 32, tileHeight: 32
    };
    return { success: true, data };
  } catch (error: any) { return { success: false, error: error.message || 'Failed to load tileset inspector data.' }; }
}

// ===========================================================================
// Private helpers (tile logic, test map generators, etc.)
// ===========================================================================

type TemplateMapShape = { tilesetId: number; width: number; height: number; layers: number[][][] };

function cloneLayers(layers: number[][][]): number[][][] {
  return layers.map((layer) => layer.map((row) => [...row]));
}

function findTopTwoTiles(layer: number[][]): [number, number] {
  const counts = new Map<number, number>();
  for (const row of layer) for (const tile of row) {
    if (tile && tile > 0) counts.set(tile, (counts.get(tile) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return [sorted[0]?.[0] ?? 0, sorted[1]?.[0] ?? sorted[0]?.[0] ?? 0];
}

function findTopTiles(layer: number[][], limit: number): number[] {
  const counts = new Map<number, number>();
  for (const row of layer) for (const tile of row) {
    if (tile && tile > 0) counts.set(tile, (counts.get(tile) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, limit);
}

function createPatternedMapDataFromTemplate(mapId: number, spec: MapSpec, templateMap: TemplateMapShape) {
  const layers = cloneLayers(templateMap.layers);
  const [baseTile, accentTile] = findTopTwoTiles(layers[0]);
  const { width, height } = templateMap;
  const startX = Math.floor(width * 0.25), startY = Math.floor(height * 0.25);
  const endX = Math.floor(width * 0.75), endY = Math.floor(height * 0.75);
  for (let y = startY; y < endY; y += 1) for (let x = startX; x < endX; x += 1) {
    const isBorder = x === startX || y === startY || x === endX - 1 || y === endY - 1;
    layers[0][y][x] = isBorder || (x + y) % 2 === 0 ? accentTile : baseTile;
  }
  return { id: mapId, name: spec.name, width, height, tilesetId: templateMap.tilesetId, layers, events: [] };
}

// --- Tileset metadata helpers ---

function getTilesetIndex(tileId: number): number | null {
  if (tileId < 0) return null;
  return tileId < 384 ? tileId : tileId - 384;
}

function getPassage(tileset: { passages?: number[] } | undefined, tileId: number): number | null {
  const idx = getTilesetIndex(tileId);
  return idx === null ? null : (tileset?.passages?.[idx] ?? null);
}

function getPriority(tileset: { priorities?: number[] } | undefined, tileId: number): number | null {
  const idx = getTilesetIndex(tileId);
  return idx === null ? null : (tileset?.priorities?.[idx] ?? null);
}

function buildRegularTileIds(tileset: { passages?: number[]; priorities?: number[] } | undefined): number[] {
  const count = Math.max(tileset?.passages?.length || 0, tileset?.priorities?.length || 0);
  const ids: number[] = [];
  for (let i = 0; i < count; i += 1) ids.push(384 + i);
  return ids;
}

function findAutotileIndexByName(names: string[]): number {
  const hints = ['water', 'sea', 'lake', 'pond', 'ocean', 'river'];
  for (let i = 0; i < names.length; i += 1) {
    if (hints.some((h) => (names[i]?.toLowerCase() || '').includes(h))) return i;
  }
  return -1;
}

function selectWaterTile(layer: number[][], tileset?: { autotileNames: string[] }): number {
  const ai = findAutotileIndexByName(tileset?.autotileNames || []);
  if (ai >= 0) return 48 + ai * 48;
  const candidates = findTopTiles(layer.map((row) => row.map((t) => (t >= 48 && t < 384 ? t : 0))), 3);
  if (candidates[0]) return candidates[0];
  return (tileset?.autotileNames || []).some((n) => !!n) ? 48 : 0;
}

function buildWaterCandidates(layer: number[][], tileset?: { autotileNames: string[] }): number[] {
  const candidates: number[] = [];
  for (const [index, name] of (tileset?.autotileNames || []).entries()) {
    if (name && findAutotileIndexByName([name]) !== -1) candidates.push(48 + index * 48);
  }
  const auto = findTopTiles(layer.map((row) => row.map((t) => (t >= 48 && t < 384 ? t : 0))), 4);
  return [...new Set([...candidates, ...auto])].filter((id) => id > 0);
}

function findCandidateTiles(layer: number[][], predicate: (tile: number) => boolean, limit: number): number[] {
  const counts = new Map<number, number>();
  for (const row of layer) for (const tile of row) {
    if (tile && tile > 0 && predicate(tile)) counts.set(tile, (counts.get(tile) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, limit);
}

function pickPathTileFromTileset(tileset: { passages?: number[]; priorities?: number[] } | undefined, baseTile: number, layer?: number[][]): number | null {
  const regular = buildRegularTileIds(tileset).filter((t) => {
    if (t === baseTile) return false;
    const p = getPassage(tileset, t), pr = getPriority(tileset, t);
    return (p === 0 || p === null) && (pr === 0 || pr === null);
  });
  if (regular.length > 0) return regular[0];
  if (layer) {
    const mc = findCandidateTiles(layer, (t) => {
      if (t === baseTile || !t) return false;
      const p = getPassage(tileset, t), pr = getPriority(tileset, t);
      return (p === 0 || p === null) && (pr === 0 || pr === null);
    }, 5);
    if (mc.length > 0) return mc[0];
  }
  return buildRegularTileIds(tileset).find((t) => t !== baseTile) ?? null;
}

// --- Layer manipulation ---

function fillLayer(layer: number[][], tile: number) {
  for (const row of layer) for (let x = 0; x < row.length; x += 1) row[x] = tile;
}

function clearLayer(layer: number[][]) { fillLayer(layer, 0); }

function clearLayerArea(layer: number[][], coords: Array<[number, number]>) {
  if (!layer || coords.length === 0) return;
  const h = layer.length, w = layer[0]?.length || 0;
  for (const [x, y] of coords) { if (y >= 0 && y < h && x >= 0 && x < w) layer[y][x] = 0; }
}

function setTile(layer: number[][], x: number, y: number, tile: number, thickness: number) {
  const h = layer.length, w = layer[0]?.length || 0, half = Math.floor(thickness / 2);
  for (let dy = -half; dy <= half; dy += 1) for (let dx = -half; dx <= half; dx += 1) {
    const ny = y + dy, nx = x + dx;
    if (ny >= 0 && ny < h && nx >= 0 && nx < w) layer[ny][nx] = tile;
  }
}

function carvePath(layer: number[][], pathTile: number) {
  if (!pathTile) return;
  const h = layer.length, w = layer[0]?.length || 0;
  for (let y = 3; y < h - 3; y += 1) {
    const offset = Math.round(Math.sin(y / 6) * 6);
    setTile(layer, Math.floor(w / 2) + offset, y, pathTile, 4);
  }
}

function carvePond(layer: number[][], waterTile: number): Array<[number, number]> {
  if (!waterTile) return [];
  const h = layer.length, w = layer[0]?.length || 0;
  const cx = Math.floor(w * 0.7), cy = Math.floor(h * 0.35);
  const rx = Math.max(4, Math.floor(w * 0.18)), ry = Math.max(4, Math.floor(h * 0.12));
  const affected: Array<[number, number]> = [];
  for (let y = cy - ry; y <= cy + ry; y += 1) for (let x = cx - rx; x <= cx + rx; x += 1) {
    if (x < 0 || y < 0 || y >= h || x >= w) continue;
    const dx = (x - cx) / rx, dy = (y - cy) / ry;
    if (dx * dx + dy * dy <= 1) { layer[y][x] = waterTile; affected.push([x, y]); }
  }
  return affected;
}

function applyEditsToLayers(layers: number[][][], edits: Array<{ x: number; y: number; z: number; tile: number }>): number[][][] {
  const cloned = cloneLayers(layers);
  const h = cloned[0]?.length || 0, w = cloned[0]?.[0]?.length || 0;
  let applied = 0, skipped = 0;
  for (const edit of edits) {
    if (!edit) { skipped++; continue; }
    const { x, y, z, tile } = edit;
    if (z < 0 || z > 2 || x < 0 || y < 0 || x >= w || y >= h || typeof tile !== 'number' || tile < 0) { skipped++; continue; }
    cloned[z][y][x] = tile;
    applied++;
  }
  console.log(`[applyEditsToLayers] Applied ${applied} edits, skipped ${skipped} invalid edits`);
  return cloned;
}

function extractTilePlan(response: any): { name?: string; edits?: Array<{ x: number; y: number; z: number; tile: number }>; notes?: string } | null {
  if (!response) return null;
  if (response.tilePlan) return response.tilePlan;
  const text = typeof response.text === 'string' ? response.text.trim() : typeof response === 'string' ? response.trim() : '';
  if (!text) return null;
  try { const p = JSON.parse(text); if (p.tilePlan) return p.tilePlan; if (p.edits) return p; } catch {
    console.log('[extractTilePlan] Direct parse failed, trying fallback methods...');
  }
  const allEdits: Array<{ x: number; y: number; z: number; tile: number }> = [];
  const re = /\{"x":\s*(\d+),\s*"y":\s*(\d+),\s*"z":\s*([012]),\s*"tile":\s*(\d+)\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    allEdits.push({ x: parseInt(m[1], 10), y: parseInt(m[2], 10), z: parseInt(m[3], 10), tile: parseInt(m[4], 10) });
  }
  if (allEdits.length > 0) {
    const nameMatch = text.match(/"name":\s*"([^"]+)"/);
    console.log(`[extractTilePlan] Extracted ${allEdits.length} edits from response (may be truncated)`);
    return { name: nameMatch?.[1] || 'AI Generated Map', edits: allEdits, notes: 'Extracted from response (may be truncated)' };
  }
  const js = text.indexOf('{'), je = text.lastIndexOf('}');
  if (js !== -1 && je > js) {
    try { const p = JSON.parse(text.slice(js, je + 1)); if (p.tilePlan) return p.tilePlan; if (p.edits) return p; } catch { /* skip */ }
  }
  console.error('[extractTilePlan] Failed to extract tile plan from response');
  return null;
}

function getEditsBounds(edits: Array<{ x: number; y: number }>) {
  if (!edits.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of edits) { minX = Math.min(minX, e.x); minY = Math.min(minY, e.y); maxX = Math.max(maxX, e.x); maxY = Math.max(maxY, e.y); }
  return { minX, minY, maxX, maxY };
}

// --- Test map generators ---

function createSanityTestMap(
  mapId: number,
  templateMap: TemplateMapShape,
  tileset: { autotileNames: string[]; passages?: number[]; priorities?: number[] } | undefined
) {
  const layers = cloneLayers(templateMap.layers);
  const baseTile = findTopTiles(layers[0], 10)[0];
  if (!baseTile) throw new Error('Sanity check failed: no base tile candidates found.');
  const pathTile = pickPathTileFromTileset(tileset, baseTile, layers[0]);
  if (!pathTile) throw new Error('Sanity check failed: no valid path tile found.');
  const waterTile = selectWaterTile(layers[0], tileset);
  if (!waterTile) throw new Error('Sanity check failed: no valid water tile found.');

  fillLayer(layers[0], baseTile);
  clearLayer(layers[1]);
  clearLayer(layers[2]);
  carvePath(layers[0], pathTile);
  const pondTiles = carvePond(layers[0], waterTile);
  clearLayerArea(layers[1], pondTiles);
  clearLayerArea(layers[2], pondTiles);

  return {
    mapData: { id: mapId, name: 'POC Sanity Test', width: templateMap.width, height: templateMap.height, tilesetId: templateMap.tilesetId, layers, events: [] },
    debug: { baseTile, pathTile, waterTile, description: `Sanity test: Base tile ${baseTile} fills map, path tile ${pathTile} creates wavy path, water tile ${waterTile} creates elliptical pond at 70% width, 35% height` }
  };
}

async function createAiTestMap(
  mapId: number,
  templateMap: TemplateMapShape,
  tileset: { autotileNames: string[]; passages?: number[]; priorities?: number[] } | undefined,
  projectPath: string
) {
  if (!aiService) throw new Error('AI is not configured. Please set an API key.');

  const baseCandidates = findTopTiles(templateMap.layers[0], 12);
  const pathCandidates = findCandidateTiles(templateMap.layers[0], (tile) => {
    const p = getPassage(tileset, tile), pr = getPriority(tileset, tile);
    return (p === 0 || p === null) && (pr === 0 || pr === null);
  }, 12);
  const elevationCandidates = findCandidateTiles(templateMap.layers[0], (tile) => {
    const pr = getPriority(tileset, tile); return pr !== null && pr >= 1;
  }, 12);
  const decorCandidates = findTopTiles(templateMap.layers[1], 8);
  const stairCandidates = findTopTiles(templateMap.layers[1], 12);
  const waterCandidates = buildWaterCandidates(templateMap.layers[0], tileset);

  const timestamp = Date.now();
  const randomSeed = Math.floor(Math.random() * 10000);

  const aiPrompt = `
You are designing a Pokemon game map for RPG Maker XP. Generate a CREATIVE and VARIED map edit plan.

IMPORTANT: This is request #${timestamp} with random seed ${randomSeed}. Create a UNIQUE design that differs from previous requests.

Return JSON ONLY with this exact shape (no extra keys, no markdown):
{
  "tilePlan": {
    "name": string,
    "edits": Array<{ "x": number, "y": number, "z": 0|1|2, "tile": number }>,
    "notes": string
  }
}

Design Guidelines:
- Create INTERESTING patterns: winding paths, irregular water features, elevation changes
- IMPORTANT: Spread edits across the ENTIRE map area (0-${templateMap.width - 1} width, 0-${templateMap.height - 1} height)
- Don't cluster all edits in one small area - distribute them across different regions
- Use different layers strategically: layer 0 for base terrain, layer 1 for decorations/elevation, layer 2 for overlays
- Make paths that curve and wind across the map, connecting different areas
- Create water features (ponds, rivers) with organic shapes that span multiple areas
- CRITICAL: Keep edits to 30-80 maximum, but spread them across the map dimensions
- Use coordinates that cover the full map range - don't just edit a small corner
- Use compact JSON format - minimize whitespace in your response

Technical Rules:
- Edits modify the existing map in place (do not output a full map).
- Use ONLY tile IDs from the candidate lists below.
- Coordinates: x (0 to ${templateMap.width - 1}), y (0 to ${templateMap.height - 1}), z (0, 1, or 2)
- Each edit must have valid coordinates within map bounds
- CRITICAL: Distribute edits across the FULL map range:
  * Use x coordinates from 0 to ${templateMap.width - 1} (not just one small area)
  * Use y coordinates from 0 to ${templateMap.height - 1} (not just one small area)
  * Create features in different regions: top-left, top-right, bottom-left, bottom-right, center
  * Example: If map is ${templateMap.width}x${templateMap.height}, spread edits across all quadrants

Available Tile Candidates:
baseCandidates: ${JSON.stringify(baseCandidates)} - Use for base terrain
pathCandidates: ${JSON.stringify(pathCandidates)} - Use for walkable paths
waterCandidates: ${JSON.stringify(waterCandidates)} - Use for water features
decorCandidates: ${JSON.stringify(decorCandidates)} - Use for decorative elements
elevationCandidates: ${JSON.stringify(elevationCandidates)} - Use for elevated terrain
stairCandidates: ${JSON.stringify(stairCandidates)} - Use for stairs/transitions

Map dimensions: ${templateMap.width} tiles wide × ${templateMap.height} tiles tall
Tileset ID: ${templateMap.tilesetId}

Be CREATIVE and make each design UNIQUE!
`.trim();

  const response = await aiService.chat(aiPrompt, { projectPath });
  console.log('[AI Test] Raw response:', JSON.stringify(response, null, 2));
  const plan = extractTilePlan(response);
  if (!plan) throw new Error('Sanity check failed: AI did not return JSON.');
  console.log('[AI Test] Extracted plan:', JSON.stringify(plan, null, 2));
  if (!plan?.edits || !Array.isArray(plan.edits)) throw new Error('AI did not return edits array.');

  const editsBounds = getEditsBounds(plan.edits);
  if (!editsBounds) throw new Error('AI returned empty edits.');

  const editArea = (editsBounds.maxX - editsBounds.minX + 1) * (editsBounds.maxY - editsBounds.minY + 1);
  const mapArea = templateMap.width * templateMap.height;
  const coveragePercent = (editArea / mapArea) * 100;
  console.log(`[AI Test] Edit coverage: ${coveragePercent.toFixed(1)}% of map (${editArea} tiles out of ${mapArea})`);
  console.log(`[AI Test] Edit bounds: x(${editsBounds.minX}-${editsBounds.maxX}), y(${editsBounds.minY}-${editsBounds.maxY})`);
  if (coveragePercent < 5) console.warn(`[AI Test] WARNING: Edits are very clustered (only ${coveragePercent.toFixed(1)}% of map).`);

  console.log('[AI Test] Applying', plan.edits.length, 'edits to map');
  console.log('[AI Test] Sample edits (first 10):', JSON.stringify(plan.edits.slice(0, 10), null, 2));

  const editsByLayer: Record<number, number> = { 0: 0, 1: 0, 2: 0 };
  const editsByTile = new Map<number, number>();
  for (const edit of plan.edits) {
    if (edit && typeof edit.z === 'number' && edit.z >= 0 && edit.z <= 2) editsByLayer[edit.z]++;
    if (edit && typeof edit.tile === 'number') editsByTile.set(edit.tile, (editsByTile.get(edit.tile) || 0) + 1);
  }
  console.log('[AI Test] Edits by layer:', editsByLayer);
  console.log('[AI Test] Top 10 most used tiles:', Array.from(editsByTile.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([tile, count]) => `Tile ${tile}: ${count} edits`));

  console.log('[AI Test] Template map sample before edits - layers[0][0][0:5]:', templateMap.layers[0][0].slice(0, 5));
  console.log('[AI Test] Template map sample before edits - layers[0][10][0:5]:', templateMap.layers[0][10].slice(0, 5));
  const modifiedLayers = applyEditsToLayers(templateMap.layers, plan.edits);
  console.log('[AI Test] Modified map sample after edits - layers[0][0][0:5]:', modifiedLayers[0][0].slice(0, 5));
  console.log('[AI Test] Modified map sample after edits - layers[0][10][0:5]:', modifiedLayers[0][10].slice(0, 5));
  console.log('[AI Test] Edits applied successfully');

  return {
    mapData: { id: mapId, name: plan.name || 'POC AI Tests', width: templateMap.width, height: templateMap.height, tilesetId: templateMap.tilesetId, layers: modifiedLayers, events: [] },
    debug: { notes: plan?.notes, editsCount: plan.edits.length, editsBounds, sampleEdits: plan.edits.slice(0, 5) }
  };
}

// --- Object placement test ---

function buildObjectPlacementPrompt(blocks: TileBlock[], templateMap: { width: number; height: number }, groundTile: number): string {
  const labels = 'ABCDEFGHIJ';
  let desc = '';
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i], l = labels[i] || `${i}`;
    desc += `\nObject ${l} (${b.width}x${b.height}, layer ${b.layer}, seen ${b.occurrences}x in map):\n`;
    desc += `  Grid layout (tile IDs row by row):\n`;
    for (let dy = 0; dy < b.height; dy++) {
      const rowTiles = b.tiles.filter(t => t.dy === dy).sort((a, c) => a.dx - c.dx).map(t => t.tileId);
      desc += `    y+${dy}: [${rowTiles.join(', ')}]\n`;
    }
    desc += `  To place at anchor (X, Y), emit these edits:\n`;
    for (const t of b.tiles) desc += `    {"x":X+${t.dx},"y":Y+${t.dy},"z":${b.layer},"tile":${t.tileId}}\n`;
  }
  return `You are a map editor for a Pokemon RPG Maker XP game. Your ONLY task is to place COMPLETE multi-tile objects on the map.

CRITICAL RULES:
- Each object is made of multiple tiles that MUST ALL be placed together
- A single missing or misplaced tile breaks the visual object
- You must emit ALL tiles for each object, with correct relative positions
- NEVER place random individual tiles - always place complete objects

Return JSON ONLY (no markdown, no commentary):
{
  "tilePlan": {
    "name": "Object Placement Test",
    "edits": [{"x":number,"y":number,"z":0|1|2,"tile":number}, ...],
    "notes": "Brief description of placements"
  }
}

AVAILABLE OBJECTS (multi-tile blocks extracted from the tileset):
${desc}
TASK: Place exactly 3 complete objects on the map.
- You may reuse the same object type or mix different types
- Each placed object MUST include ALL of its tiles with correct relative offsets
- Map bounds: x 0-${templateMap.width - 1}, y 0-${templateMap.height - 1}
- Leave at least 2 tiles margin from map edges
- Space objects at least 4 tiles apart
- Choose positions in the middle area for visibility
- Total edits = sum of tiles in all 3 objects (e.g., three 2x2 objects = 12 edits)

Example: To place Object A at position (10, 20), substitute X=10, Y=20 into Object A's edit templates.`.trim();
}

function validateObjectEdits(edits: Array<{ x: number; y: number; z: number; tile: number }>, availableBlocks: TileBlock[]) {
  const errors: string[] = [];
  let objectsFound = 0;
  const usedEdits = new Set<number>();
  for (let i = 0; i < edits.length; i++) {
    if (usedEdits.has(i)) continue;
    let matched = false;
    for (const block of availableBlocks) {
      for (const anchorTile of block.tiles) {
        if (edits[i].tile !== anchorTile.tileId || edits[i].z !== block.layer) continue;
        const baseX = edits[i].x - anchorTile.dx, baseY = edits[i].y - anchorTile.dy;
        const matchIndices: number[] = [];
        let allFound = true;
        for (const expected of block.tiles) {
          const idx = edits.findIndex((e, j) => !usedEdits.has(j) && e.x === baseX + expected.dx && e.y === baseY + expected.dy && e.z === block.layer && e.tile === expected.tileId);
          if (idx === -1) { allFound = false; break; }
          matchIndices.push(idx);
        }
        if (allFound && matchIndices.length === block.tiles.length) {
          objectsFound++;
          matchIndices.forEach(idx => usedEdits.add(idx));
          matched = true;
          console.log(`[Object Test] Matched object "${block.id}" at base (${baseX}, ${baseY})`);
          break;
        }
      }
      if (matched) break;
    }
  }
  const unusedCount = edits.length - usedEdits.size;
  if (unusedCount > 0) errors.push(`${unusedCount} of ${edits.length} edits don't form complete objects (${usedEdits.size} matched to ${objectsFound} objects)`);
  if (objectsFound === 0) errors.push('No complete objects were detected in the edits');
  return { valid: objectsFound >= 1 && unusedCount === 0, objectsFound, errors };
}

async function createObjectTestMap(
  mapId: number,
  templateMap: TemplateMapShape,
  tileset: { autotileNames: string[]; passages?: number[]; priorities?: number[] } | undefined,
  projectPath: string
) {
  if (!aiService) throw new Error('AI is not configured. Please set an API key.');
  let blocks = extractTileBlocks(templateMap.layers);
  console.log(`[Object Test] Found ${blocks.length} unique 2x2 tile blocks in template map`);
  if (blocks.length === 0) {
    const pairs = extractTilePairs(templateMap.layers);
    console.log(`[Object Test] No 2x2 blocks found. Found ${pairs.length} tile pairs as fallback.`);
    if (pairs.length === 0) throw new Error('Object test failed: no multi-tile objects found in template map.');
    blocks = pairs;
  }

  const topBlocks = blocks.slice(0, 5);
  console.log(`[Object Test] Using top ${topBlocks.length} objects for AI prompt:`);
  for (const block of topBlocks) console.log(`  ${block.id}: ${block.width}x${block.height} on layer ${block.layer}, ${block.occurrences} occurrences, tiles=[${block.tiles.map(t => t.tileId).join(', ')}]`);

  const groundTile = findTopTiles(templateMap.layers[0], 3)[0] || 384;
  const prompt = buildObjectPlacementPrompt(topBlocks, templateMap, groundTile);
  console.log(`[Object Test] Prompt length: ${prompt.length} chars`);

  const response = await aiService.chat(prompt, { projectPath });
  console.log('[Object Test] Raw AI response:', JSON.stringify(response, null, 2));
  const plan = extractTilePlan(response);
  if (!plan?.edits || !Array.isArray(plan.edits) || plan.edits.length === 0) throw new Error('Object test failed: AI did not return valid edits.');

  console.log(`[Object Test] AI returned ${plan.edits.length} edits`);
  for (const edit of plan.edits) console.log(`  (${edit.x}, ${edit.y}, z=${edit.z}) tile=${edit.tile}`);

  const validation = validateObjectEdits(plan.edits, topBlocks);
  console.log(`[Object Test] Validation result: ${validation.objectsFound} complete objects, valid=${validation.valid}`);
  for (const err of validation.errors) console.warn(`[Object Test] Validation: ${err}`);

  const modifiedLayers = applyEditsToLayers(templateMap.layers, plan.edits);
  return {
    mapData: { id: mapId, name: plan.name || 'Object Placement Test', width: templateMap.width, height: templateMap.height, tilesetId: templateMap.tilesetId, layers: modifiedLayers, events: [] },
    debug: { notes: plan.notes, editsCount: plan.edits.length, objectsAvailable: topBlocks.length, objectsPlaced: validation.objectsFound, validationPassed: validation.valid, validationErrors: validation.errors, coherenceScore: `${validation.objectsFound}/3 complete objects (${plan.edits.length} total edits)` }
  };
}

// --- File path helpers ---

function resolveTilesetImagePath(projectPath: string, tilesetName: string): string {
  const base = path.join(projectPath, 'Graphics', 'Tilesets', tilesetName);
  if (fs.existsSync(`${base}.png`)) return `${base}.png`;
  if (fs.existsSync(`${base}.bmp`)) return `${base}.bmp`;
  return base;
}

function resolveAutotileImagePath(projectPath: string, autotileName: string): string {
  const base = path.join(projectPath, 'Graphics', 'Autotiles', autotileName);
  if (fs.existsSync(`${base}.png`)) return `${base}.png`;
  if (fs.existsSync(`${base}.bmp`)) return `${base}.bmp`;
  return base;
}

function resolveCharacterImagePath(projectPath: string, characterName: string): string {
  const base = path.join(projectPath, 'Graphics', 'Characters', characterName);
  if (fs.existsSync(`${base}.png`)) return `${base}.png`;
  if (fs.existsSync(`${base}.bmp`)) return `${base}.bmp`;
  return base;
}

function toFileUrl(filePath: string): string {
  try { return pathToFileURL(filePath).toString(); }
  catch { return `file://${filePath.replace(/\\/g, '/')}`; }
}

function toDataUrl(filePath: string): string {
  try {
    if (!fs.existsSync(filePath)) return '';
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.bmp' ? 'image/bmp' : 'image/png';
    return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
  } catch { return ''; }
}

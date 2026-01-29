import { ipcMain, dialog, app, shell } from 'electron';
import { IAIService, AIProvider } from './ai-service-base';
import { AIServiceFactory } from './ai-service-factory';
import { ProjectService } from './project-service';
import { MapGenerator } from './map-generator';
import { MapSpec, TilesetInspectorData } from '../shared/types';
import * as path from 'path';
import { pathToFileURL } from 'url';
import * as fs from 'fs-extra';
import express from 'express';
import cors from 'cors';

function getConfigPath(): string {
  // app.getPath can only be called after app is ready
  // Use a fallback if app is not ready yet
  try {
    return path.join(app.getPath('userData'), 'config.json');
  } catch (e) {
    // Fallback to a temp directory if app is not ready
    return path.join(process.env.TEMP || process.cwd(), 'config.json');
  }
}

interface AIConfig {
  useClaude?: boolean; // true = Claude, false/undefined = Gemini
  claudeApiKey?: string;
  geminiApiKey?: string;
  modelName?: string; // Model name for the selected provider
}

function loadConfig(): AIConfig {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      return fs.readJsonSync(configPath);
    }
  } catch (err) {
    console.error('Failed to load config:', err);
  }
  return {};
}

function saveConfig(config: AIConfig) {
  try {
    const configPath = getConfigPath();
    fs.writeJsonSync(configPath, config);
  } catch (err) {
    console.error('Failed to save config:', err);
  }
}

function getCurrentProvider(config: AIConfig): AIProvider {
  return config.useClaude ? 'claude' : 'gemini';
}

function getCurrentApiKey(config: AIConfig, provider: AIProvider): string {
  return AIServiceFactory.getApiKey(provider, config);
}

function createAIService(config: AIConfig): IAIService | null {
  const provider = getCurrentProvider(config);
  const apiKey = getCurrentApiKey(config, provider);
  
  if (!apiKey) {
    console.log(`No API key found for provider: ${provider}`);
    console.log(`Config keys:`, {
      useClaude: config.useClaude,
      hasClaudeKey: !!config.claudeApiKey,
      hasGeminiKey: !!config.geminiApiKey
    });
    return null;
  }

  console.log(`Creating ${provider} service with API key: ${apiKey.substring(0, 10)}...`);
  try {
    const service = AIServiceFactory.create(provider, apiKey, config.modelName);
    console.log(`Successfully created ${provider} service`);
    return service;
  } catch (err: any) {
    console.error(`Failed to create ${provider} service:`, err);
    return null;
  }
}

let config: AIConfig = loadConfig();
let aiService: IAIService | null = createAIService(config);
const mapGenerator = new MapGenerator();

// --- HTTP API for Browser Support ---
const api = express();
api.use(cors());
api.use(express.json());

api.get('/api/config/key', (req, res) => {
  const provider = getCurrentProvider(config);
  const apiKey = getCurrentApiKey(config, provider);
  res.json({ apiKey, provider });
});

api.get('/api/config/has-key', (req, res) => {
  const provider = getCurrentProvider(config);
  const apiKey = getCurrentApiKey(config, provider);
  res.json({ hasKey: !!apiKey });
});

api.post('/api/config/key', (req, res) => {
  const { apiKey: newApiKey, provider: providerParam } = req.body;
  const provider = providerParam || getCurrentProvider(config);
  
  if (provider === 'claude') {
    config.claudeApiKey = newApiKey;
  } else {
    config.geminiApiKey = newApiKey;
  }
  saveConfig(config);
  aiService = createAIService(config);
  res.json({ success: true });
});

api.get('/api/config/provider', (req, res) => {
  res.json({ provider: getCurrentProvider(config) });
});

api.post('/api/config/provider', (req, res) => {
  const { useClaude } = req.body;
  config.useClaude = useClaude;
  saveConfig(config);
  aiService = createAIService(config);
  res.json({ success: true, provider: getCurrentProvider(config) });
});

api.post('/api/config/model', (req, res) => {
  const { modelName } = req.body;
  console.log(`Setting active model to: ${modelName}`);
  config.modelName = modelName;
  saveConfig(config);
  aiService = createAIService(config);
  res.json({ success: true });
});

api.get('/api/ping', async (req, res) => {
  if (!aiService) {
    res.json({ success: false, error: 'No API key configured' });
    return;
  }
  const result = await aiService.ping();
  res.json(result);
});

api.get('/api/stub/map-spec', (req, res) => {
  res.json(getStubMapSpec());
});

api.post('/api/compile-map-spec', async (req, res) => {
  const { projectPath, spec } = req.body;
  const result = await handleCompileMapSpec(projectPath, spec);
  res.json(result);
});

// --- Read Project Data Endpoints ---
api.get('/api/read-map/:mapId', async (req, res) => {
  const projectPath = req.query.projectPath as string;
  const mapId = parseInt(req.params.mapId);
  const result = await handleReadMap(projectPath, mapId);
  res.json(result);
});

api.get('/api/read-map-infos', async (req, res) => {
  const projectPath = req.query.projectPath as string;
  const result = await handleReadMapInfos(projectPath);
  res.json(result);
});

api.get('/api/read-tilesets', async (req, res) => {
  const projectPath = req.query.projectPath as string;
  const result = await handleReadTilesets(projectPath);
  res.json(result);
});

api.get('/api/read-system', async (req, res) => {
  const projectPath = req.query.projectPath as string;
  const result = await handleReadSystem(projectPath);
  res.json(result);
});

api.get('/api/read-project-context', async (req, res) => {
  const projectPath = req.query.projectPath as string;
  const result = await handleReadProjectContext(projectPath);
  res.json(result);
});

// --- Tileset Inspector Endpoint ---
api.get('/api/tileset-inspector', async (req, res) => {
  const projectPath = req.query.projectPath as string;
  const mapName = (req.query.mapName as string) || 'Route 2';
  const result = await handleTilesetInspector(projectPath, mapName);
  res.json(result);
});

api.get('/api/debug-list-models', async (req, res) => {
  if (!aiService) {
    res.json({ error: 'No API key configured' });
    return;
  }
  try {
    const models = await aiService.listModels();
    res.json(models);
  } catch (err: any) {
    res.json({ error: err.message });
  }
});

api.get('/api/select-directory', async (req, res) => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });
  res.json({ path: result.filePaths[0] });
});

api.post('/api/init-project', async (req, res) => {
  const { projectPath } = req.body;
  const success = await handleInitProject(projectPath);
  res.json({ success });
});

api.post('/api/chat', async (req, res) => {
  const { message, projectPath } = req.body;
  const response = await handleAIChat(message, projectPath);
  res.json(response);
});

const PORT = 3001;
api.listen(PORT, () => {
  console.log(`Bridge API running at http://localhost:${PORT}`);
});

// --- Helper functions to share logic between IPC and HTTP ---

async function handleInitProject(projectPath: string) {
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
      if (!fs.existsSync(fullPath)) {
        await fs.ensureDir(fullPath);
      }
    }

    const gameExePath = path.join(projectPath, 'Game.exe');
    if (!fs.existsSync(gameExePath)) {
      await fs.writeFile(gameExePath, '');
    }

    const gameIniPath = path.join(projectPath, 'Game.ini');
    if (!fs.existsSync(gameIniPath)) {
      const iniContent = `[Game]\r\nLibrary=RGSS104E.dll\r\nScripts=Data\\Scripts.rxdata\r\nTitle=New Pokemon Game\r\nRTP1=\r\nRTP2=\r\nRTP3=`;
      await fs.writeFile(gameIniPath, iniContent);
    }
    
    return true;
  } catch (error) {
    console.error('Failed to init project:', error);
    return false;
  }
}

async function handleAIChat(message: string, projectPath: string) {
  if (!aiService) {
    const provider = getCurrentProvider(config);
    return { text: `Please set your ${provider === 'claude' ? 'Claude' : 'Gemini'} API key.` };
  }

  if (!projectPath) {
    return { text: "Please select a Pokemon Essentials project first." };
  }

  const projectService = new ProjectService(projectPath);
  if (!projectService.isValidProject()) {
    return { text: "The selected directory does not appear to be a valid Pokemon Essentials project." };
  }

  const context = { projectPath };

  try {
    const response = await aiService.chat(message, context);
    
    if (response.mapData) {
      const nextId = await projectService.getNextMapId();
      response.mapData.id = nextId;
      
      try {
        await mapGenerator.generateMapFile(projectPath, nextId, response.mapData);
        response.text += `\n\nGenerated map "${response.mapData.name}" as Map${nextId.toString().padStart(3, '0')}.rxdata.`;
      } catch (err: any) {
        response.text += `\n\nFailed to generate map file: ${err.message}`;
      }
    }

    return response;
  } catch (error: any) {
    return { text: `Error: ${error.message}` };
  }
}

function getStubMapSpec(): MapSpec {
  // RPG Maker XP tile ID ranges:
  // 0 = empty/transparent
  // 48-383 = autotiles (7 slots × 48 patterns each)
  // 384+ = regular tileset tiles
  //
  // For Essentials outdoor tileset (id 1):
  // - Autotile 0 (48-95): water
  // - Autotile 1 (96-143): grass
  // - Regular tiles start at 384
  //
  // Now that maps are cloned safely, we can use real tiles again
  return {
    name: 'POC Meadow',
    width: 20,
    height: 15,
    tilesetId: 1,
    groundTileId: 384,  // First regular tileset tile (grass in Essentials outdoor)
    waterTileId: 48,    // Water autotile base
    waterRegions: [{ x: 6, y: 6, width: 4, height: 3 }],
    events: [],         // Keep events off until tiles are confirmed stable
    patchTiles: true
  };
}

async function handleCompileMapSpec(projectPath: string, spec: MapSpec) {
  if (!projectPath) {
    return { success: false, error: 'Please select a Pokemon Essentials project first.' };
  }

  const projectService = new ProjectService(projectPath);
  if (!projectService.isValidProject()) {
    return { success: false, error: 'The selected directory does not appear to be a valid Pokemon Essentials project.' };
  }

  if (!spec || !spec.name) {
    return { success: false, error: 'Invalid map spec.' };
  }

  try {
    const nextId = await projectService.getNextMapId();
    let mapData = mapGenerator.compileMapSpec(nextId, spec);
    const mapFiles = await projectService.getMapList();
    const mapIds = mapFiles
      .map((file) => parseInt(file.match(/\d+/)?.[0] || '0', 10))
      .filter((id) => id > 0)
      .sort((a, b) => a - b);

    if (mapIds.length > 0) {
      let templateMapId = mapIds[0];
      let templateMapData: { tilesetId: number; layers: number[][][] } | null = null;

      for (const candidateId of mapIds) {
        try {
          const candidateMap = await mapGenerator.readMap(projectPath, candidateId);
          if (candidateMap.tilesetId === mapData.tilesetId) {
            templateMapId = candidateId;
            templateMapData = candidateMap;
            break;
          }
        } catch {
          // Ignore read failures and keep searching
        }
      }

      if (templateMapData) {
        const safeGround = findFirstNonZeroTile(templateMapData.layers) ?? 0;
        const safeSpec: MapSpec = {
          ...spec,
          tilesetId: templateMapData.tilesetId,
          groundTileId: safeGround,
          waterTileId: safeGround,
          waterRegions: [],
          events: []
        };
        mapData = mapGenerator.compileMapSpec(nextId, safeSpec);
      }

      await mapGenerator.cloneMapFile(projectPath, templateMapId, nextId);
      if (spec.patchTiles !== false) {
        await mapGenerator.patchMapData(projectPath, nextId, mapData);
      }
    } else {
      await mapGenerator.generateMapFile(projectPath, nextId, mapData);
    }
    await mapGenerator.registerMapInInfos(projectPath, nextId, mapData.name);
    return { success: true, mapId: nextId, mapData };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to compile map spec.' };
  }
}

// --- Read Project Data Handlers ---

function findFirstNonZeroTile(layers: number[][][]): number | null {
  if (!layers || layers.length === 0) return null;
  for (const layer of layers) {
    for (const row of layer) {
      for (const tile of row) {
        if (tile && tile > 0) return tile;
      }
    }
  }
  return null;
}

async function handleReadMap(projectPath: string, mapId: number) {
  if (!projectPath) {
    return { success: false, error: 'Project path is required.' };
  }
  if (!mapId || mapId < 1) {
    return { success: false, error: 'Valid map ID is required.' };
  }

  try {
    const data = await mapGenerator.readMap(projectPath, mapId);
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to read map.' };
  }
}

async function handleReadMapInfos(projectPath: string) {
  if (!projectPath) {
    return { success: false, error: 'Project path is required.' };
  }

  try {
    const data = await mapGenerator.readMapInfos(projectPath);
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to read map infos.' };
  }
}

async function handleReadTilesets(projectPath: string) {
  if (!projectPath) {
    return { success: false, error: 'Project path is required.' };
  }

  try {
    const data = await mapGenerator.readTilesets(projectPath);
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to read tilesets.' };
  }
}

async function handleReadSystem(projectPath: string) {
  if (!projectPath) {
    return { success: false, error: 'Project path is required.' };
  }

  try {
    const data = await mapGenerator.readSystem(projectPath);
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to read system data.' };
  }
}

async function handleReadProjectContext(projectPath: string) {
  if (!projectPath) {
    return { success: false, error: 'Project path is required.' };
  }

  const projectService = new ProjectService(projectPath);
  if (!projectService.isValidProject()) {
    return { success: false, error: 'The selected directory does not appear to be a valid Pokemon Essentials project.' };
  }

  try {
    const [mapInfos, tilesets, system] = await Promise.all([
      mapGenerator.readMapInfos(projectPath).catch(() => ({})),
      mapGenerator.readTilesets(projectPath).catch(() => []),
      mapGenerator.readSystem(projectPath).catch(() => null)
    ]);

    return {
      success: true,
      data: {
        projectPath,
        mapInfos,
        tilesets,
        system
      }
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to read project context.' };
  }
}

async function handleTilesetInspector(projectPath: string, mapName: string) {
  if (!projectPath) {
    return { success: false, error: 'Project path is required.' };
  }

  try {
    const mapInfos = await mapGenerator.readMapInfos(projectPath);
    const mapEntry = Object.values(mapInfos).find(
      (info) => info.name.toLowerCase() === mapName.toLowerCase()
    );

    if (!mapEntry) {
      return { success: false, error: `Map "${mapName}" not found in MapInfos.` };
    }

    const map = await mapGenerator.readMap(projectPath, mapEntry.id);
    const tilesets = await mapGenerator.readTilesets(projectPath);
    const tileset = tilesets.find((t) => t.id === map.tilesetId);

    if (!tileset) {
      return { success: false, error: `Tileset ${map.tilesetId} not found.` };
    }

    const tilesetImagePath = resolveTilesetImagePath(projectPath, tileset.tilesetName);
    const autotileImagePaths = tileset.autotileNames
      .filter((name) => !!name)
      .map((name) => resolveAutotileImagePath(projectPath, name));

    const tilesetImageUrl = toFileUrl(tilesetImagePath);
    const autotileImageUrls = autotileImagePaths.map((p) => toFileUrl(p));
    const tilesetImageDataUrl = toDataUrl(tilesetImagePath);
    const autotileImageDataUrls = autotileImagePaths.map((p) => toDataUrl(p));

    const data: TilesetInspectorData = {
      mapName: mapEntry.name,
      mapId: mapEntry.id,
      tilesetId: map.tilesetId,
      tilesetName: tileset.tilesetName,
      tilesetImagePath,
      tilesetImageUrl,
      tilesetImageDataUrl,
      autotileImagePaths,
      autotileImageUrls,
      autotileImageDataUrls,
      tileWidth: 32,
      tileHeight: 32
    };

    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to load tileset inspector data.' };
  }
}

function resolveTilesetImagePath(projectPath: string, tilesetName: string): string {
  const base = path.join(projectPath, 'Graphics', 'Tilesets', tilesetName);
  const png = `${base}.png`;
  const bmp = `${base}.bmp`;
  if (fs.existsSync(png)) return png;
  if (fs.existsSync(bmp)) return bmp;
  return base;
}

function resolveAutotileImagePath(projectPath: string, autotileName: string): string {
  const base = path.join(projectPath, 'Graphics', 'Autotiles', autotileName);
  const png = `${base}.png`;
  const bmp = `${base}.bmp`;
  if (fs.existsSync(png)) return png;
  if (fs.existsSync(bmp)) return bmp;
  return base;
}

function toFileUrl(filePath: string): string {
  try {
    return pathToFileURL(filePath).toString();
  } catch {
    return `file://${filePath.replace(/\\/g, '/')}`;
  }
}

function toDataUrl(filePath: string): string {
  try {
    if (!fs.existsSync(filePath)) return '';
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.bmp' ? 'image/bmp' : 'image/png';
    const data = fs.readFileSync(filePath);
    return `data:${mime};base64,${data.toString('base64')}`;
  } catch {
    return '';
  }
}

// --- Traditional IPC Handlers (keeping them for backwards compatibility/internal use) ---

ipcMain.handle('get-api-key', () => {
  const provider = getCurrentProvider(config);
  return getCurrentApiKey(config, provider);
});

ipcMain.handle('has-api-key', () => {
  const provider = getCurrentProvider(config);
  const apiKey = getCurrentApiKey(config, provider);
  return !!apiKey;
});

ipcMain.handle('set-api-key', (event, newApiKey, provider?: AIProvider) => {
  const targetProvider = provider || getCurrentProvider(config);
  if (targetProvider === 'claude') {
    config.claudeApiKey = newApiKey;
  } else {
    config.geminiApiKey = newApiKey;
  }
  saveConfig(config);
  aiService = createAIService(config);
  return true;
});

ipcMain.handle('set-ai-provider', (event, useClaude: boolean) => {
  config.useClaude = useClaude;
  saveConfig(config);
  aiService = createAIService(config);
  return { provider: getCurrentProvider(config) };
});

ipcMain.handle('get-ai-provider', () => {
  return getCurrentProvider(config);
});

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });
  return result.filePaths[0];
});

ipcMain.handle('init-project', async (event, projectPath) => {
  return handleInitProject(projectPath);
});

ipcMain.handle('ai-chat', async (event, { message, projectPath }) => {
  return handleAIChat(message, projectPath);
});

ipcMain.handle('get-stub-map-spec', async () => {
  return getStubMapSpec();
});

ipcMain.handle('compile-map-spec', async (event, { projectPath, spec }) => {
  return handleCompileMapSpec(projectPath, spec);
});

// --- Read Project Data IPC Handlers ---
ipcMain.handle('read-map', async (event, { projectPath, mapId }) => {
  return handleReadMap(projectPath, mapId);
});

ipcMain.handle('read-map-infos', async (event, { projectPath }) => {
  return handleReadMapInfos(projectPath);
});

ipcMain.handle('read-tilesets', async (event, { projectPath }) => {
  return handleReadTilesets(projectPath);
});

ipcMain.handle('read-system', async (event, { projectPath }) => {
  return handleReadSystem(projectPath);
});

ipcMain.handle('read-project-context', async (event, { projectPath }) => {
  return handleReadProjectContext(projectPath);
});

ipcMain.handle('tileset-inspector', async (event, { projectPath, mapName }) => {
  return handleTilesetInspector(projectPath, mapName);
});

ipcMain.handle('open-external-url', async (event, url) => {
  await shell.openExternal(url);
});

ipcMain.handle('ping', async () => {
  if (!aiService) {
    return { success: false, error: 'No API key configured' };
  }
  return aiService.ping();
});

ipcMain.handle('debug-list-models', async () => {
  if (!aiService) {
    return { error: 'No API key configured' };
  }
  try {
    const models = await aiService.listModels();
    return models;
  } catch (err: any) {
    return { error: err.message };
  }
});

ipcMain.handle('set-active-model', (event, modelName) => {
  console.log(`Setting active model to: ${modelName}`);
  config.modelName = modelName;
  saveConfig(config);
  aiService = createAIService(config);
  return true;
});

ipcMain.handle('get-quota-info', () => {
  if (!aiService || !aiService.getCachedQuota) {
    return { hasData: false, info: null, provider: getCurrentProvider(config) };
  }
  const quotaData = aiService.getCachedQuota();
  return { ...quotaData, provider: getCurrentProvider(config) };
});

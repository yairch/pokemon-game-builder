import { ipcMain, dialog, app, shell } from 'electron';
import { IAIService, AIProvider } from './ai-service-base';
import { AIServiceFactory } from './ai-service-factory';
import { ProjectService } from './project-service';
import { MapGenerator } from './map-generator';
import { MapSpec, TilesetInspectorData } from '../shared/types';
import { TILESET_COLUMNS, TileBlock, isRegularTile, is2x2TilesetBlock, extractTileBlocks, extractTilePairs } from './tile-utils';
import { handleChatMapPipeline } from './chat-map-pipeline';
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
  const { projectPath, spec, templateMapId } = req.body;
  const result = await handleCompileMapSpec(projectPath, spec, templateMapId);
  res.json(result);
});

api.post('/api/run-map-test', async (req, res) => {
  const { projectPath, mapName, mapId, testType } = req.body;
  const result = await handleRunMapTest(projectPath, mapName, mapId, testType);
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
  const mapId = req.query.mapId ? parseInt(req.query.mapId as string, 10) : undefined;
  const mapName = (req.query.mapName as string) || undefined;
  const result = await handleTilesetInspector(projectPath, mapId, mapName);
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
  const { message, projectPath, templateMapId } = req.body;
  const response = await handleAIChat(message, projectPath, templateMapId);
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

async function handleAIChat(message: string, projectPath: string, templateMapId?: number | null) {
  return handleChatMapPipeline(
    {
      aiService,
      mapGenerator,
      createProjectService: (p) => new ProjectService(p),
      getCurrentProvider: () => getCurrentProvider(config),
    },
    message,
    projectPath,
    templateMapId
  );
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

async function handleCompileMapSpec(projectPath: string, spec: MapSpec, templateMapId?: number | null) {
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

    if (templateMapId) {
      let templateMapData: { tilesetId: number; width: number; height: number; layers: number[][][] } | null = null;
      try {
        templateMapData = await mapGenerator.readMap(projectPath, templateMapId);
      } catch {
        return { success: false, error: `Failed to read template map ${templateMapId}.` };
      }

      if (templateMapData) {
        mapData = createPatternedMapDataFromTemplate(nextId, spec, templateMapData);
      }

      await mapGenerator.cloneMapFile(projectPath, templateMapId, nextId);
      if (spec.patchTiles !== false) {
        await mapGenerator.patchMapData(projectPath, nextId, mapData);
      }
    } else {
      const mapFiles = await projectService.getMapList();
      const mapIds = mapFiles
        .map((file) => parseInt(file.match(/\d+/)?.[0] || '0', 10))
        .filter((id) => id > 0)
        .sort((a, b) => a - b);

      if (mapIds.length > 0) {
        let fallbackTemplateId = mapIds[0];
        let fallbackTemplateData: { tilesetId: number; width: number; height: number; layers: number[][][] } | null = null;

        for (const candidateId of mapIds) {
          try {
            const candidateMap = await mapGenerator.readMap(projectPath, candidateId);
            if (candidateMap.tilesetId === mapData.tilesetId) {
              fallbackTemplateId = candidateId;
              fallbackTemplateData = candidateMap;
              break;
            }
          } catch {
            // Ignore read failures and keep searching
          }
        }

        if (fallbackTemplateData) {
          mapData = createPatternedMapDataFromTemplate(nextId, spec, fallbackTemplateData);
        }

        await mapGenerator.cloneMapFile(projectPath, fallbackTemplateId, nextId);
        if (spec.patchTiles !== false) {
          await mapGenerator.patchMapData(projectPath, nextId, mapData);
        }
      } else {
        await mapGenerator.generateMapFile(projectPath, nextId, mapData);
      }
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

function createPatternedMapDataFromTemplate(
  mapId: number,
  spec: MapSpec,
  templateMap: { tilesetId: number; width: number; height: number; layers: number[][][] }
) {
  const layers = cloneLayers(templateMap.layers);
  const [baseTile, accentTile] = findTopTwoTiles(layers[0]);

  const width = templateMap.width;
  const height = templateMap.height;
  const startX = Math.floor(width * 0.25);
  const startY = Math.floor(height * 0.25);
  const endX = Math.floor(width * 0.75);
  const endY = Math.floor(height * 0.75);

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const isBorder = x === startX || y === startY || x === endX - 1 || y === endY - 1;
      const isStripe = (x + y) % 2 === 0;
      layers[0][y][x] = isBorder ? accentTile : isStripe ? accentTile : baseTile;
    }
  }

  return {
    id: mapId,
    name: spec.name,
    width,
    height,
    tilesetId: templateMap.tilesetId,
    layers,
    events: []
  };
}

function cloneLayers(layers: number[][][]): number[][][] {
  return layers.map((layer) => layer.map((row) => [...row]));
}

function findTopTwoTiles(layer: number[][]): [number, number] {
  const counts = new Map<number, number>();
  for (const row of layer) {
    for (const tile of row) {
      if (!tile || tile === 0) continue;
      counts.set(tile, (counts.get(tile) || 0) + 1);
    }
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const base = sorted[0]?.[0] ?? 0;
  const accent = sorted[1]?.[0] ?? base;
  return [base, accent];
}

type MapTestType = 'ai' | 'sanity' | 'object';

async function handleRunMapTest(projectPath: string, mapName: string, mapId: number | undefined, testType: MapTestType) {
  if (!projectPath) {
    return { success: false, error: 'Project path is required.' };
  }

  if (!mapId) {
    return { success: false, error: 'Select a map via Tileset Inspector before running tests.' };
  }

  const projectService = new ProjectService(projectPath);
  if (!projectService.isValidProject()) {
    return { success: false, error: 'The selected directory does not appear to be a valid Pokemon Essentials project.' };
  }

  const normalizedType = testType || 'ai';
  const validTypes: MapTestType[] = ['ai', 'sanity', 'object'];
  if (!validTypes.includes(normalizedType)) {
    return { success: false, error: `Invalid test type: ${testType}` };
  }

  try {
    const mapInfos = await mapGenerator.readMapInfos(projectPath);
    const mapEntry = Object.values(mapInfos).find((info) => info.id === mapId);
    if (!mapEntry) {
      return { success: false, error: `Map "${mapName}" not found in MapInfos.` };
    }

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

    return {
      success: true,
      mapId: nextId,
      mapData,
      debug: mapResult.debug,
      sourceMapId: mapEntry.id,
      sourceMapName: mapEntry.name
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to run map test.' };
  }
}

function createSanityTestMap(
  mapId: number,
  templateMap: { tilesetId: number; width: number; height: number; layers: number[][][] },
  tileset: { autotileNames: string[]; passages?: number[]; priorities?: number[] } | undefined
) {
  const layers = cloneLayers(templateMap.layers);
  const baseCandidates = findTopTiles(layers[0], 10);
  const baseTile = baseCandidates[0];
  if (!baseTile) {
    throw new Error('Sanity check failed: no base tile candidates found.');
  }

  const pathTile = pickPathTileFromTileset(tileset, baseTile, layers[0]);
  if (!pathTile) {
    throw new Error('Sanity check failed: no valid path tile found.');
  }

  const waterTile = selectWaterTile(layers[0], tileset);
  if (!waterTile) {
    throw new Error('Sanity check failed: no valid water tile found.');
  }

  // Sanity test uses a clean base to make changes obvious
  fillLayer(layers[0], baseTile);
  clearLayer(layers[1]);
  clearLayer(layers[2]);
  carvePath(layers[0], pathTile);
  const pondTiles = carvePond(layers[0], waterTile);
  clearLayerArea(layers[1], pondTiles);
  clearLayerArea(layers[2], pondTiles);

  return {
    mapData: {
      id: mapId,
      name: 'POC Sanity Test',
      width: templateMap.width,
      height: templateMap.height,
      tilesetId: templateMap.tilesetId,
      layers,
      events: []
    },
    debug: {
      baseTile,
      pathTile,
      waterTile,
      description: `Sanity test: Base tile ${baseTile} fills map, path tile ${pathTile} creates wavy path, water tile ${waterTile} creates elliptical pond at 70% width, 35% height`
    }
  };
}

async function createAiTestMap(
  mapId: number,
  templateMap: { tilesetId: number; width: number; height: number; layers: number[][][] },
  tileset: { autotileNames: string[]; passages?: number[]; priorities?: number[] } | undefined,
  projectPath: string
) {
  if (!aiService) {
    throw new Error('AI is not configured. Please set an API key.');
  }

  const baseCandidates = findTopTiles(templateMap.layers[0], 12);
  const pathCandidates = findCandidateTiles(templateMap.layers[0], (tile) => {
    const passage = getPassage(tileset, tile);
    const priority = getPriority(tileset, tile);
    return (passage === 0 || passage === null) && (priority === 0 || priority === null);
  }, 12);
  const elevationCandidates = findCandidateTiles(templateMap.layers[0], (tile) => {
    const priority = getPriority(tileset, tile);
    return priority !== null && priority >= 1;
  }, 12);
  const decorCandidates = findTopTiles(templateMap.layers[1], 8);
  const stairCandidates = findTopTiles(templateMap.layers[1], 12);
  const waterCandidates = buildWaterCandidates(templateMap.layers[0], tileset);

  // Add timestamp and random seed to encourage variation in AI responses
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

  if (!plan) {
    console.error('[AI Test] Failed to extract tile plan from response:', response);
    throw new Error('Sanity check failed: AI did not return JSON.');
  }

  console.log('[AI Test] Extracted plan:', JSON.stringify(plan, null, 2));

  if (!plan?.edits || !Array.isArray(plan.edits)) {
    console.error('[AI Test] Plan missing edits array:', plan);
    throw new Error('AI did not return edits array.');
  }

  const editsBounds = getEditsBounds(plan.edits);
  if (!editsBounds) {
    throw new Error('AI returned empty edits.');
  }

  // Check if edits are too clustered
  const mapWidth = templateMap.width;
  const mapHeight = templateMap.height;
  const editArea = (editsBounds.maxX - editsBounds.minX + 1) * (editsBounds.maxY - editsBounds.minY + 1);
  const mapArea = mapWidth * mapHeight;
  const coveragePercent = (editArea / mapArea) * 100;
  
  console.log(`[AI Test] Edit coverage: ${coveragePercent.toFixed(1)}% of map (${editArea} tiles out of ${mapArea})`);
  console.log(`[AI Test] Edit bounds: x(${editsBounds.minX}-${editsBounds.maxX}), y(${editsBounds.minY}-${editsBounds.maxY})`);
  
  if (coveragePercent < 5) {
    console.warn(`[AI Test] WARNING: Edits are very clustered (only ${coveragePercent.toFixed(1)}% of map). Consider spreading edits across more of the map.`);
  }

  console.log('[AI Test] Applying', plan.edits.length, 'edits to map');
  console.log('[AI Test] Sample edits (first 10):', JSON.stringify(plan.edits.slice(0, 10), null, 2));
  
  // Analyze edits before applying
  const editsByLayer = { 0: 0, 1: 0, 2: 0 };
  const editsByTile = new Map<number, number>();
  for (const edit of plan.edits) {
    if (edit && typeof edit.z === 'number' && edit.z >= 0 && edit.z <= 2) {
      editsByLayer[edit.z as keyof typeof editsByLayer]++;
    }
    if (edit && typeof edit.tile === 'number') {
      editsByTile.set(edit.tile, (editsByTile.get(edit.tile) || 0) + 1);
    }
  }
  console.log('[AI Test] Edits by layer:', editsByLayer);
  console.log('[AI Test] Top 10 most used tiles:', Array.from(editsByTile.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tile, count]) => `Tile ${tile}: ${count} edits`));
  
  // Log template map sample before applying edits
  console.log('[AI Test] Template map sample before edits - layers[0][0][0:5]:', templateMap.layers[0][0].slice(0, 5));
  console.log('[AI Test] Template map sample before edits - layers[0][10][0:5]:', templateMap.layers[0][10].slice(0, 5));
  
  const modifiedLayers = applyEditsToLayers(templateMap.layers, plan.edits);
  
  // Log modified map sample after applying edits
  console.log('[AI Test] Modified map sample after edits - layers[0][0][0:5]:', modifiedLayers[0][0].slice(0, 5));
  console.log('[AI Test] Modified map sample after edits - layers[0][10][0:5]:', modifiedLayers[0][10].slice(0, 5));
  console.log('[AI Test] Edits applied successfully');

  return {
    mapData: {
      id: mapId,
      name: plan.name || 'POC AI Tests',
      width: templateMap.width,
      height: templateMap.height,
      tilesetId: templateMap.tilesetId,
      layers: modifiedLayers,
      events: []
    },
    debug: {
      notes: plan?.notes,
      editsCount: plan.edits.length,
      editsBounds,
      sampleEdits: plan.edits.slice(0, 5) // Log first 5 edits for debugging
    }
  };
}

// ============================================================
// OBJECT PLACEMENT TEST - Tests AI ability to place coherent
// multi-tile objects (trees, rocks, etc.) from tileset
// ============================================================

// Tile utility functions (TILESET_COLUMNS, TileBlock, isRegularTile,
// is2x2TilesetBlock, extractTileBlocks, extractTilePairs) imported from ./tile-utils

/**
 * Build a prompt that describes tile objects with their spatial layouts,
 * so the AI knows how to compose multi-tile objects correctly.
 */
function buildObjectPlacementPrompt(
  blocks: TileBlock[],
  templateMap: { width: number; height: number },
  groundTile: number
): string {
  const objectLabels = 'ABCDEFGHIJ';

  let objectDescriptions = '';
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const label = objectLabels[i] || `${i}`;

    objectDescriptions += `\nObject ${label} (${block.width}x${block.height}, layer ${block.layer}, seen ${block.occurrences}x in map):\n`;
    objectDescriptions += `  Grid layout (tile IDs row by row):\n`;

    for (let dy = 0; dy < block.height; dy++) {
      const rowTiles = block.tiles
        .filter(t => t.dy === dy)
        .sort((a, b) => a.dx - b.dx)
        .map(t => t.tileId);
      objectDescriptions += `    y+${dy}: [${rowTiles.join(', ')}]\n`;
    }

    objectDescriptions += `  To place at anchor (X, Y), emit these edits:\n`;
    for (const tile of block.tiles) {
      objectDescriptions += `    {"x":X+${tile.dx},"y":Y+${tile.dy},"z":${block.layer},"tile":${tile.tileId}}\n`;
    }
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
${objectDescriptions}
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

/**
 * Validate that AI edits form complete, recognized objects.
 * Returns the number of complete objects found and any errors.
 */
function validateObjectEdits(
  edits: Array<{ x: number; y: number; z: number; tile: number }>,
  availableBlocks: TileBlock[]
): { valid: boolean; objectsFound: number; errors: string[] } {
  const errors: string[] = [];
  let objectsFound = 0;
  const usedEdits = new Set<number>();

  // For each unused edit, try to match it as part of a complete object
  for (let i = 0; i < edits.length; i++) {
    if (usedEdits.has(i)) continue;

    let matched = false;
    for (const block of availableBlocks) {
      // Check if edit[i] matches any tile in this block
      for (const anchorTile of block.tiles) {
        if (edits[i].tile !== anchorTile.tileId || edits[i].z !== block.layer) continue;

        // Derive base position from this edit and the anchor offset
        const baseX = edits[i].x - anchorTile.dx;
        const baseY = edits[i].y - anchorTile.dy;

        // Try to find ALL tiles of this block at the derived base position
        const matchIndices: number[] = [];
        let allFound = true;

        for (const expected of block.tiles) {
          const idx = edits.findIndex((e, j) =>
            !usedEdits.has(j) &&
            e.x === baseX + expected.dx &&
            e.y === baseY + expected.dy &&
            e.z === block.layer &&
            e.tile === expected.tileId
          );

          if (idx === -1) {
            allFound = false;
            break;
          }
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
  if (unusedCount > 0) {
    errors.push(`${unusedCount} of ${edits.length} edits don't form complete objects (${usedEdits.size} matched to ${objectsFound} objects)`);
  }

  if (objectsFound === 0) {
    errors.push('No complete objects were detected in the edits');
  }

  return {
    valid: objectsFound >= 1 && unusedCount === 0,
    objectsFound,
    errors
  };
}

/**
 * Object placement test: extracts multi-tile objects from the template map,
 * asks the AI to place a few coherent objects, and validates the result.
 */
async function createObjectTestMap(
  mapId: number,
  templateMap: { tilesetId: number; width: number; height: number; layers: number[][][] },
  tileset: { autotileNames: string[]; passages?: number[]; priorities?: number[] } | undefined,
  projectPath: string
) {
  if (!aiService) {
    throw new Error('AI is not configured. Please set an API key.');
  }

  // Step 1: Extract 2x2 tile blocks from the template map
  let blocks = extractTileBlocks(templateMap.layers);
  console.log(`[Object Test] Found ${blocks.length} unique 2x2 tile blocks in template map`);

  if (blocks.length === 0) {
    // Fallback: try horizontal pairs
    const pairs = extractTilePairs(templateMap.layers);
    console.log(`[Object Test] No 2x2 blocks found. Found ${pairs.length} tile pairs as fallback.`);
    if (pairs.length === 0) {
      throw new Error('Object test failed: no multi-tile objects found in template map.');
    }
    blocks = pairs;
  }

  // Step 2: Pick the top objects (max 5)
  const topBlocks = blocks.slice(0, 5);
  console.log(`[Object Test] Using top ${topBlocks.length} objects for AI prompt:`);
  for (const block of topBlocks) {
    const tileIds = block.tiles.map(t => t.tileId).join(', ');
    console.log(`  ${block.id}: ${block.width}x${block.height} on layer ${block.layer}, ${block.occurrences} occurrences, tiles=[${tileIds}]`);
  }

  // Step 3: Find dominant ground tile for context
  const groundTiles = findTopTiles(templateMap.layers[0], 3);
  const groundTile = groundTiles[0] || 384;

  // Step 4: Build the prompt
  const prompt = buildObjectPlacementPrompt(topBlocks, templateMap, groundTile);
  console.log(`[Object Test] Prompt length: ${prompt.length} chars`);

  // Step 5: Send to AI
  const response = await aiService.chat(prompt, { projectPath });
  console.log('[Object Test] Raw AI response:', JSON.stringify(response, null, 2));

  // Step 6: Extract tile plan from response
  const plan = extractTilePlan(response);
  if (!plan?.edits || !Array.isArray(plan.edits) || plan.edits.length === 0) {
    console.error('[Object Test] Failed to extract valid edits from response');
    throw new Error('Object test failed: AI did not return valid edits.');
  }

  console.log(`[Object Test] AI returned ${plan.edits.length} edits`);
  for (const edit of plan.edits) {
    console.log(`  (${edit.x}, ${edit.y}, z=${edit.z}) tile=${edit.tile}`);
  }

  // Step 7: Validate coherence - do edits form complete objects?
  const validation = validateObjectEdits(plan.edits, topBlocks);
  console.log(`[Object Test] Validation result: ${validation.objectsFound} complete objects, valid=${validation.valid}`);
  if (validation.errors.length > 0) {
    for (const err of validation.errors) {
      console.warn(`[Object Test] Validation: ${err}`);
    }
  }

  // Step 8: Apply edits to template layers
  const modifiedLayers = applyEditsToLayers(templateMap.layers, plan.edits);

  return {
    mapData: {
      id: mapId,
      name: plan.name || 'Object Placement Test',
      width: templateMap.width,
      height: templateMap.height,
      tilesetId: templateMap.tilesetId,
      layers: modifiedLayers,
      events: []
    },
    debug: {
      notes: plan.notes,
      editsCount: plan.edits.length,
      objectsAvailable: topBlocks.length,
      objectsPlaced: validation.objectsFound,
      validationPassed: validation.valid,
      validationErrors: validation.errors,
      coherenceScore: `${validation.objectsFound}/3 complete objects (${plan.edits.length} total edits)`
    }
  };
}

function findTopTiles(layer: number[][], limit: number): number[] {
  const counts = new Map<number, number>();
  for (const row of layer) {
    for (const tile of row) {
      if (!tile || tile === 0) continue;
      counts.set(tile, (counts.get(tile) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tile]) => tile)
    .slice(0, limit);
}

function pickDifferentTile(candidates: number[], fallback: number): number {
  for (const tile of candidates) {
    if (tile && tile !== fallback) return tile;
  }
  return fallback;
}

function selectWaterTile(layer: number[][], tileset?: { autotileNames: string[] }): number {
  const autotileIndex = findAutotileIndexByName(tileset?.autotileNames || []);
  if (autotileIndex >= 0) return 48 + autotileIndex * 48;

  // Choose the most frequent autotile already in use on layer 0
  const autotileCandidates = findTopTiles(
    layer.map((row) => row.map((tile) => (tile >= 48 && tile < 384 ? tile : 0))),
    3
  );
  if (autotileCandidates[0]) return autotileCandidates[0];

  const hasAnyAutotile = (tileset?.autotileNames || []).some((name) => !!name);
  return hasAnyAutotile ? 48 : 0;
}

function findAutotileIndexByName(names: string[]): number {
  const waterHints = ['water', 'sea', 'lake', 'pond', 'ocean', 'river'];
  for (let i = 0; i < names.length; i += 1) {
    const name = names[i]?.toLowerCase() || '';
    if (waterHints.some((hint) => name.includes(hint))) return i;
  }
  return -1;
}

function getTilesetIndex(tileId: number): number | null {
  if (tileId < 0) return null;
  if (tileId < 384) return tileId;
  return tileId - 384;
}

function getPassage(tileset: { passages?: number[] } | undefined, tileId: number): number | null {
  const idx = getTilesetIndex(tileId);
  if (idx === null) return null;
  return tileset?.passages?.[idx] ?? null;
}

function getPriority(tileset: { priorities?: number[] } | undefined, tileId: number): number | null {
  const idx = getTilesetIndex(tileId);
  if (idx === null) return null;
  return tileset?.priorities?.[idx] ?? null;
}

function buildRegularTileIds(tileset: { passages?: number[]; priorities?: number[] } | undefined): number[] {
  const count = Math.max(tileset?.passages?.length || 0, tileset?.priorities?.length || 0);
  if (!count) {
    return [];
  }
  const ids: number[] = [];
  for (let i = 0; i < count; i += 1) {
    ids.push(384 + i);
  }
  return ids;
}

function pickPathTileFromTileset(
  tileset: { passages?: number[]; priorities?: number[] } | undefined,
  baseTile: number,
  layer?: number[][]
): number | null {
  // First try: look for regular tiles (384+) in tileset with passage=0 and priority=0
  const regularCandidates = buildRegularTileIds(tileset).filter((tileId) => {
    if (tileId === baseTile) return false;
    const passage = getPassage(tileset, tileId);
    const priority = getPriority(tileset, tileId);
    return (passage === 0 || passage === null) && (priority === 0 || priority === null);
  });
  if (regularCandidates.length > 0) {
    return regularCandidates[0];
  }

  // Fallback: if we have layer data, find tiles from the map that match the criteria
  if (layer) {
    const mapCandidates = findCandidateTiles(layer, (tile) => {
      if (tile === baseTile || !tile || tile === 0) return false;
      const passage = getPassage(tileset, tile);
      const priority = getPriority(tileset, tile);
      return (passage === 0 || passage === null) && (priority === 0 || priority === null);
    }, 5);
    if (mapCandidates.length > 0) {
      return mapCandidates[0];
    }
  }

  // Last resort: return any regular tile that's not the base tile
  const anyRegularTile = buildRegularTileIds(tileset).find((tileId) => tileId !== baseTile);
  if (anyRegularTile) {
    return anyRegularTile;
  }

  return null;
}

function pickElevationTileFromTileset(
  tileset: { passages?: number[]; priorities?: number[] } | undefined
): number | null {
  const candidates = buildRegularTileIds(tileset).filter((tileId) => {
    const priority = getPriority(tileset, tileId);
    return priority !== null && priority >= 1;
  });
  return candidates[0] ?? null;
}

function pickDecorTileFromTileset(
  tileset: { passages?: number[]; priorities?: number[] } | undefined
): number | null {
  const candidates = buildRegularTileIds(tileset).filter((tileId) => {
    const priority = getPriority(tileset, tileId);
    return priority !== null && priority >= 1;
  });
  return candidates[1] ?? candidates[0] ?? null;
}

function pickStairTileFromTileset(
  tileset: { passages?: number[]; priorities?: number[] } | undefined
): number | null {
  const candidates = buildRegularTileIds(tileset).filter((tileId) => {
    const priority = getPriority(tileset, tileId);
    return priority !== null && priority >= 1;
  });
  return candidates[2] ?? candidates[0] ?? null;
}

function buildWaterCandidates(layer: number[][], tileset?: { autotileNames: string[] }): number[] {
  const candidates: number[] = [];
  for (const [index, name] of (tileset?.autotileNames || []).entries()) {
    if (!name) continue;
    if (findAutotileIndexByName([name]) !== -1) {
      candidates.push(48 + index * 48);
    }
  }
  const autotileCandidates = findTopTiles(
    layer.map((row) => row.map((tile) => (tile >= 48 && tile < 384 ? tile : 0))),
    4
  );
  return [...new Set([...candidates, ...autotileCandidates])].filter((id) => id > 0);
}

function findCandidateTiles(
  layer: number[][],
  predicate: (tile: number) => boolean,
  limit: number
): number[] {
  const counts = new Map<number, number>();
  for (const row of layer) {
    for (const tile of row) {
      if (!tile || tile === 0) continue;
      if (!predicate(tile)) continue;
      counts.set(tile, (counts.get(tile) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tile]) => tile)
    .slice(0, limit);
}

function pickFromCandidates(tile: number | undefined, candidates: number[]): number | null {
  if (tile && candidates.includes(tile)) return tile;
  return null;
}

function validateMapData(mapData: any, templateMap: { width: number; height: number; tilesetId: number }) {
  // Deprecated: AI now returns compact edits; keep stub for backwards compatibility.
  return;
}

function extractTilePlan(response: any): {
  name?: string;
  edits?: Array<{ x: number; y: number; z: number; tile: number }>;
  notes?: string;
} | null {
  if (!response) return null;
  if (response.tilePlan) return response.tilePlan;
  
  const getText = (): string => {
    if (typeof response.text === 'string') return response.text.trim();
    if (typeof response === 'string') return response.trim();
    return '';
  };
  
  const text = getText();
  if (!text) return null;
  
  // Try direct parse first
  try {
    const parsed = JSON.parse(text);
    if (parsed.tilePlan) return parsed.tilePlan;
    if (parsed.edits) return parsed;
  } catch (e) {
    // JSON is invalid, continue to fallback parsing
    console.log('[extractTilePlan] Direct parse failed, trying fallback methods...');
  }
  
  // Extract all edits using regex (works even with truncated JSON)
  const allEdits: Array<{ x: number; y: number; z: number; tile: number }> = [];
  const editRegex = /\{"x":\s*(\d+),\s*"y":\s*(\d+),\s*"z":\s*([012]),\s*"tile":\s*(\d+)\}/g;
  let editMatch;
  while ((editMatch = editRegex.exec(text)) !== null) {
    try {
      allEdits.push({
        x: parseInt(editMatch[1], 10),
        y: parseInt(editMatch[2], 10),
        z: parseInt(editMatch[3], 10),
        tile: parseInt(editMatch[4], 10)
      });
    } catch {
      // Skip invalid matches
    }
  }
  
  if (allEdits.length > 0) {
    // Try to extract the name
    const nameMatch = text.match(/"name":\s*"([^"]+)"/);
    const name = nameMatch ? nameMatch[1] : 'AI Generated Map';
    
    console.log(`[extractTilePlan] Extracted ${allEdits.length} edits from response (may be truncated)`);
    return { name, edits: allEdits, notes: 'Extracted from response (may be truncated)' };
  }
  
  // Try to extract JSON from text (fallback for non-truncated but malformed JSON)
  const jsonStart = text.indexOf('{');
  if (jsonStart !== -1) {
    const jsonEnd = text.lastIndexOf('}');
    if (jsonEnd !== -1 && jsonEnd > jsonStart) {
      const jsonSlice = text.slice(jsonStart, jsonEnd + 1);
      try {
        const parsed = JSON.parse(jsonSlice);
        if (parsed.tilePlan) return parsed.tilePlan;
        if (parsed.edits) return parsed;
      } catch {
        // JSON slice is also invalid
      }
    }
  }
  
  console.error('[extractTilePlan] Failed to extract tile plan from response');
  return null;
}

function applyEditsToLayers(
  layers: number[][][],
  edits: Array<{ x: number; y: number; z: number; tile: number }>
): number[][][] {
  const cloned = cloneLayers(layers);
  const height = cloned[0]?.length || 0;
  const width = cloned[0]?.[0]?.length || 0;

  let appliedCount = 0;
  let skippedCount = 0;

  for (const edit of edits) {
    if (!edit) {
      skippedCount++;
      continue;
    }
    const { x, y, z, tile } = edit;
    
    // Validate coordinates
    if (z < 0 || z > 2) {
      skippedCount++;
      continue;
    }
    if (x < 0 || y < 0 || x >= width || y >= height) {
      skippedCount++;
      continue;
    }
    
    // Validate tile ID (should be a number, 0 or positive)
    if (typeof tile !== 'number' || tile < 0) {
      skippedCount++;
      continue;
    }
    
    // Apply the edit
    cloned[z][y][x] = tile;
    appliedCount++;
  }

  console.log(`[applyEditsToLayers] Applied ${appliedCount} edits, skipped ${skippedCount} invalid edits`);
  if (skippedCount > 0 && skippedCount < edits.length) {
    console.warn(`[applyEditsToLayers] Warning: ${skippedCount} edits were skipped due to invalid coordinates or tile IDs`);
  }

  return cloned;
}

function getEditsBounds(edits: Array<{ x: number; y: number; z: number; tile: number }>) {
  if (!edits.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const edit of edits) {
    minX = Math.min(minX, edit.x);
    minY = Math.min(minY, edit.y);
    maxX = Math.max(maxX, edit.x);
    maxY = Math.max(maxY, edit.y);
  }
  return { minX, minY, maxX, maxY };
}


function carvePath(layer: number[][], pathTile: number) {
  if (!pathTile) return;
  const height = layer.length;
  const width = layer[0]?.length || 0;
  for (let y = 3; y < height - 3; y += 1) {
    const offset = Math.round(Math.sin(y / 6) * 6);
    const x = Math.floor(width / 2) + offset;
    setTile(layer, x, y, pathTile, 4);
  }
}

function carvePond(layer: number[][], waterTile: number): Array<[number, number]> {
  if (!waterTile) return [];
  const height = layer.length;
  const width = layer[0]?.length || 0;
  const centerX = Math.floor(width * 0.7);
  const centerY = Math.floor(height * 0.35);
  const radiusX = Math.max(4, Math.floor(width * 0.18));
  const radiusY = Math.max(4, Math.floor(height * 0.12));
  const affected: Array<[number, number]> = [];

  for (let y = centerY - radiusY; y <= centerY + radiusY; y += 1) {
    for (let x = centerX - radiusX; x <= centerX + radiusX; x += 1) {
      if (x < 0 || y < 0 || y >= height || x >= width) continue;
      const dx = (x - centerX) / radiusX;
      const dy = (y - centerY) / radiusY;
      if (dx * dx + dy * dy <= 1) {
        layer[y][x] = waterTile;
        affected.push([x, y]);
      }
    }
  }
  return affected;
}

function scatterDecor(layer: number[][], decorTile: number) {
  if (!decorTile) return;
  const height = layer.length;
  const width = layer[0]?.length || 0;
  for (let y = 4; y < height - 4; y += 5) {
    for (let x = 4; x < width - 4; x += 5) {
      layer[y][x] = decorTile;
    }
  }
}

function buildElevation(layers: number[][][], elevationTile: number, stairTile: number) {
  if (!elevationTile) return;
  const layer0 = layers[0];
  const layer1 = layers[1];
  const height = layer0.length;
  const width = layer0[0]?.length || 0;
  const startX = Math.floor(width * 0.1);
  const startY = Math.floor(height * 0.6);
  const endX = Math.min(width - 2, startX + Math.floor(width * 0.3));
  const endY = Math.min(height - 2, startY + Math.floor(height * 0.18));

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      layer0[y][x] = elevationTile;
    }
  }

  if (stairTile && layer1) {
    const stairX = startX + Math.floor((endX - startX) / 2);
    for (let y = startY; y < Math.min(endY, startY + 4); y += 1) {
      layer1[y][stairX] = stairTile;
    }
  }
}

function clearArea(layer: number[][], startX: number, startY: number, endX: number, endY: number) {
  const height = layer.length;
  const width = layer[0]?.length || 0;
  const minX = Math.max(0, Math.min(startX, endX));
  const maxX = Math.min(width - 1, Math.max(startX, endX));
  const minY = Math.max(0, Math.min(startY, endY));
  const maxY = Math.min(height - 1, Math.max(startY, endY));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      layer[y][x] = 0;
    }
  }
}

function clearLayer(layer: number[][]) {
  for (let y = 0; y < layer.length; y += 1) {
    for (let x = 0; x < (layer[0]?.length || 0); x += 1) {
      layer[y][x] = 0;
    }
  }
}

function clearLayerArea(layer: number[][], coords: Array<[number, number]>) {
  if (!layer || coords.length === 0) return;
  const height = layer.length;
  const width = layer[0]?.length || 0;
  for (const [x, y] of coords) {
    if (y >= 0 && y < height && x >= 0 && x < width) {
      layer[y][x] = 0;
    }
  }
}

function fillLayer(layer: number[][], tile: number) {
  for (let y = 0; y < layer.length; y += 1) {
    for (let x = 0; x < (layer[0]?.length || 0); x += 1) {
      layer[y][x] = tile;
    }
  }
}

function setTile(layer: number[][], x: number, y: number, tile: number, thickness: number) {
  const height = layer.length;
  const width = layer[0]?.length || 0;
  const half = Math.floor(thickness / 2);
  for (let dy = -half; dy <= half; dy += 1) {
    for (let dx = -half; dx <= half; dx += 1) {
      const ny = y + dy;
      const nx = x + dx;
      if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
        layer[ny][nx] = tile;
      }
    }
  }
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

async function handleTilesetInspector(projectPath: string, mapId?: number, mapName?: string) {
  if (!projectPath) {
    return { success: false, error: 'Project path is required.' };
  }

  try {
    const mapInfos = await mapGenerator.readMapInfos(projectPath);

    let mapEntry;
    if (mapId) {
      mapEntry = Object.values(mapInfos).find((info) => info.id === mapId);
      if (!mapEntry) {
        return { success: false, error: `Map ID ${mapId} not found in MapInfos.` };
      }
    } else if (mapName) {
      mapEntry = Object.values(mapInfos).find(
        (info) => info.name.toLowerCase() === mapName.toLowerCase()
      );
      if (!mapEntry) {
        return { success: false, error: `Map "${mapName}" not found in MapInfos.` };
      }
    } else {
      return { success: false, error: 'Please provide a map ID or map name.' };
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

ipcMain.handle('ai-chat', async (event, { message, projectPath, templateMapId }) => {
  return handleAIChat(message, projectPath, templateMapId);
});

ipcMain.handle('get-stub-map-spec', async () => {
  return getStubMapSpec();
});

ipcMain.handle('compile-map-spec', async (event, { projectPath, spec, templateMapId }) => {
  return handleCompileMapSpec(projectPath, spec, templateMapId);
});

ipcMain.handle('run-map-test', async (event, { projectPath, mapName, mapId, testType }) => {
  return handleRunMapTest(projectPath, mapName, mapId, testType);
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

ipcMain.handle('tileset-inspector', async (event, { projectPath, mapId, mapName }) => {
  return handleTilesetInspector(projectPath, mapId, mapName);
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

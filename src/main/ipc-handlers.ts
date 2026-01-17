import { ipcMain, dialog, app, shell } from 'electron';
import { IAIService, AIProvider } from './ai-service-base';
import { AIServiceFactory } from './ai-service-factory';
import { ProjectService } from './project-service';
import { MapGenerator } from './map-generator';
import * as path from 'path';
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

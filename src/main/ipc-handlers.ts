/**
 * Thin Electron IPC adapter — registers ipcMain handlers that delegate to handlers.ts.
 * Also boots the shared handler state and the Express API server.
 *
 * This file is only imported from main.ts (Electron entry point).
 */

import { ipcMain, dialog, app, shell } from 'electron';
import * as path from 'path';
import * as h from './handlers';
import { startApiServer, setSelectDirectoryHandler } from './api-server';

// Boot handlers with Electron's userData config path
h.setConfigPath(path.join(app.getPath('userData'), 'config.json'));
h.boot();

// Inject native directory picker into the Express layer
setSelectDirectoryHandler(async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return result.filePaths[0];
});

// Start the Express API (used by both Electron renderer and browser fallback)
startApiServer();

// --- IPC handlers (one-liner delegates) ---

ipcMain.handle('get-api-key', () => h.handleGetApiKey().apiKey);
ipcMain.handle('has-api-key', () => h.handleHasApiKey().hasKey);
ipcMain.handle('set-api-key', (_event, newApiKey, provider?) => h.handleSetApiKey(newApiKey, provider));
ipcMain.handle('set-ai-provider', (_event, useClaude: boolean) => h.handleSetProvider(useClaude));
ipcMain.handle('get-ai-provider', () => h.getCurrentProvider());

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return result.filePaths[0];
});

ipcMain.handle('init-project', (_event, projectPath) => h.handleInitProject(projectPath));
ipcMain.handle('ai-chat', (_event, { message, projectPath, templateMapId }) => h.handleAIChat(message, projectPath, templateMapId));
ipcMain.handle('get-stub-map-spec', () => h.handleGetStubMapSpec());
ipcMain.handle('compile-map-spec', (_event, { projectPath, spec, templateMapId }) => h.handleCompileMapSpec(projectPath, spec, templateMapId));
ipcMain.handle('run-map-test', (_event, { projectPath, mapName, mapId, testType }) => h.handleRunMapTest(projectPath, mapName, mapId, testType));

ipcMain.handle('read-map', (_event, { projectPath, mapId }) => h.handleReadMap(projectPath, mapId));
ipcMain.handle('read-map-infos', (_event, { projectPath }) => h.handleReadMapInfos(projectPath));
ipcMain.handle('apply-map-infos-tree', (_event, { projectPath, rows }) =>
  h.handleApplyMapInfosTree(projectPath, rows)
);
ipcMain.handle('delete-maps', (_event, { projectPath, payload }) =>
  h.handleDeleteMaps(projectPath, payload)
);
ipcMain.handle('read-tilesets', (_event, { projectPath }) => h.handleReadTilesets(projectPath));
ipcMain.handle('read-system', (_event, { projectPath }) => h.handleReadSystem(projectPath));
ipcMain.handle('map-rxdata-exists', (_event, { projectPath, mapId }) =>
  h.handleMapRxdataExists(projectPath, mapId)
);
ipcMain.handle('read-project-context', (_event, { projectPath }) => h.handleReadProjectContext(projectPath));
ipcMain.handle('tileset-inspector', (_event, { projectPath, mapId, mapName }) => h.handleTilesetInspector(projectPath, mapId, mapName));

ipcMain.handle('open-external-url', (_event, url) => shell.openExternal(url));
ipcMain.handle('ping', () => h.handlePing());
ipcMain.handle('debug-list-models', () => h.handleDebugListModels());
ipcMain.handle('set-active-model', (_event, modelName) => h.handleSetActiveModel(modelName));
ipcMain.handle('get-quota-info', () => h.handleGetQuotaInfo());

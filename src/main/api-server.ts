/**
 * Thin Express HTTP adapter — every route delegates to handlers.ts.
 * Platform-agnostic: works in both Electron and standalone Node.
 */

import express from 'express';
import cors from 'cors';
import * as h from './handlers';

const api = express();
api.use(cors());
api.use(express.json());

// --- Config ---
api.get('/api/config/key', (_req, res) => res.json(h.handleGetApiKey()));
api.get('/api/config/has-key', (_req, res) => res.json(h.handleHasApiKey()));
api.post('/api/config/key', (req, res) => {
  const { apiKey, provider } = req.body;
  res.json({ success: h.handleSetApiKey(apiKey, provider) });
});
api.get('/api/config/provider', (_req, res) => res.json(h.handleGetProvider()));
api.post('/api/config/provider', (req, res) => res.json(h.handleSetProvider(req.body.useClaude)));
api.post('/api/config/model', (req, res) => res.json({ success: h.handleSetActiveModel(req.body.modelName) }));

// --- Ping / debug ---
api.get('/api/ping', async (_req, res) => res.json(await h.handlePing()));
api.get('/api/debug-list-models', async (_req, res) => res.json(await h.handleDebugListModels()));

// --- Map spec / compile / test ---
api.get('/api/stub/map-spec', (_req, res) => res.json(h.handleGetStubMapSpec()));
api.post('/api/compile-map-spec', async (req, res) => {
  const { projectPath, spec, templateMapId } = req.body;
  res.json(await h.handleCompileMapSpec(projectPath, spec, templateMapId));
});
api.post('/api/run-map-test', async (req, res) => {
  const { projectPath, mapName, mapId, testType } = req.body;
  res.json(await h.handleRunMapTest(projectPath, mapName, mapId, testType));
});

// --- Read project data ---
api.get('/api/read-map/:mapId', async (req, res) => {
  res.json(await h.handleReadMap(req.query.projectPath as string, parseInt(req.params.mapId)));
});
api.get('/api/read-map-infos', async (req, res) => res.json(await h.handleReadMapInfos(req.query.projectPath as string)));
api.get('/api/read-tilesets', async (req, res) => res.json(await h.handleReadTilesets(req.query.projectPath as string)));
api.get('/api/read-system', async (req, res) => res.json(await h.handleReadSystem(req.query.projectPath as string)));
api.get('/api/read-project-context', async (req, res) => res.json(await h.handleReadProjectContext(req.query.projectPath as string)));

// --- Tileset inspector ---
api.get('/api/tileset-inspector', async (req, res) => {
  const mapId = req.query.mapId ? parseInt(req.query.mapId as string, 10) : undefined;
  res.json(await h.handleTilesetInspector(req.query.projectPath as string, mapId, req.query.mapName as string | undefined));
});

// --- Directory picker (platform-dependent — injected by the host) ---
let selectDirectoryHandler: (() => Promise<string | undefined>) | null = null;

/** Electron main process calls this to inject the native dialog picker. */
export function setSelectDirectoryHandler(handler: () => Promise<string | undefined>) {
  selectDirectoryHandler = handler;
}

api.get('/api/select-directory', async (_req, res) => {
  if (!selectDirectoryHandler) {
    res.json({ path: null, browserMode: true, error: 'Directory picker is not available in browser mode. Please type the path manually.' });
    return;
  }
  const selected = await selectDirectoryHandler();
  res.json({ path: selected });
});

// --- Project init / chat ---
api.post('/api/init-project', async (req, res) => res.json({ success: await h.handleInitProject(req.body.projectPath) }));
api.post('/api/chat', async (req, res) => {
  const { message, projectPath, templateMapId } = req.body;
  res.json(await h.handleAIChat(message, projectPath, templateMapId));
});

// --- Start ---

const PORT = 3001;

export function startApiServer() {
  api.listen(PORT, () => {
    console.log(`Bridge API running at http://localhost:${PORT}`);
  });
}

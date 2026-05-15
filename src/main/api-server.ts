/**
 * Thin Express HTTP adapter — every route delegates to handlers.ts.
 * Platform-agnostic: works in both Electron and standalone Node.
 */

import express from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';
import * as h from './handlers';
import type {
  DeletePreflightProgress,
  DeletePreflightResult,
} from './delete-preflight';

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
api.post('/api/apply-map-infos-tree', async (req, res) => {
  const { projectPath, rows } = req.body ?? {};
  res.json(await h.handleApplyMapInfosTree(projectPath, rows));
});
api.post('/api/delete-maps', async (req, res) => {
  const { projectPath, payload } = req.body ?? {};
  res.json(await h.handleDeleteMaps(projectPath, payload));
});

// --- Delete preflight: async job + polling (browser-fallback only) ---
//
// In Electron mode, progress flows via IPC `webContents.send`; the renderer
// awaits the IPC handle for the final result. The REST path is used by the
// browser-fallback runtime, where we can't push events back to the renderer —
// the renderer kicks off a job, then polls `delete-preflight-status` until
// `done: true`. Polling at ~250 ms is fine for a job whose runtime is
// seconds (see plan: SSE is overkill for v1).

interface PreflightJob {
  progress: DeletePreflightProgress | null;
  result: DeletePreflightResult | null;
  error: string | null;
  startedAt: number;
  doneAt: number | null;
}

const preflightJobs = new Map<string, PreflightJob>();
const PREFLIGHT_JOB_TTL_MS = 5 * 60 * 1000;

function cleanupPreflightJobs(): void {
  const now = Date.now();
  for (const [id, job] of preflightJobs.entries()) {
    if (job.doneAt != null && now - job.doneAt > PREFLIGHT_JOB_TTL_MS) {
      preflightJobs.delete(id);
    }
  }
}

api.post('/api/delete-preflight', (req, res) => {
  const { projectPath, ids } = req.body ?? {};
  // Surface validation errors synchronously by running the handler with empty options;
  // if validation passes, the handler will start scanning. We can't easily separate
  // "validation failed" from "scan failed" here without re-implementing validation,
  // so we just do a quick sanity check before claiming a jobId.
  if (!projectPath || !Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ success: false, error: 'projectPath and non-empty ids are required.' });
    return;
  }

  const jobId = randomUUID();
  preflightJobs.set(jobId, {
    progress: null,
    result: null,
    error: null,
    startedAt: Date.now(),
    doneAt: null,
  });

  // Fire-and-forget. The async closure owns updating the job table.
  void (async () => {
    try {
      const out = await h.handleDeletePreflight(projectPath, ids, {
        onProgress: (p) => {
          const job = preflightJobs.get(jobId);
          if (job) job.progress = p;
        },
      });
      const job = preflightJobs.get(jobId);
      if (!job) return;
      if (out.success && out.data) {
        job.result = out.data;
      } else {
        job.error = out.error ?? 'Unknown preflight error.';
      }
      job.doneAt = Date.now();
    } catch (e: any) {
      const job = preflightJobs.get(jobId);
      if (job) {
        job.error = e?.message ?? String(e);
        job.doneAt = Date.now();
      }
    } finally {
      cleanupPreflightJobs();
    }
  })();

  res.json({ success: true, jobId });
});

api.get('/api/delete-preflight-status', (req, res) => {
  const jobId = String(req.query.jobId ?? '');
  const job = preflightJobs.get(jobId);
  if (!job) {
    res.status(404).json({ success: false, error: 'Unknown jobId (may have expired).' });
    return;
  }
  res.json({
    success: true,
    jobId,
    progress: job.progress,
    result: job.result,
    error: job.error,
    done: job.doneAt != null,
  });
});
api.get('/api/read-tilesets', async (req, res) => res.json(await h.handleReadTilesets(req.query.projectPath as string)));
api.get('/api/read-system', async (req, res) => res.json(await h.handleReadSystem(req.query.projectPath as string)));
api.get('/api/map-rxdata-exists', async (req, res) => {
  const mapIdRaw = req.query.mapId as string | undefined;
  const mapId = mapIdRaw != null ? parseInt(mapIdRaw, 10) : NaN;
  res.json(await h.handleMapRxdataExists(req.query.projectPath as string, mapId));
});
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

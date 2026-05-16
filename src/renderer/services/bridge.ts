import type { DeletePreflightProgress, DeletePreflightResult } from '../../shared/deletePreflightTypes';

const API_BASE = 'http://localhost:3001/api';

export type DeletePreflightBridgeResponse = {
  success: boolean;
  data?: DeletePreflightResult;
  error?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePreflightProgressPayload(payload: unknown): DeletePreflightProgress | null {
  if (!payload || typeof payload !== 'object') return null;
  const o = payload as Record<string, unknown>;
  const step = o.step;
  if (step === 'system' || step === 'scripts' || step === 'done') return { step };
  if (step === 'map-events') {
    const current = Number(o.current);
    const total = Number(o.total);
    if (!Number.isFinite(current) || !Number.isFinite(total)) return null;
    return { step: 'map-events', current, total };
  }
  return null;
}

async function runDeletePreflightBrowser(
  projectPath: string,
  ids: number[],
  onProgress?: (p: DeletePreflightProgress) => void
): Promise<DeletePreflightBridgeResponse> {
  const startRes = await fetch(`${API_BASE}/delete-preflight`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath, ids }),
  });
  const startJson = (await startRes.json()) as {
    success?: boolean;
    jobId?: string;
    error?: string;
  };
  if (!startJson.success || !startJson.jobId) {
    return { success: false, error: startJson.error || 'Failed to start delete preflight.' };
  }
  const jobId = startJson.jobId;
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    await sleep(250);
    const stRes = await fetch(`${API_BASE}/delete-preflight-status?jobId=${encodeURIComponent(jobId)}`);
    const stJson = (await stRes.json()) as {
      success?: boolean;
      progress?: DeletePreflightProgress | null;
      result?: DeletePreflightResult | null;
      error?: string | null;
      done?: boolean;
    };
    if (!stJson.success) {
      return { success: false, error: stJson.error || 'Preflight status request failed.' };
    }
    if (stJson.progress) onProgress?.(stJson.progress);
    if (stJson.done) {
      if (stJson.error) return { success: false, error: stJson.error };
      if (!stJson.result) return { success: false, error: 'Preflight finished without a result.' };
      return { success: true, data: stJson.result };
    }
  }
  return { success: false, error: 'Delete preflight timed out waiting for completion.' };
}

async function withPreflightTimeout<T>(work: Promise<T>): Promise<T> {
  const ms = 120000;
  return Promise.race([
    work,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`Delete preflight timed out after ${ms / 1000} seconds.`)), ms)
    ),
  ]);
}

export const bridge = {
  /**
   * Runs delete integrity preflight with stepped progress.
   * Electron: IPC `delete-preflight` + `delete-preflight-progress` push events.
   * Browser: POST `/api/delete-preflight` then poll `/api/delete-preflight-status`.
   */
  async runDeletePreflight(
    projectPath: string,
    ids: number[],
    onProgress?: (p: DeletePreflightProgress) => void
  ): Promise<DeletePreflightBridgeResponse> {
    try {
      const electron = window.electron;
      if (electron?.invoke) {
        return await withPreflightTimeout(
          (async (): Promise<DeletePreflightBridgeResponse> => {
            const jobId = crypto.randomUUID();
            const unsub =
              typeof electron.onDeletePreflightProgress === 'function'
                ? electron.onDeletePreflightProgress((payload: unknown) => {
                    if (!payload || typeof payload !== 'object') return;
                    const obj = payload as { jobId?: unknown };
                    if (obj.jobId !== jobId) return;
                    const progress = parsePreflightProgressPayload(payload);
                    if (progress) onProgress?.(progress);
                  })
                : undefined;
            try {
              return (await electron.invoke('delete-preflight', {
                projectPath,
                ids,
                jobId,
              })) as DeletePreflightBridgeResponse;
            } finally {
              unsub?.();
            }
          })()
        );
      }
      return await withPreflightTimeout(runDeletePreflightBrowser(projectPath, ids, onProgress));
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  invoke: async (channel: string, data?: any): Promise<any> => {
    const timeoutMs =
      channel === 'run-map-test' || channel === 'delete-maps' ? 120000 : 30000;
    // Create a timeout promise (longer for AI map tests)
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Request timed out after ${timeoutMs / 1000} seconds.`)), timeoutMs)
    );

    const callPromise = (async () => {
      if (window.electron?.invoke) {
        return window.electron.invoke(channel, data);
      }

      // Fallback to HTTP API for browser
      switch (channel) {
        case 'get-api-key': {
          const res = await fetch(`${API_BASE}/config/key`);
          const json = await res.json();
          return json.apiKey;
        }
        case 'has-api-key': {
          const res = await fetch(`${API_BASE}/config/has-key`);
          const json = await res.json();
          return json.hasKey;
        }
        case 'set-api-key': {
          // data can be a string (apiKey) or an object { apiKey, provider }
          const payload = typeof data === 'string' 
            ? { apiKey: data }
            : { apiKey: data.apiKey, provider: data.provider };
          const res = await fetch(`${API_BASE}/config/key`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const json = await res.json();
          return json.success;
        }
        case 'get-ai-provider': {
          const res = await fetch(`${API_BASE}/config/provider`);
          const json = await res.json();
          return json.provider || 'gemini';
        }
        case 'set-ai-provider': {
          const res = await fetch(`${API_BASE}/config/provider`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ useClaude: data }),
          });
          const json = await res.json();
          return json;
        }
        case 'select-directory': {
          const res = await fetch(`${API_BASE}/select-directory`);
          const json = await res.json();
          return json.path;
        }
        case 'init-project': {
          const res = await fetch(`${API_BASE}/init-project`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectPath: data }),
          });
          const json = await res.json();
          return json.success;
        }
        case 'ai-chat': {
          const res = await fetch(`${API_BASE}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });
          return res.json();
        }
        case 'debug-list-models': {
          const res = await fetch(`${API_BASE}/debug-list-models`);
          return res.json();
        }
        case 'get-stub-map-spec': {
          const res = await fetch(`${API_BASE}/stub/map-spec`);
          return res.json();
        }
        case 'compile-map-spec': {
          const res = await fetch(`${API_BASE}/compile-map-spec`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });
          return res.json();
        }
        case 'run-map-test': {
          const res = await fetch(`${API_BASE}/run-map-test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });
          return res.json();
        }
        case 'read-map': {
          const { projectPath, mapId } = data;
          const res = await fetch(`${API_BASE}/read-map/${mapId}?projectPath=${encodeURIComponent(projectPath)}`);
          return res.json();
        }
        case 'read-map-infos': {
          const { projectPath } = data;
          const res = await fetch(`${API_BASE}/read-map-infos?projectPath=${encodeURIComponent(projectPath)}`);
          return res.json();
        }
        case 'apply-map-infos-tree': {
          const res = await fetch(`${API_BASE}/apply-map-infos-tree`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });
          return res.json();
        }
        case 'delete-maps': {
          const res = await fetch(`${API_BASE}/delete-maps`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });
          return res.json();
        }
        case 'read-tilesets': {
          const { projectPath } = data;
          const res = await fetch(`${API_BASE}/read-tilesets?projectPath=${encodeURIComponent(projectPath)}`);
          return res.json();
        }
        case 'read-system': {
          const { projectPath } = data;
          const res = await fetch(`${API_BASE}/read-system?projectPath=${encodeURIComponent(projectPath)}`);
          return res.json();
        }
        case 'map-rxdata-exists': {
          const { projectPath, mapId } = data;
          const res = await fetch(
            `${API_BASE}/map-rxdata-exists?projectPath=${encodeURIComponent(projectPath)}&mapId=${encodeURIComponent(String(mapId))}`
          );
          return res.json();
        }
        case 'read-project-context': {
          const { projectPath } = data;
          const res = await fetch(`${API_BASE}/read-project-context?projectPath=${encodeURIComponent(projectPath)}`);
          return res.json();
        }
        case 'tileset-inspector': {
          const { projectPath, mapId, mapName } = data;
          let url = `${API_BASE}/tileset-inspector?projectPath=${encodeURIComponent(projectPath)}`;
          if (mapId) url += `&mapId=${mapId}`;
          if (mapName) url += `&mapName=${encodeURIComponent(mapName)}`;
          const res = await fetch(url);
          return res.json();
        }
        case 'ping': {
          const res = await fetch(`${API_BASE}/ping`);
          return res.json();
        }
        case 'set-active-model': {
          const res = await fetch(`${API_BASE}/config/model`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelName: data }),
          });
          const json = await res.json();
          return json.success;
        }
        case 'open-external-url': {
          window.open(data, '_blank');
          return;
        }
        default:
          throw new Error(`Unknown channel: ${channel}`);
      }
    })();

    // Race the call against the timeout
    return Promise.race([callPromise, timeoutPromise]);
  },
};

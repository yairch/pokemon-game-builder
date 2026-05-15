import { describe, it, expect, vi, beforeEach } from 'vitest';

const API_BASE = 'http://localhost:3001/api';

describe('bridge HTTP fallback URLs', () => {
  let bridge: typeof import('../services/bridge').bridge;

  beforeEach(async () => {
    // Ensure no Electron IPC -- force HTTP fallback
    // @ts-ignore
    delete (globalThis as any).window?.electron;

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({}),
    }));

    // Re-import to pick up the clean global state
    const mod = await import('../services/bridge');
    bridge = mod.bridge;
  });

  it('get-api-key fetches GET /config/key', async () => {
    await bridge.invoke('get-api-key');
    expect(fetch).toHaveBeenCalledWith(`${API_BASE}/config/key`);
  });

  it('has-api-key fetches GET /config/has-key', async () => {
    await bridge.invoke('has-api-key');
    expect(fetch).toHaveBeenCalledWith(`${API_BASE}/config/has-key`);
  });

  it('set-api-key POSTs to /config/key', async () => {
    await bridge.invoke('set-api-key', 'test-key-123');
    expect(fetch).toHaveBeenCalledWith(`${API_BASE}/config/key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'test-key-123' }),
    });
  });

  it('ai-chat POSTs to /chat', async () => {
    const payload = { message: 'hello', projectPath: '/tmp' };
    await bridge.invoke('ai-chat', payload);
    expect(fetch).toHaveBeenCalledWith(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  });

  it('read-map fetches GET /read-map/:id with projectPath query param', async () => {
    await bridge.invoke('read-map', { projectPath: '/my/project', mapId: 5 });
    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE}/read-map/5?projectPath=${encodeURIComponent('/my/project')}`
    );
  });

  it('map-rxdata-exists fetches GET with projectPath and mapId query params', async () => {
    await bridge.invoke('map-rxdata-exists', { projectPath: '/proj', mapId: 12 });
    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE}/map-rxdata-exists?projectPath=${encodeURIComponent('/proj')}&mapId=${encodeURIComponent('12')}`
    );
  });

  it('apply-map-infos-tree POSTs JSON body to /apply-map-infos-tree', async () => {
    const payload = {
      projectPath: '/proj',
      rows: [
        { id: 1, parentId: 0, order: 0 },
        { id: 2, parentId: 1, order: 0 },
      ],
    };
    await bridge.invoke('apply-map-infos-tree', payload);
    expect(fetch).toHaveBeenCalledWith(`${API_BASE}/apply-map-infos-tree`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  });

  it('read-tilesets fetches GET /read-tilesets with projectPath query param', async () => {
    await bridge.invoke('read-tilesets', { projectPath: '/my/project' });
    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE}/read-tilesets?projectPath=${encodeURIComponent('/my/project')}`
    );
  });

  it('tileset-inspector GET includes mapId when provided', async () => {
    await bridge.invoke('tileset-inspector', { projectPath: '/proj', mapId: 12 });
    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE}/tileset-inspector?projectPath=${encodeURIComponent('/proj')}&mapId=12`
    );
  });

  it('ping fetches GET /ping', async () => {
    await bridge.invoke('ping');
    expect(fetch).toHaveBeenCalledWith(`${API_BASE}/ping`);
  });

  it('throws on unknown channel', async () => {
    await expect(bridge.invoke('nonexistent-channel')).rejects.toThrow('Unknown channel');
  });

  it('delete-maps POSTs JSON body to /delete-maps', async () => {
    const body = {
      projectPath: '/proj',
      payload: { ids: [1, 2], newStartMapId: 3, newEditMapId: 3 },
    };
    await bridge.invoke('delete-maps', body);
    expect(fetch).toHaveBeenCalledWith(`${API_BASE}/delete-maps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  });

  it('runDeletePreflight polls delete-preflight-status until done (HTTP)', async () => {
    vi.resetModules();
    const win = globalThis as unknown as { window?: Window & { electron?: unknown } };
    if (win.window && 'electron' in win.window) {
      delete win.window.electron;
    }

    const minimalResult = {
      requestedIds: [5],
      deletedIds: [5],
      survivorIds: [],
      newStartMapId: 0,
      newEditMapId: 0,
      startMapPickRequired: false,
      references: [],
      blockers: [],
      warnings: [],
      scanCounts: {
        mapsScanned: 0,
        mapsTotal: 0,
        mapsFailed: 0,
        scriptsScanned: false,
        sectionErrors: 0,
      },
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({ success: true, jobId: 'job-test-1' }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          success: true,
          progress: { step: 'scripts' as const },
          done: true,
          result: minimalResult,
          error: null,
        }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const { bridge: freshBridge } = await import('../services/bridge');
    const out = await freshBridge.runDeletePreflight('/tmp/proj', [5]);

    expect(out.success).toBe(true);
    expect(out.data).toEqual(minimalResult);
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/delete-preflight`, expect.any(Object));
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${API_BASE}/delete-preflight-status?jobId=${encodeURIComponent('job-test-1')}`,
    );
  });
});

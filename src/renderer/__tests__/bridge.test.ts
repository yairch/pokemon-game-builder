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
});

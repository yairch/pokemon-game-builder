const API_BASE = 'http://localhost:3001/api';

export const bridge = {
  invoke: async (channel: string, data?: any): Promise<any> => {
    // Create a timeout promise (30s for API calls that may try multiple models)
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out after 30 seconds.')), 30000)
    );

    const callPromise = (async () => {
      // @ts-ignore
      if (window.electron) {
        // @ts-ignore
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

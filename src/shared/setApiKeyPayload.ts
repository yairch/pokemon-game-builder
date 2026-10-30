type AIProvider = 'claude' | 'gemini';

export type SetApiKeyPayload = string | { apiKey: string; provider?: AIProvider };

/** `set-api-key` accepts a bare key or `{ apiKey, provider }`; both transports normalize here. */
export function normalizeSetApiKeyPayload(data: SetApiKeyPayload): { apiKey: string; provider?: AIProvider } {
  return typeof data === 'string' ? { apiKey: data } : { apiKey: data.apiKey, provider: data.provider };
}

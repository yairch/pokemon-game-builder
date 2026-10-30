import { describe, expect, it } from 'vitest';
import { normalizeSetApiKeyPayload } from './setApiKeyPayload';

describe('normalizeSetApiKeyPayload', () => {
  it('wraps a bare key', () => {
    expect(normalizeSetApiKeyPayload('abc')).toEqual({ apiKey: 'abc' });
  });

  it('unpacks an object payload so the key stays a string', () => {
    expect(normalizeSetApiKeyPayload({ apiKey: 'abc', provider: 'claude' })).toEqual({
      apiKey: 'abc',
      provider: 'claude',
    });
  });
});

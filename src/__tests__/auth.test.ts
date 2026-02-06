import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import app from '../index';
import { createMockBindings } from './mocks/kv';
import { validMessageRequest, successResponse } from './fixtures/requests';
import { createSuccessResponse } from './mocks/fetch';
import { validProvider } from './fixtures/providers';

describe('Proxy Authentication', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockResolvedValue(createSuccessResponse(successResponse));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function createProxyRequest(headers: Record<string, string> = {}) {
    return new Request('http://localhost/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(validMessageRequest),
    });
  }

  it('allows request when no tokens are configured', async () => {
    const env = createMockBindings({
      kvData: { 
        providers: JSON.stringify([validProvider]),
        // No allowed_tokens set
      },
    });
    const request = createProxyRequest();

    const response = await app.fetch(request, env);

    expect(response.status).toBe(200);
  });

  it('blocks request when tokens are configured but header is missing', async () => {
    const env = createMockBindings({
      kvData: { 
        providers: JSON.stringify([validProvider]),
        allowed_tokens: JSON.stringify(['valid-token']),
      },
    });
    const request = createProxyRequest(); // No auth header

    const response = await app.fetch(request, env);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({
      error: {
        type: 'authentication_error',
        message: 'Invalid or missing x-claude-code-fallback-api-key',
      },
    });
  });

  it('blocks request when tokens are configured and header is invalid', async () => {
    const env = createMockBindings({
      kvData: { 
        providers: JSON.stringify([validProvider]),
        allowed_tokens: JSON.stringify(['valid-token']),
      },
    });
    const request = createProxyRequest({
      'x-claude-code-fallback-api-key': 'invalid-token',
    });

    const response = await app.fetch(request, env);

    expect(response.status).toBe(401);
  });

  it('allows request when tokens are configured and valid header is provided', async () => {
    const env = createMockBindings({
      kvData: { 
        providers: JSON.stringify([validProvider]),
        allowed_tokens: JSON.stringify(['valid-token', 'another-token']),
      },
    });
    const request = createProxyRequest({
      'x-claude-code-fallback-api-key': 'another-token',
    });

    const response = await app.fetch(request, env);

    expect(response.status).toBe(200);
  });
});

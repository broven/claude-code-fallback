/**
 * Additional tests to improve branch coverage for admin.ts
 * Focuses on uncovered edge cases and error paths
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import {
  authMiddleware,
  getTokens,
  postTokens,
  postSettings,
  testProvider,
} from '../admin';
import { Bindings, TokenConfig } from '../types';
import { createMockBindings } from './mocks/kv';

// Mock fetch for testProvider
const originalFetch = globalThis.fetch;

function createTestApp() {
  const app = new Hono<{ Bindings: Bindings }>();
  app.get('/admin/tokens', authMiddleware, getTokens);
  app.post('/admin/tokens', authMiddleware, postTokens);
  app.post('/admin/settings', authMiddleware, postSettings);
  app.post('/admin/test-provider', authMiddleware, testProvider);
  return app;
}

function createRequest(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string;
  } = {}
) {
  const { method = 'GET', body, token } = options;
  const url = token ? `http://localhost${path}?token=${token}` : `http://localhost${path}`;

  return new Request(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('getTokens edge cases', () => {
  let app: Hono<{ Bindings: Bindings }>;

  beforeEach(() => {
    app = createTestApp();
  });

  it('returns empty array when tokens is not an array', async () => {
    const env = createMockBindings({
      adminToken: 'test-token',
      kvData: { allowed_tokens: JSON.stringify({ invalid: 'format' }) },
    });
    const request = createRequest('/admin/tokens', { token: 'test-token' });

    const response = await app.fetch(request, env);
    const data = await response.json() as TokenConfig[];

    expect(response.status).toBe(200);
    expect(data).toEqual([]);
  });

  it('handles tokens as array of strings', async () => {
    const env = createMockBindings({
      adminToken: 'test-token',
      kvData: { allowed_tokens: JSON.stringify(['token1', 'token2']) },
    });
    const request = createRequest('/admin/tokens', { token: 'test-token' });

    const response = await app.fetch(request, env);
    const data = await response.json() as TokenConfig[];

    expect(response.status).toBe(200);
    expect(data.length).toBe(2);
    expect(data[0].token).toBe('token1');
    expect(data[1].token).toBe('token2');
  });

  it('handles tokens as array of objects with notes', async () => {
    const env = createMockBindings({
      adminToken: 'test-token',
      kvData: {
        allowed_tokens: JSON.stringify([
          { token: 'token1', note: 'Production key' },
          { token: 'token2', note: 'Dev key' },
        ]),
      },
    });
    const request = createRequest('/admin/tokens', { token: 'test-token' });

    const response = await app.fetch(request, env);
    const data = await response.json() as TokenConfig[];

    expect(response.status).toBe(200);
    expect(data.length).toBe(2);
    expect(data[0].note).toBe('Production key');
    expect(data[1].note).toBe('Dev key');
  });
});

describe('postTokens validation', () => {
  let app: Hono<{ Bindings: Bindings }>;

  beforeEach(() => {
    app = createTestApp();
  });

  it('rejects non-array tokens', async () => {
    const env = createMockBindings({ adminToken: 'test-token' });
    const request = createRequest('/admin/tokens', {
      method: 'POST',
      token: 'test-token',
      body: { invalid: 'format' },
    });

    const response = await app.fetch(request, env);
    const data = await response.json() as { error: string };

    expect(response.status).toBe(400);
    expect(data.error).toContain('array');
  });

  it('rejects invalid note format (special characters)', async () => {
    const env = createMockBindings({ adminToken: 'test-token' });
    const request = createRequest('/admin/tokens', {
      method: 'POST',
      token: 'test-token',
      body: [
        { token: 'token1', note: 'Invalid@Note!' },
      ],
    });

    const response = await app.fetch(request, env);
    const data = await response.json() as { error: string };

    expect(response.status).toBe(400);
    expect(data.error).toContain('English letters, numbers, spaces, and hyphens');
  });

  it('accepts valid note with letters, numbers, spaces, and hyphens', async () => {
    const env = createMockBindings({ adminToken: 'test-token' });
    const request = createRequest('/admin/tokens', {
      method: 'POST',
      token: 'test-token',
      body: [
        { token: 'token1', note: 'Production Key 2024-01' },
        { token: 'token2', note: 'Dev Environment' },
      ],
    });

    const response = await app.fetch(request, env);
    const data = await response.json() as { success: boolean; count: number };

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.count).toBe(2);
  });

  it('handles tokens without notes', async () => {
    const env = createMockBindings({ adminToken: 'test-token' });
    const request = createRequest('/admin/tokens', {
      method: 'POST',
      token: 'test-token',
      body: ['token1', 'token2'],
    });

    const response = await app.fetch(request, env);
    const data = await response.json() as { success: boolean; count: number };

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.count).toBe(2);
  });

  it('handles JSON parsing errors', async () => {
    const env = createMockBindings({ adminToken: 'test-token' });
    const request = new Request('http://localhost/admin/tokens?token=test-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid json{',
    });

    const response = await app.fetch(request, env);

    expect(response.status).toBe(400);
  });
});

describe('postSettings validation', () => {
  let app: Hono<{ Bindings: Bindings }>;

  beforeEach(() => {
    app = createTestApp();
  });

  it('rejects negative cooldown duration', async () => {
    const env = createMockBindings({ adminToken: 'test-token' });
    const request = createRequest('/admin/settings', {
      method: 'POST',
      token: 'test-token',
      body: { cooldownDuration: -100 },
    });

    const response = await app.fetch(request, env);
    const data = await response.json() as { error: string };

    expect(response.status).toBe(400);
    expect(data.error).toContain('Invalid cooldown duration');
  });

  it('rejects non-number cooldown duration', async () => {
    const env = createMockBindings({ adminToken: 'test-token' });
    const request = createRequest('/admin/settings', {
      method: 'POST',
      token: 'test-token',
      body: { cooldownDuration: 'invalid' },
    });

    const response = await app.fetch(request, env);
    const data = await response.json() as { error: string };

    expect(response.status).toBe(400);
    expect(data.error).toContain('Invalid cooldown duration');
  });

  it('accepts valid cooldown duration', async () => {
    const env = createMockBindings({ adminToken: 'test-token' });
    const request = createRequest('/admin/settings', {
      method: 'POST',
      token: 'test-token',
      body: { cooldownDuration: 5000 },
    });

    const response = await app.fetch(request, env);
    const data = await response.json() as { success: boolean };

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('accepts zero cooldown duration', async () => {
    const env = createMockBindings({ adminToken: 'test-token' });
    const request = createRequest('/admin/settings', {
      method: 'POST',
      token: 'test-token',
      body: { cooldownDuration: 0 },
    });

    const response = await app.fetch(request, env);
    const data = await response.json() as { success: boolean };

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('handles JSON parsing errors', async () => {
    const env = createMockBindings({ adminToken: 'test-token' });
    const request = new Request('http://localhost/admin/settings?token=test-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not valid json',
    });

    const response = await app.fetch(request, env);

    expect(response.status).toBe(400);
  });
});

describe('testProvider success and error paths', () => {
  let app: Hono<{ Bindings: Bindings }>;

  beforeEach(() => {
    app = createTestApp();
    vi.clearAllMocks();
  });

  it('returns success for HTTP 200 response', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'msg_123', content: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    globalThis.fetch = mockFetch as any;

    const env = createMockBindings({ adminToken: 'test-token' });
    const request = createRequest('/admin/test-provider', {
      method: 'POST',
      token: 'test-token',
      body: {
        name: 'test-provider',
        baseUrl: 'https://api.example.com/v1/messages',
        apiKey: 'sk-test-key',
      },
    });

    const response = await app.fetch(request, env);
    const data = await response.json() as any;

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.results).toHaveLength(4);
    data.results.forEach((r: any) => {
      expect(r.success).toBe(true);
      expect(r.message).toContain('200');
    });

    globalThis.fetch = originalFetch;
  });

  it('returns success for HTTP 201 response', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'msg_123' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    globalThis.fetch = mockFetch as any;

    const env = createMockBindings({ adminToken: 'test-token' });
    const request = createRequest('/admin/test-provider', {
      method: 'POST',
      token: 'test-token',
      body: {
        name: 'test-provider',
        baseUrl: 'https://api.example.com/v1/messages',
        apiKey: 'sk-test-key',
      },
    });

    const response = await app.fetch(request, env);
    const data = await response.json() as any;

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.results).toHaveLength(4);
    data.results.forEach((r: any) => {
      expect(r.success).toBe(true);
      expect(r.message).toContain('201');
    });

    globalThis.fetch = originalFetch;
  });

  it('handles HTTP error with JSON error message', async () => {
    const mockFetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ error: { message: 'Invalid API key' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }))
    );
    globalThis.fetch = mockFetch as any;

    const env = createMockBindings({ adminToken: 'test-token' });
    const request = createRequest('/admin/test-provider', {
      method: 'POST',
      token: 'test-token',
      body: {
        name: 'test-provider',
        baseUrl: 'https://api.example.com/v1/messages',
        apiKey: 'invalid-key',
      },
    });

    const response = await app.fetch(request, env);
    const data = await response.json() as any;

    expect(response.status).toBe(200);
    expect(data.success).toBe(false);
    data.results.forEach((r: any) => {
      expect(r.success).toBe(false);
      expect(r.error).toContain('Invalid API key');
    });

    globalThis.fetch = originalFetch;
  });

  it('handles HTTP error with plain text response (short)', async () => {
    const mockFetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response('Unauthorized', {
        status: 401,
        headers: { 'Content-Type': 'text/plain' },
      }))
    );
    globalThis.fetch = mockFetch as any;

    const env = createMockBindings({ adminToken: 'test-token' });
    const request = createRequest('/admin/test-provider', {
      method: 'POST',
      token: 'test-token',
      body: {
        name: 'test-provider',
        baseUrl: 'https://api.example.com/v1/messages',
        apiKey: 'invalid-key',
      },
    });

    const response = await app.fetch(request, env);
    const data = await response.json() as any;

    expect(response.status).toBe(200);
    expect(data.success).toBe(false);
    data.results.forEach((r: any) => {
      expect(r.success).toBe(false);
      expect(r.error).toContain('Unauthorized');
    });

    globalThis.fetch = originalFetch;
  });

  it('handles HTTP error with long text response (truncated)', async () => {
    const longText = 'A'.repeat(250);
    const mockFetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(longText, {
        status: 500,
        headers: { 'Content-Type': 'text/html' },
      }))
    );
    globalThis.fetch = mockFetch as any;

    const env = createMockBindings({ adminToken: 'test-token' });
    const request = createRequest('/admin/test-provider', {
      method: 'POST',
      token: 'test-token',
      body: {
        name: 'test-provider',
        baseUrl: 'https://api.example.com/v1/messages',
        apiKey: 'sk-test-key',
      },
    });

    const response = await app.fetch(request, env);
    const data = await response.json() as any;

    expect(response.status).toBe(200);
    expect(data.success).toBe(false);
    data.results.forEach((r: any) => {
      expect(r.success).toBe(false);
      expect(r.error).toContain('HTTP 500');
      expect(r.error).not.toContain(longText);
    });

    globalThis.fetch = originalFetch;
  });

  it('handles Authorization header with existing Bearer prefix', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'msg_123' }), { status: 200 })
    );
    globalThis.fetch = mockFetch as any;

    const env = createMockBindings({ adminToken: 'test-token' });
    const request = createRequest('/admin/test-provider', {
      method: 'POST',
      token: 'test-token',
      body: {
        name: 'test-provider',
        baseUrl: 'https://api.example.com/v1/messages',
        apiKey: 'Bearer sk-test-key',
        authHeader: 'Authorization',
      },
    });

    const response = await app.fetch(request, env);
    const data = await response.json() as { success: boolean };

    expect(data.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test-key',
        }),
      })
    );

    globalThis.fetch = originalFetch;
  });

  it('adds Bearer prefix when using Authorization header without it', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'msg_123' }), { status: 200 })
    );
    globalThis.fetch = mockFetch as any;

    const env = createMockBindings({ adminToken: 'test-token' });
    const request = createRequest('/admin/test-provider', {
      method: 'POST',
      token: 'test-token',
      body: {
        name: 'test-provider',
        baseUrl: 'https://api.example.com/v1/messages',
        apiKey: 'sk-test-key',
        authHeader: 'Authorization',
      },
    });

    const response = await app.fetch(request, env);
    const data = await response.json() as { success: boolean };

    expect(data.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test-key',
        }),
      })
    );

    globalThis.fetch = originalFetch;
  });

  it('applies custom headers from provider config', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'msg_123' }), { status: 200 })
    );
    globalThis.fetch = mockFetch as any;

    const env = createMockBindings({ adminToken: 'test-token' });
    const request = createRequest('/admin/test-provider', {
      method: 'POST',
      token: 'test-token',
      body: {
        name: 'test-provider',
        baseUrl: 'https://api.example.com/v1/messages',
        apiKey: 'sk-test-key',
        headers: {
          'X-Custom-Header': 'custom-value',
          'HTTP-Referer': 'https://example.com',
        },
      },
    });

    const response = await app.fetch(request, env);
    const data = await response.json() as { success: boolean };

    expect(data.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Custom-Header': 'custom-value',
          'HTTP-Referer': 'https://example.com',
        }),
      })
    );

    globalThis.fetch = originalFetch;
  });

  it('applies model mapping when configured', async () => {
    const fetchBodies: any[] = [];
    const mockFetch = vi.fn().mockImplementation((_url: string, options: any) => {
      fetchBodies.push(JSON.parse(options.body));
      return Promise.resolve(
        new Response(JSON.stringify({ id: 'msg_123' }), { status: 200 })
      );
    });
    globalThis.fetch = mockFetch as any;

    const env = createMockBindings({ adminToken: 'test-token' });
    const request = createRequest('/admin/test-provider', {
      method: 'POST',
      token: 'test-token',
      body: {
        name: 'test-provider',
        baseUrl: 'https://api.example.com/v1/messages',
        apiKey: 'sk-test-key',
        modelMapping: {
          'claude-sonnet-4-20250514': 'anthropic/claude-sonnet-4',
        },
      },
    });

    const response = await app.fetch(request, env);
    const data = await response.json() as any;

    expect(data.success).toBe(true);
    const models = fetchBodies.map((b) => b.model);
    expect(models).toContain('anthropic/claude-sonnet-4');
    // Unmapped models use original IDs
    expect(models).toContain('claude-opus-4-20250514');
    expect(models).toContain('claude-3-5-haiku-20241022');

    // Check mappedTo in results
    const sonnetResult = data.results.find((r: any) => r.model === 'claude-sonnet-4-20250514');
    expect(sonnetResult.mappedTo).toBe('anthropic/claude-sonnet-4');
    expect(sonnetResult.hasMappingConfigured).toBe(true);

    const opusResult = data.results.find((r: any) => r.model === 'claude-opus-4-20250514');
    expect(opusResult.mappedTo).toBeUndefined();
    expect(opusResult.hasMappingConfigured).toBe(false);

    globalThis.fetch = originalFetch;
  });

  it('handles network errors', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    globalThis.fetch = mockFetch as any;

    const env = createMockBindings({ adminToken: 'test-token' });
    const request = createRequest('/admin/test-provider', {
      method: 'POST',
      token: 'test-token',
      body: {
        name: 'test-provider',
        baseUrl: 'https://api.example.com/v1/messages',
        apiKey: 'sk-test-key',
      },
    });

    const response = await app.fetch(request, env);
    const data = await response.json() as any;

    expect(response.status).toBe(200);
    expect(data.success).toBe(false);
    data.results.forEach((r: any) => {
      expect(r.success).toBe(false);
      expect(r.error).toContain('Network error');
    });

    globalThis.fetch = originalFetch;
  });

  it('handles timeout (AbortError)', async () => {
    const mockFetch = vi.fn().mockImplementation(() => {
      return new Promise((_resolve, reject) => {
        setTimeout(() => {
          const error = new Error('The operation was aborted');
          error.name = 'AbortError';
          reject(error);
        }, 100);
      });
    });
    globalThis.fetch = mockFetch as any;

    const env = createMockBindings({ adminToken: 'test-token' });
    const request = createRequest('/admin/test-provider', {
      method: 'POST',
      token: 'test-token',
      body: {
        name: 'test-provider',
        baseUrl: 'https://api.example.com/v1/messages',
        apiKey: 'sk-test-key',
      },
    });

    const response = await app.fetch(request, env);
    const data = await response.json() as any;

    expect(response.status).toBe(200);
    expect(data.success).toBe(false);
    data.results.forEach((r: any) => {
      expect(r.success).toBe(false);
      expect(r.error).toContain('timed out');
    });

    globalThis.fetch = originalFetch;
  }, 15000); // Increase timeout for this test

  it('returns results array with 4 models', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'msg_test' }), { status: 200 })
    );
    globalThis.fetch = mockFetch as any;

    const env = createMockBindings({ adminToken: 'test-token' });
    const request = createRequest('/admin/test-provider', {
      method: 'POST',
      token: 'test-token',
      body: {
        name: 'test-provider',
        baseUrl: 'https://api.example.com/v1/messages',
        apiKey: 'sk-test-key',
      },
    });

    const response = await app.fetch(request, env);
    const data = await response.json() as any;

    expect(data.success).toBe(true);
    expect(data.results).toHaveLength(4);
    expect(data.results.map((r: any) => r.model)).toEqual([
      'claude-sonnet-4-20250514',
      'claude-opus-4-20250514',
      'claude-opus-4-6-20250415',
      'claude-3-5-haiku-20241022',
    ]);
    data.results.forEach((r: any) => {
      expect(r.success).toBe(true);
      expect(r.label).toBeDefined();
    });

    globalThis.fetch = originalFetch;
  });

  it('reports per-model failures independently', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(
          new Response(JSON.stringify({ id: 'msg_test' }), { status: 200 })
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ error: { message: 'Model not found' } }), { status: 404 })
      );
    });
    globalThis.fetch = mockFetch as any;

    const env = createMockBindings({ adminToken: 'test-token' });
    const request = createRequest('/admin/test-provider', {
      method: 'POST',
      token: 'test-token',
      body: {
        name: 'test-provider',
        baseUrl: 'https://api.example.com/v1/messages',
        apiKey: 'sk-test-key',
      },
    });

    const response = await app.fetch(request, env);
    const data = await response.json() as any;

    expect(data.success).toBe(false);
    expect(data.results.filter((r: any) => r.success)).toHaveLength(1);
    expect(data.results.filter((r: any) => !r.success)).toHaveLength(3);

    globalThis.fetch = originalFetch;
  });

  it('includes suggestion when models fail without mapping', async () => {
    const mockFetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 }))
    );
    globalThis.fetch = mockFetch as any;

    const env = createMockBindings({ adminToken: 'test-token' });
    const request = createRequest('/admin/test-provider', {
      method: 'POST',
      token: 'test-token',
      body: {
        name: 'test-provider',
        baseUrl: 'https://api.example.com/v1/messages',
        apiKey: 'sk-test-key',
      },
    });

    const response = await app.fetch(request, env);
    const data = await response.json() as any;

    expect(data.success).toBe(false);
    expect(data.suggestion).toBeDefined();
    expect(data.suggestion).toContain('model mapping');

    globalThis.fetch = originalFetch;
  });

  it('does not include suggestion when failed models have mappings', async () => {
    const mockFetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ error: { message: 'Auth error' } }), { status: 401 }))
    );
    globalThis.fetch = mockFetch as any;

    const env = createMockBindings({ adminToken: 'test-token' });
    const request = createRequest('/admin/test-provider', {
      method: 'POST',
      token: 'test-token',
      body: {
        name: 'test-provider',
        baseUrl: 'https://api.example.com/v1/messages',
        apiKey: 'sk-test-key',
        modelMapping: {
          'claude-sonnet-4-20250514': 'mapped-sonnet',
          'claude-opus-4-20250514': 'mapped-opus',
          'claude-opus-4-6-20250415': 'mapped-opus-46',
          'claude-3-5-haiku-20241022': 'mapped-haiku',
        },
      },
    });

    const response = await app.fetch(request, env);
    const data = await response.json() as any;

    expect(data.success).toBe(false);
    expect(data.suggestion).toBeUndefined();

    globalThis.fetch = originalFetch;
  });
});

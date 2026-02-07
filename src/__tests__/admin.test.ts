import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import {
  authMiddleware,
  adminPage,
  getConfig,
  postConfig,
  getSettings,
  postSettings,
} from '../admin';
import { Bindings } from '../types';
import { createMockBindings } from './mocks/kv';
import {
  validProvider,
  minimalProvider,
  multipleProviders,
  invalidProviderMissingName,
  invalidProviderMissingApiKey,
} from './fixtures/providers';

// Helper to create a Hono app with routes for testing
function createTestApp() {
  const app = new Hono<{ Bindings: Bindings }>();
  app.get('/admin', authMiddleware, adminPage);
  app.get('/admin/config', authMiddleware, getConfig);
  app.post('/admin/config', authMiddleware, postConfig);
  app.get('/admin/settings', authMiddleware, getSettings);
  app.post('/admin/settings', authMiddleware, postSettings);
  return app;
}

// Helper to create a request
function createRequest(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string;
    authHeader?: string;
  } = {}
) {
  const { method = 'GET', body, token, authHeader } = options;
  const url = token ? `http://localhost${path}?token=${token}` : `http://localhost${path}`;
  const headers: Record<string, string> = {};

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  return new Request(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('authMiddleware', () => {
  let app: Hono<{ Bindings: Bindings }>;

  beforeEach(() => {
    app = createTestApp();
  });

  describe('token authentication', () => {
    it('allows access with valid token in query string', async () => {
      const env = createMockBindings({ adminToken: 'valid-token' });
      const request = createRequest('/admin/config', { token: 'valid-token' });

      const response = await app.fetch(request, env);

      expect(response.status).toBe(200);
    });

    it('allows access with valid token in Authorization header', async () => {
      const env = createMockBindings({ adminToken: 'valid-token' });
      const request = createRequest('/admin/config', {
        authHeader: 'Bearer valid-token',
      });

      const response = await app.fetch(request, env);

      expect(response.status).toBe(200);
    });

    it('returns 401 for invalid token', async () => {
      const env = createMockBindings({ adminToken: 'valid-token' });
      const request = createRequest('/admin/config', { token: 'wrong-token' });

      const response = await app.fetch(request, env);

      expect(response.status).toBe(401);
      expect(await response.text()).toBe('Unauthorized');
    });

    it('returns 401 when token is missing', async () => {
      const env = createMockBindings({ adminToken: 'valid-token' });
      const request = createRequest('/admin/config');

      const response = await app.fetch(request, env);

      expect(response.status).toBe(401);
    });

    it('returns 500 when ADMIN_TOKEN is not configured', async () => {
      const env = createMockBindings();
      env.ADMIN_TOKEN = '';
      const request = createRequest('/admin/config', { token: 'any-token' });

      const response = await app.fetch(request, env);

      expect(response.status).toBe(500);
      expect(await response.text()).toBe('ADMIN_TOKEN not configured');
    });

    it('prefers query token over Authorization header', async () => {
      const env = createMockBindings({ adminToken: 'valid-token' });
      const request = createRequest('/admin/config', {
        token: 'valid-token',
        authHeader: 'Bearer wrong-token',
      });

      const response = await app.fetch(request, env);

      expect(response.status).toBe(200);
    });

    it('handles Bearer prefix correctly', async () => {
      const env = createMockBindings({ adminToken: 'my-secret-token' });
      const request = createRequest('/admin/config', {
        authHeader: 'Bearer my-secret-token',
      });

      const response = await app.fetch(request, env);

      expect(response.status).toBe(200);
    });
  });
});

describe('adminPage', () => {
  let app: Hono<{ Bindings: Bindings }>;

  beforeEach(() => {
    app = createTestApp();
  });

  it('returns HTML content type', async () => {
    const env = createMockBindings({ adminToken: 'test-token' });
    const request = createRequest('/admin', { token: 'test-token' });

    const response = await app.fetch(request, env);

    expect(response.headers.get('content-type')).toContain('text/html');
  });

  it('includes admin page title', async () => {
    const env = createMockBindings({ adminToken: 'test-token' });
    const request = createRequest('/admin', { token: 'test-token' });

    const response = await app.fetch(request, env);
    const html = await response.text();

    expect(html).toContain('Claude Code Fallback');
    expect(html).toContain('Admin');
  });

  it('includes token in rendered page for client-side use', async () => {
    const env = createMockBindings({ adminToken: 'test-token' });
    const request = createRequest('/admin', { token: 'test-token' });

    const response = await app.fetch(request, env);
    const html = await response.text();

    expect(html).toContain('test-token');
  });

  it('includes current config in rendered page', async () => {
    const env = createMockBindings({
      adminToken: 'test-token',
      kvData: { providers: JSON.stringify([validProvider]) },
    });
    const request = createRequest('/admin', { token: 'test-token' });

    const response = await app.fetch(request, env);
    const html = await response.text();

    expect(html).toContain('openrouter');
  });

  it('escapes HTML in config data', async () => {
    const providerWithXss = {
      name: '<script>alert("xss")</script>',
      baseUrl: 'https://api.example.com',
      apiKey: 'test-key',
    };
    const env = createMockBindings({
      adminToken: 'test-token',
      kvData: { providers: JSON.stringify([providerWithXss]) },
    });
    const request = createRequest('/admin', { token: 'test-token' });

    const response = await app.fetch(request, env);
    const html = await response.text();

    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('returns 200 status', async () => {
    const env = createMockBindings({ adminToken: 'test-token' });
    const request = createRequest('/admin', { token: 'test-token' });

    const response = await app.fetch(request, env);

    expect(response.status).toBe(200);
  });
});

describe('getConfig', () => {
  let app: Hono<{ Bindings: Bindings }>;

  beforeEach(() => {
    app = createTestApp();
  });

  it('returns JSON content type', async () => {
    const env = createMockBindings({ adminToken: 'test-token' });
    const request = createRequest('/admin/config', { token: 'test-token' });

    const response = await app.fetch(request, env);

    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('returns empty array when no providers configured', async () => {
    const env = createMockBindings({ adminToken: 'test-token' });
    const request = createRequest('/admin/config', { token: 'test-token' });

    const response = await app.fetch(request, env);
    const data = await response.json();

    expect(data).toEqual([]);
  });

  it('returns single provider', async () => {
    const env = createMockBindings({
      adminToken: 'test-token',
      kvData: { providers: JSON.stringify([validProvider]) },
    });
    const request = createRequest('/admin/config', { token: 'test-token' });

    const response = await app.fetch(request, env);
    const data = (await response.json()) as { name: string }[];

    expect(data).toHaveLength(1);
    expect(data[0].name).toBe(validProvider.name);
  });

  it('returns multiple providers', async () => {
    const env = createMockBindings({
      adminToken: 'test-token',
      kvData: { providers: JSON.stringify(multipleProviders) },
    });
    const request = createRequest('/admin/config', { token: 'test-token' });

    const response = await app.fetch(request, env);
    const data = await response.json();

    expect(data).toHaveLength(3);
  });

  it('includes all provider properties in response', async () => {
    const env = createMockBindings({
      adminToken: 'test-token',
      kvData: { providers: JSON.stringify([validProvider]) },
    });
    const request = createRequest('/admin/config', { token: 'test-token' });

    const response = await app.fetch(request, env);
    const data = (await response.json()) as typeof validProvider[];

    expect(data[0]).toEqual(validProvider);
  });

  it('returns 200 status', async () => {
    const env = createMockBindings({ adminToken: 'test-token' });
    const request = createRequest('/admin/config', { token: 'test-token' });

    const response = await app.fetch(request, env);

    expect(response.status).toBe(200);
  });
});

describe('postConfig', () => {
  let app: Hono<{ Bindings: Bindings }>;

  beforeEach(() => {
    app = createTestApp();
  });

  describe('successful saves', () => {
    it('saves single valid provider', async () => {
      const env = createMockBindings({ adminToken: 'test-token' });
      const request = createRequest('/admin/config', {
        method: 'POST',
        token: 'test-token',
        body: [validProvider],
      });

      const response = await app.fetch(request, env);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ success: true, count: 1 });
    });

    it('saves multiple valid providers', async () => {
      const env = createMockBindings({ adminToken: 'test-token' });
      const request = createRequest('/admin/config', {
        method: 'POST',
        token: 'test-token',
        body: multipleProviders,
      });

      const response = await app.fetch(request, env);
      const data = await response.json();

      expect(data).toEqual({ success: true, count: 3 });
    });

    it('saves empty array', async () => {
      const env = createMockBindings({ adminToken: 'test-token' });
      const request = createRequest('/admin/config', {
        method: 'POST',
        token: 'test-token',
        body: [],
      });

      const response = await app.fetch(request, env);
      const data = await response.json();

      expect(data).toEqual({ success: true, count: 0 });
    });

    it('persists saved config', async () => {
      const env = createMockBindings({ adminToken: 'test-token' });
      const saveRequest = createRequest('/admin/config', {
        method: 'POST',
        token: 'test-token',
        body: [validProvider],
      });

      await app.fetch(saveRequest, env);

      // Verify by fetching config
      const getRequest = createRequest('/admin/config', { token: 'test-token' });
      const response = await app.fetch(getRequest, env);
      const data = (await response.json()) as typeof validProvider[];

      expect(data).toHaveLength(1);
      expect(data[0].name).toBe(validProvider.name);
    });

    it('overwrites existing config', async () => {
      const env = createMockBindings({
        adminToken: 'test-token',
        kvData: { providers: JSON.stringify([validProvider]) },
      });
      const request = createRequest('/admin/config', {
        method: 'POST',
        token: 'test-token',
        body: [minimalProvider],
      });

      await app.fetch(request, env);

      // Verify overwrite
      const getRequest = createRequest('/admin/config', { token: 'test-token' });
      const response = await app.fetch(getRequest, env);
      const data = (await response.json()) as typeof minimalProvider[];

      expect(data).toHaveLength(1);
      expect(data[0].name).toBe(minimalProvider.name);
    });
  });

  describe('validation errors', () => {
    it('returns 400 when body is not an array', async () => {
      const env = createMockBindings({ adminToken: 'test-token' });
      const request = createRequest('/admin/config', {
        method: 'POST',
        token: 'test-token',
        body: { notAnArray: true },
      });

      const response = await app.fetch(request, env);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Config must be an array' });
    });

    it('returns 400 when provider missing name', async () => {
      const env = createMockBindings({ adminToken: 'test-token' });
      const request = createRequest('/admin/config', {
        method: 'POST',
        token: 'test-token',
        body: [invalidProviderMissingName],
      });

      const response = await app.fetch(request, env);
      const data = (await response.json()) as { error: string };

      expect(response.status).toBe(400);
      expect(data.error).toContain('missing name, baseUrl, or apiKey');
    });

    it('returns 400 when provider missing baseUrl', async () => {
      const env = createMockBindings({ adminToken: 'test-token' });
      const request = createRequest('/admin/config', {
        method: 'POST',
        token: 'test-token',
        body: [{ name: 'test', apiKey: 'key' }],
      });

      const response = await app.fetch(request, env);

      expect(response.status).toBe(400);
    });

    it('returns 400 when provider missing apiKey', async () => {
      const env = createMockBindings({ adminToken: 'test-token' });
      const request = createRequest('/admin/config', {
        method: 'POST',
        token: 'test-token',
        body: [invalidProviderMissingApiKey],
      });

      const response = await app.fetch(request, env);

      expect(response.status).toBe(400);
    });

    it('returns 400 for invalid JSON body', async () => {
      const env = createMockBindings({ adminToken: 'test-token' });
      const request = new Request('http://localhost/admin/config?token=test-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not valid json{',
      });

      const response = await app.fetch(request, env);

      expect(response.status).toBe(400);
    });

    it('validates all providers in array', async () => {
      const env = createMockBindings({ adminToken: 'test-token' });
      const request = createRequest('/admin/config', {
        method: 'POST',
        token: 'test-token',
        body: [validProvider, invalidProviderMissingName],
      });

      const response = await app.fetch(request, env);

      expect(response.status).toBe(400);
    });
  });

  describe('edge cases', () => {
    it('handles provider with minimal fields', async () => {
      const env = createMockBindings({ adminToken: 'test-token' });
      const request = createRequest('/admin/config', {
        method: 'POST',
        token: 'test-token',
        body: [minimalProvider],
      });

      const response = await app.fetch(request, env);

      expect(response.status).toBe(200);
    });

    it('preserves optional provider fields', async () => {
      const env = createMockBindings({ adminToken: 'test-token' });
      const request = createRequest('/admin/config', {
        method: 'POST',
        token: 'test-token',
        body: [validProvider],
      });

      await app.fetch(request, env);

      // Verify optional fields preserved
      const getRequest = createRequest('/admin/config', { token: 'test-token' });
      const response = await app.fetch(getRequest, env);
      const data = (await response.json()) as typeof validProvider[];

      expect(data[0].authHeader).toBe(validProvider.authHeader);
      expect(data[0].modelMapping).toEqual(validProvider.modelMapping);
    });

    it('handles large number of providers', async () => {
      const env = createMockBindings({ adminToken: 'test-token' });
      const manyProviders = Array.from({ length: 50 }, (_, i) => ({
        name: `provider-${i}`,
        baseUrl: `https://api${i}.example.com`,
        apiKey: `key-${i}`,
      }));
      const request = createRequest('/admin/config', {
        method: 'POST',
        token: 'test-token',
        body: manyProviders,
      });

      const response = await app.fetch(request, env);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ success: true, count: 50 });
    });
  });
});

describe('settings API', () => {
  let app: Hono<{ Bindings: Bindings }>;

  beforeEach(() => {
    app = createTestApp();
  });

  it('GET /admin/settings returns default cooldown from env', async () => {
    const env = createMockBindings({ adminToken: 'test-token' });
    env.COOLDOWN_DURATION = '300';
    const request = createRequest('/admin/settings', { token: 'test-token' });

    const response = await app.fetch(request, env);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ cooldownDuration: 300 });
  });

  it('GET /admin/settings returns stored cooldown', async () => {
    const env = createMockBindings({
      adminToken: 'test-token',
      kvData: { cooldown_duration: '600' }
    });
    const request = createRequest('/admin/settings', { token: 'test-token' });

    const response = await app.fetch(request, env);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ cooldownDuration: 600 });
  });

  it('POST /admin/settings saves cooldown', async () => {
    const env = createMockBindings({ adminToken: 'test-token' });
    const request = createRequest('/admin/settings', {
      method: 'POST',
      token: 'test-token',
      body: { cooldownDuration: 120 }
    });

    const response = await app.fetch(request, env);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });

    // Verify persistence
    const val = await env.CONFIG_KV.get('cooldown_duration');
    expect(val).toBe('120');
  });

  it('POST /admin/settings validates input', async () => {
    const env = createMockBindings({ adminToken: 'test-token' });
    const request = createRequest('/admin/settings', {
      method: 'POST',
      token: 'test-token',
      body: { cooldownDuration: 'invalid' }
    });

    const response = await app.fetch(request, env);

    expect(response.status).toBe(400);
  });

  it('POST /admin/settings rejects negative values', async () => {
    const env = createMockBindings({ adminToken: 'test-token' });
    const request = createRequest('/admin/settings', {
      method: 'POST',
      token: 'test-token',
      body: { cooldownDuration: -10 }
    });

    const response = await app.fetch(request, env);

    expect(response.status).toBe(400);
  });
});

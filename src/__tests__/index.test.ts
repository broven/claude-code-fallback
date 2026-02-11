import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import app from '../index';
import { createMockBindings } from './mocks/kv';
import {
  validProvider,
  minimalProvider,
  multipleProviders,
} from './fixtures/providers';
import {
  validMessageRequest,
  successResponse,
  errorResponses,
} from './fixtures/requests';
import {
  createSuccessResponse,
  createErrorResponse,
} from './mocks/fetch';

// Type for JSON response with error field
interface ErrorResponse {
  error: string | { type: string; message: string };
}

// Type for custom response data
interface CustomResponseData {
  id: string;
  content: { type: string; text: string }[];
}

describe('Main Application', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('GET / (redirect to admin)', () => {
    it('returns 302 redirect to /admin', async () => {
      const env = createMockBindings();
      const request = new Request('http://localhost/');

      const response = await app.fetch(request, env);

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe('/admin');
    });
  });

  describe('POST /v1/messages (proxy)', () => {
    function createProxyRequest(body: unknown = validMessageRequest, headers: Record<string, string> = {}) {
      return new Request('http://localhost/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'test-anthropic-key',
          'anthropic-version': '2023-06-01',
          ...headers,
        },
        body: JSON.stringify(body),
      });
    }

    describe('successful Anthropic requests', () => {
      it('forwards request to Anthropic API', async () => {
        const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse(successResponse));
        globalThis.fetch = mockFetch;
        const env = createMockBindings();
        const request = createProxyRequest();

        await app.fetch(request, env);

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.anthropic.com/v1/messages',
          expect.any(Object)
        );
      });

      it('returns successful Anthropic response', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(createSuccessResponse(successResponse));
        const env = createMockBindings();
        const request = createProxyRequest();

        const response = await app.fetch(request, env);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toEqual(successResponse);
      });

      it('preserves response body from Anthropic', async () => {
        const customResponse = {
          ...successResponse,
          id: 'msg_custom123',
          content: [{ type: 'text', text: 'Custom response' }],
        };
        globalThis.fetch = vi.fn().mockResolvedValue(createSuccessResponse(customResponse));
        const env = createMockBindings();
        const request = createProxyRequest();

        const response = await app.fetch(request, env);
        const data = (await response.json()) as CustomResponseData;

        expect(data.id).toBe('msg_custom123');
        expect(data.content[0].text).toBe('Custom response');
      });

      it('cleans hop-by-hop headers from response', async () => {
        const responseWithBadHeaders = new Response(JSON.stringify(successResponse), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'transfer-encoding': 'chunked',
            connection: 'keep-alive',
            'x-request-id': '12345',
          },
        });
        globalThis.fetch = vi.fn().mockResolvedValue(responseWithBadHeaders);
        const env = createMockBindings();
        const request = createProxyRequest();

        const response = await app.fetch(request, env);

        expect(response.headers.get('transfer-encoding')).toBeNull();
        expect(response.headers.get('connection')).toBeNull();
        expect(response.headers.get('x-request-id')).toBe('12345');
      });
    });

    describe('fallback triggering', () => {
      it('triggers fallback on 429 rate limit', async () => {
        let callCount = 0;
        globalThis.fetch = vi.fn((url: RequestInfo | URL) => {
          callCount++;
          const urlStr = url.toString();
          if (urlStr.includes('api.anthropic.com')) {
            return Promise.resolve(createErrorResponse(429, errorResponses.rateLimited));
          }
          return Promise.resolve(createSuccessResponse(successResponse));
        }) as typeof fetch;
        const env = createMockBindings({
          kvData: { providers: JSON.stringify([validProvider]) },
        });
        const request = createProxyRequest();

        const response = await app.fetch(request, env);

        expect(callCount).toBe(2);
        expect(response.status).toBe(200);
      });

      it('triggers fallback on 401 unauthorized', async () => {
        let anthropicCalled = false;
        let fallbackCalled = false;
        globalThis.fetch = vi.fn((url: RequestInfo | URL) => {
          const urlStr = url.toString();
          if (urlStr.includes('api.anthropic.com')) {
            anthropicCalled = true;
            return Promise.resolve(createErrorResponse(401, errorResponses.unauthorized));
          }
          fallbackCalled = true;
          return Promise.resolve(createSuccessResponse(successResponse));
        }) as typeof fetch;
        const env = createMockBindings({
          kvData: { providers: JSON.stringify([validProvider]) },
        });
        const request = createProxyRequest();

        await app.fetch(request, env);

        expect(anthropicCalled).toBe(true);
        expect(fallbackCalled).toBe(true);
      });

      it('triggers fallback on 403 forbidden', async () => {
        globalThis.fetch = vi.fn((url: RequestInfo | URL) => {
          const urlStr = url.toString();
          if (urlStr.includes('api.anthropic.com')) {
            return Promise.resolve(createErrorResponse(403, errorResponses.forbidden));
          }
          return Promise.resolve(createSuccessResponse(successResponse));
        }) as typeof fetch;
        const env = createMockBindings({
          kvData: { providers: JSON.stringify([validProvider]) },
        });
        const request = createProxyRequest();

        const response = await app.fetch(request, env);

        expect(response.status).toBe(200);
      });

      it('triggers fallback on 5xx server errors', async () => {
        for (const status of [500, 502, 503, 504]) {
          globalThis.fetch = vi.fn((url: RequestInfo | URL) => {
            const urlStr = url.toString();
            if (urlStr.includes('api.anthropic.com')) {
              return Promise.resolve(createErrorResponse(status, errorResponses.serverError));
            }
            return Promise.resolve(createSuccessResponse(successResponse));
          }) as typeof fetch;
          const env = createMockBindings({
            kvData: { providers: JSON.stringify([validProvider]) },
          });
          const request = createProxyRequest();

          const response = await app.fetch(request, env);

          expect(response.status).toBe(200);
        }
      });

      it('does NOT trigger fallback on 400 bad request', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(
          createErrorResponse(400, errorResponses.badRequest)
        );
        const env = createMockBindings({
          kvData: { providers: JSON.stringify([validProvider]) },
        });
        const request = createProxyRequest();

        const response = await app.fetch(request, env);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data).toEqual(errorResponses.badRequest);
      });

      it('does NOT trigger fallback on 404', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(
          createErrorResponse(404, { error: 'Not found' })
        );
        const env = createMockBindings({
          kvData: { providers: JSON.stringify([validProvider]) },
        });
        const request = createProxyRequest();

        const response = await app.fetch(request, env);

        expect(response.status).toBe(404);
      });
    });

    describe('fallback provider execution', () => {
      it('tries multiple fallback providers in order', async () => {
        const callOrder: string[] = [];
        globalThis.fetch = vi.fn((url: RequestInfo | URL) => {
          const urlStr = url.toString();
          if (urlStr.includes('api.anthropic.com')) {
            callOrder.push('anthropic');
            return Promise.resolve(createErrorResponse(429, errorResponses.rateLimited));
          }
          if (urlStr.includes('openrouter')) {
            callOrder.push('openrouter');
            return Promise.resolve(createErrorResponse(500, errorResponses.serverError));
          }
          if (urlStr.includes('example.com')) {
            callOrder.push('example');
            return Promise.resolve(createSuccessResponse(successResponse));
          }
          return Promise.resolve(createErrorResponse(500, errorResponses.serverError));
        }) as typeof fetch;
        const providers = [validProvider, minimalProvider];
        const env = createMockBindings({
          kvData: { providers: JSON.stringify(providers) },
        });
        const request = createProxyRequest();

        await app.fetch(request, env);

        expect(callOrder).toEqual(['anthropic', 'openrouter', 'example']);
      });

      it('stops at first successful fallback provider', async () => {
        let thirdProviderCalled = false;
        globalThis.fetch = vi.fn((url: RequestInfo | URL) => {
          const urlStr = url.toString();
          if (urlStr.includes('api.anthropic.com')) {
            return Promise.resolve(createErrorResponse(429, errorResponses.rateLimited));
          }
          if (urlStr.includes('openrouter')) {
            return Promise.resolve(createSuccessResponse(successResponse));
          }
          thirdProviderCalled = true;
          return Promise.resolve(createSuccessResponse(successResponse));
        }) as typeof fetch;
        const providers = [validProvider, minimalProvider, { ...minimalProvider, name: 'third' }];
        const env = createMockBindings({
          kvData: { providers: JSON.stringify(providers) },
        });
        const request = createProxyRequest();

        const response = await app.fetch(request, env);

        expect(response.status).toBe(200);
        expect(thirdProviderCalled).toBe(false);
      });

      it('returns last error when all fallbacks fail', async () => {
        globalThis.fetch = vi.fn((url: RequestInfo | URL) => {
          const urlStr = url.toString();
          if (urlStr.includes('api.anthropic.com')) {
            return Promise.resolve(createErrorResponse(429, errorResponses.rateLimited));
          }
          return Promise.resolve(createErrorResponse(500, { error: 'fallback failed' }));
        }) as typeof fetch;
        const env = createMockBindings({
          kvData: { providers: JSON.stringify([validProvider]) },
        });
        const request = createProxyRequest();

        const response = await app.fetch(request, env);
        const data = (await response.json()) as ErrorResponse;

        expect(response.status).toBe(500);
        expect(data.error).toBe('fallback failed');
      });
    });

    describe('debug skip header', () => {
      it('skips Anthropic when debug header is set', async () => {
        let anthropicCalled = false;
        globalThis.fetch = vi.fn((url: RequestInfo | URL) => {
          const urlStr = url.toString();
          if (urlStr.includes('api.anthropic.com')) {
            anthropicCalled = true;
          }
          return Promise.resolve(createSuccessResponse(successResponse));
        }) as typeof fetch;
        const env = createMockBindings({
          kvData: { providers: JSON.stringify([validProvider]) },
        });
        const request = createProxyRequest(validMessageRequest, {
          'x-ccf-debug-skip-anthropic': '1',
        });

        await app.fetch(request, env);

        expect(anthropicCalled).toBe(false);
      });

      it('goes directly to fallback providers when debug header is set', async () => {
        let fallbackCalled = false;
        globalThis.fetch = vi.fn((url: RequestInfo | URL) => {
          const urlStr = url.toString();
          if (!urlStr.includes('api.anthropic.com')) {
            fallbackCalled = true;
          }
          return Promise.resolve(createSuccessResponse(successResponse));
        }) as typeof fetch;
        const env = createMockBindings({
          kvData: { providers: JSON.stringify([validProvider]) },
        });
        const request = createProxyRequest(validMessageRequest, {
          'x-ccf-debug-skip-anthropic': '1',
        });

        await app.fetch(request, env);

        expect(fallbackCalled).toBe(true);
      });
    });

    describe('no fallback providers configured', () => {
      it('returns Anthropic error when no fallbacks configured', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(
          createErrorResponse(429, errorResponses.rateLimited)
        );
        const env = createMockBindings();
        const request = createProxyRequest();

        const response = await app.fetch(request, env);
        const data = await response.json();

        expect(response.status).toBe(429);
        expect(data).toEqual(errorResponses.rateLimited);
      });

      it('returns 502 with error message when skipping Anthropic and no fallbacks', async () => {
        const env = createMockBindings();
        const request = createProxyRequest(validMessageRequest, {
          'x-ccf-debug-skip-anthropic': '1',
        });

        const response = await app.fetch(request, env);
        const data = (await response.json()) as ErrorResponse;

        expect(response.status).toBe(502);
        expect((data.error as { type: string; message: string }).type).toBe('proxy_error');
        expect((data.error as { type: string; message: string }).message).toContain('no fallbacks configured');
      });
    });

    describe('network errors', () => {
      it('tries fallback on Anthropic network error', async () => {
        let anthropicAttempted = false;
        globalThis.fetch = vi.fn((url: RequestInfo | URL) => {
          const urlStr = url.toString();
          if (urlStr.includes('api.anthropic.com')) {
            anthropicAttempted = true;
            return Promise.reject(new Error('Network error'));
          }
          return Promise.resolve(createSuccessResponse(successResponse));
        }) as typeof fetch;
        const env = createMockBindings({
          kvData: { providers: JSON.stringify([validProvider]) },
        });
        const request = createProxyRequest();

        const response = await app.fetch(request, env);

        expect(anthropicAttempted).toBe(true);
        expect(response.status).toBe(200);
      });

      it('returns 502 when all providers have network errors', async () => {
        globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error')) as typeof fetch;
        const env = createMockBindings({
          kvData: { providers: JSON.stringify([validProvider]) },
        });
        const request = createProxyRequest();

        const response = await app.fetch(request, env);
        const data = (await response.json()) as ErrorResponse;

        expect(response.status).toBe(502);
        expect((data.error as { type: string; message: string }).type).toBe('fallback_exhausted');
      });
    });

    describe('debug logging', () => {
      it('logs incoming request when debug is true', async () => {
        const consoleSpy = vi.spyOn(console, 'log');
        globalThis.fetch = vi.fn().mockResolvedValue(createSuccessResponse(successResponse));
        const env = createMockBindings({ debug: true });
        const request = createProxyRequest();

        await app.fetch(request, env);

        expect(consoleSpy).toHaveBeenCalledWith(
          '[Proxy] Incoming Request',
          expect.objectContaining({
            method: 'POST',
            model: validMessageRequest.model,
          })
        );
      });
    });
  });

  describe('admin routes integration', () => {
    it('GET /admin requires authentication', async () => {
      const env = createMockBindings({ adminToken: 'test-token' });
      const request = new Request('http://localhost/admin');

      const response = await app.fetch(request, env);

      expect(response.status).toBe(401);
    });

    it('GET /admin/config requires authentication', async () => {
      const env = createMockBindings({ adminToken: 'test-token' });
      const request = new Request('http://localhost/admin/config');

      const response = await app.fetch(request, env);

      expect(response.status).toBe(401);
    });

    it('POST /admin/config requires authentication', async () => {
      const env = createMockBindings({ adminToken: 'test-token' });
      const request = new Request('http://localhost/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([]),
      });

      const response = await app.fetch(request, env);

      expect(response.status).toBe(401);
    });

    it('admin routes work with valid token', async () => {
      const env = createMockBindings({ adminToken: 'test-token' });
      const request = new Request('http://localhost/admin/config?token=test-token');

      const response = await app.fetch(request, env);

      expect(response.status).toBe(200);
    });
  });

  describe('Circuit Breaker Integration', () => {
    function createProxyRequest(body: unknown = validMessageRequest, headers: Record<string, string> = {}) {
      return new Request('http://localhost/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'test-anthropic-key',
          'anthropic-version': '2023-06-01',
          ...headers,
        },
        body: JSON.stringify(body),
      });
    }

    function makeProviderState(overrides: Partial<{
      consecutiveFailures: number;
      lastFailure: number | null;
      lastSuccess: number | null;
      cooldownUntil: number | null;
    }> = {}) {
      return JSON.stringify({
        consecutiveFailures: 5,
        lastFailure: Date.now(),
        lastSuccess: null,
        cooldownUntil: Date.now() + 60000,
        ...overrides,
      });
    }

    it('skips Anthropic primary if in cooldown', async () => {
      const env = createMockBindings({
        kvData: {
          'provider-state:anthropic-primary': makeProviderState(),
          providers: JSON.stringify([validProvider])
        },
      });

      let anthropicCalled = false;
      let fallbackCalled = false;

      globalThis.fetch = vi.fn((url: RequestInfo | URL) => {
        const urlStr = url.toString();
        if (urlStr.includes('api.anthropic.com')) {
          anthropicCalled = true;
          return Promise.resolve(createSuccessResponse(successResponse));
        }
        fallbackCalled = true;
        return Promise.resolve(createSuccessResponse(successResponse));
      }) as typeof fetch;

      const request = createProxyRequest();
      await app.fetch(request, env);

      expect(anthropicCalled).toBe(false);
      expect(fallbackCalled).toBe(true);
    });

    it('skips fallback provider if in cooldown', async () => {
      const providers = [
        { ...validProvider, name: 'provider1' },
        { ...minimalProvider, name: 'provider2' }
      ];

      const env = createMockBindings({
        kvData: {
          'provider-state:provider1': makeProviderState(),
          providers: JSON.stringify(providers)
        },
      });

      const callOrder: string[] = [];

      globalThis.fetch = vi.fn((url: RequestInfo | URL) => {
        const urlStr = url.toString();
        if (urlStr.includes('api.anthropic.com')) {
           return Promise.resolve(createErrorResponse(500, errorResponses.serverError));
        }
        if (urlStr.includes(providers[0].baseUrl)) {
           callOrder.push('provider1');
           return Promise.resolve(createSuccessResponse(successResponse));
        }
        if (urlStr.includes(providers[1].baseUrl)) {
           callOrder.push('provider2');
           return Promise.resolve(createSuccessResponse(successResponse));
        }
         return Promise.resolve(createSuccessResponse(successResponse));
      }) as typeof fetch;

      const request = createProxyRequest();
      await app.fetch(request, env);

      expect(callOrder).toEqual(['provider2']);
    });

    it('records failure state in KV after 5xx error (no cooldown for first failure)', async () => {
       const env = createMockBindings({
        kvData: { providers: JSON.stringify([validProvider]) },
      });

      globalThis.fetch = vi.fn((url: RequestInfo | URL) => {
        const urlStr = url.toString();
        if (urlStr.includes('api.anthropic.com')) {
           return Promise.resolve(createErrorResponse(500, errorResponses.serverError));
        }
         return Promise.resolve(createSuccessResponse(successResponse));
      }) as typeof fetch;

      const request = createProxyRequest();
      await app.fetch(request, env);

      const raw = await env.CONFIG_KV.get('provider-state:anthropic-primary');
      expect(raw).not.toBeNull();
      const state = JSON.parse(raw!);
      expect(state.consecutiveFailures).toBe(1);
      // First failure should NOT trigger cooldown
      expect(state.cooldownUntil).toBeNull();
    });

    it('stores provider state as JSON with correct maxCooldown from config', async () => {
      const env = createMockBindings({
        kvData: {
          providers: JSON.stringify([validProvider]),
          cooldown_duration: '600'
        },
      });

      const putSpy = vi.spyOn(env.CONFIG_KV, 'put');

      globalThis.fetch = vi.fn((url: RequestInfo | URL) => {
        if (url.toString().includes('api.anthropic.com')) {
           return Promise.resolve(createErrorResponse(500, errorResponses.serverError));
        }
        return Promise.resolve(createSuccessResponse(successResponse));
      }) as typeof fetch;

      const request = createProxyRequest();
      await app.fetch(request, env);

      // Verify state is stored as JSON under new key format
      expect(putSpy).toHaveBeenCalledWith(
        'provider-state:anthropic-primary',
        expect.any(String),
      );

      const raw = await env.CONFIG_KV.get('provider-state:anthropic-primary');
      const state = JSON.parse(raw!);
      expect(state.consecutiveFailures).toBe(1);
    });

    it('safety valve tries least-recently-failed when all providers are in cooldown', async () => {
      const now = Date.now();
      const env = createMockBindings({
        kvData: {
          // Anthropic in cooldown (long)
          'provider-state:anthropic-primary': JSON.stringify({
            consecutiveFailures: 10,
            lastFailure: now,
            lastSuccess: null,
            cooldownUntil: now + 300000,
          }),
          // Fallback also in cooldown (short - should be chosen by safety valve)
          'provider-state:openrouter': JSON.stringify({
            consecutiveFailures: 3,
            lastFailure: now,
            lastSuccess: null,
            cooldownUntil: now + 30000,
          }),
          providers: JSON.stringify([validProvider]),
        },
      });

      let fallbackCalled = false;
      globalThis.fetch = vi.fn((url: RequestInfo | URL) => {
        const urlStr = url.toString();
        if (urlStr.includes('openrouter')) {
          fallbackCalled = true;
          return Promise.resolve(createSuccessResponse(successResponse));
        }
        return Promise.resolve(createErrorResponse(500, errorResponses.serverError));
      }) as typeof fetch;

      const request = createProxyRequest();
      const response = await app.fetch(request, env);

      expect(fallbackCalled).toBe(true);
      expect(response.status).toBe(200);
    });

    it('safety valve tries Anthropic primary when it has earliest cooldown', async () => {
      const now = Date.now();
      const env = createMockBindings({
        kvData: {
          // Anthropic in cooldown (short - should be chosen)
          'provider-state:anthropic-primary': JSON.stringify({
            consecutiveFailures: 3,
            lastFailure: now,
            lastSuccess: null,
            cooldownUntil: now + 30000,
          }),
          // Fallback also in cooldown (long)
          'provider-state:openrouter': JSON.stringify({
            consecutiveFailures: 10,
            lastFailure: now,
            lastSuccess: null,
            cooldownUntil: now + 300000,
          }),
          providers: JSON.stringify([validProvider]),
        },
      });

      let anthropicCalled = false;
      globalThis.fetch = vi.fn((url: RequestInfo | URL) => {
        const urlStr = url.toString();
        if (urlStr.includes('api.anthropic.com')) {
          anthropicCalled = true;
          return Promise.resolve(createSuccessResponse(successResponse));
        }
        return Promise.resolve(createErrorResponse(500, errorResponses.serverError));
      }) as typeof fetch;

      const request = createProxyRequest();
      const response = await app.fetch(request, env);

      expect(anthropicCalled).toBe(true);
      expect(response.status).toBe(200);
    });

    it('safety valve returns error response when chosen provider also fails', async () => {
      const now = Date.now();
      const env = createMockBindings({
        kvData: {
          'provider-state:anthropic-primary': JSON.stringify({
            consecutiveFailures: 10,
            lastFailure: now,
            lastSuccess: null,
            cooldownUntil: now + 300000,
          }),
          'provider-state:openrouter': JSON.stringify({
            consecutiveFailures: 3,
            lastFailure: now,
            lastSuccess: null,
            cooldownUntil: now + 30000,
          }),
          providers: JSON.stringify([validProvider]),
        },
      });

      globalThis.fetch = vi.fn(() => {
        return Promise.resolve(createErrorResponse(500, { error: 'still failing' }));
      }) as typeof fetch;

      const request = createProxyRequest();
      const response = await app.fetch(request, env);

      expect(response.status).toBe(500);
    });

    it('safety valve handles network error gracefully', async () => {
      const now = Date.now();
      const env = createMockBindings({
        kvData: {
          'provider-state:anthropic-primary': JSON.stringify({
            consecutiveFailures: 3,
            lastFailure: now,
            lastSuccess: null,
            cooldownUntil: now + 30000,
          }),
          providers: JSON.stringify([]),
        },
      });

      globalThis.fetch = vi.fn(() => {
        return Promise.reject(new Error('Network error'));
      }) as typeof fetch;

      const request = createProxyRequest();
      const response = await app.fetch(request, env);

      // Should return 502 fallback_exhausted since no other response available
      expect(response.status).toBe(502);
    });

    it('safety valve Anthropic failure records state and returns error', async () => {
      const now = Date.now();
      const env = createMockBindings({
        kvData: {
          // Anthropic in cooldown (short - chosen by safety valve)
          'provider-state:anthropic-primary': JSON.stringify({
            consecutiveFailures: 3,
            lastFailure: now,
            lastSuccess: null,
            cooldownUntil: now + 30000,
          }),
          // Fallback also in cooldown (long)
          'provider-state:openrouter': JSON.stringify({
            consecutiveFailures: 10,
            lastFailure: now,
            lastSuccess: null,
            cooldownUntil: now + 300000,
          }),
          providers: JSON.stringify([validProvider]),
        },
      });

      globalThis.fetch = vi.fn(() => {
        return Promise.resolve(createErrorResponse(503, { error: 'service unavailable' }));
      }) as typeof fetch;

      const request = createProxyRequest();
      const response = await app.fetch(request, env);

      expect(response.status).toBe(503);

      // Verify failure was recorded
      const raw = await env.CONFIG_KV.get('provider-state:anthropic-primary');
      const state = JSON.parse(raw!);
      expect(state.consecutiveFailures).toBe(4);
    });

    it('first failure does not cause cooldown (provider still available next request)', async () => {
      const env = createMockBindings({
        kvData: { providers: JSON.stringify([validProvider]) },
      });

      // First request - Anthropic fails
      globalThis.fetch = vi.fn((url: RequestInfo | URL) => {
        const urlStr = url.toString();
        if (urlStr.includes('api.anthropic.com')) {
          return Promise.resolve(createErrorResponse(500, errorResponses.serverError));
        }
        return Promise.resolve(createSuccessResponse(successResponse));
      }) as typeof fetch;

      const request1 = createProxyRequest();
      await app.fetch(request1, env);

      // Verify provider state has 1 failure but no cooldown
      const raw = await env.CONFIG_KV.get('provider-state:anthropic-primary');
      const state = JSON.parse(raw!);
      expect(state.consecutiveFailures).toBe(1);
      expect(state.cooldownUntil).toBeNull();
    });
  });

  describe('Provider disable/enable', () => {
    function createProxyRequest(body: unknown = validMessageRequest, headers: Record<string, string> = {}) {
      return new Request('http://localhost/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'test-anthropic-key',
          'anthropic-version': '2023-06-01',
          ...headers,
        },
        body: JSON.stringify(body),
      });
    }

    it('skips Anthropic primary when disabled in KV', async () => {
      let anthropicCalled = false;
      globalThis.fetch = vi.fn((url: RequestInfo | URL) => {
        const urlStr = url.toString();
        if (urlStr.includes('api.anthropic.com')) {
          anthropicCalled = true;
        }
        return Promise.resolve(createSuccessResponse(successResponse));
      }) as typeof fetch;
      const env = createMockBindings({
        kvData: {
          providers: JSON.stringify([validProvider]),
          anthropic_primary_disabled: 'true',
        },
      });
      const request = createProxyRequest();

      await app.fetch(request, env);

      expect(anthropicCalled).toBe(false);
    });

    it('uses fallback providers when Anthropic primary is disabled', async () => {
      let fallbackCalled = false;
      globalThis.fetch = vi.fn((url: RequestInfo | URL) => {
        const urlStr = url.toString();
        if (!urlStr.includes('api.anthropic.com')) {
          fallbackCalled = true;
        }
        return Promise.resolve(createSuccessResponse(successResponse));
      }) as typeof fetch;
      const env = createMockBindings({
        kvData: {
          providers: JSON.stringify([validProvider]),
          anthropic_primary_disabled: 'true',
        },
      });
      const request = createProxyRequest();

      const response = await app.fetch(request, env);

      expect(response.status).toBe(200);
      expect(fallbackCalled).toBe(true);
    });

    it('skips disabled fallback provider', async () => {
      const disabledProvider = { ...validProvider, name: 'disabled-one', disabled: true };
      const enabledProvider = { ...minimalProvider, name: 'enabled-one' };

      const callOrder: string[] = [];
      globalThis.fetch = vi.fn((url: RequestInfo | URL) => {
        const urlStr = url.toString();
        if (urlStr.includes('api.anthropic.com')) {
          callOrder.push('anthropic');
          return Promise.resolve(createErrorResponse(429, errorResponses.rateLimited));
        }
        if (urlStr.includes(disabledProvider.baseUrl)) {
          callOrder.push('disabled-one');
          return Promise.resolve(createSuccessResponse(successResponse));
        }
        if (urlStr.includes(enabledProvider.baseUrl)) {
          callOrder.push('enabled-one');
          return Promise.resolve(createSuccessResponse(successResponse));
        }
        return Promise.resolve(createSuccessResponse(successResponse));
      }) as typeof fetch;
      const env = createMockBindings({
        kvData: { providers: JSON.stringify([disabledProvider, enabledProvider]) },
      });
      const request = createProxyRequest();

      await app.fetch(request, env);

      expect(callOrder).toEqual(['anthropic', 'enabled-one']);
    });

    it('returns 502 when Anthropic disabled and all fallback providers disabled', async () => {
      const disabledProvider = { ...validProvider, disabled: true };
      globalThis.fetch = vi.fn().mockResolvedValue(createSuccessResponse(successResponse));
      const env = createMockBindings({
        kvData: {
          providers: JSON.stringify([disabledProvider]),
          anthropic_primary_disabled: 'true',
        },
      });
      const request = createProxyRequest();

      const response = await app.fetch(request, env);
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(502);
      expect((data.error as { type: string; message: string }).type).toBe('fallback_exhausted');
    });
  });
});

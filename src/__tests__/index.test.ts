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

  describe('GET / (health check)', () => {
    it('returns 200 status', async () => {
      const env = createMockBindings();
      const request = new Request('http://localhost/');

      const response = await app.fetch(request, env);

      expect(response.status).toBe(200);
    });

    it('returns text content type', async () => {
      const env = createMockBindings();
      const request = new Request('http://localhost/');

      const response = await app.fetch(request, env);

      expect(response.headers.get('content-type')).toContain('text/plain');
    });

    it('includes proxy running message', async () => {
      const env = createMockBindings();
      const request = new Request('http://localhost/');

      const response = await app.fetch(request, env);
      const text = await response.text();

      expect(text).toContain('Claude Code Fallback Proxy');
      expect(text).toContain('is running');
    });

    it('includes provider count', async () => {
      const env = createMockBindings({
        kvData: { providers: JSON.stringify(multipleProviders) },
      });
      const request = new Request('http://localhost/');

      const response = await app.fetch(request, env);
      const text = await response.text();

      expect(text).toContain('3 fallback provider(s)');
    });

    it('shows 0 providers when none configured', async () => {
      const env = createMockBindings();
      const request = new Request('http://localhost/');

      const response = await app.fetch(request, env);
      const text = await response.text();

      expect(text).toContain('0 fallback provider(s)');
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
          'x-ccfallback-debug-skip-anthropic': '1',
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
          'x-ccfallback-debug-skip-anthropic': '1',
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
          'x-ccfallback-debug-skip-anthropic': '1',
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
});

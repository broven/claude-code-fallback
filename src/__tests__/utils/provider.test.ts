import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tryProvider } from '../../utils/provider';
import {
  validProvider,
  minimalProvider,
  providerWithCustomHeaders,
  providerWithBearerToken,
} from '../fixtures/providers';
import {
  validMessageRequest,
  validHeaders,
  successResponse,
} from '../fixtures/requests';
import {
  createMockResponse,
  createSuccessResponse,
  createErrorResponse,
} from '../mocks/fetch';

describe('tryProvider', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  describe('basic functionality', () => {
    it('makes POST request to provider baseUrl', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      globalThis.fetch = mockFetch;

      await tryProvider(validProvider, validMessageRequest, validHeaders);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toBe(validProvider.baseUrl);
      expect(mockFetch.mock.calls[0][1].method).toBe('POST');
    });

    it('sends JSON body with content-type header', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      globalThis.fetch = mockFetch;

      await tryProvider(validProvider, validMessageRequest, validHeaders);

      const requestInit = mockFetch.mock.calls[0][1] as RequestInit;
      expect(requestInit.headers).toHaveProperty('content-type', 'application/json');
      expect(JSON.parse(requestInit.body as string)).toMatchObject({
        max_tokens: validMessageRequest.max_tokens,
        messages: validMessageRequest.messages,
      });
    });

    it('returns response from provider', async () => {
      const mockResponse = createSuccessResponse(successResponse);
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const result = await tryProvider(validProvider, validMessageRequest, validHeaders);

      expect(result).toBe(mockResponse);
    });
  });

  describe('model mapping', () => {
    it('applies model mapping when configured', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      globalThis.fetch = mockFetch;

      const request = {
        ...validMessageRequest,
        model: 'claude-sonnet-4-20250514',
      };

      await tryProvider(validProvider, request, validHeaders);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(requestBody.model).toBe('anthropic/claude-sonnet-4');
    });

    it('preserves original model when no mapping exists', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      globalThis.fetch = mockFetch;

      const request = {
        ...validMessageRequest,
        model: 'unmapped-model',
      };

      await tryProvider(validProvider, request, validHeaders);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(requestBody.model).toBe('unmapped-model');
    });

    it('preserves model when no modelMapping configured', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      globalThis.fetch = mockFetch;

      await tryProvider(minimalProvider, validMessageRequest, validHeaders);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(requestBody.model).toBe(validMessageRequest.model);
    });
  });

  describe('authentication', () => {
    it('sets x-api-key header by default', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      globalThis.fetch = mockFetch;

      await tryProvider(minimalProvider, validMessageRequest, validHeaders);

      const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
      expect(headers['x-api-key']).toBe(minimalProvider.apiKey);
    });

    it('sets Authorization header with Bearer prefix when authHeader is Authorization', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      globalThis.fetch = mockFetch;

      await tryProvider(validProvider, validMessageRequest, validHeaders);

      const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
      expect(headers['Authorization']).toBe(`Bearer ${validProvider.apiKey}`);
    });

    it('preserves existing Bearer prefix when already present', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      globalThis.fetch = mockFetch;

      await tryProvider(providerWithBearerToken, validMessageRequest, validHeaders);

      const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer sk-already-prefixed');
    });

    it('uses custom authHeader name when specified', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      globalThis.fetch = mockFetch;

      await tryProvider(providerWithCustomHeaders, validMessageRequest, validHeaders);

      const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
      expect(headers['x-api-key']).toBe(providerWithCustomHeaders.apiKey);
    });
  });

  describe('header handling', () => {
    it('excludes hop-by-hop headers from request', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      globalThis.fetch = mockFetch;

      const headersWithHopByHop = {
        ...validHeaders,
        connection: 'keep-alive',
        'keep-alive': 'timeout=5',
        host: 'api.anthropic.com',
        'transfer-encoding': 'chunked',
        te: 'trailers',
        trailer: 'Expires',
        upgrade: 'websocket',
        'content-length': '1234',
      };

      await tryProvider(validProvider, validMessageRequest, headersWithHopByHop);

      const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
      expect(headers['connection']).toBeUndefined();
      expect(headers['keep-alive']).toBeUndefined();
      expect(headers['host']).toBeUndefined();
      expect(headers['transfer-encoding']).toBeUndefined();
      expect(headers['te']).toBeUndefined();
      expect(headers['trailer']).toBeUndefined();
      expect(headers['upgrade']).toBeUndefined();
      expect(headers['content-length']).toBeUndefined();
    });

    it('excludes original auth headers (x-api-key, authorization)', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      globalThis.fetch = mockFetch;

      const headersWithAuth = {
        ...validHeaders,
        'x-api-key': 'original-key',
        authorization: 'Bearer original-token',
      };

      await tryProvider(validProvider, validMessageRequest, headersWithAuth);

      const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
      // Should have the provider's auth, not the original
      expect(headers['Authorization']).toBe(`Bearer ${validProvider.apiKey}`);
    });

    it('applies custom headers from provider config', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      globalThis.fetch = mockFetch;

      await tryProvider(providerWithCustomHeaders, validMessageRequest, validHeaders);

      const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
      expect(headers['X-Custom-Header']).toBe('custom-value');
      expect(headers['X-Another-Header']).toBe('another-value');
    });

    it('sets content-type to application/json if not present', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      globalThis.fetch = mockFetch;

      const headersWithoutContentType = {
        'anthropic-version': '2023-06-01',
      };

      await tryProvider(validProvider, validMessageRequest, headersWithoutContentType);

      const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
      expect(headers['content-type']).toBe('application/json');
    });

    it('preserves anthropic-version header', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      globalThis.fetch = mockFetch;

      await tryProvider(validProvider, validMessageRequest, validHeaders);

      const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
      expect(headers['anthropic-version']).toBe('2023-06-01');
    });
  });

  describe('timeout handling', () => {
    it('aborts request after 30 seconds', async () => {
      const mockFetch = vi.fn().mockImplementation(
        (url: string, init: RequestInit) => {
          return new Promise((resolve, reject) => {
            // Listen for abort signal
            init.signal?.addEventListener('abort', () => {
              reject(new Error('Aborted'));
            });
          });
        }
      );
      globalThis.fetch = mockFetch;

      const promise = tryProvider(validProvider, validMessageRequest, validHeaders);

      // Advance time to trigger timeout
      vi.advanceTimersByTime(30001);

      await expect(promise).rejects.toThrow('Aborted');
    });

    it('clears timeout on successful response', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      globalThis.fetch = mockFetch;

      await tryProvider(validProvider, validMessageRequest, validHeaders);

      // Verify no pending timers
      expect(vi.getTimerCount()).toBe(0);
    });

    it('clears timeout on error', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      globalThis.fetch = mockFetch;

      await expect(
        tryProvider(validProvider, validMessageRequest, validHeaders)
      ).rejects.toThrow('Network error');

      // Verify no pending timers
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('error handling', () => {
    it('throws on network error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(
        tryProvider(validProvider, validMessageRequest, validHeaders)
      ).rejects.toThrow('Network error');
    });

    it('returns error response without throwing', async () => {
      const errorResponse = createErrorResponse(500, { error: 'Server error' });
      globalThis.fetch = vi.fn().mockResolvedValue(errorResponse);

      const result = await tryProvider(validProvider, validMessageRequest, validHeaders);

      expect(result.status).toBe(500);
    });

    it('returns 401 response without throwing', async () => {
      const errorResponse = createErrorResponse(401, { error: 'Unauthorized' });
      globalThis.fetch = vi.fn().mockResolvedValue(errorResponse);

      const result = await tryProvider(validProvider, validMessageRequest, validHeaders);

      expect(result.status).toBe(401);
    });

    it('returns 429 response without throwing', async () => {
      const errorResponse = createErrorResponse(429, { error: 'Rate limited' });
      globalThis.fetch = vi.fn().mockResolvedValue(errorResponse);

      const result = await tryProvider(validProvider, validMessageRequest, validHeaders);

      expect(result.status).toBe(429);
    });
  });

  describe('body transformation', () => {
    it('preserves all request body fields', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      globalThis.fetch = mockFetch;

      const complexRequest = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        temperature: 0.7,
        system: 'You are a helpful assistant',
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
          { role: 'user', content: 'How are you?' },
        ],
        stream: true,
      };

      await tryProvider(validProvider, complexRequest, validHeaders);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(requestBody.max_tokens).toBe(2048);
      expect(requestBody.temperature).toBe(0.7);
      expect(requestBody.system).toBe('You are a helpful assistant');
      expect(requestBody.messages).toHaveLength(3);
      expect(requestBody.stream).toBe(true);
    });

    it('sends body as JSON string', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      globalThis.fetch = mockFetch;

      await tryProvider(validProvider, validMessageRequest, validHeaders);

      const body = mockFetch.mock.calls[0][1].body;
      expect(typeof body).toBe('string');
      expect(() => JSON.parse(body as string)).not.toThrow();
    });
  });
});

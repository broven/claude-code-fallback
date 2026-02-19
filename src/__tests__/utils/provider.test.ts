import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tryProvider } from "../../utils/provider";
import {
  validProvider,
  minimalProvider,
  providerWithCustomHeaders,
  providerWithBearerToken,
  openaiFormatProvider,
} from "../fixtures/providers";
import {
  validMessageRequest,
  streamingMessageRequest,
  validHeaders,
  successResponse,
  openaiSuccessResponse,
} from "../fixtures/requests";
import {
  createMockResponse,
  createSuccessResponse,
  createErrorResponse,
} from "../mocks/fetch";
import type { AppConfig } from "../../types";

const defaultConfig: AppConfig = {
  debug: false,
  providers: [],
  allowedTokens: [],
  tokenConfigs: [],
  cooldownDuration: 0,
  anthropicPrimaryDisabled: false,
  rectifier: {
    enabled: true,
    requestThinkingSignature: true,
    requestThinkingBudget: true,
    requestToolUseConcurrency: true,
  },
};

describe("tryProvider", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  describe("basic functionality", () => {
    it("makes POST request to provider baseUrl", async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      globalThis.fetch = mockFetch;

      await tryProvider(validProvider, validMessageRequest, validHeaders, defaultConfig);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toBe(validProvider.baseUrl);
      expect(mockFetch.mock.calls[0][1].method).toBe("POST");
    });

    it("sends JSON body with content-type header", async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      globalThis.fetch = mockFetch;

      await tryProvider(validProvider, validMessageRequest, validHeaders, defaultConfig);

      const requestInit = mockFetch.mock.calls[0][1] as RequestInit;
      expect(requestInit.headers).toHaveProperty(
        "content-type",
        "application/json",
      );
      expect(JSON.parse(requestInit.body as string)).toMatchObject({
        max_tokens: validMessageRequest.max_tokens,
        messages: validMessageRequest.messages,
      });
    });

    it("returns response from provider", async () => {
      const mockResponse = createSuccessResponse(successResponse);
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const result = await tryProvider(
        validProvider,
        validMessageRequest,
        validHeaders,
        defaultConfig,
      );

      expect(result).toBe(mockResponse);
    });
  });

  describe("model mapping", () => {
    it("applies model mapping when configured", async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      globalThis.fetch = mockFetch;

      const request = {
        ...validMessageRequest,
        model: "claude-sonnet-4-5-20250929",
      };

      await tryProvider(validProvider, request, validHeaders, defaultConfig);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(requestBody.model).toBe("anthropic/claude-sonnet-4");
    });

    it("preserves original model when no mapping exists", async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      globalThis.fetch = mockFetch;

      const request = {
        ...validMessageRequest,
        model: "unmapped-model",
      };

      await tryProvider(validProvider, request, validHeaders, defaultConfig);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(requestBody.model).toBe("unmapped-model");
    });

    it("preserves model when no modelMapping configured", async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      globalThis.fetch = mockFetch;

      await tryProvider(minimalProvider, validMessageRequest, validHeaders, defaultConfig);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(requestBody.model).toBe(validMessageRequest.model);
    });
  });

  describe("authentication", () => {
    it("sets x-api-key header by default", async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      globalThis.fetch = mockFetch;

      await tryProvider(minimalProvider, validMessageRequest, validHeaders, defaultConfig);

      const headers = mockFetch.mock.calls[0][1].headers as Record<
        string,
        string
      >;
      expect(headers["x-api-key"]).toBe(minimalProvider.apiKey);
    });

    it("sets Authorization header with Bearer prefix when authHeader is Authorization", async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      globalThis.fetch = mockFetch;

      await tryProvider(validProvider, validMessageRequest, validHeaders, defaultConfig);

      const headers = mockFetch.mock.calls[0][1].headers as Record<
        string,
        string
      >;
      expect(headers["Authorization"]).toBe(`Bearer ${validProvider.apiKey}`);
    });

    it("preserves existing Bearer prefix when already present", async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      globalThis.fetch = mockFetch;

      await tryProvider(
        providerWithBearerToken,
        validMessageRequest,
        validHeaders,
        defaultConfig,
      );

      const headers = mockFetch.mock.calls[0][1].headers as Record<
        string,
        string
      >;
      expect(headers["Authorization"]).toBe("Bearer sk-already-prefixed");
    });

    it("uses custom authHeader name when specified", async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      globalThis.fetch = mockFetch;

      await tryProvider(
        providerWithCustomHeaders,
        validMessageRequest,
        validHeaders,
        defaultConfig,
      );

      const headers = mockFetch.mock.calls[0][1].headers as Record<
        string,
        string
      >;
      expect(headers["x-api-key"]).toBe(providerWithCustomHeaders.apiKey);
    });
  });

  describe("header handling", () => {
    it("excludes hop-by-hop headers from request", async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      globalThis.fetch = mockFetch;

      const headersWithHopByHop = {
        ...validHeaders,
        connection: "keep-alive",
        "keep-alive": "timeout=5",
        host: "api.anthropic.com",
        "transfer-encoding": "chunked",
        te: "trailers",
        trailer: "Expires",
        upgrade: "websocket",
        "content-length": "1234",
      };

      await tryProvider(
        validProvider,
        validMessageRequest,
        headersWithHopByHop,
        defaultConfig,
      );

      const headers = mockFetch.mock.calls[0][1].headers as Record<
        string,
        string
      >;
      expect(headers["connection"]).toBeUndefined();
      expect(headers["keep-alive"]).toBeUndefined();
      expect(headers["host"]).toBeUndefined();
      expect(headers["transfer-encoding"]).toBeUndefined();
      expect(headers["te"]).toBeUndefined();
      expect(headers["trailer"]).toBeUndefined();
      expect(headers["upgrade"]).toBeUndefined();
      expect(headers["content-length"]).toBeUndefined();
    });

    it("excludes original auth headers (x-api-key, authorization)", async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      globalThis.fetch = mockFetch;

      const headersWithAuth = {
        ...validHeaders,
        "x-api-key": "original-key",
        authorization: "Bearer original-token",
      };

      await tryProvider(validProvider, validMessageRequest, headersWithAuth, defaultConfig);

      const headers = mockFetch.mock.calls[0][1].headers as Record<
        string,
        string
      >;
      // Should have the provider's auth, not the original
      expect(headers["Authorization"]).toBe(`Bearer ${validProvider.apiKey}`);
    });

    it("excludes debug skip headers from forwarded request", async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      globalThis.fetch = mockFetch;

      const headersWithDebug = {
        ...validHeaders,
        "x-ccf-debug-skip-anthropic": "1",
        "x-ccfallback-debug-skip-anthropic": "1",
      };

      await tryProvider(validProvider, validMessageRequest, headersWithDebug, defaultConfig);

      const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
      expect(headers["x-ccf-debug-skip-anthropic"]).toBeUndefined();
      expect(headers["x-ccfallback-debug-skip-anthropic"]).toBeUndefined();
    });

    it("applies custom headers from provider config", async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      globalThis.fetch = mockFetch;

      await tryProvider(
        providerWithCustomHeaders,
        validMessageRequest,
        validHeaders,
        defaultConfig,
      );

      const headers = mockFetch.mock.calls[0][1].headers as Record<
        string,
        string
      >;
      expect(headers["X-Custom-Header"]).toBe("custom-value");
      expect(headers["X-Another-Header"]).toBe("another-value");
    });

    it("sets content-type to application/json if not present", async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      globalThis.fetch = mockFetch;

      const headersWithoutContentType = {
        "anthropic-version": "2023-06-01",
      };

      await tryProvider(
        validProvider,
        validMessageRequest,
        headersWithoutContentType,
        defaultConfig,
      );

      const headers = mockFetch.mock.calls[0][1].headers as Record<
        string,
        string
      >;
      expect(headers["content-type"]).toBe("application/json");
    });

    it("preserves anthropic-version header", async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      globalThis.fetch = mockFetch;

      await tryProvider(validProvider, validMessageRequest, validHeaders, defaultConfig);

      const headers = mockFetch.mock.calls[0][1].headers as Record<
        string,
        string
      >;
      expect(headers["anthropic-version"]).toBe("2023-06-01");
    });
  });

  describe("timeout handling", () => {
    it("aborts request after 30 seconds", async () => {
      const mockFetch = vi
        .fn()
        .mockImplementation((url: string, init: RequestInit) => {
          return new Promise((resolve, reject) => {
            // Listen for abort signal
            init.signal?.addEventListener("abort", () => {
              reject(new Error("Aborted"));
            });
          });
        });
      globalThis.fetch = mockFetch;

      const promise = tryProvider(
        validProvider,
        validMessageRequest,
        validHeaders,
        defaultConfig,
      );

      // Advance time to trigger timeout
      vi.advanceTimersByTime(30001);

      await expect(promise).rejects.toThrow("Aborted");
    });

    it("clears timeout on successful response", async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      globalThis.fetch = mockFetch;

      await tryProvider(validProvider, validMessageRequest, validHeaders, defaultConfig);

      // Verify no pending timers
      expect(vi.getTimerCount()).toBe(0);
    });

    it("clears timeout on error", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
      globalThis.fetch = mockFetch;

      await expect(
        tryProvider(validProvider, validMessageRequest, validHeaders, defaultConfig),
      ).rejects.toThrow("Network error");

      // Verify no pending timers
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe("error handling", () => {
    it("throws on network error", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      await expect(
        tryProvider(validProvider, validMessageRequest, validHeaders, defaultConfig),
      ).rejects.toThrow("Network error");
    });

    it("returns error response without throwing", async () => {
      const errorResponse = createErrorResponse(500, { error: "Server error" });
      globalThis.fetch = vi.fn().mockResolvedValue(errorResponse);

      const result = await tryProvider(
        validProvider,
        validMessageRequest,
        validHeaders,
        defaultConfig,
      );

      expect(result.status).toBe(500);
    });

    it("returns 401 response without throwing", async () => {
      const errorResponse = createErrorResponse(401, { error: "Unauthorized" });
      globalThis.fetch = vi.fn().mockResolvedValue(errorResponse);

      const result = await tryProvider(
        validProvider,
        validMessageRequest,
        validHeaders,
        defaultConfig,
      );

      expect(result.status).toBe(401);
    });

    it("returns 429 response without throwing", async () => {
      const errorResponse = createErrorResponse(429, { error: "Rate limited" });
      globalThis.fetch = vi.fn().mockResolvedValue(errorResponse);

      const result = await tryProvider(
        validProvider,
        validMessageRequest,
        validHeaders,
        defaultConfig,
      );

      expect(result.status).toBe(429);
    });
  });

  describe("body transformation", () => {
    it("preserves all request body fields", async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      globalThis.fetch = mockFetch;

      const complexRequest = {
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 2048,
        temperature: 0.7,
        system: "You are a helpful assistant",
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi there!" },
          { role: "user", content: "How are you?" },
        ],
        stream: true,
      };

      await tryProvider(validProvider, complexRequest, validHeaders, defaultConfig);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(requestBody.max_tokens).toBe(2048);
      expect(requestBody.temperature).toBe(0.7);
      expect(requestBody.system).toBe("You are a helpful assistant");
      expect(requestBody.messages).toHaveLength(3);
      expect(requestBody.stream).toBe(true);
    });

    it("sends body as JSON string", async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      globalThis.fetch = mockFetch;

      await tryProvider(validProvider, validMessageRequest, validHeaders, defaultConfig);

      const body = mockFetch.mock.calls[0][1].body;
      expect(typeof body).toBe("string");
      expect(() => JSON.parse(body as string)).not.toThrow();
    });
  });

  describe("OpenAI format conversion", () => {
    it("converts request body to OpenAI format when format is openai", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(
          createMockResponse(openaiSuccessResponse, { status: 200 }),
        );
      globalThis.fetch = mockFetch;

      await tryProvider(
        openaiFormatProvider,
        validMessageRequest,
        validHeaders,
        defaultConfig,
      );

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      // OpenAI format should not have the Anthropic-specific fields at top level
      // Messages should be in OpenAI format
      expect(requestBody.messages).toBeDefined();
      expect(requestBody.model).toBe("anthropic/claude-sonnet-4"); // model mapping applied
    });

    it("converts non-streaming OpenAI response back to Anthropic format", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(
          createMockResponse(openaiSuccessResponse, { status: 200 }),
        );
      globalThis.fetch = mockFetch;

      const result = await tryProvider(
        openaiFormatProvider,
        validMessageRequest,
        validHeaders,
        defaultConfig,
      );

      expect(result.status).toBe(200);
      const body = (await result.json()) as any;
      expect(body.type).toBe("message");
      expect(body.role).toBe("assistant");
      expect(body.content[0].type).toBe("text");
      expect(body.content[0].text).toBe("Hello! How can I help you today?");
      expect(body.stop_reason).toBe("end_turn");
      expect(body.usage.input_tokens).toBe(10);
      expect(body.usage.output_tokens).toBe(15);
    });

    it("converts streaming OpenAI response to Anthropic SSE format", async () => {
      const encoder = new TextEncoder();
      const sseData = [
        'data: {"id":"chatcmpl-1","choices":[{"delta":{"content":"Hi"},"index":0,"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ].join("");

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(sseData));
          controller.close();
        },
      });

      const mockResponse = new Response(stream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const result = await tryProvider(
        openaiFormatProvider,
        streamingMessageRequest,
        validHeaders,
        defaultConfig,
      );

      expect(result.status).toBe(200);
      expect(result.headers.get("content-type")).toBe("text/event-stream");

      // Read the stream and verify events
      const decoder = new TextDecoder();
      const reader = result.body!.getReader();
      let output = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        output += decoder.decode(value, { stream: true });
      }

      expect(output).toContain("event: message_start");
      expect(output).toContain("event: content_block_delta");
      expect(output).toContain("event: message_stop");
    });

    it("does not convert request when format is anthropic", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(createSuccessResponse(successResponse));
      globalThis.fetch = mockFetch;

      await tryProvider(validProvider, validMessageRequest, validHeaders, defaultConfig);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      // Should still have Anthropic format (messages array with string content)
      expect(requestBody.messages[0].content).toBe("Hello, Claude!");
    });

    it("does not convert request when format is undefined", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(createSuccessResponse(successResponse));
      globalThis.fetch = mockFetch;

      await tryProvider(minimalProvider, validMessageRequest, validHeaders, defaultConfig);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(requestBody.messages[0].content).toBe("Hello, Claude!");
    });

    it("does not convert error responses from OpenAI format provider", async () => {
      const errorBody = { error: { message: "Rate limit exceeded" } };
      const errorResponse = createErrorResponse(429, errorBody);
      globalThis.fetch = vi.fn().mockResolvedValue(errorResponse);

      const result = await tryProvider(
        openaiFormatProvider,
        validMessageRequest,
        validHeaders,
        defaultConfig,
      );

      // Error responses should be passed through without conversion
      expect(result.status).toBe(429);
    });

    it("cleans tool schema for gemini-named OpenAI providers", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(
          createMockResponse(openaiSuccessResponse, { status: 200 }),
        );
      globalThis.fetch = mockFetch;

      const geminiProvider = {
        ...openaiFormatProvider,
        name: "gemini-openai-gateway",
      };

      await tryProvider(
        geminiProvider,
        {
          ...validMessageRequest,
          tools: [
            {
              name: "search_docs",
              description: "Search docs",
              input_schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  query: {
                    type: "string",
                    minLength: 1,
                  },
                },
                required: ["query"],
              },
            },
          ],
        },
        validHeaders,
        defaultConfig,
      );

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      const parameters = requestBody.tools[0].function.parameters;

      expect(parameters.additionalProperties).toBeUndefined();
      expect(parameters.properties.query.minLength).toBeUndefined();
    });
  });

  describe("Gemini schema cleanup", () => {
    it("cleans tool schema for gemini-named Anthropic providers", async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      globalThis.fetch = mockFetch;

      const geminiProvider = {
        ...minimalProvider,
        name: "gemini-anthropic-proxy",
      };

      await tryProvider(
        geminiProvider,
        {
          ...validMessageRequest,
          tools: [
            {
              name: "search_docs",
              description: "Search docs",
              input_schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  query: {
                    type: "string",
                    minLength: 1,
                  },
                },
                required: ["query"],
              },
            },
          ],
        },
        validHeaders,
        defaultConfig,
      );

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      const inputSchema = requestBody.tools[0].input_schema;

      expect(inputSchema.additionalProperties).toBeUndefined();
      expect(inputSchema.properties.query.minLength).toBeUndefined();
    });
  });
});

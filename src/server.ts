import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { AppConfig, ProviderConfig, loadConfig } from './config';
import { logger } from './logger';
import { logDb } from './db';
import {
  loggingMiddleware,
  setLogContext,
  getLogContext,
  logRequest,
} from './middleware/logging';
import { filterHeadersDebugOption } from './utlis';
import { ensureDataDir } from './utils/paths';

export interface ServerOptions {
  port?: number;
  configPath?: string;
}

export interface ServerInstance {
  port: number;
  stop: () => void;
}

/**
 * Helper to clean headers for response forwarding.
 * Removes hop-by-hop headers and content-specific headers.
 */
function cleanHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  const unsafeHeaders = [
    'content-length',
    'content-encoding',
    'transfer-encoding',
    'connection',
    'keep-alive',
    'te',
    'trailer',
    'upgrade',
    'host',
  ];

  headers.forEach((value, key) => {
    if (!unsafeHeaders.includes(key.toLowerCase())) {
      result[key] = value;
    }
  });

  return result;
}

/**
 * Helper to attempt a request to a specific provider.
 */
async function tryProvider(
  provider: ProviderConfig,
  body: any,
  originalHeaders: Record<string, string>,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const {
      name,
      baseUrl,
      apiKey,
      authHeader,
      headers: customHeaders,
      modelMapping,
    } = provider;

    let model = body.model;
    if (modelMapping && modelMapping[model]) {
      model = modelMapping[model];
    }

    const newBody = { ...body, model };

    const excludeHeaders = [
      'connection',
      'keep-alive',
      'te',
      'trailer',
      'transfer-encoding',
      'upgrade',
      'host',
      'content-length',
      'x-api-key',
      'authorization',
    ];

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(originalHeaders)) {
      const lowerKey = key.toLowerCase();
      if (!excludeHeaders.includes(lowerKey)) {
        headers[key] = value;
      }
    }

    if (customHeaders) {
      Object.assign(headers, customHeaders);
    }

    headers['content-type'] = headers['content-type'] || 'application/json';

    const headerName = authHeader || 'x-api-key';
    if (headerName === 'Authorization') {
      if (!apiKey.startsWith('Bearer ')) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      } else {
        headers['Authorization'] = apiKey;
      }
    } else {
      headers[headerName] = apiKey;
    }

    console.log(`[Proxy] Attempting provider: ${name} (Model: ${model})`);

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(newBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    throw error;
  }
}

function createApp(appConfig: AppConfig): Hono {
  const app = new Hono();

  app.use('*', loggingMiddleware);

  app.get('/', (c) => {
    return c.text(
      `Claude Code Fallback Proxy is running! Loaded ${appConfig.providers.length} fallback providers.`,
    );
  });

  app.post('/v1/messages', async (c) => {
    const body = await c.req.json();
    const headers = c.req.header();
    const skipAnthropic = headers['x-ccfallback-debug-skip-anthropic'] === '1';

    setLogContext(c, 'requestBody', body);
    setLogContext(c, 'requestHeaders', headers);

    await logger.log('Incoming Request', {
      method: 'POST',
      url: c.req.url,
      headers,
      body,
    });

    // --- Attempt 1: Primary Anthropic API ---
    let lastErrorResponse: Response | null = null;
    let lastErrorBody: string | null = null;
    if (!skipAnthropic) {
      try {
        console.log(
          `[Proxy] Forwarding request to Primary Anthropic API (Model: ${body.model})`,
        );

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        const filteredHeader = filterHeadersDebugOption(headers);
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: filteredHeader,
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          console.log('[Proxy] Anthropic API request successful');
          const clonedResponse = response.clone();
          const responseBody = await clonedResponse.text();
          const finalResponse = new Response(response.body, {
            status: response.status,
            headers: cleanHeaders(response.headers),
          });
          setLogContext(c, 'providerUsed', 'anthropic');
          setLogContext(c, 'attemptCount', 1);
          logRequest(c, finalResponse, responseBody);
          return finalResponse;
        }

        const status = response.status;
        lastErrorBody = await response.text();
        lastErrorResponse = new Response(lastErrorBody, {
          status,
          headers: cleanHeaders(response.headers),
        });

        console.log(`[Proxy] Anthropic API failed with status ${status}`);

        if (status !== 401 && status !== 403 && status !== 429 && status < 500) {
          console.log(
            `[Proxy] Error ${status} is not eligible for fallback. Returning error.`,
          );
          setLogContext(c, 'providerUsed', 'anthropic');
          setLogContext(c, 'attemptCount', 1);
          logRequest(c, lastErrorResponse!, lastErrorBody);
          return lastErrorResponse;
        }
      } catch (error: any) {
        console.error(
          '[Proxy] Network error or timeout contacting Anthropic:',
          error.message,
        );
      }
    }

    // --- Attempt 2+: Fallback Providers ---
    if (appConfig.providers.length === 0) {
      console.log('[Proxy] No fallback providers configured.');
      setLogContext(c, 'attemptCount', 1);
      if (lastErrorResponse) {
        setLogContext(c, 'providerUsed', 'anthropic');
        logRequest(c, lastErrorResponse, lastErrorBody);
        return lastErrorResponse;
      }
      const errorBody = {
        error: {
          type: 'proxy_error',
          message: 'Primary API failed and no fallbacks configured',
        },
      };
      const response = c.json(errorBody, 502);
      logRequest(c, response, JSON.stringify(errorBody));
      return response;
    }

    setLogContext(c, 'fallbackTriggered', true);
    let attemptCount = 1;

    for (const provider of appConfig.providers) {
      attemptCount++;
      try {
        const response = await tryProvider(
          provider,
          body,
          headers as Record<string, string>,
        );

        if (response.ok) {
          console.log(`[Proxy] Provider ${provider.name} request successful`);
          const clonedResponse = response.clone();
          const responseBody = await clonedResponse.text();
          const finalResponse = new Response(response.body, {
            status: response.status,
            headers: cleanHeaders(response.headers),
          });
          setLogContext(c, 'providerUsed', provider.name);
          setLogContext(c, 'attemptCount', attemptCount);
          logRequest(c, finalResponse, responseBody);
          return finalResponse;
        }

        const status = response.status;
        const errorText = await response.text();
        console.log(
          `[Proxy] Provider ${provider.name} failed with status ${status}`,
        );

        lastErrorResponse = new Response(errorText, {
          status,
          headers: cleanHeaders(response.headers),
        });
        lastErrorBody = errorText;
      } catch (error: any) {
        console.error(`[Proxy] Provider ${provider.name} error:`, error.message);
      }
    }

    // All failed
    console.log('[Proxy] All providers failed.');
    setLogContext(c, 'attemptCount', attemptCount);

    if (lastErrorResponse) {
      logRequest(c, lastErrorResponse, lastErrorBody);
      return lastErrorResponse;
    }

    const errorBody = {
      error: {
        type: 'fallback_exhausted',
        message: 'All API providers failed',
      },
    };
    const response = c.json(errorBody, 502);
    logRequest(c, response, JSON.stringify(errorBody));
    return response;
  });

  return app;
}

/**
 * Create and start the fallback proxy server.
 */
export async function createServer(options: ServerOptions = {}): Promise<ServerInstance> {
  ensureDataDir();

  const port = options.port ?? parseInt(process.env.PORT || '3000', 10);
  const appConfig = await loadConfig(options.configPath);

  logger.setEnabled(appConfig.debug);
  logDb.init(appConfig.logging);

  const app = createApp(appConfig);

  const server = serve({
    fetch: app.fetch,
    port,
  });

  console.log(`[Proxy] Server is running on http://127.0.0.1:${port}`);
  console.log(`[Proxy] Loaded ${appConfig.providers.length} fallback provider(s)`);

  const stop = () => {
    logDb.close();
    server.close();
    console.log('[Proxy] Server stopped');
  };

  // Graceful shutdown
  const shutdown = () => {
    stop();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return { port, stop };
}

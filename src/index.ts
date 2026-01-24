import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { loadConfig, AppConfig, ProviderConfig } from './config';
import { logger } from './logger';
import { logDb } from './db';
import {
  loggingMiddleware,
  setLogContext,
  getLogContext,
  logRequest,
} from './middleware/logging';

const app = new Hono();
const port = parseInt(process.env.PORT || '3000', 10);

// Load providers at startup
let appConfig: AppConfig = {
  debug: false,
  providers: [],
  logging: {
    enabled: true,
    logResponseBody: true,
    dbPath: './logs.db',
    maxSavedMessages: 1000,
  },
};
loadConfig().then((config) => {
  appConfig = config;
  logger.setEnabled(config.debug);
  logDb.init(config.logging);
});

// Apply logging middleware
app.use('*', loggingMiddleware);

app.get('/', (c) => {
  return c.text(
    `Claude Code Fallback Proxy is running! Loaded ${appConfig.providers.length} fallback providers.`,
  );
});

/**
 * Helper to clean headers for response forwarding
 * Removes hop-by-hop headers and content-specific headers that might mismatch if body is changed
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
 * Build headers to forward to upstream API
 * Excludes hop-by-hop headers and sets appropriate auth headers
 */
function buildForwardHeaders(
  originalHeaders: Record<string, string>,
): Record<string, string> {
  const hopByHopHeaders = [
    'connection',
    'keep-alive',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    'host',
    'content-length',
  ];

  const forwardHeaders: Record<string, string> = {};

  // Forward all non hop-by-hop headers
  for (const [key, value] of Object.entries(originalHeaders)) {
    const lowerKey = key.toLowerCase();
    if (!hopByHopHeaders.includes(lowerKey)) {
      forwardHeaders[key] = value;
    }
  }

  return forwardHeaders;
}

/**
 * Helper to attempt a request to a specific provider
 */
async function tryProvider(
  provider: ProviderConfig,
  body: any,
  originalHeaders: Record<string, string>,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

  try {
    const {
      name,
      baseUrl,
      apiKey,
      authHeader,
      headers: customHeaders,
      modelMapping,
    } = provider;

    // Apply model mapping
    let model = body.model;
    if (modelMapping && modelMapping[model]) {
      model = modelMapping[model];
    } else if (modelMapping && modelMapping['default']) {
      // Fallback mapping if specific model not found but default exists
      // However, usually we want exact match or pass through.
      // Let's keep it simple: exact match or pass through.
    }

    const newBody = { ...body, model };

    // Headers to exclude from forwarding
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

    // Start with forwarded headers from original request
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(originalHeaders)) {
      const lowerKey = key.toLowerCase();
      if (!excludeHeaders.includes(lowerKey)) {
        headers[key] = value;
      }
    }

    // Apply custom headers from provider config (override forwarded ones)
    if (customHeaders) {
      Object.assign(headers, customHeaders);
    }

    // Ensure content-type is set
    headers['content-type'] = headers['content-type'] || 'application/json';

    // Auth Logic
    // Default to 'x-api-key' if not specified
    const headerName = authHeader || 'x-api-key';

    if (headerName === 'Authorization') {
      // If Authorization, ensure it starts with Bearer if not present (unless user put it in key)
      // Usually users put just the key "sk-..."
      if (!apiKey.startsWith('Bearer ')) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      } else {
        headers['Authorization'] = apiKey;
      }
    } else {
      // For x-api-key and others, use raw key
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

app.post('/v1/messages', async (c) => {
  const body = await c.req.json();
  const headers = c.req.header();

  // Set log context for this request
  setLogContext(c, 'requestBody', body);
  setLogContext(c, 'requestHeaders', headers);

  // Log incoming request if debug is enabled
  await logger.log('Incoming Request', {
    method: 'POST',
    url: c.req.url,
    headers,
    body,
  });

  // Extract essential headers
  let anthropicApiKey = headers['x-api-key'];
  const anthropicVersion = headers['anthropic-version'];
  const contentType = headers['content-type'] || 'application/json';

  // Track whether original request used Authorization header (for OAuth tokens)
  let useAuthorizationHeader = false;

  // Fallback to Authorization header if x-api-key is missing
  // This allows OpenAI-compatible clients and OAuth tokens to use this proxy
  if (!anthropicApiKey && headers['authorization']) {
    useAuthorizationHeader = true;
    const auth = headers['authorization'];
    if (auth.startsWith('Bearer ')) {
      anthropicApiKey = auth.substring(7);
    } else {
      anthropicApiKey = auth;
    }
  }

  if (!anthropicApiKey) {
    const errorBody = {
      error: {
        type: 'authentication_error',
        message: 'Missing x-api-key header (or Authorization header)',
      },
    };
    const response = c.json(errorBody, 401);
    setLogContext(c, 'attemptCount', 0);
    logRequest(c, response, JSON.stringify(errorBody));
    return response;
  }

  // --- Attempt 1: Primary Anthropic API ---
  let lastErrorResponse: Response | null = null;
  let lastErrorBody: string | null = null;

  try {
    const forwardHeaders = buildForwardHeaders(headers);
    console.log(
      `[Proxy] Forwarding request to Primary Anthropic API (Model: ${body.model})`,
    );
    console.log(
      `[Proxy] Auth method: ${useAuthorizationHeader ? 'Authorization Bearer' : 'x-api-key'}`,
    );
    console.log(
      `[Proxy] Forward headers:`,
      JSON.stringify({
        Authorization: forwardHeaders['Authorization']
          ? forwardHeaders['Authorization'].substring(0, 30) + '...'
          : undefined,
        'x-api-key': forwardHeaders['x-api-key']
          ? forwardHeaders['x-api-key'].substring(0, 20) + '...'
          : undefined,
      }),
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: forwardHeaders,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      console.log('[Proxy] Anthropic API request successful');
      // Clone response to read body for logging
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

    // Capture error for fallback decision
    const status = response.status;
    lastErrorBody = await response.text();
    lastErrorResponse = new Response(lastErrorBody, {
      status,
      headers: cleanHeaders(response.headers),
    });

    console.log(`[Proxy] Anthropic API failed with status ${status}`);

    // Decide if we should fallback
    // Fallback on: 401 (Auth), 403 (Forbidden/Quota), 429 (Rate Limit), 5xx (Server Error)
    // Do NOT fallback on: 400 (Bad Request - likely invalid body)
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
    // Proceed to fallback
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

  console.log(
    `[Proxy] Starting fallback chain with ${appConfig.providers.length} providers...`,
  );

  setLogContext(c, 'fallbackTriggered', true);
  let attemptCount = 1; // Already tried primary

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
        // Clone response to read body for logging
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

      // Update last error to the most recent failure
      lastErrorResponse = new Response(errorText, {
        status,
        headers: cleanHeaders(response.headers),
      });
      lastErrorBody = errorText;

      // Continue to next provider...
    } catch (error: any) {
      console.error(`[Proxy] Provider ${provider.name} error:`, error.message);
      // Continue to next provider...
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

console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});

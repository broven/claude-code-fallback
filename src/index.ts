import { Hono } from "hono";
import { Bindings } from "./types";
import { loadConfig } from "./config";
import { filterHeadersDebugOption, cleanHeaders } from "./utils/headers";
import { tryProvider } from "./utils/provider";
import {
  authMiddleware,
  adminPage,
  getConfig,
  postConfig,
  getTokens,
  postTokens,
  getSettings,
  postSettings,
  testProvider,
  getAnthropicStatus,
  postAnthropicStatus,
} from "./admin";
import {
  isProviderAvailable,
  markProviderFailed,
  markProviderSuccess,
  getLeastRecentlyFailedProvider,
} from "./utils/circuit-breaker";
import { createLogger, generateRequestId } from "./utils/logger";
import { buildCurlCommand } from "./utils/curl";

const app = new Hono<{ Bindings: Bindings }>();

// Redirect root to admin panel
app.get("/", (c) => {
  return c.redirect("/admin");
});

// Admin routes
app.get("/admin", authMiddleware, adminPage);
app.get("/admin/config", authMiddleware, getConfig);
app.post("/admin/config", authMiddleware, postConfig);
app.get("/admin/tokens", authMiddleware, getTokens);
app.post("/admin/tokens", authMiddleware, postTokens);
app.get("/admin/settings", authMiddleware, getSettings);
app.post("/admin/settings", authMiddleware, postSettings);
app.post("/admin/test-provider", authMiddleware, testProvider);
app.get("/admin/anthropic-status", authMiddleware, getAnthropicStatus);
app.post("/admin/anthropic-status", authMiddleware, postAnthropicStatus);

// Main proxy endpoint
app.post("/v1/messages", async (c) => {
  const startTime = Date.now();

  // Generate or extract request ID for tracing
  const headers = c.req.header();
  const requestId = headers["x-request-id"] || generateRequestId();

  const config = await loadConfig(c.env);
  const logger = createLogger(requestId, config.debug);

  const body = await c.req.json();
  const skipAnthropic = headers["x-ccf-debug-skip-anthropic"] === "1";
  const originalUrl = c.req.url;

  const logDebugCurl = () => {
    const curl = buildCurlCommand(originalUrl, headers, body);
    logger.error('request.debug_curl', 'Reproducible curl command for failed request', { curl });
  };

  logger.info('request.start', 'Incoming proxy request', {
    model: body.model,
    stream: body.stream,
    skipAnthropic,
  });

  // Get cooldown from config (defaults to env or 300s)
  const cooldownDuration = config.cooldownDuration;

  // Check for authentication if tokens are configured
  if (config.allowedTokens && config.allowedTokens.length > 0) {
    const authKey = headers["x-ccf-api-key"];
    if (!authKey || !config.allowedTokens.includes(authKey)) {
      logger.warn('auth.failure', 'Unauthorized request - missing or invalid API key');
      return c.json(
        {
          error: {
            type: "authentication_error",
            message: "Invalid or missing x-ccf-api-key",
          },
        },
        401,
      );
    }
  }

  // --- Attempt 1: Primary Anthropic API ---
  let lastErrorResponse: Response | null = null;
  const anthropicName = "anthropic-primary";
  const cooldownSkipped: string[] = [];

  if (config.anthropicPrimaryDisabled) {
    logger.info('provider.attempt', 'Skipping anthropic-primary (disabled by admin)', {
      provider: anthropicName,
    });
  }

  if (!skipAnthropic && !config.anthropicPrimaryDisabled) {
    // Check circuit breaker
    const isAvailable = await isProviderAvailable(anthropicName, c.env);

    if (!isAvailable) {
      logger.info('circuit_breaker.skip', 'Provider in cooldown', {
        provider: anthropicName,
      });
      cooldownSkipped.push(anthropicName);
    } else {
      try {
        const attemptStart = Date.now();
        logger.info('provider.attempt', 'Forwarding request to Anthropic API', {
          provider: anthropicName,
          model: body.model,
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        const filteredHeaders = filterHeadersDebugOption(headers);

        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: filteredHeaders,
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const latency = Date.now() - attemptStart;

        if (response.ok) {
          logger.info('provider.success', 'Anthropic API request successful', {
            provider: anthropicName,
            model: body.model,
            status: response.status,
            latency,
          });
          await markProviderSuccess(anthropicName, c.env);
          const cleanedHeaders = cleanHeaders(response.headers);
          const responseHeaders = new Headers(cleanedHeaders);
          responseHeaders.set('x-request-id', requestId);
          return new Response(response.body, {
            status: response.status,
            headers: responseHeaders,
          });
        }

        const status = response.status;
        const errorBody = await response.text();
        lastErrorResponse = new Response(errorBody, {
          status,
          headers: cleanHeaders(response.headers),
        });

        logger.warn('provider.failure', 'Anthropic API request failed', {
          provider: anthropicName,
          model: body.model,
          status,
          latency,
        });

        // Only fallback on specific error codes: 401, 403, 429, 5xx
        if (
          status !== 401 &&
          status !== 403 &&
          status !== 429 &&
          status < 500
        ) {
          logger.info('request.complete', 'Error not eligible for fallback', {
            provider: anthropicName,
            model: body.model,
            status,
            latency: Date.now() - startTime,
          });
          return lastErrorResponse;
        }

        // Mark failed
        await markProviderFailed(anthropicName, cooldownDuration, c.env);
        logger.info('circuit_breaker.cooldown', 'Provider marked as failed', {
          provider: anthropicName,
        });
      } catch (error: any) {
        const latency = Date.now() - startTime;
        logger.error('provider.timeout', 'Network error or timeout contacting Anthropic', {
          provider: anthropicName,
          model: body.model,
          error: error.message,
          latency,
        });
        await markProviderFailed(anthropicName, cooldownDuration, c.env);
      }
    }
  }

  // --- Attempt 2+: Fallback Providers ---
  if (config.providers.length === 0) {
    logger.warn('request.error', 'No fallback providers configured');
    logDebugCurl();
    if (lastErrorResponse) {
      return lastErrorResponse;
    }
    return c.json(
      {
        error: {
          type: "proxy_error",
          message: "Primary API failed and no fallbacks configured",
        },
      },
      502,
    );
  }

  for (const provider of config.providers) {
    if (provider.disabled) {
      logger.info('provider.attempt', 'Skipping disabled provider', {
        provider: provider.name,
      });
      continue;
    }

    const isAvailable = await isProviderAvailable(provider.name, c.env);
    if (!isAvailable) {
      logger.info('circuit_breaker.skip', 'Provider in cooldown', {
        provider: provider.name,
      });
      cooldownSkipped.push(provider.name);
      continue;
    }

    const attemptStart = Date.now();
    try {
      logger.info('provider.attempt', 'Trying fallback provider', {
        provider: provider.name,
        model: body.model,
      });

      const response = await tryProvider(
        provider,
        body,
        headers as Record<string, string>,
        config,
      );

      const latency = Date.now() - attemptStart;

      if (response.ok) {
        logger.info('provider.success', 'Fallback provider request successful', {
          provider: provider.name,
          model: body.model,
          status: response.status,
          latency,
        });
        await markProviderSuccess(provider.name, c.env);
        const cleanedHeaders = cleanHeaders(response.headers);
        const responseHeaders = new Headers(cleanedHeaders);
        responseHeaders.set('x-request-id', requestId);
        return new Response(response.body, {
          status: response.status,
          headers: responseHeaders,
        });
      }

      const status = response.status;
      const errorText = await response.text();
      logger.warn('provider.failure', 'Fallback provider request failed', {
        provider: provider.name,
        model: body.model,
        status,
        latency,
        error: errorText.substring(0, 200), // Limit error text length
      });
      await markProviderFailed(provider.name, cooldownDuration, c.env);

      lastErrorResponse = new Response(errorText, {
        status,
        headers: cleanHeaders(response.headers),
      });
    } catch (error: any) {
      const latency = Date.now() - attemptStart;
      logger.error('provider.timeout', 'Fallback provider error', {
        provider: provider.name,
        model: body.model,
        error: error.message,
        latency,
      });
      await markProviderFailed(provider.name, cooldownDuration, c.env);
    }
  }

  // --- Safety Valve: try least-recently-failed provider when all are in cooldown ---
  if (cooldownSkipped.length > 0) {
    const safeName = await getLeastRecentlyFailedProvider(cooldownSkipped, c.env);
    if (safeName) {
      logger.info('safety_valve.triggered', 'All providers in cooldown, trying least recently failed', {
        provider: safeName,
        skippedCount: cooldownSkipped.length,
      });
      const attemptStart = Date.now();
      try {
        if (safeName === anthropicName) {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000);
          const filteredHeaders = filterHeadersDebugOption(headers);

          const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: filteredHeaders,
            body: JSON.stringify(body),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);
          const latency = Date.now() - attemptStart;

          if (response.ok) {
            logger.info('provider.success', 'Safety valve request successful', {
              provider: anthropicName,
              model: body.model,
              status: response.status,
              latency,
            });
            await markProviderSuccess(anthropicName, c.env);
            const cleanedHeaders = cleanHeaders(response.headers);
            const responseHeaders = new Headers(cleanedHeaders);
            responseHeaders.set('x-request-id', requestId);
            return new Response(response.body, {
              status: response.status,
              headers: responseHeaders,
            });
          }

          const errorBody = await response.text();
          logger.warn('provider.failure', 'Safety valve request failed', {
            provider: anthropicName,
            model: body.model,
            status: response.status,
            latency,
          });
          await markProviderFailed(anthropicName, cooldownDuration, c.env);
          lastErrorResponse = new Response(errorBody, {
            status: response.status,
            headers: cleanHeaders(response.headers),
          });
        } else {
          const safeProvider = config.providers.find(p => p.name === safeName);
          if (safeProvider) {
            const response = await tryProvider(
              safeProvider,
              body,
              headers as Record<string, string>,
              config,
            );

            const latency = Date.now() - attemptStart;

            if (response.ok) {
              logger.info('provider.success', 'Safety valve request successful', {
                provider: safeName,
                model: body.model,
                status: response.status,
                latency,
              });
              await markProviderSuccess(safeName, c.env);
              const cleanedHeaders = cleanHeaders(response.headers);
              const responseHeaders = new Headers(cleanedHeaders);
              responseHeaders.set('x-request-id', requestId);
              return new Response(response.body, {
                status: response.status,
                headers: responseHeaders,
              });
            }

            const errorText = await response.text();
            logger.warn('provider.failure', 'Safety valve request failed', {
              provider: safeName,
              model: body.model,
              status: response.status,
              latency,
            });
            await markProviderFailed(safeName, cooldownDuration, c.env);
            lastErrorResponse = new Response(errorText, {
              status: response.status,
              headers: cleanHeaders(response.headers),
            });
          }
        }
      } catch (error: any) {
        const latency = Date.now() - attemptStart;
        logger.error('provider.timeout', 'Safety valve error', {
          provider: safeName,
          model: body.model,
          error: error.message,
          latency,
        });
        await markProviderFailed(safeName, cooldownDuration, c.env);
      }
    }
  }

  if (lastErrorResponse) {
    logger.error('request.error', 'All providers failed, returning last error', {
      model: body.model,
      latency: Date.now() - startTime,
    });
    logDebugCurl();
    return lastErrorResponse;
  }

  logger.error('request.error', 'All API providers exhausted', {
    model: body.model,
    latency: Date.now() - startTime,
  });
  logDebugCurl();
  return c.json(
    {
      error: {
        type: "fallback_exhausted",
        message: "All API providers failed",
        model: body.model,
      },
    },
    502,
  );
});

export default app;

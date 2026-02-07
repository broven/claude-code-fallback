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
} from "./admin";
import {
  isProviderAvailable,
  markProviderFailed,
  markProviderSuccess,
} from "./utils/circuit-breaker";

const app = new Hono<{ Bindings: Bindings }>();

// Health check endpoint
app.get("/", async (c) => {
  const config = await loadConfig(c.env);
  return c.text(
    `Claude Code Fallback Proxy (Workers) is running! Loaded ${config.providers.length} fallback provider(s).`,
  );
});

// Admin routes
app.get("/admin", authMiddleware, adminPage);
app.get("/admin/config", authMiddleware, getConfig);
app.post("/admin/config", authMiddleware, postConfig);
app.get("/admin/tokens", authMiddleware, getTokens);
app.post("/admin/tokens", authMiddleware, postTokens);
app.get("/admin/settings", authMiddleware, getSettings);
app.post("/admin/settings", authMiddleware, postSettings);

// Main proxy endpoint
app.post("/v1/messages", async (c) => {
  const config = await loadConfig(c.env);
  const body = await c.req.json();
  const headers = c.req.header();
  const skipAnthropic = headers["x-ccf-debug-skip-anthropic"] === "1";

  // Get cooldown from config (defaults to env or 300s)
  const cooldownDuration = config.cooldownDuration;

  // Check for authentication if tokens are configured
  if (config.allowedTokens && config.allowedTokens.length > 0) {
    const authKey = headers["x-ccf-api-key"];
    if (!authKey || !config.allowedTokens.includes(authKey)) {
      console.log("[Proxy] Unauthorized request - missing or invalid API key");
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

  if (config.debug) {
    console.log("[Proxy] Incoming Request", {
      method: "POST",
      url: c.req.url,
      model: body.model,
    });
  }

  // --- Attempt 1: Primary Anthropic API ---
  let lastErrorResponse: Response | null = null;
  const anthropicName = "anthropic-primary";

  if (!skipAnthropic) {
    // Check circuit breaker
    const isAvailable = await isProviderAvailable(anthropicName, c.env);

    if (!isAvailable) {
      console.log(`[Proxy] Skipping ${anthropicName} (Circuit Breaker active)`);
    } else {
      try {
        console.log(
          `[Proxy] Forwarding request to Primary Anthropic API (Model: ${body.model})`,
        );

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

        if (response.ok) {
          console.log("[Proxy] Anthropic API request successful");
          await markProviderSuccess(anthropicName, c.env);
          return new Response(response.body, {
            status: response.status,
            headers: cleanHeaders(response.headers),
          });
        }

        const status = response.status;
        const errorBody = await response.text();
        lastErrorResponse = new Response(errorBody, {
          status,
          headers: cleanHeaders(response.headers),
        });

        console.log(`[Proxy] Anthropic API failed with status ${status}`);

        // Only fallback on specific error codes: 401, 403, 429, 5xx
        if (
          status !== 401 &&
          status !== 403 &&
          status !== 429 &&
          status < 500
        ) {
          console.log(
            `[Proxy] Error ${status} is not eligible for fallback. Returning error.`,
          );
          return lastErrorResponse;
        }

        // Mark failed
        await markProviderFailed(anthropicName, cooldownDuration, c.env);
      } catch (error: any) {
        console.error(
          "[Proxy] Network error or timeout contacting Anthropic:",
          error.message,
        );
        await markProviderFailed(anthropicName, cooldownDuration, c.env);
      }
    }
  }

  // --- Attempt 2+: Fallback Providers ---
  if (config.providers.length === 0) {
    console.log("[Proxy] No fallback providers configured.");
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
    const isAvailable = await isProviderAvailable(provider.name, c.env);
    if (!isAvailable) {
      console.log(
        `[Proxy] Skipping provider ${provider.name} (Circuit Breaker active)`,
      );
      continue;
    }

    try {
      const response = await tryProvider(
        provider,
        body,
        headers as Record<string, string>,
      );

      if (response.ok) {
        console.log(`[Proxy] Provider ${provider.name} request successful`);
        await markProviderSuccess(provider.name, c.env);
        return new Response(response.body, {
          status: response.status,
          headers: cleanHeaders(response.headers),
        });
      }

      const status = response.status;
      const errorText = await response.text();
      console.log(
        `[Proxy] Provider ${provider.name} failed with status ${status}`,
      );

      await markProviderFailed(provider.name, cooldownDuration, c.env);

      lastErrorResponse = new Response(errorText, {
        status,
        headers: cleanHeaders(response.headers),
      });
    } catch (error: any) {
      console.error(`[Proxy] Provider ${provider.name} error:`, error.message);
      await markProviderFailed(provider.name, cooldownDuration, c.env);
    }
  }

  // All failed
  console.log("[Proxy] All providers failed.");

  if (lastErrorResponse) {
    return lastErrorResponse;
  }

  return c.json(
    {
      error: {
        type: "fallback_exhausted",
        message: "All API providers failed",
      },
    },
    502,
    1
  );
});

export default app;

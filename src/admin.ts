import { Context, Next } from 'hono';
import { Bindings, ProviderConfig, ProviderState, TokenConfig } from './types';
import {
  getRawConfig,
  saveConfig,
  getRawTokens,
  saveTokens,
  parseTokenConfigs,
  getRawCooldown,
  saveCooldown,
  getRawAnthropicDisabled,
  saveAnthropicDisabled,
  getRawRectifierConfig,
  saveRectifierConfig,
} from './config';
import type { RectifierConfig } from './types/rectifier';
import { convertAnthropicToOpenAI } from './utils/format-converter';
import { ADMIN_HTML } from './admin-html';

/**
 * Authentication middleware - validates token from query or header
 */
export async function authMiddleware(
  c: Context<{ Bindings: Bindings }>,
  next: Next,
) {
  const token =
    c.req.query('token') ||
    c.req.header('Authorization')?.replace('Bearer ', '');

  if (!c.env.ADMIN_TOKEN) {
    return c.text('ADMIN_TOKEN not configured', 500);
  }

  if (token !== c.env.ADMIN_TOKEN) {
    // For browser navigation to /admin, redirect to login page
    const accept = c.req.header('Accept') || '';
    if (c.req.path === '/admin' && accept.includes('text/html')) {
      return c.redirect('/admin/login');
    }
    return c.text('Unauthorized', 401);
  }

  await next();
}

/**
 * Login page - served from the same React bundle
 * The React router handles the /login route
 */
export async function loginPage(c: Context<{ Bindings: Bindings }>) {
  return c.html(ADMIN_HTML);
}

/**
 * Admin page HTML - served from the React bundle
 */
export async function adminPage(c: Context<{ Bindings: Bindings }>) {
  return c.html(ADMIN_HTML);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * GET /admin/config - Get current configuration
 */
export async function getConfig(c: Context<{ Bindings: Bindings }>) {
  const config = await getRawConfig(c.env);
  return c.json(JSON.parse(config));
}

/**
 * POST /admin/config - Save configuration
 */
export async function postConfig(c: Context<{ Bindings: Bindings }>) {
  try {
    const providers = await c.req.json<ProviderConfig[]>();

    // Validate
    if (!Array.isArray(providers)) {
      return c.json({ error: 'Config must be an array' }, 400);
    }

    for (const p of providers) {
      if (!p.name || !p.baseUrl || !p.apiKey) {
        return c.json(
          { error: `Invalid provider: missing name, baseUrl, or apiKey` },
          400,
        );
      }
      if (p.format && p.format !== 'anthropic' && p.format !== 'openai') {
        return c.json(
          { error: `Invalid provider format: must be "anthropic" or "openai"` },
          400,
        );
      }
    }

    await saveConfig(c.env, providers);
    return c.json({ success: true, count: providers.length });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
}

/**
 * GET /admin/tokens - Get allowed tokens
 */
export async function getTokens(c: Context<{ Bindings: Bindings }>) {
  const raw = await getRawTokens(c.env);
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) {
    return c.json(parseTokenConfigs(parsed));
  }
  return c.json([]);
}

/**
 * POST /admin/tokens - Save allowed tokens
 */
export async function postTokens(c: Context<{ Bindings: Bindings }>) {
  try {
    const tokens = await c.req.json<unknown[]>();

    // Validate
    if (!Array.isArray(tokens)) {
      return c.json({ error: 'Tokens must be an array' }, 400);
    }

    // Validate note format if present
    const notePattern = /^[a-zA-Z0-9 -]*$/;
    for (const item of tokens) {
      if (
        item &&
        typeof item === 'object' &&
        'note' in item &&
        (item as TokenConfig).note
      ) {
        if (!notePattern.test((item as TokenConfig).note!)) {
          return c.json(
            {
              error:
                'Token note must contain only English letters, numbers, spaces, and hyphens',
            },
            400,
          );
        }
      }
    }

    const validTokens = parseTokenConfigs(tokens);

    await saveTokens(c.env, validTokens);
    return c.json({ success: true, count: validTokens.length });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
}

/**
 * GET /admin/settings - Get global settings
 */
export async function getSettings(c: Context<{ Bindings: Bindings }>) {
  const cooldown = await getRawCooldown(c.env);
  return c.json({ cooldownDuration: cooldown });
}

const TEST_MODELS = [
  { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4' },
  { id: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude 3.5 Haiku' },
];

interface ModelTestResult {
  model: string;
  label: string;
  success: boolean;
  message?: string;
  error?: string;
  mappedTo?: string;
  hasMappingConfigured: boolean;
}

async function testSingleModel(
  provider: ProviderConfig,
  modelId: string,
  modelLabel: string,
  env: Bindings
): Promise<ModelTestResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const hasMappingConfigured = !!(
    provider.modelMapping && provider.modelMapping[modelId]
  );
  const mappedModel = hasMappingConfigured
    ? provider.modelMapping![modelId]
    : modelId;

  try {
    const headerName = provider.authHeader || 'x-api-key';
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };

    if (headerName === 'Authorization') {
      headers['Authorization'] = provider.apiKey.startsWith('Bearer ')
        ? provider.apiKey
        : `Bearer ${provider.apiKey}`;
    } else {
      headers[headerName] = provider.apiKey;
    }

    if (provider.headers) {
      Object.assign(headers, provider.headers);

      // Remove unsafe headers that might cause issues with decompression
      const unsafe = ['accept-encoding', 'host', 'content-length'];
      Object.keys(headers).forEach((key) => {
        if (unsafe.includes(key.toLowerCase())) {
          delete headers[key];
        }
      });
    }

    let testBody: any = {
      model: mappedModel,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'Hi' }],
    };

    if (provider.format === 'openai') {
      testBody = convertAnthropicToOpenAI(testBody);
    }

    const response = await fetch(provider.baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(testBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return {
        model: modelId,
        label: modelLabel,
        success: true,
        message: `HTTP ${response.status}`,
        mappedTo: hasMappingConfigured ? mappedModel : undefined,
        hasMappingConfigured,
      };
    }

    const errorText = await response.text();
    let errorMessage = `HTTP ${response.status}`;
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage =
        errorJson.error?.message || errorJson.message || errorMessage;
    } catch {
      if (errorText.length < 200) {
        errorMessage = errorText || errorMessage;
      }
    }

    return {
      model: modelId,
      label: modelLabel,
      success: false,
      error: errorMessage,
      mappedTo: hasMappingConfigured ? mappedModel : undefined,
      hasMappingConfigured,
    };
  } catch (error: any) {
    clearTimeout(timeoutId);
    return {
      model: modelId,
      label: modelLabel,
      success: false,
      error:
        error.name === 'AbortError'
          ? 'Connection timed out (10s)'
          : error.message,
      mappedTo: hasMappingConfigured ? mappedModel : undefined,
      hasMappingConfigured,
    };
  }
}

/**
 * POST /admin/test-provider - Test connection to a provider
 * Tests multiple Claude models in parallel and returns per-model results.
 */
export async function testProvider(c: Context<{ Bindings: Bindings }>) {
  try {
    const provider = await c.req.json<ProviderConfig>();

    if (!provider.name || !provider.baseUrl || !provider.apiKey) {
      return c.json(
        { success: false, error: 'Missing name, baseUrl, or apiKey' },
        400,
      );
    }

    const results = await Promise.all(
      TEST_MODELS.map((m) => testSingleModel(provider, m.id, m.label, c.env)),
    );

    const allSuccess = results.every((r) => r.success);

    const failedWithoutMapping = results.filter(
      (r) => !r.success && !r.hasMappingConfigured,
    );

    let suggestion: string | undefined;
    if (failedWithoutMapping.length > 0) {
      const modelNames = failedWithoutMapping.map((r) => r.label).join(', ');
      suggestion = `Consider adding model mappings for: ${modelNames}. Your provider may use different model names.`;
    }

    return c.json({
      success: allSuccess,
      results,
      suggestion,
    });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 400);
  }
}

/**
 * GET /admin/anthropic-status - Get Anthropic primary disabled state
 */
export async function getAnthropicStatus(c: Context<{ Bindings: Bindings }>) {
  const disabled = await getRawAnthropicDisabled(c.env);
  return c.json({ disabled });
}

/**
 * POST /admin/anthropic-status - Set Anthropic primary disabled state
 */
export async function postAnthropicStatus(c: Context<{ Bindings: Bindings }>) {
  try {
    const body = await c.req.json<{ disabled: boolean }>();
    if (typeof body.disabled !== 'boolean') {
      return c.json({ error: 'disabled must be a boolean' }, 400);
    }
    await saveAnthropicDisabled(c.env, body.disabled);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
}

/**
 * GET /admin/rectifier - Get rectifier configuration
 */
export async function getRectifierConfig(c: Context<{ Bindings: Bindings }>) {
  const config = await getRawRectifierConfig(c.env);
  return c.json(config);
}

/**
 * POST /admin/rectifier - Update rectifier configuration
 */
export async function postRectifierConfig(c: Context<{ Bindings: Bindings }>) {
  try {
    const body = await c.req.json();

    const config: RectifierConfig = {
      enabled: body.enabled ?? true,
      requestThinkingSignature: body.requestThinkingSignature ?? true,
      requestThinkingBudget: body.requestThinkingBudget ?? true,
    };

    await saveRectifierConfig(c.env, config);

    return c.json({ success: true, config });
  } catch (error: any) {
    return c.json(
      {
        error: 'Failed to save rectifier config',
        message: error.message,
      },
      400,
    );
  }
}

/**
 * GET /admin/provider-states - Get circuit breaker state for all providers
 */
export async function getProviderStates(c: Context<{ Bindings: Bindings }>) {
  const config = await getRawConfig(c.env);
  let providers: { name: string }[] = [];
  try {
    providers = JSON.parse(config);
  } catch {
    providers = [];
  }

  const names = ['anthropic-primary', ...providers.map((p) => p.name)];

  const states: Record<string, ProviderState> = {};
  for (const name of names) {
    const key = `provider-state:${name}`;
    const raw = await c.env.CONFIG_KV.get(key);
    if (raw) {
      try {
        states[name] = JSON.parse(raw);
      } catch {
        states[name] = { consecutiveFailures: 0, lastFailure: null, lastSuccess: null, cooldownUntil: null };
      }
    } else {
      states[name] = { consecutiveFailures: 0, lastFailure: null, lastSuccess: null, cooldownUntil: null };
    }
  }

  return c.json(states);
}

/**
 * POST /admin/provider-states/:name/reset - Reset circuit breaker state for a provider
 */
export async function resetProviderState(c: Context<{ Bindings: Bindings }>) {
  const name = c.req.param('name');
  const key = `provider-state:${name}`;
  const defaultState: ProviderState = {
    consecutiveFailures: 0,
    lastFailure: null,
    lastSuccess: null,
    cooldownUntil: null,
  };
  await c.env.CONFIG_KV.put(key, JSON.stringify(defaultState));
  return c.json({ success: true });
}

/**
 * POST /admin/settings - Save global settings
 */
export async function postSettings(c: Context<{ Bindings: Bindings }>) {
  try {
    const body = await c.req.json<{ cooldownDuration: number }>();
    if (
      typeof body.cooldownDuration !== 'number' ||
      body.cooldownDuration < 0
    ) {
      return c.json({ error: 'Invalid cooldown duration' }, 400);
    }

    await saveCooldown(c.env, body.cooldownDuration);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
}

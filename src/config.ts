import { Bindings, AppConfig, ProviderConfig, TokenConfig } from './types';
import type { RectifierConfig } from './types/rectifier';

const KV_KEY = 'providers';
const TOKENS_KV_KEY = 'allowed_tokens';
const COOLDOWN_KV_KEY = 'cooldown_duration';
const ANTHROPIC_DISABLED_KV_KEY = 'anthropic_primary_disabled';
const RECTIFIER_KV_KEY = 'rectifier_config';

const defaultRectifierConfig: RectifierConfig = {
  enabled: true,
  requestThinkingSignature: true,
  requestThinkingBudget: true,
  requestToolUseConcurrency: true,
};

/**
 * Load configuration from KV storage.
 */
export async function loadConfig(env: Bindings): Promise<AppConfig> {
  const debug = env.DEBUG === 'true';
  let providers: ProviderConfig[] = [];
  let tokenConfigs: TokenConfig[] = [];
  let cooldownDuration = parseInt(env.COOLDOWN_DURATION || '300', 10);
  let anthropicDisabledJson: string | null = null;
  let rectifierConfig: RectifierConfig = { ...defaultRectifierConfig };

  try {
    const [configJson, tokensJson, cooldownJson, adJson, rectifierJson] = await Promise.all([
      env.CONFIG_KV.get(KV_KEY),
      env.CONFIG_KV.get(TOKENS_KV_KEY),
      env.CONFIG_KV.get(COOLDOWN_KV_KEY),
      env.CONFIG_KV.get(ANTHROPIC_DISABLED_KV_KEY),
      env.CONFIG_KV.get(RECTIFIER_KV_KEY),
    ]);

    if (configJson) {
      const parsed = JSON.parse(configJson);
      if (Array.isArray(parsed)) {
        // Validate providers
        for (const p of parsed) {
          if (!p.name || !p.baseUrl || !p.apiKey) {
            console.warn(
              `[Config] Skipping invalid provider: ${JSON.stringify(p)} - missing name, baseUrl, or apiKey`,
            );
            continue;
          }
          providers.push(p as ProviderConfig);
        }
      } else {
        console.error('[Config] Config in KV must be a JSON array');
      }
    }

    if (tokensJson) {
      const parsed = JSON.parse(tokensJson);
      if (Array.isArray(parsed)) {
        tokenConfigs = parseTokenConfigs(parsed);
      }
    }

    if (cooldownJson) {
      const parsed = parseInt(cooldownJson, 10);
      if (!isNaN(parsed)) {
        cooldownDuration = parsed;
      }
    }

    anthropicDisabledJson = adJson;

    if (rectifierJson) {
      try {
        const parsed = JSON.parse(rectifierJson);
        rectifierConfig = {
          enabled: parsed.enabled ?? defaultRectifierConfig.enabled,
          requestThinkingSignature:
            parsed.requestThinkingSignature ??
            defaultRectifierConfig.requestThinkingSignature,
          requestThinkingBudget:
            parsed.requestThinkingBudget ??
            defaultRectifierConfig.requestThinkingBudget,
          requestToolUseConcurrency:
            parsed.requestToolUseConcurrency ??
            defaultRectifierConfig.requestToolUseConcurrency,
        };
      } catch (e) {
        console.error('[Config] Failed to parse rectifier config:', e);
      }
    }
  } catch (e) {
    console.error('[Config] Failed to load config from KV:', e);
  }

  const allowedTokens = tokenConfigs.map((tc) => tc.token);
  const anthropicPrimaryDisabled = anthropicDisabledJson === 'true';

  if (debug) {
    console.log(
      `[Config] Loaded ${providers.length} providers. Allowed tokens: ${allowedTokens.length}. Cooldown: ${cooldownDuration}s. Debug: ${debug}`,
    );
  }

  return {
    debug,
    providers,
    allowedTokens,
    tokenConfigs,
    cooldownDuration,
    anthropicPrimaryDisabled,
    rectifier: rectifierConfig,
  };
}

/**
 * Save provider configuration to KV storage.
 */
export async function saveConfig(
  env: Bindings,
  providers: ProviderConfig[],
): Promise<void> {
  await env.CONFIG_KV.put(KV_KEY, JSON.stringify(providers));
}

/**
 * Parse token configs with backward compatibility.
 * Handles both old string[] format and new TokenConfig[] format.
 */
export function parseTokenConfigs(parsed: unknown[]): TokenConfig[] {
  return parsed
    .map((item) => {
      if (typeof item === 'string' && item.length > 0) {
        return { token: item };
      }
      if (
        item &&
        typeof item === 'object' &&
        'token' in item &&
        typeof (item as TokenConfig).token === 'string' &&
        (item as TokenConfig).token.length > 0
      ) {
        const tc = item as TokenConfig;
        return { token: tc.token, ...(tc.note ? { note: tc.note } : {}) };
      }
      return null;
    })
    .filter((t): t is TokenConfig => t !== null);
}

/**
 * Save allowed tokens to KV storage.
 */
export async function saveTokens(
  env: Bindings,
  tokens: TokenConfig[],
): Promise<void> {
  await env.CONFIG_KV.put(TOKENS_KV_KEY, JSON.stringify(tokens));
}

/**
 * Save cooldown duration to KV storage.
 */
export async function saveCooldown(
  env: Bindings,
  duration: number,
): Promise<void> {
  await env.CONFIG_KV.put(COOLDOWN_KV_KEY, duration.toString());
}

/**
 * Get raw config JSON from KV storage.
 */
export async function getRawConfig(env: Bindings): Promise<string> {
  return (await env.CONFIG_KV.get(KV_KEY)) || '[]';
}

/**
 * Get raw tokens JSON from KV storage.
 */
export async function getRawTokens(env: Bindings): Promise<string> {
  return (await env.CONFIG_KV.get(TOKENS_KV_KEY)) || '[]';
}

/**
 * Get raw cooldown value from KV storage (or default from env).
 */
export async function getRawCooldown(env: Bindings): Promise<number> {
  const val = await env.CONFIG_KV.get(COOLDOWN_KV_KEY);
  if (val) {
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed)) {
      return parsed;
    }
  }
  return parseInt(env.COOLDOWN_DURATION || '300', 10);
}

/**
 * Get Anthropic primary disabled state from KV storage.
 */
export async function getRawAnthropicDisabled(env: Bindings): Promise<boolean> {
  const val = await env.CONFIG_KV.get(ANTHROPIC_DISABLED_KV_KEY);
  return val === 'true';
}

/**
 * Save Anthropic primary disabled state to KV storage.
 */
export async function saveAnthropicDisabled(
  env: Bindings,
  disabled: boolean,
): Promise<void> {
  await env.CONFIG_KV.put(ANTHROPIC_DISABLED_KV_KEY, disabled.toString());
}

/**
 * Save rectifier configuration to KV storage.
 */
export async function saveRectifierConfig(
  env: Bindings,
  config: RectifierConfig,
): Promise<void> {
  await env.CONFIG_KV.put(RECTIFIER_KV_KEY, JSON.stringify(config));
}

/**
 * Get rectifier configuration from KV storage.
 */
export async function getRawRectifierConfig(
  env: Bindings,
): Promise<RectifierConfig> {
  const val = await env.CONFIG_KV.get(RECTIFIER_KV_KEY);
  if (val) {
    try {
      const parsed = JSON.parse(val);
      return {
        enabled: parsed.enabled ?? defaultRectifierConfig.enabled,
        requestThinkingSignature:
          parsed.requestThinkingSignature ??
          defaultRectifierConfig.requestThinkingSignature,
        requestThinkingBudget:
          parsed.requestThinkingBudget ??
          defaultRectifierConfig.requestThinkingBudget,
        requestToolUseConcurrency:
          parsed.requestToolUseConcurrency ??
          defaultRectifierConfig.requestToolUseConcurrency,
      };
    } catch (e) {
      console.error('[Config] Failed to parse rectifier config:', e);
    }
  }
  return { ...defaultRectifierConfig };
}

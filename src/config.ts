import { Bindings, AppConfig, ProviderConfig, TokenConfig } from './types';

const KV_KEY = 'providers';
const TOKENS_KV_KEY = 'allowed_tokens';
const COOLDOWN_KV_KEY = 'cooldown_duration';

/**
 * Load configuration from KV storage.
 */
export async function loadConfig(env: Bindings): Promise<AppConfig> {
  const debug = env.DEBUG === 'true';
  let providers: ProviderConfig[] = [];
  let tokenConfigs: TokenConfig[] = [];
  let cooldownDuration = parseInt(env.COOLDOWN_DURATION || '300', 10);

  try {
    const [configJson, tokensJson, cooldownJson] = await Promise.all([
      env.CONFIG_KV.get(KV_KEY),
      env.CONFIG_KV.get(TOKENS_KV_KEY),
      env.CONFIG_KV.get(COOLDOWN_KV_KEY),
    ]);

    if (configJson) {
      const parsed = JSON.parse(configJson);
      if (Array.isArray(parsed)) {
        // Validate providers
        for (const p of parsed) {
          if (!p.name || !p.baseUrl || !p.apiKey) {
            console.warn(
              `[Config] Skipping invalid provider: ${JSON.stringify(p)} - missing name, baseUrl, or apiKey`
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
  } catch (e) {
    console.error('[Config] Failed to load config from KV:', e);
  }

  const allowedTokens = tokenConfigs.map((tc) => tc.token);

  if (debug) {
    console.log(
      `[Config] Loaded ${providers.length} providers. Allowed tokens: ${allowedTokens.length}. Cooldown: ${cooldownDuration}s. Debug: ${debug}`
    );
  }

  return { debug, providers, allowedTokens, tokenConfigs, cooldownDuration };
}

/**
 * Save provider configuration to KV storage.
 */
export async function saveConfig(
  env: Bindings,
  providers: ProviderConfig[]
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
  tokens: TokenConfig[]
): Promise<void> {
  await env.CONFIG_KV.put(TOKENS_KV_KEY, JSON.stringify(tokens));
}

/**
 * Save cooldown duration to KV storage.
 */
export async function saveCooldown(
  env: Bindings,
  duration: number
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

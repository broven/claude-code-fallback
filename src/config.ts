import { Bindings, AppConfig, ProviderConfig } from './types';

const KV_KEY = 'providers';
const TOKENS_KV_KEY = 'allowed_tokens';

/**
 * Load configuration from KV storage.
 */
export async function loadConfig(env: Bindings): Promise<AppConfig> {
  const debug = env.DEBUG === 'true';
  let providers: ProviderConfig[] = [];
  let allowedTokens: string[] = [];

  try {
    const [configJson, tokensJson] = await Promise.all([
      env.CONFIG_KV.get(KV_KEY),
      env.CONFIG_KV.get(TOKENS_KV_KEY),
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
        allowedTokens = parsed.filter(
          (t: any) => typeof t === 'string' && t.length > 0
        );
      }
    }
  } catch (e) {
    console.error('[Config] Failed to load config from KV:', e);
  }

  if (debug) {
    console.log(
      `[Config] Loaded ${providers.length} providers. Allowed tokens: ${allowedTokens.length}. Debug: ${debug}`
    );
  }

  return { debug, providers, allowedTokens };
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
 * Save allowed tokens to KV storage.
 */
export async function saveTokens(
  env: Bindings,
  tokens: string[]
): Promise<void> {
  await env.CONFIG_KV.put(TOKENS_KV_KEY, JSON.stringify(tokens));
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

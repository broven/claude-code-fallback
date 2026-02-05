import { Bindings, AppConfig, ProviderConfig } from './types';

const KV_KEY = 'providers';

/**
 * Load configuration from KV storage.
 */
export async function loadConfig(env: Bindings): Promise<AppConfig> {
  const debug = env.DEBUG === 'true';
  let providers: ProviderConfig[] = [];

  try {
    const configJson = await env.CONFIG_KV.get(KV_KEY);
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
  } catch (e) {
    console.error('[Config] Failed to load config from KV:', e);
  }

  if (debug) {
    console.log(`[Config] Loaded ${providers.length} providers. Debug: ${debug}`);
  }

  return { debug, providers };
}

/**
 * Save provider configuration to KV storage.
 */
export async function saveConfig(env: Bindings, providers: ProviderConfig[]): Promise<void> {
  await env.CONFIG_KV.put(KV_KEY, JSON.stringify(providers));
}

/**
 * Get raw config JSON from KV storage.
 */
export async function getRawConfig(env: Bindings): Promise<string> {
  return (await env.CONFIG_KV.get(KV_KEY)) || '[]';
}

import { parse } from "yaml";
import { readFile, access } from "fs/promises";
import { constants } from "fs";
import * as path from "path";

export interface ProviderConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  authHeader?: string; // Default: 'x-api-key'
  headers?: Record<string, string>;
  modelMapping?: Record<string, string>;
}

export interface LoggingConfig {
  enabled: boolean;
  logResponseBody: boolean;
  dbPath: string;
  maxSavedMessages: number;
}

export interface AppConfig {
  debug: boolean;
  providers: ProviderConfig[];
  logging: LoggingConfig;
}

const DEFAULT_LOGGING_CONFIG: LoggingConfig = {
  enabled: true,
  logResponseBody: true,
  dbPath: "./logs.db",
  maxSavedMessages: 1000,
};

export async function loadConfig(): Promise<AppConfig> {
  try {
    const configPath = path.resolve(
      process.cwd(),
      process.env.PROVIDERS_CONFIG_PATH || "providers.yaml",
    );

    // Check if file exists
    try {
      await access(configPath, constants.F_OK);
    } catch {
      console.log(
        "[Config] providers.yaml not found, no fallback providers loaded.",
      );
      return { debug: false, providers: [], logging: DEFAULT_LOGGING_CONFIG };
    }

    const fileContent = await readFile(configPath, "utf-8");
    const parsed = parse(fileContent);

    let providers: ProviderConfig[] = [];
    let debug = false;
    let logging: LoggingConfig = { ...DEFAULT_LOGGING_CONFIG };

    if (Array.isArray(parsed)) {
      // Backward compatibility: Array of providers
      providers = parsed;
    } else if (typeof parsed === 'object' && parsed !== null) {
      // New format: Object with debug flag and providers list
      debug = !!parsed.debug;
      if (Array.isArray(parsed.providers)) {
        providers = parsed.providers;
      } else {
        console.error("[Config] providers.yaml 'providers' field must be an array");
      }

      // Parse logging config
      if (parsed.logging && typeof parsed.logging === 'object') {
        logging = {
          enabled: parsed.logging.enabled ?? DEFAULT_LOGGING_CONFIG.enabled,
          logResponseBody: parsed.logging.logResponseBody ?? DEFAULT_LOGGING_CONFIG.logResponseBody,
          dbPath: parsed.logging.dbPath ?? DEFAULT_LOGGING_CONFIG.dbPath,
          maxSavedMessages: parsed.logging.maxSavedMessages ?? DEFAULT_LOGGING_CONFIG.maxSavedMessages,
        };
      }
    } else {
      console.error("[Config] providers.yaml must be an array of providers or an object with providers array");
      return { debug: false, providers: [], logging: DEFAULT_LOGGING_CONFIG };
    }

    // Validate providers
    const validProviders: ProviderConfig[] = [];
    for (const p of providers) {
      if (!p.name || !p.baseUrl || !p.apiKey) {
        console.warn(
          `[Config] Skipping invalid provider config: ${JSON.stringify(p)} - missing name, baseUrl, or apiKey`,
        );
        continue;
      }
      validProviders.push(p as ProviderConfig);
    }

    console.log(
      `[Config] Loaded ${validProviders.length} providers from providers.yaml. Debug mode: ${debug}. Logging: ${logging.enabled}`,
    );
    return { debug, providers: validProviders, logging };
  } catch (error) {
    console.error("[Config] Error loading providers.yaml:", error);
    return { debug: false, providers: [], logging: DEFAULT_LOGGING_CONFIG };
  }
}

// Kept for backward compatibility if needed, but internally we switch to loadConfig
export async function loadProviders(): Promise<ProviderConfig[]> {
  const config = await loadConfig();
  return config.providers;
}

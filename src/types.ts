/**
 * Provider configuration for fallback routing
 */
export interface ProviderConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  authHeader?: string; // Default: 'x-api-key'
  headers?: Record<string, string>;
  modelMapping?: Record<string, string>;
  format?: "anthropic" | "openai";
  disabled?: boolean;
  retry?: number;
}

/**
 * Access token with optional note for observability
 */
export interface TokenConfig {
  token: string;
  note?: string;
}

import type { RectifierConfig } from "./types/rectifier";

/**
 * Application configuration
 */
export interface AppConfig {
  debug: boolean;
  providers: ProviderConfig[];
  allowedTokens: string[];
  tokenConfigs: TokenConfig[];
  cooldownDuration: number;
  anthropicPrimaryDisabled: boolean;
  rectifier: RectifierConfig;
}

/**
 * Cloudflare Workers environment bindings
 */
export interface Bindings {
  DEBUG: string;
  ADMIN_TOKEN: string;
  CONFIG_KV: KVNamespace;
  COOLDOWN_DURATION?: string; // Optional, default to 300s
}

/**
 * Provider circuit breaker state stored in KV
 */
export interface ProviderState {
  consecutiveFailures: number;
  lastFailure: number | null;
  lastSuccess: number | null;
  cooldownUntil: number | null;
}

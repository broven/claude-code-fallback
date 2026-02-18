export interface ProviderConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  authHeader?: string;
  headers?: Record<string, string>;
  modelMapping?: Record<string, string>;
  format?: 'anthropic' | 'openai';
  disabled?: boolean;
}

export interface TokenConfig {
  token: string;
  note?: string;
}

export interface ProviderState {
  consecutiveFailures: number;
  lastFailure: number | null;
  lastSuccess: number | null;
  cooldownUntil: number | null;
}

export interface RectifierConfig {
  enabled: boolean;
  requestThinkingSignature: boolean;
  requestThinkingBudget: boolean;
}

export interface ModelTestResult {
  model: string;
  label: string;
  success: boolean;
  message?: string;
  error?: string;
  mappedTo?: string;
  hasMappingConfigured: boolean;
}

export interface TestProviderResponse {
  success: boolean;
  results?: ModelTestResult[];
  suggestion?: string;
  error?: string;
}

export const CLAUDE_MODELS = [
  { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4' },
  { id: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude 3.5 Haiku' },
] as const;

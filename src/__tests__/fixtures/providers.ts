import { ProviderConfig } from '../../types';

/**
 * Test fixtures for provider configurations
 */

export const validProvider: ProviderConfig = {
  name: 'openrouter',
  baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
  apiKey: 'sk-test-key-123',
  authHeader: 'Authorization',
  modelMapping: {
    'claude-sonnet-4-5-20250929': 'anthropic/claude-sonnet-4',
  },
};

export const minimalProvider: ProviderConfig = {
  name: 'minimal-provider',
  baseUrl: 'https://api.example.com/v1/messages',
  apiKey: 'test-api-key',
};

export const providerWithCustomHeaders: ProviderConfig = {
  name: 'custom-headers-provider',
  baseUrl: 'https://api.example.com/v1/messages',
  apiKey: 'test-api-key',
  authHeader: 'x-api-key',
  headers: {
    'X-Custom-Header': 'custom-value',
    'X-Another-Header': 'another-value',
  },
};

export const providerWithBearerToken: ProviderConfig = {
  name: 'bearer-provider',
  baseUrl: 'https://api.example.com/v1/messages',
  apiKey: 'Bearer sk-already-prefixed',
  authHeader: 'Authorization',
};

export const invalidProviderMissingName = {
  baseUrl: 'https://api.example.com/v1/messages',
  apiKey: 'test-api-key',
};

export const invalidProviderMissingUrl = {
  name: 'no-url-provider',
  apiKey: 'test-api-key',
};

export const invalidProviderMissingApiKey = {
  name: 'no-apikey-provider',
  baseUrl: 'https://api.example.com/v1/messages',
};

export const openaiFormatProvider: ProviderConfig = {
  name: 'openrouter-openai',
  baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
  apiKey: 'sk-or-test-key',
  authHeader: 'Authorization',
  format: 'openai',
  modelMapping: {
    'claude-sonnet-4-5-20250929': 'anthropic/claude-sonnet-4',
  },
};

export const multipleProviders: ProviderConfig[] = [
  validProvider,
  minimalProvider,
  providerWithCustomHeaders,
];

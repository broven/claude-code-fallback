import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadConfig, saveConfig, getRawConfig } from '../config';
import { createMockBindings } from './mocks/kv';
import {
  validProvider,
  minimalProvider,
  multipleProviders,
  invalidProviderMissingName,
  invalidProviderMissingUrl,
  invalidProviderMissingApiKey,
} from './fixtures/providers';

describe('loadConfig', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('debug flag', () => {
    it('sets debug to true when env.DEBUG is "true"', async () => {
      const env = createMockBindings({ debug: true });

      const config = await loadConfig(env);

      expect(config.debug).toBe(true);
    });

    it('sets debug to false when env.DEBUG is "false"', async () => {
      const env = createMockBindings({ debug: false });

      const config = await loadConfig(env);

      expect(config.debug).toBe(false);
    });

    it('sets debug to false when env.DEBUG is undefined', async () => {
      const env = createMockBindings();
      env.DEBUG = '';

      const config = await loadConfig(env);

      expect(config.debug).toBe(false);
    });

    it('sets debug to false when env.DEBUG is any other value', async () => {
      const env = createMockBindings();
      env.DEBUG = 'yes';

      const config = await loadConfig(env);

      expect(config.debug).toBe(false);
    });

    it('logs provider count when debug is true', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const env = createMockBindings({
        debug: true,
        kvData: { providers: JSON.stringify([validProvider]) },
      });

      await loadConfig(env);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Loaded 1 providers')
      );
    });
  });

  describe('provider loading', () => {
    it('returns empty providers array when KV is empty', async () => {
      const env = createMockBindings();

      const config = await loadConfig(env);

      expect(config.providers).toEqual([]);
    });

    it('returns empty providers array when KV returns null', async () => {
      const env = createMockBindings();

      const config = await loadConfig(env);

      expect(config.providers).toEqual([]);
    });

    it('loads single valid provider from KV', async () => {
      const env = createMockBindings({
        kvData: { providers: JSON.stringify([validProvider]) },
      });

      const config = await loadConfig(env);

      expect(config.providers).toHaveLength(1);
      expect(config.providers[0]).toMatchObject({
        name: validProvider.name,
        baseUrl: validProvider.baseUrl,
        apiKey: validProvider.apiKey,
      });
    });

    it('loads multiple valid providers from KV', async () => {
      const env = createMockBindings({
        kvData: { providers: JSON.stringify(multipleProviders) },
      });

      const config = await loadConfig(env);

      expect(config.providers).toHaveLength(3);
    });

    it('preserves all provider properties', async () => {
      const env = createMockBindings({
        kvData: { providers: JSON.stringify([validProvider]) },
      });

      const config = await loadConfig(env);

      expect(config.providers[0]).toEqual(validProvider);
    });
  });

  describe('provider validation', () => {
    it('skips provider missing name', async () => {
      const providers = [validProvider, invalidProviderMissingName];
      const env = createMockBindings({
        kvData: { providers: JSON.stringify(providers) },
      });

      const config = await loadConfig(env);

      expect(config.providers).toHaveLength(1);
      expect(config.providers[0].name).toBe(validProvider.name);
    });

    it('skips provider missing baseUrl', async () => {
      const providers = [validProvider, invalidProviderMissingUrl];
      const env = createMockBindings({
        kvData: { providers: JSON.stringify(providers) },
      });

      const config = await loadConfig(env);

      expect(config.providers).toHaveLength(1);
    });

    it('skips provider missing apiKey', async () => {
      const providers = [validProvider, invalidProviderMissingApiKey];
      const env = createMockBindings({
        kvData: { providers: JSON.stringify(providers) },
      });

      const config = await loadConfig(env);

      expect(config.providers).toHaveLength(1);
    });

    it('logs warning for invalid providers', async () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      const providers = [invalidProviderMissingName];
      const env = createMockBindings({
        kvData: { providers: JSON.stringify(providers) },
      });

      await loadConfig(env);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Skipping invalid provider')
      );
    });

    it('loads valid providers while skipping invalid ones', async () => {
      const providers = [
        validProvider,
        invalidProviderMissingName,
        minimalProvider,
        invalidProviderMissingApiKey,
      ];
      const env = createMockBindings({
        kvData: { providers: JSON.stringify(providers) },
      });

      const config = await loadConfig(env);

      expect(config.providers).toHaveLength(2);
      expect(config.providers[0].name).toBe(validProvider.name);
      expect(config.providers[1].name).toBe(minimalProvider.name);
    });
  });

  describe('error handling', () => {
    it('returns empty providers on JSON parse error', async () => {
      const env = createMockBindings({
        kvData: { providers: 'invalid json{' },
      });

      const config = await loadConfig(env);

      expect(config.providers).toEqual([]);
    });

    it('logs error on JSON parse failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error');
      const env = createMockBindings({
        kvData: { providers: 'not json' },
      });

      await loadConfig(env);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load config from KV'),
        expect.any(Error)
      );
    });

    it('returns empty providers when config is not an array', async () => {
      const consoleSpy = vi.spyOn(console, 'error');
      const env = createMockBindings({
        kvData: { providers: JSON.stringify({ notAnArray: true }) },
      });

      const config = await loadConfig(env);

      expect(config.providers).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Config in KV must be a JSON array')
      );
    });

    it('returns empty providers when config is a string', async () => {
      const env = createMockBindings({
        kvData: { providers: JSON.stringify('just a string') },
      });

      const config = await loadConfig(env);

      expect(config.providers).toEqual([]);
    });

    it('returns empty providers when config is null', async () => {
      const env = createMockBindings({
        kvData: { providers: JSON.stringify(null) },
      });

      const config = await loadConfig(env);

      expect(config.providers).toEqual([]);
    });

    it('handles KV read errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error');
      const env = createMockBindings();
      env.CONFIG_KV.get = vi.fn().mockRejectedValue(new Error('KV error'));

      const config = await loadConfig(env);

      expect(config.providers).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load config from KV'),
        expect.any(Error)
      );
    });
  });
});

describe('saveConfig', () => {
  it('saves providers to KV as JSON string', async () => {
    const env = createMockBindings();
    const putSpy = vi.spyOn(env.CONFIG_KV, 'put');

    await saveConfig(env, multipleProviders);

    expect(putSpy).toHaveBeenCalledWith(
      'providers',
      JSON.stringify(multipleProviders)
    );
  });

  it('saves empty array when no providers', async () => {
    const env = createMockBindings();
    const putSpy = vi.spyOn(env.CONFIG_KV, 'put');

    await saveConfig(env, []);

    expect(putSpy).toHaveBeenCalledWith('providers', '[]');
  });

  it('overwrites existing config', async () => {
    const env = createMockBindings({
      kvData: { providers: JSON.stringify([validProvider]) },
    });

    await saveConfig(env, [minimalProvider]);

    const rawConfig = await getRawConfig(env);
    const config = JSON.parse(rawConfig);
    expect(config).toHaveLength(1);
    expect(config[0].name).toBe(minimalProvider.name);
  });

  it('throws error when KV put fails', async () => {
    const env = createMockBindings();
    env.CONFIG_KV.put = vi.fn().mockRejectedValue(new Error('KV write error'));

    await expect(saveConfig(env, [validProvider])).rejects.toThrow('KV write error');
  });
});

describe('getRawConfig', () => {
  it('returns raw JSON string from KV', async () => {
    const expected = JSON.stringify([validProvider]);
    const env = createMockBindings({
      kvData: { providers: expected },
    });

    const result = await getRawConfig(env);

    expect(result).toBe(expected);
  });

  it('returns empty array string when KV is empty', async () => {
    const env = createMockBindings();

    const result = await getRawConfig(env);

    expect(result).toBe('[]');
  });

  it('returns empty array string when KV returns null', async () => {
    const env = createMockBindings();
    env.CONFIG_KV.get = vi.fn().mockResolvedValue(null);

    const result = await getRawConfig(env);

    expect(result).toBe('[]');
  });

  it('returns the exact string stored in KV', async () => {
    const customJson = '[ { "name": "test" } ]';
    const env = createMockBindings({
      kvData: { providers: customJson },
    });

    const result = await getRawConfig(env);

    expect(result).toBe(customJson);
  });
});

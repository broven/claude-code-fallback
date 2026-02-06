import { describe, it, expect } from 'vitest';
import { createMockBindings } from './mocks/kv';
import {
  isProviderAvailable,
  markProviderFailed,
  markProviderSuccess
} from '../utils/circuit-breaker';

describe('Circuit Breaker (KV)', () => {
  it('is available when no key exists', async () => {
    const env = createMockBindings();
    const result = await isProviderAvailable('test-provider', env);
    expect(result).toBe(true);
  });

  it('is NOT available when key exists', async () => {
    const env = createMockBindings({
      kvData: { 'circuit:test-provider': 'failed' }
    });
    const result = await isProviderAvailable('test-provider', env);
    expect(result).toBe(false);
  });

  it('markProviderFailed puts key in KV', async () => {
    const env = createMockBindings();
    await markProviderFailed('test-provider', 300, env);

    // Check internal store of the mock
    const key = 'circuit:test-provider';
    const val = await env.CONFIG_KV.get(key);
    expect(val).toBe('failed');
  });

  it('markProviderSuccess deletes key from KV', async () => {
    const env = createMockBindings({
      kvData: { 'circuit:test-provider': 'failed' }
    });

    await markProviderSuccess('test-provider', env);

    const val = await env.CONFIG_KV.get('circuit:test-provider');
    expect(val).toBeNull();
  });
});

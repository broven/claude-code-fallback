import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockBindings } from './mocks/kv';
import {
  calculateCooldown,
  getProviderState,
  isProviderAvailable,
  markProviderFailed,
  markProviderSuccess,
  getLeastRecentlyFailedProvider,
} from '../utils/circuit-breaker';
import { ProviderState } from '../types';

describe('Circuit Breaker - Sliding Window + Exponential Backoff', () => {
  describe('calculateCooldown', () => {
    it('returns 0 for 0 failures', () => {
      expect(calculateCooldown(0, 300)).toBe(0);
    });

    it('returns 0 for 1 failure', () => {
      expect(calculateCooldown(1, 300)).toBe(0);
    });

    it('returns 0 for 2 failures', () => {
      expect(calculateCooldown(2, 300)).toBe(0);
    });

    it('returns 30 for 3 failures', () => {
      expect(calculateCooldown(3, 300)).toBe(30);
    });

    it('returns 30 for 4 failures', () => {
      expect(calculateCooldown(4, 300)).toBe(30);
    });

    it('returns 60 for 5 failures', () => {
      expect(calculateCooldown(5, 300)).toBe(60);
    });

    it('returns 60 for 9 failures', () => {
      expect(calculateCooldown(9, 300)).toBe(60);
    });

    it('returns 300 for 10 failures', () => {
      expect(calculateCooldown(10, 300)).toBe(300);
    });

    it('returns 300 for 100 failures', () => {
      expect(calculateCooldown(100, 300)).toBe(300);
    });

    it('caps at maxCooldownSeconds when max is lower than tier', () => {
      expect(calculateCooldown(3, 10)).toBe(10);
      expect(calculateCooldown(5, 20)).toBe(20);
      expect(calculateCooldown(10, 100)).toBe(100);
    });

    it('returns 0 when maxCooldownSeconds is 0', () => {
      expect(calculateCooldown(3, 0)).toBe(0);
      expect(calculateCooldown(10, 0)).toBe(0);
    });
  });

  describe('getProviderState', () => {
    it('returns default state when no KV entry exists', async () => {
      const env = createMockBindings();
      const state = await getProviderState('test-provider', env);
      expect(state).toEqual({
        consecutiveFailures: 0,
        lastFailure: null,
        lastSuccess: null,
        cooldownUntil: null,
      });
    });

    it('returns parsed state from KV', async () => {
      const stored: ProviderState = {
        consecutiveFailures: 5,
        lastFailure: 1000,
        lastSuccess: 900,
        cooldownUntil: 2000,
      };
      const env = createMockBindings({
        kvData: { 'provider-state:test-provider': JSON.stringify(stored) },
      });
      const state = await getProviderState('test-provider', env);
      expect(state).toEqual(stored);
    });

    it('returns default state when KV contains invalid JSON', async () => {
      const env = createMockBindings({
        kvData: { 'provider-state:test-provider': 'not-json' },
      });
      const state = await getProviderState('test-provider', env);
      expect(state).toEqual({
        consecutiveFailures: 0,
        lastFailure: null,
        lastSuccess: null,
        cooldownUntil: null,
      });
    });
  });

  describe('isProviderAvailable', () => {
    it('returns true when no state in KV (fresh provider)', async () => {
      const env = createMockBindings();
      expect(await isProviderAvailable('test-provider', env)).toBe(true);
    });

    it('returns true when consecutiveFailures < 3 (no cooldown set)', async () => {
      const state: ProviderState = {
        consecutiveFailures: 2,
        lastFailure: Date.now(),
        lastSuccess: null,
        cooldownUntil: null,
      };
      const env = createMockBindings({
        kvData: { 'provider-state:test-provider': JSON.stringify(state) },
      });
      expect(await isProviderAvailable('test-provider', env)).toBe(true);
    });

    it('returns true when cooldownUntil is null', async () => {
      const state: ProviderState = {
        consecutiveFailures: 1,
        lastFailure: Date.now(),
        lastSuccess: null,
        cooldownUntil: null,
      };
      const env = createMockBindings({
        kvData: { 'provider-state:test-provider': JSON.stringify(state) },
      });
      expect(await isProviderAvailable('test-provider', env)).toBe(true);
    });

    it('returns true when cooldownUntil is in the past', async () => {
      const state: ProviderState = {
        consecutiveFailures: 5,
        lastFailure: Date.now() - 120000,
        lastSuccess: null,
        cooldownUntil: Date.now() - 60000,
      };
      const env = createMockBindings({
        kvData: { 'provider-state:test-provider': JSON.stringify(state) },
      });
      expect(await isProviderAvailable('test-provider', env)).toBe(true);
    });

    it('returns false when cooldownUntil is in the future', async () => {
      const state: ProviderState = {
        consecutiveFailures: 5,
        lastFailure: Date.now(),
        lastSuccess: null,
        cooldownUntil: Date.now() + 60000,
      };
      const env = createMockBindings({
        kvData: { 'provider-state:test-provider': JSON.stringify(state) },
      });
      expect(await isProviderAvailable('test-provider', env)).toBe(false);
    });

    it('returns true when DEBUG is true (bypass)', async () => {
      const state: ProviderState = {
        consecutiveFailures: 10,
        lastFailure: Date.now(),
        lastSuccess: null,
        cooldownUntil: Date.now() + 300000,
      };
      const env = createMockBindings({
        debug: true,
        kvData: { 'provider-state:test-provider': JSON.stringify(state) },
      });
      expect(await isProviderAvailable('test-provider', env)).toBe(true);
    });
  });

  describe('markProviderFailed', () => {
    it('increments consecutiveFailures from 0 to 1', async () => {
      const env = createMockBindings();
      await markProviderFailed('test-provider', 300, env);

      const state = await getProviderState('test-provider', env);
      expect(state.consecutiveFailures).toBe(1);
    });

    it('increments consecutiveFailures from 2 to 3', async () => {
      const existing: ProviderState = {
        consecutiveFailures: 2,
        lastFailure: Date.now() - 1000,
        lastSuccess: null,
        cooldownUntil: null,
      };
      const env = createMockBindings({
        kvData: { 'provider-state:test-provider': JSON.stringify(existing) },
      });

      await markProviderFailed('test-provider', 300, env);

      const state = await getProviderState('test-provider', env);
      expect(state.consecutiveFailures).toBe(3);
    });

    it('does NOT set cooldownUntil for failures < 3', async () => {
      const env = createMockBindings();
      await markProviderFailed('test-provider', 300, env);
      let state = await getProviderState('test-provider', env);
      expect(state.cooldownUntil).toBeNull();

      await markProviderFailed('test-provider', 300, env);
      state = await getProviderState('test-provider', env);
      expect(state.cooldownUntil).toBeNull();
    });

    it('DOES set cooldownUntil for failures >= 3', async () => {
      const existing: ProviderState = {
        consecutiveFailures: 2,
        lastFailure: Date.now() - 1000,
        lastSuccess: null,
        cooldownUntil: null,
      };
      const env = createMockBindings({
        kvData: { 'provider-state:test-provider': JSON.stringify(existing) },
      });

      await markProviderFailed('test-provider', 300, env);

      const state = await getProviderState('test-provider', env);
      expect(state.cooldownUntil).not.toBeNull();
      expect(state.cooldownUntil!).toBeGreaterThan(Date.now());
    });

    it('preserves lastSuccess timestamp', async () => {
      const existing: ProviderState = {
        consecutiveFailures: 0,
        lastFailure: null,
        lastSuccess: 12345,
        cooldownUntil: null,
      };
      const env = createMockBindings({
        kvData: { 'provider-state:test-provider': JSON.stringify(existing) },
      });

      await markProviderFailed('test-provider', 300, env);

      const state = await getProviderState('test-provider', env);
      expect(state.lastSuccess).toBe(12345);
    });

    it('sets lastFailure to current time', async () => {
      const env = createMockBindings();
      const before = Date.now();
      await markProviderFailed('test-provider', 300, env);
      const after = Date.now();

      const state = await getProviderState('test-provider', env);
      expect(state.lastFailure).toBeGreaterThanOrEqual(before);
      expect(state.lastFailure).toBeLessThanOrEqual(after);
    });

    it('applies correct exponential backoff tiers', async () => {
      const env = createMockBindings();

      // Build up to 3 failures
      for (let i = 0; i < 3; i++) {
        await markProviderFailed('test-provider', 300, env);
      }
      let state = await getProviderState('test-provider', env);
      const cooldown3 = state.cooldownUntil! - state.lastFailure!;
      expect(cooldown3).toBe(30 * 1000);

      // Build up to 5 failures
      for (let i = 0; i < 2; i++) {
        await markProviderFailed('test-provider', 300, env);
      }
      state = await getProviderState('test-provider', env);
      const cooldown5 = state.cooldownUntil! - state.lastFailure!;
      expect(cooldown5).toBe(60 * 1000);

      // Build up to 10 failures
      for (let i = 0; i < 5; i++) {
        await markProviderFailed('test-provider', 300, env);
      }
      state = await getProviderState('test-provider', env);
      const cooldown10 = state.cooldownUntil! - state.lastFailure!;
      expect(cooldown10).toBe(300 * 1000);
    });

    it('caps cooldown at maxCooldownSeconds', async () => {
      const existing: ProviderState = {
        consecutiveFailures: 9,
        lastFailure: Date.now() - 1000,
        lastSuccess: null,
        cooldownUntil: null,
      };
      const env = createMockBindings({
        kvData: { 'provider-state:test-provider': JSON.stringify(existing) },
      });

      await markProviderFailed('test-provider', 100, env);

      const state = await getProviderState('test-provider', env);
      const cooldownMs = state.cooldownUntil! - state.lastFailure!;
      expect(cooldownMs).toBe(100 * 1000);
    });
  });

  describe('markProviderSuccess', () => {
    it('resets consecutiveFailures to 0', async () => {
      const existing: ProviderState = {
        consecutiveFailures: 5,
        lastFailure: Date.now(),
        lastSuccess: null,
        cooldownUntil: Date.now() + 60000,
      };
      const env = createMockBindings({
        kvData: { 'provider-state:test-provider': JSON.stringify(existing) },
      });

      await markProviderSuccess('test-provider', env);

      const state = await getProviderState('test-provider', env);
      expect(state.consecutiveFailures).toBe(0);
    });

    it('clears cooldownUntil', async () => {
      const existing: ProviderState = {
        consecutiveFailures: 5,
        lastFailure: Date.now(),
        lastSuccess: null,
        cooldownUntil: Date.now() + 60000,
      };
      const env = createMockBindings({
        kvData: { 'provider-state:test-provider': JSON.stringify(existing) },
      });

      await markProviderSuccess('test-provider', env);

      const state = await getProviderState('test-provider', env);
      expect(state.cooldownUntil).toBeNull();
    });

    it('sets lastSuccess to current time', async () => {
      const env = createMockBindings();
      const before = Date.now();
      await markProviderSuccess('test-provider', env);
      const after = Date.now();

      const state = await getProviderState('test-provider', env);
      expect(state.lastSuccess).toBeGreaterThanOrEqual(before);
      expect(state.lastSuccess).toBeLessThanOrEqual(after);
    });

    it('clears lastFailure', async () => {
      const existing: ProviderState = {
        consecutiveFailures: 3,
        lastFailure: Date.now(),
        lastSuccess: null,
        cooldownUntil: Date.now() + 30000,
      };
      const env = createMockBindings({
        kvData: { 'provider-state:test-provider': JSON.stringify(existing) },
      });

      await markProviderSuccess('test-provider', env);

      const state = await getProviderState('test-provider', env);
      expect(state.lastFailure).toBeNull();
    });
  });

  describe('getLeastRecentlyFailedProvider', () => {
    it('returns null for empty array', async () => {
      const env = createMockBindings();
      expect(await getLeastRecentlyFailedProvider([], env)).toBeNull();
    });

    it('returns the single provider for array of one', async () => {
      const env = createMockBindings();
      expect(await getLeastRecentlyFailedProvider(['only-one'], env)).toBe('only-one');
    });

    it('returns provider with earliest cooldownUntil', async () => {
      const now = Date.now();
      const stateA: ProviderState = {
        consecutiveFailures: 5,
        lastFailure: now,
        lastSuccess: null,
        cooldownUntil: now + 60000,
      };
      const stateB: ProviderState = {
        consecutiveFailures: 3,
        lastFailure: now,
        lastSuccess: null,
        cooldownUntil: now + 30000,
      };
      const env = createMockBindings({
        kvData: {
          'provider-state:providerA': JSON.stringify(stateA),
          'provider-state:providerB': JSON.stringify(stateB),
        },
      });

      const result = await getLeastRecentlyFailedProvider(['providerA', 'providerB'], env);
      expect(result).toBe('providerB');
    });

    it('returns provider with null cooldownUntil (never had cooldown)', async () => {
      const now = Date.now();
      const stateA: ProviderState = {
        consecutiveFailures: 5,
        lastFailure: now,
        lastSuccess: null,
        cooldownUntil: now + 60000,
      };
      const stateB: ProviderState = {
        consecutiveFailures: 1,
        lastFailure: now,
        lastSuccess: null,
        cooldownUntil: null,
      };
      const env = createMockBindings({
        kvData: {
          'provider-state:providerA': JSON.stringify(stateA),
          'provider-state:providerB': JSON.stringify(stateB),
        },
      });

      const result = await getLeastRecentlyFailedProvider(['providerA', 'providerB'], env);
      expect(result).toBe('providerB');
    });

    it('handles mix of null and non-null cooldownUntil values', async () => {
      const now = Date.now();
      const stateA: ProviderState = {
        consecutiveFailures: 3,
        lastFailure: now,
        lastSuccess: null,
        cooldownUntil: now + 30000,
      };
      // providerB has no state (fresh) -> default state -> cooldownUntil: null -> treated as 0
      const env = createMockBindings({
        kvData: {
          'provider-state:providerA': JSON.stringify(stateA),
        },
      });

      const result = await getLeastRecentlyFailedProvider(['providerA', 'providerB'], env);
      expect(result).toBe('providerB');
    });
  });
});

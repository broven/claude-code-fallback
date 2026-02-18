import { Bindings, ProviderState } from "../types";

/**
 * Sliding window circuit breaker with exponential backoff.
 *
 * Previous implementation used KV keys "circuit:{name}" with TTL.
 * This implementation uses "provider-state:{name}" with JSON values.
 * Old keys will auto-expire via TTL and can be safely ignored.
 */

const STATE_KEY_PREFIX = "provider-state:";

function getStateKey(name: string): string {
  return `${STATE_KEY_PREFIX}${name}`;
}

function getDefaultState(): ProviderState {
  return {
    consecutiveFailures: 0,
    lastFailure: null,
    lastSuccess: null,
    cooldownUntil: null,
  };
}

/**
 * Calculate cooldown duration based on consecutive failures.
 * Returns 0 for < 3 failures (no cooldown).
 */
export function calculateCooldown(
  consecutiveFailures: number,
  maxCooldownSeconds: number,
): number {
  if (consecutiveFailures < 3) return 0;
  if (consecutiveFailures < 5) return Math.min(30, maxCooldownSeconds);
  if (consecutiveFailures < 10) return Math.min(60, maxCooldownSeconds);
  return Math.min(300, maxCooldownSeconds);
}

/**
 * Read provider state from KV. Returns default state if not found or invalid.
 */
export async function getProviderState(
  name: string,
  env: Bindings,
): Promise<ProviderState> {
  const key = getStateKey(name);
  const raw = await env.CONFIG_KV.get(key);
  if (raw === null) return getDefaultState();
  try {
    return JSON.parse(raw) as ProviderState;
  } catch {
    return getDefaultState();
  }
}

/**
 * Check if a provider is currently available (not in cooldown).
 */
export async function isProviderAvailable(
  name: string,
  env: Bindings,
): Promise<boolean> {
  if (env.DEBUG === "true") return true;
  const state = await getProviderState(name, env);
  if (state.cooldownUntil === null) return true;
  return Date.now() >= state.cooldownUntil;
}

/**
 * Record a failure. Increments consecutiveFailures.
 * Only sets cooldownUntil when threshold (>= 3) is reached.
 */
export async function markProviderFailed(
  name: string,
  maxCooldownSeconds: number,
  env: Bindings,
): Promise<void> {
  const state = await getProviderState(name, env);
  const now = Date.now();

  const newFailures = state.consecutiveFailures + 1;
  const cooldownSec = calculateCooldown(newFailures, maxCooldownSeconds);

  const newState: ProviderState = {
    consecutiveFailures: newFailures,
    lastFailure: now,
    lastSuccess: state.lastSuccess,
    cooldownUntil: cooldownSec > 0 ? now + cooldownSec * 1000 : null,
  };

  const key = getStateKey(name);
  await env.CONFIG_KV.put(key, JSON.stringify(newState));
}

/**
 * Record a success. Resets consecutiveFailures and clears cooldown.
 */
export async function markProviderSuccess(
  name: string,
  env: Bindings,
): Promise<void> {
  const now = Date.now();
  const newState: ProviderState = {
    consecutiveFailures: 0,
    lastFailure: null,
    lastSuccess: now,
    cooldownUntil: null,
  };

  const key = getStateKey(name);
  await env.CONFIG_KV.put(key, JSON.stringify(newState));
}

/**
 * Safety valve: find the provider whose cooldown expires earliest.
 * Used when all providers are in cooldown to avoid returning 502.
 */
export async function getLeastRecentlyFailedProvider(
  providerNames: string[],
  env: Bindings,
): Promise<string | null> {
  if (providerNames.length === 0) return null;

  let bestName: string | null = null;
  let earliestCooldownUntil = Infinity;

  for (const name of providerNames) {
    const state = await getProviderState(name, env);
    const cooldownUntil = state.cooldownUntil ?? 0;

    if (cooldownUntil < earliestCooldownUntil) {
      earliestCooldownUntil = cooldownUntil;
      bestName = name;
    }
  }

  return bestName;
}

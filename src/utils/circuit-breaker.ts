import { Bindings } from "../types";

/**
 * Get the KV key for a provider's circuit breaker state.
 */
function getCircuitBreakerKey(name: string): string {
  return `circuit:${name}`;
}

/**
 * Check if a provider is currently available (not in cooldown).
 * @param name Provider name
 * @param env Worker bindings
 * @returns true if available, false if in cooldown
 */
export async function isProviderAvailable(
  name: string,
  env: Bindings,
): Promise<boolean> {
  if (env.DEBUG === 'true') return true;
  const key = getCircuitBreakerKey(name);
  const val = await env.CONFIG_KV.get(key);
  return val === null;
}

/**
 * Mark a provider as failed and set a cooldown.
 * @param name Provider name
 * @param durationSeconds Cooldown duration in seconds
 * @param env Worker bindings
 */
export async function markProviderFailed(
  name: string,
  durationSeconds: number,
  env: Bindings,
): Promise<void> {
  const key = getCircuitBreakerKey(name);
  // Value doesn't matter, existence is what checks the cooldown
  await env.CONFIG_KV.put(key, "failed", { expirationTtl: durationSeconds });
}

/**
 * Mark a provider as successful (clear cooldown).
 * @param name Provider name
 * @param env Worker bindings
 */
export async function markProviderSuccess(
  name: string,
  env: Bindings,
): Promise<void> {
  const key = getCircuitBreakerKey(name);
  await env.CONFIG_KV.delete(key);
}

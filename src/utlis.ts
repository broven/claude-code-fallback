export function filterHeaders(
  headers: Record<string, string>,
  keys: string[],
): Record<string, string> {
  const excluded = new Set(keys.map((k) => k.toLowerCase()));
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => !excluded.has(key.toLowerCase())),
  );
}
export function filterHeadersDebugOption(
  header: Record<string, string>,
): Record<string, string> {
  return filterHeaders(header, ['x-ccfallback-debug-skip-anthropic']);
}

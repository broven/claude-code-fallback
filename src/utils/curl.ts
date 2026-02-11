/**
 * Build a copy-paste ready curl command from request components.
 * Used for debug logging when all providers fail.
 */

const EXCLUDED_HEADERS = new Set([
  'host',
  'connection',
  'keep-alive',
  'content-length',
  'transfer-encoding',
  'te',
  'trailer',
  'upgrade',
  'cf-connecting-ip',
  'cf-ipcountry',
  'cf-ray',
  'cf-visitor',
  'cf-warp-tag-id',
  'cf-ew-via',
  'cdn-loop',
]);

function escapeShellSingleQuote(str: string): string {
  // Replace ' with '\'' (end quote, escaped quote, start quote)
  return str.replace(/'/g, "'\\''");
}

export function buildCurlCommand(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): string {
  const parts: string[] = [`curl -X POST '${escapeShellSingleQuote(url)}'`];

  for (const [key, value] of Object.entries(headers)) {
    if (EXCLUDED_HEADERS.has(key.toLowerCase())) continue;
    parts.push(`-H '${escapeShellSingleQuote(key)}: ${escapeShellSingleQuote(value)}'`);
  }

  parts.push(`-d '${escapeShellSingleQuote(JSON.stringify(body))}'`);

  return parts.join(' ');
}

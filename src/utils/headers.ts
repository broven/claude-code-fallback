/**
 * Filter out specific headers by key names (case-insensitive).
 */
export function filterHeaders(
  headers: Record<string, string>,
  keys: string[],
): Record<string, string> {
  const excluded = new Set(keys.map((k) => k.toLowerCase()));
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => !excluded.has(key.toLowerCase())),
  );
}

/**
 * Filter out debug headers and other unsafe request headers before forwarding.
 */
export function cleanRequestHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  return filterHeaders(headers, [
    "x-ccf-debug-skip-anthropic",
    "x-ccfallback-debug-skip-anthropic",
    "x-ccf-api-key",
    "host",
    "accept-encoding",
    "content-length",
    "connection",
    "keep-alive",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
  ]);
}

/**
 * Filter out debug headers before forwarding to upstream.
 * @deprecated Use cleanRequestHeaders instead
 */
export function filterHeadersDebugOption(
  headers: Record<string, string>,
): Record<string, string> {
  return filterHeaders(headers, [
    "x-ccf-debug-skip-anthropic",
    "x-ccfallback-debug-skip-anthropic",
    "x-ccf-api-key",
  ]);
}

/**
 * Clean hop-by-hop headers for response forwarding.
 * Removes headers that should not be forwarded to the client.
 */
export function cleanHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  const unsafeHeaders = [
    "content-length",
    "content-encoding",
    "transfer-encoding",
    "connection",
    "keep-alive",
    "te",
    "trailer",
    "upgrade",
    "host",
  ];

  headers.forEach((value, key) => {
    if (!unsafeHeaders.includes(key.toLowerCase())) {
      result[key] = value;
    }
  });

  return result;
}

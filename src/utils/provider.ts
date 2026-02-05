import { ProviderConfig } from '../types';

/**
 * Attempt a request to a specific fallback provider.
 * Handles model mapping, header filtering, and authentication.
 */
export async function tryProvider(
  provider: ProviderConfig,
  body: any,
  originalHeaders: Record<string, string>
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const {
      name,
      baseUrl,
      apiKey,
      authHeader,
      headers: customHeaders,
      modelMapping,
    } = provider;

    // Apply model mapping if configured
    let model = body.model;
    if (modelMapping && modelMapping[model]) {
      model = modelMapping[model];
    }

    const newBody = { ...body, model };

    // Headers to exclude from forwarding
    const excludeHeaders = [
      'connection',
      'keep-alive',
      'te',
      'trailer',
      'transfer-encoding',
      'upgrade',
      'host',
      'content-length',
      'x-api-key',
      'authorization',
    ];

    // Build request headers
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(originalHeaders)) {
      const lowerKey = key.toLowerCase();
      if (!excludeHeaders.includes(lowerKey)) {
        headers[key] = value;
      }
    }

    // Apply custom headers from provider config
    if (customHeaders) {
      Object.assign(headers, customHeaders);
    }

    headers['content-type'] = headers['content-type'] || 'application/json';

    // Set authentication header
    const headerName = authHeader || 'x-api-key';
    if (headerName === 'Authorization') {
      if (!apiKey.startsWith('Bearer ')) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      } else {
        headers['Authorization'] = apiKey;
      }
    } else {
      headers[headerName] = apiKey;
    }

    console.log(`[Proxy] Attempting provider: ${name} (Model: ${model})`);

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(newBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    throw error;
  }
}

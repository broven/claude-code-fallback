import { env } from 'hono/adapter';
import { AppConfig, ProviderConfig } from '../types';
import {
  convertAnthropicToOpenAI,
  convertOpenAIResponseToAnthropic,
  convertOpenAIStreamToAnthropic,
} from './format-converter';

/**
 * Attempt a request to a specific fallback provider.
 * Handles model mapping, header filtering, authentication, and format conversion.
 */
export async function tryProvider(
  provider: ProviderConfig,
  body: any,
  originalHeaders: Record<string, string>,
  config: AppConfig,
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
      format,
    } = provider;

    // Apply model mapping if configured
    let model = body.model;
    if (modelMapping && modelMapping[model]) {
      model = modelMapping[model];
    }

    let requestBody = { ...body, model };

    // Convert request format if provider uses OpenAI format
    if (format === 'openai') {
      requestBody = convertAnthropicToOpenAI(requestBody);
    }

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
      'x-ccf-api-key',
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
    // Model mapping is now logged at the request level in index.ts
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Convert response format if provider uses OpenAI format and response is OK
    if (format === 'openai' && response.ok) {
      if (body.stream) {
        const convertedStream = convertOpenAIStreamToAnthropic(
          response.body as ReadableStream<Uint8Array>,
          model,
        );
        return new Response(convertedStream, {
          status: response.status,
          headers: { 'content-type': 'text/event-stream' },
        });
      } else {
        const openaiData = await response.json();
        const anthropicData = convertOpenAIResponseToAnthropic(openaiData);
        return new Response(JSON.stringify(anthropicData), {
          status: response.status,
          headers: { 'content-type': 'application/json' },
        });
      }
    }

    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    throw error;
  }
}

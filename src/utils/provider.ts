import { env } from 'hono/adapter';
import { cleanHeaders } from './headers';
import { AppConfig, ProviderConfig } from '../types';
import {
  convertAnthropicToOpenAI,
  convertOpenAIResponseToAnthropic,
  convertOpenAIStreamToAnthropic,
} from './format-converter';
import {
  shouldRectifyThinkingSignature,
  rectifyAnthropicRequest,
  shouldRectifyThinkingBudget,
  rectifyThinkingBudget,
} from './rectifier';

/**
 * Attempt a request to a specific fallback provider.
 * Handles model mapping, header filtering, authentication, format conversion, and rectification.
 */
export async function tryProvider(
  provider: ProviderConfig,
  body: any,
  originalHeaders: Record<string, string>,
  config: AppConfig,
  options?: {
    rectifierRetried?: boolean;
    budgetRectifierRetried?: boolean;
  },
): Promise<Response> {
  const maxRetries = provider.retry || 0;
  let attempts = 0;

  while (attempts <= maxRetries) {
    const isRetry = attempts > 0;

    if (isRetry) {
      // Exponential backoff: 500ms, 1000ms, 2000ms...
      const delay = Math.pow(2, attempts - 1) * 500;
      console.log(`[Provider: ${provider.name}] Retrying request (attempt ${attempts}/${maxRetries}) after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

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
        'accept-encoding',
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

      const response = await fetch(baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Check if we should retry based on status code
      // Retry on 5xx errors
      const shouldRetry = response.status >= 500;

      if (shouldRetry && attempts < maxRetries) {
        console.warn(`[Provider: ${provider.name}] Request failed with status ${response.status}. Retrying...`);

        if (config.debug) {
          try {
            const errorText = await response.clone().text();
            console.warn(`[Provider: ${provider.name}] Debug Error Response:`, errorText);
          } catch (e) {
            console.warn(`[Provider: ${provider.name}] Failed to read error response for debugging`);
          }
        }

        attempts++;
        continue;
      }

      // Check for rectifiable errors on non-OK responses (Anthropic format only)
      if (!response.ok && format !== 'openai') {
        const errorText = await response.text();

        // Try to extract error message
        let errorMessage: string | undefined;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage =
            errorJson.error?.message ||
            errorJson.message ||
            errorJson.error?.type ||
            errorText;
        } catch {
          errorMessage = errorText;
        }

        const rectifierConfig = config.rectifier;

        // Thinking Signature Rectifier
        if (
          !options?.rectifierRetried &&
          shouldRectifyThinkingSignature(errorMessage, rectifierConfig)
        ) {
          const rectifiedBody = JSON.parse(JSON.stringify(body));
          rectifiedBody.model = model;
          const result = rectifyAnthropicRequest(rectifiedBody);

          if (result.applied) {
            console.log(
              `[RECT-001] Signature rectification applied for ${name}: removed ${result.removedThinkingBlocks} thinking, ${result.removedRedactedThinkingBlocks} redacted_thinking, ${result.removedSignatureFields} signatures`,
            );
            return tryProvider(provider, rectifiedBody, originalHeaders, config, {
              ...options,
              rectifierRetried: true,
            });
          }
        }

        // Thinking Budget Rectifier
        if (
          !options?.budgetRectifierRetried &&
          shouldRectifyThinkingBudget(errorMessage, rectifierConfig)
        ) {
          const rectifiedBody = JSON.parse(JSON.stringify(body));
          rectifiedBody.model = model;
          const result = rectifyThinkingBudget(rectifiedBody);

          if (result.applied) {
            console.log(
              `[RECT-002] Budget rectification applied for ${name}: budget_tokens ${result.before.thinkingBudgetTokens} -> ${result.after.thinkingBudgetTokens}, max_tokens ${result.before.maxTokens} -> ${result.after.maxTokens}`,
            );
            return tryProvider(provider, rectifiedBody, originalHeaders, config, {
              ...options,
              budgetRectifierRetried: true,
            });
          }
        }

        // Return the original error response
        return new Response(errorText, {
          status: response.status,
          headers: cleanHeaders(response.headers),
        });
      }

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

      // Retry on network errors
      if (attempts < maxRetries) {
        console.warn(`[Provider: ${provider.name}] Network error: ${error.message}. Retrying...`);
        attempts++;
        continue;
      }

      throw error;
    }
  }

  throw new Error(`[Provider: ${provider.name}] Failed after ${maxRetries} retries`);
}

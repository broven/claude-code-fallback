/**
 * Test fixtures for API request bodies
 */

export const validMessageRequest = {
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  messages: [
    {
      role: 'user',
      content: 'Hello, Claude!',
    },
  ],
};

export const streamingMessageRequest = {
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  stream: true,
  messages: [
    {
      role: 'user',
      content: 'Tell me a story',
    },
  ],
};

export const validHeaders: Record<string, string> = {
  'content-type': 'application/json',
  'x-api-key': 'sk-anthropic-test-key',
  'anthropic-version': '2023-06-01',
};

export const headersWithDebugSkip: Record<string, string> = {
  ...validHeaders,
  'x-ccfallback-debug-skip-anthropic': '1',
};

export const headersWithHopByHop: Record<string, string> = {
  ...validHeaders,
  connection: 'keep-alive',
  'keep-alive': 'timeout=5',
  host: 'api.anthropic.com',
  'transfer-encoding': 'chunked',
  te: 'trailers',
};

export const successResponse = {
  id: 'msg_01XYZ',
  type: 'message',
  role: 'assistant',
  content: [
    {
      type: 'text',
      text: 'Hello! How can I help you today?',
    },
  ],
  model: 'claude-sonnet-4-20250514',
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: {
    input_tokens: 10,
    output_tokens: 15,
  },
};

export const openaiSuccessResponse = {
  id: 'chatcmpl-123',
  object: 'chat.completion',
  choices: [
    {
      index: 0,
      message: { role: 'assistant', content: 'Hello! How can I help you today?' },
      finish_reason: 'stop',
    },
  ],
  model: 'anthropic/claude-sonnet-4',
  usage: { prompt_tokens: 10, completion_tokens: 15, total_tokens: 25 },
};

export const openaiToolCallResponse = {
  id: 'chatcmpl-456',
  object: 'chat.completion',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_abc',
            type: 'function',
            function: {
              name: 'get_weather',
              arguments: '{"location":"NYC"}',
            },
          },
        ],
      },
      finish_reason: 'tool_calls',
    },
  ],
  model: 'anthropic/claude-sonnet-4',
  usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
};

export const openaiStreamChunks = [
  'data: {"id":"chatcmpl-123","choices":[{"delta":{"role":"assistant","content":""},"index":0}]}\n\n',
  'data: {"id":"chatcmpl-123","choices":[{"delta":{"content":"Hello"},"index":0}]}\n\n',
  'data: {"id":"chatcmpl-123","choices":[{"delta":{"content":"!"},"index":0,"finish_reason":"stop"}]}\n\n',
  'data: [DONE]\n\n',
];

export const errorResponses = {
  rateLimited: {
    error: {
      type: 'rate_limit_error',
      message: 'Rate limit exceeded',
    },
  },
  unauthorized: {
    error: {
      type: 'authentication_error',
      message: 'Invalid API key',
    },
  },
  forbidden: {
    error: {
      type: 'permission_error',
      message: 'Access denied',
    },
  },
  serverError: {
    error: {
      type: 'api_error',
      message: 'Internal server error',
    },
  },
  badRequest: {
    error: {
      type: 'invalid_request_error',
      message: 'Invalid request body',
    },
  },
};

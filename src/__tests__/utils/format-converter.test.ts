import { describe, it, expect } from 'vitest';
import {
  convertAnthropicToOpenAI,
  convertOpenAIResponseToAnthropic,
  convertOpenAIStreamToAnthropic,
} from '../../utils/format-converter';

describe('convertAnthropicToOpenAI', () => {
  describe('messages', () => {
    it('converts simple text message', () => {
      const result = convertAnthropicToOpenAI({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.messages).toEqual([
        { role: 'user', content: 'Hello' },
      ]);
      expect(result.model).toBe('claude-sonnet-4-20250514');
      expect(result.max_tokens).toBe(1024);
    });

    it('normalizes content block array to string', () => {
      const result = convertAnthropicToOpenAI({
        model: 'test',
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello ' }, { type: 'text', text: 'world' }],
          },
        ],
      });

      expect(result.messages).toEqual([
        { role: 'user', content: 'Hello world' },
      ]);
    });

    it('handles multi-turn conversation', () => {
      const result = convertAnthropicToOpenAI({
        model: 'test',
        messages: [
          { role: 'user', content: 'Hi' },
          { role: 'assistant', content: 'Hello!' },
          { role: 'user', content: 'How are you?' },
        ],
      });

      expect(result.messages).toHaveLength(3);
      expect(result.messages[0]).toEqual({ role: 'user', content: 'Hi' });
      expect(result.messages[1]).toEqual({ role: 'assistant', content: 'Hello!' });
      expect(result.messages[2]).toEqual({ role: 'user', content: 'How are you?' });
    });

    it('handles non-string non-array content gracefully', () => {
      const result = convertAnthropicToOpenAI({
        model: 'test',
        messages: [{ role: 'user', content: 12345 }],
      });

      expect(result.messages[0].content).toBe('');
    });

    it('handles empty messages array', () => {
      const result = convertAnthropicToOpenAI({
        model: 'test',
        messages: [],
      });

      expect(result.messages).toEqual([]);
    });
  });

  describe('system prompt', () => {
    it('extracts string system prompt to system message', () => {
      const result = convertAnthropicToOpenAI({
        model: 'test',
        system: 'You are helpful',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(result.messages[0]).toEqual({
        role: 'system',
        content: 'You are helpful',
      });
      expect(result.messages[1]).toEqual({ role: 'user', content: 'Hi' });
      expect(result.system).toBeUndefined();
    });

    it('extracts content block array system prompt', () => {
      const result = convertAnthropicToOpenAI({
        model: 'test',
        system: [
          { type: 'text', text: 'You are ' },
          { type: 'text', text: 'helpful' },
        ],
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(result.messages[0]).toEqual({
        role: 'system',
        content: 'You are helpful',
      });
    });

    it('omits system message when system field is absent', () => {
      const result = convertAnthropicToOpenAI({
        model: 'test',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
    });
  });

  describe('parameter mapping', () => {
    it('preserves compatible parameters', () => {
      const result = convertAnthropicToOpenAI({
        model: 'test',
        max_tokens: 2048,
        temperature: 0.7,
        top_p: 0.9,
        stream: true,
        messages: [],
      });

      expect(result.max_tokens).toBe(2048);
      expect(result.temperature).toBe(0.7);
      expect(result.top_p).toBe(0.9);
      expect(result.stream).toBe(true);
    });

    it('renames stop_sequences to stop', () => {
      const result = convertAnthropicToOpenAI({
        model: 'test',
        stop_sequences: ['END', 'STOP'],
        messages: [],
      });

      expect(result.stop).toEqual(['END', 'STOP']);
      expect(result.stop_sequences).toBeUndefined();
    });

    it('drops top_k (no OpenAI equivalent)', () => {
      const result = convertAnthropicToOpenAI({
        model: 'test',
        top_k: 40,
        messages: [],
      });

      expect(result.top_k).toBeUndefined();
    });

    it('drops metadata (no OpenAI equivalent)', () => {
      const result = convertAnthropicToOpenAI({
        model: 'test',
        metadata: { user_id: '123' },
        messages: [],
      });

      expect(result.metadata).toBeUndefined();
    });

    it('adds stream_options when streaming', () => {
      const result = convertAnthropicToOpenAI({
        model: 'test',
        stream: true,
        messages: [],
      });

      expect(result.stream_options).toEqual({ include_usage: true });
    });

    it('does not add stream_options when not streaming', () => {
      const result = convertAnthropicToOpenAI({
        model: 'test',
        messages: [],
      });

      expect(result.stream_options).toBeUndefined();
    });
  });

  describe('tool conversion', () => {
    it('converts Anthropic tools to OpenAI format', () => {
      const result = convertAnthropicToOpenAI({
        model: 'test',
        tools: [
          {
            name: 'get_weather',
            description: 'Get weather info',
            input_schema: {
              type: 'object',
              properties: { location: { type: 'string' } },
              required: ['location'],
            },
          },
        ],
        messages: [{ role: 'user', content: 'Weather?' }],
      });

      expect(result.tools).toEqual([
        {
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get weather info',
            parameters: {
              type: 'object',
              properties: { location: { type: 'string' } },
              required: ['location'],
            },
          },
        },
      ]);
    });

    it('converts tool_choice auto', () => {
      const result = convertAnthropicToOpenAI({
        model: 'test',
        tool_choice: { type: 'auto' },
        messages: [],
      });

      expect(result.tool_choice).toBe('auto');
    });

    it('converts tool_choice any to required', () => {
      const result = convertAnthropicToOpenAI({
        model: 'test',
        tool_choice: { type: 'any' },
        messages: [],
      });

      expect(result.tool_choice).toBe('required');
    });

    it('converts tool_choice specific tool', () => {
      const result = convertAnthropicToOpenAI({
        model: 'test',
        tool_choice: { type: 'tool', name: 'get_weather' },
        messages: [],
      });

      expect(result.tool_choice).toEqual({
        type: 'function',
        function: { name: 'get_weather' },
      });
    });
  });

  describe('tool_use in messages', () => {
    it('converts assistant tool_use content blocks', () => {
      const result = convertAnthropicToOpenAI({
        model: 'test',
        messages: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'toolu_123',
                name: 'get_weather',
                input: { location: 'NYC' },
              },
            ],
          },
        ],
      });

      expect(result.messages[0]).toEqual({
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'toolu_123',
            type: 'function',
            function: {
              name: 'get_weather',
              arguments: '{"location":"NYC"}',
            },
          },
        ],
      });
    });

    it('converts assistant message with text and tool_use', () => {
      const result = convertAnthropicToOpenAI({
        model: 'test',
        messages: [
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Let me check...' },
              {
                type: 'tool_use',
                id: 'toolu_123',
                name: 'get_weather',
                input: { location: 'NYC' },
              },
            ],
          },
        ],
      });

      expect(result.messages[0].content).toBe('Let me check...');
      expect(result.messages[0].tool_calls).toHaveLength(1);
    });

    it('converts user tool_result to tool message', () => {
      const result = convertAnthropicToOpenAI({
        model: 'test',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'toolu_123',
                content: 'Sunny, 72F',
              },
            ],
          },
        ],
      });

      expect(result.messages[0]).toEqual({
        role: 'tool',
        tool_call_id: 'toolu_123',
        content: 'Sunny, 72F',
      });
    });

    it('handles user message with mixed content and tool_result', () => {
      const result = convertAnthropicToOpenAI({
        model: 'test',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Thanks!' },
              {
                type: 'tool_result',
                tool_use_id: 'toolu_123',
                content: 'Result data',
              },
            ],
          },
        ],
      });

      // Should split into a user message and a tool message
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]).toEqual({ role: 'user', content: 'Thanks!' });
      expect(result.messages[1]).toEqual({
        role: 'tool',
        tool_call_id: 'toolu_123',
        content: 'Result data',
      });
    });
  });
});

describe('convertOpenAIResponseToAnthropic', () => {
  it('converts basic text response', () => {
    const result = convertOpenAIResponseToAnthropic({
      id: 'chatcmpl-123',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Hello!' },
          finish_reason: 'stop',
        },
      ],
      model: 'gpt-4',
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

    expect(result).toEqual({
      id: 'chatcmpl-123',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello!' }],
      model: 'gpt-4',
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    });
  });

  it('maps finish_reason stop to end_turn', () => {
    const result = convertOpenAIResponseToAnthropic({
      choices: [{ message: { content: '' }, finish_reason: 'stop' }],
    });

    expect(result.stop_reason).toBe('end_turn');
  });

  it('maps finish_reason length to max_tokens', () => {
    const result = convertOpenAIResponseToAnthropic({
      choices: [{ message: { content: '' }, finish_reason: 'length' }],
    });

    expect(result.stop_reason).toBe('max_tokens');
  });

  it('maps finish_reason tool_calls to tool_use', () => {
    const result = convertOpenAIResponseToAnthropic({
      choices: [{ message: { content: '' }, finish_reason: 'tool_calls' }],
    });

    expect(result.stop_reason).toBe('tool_use');
  });

  it('converts tool_calls response', () => {
    const result = convertOpenAIResponseToAnthropic({
      id: 'chatcmpl-456',
      choices: [
        {
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
      model: 'gpt-4',
      usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
    });

    expect(result.content).toEqual([
      {
        type: 'tool_use',
        id: 'call_abc',
        name: 'get_weather',
        input: { location: 'NYC' },
      },
    ]);
    expect(result.stop_reason).toBe('tool_use');
  });

  it('converts response with both text and tool_calls', () => {
    const result = convertOpenAIResponseToAnthropic({
      choices: [
        {
          message: {
            content: 'Let me check...',
            tool_calls: [
              {
                id: 'call_abc',
                type: 'function',
                function: { name: 'search', arguments: '{"q":"test"}' },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    });

    expect(result.content).toHaveLength(2);
    expect(result.content[0]).toEqual({ type: 'text', text: 'Let me check...' });
    expect(result.content[1].type).toBe('tool_use');
  });

  it('handles missing usage gracefully', () => {
    const result = convertOpenAIResponseToAnthropic({
      choices: [{ message: { content: 'Hi' }, finish_reason: 'stop' }],
    });

    expect(result.usage).toEqual({ input_tokens: 0, output_tokens: 0 });
  });

  it('handles missing id', () => {
    const result = convertOpenAIResponseToAnthropic({
      choices: [{ message: { content: 'Hi' }, finish_reason: 'stop' }],
    });

    expect(result.id).toBe('msg_converted');
  });

  it('handles malformed tool call arguments gracefully', () => {
    const result = convertOpenAIResponseToAnthropic({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: 'call_abc',
                type: 'function',
                function: {
                  name: 'get_weather',
                  arguments: '{invalid json',
                },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    });

    expect(result.content[0].type).toBe('tool_use');
    expect(result.content[0].input).toBe('{invalid json');
  });

  it('adds empty text block when content is null and no tool_calls', () => {
    const result = convertOpenAIResponseToAnthropic({
      choices: [{ message: { content: null }, finish_reason: 'stop' }],
    });

    expect(result.content).toEqual([{ type: 'text', text: '' }]);
  });
});

describe('convertOpenAIStreamToAnthropic', () => {
  function createStream(chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });
  }

  async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
    const decoder = new TextDecoder();
    const reader = stream.getReader();
    let result = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value, { stream: true });
    }
    return result;
  }

  function parseSSEEvents(raw: string): Array<{ event: string; data: any }> {
    const events: Array<{ event: string; data: any }> = [];
    const blocks = raw.split('\n\n').filter(Boolean);
    for (const block of blocks) {
      const lines = block.split('\n');
      let event = '';
      let data = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) event = line.slice(7);
        if (line.startsWith('data: ')) data = line.slice(6);
      }
      if (event && data) {
        events.push({ event, data: JSON.parse(data) });
      }
    }
    return events;
  }

  it('emits correct event sequence for simple text stream', async () => {
    const chunks = [
      'data: {"id":"chatcmpl-1","choices":[{"delta":{"role":"assistant","content":""},"index":0}]}\n\n',
      'data: {"id":"chatcmpl-1","choices":[{"delta":{"content":"Hello"},"index":0}]}\n\n',
      'data: {"id":"chatcmpl-1","choices":[{"delta":{"content":"!"},"index":0,"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ];

    const input = createStream(chunks);
    const output = convertOpenAIStreamToAnthropic(input, 'test-model');
    const raw = await readStream(output);
    const events = parseSSEEvents(raw);

    expect(events[0].event).toBe('message_start');
    expect(events[0].data.type).toBe('message_start');
    expect(events[0].data.message.model).toBe('test-model');

    expect(events[1].event).toBe('content_block_start');
    expect(events[1].data.content_block.type).toBe('text');

    expect(events[2].event).toBe('content_block_delta');
    expect(events[2].data.delta.type).toBe('text_delta');
    expect(events[2].data.delta.text).toBe('Hello');

    expect(events[3].event).toBe('content_block_delta');
    expect(events[3].data.delta.text).toBe('!');

    expect(events[4].event).toBe('content_block_stop');
    expect(events[5].event).toBe('message_delta');
    expect(events[5].data.delta.stop_reason).toBe('end_turn');
    expect(events[6].event).toBe('message_stop');
  });

  it('skips empty content deltas', async () => {
    const chunks = [
      'data: {"id":"chatcmpl-1","choices":[{"delta":{"role":"assistant","content":""},"index":0}]}\n\n',
      'data: {"id":"chatcmpl-1","choices":[{"delta":{"content":"Hi"},"index":0,"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ];

    const input = createStream(chunks);
    const output = convertOpenAIStreamToAnthropic(input, 'test-model');
    const raw = await readStream(output);
    const events = parseSSEEvents(raw);

    // message_start, content_block_start, content_block_delta("Hi"), content_block_stop, message_delta, message_stop
    const deltas = events.filter(e => e.event === 'content_block_delta');
    expect(deltas).toHaveLength(1);
    expect(deltas[0].data.delta.text).toBe('Hi');
  });

  it('handles finish_reason in final chunk', async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"Done"},"index":0,"finish_reason":"length"}]}\n\n',
      'data: [DONE]\n\n',
    ];

    const input = createStream(chunks);
    const output = convertOpenAIStreamToAnthropic(input, 'test-model');
    const raw = await readStream(output);
    const events = parseSSEEvents(raw);

    const msgDelta = events.find(e => e.event === 'message_delta');
    expect(msgDelta?.data.delta.stop_reason).toBe('max_tokens');
  });

  it('handles partial SSE lines across chunks', async () => {
    // Split a single SSE event across two chunks
    const chunks = [
      'data: {"choices":[{"delt',
      'a":{"content":"Hi"},"index":0,"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
    ];

    const input = createStream(chunks);
    const output = convertOpenAIStreamToAnthropic(input, 'test-model');
    const raw = await readStream(output);
    const events = parseSSEEvents(raw);

    const deltas = events.filter(e => e.event === 'content_block_delta');
    expect(deltas).toHaveLength(1);
    expect(deltas[0].data.delta.text).toBe('Hi');
  });

  it('handles tool call streaming', async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"role":"assistant","tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"get_weather","arguments":""}}]},"index":0}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"loc"}}]},"index":0}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ation\\":\\"NYC\\"}"}}]},"index":0,"finish_reason":"tool_calls"}]}\n\n',
      'data: [DONE]\n\n',
    ];

    const input = createStream(chunks);
    const output = convertOpenAIStreamToAnthropic(input, 'test-model');
    const raw = await readStream(output);
    const events = parseSSEEvents(raw);

    // Should have tool_use content block after DONE
    const toolBlockStart = events.find(
      e => e.event === 'content_block_start' && e.data.content_block?.type === 'tool_use',
    );
    expect(toolBlockStart).toBeDefined();
    expect(toolBlockStart?.data.content_block.id).toBe('call_1');
    expect(toolBlockStart?.data.content_block.name).toBe('get_weather');

    const inputDelta = events.find(
      e => e.event === 'content_block_delta' && e.data.delta?.type === 'input_json_delta',
    );
    expect(inputDelta).toBeDefined();
    expect(inputDelta?.data.delta.partial_json).toBe('{"location":"NYC"}');

    const msgDelta = events.find(e => e.event === 'message_delta');
    expect(msgDelta?.data.delta.stop_reason).toBe('tool_use');
  });

  it('closes text block before emitting tool calls when interleaved', async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"Let me check"},"index":0}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"search","arguments":"{\\"q\\":\\"test\\"}"}}]},"index":0,"finish_reason":"tool_calls"}]}\n\n',
      'data: [DONE]\n\n',
    ];

    const input = createStream(chunks);
    const output = convertOpenAIStreamToAnthropic(input, 'test-model');
    const raw = await readStream(output);
    const events = parseSSEEvents(raw);

    // Should have: message_start, text content_block_start, text delta, text content_block_stop,
    // then tool_use content_block_start, input_json_delta, tool content_block_stop, message_delta, message_stop
    const blockStarts = events.filter(e => e.event === 'content_block_start');
    expect(blockStarts).toHaveLength(2);
    expect(blockStarts[0].data.content_block.type).toBe('text');
    expect(blockStarts[1].data.content_block.type).toBe('tool_use');

    const blockStops = events.filter(e => e.event === 'content_block_stop');
    expect(blockStops).toHaveLength(2);

    // Text block should be closed (index 0) before tool block starts (index 1)
    expect(blockStops[0].data.index).toBe(0);
    expect(blockStarts[1].data.index).toBe(1);
  });

  it('skips invalid JSON in stream data', async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"Hi"},"index":0}]}\n\n',
      'data: {invalid json}\n\n',
      'data: {"choices":[{"delta":{"content":"!"},"index":0,"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ];

    const input = createStream(chunks);
    const output = convertOpenAIStreamToAnthropic(input, 'test-model');
    const raw = await readStream(output);
    const events = parseSSEEvents(raw);

    // Should skip the invalid JSON and still produce valid output
    const deltas = events.filter(e => e.event === 'content_block_delta');
    expect(deltas).toHaveLength(2);
    expect(deltas[0].data.delta.text).toBe('Hi');
    expect(deltas[1].data.delta.text).toBe('!');
  });

  it('captures usage from a regular chunk with choices', async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"Hi"},"index":0,"finish_reason":"stop"}],"usage":{"prompt_tokens":8,"completion_tokens":3}}\n\n',
      'data: [DONE]\n\n',
    ];

    const input = createStream(chunks);
    const output = convertOpenAIStreamToAnthropic(input, 'test-model');
    const raw = await readStream(output);
    const events = parseSSEEvents(raw);

    const msgDelta = events.find(e => e.event === 'message_delta');
    expect(msgDelta?.data.usage.output_tokens).toBe(3);
  });

  it('handles flush with remaining buffer data', async () => {
    // Stream that ends without a trailing newline, leaving data in the buffer
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hi"},"index":0,"finish_reason":"stop"}]}\n\ndata: [DONE]'));
        controller.close();
      },
    });

    const output = convertOpenAIStreamToAnthropic(stream, 'test-model');
    const raw = await readStream(output);
    const events = parseSSEEvents(raw);

    expect(events.find(e => e.event === 'message_start')).toBeDefined();
    expect(events.find(e => e.event === 'message_stop')).toBeDefined();

    const deltas = events.filter(e => e.event === 'content_block_delta');
    expect(deltas).toHaveLength(1);
    expect(deltas[0].data.delta.text).toBe('Hi');
  });

  it('captures usage from stream', async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"Hi"},"index":0,"finish_reason":"stop"}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n',
      'data: [DONE]\n\n',
    ];

    const input = createStream(chunks);
    const output = convertOpenAIStreamToAnthropic(input, 'test-model');
    const raw = await readStream(output);
    const events = parseSSEEvents(raw);

    const msgDelta = events.find(e => e.event === 'message_delta');
    expect(msgDelta?.data.usage.output_tokens).toBe(5);
  });
});

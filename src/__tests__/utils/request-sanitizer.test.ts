import { describe, it, expect } from 'vitest';
import { sanitizeAnthropicRequest } from '../../utils/request-sanitizer';

describe('sanitizeAnthropicRequest', () => {
  it('should pass through simple requests unchanged', () => {
    const input = {
      model: 'claude-3-opus-20240229',
      messages: [
        { role: 'user', content: 'Hello' },
      ],
      max_tokens: 1024,
    };

    const result = sanitizeAnthropicRequest(input);
    expect(result).toEqual(input);
  });

  it('should remove signature field from thinking blocks', () => {
    const input = {
      model: 'claude-sonnet-4-5-20250929',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Hello' },
            {
              type: 'thinking',
              thinking: 'Let me think...',
              signature: 'invalid-signature-123' // This should be removed
            },
          ],
        },
      ],
      max_tokens: 1024,
    };

    const result = sanitizeAnthropicRequest(input);

    expect(result.messages[0].content[1]).toEqual({
      type: 'thinking',
      thinking: 'Let me think...',
    });
    expect(result.messages[0].content[1]).not.toHaveProperty('signature');
  });

  it('should handle multiple messages with thinking blocks', () => {
    const input = {
      model: 'claude-sonnet-4-5-20250929',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Question 1' },
          ],
        },
        {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'Thinking 1', signature: 'sig1' },
            { type: 'text', text: 'Answer 1' },
          ],
        },
        {
          role: 'user',
          content: 'Question 2',
        },
        {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'Thinking 2', signature: 'sig2' },
            { type: 'text', text: 'Answer 2' },
          ],
        },
      ],
      max_tokens: 1024,
    };

    const result = sanitizeAnthropicRequest(input);

    // Check first assistant message
    expect(result.messages[1].content[0]).not.toHaveProperty('signature');
    expect(result.messages[1].content[0].thinking).toBe('Thinking 1');

    // Check second assistant message
    expect(result.messages[3].content[0]).not.toHaveProperty('signature');
    expect(result.messages[3].content[0].thinking).toBe('Thinking 2');
  });

  it('should handle string content in messages', () => {
    const input = {
      model: 'claude-3-opus-20240229',
      messages: [
        { role: 'user', content: 'Simple string content' },
      ],
      max_tokens: 1024,
    };

    const result = sanitizeAnthropicRequest(input);
    expect(result).toEqual(input);
  });

  it('should preserve other content block types', () => {
    const input = {
      model: 'claude-3-opus-20240229',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'image', source: { type: 'base64', data: 'abc123' } },
            { type: 'tool_use', id: 'tool1', name: 'calculator', input: {} },
          ],
        },
      ],
      max_tokens: 1024,
    };

    const result = sanitizeAnthropicRequest(input);
    expect(result).toEqual(input);
  });

  it('should handle null or undefined input', () => {
    expect(sanitizeAnthropicRequest(null)).toBe(null);
    expect(sanitizeAnthropicRequest(undefined)).toBe(undefined);
  });

  it('should handle request without messages', () => {
    const input = {
      model: 'claude-3-opus-20240229',
      max_tokens: 1024,
    };

    const result = sanitizeAnthropicRequest(input);
    expect(result).toEqual(input);
  });

  it('should preserve other top-level fields', () => {
    const input = {
      model: 'claude-sonnet-4-5-20250929',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'thinking', thinking: 'test', signature: 'remove-me' },
          ],
        },
      ],
      max_tokens: 1024,
      temperature: 0.7,
      top_p: 0.9,
      stream: false,
      metadata: { user_id: '123' },
    };

    const result = sanitizeAnthropicRequest(input);

    expect(result.max_tokens).toBe(1024);
    expect(result.temperature).toBe(0.7);
    expect(result.top_p).toBe(0.9);
    expect(result.stream).toBe(false);
    expect(result.metadata).toEqual({ user_id: '123' });
  });

  it('should handle empty content arrays', () => {
    const input = {
      model: 'claude-3-opus-20240229',
      messages: [
        { role: 'user', content: [] },
      ],
      max_tokens: 1024,
    };

    const result = sanitizeAnthropicRequest(input);
    expect(result.messages[0].content).toEqual([]);
  });
});

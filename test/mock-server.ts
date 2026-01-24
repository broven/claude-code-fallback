import { serve } from '@hono/node-server';
import { Hono } from 'hono';

const app = new Hono();
const port = 4000;

// State to control mock behavior
let scenario = 'normal'; // 'normal', 'primary-429', 'primary-500', 'all-fail'

app.post('/_control/scenario', async (c) => {
  const body = await c.req.json();
  scenario = body.scenario || 'normal';
  console.log(`[MockServer] Scenario set to: ${scenario}`);
  return c.json({ status: 'ok', scenario });
});

// Primary Anthropic Mock
app.post('/primary/v1/messages', async (c) => {
  const headers = c.req.header();
  const apiKey = headers['x-api-key'];
  console.log(`[MockServer] Primary hit. Scenario: ${scenario}. Key: ${apiKey}`);

  if (scenario === 'primary-429') {
    return c.text('Rate limit exceeded', 429);
  }
  if (scenario === 'primary-500') {
    return c.text('Internal Server Error', 500);
  }
  if (scenario === 'all-fail') {
    return c.text('Rate limit exceeded', 429);
  }

  // Normal success
  return c.json({
    id: 'msg_primary_123',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: 'Response from Primary Anthropic Mock' }],
    model: 'claude-3-mock',
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 20 }
  });
});

// Fallback Provider 1 Mock
app.post('/fallback/v1/messages', async (c) => {
  const headers = c.req.header();
  const auth = headers['authorization'] || headers['x-mock-key'];
  console.log(`[MockServer] Fallback 1 hit. Scenario: ${scenario}. Auth: ${auth}`);

  if (scenario === 'all-fail') {
    return c.text('Fallback provider also failed', 503);
  }

  return c.json({
    id: 'msg_fallback_123',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: 'Response from Fallback Provider Mock' }],
    model: 'claude-3-mock-fallback',
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 20 }
  });
});

console.log(`Mock Server running on port ${port}`);
serve({
  fetch: app.fetch,
  port
});

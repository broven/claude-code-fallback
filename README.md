# Claude Code Fallback Proxy

[![codecov](https://codecov.io/gh/broven/claude-code-fallback/branch/main/graph/badge.svg)](https://codecov.io/gh/broven/claude-code-fallback)

A fallback proxy for Claude Code (or any Anthropic API client). When you hit rate limits or API errors, automatically routes to alternative providers — just like [Vercel](https://vercel.com/changelog/claude-code-max-via-ai-gateway-available-now-for-claude-code) and [OpenRouter](https://openrouter.ai/docs/guides/guides/claude-code-integration) does.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/broven/claude-code-fallback)
## Why This Exists

When using Claude Code or other Anthropic API clients, you might encounter:
- Claude subscription **Rate limits (429)** — Your API quota is exhausted
- **Service errors (5xx)** — Temporary Anthropic API downtime
Instead of manually switching between providers, this proxy automatically fails over to your configured alternatives.

## How It Works

```
Claude Code ──► Fallback Proxy ──► Anthropic API
                     │                   ✗ 400 (bad request)
                     │                   ├── Rectifier: auto-fix & retry
                     │                   ✗ 429/403/5xx
                     │
                     └──► Provider 1 (retry w/ backoff) ──► Provider 2 ──► ...
                          (Anthropic / OpenAI format)
```

The proxy intercepts API requests. On 400 errors, the **Rectifier** automatically detects and fixes incompatible request fields (e.g., invalid thinking signatures, budget token issues) and retries. On 401, 403, 429, or 5xx errors, requests are forwarded to fallback providers in order until one succeeds.


## Features

- **Automatic Failover** — Seamlessly routes to fallback providers on 401/403/429/5xx errors
- **Request Auto-Rectification** — Automatically detects and fixes incompatible request formats (thinking signatures, budget tokens, tool-use blocks), then retries
- **OpenAI-Compatible Provider Support** — Use any OpenAI-format API (OpenRouter, Azure, etc.) as a fallback with automatic request/response conversion
- **Sliding Window Circuit Breaker** — Tiered cooldowns with safety valve to prevent cascading failures while ensuring service continuity
- **React Admin Panel** — Web-based dashboard with login authentication, visual provider management, and real-time circuit breaker status
- **Structured Observability** — JSON-formatted logs with unique request IDs for end-to-end tracing via `npm run tail`
- **Provider Retry with Exponential Backoff** — Configurable per-provider retry count with exponential delay
- **Prompt Cache Optimization** — Strips volatile billing header parameters to improve Anthropic prompt cache hit rates

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/broven/claude-code-fallback)

### Fallback Strategy

When a request fails, the proxy:

1. **Tries Anthropic API first** — Your primary requests always go to the official API
2. **Auto-rectifies on 400** — Detects thinking signature / budget issues, strips problematic blocks, and retries
3. **Detects eligible errors** — Only fallback on: 401, 403, 429, 5xx (not on other 4xx client errors)
4. **Checks Circuit Breakers** — Skips providers currently in cooldown to avoid cascading failures
5. **Iterates through providers** — Tries each available provider in order, with configurable per-provider retries
6. **Converts formats automatically** — Translates requests/responses for OpenAI-compatible providers
7. **Returns first success** — Or the last error if all fail

### Circuit Breaker (Plan C)

The system implements a **Sliding Window Circuit Breaker** to manage provider health:

- **Tiered Cooldowns**:
  - < 3 failures: **0s** (No cooldown)
  - 3-4 failures: **30s**
  - 5-9 failures: **60s**
  - 10+ failures: **300s** (configurable max)
- **Safety Valve**: If all providers are in cooldown, the system automatically tries the "least recently failed" provider to ensure service continuity.
- **Auto-Recovery**: Successful requests instantly reset failure counts and clear cooldowns.

**Model Mapping**: Configure model name translation (e.g., `claude-3-opus-20240229` → `anthropic/claude-3-opus`) per provider to ensure compatibility.

### Request Rectifier

When the Anthropic API returns a 400 error, the proxy automatically analyzes the request and applies fixes:

- **Thinking Signature** — Strips invalid `thinking`/`redacted_thinking` blocks and `signature` fields that cause rejections
- **Budget Tokens** — Adjusts `budget_tokens` and `max_tokens` to valid ranges
- **Tool-Use Concurrency** — Injects missing `tool_result` blocks for orphaned `tool_use` calls

After rectification, the request is retried automatically. If it still fails, fallback providers are tried.

### OpenAI Format Support

Fallback providers using the OpenAI Chat Completions API format are supported natively. The proxy performs bidirectional conversion:

- **Request**: Converts Anthropic Messages format → OpenAI Chat Completions format (system messages, content blocks, tools, tool_choice)
- **Response**: Converts OpenAI responses → Anthropic Messages format (including streaming SSE events)

Set `format: "openai"` on your provider config to enable automatic conversion.

## ⚠️ Important Notice

**Use at your own risk.** I have not reviewed Anthropic's Terms of Service to confirm whether using a proxy is permitted. There is a possibility that using this proxy could violate their terms and result in account suspension.

**Current status:** I've been using this proxy personally without issues, but that doesn't guarantee it's safe for all users. Please review [Anthropic's Terms of Service](https://www.anthropic.com/legal/consumer-terms) yourself before deploying, and use this tool at your own discretion.

## Quick Start

### 1. Deploy to Cloudflare

Click the button below to deploy your own instance:

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/broven/claude-code-fallback)

During deployment, you'll be prompted to:
- **Set ADMIN_TOKEN** — Choose a secure token to protect your admin panel
- **Create KV namespace** — Cloudflare will create this automatically

### 2. Configure Providers

After deployment, open your admin panel:

```
https://your-worker.workers.dev/admin
```

You'll be redirected to the login page. Enter your `ADMIN_TOKEN` to access the dashboard. The token is persisted in your browser so you won't need to re-login.

The admin panel provides:
- **Provider Management** — Add, edit, and delete fallback providers with a visual form
- **Circuit Breaker Status** — Real-time health badges showing provider state (healthy/cooldown) with manual reset
- **Settings** — Configure circuit breaker max cooldown duration
- **JSON Editor** — Direct JSON editing for advanced configuration

**Provider configuration fields:**

| Field | Required | Description |
|-------|----------|-------------|
| Name | Yes | Identifier (e.g., "openrouter") |
| Base URL | Yes | API endpoint |
| API Key | Yes | Authentication credential |
| Format | No | `anthropic` (default) or `openai` for OpenAI-compatible APIs |
| Auth Header | No | Header name for API key (default: `x-api-key`, use `Authorization` for Bearer tokens) |
| Retry Count | No | Number of retries with exponential backoff (default: 0) |
| Model Mapping | No | Map model names between providers (JSON) |
| Custom Headers | No | Additional headers per provider |

Example model mapping:
```json
{
  "claude-sonnet-4-5-20250929": "anthropic/claude-sonnet-4",
  "claude-3-5-sonnet-20241022": "anthropic/claude-3.5-sonnet"
}
```

### 3. Use in Claude Code

After configuring providers, click the **"Show Environment Config"** button in the admin panel:


Add these to your Claude Code settings or environment:

**For Claude Code CLI:**
```bash
export ANTHROPIC_BASE_URL=https://your-worker.workers.dev
export ANTHROPIC_API_KEY=your-original-anthropic-key
```

**For `.env` file:**
```bash
ANTHROPIC_BASE_URL=https://your-worker.workers.dev
ANTHROPIC_API_KEY=your-original-anthropic-key
```

That's it! Claude Code will now automatically fallback when needed.


## Observability

The proxy outputs structured JSON logs with request ID tracking. Every log entry includes:
- Unique `requestId` for tracing requests end-to-end
- `event` type (e.g., `provider.success`, `provider.failure`, `rectifier.applied`)
- Performance metrics (latency, status code)
- Provider and model information

```bash
npm run tail    # Stream real-time production logs
```

Enable debug mode by setting the `DEBUG` environment variable to `true` for verbose logging including curl-reproducible commands for failed requests.

See [docs/observability.md](./docs/observability.md) for details.

## Development

### Local Setup
```bash
npm install
npm run dev
# Visit http://localhost:8787/admin?token=dev-token
```

### Testing
```bash
npm test                  # Run all tests
npm run test:watch        # Watch mode
npm run test:coverage     # Coverage report
```


### Deployment
```bash
npm run deploy            # Deploy to Cloudflare
npm run tail              # Stream production logs
```

## License

Anti 996-License

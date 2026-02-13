# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev**: `npm run dev` (runs Wrangler local dev server on port 8787)
- **Build Frontend**: `npm run build:frontend` (builds the React frontend and embeds it into the Worker)
- **Deploy**: `npm run deploy` (builds frontend and deploys to Cloudflare Workers)
- **Type Check**: `npx tsc --noEmit`
- **Tail Logs**: `npm run tail` (streams production logs from Cloudflare)
- **Set Secrets**: `npx wrangler secret put ADMIN_TOKEN` (set authentication token)
- **Test**: `npm test` (runs test suite with Vitest)
- **Test Watch**: `npm run test:watch` (runs tests in watch mode)
- **Test Coverage**: `npm run test:coverage` (runs tests with coverage report)

## Architecture

Cloudflare Workers-based fallback proxy for Claude Code. Intercepts Anthropic API requests and routes to alternative providers when the primary API returns 401, 403, 429, or 5xx errors.

The Admin Panel is built as a **Single Page Application (SPA)** using React, Vite, and Tailwind CSS. It is bundled into a single HTML file and embedded directly into the Worker logic, allowing for a zero-dependency deployment (no separate asset storage required).

Implements a **Sliding Window Circuit Breaker (Plan C)** to track provider health and prevent cascading failures.
- **State Storage**: `provider-state:{name}` in KV (JSON format).
- **Tiered Cooldowns**: 0s (<3 failures), 30s (<5 failures), 60s (<10 failures), 300s (10+ failures).
- **Safety Valve**: If all providers are in cooldown, the one with the earliest expiry is tried to prevent total service outage.

### Core Components

- **`src/index.ts`** — Main Worker entry point. Hono app with routes for `/` (health check), `/v1/messages` (proxy), and `/admin/*` (management).
- **`src/admin.ts`** — Admin panel and API handlers. Serves the React SPA (`ADMIN_HTML`) and handles API requests.
- **`src/config.ts`** — KV-based configuration loading and saving.
- **`src/utils/circuit-breaker.ts`** — Sliding window circuit breaker implementation with tiered backoff.
- **`src/types.ts`** — TypeScript interfaces for `ProviderConfig`, `AppConfig`, `ProviderState`, and bindings.
- **`src/utils/provider.ts`** — Implements provider request logic with model mapping and header filtering.
- **`frontend/`** — React source code for the admin panel.
- **`scripts/build-frontend.sh`** — Builds the frontend and embeds it into `src/admin-html.ts`.

### Fallback Logic

1. Try primary Anthropic API (`https://api.anthropic.com/v1/messages`)
2. On 401, 403, 429, or 5xx errors:
   - Check circuit breaker state for each provider.
   - Skip providers currently in cooldown.
   - Iterate through available providers in configured order.
   - If all providers in cooldown, trigger **Safety Valve** (try least recently failed).
3. Return first successful response or last error.

### KV Configuration

1. **Provider Configs** (`providers` key):
   ```json
   [
     {
       "name": "openrouter",
       "baseUrl": "https://openrouter.ai/api/v1/chat/completions",
       "apiKey": "sk-...",
       "authHeader": "Authorization",
       "modelMapping": {
         "claude-sonnet-4-5-20250929": "anthropic/claude-sonnet-4"
       }
     }
   ]
   ```

2. **Provider State** (`provider-state:{name}` keys):
   ```json
   {
     "consecutiveFailures": 0,
     "lastFailure": null,
     "lastSuccess": 1715432100000,
     "cooldownUntil": null
   }
   ```

## Configuration

### Environment Variables

- **`ADMIN_TOKEN`** (required) — Secret token for protecting admin panel.
- **`DEBUG`** (optional, default: `false`) — Enable debug logging.

### KV Namespace

- **`CONFIG_KV`** — Binding to Cloudflare KV namespace storing provider configurations and circuit breaker state.

### wrangler.jsonc

Main configuration file. Contains:
- KV namespace binding (requires namespace id)
- Environment variables
- Development port (8787)

## Admin Panel

Access at: `https://your-worker.workers.dev/admin?token=YOUR_ADMIN_TOKEN`

Features:
- **Visual Editor**: Add/edit/delete providers with form UI
- **JSON Editor**: Direct JSON editing
- **Circuit Breaker Settings**: Configure max cooldown duration
- **Token Authentication**: Secured with `ADMIN_TOKEN`

## Observability

The proxy outputs **structured JSON logs** with Request ID tracking for full observability. See [docs/observability.md](./docs/observability.md) for details.

**Quick Start:**
```bash
# View real-time logs
npm run tail

# Logs are automatically collected in: Dashboard → Observability
```

Every log includes:
- Unique `requestId` for tracing requests end-to-end
- `event` type (e.g., `provider.success`, `provider.failure`)
- Performance metrics (`latency`, `status`)
- Provider and model information

## Deployment Workflow

1. Create KV namespace:
   ```bash
   npx wrangler kv:namespace create CONFIG
   ```
   Copy the output `id` to `wrangler.jsonc` → `kv_namespaces[0].id`

2. Set admin token:
   ```bash
   npx wrangler secret put ADMIN_TOKEN
   # Enter your secret token when prompted
   ```

3. Deploy:
   ```bash
   npm run deploy
   ```

4. Access admin panel:
   ```
   https://your-worker.workers.dev/admin?token=YOUR_TOKEN
   ```

## Provider Configuration

Each provider requires:
- **`name`** — Identifier (e.g., "openrouter")
- **`baseUrl`** — API endpoint
- **`apiKey`** — Authentication credential

Optional fields:
- **`authHeader`** — Header name for API key (default: `x-api-key`). Use `Authorization` for Bearer tokens.
- **`headers`** — Additional custom headers
- **`modelMapping`** — Map model names (e.g., `claude-3-opus-20240229` → `openai/gpt-4`)

## Testing

The project has a comprehensive test suite with **314 tests** and **96.54% coverage**.

### Test Structure

```
src/__tests__/
  fixtures/         # Test data and mock responses
  mocks/            # Mock KV and fetch implementations
  utils/            # Unit tests (headers, provider, circuit-breaker)
  config.test.ts    # Config module tests
  admin.test.ts     # Admin panel tests
  index.test.ts     # Integration tests
```

### Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode (reruns on file changes)
npm run test:watch

# Run with coverage report
npm run test:coverage
```

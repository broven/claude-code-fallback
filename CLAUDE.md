# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev**: `npm run dev` (runs Wrangler local dev server on port 8787)
- **Deploy**: `npm run deploy` (deploys to Cloudflare Workers)
- **Type Check**: `npx tsc --noEmit`
- **Tail Logs**: `npm run tail` (streams production logs from Cloudflare)
- **Set Secrets**: `npx wrangler secret put ADMIN_TOKEN` (set authentication token)
- **Test**: `npm test` (runs test suite with Vitest)
- **Test Watch**: `npm run test:watch` (runs tests in watch mode)
- **Test Coverage**: `npm run test:coverage` (runs tests with coverage report)

## Architecture

Cloudflare Workers-based fallback proxy for Claude Code. Intercepts Anthropic API requests and routes to alternative providers when the primary API returns 401, 403, 429, or 5xx errors. Provider configuration is stored in Cloudflare KV and managed via web-based admin panel.

### Core Components

- **`src/index.ts`** — Main Worker entry point. Hono app with routes for `/` (health check), `/v1/messages` (proxy), and `/admin/*` (management).
- **`src/admin.ts`** — Admin panel and API handlers. Provides HTML UI for managing providers, handles token authentication, and KV storage operations.
- **`src/config.ts`** — KV-based configuration loading and saving. Reads provider configuration from Cloudflare KV.
- **`src/types.ts`** — TypeScript interfaces for provider config, app config, and Worker bindings (KV, ADMIN_TOKEN, DEBUG).
- **`src/utils/provider.ts`** — Implements provider request logic with model mapping, header filtering, and custom auth.
- **`src/utils/headers.ts`** — Utilities for filtering and cleaning HTTP headers for safe forwarding.

### Fallback Logic

1. Try primary Anthropic API (`https://api.anthropic.com/v1/messages`)
2. On 401, 403, 429, or 5xx errors → iterate through configured fallback providers
3. Return first successful response or last error

### KV Configuration

Provider configs are stored as JSON array in Cloudflare KV namespace `CONFIG_KV` under key `providers`:

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

## Configuration

### Environment Variables

- **`ADMIN_TOKEN`** (required) — Secret token for protecting admin panel. Set via Cloudflare Dashboard or `wrangler secret put`.
- **`DEBUG`** (optional, default: `false`) — Enable debug logging.

### KV Namespace

- **`CONFIG_KV`** — Binding to Cloudflare KV namespace storing provider configurations.

### wrangler.jsonc

Main configuration file. Contains:
- KV namespace binding (requires namespace id from `npx wrangler kv:namespace create CONFIG`)
- Environment variables
- Development port (8787)

## Admin Panel

Access at: `https://your-worker.workers.dev/admin?token=YOUR_ADMIN_TOKEN`

Features:
- **Visual Editor**: Add/edit/delete providers with form UI
- **JSON Editor**: Direct JSON editing for advanced users
- **Real-time Save**: Changes persist immediately to KV
- **Token Authentication**: Secured with `ADMIN_TOKEN` environment variable

### API Endpoints

- `GET /admin` — Admin panel UI (requires token)
- `GET /admin/config` — Get current provider config as JSON (requires token)
- `POST /admin/config` — Update provider config (requires token, expects JSON array)

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

## Local Development

```bash
npm run dev
# Visit http://localhost:8787/admin?token=123456 (default token in wrangler.jsonc)
```

When running locally with `npx wrangler kv:namespace create CONFIG --preview`, you can test KV operations with preview binding.

## Provider Configuration

Each provider requires:
- **`name`** — Identifier (e.g., "openrouter")
- **`baseUrl`** — API endpoint
- **`apiKey`** — Authentication credential

Optional fields:
- **`authHeader`** — Header name for API key (default: `x-api-key`). Use `Authorization` for Bearer tokens.
- **`headers`** — Additional custom headers
- **`modelMapping`** — Map model names (e.g., `claude-3-opus-20240229` → `openai/gpt-4`)

## Type System

Main types in `src/types.ts`:
- `ProviderConfig` — Single provider configuration
- `AppConfig` — Runtime config with debug flag and provider list
- `Bindings` — Worker environment bindings (DEBUG, ADMIN_TOKEN, CONFIG_KV)

## Testing

The project has a comprehensive test suite with 142 tests and 99%+ coverage.

### Test Structure

```
src/__tests__/
  fixtures/         # Test data and mock responses
    providers.ts    # Provider configurations
    requests.ts     # API request/response fixtures
  mocks/            # Mock implementations
    kv.ts          # Mock KV namespace
    fetch.ts       # Mock fetch utilities
  utils/           # Unit tests for utilities
    headers.test.ts
    provider.test.ts
  config.test.ts   # Config module tests
  admin.test.ts    # Admin panel tests
  index.test.ts    # Integration tests
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

### Test Coverage

The test suite maintains high coverage across all modules:
- **Statements**: 99.28%
- **Branches**: 98.48%
- **Functions**: 94.73%
- **Lines**: 100%

Coverage thresholds are enforced at 80% for all metrics.

### Writing Tests

Tests use Vitest with Cloudflare Workers pool for accurate Workers environment simulation:

```typescript
import { describe, it, expect } from 'vitest';
import { createMockBindings } from './__tests__/mocks/kv';

describe('my feature', () => {
  it('should work correctly', async () => {
    const env = createMockBindings();
    // Test implementation
  });
});
```

Key testing utilities:
- `createMockBindings()` — Creates mock Worker bindings (KV, env vars)
- `createMockResponse()` — Creates mock Response objects
- Test fixtures in `__tests__/fixtures/` — Reusable test data

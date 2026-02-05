# Claude Code Fallback Proxy

A Cloudflare Workers-based fallback proxy that automatically routes to alternative API providers when the Anthropic API is unavailable.

## How It Works

```
Claude Code ──► Fallback Proxy ──► Anthropic API
                     │                   ✗ 429/403/5xx
                     │
                     └──► Provider 1 ──► Provider 2 ──► ...
```

The proxy intercepts API requests. When the Anthropic API returns an error eligible for fallback (401, 403, 429, or 5xx), requests are forwarded to your configured fallback providers in order until one succeeds.

## Features

- ✅ **Cloudflare Workers** — Runs globally with zero infrastructure
- ✅ **Web-based Admin Panel** — Configure providers through a browser UI
- ✅ **KV Storage** — Persistent configuration managed via Cloudflare KV
- ✅ **Model Mapping** — Automatically map model names between providers
- ✅ **Custom Headers** — Support for custom authentication headers
- ✅ **Token Protection** — Simple token-based admin authentication

## Quick Start

### 1. Create KV Namespace

```bash
npx wrangler kv:namespace create CONFIG
```

Copy the `id` from the output and update `wrangler.jsonc`:

```jsonc
"kv_namespaces": [
  {
    "binding": "CONFIG_KV",
    "id": "your-kv-id"  // ← paste here
  }
]
```

### 2. Set Admin Token

```bash
npx wrangler secret put ADMIN_TOKEN
```

When prompted, enter a secure token (e.g., a strong random string). You'll use this to access the admin panel.

### 3. Deploy

```bash
npm run deploy
```

### 4. Configure Providers

Open your admin panel:

```
https://your-worker.workers.dev/admin?token=YOUR_TOKEN
```

Add providers:
- **Name**: Any identifier (e.g., "openrouter")
- **Base URL**: API endpoint
- **API Key**: Your authentication credential
- **Auth Header**: Header name for the key (default: `x-api-key`, use `Authorization` for Bearer tokens)

## Local Development

```bash
npm run dev
# Visit http://localhost:8787/admin?token=123456
```

The default dev token is `123456` (set in `wrangler.jsonc`). Configure providers and test locally before deploying.

## Configuration Examples

### OpenRouter

```json
{
  "name": "openrouter",
  "baseUrl": "https://openrouter.ai/api/v1/chat/completions",
  "apiKey": "sk-or-xxx",
  "authHeader": "Authorization",
  "modelMapping": {
    "claude-sonnet-4-20250514": "anthropic/claude-sonnet-4"
  }
}
```

### Custom Proxy with x-api-key

```json
{
  "name": "my-proxy",
  "baseUrl": "https://my-proxy.example.com/v1/messages",
  "apiKey": "secret-key-123",
  "authHeader": "x-api-key",
  "headers": {
    "x-custom-header": "value"
  }
}
```

## API Reference

### Proxy Endpoint

**POST** `/v1/messages`

Standard Anthropic API format. Requests are forwarded to Anthropic first, then fallback providers on failure.

### Admin API

**GET** `/admin?token=YOUR_TOKEN`
- Returns HTML admin panel

**GET** `/admin/config?token=YOUR_TOKEN`
- Returns current provider configuration as JSON

**POST** `/admin/config?token=YOUR_TOKEN`
- Update provider configuration
- Body: JSON array of provider configs

### Health Check

**GET** `/`
- Returns: Plain text status message with provider count

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ADMIN_TOKEN` | Yes | — | Token for protecting admin panel |
| `DEBUG` | No | `false` | Enable debug logging |

## Architecture

- **Fallback Logic** (`src/index.ts:18-150`) — Main proxy with Anthropic API retry and provider iteration
- **Admin Panel** (`src/admin.ts`) — HTML UI and API handlers for configuration management
- **Configuration** (`src/config.ts`) — KV storage operations
- **Provider Logic** (`src/utils/provider.ts`) — Request forwarding with model mapping and auth handling

## Cloudflare Bindings

- `CONFIG_KV` — KV namespace for storing provider configurations
- `ADMIN_TOKEN` — Environment variable with admin authentication token
- `DEBUG` — Environment variable for debug mode

## Limits & Notes

- Cloudflare Workers have a **30-second execution timeout** — requests must complete within this time
- KV operations have eventual consistency (rarely an issue in practice)
- The proxy passes through response bodies directly; no caching or transformation

## Troubleshooting

**"Unauthorized" when accessing `/admin`**
- Check that your token matches the `ADMIN_TOKEN` in Cloudflare Dashboard Settings
- Try passing it as a query param: `/admin?token=YOUR_TOKEN`

**Providers not being used**
- Verify they're configured in the admin panel
- Check Worker logs: `npm run tail`
- Ensure provider API keys are valid
- Test the provider endpoint directly with curl

**Changes not persisting**
- Ensure KV namespace `id` is correctly set in `wrangler.jsonc`
- Verify KV namespace exists: `npx wrangler kv:namespace list`

## Development

Install dependencies:
```bash
npm install
```

Run type checks:
```bash
npx tsc --noEmit
```

Deploy preview:
```bash
npm run deploy --env staging
```

## License

ISC

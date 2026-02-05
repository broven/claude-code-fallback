# Environment Variables Reference

## Overview

Environment variables configure the Claude Code Fallback Proxy Worker. Some are required for deployment, others optional for debugging.

## Variables

### ADMIN_TOKEN

| Property | Value |
|----------|-------|
| **Required** | Yes |
| **Type** | String (secret) |
| **Default** | None |
| **Environment** | All (dev, staging, production) |

Secret token for protecting the admin panel (`/admin`). Used for authentication on all admin endpoints.

**Setup:**
```bash
# Via Cloudflare Dashboard
# Workers & Pages → Your Worker → Settings → Variables and Secrets → Add Secret

# Via CLI
npx wrangler secret put ADMIN_TOKEN
# Enter your token when prompted
```

**Usage:**
```bash
# Access admin panel
https://your-worker.workers.dev/admin?token=YOUR_TOKEN

# Or via Authorization header
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-worker.workers.dev/admin
```

**Security:**
- Use a strong random string (min 16 characters recommended)
- Never commit to source control
- Rotate periodically for security-sensitive deployments
- Treat like an API key

**Example:**
```
ADMIN_TOKEN=sk-proj-abc123xyz789def456ghi789jkl012
```

---

### DEBUG

| Property | Value |
|----------|-------|
| **Required** | No |
| **Type** | Boolean string (`"true"` or `"false"`) |
| **Default** | `"false"` |
| **Environment** | All |

Enable debug logging to Workers logs. Shows detailed information about request processing, configuration loading, and provider attempts.

**Setup:**

Via `wrangler.jsonc`:
```jsonc
{
  "vars": {
    "DEBUG": "true"
  }
}
```

Via Cloudflare Dashboard:
- Workers & Pages → Your Worker → Settings → Variables → Add variable
- Name: `DEBUG`, Value: `true`

**Usage:**
```bash
# Local development
npm run dev
# Then check console output

# Production
npm run tail
# Watch for [Config], [Proxy], [Admin] log messages
```

**Log Examples:**

With `DEBUG=true`:
```
[Config] Loaded 2 providers. Debug: true
[Proxy] Incoming Request {
  method: 'POST',
  url: 'https://worker.dev/v1/messages',
  model: 'claude-3-opus'
}
[Proxy] Forwarding request to Primary Anthropic API (Model: claude-3-opus)
```

Without debug (default):
```
[Proxy] Anthropic API request successful
```

**Troubleshooting:**
- Enable DEBUG in production to diagnose configuration issues
- Disable in production for cleaner logs after troubleshooting
- Each request logs approximately 500 bytes with DEBUG=true

---

## KV Bindings (Configuration)

These are configured in `wrangler.jsonc`, not as environment variables. Listed here for reference.

### CONFIG_KV

| Property | Value |
|----------|-------|
| **Type** | KV Namespace binding |
| **Stores** | Provider configurations (JSON array) |
| **Key** | `providers` |

Cloudflare KV namespace for persistent provider configuration storage.

**Setup:**
```bash
# Create namespace
npx wrangler kv:namespace create CONFIG

# Output:
# Created namespace with id = "a1b2c3d4e5f6g7h8"

# Add to wrangler.jsonc
"kv_namespaces": [
  {
    "binding": "CONFIG_KV",
    "id": "a1b2c3d4e5f6g7h8"
  }
]
```

**Access in Code:**
```typescript
const config = await env.CONFIG_KV.get('providers');
```

**Value Format:**
```json
[
  {
    "name": "openrouter",
    "baseUrl": "https://openrouter.ai/api/v1/chat/completions",
    "apiKey": "sk-...",
    "authHeader": "Authorization",
    "modelMapping": {
      "claude-3-opus-20240229": "anthropic/claude-3-opus"
    }
  },
  {
    "name": "bedrock-proxy",
    "baseUrl": "https://my-proxy.example.com/v1/messages",
    "apiKey": "secret-key-123",
    "authHeader": "x-api-key"
  }
]
```

---

## Local Development Variables

For local development with `npm run dev`, you can set variables via environment:

```bash
# Method 1: Inline
DEBUG=true npm run dev

# Method 2: .env file (Wrangler loads automatically)
# Create .env:
# DEBUG=true
# ADMIN_TOKEN=dev-token-123

npm run dev
```

**Default .env:**
```
ADMIN_TOKEN=123456
```

This dev token is used for local testing. Change `ADMIN_TOKEN` for production.

---

## Variable Validation

### Type Checking

All variables use TypeScript types in `src/types.ts`:

```typescript
export interface Bindings {
  DEBUG: string;          // "true" or "false"
  ADMIN_TOKEN: string;    // Secret string
  CONFIG_KV: KVNamespace; // KV binding
}
```

### Accessing Variables

In handler functions:

```typescript
export async function handler(c: Context<{ Bindings: Bindings }>) {
  const debug = c.env.DEBUG === 'true';
  const token = c.env.ADMIN_TOKEN;
  const config = await c.env.CONFIG_KV.get('providers');
}
```

---

## Secrets Management Best Practices

### Creating Strong Tokens

```bash
# Generate random token
openssl rand -base64 32

# Result: something like:
# abc123def456ghi789jkl012mno345pqr
```

### Storing Secrets

**Never commit secrets to git:**
```bash
# Good - .env is in .gitignore
echo "ADMIN_TOKEN=secret-value" > .env

# Bad - Don't do this
# wrangler.jsonc with hardcoded secrets
```

### Updating Secrets

```bash
# Update secret value
npx wrangler secret put ADMIN_TOKEN

# List all secrets (names only, not values)
npx wrangler secret list

# Delete a secret
npx wrangler secret delete ADMIN_TOKEN
```

### Secret Rotation

Periodically update secrets:
```bash
# 1. Generate new token
NEW_TOKEN=$(openssl rand -base64 32)

# 2. Store old token for transition period
# npx wrangler secret put ADMIN_TOKEN_OLD (optional)

# 3. Update main token
echo $NEW_TOKEN | npx wrangler secret put ADMIN_TOKEN

# 4. Update documentation with new token location
# (don't share in docs, only in secure channels)
```

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| 401 Unauthorized on `/admin` | Token mismatch | Verify `ADMIN_TOKEN` matches URL parameter |
| "ADMIN_TOKEN not configured" error | Variable not set | `npx wrangler secret put ADMIN_TOKEN` |
| Empty provider list | KV not initialized | Access `/admin` and add provider |
| Excess logging in production | DEBUG=true | Set `DEBUG=false` in vars |
| Can't access KV in local dev | KV binding missing | Ensure `kv_namespaces` in wrangler.jsonc |

---

## Reference

- [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Cloudflare KV Documentation](https://developers.cloudflare.com/kv/)
- [Wrangler Configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)

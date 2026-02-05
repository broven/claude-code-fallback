# Operations Runbook

## Deployment Procedures

### Initial Setup

#### 1. Create KV Namespace

```bash
npx wrangler kv:namespace create CONFIG
```

Output example:
```
Created namespace with id = "a1b2c3d4e5f6g7h8"
```

Copy the `id` and update `wrangler.jsonc`:

```jsonc
"kv_namespaces": [
  {
    "binding": "CONFIG_KV",
    "id": "a1b2c3d4e5f6g7h8"  // ← your id here
  }
]
```

#### 2. Create Admin Token

Generate a strong random token:
```bash
# Option 1: Use wrangler CLI
npx wrangler secret put ADMIN_TOKEN
# Enter secure token when prompted

# Option 2: Set in Cloudflare Dashboard
# Workers & Pages → Your Worker → Settings → Variables and Secrets
```

#### 3. Deploy Worker

```bash
npm run deploy
```

Check deployment status:
```bash
npx wrangler deployments list
```

#### 4. Verify Deployment

```bash
# Health check
curl https://your-worker.workers.dev/

# Access admin panel
# https://your-worker.workers.dev/admin?token=YOUR_TOKEN
```

### Redeployment

To update the Worker after code changes:

```bash
# 1. Verify changes locally
npm run dev
# Test at http://localhost:8787

# 2. Type check
npx tsc --noEmit

# 3. Deploy
npm run deploy

# 4. Monitor logs
npm run tail
```

---

## Monitoring and Debugging

### Real-Time Logs

```bash
npm run tail
```

Log output includes:
- Incoming requests
- Anthropic API attempts
- Fallback provider attempts
- Errors and exceptions

### Filtering Logs

```bash
# Show only errors
npm run tail -- --status error

# Show only successful requests
npm run tail -- --status success

# Show logs from last 5 minutes
npm run tail --format pretty
```

### Common Log Patterns

**Successful Anthropic request:**
```
[Proxy] Forwarding request to Primary Anthropic API (Model: claude-3-opus)
[Proxy] Anthropic API request successful
```

**Fallback triggered:**
```
[Proxy] Anthropic API failed with status 429
[Proxy] Attempting provider: openrouter (Model: claude-3-opus)
[Proxy] Provider openrouter request successful
```

**Configuration error:**
```
[Config] Failed to load config from KV: ...
[Proxy] No fallback providers configured.
```

---

## Configuration Management

### View Current Config

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-worker.workers.dev/admin/config
```

### Update Config via API

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[
    {
      "name": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1/chat/completions",
      "apiKey": "sk-...",
      "authHeader": "Authorization"
    }
  ]' \
  https://your-worker.workers.dev/admin/config
```

### Backup Configuration

```bash
# Export current config
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-worker.workers.dev/admin/config > providers-backup.json

# Restore from backup
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d @providers-backup.json \
  https://your-worker.workers.dev/admin/config
```

---

## Common Issues and Fixes

### Issue: "Unauthorized" when accessing admin panel

**Symptoms:**
- Accessing `/admin?token=xxx` returns 401
- Cannot see configuration page

**Causes:**
- Token doesn't match `ADMIN_TOKEN`
- Whitespace in token
- Token not set in Cloudflare

**Fix:**
```bash
# 1. Verify token in Cloudflare Dashboard
# Workers & Pages → Settings → Variables and Secrets

# 2. Try with query parameter
https://your-worker.workers.dev/admin?token=YOUR_EXACT_TOKEN

# 3. Try with Authorization header
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-worker.workers.dev/admin
```

### Issue: Providers not being used

**Symptoms:**
- Only Anthropic API is tried
- Fallback providers ignored even when Anthropic fails

**Causes:**
- No providers configured
- Invalid provider configuration
- KV namespace not properly set up

**Fix:**
```bash
# 1. Check configuration
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-worker.workers.dev/admin/config

# 2. Verify at least one provider exists
# If empty [], add one via admin panel

# 3. Test provider endpoint directly
curl -X POST https://provider-url/v1/messages \
  -H "Authorization: Bearer YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-3-opus","messages":[...]}'

# 4. Check logs
npm run tail
```

### Issue: "No fallback providers configured" error

**Symptoms:**
- All requests fail with message: "Primary API failed and no fallbacks configured"

**Causes:**
- Configuration not saved to KV
- KV namespace id incorrect in wrangler.jsonc
- KV namespace deleted

**Fix:**
```bash
# 1. Verify KV namespace exists
npx wrangler kv:namespace list

# 2. Check wrangler.jsonc has correct id
cat wrangler.jsonc | grep -A 3 "kv_namespaces"

# 3. Add provider via admin panel
# https://your-worker.workers.dev/admin?token=TOKEN

# 4. Or use API to add provider
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{"name":"test","baseUrl":"https://api.openai.com/v1/chat/completions","apiKey":"sk-test"}]' \
  https://your-worker.workers.dev/admin/config
```

### Issue: Requests timing out

**Symptoms:**
- 504 errors or timeout messages
- Some providers respond, others don't

**Causes:**
- Provider endpoint slow or unreachable
- Network issues
- 30-second Workers timeout exceeded

**Fix:**
```bash
# 1. Check provider endpoint directly
curl -w "\nTotal: %{time_total}s\n" \
  https://provider-url/v1/messages \
  -H "Authorization: Bearer KEY"

# 2. If >25 seconds, provider is too slow
# Consider removing or checking their status

# 3. Check logs for timeout patterns
npm run tail | grep -i timeout

# 4. Verify Anthropic API is responding
curl -w "\nTotal: %{time_total}s\n" \
  https://api.anthropic.com/v1/messages \
  -H "x-api-key: YOUR_KEY"
```

### Issue: 502 Bad Gateway

**Symptoms:**
- Error response: {"error": {"type": "fallback_exhausted"}}
- All providers failed

**Causes:**
- All providers returning errors
- Invalid API keys
- Providers rejecting model names

**Fix:**
```bash
# 1. Check logs for detailed error
npm run tail

# 2. Verify API keys in configuration
curl -H "Authorization: Bearer TOKEN" \
  https://your-worker.workers.dev/admin/config

# 3. Test each provider individually
for provider in $(cat providers.json | jq -r '.[].name'); do
  echo "Testing $provider..."
  # Make test request to each
done

# 4. Check if model mapping is correct
# Admin panel → Edit provider → Check modelMapping
```

---

## Rollback Procedures

### Rollback to Previous Worker Version

If deployment introduces issues:

```bash
# 1. Check recent deployments
npx wrangler deployments list

# 2. View a specific deployment
npx wrangler deployments view <DEPLOYMENT_ID>

# 3. Rollback to previous version
npx wrangler rollback --message "Rollback to stable version"
```

### Restore Previous Configuration

If configuration was corrupted:

```bash
# 1. Restore from backup
cat providers-backup.json | curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d @- \
  https://your-worker.workers.dev/admin/config

# 2. Verify restoration
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-worker.workers.dev/admin/config
```

### Clear Configuration (Emergency)

If configuration is corrupted beyond repair:

```bash
# Post empty array to reset
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[]' \
  https://your-worker.workers.dev/admin/config

# Then reconfigure via admin panel
# https://your-worker.workers.dev/admin?token=TOKEN
```

---

## Maintenance Tasks

### Monthly Checklist

- [ ] Review Worker logs for errors
- [ ] Verify all configured providers are still operational
- [ ] Test admin panel access with current token
- [ ] Backup current configuration
- [ ] Check Anthropic API status page

### Update Dependencies

Workers don't auto-update, but check for security updates:

```bash
npm outdated
npm audit
npm audit fix
npm run deploy
```

### Performance Review

Monitor average response times:

```bash
npm run tail --format pretty | grep -i "time"
```

Expected ranges:
- Anthropic: 1-5 seconds
- Fallback providers: 0.5-3 seconds
- Admin panel: <500ms

---

## Emergency Contacts

- Anthropic API Status: https://status.anthropic.com
- Cloudflare Status: https://www.cloudflarestatus.com
- Repository Issues: https://github.com/broven/claude-code-fallback/issues

## Support

For issues, questions, or deployment help:
1. Check this runbook
2. Review logs: `npm run tail`
3. Open a GitHub issue with error details

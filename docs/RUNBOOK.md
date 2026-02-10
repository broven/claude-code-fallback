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

# 3. Run tests
npm test

# 4. Deploy
npm run deploy

# 5. Monitor logs
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
- Circuit breaker state changes
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
[CircuitBreaker] Provider openrouter in cooldown until 1715432100000
[Proxy] Attempting provider: openrouter (Model: claude-3-opus)
[Proxy] Provider openrouter request successful
[CircuitBreaker] Reset failures for openrouter
```

**Circuit breaker activated:**
```
[Proxy] Provider openrouter failed with status 500
[CircuitBreaker] Marked openrouter failed (consecutiveFailures: 3, cooldown: 30s)
```

**Safety valve triggered:**
```
[Proxy] All providers in cooldown, using safety valve: openrouter
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

### View Circuit Breaker State

Provider state is stored in KV under `provider-state:{name}` keys:

```bash
# List all provider state keys
npx wrangler kv:key list --binding CONFIG_KV | grep "provider-state"

# View specific provider state
npx wrangler kv:key get "provider-state:openrouter" --binding CONFIG_KV
```

Example output:
```json
{
  "consecutiveFailures": 2,
  "lastFailure": 1715432100000,
  "lastSuccess": 1715432000000,
  "cooldownUntil": null
}
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
- All providers in circuit breaker cooldown

**Fix:**
```bash
# 1. Check configuration
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-worker.workers.dev/admin/config

# 2. Check provider states
npx wrangler kv:key get "provider-state:openrouter" --binding CONFIG_KV

# 3. Verify at least one provider exists
# If empty [], add one via admin panel

# 4. Test provider endpoint directly
curl -X POST https://provider-url/v1/messages \
  -H "Authorization: Bearer YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-3-opus","messages":[...]}'

# 5. Check logs
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
- All providers in circuit breaker cooldown (safety valve also failed)

**Fix:**
```bash
# 1. Check logs for detailed error
npm run tail

# 2. Check provider states for cooldowns
npx wrangler kv:key list --binding CONFIG_KV | grep "provider-state"

# 3. Verify API keys in configuration
curl -H "Authorization: Bearer TOKEN" \
  https://your-worker.workers.dev/admin/config

# 4. Test each provider individually
for provider in $(cat providers.json | jq -r '.[].name'); do
  echo "Testing $provider..."
  # Make test request to each
done

# 5. Check if model mapping is correct
# Admin panel → Edit provider → Check modelMapping

# 6. Emergency: Clear all provider states to reset cooldowns
npx wrangler kv:key delete "provider-state:openrouter" --binding CONFIG_KV
```

### Issue: Circuit breaker stuck (provider never recovers)

**Symptoms:**
- Provider consistently skipped even though it should be working
- `cooldownUntil` timestamp in the future

**Causes:**
- Clock skew between client and server
- Provider state corrupted
- Excessive consecutive failures

**Fix:**
```bash
# 1. Check current provider state
npx wrangler kv:key get "provider-state:PROVIDER_NAME" --binding CONFIG_KV

# 2. Delete the state to force reset
npx wrangler kv:key delete "provider-state:PROVIDER_NAME" --binding CONFIG_KV

# 3. Or update cooldown to expire immediately
npx wrangler kv:key put "provider-state:PROVIDER_NAME" \
  '{"consecutiveFailures":0,"lastFailure":null,"lastSuccess":1715432100000,"cooldownUntil":null}' \
  --binding CONFIG_KV
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

### Reset All Circuit Breaker States

If all providers are stuck in cooldown:

```bash
# List all provider state keys
npx wrangler kv:key list --binding CONFIG_KV | grep "provider-state"

# Delete each one (repeat for each provider)
npx wrangler kv:key delete "provider-state:openrouter" --binding CONFIG_KV
npx wrangler kv:key delete "provider-state:bedrock" --binding CONFIG_KV
# ... etc
```

---

## Maintenance Tasks

### Monthly Checklist

- [ ] Review Worker logs for errors
- [ ] Verify all configured providers are still operational
- [ ] Test admin panel access with current token
- [ ] Backup current configuration
- [ ] Check Anthropic API status page
- [ ] Review circuit breaker states for stuck providers

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

### Circuit Breaker Tuning

Adjust cooldown settings via admin panel:

1. Access `/admin?token=YOUR_TOKEN`
2. Go to **Settings** section
3. Adjust **Max Circuit Breaker Cooldown** (default: 300s)

Tiered cooldowns are calculated automatically:
- < 3 failures: 0s
- 3-4 failures: min(30s, maxCooldown)
- 5-9 failures: min(60s, maxCooldown)
- 10+ failures: min(300s, maxCooldown)

---

## Emergency Contacts

- Anthropic API Status: https://status.anthropic.com
- Cloudflare Status: https://www.cloudflarestatus.com
- Repository Issues: https://github.com/broven/claude-code-fallback/issues

## Support

For issues, questions, or deployment help:
1. Check this runbook
2. Review logs: `npm run tail`
3. Check provider states in KV
4. Open a GitHub issue with error details

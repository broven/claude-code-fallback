# Migration Notes: Node.js → Cloudflare Workers

This document tracks the migration from the original Node.js fallback proxy to the Cloudflare Workers version.

## Version History

- **v0.2.0** (Feb 2025) — Cloudflare Workers with KV-based configuration management
- **v0.1.0** (Jan 2025) — Original Node.js CLI version

## Major Changes

### Platform Migration

| Aspect | v0.1.0 (Node.js) | v0.2.0 (Workers) |
|--------|------------------|------------------|
| **Runtime** | Node.js CLI | Cloudflare Workers (global) |
| **Deployment** | `launchd` / `systemd` daemon | Managed by Cloudflare |
| **Configuration** | YAML file on disk | Cloudflare KV + web panel |
| **Database** | SQLite (request logging) | Removed (use KV + logs) |
| **Authentication** | None (CLI-based) | Token-based admin panel |
| **Scaling** | Single machine | Global automatic scaling |

### Code Structure

**Removed (Node.js specific):**
- `src/cli.ts` — CLI entry point
- `src/commands/` — CLI subcommands
- `src/daemon/` — Daemon management (launchd, systemd)
- `src/db.ts` — SQLite logging
- `src/logger.ts` — File-based logging
- `src/middleware/logging.ts` — Request logging middleware
- `src/utils/paths.ts` — File system path management

**New (Workers-specific):**
- `src/admin.ts` — Web-based configuration UI
- `src/types.ts` — Cloudflare bindings types
- `wrangler.jsonc` — Workers configuration

**Preserved (platform-independent):**
- Core fallback logic (`src/index.ts:18-150`)
- Provider request logic (`src/utils/provider.ts`)
- Header filtering (`src/utils/headers.ts`)
- Configuration types (`ProviderConfig`, `AppConfig`)

### Dependencies

**Removed:**
- `@hono/node-server` — Node.js HTTP server
- `better-sqlite3` — SQLite database
- `commander` — CLI framework
- `dotenv` — Environment file loading

**Added:**
- `@cloudflare/workers-types` — TypeScript types for Workers

**Kept:**
- `hono` — Framework (unchanged, fully compatible)
- `typescript` — Type checking (unchanged)

## Configuration Migration

### Old Approach (v0.1.0)

Store `providers.yaml` in `~/.claude-code-fallback/providers.yaml`:

```yaml
debug: true
providers:
  - name: openrouter
    baseUrl: https://openrouter.ai/api/v1/chat/completions
    apiKey: sk-xxx
```

Set `ANTHROPIC_BASE_URL=http://127.0.0.1:3000` in shell.

### New Approach (v0.2.0)

Store JSON array in Cloudflare KV under key `providers`:

```json
[
  {
    "name": "openrouter",
    "baseUrl": "https://openrouter.ai/api/v1/chat/completions",
    "apiKey": "sk-xxx"
  }
]
```

Manage via web UI: `https://your-worker.dev/admin?token=TOKEN`

Set `ANTHROPIC_BASE_URL=https://your-worker.dev` in Claude Code settings.

## Deployment Changes

### Old (v0.1.0)

```bash
# Install as daemon
claude-code-fallback start

# View status
claude-code-fallback status

# Stop daemon
claude-code-fallback stop

# Configure shell
claude-code-fallback setup
```

### New (v0.2.0)

```bash
# Create KV namespace
npx wrangler kv:namespace create CONFIG

# Set secret token
npx wrangler secret put ADMIN_TOKEN

# Deploy to Cloudflare
npm run deploy

# View logs
npm run tail
```

## Feature Comparison

| Feature | v0.1.0 | v0.2.0 | Notes |
|---------|--------|--------|-------|
| Fallback routing | ✅ | ✅ | Core logic identical |
| Model mapping | ✅ | ✅ | Same config format |
| Custom headers | ✅ | ✅ | Per-provider support |
| Configuration UI | ❌ | ✅ | New web-based admin |
| Request logging | ✅ | ❌ | Use Wrangler tail instead |
| Local daemon | ✅ | ❌ | Managed by Cloudflare |
| Multi-machine | ❌ | ✅ | Automatic global distribution |
| Cost | Server fees | Pay-per-request | Cloudflare pricing |

## Migration Path for Existing Users

If you were using v0.1.0:

### 1. Export Configuration

From your `~/.claude-code-fallback/providers.yaml`, note your providers.

### 2. Deploy v0.2.0

```bash
git clone https://github.com/broven/claude-code-fallback.git
cd claude-code-fallback
npm install
npx wrangler kv:namespace create CONFIG
npx wrangler secret put ADMIN_TOKEN
npm run deploy
```

### 3. Restore Configuration

Visit admin panel: `https://your-worker.dev/admin?token=TOKEN`

Manually re-add providers (or use API):

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{"name":"openrouter","baseUrl":"...","apiKey":"..."}]' \
  https://your-worker.dev/admin/config
```

### 4. Update Claude Code Settings

Change `ANTHROPIC_BASE_URL` from `http://127.0.0.1:3000` to `https://your-worker.dev`

### 5. Cleanup (Optional)

```bash
# Stop old daemon
claude-code-fallback stop

# Remove old config (after backup)
rm -rf ~/.claude-code-fallback
```

## What's Not Supported in v0.2.0

- **Request logging to database** — Use Wrangler `npm run tail` instead
- **File-based debug logs** — Check Wrangler logs
- **Daemon mode** — Workers are always running (no startup cost)
- **Multiple machine coordination** — Workers handle this automatically
- **Custom port** — Workers assigns public URL

## Performance Differences

### v0.1.0 (Node.js)
- Latency: ~100-500ms (depends on machine)
- Cold start: ~1-2 seconds (first request after restart)
- Memory: ~50-100MB
- Cost: Server fees

### v0.2.0 (Workers)
- Latency: ~50-200ms (global edge optimization)
- Cold start: ~5-50ms (Workers already running)
- Memory: <1MB (serverless)
- Cost: $0.50/million requests (free tier: 100k/day)

## Logging Changes

### v0.1.0
```bash
tail -f ~/.claude-code-fallback/debug.log
```

### v0.2.0
```bash
npm run tail
# Or filter:
npm run tail -- --status error
```

## Breaking Changes

1. **Configuration format** — YAML → JSON (in KV)
2. **Admin access** — Not required in v0.1.0 → Required in v0.2.0
3. **Endpoint URL** — `http://127.0.0.1:3000` → `https://your-worker.dev`
4. **Request logging** — Removed (not needed in serverless)
5. **CLI commands** — All removed (managed by Cloudflare)

## Troubleshooting Migration

**Q: Can I run both v0.1.0 and v0.2.0 at the same time?**
A: Yes. Change the port for v0.1.0 or use different machine. Update Claude Code to use correct endpoint.

**Q: How do I migrate configuration automatically?**
A: Write a script to parse YAML and POST to `/admin/config` endpoint. Contribution welcome!

**Q: What about my old request logs?**
A: They're lost in v0.2.0. Export them from SQLite before migration:
```bash
sqlite3 ~/.claude-code-fallback/logs.db "SELECT * FROM requests;" > requests.csv
```

**Q: Is my data secure on Cloudflare KV?**
A: Yes. Cloudflare KV is encrypted at rest and in transit. API keys are stored as secrets (encrypted by Cloudflare).

## See Also

- [RUNBOOK.md](RUNBOOK.md) — Deployment and operations
- [CONTRIB.md](CONTRIB.md) — Development guide
- [ENV-VARS.md](ENV-VARS.md) — Configuration reference
- [GitHub Releases](https://github.com/broven/claude-code-fallback/releases) — Version history

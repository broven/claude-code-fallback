# Claude Code Fallback

A local proxy that automatically falls back to alternative API providers when the Anthropic API is unavailable (rate limits, outages, auth errors).

## How It Works

```
Claude Code ──► Fallback Proxy ──► Anthropic API
                     │                   ✗ 429/403/5xx
                     │
                     └──► Provider 1 ──► Provider 2 ──► ...
```

The proxy sits between Claude Code and the Anthropic API. If the primary API returns an error eligible for fallback (401, 403, 429, or 5xx), requests are forwarded to your configured fallback providers in order until one succeeds.

## Quick Start

```bash
# Install globally
npm install -g claude-code-fallback

# First run — creates config at ~/.claude-code-fallback/providers.yaml
claude-code-fallback

# Edit config with your fallback provider(s)
nano ~/.claude-code-fallback/providers.yaml

# Start the proxy
claude-code-fallback

# Configure Claude Code to use the proxy
claude-code-fallback setup
```

After running `setup`, reload your shell (`source ~/.zshrc` or `source ~/.bashrc`) and launch Claude Code as usual.

## Configuration

Config file: `~/.claude-code-fallback/providers.yaml`

Override location with `--config <path>` or `CLAUDE_CODE_FALLBACK_CONFIG` env var.

```yaml
# Global options
debug: false

# Logging
logging:
  enabled: true
  logResponseBody: true
  dbPath: ~/.claude-code-fallback/logs.db
  maxSavedMessages: 1000

# Fallback providers (tried in order)
providers:
  - name: "openrouter"
    baseUrl: "https://openrouter.ai/api/v1/messages"
    apiKey: "sk-or-..."
    authHeader: "Authorization"      # Default: x-api-key
    headers:                          # Optional extra headers
      X-Title: "Claude Code Fallback"
    modelMapping:                     # Optional model name translation
      claude-sonnet-4-20250514: "anthropic/claude-sonnet-4"
      claude-3-5-haiku-20241022: "anthropic/claude-3.5-haiku"
```

### Provider Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Display name for logging |
| `baseUrl` | Yes | API endpoint URL |
| `apiKey` | Yes | Authentication key |
| `authHeader` | No | Header name for auth (default: `x-api-key`) |
| `headers` | No | Additional headers to send |
| `modelMapping` | No | Map model names to provider-specific IDs |

## CLI Reference

```
claude-code-fallback [command] [options]

Commands:
  serve   (default)  Start proxy in foreground
  start              Start proxy as background daemon
  stop               Stop the background daemon
  status             Show daemon status
  setup              Add env vars to shell profile

Options:
  -p, --port <port>     Port to listen on (default: 3000)
  -c, --config <path>   Path to providers.yaml
  -V, --version         Show version
  -h, --help            Show help
```

### Examples

```bash
# Foreground on custom port
claude-code-fallback serve --port 8080

# Background daemon
claude-code-fallback start
claude-code-fallback status
claude-code-fallback stop
```

## Daemon

The `start` command installs a platform-native daemon that keeps the proxy running in the background and restarts it on failure.

### macOS (launchd)

Creates a LaunchAgent plist at `~/Library/LaunchAgents/com.github.broven.claude-code-fallback.plist`. The service is configured with `RunAtLoad` and `KeepAlive` enabled.

Logs:
- `~/.claude-code-fallback/daemon-stdout.log`
- `~/.claude-code-fallback/daemon-stderr.log`

### Linux (systemd)

Creates a user service at `~/.config/systemd/user/claude-code-fallback.service`. Enabled with `systemctl --user`.

Logs: `journalctl --user -u claude-code-fallback`

## Logging & Debugging

Request logs are stored in a SQLite database at `~/.claude-code-fallback/logs.db`. Each request records the model, provider used, response status, timing, and whether fallback was triggered.

Enable debug mode in your config to get verbose file logging:

```yaml
debug: true
```

Debug logs are written to `~/.claude-code-fallback/debug.log`.

## Troubleshooting

**Proxy returns 502 for all requests**
Check that at least one provider is configured with a valid API key.

**Claude Code doesn't use the proxy**
Run `claude-code-fallback setup` and reload your shell. Verify with:
```bash
echo $ANTHROPIC_BASE_URL  # Should be http://127.0.0.1:3000
```

**Fallback not triggering**
Only 401, 403, 429, and 5xx errors trigger fallback. 400 errors (bad request) are returned directly since they indicate a client-side issue.

**Daemon won't start**
Check logs in `~/.claude-code-fallback/daemon-stderr.log` (macOS) or `journalctl --user -u claude-code-fallback` (Linux).

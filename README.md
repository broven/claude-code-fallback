# Claude Code Fallback Proxy
# 尝试结论
- 根据openrouter的描述，应该会有x-api-key header来携带订阅信息，发现并没有，暂时搁置

This is a local proxy server that allows Claude Code (or any Anthropic SDK client) to fallback to OpenRouter when your primary Anthropic API subscription runs out of credits or hits rate limits.

## How it works
export ANTHROPIC_BASE_URL="http://127.0.0.1:3000"
export ANTHROPIC_AUTH_TOKEN="testkey"
export ANTHROPIC_API_KEY="" # Important: Must be explicitly empty

If you have a Claude subscription, you can use it for Anthropic models.

When you use Claude Code and have a Claude subscription, Claude Code automatically sends your subscription token via the x-api-key header. OpenRouter detects this and routes accordingly:

Anthropic models (Claude Sonnet, Opus, Haiku) → Routed using your Claude subscription
Fallback → If your Claude subscription limits are reached, requests automatically fall back to other provider.

Auth Errors: Ensure ANTHROPIC_API_KEY is set to an empty string (""). If it is unset (null), Claude Code might fall back to its default behavior and try to authenticate with Anthropic servers.


## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment**:
   Copy `.env.example` to `.env` and add your OpenRouter API Key:
   ```bash
   cp .env.example .env
   # Edit .env and set OPENROUTER_API_KEY
   ```

3. **Start the Proxy**:
   ```bash
   npm start
   # Or using tsx directly:
   npx tsx src/index.ts
   ```

## Using with Claude Code

Once the proxy is running on `http://localhost:3000`, configure Claude Code to use it:

```bash
export ANTHROPIC_BASE_URL=http://localhost:3000
export ANTHROPIC_API_KEY=""
export ANTHROPIC_AUTH_TOKEN="sksksksksksksksksk"
```

Then run Claude Code as usual:

```bash
claude
```

## Deployment

This project uses Hono, so it can be easily deployed to:
- Cloudflare Workers
- Vercel Edge
- Deno Deploy
- Any Node.js server (as configured currently)

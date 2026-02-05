# Documentation Index

Complete documentation for Claude Code Fallback Proxy (Cloudflare Workers version).

## Getting Started

- **[README.md](../README.md)** — Project overview, features, quick start, and configuration examples
- **[CLAUDE.md](../CLAUDE.md)** — Development guidance and project architecture

## For Developers

- **[CONTRIB.md](CONTRIB.md)** — Development workflow, local setup, testing procedures, and code guidelines
- **[SCRIPTS.md](SCRIPTS.md)** — Available npm scripts and usage examples

## For Operators

- **[RUNBOOK.md](RUNBOOK.md)** — Deployment procedures, monitoring, troubleshooting, and rollback procedures
- **[ENV-VARS.md](ENV-VARS.md)** — Complete reference for all environment variables and secrets management

## API Documentation

### Proxy Endpoint

**POST** `/v1/messages`

Standard Anthropic API compatible endpoint. Routes to Anthropic API first, then fallback providers on error.

### Admin Endpoints

**GET** `/admin?token=TOKEN`
- Admin panel UI (HTML form for managing providers)

**GET** `/admin/config?token=TOKEN`
- Get current configuration as JSON array

**POST** `/admin/config?token=TOKEN`
- Update configuration
- Body: JSON array of provider configs

**GET** `/`
- Health check endpoint
- Returns: Plain text with provider count

## Architecture

- **Language**: TypeScript with Hono framework
- **Platform**: Cloudflare Workers
- **Storage**: Cloudflare KV for configurations
- **Authentication**: Token-based admin access

### File Structure

```
src/
├── index.ts           Main Worker entry point and routes
├── admin.ts           Admin panel UI and API handlers
├── config.ts          KV configuration management
├── types.ts           TypeScript type definitions
└── utils/
    ├── headers.ts     HTTP header utilities
    └── provider.ts    Provider request logic

docs/
├── CONTRIB.md         Development guide
├── SCRIPTS.md         npm script reference
├── RUNBOOK.md         Operations guide
├── ENV-VARS.md        Environment variables reference
└── INDEX.md           This file

wrangler.jsonc        Cloudflare Workers configuration
package.json          Node.js dependencies
README.md             User-facing documentation
```

## Quick Reference

### Development

```bash
npm run dev          # Start local dev server
npm run deploy       # Deploy to Cloudflare
npm run tail         # Stream production logs
npx tsc --noEmit     # Type check
```

### Admin Panel

```
https://your-worker.workers.dev/admin?token=YOUR_TOKEN
```

### Configuration

- **Store**: Cloudflare KV namespace `CONFIG_KV`
- **Key**: `providers`
- **Format**: JSON array of provider configs
- **Auth**: `ADMIN_TOKEN` environment variable

## Common Tasks

### Add a Fallback Provider

1. Visit admin panel: `/admin?token=TOKEN`
2. Click "Add Provider"
3. Fill in: Name, Base URL, API Key, Auth Header
4. Click "Save"

### Update Provider Configuration

1. Access admin panel
2. Edit existing provider or add new one
3. Changes saved immediately to KV

### Monitor Production

```bash
npm run tail
# Filter for errors:
npm run tail -- --status error
```

### Debug Fallback Issues

1. Check logs: `npm run tail`
2. Verify configuration: `/admin/config?token=TOKEN`
3. Test provider directly with curl
4. Enable debug mode: `DEBUG=true`

### Backup Configuration

```bash
curl -H "Authorization: Bearer TOKEN" \
  https://your-worker.workers.dev/admin/config > backup.json
```

## Troubleshooting Guide

For issues and solutions, see:
- **[RUNBOOK.md](RUNBOOK.md)** — Common issues and fixes
- **[CONTRIB.md](CONTRIB.md)** — Development troubleshooting
- GitHub Issues: https://github.com/broven/claude-code-fallback/issues

## Support

- **Report Bugs**: [GitHub Issues](https://github.com/broven/claude-code-fallback/issues)
- **Questions**: Create a discussion or issue with `[question]` label
- **Security**: Report security issues privately to project maintainers

## Version

Current: 0.2.0 (Cloudflare Workers)
Previous: 0.1.0 (Node.js CLI)

See git history for migration details.

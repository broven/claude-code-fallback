# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Start Server**: `npm start` (Runs `src/index.ts` via `tsx` on port 3000)
- **Run Tests**: `npm test` (Runs end-to-end tests in `test/e2e.ts`)
- **Type Check**: `npx tsc --noEmit`
- **Run Single File**: `npx tsx <path/to/file.ts>`

## Architecture

This project is a fallback proxy for Claude Code/Anthropic SDKs. It intercepts requests to the Anthropic API and forwards them to alternative providers (like OpenRouter) if the primary request fails with specific error codes (401, 403, 429, 5xx).

- **Framework**: Built with [Hono](https://hono.dev/) for Node.js (`@hono/node-server`).
- **Entry Point**: `src/index.ts` initializes the server and handles the `/v1/messages` route.
- **Fallback Logic**:
  - Tries primary Anthropic API first.
  - If it fails (429/403/etc), iterates through providers defined in `providers.yaml`.
  - `src/config.ts` loads and parses the YAML configuration.

## Configuration

- **Providers**: Defined in `providers.yaml` (or path in `PROVIDERS_CONFIG_PATH`).
- **Format**: Array of objects with `name`, `baseUrl`, `apiKey`, and optional `modelMapping`.
- **Environment**:
  - `PORT`: Server port (default 3000)
  - `ANTHROPIC_BASE_URL`: Primary API URL (default https://api.anthropic.com/v1/messages)

## Testing

- `test/e2e.ts` orchestrates the test suite.
- Spawns the proxy server and a mock server (`test/mock-server.ts`) in child processes.
- Validates behavior by sending requests to the proxy and verifying responses match the mock scenarios.

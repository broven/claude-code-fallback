# Contributing Guide

## Development Workflow

### 1. Setup

Clone the repository:
```bash
git clone https://github.com/broven/claude-code-fallback.git
cd claude-code-fallback
```

Install dependencies:
```bash
npm install
```

### 2. Local Development

Start the local dev server:
```bash
npm run dev
```

This starts Wrangler on `http://localhost:8787` with:
- KV namespace simulation for local testing
- Hot reload on file changes

Access the admin panel:
```
http://localhost:8787/admin?token=123456
```

### 3. Configuration

For local development, environment variables are loaded from the system. The default `.env` file contains:

```
ADMIN_TOKEN=123456
```

For testing with different tokens:
```bash
ADMIN_TOKEN=test-token npm run dev
```

### 4. Code Structure

- **`src/index.ts`** — Main Worker entry point, request routing
- **`src/admin.ts`** — Admin panel UI and API endpoints
- **`src/config.ts`** — KV storage operations
- **`src/types.ts`** — TypeScript type definitions
- **`src/utils/`** — Utility functions (header filtering, provider requests)

### 5. Testing

#### Type Checking

```bash
npx tsc --noEmit
```

Verify TypeScript compilation before committing.

#### Manual Testing

1. Start dev server: `npm run dev`
2. Test admin panel: Visit `/admin?token=123456`
3. Test proxy:
   ```bash
   curl -X POST http://localhost:8787/v1/messages \
     -H "x-api-key: test" \
     -H "Content-Type: application/json" \
     -d '{"model":"claude-3-opus","messages":[{"role":"user","content":"hi"}]}'
   ```

#### KV Testing

Local KV testing is simulated by Wrangler. Changes are stored in-memory during `npm run dev`.

To test with real KV after deployment:
```bash
npm run tail
# Then make requests to the deployed Worker
```

### 6. Code Style

This project uses:
- **TypeScript** with strict mode enabled
- **ESM** modules (`type: "module"` in package.json)
- **Hono** framework conventions

Guidelines:
- Use async/await for asynchronous operations
- Prefer const over let; avoid var
- Add console.log prefixes: `[Proxy]`, `[Config]`, `[Admin]` for debugging
- Keep functions focused and testable

### 7. Making Changes

1. Create a branch:
   ```bash
   git checkout -b feature/your-feature
   ```

2. Make changes and test locally:
   ```bash
   npm run dev
   npx tsc --noEmit
   ```

3. Commit with descriptive messages:
   ```bash
   git commit -m "feat: add support for custom headers"
   ```

4. Push and create a pull request:
   ```bash
   git push origin feature/your-feature
   ```

### 8. Common Development Tasks

#### Adding a New Endpoint

1. Define types in `src/types.ts`
2. Add route handler in `src/index.ts`
3. Test with curl or Postman

#### Modifying Provider Logic

1. Update `src/utils/provider.ts`
2. Test with different provider configurations
3. Verify model mapping works correctly

#### Updating Admin Panel

1. Modify HTML in `src/admin.ts`
2. Update API handlers in the same file
3. Test form submission and data persistence to KV

### 9. Debugging

Enable debug mode:
```bash
DEBUG=true npm run dev
```

This adds debug logging to:
- Incoming requests
- Configuration loading
- Provider attempts

View production logs:
```bash
npm run tail
```

Filter logs (Wrangler supports grep):
```bash
npm run tail -- --status error
```

### 10. Performance Considerations

- **Timeout**: Workers have 30-second max execution time
- **KV Latency**: Local KV is instant; production KV is <100ms typically
- **Response Size**: No specific limits, but keep under 1MB for best performance
- **Header Size**: Total request/response headers should stay under 64KB

## Pre-Deployment Checklist

- [ ] Type check: `npx tsc --noEmit`
- [ ] Tested locally: `npm run dev`
- [ ] Admin panel works: `/admin?token=123456`
- [ ] Proxy endpoint tested
- [ ] No console errors
- [ ] Updated documentation if needed
- [ ] Committed with clear message

## Troubleshooting Development

| Issue | Solution |
|-------|----------|
| Port 8787 already in use | Change in `wrangler.jsonc` or kill existing process |
| KV not persisting | Wrangler clears local KV on restart; redeploy config |
| Type errors after npm install | Run `npm install` again, restart editor |
| Admin panel shows 401 | Token mismatch; use default `123456` for dev |
| Timeout errors | Check provider endpoints are responding; increase test timeout |

## Questions?

Open an issue on [GitHub](https://github.com/broven/claude-code-fallback/issues)

# Available Scripts

This document describes all npm scripts available in the project.

## Development Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `wrangler dev` | Start local Cloudflare Workers development server on port 8787 |
| `deploy` | `wrangler deploy` | Deploy to production Cloudflare Workers |
| `tail` | `wrangler tail` | Stream live logs from production Cloudflare Workers |
| `test` | `vitest run` | Run test suite once |
| `test:watch` | `vitest` | Run tests in watch mode (reruns on file changes) |
| `test:coverage` | `vitest run --coverage` | Run tests with coverage report (requires 80%+ coverage) |

## TypeScript

Type checking is performed via the TypeScript compiler:

```bash
npx tsc --noEmit
```

Run before committing to ensure type safety.

## Usage Examples

### Local Development

```bash
npm run dev
# Access at http://localhost:8787
# Admin panel: http://localhost:8787/admin?token=123456
```

### Deploy Changes

```bash
npm run deploy
# Deploys current branch to Cloudflare Workers
```

### Monitor Production

```bash
npm run tail
# Shows real-time logs from production Workers
# Press Ctrl+C to exit
```

### Type Check

```bash
npx tsc --noEmit
# Exit 0 if all types are valid
# Exit 1 if type errors found
```

### Run Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode (useful during development)
npm run test:watch

# Run with coverage report
npm run test:coverage
# Generates coverage/ directory with detailed HTML report
```

## Pre-Commit Checks

Before committing code:

```bash
# 1. Run tests
npm test

# 2. Type check
npx tsc --noEmit

# 3. Run locally to verify
npm run dev &
# Test the admin panel and proxy endpoints
kill %1

# 4. Commit changes
git add .
git commit -m "message"
```

## CI/CD Integration

These scripts can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Run Tests
  run: npm test

- name: Test Coverage
  run: npm run test:coverage

- name: Type Check
  run: npx tsc --noEmit

- name: Deploy
  run: npm run deploy
  if: github.ref == 'refs/heads/main'
```

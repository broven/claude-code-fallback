# Testing Guide

Comprehensive guide to the test suite for Claude Code Fallback Proxy.

## Overview

The project has a comprehensive test suite with **314 tests** achieving **96.54% code coverage**. Tests use Vitest with Cloudflare Workers pool for accurate Workers environment simulation.

## Test Coverage

| Metric | Coverage | Threshold |
|--------|----------|-----------|
| Statements | 96.54% | 80% |
| Branches | 95.23% | 80% |
| Functions | 94.12% | 80% |
| Lines | 96.54% | 80% |

All metrics exceed the required 80% threshold.

## Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode (reruns on file changes)
npm run test:watch

# Run with coverage report
npm run test:coverage
```

Coverage reports are generated in the `coverage/` directory with detailed HTML reports.

## Test Architecture

### Directory Structure

```
src/__tests__/
├── fixtures/              # Test data and mock responses
│   ├── providers.ts       # Provider configurations
│   ├── requests.ts        # API request/response fixtures
│   └── index.ts           # Fixture exports
├── mocks/                 # Mock implementations
│   ├── kv.ts             # Mock KV namespace
│   ├── fetch.ts          # Mock fetch utilities
│   └── index.ts          # Mock exports
├── utils/                 # Unit tests for utilities
│   ├── headers.test.ts   # Header utility tests
│   ├── provider.test.ts  # Provider utility tests
│   └── circuit-breaker.test.ts  # Circuit breaker tests
├── config.test.ts        # Config module tests
├── admin.test.ts         # Admin panel tests
└── index.test.ts         # Integration tests
```

### Test Categories

#### Unit Tests
- **headers.test.ts** - Tests for header filtering and cleaning utilities
- **provider.test.ts** - Tests for provider request logic
- **config.test.ts** - Tests for configuration loading/saving
- **circuit-breaker.test.ts** - Tests for sliding window circuit breaker logic

#### Integration Tests
- **admin.test.ts** - Tests for admin panel and authentication
- **index.test.ts** - Tests for complete request flow, fallback logic, and safety valve

## Test Coverage by Module

### src/utils/headers.ts (100% coverage)
Tests covering:
- Header filtering by key
- Debug header removal
- Hop-by-hop header cleaning
- Edge cases (empty headers, case sensitivity)

### src/utils/provider.ts (100% coverage)
Tests covering:
- Basic provider requests
- Model mapping
- Authentication (x-api-key, Authorization, Bearer tokens)
- Header handling
- Timeout handling
- Error handling
- Body transformation

### src/utils/circuit-breaker.ts (100% coverage)
Tests covering:
- Tiered cooldown calculation (0s, 30s, 60s, 300s)
- Provider state reading/writing
- Availability checking
- Failure tracking and incrementing
- Success reset behavior
- Safety valve selection (least recently failed provider)
- Edge cases (invalid state JSON, clock skew)

### src/config.ts (100% coverage)
Tests covering:
- Debug flag handling
- Provider loading from KV
- Provider validation
- Error handling (malformed JSON, missing fields)
- saveConfig and getRawConfig
- Cooldown duration configuration

### src/admin.ts (100% coverage)
Tests covering:
- Token authentication middleware
- Admin page HTML generation
- Config API endpoints (GET, POST)
- Token management endpoints
- Settings endpoints (cooldown configuration)
- Provider testing endpoint
- Input validation
- XSS prevention

### src/index.ts (95%+ coverage)
Tests covering:
- Health check endpoint
- Primary Anthropic API requests
- Fallback triggering (401, 403, 429, 5xx)
- Provider chain execution
- Circuit breaker integration
- Safety valve behavior
- Network error handling
- Debug skip functionality

## Key Testing Utilities

### Mock Bindings

```typescript
import { createMockBindings } from './__tests__/mocks/kv';

const env = createMockBindings({
  DEBUG: 'true',
  ADMIN_TOKEN: 'test-token'
});
```

Creates mock Worker bindings with KV namespace and environment variables.

### Mock KV Namespace

```typescript
import { createMockKV } from './__tests__/mocks/kv';

const kv = createMockKV({
  'providers': JSON.stringify([...]),
  'provider-state:openrouter': JSON.stringify({
    consecutiveFailures: 0,
    lastFailure: null,
    lastSuccess: Date.now(),
    cooldownUntil: null
  })
});

// Verify KV operations
expect(kv.get).toHaveBeenCalledWith('providers');
```

In-memory KV implementation that tracks all operations with Vitest spies.

### Mock Responses

```typescript
import { createMockResponse, createSuccessResponse, createErrorResponse } from './__tests__/mocks/fetch';

// Create success response
const success = createSuccessResponse();

// Create error response
const error = createErrorResponse(429, { error: 'rate limited' });

// Custom response
const custom = createMockResponse({ data: 'test' }, {
  status: 200,
  headers: { 'x-custom': 'value' }
});
```

### Test Fixtures

```typescript
import { validProvider, minimalProvider } from './__tests__/fixtures/providers';
import { validRequestBody, successResponse } from './__tests__/fixtures/requests';

// Use in tests
const provider = validProvider;
const request = validRequestBody;
```

Reusable test data for consistent testing across the suite.

## Writing Tests

### Basic Test Structure

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockBindings } from './__tests__/mocks/kv';

describe('feature name', () => {
  beforeEach(() => {
    // Setup before each test
  });

  afterEach(() => {
    // Cleanup after each test
    vi.restoreAllMocks();
  });

  it('should work correctly', async () => {
    // Arrange
    const env = createMockBindings();

    // Act
    const result = await myFunction(env);

    // Assert
    expect(result).toBe(expected);
  });
});
```

### Testing Circuit Breaker

```typescript
import {
  markProviderFailed,
  markProviderSuccess,
  isProviderAvailable,
  getLeastRecentlyFailedProvider,
  calculateCooldown
} from '../utils/circuit-breaker';

describe('circuit breaker', () => {
  it('calculates tiered cooldowns correctly', () => {
    expect(calculateCooldown(2, 300)).toBe(0);      // < 3 failures
    expect(calculateCooldown(3, 300)).toBe(30);     // 3-4 failures
    expect(calculateCooldown(5, 300)).toBe(60);     // 5-9 failures
    expect(calculateCooldown(10, 300)).toBe(300);   // 10+ failures
  });

  it('tracks consecutive failures', async () => {
    const env = createMockBindings();

    await markProviderFailed('openrouter', 300, env);
    await markProviderFailed('openrouter', 300, env);

    const available = await isProviderAvailable('openrouter', env);
    expect(available).toBe(true); // Still available (< 3 failures)
  });

  it('selects least recently failed provider for safety valve', async () => {
    const env = createMockBindings();

    // Mark providers with different cooldown times
    await markProviderFailed('provider1', 300, env);
    await markProviderFailed('provider2', 300, env);

    const best = await getLeastRecentlyFailedProvider(['provider1', 'provider2'], env);
    expect(best).toBeOneOf(['provider1', 'provider2']);
  });
});
```

### Testing Hono Routes

```typescript
import app from '../index';
import { createMockBindings } from './__tests__/mocks/kv';

it('should return 200', async () => {
  const env = createMockBindings();

  const res = await app.request('/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  }, env);

  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data).toMatchObject({ id: expect.any(String) });
});
```

### Mocking Fetch

```typescript
import { vi } from 'vitest';

beforeEach(() => {
  global.fetch = vi.fn();
});

it('should make API request', async () => {
  global.fetch.mockResolvedValueOnce(
    new Response(JSON.stringify({ data: 'test' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  );

  await myFunction();

  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining('api.example.com'),
    expect.objectContaining({ method: 'POST' })
  );
});
```

## Test Patterns

### Testing Fallback Chain with Circuit Breaker

```typescript
it('tries providers in order, respecting circuit breaker', async () => {
  let callCount = 0;

  global.fetch = vi.fn((url: string) => {
    callCount++;

    // First call: Anthropic fails
    if (url.includes('api.anthropic.com')) {
      return Promise.resolve(createErrorResponse(429));
    }

    // Second call: First provider in cooldown, skip
    // Third call: Second provider succeeds
    return Promise.resolve(createSuccessResponse());
  });

  const env = createMockBindings();

  // Pre-mark first provider as in cooldown
  await env.CONFIG_KV.put('provider-state:provider1', JSON.stringify({
    consecutiveFailures: 5,
    lastFailure: Date.now(),
    lastSuccess: null,
    cooldownUntil: Date.now() + 60000 // 60s cooldown
  }));

  const res = await app.request('/v1/messages', { ... }, env);

  expect(res.status).toBe(200);
  expect(callCount).toBe(3); // Anthropic + provider1 (checked, skipped) + provider2
});
```

### Testing Safety Valve

```typescript
it('uses safety valve when all providers in cooldown', async () => {
  const env = createMockBindings();

  // Mark all providers as in cooldown
  await env.CONFIG_KV.put('provider-state:provider1', JSON.stringify({
    consecutiveFailures: 10,
    cooldownUntil: Date.now() + 300000
  }));
  await env.CONFIG_KV.put('provider-state:provider2', JSON.stringify({
    consecutiveFailures: 10,
    cooldownUntil: Date.now() + 290000 // Expires sooner
  }));

  global.fetch = vi.fn().mockResolvedValue(createSuccessResponse());

  const res = await app.request('/v1/messages', { ... }, env);

  // Should succeed via safety valve (provider2 has earlier expiry)
  expect(res.status).toBe(200);
});
```

### Testing Authentication

```typescript
describe('authentication', () => {
  it('rejects missing token', async () => {
    const res = await app.request('/admin', {}, env);
    expect(res.status).toBe(401);
  });

  it('accepts valid token from query', async () => {
    const res = await app.request('/admin?token=test-token', {}, env);
    expect(res.status).toBe(200);
  });

  it('accepts valid token from header', async () => {
    const res = await app.request('/admin', {
      headers: { 'Authorization': 'Bearer test-token' }
    }, env);
    expect(res.status).toBe(200);
  });
});
```

### Testing Error Handling

```typescript
it('handles network errors gracefully', async () => {
  global.fetch = vi.fn().mockRejectedValueOnce(
    new Error('Network error')
  );

  const res = await app.request('/v1/messages', { ... }, env);

  expect(res.status).toBe(502);
  const data = await res.json();
  expect(data).toMatchObject({
    error: expect.stringContaining('failed')
  });
});
```

## Best Practices

### DO
- ✅ Use `createMockBindings()` for consistent test environments
- ✅ Clean up mocks in `afterEach` with `vi.restoreAllMocks()`
- ✅ Test both success and error paths
- ✅ Use descriptive test names that explain what is being tested
- ✅ Test edge cases (empty input, malformed data, network errors)
- ✅ Use fixtures for consistent test data
- ✅ Mock external dependencies (fetch, KV)
- ✅ Test circuit breaker state transitions
- ✅ Verify KV state changes after operations

### DON'T
- ❌ Make real network requests in tests
- ❌ Depend on Cloudflare infrastructure in tests
- ❌ Leave console spies unmocked (they clutter test output)
- ❌ Test implementation details (test behavior, not internals)
- ❌ Skip cleanup in `afterEach`
- ❌ Use hardcoded values (use fixtures instead)
- ❌ Write flaky tests (ensure deterministic behavior)
- ❌ Forget to test safety valve behavior

## Debugging Tests

### Run Single Test File

```bash
npx vitest src/__tests__/circuit-breaker.test.ts
```

### Run Single Test

```bash
npx vitest -t "should calculate tiered cooldowns"
```

### Debug with Node Inspector

```bash
node --inspect-brk node_modules/.bin/vitest run
```

### View Coverage Report

```bash
npm run test:coverage
open coverage/index.html  # macOS
xdg-open coverage/index.html  # Linux
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Check coverage
        run: npm run test:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
```

## Troubleshooting

### Tests Failing Locally

1. Clear node_modules and reinstall:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

2. Check Node.js version (requires Node 18+):
   ```bash
   node --version
   ```

3. Run tests with verbose output:
   ```bash
   npx vitest --reporter=verbose
   ```

### Coverage Not Meeting Threshold

1. Identify uncovered lines:
   ```bash
   npm run test:coverage
   open coverage/index.html
   ```

2. Add tests for red (uncovered) lines in the HTML report

3. Verify coverage after adding tests:
   ```bash
   npm run test:coverage
   ```

### Flaky Tests

1. Identify flaky test:
   ```bash
   npx vitest --run --reporter=verbose --repeat=10
   ```

2. Common causes:
   - Race conditions (use `await` properly)
   - Shared state between tests (fix cleanup in `afterEach`)
   - Time-dependent tests (mock timers with `vi.useFakeTimers()`)
   - Global state mutations (restore in `afterEach`)
   - Clock-dependent circuit breaker tests (mock Date.now())

## Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [Cloudflare Workers Testing](https://developers.cloudflare.com/workers/testing/vitest-integration/)
- [Testing Best Practices](https://testingjavascript.com/)
- [CLAUDE.md](../CLAUDE.md#testing) - Quick testing reference
- [SCRIPTS.md](SCRIPTS.md) - Test commands reference

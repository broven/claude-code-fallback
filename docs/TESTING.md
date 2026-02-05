# Testing Guide

Comprehensive guide to the test suite for Claude Code Fallback Proxy.

## Overview

The project has a comprehensive test suite with **142 tests** achieving **99%+ code coverage**. Tests use Vitest with Cloudflare Workers pool for accurate Workers environment simulation.

## Test Coverage

| Metric | Coverage | Threshold |
|--------|----------|-----------|
| Statements | 99.28% | 80% |
| Branches | 98.48% | 80% |
| Functions | 94.73% | 80% |
| Lines | 100% | 80% |

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
│   ├── headers.test.ts   # Header utility tests (27 tests)
│   └── provider.test.ts  # Provider utility tests (24 tests)
├── config.test.ts        # Config module tests (29 tests)
├── admin.test.ts         # Admin panel tests (33 tests)
└── index.test.ts         # Integration tests (29 tests)
```

### Test Categories

#### Unit Tests (80 tests)
- **headers.test.ts** - Tests for header filtering and cleaning utilities
- **provider.test.ts** - Tests for provider request logic
- **config.test.ts** - Tests for configuration loading/saving

#### Integration Tests (62 tests)
- **admin.test.ts** - Tests for admin panel and authentication
- **index.test.ts** - Tests for complete request flow and fallback logic

## Test Coverage by Module

### src/utils/headers.ts (100% coverage)
**27 tests** covering:
- Header filtering by key
- Debug header removal
- Hop-by-hop header cleaning
- Edge cases (empty headers, case sensitivity)

### src/utils/provider.ts (100% coverage)
**24 tests** covering:
- Basic provider requests
- Model mapping
- Authentication (x-api-key, Authorization, Bearer tokens)
- Header handling
- Timeout handling
- Error handling
- Body transformation

### src/config.ts (100% coverage)
**29 tests** covering:
- Debug flag handling
- Provider loading from KV
- Provider validation
- Error handling (malformed JSON, missing fields)
- saveConfig and getRawConfig

### src/admin.ts (100% coverage)
**33 tests** covering:
- Token authentication middleware
- Admin page HTML generation
- Config API endpoints (GET, POST)
- Input validation
- XSS prevention

### src/index.ts (98% coverage)
**29 tests** covering:
- Health check endpoint
- Primary Anthropic API requests
- Fallback triggering (401, 403, 429, 5xx)
- Provider chain execution
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
  'providers': JSON.stringify([...])
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

### Testing Fallback Chain

```typescript
it('tries providers in order until success', async () => {
  let callCount = 0;

  global.fetch = vi.fn((url: string) => {
    callCount++;

    // First call: Anthropic fails
    if (url.includes('api.anthropic.com')) {
      return Promise.resolve(createErrorResponse(429));
    }

    // Second call: First provider fails
    if (callCount === 2) {
      return Promise.resolve(createErrorResponse(500));
    }

    // Third call: Second provider succeeds
    return Promise.resolve(createSuccessResponse());
  });

  const res = await app.request('/v1/messages', { ... }, env);

  expect(res.status).toBe(200);
  expect(callCount).toBe(3);
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

### DON'T
- ❌ Make real network requests in tests
- ❌ Depend on Cloudflare infrastructure in tests
- ❌ Leave console spies unmocked (they clutter test output)
- ❌ Test implementation details (test behavior, not internals)
- ❌ Skip cleanup in `afterEach`
- ❌ Use hardcoded values (use fixtures instead)
- ❌ Write flaky tests (ensure deterministic behavior)

## Debugging Tests

### Run Single Test File

```bash
npx vitest src/__tests__/config.test.ts
```

### Run Single Test

```bash
npx vitest -t "should load valid providers"
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

## Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [Cloudflare Workers Testing](https://developers.cloudflare.com/workers/testing/vitest-integration/)
- [Testing Best Practices](https://testingjavascript.com/)
- [CLAUDE.md](../CLAUDE.md#testing) - Quick testing reference
- [SCRIPTS.md](SCRIPTS.md) - Test commands reference

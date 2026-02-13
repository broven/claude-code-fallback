# Admin Circuit Breaker Status Display Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show each provider's circuit breaker state (healthy / in cooldown) and recovery countdown on the admin page.

**Architecture:** Add a new `GET /admin/provider-states` API that reads `provider-state:{name}` KV keys for all providers (including `anthropic-primary`). The admin page JS fetches this on load and renders a status badge + countdown on each provider card. A `setInterval` ticks the countdown every second without re-fetching.

**Tech Stack:** Hono (existing), Cloudflare KV, vanilla JS (matches existing admin page).

---

### Task 1: Add `GET /admin/provider-states` endpoint

**Files:**
- Modify: `src/admin.ts` (add `getProviderStates` handler)
- Modify: `src/index.ts` (register route)

**Step 1: Write the failing test**

Add to `src/__tests__/admin.test.ts`:

```typescript
// At the top, add getProviderStates to the import and to createTestApp

describe("getProviderStates", () => {
  it("returns empty states when no provider state exists in KV", async () => {
    const env = createMockBindings({
      adminToken: "valid-token",
      kvData: {
        providers: JSON.stringify([{ name: "openrouter", baseUrl: "https://example.com", apiKey: "sk-123" }]),
      },
    });
    const app = createTestApp();
    const res = await app.request(
      createRequest("/admin/provider-states", { token: "valid-token" }),
      {},
      env,
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    // Should have anthropic-primary + openrouter
    expect(data).toHaveProperty("anthropic-primary");
    expect(data).toHaveProperty("openrouter");
    expect(data["openrouter"].consecutiveFailures).toBe(0);
    expect(data["openrouter"].cooldownUntil).toBeNull();
  });

  it("returns actual state when provider has failures", async () => {
    const state = {
      consecutiveFailures: 5,
      lastFailure: Date.now(),
      lastSuccess: null,
      cooldownUntil: Date.now() + 60000,
    };
    const env = createMockBindings({
      adminToken: "valid-token",
      kvData: {
        providers: JSON.stringify([{ name: "openrouter", baseUrl: "https://example.com", apiKey: "sk-123" }]),
        "provider-state:openrouter": JSON.stringify(state),
      },
    });
    const app = createTestApp();
    const res = await app.request(
      createRequest("/admin/provider-states", { token: "valid-token" }),
      {},
      env,
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data["openrouter"].consecutiveFailures).toBe(5);
    expect(data["openrouter"].cooldownUntil).toBeGreaterThan(Date.now() - 1000);
  });

  it("requires authentication", async () => {
    const env = createMockBindings({ adminToken: "valid-token" });
    const app = createTestApp();
    const res = await app.request(
      createRequest("/admin/provider-states"),
      {},
      env,
    );
    expect(res.status).toBe(401);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/admin.test.ts`
Expected: FAIL - `getProviderStates` not found / route 404

**Step 3: Write the handler in `src/admin.ts`**

Add at the bottom of admin.ts, before the `escapeHtml` function:

```typescript
/**
 * GET /admin/provider-states - Get circuit breaker state for all providers
 */
export async function getProviderStates(c: Context<{ Bindings: Bindings }>) {
  const config = await getRawConfig(c.env);
  let providers: { name: string }[] = [];
  try {
    providers = JSON.parse(config);
  } catch {
    providers = [];
  }

  // Collect all provider names: anthropic-primary + configured providers
  const names = ['anthropic-primary', ...providers.map((p) => p.name)];

  const states: Record<string, ProviderState> = {};
  for (const name of names) {
    const key = `provider-state:${name}`;
    const raw = await c.env.CONFIG_KV.get(key);
    if (raw) {
      try {
        states[name] = JSON.parse(raw);
      } catch {
        states[name] = { consecutiveFailures: 0, lastFailure: null, lastSuccess: null, cooldownUntil: null };
      }
    } else {
      states[name] = { consecutiveFailures: 0, lastFailure: null, lastSuccess: null, cooldownUntil: null };
    }
  }

  return c.json(states);
}
```

Add `ProviderState` to the import from `./types` at the top of `admin.ts`.

**Step 4: Register route in `src/index.ts`**

Add to imports:
```typescript
import { ..., getProviderStates } from "./admin";
```

Add route after the existing admin routes:
```typescript
app.get("/admin/provider-states", authMiddleware, getProviderStates);
```

**Step 5: Update `createTestApp` in `src/__tests__/admin.test.ts`**

Add `getProviderStates` to the import and add the route to `createTestApp`:
```typescript
app.get("/admin/provider-states", authMiddleware, getProviderStates);
```

**Step 6: Run tests to verify they pass**

Run: `npm test -- src/__tests__/admin.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add src/admin.ts src/index.ts src/__tests__/admin.test.ts
git commit -m "feat: add GET /admin/provider-states endpoint"
```

---

### Task 2: Add CSS for circuit breaker status badges

**Files:**
- Modify: `src/admin.ts` (add styles in the `<style>` block of `adminPage`)

**Step 1: Add CSS styles**

In the `<style>` block inside the `adminPage` function (around line 173-501), add before the closing `</style>`:

```css
/* Circuit breaker status */
.cb-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 12px;
  margin-top: 6px;
}
.cb-status.healthy {
  background: #d4edda;
  color: #155724;
}
.cb-status.cooldown {
  background: #f8d7da;
  color: #721c24;
}
.cb-status .cb-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.cb-status.healthy .cb-dot { background: #27ae60; }
.cb-status.cooldown .cb-dot { background: #e74c3c; }
.cb-status .cb-countdown { font-variant-numeric: tabular-nums; }
.cb-failures {
  font-size: 11px;
  color: #888;
  margin-top: 2px;
}
```

**Step 2: Commit**

```bash
git add src/admin.ts
git commit -m "feat: add CSS for circuit breaker status badges"
```

---

### Task 3: Fetch provider states and render status badges in admin JS

**Files:**
- Modify: `src/admin.ts` (add JS in the `<script>` block of `adminPage`)

**Step 1: Add JS to fetch and render circuit breaker states**

In the `<script>` block, after the `var anthropicDisabled = ...` line (around line 654), add:

```javascript
var providerStates = {};
```

Before the `// ---- Init ----` section, add the following function:

```javascript
// ---- Circuit Breaker Status ----
async function fetchProviderStates() {
  try {
    var res = await fetch('/admin/provider-states', {
      headers: { 'Authorization': 'Bearer ' + TOKEN }
    });
    if (res.ok) {
      providerStates = await res.json();
      renderProviders();
    }
  } catch (e) {
    // Silently fail - status is informational
  }
}

function formatCountdown(ms) {
  if (ms <= 0) return 'recovering...';
  var totalSec = Math.ceil(ms / 1000);
  var min = Math.floor(totalSec / 60);
  var sec = totalSec % 60;
  if (min > 0) return min + 'm ' + sec + 's';
  return sec + 's';
}

function renderCbStatus(name) {
  var state = providerStates[name];
  if (!state) return '';
  var now = Date.now();
  var inCooldown = state.cooldownUntil && state.cooldownUntil > now;
  if (inCooldown) {
    var remaining = state.cooldownUntil - now;
    return '<div class="cb-status cooldown" data-cb-name="' + escapeHtml(name) + '" data-cb-until="' + state.cooldownUntil + '">' +
      '<span class="cb-dot"></span>' +
      'In Cooldown <span class="cb-countdown">' + formatCountdown(remaining) + '</span>' +
    '</div>' +
    '<div class="cb-failures">' + state.consecutiveFailures + ' consecutive failures</div>';
  }
  if (state.consecutiveFailures > 0) {
    return '<div class="cb-status healthy">' +
      '<span class="cb-dot"></span>Healthy' +
    '</div>' +
    '<div class="cb-failures">' + state.consecutiveFailures + ' consecutive failures</div>';
  }
  return '<div class="cb-status healthy"><span class="cb-dot"></span>Healthy</div>';
}
```

**Step 2: Update `renderProviders` to include status badges**

In the Anthropic Primary card HTML (around line 791-810), after the `card-subtitle` div, add:

```javascript
'<div class="card-subtitle">https://api.anthropic.com/v1/messages</div>' +
renderCbStatus('anthropic-primary') +
```

In the fallback providers loop (around line 835), after the mapping count meta div, add:

```javascript
(mappingCount > 0 ? '<div class="card-meta">Mappings: ' + mappingCount + '</div>' : '') +
renderCbStatus(p.name) +
```

**Step 3: Add countdown ticker and init call**

In the `// ---- Init ----` section, add after `renderTokens()`:

```javascript
fetchProviderStates();

// Tick countdowns every second
setInterval(function() {
  var els = document.querySelectorAll('[data-cb-until]');
  var now = Date.now();
  var needsRefresh = false;
  for (var i = 0; i < els.length; i++) {
    var until = parseInt(els[i].getAttribute('data-cb-until'), 10);
    var remaining = until - now;
    var countdown = els[i].querySelector('.cb-countdown');
    if (remaining <= 0) {
      needsRefresh = true;
    } else if (countdown) {
      countdown.textContent = formatCountdown(remaining);
    }
  }
  if (needsRefresh) {
    fetchProviderStates();
  }
}, 1000);
```

**Step 4: Run tests to verify nothing broke**

Run: `npm test`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/admin.ts
git commit -m "feat: show circuit breaker status badges on admin provider cards"
```

---

### Task 4: Add a manual reset button for provider circuit breaker state

**Files:**
- Modify: `src/admin.ts` (add `resetProviderState` handler + button in UI)
- Modify: `src/index.ts` (register route)
- Modify: `src/__tests__/admin.test.ts` (add tests)

**Step 1: Write the failing test**

Add to `src/__tests__/admin.test.ts`:

```typescript
describe("resetProviderState", () => {
  it("resets provider state to defaults", async () => {
    const state = {
      consecutiveFailures: 5,
      lastFailure: Date.now(),
      lastSuccess: null,
      cooldownUntil: Date.now() + 60000,
    };
    const env = createMockBindings({
      adminToken: "valid-token",
      kvData: {
        "provider-state:openrouter": JSON.stringify(state),
      },
    });
    const app = createTestApp();
    const res = await app.request(
      createRequest("/admin/provider-states/openrouter/reset", {
        method: "POST",
        token: "valid-token",
      }),
      {},
      env,
    );
    expect(res.status).toBe(200);

    // Verify state was reset
    const statesRes = await app.request(
      createRequest("/admin/provider-states", { token: "valid-token" }),
      {},
      env,
    );
    const states = await statesRes.json();
    // anthropic-primary is always included; openrouter won't be unless providers config includes it
    // But the KV key should have been reset
    const raw = await env.CONFIG_KV.get("provider-state:openrouter");
    const parsed = JSON.parse(raw!);
    expect(parsed.consecutiveFailures).toBe(0);
    expect(parsed.cooldownUntil).toBeNull();
  });

  it("requires authentication", async () => {
    const env = createMockBindings({ adminToken: "valid-token" });
    const app = createTestApp();
    const res = await app.request(
      createRequest("/admin/provider-states/openrouter/reset", {
        method: "POST",
      }),
      {},
      env,
    );
    expect(res.status).toBe(401);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/admin.test.ts`
Expected: FAIL - route 404

**Step 3: Add the handler in `src/admin.ts`**

```typescript
/**
 * POST /admin/provider-states/:name/reset - Reset circuit breaker state for a provider
 */
export async function resetProviderState(c: Context<{ Bindings: Bindings }>) {
  const name = c.req.param('name');
  const key = `provider-state:${name}`;
  const defaultState: ProviderState = {
    consecutiveFailures: 0,
    lastFailure: null,
    lastSuccess: null,
    cooldownUntil: null,
  };
  await c.env.CONFIG_KV.put(key, JSON.stringify(defaultState));
  return c.json({ success: true });
}
```

**Step 4: Register route in `src/index.ts`**

Add to imports:
```typescript
import { ..., resetProviderState } from "./admin";
```

Add route:
```typescript
app.post("/admin/provider-states/:name/reset", authMiddleware, resetProviderState);
```

**Step 5: Add route to `createTestApp` in test file**

```typescript
app.post("/admin/provider-states/:name/reset", authMiddleware, resetProviderState);
```

**Step 6: Add reset button in the admin JS**

In the `renderCbStatus` function, when `inCooldown` is true, add a reset button:

```javascript
if (inCooldown) {
  var remaining = state.cooldownUntil - now;
  return '<div class="cb-status cooldown" data-cb-name="' + escapeHtml(name) + '" data-cb-until="' + state.cooldownUntil + '">' +
    '<span class="cb-dot"></span>' +
    'In Cooldown <span class="cb-countdown">' + formatCountdown(remaining) + '</span>' +
    ' <button class="btn btn-sm" style="padding:1px 8px;font-size:11px;background:#fff;color:#721c24;border:1px solid #721c24;margin-left:4px;" onclick="resetCbState(\'' + escapeHtml(name) + '\')">Reset</button>' +
  '</div>' +
  '<div class="cb-failures">' + state.consecutiveFailures + ' consecutive failures</div>';
}
```

Add the `resetCbState` function in the JS:

```javascript
async function resetCbState(name) {
  try {
    var res = await fetch('/admin/provider-states/' + encodeURIComponent(name) + '/reset', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + TOKEN }
    });
    if (res.ok) {
      showStatus('Circuit breaker reset for ' + name);
      fetchProviderStates();
    } else {
      showStatus('Failed to reset: ' + await res.text(), true);
    }
  } catch (e) {
    showStatus('Error: ' + e.message, true);
  }
}
```

**Step 7: Run all tests**

Run: `npm test`
Expected: All PASS

**Step 8: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 9: Commit**

```bash
git add src/admin.ts src/index.ts src/__tests__/admin.test.ts
git commit -m "feat: add manual reset button for provider circuit breaker"
```

---

### Task 5: Final verification

**Step 1: Run full test suite**

Run: `npm test`
Expected: All tests PASS

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Test locally (manual)**

Run: `npm run dev`
Open: `http://localhost:8787/admin`
Verify: Each provider card shows "Healthy" badge. If a provider has been marked failed, it shows "In Cooldown" with countdown and a Reset button.

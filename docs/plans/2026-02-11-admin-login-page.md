# Admin Login Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a login page for the admin panel so users don't need to pass tokens via URL query params. Redirect `/` to `/admin`, and persist the token in the browser via `localStorage`.

**Architecture:** When visiting `/admin` without a valid token, a login page is rendered (server-side HTML). On successful login, the token is saved to `localStorage` and used for all subsequent API calls via `Authorization` header. The index route `/` redirects to `/admin`.

**Tech Stack:** Hono (Cloudflare Workers), vanilla JS, localStorage

---

### Task 1: Redirect `/` to `/admin`

**Files:**
- Modify: `src/index.ts:30-36`
- Test: `src/__tests__/index.test.ts`

**Step 1: Write the failing test**

In `src/__tests__/index.test.ts`, replace the existing `GET / (health check)` describe block:

```typescript
describe('GET / (redirect to admin)', () => {
  it('returns 302 redirect to /admin', async () => {
    const env = createMockBindings();
    const request = new Request('http://localhost/');

    const response = await app.fetch(request, env);

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/admin');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/index.test.ts`
Expected: FAIL - status is 200 (current health check), not 302

**Step 3: Write minimal implementation**

In `src/index.ts`, replace the health check endpoint (lines 30-36):

```typescript
// Redirect root to admin panel
app.get("/", (c) => {
  return c.redirect("/admin");
});
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/index.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/index.ts src/__tests__/index.test.ts
git commit -m "feat: redirect / to /admin"
```

---

### Task 2: Add login page handler in admin.ts

**Files:**
- Modify: `src/admin.ts`

**Step 1: Write the failing test**

In `src/__tests__/admin.test.ts`, add a new describe block after the existing `authMiddleware` tests:

```typescript
describe("loginPage", () => {
  let app: Hono<{ Bindings: Bindings }>;

  beforeEach(() => {
    app = createTestApp();
  });

  it("returns HTML login page", async () => {
    const env = createMockBindings({ adminToken: "valid-token" });
    const request = createRequest("/admin/login");

    const response = await app.fetch(request, env);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain("Login");
    expect(html).toContain('id="tokenInput"');
    expect(html).toContain("localStorage");
  });
});
```

Also update `createTestApp()` to include the login route (and import `loginPage`):

```typescript
import {
  authMiddleware,
  adminPage,
  loginPage,
  getConfig,
  postConfig,
  getTokens,
  postTokens,
  getSettings,
  postSettings,
  testProvider,
} from "../admin";

function createTestApp() {
  const app = new Hono<{ Bindings: Bindings }>();
  app.get("/admin/login", loginPage);
  app.get("/admin", authMiddleware, adminPage);
  // ... rest of routes unchanged
  return app;
}
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/admin.test.ts`
Expected: FAIL - `loginPage` is not exported from admin.ts

**Step 3: Write minimal implementation**

In `src/admin.ts`, add the `loginPage` export after the `authMiddleware` function (after line 36):

```typescript
/**
 * Login page - shown when user hasn't provided a token
 */
export async function loginPage(c: Context<{ Bindings: Bindings }>) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Claude Code Fallback - Login</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      color: #333;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    .login-container {
      background: white;
      border-radius: 12px;
      padding: 40px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.1);
      width: 100%;
      max-width: 400px;
    }
    h1 { color: #333; margin-bottom: 8px; font-size: 24px; }
    .subtitle { color: #666; margin-bottom: 24px; font-size: 14px; }
    .form-group { margin-bottom: 20px; }
    label { display: block; font-weight: 600; margin-bottom: 6px; font-size: 14px; }
    input[type="password"] {
      width: 100%;
      padding: 10px 14px;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    }
    input[type="password"]:focus { border-color: #4a90d9; }
    .btn-login {
      width: 100%;
      padding: 12px;
      background: #4a90d9;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    .btn-login:hover { background: #357abd; }
    .error-msg {
      color: #e74c3c;
      font-size: 13px;
      margin-top: 12px;
      display: none;
    }
  </style>
</head>
<body>
  <div class="login-container">
    <h1>Claude Code Fallback</h1>
    <p class="subtitle">Enter your admin token to continue</p>
    <form id="loginForm">
      <div class="form-group">
        <label for="tokenInput">Admin Token</label>
        <input type="password" id="tokenInput" placeholder="Enter admin token" autocomplete="off" />
      </div>
      <button type="submit" class="btn-login">Login</button>
      <p class="error-msg" id="errorMsg">Invalid token. Please try again.</p>
    </form>
  </div>
  <script>
    // Check if token is saved in localStorage
    (function() {
      var saved = localStorage.getItem('admin_token');
      if (saved) {
        window.location.href = '/admin?token=' + encodeURIComponent(saved);
      }
    })();

    document.getElementById('loginForm').addEventListener('submit', async function(e) {
      e.preventDefault();
      var token = document.getElementById('tokenInput').value.trim();
      if (!token) return;

      // Validate token by calling an admin endpoint
      try {
        var res = await fetch('/admin/config?token=' + encodeURIComponent(token));
        if (res.ok) {
          localStorage.setItem('admin_token', token);
          window.location.href = '/admin?token=' + encodeURIComponent(token);
        } else {
          document.getElementById('errorMsg').style.display = 'block';
        }
      } catch (err) {
        document.getElementById('errorMsg').style.display = 'block';
      }
    });
  </script>
</body>
</html>`;
  return c.html(html);
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/admin.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/admin.ts src/__tests__/admin.test.ts
git commit -m "feat: add login page handler"
```

---

### Task 3: Update authMiddleware to redirect to login page instead of returning 401

**Files:**
- Modify: `src/admin.ts:19-36`
- Modify: `src/index.ts:39` (add login route)
- Test: `src/__tests__/admin.test.ts`

**Step 1: Write the failing test**

In `src/__tests__/admin.test.ts`, add a new test in the `authMiddleware` describe block:

```typescript
it("redirects to /admin/login when token is missing on GET /admin", async () => {
  const env = createMockBindings({ adminToken: "valid-token" });
  const request = createRequest("/admin");

  const response = await app.fetch(request, env);

  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("/admin/login");
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/admin.test.ts`
Expected: FAIL - currently returns 401 text

**Step 3: Write minimal implementation**

In `src/admin.ts`, update `authMiddleware` to redirect browser requests to the login page:

```typescript
export async function authMiddleware(
  c: Context<{ Bindings: Bindings }>,
  next: Next,
) {
  const token =
    c.req.query('token') ||
    c.req.header('Authorization')?.replace('Bearer ', '');

  if (!c.env.ADMIN_TOKEN) {
    return c.text('ADMIN_TOKEN not configured', 500);
  }

  if (token !== c.env.ADMIN_TOKEN) {
    // For browser navigation to /admin, redirect to login page
    const accept = c.req.header('Accept') || '';
    if (c.req.path === '/admin' && accept.includes('text/html')) {
      return c.redirect('/admin/login');
    }
    return c.text('Unauthorized', 401);
  }

  await next();
}
```

In `src/index.ts`, add the login route (no auth required) before the admin routes:

```typescript
// Login page (no auth required)
app.get("/admin/login", loginPage);
```

And add `loginPage` to the import from `./admin`.

**Step 4: Update existing tests that expect 401 for missing token on /admin**

The test "returns 401 when token is missing" that tests `/admin/config` should still return 401 (it's an API endpoint, not the admin page). Only the `/admin` HTML page should redirect. Check that existing tests still pass and the new test passes.

Run: `npm test -- src/__tests__/admin.test.ts`
Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add src/admin.ts src/index.ts src/__tests__/admin.test.ts
git commit -m "feat: redirect unauthenticated /admin to login page"
```

---

### Task 4: Add token persistence via localStorage in admin panel

**Files:**
- Modify: `src/admin.ts` (admin panel JavaScript section)

**Step 1: Write the failing test**

In `src/__tests__/admin.test.ts`, add a test verifying the admin page includes localStorage logic:

```typescript
describe("adminPage token persistence", () => {
  it("includes localStorage save logic in admin page", async () => {
    const env = createMockBindings({ adminToken: "valid-token" });
    const request = createRequest("/admin", { token: "valid-token" });

    const response = await app.fetch(request, env);
    const html = await response.text();

    expect(html).toContain("localStorage.setItem");
    expect(html).toContain("admin_token");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/admin.test.ts`
Expected: FAIL - admin page doesn't contain localStorage logic yet

**Step 3: Write minimal implementation**

In `src/admin.ts`, in the `<script>` section of `adminPage` (around line 519-520), add localStorage persistence right after `const TOKEN = ...`:

```javascript
const TOKEN = '${escapeHtml(token)}';
// Persist token to localStorage for future visits
if (TOKEN) {
  localStorage.setItem('admin_token', TOKEN);
}
```

Also add a logout function at the end of the script section:

```javascript
function logout() {
  localStorage.removeItem('admin_token');
  window.location.href = '/admin/login';
}
```

And add a logout button in the admin panel header HTML. Find the `<h1>` tag and add a logout button next to it:

```html
<div style="display:flex;justify-content:space-between;align-items:center;">
  <div>
    <h1>Claude Code Fallback Proxy</h1>
    <p class="subtitle">Admin Panel</p>
  </div>
  <button class="btn btn-danger" onclick="logout()">Logout</button>
</div>
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/admin.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/admin.ts src/__tests__/admin.test.ts
git commit -m "feat: persist admin token in localStorage with logout"
```

---

### Task 5: Update admin panel API calls to use Authorization header instead of query params

**Files:**
- Modify: `src/admin.ts` (admin panel JavaScript section)

**Step 1: Write the failing test**

In `src/__tests__/admin.test.ts`, add a test verifying the admin page uses Authorization headers:

```typescript
it("uses Authorization header for API calls instead of query params", async () => {
  const env = createMockBindings({ adminToken: "valid-token" });
  const request = createRequest("/admin", { token: "valid-token" });

  const response = await app.fetch(request, env);
  const html = await response.text();

  // Should use Authorization header in fetch calls
  expect(html).toContain("'Authorization': 'Bearer ' + TOKEN");
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/admin.test.ts`
Expected: FAIL - currently uses `?token=` query params

**Step 3: Write minimal implementation**

In `src/admin.ts`, update all `fetch()` calls in the admin panel JavaScript. Replace the pattern:

```javascript
fetch('/admin/tokens?token=' + TOKEN, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
```

With:

```javascript
fetch('/admin/tokens', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
```

Apply this to all fetch calls in the admin panel JavaScript:
- `persistTokens()` - `/admin/tokens`
- `testProviderConnection()` - `/admin/test-provider`
- `persistProviders()` - `/admin/config`
- `toggleAnthropicPrimary()` - `/admin/anthropic-status`
- `saveCooldown()` - `/admin/settings`

For GET requests that only had `?token=` in the URL, change to include the Authorization header:

```javascript
fetch('/admin/config', {
  headers: { 'Authorization': 'Bearer ' + TOKEN },
})
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/admin.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/admin.ts src/__tests__/admin.test.ts
git commit -m "feat: use Authorization header for admin API calls"
```

---

### Task 6: Run full test suite and type check

**Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 3: Fix any issues found**

If any tests fail or type errors are found, fix them.

**Step 4: Final commit (if fixes needed)**

```bash
git add -A
git commit -m "fix: address test/type issues from admin login feature"
```

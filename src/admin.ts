import { Context, Next } from "hono";
import { Bindings, ProviderConfig } from "./types";
import { getRawConfig, saveConfig, getRawTokens, saveTokens } from "./config";

/**
 * Authentication middleware - validates token from query or header
 */
export async function authMiddleware(
  c: Context<{ Bindings: Bindings }>,
  next: Next,
) {
  const token =
    c.req.query("token") ||
    c.req.header("Authorization")?.replace("Bearer ", "");

  if (!c.env.ADMIN_TOKEN) {
    return c.text("ADMIN_TOKEN not configured", 500);
  }

  if (token !== c.env.ADMIN_TOKEN) {
    return c.text("Unauthorized", 401);
  }

  await next();
}

/**
 * Admin page HTML
 */
export async function adminPage(c: Context<{ Bindings: Bindings }>) {
  const token = c.req.query("token") || "";
  const config = await getRawConfig(c.env);
  const allowedTokens = await getRawTokens(c.env);

  // Construct the base URL for instructions
  const requestUrl = new URL(c.req.url);
  const workerBaseUrl = `${requestUrl.protocol}//${requestUrl.host}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Claude Code Fallback - Admin</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    h1 { color: #333; margin-bottom: 10px; }
    .subtitle { color: #666; margin-bottom: 30px; }
    .card {
      background: white;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .provider-card {
      border-left: 4px solid #4a90d9;
    }
    .token-card {
      border-left: 4px solid #2ecc71;
    }
    .provider-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .provider-name {
      font-weight: 600;
      font-size: 18px;
      color: #333;
    }
    .provider-url {
      color: #666;
      font-size: 14px;
      word-break: break-all;
    }
    .provider-meta {
      font-size: 12px;
      color: #888;
      margin-top: 8px;
    }
    .btn {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      transition: opacity 0.2s;
    }
    .btn:hover { opacity: 0.8; }
    .btn-primary { background: #4a90d9; color: white; }
    .btn-danger { background: #e74c3c; color: white; }
    .btn-secondary { background: #95a5a6; color: white; }
    .btn-sm { padding: 4px 10px; font-size: 12px; }
    textarea {
      width: 100%;
      height: 300px;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 13px;
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      resize: vertical;
    }
    .actions {
      display: flex;
      gap: 10px;
      margin-top: 15px;
    }
    .status {
      padding: 10px;
      border-radius: 4px;
      margin-bottom: 15px;
      display: none;
    }
    .status.success { background: #d4edda; color: #155724; display: block; }
    .status.error { background: #f8d7da; color: #721c24; display: block; }
    .empty-state {
      text-align: center;
      padding: 40px;
      color: #666;
    }
    .tabs {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
    }
    .tab {
      padding: 8px 16px;
      background: #e0e0e0;
      border-radius: 4px;
      cursor: pointer;
    }
    .tab.active { background: #4a90d9; color: white; }
    .view { display: none; }
    .view.active { display: block; }
    #providerList { min-height: 100px; }
    .code-block {
      background: #f1f1f1;
      padding: 10px;
      border-radius: 4px;
      font-family: monospace;
      margin: 10px 0;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .token-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px;
      border-bottom: 1px solid #eee;
    }
    .token-item:last-child {
      border-bottom: none;
    }
    .token-value {
      font-family: monospace;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <h1>Claude Code Fallback Proxy</h1>
  <p class="subtitle">Provider Configuration</p>

  <div id="status" class="status"></div>

  <div class="tabs">
    <div class="tab active" onclick="switchView('visual')">Visual Editor</div>
    <div class="tab" onclick="switchView('json')">JSON Editor</div>
    <div class="tab" onclick="switchView('tokens')">Access Tokens</div>
  </div>

  <div id="visual-view" class="view active">
    <div id="providerList"></div>
    <button class="btn btn-primary" onclick="addProvider()">+ Add Provider</button>
  </div>

  <div id="json-view" class="view">
    <div class="card">
      <textarea id="jsonEditor">${escapeHtml(config)}</textarea>
      <div class="actions">
        <button class="btn btn-primary" onclick="saveJson()">Save Configuration</button>
        <button class="btn btn-secondary" onclick="formatJson()">Format JSON</button>
      </div>
    </div>
  </div>

  <div id="tokens-view" class="view">
    <div class="card">
      <h3>Configuration Instructions</h3>
      <p>Configure Claude Code to use this proxy with your token:</p>
      <div class="code-block">export ANTHROPIC_CUSTOM_HEADERS="x-ccf-api-key: [YOUR_TOKEN]"
export ANTHROPIC_BASE_URL="${escapeHtml(workerBaseUrl)}"</div>

      <h3 style="margin-top: 20px;">Allowed Tokens</h3>
      <div id="tokenList"></div>
      <div class="actions">
        <button class="btn btn-primary" onclick="addToken()">+ Add Token</button>
      </div>
    </div>
  </div>

  <script>
    const TOKEN = '${escapeHtml(token)}';
    let providers = [];
    let allowedTokens = [];

    try {
      providers = JSON.parse(${JSON.stringify(config)});
    } catch (e) {
      providers = [];
    }

    try {
      allowedTokens = JSON.parse(${JSON.stringify(allowedTokens)});
    } catch (e) {
      allowedTokens = [];
    }

    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function showStatus(message, isError = false) {
      const el = document.getElementById('status');
      el.textContent = message;
      el.className = 'status ' + (isError ? 'error' : 'success');
      setTimeout(() => { el.className = 'status'; }, 3000);
    }

    function switchView(view) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

      let tabIndex = 1;
      if (view === 'json') tabIndex = 2;
      if (view === 'tokens') tabIndex = 3;

      document.querySelector('.tab:nth-child(' + tabIndex + ')').classList.add('active');
      document.getElementById(view + '-view').classList.add('active');

      if (view === 'json') {
        document.getElementById('jsonEditor').value = JSON.stringify(providers, null, 2);
      } else if (view === 'visual') {
        try {
          providers = JSON.parse(document.getElementById('jsonEditor').value);
        } catch (e) {}
        renderProviders();
      } else if (view === 'tokens') {
        renderTokens();
      }
    }

    function renderProviders() {
      const container = document.getElementById('providerList');
      if (providers.length === 0) {
        container.innerHTML = '<div class="empty-state">No providers configured. Add one to get started.</div>';
        return;
      }

      container.innerHTML = providers.map((p, i) => \`
        <div class="card provider-card">
          <div class="provider-header">
            <span class="provider-name">\${escapeHtml(p.name)}</span>
            <div>
              <button class="btn btn-secondary btn-sm" onclick="editProvider(\${i})">Edit</button>
              <button class="btn btn-danger btn-sm" onclick="deleteProvider(\${i})">Delete</button>
            </div>
          </div>
          <div class="provider-url">\${escapeHtml(p.baseUrl)}</div>
          <div class="provider-meta">
            Auth: \${escapeHtml(p.authHeader || 'x-api-key')}
            \${p.modelMapping ? ' | Mappings: ' + Object.keys(p.modelMapping).length : ''}
          </div>
        </div>
      \`).join('');
    }

    function renderTokens() {
      const container = document.getElementById('tokenList');
      if (allowedTokens.length === 0) {
        container.innerHTML = '<div class="empty-state">No tokens configured. Anyone can access this proxy!</div>';
        return;
      }

      container.innerHTML = allowedTokens.map((t, i) => \`
        <div class="token-item">
          <span class="token-value">\${escapeHtml(t)}</span>
          <button class="btn btn-danger btn-sm" onclick="deleteToken(\${i})">Delete</button>
        </div>
      \`).join('');
    }

    function addProvider() {
      const name = prompt('Provider name:');
      if (!name) return;
      const baseUrl = prompt('Base URL:');
      if (!baseUrl) return;
      const apiKey = prompt('API Key:');
      if (!apiKey) return;
      const authHeader = prompt('Auth header (default: x-api-key):', 'x-api-key');

      providers.push({ name, baseUrl, apiKey, authHeader: authHeader || 'x-api-key' });
      renderProviders();
      saveProviders();
    }

    function editProvider(index) {
      const p = providers[index];
      const name = prompt('Provider name:', p.name);
      if (!name) return;
      const baseUrl = prompt('Base URL:', p.baseUrl);
      if (!baseUrl) return;
      const apiKey = prompt('API Key:', p.apiKey);
      if (!apiKey) return;
      const authHeader = prompt('Auth header:', p.authHeader || 'x-api-key');

      providers[index] = { ...p, name, baseUrl, apiKey, authHeader: authHeader || 'x-api-key' };
      renderProviders();
      saveProviders();
    }

    function deleteProvider(index) {
      if (!confirm('Delete this provider?')) return;
      providers.splice(index, 1);
      renderProviders();
      saveProviders();
    }

    function addToken() {
      // Generate a random token suggestion
      const randomToken = 'sk-cc-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const token = prompt('Enter new token (or keep random suggestion):', randomToken);
      if (!token) return;

      allowedTokens.push(token);
      renderTokens();
      saveTokens();
    }

    function deleteToken(index) {
      if (!confirm('Delete this token? Clients using it will lose access.')) return;
      allowedTokens.splice(index, 1);
      renderTokens();
      saveTokens();
    }

    async function saveProviders() {
      try {
        const res = await fetch('/admin/config?token=' + TOKEN, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(providers)
        });
        if (res.ok) {
          showStatus('Configuration saved!');
        } else {
          showStatus('Failed to save: ' + await res.text(), true);
        }
      } catch (e) {
        showStatus('Error: ' + e.message, true);
      }
    }

    async function saveTokens() {
      try {
        const res = await fetch('/admin/tokens?token=' + TOKEN, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(allowedTokens)
        });
        if (res.ok) {
          showStatus('Tokens saved!');
        } else {
          showStatus('Failed to save tokens: ' + await res.text(), true);
        }
      } catch (e) {
        showStatus('Error: ' + e.message, true);
      }
    }

    function formatJson() {
      try {
        const json = JSON.parse(document.getElementById('jsonEditor').value);
        document.getElementById('jsonEditor').value = JSON.stringify(json, null, 2);
      } catch (e) {
        showStatus('Invalid JSON: ' + e.message, true);
      }
    }

    async function saveJson() {
      try {
        providers = JSON.parse(document.getElementById('jsonEditor').value);
        await saveProviders();
        renderProviders();
      } catch (e) {
        showStatus('Invalid JSON: ' + e.message, true);
      }
    }

    renderProviders();
  </script>
</body>
</html>`;

  return c.html(html);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * GET /admin/config - Get current configuration
 */
export async function getConfig(c: Context<{ Bindings: Bindings }>) {
  const config = await getRawConfig(c.env);
  return c.json(JSON.parse(config));
}

/**
 * POST /admin/config - Save configuration
 */
export async function postConfig(c: Context<{ Bindings: Bindings }>) {
  try {
    const providers = await c.req.json<ProviderConfig[]>();

    // Validate
    if (!Array.isArray(providers)) {
      return c.json({ error: "Config must be an array" }, 400);
    }

    for (const p of providers) {
      if (!p.name || !p.baseUrl || !p.apiKey) {
        return c.json(
          { error: `Invalid provider: missing name, baseUrl, or apiKey` },
          400,
        );
      }
    }

    await saveConfig(c.env, providers);
    return c.json({ success: true, count: providers.length });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
}

/**
 * GET /admin/tokens - Get allowed tokens
 */
export async function getTokens(c: Context<{ Bindings: Bindings }>) {
  const tokens = await getRawTokens(c.env);
  return c.json(JSON.parse(tokens));
}

/**
 * POST /admin/tokens - Save allowed tokens
 */
export async function postTokens(c: Context<{ Bindings: Bindings }>) {
  try {
    const tokens = await c.req.json<string[]>();

    // Validate
    if (!Array.isArray(tokens)) {
      return c.json({ error: "Tokens must be an array" }, 400);
    }

    // Filter out non-string items or empty strings
    const validTokens = tokens.filter(
      (t) => typeof t === "string" && t.length > 0,
    );

    await saveTokens(c.env, validTokens);
    return c.json({ success: true, count: validTokens.length });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
}

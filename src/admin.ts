import { Context, Next } from 'hono';
import { Bindings, ProviderConfig } from './types';
import { getRawConfig, saveConfig } from './config';

/**
 * Authentication middleware - validates token from query or header
 */
export async function authMiddleware(
  c: Context<{ Bindings: Bindings }>,
  next: Next
) {
  const token =
    c.req.query('token') ||
    c.req.header('Authorization')?.replace('Bearer ', '');

  if (!c.env.ADMIN_TOKEN) {
    return c.text('ADMIN_TOKEN not configured', 500);
  }

  if (token !== c.env.ADMIN_TOKEN) {
    return c.text('Unauthorized', 401);
  }

  await next();
}

/**
 * Admin page HTML
 */
export async function adminPage(c: Context<{ Bindings: Bindings }>) {
  const token = c.req.query('token') || '';
  const config = await getRawConfig(c.env);

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
  </style>
</head>
<body>
  <h1>Claude Code Fallback Proxy</h1>
  <p class="subtitle">Provider Configuration</p>

  <div id="status" class="status"></div>

  <div class="tabs">
    <div class="tab active" onclick="switchView('visual')">Visual Editor</div>
    <div class="tab" onclick="switchView('json')">JSON Editor</div>
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

  <script>
    const TOKEN = '${escapeHtml(token)}';
    let providers = [];

    try {
      providers = JSON.parse(${JSON.stringify(config)});
    } catch (e) {
      providers = [];
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
      document.querySelector('.tab:nth-child(' + (view === 'visual' ? 1 : 2) + ')').classList.add('active');
      document.getElementById(view + '-view').classList.add('active');

      if (view === 'json') {
        document.getElementById('jsonEditor').value = JSON.stringify(providers, null, 2);
      } else {
        try {
          providers = JSON.parse(document.getElementById('jsonEditor').value);
        } catch (e) {}
        renderProviders();
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
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
      return c.json({ error: 'Config must be an array' }, 400);
    }

    for (const p of providers) {
      if (!p.name || !p.baseUrl || !p.apiKey) {
        return c.json(
          { error: `Invalid provider: missing name, baseUrl, or apiKey` },
          400
        );
      }
    }

    await saveConfig(c.env, providers);
    return c.json({ success: true, count: providers.length });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
}

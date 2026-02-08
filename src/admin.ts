import { Context, Next } from "hono";
import { Bindings, ProviderConfig, TokenConfig } from "./types";
import {
  getRawConfig,
  saveConfig,
  getRawTokens,
  saveTokens,
  parseTokenConfigs,
  getRawCooldown,
  saveCooldown,
  getRawAnthropicDisabled,
  saveAnthropicDisabled,
} from "./config";
import { convertAnthropicToOpenAI } from "./utils/format-converter";

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
  const rawTokens = await getRawTokens(c.env);
  const cooldown = await getRawCooldown(c.env);
  const anthropicDisabled = await getRawAnthropicDisabled(c.env);

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
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
      color: #333;
    }
    h1 { color: #333; margin-bottom: 4px; }
    .subtitle { color: #666; margin-bottom: 30px; }
    .section { margin-bottom: 40px; }
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 2px solid #e0e0e0;
    }
    .section-header h2 { font-size: 20px; color: #333; }
    .card {
      background: white;
      border-radius: 8px;
      padding: 16px 20px;
      margin-bottom: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    .provider-card { border-left: 4px solid #4a90d9; }
    .token-card { border-left: 4px solid #2ecc71; }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .card-header-left { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; }
    .card-title { font-weight: 600; font-size: 16px; color: #333; }
    .card-subtitle { color: #666; font-size: 13px; word-break: break-all; margin-top: 4px; }
    .card-meta { font-size: 12px; color: #888; margin-top: 6px; }
    .card-actions { display: flex; gap: 6px; flex-shrink: 0; }
    .btn {
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.15s;
    }
    .btn:hover { opacity: 0.85; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-primary { background: #4a90d9; color: white; }
    .btn-success { background: #27ae60; color: white; }
    .btn-danger { background: #e74c3c; color: white; }
    .btn-secondary { background: #95a5a6; color: white; }
    .btn-outline { background: white; color: #4a90d9; border: 1px solid #4a90d9; }
    .btn-sm { padding: 4px 10px; font-size: 12px; }
    textarea {
      width: 100%;
      height: 300px;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 13px;
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 6px;
      resize: vertical;
    }
    input[type="text"], input[type="password"], input[type="number"] {
      width: 100%;
      padding: 8px 12px;
      font-size: 14px;
      border: 1px solid #ddd;
      border-radius: 6px;
      transition: border-color 0.15s;
    }
    input:focus, textarea:focus { outline: none; border-color: #4a90d9; }
    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; margin-bottom: 4px; font-weight: 600; font-size: 13px; }
    .help-text { font-size: 12px; color: #888; margin-top: 2px; }
    .actions { display: flex; gap: 10px; margin-top: 16px; }
    .status {
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 14px;
      z-index: 1000;
      display: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .status.success { background: #d4edda; color: #155724; display: block; }
    .status.error { background: #f8d7da; color: #721c24; display: block; }
    .empty-state { text-align: center; padding: 30px; color: #888; font-size: 14px; }
    /* Drag and drop */
    .drag-handle {
      cursor: grab;
      padding: 4px 8px;
      color: #bbb;
      font-size: 18px;
      user-select: none;
      -webkit-user-select: none;
      display: flex;
      align-items: center;
      flex-shrink: 0;
    }
    .drag-handle:hover { color: #666; }
    .drag-handle:active { cursor: grabbing; }
    .priority-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: #4a90d9;
      color: white;
      font-size: 11px;
      font-weight: 600;
      flex-shrink: 0;
      margin-right: 8px;
    }
    .provider-card { transition: opacity 0.15s ease, box-shadow 0.15s ease; }
    .provider-card.dragging { opacity: 0.4; box-shadow: 0 0 0 2px #4a90d9; }
    .provider-card.drag-over { box-shadow: 0 -3px 0 0 #4a90d9, 0 1px 3px rgba(0,0,0,0.08); }
    .code-block {
      background: #f8f8f8;
      padding: 12px;
      border-radius: 6px;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 13px;
      margin: 8px 0;
      white-space: pre-wrap;
      word-break: break-all;
      border: 1px solid #e8e8e8;
    }
    /* Token expandable */
    .token-expand-btn {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 14px;
      color: #666;
      padding: 4px;
      transition: transform 0.2s;
    }
    .token-expand-btn.expanded { transform: rotate(90deg); }
    .token-details { display: none; margin-top: 12px; padding-top: 12px; border-top: 1px solid #eee; }
    .token-details.expanded { display: block; }
    .token-value { font-family: 'Monaco', 'Menlo', monospace; font-size: 13px; color: #333; }
    .token-note { font-size: 12px; color: #888; margin-left: 8px; }
    /* Collapsible section */
    .collapsible-trigger {
      cursor: pointer;
      user-select: none;
    }
    .collapsible-trigger .arrow { transition: transform 0.2s; display: inline-block; }
    .collapsible-trigger.open .arrow { transform: rotate(90deg); }
    .collapsible-content { display: none; }
    .collapsible-content.open { display: block; }
    /* Modal */
    .modal-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      z-index: 100;
      align-items: center;
      justify-content: center;
    }
    .modal-overlay.active { display: flex; }
    .modal {
      background: white;
      border-radius: 12px;
      width: 90%;
      max-width: 600px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .modal-header {
      padding: 20px 24px 16px;
      border-bottom: 1px solid #eee;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .modal-header h3 { font-size: 18px; }
    .modal-close {
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
      color: #999;
      padding: 0 4px;
    }
    .modal-close:hover { color: #333; }
    .modal-body { padding: 20px 24px; }
    .modal-footer {
      padding: 16px 24px 20px;
      border-top: 1px solid #eee;
      display: flex;
      justify-content: space-between;
      gap: 10px;
    }
    .modal-footer-left { display: flex; gap: 10px; }
    .modal-footer-right { display: flex; gap: 10px; }
    /* KV pair editor */
    .kv-editor { margin-top: 8px; }
    .kv-row {
      display: flex;
      gap: 8px;
      margin-bottom: 6px;
      align-items: center;
    }
    .kv-row input, .kv-row select { flex: 1; padding: 6px 10px; font-size: 13px; }
    .kv-remove {
      background: none;
      border: none;
      color: #e74c3c;
      cursor: pointer;
      font-size: 18px;
      padding: 0 4px;
    }
    .kv-add {
      font-size: 12px;
      color: #4a90d9;
      cursor: pointer;
      background: none;
      border: none;
      padding: 4px 0;
    }
    .kv-add:hover { text-decoration: underline; }
    /* Test results */
    .test-results-container { margin-top: 8px; }
    .test-results-container.loading {
      padding: 8px 12px;
      background: #fff3cd;
      color: #856404;
      border-radius: 6px;
      font-size: 13px;
    }
    .test-model-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 13px;
      margin-bottom: 4px;
    }
    .test-model-row.success { background: #d4edda; color: #155724; }
    .test-model-row.error { background: #f8d7da; color: #721c24; }
    .test-model-icon { font-size: 14px; flex-shrink: 0; }
    .test-model-name { font-weight: 600; }
    .test-model-detail { font-size: 12px; opacity: 0.8; margin-left: auto; }
    .test-suggestion {
      margin-top: 8px;
      padding: 8px 12px;
      background: #fff3cd;
      color: #856404;
      border-radius: 6px;
      font-size: 12px;
    }
    .test-suggestion a { color: #856404; font-weight: 600; cursor: pointer; text-decoration: underline; }
    /* Password toggle */
    .password-wrapper {
      position: relative;
    }
    .password-toggle {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      cursor: pointer;
      color: #888;
      font-size: 13px;
    }
    .password-wrapper input { padding-right: 60px; }
    /* Toggle switch */
    .toggle-switch {
      position: relative;
      display: inline-block;
      width: 36px;
      height: 20px;
      flex-shrink: 0;
    }
    .toggle-switch input { opacity: 0; width: 0; height: 0; }
    .toggle-slider {
      position: absolute;
      cursor: pointer;
      inset: 0;
      background: #ccc;
      border-radius: 20px;
      transition: background 0.2s;
    }
    .toggle-slider::before {
      content: '';
      position: absolute;
      height: 14px;
      width: 14px;
      left: 3px;
      bottom: 3px;
      background: white;
      border-radius: 50%;
      transition: transform 0.2s;
    }
    .toggle-switch input:checked + .toggle-slider { background: #27ae60; }
    .toggle-switch input:checked + .toggle-slider::before { transform: translateX(16px); }
    /* Disabled provider card */
    .provider-card.disabled-card { opacity: 0.55; border-left-color: #ccc; }
    .provider-card.disabled-card .card-title { text-decoration: line-through; color: #999; }
    /* Anthropic primary card */
    .provider-card.anthropic-primary { border-left-color: #d4a553; }
    .anthropic-badge {
      display: inline-block;
      font-size: 10px;
      background: #d4a553;
      color: white;
      padding: 1px 6px;
      border-radius: 3px;
      margin-left: 8px;
      font-weight: 500;
      vertical-align: middle;
    }
  </style>
</head>
<body>
  <h1>Claude Code Fallback Proxy</h1>
  <p class="subtitle">Admin Panel</p>

  <div id="status" class="status"></div>

  <!-- Section: Access Tokens -->
  <div class="section" id="tokens-section">
    <div class="section-header">
      <h2>Access Tokens</h2>
      <button class="btn btn-primary btn-sm" onclick="showAddToken()">+ Add Token</button>
    </div>
    <div id="addTokenForm" style="display:none;" class="card">
      <div class="form-group">
        <label>Token</label>
        <input type="text" id="newTokenValue" placeholder="sk-cc-...">
        <div class="help-text">Leave empty to auto-generate</div>
      </div>
      <div class="form-group">
        <label>Note (optional)</label>
        <input type="text" id="newTokenNote" placeholder="e.g. dev-machine-john" pattern="^[a-zA-Z0-9 -]*$">
        <div class="help-text">English letters, numbers, spaces, and hyphens only</div>
      </div>
      <div class="actions">
        <button class="btn btn-primary btn-sm" onclick="confirmAddToken()">Save Token</button>
        <button class="btn btn-secondary btn-sm" onclick="hideAddToken()">Cancel</button>
      </div>
    </div>
    <div id="tokenList"></div>
  </div>

  <!-- Section: Providers -->
  <div class="section" id="providers-section">
    <div class="section-header">
      <h2>Fallback Providers</h2>
      <button class="btn btn-primary btn-sm" onclick="openProviderModal()">+ Add Provider</button>
    </div>
    <div id="providerList"></div>
  </div>

  <!-- Section: Settings -->
  <div class="section" id="settings-section">
    <div class="section-header">
      <h2>Settings</h2>
    </div>
    <div class="card">
      <div class="form-group">
        <label>Circuit Breaker Cooldown (seconds)</label>
        <div class="help-text">How long to skip a provider after it fails (default: 300s / 5m).</div>
        <input type="number" id="cooldownInput" value="${cooldown}" min="0" step="1">
      </div>
      <div class="actions">
        <button class="btn btn-primary btn-sm" onclick="saveSettings()">Save Settings</button>
      </div>
    </div>
  </div>

  <!-- Section: JSON Editor (collapsible) -->
  <div class="section" id="json-section">
    <div class="section-header collapsible-trigger" onclick="toggleJsonEditor()">
      <h2><span class="arrow">&#9654;</span> JSON Editor</h2>
    </div>
    <div class="collapsible-content" id="jsonEditorSection">
      <div class="card">
        <textarea id="jsonEditor">${escapeHtml(config)}</textarea>
        <div class="actions">
          <button class="btn btn-primary btn-sm" onclick="saveJson()">Save Configuration</button>
          <button class="btn btn-secondary btn-sm" onclick="formatJson()">Format JSON</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Provider Modal -->
  <div class="modal-overlay" id="providerModal">
    <div class="modal">
      <div class="modal-header">
        <h3 id="providerModalTitle">Add Provider</h3>
        <button class="modal-close" onclick="closeProviderModal()">&times;</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="providerEditIndex" value="-1">
        <div class="form-group">
          <label>Name *</label>
          <input type="text" id="providerName" placeholder="e.g. openrouter">
        </div>
        <div class="form-group">
          <label>Base URL *</label>
          <input type="text" id="providerBaseUrl" placeholder="e.g. https://openrouter.ai/api/v1/chat/completions">
        </div>
        <div class="form-group">
          <label>API Key *</label>
          <div class="password-wrapper">
            <input type="password" id="providerApiKey" placeholder="sk-...">
            <button type="button" class="password-toggle" onclick="toggleApiKeyVisibility()">Show</button>
          </div>
        </div>
        <div class="form-group">
          <label>API Format</label>
          <select id="providerFormat" style="width:100%;padding:8px 12px;font-size:14px;border:1px solid #ddd;border-radius:6px;">
            <option value="anthropic">Anthropic Messages API</option>
            <option value="openai">OpenAI Chat Completions</option>
          </select>
          <div class="help-text">Select the API format this provider accepts.</div>
        </div>
        <div class="form-group">
          <label>Model Mapping</label>
          <div class="help-text">Map Anthropic model names to provider-specific names.</div>
          <div class="kv-editor" id="modelMappingEditor"></div>
          <button class="kv-add" onclick="addModelMapping()">+ Add mapping</button>
        </div>
        <div class="form-group">
          <label>Custom Headers</label>
          <div class="help-text">Additional headers to send with requests.</div>
          <div class="kv-editor" id="customHeadersEditor"></div>
          <button class="kv-add" onclick="addCustomHeader()">+ Add header</button>
        </div>
        <div id="testResult"></div>
      </div>
      <div class="modal-footer">
        <div class="modal-footer-left">
          <button class="btn btn-outline btn-sm" id="testConnectionBtn" onclick="testConnection()">Test Connection</button>
        </div>
        <div class="modal-footer-right">
          <button class="btn btn-secondary btn-sm" onclick="closeProviderModal()">Cancel</button>
          <button class="btn btn-primary btn-sm" onclick="saveProvider()">Save</button>
        </div>
      </div>
    </div>
  </div>

  <script>
    const TOKEN = '${escapeHtml(token)}';
    const WORKER_BASE_URL = '${escapeHtml(workerBaseUrl)}';
    var CLAUDE_MODELS = [
      { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
      { id: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
      { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
      { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
      { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (v2)' },
      { id: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
    ];
    let providers = [];
    let tokenConfigs = [];
    var anthropicDisabled = ${anthropicDisabled};

    try {
      providers = JSON.parse(${JSON.stringify(config)});
    } catch (e) {
      providers = [];
    }

    try {
      const rawTokens = JSON.parse(${JSON.stringify(rawTokens)});
      tokenConfigs = rawTokens.map(function(t) {
        if (typeof t === 'string') return { token: t, note: '' };
        return { token: t.token || '', note: t.note || '' };
      });
    } catch (e) {
      tokenConfigs = [];
    }

    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function showStatus(message, isError) {
      var el = document.getElementById('status');
      el.textContent = message;
      el.className = 'status ' + (isError ? 'error' : 'success');
      setTimeout(function() { el.className = 'status'; }, 3000);
    }

    // ---- Tokens ----
    function renderTokens() {
      var container = document.getElementById('tokenList');
      if (tokenConfigs.length === 0) {
        container.innerHTML = '<div class="empty-state">No tokens configured. Anyone can access this proxy.</div>';
        return;
      }
      container.innerHTML = tokenConfigs.map(function(tc, i) {
        return '<div class="card token-card">' +
          '<div class="card-header">' +
            '<div class="card-header-left">' +
              '<button class="token-expand-btn" onclick="toggleTokenDetails(' + i + ')" id="tokenExpandBtn' + i + '">&#9654;</button>' +
              '<div>' +
                '<span class="token-value">' + escapeHtml(tc.token) + '</span>' +
                (tc.note ? '<span class="token-note">(' + escapeHtml(tc.note) + ')</span>' : '') +
              '</div>' +
            '</div>' +
            '<div class="card-actions">' +
              '<button class="btn btn-danger btn-sm" onclick="deleteToken(' + i + ')">Delete</button>' +
            '</div>' +
          '</div>' +
          '<div class="token-details" id="tokenDetails' + i + '">' +
            '<p style="font-size:13px;color:#555;margin-bottom:8px;">Configure Claude Code to use this proxy with this token:</p>' +
            '<div class="code-block">export ANTHROPIC_CUSTOM_HEADERS="x-ccf-api-key: ' + escapeHtml(tc.token) + '"\\nexport ANTHROPIC_BASE_URL="' + escapeHtml(WORKER_BASE_URL) + '"</div>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    function toggleTokenDetails(index) {
      var btn = document.getElementById('tokenExpandBtn' + index);
      var details = document.getElementById('tokenDetails' + index);
      var isExpanded = details.classList.contains('expanded');
      if (isExpanded) {
        details.classList.remove('expanded');
        btn.classList.remove('expanded');
      } else {
        details.classList.add('expanded');
        btn.classList.add('expanded');
      }
    }

    function showAddToken() {
      var form = document.getElementById('addTokenForm');
      form.style.display = 'block';
      var randomToken = 'sk-cc-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      document.getElementById('newTokenValue').value = randomToken;
      document.getElementById('newTokenNote').value = '';
    }

    function hideAddToken() {
      document.getElementById('addTokenForm').style.display = 'none';
    }

    function confirmAddToken() {
      var tokenVal = document.getElementById('newTokenValue').value.trim();
      var noteVal = document.getElementById('newTokenNote').value.trim();

      if (!tokenVal) {
        tokenVal = 'sk-cc-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      }

      var notePattern = /^[a-zA-Z0-9 -]*$/;
      if (noteVal && !notePattern.test(noteVal)) {
        showStatus('Note must contain only English letters, numbers, spaces, and hyphens', true);
        return;
      }

      tokenConfigs.push({ token: tokenVal, note: noteVal });
      renderTokens();
      persistTokens();
      hideAddToken();
    }

    function deleteToken(index) {
      if (!confirm('Delete this token? Clients using it will lose access.')) return;
      tokenConfigs.splice(index, 1);
      renderTokens();
      persistTokens();
    }

    async function persistTokens() {
      try {
        var res = await fetch('/admin/tokens?token=' + TOKEN, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tokenConfigs)
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

    // ---- Providers ----
    function renderProviders() {
      var container = document.getElementById('providerList');

      // Anthropic Primary card (always first, fixed position)
      var anthropicHtml = '<div class="card provider-card anthropic-primary' +
        (anthropicDisabled ? ' disabled-card' : '') + '">' +
        '<div class="card-header">' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="display:flex;align-items:center;">' +
              '<span class="priority-badge" style="background:#d4a553;">1</span>' +
              '<span class="card-title">Anthropic API</span>' +
              '<span class="anthropic-badge">PRIMARY</span>' +
            '</div>' +
            '<div class="card-subtitle">https://api.anthropic.com/v1/messages</div>' +
          '</div>' +
          '<div class="card-actions">' +
            '<label class="toggle-switch" title="' + (anthropicDisabled ? 'Enable' : 'Disable') + ' provider">' +
              '<input type="checkbox" ' + (anthropicDisabled ? '' : 'checked') +
              ' onchange="toggleAnthropicPrimary(this.checked)">' +
              '<span class="toggle-slider"></span>' +
            '</label>' +
          '</div>' +
        '</div>' +
      '</div>';

      // Fallback providers
      var fallbackHtml = '';
      if (providers.length === 0) {
        fallbackHtml = '<div class="empty-state">No fallback providers configured. Add one to get started.</div>';
      } else {
        fallbackHtml = providers.map(function(p, i) {
          var mappingCount = p.modelMapping ? Object.keys(p.modelMapping).length : 0;
          return '<div class="card provider-card' + (p.disabled ? ' disabled-card' : '') + '" data-index="' + i + '" draggable="true"' +
            ' ondragstart="onDragStart(event,' + i + ')"' +
            ' ondragover="onDragOver(event)"' +
            ' ondragenter="onDragEnter(event)"' +
            ' ondragleave="onDragLeave(event)"' +
            ' ondrop="onDrop(event,' + i + ')"' +
            ' ondragend="onDragEnd(event)"' +
            ' ontouchstart="onTouchStart(event,' + i + ')">' +
            '<div class="card-header">' +
              '<div class="drag-handle" aria-label="Drag to reorder">&#9776;</div>' +
              '<div style="flex:1;min-width:0;">' +
                '<div style="display:flex;align-items:center;">' +
                  '<span class="priority-badge">' + (i + 2) + '</span>' +
                  '<span class="card-title">' + escapeHtml(p.name) + '</span>' +
                '</div>' +
                '<div class="card-subtitle">' + escapeHtml(p.baseUrl) + '</div>' +
                (p.format === 'openai' ? '<div class="card-meta">Format: OpenAI</div>' : '') +
                (mappingCount > 0 ? '<div class="card-meta">Mappings: ' + mappingCount + '</div>' : '') +
              '</div>' +
              '<div class="card-actions">' +
                '<label class="toggle-switch" title="' + (p.disabled ? 'Enable' : 'Disable') + ' provider">' +
                  '<input type="checkbox" ' + (p.disabled ? '' : 'checked') +
                  ' onchange="toggleProvider(' + i + ', this.checked)">' +
                  '<span class="toggle-slider"></span>' +
                '</label>' +
                '<button class="btn btn-outline btn-sm" onclick="openProviderModal(' + i + ')">Edit</button>' +
                '<button class="btn btn-danger btn-sm" onclick="deleteProvider(' + i + ')">Delete</button>' +
              '</div>' +
            '</div>' +
          '</div>';
        }).join('');
      }

      container.innerHTML = anthropicHtml + fallbackHtml;
      // Sync JSON editor if open
      var jsonSection = document.getElementById('jsonEditorSection');
      if (jsonSection && jsonSection.classList.contains('open')) {
        document.getElementById('jsonEditor').value = JSON.stringify(providers, null, 2);
      }
    }

    function deleteProvider(index) {
      if (!confirm('Delete this provider?')) return;
      providers.splice(index, 1);
      renderProviders();
      persistProviders();
    }

    // ---- Provider Modal ----
    var modelMappings = [];
    var customHeaders = [];

    function openProviderModal(editIndex) {
      var modal = document.getElementById('providerModal');
      var title = document.getElementById('providerModalTitle');
      document.getElementById('testResult').innerHTML = '';

      if (editIndex !== undefined && editIndex >= 0) {
        title.textContent = 'Edit Provider';
        document.getElementById('providerEditIndex').value = editIndex;
        var p = providers[editIndex];
        document.getElementById('providerName').value = p.name || '';
        document.getElementById('providerBaseUrl').value = p.baseUrl || '';
        document.getElementById('providerApiKey').value = p.apiKey || '';
        document.getElementById('providerFormat').value = p.format || 'anthropic';
        modelMappings = p.modelMapping ? Object.entries(p.modelMapping).map(function(e) { return { key: e[0], value: e[1] }; }) : [];
        customHeaders = p.headers ? Object.entries(p.headers).map(function(e) { return { key: e[0], value: e[1] }; }) : [];
      } else {
        title.textContent = 'Add Provider';
        document.getElementById('providerEditIndex').value = '-1';
        document.getElementById('providerName').value = '';
        document.getElementById('providerBaseUrl').value = '';
        document.getElementById('providerApiKey').value = '';
        document.getElementById('providerFormat').value = 'anthropic';
        modelMappings = [];
        customHeaders = [];
      }

      renderModelMappings();
      renderCustomHeaders();
      modal.classList.add('active');
    }

    function closeProviderModal() {
      document.getElementById('providerModal').classList.remove('active');
    }

    function toggleApiKeyVisibility() {
      var input = document.getElementById('providerApiKey');
      var btn = input.parentElement.querySelector('.password-toggle');
      if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = 'Hide';
      } else {
        input.type = 'password';
        btn.textContent = 'Show';
      }
    }

    function renderModelMappings() {
      var container = document.getElementById('modelMappingEditor');
      container.innerHTML = modelMappings.map(function(m, i) {
        var options = '<option value="">-- Select model --</option>' +
          CLAUDE_MODELS.map(function(cm) {
            var selected = cm.id === m.key ? ' selected' : '';
            return '<option value="' + escapeHtml(cm.id) + '"' + selected + '>' + escapeHtml(cm.label) + '</option>';
          }).join('');
        return '<div class="kv-row">' +
          '<select onchange="modelMappings[' + i + '].key=this.value">' + options + '</select>' +
          '<input type="text" placeholder="Target model" value="' + escapeHtml(m.value) + '" onchange="modelMappings[' + i + '].value=this.value">' +
          '<button class="kv-remove" onclick="modelMappings.splice(' + i + ',1);renderModelMappings()">&times;</button>' +
        '</div>';
      }).join('');
    }

    function addModelMapping() {
      modelMappings.push({ key: '', value: '' });
      renderModelMappings();
    }

    function renderCustomHeaders() {
      var container = document.getElementById('customHeadersEditor');
      container.innerHTML = customHeaders.map(function(h, i) {
        return '<div class="kv-row">' +
          '<input type="text" placeholder="Header name" value="' + escapeHtml(h.key) + '" onchange="customHeaders[' + i + '].key=this.value">' +
          '<input type="text" placeholder="Header value" value="' + escapeHtml(h.value) + '" onchange="customHeaders[' + i + '].value=this.value">' +
          '<button class="kv-remove" onclick="customHeaders.splice(' + i + ',1);renderCustomHeaders()">&times;</button>' +
        '</div>';
      }).join('');
    }

    function addCustomHeader() {
      customHeaders.push({ key: '', value: '' });
      renderCustomHeaders();
    }

    function getProviderFromForm() {
      var name = document.getElementById('providerName').value.trim();
      var baseUrl = document.getElementById('providerBaseUrl').value.trim();
      var apiKey = document.getElementById('providerApiKey').value.trim();

      if (!name || !baseUrl || !apiKey) {
        showStatus('Name, Base URL, and API Key are required', true);
        return null;
      }

      var format = document.getElementById('providerFormat').value;
      var provider = { name: name, baseUrl: baseUrl, apiKey: apiKey };
      if (format && format !== 'anthropic') provider.format = format;

      var mapping = {};
      var hasMapping = false;
      modelMappings.forEach(function(m) {
        if (m.key && m.value) {
          mapping[m.key] = m.value;
          hasMapping = true;
        }
      });
      if (hasMapping) provider.modelMapping = mapping;

      var hdrs = {};
      var hasHeaders = false;
      customHeaders.forEach(function(h) {
        if (h.key && h.value) {
          hdrs[h.key] = h.value;
          hasHeaders = true;
        }
      });
      if (hasHeaders) provider.headers = hdrs;

      return provider;
    }

    function saveProvider() {
      var provider = getProviderFromForm();
      if (!provider) return;

      var editIndex = parseInt(document.getElementById('providerEditIndex').value, 10);
      if (editIndex >= 0) {
        providers[editIndex] = provider;
      } else {
        providers.push(provider);
      }

      renderProviders();
      persistProviders();
      closeProviderModal();
    }

    var lastTestResults = [];

    async function testConnection() {
      var provider = getProviderFromForm();
      if (!provider) return;

      var container = document.getElementById('testResult');
      var btn = document.getElementById('testConnectionBtn');
      container.innerHTML = '<div class="test-results-container loading">Testing models...</div>';
      btn.disabled = true;

      try {
        var res = await fetch('/admin/test-provider?token=' + TOKEN, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(provider)
        });
        var data = await res.json();

        if (data.results) {
          lastTestResults = data.results;
          var html = '<div class="test-results-container">';
          data.results.forEach(function(r) {
            var icon = r.success ? '&#10003;' : '&#10007;';
            var cls = r.success ? 'success' : 'error';
            var detail = r.success
              ? (r.mappedTo ? 'mapped to ' + escapeHtml(r.mappedTo) : 'OK')
              : escapeHtml(r.error || 'Failed');
            html += '<div class="test-model-row ' + cls + '">' +
              '<span class="test-model-icon">' + icon + '</span>' +
              '<span class="test-model-name">' + escapeHtml(r.label) + '</span>' +
              '<span class="test-model-detail">' + detail + '</span>' +
            '</div>';
          });

          if (data.suggestion) {
            html += '<div class="test-suggestion">' +
              escapeHtml(data.suggestion) +
              ' <a onclick="suggestMappings()">Add mappings</a>' +
            '</div>';
          }

          html += '</div>';
          container.innerHTML = html;
        } else if (data.error) {
          container.innerHTML = '<div class="test-results-container">' +
            '<div class="test-model-row error">' +
              '<span class="test-model-icon">&#10007;</span>' +
              '<span>' + escapeHtml(data.error) + '</span>' +
            '</div></div>';
        }
      } catch (e) {
        container.innerHTML = '<div class="test-results-container">' +
          '<div class="test-model-row error">' +
            '<span class="test-model-icon">&#10007;</span>' +
            '<span>Error: ' + escapeHtml(e.message) + '</span>' +
          '</div></div>';
      } finally {
        btn.disabled = false;
      }
    }

    function suggestMappings() {
      lastTestResults.forEach(function(r) {
        if (r.success || r.hasMappingConfigured) return;
        var alreadyMapped = modelMappings.some(function(m) { return m.key === r.model; });
        if (!alreadyMapped) {
          modelMappings.push({ key: r.model, value: '' });
        }
      });
      renderModelMappings();
      var editor = document.getElementById('modelMappingEditor');
      if (editor) editor.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    async function persistProviders() {
      try {
        var res = await fetch('/admin/config?token=' + TOKEN, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(providers)
        });
        if (res.ok) {
          showStatus('Providers saved!');
        } else {
          showStatus('Failed to save: ' + await res.text(), true);
        }
      } catch (e) {
        showStatus('Error: ' + e.message, true);
      }
    }

    // ---- Provider Drag & Drop ----
    var dragSourceIndex = -1;

    function reorderProvider(fromIndex, toIndex) {
      if (fromIndex === toIndex) return;
      if (fromIndex < 0 || fromIndex >= providers.length) return;
      if (toIndex < 0 || toIndex >= providers.length) return;
      var item = providers.splice(fromIndex, 1)[0];
      providers.splice(toIndex, 0, item);
      renderProviders();
      persistProviders();
    }

    async function toggleAnthropicPrimary(enabled) {
      var disabled = !enabled;
      try {
        var res = await fetch('/admin/anthropic-status?token=' + TOKEN, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ disabled: disabled })
        });
        if (res.ok) {
          anthropicDisabled = disabled;
          renderProviders();
          showStatus(disabled ? 'Anthropic API disabled' : 'Anthropic API enabled');
        } else {
          showStatus('Failed to update: ' + await res.text(), true);
        }
      } catch (e) {
        showStatus('Error: ' + e.message, true);
      }
    }

    function toggleProvider(index, enabled) {
      providers[index].disabled = !enabled;
      renderProviders();
      persistProviders();
    }

    function onDragStart(event, index) {
      dragSourceIndex = index;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
      setTimeout(function() {
        var cards = document.querySelectorAll('.provider-card');
        if (cards[index]) cards[index].classList.add('dragging');
      }, 0);
    }

    function onDragOver(event) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    }

    function onDragEnter(event) {
      event.preventDefault();
      var card = event.target.closest('.provider-card');
      if (card && parseInt(card.getAttribute('data-index'), 10) !== dragSourceIndex) {
        card.classList.add('drag-over');
      }
    }

    function onDragLeave(event) {
      var card = event.target.closest('.provider-card');
      if (card) {
        var related = event.relatedTarget;
        if (!card.contains(related)) {
          card.classList.remove('drag-over');
        }
      }
    }

    function onDrop(event, targetIndex) {
      event.preventDefault();
      var card = event.target.closest('.provider-card');
      if (card) card.classList.remove('drag-over');
      if (dragSourceIndex === targetIndex || dragSourceIndex < 0) return;
      reorderProvider(dragSourceIndex, targetIndex);
    }

    function onDragEnd() {
      dragSourceIndex = -1;
      var cards = document.querySelectorAll('.provider-card');
      for (var i = 0; i < cards.length; i++) {
        cards[i].classList.remove('dragging');
        cards[i].classList.remove('drag-over');
      }
    }

    // Touch drag support
    var touchDragState = null;

    function onTouchStart(event, index) {
      var handle = event.target.closest('.drag-handle');
      if (!handle) return;
      var touch = event.touches[0];
      var card = event.target.closest('.provider-card');
      if (!card) return;
      event.preventDefault();

      var rect = card.getBoundingClientRect();
      var clone = card.cloneNode(true);
      clone.style.position = 'fixed';
      clone.style.width = rect.width + 'px';
      clone.style.top = rect.top + 'px';
      clone.style.left = rect.left + 'px';
      clone.style.zIndex = '1000';
      clone.style.opacity = '0.8';
      clone.style.pointerEvents = 'none';
      clone.style.boxShadow = '0 8px 24px rgba(0,0,0,0.2)';
      document.body.appendChild(clone);
      card.style.opacity = '0.3';

      touchDragState = {
        index: index,
        element: card,
        clone: clone,
        offsetY: touch.clientY - rect.top
      };
      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('touchend', onTouchEnd);
      document.addEventListener('touchcancel', onTouchEnd);
    }

    var touchOverIndex = -1;

    function onTouchMove(event) {
      if (!touchDragState) return;
      event.preventDefault();
      var touch = event.touches[0];
      touchDragState.clone.style.top = (touch.clientY - touchDragState.offsetY) + 'px';
      var cards = document.querySelectorAll('.provider-card');
      touchOverIndex = -1;
      for (var i = 0; i < cards.length; i++) {
        cards[i].classList.remove('drag-over');
        var rect = cards[i].getBoundingClientRect();
        if (touch.clientY > rect.top && touch.clientY < rect.bottom && i !== touchDragState.index) {
          cards[i].classList.add('drag-over');
          touchOverIndex = i;
        }
      }
    }

    function onTouchEnd() {
      if (!touchDragState) return;
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchEnd);
      if (touchDragState.clone.parentNode) {
        touchDragState.clone.parentNode.removeChild(touchDragState.clone);
      }
      touchDragState.element.style.opacity = '';
      var cards = document.querySelectorAll('.provider-card');
      for (var i = 0; i < cards.length; i++) {
        cards[i].classList.remove('drag-over');
      }
      if (touchOverIndex >= 0 && touchOverIndex !== touchDragState.index) {
        reorderProvider(touchDragState.index, touchOverIndex);
      }
      touchDragState = null;
      touchOverIndex = -1;
    }

    // ---- Settings ----
    async function saveSettings() {
      try {
        var cooldown = parseInt(document.getElementById('cooldownInput').value, 10);
        var res = await fetch('/admin/settings?token=' + TOKEN, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cooldownDuration: cooldown })
        });
        if (res.ok) {
          showStatus('Settings saved!');
        } else {
          showStatus('Failed to save settings: ' + await res.text(), true);
        }
      } catch (e) {
        showStatus('Error: ' + e.message, true);
      }
    }

    // ---- JSON Editor ----
    function toggleJsonEditor() {
      var trigger = document.querySelector('#json-section .collapsible-trigger');
      var content = document.getElementById('jsonEditorSection');
      trigger.classList.toggle('open');
      content.classList.toggle('open');
      if (content.classList.contains('open')) {
        document.getElementById('jsonEditor').value = JSON.stringify(providers, null, 2);
      }
    }

    function formatJson() {
      try {
        var json = JSON.parse(document.getElementById('jsonEditor').value);
        document.getElementById('jsonEditor').value = JSON.stringify(json, null, 2);
      } catch (e) {
        showStatus('Invalid JSON: ' + e.message, true);
      }
    }

    async function saveJson() {
      try {
        providers = JSON.parse(document.getElementById('jsonEditor').value);
        await persistProviders();
        renderProviders();
      } catch (e) {
        showStatus('Invalid JSON: ' + e.message, true);
      }
    }

    // ---- Init ----
    renderProviders();
    renderTokens();
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
      if (p.format && p.format !== "anthropic" && p.format !== "openai") {
        return c.json(
          { error: `Invalid provider format: must be "anthropic" or "openai"` },
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
  const raw = await getRawTokens(c.env);
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) {
    return c.json(parseTokenConfigs(parsed));
  }
  return c.json([]);
}

/**
 * POST /admin/tokens - Save allowed tokens
 */
export async function postTokens(c: Context<{ Bindings: Bindings }>) {
  try {
    const tokens = await c.req.json<unknown[]>();

    // Validate
    if (!Array.isArray(tokens)) {
      return c.json({ error: "Tokens must be an array" }, 400);
    }

    // Validate note format if present
    const notePattern = /^[a-zA-Z0-9 -]*$/;
    for (const item of tokens) {
      if (
        item &&
        typeof item === "object" &&
        "note" in item &&
        (item as TokenConfig).note
      ) {
        if (!notePattern.test((item as TokenConfig).note!)) {
          return c.json(
            {
              error:
                "Token note must contain only English letters, numbers, spaces, and hyphens",
            },
            400,
          );
        }
      }
    }

    const validTokens = parseTokenConfigs(tokens);

    await saveTokens(c.env, validTokens);
    return c.json({ success: true, count: validTokens.length });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
}

/**
 * GET /admin/settings - Get global settings
 */
export async function getSettings(c: Context<{ Bindings: Bindings }>) {
  const cooldown = await getRawCooldown(c.env);
  return c.json({ cooldownDuration: cooldown });
}

const TEST_MODELS = [
  { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { id: "claude-opus-4-20250514", label: "Claude Opus 4" },
  { id: "claude-opus-4-6-20250415", label: "Claude Opus 4.6" },
  { id: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku" },
];

interface ModelTestResult {
  model: string;
  label: string;
  success: boolean;
  message?: string;
  error?: string;
  mappedTo?: string;
  hasMappingConfigured: boolean;
}

async function testSingleModel(
  provider: ProviderConfig,
  modelId: string,
  modelLabel: string,
): Promise<ModelTestResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const hasMappingConfigured = !!(
    provider.modelMapping && provider.modelMapping[modelId]
  );
  const mappedModel = hasMappingConfigured
    ? provider.modelMapping![modelId]
    : modelId;

  try {
    const headerName = provider.authHeader || "x-api-key";
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };

    if (headerName === "Authorization") {
      headers["Authorization"] = provider.apiKey.startsWith("Bearer ")
        ? provider.apiKey
        : `Bearer ${provider.apiKey}`;
    } else {
      headers[headerName] = provider.apiKey;
    }

    if (provider.headers) {
      Object.assign(headers, provider.headers);
    }

    let testBody: any = {
      model: mappedModel,
      max_tokens: 1,
      messages: [{ role: "user", content: "Hi" }],
    };

    if (provider.format === "openai") {
      testBody = convertAnthropicToOpenAI(testBody);
    }

    const response = await fetch(provider.baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(testBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return {
        model: modelId,
        label: modelLabel,
        success: true,
        message: `HTTP ${response.status}`,
        mappedTo: hasMappingConfigured ? mappedModel : undefined,
        hasMappingConfigured,
      };
    }

    const errorText = await response.text();
    let errorMessage = `HTTP ${response.status}`;
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage =
        errorJson.error?.message || errorJson.message || errorMessage;
    } catch {
      if (errorText.length < 200) {
        errorMessage = errorText || errorMessage;
      }
    }

    return {
      model: modelId,
      label: modelLabel,
      success: false,
      error: errorMessage,
      mappedTo: hasMappingConfigured ? mappedModel : undefined,
      hasMappingConfigured,
    };
  } catch (error: any) {
    clearTimeout(timeoutId);
    return {
      model: modelId,
      label: modelLabel,
      success: false,
      error:
        error.name === "AbortError"
          ? "Connection timed out (10s)"
          : error.message,
      mappedTo: hasMappingConfigured ? mappedModel : undefined,
      hasMappingConfigured,
    };
  }
}

/**
 * POST /admin/test-provider - Test connection to a provider
 * Tests multiple Claude models in parallel and returns per-model results.
 */
export async function testProvider(c: Context<{ Bindings: Bindings }>) {
  try {
    const provider = await c.req.json<ProviderConfig>();

    if (!provider.name || !provider.baseUrl || !provider.apiKey) {
      return c.json(
        { success: false, error: "Missing name, baseUrl, or apiKey" },
        400,
      );
    }

    const results = await Promise.all(
      TEST_MODELS.map((m) => testSingleModel(provider, m.id, m.label)),
    );

    const allSuccess = results.every((r) => r.success);

    const failedWithoutMapping = results.filter(
      (r) => !r.success && !r.hasMappingConfigured,
    );

    let suggestion: string | undefined;
    if (failedWithoutMapping.length > 0) {
      const modelNames = failedWithoutMapping.map((r) => r.label).join(", ");
      suggestion = `Consider adding model mappings for: ${modelNames}. Your provider may use different model names.`;
    }

    return c.json({
      success: allSuccess,
      results,
      suggestion,
    });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 400);
  }
}

/**
 * GET /admin/anthropic-status - Get Anthropic primary disabled state
 */
export async function getAnthropicStatus(c: Context<{ Bindings: Bindings }>) {
  const disabled = await getRawAnthropicDisabled(c.env);
  return c.json({ disabled });
}

/**
 * POST /admin/anthropic-status - Set Anthropic primary disabled state
 */
export async function postAnthropicStatus(c: Context<{ Bindings: Bindings }>) {
  try {
    const body = await c.req.json<{ disabled: boolean }>();
    if (typeof body.disabled !== "boolean") {
      return c.json({ error: "disabled must be a boolean" }, 400);
    }
    await saveAnthropicDisabled(c.env, body.disabled);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
}

/**
 * POST /admin/settings - Save global settings
 */
export async function postSettings(c: Context<{ Bindings: Bindings }>) {
  try {
    const body = await c.req.json<{ cooldownDuration: number }>();
    if (
      typeof body.cooldownDuration !== "number" ||
      body.cooldownDuration < 0
    ) {
      return c.json({ error: "Invalid cooldown duration" }, 400);
    }

    await saveCooldown(c.env, body.cooldownDuration);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
}

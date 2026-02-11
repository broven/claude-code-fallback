import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import {
  authMiddleware,
  loginPage,
  adminPage,
  getConfig,
  postConfig,
  getTokens,
  postTokens,
  getSettings,
  postSettings,
  testProvider,
} from "../admin";
import { Bindings } from "../types";
import { createMockBindings } from "./mocks/kv";
import {
  validProvider,
  minimalProvider,
  multipleProviders,
  invalidProviderMissingName,
  invalidProviderMissingApiKey,
} from "./fixtures/providers";

// Helper to create a Hono app with routes for testing
function createTestApp() {
  const app = new Hono<{ Bindings: Bindings }>();
  app.get("/admin/login", loginPage);
  app.get("/admin", authMiddleware, adminPage);
  app.get("/admin/config", authMiddleware, getConfig);
  app.post("/admin/config", authMiddleware, postConfig);
  app.get("/admin/tokens", authMiddleware, getTokens);
  app.post("/admin/tokens", authMiddleware, postTokens);
  app.get("/admin/settings", authMiddleware, getSettings);
  app.post("/admin/settings", authMiddleware, postSettings);
  app.post("/admin/test-provider", authMiddleware, testProvider);
  return app;
}

// Helper to create a request
function createRequest(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string;
    authHeader?: string;
  } = {},
) {
  const { method = "GET", body, token, authHeader } = options;
  const url = token
    ? `http://localhost${path}?token=${token}`
    : `http://localhost${path}`;
  const headers: Record<string, string> = {};

  if (body) {
    headers["Content-Type"] = "application/json";
  }

  if (authHeader) {
    headers["Authorization"] = authHeader;
  }

  return new Request(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("authMiddleware", () => {
  let app: Hono<{ Bindings: Bindings }>;

  beforeEach(() => {
    app = createTestApp();
  });

  describe("token authentication", () => {
    it("allows access with valid token in query string", async () => {
      const env = createMockBindings({ adminToken: "valid-token" });
      const request = createRequest("/admin/config", { token: "valid-token" });

      const response = await app.fetch(request, env);

      expect(response.status).toBe(200);
    });

    it("allows access with valid token in Authorization header", async () => {
      const env = createMockBindings({ adminToken: "valid-token" });
      const request = createRequest("/admin/config", {
        authHeader: "Bearer valid-token",
      });

      const response = await app.fetch(request, env);

      expect(response.status).toBe(200);
    });

    it("returns 401 for invalid token", async () => {
      const env = createMockBindings({ adminToken: "valid-token" });
      const request = createRequest("/admin/config", { token: "wrong-token" });

      const response = await app.fetch(request, env);

      expect(response.status).toBe(401);
      expect(await response.text()).toBe("Unauthorized");
    });

    it("returns 401 when token is missing", async () => {
      const env = createMockBindings({ adminToken: "valid-token" });
      const request = createRequest("/admin/config");

      const response = await app.fetch(request, env);

      expect(response.status).toBe(401);
    });

    it("returns 500 when ADMIN_TOKEN is not configured", async () => {
      const env = createMockBindings();
      env.ADMIN_TOKEN = "";
      const request = createRequest("/admin/config", { token: "any-token" });

      const response = await app.fetch(request, env);

      expect(response.status).toBe(500);
      expect(await response.text()).toBe("ADMIN_TOKEN not configured");
    });

    it("prefers query token over Authorization header", async () => {
      const env = createMockBindings({ adminToken: "valid-token" });
      const request = createRequest("/admin/config", {
        token: "valid-token",
        authHeader: "Bearer wrong-token",
      });

      const response = await app.fetch(request, env);

      expect(response.status).toBe(200);
    });

    it("handles Bearer prefix correctly", async () => {
      const env = createMockBindings({ adminToken: "my-secret-token" });
      const request = createRequest("/admin/config", {
        authHeader: "Bearer my-secret-token",
      });

      const response = await app.fetch(request, env);

      expect(response.status).toBe(200);
    });

    it("redirects to /admin/login when token is missing on GET /admin", async () => {
      const env = createMockBindings({ adminToken: "valid-token" });
      // Browser navigation includes Accept: text/html
      const request = new Request("http://localhost/admin", {
        headers: { "Accept": "text/html,application/xhtml+xml" },
      });

      const response = await app.fetch(request, env);

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin/login");
    });
  });
});

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

describe("adminPage", () => {
  let app: Hono<{ Bindings: Bindings }>;

  beforeEach(() => {
    app = createTestApp();
  });

  it("returns HTML content type", async () => {
    const env = createMockBindings({ adminToken: "test-token" });
    const request = createRequest("/admin", { token: "test-token" });

    const response = await app.fetch(request, env);

    expect(response.headers.get("content-type")).toContain("text/html");
  });

  it("includes admin page title", async () => {
    const env = createMockBindings({ adminToken: "test-token" });
    const request = createRequest("/admin", { token: "test-token" });

    const response = await app.fetch(request, env);
    const html = await response.text();

    expect(html).toContain("Claude Code Fallback");
    expect(html).toContain("Admin");
  });

  it("includes token in rendered page for client-side use", async () => {
    const env = createMockBindings({ adminToken: "test-token" });
    const request = createRequest("/admin", { token: "test-token" });

    const response = await app.fetch(request, env);
    const html = await response.text();

    expect(html).toContain("test-token");
  });

  it("includes current config in rendered page", async () => {
    const env = createMockBindings({
      adminToken: "test-token",
      kvData: { providers: JSON.stringify([validProvider]) },
    });
    const request = createRequest("/admin", { token: "test-token" });

    const response = await app.fetch(request, env);
    const html = await response.text();

    expect(html).toContain("openrouter");
  });

  it("escapes HTML in config data", async () => {
    const providerWithXss = {
      name: '<script>alert("xss")</script>',
      baseUrl: "https://api.example.com",
      apiKey: "test-key",
    };
    const env = createMockBindings({
      adminToken: "test-token",
      kvData: { providers: JSON.stringify([providerWithXss]) },
    });
    const request = createRequest("/admin", { token: "test-token" });

    const response = await app.fetch(request, env);
    const html = await response.text();

    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain("&lt;script&gt;");
  });

  it("returns 200 status", async () => {
    const env = createMockBindings({ adminToken: "test-token" });
    const request = createRequest("/admin", { token: "test-token" });

    const response = await app.fetch(request, env);

    expect(response.status).toBe(200);
  });

  it("uses sectioned layout instead of tabs", async () => {
    const env = createMockBindings({ adminToken: "test-token" });
    const request = createRequest("/admin", { token: "test-token" });

    const response = await app.fetch(request, env);
    const html = await response.text();

    // Should have sections, not tabs
    expect(html).toContain("tokens-section");
    expect(html).toContain("providers-section");
    expect(html).toContain("settings-section");
    expect(html).toContain("json-section");
    // Should not have tab navigation
    expect(html).not.toContain("switchView('visual')");
    expect(html).not.toContain("switchView('tokens')");
  });

  it("includes provider modal", async () => {
    const env = createMockBindings({ adminToken: "test-token" });
    const request = createRequest("/admin", { token: "test-token" });

    const response = await app.fetch(request, env);
    const html = await response.text();

    expect(html).toContain("providerModal");
    expect(html).toContain("Test Connection");
  });

  it("does not include authHeader input in provider modal", async () => {
    const env = createMockBindings({ adminToken: "test-token" });
    const request = createRequest("/admin", { token: "test-token" });

    const response = await app.fetch(request, env);
    const html = await response.text();

    expect(html).not.toContain("providerAuthHeader");
    expect(html).not.toContain("Auth Header");
  });

  it("uses select dropdown for model mapping source models", async () => {
    const env = createMockBindings({ adminToken: "test-token" });
    const request = createRequest("/admin", { token: "test-token" });

    const response = await app.fetch(request, env);
    const html = await response.text();

    // Should define CLAUDE_MODELS array in JS
    expect(html).toContain("CLAUDE_MODELS");
    expect(html).toContain("claude-sonnet-4-5-20250929");
    expect(html).toContain("claude-opus-4-20250514");
    expect(html).toContain("claude-haiku-4-5-20251001");
    // renderModelMappings should use <select> not <input> for source
    expect(html).toContain("<select");
    expect(html).toContain("Select model");
  });

  it("does not show Auth: in provider card meta", async () => {
    const env = createMockBindings({
      adminToken: "test-token",
      kvData: { providers: JSON.stringify([validProvider]) },
    });
    const request = createRequest("/admin", { token: "test-token" });

    const response = await app.fetch(request, env);
    const html = await response.text();

    // The card meta should not show Auth: prefix
    expect(html).not.toContain("'Auth: '");
  });

  it("includes drag-and-drop support on provider cards", async () => {
    const env = createMockBindings({
      adminToken: "test-token",
      kvData: { providers: JSON.stringify([validProvider]) },
    });
    const request = createRequest("/admin", { token: "test-token" });

    const response = await app.fetch(request, env);
    const html = await response.text();

    expect(html).toContain('draggable="true"');
    expect(html).toContain("onDragStart");
    expect(html).toContain("onDrop");
    expect(html).toContain("drag-handle");
    expect(html).toContain("priority-badge");
  });

  it("includes toggle switch for provider enable/disable", async () => {
    const env = createMockBindings({
      adminToken: "test-token",
      kvData: { providers: JSON.stringify(multipleProviders) },
    });
    const request = createRequest("/admin", { token: "test-token" });

    const response = await app.fetch(request, env);
    const html = await response.text();

    expect(html).toContain("toggle-switch");
    expect(html).toContain("toggleProvider");
    expect(html).toContain("toggleAnthropicPrimary");
    expect(html).toContain("reorderProvider");
  });

  it("includes touch drag support", async () => {
    const env = createMockBindings({ adminToken: "test-token" });
    const request = createRequest("/admin", { token: "test-token" });

    const response = await app.fetch(request, env);
    const html = await response.text();

    expect(html).toContain("onTouchStart");
    expect(html).toContain("onTouchMove");
    expect(html).toContain("onTouchEnd");
  });
});

describe("adminPage token persistence", () => {
  let app: Hono<{ Bindings: Bindings }>;

  beforeEach(() => {
    app = createTestApp();
  });

  it("includes localStorage save logic in admin page", async () => {
    const env = createMockBindings({ adminToken: "valid-token" });
    const request = createRequest("/admin", { token: "valid-token" });

    const response = await app.fetch(request, env);
    const html = await response.text();

    expect(html).toContain("localStorage.setItem");
    expect(html).toContain("admin_token");
  });

  it("uses Authorization header for API calls instead of query params", async () => {
    const env = createMockBindings({ adminToken: "valid-token" });
    const request = createRequest("/admin", { token: "valid-token" });

    const response = await app.fetch(request, env);
    const html = await response.text();

    // Should use Authorization header in fetch calls
    expect(html).toContain("'Authorization': 'Bearer ' + TOKEN");
  });
});

describe("getConfig", () => {
  let app: Hono<{ Bindings: Bindings }>;

  beforeEach(() => {
    app = createTestApp();
  });

  it("returns JSON content type", async () => {
    const env = createMockBindings({ adminToken: "test-token" });
    const request = createRequest("/admin/config", { token: "test-token" });

    const response = await app.fetch(request, env);

    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("returns empty array when no providers configured", async () => {
    const env = createMockBindings({ adminToken: "test-token" });
    const request = createRequest("/admin/config", { token: "test-token" });

    const response = await app.fetch(request, env);
    const data = await response.json();

    expect(data).toEqual([]);
  });

  it("returns single provider", async () => {
    const env = createMockBindings({
      adminToken: "test-token",
      kvData: { providers: JSON.stringify([validProvider]) },
    });
    const request = createRequest("/admin/config", { token: "test-token" });

    const response = await app.fetch(request, env);
    const data = (await response.json()) as { name: string }[];

    expect(data).toHaveLength(1);
    expect(data[0].name).toBe(validProvider.name);
  });

  it("returns multiple providers", async () => {
    const env = createMockBindings({
      adminToken: "test-token",
      kvData: { providers: JSON.stringify(multipleProviders) },
    });
    const request = createRequest("/admin/config", { token: "test-token" });

    const response = await app.fetch(request, env);
    const data = await response.json();

    expect(data).toHaveLength(3);
  });

  it("includes all provider properties in response", async () => {
    const env = createMockBindings({
      adminToken: "test-token",
      kvData: { providers: JSON.stringify([validProvider]) },
    });
    const request = createRequest("/admin/config", { token: "test-token" });

    const response = await app.fetch(request, env);
    const data = (await response.json()) as (typeof validProvider)[];

    expect(data[0]).toEqual(validProvider);
  });

  it("returns 200 status", async () => {
    const env = createMockBindings({ adminToken: "test-token" });
    const request = createRequest("/admin/config", { token: "test-token" });

    const response = await app.fetch(request, env);

    expect(response.status).toBe(200);
  });
});

describe("postConfig", () => {
  let app: Hono<{ Bindings: Bindings }>;

  beforeEach(() => {
    app = createTestApp();
  });

  describe("successful saves", () => {
    it("saves single valid provider", async () => {
      const env = createMockBindings({ adminToken: "test-token" });
      const request = createRequest("/admin/config", {
        method: "POST",
        token: "test-token",
        body: [validProvider],
      });

      const response = await app.fetch(request, env);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ success: true, count: 1 });
    });

    it("saves multiple valid providers", async () => {
      const env = createMockBindings({ adminToken: "test-token" });
      const request = createRequest("/admin/config", {
        method: "POST",
        token: "test-token",
        body: multipleProviders,
      });

      const response = await app.fetch(request, env);
      const data = await response.json();

      expect(data).toEqual({ success: true, count: 3 });
    });

    it("saves empty array", async () => {
      const env = createMockBindings({ adminToken: "test-token" });
      const request = createRequest("/admin/config", {
        method: "POST",
        token: "test-token",
        body: [],
      });

      const response = await app.fetch(request, env);
      const data = await response.json();

      expect(data).toEqual({ success: true, count: 0 });
    });

    it("persists saved config", async () => {
      const env = createMockBindings({ adminToken: "test-token" });
      const saveRequest = createRequest("/admin/config", {
        method: "POST",
        token: "test-token",
        body: [validProvider],
      });

      await app.fetch(saveRequest, env);

      // Verify by fetching config
      const getRequest = createRequest("/admin/config", {
        token: "test-token",
      });
      const response = await app.fetch(getRequest, env);
      const data = (await response.json()) as (typeof validProvider)[];

      expect(data).toHaveLength(1);
      expect(data[0].name).toBe(validProvider.name);
    });

    it("overwrites existing config", async () => {
      const env = createMockBindings({
        adminToken: "test-token",
        kvData: { providers: JSON.stringify([validProvider]) },
      });
      const request = createRequest("/admin/config", {
        method: "POST",
        token: "test-token",
        body: [minimalProvider],
      });

      await app.fetch(request, env);

      // Verify overwrite
      const getRequest = createRequest("/admin/config", {
        token: "test-token",
      });
      const response = await app.fetch(getRequest, env);
      const data = (await response.json()) as (typeof minimalProvider)[];

      expect(data).toHaveLength(1);
      expect(data[0].name).toBe(minimalProvider.name);
    });
  });

  describe("validation errors", () => {
    it("returns 400 when body is not an array", async () => {
      const env = createMockBindings({ adminToken: "test-token" });
      const request = createRequest("/admin/config", {
        method: "POST",
        token: "test-token",
        body: { notAnArray: true },
      });

      const response = await app.fetch(request, env);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: "Config must be an array" });
    });

    it("returns 400 when provider missing name", async () => {
      const env = createMockBindings({ adminToken: "test-token" });
      const request = createRequest("/admin/config", {
        method: "POST",
        token: "test-token",
        body: [invalidProviderMissingName],
      });

      const response = await app.fetch(request, env);
      const data = (await response.json()) as { error: string };

      expect(response.status).toBe(400);
      expect(data.error).toContain("missing name, baseUrl, or apiKey");
    });

    it("returns 400 when provider missing baseUrl", async () => {
      const env = createMockBindings({ adminToken: "test-token" });
      const request = createRequest("/admin/config", {
        method: "POST",
        token: "test-token",
        body: [{ name: "test", apiKey: "key" }],
      });

      const response = await app.fetch(request, env);

      expect(response.status).toBe(400);
    });

    it("returns 400 when provider missing apiKey", async () => {
      const env = createMockBindings({ adminToken: "test-token" });
      const request = createRequest("/admin/config", {
        method: "POST",
        token: "test-token",
        body: [invalidProviderMissingApiKey],
      });

      const response = await app.fetch(request, env);

      expect(response.status).toBe(400);
    });

    it("returns 400 for invalid JSON body", async () => {
      const env = createMockBindings({ adminToken: "test-token" });
      const request = new Request(
        "http://localhost/admin/config?token=test-token",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "not valid json{",
        },
      );

      const response = await app.fetch(request, env);

      expect(response.status).toBe(400);
    });

    it("validates all providers in array", async () => {
      const env = createMockBindings({ adminToken: "test-token" });
      const request = createRequest("/admin/config", {
        method: "POST",
        token: "test-token",
        body: [validProvider, invalidProviderMissingName],
      });

      const response = await app.fetch(request, env);

      expect(response.status).toBe(400);
    });
  });

  describe("edge cases", () => {
    it("handles provider with minimal fields", async () => {
      const env = createMockBindings({ adminToken: "test-token" });
      const request = createRequest("/admin/config", {
        method: "POST",
        token: "test-token",
        body: [minimalProvider],
      });

      const response = await app.fetch(request, env);

      expect(response.status).toBe(200);
    });

    it("preserves optional provider fields", async () => {
      const env = createMockBindings({ adminToken: "test-token" });
      const request = createRequest("/admin/config", {
        method: "POST",
        token: "test-token",
        body: [validProvider],
      });

      await app.fetch(request, env);

      // Verify optional fields preserved
      const getRequest = createRequest("/admin/config", {
        token: "test-token",
      });
      const response = await app.fetch(getRequest, env);
      const data = (await response.json()) as (typeof validProvider)[];

      expect(data[0].authHeader).toBe(validProvider.authHeader);
      expect(data[0].modelMapping).toEqual(validProvider.modelMapping);
    });

    it("handles large number of providers", async () => {
      const env = createMockBindings({ adminToken: "test-token" });
      const manyProviders = Array.from({ length: 50 }, (_, i) => ({
        name: `provider-${i}`,
        baseUrl: `https://api${i}.example.com`,
        apiKey: `key-${i}`,
      }));
      const request = createRequest("/admin/config", {
        method: "POST",
        token: "test-token",
        body: manyProviders,
      });

      const response = await app.fetch(request, env);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ success: true, count: 50 });
    });
  });
});

describe("settings API", () => {
  let app: Hono<{ Bindings: Bindings }>;

  beforeEach(() => {
    app = createTestApp();
  });

  it("GET /admin/settings returns default cooldown from env", async () => {
    const env = createMockBindings({ adminToken: "test-token" });
    env.COOLDOWN_DURATION = "300";
    const request = createRequest("/admin/settings", { token: "test-token" });

    const response = await app.fetch(request, env);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ cooldownDuration: 300 });
  });

  it("GET /admin/settings returns stored cooldown", async () => {
    const env = createMockBindings({
      adminToken: "test-token",
      kvData: { cooldown_duration: "600" },
    });
    const request = createRequest("/admin/settings", { token: "test-token" });

    const response = await app.fetch(request, env);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ cooldownDuration: 600 });
  });

  it("POST /admin/settings saves cooldown", async () => {
    const env = createMockBindings({ adminToken: "test-token" });
    const request = createRequest("/admin/settings", {
      method: "POST",
      token: "test-token",
      body: { cooldownDuration: 120 },
    });

    const response = await app.fetch(request, env);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });

    // Verify persistence
    const val = await env.CONFIG_KV.get("cooldown_duration");
    expect(val).toBe("120");
  });

  it("POST /admin/settings validates input", async () => {
    const env = createMockBindings({ adminToken: "test-token" });
    const request = createRequest("/admin/settings", {
      method: "POST",
      token: "test-token",
      body: { cooldownDuration: "invalid" },
    });

    const response = await app.fetch(request, env);

    expect(response.status).toBe(400);
  });

  it("POST /admin/settings rejects negative values", async () => {
    const env = createMockBindings({ adminToken: "test-token" });
    const request = createRequest("/admin/settings", {
      method: "POST",
      token: "test-token",
      body: { cooldownDuration: -10 },
    });

    const response = await app.fetch(request, env);

    expect(response.status).toBe(400);
  });
});

describe("tokens API (TokenConfig format)", () => {
  let app: Hono<{ Bindings: Bindings }>;

  beforeEach(() => {
    app = createTestApp();
  });

  describe("GET /admin/tokens", () => {
    it("returns empty array when no tokens configured", async () => {
      const env = createMockBindings({ adminToken: "test-token" });
      const request = createRequest("/admin/tokens", { token: "test-token" });

      const response = await app.fetch(request, env);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual([]);
    });

    it("returns TokenConfig array for new format", async () => {
      const tokenConfigs = [
        { token: "sk-cc-abc123", note: "dev machine" },
        { token: "sk-cc-xyz789" },
      ];
      const env = createMockBindings({
        adminToken: "test-token",
        kvData: { allowed_tokens: JSON.stringify(tokenConfigs) },
      });
      const request = createRequest("/admin/tokens", { token: "test-token" });

      const response = await app.fetch(request, env);
      const data = (await response.json()) as {
        token: string;
        note?: string;
      }[];

      expect(response.status).toBe(200);
      expect(data).toHaveLength(2);
      expect(data[0].token).toBe("sk-cc-abc123");
      expect(data[0].note).toBe("dev machine");
      expect(data[1].token).toBe("sk-cc-xyz789");
    });

    it("migrates old string[] format to TokenConfig[]", async () => {
      const oldTokens = ["sk-cc-old1", "sk-cc-old2"];
      const env = createMockBindings({
        adminToken: "test-token",
        kvData: { allowed_tokens: JSON.stringify(oldTokens) },
      });
      const request = createRequest("/admin/tokens", { token: "test-token" });

      const response = await app.fetch(request, env);
      const data = (await response.json()) as { token: string }[];

      expect(response.status).toBe(200);
      expect(data).toHaveLength(2);
      expect(data[0].token).toBe("sk-cc-old1");
      expect(data[1].token).toBe("sk-cc-old2");
    });
  });

  describe("POST /admin/tokens", () => {
    it("saves TokenConfig array", async () => {
      const env = createMockBindings({ adminToken: "test-token" });
      const tokenConfigs = [
        { token: "sk-cc-new1", note: "test note" },
        { token: "sk-cc-new2" },
      ];
      const request = createRequest("/admin/tokens", {
        method: "POST",
        token: "test-token",
        body: tokenConfigs,
      });

      const response = await app.fetch(request, env);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ success: true, count: 2 });
    });

    it("persists tokens and retrieves them", async () => {
      const env = createMockBindings({ adminToken: "test-token" });
      const tokenConfigs = [{ token: "sk-cc-persist", note: "persisted" }];

      const saveRequest = createRequest("/admin/tokens", {
        method: "POST",
        token: "test-token",
        body: tokenConfigs,
      });
      await app.fetch(saveRequest, env);

      const getRequest = createRequest("/admin/tokens", {
        token: "test-token",
      });
      const response = await app.fetch(getRequest, env);
      const data = (await response.json()) as {
        token: string;
        note?: string;
      }[];

      expect(data).toHaveLength(1);
      expect(data[0].token).toBe("sk-cc-persist");
      expect(data[0].note).toBe("persisted");
    });

    it("rejects non-array body", async () => {
      const env = createMockBindings({ adminToken: "test-token" });
      const request = createRequest("/admin/tokens", {
        method: "POST",
        token: "test-token",
        body: { notAnArray: true },
      });

      const response = await app.fetch(request, env);

      expect(response.status).toBe(400);
    });

    it("filters out invalid items", async () => {
      const env = createMockBindings({ adminToken: "test-token" });
      const request = createRequest("/admin/tokens", {
        method: "POST",
        token: "test-token",
        body: [
          { token: "sk-cc-valid" },
          { token: "" },
          123,
          null,
          { token: "sk-cc-also-valid", note: "ok" },
        ],
      });

      const response = await app.fetch(request, env);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ success: true, count: 2 });
    });

    it("rejects notes with special characters", async () => {
      const env = createMockBindings({ adminToken: "test-token" });
      const request = createRequest("/admin/tokens", {
        method: "POST",
        token: "test-token",
        body: [{ token: "sk-cc-test", note: "bad<script>note" }],
      });

      const response = await app.fetch(request, env);

      expect(response.status).toBe(400);
      const data = (await response.json()) as { error: string };
      expect(data.error).toContain("English letters");
    });

    it("accepts notes with valid characters", async () => {
      const env = createMockBindings({ adminToken: "test-token" });
      const request = createRequest("/admin/tokens", {
        method: "POST",
        token: "test-token",
        body: [{ token: "sk-cc-test", note: "dev-machine John 2024" }],
      });

      const response = await app.fetch(request, env);

      expect(response.status).toBe(200);
    });

    it("accepts backward-compatible string array", async () => {
      const env = createMockBindings({ adminToken: "test-token" });
      const request = createRequest("/admin/tokens", {
        method: "POST",
        token: "test-token",
        body: ["sk-cc-str1", "sk-cc-str2"],
      });

      const response = await app.fetch(request, env);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ success: true, count: 2 });
    });
  });
});

describe("testProvider API", () => {
  let app: Hono<{ Bindings: Bindings }>;

  beforeEach(() => {
    app = createTestApp();
  });

  it("returns 400 for missing required fields", async () => {
    const env = createMockBindings({ adminToken: "test-token" });
    const request = createRequest("/admin/test-provider", {
      method: "POST",
      token: "test-token",
      body: { name: "test" },
    });

    const response = await app.fetch(request, env);
    const data = (await response.json()) as { success: boolean; error: string };

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain("Missing");
  });

  it("returns 400 for invalid JSON body", async () => {
    const env = createMockBindings({ adminToken: "test-token" });
    const request = new Request(
      "http://localhost/admin/test-provider?token=test-token",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not valid json{",
      },
    );

    const response = await app.fetch(request, env);

    expect(response.status).toBe(400);
  });

  it("requires authentication", async () => {
    const env = createMockBindings({ adminToken: "test-token" });
    const request = createRequest("/admin/test-provider", {
      method: "POST",
      body: validProvider,
    });

    const response = await app.fetch(request, env);

    expect(response.status).toBe(401);
  });
});

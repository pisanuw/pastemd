/**
 * test/auth.test.mjs — unit tests for auth utilities and magic link flow
 */
import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createMemoryDb, makeRequest, makeContext } from "./helpers.mjs";

process.env.JWT_SECRET = "test-jwt-secret-for-tests-only";
process.env.APP_URL = "http://localhost:8888";
process.env.RESEND_API_KEY = ""; // disable email sending in tests

const { createToken, verifyToken, getUserFromRequest } =
  await import("../netlify/functions/lib/jwt.mjs");
const { generateId, validateEmail, safeJson } =
  await import("../netlify/functions/lib/utils-core.mjs");
const authHandler = (await import("../netlify/functions/auth.mjs")).default;

let db;

describe("jwt", () => {
  it("createToken and verifyToken round-trip", () => {
    const payload = { id: "u1", email: "test@example.com", name: "Test" };
    const token = createToken(payload);
    const decoded = verifyToken(token);
    assert.equal(decoded.email, payload.email);
    assert.equal(decoded.id, payload.id);
  });

  it("verifyToken returns null for tampered token", () => {
    const token = createToken({ id: "u1" }) + "tampered";
    assert.equal(verifyToken(token), null);
  });

  it("verifyToken returns null for expired token", async () => {
    const token = createToken({ id: "u1" }, "0ms");
    // Wait a tick for expiry
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(verifyToken(token), null);
  });

  it("getUserFromRequest extracts user from cookie", () => {
    const user = { id: "u1", email: "alice@example.com", name: "Alice" };
    const token = createToken(user);
    const req = makeRequest("GET", "http://localhost/", { cookies: { token } });
    const decoded = getUserFromRequest(req);
    assert.equal(decoded.email, user.email);
  });

  it("getUserFromRequest returns null for missing cookie", () => {
    const req = makeRequest("GET", "http://localhost/");
    assert.equal(getUserFromRequest(req), null);
  });
});

describe("utils-core", () => {
  it("generateId produces unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, generateId));
    assert.equal(ids.size, 100);
  });

  it("generateId produces URL-safe characters only", () => {
    for (let i = 0; i < 50; i++) {
      const id = generateId();
      assert.match(id, /^[A-Za-z0-9_-]+$/);
    }
  });

  it("validateEmail accepts valid emails", () => {
    assert.equal(validateEmail("user@example.com"), "user@example.com");
    assert.equal(validateEmail("  USER@EXAMPLE.COM  "), "user@example.com");
  });

  it("validateEmail rejects invalid emails", () => {
    assert.equal(validateEmail("notanemail"), null);
    assert.equal(validateEmail(""), null);
    assert.equal(validateEmail(null), null);
    assert.equal(validateEmail("a@b"), null);
  });

  it("safeJson parses valid JSON", async () => {
    const req = makeRequest("POST", "http://localhost/", { body: { foo: "bar" } });
    const result = await safeJson(req);
    assert.equal(result.foo, "bar");
  });

  it("safeJson returns null for invalid JSON", async () => {
    const req = new Request("http://localhost/", {
      method: "POST",
      body: "not-json{",
      headers: { "Content-Type": "application/json" },
    });
    const result = await safeJson(req);
    assert.equal(result, null);
  });
});

describe("auth handler — magic link", () => {
  before(() => { db = createMemoryDb(); });
  beforeEach(() => db.reset());

  it("GET /api/auth/me returns 401 when unauthenticated", async () => {
    const req = makeRequest("GET", "http://localhost:8888/api/auth/me");
    const res = await authHandler(req, makeContext({ 0: "me" }));
    assert.equal(res.status, 401);
  });

  it("GET /api/auth/me returns user when authenticated", async () => {
    const user = { id: "u1", email: "alice@example.com", name: "Alice", is_admin: false };
    const token = createToken(user);
    const req = makeRequest("GET", "http://localhost:8888/api/auth/me", { cookies: { token } });
    const res = await authHandler(req, makeContext({ 0: "me" }));
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.email, user.email);
    assert.equal(data.is_admin, false);
  });

  it("POST /api/auth/magic-link/request rejects invalid email", async () => {
    const req = makeRequest("POST", "http://localhost:8888/api/auth/magic-link/request", {
      body: { email: "not-an-email" },
    });
    const res = await authHandler(req, makeContext({ 0: "magic-link/request" }));
    assert.equal(res.status, 400);
  });

  it("POST /api/auth/logout clears the session cookie", async () => {
    const req = makeRequest("POST", "http://localhost:8888/api/auth/logout");
    const res = await authHandler(req, makeContext({ 0: "logout" }));
    assert.equal(res.status, 200);
    const setCookie = res.headers.get("set-cookie") || "";
    assert.ok(setCookie.includes("token=;") || setCookie.includes("Max-Age=0"), "cookie should be cleared");
  });

  it("GET /api/auth/magic-link/verify with no token returns redirect to /?error=invalid-link", async () => {
    const req = makeRequest("GET", "http://localhost:8888/api/auth/magic-link/verify");
    const res = await authHandler(req, makeContext({ 0: "magic-link/verify" }));
    assert.equal(res.status, 302);
    assert.ok(res.headers.get("location").includes("invalid-link"));
  });

  it("magic link full flow: request → verify → session created", async () => {
    // Intercept sendEmail by not setting RESEND_API_KEY (it logs a warning and returns ok:false)
    // We'll manually create the token as auth.mjs would
    const { getDb } = await import("../netlify/functions/lib/db.mjs");
    const { generateId: genId } = await import("../netlify/functions/lib/utils-core.mjs");

    const email = "magicuser@example.com";
    const jti = genId();

    const loginTokens = getDb("login_tokens");
    await loginTokens.setJSON(jti, { email, used: false, created_at: new Date().toISOString() });

    const token = createToken({ id: "magic", email, name: "", purpose: "magic_link", jti }, "15m");

    const req = makeRequest("GET", `http://localhost:8888/api/auth/magic-link/verify?token=${encodeURIComponent(token)}`);
    const res = await authHandler(req, makeContext({ 0: "magic-link/verify" }));

    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/dashboard.html");
    const cookie = res.headers.get("set-cookie") || "";
    assert.ok(cookie.includes("token="), "session cookie should be set");
  });

  it("magic link verify rejects already-used token", async () => {
    const { getDb } = await import("../netlify/functions/lib/db.mjs");
    const { generateId: genId } = await import("../netlify/functions/lib/utils-core.mjs");

    const email = "reuse@example.com";
    const jti = genId();
    const loginTokens = getDb("login_tokens");
    await loginTokens.setJSON(jti, { email, used: true, created_at: new Date().toISOString() });

    const token = createToken({ id: "magic", email, name: "", purpose: "magic_link", jti }, "15m");
    const req = makeRequest("GET", `http://localhost:8888/api/auth/magic-link/verify?token=${encodeURIComponent(token)}`);
    const res = await authHandler(req, makeContext({ 0: "magic-link/verify" }));

    assert.equal(res.status, 302);
    assert.ok(res.headers.get("location").includes("link-already-used"));
  });
});

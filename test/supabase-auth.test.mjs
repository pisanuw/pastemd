/**
 * test/supabase-auth.test.mjs — Google sign-in through Supabase (PKCE)
 */
import { describe, it, before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createMemoryDb, makeRequest, makeContext } from "./helpers.mjs";

process.env.JWT_SECRET = "test-jwt-secret-for-tests-only";
process.env.APP_URL = "http://localhost:8888";
process.env.RESEND_API_KEY = "";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY = "anon-test-key";

const sb = await import("../netlify/functions/lib/supabase.mjs");
const { verifyToken } = await import("../netlify/functions/lib/jwt.mjs");
const authHandler = (await import("../netlify/functions/auth.mjs")).default;

const googleUser = (over = {}) => ({
  id: "sb-1",
  email: "Alice@Example.com",
  email_confirmed_at: "2026-11-09T18:00:00Z",
  app_metadata: { provider: "google", providers: ["google"] },
  identities: [{ provider: "google" }],
  user_metadata: { full_name: "Alice Example" },
  ...over,
});

function setCookies(res) {
  return res.headers.getSetCookie
    ? res.headers.getSetCookie()
    : [res.headers.get("set-cookie")];
}

describe("supabase helpers", () => {
  it("makePkcePair gives an S256 challenge of the verifier", () => {
    const { verifier, challenge } = sb.makePkcePair();
    assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
    const expected = createHash("sha256").update(verifier).digest("base64url");
    assert.equal(challenge, expected);
    assert.notEqual(sb.makePkcePair().verifier, verifier);
  });

  it("supabaseAuthorizeUrl asks Supabase for Google with PKCE and the return address", () => {
    const u = new URL(
      sb.supabaseAuthorizeUrl({
        redirectTo: "https://paste-md.hintwise.org/api/auth/supabase/callback",
        challenge: "abc",
      }),
    );
    assert.equal(
      u.origin + u.pathname,
      "https://example.supabase.co/auth/v1/authorize",
    );
    assert.equal(u.searchParams.get("provider"), "google");
    assert.equal(
      u.searchParams.get("redirect_to"),
      "https://paste-md.hintwise.org/api/auth/supabase/callback",
    );
    assert.equal(u.searchParams.get("code_challenge"), "abc");
    assert.equal(u.searchParams.get("code_challenge_method"), "s256");
  });

  it("verifiedGoogleEmail accepts a confirmed Google identity, lower-cased", () => {
    assert.equal(sb.verifiedGoogleEmail(googleUser()), "alice@example.com");
  });

  it("verifiedGoogleEmail refuses an unconfirmed email", () => {
    assert.equal(
      sb.verifiedGoogleEmail(googleUser({ email_confirmed_at: null })),
      null,
    );
  });

  it("verifiedGoogleEmail refuses a user without a Google identity", () => {
    const u = googleUser({
      app_metadata: { provider: "email", providers: ["email"] },
      identities: [{ provider: "email" }],
    });
    assert.equal(sb.verifiedGoogleEmail(u), null);
  });

  it("verifiedGoogleEmail refuses a missing user or email", () => {
    assert.equal(sb.verifiedGoogleEmail(null), null);
    assert.equal(sb.verifiedGoogleEmail(googleUser({ email: "" })), null);
  });

  it("supabaseDisplayName prefers full_name, then name", () => {
    assert.equal(sb.supabaseDisplayName(googleUser()), "Alice Example");
    assert.equal(
      sb.supabaseDisplayName({ user_metadata: { name: "Al" } }),
      "Al",
    );
    assert.equal(sb.supabaseDisplayName({}), "");
  });

  it("getGoogleAuthMode defaults to supabase; direct only when asked", () => {
    delete process.env.GOOGLE_AUTH_VIA;
    assert.equal(sb.getGoogleAuthMode(), "supabase");
    process.env.GOOGLE_AUTH_VIA = "DIRECT";
    assert.equal(sb.getGoogleAuthMode(), "direct");
    process.env.GOOGLE_AUTH_VIA = "something-else";
    assert.equal(sb.getGoogleAuthMode(), "supabase");
    delete process.env.GOOGLE_AUTH_VIA;
  });
});

describe("auth handler — Google through Supabase", () => {
  let db;
  let realFetch;
  let calls;

  before(() => {
    db = createMemoryDb();
  });
  beforeEach(() => {
    db.reset();
    delete process.env.GOOGLE_AUTH_VIA;
    realFetch = globalThis.fetch;
    calls = [];
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.GOOGLE_AUTH_VIA;
  });

  function mockSupabase({ tokenStatus = 200, user = googleUser() } = {}) {
    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url: String(url), init });
      if (String(url).includes("/auth/v1/token")) {
        if (tokenStatus !== 200)
          return new Response("{}", { status: tokenStatus });
        return new Response(
          JSON.stringify({ access_token: "sb-access", user }),
          { status: 200 },
        );
      }
      if (String(url).includes("/rest/v1/rpc/ensure_profile"))
        return new Response("{}", { status: 200 });
      throw new Error(`unexpected fetch ${url}`);
    };
  }

  const callback = (query, cookies) =>
    authHandler(
      makeRequest(
        "GET",
        `http://localhost:8888/api/auth/supabase/callback${query}`,
        { cookies },
      ),
      makeContext(),
    );

  it("google/start redirects to Supabase and keeps the verifier in an HttpOnly cookie", async () => {
    const res = await authHandler(
      makeRequest("GET", "http://localhost:8888/api/auth/google/start"),
      makeContext(),
    );
    assert.equal(res.status, 302);
    const loc = new URL(res.headers.get("location"));
    assert.equal(loc.origin, "https://example.supabase.co");
    assert.equal(
      loc.searchParams.get("redirect_to"),
      "http://localhost:8888/api/auth/supabase/callback",
    );
    const cookie = setCookies(res).find((c) => c.startsWith("sb_pkce="));
    assert.ok(cookie, "sets sb_pkce");
    assert.match(cookie, /HttpOnly/);
    const verifier = cookie.split(";")[0].split("=")[1];
    assert.equal(
      loc.searchParams.get("code_challenge"),
      createHash("sha256").update(verifier).digest("base64url"),
    );
  });

  it("google/start uses the direct Google flow when GOOGLE_AUTH_VIA=direct", async () => {
    process.env.GOOGLE_AUTH_VIA = "direct";
    process.env.GOOGLE_CLIENT_ID = "cid";
    const res = await authHandler(
      makeRequest("GET", "http://localhost:8888/api/auth/google/start"),
      makeContext(),
    );
    const loc = new URL(res.headers.get("location"));
    assert.equal(loc.origin, "https://accounts.google.com");
    assert.equal(
      loc.searchParams.get("redirect_uri"),
      "http://localhost:8888/api/auth/google/callback",
    );
  });

  it("callback signs in a new user and sets the session cookie", async () => {
    mockSupabase();
    const res = await callback("?code=c1", { sb_pkce: "verifier-1" });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/dashboard.html");
    const tokenCookie = setCookies(res).find((c) => c.startsWith("token="));
    const session = verifyToken(
      tokenCookie.split(";")[0].slice("token=".length),
    );
    assert.equal(session.email, "alice@example.com");
    assert.equal(session.name, "Alice Example");
    assert.ok(
      setCookies(res).some(
        (c) => c.startsWith("sb_pkce=;") && /Max-Age=0/.test(c),
      ),
      "clears sb_pkce",
    );
    const tokenCall = calls.find((c) => c.url.includes("/auth/v1/token"));
    assert.deepEqual(JSON.parse(tokenCall.init.body), {
      auth_code: "c1",
      code_verifier: "verifier-1",
    });
    assert.equal(tokenCall.init.headers.apikey, "anon-test-key");
    assert.ok(
      calls.some((c) => c.url.endsWith("/rest/v1/rpc/ensure_profile")),
      "records the platform profile",
    );
  });

  it("callback keeps an existing user's id (matched by email)", async () => {
    mockSupabase();
    const existing = {
      id: "old-id",
      email: "alice@example.com",
      name: "Alice",
      is_admin: false,
      created_at: "2026-01-01",
    };
    const usersStore = (await import("../netlify/functions/lib/db.mjs")).getDb(
      "users",
    );
    await usersStore.setJSON("alice@example.com", existing);
    const res = await callback("?code=c1", { sb_pkce: "v" });
    const tokenCookie = setCookies(res).find((c) => c.startsWith("token="));
    const session = verifyToken(
      tokenCookie.split(";")[0].slice("token=".length),
    );
    assert.equal(session.id, "old-id");
    assert.equal(session.name, "Alice");
  });

  it("callback without the verifier cookie says the sign-in expired", async () => {
    mockSupabase();
    const res = await callback("?code=c1", {});
    assert.equal(res.headers.get("location"), "/?error=google-state-missing");
    assert.equal(calls.length, 0);
  });

  it("callback reports a cancelled Google consent", async () => {
    const res = await callback("?error=access_denied&error_description=x", {
      sb_pkce: "v",
    });
    assert.equal(res.headers.get("location"), "/?error=google-auth-cancelled");
  });

  it("callback fails without a code or when Supabase refuses the exchange", async () => {
    mockSupabase({ tokenStatus: 400 });
    assert.equal(
      (await callback("", { sb_pkce: "v" })).headers.get("location"),
      "/?error=google-auth-failed",
    );
    assert.equal(
      (await callback("?code=bad", { sb_pkce: "v" })).headers.get("location"),
      "/?error=google-auth-failed",
    );
  });

  it("callback refuses a Supabase user whose email Google did not vouch for", async () => {
    mockSupabase({
      user: googleUser({
        identities: [{ provider: "email" }],
        app_metadata: { providers: ["email"] },
      }),
    });
    const res = await callback("?code=c1", { sb_pkce: "v" });
    assert.equal(res.headers.get("location"), "/?error=google-auth-failed");
    assert.ok(
      !setCookies(res).some((c) => c?.startsWith("token=")),
      "no session",
    );
  });

  it("callback still signs in when the platform profile call fails", async () => {
    globalThis.fetch = async (url) => {
      if (String(url).includes("/auth/v1/token"))
        return new Response(
          JSON.stringify({ access_token: "a", user: googleUser() }),
          { status: 200 },
        );
      throw new Error("network down");
    };
    const res = await callback("?code=c1", { sb_pkce: "v" });
    assert.equal(res.headers.get("location"), "/dashboard.html");
  });
});

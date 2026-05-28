/**
 * auth.mjs — Authentication router
 *
 *   GET  /api/auth/google/start          — initiate Google OAuth
 *   GET  /api/auth/google/callback       — Google OAuth callback
 *   POST /api/auth/magic-link/request    — send magic link email
 *   GET  /api/auth/magic-link/verify     — verify magic link token
 *   POST /api/auth/logout                — clear session cookie
 *   GET  /api/auth/me                    — return current user info
 *   POST /api/auth/api-token             — issue a 365d Bearer token for the current user
 */
export const config = { path: "/api/auth/*" };
import {
  createToken, verifyToken, verifyTokenVerbose, getUserFromRequest,
  jsonResponse, errorResponse, redirectResponse, authRedirectResponse,
  setCookie, clearCookie,
  getDb,
  getEnv, getGoogleClientId, getGoogleClientSecret, getAdminEmails, getAppUrl,
  log,
  generateId, validateEmail, safeJson,
  sendEmail,
} from "./utils.mjs";

const FN = "auth";
const MAX_TITLE_LEN = 200;

function isAdmin(email) {
  return getAdminEmails().includes(email.toLowerCase());
}

async function getOrCreateUser(email, name = "") {
  const usersDb = getDb("users");
  let user = await usersDb.get(email, { type: "json" }).catch(() => null);
  const isNew = !user;
  if (!user) {
    user = {
      id: generateId(),
      email,
      name: name || email.split("@")[0],
      is_admin: isAdmin(email),
      created_at: new Date().toISOString(),
    };
    await usersDb.setJSON(email, user);
  } else if (isAdmin(email) && !user.is_admin) {
    // Backfill admin flag if admin email was added after account creation
    user.is_admin = true;
    await usersDb.setJSON(email, user);
  }
  return { user, isNew };
}

export default async function handler(req, context) {
  const subPath = new URL(req.url).pathname.replace(/^\/api\/auth\/?/, "");
  log("info", FN, "request", { method: req.method, path: subPath });

  // ── GET /api/auth/google/start ─────────────────────────────────────────────
  if (req.method === "GET" && subPath === "google/start") {
    const clientId = getGoogleClientId();
    const appUrl = getAppUrl(req);
    const redirectUri = `${appUrl}/api/auth/google/callback`;

    const stateToken = createToken({ purpose: "oauth_state", jti: generateId() }, "10m");
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state: stateToken,
      prompt: "select_account",
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    log("info", FN, "google/start", { redirectUri });

    const headers = new Headers({ Location: authUrl });
    headers.append("Set-Cookie", setCookie("oauth_state", stateToken, 10 * 60));
    return new Response(null, { status: 302, headers });
  }

  // ── GET /api/auth/google/callback ──────────────────────────────────────────
  if (req.method === "GET" && subPath === "google/callback") {
    const url = new URL(req.url);
    const code = url.searchParams.get("code") || "";
    const state = url.searchParams.get("state") || "";
    const errorParam = url.searchParams.get("error");

    if (errorParam) {
      log("warn", FN, "google callback user cancelled", { error: errorParam });
      return redirectResponse("/?error=google-auth-cancelled");
    }

    if (!code || !state) {
      return redirectResponse("/?error=google-auth-failed");
    }

    // Verify CSRF state
    const cookie = req.headers.get("cookie") || "";
    const stateMatch = cookie.match(/(?:^|;\s*)oauth_state=([^;]+)/);
    const stateFromCookie = stateMatch ? stateMatch[1] : "";

    if (!stateFromCookie || state !== stateFromCookie) {
      log("warn", FN, "oauth state mismatch — possible CSRF");
      return redirectResponse("/?error=google-auth-failed");
    }

    const statePayload = verifyToken(state);
    if (!statePayload || statePayload.purpose !== "oauth_state") {
      log("warn", FN, "oauth state token invalid or expired");
      return redirectResponse("/?error=google-auth-failed");
    }

    // Exchange auth code for tokens
    const appUrl = getAppUrl(req);
    const redirectUri = `${appUrl}/api/auth/google/callback`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: getGoogleClientId(),
        client_secret: getGoogleClientSecret(),
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      log("error", FN, "google token exchange failed", { status: tokenRes.status });
      return redirectResponse("/?error=google-auth-failed");
    }

    const tokenData = await tokenRes.json();

    const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      log("error", FN, "google userinfo failed", { status: userRes.status });
      return redirectResponse("/?error=google-auth-failed");
    }

    const googleUser = await userRes.json();
    const email = validateEmail(googleUser.email);
    if (!email) {
      log("warn", FN, "google user has no valid email");
      return redirectResponse("/?error=google-auth-failed");
    }

    const { user } = await getOrCreateUser(email, googleUser.name || "");
    const appToken = createToken({
      id: user.id,
      email: user.email,
      name: user.name,
      is_admin: !!user.is_admin,
    });

    log("info", FN, "google sign-in successful", { email: user.email });
    return authRedirectResponse("/dashboard.html", appToken);
  }

  // ── POST /api/auth/magic-link/request ─────────────────────────────────────
  if (req.method === "POST" && subPath === "magic-link/request") {
    const body = await safeJson(req);
    if (body === null) return errorResponse(400, "Request body must be valid JSON.");

    const email = validateEmail(body.email || "");
    if (!email) return errorResponse(400, "A valid email address is required.");

    const name = (body.name || "").trim().slice(0, MAX_TITLE_LEN);

    const jti = generateId();
    const loginTokens = getDb("login_tokens");
    await loginTokens.setJSON(jti, {
      email,
      used: false,
      created_at: new Date().toISOString(),
    });

    const token = createToken({ id: "magic", email, name, purpose: "magic_link", jti }, "15m");
    const appUrl = getAppUrl(req);
    const link = `${appUrl}/api/auth/magic-link/verify?token=${encodeURIComponent(token)}`;

    log("info", FN, "magic link generated", { email });

    const sendResult = await sendEmail({
      to: email,
      subject: "Your PasteMD sign-in link",
      html: `
        <p>Sign in to PasteMD by clicking the link below:</p>
        <p><a href="${link}">Sign in to PasteMD</a></p>
        <p>This link expires in 15 minutes and can only be used once.</p>
        <p>If you didn't request this, you can safely ignore this email.</p>
      `,
      text: `Sign in to PasteMD: ${link}\n\nThis link expires in 15 minutes and can only be used once.`,
    });

    if (!sendResult.ok) {
      return errorResponse(500, "Failed to send sign-in email. Please try again.");
    }

    return jsonResponse(200, { success: true, message: "Check your email for a sign-in link." });
  }

  // ── GET /api/auth/magic-link/verify ───────────────────────────────────────
  if (req.method === "GET" && subPath === "magic-link/verify") {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") || "";

    if (!token) return redirectResponse("/?error=invalid-link");

    const { payload, error: tokenError } = verifyTokenVerbose(token);
    if (!payload) {
      const reason = tokenError === "TokenExpiredError" ? "link-expired" : "invalid-link";
      log("warn", FN, "magic link token invalid", { reason: tokenError });
      return redirectResponse(`/?error=${reason}`);
    }

    if (payload.purpose !== "magic_link" || !payload.jti || !payload.email) {
      return redirectResponse("/?error=invalid-link");
    }

    const loginTokens = getDb("login_tokens");
    const tokenRecord = await loginTokens.get(payload.jti, { type: "json" }).catch(() => null);

    if (!tokenRecord) return redirectResponse("/?error=invalid-link");
    if (tokenRecord.used) return redirectResponse("/?error=link-already-used");
    if (tokenRecord.email !== payload.email) return redirectResponse("/?error=invalid-link");

    // Mark as used (single-use enforcement)
    await loginTokens.setJSON(payload.jti, {
      ...tokenRecord,
      used: true,
      used_at: new Date().toISOString(),
    });

    const { user } = await getOrCreateUser(payload.email, payload.name || "");
    const appToken = createToken({
      id: user.id,
      email: user.email,
      name: user.name,
      is_admin: !!user.is_admin,
    });

    log("info", FN, "magic link sign-in successful", { email: user.email });

    const headers = new Headers({ Location: "/dashboard.html" });
    headers.append("Set-Cookie", setCookie("token", appToken));
    return new Response(null, { status: 302, headers });
  }

  // ── POST /api/auth/logout ──────────────────────────────────────────────────
  if (req.method === "POST" && subPath === "logout") {
    const headers = new Headers({ "Content-Type": "application/json" });
    headers.append("Set-Cookie", clearCookie("token"));
    return new Response(JSON.stringify({ success: true }), { status: 200, headers });
  }

  // ── GET /api/auth/me ───────────────────────────────────────────────────────
  if (req.method === "GET" && subPath === "me") {
    const user = getUserFromRequest(req);
    if (!user) return errorResponse(401, "Unauthorized");
    return jsonResponse(200, {
      id: user.id,
      email: user.email,
      name: user.name,
      is_admin: !!user.is_admin,
    });
  }

  // ── POST /api/auth/api-token ───────────────────────────────────────────────
  // Issues a long-lived Bearer token for programmatic access. Caller must be
  // signed in via cookie (i.e. generated from the dashboard UI). The returned
  // token carries the same identity as the cookie session, so all existing
  // ownership and admin rules apply unchanged.
  if (req.method === "POST" && subPath === "api-token") {
    const user = getUserFromRequest(req);
    if (!user) return errorResponse(401, "Unauthorized");
    const token = createToken({
      id: user.id,
      email: user.email,
      name: user.name,
      is_admin: !!user.is_admin,
      purpose: "api",
    }, "365d");
    log("info", FN, "api token issued", { email: user.email });
    return jsonResponse(200, { token, expiresIn: "365d" });
  }

  log("warn", FN, "no route matched", { method: req.method, path: subPath });
  return errorResponse(404, "Not found");
}

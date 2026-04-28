/**
 * lib/http.mjs — Cookie helpers and HTTP response factories
 */
import { getEnv } from "./env.mjs";

function shouldUseSecureCookies() {
  const override = getEnv("COOKIE_SECURE", "auto").toLowerCase();
  if (override === "true") return true;
  if (override === "false") return false;
  const appUrl = getEnv("APP_URL", "");
  if (appUrl) {
    try {
      const { hostname, protocol } = new URL(appUrl);
      if (hostname === "localhost" || hostname === "127.0.0.1") return false;
      return protocol === "https:";
    } catch {
      // malformed APP_URL — fall through
    }
  }
  if (getEnv("NETLIFY_DEV") === "true") return false;
  return true;
}

export function setCookie(name, value, maxAge = 7 * 24 * 3600) {
  const secure = shouldUseSecureCookies() ? "; Secure" : "";
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${maxAge}`;
}

export function clearCookie(name) {
  const secure = shouldUseSecureCookies() ? "; Secure" : "";
  return `${name}=; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=0`;
}

export function jsonResponse(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

export function errorResponse(status, message) {
  return jsonResponse(status, { error: message });
}

export function redirectResponse(location, extraHeaders = {}) {
  const headers = new Headers({ Location: location, ...extraHeaders });
  return new Response(null, { status: 302, headers });
}

/**
 * Build a redirect response that clears the oauth_state cookie and sets the
 * session token in one response (two Set-Cookie headers).
 */
export function authRedirectResponse(location, sessionToken) {
  const headers = new Headers({ Location: location });
  headers.append("Set-Cookie", setCookie("token", sessionToken));
  headers.append("Set-Cookie", clearCookie("oauth_state"));
  return new Response(null, { status: 302, headers });
}

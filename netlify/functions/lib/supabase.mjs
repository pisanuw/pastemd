/**
 * lib/supabase.mjs — Google sign-in through the shared HintWise Supabase project
 *
 * Supabase Auth talks to Google, so Google only knows Supabase's callback and a
 * new app address never needs a Google Cloud change. PasteMD keeps its own
 * users (Netlify Blobs, keyed by email) and its own session cookie: Supabase
 * only proves who the person is.
 *
 * Flow (PKCE, all server-side, so no client JS or CSP change):
 *   /api/auth/google/start      makes a code verifier, keeps it in an HttpOnly
 *                               cookie, redirects to Supabase /authorize
 *   /api/auth/supabase/callback exchanges ?code with the verifier at Supabase
 *                               /token, then signs the person in by email
 *
 * The URL and anon key are public by design (claude-built-apps
 * platform/supabase.json); SUPABASE_URL / SUPABASE_ANON_KEY override them.
 */
import { createHash, randomBytes } from "node:crypto";
import { getEnv } from "./env.mjs";

const DEFAULT_URL = "https://arktxlrlyceffyozdwhq.supabase.co";
const DEFAULT_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFya3R4bHJseWNlZmZ5b3pkd2hxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4ODEwMTAsImV4cCI6MjA5MjQ1NzAxMH0.Vuku-irT3kAHZYibK23q6dpyOEqV_Eg5zB78I3dyshE";

export const PKCE_COOKIE = "sb_pkce";

export function getSupabaseUrl() {
  return getEnv("SUPABASE_URL", DEFAULT_URL).replace(/\/$/, "");
}

export function getSupabaseAnonKey() {
  return getEnv("SUPABASE_ANON_KEY", DEFAULT_ANON_KEY);
}

/** "supabase" (default) or "direct" (the old Google client flow, for rollback). */
export function getGoogleAuthMode() {
  return getEnv("GOOGLE_AUTH_VIA", "supabase").toLowerCase() === "direct"
    ? "direct"
    : "supabase";
}

function base64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** A PKCE verifier and its S256 challenge (RFC 7636). */
export function makePkcePair() {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

/** Supabase's /authorize address for Google, returning to redirectTo. */
export function supabaseAuthorizeUrl({ redirectTo, challenge }) {
  const params = new URLSearchParams({
    provider: "google",
    redirect_to: redirectTo,
    code_challenge: challenge,
    code_challenge_method: "s256",
    // Passed on to Google: always show the account chooser.
    prompt: "select_account",
  });
  return `${getSupabaseUrl()}/auth/v1/authorize?${params}`;
}

/**
 * Exchange the code Supabase returned for a session. Returns the Supabase
 * user and access token, or null when Supabase refuses.
 */
export async function exchangeSupabaseCode(code, verifier) {
  const res = await fetch(`${getSupabaseUrl()}/auth/v1/token?grant_type=pkce`, {
    method: "POST",
    headers: {
      apikey: getSupabaseAnonKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data?.user || !data.access_token) return null;
  return { user: data.user, accessToken: data.access_token };
}

/**
 * The email to sign in as, or null. Existing PasteMD accounts are keyed by
 * email, so only an address Google vouched for is accepted: a confirmed email
 * on a user with a Google identity.
 */
export function verifiedGoogleEmail(user) {
  const email =
    typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
  if (!email || !user.email_confirmed_at) return null;
  const providers = [
    ...(user.app_metadata?.providers || []),
    ...(user.identities || []).map((i) => i?.provider),
  ];
  return providers.includes("google") ? email : null;
}

/** Display name from the Supabase user's Google profile. */
export function supabaseDisplayName(user) {
  const m = user?.user_metadata || {};
  return String(m.full_name || m.name || "").trim();
}

/**
 * Record the person in the shared platform.profiles table (one row per
 * person across HintWise apps). Best effort: sign-in never fails on it.
 */
export async function ensurePlatformProfile(accessToken) {
  try {
    await fetch(`${getSupabaseUrl()}/rest/v1/rpc/ensure_profile`, {
      method: "POST",
      headers: {
        apikey: getSupabaseAnonKey(),
        Authorization: `Bearer ${accessToken}`,
        "Content-Profile": "platform",
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // ignore: the profile is a convenience for the platform, not for PasteMD
  }
}

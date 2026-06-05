/**
 * lib/env.mjs — Environment variable accessors
 */

export function getEnv(key, fallback = "") {
  return process.env[key] ?? fallback;
}

export function getJwtSecret() {
  return getEnv("JWT_SECRET");
}

export function getResendApiKey() {
  return getEnv("RESEND_API_KEY");
}

export function getGoogleClientId() {
  return getEnv("GOOGLE_CLIENT_ID");
}

export function getGoogleClientSecret() {
  return getEnv("GOOGLE_CLIENT_SECRET");
}

const SUPERADMIN_EMAILS = ["pisan@uw.edu", "yusuf.pisan@gmail.com"];

export function getAdminEmails() {
  const envEmails = getEnv("ADMIN_EMAILS", "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...SUPERADMIN_EMAILS, ...envEmails])];
}

export function getAppUrl(req) {
  const envUrl = getEnv("APP_URL");
  if (envUrl) return envUrl.replace(/\/$/, "");
  if (req) {
    const url = new URL(req.url);
    return `${url.protocol}//${url.host}`;
  }
  return "http://localhost:8888";
}

export function getAuthFromEmail() {
  return getEnv("AUTH_FROM_EMAIL", "PasteMD <noreply@example.com>");
}

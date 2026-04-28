/**
 * lib/email.mjs — Email sending via Resend
 */
import { getResendApiKey, getAuthFromEmail } from "./env.mjs";
import { log } from "./log.mjs";

export async function sendEmail({ to, subject, html, text }) {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    log("warn", "email", "RESEND_API_KEY not set — skipping email", { to, subject });
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getAuthFromEmail(),
      to,
      subject,
      html,
      text,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    log("error", "email", "send failed", { to, status: res.status, message: data.message });
    return { ok: false, error: `HTTP ${res.status}: ${data.message || "Unknown error"}` };
  }

  log("info", "email", "sent", { to, subject });
  return { ok: true };
}

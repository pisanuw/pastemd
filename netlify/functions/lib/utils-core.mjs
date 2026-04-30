/**
 * lib/utils-core.mjs — Pure utility functions
 */
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

/**
 * Generate a URL-safe random ID (12 characters).
 */
export function generateId() {
  return randomBytes(9).toString("base64url");
}

/**
 * Validate and normalise an email address.
 * Returns lowercased email or null if invalid.
 */
export function validateEmail(email) {
  if (!email || typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Hash a plaintext password. Returns { hash, salt } as hex strings.
 */
export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

/**
 * Verify a plaintext password against a stored hash and salt.
 */
export function verifyPassword(password, hash, salt) {
  try {
    const derived = scryptSync(password, salt, 64);
    return timingSafeEqual(derived, Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
}

/**
 * Parse JSON from a Request body. Returns null on parse error.
 */
export async function safeJson(req) {
  try {
    const text = await req.text();
    if (!text.trim()) return {};
    return JSON.parse(text);
  } catch {
    return null;
  }
}

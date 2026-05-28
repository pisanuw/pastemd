/**
 * lib/jwt.mjs — JWT creation and verification
 *
 * JWTs are signed with JWT_SECRET and stored in an HttpOnly cookie named "token".
 */
import jwt from "jsonwebtoken";
import { getJwtSecret } from "./env.mjs";

export function createToken(payload, expiresIn = "7d") {
  return jwt.sign(payload, getJwtSecret(), { expiresIn });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, getJwtSecret());
  } catch {
    return null;
  }
}

export function verifyTokenVerbose(token) {
  try {
    return { payload: jwt.verify(token, getJwtSecret()), error: null };
  } catch (err) {
    return { payload: null, error: err.name };
  }
}

/**
 * Extract and verify the session JWT from the incoming request.
 * Accepts either an `Authorization: Bearer <token>` header (programmatic
 * clients) or the `token` cookie (browser sessions). Returns the decoded
 * user payload, or null if unauthenticated.
 */
export function getUserFromRequest(req) {
  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearer) return verifyToken(bearer[1].trim());

  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)token=([^;]+)/);
  if (!match) return null;
  return verifyToken(match[1]);
}

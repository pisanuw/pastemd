/**
 * lib/log.mjs — Structured logging
 */

export function log(level, fn, message, data = {}) {
  const entry = { level, fn, message, ...data, ts: new Date().toISOString() };
  if (level === "error") {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

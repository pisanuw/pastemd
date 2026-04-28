/**
 * test/helpers.mjs — shared test utilities
 *
 * Provides an in-memory Netlify Blobs mock and helper factories.
 */
import { setDbFactory } from "../netlify/functions/lib/db.mjs";

/**
 * Create a fresh in-memory store map and inject it as the DB factory.
 * Returns a reset function to call between tests.
 */
export function createMemoryDb() {
  const stores = new Map();

  function getStore(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    const map = stores.get(name);
    return {
      async get(key, opts) {
        const val = map.get(key);
        if (val === undefined) return null;
        if (opts?.type === "json") return JSON.parse(val);
        return val;
      },
      async setJSON(key, value) {
        map.set(key, JSON.stringify(value));
      },
      async set(key, value) {
        map.set(key, value);
      },
      async delete(key) {
        map.delete(key);
      },
      async list() {
        const blobs = [...map.keys()].map((key) => ({ key }));
        return { blobs };
      },
    };
  }

  setDbFactory(getStore);

  return {
    reset() {
      stores.clear();
    },
    stores,
  };
}

/**
 * Build a minimal mock Request object for testing functions.
 */
export function makeRequest(method, url, { body, cookies, headers } = {}) {
  const reqHeaders = new Headers(headers || {});
  if (cookies) {
    const cookieStr = Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
    reqHeaders.set("cookie", cookieStr);
  }
  if (body !== undefined) {
    reqHeaders.set("Content-Type", "application/json");
  }
  return new Request(url, {
    method,
    headers: reqHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/**
 * Build a minimal context object that mimics Netlify Functions v2 context.
 */
export function makeContext(params = {}) {
  return { params };
}

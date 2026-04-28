/**
 * lib/db.mjs — Netlify Blobs wrapper with test injection support
 */
import { getStore } from "@netlify/blobs";

let dbFactoryForTests = null;

export function setDbFactory(factory) {
  dbFactoryForTests = factory;
}

export function getDb(name) {
  if (dbFactoryForTests) return dbFactoryForTests(name);
  return getStore({ name, consistency: "strong" });
}

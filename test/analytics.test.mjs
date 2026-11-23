// HintWise first-party analytics: platform/src/analytics/hw-events.js from
// claude-built-apps, copied unchanged, and its tag on every static page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const PAGES = [
  "index.html",
  "dashboard.html",
  "post.html",
  "admin.html",
  "email-sent.html",
  "404.html",
];
const TAG = '<script defer src="/hw-events.js" data-app="paste-md"></script>';
const HW_EVENTS_SHA256 =
  "fe0b6e92ddd6093e9ba7fa2b9fff32cd68bb5a42e191e9770fda93e5a1ba6227";

test("hw-events.js is the platform's copy, byte for byte", () => {
  const js = readFileSync(new URL("../hw-events.js", import.meta.url));
  assert.equal(createHash("sha256").update(js).digest("hex"), HW_EVENTS_SHA256);
});

for (const page of PAGES) {
  test(`${page} loads hw-events.js once, in <head>, as paste-md`, () => {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
    assert.equal(
      html.split("hw-events.js").length - 1,
      2,
      "the tag and its comment, nothing else",
    );
    assert.equal(html.split(TAG).length - 1, 1);
    const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
    assert.ok(head.includes(TAG));
  });
}

test("server-rendered post pages carry no analytics tag: most post ids would be sent unmasked", async () => {
  const { shell } = await import("../netlify/functions/post-page.mjs");
  const html = shell("t", "d", "", "<p>x</p>");
  assert.doesNotMatch(html, /hw-events/);
});

test("every Content-Security-Policy lets the beacon reach auth.hintwise.org and loads scripts from 'self' only", () => {
  const toml = readFileSync(
    new URL("../netlify.toml", import.meta.url),
    "utf8",
  );
  const policies = [
    ...toml.matchAll(/Content-Security-Policy\s*=\s*"([^"]*)"/g),
  ].map((m) => m[1]);
  assert.ok(policies.length >= 3);
  for (const p of policies) {
    // sendBeacon is checked against connect-src; without it the browser blocks every event.
    assert.match(p, /connect-src 'self' https:\/\/auth\.hintwise\.org;/);
    assert.match(p, /script-src 'self';/);
  }
});

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
// data-mask="/p/": a post id is too plain for the script's id rule, so the
// segment after /p/ is always sent as ":id".
const TAG =
  '<script defer src="/hw-events.js" data-app="paste-md" data-mask="/p/"></script>';
const HW_EVENTS_SHA256 =
  "d2833162b9f18f9f2fdb36dbd62440c13ee26c6600200d8e55ad32b907f00633";

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

test("server-rendered post pages load hw-events.js once, in <head>, with /p/ masked", async () => {
  const { shell } = await import("../netlify/functions/post-page.mjs");
  const html = shell("t", "d", "", "<p>x</p>");
  assert.equal(html.split("hw-events.js").length - 1, 2);
  assert.equal(html.split(TAG).length - 1, 1);
  const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
  assert.ok(head.includes(TAG));
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

test("the sign-in page's privacy note says what is sent, names every dashboard event, and has no inline style", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const note = html.match(
    /<p class="privacy-note" id="privacy">([\s\S]*?)<\/p>/,
  );
  assert.ok(note, "index.html has the privacy note");
  assert.doesNotMatch(note[0], /\sstyle=/);
  const body = html.slice(
    html.indexOf("<body>"),
    html.indexOf("data-site-footer"),
  );
  assert.ok(body.includes(note[0]), "the note is in <body>, before the footer");
  const text = note[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
  for (const phrase of [
    "HintWise's own analytics",
    "the pages viewed",
    "how long each was on screen",
    "links followed to other sites",
    "script errors",
    "/p/:id, never the post's own code",
    "nothing you write or upload is sent",
    "uses no cookie",
    "Do Not Track",
    "Global Privacy Control",
  ]) {
    assert.ok(text.includes(phrase), `the note says "${phrase}"`);
  }
  // The dashboard's own events, each named in the note.
  const js = readFileSync(
    new URL("../static/dashboard.js", import.meta.url),
    "utf8",
  );
  const events = new Set(
    [...js.matchAll(/hintwise\?\.track\("([a-z_]+)"/g)].map((m) => m[1]),
  );
  assert.deepEqual([...events].sort(), [
    "file_imported",
    "post_created",
    "preview_opened",
  ]);
  const said = {
    post_created: "a post is created (and whether it has a password)",
    file_imported: "a file is imported",
    preview_opened: "a preview is opened",
  };
  for (const e of events) assert.ok(text.includes(said[e]), e);
});

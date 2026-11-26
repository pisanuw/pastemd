// post-page.mjs, the server-rendered /p/<id> page: the analytics tag only where
// data-mask="/p/" covers the path, and the security headers netlify.toml gives
// every other page (its [[headers]] do not apply to a function's response).
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMemoryDb } from "./helpers.mjs";

const { createPost } = await import("../netlify/functions/lib/posts-store.mjs");
const postPage = (await import("../netlify/functions/post-page.mjs")).default;

const TAG =
  '<script defer src="/hw-events.js" data-app="paste-md" data-mask="/p/"></script>';

let open;
let locked;
before(async () => {
  createMemoryDb();
  open = await createPost({
    title: "T",
    rawMd: "x",
    sanitizedHtml: "<p>x</p>",
    authorEmail: "a@example.com",
    authorName: "A",
  });
  locked = await createPost({
    title: "L",
    rawMd: "x",
    sanitizedHtml: "<p>x</p>",
    authorEmail: "a@example.com",
    authorName: "A",
    passwordHash: "00",
    passwordSalt: "00",
  });
});

const get = (path) => postPage(new Request(`http://localhost${path}`));

// The post pages, and the not-found pages with the message each one shows.
const found = () => [`/p/${open.id}`, `/p/${locked.id}`, `/p/${open.id}/`];
const NOT_FOUND = [
  ["/p/", "Invalid post URL."],
  ["/p/abcdefghijkl", "This post does not exist or has been deleted."],
  // Malformed links reach this function too, where data-mask="/p/" does not
  // cover the id: //p/<id> is not under /p/, and /p//<id> leaves an empty
  // segment for the mask, so the script would send the id itself.
  ["//p/abcdefghijkl", "This post does not exist or has been deleted."],
  ["/p//abcdefghijkl", "This post does not exist or has been deleted."],
  ["/p/abcdefghijkl/x", "This post does not exist or has been deleted."],
];

test("a post page loads hw-events.js once, in <head>, with /p/ masked", async () => {
  for (const path of found()) {
    const res = await get(path);
    assert.equal(res.status, 200, path);
    const html = await res.text();
    assert.equal(html.split(TAG).length - 1, 1, path);
    const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
    assert.ok(head.includes(TAG), path);
  }
});

test("a not-found page loads no analytics, so a malformed link cannot send a post id", async () => {
  for (const [path] of NOT_FOUND) {
    const res = await get(path);
    assert.equal(res.status, 404, path);
    const html = await res.text();
    assert.equal(html.includes("hw-events"), false, path);
  }
});

test("a not-found page shows its message without JavaScript", async () => {
  for (const [path, message] of NOT_FOUND) {
    const html = await (await get(path)).text();
    assert.ok(
      html.includes('<div id="error-view">'),
      `${path}: the error view is shown`,
    );
    assert.ok(
      html.includes(
        `<div class="alert alert-error" id="error-msg">${message}</div>`,
      ),
      `${path}: ${message}`,
    );
  }
});

// netlify.toml's [[headers]] blocks: { "/*": { header: value }, "/p/*": ... }.
function tomlHeaders() {
  const toml = readFileSync(
    new URL("../netlify.toml", import.meta.url),
    "utf8",
  ).replace(/^\s*#.*$/gm, "");
  const blocks = {};
  for (const block of toml.split("[[headers]]").slice(1)) {
    const path = block.match(/^\s*for\s*=\s*"([^"]+)"/m)[1];
    const values = block
      .slice(block.indexOf("[headers.values]"))
      .split(/^\s*\[/m)[1];
    blocks[path] = Object.fromEntries(
      [...values.matchAll(/^\s*([A-Za-z-]+)\s*=\s*"([^"]*)"/gm)].map((m) => [
        m[1],
        m[2],
      ]),
    );
  }
  return blocks;
}

test("every post-page response, found or not, carries netlify.toml's security headers and the /p/* CSP", async () => {
  const blocks = tomlHeaders();
  const expected = { ...blocks["/*"], ...blocks["/p/*"] };
  assert.deepEqual(Object.keys(expected).sort(), [
    "Content-Security-Policy",
    "Permissions-Policy",
    "Referrer-Policy",
    "Strict-Transport-Security",
    "X-Content-Type-Options",
    "X-Frame-Options",
  ]);
  assert.match(
    expected["Content-Security-Policy"],
    /img-src \* data:;/,
    "the /p/* policy",
  );
  for (const path of [...found(), ...NOT_FOUND.map(([p]) => p)]) {
    const res = await get(path);
    assert.equal(
      res.headers.get("content-type"),
      "text/html; charset=utf-8",
      path,
    );
    for (const [name, value] of Object.entries(expected)) {
      assert.equal(
        res.headers.get(name),
        value,
        `${path} (${res.status}): ${name}`,
      );
    }
  }
});

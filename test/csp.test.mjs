// The pages work under the CSP in netlify.toml without loosening it: no
// style="" attributes (style-src has no 'unsafe-inline'), no inline scripts
// (script-src 'self'). The only style attributes are the two inside Google's
// G on the sign-in page, allowed by hash in style-src-attr.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";
import { createMemoryDb, makeRequest } from "./helpers.mjs";

process.env.JWT_SECRET = "test-jwt-secret-for-tests-only";

const { createToken } = await import("../netlify/functions/lib/jwt.mjs");
const { createPost } = await import("../netlify/functions/lib/posts-store.mjs");
const postPage = (await import("../netlify/functions/post-page.mjs")).default;
const preview = (await import("../netlify/functions/preview.mjs")).default;

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
// Every page and page script in the repository, found on disk so a new one
// cannot be missed (hw-events.js, the platform's copy, writes no markup).
const filesIn = (dir, ext) =>
  readdirSync(new URL(`../${dir}`, import.meta.url))
    .filter((f) => f.endsWith(ext))
    .sort();
const PAGES = filesIn("", ".html");
const SCRIPTS = filesIn("static/", ".js").map((f) => `static/${f}`);

test("the pages and scripts checked here are all of them", () => {
  assert.deepEqual(PAGES, [
    "404.html",
    "admin.html",
    "dashboard.html",
    "email-sent.html",
    "index.html",
    "post.html",
  ]);
  assert.deepEqual(SCRIPTS, [
    "static/admin.js",
    "static/dashboard.js",
    "static/email-sent.js",
    "static/index.js",
    "static/post.js",
  ]);
});

const styleAttrs = (html) =>
  [...html.matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)].map((m) => m[1]);
const sha256 = (s) =>
  `'sha256-${createHash("sha256").update(s).digest("base64")}'`;

const toml = read("netlify.toml");
const policies = [
  ...toml.matchAll(
    /for = "([^"]+)"[\s\S]*?Content-Security-Policy\s*=\s*"([^"]*)"/g,
  ),
].map((m) => ({
  path: m[1],
  csp: m[2],
}));
const directive = (csp, name) =>
  csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.split(/\s+/)[0] === name);

// Every page as served: the static files, a public and a password post, the
// not-found pages (malformed links included), a preview.
async function servedPages() {
  const pages = PAGES.map((page) => ({ name: page, html: read(page) }));
  createMemoryDb();
  const open = await createPost({
    title: "T",
    rawMd: "x",
    sanitizedHtml: "<p>x</p>",
    authorEmail: "a@example.com",
    authorName: "A",
  });
  const locked = await createPost({
    title: "L",
    rawMd: "x",
    sanitizedHtml: "<p>x</p>",
    authorEmail: "a@example.com",
    authorName: "A",
    passwordHash: "00",
    passwordSalt: "00",
  });
  for (const [name, path] of [
    ["public post", `/p/${open.id}`],
    ["password post", `/p/${locked.id}`],
    ["missing post", "/p/nope"],
    ["no post id", "/p/"],
    ["//p/<id>", "//p/nope"],
    ["/p//<id>", "/p//nope"],
  ]) {
    const res = await postPage(new Request(`http://localhost${path}`));
    pages.push({ name, html: await res.text() });
  }
  const token = createToken({ email: "a@example.com", name: "A" });
  const res = await preview(
    makeRequest("POST", "http://localhost/api/preview", {
      body: { title: "T", content: "# x" },
      cookies: { token },
    }),
  );
  assert.equal(res.status, 200);
  pages.push({ name: "preview", html: await res.text() });
  return pages;
}

test("no served page has a style attribute, except Google's G on the sign-in page", async () => {
  for (const { name, html } of await servedPages()) {
    const attrs = styleAttrs(html);
    if (name === "index.html") {
      assert.equal(
        attrs.length,
        2,
        "only the G's mask-type and conic gradient",
      );
      assert.ok(
        attrs[0] === "mask-type:alpha" &&
          attrs[1].startsWith("background:conic-gradient("),
      );
    } else {
      assert.deepEqual(
        attrs,
        [],
        `${name} has style="" attributes, which the CSP blocks`,
      );
    }
  }
});

test("the page scripts write no style attributes either", () => {
  for (const file of SCRIPTS) {
    const js = read(file);
    assert.doesNotMatch(
      js,
      /style\s*=\s*["'\\]/,
      `${file} builds markup with style=""`,
    );
    assert.doesNotMatch(js, /setAttribute\(\s*["']style["']/, file);
  }
});

test("the site CSP allows exactly the G's two style attributes, by hash, and nothing inline", () => {
  const site = policies.find((p) => p.path === "/*").csp;
  const index = read("index.html");
  const hashes = styleAttrs(index).map(sha256);
  assert.equal(
    directive(site, "style-src-attr"),
    `style-src-attr 'unsafe-hashes' ${hashes.join(" ")}`,
  );
  for (const { csp } of policies) {
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
    assert.equal(directive(csp, "script-src"), "script-src 'self'");
  }
});

test("no served page has an inline script: every <script> loads a same-origin file", async () => {
  for (const { name, html } of await servedPages()) {
    for (const [, tag, body] of [
      ...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi),
    ]) {
      assert.match(
        tag,
        /\ssrc="\/[^/"][^"]*"/,
        `${name} has an inline <script>, which the CSP blocks`,
      );
      assert.equal(body.trim(), "", name);
    }
    assert.doesNotMatch(
      html,
      /\son[a-z]+\s*=\s*"/i,
      `${name} has an inline event handler`,
    );
  }
});

test("email-sent.html shows the address from ?email= (static/email-sent.js)", () => {
  const html = read("email-sent.html");
  assert.ok(html.includes('<script src="/static/email-sent.js"></script>'));
  assert.ok(html.includes('<strong id="email-display"></strong>'));
  const el = { textContent: "" };
  const document = {
    getElementById: (id) => (id === "email-display" ? el : null),
  };
  const location = {
    search: "?email=" + encodeURIComponent("ada+test@example.com"),
  };
  vm.runInNewContext(read("static/email-sent.js"), {
    document,
    location,
    URLSearchParams,
  });
  assert.equal(el.textContent, "ada+test@example.com");
});

test("email-sent.js leaves the address empty when there is none", () => {
  const el = { textContent: "" };
  const document = { getElementById: () => el };
  vm.runInNewContext(read("static/email-sent.js"), {
    document,
    location: { search: "" },
    URLSearchParams,
  });
  assert.equal(el.textContent, "");
});

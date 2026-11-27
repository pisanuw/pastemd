// The light and dark mode switch (claude-built-apps platform/src/theme/README.md):
// hw-theme-init.js and hw-theme.js copied unchanged, both on every page as
// served, the button in each page's header, and a dark palette that meets
// contrast. The pages keep script-src 'self' (test/csp.test.mjs): the init
// script is a file, loaded without defer before the stylesheet, so the first
// paint already has the theme.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";
import { createMemoryDb, makeRequest } from "./helpers.mjs";

process.env.JWT_SECRET = "test-jwt-secret-for-tests-only";

const { createToken } = await import("../netlify/functions/lib/jwt.mjs");
const { createPost } = await import("../netlify/functions/lib/posts-store.mjs");
const postPage = (await import("../netlify/functions/post-page.mjs")).default;
const preview = (await import("../netlify/functions/preview.mjs")).default;

// From platform/src/theme/README.md, "The values". A failure here means a copy differs.
const HW_THEME_SHA256 =
  "3b1a9b360cc671e8298b09738924d15fc8c99c112fbebc2db8e1c93cf6891625";
const THEME_INIT_CSP = "'sha256-GhyjaPQKUCt6Zif2GMbTG7M6cUY6iW77/obk7CBvquk='";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const INIT_TAG = '<script src="/hw-theme-init.js"></script>';
const RUNTIME_TAG = '<script defer src="/hw-theme.js"></script>';
const TOGGLE = "<hw-theme-toggle></hw-theme-toggle>";

test("hw-theme.js is the platform's copy, byte for byte", () => {
  const js = readFileSync(new URL("../hw-theme.js", import.meta.url));
  assert.equal(createHash("sha256").update(js).digest("hex"), HW_THEME_SHA256);
});

test("hw-theme-init.js is the platform's theme-init.js, byte for byte", () => {
  const js = readFileSync(new URL("../hw-theme-init.js", import.meta.url));
  assert.equal(
    `'sha256-${createHash("sha256").update(js).digest("base64")}'`,
    THEME_INIT_CSP,
  );
});

test("hw-theme-init.js applies a stored choice, else the device setting", () => {
  const run = (stored, dark) => {
    const attrs = {};
    const ctx = {
      localStorage: { getItem: () => stored },
      document: { documentElement: { setAttribute: (k, v) => (attrs[k] = v) } },
      matchMedia: () => ({ matches: dark }),
    };
    ctx.window = ctx;
    vm.runInNewContext(read("hw-theme-init.js"), ctx);
    return attrs["data-theme"];
  };
  assert.equal(run("dark", false), "dark");
  assert.equal(run("light", true), "light");
  assert.equal(run(null, true), "dark");
  assert.equal(run(null, false), "light");
});

// Every page as served: the static files, a public and a password post, a
// missing post, and a preview.
async function servedPages() {
  const pages = [
    "404.html",
    "admin.html",
    "dashboard.html",
    "email-sent.html",
    "index.html",
    "post.html",
  ].map((page) => ({ name: page, html: read(page) }));
  createMemoryDb();
  const base = {
    title: "T",
    rawMd: "x",
    sanitizedHtml: "<p>x</p>",
    authorEmail: "a@example.com",
    authorName: "A",
  };
  const open = await createPost(base);
  const locked = await createPost({
    ...base,
    passwordHash: "00",
    passwordSalt: "00",
  });
  for (const [name, path] of [
    ["public post", `/p/${open.id}`],
    ["password post", `/p/${locked.id}`],
    ["missing post", "/p/nope"],
  ]) {
    const res = await postPage(new Request(`http://localhost${path}`));
    pages.push({ name, html: await res.text() });
  }
  const res = await preview(
    makeRequest("POST", "http://localhost/api/preview", {
      body: { title: "T", content: "# x" },
      cookies: { token: createToken({ email: "a@example.com", name: "A" }) },
    }),
  );
  assert.equal(res.status, 200);
  pages.push({ name: "preview", html: await res.text() });
  return pages;
}

test("every page sets the theme before its stylesheet, and loads the switch", async () => {
  for (const { name, html } of await servedPages()) {
    const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
    assert.equal(
      head.split(INIT_TAG).length - 1,
      1,
      `${name}: the init script once`,
    );
    assert.equal(
      head.split(RUNTIME_TAG).length - 1,
      1,
      `${name}: hw-theme.js once`,
    );
    const css = head.indexOf(
      '<link rel="stylesheet" href="/static/style.css">',
    );
    assert.ok(css > 0, name);
    assert.ok(
      head.indexOf(INIT_TAG) < css,
      `${name}: the init script comes first`,
    );
  }
});

test("every page has one switch, in its header", async () => {
  for (const { name, html } of await servedPages()) {
    assert.equal(html.split(TOGGLE).length - 1, 1, name);
    const header = html.match(
      /<header class="site-header[^"]*">([\s\S]*?)<\/header>/,
    );
    assert.ok(header, `${name} has a header`);
    assert.ok(
      header[1].includes(TOGGLE),
      `${name}: the switch is in the header`,
    );
  }
});

const css = read("static/style.css");
const block = (re) => css.match(re)?.[1].replace(/\s+/g, " ").trim();
const light = block(/:root\s*\{([^}]*)\}/);
const dark = block(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/);
const value = (theme, name) =>
  theme.match(new RegExp(`--${name}: (#[0-9a-fA-F]{6});`))?.[1];

test("the dark palette is the same for the switch and for the device setting", () => {
  assert.ok(dark);
  assert.equal(
    block(/:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}/),
    dark,
  );
  assert.match(dark, /color-scheme: dark;/);
});

test("the dark palette sets every colour the light one does", () => {
  const colours = (s) =>
    [...s.matchAll(/--([a-z-]+): (#|rgba)/g)].map((m) => m[1]).sort();
  // --danger and --danger-hover are button fills under white text in both themes.
  const both = colours(light).filter(
    (n) => !n.startsWith("danger") || n === "danger-text",
  );
  assert.deepEqual(colours(dark), both);
});

test("text and buttons meet WCAG AA contrast in both themes", () => {
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const pairs = [
    ["text", "bg"],
    ["text", "surface"],
    ["muted", "bg"],
    ["muted", "surface"],
    ["accent", "bg"],
    ["accent", "surface"],
    ["accent-hover", "surface"],
    ["on-accent", "accent"],
    ["on-accent", "accent-hover"],
    ["danger-text", "bg"],
    ["danger-text", "surface"],
    ["text", "code-bg"],
    ["error-text", "error-bg"],
    ["success-text", "success-bg"],
    ["badge-text", "badge-bg"],
  ];
  for (const [name, theme] of [
    ["light", light],
    ["dark", dark],
  ]) {
    for (const [fg, bg] of pairs) {
      const r = ratio(
        value(theme, fg) ?? value(light, fg),
        value(theme, bg) ?? value(light, bg),
      );
      assert.ok(r >= 4.5, `${name}: --${fg} on --${bg} is ${r.toFixed(2)}:1`);
    }
    // White text on the danger buttons, which are the same in both themes.
    assert.ok(ratio("#ffffff", value(light, "danger")) >= 4.5);
  }
});

test("no colour is hard-coded outside the tokens, except Google's sign-in button and white on red", () => {
  const rules = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/@media \(prefers-color-scheme: dark\)/)[0];
  const outside = rules
    .replace(/:root(\[data-theme="dark"\])?\s*\{[^}]*\}/g, "")
    .split("\n")
    .filter((l) => /#[0-9a-fA-F]{3,6}\b/.test(l));
  for (const line of outside) {
    assert.match(
      line,
      /#FFFFFF|#747775|#1F1F1F|#F8F9FA|color: #fff;/,
      `hard-coded colour: ${line.trim()}`,
    );
  }
});

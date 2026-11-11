// The shared HintWise footer (claude-built-apps scripts/site-footer.mjs) on every page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { SITE_FOOTER_HTML, SITE_FOOTER_SHA256 } from "../netlify/functions/lib/site-footer.mjs";

const PAGES = ["index.html", "dashboard.html", "post.html", "admin.html", "email-sent.html", "404.html"];

test("the footer is footerHtml('paste-md'), byte for byte", () => {
  assert.equal(createHash("sha256").update(SITE_FOOTER_HTML).digest("hex"), SITE_FOOTER_SHA256);
  assert.equal(SITE_FOOTER_SHA256, "e2e23ee8532b9117360b78d0961ce3a09685f302b98ea3b0957bb6ccb1afa08f");
  assert.ok(SITE_FOOTER_HTML.includes("mailto:builder@hintwise.org?subject=Project%20idea%20(via%20paste-md)"));
});

for (const page of PAGES) {
  test(`${page} carries the footer once, just before </body>`, () => {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
    assert.equal(html.split("data-site-footer").length - 1, 1);
    assert.ok(html.includes(`${SITE_FOOTER_HTML}\n</body>`));
  });
}

test("server-rendered post pages carry the footer once, just before </body>", async () => {
  const { shell } = await import("../netlify/functions/post-page.mjs");
  const html = shell("t", "d", "", "<p>x</p>");
  assert.equal(html.split("data-site-footer").length - 1, 1);
  assert.ok(html.includes(`${SITE_FOOTER_HTML}\n</body>`));
});

test("every Content-Security-Policy allows the footer's own style by its hash, and nothing more", () => {
  const css = SITE_FOOTER_HTML.match(/<style>([\s\S]*?)<\/style>/)[1];
  const hash = `'sha256-${createHash("sha256").update(css).digest("base64")}'`;
  const toml = readFileSync(new URL("../netlify.toml", import.meta.url), "utf8");
  const policies = [...toml.matchAll(/Content-Security-Policy\s*=\s*"([^"]*)"/g)].map((m) => m[1]);
  assert.ok(policies.length >= 3);
  for (const p of policies) {
    // Without it the browser drops the footer's <style>: it shows unstyled, left-aligned.
    assert.match(p, new RegExp(`style-src 'self' ${hash.replace(/[+/=]/g, "\\$&")};`));
    assert.doesNotMatch(p, /unsafe-inline/);
  }
});

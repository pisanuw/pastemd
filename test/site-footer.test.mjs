// The shared HintWise footer (claude-built-apps scripts/site-footer.mjs) on every page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { SITE_FOOTER_HTML, SITE_FOOTER_SHA256 } from "../netlify/functions/lib/site-footer.mjs";

const PAGES = ["index.html", "dashboard.html", "post.html", "admin.html", "email-sent.html", "404.html"];

test("the footer is footerHtml('paste-md'), byte for byte", () => {
  assert.equal(createHash("sha256").update(SITE_FOOTER_HTML).digest("hex"), SITE_FOOTER_SHA256);
  assert.equal(SITE_FOOTER_SHA256, "588a7183a535ab13267b526b09d33538a6aee7b5c44d5db81132f2ff18d8efa3");
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

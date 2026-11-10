// The sign-in page's Google button under Google's branding guidelines
// (https://developers.google.com/identity/branding-guidelines).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../static/style.css", import.meta.url), "utf8");

// sha256 of "Theme=Light, Show text=No, Shape=Square, Platform=Android+Web.svg"
// from Google's signin-assets.zip (Android + Web/SVG/Light).
const GOOGLE_G_SHA256 = "6587b180203a99da15c0a041018e15c94ffd9556c4b9855bdc69806081a93791";
const SHOWN = '<svg width="20" height="20" viewBox="10 10 20 20" focusable="false" aria-hidden="true"';
const ORIGINAL = '<svg width="40" height="40" viewBox="0 0 40 40"';

test("the G is Google's asset, unmodified, shown as its 20x20 G", () => {
  const start = html.indexOf(SHOWN);
  assert.ok(start > 0, "the cropped G is on the page");
  const end = html.indexOf("</svg>", start) + "</svg>".length;
  const asset = ORIGINAL + html.slice(start + SHOWN.length, end) + "\n";
  assert.equal(createHash("sha256").update(asset).digest("hex"), GOOGLE_G_SHA256);
});

test("Google's text, and both sign-in buttons share one shape", () => {
  assert.match(html, /class="btn btn-signin btn-google" id="google-btn">[\s\S]*?Sign in with Google\s*<\/a>/);
  assert.match(html, /class="btn btn-signin" id="magic-btn"/);
  assert.doesNotMatch(html, /btn-primary/);
});

test("the light theme's colours, type and size", () => {
  const rule = css.slice(css.indexOf(".btn-signin {"), css.indexOf("}", css.indexOf(".btn-signin {")));
  for (const decl of [
    "background: #FFFFFF",
    "border: 1px solid #747775",
    "color: #1F1F1F",
    "font-family: 'Google Sans', Roboto, Arial, sans-serif",
    "font-weight: 500",
    "font-size: 14px",
    "line-height: 20px",
    "height: 40px",
    "padding: 0 12px",
    "border-radius: 20px",
  ]) {
    assert.ok(rule.includes(decl), `.btn-signin has ${decl}`);
  }
  assert.match(css, /\.btn-google \.google-g \{[^}]*margin-right: 10px/);
});

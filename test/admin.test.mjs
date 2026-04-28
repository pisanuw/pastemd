/**
 * test/admin.test.mjs — unit tests for admin handler
 */
import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createMemoryDb, makeRequest, makeContext } from "./helpers.mjs";

process.env.JWT_SECRET = "test-jwt-secret-for-tests-only";
process.env.APP_URL = "http://localhost:8888";
process.env.ADMIN_EMAILS = "admin@example.com";

const { createToken } = await import("../netlify/functions/lib/jwt.mjs");
const { createPost } = await import("../netlify/functions/lib/posts-store.mjs");
const adminHandler = (await import("../netlify/functions/admin.mjs")).default;

let db;

const admin = { id: "admin1", email: "admin@example.com", name: "Admin", is_admin: true };
const alice = { id: "u1", email: "alice@example.com", name: "Alice", is_admin: false };

function authCookie(user) {
  return { token: createToken(user) };
}

describe("admin handler", () => {
  before(() => { db = createMemoryDb(); });
  beforeEach(() => db.reset());

  it("GET /api/admin/posts returns 401 for unauthenticated", async () => {
    const req = makeRequest("GET", "http://localhost/api/admin/posts");
    const res = await adminHandler(req, makeContext({ 0: "posts" }));
    assert.equal(res.status, 401);
  });

  it("GET /api/admin/posts returns 403 for non-admin", async () => {
    const req = makeRequest("GET", "http://localhost/api/admin/posts", { cookies: authCookie(alice) });
    const res = await adminHandler(req, makeContext({ 0: "posts" }));
    assert.equal(res.status, 403);
  });

  it("GET /api/admin/posts returns all posts for admin", async () => {
    await createPost({ title: "A", rawMd: "a", sanitizedHtml: "<p>a</p>", authorEmail: "alice@example.com", authorName: "Alice" });
    await createPost({ title: "B", rawMd: "b", sanitizedHtml: "<p>b</p>", authorEmail: "bob@example.com", authorName: "Bob" });

    const req = makeRequest("GET", "http://localhost/api/admin/posts", { cookies: authCookie(admin) });
    const res = await adminHandler(req, makeContext({ 0: "posts" }));
    assert.equal(res.status, 200);
    const { posts } = await res.json();
    assert.equal(posts.length, 2);
  });

  it("DELETE /api/admin/posts/:id removes any post", async () => {
    const post = await createPost({ title: "Target", rawMd: "x", sanitizedHtml: "<p>x</p>", authorEmail: "alice@example.com", authorName: "Alice" });

    const req = makeRequest("DELETE", `http://localhost/api/admin/posts/${post.id}`, {
      cookies: authCookie(admin),
    });
    const res = await adminHandler(req, makeContext({ 0: `posts/${post.id}` }));
    assert.equal(res.status, 200);

    // Verify it's gone
    const { getPost } = await import("../netlify/functions/lib/posts-store.mjs");
    const fetched = await getPost(post.id);
    assert.equal(fetched, null);
  });

  it("DELETE /api/admin/posts/:id returns 404 for unknown id", async () => {
    const req = makeRequest("DELETE", "http://localhost/api/admin/posts/doesnotexist", {
      cookies: authCookie(admin),
    });
    const res = await adminHandler(req, makeContext({ 0: "posts/doesnotexist" }));
    assert.equal(res.status, 404);
  });

  it("non-admin cannot delete via admin route", async () => {
    const post = await createPost({ title: "Safe", rawMd: "x", sanitizedHtml: "<p>x</p>", authorEmail: "alice@example.com", authorName: "Alice" });

    const req = makeRequest("DELETE", `http://localhost/api/admin/posts/${post.id}`, {
      cookies: authCookie(alice),
    });
    const res = await adminHandler(req, makeContext({ 0: `posts/${post.id}` }));
    assert.equal(res.status, 403);
  });
});

describe("markdown sanitization", () => {
  it("renderMarkdown strips script tags", async () => {
    const { renderMarkdown } = await import("../netlify/functions/lib/markdown.mjs");
    const output = renderMarkdown('<script>alert("xss")</script>\n\nHello');
    assert.ok(!output.includes("<script"), "script tag should be stripped");
    assert.ok(output.includes("Hello"));
  });

  it("renderMarkdown strips onclick attributes", async () => {
    const { renderMarkdown } = await import("../netlify/functions/lib/markdown.mjs");
    const output = renderMarkdown('<a onclick="evil()">Click</a>');
    assert.ok(!output.includes("onclick"), "onclick should be stripped");
  });

  it("renderMarkdown preserves safe markdown", async () => {
    const { renderMarkdown } = await import("../netlify/functions/lib/markdown.mjs");
    const output = renderMarkdown("# Hello\n\nThis is **bold** and _italic_.");
    assert.ok(output.includes("<h1>Hello</h1>"));
    assert.ok(output.includes("<strong>bold</strong>"));
    assert.ok(output.includes("<em>italic</em>"));
  });

  it("renderMarkdown adds target=_blank and rel=noopener to links", async () => {
    const { renderMarkdown } = await import("../netlify/functions/lib/markdown.mjs");
    const output = renderMarkdown("[example](https://example.com)");
    assert.ok(output.includes('target="_blank"'));
    assert.ok(output.includes('rel="noopener noreferrer"'));
  });

  it("renderMarkdown allows img tags", async () => {
    const { renderMarkdown } = await import("../netlify/functions/lib/markdown.mjs");
    const output = renderMarkdown("![alt text](https://example.com/img.png)");
    assert.ok(output.includes('<img src="https://example.com/img.png"'));
  });

  it("renderMarkdown strips javascript: URLs in links", async () => {
    const { renderMarkdown } = await import("../netlify/functions/lib/markdown.mjs");
    const output = renderMarkdown("[click](javascript:alert(1))");
    assert.ok(!output.includes("javascript:"), "javascript: URL should be stripped");
  });
});

/**
 * test/posts.test.mjs — unit tests for post CRUD
 */
import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { createMemoryDb, makeRequest, makeContext } from "./helpers.mjs";
import { createToken } from "../netlify/functions/lib/jwt.mjs";

// Set required env vars before importing anything that reads them
process.env.JWT_SECRET = "test-jwt-secret-for-tests-only";
process.env.APP_URL = "http://localhost:8888";

// Import after env vars are set
const { createPost, getPost, deletePost, getUserPosts, getAllPosts } =
  await import("../netlify/functions/lib/posts-store.mjs");
const handler = (await import("../netlify/functions/posts.mjs")).default;

let db;

function authCookie(user) {
  const token = createToken(user);
  return { token };
}

describe("posts-store", () => {
  before(() => { db = createMemoryDb(); });
  beforeEach(() => db.reset());

  it("creates a post and retrieves it by id", async () => {
    const post = await createPost({
      title: "Hello World",
      rawMd: "# Hello\nThis is a test.",
      sanitizedHtml: "<h1>Hello</h1><p>This is a test.</p>",
      authorEmail: "alice@example.com",
      authorName: "Alice",
    });

    assert.ok(post.id, "post has an id");
    assert.equal(post.title, "Hello World");
    assert.equal(post.authorEmail, "alice@example.com");

    const fetched = await getPost(post.id);
    assert.equal(fetched.id, post.id);
    assert.equal(fetched.title, "Hello World");
  });

  it("getUserPosts returns posts for the right author", async () => {
    await createPost({ title: "Post 1", rawMd: "a", sanitizedHtml: "<p>a</p>", authorEmail: "alice@example.com", authorName: "Alice" });
    await createPost({ title: "Post 2", rawMd: "b", sanitizedHtml: "<p>b</p>", authorEmail: "alice@example.com", authorName: "Alice" });
    await createPost({ title: "Bob Post", rawMd: "c", sanitizedHtml: "<p>c</p>", authorEmail: "bob@example.com", authorName: "Bob" });

    const alicePosts = await getUserPosts("alice@example.com");
    assert.equal(alicePosts.length, 2);
    assert.ok(alicePosts.every((p) => p.title.startsWith("Post")));
  });

  it("deletePost by owner succeeds", async () => {
    const post = await createPost({ title: "To Delete", rawMd: "x", sanitizedHtml: "<p>x</p>", authorEmail: "alice@example.com", authorName: "Alice" });
    const result = await deletePost(post.id, "alice@example.com", false);
    assert.ok(result.ok);
    const fetched = await getPost(post.id);
    assert.equal(fetched, null);
  });

  it("deletePost by non-owner fails with 403", async () => {
    const post = await createPost({ title: "Private", rawMd: "x", sanitizedHtml: "<p>x</p>", authorEmail: "alice@example.com", authorName: "Alice" });
    const result = await deletePost(post.id, "mallory@example.com", false);
    assert.ok(!result.ok);
    assert.equal(result.status, 403);
  });

  it("deletePost by admin succeeds regardless of owner", async () => {
    const post = await createPost({ title: "Admin Target", rawMd: "x", sanitizedHtml: "<p>x</p>", authorEmail: "alice@example.com", authorName: "Alice" });
    const result = await deletePost(post.id, "admin@example.com", true);
    assert.ok(result.ok);
  });

  it("deletePost removes post from owner's index", async () => {
    const post = await createPost({ title: "Index Test", rawMd: "x", sanitizedHtml: "<p>x</p>", authorEmail: "alice@example.com", authorName: "Alice" });
    await deletePost(post.id, "alice@example.com", false);
    const userPosts = await getUserPosts("alice@example.com");
    assert.equal(userPosts.length, 0);
  });

  it("getAllPosts returns posts from all users", async () => {
    await createPost({ title: "A", rawMd: "a", sanitizedHtml: "<p>a</p>", authorEmail: "alice@example.com", authorName: "Alice" });
    await createPost({ title: "B", rawMd: "b", sanitizedHtml: "<p>b</p>", authorEmail: "bob@example.com", authorName: "Bob" });
    const all = await getAllPosts();
    assert.equal(all.length, 2);
  });

  it("returns 404 for unknown post id", async () => {
    const result = await deletePost("nonexistent", "alice@example.com", false);
    assert.equal(result.status, 404);
  });
});

describe("posts API handler", () => {
  before(() => { db = createMemoryDb(); });
  beforeEach(() => db.reset());

  const alice = { id: "u1", email: "alice@example.com", name: "Alice", is_admin: false };

  it("GET /api/posts returns 401 without auth", async () => {
    const req = makeRequest("GET", "http://localhost/api/posts");
    const res = await handler(req, makeContext());
    assert.equal(res.status, 401);
  });

  it("GET /api/posts returns empty list for new user", async () => {
    const req = makeRequest("GET", "http://localhost/api/posts", { cookies: authCookie(alice) });
    const res = await handler(req, makeContext());
    assert.equal(res.status, 200);
    const { posts } = await res.json();
    assert.deepEqual(posts, []);
  });

  it("POST /api/posts creates a post and returns url", async () => {
    const req = makeRequest("POST", "http://localhost/api/posts", {
      cookies: authCookie(alice),
      body: { title: "My Test Post", content: "# Hello\nWorld" },
    });
    const res = await handler(req, makeContext());
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.id);
    assert.ok(data.url.startsWith("/p/"));
  });

  it("POST /api/posts returns 400 for missing title", async () => {
    const req = makeRequest("POST", "http://localhost/api/posts", {
      cookies: authCookie(alice),
      body: { content: "some content" },
    });
    const res = await handler(req, makeContext());
    assert.equal(res.status, 400);
  });

  it("POST /api/posts returns 400 for empty content", async () => {
    const req = makeRequest("POST", "http://localhost/api/posts", {
      cookies: authCookie(alice),
      body: { title: "Title", content: "   " },
    });
    const res = await handler(req, makeContext());
    assert.equal(res.status, 400);
  });

  it("GET /api/posts/:id returns post data without auth", async () => {
    // Create via store directly
    const { createPost: cp } = await import("../netlify/functions/lib/posts-store.mjs");
    const post = await cp({ title: "Public", rawMd: "hi", sanitizedHtml: "<p>hi</p>", authorEmail: "alice@example.com", authorName: "Alice" });

    const req = makeRequest("GET", `http://localhost/api/posts/${post.id}`);
    const res = await handler(req, makeContext({ 0: post.id }));
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.title, "Public");
    assert.equal(data.sanitizedHtml, "<p>hi</p>");
    // rawMd should NOT be in the public response
    assert.equal(data.rawMd, undefined);
  });

  it("GET /api/posts/:id returns 404 for unknown id", async () => {
    const req = makeRequest("GET", "http://localhost/api/posts/doesnotexist");
    const res = await handler(req, makeContext({ 0: "doesnotexist" }));
    assert.equal(res.status, 404);
  });

  it("DELETE /api/posts/:id removes post for owner", async () => {
    const { createPost: cp } = await import("../netlify/functions/lib/posts-store.mjs");
    const post = await cp({ title: "Delete Me", rawMd: "x", sanitizedHtml: "<p>x</p>", authorEmail: "alice@example.com", authorName: "Alice" });

    const req = makeRequest("DELETE", `http://localhost/api/posts/${post.id}`, {
      cookies: authCookie(alice),
    });
    const res = await handler(req, makeContext({ 0: post.id }));
    assert.equal(res.status, 200);
  });

  it("DELETE /api/posts/:id returns 403 for non-owner", async () => {
    const { createPost: cp } = await import("../netlify/functions/lib/posts-store.mjs");
    const post = await cp({ title: "Mine", rawMd: "x", sanitizedHtml: "<p>x</p>", authorEmail: "alice@example.com", authorName: "Alice" });

    const mallory = { id: "u2", email: "mallory@example.com", name: "Mallory", is_admin: false };
    const req = makeRequest("DELETE", `http://localhost/api/posts/${post.id}`, {
      cookies: authCookie(mallory),
    });
    const res = await handler(req, makeContext({ 0: post.id }));
    assert.equal(res.status, 403);
  });

  it("GET /api/posts lists only caller's posts", async () => {
    const { createPost: cp } = await import("../netlify/functions/lib/posts-store.mjs");
    await cp({ title: "Alice's", rawMd: "a", sanitizedHtml: "<p>a</p>", authorEmail: "alice@example.com", authorName: "Alice" });
    await cp({ title: "Bob's", rawMd: "b", sanitizedHtml: "<p>b</p>", authorEmail: "bob@example.com", authorName: "Bob" });

    const req = makeRequest("GET", "http://localhost/api/posts", { cookies: authCookie(alice) });
    const res = await handler(req, makeContext());
    const { posts } = await res.json();
    assert.equal(posts.length, 1);
    assert.equal(posts[0].title, "Alice's");
  });
});

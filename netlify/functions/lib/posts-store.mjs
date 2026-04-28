/**
 * lib/posts-store.mjs — Post CRUD using Netlify Blobs
 *
 * Stores:
 *   "posts"      — key: postId → full post object
 *   "user-posts" — key: authorEmail → array of { id, title, createdAt }
 */
import { getDb } from "./db.mjs";
import { generateId } from "./utils-core.mjs";

export async function createPost({ title, rawMd, sanitizedHtml, authorEmail, authorName }) {
  const id = generateId();
  const post = {
    id,
    title,
    rawMd,
    sanitizedHtml,
    authorEmail,
    authorName,
    createdAt: new Date().toISOString(),
  };

  const postsDb = getDb("posts");
  await postsDb.setJSON(id, post);

  // Update the per-user index
  const userPostsDb = getDb("user-posts");
  const existing = (await userPostsDb.get(authorEmail, { type: "json" }).catch(() => null)) || [];
  existing.unshift({ id, title, createdAt: post.createdAt });
  await userPostsDb.setJSON(authorEmail, existing);

  return post;
}

export async function getPost(id) {
  const postsDb = getDb("posts");
  return postsDb.get(id, { type: "json" }).catch(() => null);
}

/**
 * Delete a post. Admin users may delete any post; regular users only their own.
 */
export async function deletePost(id, callerEmail, isAdmin = false) {
  const post = await getPost(id);
  if (!post) return { ok: false, status: 404, error: "Not found" };
  if (!isAdmin && post.authorEmail !== callerEmail) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  const postsDb = getDb("posts");
  await postsDb.delete(id);

  // Remove from the owner's index
  const userPostsDb = getDb("user-posts");
  const existing =
    (await userPostsDb.get(post.authorEmail, { type: "json" }).catch(() => null)) || [];
  const updated = existing.filter((p) => p.id !== id);
  await userPostsDb.setJSON(post.authorEmail, updated);

  return { ok: true };
}

export async function getUserPosts(authorEmail) {
  const userPostsDb = getDb("user-posts");
  return (await userPostsDb.get(authorEmail, { type: "json" }).catch(() => null)) || [];
}

/**
 * List all posts across all users (admin use).
 * Returned in reverse-chronological order.
 */
export async function getAllPosts() {
  const postsDb = getDb("posts");
  const listing = await postsDb.list().catch(() => ({ blobs: [] }));
  const posts = await Promise.all(
    (listing.blobs || []).map((b) => postsDb.get(b.key, { type: "json" }).catch(() => null))
  );
  return posts
    .filter(Boolean)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

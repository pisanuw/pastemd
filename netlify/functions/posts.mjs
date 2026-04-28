/**
 * posts.mjs — Post CRUD router
 *
 *   GET    /api/posts       — list caller's own posts (auth required)
 *   POST   /api/posts       — create new post (auth required)
 *   GET    /api/posts/:id   — get single post, returns sanitized HTML (public)
 *   DELETE /api/posts/:id   — delete post (auth required, owner or admin)
 */
export const config = { path: ["/api/posts", "/api/posts/*"] };
import {
  getUserFromRequest,
  jsonResponse, errorResponse,
  getAdminEmails, getAppUrl,
  log,
  safeJson,
  sendEmail,
  renderMarkdown,
  createPost, getPost, deletePost, getUserPosts,
} from "./utils.mjs";

const FN = "posts";
const MAX_CONTENT_BYTES = 1_000_000; // 1 MB
const MAX_TITLE_LEN = 200;

async function notifyAdmin(post, req) {
  const adminEmails = getAdminEmails();
  if (!adminEmails.length) return;
  const appUrl = getAppUrl(req);
  const postUrl = `${appUrl}/p/${post.id}`;
  await sendEmail({
    to: adminEmails,
    subject: `[PasteMD] New post: ${post.title}`,
    html: `
      <p><strong>${post.authorName}</strong> (${post.authorEmail}) posted a new document.</p>
      <p><strong>Title:</strong> ${post.title}</p>
      <p><strong>Posted:</strong> ${post.createdAt}</p>
      <p><a href="${postUrl}">View post →</a></p>
    `,
    text: `New PasteMD post by ${post.authorName} (${post.authorEmail})\nTitle: ${post.title}\nURL: ${postUrl}`,
  });
}

export default async function handler(req, context) {
  const subPath = new URL(req.url).pathname.replace(/^\/api\/posts\/?/, "");
  log("info", FN, "request", { method: req.method, path: subPath });

  // ── Routes with a post ID (/api/posts/:id) ─────────────────────────────────
  if (subPath) {
    const id = subPath;

    // GET /api/posts/:id — public, no auth required
    if (req.method === "GET") {
      const post = await getPost(id);
      if (!post) return errorResponse(404, "Post not found");
      return jsonResponse(200, {
        id: post.id,
        title: post.title,
        sanitizedHtml: post.sanitizedHtml,
        authorName: post.authorName,
        createdAt: post.createdAt,
      });
    }

    // DELETE /api/posts/:id — auth required, owner or admin
    if (req.method === "DELETE") {
      const user = getUserFromRequest(req);
      if (!user) return errorResponse(401, "Unauthorized");

      const result = await deletePost(id, user.email, !!user.is_admin);
      if (!result.ok) return errorResponse(result.status || 403, result.error);
      return jsonResponse(200, { success: true });
    }

    return errorResponse(405, "Method not allowed");
  }

  // ── /api/posts ─────────────────────────────────────────────────────────────

  // GET /api/posts — list caller's own posts
  if (req.method === "GET") {
    const user = getUserFromRequest(req);
    if (!user) return errorResponse(401, "Unauthorized");
    const posts = await getUserPosts(user.email);
    return jsonResponse(200, { posts });
  }

  // POST /api/posts — create new post
  if (req.method === "POST") {
    const user = getUserFromRequest(req);
    if (!user) return errorResponse(401, "Unauthorized");

    const body = await safeJson(req);
    if (body === null) return errorResponse(400, "Invalid JSON");

    const title = (body.title || "").trim().slice(0, MAX_TITLE_LEN);
    const content = body.content || "";

    if (!title) return errorResponse(400, "Title is required");
    if (!content.trim()) return errorResponse(400, "Content is required");
    if (Buffer.byteLength(content, "utf8") > MAX_CONTENT_BYTES) {
      return errorResponse(400, "Content too large (max 1 MB)");
    }

    const sanitizedHtml = renderMarkdown(content);
    const post = await createPost({
      title,
      rawMd: content,
      sanitizedHtml,
      authorEmail: user.email,
      authorName: user.name,
    });

    // Fire-and-forget admin notification
    notifyAdmin(post, req).catch((err) =>
      log("error", FN, "admin notification failed", { error: err.message })
    );

    log("info", FN, "post created", { id: post.id, email: user.email });
    return jsonResponse(201, { id: post.id, url: `/p/${post.id}` });
  }

  return errorResponse(405, "Method not allowed");
}

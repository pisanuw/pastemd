/**
 * admin.mjs — Admin-only API
 *
 * All routes require the caller to be an admin (is_admin flag in JWT).
 *
 * Routes via context.params["0"]:
 *   GET  "posts"  — list all posts across all users
 *   DELETE "posts/:id" — admin delete any post
 */
import {
  getUserFromRequest,
  jsonResponse, errorResponse,
  log,
  getAllPosts, deletePost,
} from "./utils.mjs";

const FN = "admin";

function requireAdmin(req) {
  const user = getUserFromRequest(req);
  if (!user) return { user: null, err: errorResponse(401, "Unauthorized") };
  if (!user.is_admin) return { user: null, err: errorResponse(403, "Forbidden") };
  return { user, err: null };
}

export default async function handler(req, context) {
  const subPath = (context.params?.["0"] || "").replace(/^\//, "");
  log("info", FN, "request", { method: req.method, path: subPath });

  // GET /api/admin/posts — list all posts
  if (req.method === "GET" && (subPath === "posts" || subPath === "")) {
    const { user, err } = requireAdmin(req);
    if (err) return err;
    log("info", FN, "listing all posts", { admin: user.email });
    const posts = await getAllPosts();
    return jsonResponse(200, { posts });
  }

  // DELETE /api/admin/posts/:id — admin delete any post
  if (req.method === "DELETE" && subPath.startsWith("posts/")) {
    const { user, err } = requireAdmin(req);
    if (err) return err;
    const id = subPath.slice("posts/".length);
    const result = await deletePost(id, user.email, true);
    if (!result.ok) return errorResponse(result.status || 404, result.error);
    log("info", FN, "admin deleted post", { id, admin: user.email });
    return jsonResponse(200, { success: true });
  }

  return errorResponse(404, "Not found");
}

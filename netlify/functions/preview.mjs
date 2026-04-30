/**
 * preview.mjs — Render markdown to a preview HTML page (auth required, not saved)
 *
 *   POST /api/preview — render {title, content} and return a full HTML page
 */
export const config = { path: "/api/preview" };
import { getUserFromRequest, errorResponse, safeJson, renderMarkdown } from "./utils.mjs";

const MAX_CONTENT_BYTES = 1_000_000;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default async function handler(req) {
  if (req.method !== "POST") return errorResponse(405, "Method not allowed");

  const user = getUserFromRequest(req);
  if (!user) return errorResponse(401, "Unauthorized");

  const body = await safeJson(req);
  if (body === null) return errorResponse(400, "Invalid JSON");

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const content = typeof body.content === "string" ? body.content : "";

  if (Buffer.byteLength(content, "utf8") > MAX_CONTENT_BYTES) {
    return errorResponse(400, "Content too large (max 1 MB)");
  }

  const sanitizedHtml = renderMarkdown(content || " ");
  const displayTitle = escapeHtml(title || "Untitled");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${displayTitle} — Preview — PasteMD</title>
  <link rel="stylesheet" href="/static/style.css">
</head>
<body>
  <header class="site-header">
    <a href="/dashboard.html" class="logo">PasteMD</a>
    <span class="spacer"></span>
    <span class="preview-badge">Preview — not published</span>
  </header>
  <div class="container">
    <div class="post-header">
      <h1>${displayTitle}</h1>
      <p class="post-meta">Draft preview · by ${escapeHtml(user.name)}</p>
    </div>
    <div class="post-body">${sanitizedHtml}</div>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

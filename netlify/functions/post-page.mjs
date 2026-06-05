/**
 * post-page.mjs — Server-side render a post page for /p/:id
 *
 * Returns a fully-populated HTML page so that non-JS clients (AI agents,
 * curl, link previewers) see actual content rather than an empty shell.
 *
 * Public posts:    full content in DOM, no JS needed to read.
 * Password posts:  metadata + password form in DOM; post.js handles unlock.
 */
export const config = { path: "/p/*" };
import { getPost, incrementPostViews, log } from "./utils.mjs";

const FN = "post-page";

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(iso) {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function shell(title, ogDescription, bodyAttrs, inner) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)} — PasteMD</title>
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(ogDescription)}">
  <meta property="og:type" content="article">
  <link rel="stylesheet" href="/static/style.css">
</head>
<body ${bodyAttrs}>
  <header class="site-header">
    <a href="/" class="logo">PasteMD</a>
    <span class="spacer"></span>
  </header>
  <div class="container">
    <div id="loading" class="loading hidden"></div>
    <div id="error-view" class="hidden">
      <div class="alert alert-error" id="error-msg"></div>
      <a href="/">← Back</a>
    </div>
    ${inner}
  </div>
  <script src="/static/post.js"></script>
</body>
</html>`;
}

function publicInner(post) {
  return `
    <div id="password-view" class="hidden">
      <div class="card password-card">
        <h2 class="password-card-title" id="pw-post-title"></h2>
        <p class="post-meta" style="margin-bottom:1.5rem;">By <span id="pw-post-author"></span> · <span id="pw-post-date"></span></p>
        <div class="alert alert-error hidden" id="pw-error"></div>
        <form id="password-form">
          <div class="form-group">
            <label for="pw-input">Password required to view this post</label>
            <input type="password" id="pw-input" placeholder="Enter password" autocomplete="current-password" required>
          </div>
          <button type="submit" class="btn btn-primary" id="pw-btn">Unlock</button>
        </form>
      </div>
    </div>
    <div id="post-view">
      <div class="post-header">
        <h1 id="post-title">${esc(post.title)}</h1>
        <p class="post-meta">By <span id="post-author">${esc(post.authorName)}</span> · <span id="post-date">${fmtDate(post.createdAt)}</span></p>
      </div>
      <div class="post-body" id="post-body">${post.sanitizedHtml}</div>
    </div>`;
}

function passwordInner(post) {
  return `
    <div id="password-view">
      <div class="card password-card">
        <h2 class="password-card-title" id="pw-post-title">${esc(post.title)}</h2>
        <p class="post-meta" style="margin-bottom:1.5rem;">By <span id="pw-post-author">${esc(post.authorName)}</span> · <span id="pw-post-date">${fmtDate(post.createdAt)}</span></p>
        <div class="alert alert-error hidden" id="pw-error"></div>
        <form id="password-form">
          <div class="form-group">
            <label for="pw-input">Password required to view this post</label>
            <input type="password" id="pw-input" placeholder="Enter password" autocomplete="current-password" required>
          </div>
          <button type="submit" class="btn btn-primary" id="pw-btn">Unlock</button>
        </form>
      </div>
    </div>
    <div id="post-view" class="hidden">
      <div class="post-header">
        <h1 id="post-title"></h1>
        <p class="post-meta">By <span id="post-author"></span> · <span id="post-date"></span></p>
      </div>
      <div class="post-body" id="post-body"></div>
    </div>`;
}

function notFoundInner() {
  return `
    <div id="password-view" class="hidden"></div>
    <div id="post-view" class="hidden"></div>`;
}

export default async function handler(req) {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const id = new URL(req.url).pathname.replace(/^\/p\//, "").replace(/\/$/, "");
  log("info", FN, "request", { id });

  if (!id) {
    const html = shell("Not Found", "Post not found", "",
      notFoundInner().replace('id="error-view" class="hidden"', 'id="error-view"')
        .replace('id="error-msg">', 'id="error-msg">Invalid post URL.'));
    return new Response(html, { status: 404, headers: ct() });
  }

  const post = await getPost(id);

  if (!post) {
    const html = shell("Not Found", "Post not found", "",
      notFoundInner().replace('id="error-view" class="hidden"', 'id="error-view"')
        .replace('id="error-msg">', 'id="error-msg">This post does not exist or has been deleted.'));
    return new Response(html, { status: 404, headers: ct() });
  }

  if (post.passwordHash) {
    const html = shell(
      post.title,
      `Password-protected post by ${post.authorName} on PasteMD`,
      'data-ssr-rendered="true" data-password-required="true"',
      passwordInner(post),
    );
    return new Response(html, { status: 200, headers: ct() });
  }

  // Public post: fire-and-forget view count (same as the API path)
  incrementPostViews(post.id).catch(() => {});

  const description = post.rawMd
    ? post.rawMd.replace(/[#*`>\-_[\]()]/g, "").trim().slice(0, 200)
    : `Shared on PasteMD by ${post.authorName}`;

  const html = shell(
    post.title,
    description,
    'data-ssr-rendered="true"',
    publicInner(post),
  );
  return new Response(html, { status: 200, headers: ct() });
}

function ct() {
  return { "Content-Type": "text/html; charset=utf-8" };
}

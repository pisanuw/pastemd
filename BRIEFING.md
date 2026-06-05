# PasteMD — Project Briefing

## Purpose

A Netlify-hosted app for sharing markdown documents. Users sign in (Google OAuth or magic link), write or upload markdown, and share a public URL. Admins can view and delete all posts.

## Stack

- **Hosting**: Netlify (static files + serverless Functions v2)
- **Storage**: Netlify Blobs (key-value; no SQL database)
- **Auth**: JWTs in HttpOnly cookies; Google OAuth + magic-link email via Resend
- **Email**: Resend (`RESEND_API_KEY`, `AUTH_FROM_EMAIL` env vars)
- **Markdown rendering**: `marked` + `sanitize-html` (server-side only)
- **Word conversion**: `mammoth` (server-side, .docx → markdown)
- **Admin access**: `pisan@uw.edu` and `yusuf.pisan@gmail.com` are hard-coded superadmins; `ADMIN_EMAILS` env var is additive

## Key Architectural Decisions

- Posts store both `rawMd` and `sanitizedHtml`. For docx-sourced posts rawMd may be the converted markdown.
- Password-protected posts store `passwordHash` + `passwordSalt` (scrypt). The hash is never exposed to clients; verification is via `POST /api/posts/:id/verify`. Password cannot be changed after creation.
- Admin emails receive plaintext password when a password-protected post is created.
- Preview (`POST /api/preview`) uses the identical server-side render pipeline — what authors see matches what is published.
- The Admin button in the dashboard is injected into the DOM dynamically and only for admin users; it does not exist in the static HTML.
- `/p/:id` is server-side rendered by `post-page.mjs` — full post HTML is in the DOM before JS runs, making content visible to AI agents, curl, and link previewers. `post.js` skips its fetch when `data-ssr-rendered` is set on the body.

## Non-Goals

- No post editing after publish.
- No rich-text / WYSIWYG editor (markdown only).
- No image hosting (embedded images from .docx are stripped).
- No per-post expiry or access-log features (view counts are aggregate only, no per-visitor detail).

## Project Structure

```
netlify/functions/
  post-page.mjs    — SSR handler for /p/:id (returns full HTML, OG tags)
  posts.mjs        — post CRUD (create, get, delete, verify password)
  auth.mjs         — Google OAuth + magic-link
  admin.mjs        — admin list/delete all posts
  preview.mjs      — server-side markdown preview (not saved)
  convert.mjs      — .docx → markdown conversion (not saved)
  lib/
    posts-store.mjs
    utils-core.mjs  — generateId, hashPassword, verifyPassword
    markdown.mjs    — renderMarkdown (marked + sanitize-html)
    email.mjs, jwt.mjs, db.mjs, env.mjs, http.mjs, log.mjs
static/
  dashboard.js, post.js, admin.js, index.js, style.css
test/               — node:test suite (57 tests)
```

## Environment Variables

| Var | Purpose |
|-----|---------|
| `JWT_SECRET` | JWT signing key |
| `APP_URL` | Base URL for email links |
| `RESEND_API_KEY` | Resend email API key |
| `AUTH_FROM_EMAIL` | Sender address |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth |
| `ADMIN_EMAILS` | Comma-separated admin addresses |
| `COOKIE_SECURE` | `auto` (default), `true`, or `false` |

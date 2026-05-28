# pastemd

A small "paste-and-share" service for Markdown documents. Users sign in (Google
or magic link), paste or upload Markdown (or a `.docx` file), and get a public
URL to share. Posts can optionally be password-protected.

Built as a static site plus Netlify Functions, with Netlify Blobs for storage.

## Features

- Sign in with Google OAuth or emailed magic link
- Paste Markdown, or upload `.md` / `.docx` (Word → Markdown conversion)
- Server-side Markdown rendering + HTML sanitization
- Optional password protection per post
- Dashboard to view/delete your posts
- Admin view (configured via `ADMIN_EMAILS`)
- Programmatic API access via Bearer token

## Tech stack

- Static HTML/CSS/JS frontend (no build step)
- Netlify Functions (`netlify/functions/*.mjs`, ES modules)
- Netlify Blobs for users, posts, sessions, login tokens
- JWT sessions in an HttpOnly cookie (`jsonwebtoken`)
- `marked` + `sanitize-html` for Markdown rendering
- `mammoth` for `.docx` → Markdown
- Resend for transactional email (magic links, admin notifications)

## Local development

```bash
npm install
npm run dev          # netlify dev on http://localhost:8888
npm test             # node --test
npm run lint
```

Required env vars (set in Netlify or a local `.env` consumed by `netlify dev`):

| Variable                | Purpose                                        |
| ----------------------- | ---------------------------------------------- |
| `JWT_SECRET`            | Signs all session and API tokens               |
| `GOOGLE_CLIENT_ID`      | Google OAuth client                            |
| `GOOGLE_CLIENT_SECRET`  | Google OAuth client                            |
| `RESEND_API_KEY`        | Email delivery (magic links, admin notifs)     |
| `AUTH_FROM_EMAIL`       | From-address for outbound email                |
| `ADMIN_EMAILS`          | Comma-separated admin email allowlist          |
| `APP_URL`               | Public base URL (optional; auto-detected)      |

## HTTP API

All endpoints are mounted under `/api/` via redirects in `netlify.toml`.

### Authentication

Two ways to authenticate:

1. **Cookie** — `token=<jwt>` HttpOnly cookie set by the OAuth/magic-link flow
   (used by the dashboard).
2. **Bearer token** — `Authorization: Bearer <jwt>` header (used by scripts).
   Generate one from the dashboard's "API access" card; it is valid for 365
   days and carries your identity.

Both auth methods grant the same permissions — anything you can do in the UI,
you can do via Bearer token.

### Endpoints

| Method | Path                             | Auth     | Description                                  |
| ------ | -------------------------------- | -------- | -------------------------------------------- |
| GET    | `/api/auth/me`                   | required | Return the current user                      |
| POST   | `/api/auth/api-token`            | cookie   | Issue a 365-day Bearer token for the caller  |
| POST   | `/api/auth/logout`               | none     | Clear the session cookie                     |
| GET    | `/api/auth/google/start`         | none     | Begin Google OAuth                           |
| POST   | `/api/auth/magic-link/request`   | none     | Email a one-time sign-in link                |
| GET    | `/api/posts`                     | required | List the caller's own posts                  |
| POST   | `/api/posts`                     | required | Create a new post                            |
| GET    | `/api/posts/:id`                 | none     | Fetch a post (returns metadata if pwd-gated) |
| POST   | `/api/posts/:id/verify`          | none     | Submit password for a protected post         |
| DELETE | `/api/posts/:id`                 | required | Delete a post (owner or admin)               |
| POST   | `/api/preview`                   | none     | Render Markdown to HTML for preview          |
| POST   | `/api/convert/docx`              | none     | Convert an uploaded `.docx` to Markdown      |

### Programmatic posting

After generating a Bearer token from the dashboard:

```bash
curl -X POST https://your-pastemd-host/api/posts \
  -H "Authorization: Bearer $PASTEMD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Release notes",
    "content": "# v1.2\n\n- Fixed X\n- Added Y",
    "password": "optional"
  }'
# → {"id":"abc123","url":"/p/abc123"}
```

The returned `url` is a path; prepend your host to share it
(`https://your-pastemd-host/p/abc123`).

Constraints (same as the web form):

- `title` required, max 200 chars
- `content` required, max 1 MB
- `password` optional; if set, viewers must enter it to read the post

Same endpoint also lists (`GET`) and deletes (`DELETE`) your posts.

## Project layout

```
index.html, post.html, dashboard.html, admin.html   — page shells
static/                                              — page scripts + CSS
netlify/functions/
  auth.mjs        — sign-in, sessions, API tokens
  posts.mjs       — post CRUD
  preview.mjs     — server-side Markdown render
  convert.mjs     — .docx → Markdown
  admin.mjs       — admin views
  lib/            — db, env, jwt, email, markdown, posts-store, http, log
test/             — node:test unit tests
```

## Storage layout (Netlify Blobs)

- `users` — keyed by email
- `posts` — keyed by post id; per-user index under `user_posts`
- `login_tokens` — magic link JTI records (single-use)

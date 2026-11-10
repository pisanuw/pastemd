# CHANGES

2026-04-30 [code] added optional post password: hashed with scrypt, stored in post blob, admins emailed plaintext on creation
2026-04-30 [code] GET /api/posts/:id returns passwordRequired:true (no content) when post has password set
2026-04-30 [code] added POST /api/posts/:id/verify endpoint for password-protected posts; password re-entered each visit
2026-04-30 [code] added inline password prompt to post.html/post.js; no page redirect on password challenge
2026-04-30 [code] added optional password field to dashboard new-post form; password cannot be changed after creation
2026-04-30 [code] added POST /api/preview endpoint: renders markdown server-side and returns full HTML page for author preview
2026-04-30 [code] added Preview in new tab button to dashboard; opens blank tab then writes server-rendered HTML into it
2026-04-30 [scope] preview uses same renderMarkdown pipeline as published posts, ensuring WYSIWYG fidelity
2026-05-02 [code] added POST /api/convert/docx endpoint using mammoth; converts .docx to markdown, strips images, extracts title from docx metadata or first heading
2026-05-02 [code] extended dashboard file upload to accept .docx; conversion result populates title and textarea for edit-then-publish flow
2026-05-02 [code] Admin button removed from static HTML; injected into DOM dynamically only for admin users
2026-06-05 [decision] hard-coded pisan@uw.edu and yusuf.pisan@gmail.com as permanent superadmins in env.mjs; ADMIN_EMAILS env var still additive
2026-06-05 [code] added post-views Blobs store; incremented fire-and-forget on public GET and successful password verify in posts.mjs
2026-06-05 [code] admin GET /api/admin/posts now batch-fetches view counts and merges as views field on each post
2026-06-05 [code] admin table shows Views column (right-aligned, tabular numerals) and lock badge on password-protected posts
2026-06-05 [decision] SSR for /p/:id: post-page.mjs function renders full HTML so non-JS clients (AI agents, curl) see content
2026-06-05 [code] added post-page.mjs; /p/* redirect changed from post.html to function; OG meta tags included
2026-06-05 [code] post.js skips initial fetch when body has data-ssr-rendered; password form listener uses optional chaining

2026-11-09 [decision] Google sign-in moves to the shared HintWise Supabase project (owner): Google sees only Supabase's callback, so new addresses need no Google Cloud change.
2026-11-09 [code] google/start redirects to Supabase /authorize with PKCE; new /api/auth/supabase/callback exchanges the code, accepts only a Google-verified email, signs in by email as before.
2026-11-09 [code] GOOGLE_AUTH_VIA=direct keeps the old Google client flow for rollback and local dev; netlify.toml sends paste-md.netlify.app to paste-md.hintwise.org.

2026-11-10 [code] Sign-in buttons follow Google's branding guidelines: Google's G (sha256-checked), light theme, 40px pill; magic-link button no longer more prominent.
2026-11-10 [code] Shared HintWise footer on every page (6 static pages and server-rendered posts): footerHtml('paste-md') from claude-built-apps scripts/site-footer.mjs, sha256-checked; owner's yes.

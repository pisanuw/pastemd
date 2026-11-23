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
2026-11-11 [code] Footer copy updated to the HintWise icon version (claude-built-apps 2e17481).
2026-11-11 [code] Footer was unstyled (left-aligned) on every page: the CSP style-src 'self' blocked its inline style. CSP now allows that one style by sha256 hash; test keeps them in step.
2026-11-11 [code] HintWise icon as favicon on every page (static and server-rendered); ships on the next deploy.
2026-11-17 [code] HintWise first-party analytics (owner: add, do not deploy; branch analytics): hw-events.js copied unchanged and sha256-checked, its tag in <head> of the 6 static pages as paste-md, every CSP connect-src allows https://auth.hintwise.org.
2026-11-17 [code] Dashboard events post_created {protected}, file_imported {kind}, preview_opened; never content, titles or ids.
2026-11-17 [decision] /p/:id pages carry no analytics tag for now: post ids (12 base64url chars) are masked as :id only about 4 in 10 times, so most paths would carry the id. Owner decides.
2026-11-17 [code] hw-events.js updated to the platform copy with data-mask (sha256 d2833162); every tag carries data-mask="/p/" and /p/:id pages now load it too, so a post's path is always sent as /p/:id, never the id.
2026-11-19 [code] Security updates in production dependencies (npm audit fix, lockfile only): @xmldom/xmldom 0.8.13 -> 0.8.15 under mammoth; sanitize-html 2.17.5 -> 2.18.2 with postcss 8.5.33, nanoid 3.3.20, source-map-js 1.2.3, htmlparser2 12; prod audit 4 high + 1 moderate -> 0.
2026-11-19 [code] Correction to the line above (never merged): only the four high-advisory packages update: @xmldom/xmldom 0.8.15 under mammoth, postcss 8.5.33, nanoid 3.3.20, source-map-js 1.2.3.
2026-11-19 [decision] sanitize-html stays 2.17.5 (2.18 needs Node 20.19+ or 22.12+ for functions); 1 moderate advisory open until the runtime moves. Malformed .docx XML (end tag + junk) now gets 422.
2026-11-23 [code] Branch analytics brought up to date with main as analytics-on-main (owner: "Merge all the apps"); merging deploys it; origin https://paste-md.hintwise.org already registered (shared/0016).

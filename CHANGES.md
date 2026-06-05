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

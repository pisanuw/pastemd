/**
 * lib/markdown.mjs — Markdown → sanitized HTML conversion
 *
 * Uses marked for MD parsing and sanitize-html for XSS sanitization.
 * Inline styles are stripped; external images are allowed.
 */
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

const SANITIZE_OPTIONS = {
  allowedTags: [
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "br", "hr",
    "ul", "ol", "li",
    "blockquote", "pre", "code",
    "strong", "em", "del", "s",
    "a", "img",
    "table", "thead", "tbody", "tr", "th", "td",
    "details", "summary",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title"],
    code: ["class"],
    th: ["align"],
    td: ["align"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: {
    img: ["http", "https", "data"],
  },
  // Force all links to open in a new tab safely
  transformTags: {
    a: (_tag, attribs) => ({
      tagName: "a",
      attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer" },
    }),
  },
};

/**
 * Convert markdown string to sanitized HTML.
 */
export function renderMarkdown(md) {
  const raw = marked.parse(md, { gfm: true, breaks: false });
  return sanitizeHtml(raw, SANITIZE_OPTIONS);
}

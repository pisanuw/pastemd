/**
 * convert.mjs — Convert uploaded .docx to markdown (auth required, not saved)
 *
 *   POST /api/convert/docx — multipart upload of a .docx file
 *     Returns { markdown, title, imagesStripped }
 */
export const config = { path: "/api/convert/docx" };
import mammoth from "mammoth";
import { getUserFromRequest, errorResponse, log } from "./utils.mjs";

const FN = "convert";
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Try to extract the document title from docProps/core.xml inside the .docx ZIP.
 * The entry is often stored uncompressed, so a regex scan on the raw bytes works
 * for most documents. Falls back to "" if not found.
 */
function extractTitleFromBuffer(buffer) {
  // docProps/core.xml typically contains: <dc:title>My Title</dc:title>
  const raw = buffer.toString("latin1");
  const match = raw.match(/<dc:title[^>]*>([^<]{1,300})<\/dc:title>/);
  return match ? match[1].trim() : "";
}

/**
 * Pull the first top-level heading out of a markdown string and return it as
 * the title. Also strips that heading line from the content so it is not
 * duplicated in the textarea.
 * Returns { title, markdown }.
 */
function extractTitleFromMarkdown(md) {
  const lines = md.split("\n");
  const idx = lines.findIndex((l) => l.trim() !== "");
  if (idx >= 0 && /^#{1,2}\s/.test(lines[idx])) {
    const title = lines[idx].replace(/^#{1,2}\s+/, "").trim();
    lines.splice(idx, 1);
    return { title, markdown: lines.join("\n").trimStart() };
  }
  return { title: "", markdown: md };
}

export default async function handler(req) {
  if (req.method !== "POST") return errorResponse(405, "Method not allowed");

  const user = getUserFromRequest(req);
  if (!user) return errorResponse(401, "Unauthorized");

  let formData;
  try {
    formData = await req.formData();
  } catch {
    return errorResponse(400, "Expected multipart/form-data");
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return errorResponse(400, "No file provided");
  }

  const arrayBuffer = await file.arrayBuffer();
  if (arrayBuffer.byteLength === 0) return errorResponse(400, "File is empty");
  if (arrayBuffer.byteLength > MAX_FILE_BYTES) {
    return errorResponse(400, "File too large (max 10 MB)");
  }

  const buffer = Buffer.from(arrayBuffer);

  let result;
  try {
    result = await mammoth.convertToMarkdown({ buffer });
  } catch (err) {
    log("error", FN, "mammoth conversion failed", { error: err.message });
    return errorResponse(422, "Could not read the Word document. Please check the file is a valid .docx.");
  }

  const imagesStripped = result.messages.some(
    (m) => m.type === "warning" && /image/i.test(m.message)
  );

  // Title: docx metadata → first heading → empty (caller uses filename)
  let title = extractTitleFromBuffer(buffer);
  let markdown = result.value;

  if (!title) {
    const extracted = extractTitleFromMarkdown(markdown);
    title = extracted.title;
    markdown = extracted.markdown;
  }

  log("info", FN, "docx converted", { email: user.email, imagesStripped });

  return new Response(JSON.stringify({ markdown, title, imagesStripped }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

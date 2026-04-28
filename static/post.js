/* post.js — public post view (no auth required) */

function formatDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function showError(msg) {
  document.getElementById("loading").classList.add("hidden");
  document.getElementById("error-msg").textContent = msg;
  document.getElementById("error-view").classList.remove("hidden");
}

// Extract post ID from path: /p/<id>
const pathParts = location.pathname.split("/").filter(Boolean);
const postId = pathParts[pathParts.length - 1];

if (!postId || pathParts[0] !== "p") {
  showError("Invalid post URL.");
} else {
  fetch(`/api/posts/${postId}`)
    .then(async (res) => {
      if (res.status === 404) { showError("This post does not exist or has been deleted."); return; }
      if (!res.ok) { showError("Failed to load post."); return; }

      const post = await res.json();

      document.title = `${post.title} — PasteMD`;
      document.getElementById("post-title").textContent = post.title;
      document.getElementById("post-author").textContent = post.authorName;
      document.getElementById("post-date").textContent = formatDate(post.createdAt);

      // sanitizedHtml is already sanitized server-side
      document.getElementById("post-body").innerHTML = post.sanitizedHtml;

      document.getElementById("loading").classList.add("hidden");
      document.getElementById("post-view").classList.remove("hidden");
    })
    .catch(() => showError("Network error. Please try again."));
}

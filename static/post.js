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

function renderPost(post) {
  document.title = `${post.title} — PasteMD`;
  document.getElementById("post-title").textContent = post.title;
  document.getElementById("post-author").textContent = post.authorName;
  document.getElementById("post-date").textContent = formatDate(post.createdAt);

  // sanitizedHtml is already sanitized server-side
  document.getElementById("post-body").innerHTML = post.sanitizedHtml;

  document.getElementById("loading").classList.add("hidden");
  document.getElementById("password-view").classList.add("hidden");
  document.getElementById("post-view").classList.remove("hidden");
}

function showPasswordPrompt(post) {
  document.title = `${post.title} — PasteMD`;
  document.getElementById("pw-post-title").textContent = post.title;
  document.getElementById("pw-post-author").textContent = post.authorName;
  document.getElementById("pw-post-date").textContent = formatDate(post.createdAt);

  document.getElementById("loading").classList.add("hidden");
  document.getElementById("password-view").classList.remove("hidden");
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

      if (post.passwordRequired) {
        showPasswordPrompt(post);
      } else {
        renderPost(post);
      }
    })
    .catch(() => showError("Network error. Please try again."));
}

// Password form submission
document.getElementById("password-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("pw-btn");
  const pwError = document.getElementById("pw-error");
  const password = document.getElementById("pw-input").value;

  pwError.classList.add("hidden");
  btn.disabled = true;
  btn.textContent = "Checking…";

  try {
    const res = await fetch(`/api/posts/${postId}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      const post = await res.json();
      renderPost(post);
    } else {
      const data = await res.json().catch(() => ({}));
      pwError.textContent = data.error || "Incorrect password.";
      pwError.classList.remove("hidden");
      document.getElementById("pw-input").value = "";
      document.getElementById("pw-input").focus();
    }
  } catch {
    pwError.textContent = "Network error. Please try again.";
    pwError.classList.remove("hidden");
  } finally {
    btn.disabled = false;
    btn.textContent = "Unlock";
  }
});

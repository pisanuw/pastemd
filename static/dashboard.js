/* dashboard.js — authenticated user dashboard */

let currentUser = null;

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function showPostAlert(msg, isError = true) {
  const el = document.getElementById("post-alert");
  el.textContent = msg;
  el.className = `alert ${isError ? "alert-error" : "alert-success"}`;
  el.classList.remove("hidden");
}

function renderPostList(posts) {
  const list = document.getElementById("post-list");
  const empty = document.getElementById("posts-empty");
  document.getElementById("posts-loading").classList.add("hidden");

  if (!posts.length) {
    empty.classList.remove("hidden");
    return;
  }

  list.innerHTML = posts.map((p) => `
    <li class="post-item" data-id="${p.id}">
      <span class="post-item-title">
        <a href="/p/${p.id}" target="_blank" rel="noopener noreferrer">${escHtml(p.title)}</a>
      </span>
      <span class="post-item-meta">${formatDate(p.createdAt)}</span>
      <span class="post-item-actions">
        <button class="btn btn-danger delete-btn" data-id="${p.id}" data-title="${escHtml(p.title)}">Delete</button>
      </span>
    </li>
  `).join("");

  list.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => deletePost(btn.dataset.id, btn.dataset.title));
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function loadPosts() {
  try {
    const res = await fetch("/api/posts");
    if (res.status === 401) { location.replace("/"); return; }
    const { posts } = await res.json();
    renderPostList(posts);
  } catch {
    document.getElementById("posts-loading").innerHTML =
      '<p style="color:var(--danger)">Failed to load posts.</p>';
  }
}

async function deletePost(id, title) {
  if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
  try {
    const res = await fetch(`/api/posts/${id}`, { method: "DELETE" });
    if (res.ok) {
      document.querySelector(`.post-item[data-id="${id}"]`)?.remove();
      const list = document.getElementById("post-list");
      if (!list.children.length) {
        document.getElementById("posts-empty").classList.remove("hidden");
      }
    } else {
      const d = await res.json();
      alert(d.error || "Failed to delete post.");
    }
  } catch {
    alert("Network error. Please try again.");
  }
}

// Init: check auth
fetch("/api/auth/me")
  .then(async (res) => {
    if (!res.ok) { location.replace("/"); return; }
    currentUser = await res.json();
    document.getElementById("user-email").textContent = currentUser.email;
    if (currentUser.is_admin) {
      document.getElementById("admin-link").style.display = "";
    }
    loadPosts();
  })
  .catch(() => location.replace("/"));

// Logout
document.getElementById("logout-btn").addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  location.replace("/");
});

// File upload → populate textarea
const fileInput = document.getElementById("post-file");
document.querySelector('label[for="post-file"]').addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;
  document.getElementById("file-name").textContent = file.name;
  const reader = new FileReader();
  reader.onload = (e) => { document.getElementById("post-content").value = e.target.result; };
  reader.readAsText(file);
  // Pre-fill title from filename (strip extension)
  const titleEl = document.getElementById("post-title");
  if (!titleEl.value) {
    titleEl.value = file.name.replace(/\.(md|markdown)$/i, "").replace(/[-_]/g, " ");
  }
});

// Post form submission
document.getElementById("post-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("post-btn");
  const title = document.getElementById("post-title").value.trim();
  const content = document.getElementById("post-content").value;

  document.getElementById("post-alert").classList.add("hidden");
  document.getElementById("success-box").classList.add("hidden");

  btn.disabled = true;
  btn.textContent = "Publishing…";

  try {
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content }),
    });
    const data = await res.json();
    if (res.ok) {
      const url = `${location.origin}${data.url}`;
      const box = document.getElementById("success-box");
      const link = document.getElementById("post-url-link");
      link.href = url;
      link.textContent = url;
      box.classList.remove("hidden");

      // Reset form
      document.getElementById("post-form").reset();
      document.getElementById("file-name").textContent = "";

      // Reload post list
      document.getElementById("posts-loading").classList.remove("hidden");
      document.getElementById("post-list").innerHTML = "";
      document.getElementById("posts-empty").classList.add("hidden");
      loadPosts();
    } else {
      showPostAlert(data.error || "Failed to publish.");
    }
  } catch {
    showPostAlert("Network error. Please try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Publish";
  }
});

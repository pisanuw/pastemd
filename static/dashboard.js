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
      const adminLink = document.createElement("a");
      adminLink.href = "/admin.html";
      adminLink.className = "btn btn-secondary";
      adminLink.style.cssText = "font-size:.85rem; padding:.35rem .8rem;";
      adminLink.textContent = "Admin";
      document.getElementById("logout-btn").insertAdjacentElement("beforebegin", adminLink);
    }
    loadPosts();
  })
  .catch(() => location.replace("/"));

// Logout
document.getElementById("logout-btn").addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  location.replace("/");
});

// Generate API token
document.getElementById("api-token-btn").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    const res = await fetch("/api/auth/api-token", { method: "POST" });
    if (!res.ok) {
      alert("Failed to generate API token.");
      return;
    }
    const { token } = await res.json();
    const box = document.getElementById("api-token-box");
    const ta = document.getElementById("api-token-value");
    ta.value = token;
    box.classList.remove("hidden");
    ta.focus();
    ta.select();
  } catch {
    alert("Network error. Please try again.");
  } finally {
    btn.disabled = false;
  }
});

// File upload → populate textarea (.md and .docx supported)
const fileInput = document.getElementById("post-file");
document.querySelector('label[for="post-file"]').addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;

  document.getElementById("file-name").textContent = file.name;
  document.getElementById("images-stripped-notice").classList.add("hidden");

  if (/\.docx$/i.test(file.name)) {
    // Word document: send to server for conversion
    document.getElementById("file-converting").classList.remove("hidden");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/convert/docx", { method: "POST", body: formData });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        showPostAlert(d.error || "Failed to convert Word document.");
        document.getElementById("file-name").textContent = "";
        return;
      }
      const { markdown, title, imagesStripped } = await res.json();
      document.getElementById("post-content").value = markdown;
      const titleEl = document.getElementById("post-title");
      if (!titleEl.value) {
        titleEl.value = title || file.name.replace(/\.docx$/i, "").replace(/[-_]/g, " ");
      }
      if (imagesStripped) {
        document.getElementById("images-stripped-notice").classList.remove("hidden");
      }
    } catch {
      showPostAlert("Network error converting Word document. Please try again.");
      document.getElementById("file-name").textContent = "";
    } finally {
      document.getElementById("file-converting").classList.add("hidden");
    }
  } else {
    // Markdown file: read directly
    const reader = new FileReader();
    reader.onload = (e) => { document.getElementById("post-content").value = e.target.result; };
    reader.readAsText(file);
    const titleEl = document.getElementById("post-title");
    if (!titleEl.value) {
      titleEl.value = file.name.replace(/\.(md|markdown)$/i, "").replace(/[-_]/g, " ");
    }
  }
});

// Preview button — renders markdown server-side and opens result in a new tab
document.getElementById("preview-btn").addEventListener("click", async () => {
  const title = document.getElementById("post-title").value.trim();
  const content = document.getElementById("post-content").value;

  if (!content.trim()) {
    showPostAlert("Add some content before previewing.");
    return;
  }

  // Open tab immediately (user gesture) to avoid popup blockers, then write content
  const win = window.open("", "_blank");
  if (!win) {
    showPostAlert("Please allow pop-ups for this site to use preview.");
    return;
  }

  try {
    const res = await fetch("/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content }),
    });
    if (res.ok) {
      const html = await res.text();
      win.document.write(html);
      win.document.close();
    } else {
      win.close();
      showPostAlert("Preview failed. Please try again.");
    }
  } catch {
    win.close();
    showPostAlert("Network error. Please try again.");
  }
});

// Post form submission
document.getElementById("post-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("post-btn");
  const title = document.getElementById("post-title").value.trim();
  const content = document.getElementById("post-content").value;
  const password = document.getElementById("post-password").value;

  document.getElementById("post-alert").classList.add("hidden");
  document.getElementById("success-box").classList.add("hidden");

  btn.disabled = true;
  btn.textContent = "Publishing…";

  try {
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content, ...(password ? { password } : {}) }),
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

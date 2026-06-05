/* admin.js — admin panel */

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderTable(posts) {
  const tbody = document.getElementById("posts-tbody");
  document.getElementById("posts-loading").classList.add("hidden");
  document.getElementById("post-count").textContent = `${posts.length} post${posts.length !== 1 ? "s" : ""}`;

  if (!posts.length) {
    document.getElementById("posts-empty").classList.remove("hidden");
    return;
  }

  tbody.innerHTML = posts.map((p) => `
    <tr data-id="${p.id}">
      <td><a href="/p/${p.id}" target="_blank" rel="noopener noreferrer">${escHtml(p.title)}</a>${p.passwordHash ? ' <span style="font-size:.75rem;color:var(--muted);">🔒</span>' : ""}</td>
      <td style="white-space:nowrap;">${escHtml(p.authorName)}<br><span style="font-size:.8rem;color:var(--muted)">${escHtml(p.authorEmail)}</span></td>
      <td style="white-space:nowrap;">${formatDate(p.createdAt)}</td>
      <td style="text-align:right; font-variant-numeric:tabular-nums;">${p.views ?? 0}</td>
      <td>
        <button class="btn btn-danger delete-btn" data-id="${p.id}" data-title="${escHtml(p.title)}">Delete</button>
      </td>
    </tr>
  `).join("");

  document.getElementById("posts-table").style.display = "";

  tbody.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => adminDelete(btn.dataset.id, btn.dataset.title));
  });
}

async function adminDelete(id, title) {
  if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
  try {
    const res = await fetch(`/api/admin/posts/${id}`, { method: "DELETE" });
    if (res.ok) {
      document.querySelector(`tr[data-id="${id}"]`)?.remove();
      const tbody = document.getElementById("posts-tbody");
      if (!tbody.children.length) {
        document.getElementById("posts-table").style.display = "none";
        document.getElementById("posts-empty").classList.remove("hidden");
      }
    } else {
      const d = await res.json();
      alert(d.error || "Failed to delete.");
    }
  } catch {
    alert("Network error.");
  }
}

// Init: check auth + admin
fetch("/api/auth/me")
  .then(async (res) => {
    if (!res.ok) { location.replace("/"); return; }
    const user = await res.json();
    if (!user.is_admin) {
      document.getElementById("auth-error").classList.remove("hidden");
      return;
    }
    document.getElementById("user-email").textContent = user.email;
    document.getElementById("admin-panel").classList.remove("hidden");

    const postsRes = await fetch("/api/admin/posts");
    if (!postsRes.ok) { alert("Failed to load posts."); return; }
    const { posts } = await postsRes.json();
    renderTable(posts);
  })
  .catch(() => location.replace("/"));

document.getElementById("logout-btn").addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  location.replace("/");
});

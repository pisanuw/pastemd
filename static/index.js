/* index.js — login page */

const ERROR_MESSAGES = {
  "google-auth-failed": "Google sign-in failed. Please try again.",
  "google-auth-cancelled": "Google sign-in was cancelled.",
  "google-state-missing": "Sign-in session expired. Please try again.",
  "invalid-link": "This sign-in link is invalid. Please request a new one.",
  "link-expired": "This sign-in link has expired. Please request a new one.",
  "link-already-used": "This sign-in link has already been used. Please request a new one.",
};

function showAlert(msg) {
  const el = document.getElementById("alert");
  el.textContent = msg;
  el.classList.remove("hidden");
}

// Show error from URL param
const params = new URLSearchParams(location.search);
const errorKey = params.get("error");
if (errorKey) showAlert(ERROR_MESSAGES[errorKey] || "An error occurred. Please try again.");

// If already signed in, redirect to dashboard
fetch("/api/auth/me")
  .then((r) => { if (r.ok) location.replace("/dashboard.html"); })
  .catch(() => {});

// Magic link form
document.getElementById("magic-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("magic-btn");
  const email = document.getElementById("email").value.trim();

  btn.disabled = true;
  btn.textContent = "Sending…";

  try {
    const res = await fetch("/api/auth/magic-link/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (res.ok) {
      location.href = `/email-sent.html?email=${encodeURIComponent(email)}`;
    } else {
      showAlert(data.error || "Failed to send sign-in email.");
      btn.disabled = false;
      btn.textContent = "Send magic link";
    }
  } catch {
    showAlert("Network error. Please try again.");
    btn.disabled = false;
    btn.textContent = "Send magic link";
  }
});

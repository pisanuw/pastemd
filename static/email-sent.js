/* email-sent.js — "Check your email" page: show the address the link went to.
   A same-origin file, since the CSP (script-src 'self') blocks inline scripts. */

const params = new URLSearchParams(location.search);
const emailDisplay = document.getElementById("email-display");
const sentTo = params.get("email");
if (emailDisplay && sentTo) emailDisplay.textContent = sentTo;

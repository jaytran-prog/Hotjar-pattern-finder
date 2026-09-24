// Paste into javascript_tool on a Hotjar recording player page.
// Returns only the aggregate counts from the Info tab (~100 chars), and never
// the "Session info" block below them, which holds the visitor's name/ID (PII).
// Replaces get_page_text on the Info tab (~1.5k tokens, includes the whole
// recordings list and the PII).
[...document.querySelectorAll("button")]
  .find((b) => (b.getAttribute("aria-label") || "").startsWith("Open info panel"))?.click();
[...document.querySelectorAll("[role=tab],button")].find((b) => b.textContent.trim() === "Info")?.click();
await new Promise((r) => setTimeout(r, 1500));
const s = (document.querySelector(".side-panel")?.innerText || "").split("Session info")[0];
const n = {};
for (const k of ["Clicks", "Text input", "Rage clicks", "U-turns", "Surveys", "Feedback", "Errors", "Events"]) {
  const m = s.match(new RegExp("\\n" + k + "\\s*\\n\\s*(\\d+)"));
  n[k] = m ? +m[1] : 0;
}
JSON.stringify(n);

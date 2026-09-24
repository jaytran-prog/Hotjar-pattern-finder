// Paste into javascript_tool on a Hotjar recording player page. Works for any
// recorded site. It reads Hotjar's own Actions list, not the site's DOM.
// Runs in two phases, because the tab is usually hidden (timers throttled) and
// a single long call hits the 45 s CDP timeout.
//
// PHASE 1 — start (returns immediately):
//   Optionally set FOCUS to a regex for the pages that matter to the question
//   (matched against the tidied path, e.g. /checkout|\/signup/). Leave it null
//   to put every page change in the timeline. Then run this whole file. It
//   pauses playback, opens the Actions panel and scrolls the virtualized list
//   in the background.
// PHASE 2 — poll (after ~10 s): run `window.__hj.report()`; repeat until it no
//   longer starts with "running".
//
// Output is deliberately tiny (~300–800 chars): counts per page plus a
// timeline of FOCUS pages and behaviours (rage click, U-turn, refresh…).
// Paths are tidied: host removed, numeric IDs / UUIDs -> "#", and query strings
// reduced to their parameter NAMES only, e.g. "/search (?q,page)". Values are
// never output, because they can hold personal data, and raw query strings are
// blocked by the tool's output filter anyway.

var FOCUS = null; // e.g. /checkout|\/cart/  — null = every page change

(() => {
  const B = (l) => [...document.querySelectorAll("button")]
    .find((b) => (b.getAttribute("aria-label") || "").startsWith(l));
  B("Pause")?.click();
  B("Open actions panel")?.click();

  const S = (window.__hj = { done: false, rows: new Map() });
  const secs = (t) => t.split(":").reduce((a, n) => a * 60 + +n, 0);
  const tidy = (url) => {
    let [path, query = ""] = url.replace(/^https?:\/\/[^/]+/, "").split("#")[0].split("?");
    path = path
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/#")
      .replace(/\/\d{3,}(?=\/|$)/g, "/#")
      .replace(/\/$/, "") || "/";
    const keys = [...new Set(query.split("&").map((p) => p.split("=")[0]).filter(Boolean))];
    return keys.length ? `${path} (?${keys.slice(0, 3).join(",")})` : path;
  };

  const grab = (box) => {
    for (const b of box.querySelectorAll("button")) {
      const t = b.innerText.replace(/\s+/g, " ").trim();
      const m = t.match(/^(Viewed|New tab \(\d+\/\d+\)|Behavior):\s*(.*?)\s+(\d+:\d{2}(?::\d{2})?)$/);
      if (!m) continue;
      const [, kind, what, time] = m;
      const v = kind === "Behavior" ? "!" + what.trim() : tidy(what);
      S.rows.set(time + v, { s: secs(time), time, v });
    }
  };

  S.report = () => {
    if (!S.done) return `running, ${S.rows.size} entries so far`;
    const rows = [...S.rows.values()].sort((a, b) => a.s - b.s)
      .filter((r, i, a) => i === 0 || r.v !== a[i - 1].v);
    const base = (v) => v.replace(/ \(\?.*\)$/, "");
    const counts = {};
    for (const r of rows) counts[base(r.v)] = (counts[base(r.v)] || 0) + 1;
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([k, n]) => `${n}× ${k}`).join(" | ");
    // Timeline: behaviours + FOCUS pages, with consecutive visits to the same
    // page (ignoring query params) collapsed into one entry.
    let last = null;
    const items = [];
    for (const r of rows) {
      if (r.v.startsWith("!")) { items.push(`${r.time} ${r.v}`); continue; }
      if (FOCUS && !FOCUS.test(r.v)) { last = null; continue; }
      if (base(r.v) === last) continue;
      last = base(r.v);
      items.push(`${r.time} ${r.v}`);
    }
    // The tool truncates output at ~1000 chars, so cap it ourselves and say so.
    const head = `${rows.length} page/behaviour events\nCOUNTS: ${top}\nTIMELINE: `;
    let tl = "";
    let shown = 0;
    for (const it of items) {
      if (head.length + tl.length + it.length + 60 > 950) break;
      tl += (shown++ ? " · " : "") + it;
    }
    const more = items.length - shown;
    return head + (tl || "(nothing matches FOCUS)") +
      (more ? ` … +${more} more (set FOCUS to narrow)` : "");
  };

  setTimeout(async () => {
    // If the side panel was already open on the Info tab, "Open actions panel"
    // does nothing — switch to the Actions tab explicitly, then wait for it.
    [...document.querySelectorAll(".side-panel button, [role=tab]")]
      .find((b) => b.textContent.trim() === "Actions")?.click();
    let box = null;
    for (let i = 0; i < 20 && !box; i++) {
      box = document.querySelector(".side-panel .events > div");
      if (!box) await new Promise((r) => setTimeout(r, 300));
    }
    if (!box) { S.done = true; S.report = () => "ERROR: actions list not found (panel closed or Hotjar UI changed; see SKILL.md Step 4 fallback)"; return; }
    // A minimised/tiny Chrome window gives the list 0 height, so the scroll
    // step would be 0 and the loop would never advance. Force a real height.
    if (box.clientHeight < 200) box.style.height = "600px";
    const step = () => Math.max(box.clientHeight, 300);
    box.scrollTop = 0;
    await new Promise((r) => setTimeout(r, 400)); // let the top re-render first
    for (let i = 0; i < 400; i++) {
      grab(box);
      const before = box.scrollTop;
      box.scrollTop += step();
      await new Promise((r) => setTimeout(r, 60));
      if (box.scrollTop === before) break; // reached the bottom
    }
    grab(box);
    S.done = true;
  }, 1500); // wait for the panel to mount
  return "started";
})();

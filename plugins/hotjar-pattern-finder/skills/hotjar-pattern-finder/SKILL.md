---
name: hotjar-pattern-finder
description: Answers a UX research question by sampling multiple Hotjar session recordings via browser automation, jumping to rage-click/error/u-turn moments, and synthesizing a pattern-vs-anecdote Word (.docx) report with cropped screenshots, plus (with approval) Hotjar highlight clips with insight comments filed in the matching collection. Use when someone wants to know "do users actually do X" or "why are users dropping at Y" and the evidence lives in Hotjar recordings, not an API. Triggers on "check Hotjar for...", "analyze these recordings", "is this a pattern in Hotjar", "watch sessions and tell me if...".
---

# Hotjar Pattern Finder

Turns a plain-language research question into an evidence-backed answer drawn from several real Hotjar recordings, instead of one person manually scrubbing through sessions one at a time.

## Origin

Design rationale and rejected alternatives live in [docs/design.md](docs/design.md). Read it if you need the "why," especially the Key Assumptions and Not Doing sections before changing scope.

## How It Works

1. **Collect inputs** — goal, question, a Hotjar filter/segment to sample from, sample size.
2. **Verify access** — confirm the user's real Chrome is already logged into Hotjar. Never enter Hotjar credentials.
3. **Sample recordings** — open the filtered list, take the first N sessions.
4. **Per-recording pass** — jump to marker moments (rage click / error / u-turn), note entry paths from page views.
5. **Capture screenshots** — save the key moments to disk via the localhost shot receiver, crop them.
6. **Synthesize** — count how many sessions show the behavior in question, state confidence explicitly, write next steps.
7. **Create Hotjar highlights** — after approval, save each key moment as a highlight clip with an insight comment, in the collection that matches the segment.
8. **Report** — build a Word (.docx) report whose Key Finding leads with a screenshot and links to the highlights; ask before sharing it anywhere.

## Hard Constraints

- **Never enter Hotjar credentials.** This skill only works by riding a browser session the user already authenticated. If Hotjar shows a login page, stop and tell the user to log in themselves, then retry.
- **Recordings contain real user PII.** Never post the report, screenshots, or recording links to Slack, a ticket, or any shared destination without the user's explicit go-ahead in that specific run — saving the file locally is fine, distributing it is not.
- **Never claim a "pattern" from fewer than 3 sampled recordings.** If the filter returns 1–2 sessions, report the observation as anecdotal and say so plainly instead of framing it as a trend.
- **Highlights are writes to the team's shared Hotjar workspace.** Create them only after the user approves the proposed list in that run (Step 7). Never use @mentions, never create a new collection unless the user asks, and never edit or delete highlights you didn't create in this run.
- **Use the user's real Chrome, not an isolated browser pane.** The built-in browser pane (`mcp__Claude_Browser__*`) is a separate, unauthenticated context — it will not have the Hotjar login. Use `mcp__claude-in-chrome__*` tools instead, since those drive the user's actual Chrome with existing sessions.

## Token Budget

One question costs **~150–200k tokens of context** when these rules are followed (vs ~300–350k before them, measured 2026-09-25). The biggest waste is reading whole pages to get a few lines.

- **Never `get_page_text` on a player or Highlights page.** Every call re-sends the whole recordings list (and the Info tab's PII). Use the two scripts instead:
  - `scripts/hotjar_info.js` → Info counts only (~100 chars).
  - `scripts/hotjar_actions.js` → the full page journey + behaviours for the whole recording in one pass (~300–600 chars, even for a 99-min, 55-page session). No filter-dropdown clicks, no scroll-and-read loops.
  Read each script **once** per run, then paste its text into `javascript_tool`.
- **Screenshots:** use `scale: 0.4` for "did the seek land?" checks, and full size only for the one shot you save. Stop after 2 failed seek retries; take the nearest usable frame.
- **Batch** navigate → wait → script → wait → poll in one `browser_batch`. (`computer` wait is capped at 10 s per action.)
- **Default sample is 5.** Go to 10 only if the first 5 are mixed (neither ≥4/5 nor ≤1/5 showing the behaviour).
- **Highlights:** verify with a targeted `javascript_tool` check (`document.body.innerText.includes('<headline>')`), not by reading the whole collection page (~8k tokens).
- Don't re-read files you just wrote; don't render the .docx more than once unless the layout check fails.

## Setup (first run on a machine)

`<skill-dir>` below means this skill's base directory (shown as "Base directory for this skill" when it loads). It differs per install (plugin cache, `~/.claude/skills/`, or a project's `.claude/skills/`), so never hard-code a path.

Before Step 2 on a new machine, run `bash <skill-dir>/scripts/check_setup.sh`. It checks Python 3 + Pillow and Node, and installs the `docx` npm package into `<skill-dir>/scripts/node_modules` if it's missing. If it reports a missing prerequisite, tell the user exactly what to install and stop. Don't install system packages yourself.

Also required, but not checkable from the shell: the **Claude in Chrome** extension connected to this session, and the user already logged into Hotjar in that Chrome.

## Detailed Instructions

### Step 1 — Collect inputs

If the user's invocation doesn't already include these, ask (one `AskUserQuestion` call, not a back-and-forth):
- **Goal** — why this matters right now (one sentence).
- **Question** — the specific thing to answer (e.g., "do users hesitate before submitting payment?").
- **Hotjar filter/segment** — a saved filter name, or the URL of an already-filtered recordings list in Hotjar. This skill does not build filters from scratch in v1 — ask the user to apply the filter in Hotjar themselves and hand over the resulting list URL if they don't have one saved.
- **Sample size** — default 5, hard cap 10. Confirm the default rather than asking if the user doesn't care. If the user asks for 10, still do 5 first and report whether the next 5 change the picture (see Token Budget).

### Step 2 — Verify Hotjar access

Load the Chrome tool set first:

```
ToolSearch: select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__tabs_close_mcp,mcp__claude-in-chrome__get_page_text,mcp__claude-in-chrome__find,mcp__claude-in-chrome__browser_batch,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__upload_image
```

Navigate to the given filter/segment URL (or `hotjar.com` if only a filter name was given, then navigate to Recordings). Read the page. If it redirects to a Hotjar/SSO login screen:
- Stop. Tell the user: "You're not logged into Hotjar in Chrome — please log in there, then tell me to continue." Do not proceed, do not attempt to fill in any credentials field.

### Step 3 — Sample recordings

From the filtered recordings list, collect the first **N** recording entries (N = sample size), where N is capped by however many the filter actually returns. If the filter returns fewer than 3, warn the user before proceeding that any finding will be anecdotal, not a pattern (per Hard Constraints).

Record for each: recording ID/URL, session timestamp, any summary metadata Hotjar already shows in the list (duration, device, rage-click count badge, etc.) — this list-level metadata is often enough to prioritize which recordings to open first.

### Step 4 — Per-recording pass

Validated live against a real Hotjar account (2026-09-24) — this is the confirmed mechanism, not a guess:

1. Open the recording player (`https://insights.hotjar.com/r?site=<site>&recording=<id>`, wait ~10 s; the player mounts late). Run `scripts/hotjar_info.js` via `javascript_tool` — it gives exact aggregate counts (Clicks, Text input, Rage clicks, U-turns, Surveys, Feedback, Errors, Events) before you open a single marker. If the counts relevant to the question are all zero, skip this recording — note it as a non-match and move on.
2. **For the journey, run `scripts/hotjar_actions.js`** (optionally set its `FOCUS` regex to the pages that matter for the question, e.g. `/checkout|\/cart/`; leave it `null` to see every page change). It starts a background scroll and returns immediately; wait ~10 s and call `window.__hj.report()` until it isn't "running". You get counts per page type and a timeline of FOCUS pages + rage clicks / U-turns / refreshes with timestamps — usually all you need to classify the recording. Output is capped at ~950 chars; if it ends with "+N more", set `FOCUS` to the pages the question is about and run it again. Validated: its rage-click/U-turn counts match the Info tab exactly.
   Only if you need a specific moment's visual context, switch to the **Actions** tab. The bottom scrubber renders marker icons as canvas (not in the accessibility tree — `find`/`read_page` won't see them directly), but they're visually distinct and consistent: an angry-face icon = rage click, a circular-arrow icon = u-turn, a plain circle = page-view/click marker. Locate them with a screenshot/zoom of the scrubber strip, not a linear watch-through.
3. **Click the marker icon directly** (don't just scrub near it). Clicking jumps playback to that exact moment, scrolls the Actions list to match, and pops a labeled card in the DOM — e.g. a card titled "Rage click" with the page URL where it happened. Read that card with `get_page_text`/`read_page` immediately after the click; it's a more reliable caption source than describing the screenshot yourself.
4. Note the moment (recording ID + player time) you'll want as a screenshot. Capture them all together in Step 5; don't try to save images mid-pass.
5. Write the caption from the labeled card's text (item 3 above), not from visual guessing — this caption is the "highlight," since Hotjar's own recording can't be edited in place.
6. Note whether this recording exhibits the behavior the question is asking about (yes/no/ambiguous) — this feeds the synthesis count in Step 6.

**Entry-path / "how did they get here" questions:** `hotjar_actions.js` answers these directly. (Fallback if the script breaks after a Hotjar UI change: Actions tab → `Actions (N)` dropdown → untick All actions → tick Page views, Rage clicks, U-turns → Apply; the list is virtualized, so scroll ~5 wheel ticks between reads; the filter resets per recording. This costs ~10× more tokens — fix the script's selectors instead if you can: the list is `.side-panel .events > div`, entries are `button`s reading `Viewed: <url> <mm:ss>` / `Behavior: <name> <mm:ss>`.)

**Script gotchas:** the Chrome tab is usually hidden, so page timers are throttled and a long synchronous loop hits the 45 s CDP timeout — that's why the script runs in the background and you poll. Raw URLs with query strings get blocked by the tool's output filter — the script keeps only the parameter names, e.g. `/search (?q,page)`, never the values (which can hold personal data).

Don't watch recordings linearly end-to-end. If a recording's Info tab shows no relevant markers for the question, note that and move to the next one rather than scrubbing manually looking for something the counts already ruled out.

**PII note, confirmed live:** the Info tab's "Session info" section exposes real identifying data (user/account ID, name, role) alongside device and location. Treat every recording as containing real personal/business data — this is not hypothetical.

### Step 5 — Capture screenshots

`computer` screenshots stay inside the browser (`save_to_disk` returns no path, and macOS `screencapture` is blocked without Screen Recording permission). Validated workaround (2026-09-25): push each screenshot into a **localhost-only** file input with `upload_image`, and a tiny local server writes it to disk. Nothing leaves the machine.

1. Start the receiver in the background (Bash, `run_in_background: true`):
   `python3 <skill-dir>/scripts/shot_receiver.py <scratchpad>/shots 8765`
2. Open a second Chrome tab (`tabs_create_mcp`) at `http://127.0.0.1:8765/` and `find` the file input (`#shot`) to get its ref.
3. In the Hotjar tab, for each moment:
   - Navigate to `https://insights.hotjar.com/r?site=<site>&recording=<id>` and wait ~10 s; the first seek after load often doesn't take, so pause and repeat it.
   - Close the left **Recordings list** and right **Info/Actions** panels, then run `window.dispatchEvent(new Event('resize'))` via `javascript_tool`. Without that the replay stays thumbnail-sized.
   - Seek: click the scrubber at `x = left + (t / duration) × width` (it's linear), or click a marker icon, then fine-tune with the ±10 s buttons. Pause. Hover the mouse over empty grey space and wait ~3 s so tooltips and the loading spinner clear.
   - Take a full-size `screenshot` (scale 1), then immediately `upload_image` it to the receiver tab's input with `filename: <recording-id>_<mmss>_<what>.jpg`. The data is JPEG, so use a `.jpg` name. Screenshot IDs expire after a few minutes.
4. Crop to just the replayed page:
   `python3 <skill-dir>/scripts/crop_player.py <scratchpad>/shots <scratchpad>/cropped`
   Read the cropped PNGs to check them before using them.
5. Aim for 4–6 shots: one **hero shot** that shows the key finding at a glance, plus one per top evidence item, including at least one counter-example if sessions disagree.
6. Close both Chrome tabs and stop the receiver when done.

### Step 6 — Synthesize

Across all sampled recordings:
- State the count explicitly: "X of N sampled sessions showed [behavior]."
- Rank the findings by how directly they answer the question, not by recording order.
- Call out disagreement: if some sessions show the opposite behavior, say so — don't average it away.
- Write next steps: what to look at next (a bigger sample? a different filter? a design change to test?), not generic advice.

### Step 7 — Create Hotjar highlights

Validated live (2026-09-25). A highlight is a saved clip plus a comment. Its link opens a modal that plays just the clip, with a "Play full recording" button, so it **replaces "recording link + jump to mm:ss"** in the report.

**1. Propose, then get approval.** After synthesis, show the user one table of proposed highlights (typically 4–6, one per top evidence item, including a counter-example): recording, start–end, collection, label, and the full comment text. Ask once (AskUserQuestion: all / some / none). Also check the target collection first, and skip moments it already covers.

**2. Pick the collection and label.**
- Collection: many workspaces name their highlight collections after their saved recording segments. If a collection has the **same name as the segment you sampled**, use it. Otherwise list the existing collections and ask the user which one; don't create one on your own.
- Labels: the dialog shows a row of emoji labels. Hover each to read its name, since names can differ per workspace. Map them by meaning: a design/UX-issue label for workflow or layout problems, a confusion label when the user is visibly lost, a frustration label for rage clicks, a bug label for errors. If none fits, leave the label empty.

**3. Write the comment in the standard format.** Highlight comments written by hand tend to drift into many formats (bracket tags, emoji titles, numbered issues, one-liners, long essays), which makes a collection hard to scan, because the card grid shows only the **first ~45 characters**. Always use this format:
```
[TYPE] <insight headline, ≤ ~45 chars including the tag>
mm:ss — <what the user does, concretely>
Root cause: <why>
Evidence: <X/N sampled <segment> sessions (<date>) …>
Fix: <specific design change>
Source: Pattern Finder report <YYYY-MM-DD>
```
- **TYPE** (one per highlight, matches the label): `WORKAROUND`, `UI-UX ISSUE`, `CONFUSION`, `RAGE CLICK`, `U-TURN`, `ERROR`, `BUG`. The collection already names the area, so don't repeat it in the tag.
- The headline states the **insight**, not the event: "[CONFUSION] Users miss the promo-code field", not "[RAGE CLICK] User clicked the button".
- **Hard limit: 500 characters.** Hotjar truncates silently at 500 (`maxlength`). Aim for ≤ 470. Put line breaks in with `shift+Enter`; plain Enter may submit.
- Plain text only: no @mentions, no user IDs or personal names, no pasted chat or tool output.

**Double-check before saving.** Build a small table of every factual claim in the comment (timestamp, counts, UI labels, durations) next to its source (the frame you saw, the Actions-list times, the synthesis counts). Fix or drop anything you can't trace. Round only in the safe direction ("8 in 18 min", not "8+ in ~20 min" if you counted 8).

**4. Create it in the player.**
- Open the recording, pause (use `find` → "Pause (k)" and "Rewind 10 seconds" refs; coordinate clicks miss when the viewport shifts), and seek to just before the moment.
- `find` → **"Highlight"** button (💡 in the footer) and click it. The dialog opens with Start/End defaulted around the current time.
- Set Start and End: triple-click the field, type `m:ss`, press Tab. Aim for a 10–30 s clip starting a few seconds before the moment.
- Collections: click the field, pick the matching collection from the dropdown, then click the "Collections" heading to close the dropdown (**Escape may close the whole dialog**).
- Click the label emoji, click the Comments box, type the comment, click **Save**. A toast "Highlight saved to collection" confirms it.
- **Verify after saving:** read the textarea length before Save (`document.querySelector('textarea').value.length` must be < 500 and end with the Source line). After Save, open the collection page and check that (a) the card shows the `[TYPE]` headline, (b) the full comment reads back unchanged (`document.body.innerText`), (c) the label and collection are right, and (d) the clip plays the moment you described.
- **Editing your own highlight's comment:** open the highlight → comment ⋮ → Edit → `cmd+a`, Delete, retype → Save. Never edit other people's comments.
- Get the link: `javascript_tool` → `[...document.querySelectorAll('a')].find(a => /highlights\/0\?highlight=/.test(a.href)).href` → `https://insights.hotjar.com/sites/<site>/highlights/0?highlight=<id>`.
- Collection URL: `https://insights.hotjar.com/sites/<site>/highlights/<collection-id>`. Read the ids from the Highlights page sidebar links.

**Permissions:** in auto mode, typing into Hotjar is classed as an external write and can be blocked even after the user approves in chat. If that happens, stop, say what was blocked, and leave the dialog filled but unsaved so the user can click Save or grant permission. Don't look for a workaround.

### Step 8 — Report (Word)

The deliverable is a **.docx**, not markdown. The Key Finding section must open with the count, a confidence line and the **hero screenshot**, then the per-session summary table.

1. Copy the cropped screenshots you'll use into `docs/hotjar-findings/assets/`.
2. Write the report spec `docs/hotjar-findings/<question-slug>-<date>.report.json` following [report-template.md](report-template.md). Keep it next to the .docx so the report can be regenerated after edits.
3. Build it:
   `node <skill-dir>/scripts/build_report.js <spec>.report.json <question-slug>-<date>.docx`
   (needs the `docx` npm package in `<skill-dir>/scripts/node_modules`; `check_setup.sh` installs it).
4. Verify visually: `soffice --headless --convert-to pdf --outdir <scratchpad> <file>.docx`, then `pdftoppm -jpeg -r 60`, and Read the pages. Check that no heading is stranded away from its screenshot and that every image is rendered.

In the report spec, set each evidence item's `link` to its highlight URL (`linkLabel`: "Watch highlight clip") and drop `jumpTo`. Mention the collection URL in Notes.

Present the user a short chat summary (key finding + confidence + link to the saved report file + highlight collection). Ask before doing anything with it beyond saving locally — posting to Slack, attaching to a ticket, or sharing the doc all require the user's explicit go-ahead in that run, per the Hard Constraints above.

## Anti-patterns to Avoid

- Don't treat one recording as proof of anything — always sample and count.
- Don't scrub a recording end-to-end when Hotjar's own markers can jump you straight to the moment.
- Don't post or share the report anywhere without asking first, even if a previous run was approved — approval doesn't carry over.
- Don't attempt Hotjar login on the user's behalf, ever, even if they paste credentials into chat — tell them to log in themselves.
- Don't build or edit Hotjar filters in v1 — ask the user for an existing filter/segment instead.
- Don't ship a report without screenshots when the receiver route is available — a findings doc without visuals is the thing this skill exists to avoid.
- Don't create highlights for every moment you noted — only the approved ones that carry an insight. The collection is shared, and noise costs the team attention.
- Don't point the shot receiver at anything but `127.0.0.1`, and don't upload screenshots to any other page — they contain PII.

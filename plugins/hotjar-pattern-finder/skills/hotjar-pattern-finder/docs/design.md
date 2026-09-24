# Hotjar Pattern Finder Skill

## Problem Statement
How might we let anyone on the team ask a research question in plain language and get back a synthesized, evidence-backed answer drawn from multiple real Hotjar recordings — instead of manually scrubbing through session after session?

## Recommended Direction
Build a shareable skill where a teammate inputs a **goal**, a **question**, and a **Hotjar filter/segment** (e.g., "sessions with rage clicks on checkout, last 7 days"). The agent drives an already-authenticated browser session into Hotjar, opens the filtered recordings list, and samples a handful of matching sessions (5–10). For each one, it uses the recording player's timeline markers (rage clicks, errors, u-turns) to jump straight to the moments that matter rather than watching linearly, screenshots and annotates those moments, then synthesizes across sessions: how many showed the pattern, how many didn't, and what that means for the question asked.

This is Direction A (single-recording analysis) used as the underlying engine, with the multi-recording synthesis layer on top — because a single recording is an anecdote, and the real value PMs/researchers need is knowing whether something is a *pattern* or a one-off. The output is a markdown report: key finding, confidence level (e.g., "4 of 8 sessions," not just a vibe), annotated screenshots, next steps, and direct links back to each recording's relevant timestamp.

No Hotjar API access exists, so this only works by visually driving Hotjar's own UI — reading the recordings list, the filter/segment picker, and the player's marker timeline via browser automation on a session the user is already logged into. Claude never handles Hotjar credentials.

## Key Assumptions to Validate
- [ ] Hotjar's recording player actually exposes rage-click/error/u-turn markers visibly (DOM or screenshot-readable) — check manually on one real recording before building anything.
- [ ] A teammate's existing logged-in Hotjar browser session persists long enough (no fast SSO expiry) for a multi-recording run to complete without re-auth.
- [ ] Sampling 5–10 recordings per question is actually enough to call something a "pattern" for this team's traffic volume — validate against a question the team already knows the answer to.
- [ ] The Hotjar recordings-list UI is stable enough to navigate reliably across plan tiers/views the team actually uses — check filters/segment picker in the real account first.

## MVP Scope
**In:** one saved Hotjar filter/segment as input, sampling capped at 5 recordings, per-recording marker-jump + annotated screenshot, cross-recording synthesis with explicit confidence framing ("X of 5 sessions showed..."), markdown report with recording links, run manually on demand by one user at a time.

**Out (for now):** scheduled/standing digests, ticket-system integration (Jira/Zendesk attachment), a research-repo/Notion pipeline, support for teams without an existing saved Hotjar filter (would need filter-building UI navigation too), any handling of Hotjar accounts without visible rage-click/error markers on their plan.

## Not Doing (and Why)
- **Hotjar API integration** — team confirmed no API access exists; not worth designing around a capability that isn't there.
- **Standing/scheduled analyst** — powerful later, but adds unattended-run reliability and PII-distribution risk before the core engine is even proven on a single manual run.
- **Ticket-system attachment** — a distribution choice, not core capability; bolt it on once the report format is proven useful in its plain markdown form.
- **Credential-based Hotjar login** — Claude will never enter Hotjar passwords; the skill only works by riding an already-authenticated browser session. This is a hard constraint, not a scope trade-off.

## Open Questions
- Do Hotjar's rage-click/error markers actually render in a way browser automation can reliably detect — has anyone checked this on a live recording yet?
- Where should the markdown report land for the team to actually find it (Slack, a shared doc folder, something else)?
- Given recordings contain real user PII, does this report need any redaction/access policy before it's shared beyond the person who ran it?

## Status Update (2026-09-25)
The shipped skill validated the core assumption and then grew past this MVP in two ways — see [SKILL.md](../SKILL.md) for the current, authoritative behavior:

- **Markers are detectable, and better than assumed.** Hotjar exposes exact rage-click/u-turn/error counts as plain text (no image parsing needed to prioritize), and clicking a marker icon pops a DOM-readable labeled card ("Rage click" + URL) — a more reliable caption source than describing a screenshot.
- **Output changed from markdown to a Word (.docx) report**, built from a JSON spec via a script, with a hero screenshot in the Key Finding and a per-session summary table.
- **Scope grew beyond "screenshots + report":** after synthesis, the skill proposes a short list of Hotjar **highlight clips** (with a comment) for the team's shared collection, and only saves them after explicit approval. Evidence links in the report now point to those highlight clips instead of a raw recording+timestamp. This is a new class of action (writing to shared team state) not covered by the original "Not Doing" list — it's gated the same way sharing is: propose, then wait for a yes.
- **PII stance refined:** screenshots/report still never leave the machine without asking, and highlights never carry user IDs, names, or @mentions — but business names visible inside a screenshot are treated as acceptable for an internal report (noted, not redacted).

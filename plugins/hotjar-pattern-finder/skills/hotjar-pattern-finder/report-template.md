# Report Template

The report is a Word document built by `scripts/build_report.js` from a JSON spec. Write the spec at `docs/hotjar-findings/<question-slug>-<date>.report.json`. Image paths are relative to the spec file, and `**bold**` works in any text field.

Section order in the .docx: title + metadata → **Key Finding** (highlighted headline, confidence, body, hero screenshot, summary table) → **Evidence** (one sub-section per recording, most relevant first, each with link, jump-to time, screenshot and caption) → **Next Steps** → **Notes**.

```json
{
  "title": "<Question, phrased as a title> — Hotjar Findings",
  "meta": [
    { "label": "Date", "value": "<recording date> · report generated <today>" },
    { "label": "Goal", "value": "<the goal the user gave>" },
    { "label": "Question", "value": "<the question the user gave>" },
    { "label": "Segment sampled", "value": "<name or URL of the Hotjar filter/segment>" },
    { "label": "Sample size", "value": "<X of N recordings the filter returned; say 'anecdotal' if below 3>" }
  ],
  "assumption": "<optional: any interpretation you made of an ambiguous question>",
  "keyFinding": {
    "headline": "**<X of N sampled sessions showed ___.>** <one-sentence so-what>",
    "confidence": "**<Pattern | Mixed | Anecdotal>** (<why: sample size, coverage, caveats>)",
    "body": ["<1–2 short paragraphs: what it means, and where the friction is>"],
    "image": "assets/<hero-shot>.png",
    "imageCaption": "<Recording #, country/device, timestamp: what the screenshot shows and why it proves the finding>",
    "table": {
      "headers": ["#", "Country / device", "Duration", "<behaviour column>", "<count column>", "Frustration"],
      "widths": [5, 17, 11, 33, 12, 22],
      "rows": [["1", "…", "…", "…", "…", "…"]]
    }
  },
  "evidenceIntro": "Most relevant first. Hotjar share links don't carry a timestamp, so the moment to jump to is listed next to each link.",
  "evidence": [
    {
      "title": "Recording <n>: <country/device>, <session time> (<duration>). <what it shows>",
      "link": "https://insights.hotjar.com/r?site=<site>&recording=<id>",
      "jumpTo": "<mm:ss> (<what happens there>)",
      "image": "assets/<recording-id>_<mmss>_<what>.png",
      "imageCaption": "<mm:ss>. <caption taken from the Hotjar card text or the visible UI, not guessed>",
      "body": "<why this session matters to the question; call out disagreement plainly>"
    },
    {
      "title": "Recordings <a, b, c>: <grouped lower-signal sessions>",
      "link": "<segment URL>",
      "linkLabel": "Open the segment",
      "bullets": ["#a <country/device> (recording <id>): <one line>"]
    }
  ],
  "nextSteps": ["**<Concrete action.>** <why, and what it would measure>"],
  "notes": [
    "**Limitations:** <sampling rate, date range, what couldn't be determined>",
    "**PII:** screenshots and links come from real user sessions. Don't share outside the team without checking for PII exposure.",
    "Sample size was <N>. Findings from fewer than 3 sessions are anecdotal, not a confirmed pattern."
  ]
}
```

Rules:
- The Key Finding **must** include a hero screenshot. Pick the frame that proves the headline on its own.
- Give every evidence item with a strong visual its own `image`. Group low-signal sessions into one `bullets` item.
- Order evidence by relevance to the question, not by recording order, and include at least one counter-example if sessions disagree.
- Leave out user IDs and personal names. If screenshots show names, emails or other identifying data from the recorded site, say so in Notes (or crop/redact them) — the report is for internal use only.

# Demo storyboard

Recorded 2026-08-23 against a clean seeded `assay_demo` DB, production build on :3020,
worker live, `ASSAY_TESTBED` armed. 1440×900 (mobile clip: 390×844).
Videos: `demo/video/*.mp4` (H.264). Keyframes: `demo/shots/*.png`. Raw webm kept in `demo/raw/`.
Re-take any clip: `demo/record.py <nn>` (env expectations in the file header).

| # | Clip | Dur | Caption for the edit |
|---|---|---|---|
| 01 | home-identity | 7s | "A scraper that abstains when it is not sure." 153 benchmark cases, 0 wrong values published — a naive scraper would have published 93. |
| 02 | create-with-ai | 29s | Paste a link, say what you want. Assay reads the page live, shows every field with the value it sees right now — nothing is created until you confirm. |
| 03 | refuses-to-guess-at-creation | 7s | Give it a value that isn't on the page and it refuses to watch it. Verification before creation. |
| 04 | run-trace | 9s | Every run explains itself: the pipeline it walked, the gate it applied — and the scores, one click away, never forced on you. |
| 05 | decisions-queue | 7s | The close calls come to you. Answer, get a receipt, change your mind — Undo survives even the last decision. |
| 06 | proof-page | 6s | Every number has a shareable proof page: where it came from, and the exact record that landed in your data. |
| 07 | break-it-live | 56s | Break the page on purpose, live. The worker picks it up, and the trace shows exactly what Assay did about it — no pre-baked data. |
| 08 | fields-fragility | 7s | Assay tells you what will break next — and shows your collected values over time, holes included. CSV export one click away. |
| 09 | schedule-and-lifecycle | 13s | Every run past and future on a calendar; pause, reschedule, run now, or delete — from the browser. |
| 10 | audit | 4s | We audited the incumbent: 6 of 10 promised fields unhealthy behind a run reported 100% successful. |
| 11 | compare | 4s | When Assay cannot tell you whether something changed, it says so — in your language. |
| 12 | docs-and-search | 12s | Real docs with search, an API reference, an MCP server for Claude, a CLI, and a glossary. |
| 13 | mobile | 10s | It works on a phone. |
| 14 | honest-edges | 6s | Even the 404 is honest. |

## Keyframe highlights (for stills / thumbnails)

- `01a-home-hero` — the identity shot
- `02b-proposal-table` — live field values + tool trace ("60 elements examined")
- `02d-built` — "Watching … The first run is done" (the click that used to crash the server)
- `03b-refusal` — the red refusal sentence
- `04b-show-the-numbers` — score/margin/thresholds disclosure
- `05b-toast-undo` — receipt + Undo over the emptied queue
- `07d-break-run-trace` — run 186 fetching the mutated `/v/rename_class/` page
- `09c-lifecycle-dialog` — cadence/pause/delete + worker liveness
- `10a-audit` — the sponsor-slide table

## Suggested edit order

01 → 02 → 03 → 07 (the wow loop) → 04 → 06 → 05 → 08 → 09 → 10 → 11 → 12 → 13 → 14.
Total raw runtime ≈ 2:57 — trims to a tight 2-minute cut with the captions above.

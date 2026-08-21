# Interaction states — audit and system

Rule this audit enforces: **everything clickable has a defined consequence and states,
or it does not exist.** Undefined-on-click is a bug, not a TODO.

Board organization (2026-08-21): state frames live inside `03 · Wireframes`, nested in their
flow's sub-section — a flow is the review unit and contains every state of its screens.
Component masters live on `04 · Components` (page `05 · States` was merged away).

---

## 1. The placeholder list, ranked

Every interactive element whose click has no defined consequence anywhere in the file.
For each: define it (how) or delete it — recommendation given.

| # | Element | Where | Verdict |
|---|---|---|---|
| 1 | **Chat bars** (`Ask about this run…`) | 9 frames | **Delete until designed.** No response surface is drawn anywhere, and `docs/CRITIQUE.md` flags the feature as designed nowhere and half-refused by AI-AND-AGENTS. Nine dead inputs on operational screens is nine broken promises. Re-add with a real answer surface if the feature is ruled in — **RESOLVED: deleted on all frames (2026-08-21 flow reorg). Re-add only with a designed answer surface** |
| 2 | **`See it on the page`** | all 3 decision frames | **Define: frozen-page side panel** (right overlay, full height, both candidates boxed via `PageThumb` idiom, Esc closes). It is on the money screen; F7 requires it — **RESOLVED: `decisions · frozen page` frame in flow 4.1** |
| 3 | **`See held cells`** | assay-empty | **Define: route to Fields** filtered to held — no new screen. A dedicated held-cells view is quarantine-store UI that doesn't exist yet — **RESOLVED: drawn — `fields` now carries filter chips `all / held (312) / fragile (3)`; `See held cells` routes to the held chip** |
| 4 | **`Once`** (one-shot scrape) | home, assay-empty | **Delete.** No destination flow exists; the watch flow covers the demo. Re-add with its own confirmation when one-shot is real — **RESOLVED: deleted everywhere** |
| 5 | **`Edit fields` / `Adjust fields` / `Add a field`** | agent-fields, building | **Define: inline row edit** (Input component states; add-row appends an editable row). No modal editor — **RESOLVED: `agent-fields · editing` frame in flow 1.2 (inline row edit)** |
| 6 | **`Choose which` / `Choose myself`** | drift, discovery | **Define: selection mode** — same screen, checkboxes appear (Input/checkbox state), primary becomes `Watch N selected` |
| 7 | **`Pause`** (header) | 6 scraper frames | **Define: header pill toggles** to `Paused · Resume`; schedule row greys (already drawn there). Toast on toggle |
| 8 | **`Leave this field empty` / `Neither is right`** | decision frames | **Define: card collapses + toast** (`Held. Escalated to you-know-who · Undo`); "Neither" also tags the item `escalated` |
| 9 | **`Upgrade` / `Free plan`** | sidebar, all frames | **Delete from OSS build; demo badge instead.** APP-DESIGN §7.3 already flags the contradiction — **RESOLVED: sidebar retexted `Self-hosted`; `Upgrade` deleted** |
| 10 | **Sidebar search icon** | all frames | **Delete.** No search results surface exists. Keep the panel-collapse icon (defined: collapses sidebar) — **RESOLVED: deleted on all frames** |
| 11 | **`button/attach`** (chat bar) | home | **Delete with the chat bars** — **RESOLVED: deleted with the chat bars** |
| 12 | **`Ignore this`** | drift | **Define: dismiss + toast with undo.** Drift state clears (F3 says drift self-clears anyway) |
| 13 | **`Preview ›` / `Preview both templates ›`** | email, connect-email | **Define: Popover** with the template at readable size |
| 14 | **`Replace`** (API key) | email | **Define: Popover with Input** (paste key → `Save` primary), inline error on invalid |
| 15 | **`Cancel`** (building) | scraper-building | **Define: immediate stop + toast.** Nothing destructive — no dialog |

Everything else clicked through to an existing frame or falls under a convention in §3
(copies, exports, disclosures, tabs, nav).

## 2. State matrix — per component class, not per instance

`●` required · `—` not applicable

| Class | hover | focus-visible | active | disabled | loading | success | error |
|---|---|---|---|---|---|---|---|
| Button/primary (black) | ● | ● | ● | ● + reason tooltip | ● 3-dot | via toast | via toast/inline |
| Button/secondary (outlined) | ● | ● | ● | ● | ● | — | — |
| Button/ghost (grey text incl. `… ›`) | ● underline | ● | ● | — | — | — | — |
| Tab | ● | ● | = selected | — | — | — | — |
| Input (text, typed-confirm) | ● border | ● ring | — | ● | — | ● (valid) | ● inline message |
| Table row (clickable: runs, schedule, queue) | ● bg `#f7f7f8` | ● | ● | — | skeleton | — | inline ErrorRow |
| KeyHint (1/2/E/N) | — | ● | ● pressed fill | ● when action disabled | — | — | — |
| Toast | — | ● on Undo | — | — | — | is one | error variant |

Frame-level states every route needs (none were drawn before `05 · States`):
**loading** (Skeleton components), **store unreachable** (ErrorState row / full-frame),
**missing key** (see `state-missing-key` exemplar — explain + one primary `Connect Bright Data`),
**stale** (grey banner "last synced 3h ago · refresh"), offline = same as store unreachable.

## 3. Overlay + async conventions

| Surface | Used for | Never for |
|---|---|---|
| **Toast** (bottom-left, 8s, undo where reversible) | outcome of any async action: decision applied, paused, repaired, test sent, copied, exported | questions, errors that block work |
| **Dialog** | destructive or typed-confirm only (brake resume, repair-history). One primary + cancel. | success messages — **no success dialogs, ever**; confirmation of reversible actions (toast+undo instead) |
| **Popover** (≤360px, close-on-outside) | every `… ›` disclosure: `details ›`, `the full record ›`, `what came back ›`, `the four heals ›`, previews, key replace | anything with its own primary action beyond one |
| **Inline** | validation errors, table-level errors (ErrorRow), selection modes | anything that must interrupt |

One-primary law applies inside overlays too. Async actions: optimistic + toast-undo when
reversible (decisions, pause, ignore); spinner-in-button when not (re-scrape, send test);
failure lands where the action started (inline), never only a toast.

## 4. What was built on `05 · States`

Button (3 kinds × 6 states) · Toast (default / with-undo / error) · Dialog (confirm /
typed-confirm) · Popover (frame + filled `full record` exemplar) · Menu (cadence) ·
Input (5 states) · Skeleton (card, row) · ErrorRow · Tab (3 states) · KeyHint.

Composed exemplars: `state-decision-resolved` (post-keypress: toast+undo, next card
promoted) · `state-missing-key` (Decisions with no Bright Data key).

## Severity taxonomy

The palette has no alarm colors, so severity is carried by words, weight, and one
glyph — never color, never a ring, never a percentage.

| level | rendering | example | rules |
|---|---|---|---|
| info | grey text, no glyph | "3 runs skipped: page unchanged" | ambient; never demands anything |
| warning | ink text + ⚠ | "⚠ anchors disagreeing on 6% of pages — nothing broken yet" | a standing state, not an event; never blocks, never pages; clears itself when the condition clears (F3 drift model) |
| error | ink Semi Bold + ⚠ | "⚠ could not reach the store · Retry" | names the failed thing and carries exactly ONE recovery action |

Component: `Severity` on `05 · States`, three strip variants matching the table.

---

## 6. Flow-reorg resolution log (2026-08-21)

Items 1, 4, 9, 10, 11 deleted across the board; item 2 became `decisions · frozen page`
(flow 4.1); item 3 is defined navigation to Fields; item 5 became `agent-fields ·
editing` (flow 1.2). Items 6, 7, 8, 12, 13, 14, 15 remain defined-but-undrawn: their
consequences are specified above and use existing components (Popover, Input, Toast) —
draw them only if a flow review stumbles on one.

Chrome definitions (2026-08-21 walk):
- `+` beside SCRAPERS — routes to the Home goal box. No new frame.
- `Show all 14` — expands the scraper list in place. No new frame.
- sidebar-collapse icon — collapses to an icon rail; drawn only if the rail is ever built.
- runs table depth — `earlier runs ›` appended to the runs table (drawn on 79:2).
- user block chevron — opens `UserMenu` (Docs · GitHub · Sign out); drawn in `sidebar · user menu`.
- sign-in `Continue` — resolved by `sign-in · link sent` and `sign-in · unknown email` in flow 1.1.

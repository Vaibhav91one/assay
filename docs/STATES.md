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

---

## 7. Affordance resolution log (2026-08-22)

Every interactive node on `04 · Screens` is now accounted for. **170 interactive nodes:
128 wired to a destination, 42 resolved as one of the four non-navigational categories
below.** Nothing is undefined; "nothing is a placeholder" is provable by walking this
table against the file.

The rule from §1 stands: an undefined click is a bug. A click that *acts* rather than
navigates is not undefined — it has a defined function response, recorded here.

### Self-referential (7) — correctly inert

The active tab on its own screen: `tab/Claude Code` on `connect`, `tab/Codex` on
`connect · codex`, `tab/claude.ai`, `tab/Bright Data`, `tab/Email`, `tab/Model`, `tab/API`
each on their own panel. Also `button/edit-fields` on `agent-fields · editing`, which is
already the editing state. Clicking the state you are in does nothing, by definition.

### Filter-in-place (6) — no navigation, no new frame

| Affordance | Frame | Behaviour |
|---|---|---|
| `tab/all` · `tab/healed` · `tab/held` · `tab/clean` | `runs` | Filters the run table in place; the count in the header updates |
| `chip/all` · `chip/held` | `fields` | Filters the field table in place |

A filtered-state frame is **not** wanted: the table is the same component with a
predicate applied, and drawing four near-identical frames would be the "50 frames that
differ by one fill" the state-coverage decision already refused.

### Disclosure-in-place (8) — expands within the frame via `Popover`

| Affordance | Frame | Reveals |
|---|---|---|
| `the page I read ›` | `agent-fields`, `agent-fields · editing` | The captured page, in a `Popover` anchored to the link |
| `link/served` · `link/raw` (`what came back ›`) | `blocked` | Status line, page title, byte size, skeleton verdict |
| `link/structure` (`show page structure ›`) | `page-map` | The before/after DOM outline the map abstracts |
| `link/why` | `decision · proposers` | Why two-of-three is not a majority — the shared-blind-spot argument |
| `link/solid` (`3 fields are solid ›`) | `fragility` | The three fields not at risk |
| `link/docs` | `envelope` | The full output format, linking to docs |

All use the `Popover` component on `04 · Components`. They expand and collapse in place;
none navigates.

### Action-with-feedback (10) — acts, then surfaces a `Toast`

A defined function response, not a dead end. Toast copy is the specification:

| Affordance | Frame | Toast |
|---|---|---|
| `button/export-retraction-csv` | `blast-radius` | *"4,113 rows exported · results/blast/…csv"* |
| `link/copy-cli` | `explain` | *"Copied `assay explain pr_9f21c4`"* |
| `button/send-a-test` | `digest` | *"Test digest sent to data-oncall@yourdomain.com"* |
| `button/create-key` | `connect · api` | *"Key created. Copy it now — it is not shown again."* |
| `export as YAML ›` | `settings`, `sidebar · user menu` | *"Field contracts copied as YAML"* |
| `one command, JSON + CSV ›` | `settings`, `sidebar · user menu` | *"Export started · JSON + CSV"* |
| `button/attach` | `home` | Opens the OS file picker; no toast |
| `chip/app` | `digest` | Switches the preview channel in place |

### Genuine design gaps (3) — no destination frame exists

Left unwired deliberately rather than inventing a screen. Each is a product decision, not
a wiring oversight:

| Affordance | Frame | What is missing |
|---|---|---|
| `btn-request-access` | `sign-in · unknown email` | A "request sent" confirmation state |
| `button/choose-myself` | `discovery` | A manual page-selection screen |
| `button/choose-which` | `drift-proposal` | A per-field accept/reject screen |

All three are on the hosted/onboarding path. None blocks development of what is drawn.

### Not reproducible

The 8 duplicate `settings` / `sidebar · user menu` shadow nodes reported after the wiring
pass **no longer exist** — a scan of all 54 frames finds zero duplicate-named interactive
nodes. They were most likely removed when group 08 was rebuilt. Recorded rather than
claimed as fixed.

## 8. Flow completeness (2026-08-22)

58 frames, 18 flows, walked by following `NODE` reactions from each flow's starting frame.

### Dead ends (2) — both already accounted for

| Flow | Frame | Why |
|---|---|---|
| 1.1 First run | `sign-in · unknown email` | Its only affordance is `btn-request-access`, one of the three genuine design gaps in §7 |
| 8.3 Public pages | `conduct` | A public page with no app chrome. It is reached from a footer link outside the prototype, and by design has nowhere to go back to |

### Frames with no inbound click (13) — event-driven states, not missing wiring

These are alternate states of a frame that already traverses. They are entered when a
condition occurs, not when someone clicks, so a prototype edge into them would misrepresent
how the product works:

`runs · store unreachable` · `alert · delivery degraded` · `blocked` · `brake` ·
`drift-proposal` · `decisions · loading` · `decisions · empty` · `connect · form errors` ·
`incident-record` · `envelope` · `page-map` · `compare` · `decisions · frozen page`*

\* `decisions · frozen page` is now reachable — see below.

The last four are reachable in the product from surfaces not drawn as buttons (an alert
link, a nav entry for Compare). They are entry points, not orphans.

### Wired during this pass (6)

Frames that *should* have been click-reachable and now are:

| From | Affordance | To |
|---|---|---|
| `decisions` | See it on the page | `decisions · frozen page` |
| `decisions` | Review | `decision · disagreement` |
| `decision · disagreement` | See it on the page | `decision · proposers` |
| `decision · proposers` | See it on the page | `decision · model proposed` |
| `connect · email` | Preview both templates › | `email` |

`decisions · resolved → decide-once` was **not** wired: the frame's only affordance is
`button/leave-it-empty`, and `decide-once` is what the undo toast leads to, not a button.
Wiring it to the receipt row was tried and reverted rather than left as a false edge.

## 9. Design system conformance (2026-08-22)

A review pass found the screens were drawing on three colours (brand orange, ink,
white) while the palette frame defined seventeen, and that several conventions had
drifted between sections. Everything below is enforced by `tools/figma-conformance.js`,
which reads the file and returns a violation count per rule. **All 13 rules return 0
across 62 frames.**

### Colour: what each family means

| Token | Used for | Not used for |
|---|---|---|
| `accent/brand` #FF4D00 | Brand primaries only — New scrape, Sign in, Start watching, Build the scraper | Any other verb |
| `semantic/success` #16A34A | Constructive confirms — Use this, Save row, Repair all five, Add both fields | — |
| `semantic/link` #2563EB | Data bars, and informational actions — Export, Retry, Open the decision | — |
| `semantic/warning` #CA8A04 | Held or unverified state — `bar/held`, suspect run bands | — |
| `semantic/danger` #DC2626 | Destructive — Unheal, Cancel run | — |

34 buttons were recoloured off brand orange. Orange now appears on 5 primaries and
the active nav item, which is what makes it read as the brand colour again.

**The palette frame contradicted itself.** Its "Yellow / Warning" swatch was filled
`#FFC346` while its own printed label and the `semantic/warning` token both said
`#CA8A04`. The swatch was wrong; it now matches the token.

**Progress bars.** `bar/fill` was `semantic/link` in section 01 and `accent/brand` in
02 and 04 — the same component reading as two different things. All 31 fills are now
`semantic/link`, all 31 tracks `border/hairline`.

### Identifiers: database style vs human style

`snake_case` is correct where the field name **is** the data — the Bright Data schema
table, the Codex tool table, the `field | right now` table in `run-report · in progress`,
and literal JSON/TOML. It is wrong in prose and in legends.

The audit distinguishes these structurally: a text node whose layer name equals its own
characters is an identifier cell and is exempt; anything else carrying an underscore in
a sentence is a violation. Seven were rewritten, including the two the review called out
by name — `anchors_died` → "Anchors died", `shape_mismatch` → "Shape mismatch".

### Dates

Displayed dates read `4 Aug 2026`, never `2026-08-04`. Ten were reformatted. Dates in
`blast-radius` markers now carry a `calendar` glyph so the number is legible as a date
without reading it.

### Icons

The glyph must match the verb. Nine were wrong, including three buttons using the
**settings gear for Copy, Copy link and Export**, and **Download PDF using the pause
glyph**. The two `Export retraction CSV` buttons on one screen used *different* icons.

The set had no `copy` or `download` glyph, so both were added as Lucide paths rather
than substituting a near-miss. `Repair the wrong one only` keeps `pencil` — it edits one
row, it does not re-run a repair.

### Density, and where the detail went

Too much explanation on screen is not thoroughness, it is a reading tax. Two patterns:

- **`blast-radius`** — the three run markers each carried a line of justification
  ("value matched its shape, 5 of 5 anchors agreed"). Those moved to `ON_HOVER`
  overlays. The export path caption (`results/blast/…csv`) was removed; the toast
  already names the file.
- **`decisions`** — the queue card carried a paragraph, a lead-margin chart with two
  captions, a rule paragraph and a mono score line before the reader reached a choice.
  It is now a **selection**: the question, then two option cards side by side, each with
  one hint line and its own action. The scores that justify the hold
  (`match 0.71 vs 0.62 · lead 0.09, needs 0.16`) live behind a "Why this is held"
  hover. The card went from 411px to 327px without losing a fact.

Hover is for detail that supports a decision, never for the decision itself — no action
is hover-only.

### The mark

`sign-in` carried a new spider mark while all 54 other screens still used the old raster
tile (image hash `c034574256`). The mark is now a `LogoMark` component built from that
vector artwork, so the sidebar master alone updates every screen.

Two mistakes are worth recording. The first pass took the wrong artwork — the orange
asterisk (`mark/hero`) rather than the spider in `logo/lockup`. The second broke on
geometry: the artwork sat one frame deep, so resizing an instance clipped it instead of
scaling it, leaving the mark rendering at the frame origin. Flattening the 52 vectors
directly into the component with `SCALE` constraints fixed it. `logoArtOffset` in the
audit exists to catch exactly that regression.

### Alignment

Eight buttons in section 01 had their label and icon sitting 4.3px below the button's
centre line — these are absolute-layout screens where the label is a *sibling* of the
button rect, so nothing kept them aligned. All eight are now centred, and the rule
covers both layout styles.

`agent-fields · editing` had a stale hint line sliced by the inline editor's bottom
edge; it is hidden while the editor is open. The other nine text overlaps the detector
found are dialogs and popovers with an opaque ground between them — correct, and the
rule now allows for it.

### Connectors

Only Bright Data showed whose service it was. Claude Code, Codex, claude.ai and Model
now carry the correct `BrandIcon` — Anthropic for the first, third and fourth, OpenAI
for Codex. Bright Data keeps `BrandRow`, the neutral glyph plus the service name in
text, because no official open SVG exists and a wrong logo is worse than no logo.

### Running it

Paste the body of `tools/figma-conformance.js` into `use_figma`. It mutates nothing.
Every count must be 0.

Two of the rules were wrong before the design was: the palette check paired every swatch
with the first hex label on the page, and the prose check flagged identifier cells. Both
made a clean file look dirty. A failing rule is a claim about the design *and* about the
rule — check which one is wrong before editing the file.

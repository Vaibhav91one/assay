# Assay — application design

Status: written as a design, since built. The screens live in `web/app/`. Where
this document and the running app disagree, the app is what shipped.

Scope locked 2026-08-21: hackathon tracks **03** (set a goal and walk away), **07**
(competitive intel), **09** (parallel proposers). Track 08 cut, track 06 parked — §9.

This document is written **against the wireframes**, not ahead of them. Figma file
`FYnhhLeMulixqTTyjP7gJd`, page `03 · Wireframes` (`3:3`), sixteen frames. Where the
wireframes and `docs/FEATURES.md` disagree, the wireframes are treated as the newer
decision and `FEATURES.md` is amended, except in the four cases listed in §7 — which
are defects, and one of them is serious.

---

## 1. What the wireframes already decided

Sixteen frames, and read together they are a coherent product that `FEATURES.md` did
not anticipate. The doc specified a CLI with two screens bolted on. The file draws an
application.

| Frame | Node | Is |
|---|---|---|
| `frontier-ai-sign-in` | `39:5` | Auth |
| `Home · chat model` | `57:2` | Goal box: *"What should Assay watch?"* + `Watch` / `Once` |
| `assay-discovery` | `103:392` | Sitemap → 14 candidate pages → *"watch the 4 I suggest"* |
| `assay-agent-fields` | `99:2` | Proposed schema before any scrape, with a per-field `clear` / `unsure` |
| `assay-scraper-building` | `59:2` | Build progress → baseline captured → *"Start watching"* |
| `assay-run-report` | `71:2` | One run: what made it look twice, then per-field outcome |
| `assay-decisions` | `69:2` | The abstain queue |
| `assay-decision-disagreement` | `100:2` | Scorer vs. model disagreement |
| `assay-page-map` | `86:2` | The visual explanation of a run |
| `assay-quiet` | `77:2` | Nothing needed you this week |
| `assay-fields` | `78:2` | Per-field reliability, `seen in 1/60` |
| `assay-runs` | `79:2` | Run log with margins |
| `assay-schedule` | `80:2` | Cadence per scraper |
| `assay-backfill` | `103:190` | Repair what was held or wrongly written |
| `assay-drift-proposal` | `103:2` | Page gained fields; nothing broke |
| `assay-settings` | `81:2` | Thresholds, output, connections |

**The strongest thing in the file is the voice.** Assay speaks in the first person and
in plain English — *"Run 74 finished. I published five fields and held one."*,
*"Nothing left on the page looks much like this field any more. Assay left it empty
rather than guess."* No selectors in the user's face, no scores presented as
authority, no invented certainty. That voice is a bigger competitive asset than the
gate is, and every gap filled below must be written in it.

**The second strongest thing is `assay-quiet`.** A screen whose content is *nothing
needed you* is the walk-away track's proof, and almost nobody designs it because it
looks like an empty state. `PUBLISHED IN ERROR · 0 · since you started` is the single
best number this product can show a person.

### Overturns, recorded

`FEATURES.md` §4 refused things these frames build. Each is overturned deliberately:

| Refused in §4 | Overturned by | Ruling |
|---|---|---|
| "Scheduling and orchestration" | `assay-schedule` | **Overturned.** Track 03 is *walk away*; a product that cannot state its own cadence cannot be walked away from. Assay still does not execute the job — Bright Data or a platform cron does — but it owns the schedule as declared state |
| "A fleet dashboard" | `assay-quiet`, `assay-runs` | **Overturned in the good direction.** These are logs and counts, not gauges. `assay-quiet` inverts the dashboard: the green number is the *absence* of work, not a health ring |
| "Never a settings UI" | `assay-settings` | **Partially — see §7.1.** Output, notification and connections are legitimately UI. Thresholds are not |
| "A visual selector picker / rule builder" | `assay-agent-fields`, Home goal box | **Not actually violated.** The user describes *what to watch* and confirms *which fields*, in prose and examples. At no point do they write or edit a selector. The refusal was about selectors, and it holds |
| Proof-record viewer resisted (§5) | `assay-page-map` | **Overturned.** `AI-AND-AGENTS.md` §6 already argued this: the map is derived deterministically from data on hand, and it is the artifact a decision attaches to |

Not overturned, and load-bearing: no confidence percentage as a user-facing number, no
LLM narrating a break in prose, no silent fallback, no global auto-approve, no RBAC.

---

## 2. The three tracks, mapped onto the file

### 03 — Set a goal and walk away — **~80% drawn**

The claim: *"walk away" is only a responsible instruction if the thing can refuse.*

The path already exists end to end: goal box (`57:2`) → discovery (`103:392`) → field
proposal (`99:2`) → build + baseline (`59:2`) → schedule (`80:2`) → quiet (`77:2`) →
decision when it cannot cope (`69:2`). That is the whole track and it is the best-drawn
part of the file.

Missing, and all small:
- **The walk-away moment itself.** `59:2` ends on *"Start watching"* and
  *"You will only hear from Assay when something needs you."* That sentence is the
  product's promise and it deserves a beat of its own — the confirmation state after
  the click. One frame.
- **Where the data goes.** `assay-settings` offers `Output · Webhook`. Track 03 says
  *saving the results to storage*. Needs Postgres and file/S3 as siblings. One panel.
- **What arrives while you are away.** Notification is a settings row
  (`Notify · Only when held`); there is no drawn artifact of the message itself. The
  digest is designed in §4.2 because 07 needs the same object.

### 07 — Competitive intel — **not drawn at all**

The claim: *in a diff pipeline, a break is indistinguishable from news.*

This is the largest gap in the file and the sharpest wedge of the three. "Competitor
removed 14 changelog entries" and "your selector broke" render identically in every
weekly digest ever shipped, and the false alarm arrives on a Monday with total
confidence. `detect()` separates them: skeleton hash moved plus anchors died is a
break, not news.

`assay-drift-proposal` (`103:2`) is the nearest relative — *"Nothing broke, but the
page is carrying more than it was"* — and its rhetorical shape is exactly right for
07. It is not the same screen: drift is one page gaining fields, 07 is N competitors
diffed on a cadence.

Two rules carry the track:

1. **A quarantined cell never produces a diff entry.** Diffing a hole is not a change.
2. **The digest never leads with a change count alone.** It leads with
   `12 changes, 2 withheld`. A bare "12 changes" silently containing two breaks is
   precisely the lie this project exists to prevent, shipped by us, on a schedule.

New frames required — §4.2.

### 09 — Parallel proposers — **half drawn, and the drawn half is the best idea in the file**

`assay-decision-disagreement` (`100:2`) is the two-proposer case and it is excellent:

> **Two different methods, two different answers.** The element holding `hazard` is
> gone. The scorer and the model each found a replacement, and they are not the same
> element. Assay does not publish when its methods disagree, however confident either
> one is on its own.

That last clause is the thesis of `AI-AND-AGENTS.md` §1 in one sentence, and the frame
labels the evidence honestly — `matched on text and position · 0.71` against
`matched on meaning · reads as the hazard line`. Two methods, two kinds of evidence,
neither dressed as the other.

What is missing is the generalisation and the proof:
- **N > 2.** Three or more strategies disagreeing must still resolve to a two-choice
  card or an escalation — never a three-way quiz (`FEATURES.md` F7).
- **The fourth benchmark arm.** `results/bench.json` has three arms and none uses a
  model. Until a fourth exists, no accuracy claim may be made about any of this — §10.
- **`They agree on 5 of the other 6 fields this run.`** already on the card is a
  *disagreement rate*, and it is the exact statistic the benchmark arm should report.
  Design and measurement agree here; make them the same number.

---

## 3. Information architecture

Adopted from the file as drawn. Global nav: **Home · Decisions · Runs · Fields ·
Schedule**, a scraper list, and a per-scraper context that carries its own tabs.

```
/                         Home — goal box, decisions waiting, runs since Tuesday
/s/[scraper]              Run report (assay-run-report)
/s/[scraper]/fields       assay-fields
/s/[scraper]/runs         assay-runs
/s/[scraper]/map/[run]    assay-page-map
/s/[scraper]/backfill     assay-backfill
/decisions                assay-decisions  ← the screen the product is judged on
/runs                     all scrapers
/fields                   all scrapers
/schedule                 assay-schedule
/settings                 assay-settings   ← restructured, §7.1
/compare/[set]            NEW — track 07
/connect                  NEW — MCP + BYOK, §6
```

Two new routes for three tracks. That is the correct ratio and the budget should not
grow past it.

---

## 4. New and changed screens

### 4.1 Changes to drawn frames

Small, specific, and each one is a rule the wireframe left open.

**`assay-decisions` (`69:2`) — add the stakes line.** The card says *held 4 hours ago*.
It does not say what the hold is costing. Add, beside the field name:

```
IKEA recalls   run 74 · today 09:12 · field hazard
Decides 412 held rows across 3 runs                         held 4 hours ago
```

This is the queue's sort key — sort by rows held, never by age — and it is what makes
triage order obvious before any evidence is read.

**`assay-decisions` — the empty state must be honest.** An empty queue above a pile of
held cells is the easiest lie in this product to ship by accident:

```
Nothing waiting on you.

312 cells are still held. None of them have a question worth asking —
nothing on the page came close enough to be a candidate.
                                                    [ see held cells ]
```

**`assay-decisions` — keyboard.** `Use this` / `Use this` / `Leave this field empty` /
`Neither is right` are four mouse targets on the primary screen. Bind `1`, `2`, `E`,
`N`, show the hints on hover, keep the buttons. Five seconds does not survive a mouse
round trip, and this queue is the one surface a user works in volume.

**`assay-decisions` — undo, not confirm.** No dialog on any of the four. When a
decision applies to a template group, the undo must unwind **the whole group**. A
group-scoped action with an item-scoped undo is a trap that gets a queue abandoned.

**`assay-run-report` (`71:2`) — the proof chip.** `WHAT HAPPENED TO EACH FIELD` should
carry a copyable proof id per row (`pr_9f21c4`), which is how a value months later gets
traced back (F12). Small, ugly, and the whole of cell provenance.

**`assay-backfill` (`103:190`) — versioning, not mutation.** The frame offers
*"Repair all five"*. `FEATURES.md` F9 requires corrections be published as a **new
version**, never an in-place rewrite, and the frame's own line
*"Anything already exported keeps a note that it was corrected"* is most of the way
there. Make it explicit in the confirmation copy.

**`assay-runs` (`79:2`) — label the demo.** The header reads `74 runs · 24 healed ·
2 held`. The real corpus produced 74 runs, 66 heals and **zero** abstentions, and the
README makes a point of that. Mock data that quietly contradicts the repo's own honesty
claim is the one kind of polish this project cannot afford. Mark demo data as demo.

### 4.2 New — `/compare/[set]` (track 07)

Three states per tracked field, and the third is the product.

| State | Meaning | Render |
|---|---|---|
| `changed` | Value moved, field healthy, anchors agreed | The diff, normally |
| `unchanged` | Nothing happened | Collapsed count |
| `withheld` | Field broke, or the cell is quarantined | **The diff is not shown.** *"I cannot tell you whether this changed"*, with the cause and the run it started |

`withheld` is a new component and it is the only one that matters here. It is not an
empty diff and it is not "no change" — it is a marked absence with a reason. Rendering
it as either of the other two makes this track worse than a naive competitor, because a
naive competitor at least does not promise.

Copy in the house voice, top of the screen:

> **Three competitors changed something this week. One I could not read.**
> Vercel and Linear both shipped changelog entries. Replit's page moved underneath me
> on Tuesday and I have not trusted the changelog column since — so I am not going to
> tell you it stayed the same.

**The digest** — the artifact delivered to email, Slack or Discord, and reused by 03's
notification. Same object, two triggers.

```
Assay · week of 18 Aug          12 changes, 2 withheld

CHANGED
  Vercel     changelog      4 new entries
  Linear     pricing        Business $14 → $16

WITHHELD
  Replit     changelog      held since Tue 03:12 — the page moved and two
                            candidates were too close to call.  [ decide ]

UNCHANGED   9 fields across 3 competitors
```

The header count is the design. `12 changes` alone would be a lie of exactly the shape
this project was built to name.

### 4.3 New — `/connect` (§6)

### 4.4 New — the N-proposer variant of `100:2`

Same card, one extra line — *"Three strategies proposed. Two are too close to call."* —
and the same two choices. Three proposals inside the band escalate; they do not become
a quiz. Reason: a multi-way choice under time pressure reproduces the false-heal problem
inside a human being.

---

## 5. Component inventory

Extracted from what the frames already do, plus the four new ones. This is the Figma
library and it should be built before any more screens are.

| Component | Source | Notes |
|---|---|---|
| **`Hole`** | `assay-run-report` *"nothing written"* | A rendered absence with a reason. Must read as **deliberate** — never as loading, error, or empty. `FEATURES.md` §3: the hole is the product |
| `LeadBar` | `assay-decisions` | Winner, runner-up, threshold marker, and the two honest labels *not even halfway* / *this far ahead is enough to publish*. Already the best-designed object in the file. Never interactive |
| `AnswerCard` | `assay-decisions`, `100:2` | Value in the reading typeface, evidence beneath it in prose. Model-sourced variant states its *kind* of evidence (`matched on meaning`), never a competing confidence number |
| `StakesLine` | new — §4.1 | Rows held. Also the sort key |
| `OutcomeRow` | `assay-run-report` | `moved, found it again` / `unchanged` / `held for you`. Closed vocabulary, plain English, no reason codes in the user's face |
| `ProofChip` | new | `pr_9f21c4`, click to copy |
| `FieldReliability` | `assay-fields` | `1/60`, `unstable`, `never delivered` |
| `WithheldDiff` | new — §4.2 | A diff that refuses to render |
| `PageMap` | `assay-page-map` | Tags, quotes, scores, verdict, legend. Derived deterministically; never model-written |
| `QuietStat` | `assay-quiet` | A number whose good value is zero |

**The vocabulary rule.** The frames use two registers and the split is exactly right:
plain English to the user (*"moved, found it again"*), engine vocabulary only in
justification strips (*"lead 0.09, needs 0.16"*). Hold that line — the moment
`thin_margin` appears as user-facing copy, the voice is gone.

---

## 5b. Density rules

Written after the 34-frame audit of 2026-08-21 (23 frames by agent, 11 direct).
These are law for every screen, wireframe or built. A frame violating them has
failed review regardless of how it looks.

**The finding that set them:** the board's defining disease was not backend-dump
(8/23 frames) but **the product explaining itself** (12/23) — a trailing grey
meta-sentence addressed past the user to a judge, on twelve frames. The copy was
good; the placement was wrong. It now lives in the Voice bank below and feeds the
landing page and docs.

**The structure every KEEP screen shared, now mandatory:**

> One bold outcome sentence → one table or comparison of the **user's own data** →
> exactly **one black button**. Machine tokens grey, small, right, or behind a
> disclosure.

The six anti-patterns, with the test for each:

| # | Pattern | Test |
|---|---|---|
| P1 | backend-dump | raw hashes/ids/scores as primary content the user cannot act on |
| P2 | redundancy | the same fact rendered twice or more (prose + table + code) |
| P3 | no-visual | a quantitative or spatial insight rendered only as text rows |
| P4 | no-hierarchy | no single primary action; same-weight buttons; "where do I go" unanswered |
| P5 | docs-in-app | the screen explains philosophy or format instead of showing current state |
| P6 | overcrowding | sections beyond the screen's one job |

Rules of repair, calibrated with the owner:

1. **One fact, one rendering.** The pasteable/CLI form collapses behind `Copy`; it is
   an export, not content.
2. **Collapse, never delete.** Evidence stays one click away — the honesty story
   needs it reachable, not shouting.
3. **Philosophy-free operational screens.** The voice survives as first-person state
   ("I held one"); the manifesto lines belong to the landing page and docs.
4. **Every quantitative insight gets a visual carrier**, drawn from the four
   primitives on `04 · Components`: `RunStrip`, `TimelineLanes`, `PageThumb`,
   `RankBars`. Invent a fifth only when none fits, and add it to the page.
5. **Reason codes never reach the user raw.** `below_tau` is engine vocabulary;
   the screen says "the element is gone."

---

## 5c. Visual system (the Screens layer)

Decided 2026-08-22 after a conformance audit found 201 raw-hex paints where a token
existed. The rule that matters: **the design language must hold by binding, not by
coincidence.** A frame that merely looks right is wrong if changing a token wouldn't
move it.

**Tokens** — collection `assay`, 23 variables. Bind every fill and stroke; never raw hex
where a token exists. `accent/primary` was retired: it was ink (`#0E0E0F`), which
collided with `bg/sidebar` and misnamed the real accent. There is exactly one accent now.

| Token | Means |
|---|---|
| `accent/brand` #FF4D00 | the primary action, and counts that need you |
| `semantic/link` #2563EB | links, toggles, and **in-motion** state (building, checking, running) |
| `semantic/success` #16A34A | settled, captured, verified, clean |
| `semantic/warning` #CA8A04 | held, fragile, unconfigured — needs attention, not broken |
| `semantic/danger` #DC2626 | failed, unrecognised, blocked |

Green/amber/blue/red are three *different* meanings from orange, and blue is
specifically progress — without that separation orange does double duty as both "in
flight" and "waiting on you", which are opposite states to the user.

**Type** — Questrial for prose, Roboto Mono for machine tokens (field names, ids,
selectors, hashes, values). Ramp: 28 / 22 / 20 / 16 / 15 / 14 / 13.5 / 13 / 12.5 / 12 /
10.5 / 10. Questrial ships one weight, so hierarchy rides on size, caps-with-tracking and
colour — never weight.

**Geometry** — radii {8 control, 12 card, 16 elevated}; button heights {32 compact, 40
standard, 48 input}; icons {14 inline, 16–18 in controls}; 8px spacing grid.

**Elevation, two tiers** — the file previously mixed both on the same surface class:
- **Floating** — `0 12 48 rgba(0,0,0,.20)` + `0 2 6 rgba(0,0,0,.10)`, no stroke. Dialogs,
  popovers, and cards sitting over imagery.
- **Inline** — 1px `border/default` hairline, no shadow. Content cards on white.

**Icon+label alignment** — align the icon to the label's **cap-height centre**, not its
box centre. A text node's box includes ascender and descender space; centring against it
puts every icon ~1.5–2.25px low, which is invisible at 1× and obvious at 4×.

**Page titles** — every screen carries one except `home`, whose hero headline is its
identity. The sign-in family has no top bar at all (split layout).

### Failure modes this file has actually produced

Check these before declaring a pass clean; each has recurred:

1. **Controls as empty frames with sibling parts.** 14 of 23 buttons have their icon and
   label as siblings, positioned absolutely — `childCount: 0`. Any parent→child audit
   reports them clean. **Detect by bounding-box containment among siblings**, and validate
   the detector against a known-broken node before trusting its output. Two passes
   returned false all-clears this way.
2. **Containers silently invalidated when children grow.** Adding a logo lockup to a form
   left three auth cards too short; a button overflowed by 8px, invisible until zoomed.
   Anything appended to an auto-layout child must trigger a container refit.
3. **Opacity dropped by variable binding.** Put opacity *into* the paint object before
   `setBoundVariableForPaint`; spreading it on afterwards silently loses it and renders a
   tint as a solid fill.
4. **Paint properties lost on rebuild.** Spread the original paint and override `color`;
   rebuilding from `{type, color}` discards `visible:false` and turns hidden icon
   backgrounds into solid squares.
5. **Instances resized without their children.** Check every instance's size against its
   main component.
6. **Lucide glyphs are stroked, not filled** — recolour `strokes`, or the glyph won't move.

---

## 6. Connectors — Claude and Codex

Nothing in the file covers this; it is net-new.

One MCP server, two transports, three install targets. Not two connectors.

- **stdio** → Claude Code (`claude mcp add`) and Codex (`~/.codex/config.toml`). Keys
  stay on the machine, which is the correct BYOK default.
- **HTTP** → the claude.ai remote connector, served as a Next route handler.

**The headline: the agent's inbox is the Decisions screen.** Not "let Claude scrape
things" — every MCP server at this hackathon can scrape things. This one hands an agent
the list of calls a scraper refused to make.

| Tool | Returns |
|---|---|
| `assay_status(scraper?)` | Field states, what is held, what is waiting |
| `assay_decisions(limit?)` | Open items: both answers, evidence, lead, stakes |
| `assay_propose(item_id, candidate_ref)` | **An element reference, never a string.** Scored and gated like any candidate; may return *still holding* |
| `assay_runs(scraper, since?)` | The run log |
| `assay_backfill(field, since?)` | What would be rewritten, and what it would say |
| `assay_explain(proof_id)` | Provenance |
| `assay_watch(url, fields)` | Creates a scraper the same way the goal box does |

**Refused tool: `assay_resolve`.** No model settles a decision. A model nomination
enters as a candidate and clears the same two gates or does not. This is not a policy
choice bolted on — `assay-decision-disagreement` already draws the rule: when the
scorer and the model disagree, *neither wins*. An MCP tool that let the model decide
would contradict a screen that already exists.

**Injection posture.** `AI-AND-AGENTS.md` §1 establishes that the model returns element
references and Assay reads the DOM itself. The connector is where untrusted page text
actually meets a model, so the invariant is enforced there: **no tool on this server
accepts a value.**

`/connect` renders three copy-paste blocks and a live *connected / not seen yet* mark
per client, derived from the last MCP call rather than a saved setting.

---

## 6b. Delivery and keys

**BYOK, two tiers.** Self-host is the real one: keys in `.env.local` or the platform
secret store, no vault, no accounts. The hosted demo needs key entry, so it encrypts at
rest and states the custody plainly rather than reassuringly — *"these keys are
encrypted with a key we hold; for credentials you care about, self-host."* The repo's
voice does not do reassurance, and a security claim is the worst place to start.

The LLM key is **optional**, and the panel should say so louder than anything else on
it: *Assay runs with no model. A model only ever proposes; the gate decides.* No
competitor can put that sentence on a settings screen.

**Storage (track 03).** Postgres plus file/S3 export. One adapter, not an abstraction
layer — a second backend gets written when someone asks for one.

**Email (Resend).** The digest (§4.2) and the break alert are the same object with two
triggers. Email is the delivery path that does not assume the user has adopted a chat
tool. Resend is the provider; the key is the user's own, shown by presence only.

Three rules, so email does not become the weak link in a product about not lying:

- **The sending domain is the user's**, verified in their own Resend account. Assay does
  not send from a shared domain — a deliverability failure on someone else's mail must
  never be able to silence a break alert on this one.
- **One message per break episode per field**, matching F5. An email provider makes it
  trivially easy to send four hundred messages for one template change, and the first
  person who receives four hundred filters the sender forever.
- **The subject line carries the withheld count** — `12 changes, 2 withheld`, never a
  bare change count. The §4.2 header rule applies before the message is opened, because
  the subject is the part most people read.

Design only, decided 2026-08-21. No sender is implemented: there is no run history for
it to read, and a sender with nothing to send is scaffolding.

---


## 7. Defects in the wireframes

Four. The first is serious.

### 7.1 `assay-settings` ships the thing this project attacks

The frame exposes, as global editable settings:

```
CONFIDENCE
  Publish threshold   How much a candidate must look like the original   0.60
  Required lead       How far ahead of the runner-up it must be          0.16
  These were calibrated over 110 threshold pairs, not chosen.
  Lowering them publishes more and holds less.
```

Two separate problems, both fatal to the pitch:

**It is one global knob.** `FEATURES.md` F2 attacks incumbents *by name* for exactly
this — Scrapling's `percentage=40`, Healenium's `score-cap .6`, one number applied
identically to a price and a marketing blurb. One `tau` across fourteen scrapers is
that number. The differentiator was per-field contracts; this screen deletes it.

**It is a loosen-the-threshold button.** `FEATURES.md` §4 refuses this outright, and
the frame's own honest sentence — *"Lowering them publishes more and holds less"* — is
the temptation stated aloud, one click from a slider, on the screen an annoyed person
opens at 2am after a queue they did not want.

The fix keeps the screen and inverts what it does:

- `CONFIDENCE` becomes **read-only**, showing the calibrated values and the sentence
  about 110 pairs. It is provenance, not a control.
- Per-field policy moves to a **tier** — `strict` / `normal` / `loose` — chosen per
  field on `assay-fields`, where the user is already looking at that field's
  reliability. Raw numbers stay settable but undocumented; a user hand-tuning deltas
  is a user we failed.
- The escape hatch is *export this as YAML for your repo*, so policy still lands in a
  PR for anyone self-hosting.

### 7.2 No BYOK key anywhere, for a product that clearly uses a model

`CONNECTIONS` lists Bright Data and Browser. But `assay-agent-fields` reads a page and
proposes a schema, and `assay-decision-disagreement` runs a model against the scorer.
There is no model, no key, and no provider in the settings.

Add an `LLM` row, and make its copy carry the claim nobody else can make:

> **Assay runs with no model.** A model only ever proposes; the gate decides. Leave
> this blank and nothing degrades except field discovery and second-opinion checks.

### 7.3 `Free plan` / `Upgrade` versus open source and BYOK

The sidebar draws a hosted SaaS with tiers. The stated project is open source with
bring-your-own-key. Both can be true — hosted demo plus self-host — but the frames
should say which one the viewer is in, because a judge landing on a demo with an
`Upgrade` button will read the whole thing as a SaaS mock rather than a working
open-source tool. A persistent `demo` marker and a `self-host` link resolve it.

### 7.4 `assay-fields` conflates two datasets

The `1/60` and `0/60 · never delivered` numbers are the Bright Data collector audit
(`tools/audit.js`), which is a genuinely strong story and the correct thing to put on
screen. But the frame presents it as if it were one of the corpus scrapers. Keep the
finding, name its source.

---

## 8. Build order

1. **Quarantine store and the output envelope** (F4, F13). No pixels. Without it,
   `assay-decisions` is a to-do list and both 03 and 07 are undefined.
2. **Run history and episode grouping.** Shared by 03 and 07 — most of either track.
3. **`/decisions`.** The screen the project is judged on.
4. **Home goal box → discovery → field proposal → build.** Track 03's spine.
5. **`assay-run-report` + `assay-quiet`.** Track 03 becomes demonstrable.
6. **MCP server, stdio.** Claude Code and Codex on the same day.
7. **`/compare`.** Track 07 — cheap once step 2 exists.
8. **N-proposer path and the fourth benchmark arm.** Last, because it is the only one
   that can make an accuracy claim and must not make one before it is measured.

Steps 1 and 2 have no pixels and are most of the work.

---

## 9. What was cut

**Track 08 — keyword/search agent.** Cut. The detectors are stateful: expected shape
comes from capture time, the z-score needs history, anchors need a last-known-good run.
A one-shot query has none of these, so there is no baseline, no detection, and nothing
for the gate to gate. A defensible version exists — cross-result consensus, where
twenty results disagreeing about a price is itself grounds to abstain — but it is a
different algorithm, unbuilt and unmeasured.

**Track 06 — docs → RAG.** Parked, not refused. The fit is real: RAG's silent failure
is this project's silent failure, since the chunk containing *"Skip to main content"*
is embedded, retrieved, cited, and answered with. Chunks are cells; a quarantined chunk
is never embedded; a proof id per chunk makes the citation *be* the provenance.
`assay-discovery` (`103:392`) is already most of the crawl half. Parked because the
embed/retrieve pipeline shares nothing with 03 and 07, and the chat app — the visible
half — is the part every other entry already has.

---

## 10. What is not claimed

- **No measurement exists for the model-proposer arm.** Three benchmark arms, none
  uses a model. Until there is a fourth, nothing in `assay-decision-disagreement` may
  be described as more accurate than anything.
- **`assay-runs` demo figures contradict the corpus** — the real replay produced zero
  abstentions. Fix or label; do not ship a number the repo's own data denies.
- **Track 07's break-versus-news separation is only as good as `detect()`**, whose
  blind spots are in `docs/LIMITATIONS.md`. The withheld rate against real competitor
  sites is unmeasured, and if it is high the digest becomes unreadable in a way this
  design does not anticipate.
- **The five-second decision is untested.** F7's rules are reasoned; nobody has timed
  a person against a real card.
- **Hosted-demo key custody is a stated risk, not a solved problem.**

---

- **Deliberate v2 omissions, recorded so they read as decisions:** dark mode (the
  token approach — same tokens, 4–6% surface steps — is specced in
  `design/variants.html`); responsive/mobile; a cmd-K command palette (the best v2
  candidate for a keyboard-first product); timezone display on run timestamps.

## 11. Figma — what to build next

**Board organization (2026-08-21):** `03 · Wireframes` is flow-organized — top-level
sections are the product spine, sub-sections are flows, and a flow is the review unit:
it contains every frame of its journey including loading, error, warning, dialog and
empty states, in click order. A flow with an undefined click is an unfinished flow.


In order. Everything here is an addition to page `03 · Wireframes` or a new
`04 · Components` page.

1. **Component page.** `Hole` first, then `LeadBar`, `AnswerCard`, `OutcomeRow`,
   `StakesLine`, `ProofChip`. The existing frames already contain all of these as
   one-off layers; promoting them is mostly extraction, not design.
2. **`/compare` + the digest** — track 07, the only track with nothing drawn. Default
   view must contain at least one `withheld` row.
3. **`/connect`** — three connector blocks, key rows, the *runs with no model* line.
4. **`assay-settings` v2** — §7.1. Confidence read-only; tiers on `assay-fields`.
5. **Walk-away confirmation** — the beat after *Start watching*.
6. **N-proposer decision card** — one line different from `100:2`.

A frame that exposes a raw threshold as a control, or a user-facing confidence
percentage, has failed review regardless of how it looks.

## 11b. Screens layer — final gate (2026-08-22)

The port from `03 · Wireframes` to `04 · Screens` is complete. 79 frames in 8
sections and 18 flows, zero loose frames on the page. 58 are screens, 4 are
tooltip hover bodies, 10 are loading states, 5 are case-variant regions, and 2
are case key frames. (The 54 recorded here originally was already wrong when
written: `STATES.md` §8 counted 58 screens at the same time.)

| Measure | Result |
|---|---|
| Auto-layout frames | 1112/1177 (94%) |
| Generic layer names (`Frame 12`, `Rectangle 4`) | **0** |
| Text nodes carrying a text style | **1175/1175 (100%)** |
| Solid paints bound to a variable | 2027/2079 (97%) |
| Sidebar / TopBar instances | 50 / 50 |
| Text overlaps | **0** |
| Parent-bounds overflows | 3 (all intentional, below) |

**The three known deviations, each deliberate:**

1. **52 unbound paints** are the logo mark's vector paths (`#FE5D00`, `#C24703`,
   `#F05900`, `#111110`) and the Google glyph. Brand artwork is multi-tone; binding
   it to one token would flatten the shading. Artwork is not a token.
2. **3 overflows** are `mark/hero` on the three sign-in frames — the 3D mark sits
   deliberately above its container and does not clip.
3. **65 non-auto-layout frames** are absolutely-positioned overlays where absolute
   *is* the correct semantic: popovers, dimming scrims, plotted markers on a track,
   and the oscillation crossings on `brake`.

**Two classes of false positive** that a box-intersection test reports and vision
disproves — do not "fix" these:

- FILL-width table cells whose boxes span the row while the text sits left. The
  boxes intersect; the glyphs never do.
- A popover deliberately floating over dimmed rows. Overlap is the design.

The rule that follows: **measurement and vision disagree, and the disagreement is
itself the finding.** Geometry alone reported a clean bill on frames where every
`KeyHint` chip read `1`; vision alone cannot count a 0.75px cap-height drift. Both,
every time.

**Dev-mode contract.** `get_design_context` on a Screens frame returns typed React
components — `Sidebar({active})`, `TopBar({title, status, hasPrimary, …})`,
`Icon({name})`, `ScraperItem({name})` — with colours emitted as
`var(--text-primary, #1a1a1a)` matching `web/app/tokens.css`, the named type ramp
(`body/13.5`, `nav/15`, `mono/value/12.5`), semantic node names (`card/refusal`,
`row/assay_propose`, `cell/tool`), and each component's usage description. A
developer gets components and tokens, not coordinates.

**Shared chrome is invariant.** All 50 sidebars carry the identical scraper list,
corpus-backed and starting `IKEA recalls` (`corpus/ikea`, `mattel`, `chicco` are
real captured pages of really-published recalls). `Contoso` is the synthetic
testbed at `assay-testbed.vercel.app/recalls` used by the setup flow, and belongs
in the topbar title and body copy of those frames — never in the sidebar, which
shows scrapers that already exist.

## Voice bank (copy removed from operational screens, 2026-08-21)

The 34-frame audit found the file's dominant anti-pattern was the product explaining
itself on operational screens (P5, 12 of 23 audited frames). Per the approved
de-densification plan, that copy is removed from the wireframes — but the writing is
good and feeds the landing page and docs. Verbatim, grouped by the frame it came off.

**assay-schedule** — "Assay skips a run when the page has not changed since the last
one. That is why the numbers below do not always line up."

**assay-settings** — "These were calibrated over 110 threshold pairs, not chosen.
Lowering them publishes more and holds less."

**assay-settings-v2** — "Calibrated over 110 threshold pairs, not chosen. These are
not settings — they are what the benchmark produced, and moving them by hand changes
what every number in this product means." · "Never a default, never a zero, never the
second-best guess. There is no setting for that here, and there will not be one." ·
"One threshold for a hazard and a marketing blurb is the mistake every other tool
makes. Tier is chosen per field, on the Fields screen, where you can already see how
reliable that field has been."

**assay-watching-confirmed** — "I have a baseline for all six fields — what each one
looks like when it is right. I check the page every six hours. If a field stops
looking like itself, I hold it rather than write a value I cannot justify, and it
turns up under Decisions." · "Nothing is published until the first clean run. If the
first one is not clean, it waits for you instead."

**assay-incident-record** — "A record that only lists what we fixed would be
marketing. The refusals are the part worth reading." · "The 1,204 suspect rows are
the honest part of this report. We know those runs did not error and did not come
back empty. We do not know that they were right, so we are telling you they are
unverified rather than counting them as clean."

**assay-email** — "Bring your own Resend key — this is your account, your domain and
your sending limits. Self-hosting? Put it in the environment and this panel just
reports that it is there." · "A clean run sends nothing. If Assay emailed you when
things were fine, you would filter it, and then the one that mattered would be
filtered too."

**assay-connect-email** — "Subject lines carry the withheld count. '12 changes, 2
withheld' — never a bare change count. The subject is the part most people read, so
the number that would be a lie in the body is a lie there first."

**assay-fields** — "That mismatch is the reason this project exists."

**assay-compare** — "A field I am holding never appears as a change. A hole is not a
diff, and reporting one as 'no change' would be the same silent error this product
exists to prevent."

**assay-decision-proposers** — "Two of the three agreed. That is not a majority I act
on — the scorer and the label anchor are both reading the page's structure, so when
the structure moves they are wrong together. A vote between methods that share a
blind spot is one method wearing three hats."

**assay-connect** — "A model nominates an element and it is scored against the same
fingerprint as everything else. If it does not clear the gate, the field stays held.
assay_propose takes a reference to a node, never a string — so nothing written on a
page can become a value in your data."

**assay-decide-once** — "A decision never leaks across templates. If I cannot prove
two pages are the same shape, I ask twice."

**assay-blocked** (frame pending redesign) — "A challenge page is full of elements,
and some of them score well against a fingerprint. A healer that treats a block like
a break will happily relocate your price field onto a captcha, publish it, and report
the run as successful. Then it does it again tomorrow, and the fingerprint it learned
is the captcha's." · "So a block never enters the decisions queue and never moves a
selector. It is a different problem with a different owner."

**assay-alert** (frame pending redesign) — "THE TWO RULES THAT DECIDE WHETHER THIS IS
LOVED OR MUTED" · "A template change that breaks 400 pages sends one message with a
count, not 400 messages. The episode closes by itself when the field goes green
again." · "The body is the diagnosis, not a summary of it. Every sentence above comes
from what the detector actually measured. No model writes this text. A fluent
narrator would eventually produce a cause that contradicts the evidence, and the
reader would believe the fluent one." · "A blocked request is not a break and never
sends this message. It goes to whoever owns the proxy budget instead."

**assay-fragility** (frame pending redesign) — "Read this on the day you adopt a
scraper, and again after the site is redesigned. It is about how a field is
identified, not whether it is working right now — every field below is working right
now." · "There is no score here on purpose. A number out of 100 would tell you that
hazard is a 62 and leave you to work out what to do about it. A sentence tells you
what is holding the field up and what would knock it over."

**assay-brake** (frame pending redesign) — "A one-click resume is how this feature
gets clicked past at 2am. Typing it is the point." · "Every other healer overwrites
the old fingerprint when it heals, so there is nothing to roll back to. Keeping the
old capture is what makes this button possible at all."

**assay-empty** (frame pending redesign) — "An empty queue on top of 312 held cells
would be the easiest lie in this product to ship by accident." · "No sample data, no
demo scraper, no onboarding tour. The first thing you see is the thing you came to do."

---

## Voice bank, second pass (`04 · Screens`, 2026-08-22)

The wireframe sweep above cleaned `03 · Wireframes`. The ported Screens carried the
same register forward and grew more of it, so all 62 frames were re-read sentence by
sentence against one question: **does this sentence carry information, or comfort?
Comfort goes.** 30 nodes removed, 14 trimmed to the fact they contained. The rest of
what came off duplicated lines already banked above (the connect intro, the
`assay_propose` paragraph, the 400-pages episode rule) and is not repeated here.

**decisions** (6 frames carried this verbatim) — "Assay was not sure enough to publish
these, so it left them alone and saved them for you. Nothing here has been written to
your data." · (3 frames) "Everything else went through on its own. 10 clean runs since
Tuesday, nothing published in error."

**home** — "Assay now knows what each field looks like, so it can tell a change from a
break." · "Every route shows this same state […] never an empty table pretending to be
a quiet day."

**watching-confirmed** (twice, two frames) — "You will only hear from me when something
needs you."

**run-report · in progress** — "Nothing is written until every field settles." (trimmed;
"Started 40 seconds ago." kept — it is the state.)

**blocked** — "Nothing was written this run." (trimmed; "Last good values, exactly where
they were." kept.)

**compare** — "Nothing was written, and…" (trimmed; "…no diff was reported for it either
way" kept — the silence is the thing the user needs explained.)

**decide-once / templates** — "Both templates are the same objects […]" · the focus-ring
design note ("focus ring = keyboard position…").

Four sentences in this register were **kept deliberately**, and the conformance rule is
narrowed so it does not flag them: where a pasted key goes (`connect` — "Keys stay on
your machine. Nothing is sent to us."), that the undo window is still open
(`decide-once`), that a downed store cost no data (`runs · store unreachable`), and the
frozen-capture line on `decisions`. Each answers a question the user is actually asking
at that moment. Comfort that arrives unasked is what came out.

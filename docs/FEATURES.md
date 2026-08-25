# Assay — Feature specification

Written from the user's side of the glass. Nothing here is a metric, a benchmark arm, or a way to
measure the engine. The engine is finished; this is what a person does with it.

**Product in one line:** the scraper withholds the cell it isn't sure about, tells you which rows
that affects, and asks you exactly one answerable question.

**The user:** not the author. The inheritor. They own a collector someone else wrote, six months
after that someone left. They are not paged by crashes — crashes are the good day. Their bad day is
a Slack message from a customer that reads *"this price looks wrong"*, followed by four hours of
discovering the data has been quietly wrong since the 9th and having no idea how far back to retract.

**Design axiom:** every feature below either prevents that message, shortens the four hours, or
lets them answer the message with a link instead of an apology. A feature that does none of the
three is cut.

---

## 1. Jobs to be done

Ranked by pain removed, not by how impressive they are to build. Phrased the way the user says it.

| # | The job, in their words | Pain removed | Frequency | Served by |
|---|---|---|---|---|
| 1 | *"Don't publish a number you aren't sure about. I would rather have a hole than a lie."* | Catastrophic. A hole is a ticket; a wrong price is a refund, a bad model, a recall that never went out | Every silent break | Quarantine (F4) |
| 2 | *"Something's wrong — tell me exactly which rows, across which runs, and how far back."* | Turns an 11-day forensic dig into a 20-minute retraction | Every incident | Blast Radius (F6) |
| 3 | *"Tell me it broke before my customer does."* | Removes the discovery lag entirely — the part that makes the incident embarrassing rather than routine | Weekly-ish | Drift Watch (F3), Diagnosis Alert (F5) |
| 4 | *"When you genuinely can't tell, ask me — but make it a question I can answer in five seconds without opening the site."* | Converts an abstain from a stall into a resolved decision. Without this, refusal is just a slower failure | Per ambiguous break | Abstain Queue (F7), Decide Once (F8) |
| 5 | *"Fix the boring ones without waking me. A class got renamed; I don't need to be involved."* | **No longer served by this build.** The runtime gate that did this (`healGated`) is retired — see §2.4 — every break now quarantines and recovery is Bright Data's collector repair, a human-approved, out-of-band flow, not a same-run auto-fix | Most breaks | — |
| 6 | *"Where did this number come from?"* — asked about one cell, months later, usually by someone else | Ends the "I'll have to look into it" answer that costs a day and buys no trust | Per dispute | Cell Provenance (F12) |
| 7 | *"Price must never be wrong. The description can be fuzzy. Stop treating them the same."* | Stops the single global threshold from being simultaneously too twitchy and too loose | Set once, felt daily | Field Contracts (F2) |
| 8 | *"Warn me it's about to break, while I still have a calm Tuesday."* | Moves work from incident-time to maintenance-time. 10x cheaper hour for hour | Monthly | Fragility Report (F1) |
| 9 | *"Let me prove to my customer/auditor that this number is right, without writing an essay."* | Converts a trust problem into a link | Per escalation | Incident Record (F14), Trust Envelope (F13) |
| 10 | *"Tell me when I should stop patching this and go renegotiate with the source."* | **Retired** — see §2.4. Nothing in the live pipeline patches on its own anymore, so there is nothing left to tell you to stop | Rare, expensive | — |

Jobs 1 and 2 are the product. 3–5 make it usable. 6–10 make it keepable.

---

## 2. Feature inventory

Legend for **Engine**: **✓** the engine already does this, only a surface is missing · **~** partial,
the primitive exists but something must be built on it · **✦** genuinely new capability.

### 2.1 Before it breaks

#### F1 — Fragility Report

| | |
|---|---|
| **Job** | 8 — *"warn me while I still have a calm Tuesday"* |
| **What the user does** | Runs it on adoption day and after every site redesign. Gets a list of fields ordered by *how much of their identity is build-generated garbage*. For each, one suggested action: adopt a stabler anchor, add a second value location, or accept the risk. Clicking accept writes a line into the field contract so it stops nagging. |
| **Why it beats status quo** | The status quo is finding out. Every other tool's first signal is a null. `fingerprint()` already knows that IKEA's `s1gshh7t` and `_title_185nw_73` are compiler output and that a CMS GUID id is worthless — that knowledge is currently spent only at heal time, when it is too late to be advice. |
| **Engine** | **~** — `isVolatileClass`/`isVolatileId`, `classes_dropped`, `classes_stable`, `testid`, `role`, `heading_path` all exist per field. New: roll them into a per-field grade, and a suggestion ("this field also appears in JSON-LD; pin it as a second location"). |

The report is not a score out of 100. It is a sentence per field: *"`price` is identified mainly by
two build-hashed classes and an absolute XPath. It has no label, no role, and no second value
location. The next deploy will probably move it."*

#### F2 — Field Contracts

| | |
|---|---|
| **Job** | 7, 5 — *"price must never be wrong, description can be fuzzy"* |
| **What the user does** | Edits one file, checked into their repo, reviewed in a PR like any other config. Per field: a policy tier, what happens on abstain, who gets told, and how much autonomy the engine is granted. |
| **Why it beats status quo** | Every competitor has one global knob (Scrapling's `percentage=40`, Healenium's `score-cap .6`) applied identically to a price and a marketing blurb. One threshold cannot be right for both: tight enough for money means the description field pages you weekly; loose enough for prose means money is wrong. |
| **Engine** | **~** — `healGated()` already takes `tau`/`delta` per call, so per-field thresholds are plumbing. New: the tiers, the on-abstain behaviour, and per-field autonomy bands. |

```yaml
fields:
  price:
    policy: strict          # tau/delta from the strict tier
    on_abstain: quarantine  # hold the row, publish nothing for this cell
    auto_approve: never     # even a clear margin queues for a human
    alert: pagerduty
  recall_title:
    policy: strict
    on_abstain: quarantine
    auto_approve: clear_margin   # benign ties and clear margins go through unattended
    alert: slack#data-oncall
  description:
    policy: loose
    on_abstain: publish_last_good   # stale prose beats a hole
    auto_approve: clear_margin
    alert: none
```

Three tiers only — `strict`, `normal`, `loose`. Raw `tau`/`delta` numbers are settable but
undocumented; a user who is hand-tuning deltas per field is a user we have failed.

`auto_approve` is how autonomy is *granted*, field by field, rather than assumed. It reads the gate's
own reason codes (`clear_margin`, `benign_tie`), so the config speaks the same vocabulary as the
proof record.

#### F3 — Drift Watch

| | |
|---|---|
| **Job** | 3 — *"tell me before my customer does"* |
| **What the user does** | Nothing, until an amber notice arrives: *"ikea/product: the label anchor and the CSS anchor stopped agreeing on 6% of pages. Nothing has broken. The skeleton hash moved on those pages only."* They now have days, not minutes. |
| **Why it beats status quo** | This catches the gradual rollout — 5% of pages get the new template, null rate creeps too slowly to trip anything, and one Tuesday everything is broken at once. Null-rate alarms cannot see it by construction. Multi-anchor disagreement can, because on the new pages two anchors return *different non-null things*. |
| **Engine** | **✓ (only since wave 2)** — `detect()` evaluates all anchors every run and emits `anchors_died`; `skeletonHash()` separates template change from content change. New: treating disagreement-without-breakage as a standing warning state rather than a discarded signal. |

> **This row read `✓` for the whole of wave 1 and was not true.** The second
> anchor is an `abs_xpath` converted to CSS, and the conversion left the `/`
> separators in place — `html:nth-of-type(1)/body:nth-of-type(1)/…` is not a CSS
> selector. css-select does not throw on it, it matches nothing, so the xpath
> anchor read `null` on every page and `anchors_disagree` had **never once
> fired**. Measured on the committed corpus: **0 of 77 pages** resolved a second
> anchor. Fixed in wave 2 (`/` → child combinator); the same measurement now
> resolves **15 of 77**, of which 5 disagree with the CSS anchor. Two anchors
> are the whole mechanism of this feature, and until wave 2 there was only ever
> one.

Drift is a **state on a field**, not an event. It clears itself when the anchors re-agree, which
happens often (a partial rollout that gets reverted). It never pages. If drift could page, people
would mute it, and then it is worth nothing.

### 2.2 When it breaks

#### F4 — Quarantine ⭐

| | |
|---|---|
| **Job** | 1 — *"a hole beats a lie"* |
| **What the user does** | At break time: nothing. That is the entire point. The suspect cells do not appear in the published output; they appear in a held set with a reason attached. Later, they either approve the held rows (after resolving the queue item) or discard them. |
| **Why it beats status quo** | The engine already refuses. Without quarantine, that refusal is a line in a JSONL file nobody reads while the wrong number ships anyway. Quarantine is the only feature that changes what the *customer* sees. It is also the one that makes the eleven-day disaster structurally impossible: the bad rows never left the building. |
| **Engine** | **✦** — the decision exists (`decision: "abstain"`), the output boundary does not. Needs a held-rows store and a publish step that consults it. |

Quarantine is **per cell, not per row**. A held price does not withhold the product name. The row
publishes with a hole and a status, and the consumer's code can branch on that hole (see F13). A
system that drops the whole row to protect one field will be turned off within a week.

Rules:
- Never substitute. No default, no zero, no coercion, no last-good silently swapped in unless the
  field contract explicitly says `publish_last_good` — and then it is labelled `stale`.
- A held cell has a reason from the engine's own vocabulary (`thin_margin`, `below_tau`,
  `shape_mismatch`, `anchors_died`), not a generic "error".
- Holding is bounded by the field contract. `price` may be held indefinitely. A field nobody reads
  should not accumulate a million held rows; it releases as `stale` after its max age.

#### F5 — Diagnosis Alert

| | |
|---|---|
| **Job** | 3 — *"tell me what happened, not that something happened"* |
| **What the user does** | Reads one message and knows whether to open the queue, restart a proxy, or ignore it. |
| **Why it beats status quo** | The status quo alert is `job 4471 failed` or, worse, nothing at all. `detect()` already returns a diagnosis *string* rather than a boolean — *"price null in 94% of rows since run 41; title unaffected; skeleton hash changed"* — and an attributed cause. That string is the alert body. |
| **Engine** | **✓** for content, **~** for delivery — needs episode grouping and routing. |

Two behaviours that decide whether this feature is loved or muted:

1. **One alert per break episode per field.** A template change that breaks 400 pages sends one
   message with a count, not 400 messages. The episode closes when the field returns to green.
2. **Cause attribution routes the alert.** `attributed_cause` already distinguishes a selector break
   from a blocked request or a soft-404. A block is not a break: it goes to whoever owns the proxy
   budget, it never enters the abstain queue, and it must never trigger a heal. Healing a selector
   because the site returned a captcha page is how a healer teaches itself to extract captchas.

#### F6 — Blast Radius ⭐

| | |
|---|---|
| **Job** | 2 — *"which rows, how far back"* |
| **What the user does** | Asks one question — from the alert, the queue item, or the CLI — and gets three things: **the first bad run**, **the row IDs**, and **a retraction list** they can hand to the warehouse. |
| **Why it beats status quo** | The status quo is a SQL archaeology session with no ground truth, which is why people retract far too much (destroying good data and trust) or far too little (leaving the lie in place). Nobody offers this because nobody records what "good" looked like per field per run. |
| **Engine** | **~** — the run log records per-field status, anchor agreement and value per run; `detect()` can re-evaluate any historical value against its captured shape. New: the backward walk and the row-ID join. |

How the boundary is found — and stated to the user honestly:

```
$ assay blast ikea/price --since-break
first clean run   : 41   (2026-08-04)  value matched shape, 5/5 anchors agreed
first suspect run : 42   (2026-08-05)  value matched shape, 3/5 anchors agreed  <- boundary
break detected    : 48   (2026-08-11)
suspect rows      : 4,113 across runs 42-48
confidence        : anchor disagreement, not proof. Runs 42-47 published values
                    that LOOK like prices. They may be the wrong price.
retraction list   : results/blast/ikea-price-42-48.csv
```

The eleven-day gap between the boundary and the detection *is* the disaster, drawn as one line. The
honest caveat is mandatory: for `shape_mismatch` breaks we know the values were wrong; for
`anchors_died` we know only that they became untrustworthy. Overstating this would make the tool
exactly as unreliable as the thing it replaces.

### 2.3 Deciding

#### F7 — The Abstain Queue ⭐

| | |
|---|---|
| **Job** | 4 — *"ask me a question I can answer in five seconds"* |
| **What the user does** | Opens an inbox of *"I did not answer. You decide."* Resolves items with the keyboard. Leaves when it is empty. |
| **Why it beats status quo** | No competitor ships this, because no competitor abstains — Scrapling returns its argmax, COLOR "suggested fixes for all captured broken locators", Skyvern turns a missing integer into `0`. The queue is the visible half of the only genuinely differentiated behaviour in the system. |
| **Engine** | **✓** for content — every abstain already emits a proof record with candidates, scores, margin, thresholds, diagnosis and the frozen golden HTML hash. **✦** for the queue itself. |

**What makes an item resolvable in five seconds.** This is the hard design problem in the product,
so it gets rules rather than a mockup:

| Rule | Why |
|---|---|
| **Show values, never selectors.** *"Which of these is the price? **$49.99** or **$69.99**"* — with each candidate's label text, neighbours and heading path underneath | `span.pdp-price__was` is not evidence to a human. The user does not know this site; a selector string asks them to learn it |
| **Show last week's answer, prominently.** *"On run 47 this field said $49.99"* | This is the single most decisive fact and it resolves the majority of items on its own. It is already in `before.value` |
| **Two choices, or none.** If there are five plausible candidates, the correct behaviour is to stay quarantined and escalate — not to render a quiz | A five-way multiple-choice under time pressure reproduces the false-heal problem inside a human being |
| **State the stakes on the card.** *"Decides 412 held rows across 3 runs"* | Makes speed rational and makes triage order obvious. Sort the queue by rows held, never by age |
| **Render the frozen page inline.** The golden HTML is captured and hashed; show it with both candidates highlighted | Requiring the user to open the live site defeats the whole thing: the live site has changed again since, and it may be behind a login |
| **Third button, always legitimate: "I can't tell."** It stays quarantined, escalates by the field contract, and is recorded as a *resolution*, not a skip | If the only way to empty the queue is to guess, we have rebuilt false healing with a slower processor. Refusal has to be available to the human too, or the product's thesis stops at the API boundary |
| **Keyboard only: `1`, `2`, `N`.** No mouse, no confirmation dialog, undo instead | Five seconds does not survive a modal |
| **No selector editing.** Ever | See anti-features |

The margin bar — #1 and #2 scores side by side with the gap drawn between them — belongs on this
card as the *justification*, not the question. It explains why the machine is asking. It is not
what the user answers.

#### F8 — Decide Once

| | |
|---|---|
| **Job** | 4 — the part that makes the queue survivable |
| **What the user does** | Answers one card. A banner says *"applied to 340 other items on the same template."* |
| **Why it beats status quo** | A template change produces one *decision* and thousands of *instances*. A queue that shows a thousand identical cards is not an inbox, it is a punishment, and it will be bulk-approved unread within two days — which is worse than no queue. |
| **Engine** | **~** — `skeletonHash()` already groups pages by template, and the winning candidate's fingerprint gives the second key. New: the grouping and the write-back. |

Grouping key: `skeleton_hash + field + winning candidate fingerprint shape`. The user's answer is
appended as a **new capture** — never an overwrite. This is deliberate and it is where Scrapling
fails: `auto_save=True` writes the relocated element back over the stored fingerprint with
`INSERT OR REPLACE`, so one wrong match silently becomes ground truth and every later relocation
drifts from it. Append-only is what makes F10 possible at all.

Items in a group that do *not* match the key stay queued individually. A decision never leaks across
templates.

### 2.4 Recovering

#### F9 — Retraction & Backfill

| | |
|---|---|
| **Job** | 2, after the decision |
| **What the user does** | Takes the blast-radius list and does one of: re-scrape those rows against the corrected locator, mark them retracted downstream, or discard. From the CLI, or as a webhook the warehouse consumes. |
| **Why it beats status quo** | Manual, partial, and usually a guess with a `WHERE created_at > ...` in it. |
| **Engine** | **~** — replay over stored captures exists as a tool; the row-ID join and the corrected-version output are new. |

Corrections are **published as a new version, never a mutation in place**. Anyone who already
consumed the wrong value needs to be able to see that it changed, and what it changed from.
Silently repairing history is how you make a second, worse incident out of the first one.

#### F10 — Unheal (retired)

| | |
|---|---|
| **Job** | 1, in reverse — *"that fix was wrong"* |
| **What it did** | `assay unheal ikea/price --run 48`. The field reverted to the last capture verified good, the heal was marked wrong in the record, and blast radius automatically re-opened from the heal date forward. |
| **Engine** | **retired** — `src/brake/index.ts` and its wiring are deleted. |

Retired along with F11 below, for the same reason: both existed to manage `healGated`'s own
runtime candidate-healer, and `healGated` is gone (`src/runner.ts`'s header) -- Bright Data's
collector repair is the only recovery path now, and it is a separate, human-approved, out-of-band
flow (`tools/bd-heal.ts`) neither of these features had any part in. Historical `heal_history` rows
from before the removal stay in Postgres, unread by the app; nothing was deleted from the database.

#### F11 — Hostile Site Brake (retired)

| | |
|---|---|
| **Job** | 10 — *"tell me when to stop patching"* |
| **What it did** | Detected a field oscillating between two selectors within a 14-day window and stopped healing it: *"`price` on ikea has healed 4 times in 9 days and twice reverted to a previous selector. This is A/B testing, not breakage. Healing is disabled for this field until you say otherwise."* |
| **Engine** | **retired** — `src/brake/index.ts` and its wiring are deleted. |

The brake existed to catch a self-healer quietly publishing from the wrong A/B variant forever.
With no runtime healer left to trip it, there is nothing for it to watch.

### 2.5 Proving trust to someone else

#### F12 — Cell Provenance

| | |
|---|---|
| **Job** | 6 — *"where did this number come from?"* |
| **What the user does** | Takes any value from the output — a cell in a CSV, a field in a JSON row, six months old — and asks. Gets: which selector produced it, which anchors agreed at the time, which capture it was matched against, the `golden_sha256` of the frozen page, whether the field had been healed and under whose decision, and the run and timestamp. |
| **Why it beats status quo** | The status quo answer is *"the scraper"*, followed by a day of log spelunking that usually ends in a shrug. Field-level provenance **does** now exist elsewhere — Parallel's `Basis` returns per-field citations, excerpts, reasoning and a calibrated confidence, and Diffbot's Knowledge Graph carries `confidence` with `explicitOrigin`. (An earlier version of this row claimed it did not exist anywhere, and cited zero hits for `confidence` in Zyte's reference; Zyte's field is called `probability` and is mandatory on every extracted item. The search was for the wrong word.) What none of them does is **withhold the value**: every one returns its best guess with a label attached. Assay's provenance answers a question the others cannot — *why is this cell empty* — because it is the only one with a cell that is empty on purpose. |
| **Engine** | **~** — the run log and proof record contain every element of the answer. The missing piece is the join: every published row must carry a proof ID so the output can be walked backwards. |

The proof ID is a column on the output. It is ugly and it is the whole feature. Without it,
provenance is a promise; with it, it is a lookup.

#### F13 — Trust Envelope

| | |
|---|---|
| **Job** | 1 + 9 — refusal has to survive contact with downstream systems |
| **What the user does** | Nothing manually. Their consuming code reads a per-field status alongside each value and branches: `live`, `stale`, `healed`, `degraded`, `quarantined`. Their dashboard renders a hole as a hole. Their pricing model skips the row instead of ingesting a null as zero. |
| **Why it beats status quo** | A refusal that is only visible in our UI is not a refusal — it is a wrong number with a footnote somewhere else. Firecrawl's `normalizeSchema` marks every property required with `strictJsonSchema: true`, making abstention structurally impossible to express; Skyvern's `_TYPE_DEFAULT_FACTORIES` turns a declined integer into `0`, indistinguishable downstream from a real zero. The envelope is the fix for that entire class of failure. |
| **Engine** | **✦** — an output format decision, not an algorithm. |

```json
{
  "url": "https://…",
  "recall_title": "Fisher-Price Rock 'n Play Sleeper",
  "price": null,
  "_assay": {
    "run": 48,
    "proof": "pr_9f21c4",
    "fields": {
      "recall_title": {"status": "live"},
      "price": {"status": "quarantined", "reason": "thin_margin", "held_since_run": 48}
    }
  }
}
```

Two hard rules: a quarantined field is `null` *and* labelled — never omitted (an absent key is
indistinguishable from a schema change), and never filled. And the envelope ships in every format we
emit, including CSV, where it becomes `price_status` columns. Ugly beats ambiguous.

#### F14 — Incident Record

| | |
|---|---|
| **Job** | 9 — *"prove it to my customer without writing an essay"* |
| **What the user does** | Runs one command against a closed break episode and gets a single page they can send: what broke, when, what we did, what was held, what was retracted, what is still suspect, and who decided. |
| **Why it beats status quo** | The status quo is the user writing that email by hand, from memory, at 6pm, and being wrong about the dates. |
| **Engine** | **✓** — this is pure composition over proof records already emitted for heals *and* abstains. Nearly free. |

The record must include the refusals. A document that only reports what the system fixed is
marketing. The line *"we held 412 prices for 6 hours rather than publish a number we could not
justify, and here is the one we could not decide"* is the strongest sentence this product can hand
a customer, and it only exists because the abstains were recorded with the same rigour as the heals.

---

## 3. The one feature that defines the product

**Quarantine (F4).**

Not the abstain queue — though the queue is the more novel-looking feature and the better demo. The
argument:

1. **The engine's refusal is currently unobservable where it matters.** `healGated()` already returns
   `decision: "abstain"` with a reason. Today that lands in a JSONL file. Meanwhile the pipeline
   publishes whatever it has, so the refusal changes nothing that any human or downstream system
   experiences. Quarantine is the single feature that connects the engine's thesis to the customer's
   reality. Everything else is upstream of publication (finding out) or downstream of it (cleaning
   up). Quarantine is *at* publication, which is the only moment the user's bad day is actually
   decided.

2. **It is the only feature that prevents the bad day rather than shortening it.** Blast Radius turns
   eleven days into twenty minutes — excellent, and still an incident with a customer email in it.
   Quarantine makes the eleven days zero, because the wrong values were never published. Prevention
   beats forensics whenever it is available, and here it is available.

3. **It gives the abstain queue its stakes, not the other way round.** A queue of decisions with no
   consequence is a backlog; it will be ignored, then bulk-approved, then deleted. A queue whose
   items are *holding real data out of production* gets worked, because not working it costs
   something visible. Build the queue first and you get a to-do list nobody opens. Build quarantine
   first and the queue becomes inevitable — the user will demand it as the release valve.

4. **It is shippable alone and coherent alone.** Minimum viable Assay: on abstain or on an
   unresolved detect, hold the cell, publish a labelled hole, log the reason. That is a complete,
   defensible product with no UI at all. Nothing else on this list is a product by itself — Blast
   Radius without quarantine is a better shovel for the same grave; the queue without quarantine is
   a form; provenance without quarantine explains a wrong number very precisely.

If only one ships, ship the hole in the data. The hole is the product.

---

## 4. Anti-features

Things a reasonable, competent person would build, that we should refuse.

| Refused | Why |
|---|---|
| **A confidence percentage on every cell** | A float invites every downstream team to pick its own threshold, which relocates the abstain decision to whoever cares least about it — and 0.94 on everything trains people to ignore the column. Ship a small closed set of states (`live`/`stale`/`healed`/`degraded`/`quarantined`). The gate already made the decision; exporting the raw score asks the user to make it again with less information. **Partially overturned 2026-08-23** — one thing is now shown and one thing only: a **band word** from a closed set of seven (`CLEAR`/`AGREED`/`THIN`/`WEAK`/`GONE`/`POLICY`/`BRAKED`), drawn only where the gate reached a decision, derived from `field_runs.reason` and never recomputed from the numbers. Still refused, in full: a float, a percentage, a bar, a gauge, a ring, a per-cell score, and anything added to the published envelope or the proof record — the band is a rendering, not a field. The three objections above still hold and are what the band's shape answers: **(1)** a word from a closed set has nothing to re-threshold, so the decision stays where the evidence is; **(2)** it is not on every cell — it appears only on a gate decision, and four of the seven words mean *this is waiting on you*, so it cannot become the always-0.94 column; **(3)** it reports the gate's conclusion rather than handing back the evidence, and beside a `THIN` refusal the screen shows the two rival **values** — the half of the evidence a person can actually judge — instead of the scores, which are the half they cannot. The arithmetic is not hidden, it is *relocated*: `/docs/assay-score` states the gate, both thresholds, the shipped 0.60/0.16 and their derivation, and the measured 0.0% wrong / 35.3% abstained. **Amended the same day, to a hybrid** — the numbers are now *reachable* from the cell they decided, behind one collapsed `show the numbers ›` (`web/components/disclosure.tsx`, `GateNumbers`), on the run page's gate section and on a held proof. Nothing about the band changes: it is still the interface, still what is drawn, scanned, and carried by a screenshot, and there is still no float in a column, on a cell, in the published envelope or in the proof record. What the amendment concedes is narrower: the proof story is *here is exactly what I weighed*, and a proof that cannot produce the two numbers its own comparison was made between is asking to be taken on trust — which is the one thing this product refuses to ask for. Relocating the arithmetic to a document satisfied nobody standing in front of the cell. The three objections still hold and the *collapse* is what answers them: **(1)** a number behind a click is not a column anyone can re-threshold at a glance — a reader has to ask for it, one cell at a time; **(2)** it is not on every cell, because `field_runs.ranked` is written at abstain time only, so it exists exactly where the gate refused; **(3)** it never arrives as a bare float — the disclosure carries the top score, the runner-up, the margin and the two thresholds together, and says whether those thresholds were declared on the contract or defaulted. And it withholds: when the recovered scores no longer reproduce the recorded reason the contract has been edited since, so `gateCheck` (`web/lib/run-flow.ts`) is consulted and the thresholds are *not* drawn against the scores. Still refused, unchanged: a percentage, a bar, a gauge, a ring, a per-cell score, a score column, and anything added to the envelope or the proof record. See `/docs/assay-score` and `src/reports/assay-score.ts` |
| **A visual selector picker / rule builder in the queue** | We are not a scraper IDE, and the moment a user hand-writes a selector we own the consequences of their guess with none of the verification. The queue's job is choosing between candidates the engine already found and scored. If neither candidate is right, the answer is "I can't tell" and an escalation, not a text box |
| **An LLM that explains the break in natural language** | `detect()` already emits a deterministic English diagnosis derived from the actual signals. Wrapping it in a generative narrator adds fluency and subtracts accountability: it will eventually produce a fluent cause that contradicts `attributed_cause`, and the user will believe the fluent one |
| **Any silent fallback that keeps the row shape** | Type defaults, "closest match", coercion, quietly reading the second-best candidate. This is the exact failure we exist to name: a required integer becoming `0` is indistinguishable downstream from a genuine zero. There is no configuration flag for this. Not a setting — an absence |
| **A "loosen this threshold" button inside the alert** | Thresholds change by editing the field contract, in a PR, with a reviewer. Letting an annoyed person widen a tolerance at 2am from inside the notification that annoyed them is how every alerting system dies. Same reason you don't clear a smoke alarm by removing its battery from the app |
| **Auto-approve-everything mode** | Autonomy is granted per field, in bands, in the contract. A global "just fix things" switch is the feature that makes us identical to the incumbents, and it is the switch every incumbent defaults to on |
| **A fleet dashboard: uptime tiles, health gauges, SLA rings** | This is the measurement trap wearing a UI. It is also, as a product, somebody else's. Nobody's bad day is improved by a gauge; it is improved by knowing which 4,113 rows to retract. **Partially overturned 2026-08-21** — the gauges refusal stands, the need does not: an unattended run needs a morning read. Ships as the Night Report, a log with no gauge, ring or percentage on it. See `docs/APP-DESIGN.md` §1 |
| **RBAC, approval workflows, comment threads on queue items** | One owner, one decision, undo. Add the second person when a real team actually shares a queue and complains — not before |
| **Scheduling and orchestration** | Bright Data runs the collectors. Becoming a job runner adds an on-call rotation and a class of failure that has nothing to do with our thesis. **Overturned 2026-08-21** — a product you walk away from must state its own cadence. Assay owns the schedule as declared state; it still does not execute the job. See `docs/APP-DESIGN.md` §1 |
| **A notification bell/inbox** | Alerts are push and the Decisions badge already counts exactly what needs you. A second in-app inbox accumulates things-you-already-know, trains clearing behaviour, and is the fleet dashboard arriving through an icon |
| **A user-facing probe transcript** | The sandboxed probe is a fine internal tie-breaker for thin margins, but "here is the experiment the robot ran on the page" is not something a user *operates* — it is something they read once and never again. Feed its outcome into the queue card as one line of justification. Do not build a screen for it |

Also cut, from earlier thinking: heal-history timeline visualisations, per-site scoreboards,
severity levels beyond the three states, and any onboarding wizard. The Fragility Report *is* the
onboarding.

---

## 5. Feature-to-surface map

Principles: **config lives in the repo** (diffable, reviewable, revertable — thresholds are code);
**alerts are push, never a page you must remember to visit**; **the CLI is the primary surface**
because the user already lives in a terminal and the output must pipe into their warehouse; and
**only two things earn pixels** — both are comparisons a human makes under time pressure, and both
are unreadable as text.

| # | Feature | Primary surface | Also | Notes |
|---|---|---|---|---|
| F1 | Fragility Report | CLI (`assay fragility`) | Markdown export | Read once per quarter. A screen would be a screen nobody opens |
| F2 | Field Contracts | Config file in repo | Read-only viewer in the app | Never a settings *editor*. A settings UI has no diff, no review, no revert. Credentials get pixels, policy gets a PR — `docs/APP-DESIGN.md` §1 |
| F3 | Drift Watch | Webhook / chat message | CLI status | Amber only. Never pages |
| F4 | **Quarantine** | Output envelope + storage | CLI (`assay held`), count badge in queue | The feature is mostly invisible, which is correct — its visible half is F13 |
| F5 | Diagnosis Alert | Webhook (Slack/PagerDuty by contract) | — | Body is the diagnosis string. One per episode |
| F6 | **Blast Radius** | CLI (`assay blast`) + **UI** | CSV/webhook retraction list | The UI half is a timeline: last clean run, boundary, detection, rows held. This one earns a screen because the shape of the gap is the insight |
| F7 | **Abstain Queue** | **UI** | CLI (`assay queue --json`) for automation | The one screen the product is judged on. Keyboard-first |
| F8 | Decide Once | Inside the queue card | — | Not its own surface — a banner and a count |
| F9 | Retraction & Backfill | CLI | Webhook to warehouse | Piping into their systems matters more than rendering it in ours |
| F10 | Unheal | — | — | **Retired** — see §2.4. `healGated`, the runtime healer it reverted, is gone |
| F11 | Hostile Site Brake | — | — | **Retired** — see §2.4. Nothing left in the live pipeline to trip it |
| F12 | Cell Provenance | CLI (`assay explain <proof_id>`) | JSON API | Usually consumed by a script or pasted into a ticket, not browsed |
| F13 | Trust Envelope | Output format | — | Not a feature you look at. A contract your code reads |
| F14 | Incident Record | CLI generates a single static HTML/MD file | — | The artefact is a *file the user sends someone*. Hosting it is not our problem |

Two screens. One config file. Everything else is a command or a webhook. If a third screen becomes
necessary, the first candidate is a proof-record viewer for F12 — and it should be resisted, because
a `assay explain` that prints well is cheaper and pastes into a ticket.

---

## 6. Spine

Read down the middle column and the product is one sentence.

| Stage | The one thing | Feature |
|---|---|---|
| Before | You are anchored to a hash that changes every deploy | F1 |
| Before | You told me price matters more than prose | F2 |
| Break | The value stopped looking like a price | F5 |
| Publish | So I did not publish it | **F4** |
| Scope | And here are the 4,113 rows I no longer trust, back to the 5th | **F6** |
| Decide | I could not tell these two apart. Which is it? | **F7** |
| Recover | Applied to 340 pages, corrected, republished as a new version | F8, F9 |
| Prove | Here is where that number came from, and here is what we held | F12, F14 |

Fourteen features. Cut anything that does not appear in that table.

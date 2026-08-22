# Critique

Status: internal review, 2026-08-21. Three axes: the wireframes as promises, the
implementation path, the engine. House rule inherited from the rest of the repo:
every criticism cites its evidence, every proposed fix names the measurement that
would validate it. An improvement without a validation path is itself a violation
of the project's stance.

Within each axis, worst first.

---

## Axis 1 — the wireframes as promises

Every frame is a claim the engine must eventually cash. 34 frames were audited
against the code that exists. The findings, ranked.

### 1.1 The capture store does not exist, and half the drawn product stands on it

**Claim.** `assay-backfill` (103:190) shows "what it should say" for five historical
runs — which requires re-healing pages as they were at run time. The queue card
(69:2 and F7's "render the frozen page inline") requires showing the golden HTML.
`assay-blast-radius` (118:2) re-evaluates historical values against captured shapes.
`assay-brake`/unheal (126:2) reverts to "the last capture that was verified good."
Decide Once (121:2) writes an answer back as "a new capture."

**Evidence.** The engine stores a hash, not a page: `results/events.jsonl` records
`"golden_sha256":"1ac8f8aa61259e66"` — 16 hex chars, a *truncated* digest. Nothing
in `src/` or the designs persists HTML. The offline tools get away with it because
`corpus/` sits on disk; the product has no corpus.

**Consequence.** Five drawn features — backfill, blast re-evaluation, the frozen
queue card, unheal, decide-once writeback — are unimplementable as drawn. This is
the single largest gap between the Figma and the repo.

**Fix.** Content-addressed capture store, schema in Axis 2. Elevate it into
APP-DESIGN §8 step 1 — it is more foundational than the quarantine store, which
merely *references* captures.

**Measure.** `npm run replay` rewired to read captures from the store instead of
`corpus/`; byte-identical `events.jsonl` output proves the store reproduces the
filesystem behaviour.

### 1.2 The chat bar is an undesigned model feature on eleven frames

**Claim.** "Ask about this run…" / "Ask about this change…" / "Ask for a change —
'also grab the affected batch numbers'" appears on at least eleven frames (71:2,
77:2, 86:2, 59:2, 99:2, 103:2, 103:190, 103:392, 118:2, and the home goal box
twice). It is a conversational agent over run data and — on 59:2 — natural-language
schema *editing*.

**Evidence.** `docs/FEATURES.md` §4 refuses "an LLM that explains the break in
natural language." `docs/AI-AND-AGENTS.md` §1 permits a model to *propose element
references*, never values, never prose. Neither document mentions a chat surface.
No MCP tool in APP-DESIGN §6 takes a natural-language question.

**Consequence.** The most-repeated interactive element on the board is either a
contradiction of the anti-narrator refusal or a decoration. A judge who types into
it will find out which.

**Fix.** Honor it without violating the refusal: the model **routes, artifacts
answer**. A question maps to one of the existing deterministic surfaces (page map,
run record, blast walk, held list) and the response is that artifact plus the
engine's own diagnosis strings — no generated sentences. "Show me what the page
looked like before" → the capture, rendered. Questions that map to nothing return
"I can only show you records" — an abstention, on brand. The schema-editing bar on
59:2 is a different feature (contract mutation) and should route to `assay_watch`'s
YAML-emitting path with a human confirm, or be cut from the frame.

**Measure.** A routing eval: N real questions → does the router pick the right
artifact? Report routing accuracy the way heal accuracy is reported. No arm, no
claim.

### 1.3 `assay-run-report` promises a detector that does not exist

**Claim.** 71:2 — the audit's *calibration-good* frame — lists "The page is 38%
shorter than the last twenty runs · well outside its normal range" under WHAT MADE
ME LOOK TWICE.

**Evidence.** `detect()` (src/detect.js) has no page-size signal. Its full signal
set: `value_missing`, `placeholder_value`, `shape_mismatch`, `too_short`,
`null_rate_spike`, `anchors_disagree`, `anchors_died`, plus `skeleton_changed` as
context. Nothing measures page length against history.

**Consequence.** The best screen in the file quietly promises an eighth detector.

**Fix.** Cheapest new detector available: `robustZ` already exists and takes any
series — feed it `html.length` per run. ~5 lines in the runner, none in detect().

**Measure.** Replay the corpus with the size signal on; count new true/false
positives against the 74 known-good runs. It must fire on zero of the 8 healthy
runs to ship.

### 1.4 Discovery and field proposal are the front door, and there is no house

**Claim.** `assay-discovery` (103:392) crawls a sitemap, counts items per page,
clusters language duplicates, and suggests 4 of 14. `assay-agent-fields` (99:2)
reads a raw page and proposes six fields with per-field confidence and "what I
would take."

**Evidence.** No sitemap code, no schema-inference code, no design doc section.
`pickTarget()` in tools/bench.js:33 is the closest thing to field inference in the
repo — a hardcoded recall-keyword heuristic.

**Consequence.** The first two screens a new user meets are the two with zero
engineering behind them. Everything downstream (fingerprint, detect, heal) assumes
fields already chosen.

**Fix.** Scope honestly: v1 discovery = sitemap.xml fetch + path clustering + item
counts (no model — DOM repetition statistics). v1 field proposal = the model
nominating **elements** per AI-AND-AGENTS §1, with `fingerprint()` immediately
capturing each nomination; "example from this page" is the fingerprint's own text,
so the display never shows a model-authored string. The `clear`/`unsure` column maps
to fragility primitives that already exist (`isVolatileClass`, label presence).

**Measure.** On the three corpus sites, does field proposal recover the fields the
collectors already scrape? Report recall like everything else.

### 1.5 The third proposer is drawn but not built — and the drawn one is buildable today

**Claim.** 113:2 shows scorer / model / **label anchor** as three strategies. Only
the scorer heals.

**Evidence.** `detect()` evaluates anchors; nothing *heals* from them. The label-
anchor healer — "find the text following the element whose label reads 'Hazard:'"
— is `neighborText`/`headingPath` logic (src/fingerprint.js) run in reverse, no
model required.

**Consequence.** The disagreement card's honest line "the scorer and the label
anchor are both reading the page's structure, so when the structure moves they are
wrong together" describes a correlation that has never been measured.

**Fix.** Build the label-anchor healer first (pure Cheerio, ~40 lines); it makes
the N-proposer path demoable with zero model cost and gives the disagreement rate
a baseline before any LLM enters.

**Measure.** Run it as a bench arm. Its agreement rate with the scorer per
mutation class IS the "shared blind spot" claim, quantified.

### 1.6 Schedule's skip-if-unchanged breaks the detectors it feeds

**Claim.** 80:2: "Assay skips a run when the page has not changed since the last
one."

**Evidence.** `detect()` consumes `history` (null rates) and `anchorsBefore` (last
known-good anchors). If unchanged pages are skipped, history contains only *changed*
pages — `robustZ`'s baseline becomes a biased sample of exactly the runs where
something moved, and `anchorsBefore` can be arbitrarily stale.

**Consequence.** The drift detector's false-positive rate rises precisely on the
targets that are healthiest (most-skipped). The feature that saves runs poisons the
statistics of the feature that notices breaks.

**Fix.** Skip the *fetch*, never the *record*: an unchanged page (same content
hash) writes a synthetic run row carrying forward the previous values at zero
cost. History stays dense; the fetch bill stays low.

**Measure.** Replay with synthetic skip-runs interleaved; detector output must be
identical to the no-skip replay.

### 1.7 Compare/digest have no value-history substrate

7.1's diff (108:2, 109:2) needs per-field values across runs, retained and
queryable. That is the `field_runs` table in Axis 2 — designed nowhere before now.
Smaller than 1.1 (values are tiny; pages are big) but on the same critical path.

### 1.8 Minor unbacked promises, listed so they are on record

- 77:2 "The last change Assay had to think about was 9 days ago" — needs episode
  history (F5's grouping, unbuilt).
- 78:2's reliability numbers come from `tools/audit.js`'s one-off Bright Data
  read; the product needs the same computation as a standing query.
- 121:2's group-undo requires decisions to record their applied set atomically —
  an application-layer transaction the storage design must own (Axis 2).
- 39:5 GitHub OAuth + "Request access" — hosted-demo auth, APP-DESIGN §7 covers
  posture but no auth design exists.

---

## Axis 2 — implementation critique

### 2.1 The storage layer, proposed concretely

The seam between the pure engine and the product is one table set. Minimal schema
(Postgres; one adapter per APP-DESIGN §6b):

```sql
captures(sha256 TEXT PK, html BYTEA /* zstd */, fetched_at, url)
runs(run_id PK, target_id, capture_sha -> captures, skeleton_hash, ts)
field_runs(run_id, field, value TEXT NULL, status, reason, proof_id UNIQUE,
           ranked JSONB NULL, PRIMARY KEY(run_id, field))
episodes(episode_id PK, target_id, field, cause, opened_run, closed_run NULL)
queue_items(item_id PK, proof_id -> field_runs, stakes_rows INT, resolved_by NULL,
            resolution NULL, group_key NULL, ts)
```

Decisions live on `queue_items` (one owner, one decision — F7); the applied group
is recorded by stamping `group_key` + `resolved_by` on every member in one
transaction, which is what makes 121:2's group-undo an `UPDATE … WHERE group_key`
instead of a loop that can half-fail.

**Content addressing does the retention work.** An unchanged page hashes to the
same sha; 74 corpus runs of mostly-unchanged pages would store ~a dozen distinct
captures, not 74. Prune rule: keep full HTML for any capture referenced by (a) a
baseline, (b) an open episode or queue item, (c) the last N runs per target;
everything else keeps the row, drops the `html`. `golden_sha256` in the proof
record must become the **full** digest — the 16-hex truncation in events.jsonl is
64 bits doing a 256-bit job in a field named sha256.

**The row-ID join** (blast radius → warehouse retraction) is the `proof_id` column
exported on every row (F13). No other join key survives contact with the user's
warehouse, because nothing else is ours.

### 2.2 The runner is the missing seam, and it should stay boring

The engine is synchronous pure functions — correct, keep it. The product needs one
new module, `runner`, that owns all IO: load baseline + history from the store →
fetch (or skip-with-record, 1.6) → `detect()` → maybe `healGated()` → write
`field_runs` + envelope → open/close episodes → emit notifications.
`tools/replay.js` is already 80% of this loop reading from disk; the honest move
is to refactor replay *into* the runner with a filesystem store adapter, so the
benchmark and the product run the same loop. Two loops means the benchmark stops
testing the product.

### 2.3 `fingerprint.js`'s dual life survives the app; protect it with a test, not a rule

Zero-imports makes it importable everywhere — Next bundles it untouched. The real
risk is drift in the *pasted* copy inside the Bright Data collector, which no
build system sees. Add to selftest: fetch the collector's parser source via the
API (tools/bd-status.sh already talks to it) and string-compare the pasted
functions against `src/fingerprint.js`. Drift fails CI, which is the only place a
"paste verbatim" contract can be enforced.

### 2.4 `assay_propose` scores against what, exactly

APP-DESIGN §6 says a nomination "is scored and gated like any candidate." That
requires, per queue item: the target fingerprint, the **full ranked list**, and
the capture sha — persisted at abstain time. The headtohead records already store
`raw_decision.ranked` (see results/headtohead.jsonl); `field_runs.ranked` above
makes that a rule. Recomputing at propose time against a re-fetched page would
score the nomination against a *different page* than the one the queue item is
about — silently wrong. This constraint should be stated in APP-DESIGN §6.

### 2.5 App boundaries: almost everything is a read

Every screen except two renders from the store: queue, nights, runs, fields,
compare, blast, explain are `SELECT`s over `field_runs`/`episodes`/`queue_items`.
Live engine calls happen in exactly two places: the runner (cron-triggered route
or external scheduler) and `assay_propose` (one `score()` call against persisted
inputs). This is the strongest argument that APP-DESIGN §8 steps 1–2 are "most of
the work": after the store exists, the app is server components over SQL.

### 2.6 Build-order corrections

- **Captures before quarantine.** §8 step 1 builds the quarantine store; but a
  queue card without its frozen page (F7's own hard rule) is a regression to
  selector-strings-for-humans. Reorder: captures+runs+field_runs, then quarantine
  semantics, then the queue.
- **Fix the truth-marker leak before the 4th arm** (see 3.8) — it gates the only
  new *claim* the roadmap wants to make.
- Everything else in §8 sequences fine.

---

## Axis 3 — engine critique and improvements

### 3.1 The gate cannot tell a twin decoy from a sibling card, and the calibration proves it

**Claim.** `delta = 0.16` was calibrated to defeat `duplicate_similar` twins, but
real sibling elements land in the same margin band, so the gate abstains on
recoverable cases for the same reason it refuses coin flips.

**Evidence.** The two live unnecessary abstentions (results/headtohead.jsonl):
`wrapper_div` — target 0.7363, wrapper (same text) 0.6918, **sibling recall card
(different text) 0.6314**; `combo_redesign` — wrapper 0.6918, target 0.6380,
sibling 0.6314. In both, a *different recall's title* scores within ~0.10 of the
right answer. Two recall titles share tag, stable classes, heading path, neighbor
shape, and most of their words ("Contoso recalls the … after …") — the
discriminating property, `text`, carries 2.7 of ~18.6 weight (~15%).

**Consequence — and a correction to a hypothesis worth recording.** The obvious
fix, collapsing ancestor/descendant candidates with identical text before the
margin check, is **insufficient on the live data**: post-collapse margins are
0.7363−0.6314 = 0.105 and 0.6918−0.6314 = 0.060, both still under 0.16. Dedupe is
still worth doing (it is free, it can only widen margins, and it makes the ranked
list honest — the wrapper is not a *second answer*), but it rescues neither case
alone. The band conflation is real: twin-decoy margins (~0.01–0.05) and sibling
margins (~0.06–0.10) overlap the gate's one knob.

**Fix, in order of leverage.**
1. Ancestor/descendant dedupe with identical trimmed text → collapse to the
   deepest node, keep max score. Safe: collapsing nodes that carry the same value
   cannot create a wrong publish (it is benign_tie's logic applied earlier).
2. **Margin against the best *distinct-value* candidate**, not the raw runner-up —
   generalises benign_tie from "all tied values identical" to "how far is the
   nearest genuinely different answer." wrapper_div then reads: 0.7363 vs 0.6314.
3. Raise `text`'s discriminative power on near-duplicates: score `text` with a
   token-IDF-weighted overlap instead of raw Levenshtein, so shared boilerplate
   ("Contoso recalls the") stops paying rent. This attacks the root: two different
   recalls should not score 0.63 against each other's fingerprints.

**Measure.** Re-run sweep + bench with each change independently. Success =
`duplicate_similar` still 0 wrong (the twins differ by one year digit and
"(archived)" — IDF keeps them close, as it should), while `wrapper_div`/`swap_tag`
abstentions fall and headtohead's two live abstentions flip to heals. Any wrong
published anywhere = revert.

### 3.2 `benign_tie` compares 200-character prefixes of the value it publishes in full

**Claim.** A tie is called benign when tied candidates share `fp.text` — which
`fingerprint()` truncates: `clean($el.text()).slice(0, 200)` (src/fingerprint.js).
Two containers identical for 200 chars and divergent after count as one value.

**Evidence.** heal.js `healGated`: `tied.map(r => (r.fp.text || '').trim())`;
fingerprint.js: the slice. A recall listing's card vs its parent section can agree
for 200 chars and disagree at char 300.

**Consequence.** The one path where the gate publishes *under* a thin margin can
publish the wrong (longer) node's value. This is exactly the class of silent wrong
the gate exists to prevent, inside the gate.

**Fix.** benign_tie must compare the value the runner would publish — full
extracted text (hash it if long). One line in the runner's contract; the engine
can take an optional `extract(el)` callback.

**Measure.** New mutation: `wrap_with_suffix` — wrap the target, append 250 chars
to the wrapper. Today's gate publishes the wrapper's value under benign_tie; the
fixed gate must abstain or pick the inner node. Add to the bench.

### 3.3 Calibration is in-sample, and the README's flagship number inherits that

**Claim.** sweep.js and bench.js draw from the same corpus, same `pickTarget`,
same nine mutations — sweep samples 4 captures/site, bench 6, overlapping sets.
`tau/delta` were selected on essentially the population they are then reported on.
"Both thresholds were calibrated, not chosen" (README) is true; *calibrated on the
test set* is the part left unsaid.

**Consequence.** The 0-wrong headline is a training-set number. It is probably
robust — the gate's zero comes mostly from `remove_field`/`duplicate_similar`
structure, not threshold fine-tuning — but "probably" is the word the repo exists
to remove.

**Fix.** Leave-one-site-out: sweep on two sites, evaluate on the third, three
folds. Also leave-one-mutation-out for `delta` specifically, since 3.1 shows
`duplicate_similar` alone drives it.

**Measure/prediction.** On record: LOSO keeps value_wrong at 0 in all three folds
(the gate's zeros are structural), but the selected `delta` varies by fold
(0.08–0.25), which is itself the finding — report the fold range next to the point
estimate, and the README sentence gains the clause that makes it honest.

### 3.4 The weights are borrowed from a different task and never re-fit

**Claim.** SPEC weights (heal.js) are Kluge & Stocco's GA output, optimised for
test-automation locators on app UIs — a corpus where `name`/`type`/`id` matter and
long prose text does not. Assay's targets are content pages where `text`,
`neighbor_text`, `heading_path` do the work; two properties were already dropped
(geometry) and one added-skip rule invented (absent-on-both), so the weights are
running off-label already.

**Fix.** The mutation harness generates labelled pairs for free. Fit weights by
LOSO (fit on 2 sites, test on held-out) — 77 pages cannot support per-property
free optimisation without it, and the fold spread IS the overfit meter. Report
borrowed-vs-refit as two bench arms; keep whichever wins on held-out folds only.

**Measure.** value_wrong (must stay 0) and abstain_wrong (should fall) per fold.
If refit wins in-fold but loses cross-fold, publish that too — it is the
overfitting result the field never reports.

### 3.5 Absolute delta: probably fine, cheap to check, currently unexamined

Healthy-corpus margins are enormous (run 51: 0.8787 vs 0.3763) and thin cases sit
at scores 0.63–0.74, so a relative margin (`margin/best`) would reorder little:
wrapper 0.105/0.736 = 0.14, combo 0.060/0.692 = 0.087 — both still under any
plausible relative threshold. Verdict: not the lever; 3.1's distinct-value margin
is. One sweep re-run with relative deltas settles it; do it once, record it, move
on.

### 3.6 `sharedWords` is directional by design — document it or bound it

`sharedWords(a,b)` returns the fraction of the *target's* words surviving in the
candidate (heal.js). A candidate containing the target's neighborhood plus a page
of extra text scores 1.0 on `neighbor_text`. In the wrapper cases this is
legitimate (a tight wrapper genuinely has the same neighbors) and the ancestor
problem is handled at the `text` property by `ned`'s length sensitivity — but only
because `text` is truncated at 200 chars (3.2), which *caps* the length penalty
for big containers. The two bugs interlock: fix 3.2's truncation and large
ancestors' `text` similarity drops too, which is the desired direction. After
3.2, re-check whether `sharedWords` needs a containment penalty at all; suspect
no. Measure: wrapper-family margins before/after.

### 3.7 Cold start is guarded; the zero-variance spike is a hair trigger

`detect()` runs `robustZ` only when `history.length >= 3` (src/detect.js) — the
short-history hypothesis is **refuted**, and worth saying so. The live edge is
`mad === 0 && x !== med` → spike (src/detect.js robustZ): a baseline of
`[0, 0, 0.02]` has med 0, mad 0, so a single 2%-null run later fires a spike.
Zero-variance baselines are the *common* case (the comment says so), so any
nonzero wobble on a historically perfect field pages someone.
**Fix.** Require the deviation to clear a floor when mad is 0: spike iff
`mad === 0 && |x − med| > 0.05` (or: any nonzero null count on a zero-null
baseline of ≥10 runs). **Measure.** Replay: today's rule and the floored rule must
agree on all 74 runs; then inject one 2%-null synthetic run — old rule fires,
new rule doesn't, and a 90%-null run still fires both.

### 3.8 The benchmark would hand a model arm the answer key

**Claim.** The 4th arm (model proposer) cannot be run on the bench as it stands:
the mutated page passed to any arm still carries `data-assay-truth="1"` on the
correct element (mutate.js `markTarget`; bench reads it *after* healing via
`isTarget`). The scorer never reads that attribute — by construction — but a model
given page HTML reads everything.

**Consequence.** Any model-arm accuracy number produced today would be
contaminated, in the exact way the marking scheme was designed to prevent for the
scorer, and the contamination would flatter the model.

**Fix.** Serialize the page for the model with TRUTH_ATTR stripped and re-identify
the model's chosen element on the marked DOM by path. ~10 lines in bench.js.
Fairness rules for the arm, while at it: same candidate universe, element
references only (index into the ranked list or a path), same gate applied to its
nomination, cost and latency reported per case.

**Measure.** The arm's report must include a canary: N cases where the truth
attribute is *deliberately left in* — if arm accuracy on canaries exceeds its
accuracy on clean cases, the harness leaks somewhere else too.

### 3.9 Diagnosis strings are prefix-typed prose; the app will regret parsing them

`detect()` returns signals like `shape_mismatch:/regex/i got "…"` and a `diagnosis`
sentence, and downstream (F5 alerts, envelope reasons, compare's withheld causes)
will branch on them. Prefixes are load-bearing but undeclared; `attributed_cause`
is a proper enum and shows the right shape.
**Fix.** Signals become `{code, params, text}` with `text` derived — the closed
vocabulary FEATURES §4 already demands ("a small closed set of states"). The
strings stay for humans; the app branches on codes only.
**Measure.** selftest asserts the code set is closed (any new code fails until
registered), which is how the vocabulary stays a vocabulary.

### 3.10 Performance: full-page ranking is quadratic in practice and fine on this corpus only

`rank()` scores every element (`candidates()` = all body tags) with up to 8
Levenshtein comparisons on ≤200-char strings. Corpus pages ≈ 10³ elements —
fine. A commerce page at 5×10³ elements ≈ 4×10⁴ Levenshtein calls ≈ 1.6×10⁹
char-cell ops per field per run — seconds per field, minutes per multi-field run.
**Fix.** Two-stage rank: score the cheap exact/set properties first (tag, type,
classes jaccard, ~free), run text comparators only on the top 100. Recall guard:
also promote any candidate sharing a rare token (page-IDF) with the target text.
**Measure.** Bench + headtohead must produce identical decisions two-stage vs
full; report the wall-clock ratio. Identical-or-revert, same as 3.1.

---

## Top five, across all axes

1. **Build the capture store first** (1.1, 2.1, 2.6). Five drawn features depend
   on it; the proof record's `golden_sha256` is currently a truncated hash of a
   page nobody kept.
2. **The gate's one knob conflates twins with siblings** (3.1). Distinct-value
   margin + ancestor dedupe + IDF text scoring, each measured alone; the live
   headtohead abstentions are the acceptance test.
3. **benign_tie's 200-char prefix** (3.2) is a wrong-publish path inside the
   safety mechanism. Small fix, new mutation to pin it.
4. **The truth-marker leak blocks the 4th arm** (3.8). Ten lines, but they gate
   the only new claim the roadmap wants to make — and AI-AND-AGENTS §7 already
   promises no claim before measurement.
5. **The chat bar needs a ruling** (1.2). Eleven frames promise it; either the
   route-to-artifact design goes into AI-AND-AGENTS, or it comes off the frames.
   The current state — drawn everywhere, designed nowhere, half-refused by the
   docs — is the one position that cannot ship.

Recorded refutations, for honesty: ancestor dedupe alone does **not** fix the live
abstentions (3.1); cold-start robustZ was already guarded (3.7); relative delta is
probably not the lever (3.5).

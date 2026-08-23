# Limitations

Where Assay is weak, with the numbers that show it. Every figure below is read
off a file in `results/`, so each one can be checked or contradicted.

The project's claim is narrow: on this corpus, with these thresholds, the margin
gate takes the wrong-value count to zero. Everything that claim does not cover is
in this document.

---

## 1. It abstained when it did not need to, on wrapper mutations — mechanism changed, not re-measured

`results/headtohead.jsonl` is a run against a testbed that is no longer deployed:
nine variants, one field, one system, all nine records `system: "assay"`. Assay
published five correct values, published nothing wrong, and abstained four times.
Two of those four abstentions were right — `remove_field`, where nothing was
recoverable, and `duplicate_similar`, marked `ambiguous`. Two were not:

| variant | expect | score | runner-up | margin | delta |
|---|---|---|---|---|---|
| `wrapper_div` | target | 0.7363 | 0.6918 | **0.0446** | 0.16 |
| `combo_redesign` | target | 0.6918 | 0.6380 | **0.0537** | 0.16 |

Both fields were recoverable. Both went to a human. That was 2 of 9 cases sent to
a queue for no reason — past tense, and §1.1 below is why the tense matters.

The cause is structural. Wrapping the target in a new parent creates an element
whose `text` is character-for-character the target's own, and `text` carries the
heaviest weight in the scorer (2.7 of 18.6). The wrapper therefore lands within a
few hundredths of the thing it wraps. On `combo_redesign` it lands *above* it:
the top candidate is `div.v2-shell`, not `h2.v2-recall-card__title`.

`healGated` has an escape hatch for exactly this. As it stood then, when the
margin was thin it collected every candidate within `delta` of the best and, if
they all carried the same text, healed anyway — `reason: "benign_tie"`, on the
grounds that it does not matter which node you read an identical string from. It
did not fire on either case. The persisted ranked list says why:

```
wrapper_div      band = 0.7363 - 0.16 = 0.5763
  0.7363  h2.recall-card__title   "Contoso recalls the Halden swivel chair..."
  0.6918  div.layout-shell        "Contoso recalls the Halden swivel chair..."   <- same text
  0.6314  h2.recall-card__title   "Contoso recalls the Ravensmoor space heater..." <- inside the band, different text
```

A third candidate — a different recall card on the same listing page — sits
inside the delta band with different text. `values.size` is 2, not 1, so the
benign tie is not recognised and the gate abstains. `combo_redesign` fails the
same way, with the same third candidate at 0.6314 against a band floor of 0.5318.

**The auditability gap.** That diagnosis is possible only because
`serialiseDecision` in `tools/headtohead.ts` keeps a ranked list, and it keeps
less than the decision was made from: the **top 3 of 5** candidates, each reduced
to a selector, a score rounded to four places, and the first 80 characters of its
text. The per-property contributions that produced 0.7363 against 0.6918 are not
kept anywhere. So the list is enough to see *that* an unrelated card broke the
benign-tie check, and not enough to say *why* a wrapper div scores 0.6918 in the
first place, or what candidates 4 and 5 were. `results/events.jsonl` truncates
the same way. The ranked list is the evidence for every gate decision this
project makes, and it is stored in a lossy form in both places.

### 1.1 What changed, and what that does and does not license

`5a16b6f` changed the mechanism. `healGated` reaches the ambiguity branch on
`margin <= delta`, and `margin` is `best.score - runnerUp.score` — the top two and
nothing else. The branch then asked its question of a *different* set: every
candidate within `delta` of the best. One function held two notions of "tied", and
whenever they disagreed the disagreement was resolved in favour of holding. The
tie is now the top two, which is the pair the margin compared. `decide()` in
`src/heal.ts` carries the reasoning at the line that changed.

On both cases above the top two carry identical text, so the change is **expected**
to flip `wrapper_div` and `combo_redesign` to `published_correct`. Three things
have to be said about that expectation, in order of how much they cost.

**The corpus does not exercise this path at all.** Across all 153 mutation cases
and all 74 replay runs, the old gate and the new gate decide identically:

| | before `5a16b6f` | after |
|---|---|---|
| `npm test` | 34 assertions, all checks pass | unchanged |
| `npm run bench` gated arm | 60.8 exact / 64.7 correct / **0.0 wrong** / 35.3 abstained | identical |
| `npm run replay` | 74 runs, 8 ok, 66 heals, 0 abstentions | unchanged |
| `results/events.jsonl`, `results/bench.json`, `results/rows.jsonl` | — | byte-identical |

So there is no corpus evidence that this helps. That is not a hedge, it is the
measurement: the benchmark's near-ties are twin decoys, where the top two
themselves disagree, and that is the case this branch still refuses.

**It has not been re-measured on the cases it was meant to fix.** The testbed
named by `ASSAY_TESTBED` is not deployed, so the 9 variants could not be re-run.
The table above this section is what the old gate did. What the new gate does on
those nine pages is a prediction and is written here as one.

**The evidence is a test, and the test was built by measuring rather than by
assuming.** `test/benign-tie.test.ts` fails on the previous implementation and
passes on this one; the revert was run to confirm it bites. Getting there
corrected a wrong first attempt — with two recall cards the only other candidates
are the wrapper divs at ~0.55 against the target's ~0.99, far outside the band, so
the tied set is the top two either way and the old code heals too. Three cards,
two agreeing and one near-identical decoy, is the smallest page that separates the
implementations.

This **loosens** a safety mechanism, so the pinned case is the important one:
`duplicate_similar` and `remove_field` are the two variants where abstaining was
correct, and both are the shape where the top two themselves disagree. Still
refused, and the test fails loudly with the value it was about to publish rather
than with a bare assertion.

The repair proposed here before — treat a candidate as a benign tie when it is an
ancestor or descendant of the best and carries the same text — was **not** what
shipped, and `docs/CRITIQUE.md` §3.1 measured why it would not have been enough on
its own: post-collapse the margins are 0.105 and 0.060, both still under 0.16.

---

## 2. The benchmark's zero is paid for

`results/bench.json`, 153 cases, three arms:

| arm | value correct | wrong values published | abstentions |
|---|---|---|---|
| naive | 48 | 93 | 12 |
| plain (no gate) | 117 | 36 | 0 |
| gated | 99 | **0** | 54 |

The gated arm's 54 abstentions split 18 / 36. Eighteen are on `remove_field`,
where the element is gone and refusing is the only correct answer. The other 36
are on breaks where a correct answer existed, and on 18 of those 36 the ungated
arm actually produced it — 6 on `swap_tag` and 12 on `duplicate_similar`. On
`duplicate_longtail` the ungated arm got none of the abstained 12 right: the six
it got right are the same six the gated arm healed, and the twelve the gate
refused are exactly the twelve the ungated arm published wrong.

`duplicate_similar` is the worst of it. A near-identical decoy sits beside the
real value; the ungated healer gets 12 of 18 right and 6 wrong; the gated healer
abstains on **all 18**, discarding the 12 along with the 6. The gate cannot tell
the two apart, which is the definition of a thin margin, but the cost is not
symmetric — it loses twice as many right answers as wrong ones on that mutation.

36 of 153 is 23.5%. Roughly one break in four lands in a review queue that did not
have to. Whether that is a good trade depends entirely on what publishing a wrong
value costs you. For a product-recall feed it is worth it. For a price tracker it
is probably not, which is why `tau` and `delta` are arguments to every tool.

---

## 3. The gate has never fired on real drift

`results/events.jsonl` is the replay over the archived corpus: 74 records, 8
clean, 66 heals, **0 abstentions**.

Two and a half years of genuine site changes across three sites never once
produced a near-tie. When those pages moved, the right answer won by a wide
margin — run 51 is typical, 0.8787 against a runner-up of 0.3763, a margin of
0.50 against a threshold of 0.16.

So on the only real-world data in this repo, the margin gate is inert. It costs
nothing and it catches nothing. Every abstention the project has ever recorded
comes from a manufactured near-tie: 54 from the benchmark's deliberate
mutations, 4 from the testbed variants. The claim "the gate prevents wrong
values" is supported by constructed cases and by no observed production incident.

---

## 4. One field, one vertical

All 74 replay records track a single field, `recall_title`, on product-recall
listing pages from three sites (IKEA, Mattel, Chicco). The 153 benchmark cases
are the same field on the same six captures.

Nothing here has been run against a price, a stock count, a date, a paginated
table, a review body, or a JavaScript-rendered page. `recall_title` is a long,
distinctive, prose-like string, which is close to the best case for a
text-weighted similarity scorer. A short numeric field would give `text` far less
to work with and would likely shift where the thresholds belong.

---

## 5. The thresholds are calibrated on this corpus and nowhere else

`tau = 0.6` and `delta = 0.16` came out of `tools/sweep.ts`: an 11 x 10 grid, 110
points, scored over these pages and these mutations. `results/sweep.json` holds
the surface.

That makes them fitted values, not constants. They are arguments to every tool
for that reason. There is no evidence they transfer to another vertical, another
field type, or another site's markup conventions, and the sweep that produced
them would have to be rerun on a new corpus to find out. Treat any repo that
copies 0.6 / 0.16 without rerunning the sweep as unvalidated.

**What is no longer a limitation here, since `0efaa3c`: the sweep and the
benchmark disagreed.** `results/sweep.json` used to recommend `tau = 0.75` and
report 3 wrong values at the shipped 0.60 / 0.16, on the same 153 cases where
`npm run bench` reported zero. The cause was that `evaluate()` held a second copy
of the gate's arithmetic, and the copy had drifted: it compared `fp.text`, which
the fingerprint truncates at 200 characters, where the gate has always compared
the full element text. On `duplicate_longtail` — a decoy identical for 200
characters and divergent after — the copy saw a benign tie and published. So the
sweep was grading a healer with a known wrong-publish bug and then recommending a
higher `tau` to compensate for it. `decide()` in `src/heal.ts` is now the only
implementation and both tools call it, and `--captures` defaults to 6 in both
where the sweep used to default to 4, which is what hid the disagreement behind a
different `n`.

`npm run sweep` with no arguments now re-derives the operating point that ships
and agrees with `npm run bench` cell for cell on the same 153 cases:

```
RECOMMENDED OPERATING POINT   tau = 0.6   delta = 0.16
  correct         64.7%   (99/153)
  WRONG            0.0%   (0/153)
  abstained       35.3%   right 18, unnecessary 36
```

That removes a contradiction. It does not weaken anything above it: the point is
still fitted to this corpus, and two tools agreeing is not two corpora agreeing.

---

## 6. No layout signal

`fingerprint()` describes an element with text, tag, type, id, classes, ARIA
label, neighbour text, href, alt and two XPaths. It records no position and no
dimensions, and the comment in `src/fingerprint.ts` says why: Cheerio parses HTML
and has no layout engine, so there is no box to measure.

The weights come from Kluge & Stocco (EMSE 2026), which weighted location at 1.7
and dimension at 1.1. Both are dropped here — 2.8 of the source's 21.4 total
weight, about 13%, discarded because this runtime cannot compute them.

That is a real loss and it bears directly on limitation 1. A wrapper div occupies
a visibly larger box than the `h2` inside it, and a geometry-aware scorer would
separate the two on exactly the case where this one cannot. Recovering the signal
means a headless browser, which would end the property that makes
`src/fingerprint.ts` useful: it imports nothing, so it pastes verbatim into a
Bright Data collector's Cheerio parser and runs identically in both places. The
trade was taken deliberately and it has a measurable cost.

---

## 7. Until 2026-08-22 the deployed path could not detect a break at all

`ingestPage` — the single path the worker and a Bright Data delivery both take —
called `establishBaseline` on the page it was about to evaluate, so every run
compared a page against itself: the skeleton always matched, the stored selector
always resolved, and the value always equalled the baseline value. The gate fired
zero times in 74 recorded runs, and a site that moved would have been published
as `live`.

The corpus path (`tools/ingest.ts`) never had this bug — it takes the baseline
from the first capture and evaluates every later one against it, which is what
produced the numbers in sections 2 and 3. So the published 0.0% was a measurement
of the engine and was never a measurement of the product. The baseline is now
persisted per field (`field_state.baseline_golden_sha` / `baseline_selector`) and
advances only on a published heal. No number in this document moved because of
*this* fix, because none of them ran through the broken path.

That sentence used to read "the numbers in this document are unchanged", which
was true of this fix and false of the document: a separate fix earlier the same
day (`4213c8f`, the xpath anchor built with the path separators still in it, so
the second anchor read `null` on every page) moved the replay split from 50 clean
/ 24 heals to 8 / 66, and section 3 quoted the old pair for hours afterwards.
Nothing published changed — all 74 values are identical across that fix — but 42
runs stopped being called healthy by a detector that was not running. Section 3
now quotes what `npm run replay` prints.

---

## 8. A run can be asked for, not made to happen — and a baseline cell is never held

Two consequences of decisions taken elsewhere, both visible from the UI.

**The Schedule screen's `Ask for a run` is an enqueue.** `CONTRIBUTING.md` is
explicit that Next never runs a scrape, so the control sets `next_run_at` and the
worker claims it — nothing more. With no worker running, the target is queued and
stays queued forever. That is why the screen carries a real liveness signal
rather than a spinner: the worker holds a shared advisory lock for as long as its
connection lives (`holdWorkerLock` / `workersUp` in `src/store/index.ts`), and
when the count is zero the screen says so in a sentence. A heartbeat row was
rejected for this — it forces every reader to pick a staleness window, and for
the width of that window a worker killed with `SIGKILL` still reads as present.

**The first run of a field cannot produce a held cell.** With no prior baseline,
`ingestPage` establishes one from the page in hand, so `runTarget` compares that
page against itself — the selector resolves, the value matches, and the gate
cannot fire. `createTarget` also refuses a field whose resolver matches nothing,
so the "no element" path is closed before the run starts. The held-cell branch in
the confirm-step schema table (`web/app/(app)/schema-table.tsx`, rendered by
`Built` in `watch.tsx`) is therefore unreachable through the create flow as it
stands: a held cell needs a *second* run against a page that has since changed.
Nothing is wrong with the rendering — it has simply never had a state to draw.

---

## 9. A renamed JSON key ranks correctly and still cannot clear the gate

Bright Data's prebuilt scrapers return structured JSON, and `src/connectors/record.ts`
renders a record into a deterministic HTML document so the unmodified engine reads
it (`docs/FEATURES.md` and the file's own header explain why a second extraction
path was refused). The interesting question is what happens when a vendor renames
a key, because that is the JSON equivalent of a selector break.

Measured on the documented Instagram profile record — the same `IG` fixture
`test/record.test.ts` uses — with `followers` renamed and the baseline fingerprint
taken from the original `followers` entry:

| rename | best | runner-up | margin | gate |
|---|---|---|---|---|
| `followers` → `follower_count` | 0.6312 | 0.4377 | 0.1934 | heal, `clear_margin` |
| `followers` → `subscriber_count` | 0.5423 | 0.4386 | 0.1037 | **abstain**, `below_tau` |
| `followers` → `audience_size` | 0.5546 | 0.4377 | 0.1169 | **abstain**, `below_tau` |

In every row the *right* candidate wins: the top-ranked element carries
`676000000`, and the runner-up is `following`'s `500`. So the adapter gives the
healer enough signal to **rank** a renamed key correctly. Whether it gives enough
to **publish** one depends on how much of the old key name survives in the new
one, and on the two synonym renames it does not: `0.5423 < tau 0.60` and
`0.1037 < delta 0.16` — the gate refuses on both counts, not one.

The cause is that a rendered record is sparse. The baseline fingerprint of a leaf
is:

```
text          "676000000"        classes  ["k-followers"]   id  "k-followers"
neighbor_text "followers"        tag dd   parent_tag div    depth 4  sibling_index 1
href / alt / aria_label / role / testid   null
heading_path  []
```

Six scored properties are null for every leaf in the document, and on a rename the
class, the id and the `<dt>` label that becomes `neighbor_text` all change
*together*, because all three are derived from the key. What survives a rename is
position, parent, depth, tag and the shape of the text — and that is what the
scores above are made of. There is no more signal to find; the renderer is not
throwing any away.

So a renamed JSON key publishes a labelled hole and alerts, rather than healing.
That is arguably the correct outcome rather than a defect, and the runner-up is
the argument: the alternative to abstaining is healing `followers` to `following`
and publishing `500` as a follower count. But it is a limitation as stated
elsewhere — the thresholds are fitted to `recall_title`, a long prose string
(section 5), and a nine-digit number is about as far from that as a field gets.
Re-running the sweep against rendered records is what would settle where `tau`
belongs for this source; it has not been done.

---

## 10. The Bright Data code gate is three rules fitted to n=1

`src/bd/diffgate.ts` reads the collector code Bright Data's self-healing proposes
and returns a verdict, so `tools/bd-heal.ts --approve` refuses a repair the gate
rejects. It catches a class of failure no output check can see — the committed
transcript is a repair whose output rules all pass and whose code retires the only
independent cross-check the detector had.

**Three rules, each derived from one observed failure in one transcript.**
`corroboration_collapse`, `not_attempted` and `vendor_preview_failed` fire
correctly on `results/bd-heal-transcript.json` and are not evidence about heals
nobody has seen. They are regex over generated JavaScript rather than a parse, so
a multi-line restatement of the same defect can walk past them; the file says so
and names acorn over `parse_code` as the upgrade path. Two false positives were
caught by the tests during the build — a key regex that captured object *values*,
and `let hazard = null` read as a stub when it is an initialiser the proposal
later fills four ways — and both are pinned as regressions, which is the only
reason to have any confidence in the other three.

Reproduce it with no credentials, against the committed transcript:

```
npx tsx tools/bd-heal.ts --verify
  ...
  DO NOT ACCEPT  (output: 3 pass, 0 fail, 1 not evaluable; code: reject)
```

---

## What is not claimed

- That the deployed path had ever detected a break before 2026-08-22. It had not.
- That `Ask for a run` runs anything. It enqueues; a worker has to be up.
- That a field's baseline run can be held. It cannot — see section 8.
- That the gate improves outcomes on any corpus other than this one.
- That 0.6 / 0.16 are correct for any field other than `recall_title`.
- That zero wrong values is achievable without the abstention rate in section 2.
- That the two unnecessary abstentions in section 1 have been re-measured. The
  mechanism that caused them was changed in `5a16b6f`; the nine variants could not
  be re-run, so "fixed" is a prediction and is written as one.
- That anything in this repository measures Assay against Bright Data. Nothing
  does — `results/headtohead.jsonl` is 9 records and all 9 are `system: "assay"`.
  `docs/HEADTOHEAD.md` §0 is the full statement.
- That the three code-gate rules in section 10 generalise. They are fitted to one
  transcript.

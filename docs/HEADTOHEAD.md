# The variant-testbed protocol, and the arm that has not been run

A stranger with this repo, a deployed testbed and a Bright Data account should be
able to reproduce every number below. That is the only bar this document has to
clear.

## 0. Status, before anything else

**This is not a head-to-head. It is a symmetric harness with one arm run.**

`results/headtohead.jsonl` holds 9 records and every one of them is
`system: "assay"`. Check it:

```bash
node -e 'const r=require("fs").readFileSync("results/headtohead.jsonl","utf8").trim().split("\n").map(JSON.parse);
         const by={}; for(const x of r) by[x.system]=(by[x.system]||0)+1;
         console.log(r.length, by)'
# 9 { assay: 9 }
```

There is no Bright Data arm, so nothing in this repository measures Assay against
Bright Data, and no claim that it does should survive. What exists is three
separate things, and they are worth keeping separate:

1. **A harness that is genuinely symmetric.** `classify()` in
   `tools/headtohead.ts` takes a decision, a published value and the truth. It
   has no parameter for who is being scored — §4 and §7 spell that out, and it is
   checkable in about thirty seconds.
2. **One arm, run.** Assay over 9 pre-registered variants on a deployed testbed
   (<https://assay-testbed.vercel.app>, which anyone can hit). The results are in
   §5a: 7 published correct, 2 abstained correctly, 0 wrong. That table used to
   carry two unflattering abstentions; §5a records what changed and what the
   change is and is not evidence for.
3. **One qualitative case study, not scored.** A single real Bright Data heal was
   driven end to end against a real collector and the transcript is committed —
   `results/bd-heal-transcript.json`, collector `c_mt1nrjboski90goqc`. It was
   **rejected** at the approval gate rather than applied, so no healed value was
   ever published, so there was nothing for `classify()` to grade. §5b is that
   case; §5c is what running the arm properly would take.

The protocol below is written as it was designed, for two arms. Read it as a
specification of the experiment, not a report of one.

---

## 1. What the harness compares

> This section describes the benchmark harness (`npm run bench`, `npm run
> bench:live`), which still runs exactly as written below -- not the live
> product pipeline. `healGated` no longer runs on a real fetch
> (`src/runner.ts`'s header): a live break quarantines unconditionally now,
> and recovery is Bright Data's collector repair, reviewed by a human. The
> comparison below stays meaningful as an offline measurement of the same
> gate arithmetic, evaluated on the same archived corpus either way.

Two self-healing scrapers, given the same broken page, judged on the same
question:

> When the page changes underneath a scraper that was configured earlier, does
> the system publish the right value, publish a wrong value, or refuse to answer?

**Assay** (`src/heal.ts`, `healGated`) ranks every element on the changed page
against a fingerprint captured when the scraper last worked, then applies two
guards: a score floor `tau = 0.6` and a runner-up margin `delta = 0.16`. If the
best candidate is not good enough, or is not clearly better than the second-best,
it abstains.

**Bright Data** (`refactor_template` / AI-Flow, the REST face of the Self-Healing
tool) regenerates the collector's template with an LLM and pauses at a human
approval gate with a `preview_result`.

The intended measurement is not "which one heals more". It is **which one
publishes a wrong value more often**. A heal you cannot trust is worse than no
heal, because a wrong value enters the dataset silently and a null does not.

Two notes on what that measurement is and is not. It is a comparison of *one
mechanism against one mechanism* — a margin gate against an LLM-plus-human gate —
on the narrow question of what happens when the page moves. It is not a
comparison of the two products, which do different jobs: Bright Data fetches
pages through a proxy and anti-bot layer that Assay does not have and does not
try to have, and Assay decides whether a value is safe to publish, which Bright
Data does not do and does not claim to. `docs/BRIGHTDATA-CAPABILITIES.md` §2 and
the README's Bright Data section are the complementary reading; this document is
deliberately the narrow one.

---

## 2. Why the same URL throughout

Healing means *the page changed under a scraper that was configured earlier*. If
you point the scraper at a different URL, you are testing extraction on a new
target, not healing on an old one — the scraper has no prior state to be broken.

So the testbed serves every variant from a stable path, and a variant is a
different DOM at the same address. The baseline fingerprint and stored selector
are captured once, from `/v/baseline/`, and every subsequent variant is scraped
with **that** selector and **that** fingerprint. Bright Data likewise gets one
collector, configured against the baseline, and then the page moves under it.

That is also why `tools/headtohead.ts` establishes the baseline exactly once and
reuses it across every variant, rather than re-picking a target per variant.

---

## 3. Why the mutation set is pre-registered

The nine mutations come from `src/mutate.ts`, which was written months before this
protocol, against real Wayback diffs of IKEA, Mattel and Chicco recall pages.
It was not written to make Assay look good against Bright Data, because Bright
Data was not in the picture when it was written. Check the git history of
`src/mutate.ts` against the git history of this file if you doubt it.

Pre-registration matters because the failure mode of a benchmark like this is
picking the mutations after seeing the results. The set is fixed:

| id | what it does | `expect` |
| --- | --- | --- |
| `rename_class` | prefixes every class | `target` |
| `wrapper_div` | wraps the element in two layout divs | `target` |
| `swap_tag` | `h2 → div`, `a → span` | `target` |
| `reorder_siblings` | reverses sibling order | `target` |
| `strip_id` | removes id + data attrs, and ids up the ancestor chain | `target` |
| `translate_text` | rewrites the whole page's visible text | `target` |
| `remove_field` | deletes the element | **`none`** |
| `duplicate_similar` | inserts a near-identical decoy next to the real thing | **`ambiguous`** |
| `combo_redesign` | wrapper + class rename together | `target` |

`expect` is the ground truth, and the two bold rows are the ones the whole
project is about:

- `remove_field` → **`none`**: nothing on the page is the right answer. Tests `tau`.
- `duplicate_similar` → **`ambiguous`**: two candidates are near-indistinguishable. Tests `delta`.

Every other row is recoverable, and a system that abstains on those is being
uselessly timid — which is what `abstained_unnecessary` counts.

---

## 4. The four outcomes

Scored by one function, `classify()` in `tools/headtohead.ts`, which sees a
decision, a published value and the truth — and nothing about which system
produced them.

| outcome | when |
| --- | --- |
| `published_correct` | published a value, and it matches truth (whitespace-normalised, case-folded) |
| **`published_wrong`** | published a value that is wrong — or published anything at all when truth says nothing was correct |
| `abstained_correct` | refused, and `expect` is `none` or `ambiguous` |
| `abstained_unnecessary` | refused, but the field was recoverable |

**`published_wrong` is the headline number.** Lower is better, for either system.

Two deliberate asymmetries, both stated so they can be argued with:

- On `expect: none`, *any* publish is `published_wrong`. There is no correct value
  to publish, so confidence is the failure.
- On `expect: ambiguous`, abstaining is `abstained_correct` **and** publishing the
  genuinely correct value is `published_correct`. We do not credit a system for
  guessing right, but we do not punish it for it either. Publishing the decoy is
  `published_wrong`.

---

## 5. Running it

The testbed is live at `https://assay-testbed.vercel.app` and needs no
credentials, so every command here is runnable by a stranger with this repo.

```bash
# Assay, all variants in truth.json -- writes to a scratch file, see below
npm run headtohead -- --origin https://assay-testbed.vercel.app --out /tmp/verify.jsonl

# a subset
npm run headtohead -- --origin https://assay-testbed.vercel.app \
  --variants remove_field,duplicate_similar --out /tmp/verify.jsonl

# re-print the table without re-fetching (reads whatever systems are in the file)
npm run headtohead -- --summary-only

# the classifier's own check
npm run headtohead -- --selftest
```

`--out` defaults to `results/headtohead.jsonl`, which is **committed** and is the
file §5a is read off. Verifying a claim should not rewrite the evidence for it, so
pass `--out /tmp/...` unless you mean to record a new measurement.

The harness fetches `<origin>/truth.json` for the scoring key and
`<origin>/v/<variant>/` for each page, with a 15s timeout. It appends one JSON
record per **(variant, system)** to `results/headtohead.jsonl`.

For Bright Data, `tools/bd-heal.ts` drives the REST heal flow and captures a
transcript. It **never auto-approves** — it polls to the approval gate, writes the
transcript, prints the preview, and exits. Approval is a separate, explicit
invocation:

```bash
export BRIGHTDATA_API_TOKEN=...          # never printed, never written to disk

npm run bd:heal -- --collector c_xxx --prompt "the recall title selector no longer resolves"
npm run bd:heal -- --verify           # acceptance check on the captured preview
npm run bd:heal -- --collector c_xxx --approve     # or --reject
```

The Bright Data result is then written into `results/headtohead.jsonl` as a record
with `system: "brightdata"`, and `--summary-only` picks it up. Whether that is
done by hand or by script, it goes through the same `classify()` and prints in the
same table.

**That last paragraph describes a path, not a thing that happened.** No record
with `system: "brightdata"` has ever been written, for the reason in §5b.

### Bright Data's acceptance check is not Assay's margin gate

`tools/bd-heal.ts --verify` applies four rules to a captured preview:
`recall_title` non-null, matches `/(recall|rappel|retirada|alert)/i`, at least 15
characters, and agrees case-insensitively with `title_on_detail`.

That is an **output** check — it looks at a value Bright Data already produced and
asks whether it is shaped like a recall title. Assay's gate is a **confidence**
check — it compares the top two candidate scores from its own ranking and refuses
when they are too close, without ever looking at whether the answer is right.
They are different mechanisms answering different questions. Describing a Bright
Data approval as having "passed the margin gate" would be a false claim about how
that decision was made.

---

## 5a. The one arm that was run: Assay, 9 variants

Nine independent variants, one field (`recall_title`), one system, against a
deployed testbed. Read off `results/headtohead.jsonl`:

| outcome | n | variants |
| --- | --- | --- |
| `published_correct` | 7 | `rename_class`, `wrapper_div`, `swap_tag`, `reorder_siblings`, `strip_id`, `translate_text`, `combo_redesign` |
| `abstained_correct` | 2 | `remove_field`, `duplicate_similar` |
| `abstained_unnecessary` | 0 | — |
| `published_wrong` | 0 | — |

Nine cases is nine cases. It is an anecdote with a scoring rule, and the sample is
far too small to carry a rate. Two things in particular do not follow from this
table. The zero in the fourth row is not the 153-case corpus result restated — it
is nine hand-built pages, and a system that refused all nine would score the same
zero; the third row is what rules that system out here, and nine cases is a weak
place to rule anything out. And the testbed is a page we wrote, deployed and
mutate ourselves, so it is not an independent adversary. There is still no Bright
Data arm (§5b), so this table compares Assay to nothing.

### The prediction in `5a16b6f`, and how it resolved

`wrapper_div` and `combo_redesign` used to land in the third row —
`abstained_unnecessary`, 2 of 9 recoverable fields sent to a human queue for no
reason. `docs/LIMITATIONS.md` §1 is the diagnosis: the benign-tie escape hatch did
not fire, because a third candidate inside the delta band carried different text.

`5a16b6f` changed that. `benign_tie` now asks about the two candidates the margin
actually compared, so a third candidate that was never part of the margin can no
longer veto the answer. At the time of that commit this document said the flip to
`published_correct` was *expected* and had not been measured, because whoever
wrote it concluded from `ASSAY_TESTBED` being unset in `.env` that the testbed was
not deployed. That conclusion was wrong: <https://assay-testbed.vercel.app> was
serving `truth.json` then and serves it now, and `README.md` says CI has been
pointing at it daily throughout. An unset local environment variable is not a
statement about a deployment, and this document should not have read it as one.

**The variants have since been re-run, and the prediction held.** Both now come
back `publish` / `benign_tie` / `published_correct`, at the same margins that used
to fail — 0.0446 for `wrapper_div`, 0.0537 for `combo_redesign`. Reproduce it
without touching the committed records:

```bash
npm run headtohead -- --origin https://assay-testbed.vercel.app --out /tmp/verify.jsonl
```

What that is worth is bounded. It confirms one predicted mechanism change on the
two pages it was predicted for; `test/benign-tie.test.ts` is still the evidence
that the mechanism itself changed, since it fails on the previous implementation
and passes on this one. It is not evidence that the loosening is safe in general —
that argument rests on the corpus, where §1.1 of `docs/LIMITATIONS.md` records the
old and new gates deciding identically across all 153 mutation cases and all 74
replay runs.

## 5b. The arm that was not run, and why

One real heal was driven against a real collector. It is committed in full:
`results/bd-heal-transcript.json`, collector `c_mt1nrjboski90goqc`, prompt naming
`recall_title`, `recall_url` and `date_published` as absent from all 60 records.

What the transcript records, as observation rather than contract:

- The job ran 09:47:00 → 10:05:10 UTC on 2026-08-21 — about **18 minutes** to
  reach `status: "pending_answer"` / `step: "user_approval"`, across 51 polls and
  29 completed steps, six of them `code_fixer` / `step_preview_runner` /
  `css_selector_extractor` cycles.
- It was **rejected**, not approved (`decision.action: "reject"`), for three
  reasons recorded in the transcript. The load-bearing one: the proposal rewrote
  `title_on_detail` to derive from `recall_title` rather than read the detail
  page, and those two fields were the only independent cross-check between the
  listing and detail stages. Making one a function of the other means they can
  never disagree, which retires a real corroboration signal in exchange for a
  populated column. `date_published` came back as a hardcoded null despite being
  named in the prompt, and Bright Data's own preview reported `success: false`.
- The transcript also records a bug on our side rather than theirs: the
  acceptance check reported rule 4 as FAIL, and that rule was *inapplicable* —
  the preview covers only the listing stage, where `title_on_detail` does not
  exist. The rejection does not rest on it.

**So there was no published value to grade.** `classify()` scores a decision, a
published value and the truth; a rejected proposal produces the first and not the
second. Writing a `system: "brightdata"` record from that transcript would mean
inventing an outcome for a value that was never published, which is the exact
failure mode this repository exists to complain about.

The rejection is also a decision *we* made, on one prompt, on one collector. It is
not evidence about how Bright Data's healer performs in general, and it is not
scored as such anywhere.

## 5c. What it would take to run the second arm

Concretely, and it is not much:

1. **The testbed is already deployed** — nine variants at stable paths plus
   `truth.json`, at <https://assay-testbed.vercel.app>, which CI points at daily.
   This step is done: the Assay arm in §5a is a run against it on the current
   gate. Nothing below is blocked on infrastructure.
2. **Nine collectors, or one collector healed nine times.** Each configured
   against `/v/baseline/`, then pointed at one variant. The Self-Healing tool
   works on a scraper *saved in development mode*, so the baseline has to live
   there, not in production.
3. **Nine heals through the approval gate**, at up to 15 minutes each, each one
   producing a code diff the operator accepts or declines. Fields added or
   renamed need a separate **Update Schema** click before Save to Production.
   (Verified against
   <https://docs.brightdata.com/datasets/scraper-studio/self-healing-tool>,
   fetched 2026-08-23.)
4. **Grade what the approved template publishes**, not what the diff proposes —
   write the value it produced into `results/headtohead.jsonl` with
   `system: "brightdata"` and let `--summary-only` tally it.

Step 5 is the one that makes it a real result rather than a second anecdote:
repeat it. Bright Data's heal is an LLM call and is not deterministic (§7.5), and
neither nine cases nor one run of nine cases supports a rate.

---

## 6. Reading `results/headtohead.jsonl`

One JSON object per line. The fields that carry the argument:

| field | meaning |
| --- | --- |
| `system` | `"assay"`, `"brightdata"`, or anything else you add. **A field, never an assumption.** |
| `variant` / `mutation` | which pre-registered mutation was deployed |
| `expect` | `target` \| `none` \| `ambiguous`, from `truth.json` |
| `selector` | the selector captured from the baseline and re-run here |
| `selector_resolved` | what that selector returned on the mutated page (`null` if it did not resolve) |
| `skeleton` | `{before, after, changed}` — structure-only page hash, corroboration only |
| `detect` | `{broken, cause, corroborated, diagnosis}` from `src/detect.ts` |
| `decision` | `publish` \| `abstain` |
| `reason` | `not_broken`, or `healGated`'s reason: `no_candidates`, `below_tau`, `thin_margin`, `benign_tie`, `clear_margin` |
| `raw_decision` | the decision object verbatim, minus the cheerio nodes: `score`, `runner_up`, `margin`, `tau`, `delta`, `candidates_scored`, and the top 3 `ranked` candidates as `{selector, score, value}` |
| `published_value` | what this system would have written to the dataset (`null` on abstain) |
| `truth_value` | the correct value, from `truth.json` |
| `outcome` | one of the four |
| `thresholds` | `{tau, delta}` in force for that record |

`raw_decision` is `null` when no heal was attempted (the selector still worked),
and on the `no_candidates` path it carries `score: null`, `margin: null`,
`candidates_scored: 0` — that branch of `healGated` returns a thin object with no
ranking at all, and the harness reads it with optional chaining precisely because
that is the path this benchmark exists to measure.

Re-running a variant appends a new line; the summary takes the **last** record per
`(variant, system)`. The full history stays in the file.

---

## 7. What would falsify our claim

The claim is narrow: *a runner-up margin lets a healer refuse the cases where it
would otherwise be confidently wrong, and existing self-healing scrapers do not
have one.*

It is falsified by any of the following. **None of these have been tested against
Bright Data**, because the arm that would test them has not been run (§5b). They
are the results we are looking for, listed so that finding one is a success of the
protocol rather than an embarrassment.

1. **Bright Data abstains correctly on `remove_field`.** If its approval gate
   surfaces "I found nothing appropriate" rather than a plausible wrong element,
   then the LLM is already doing the job `tau` does, and the `tau` half of the
   claim is dead.
2. **Bright Data abstains correctly on `duplicate_similar`.** This is the harder
   one and the one we care about most. If the preview shows it declining to choose
   between the real item and the decoy — or flagging the ambiguity to the human at
   the gate — then the `delta` half of the claim is dead too.
3. **Assay's `published_wrong` is not lower than Bright Data's.** If the margin
   gate does not actually reduce wrong publishes on this set, it is not earning
   its complexity.
4. **Assay's `abstained_unnecessary` is high.** A system that refuses everything
   has a `published_wrong` of zero and is worthless. The seven `expect: target`
   variants have to come back as `published_correct`, or the gate is just a
   disguised failure.
5. **The result does not survive re-running.** Bright Data's heal is an LLM call
   and is not deterministic. A one-run difference is an anecdote.

**If Bright Data abstains correctly on `remove_field` and `duplicate_similar`, we
report that and narrow the claim.** The harness is built so that result lands in
the same file, through the same classifier, and prints in the same table as ours —
there is nothing in `tools/headtohead.ts` that can only be true of Assay, and the
`--summary-only` tally is computed from whatever `system` values it finds. Check
`classify()` yourself: it takes a decision, a value and the truth, and it has no
parameter for who is being scored.

---

## 8. Known limits

- **One arm.** The largest limit by a distance: `results/headtohead.jsonl` is 9
  records and all 9 are `system: "assay"`. Everything below is a limit of the
  protocol; this one is a limit of the evidence.
- **Nine cases.** Even the arm that ran is nine cases on one field. No rate
  computed from it means anything, in either direction.
- **Self-owned target.** The testbed is deployed and reproducible, but we wrote
  it, we host it and we choose its mutations. It removes the excuse of "could not
  re-run"; it does not make the nine cases independent evidence.
- **Synthetic target.** The testbed is a page we wrote. The mutations are real
  patterns from Wayback diffs, but the page is not.
- **One field.** `recall_title`. A broader field set would be a stronger result.
- **Different interaction models.** Assay is a library call returning a decision;
  Bright Data is a minutes-scale async job with a human gate. We compare the
  *decision*, not the latency or the ergonomics, and Bright Data's gate is a
  legitimate design choice — the question is what it shows the human at that gate.
- **Bright Data's state machine is partly undocumented.** Only
  `status: "pending_answer"` / `step: "user_approval"` is specified. Everything
  `tools/bd-heal.ts` learns about the other states is empirical, recorded raw in
  the transcript, and should be treated as observation rather than contract.

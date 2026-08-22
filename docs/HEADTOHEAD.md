# Head-to-head protocol: Assay vs. Bright Data self-healing

A stranger with this repo, a deployed testbed and a Bright Data account should be
able to reproduce every number below. That is the only bar this document has to
clear.

---

## 1. What is being compared

Two self-healing scrapers, given the same broken page, judged on the same
question:

> When the page changes underneath a scraper that was configured earlier, does
> the system publish the right value, publish a wrong value, or refuse to answer?

**Assay** (`src/heal.ts`, `healGated`) ranks every element on the changed page
against a fingerprint captured when the scraper last worked, then applies two
guards: a score floor `tau = 0.6` and a runner-up margin `delta = 0.16`. If the
best candidate is not good enough, or is not clearly better than the second-best,
it abstains.

**Bright Data** (`refactor_template` / AI-Flow) regenerates the collector's
template with an LLM and pauses at a human approval gate with a `preview_result`.

The comparison is not "which one heals more". It is **which one publishes a wrong
value more often**. A heal you cannot trust is worse than no heal, because a
wrong value enters the dataset silently and a null does not.

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
comparison, against real Wayback diffs of IKEA, Mattel and Chicco recall pages.
It was not written to make Assay look good on a Bright Data comparison, because
Bright Data was not in the picture when it was written. Check the git history of
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

```bash
# Assay, all variants in truth.json
npm run headtohead -- --origin https://<testbed>.vercel.app

# a subset
npm run headtohead -- --origin https://<testbed>.vercel.app \
  --variants remove_field,duplicate_similar

# re-print the table without re-fetching (reads whatever systems are in the file)
npm run headtohead -- --summary-only

# the classifier's own check
npm run headtohead -- --selftest
```

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

It is falsified by any of the following. None of these are hypotheticals we have
ruled out; they are the results we are looking for.

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

## 8. Known limits of this comparison

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

# Assay

A self-healing scraper that abstains when it is not sure, and measures how often
its heals are wrong.

**Demo video:** _not yet recorded — link goes here._
<!-- TODO(owner): paste the demo recording link on the line above before submitting. -->

Built for the **Into the Scrape-Verse** hackathon (WeMakeDevs x Bright Data,
17-23 Aug 2026).

---

## The break this exists for

When a scraper breaks loudly, everyone notices. The request 500s, the selector
returns nothing, the row count drops to zero, and a healer kicks in.

The breaks that matter are the quiet ones. Here is run 74 from this repo's own
log, `results/events.jsonl`:

```
baseline_value : "Chicco Polly Highchair Recall"
value_now      : "Skip to main content"
```

Nothing errored. Nothing was empty. The selector resolved, the fetch returned a
page, and the same number of rows came back as the day before. An exception
handler never fires. A healer that wakes on errors sleeps through it, and
`"Skip to main content"` lands in your database as a product recall.

Assay caught it without an exception: the value stopped matching the field's
shape and one of its anchors had died. It re-found the title elsewhere on the
page — score 0.9691 against a runner-up of 0.5718 — and published that instead
of the skip link. Had the two candidates been close, it would have published
nothing and said so.

Every self-healing scraper we looked at heals on exceptions or zero results.
That means the quiet failures are not merely unhealed, they are undetected.

## What Assay does about it

**It notices without an exception.** Detection does not wait for an error. It
watches the value's shape against a regex and a minimum length, the null rate
against a robust z-score over history, whether the landmark elements it anchored
to still resolve, and whether multiple independent anchors now disagree with each
other. A layout change alone is recorded as context and never counts as a break
on its own, because sites redesign constantly without breaking anything.

**It refuses to guess.** When a field does break, candidates are ranked by
weighted similarity against a stored fingerprint. The winner is published only if
it clears two gates:

```
score > tau (0.60)   AND   score - runner_up > delta (0.16)
```

The second gate is the point. A candidate can look very much like the thing you
lost and still be the wrong answer, if something else looks nearly as much like
it. When two candidates are that close, picking one is a coin flip, and a coin
flip is not a heal. Assay publishes a labelled hole and asks.

---

## The numbers

[![ci](https://github.com/Vaibhav91one/assay/actions/workflows/ci.yml/badge.svg)](https://github.com/Vaibhav91one/assay/actions/workflows/ci.yml)

That badge is not decoration. The workflow behind it asserts the numbers rather
than the exit codes, and once a day it points the deployed path at a live page
that has been changed underneath it and checks that Assay healed to the right
element or published nothing at all.

**153 benchmark cases. 0 wrong values published by the gated arm. 74 replayed
runs, 66 of them heals, against byte-identical proof records.**

153 cases: ten deterministic mutations applied to real archived pages from three
sites. Ground truth is marked before mutation using an attribute the scorer never
reads, so labelling cannot leak into the score. Three arms, same cases:

| arm | correct value | wrong values published | abstained |
|---|---|---|---|
| naive (first element with the same tag) | 48 | **93** | 12 |
| plain (weighted similarity, no gate) | 117 | **36** | 0 |
| **gated (similarity + margin gate)** | 99 | **0** | 54 |

`npm run bench` reproduces this and reads its numbers from `results/bench.json`.

## Thirty seconds

```bash
npm install
npm run demo
```

One page, two breaks, two different outcomes:

```
--- break the page: rename class ---
gate: score 0.89  margin 0.52  (needs > 0.6 and > 0.16)
decision: HEAL (clear_margin)

{ "recall_title": "A reminder about our 2016 Chest of Drawers recall",
  "_assay": { "fields": { "recall_title": { "status": "healed" } } } }

--- break the page: duplicate a near-identical decoy ---
gate: score 0.93  margin 0.12  (needs > 0.6 and > 0.16)
decision: ABSTAIN (thin_margin)

{ "recall_title": null,
  "_assay": { "fields": { "recall_title": {
      "status": "quarantined", "reason": "thin_margin",
      "held_since_run": "20260804" } } } }
```

Same scraper, same page. One break had a clear winner and healed. One was a coin
flip, so the row shipped a labelled hole instead of a guess — and the row still
shipped, because the other fields were fine.

## Reproduce every number

```bash
npm test          # 34 assertions against the real corpus
npm run bench     # the 153-case benchmark
npm run sweep     # the threshold calibration grid
npm run replay    # 74 runs over the full corpus, rewrites results/events.jsonl
npm run audit     # 6 of 10 promised fields unhealthy, behind a 100%-success run

npx tsx tools/bd-heal.ts --verify   # the code gate over the committed transcript
```

None of those need a Bright Data account or any credential: `npm run audit` and
`--verify` read committed API responses off disk.

`npm run replay` rewriting `results/events.jsonl` to a byte-identical file is
itself the check: `git diff results/` staying empty means the committed evidence
is what the code produces today.

Everything runs offline. The corpus is committed on purpose: 77 archived HTML
captures of three public recall pages, Jan 2024 to Aug 2026, fetched from the
Internet Archive. Without them none of the numbers above are checkable, which for
a project whose entire claim is a measurement would be worse than the 14 MB.
`npm run corpus` refetches them; `corpus/manifest.json` records each capture's
URL, Wayback timestamp and content digest.

## Running the product

```bash
cp .env.example .env
docker compose up -d
docker compose run --rm web npm run db:migrate
```

Then open `http://127.0.0.1:3000/library`, paste a link, press Run, and approve
the table Assay proposes. The catalogue ships four trackers — Amazon, GitHub,
Wikipedia and a generic "any site" — and each one is a starting contract you can
edit, not a fixed scraper.

From there: **Decisions** is the queue of things Assay would not publish alone,
**Runs** is what happened and when, and every published value has a proof record
that opens beside whatever screen you are on and shows the candidates, their
scores, the margin, and the thresholds in force at the time.

Read `web/content/docs/self-host.mdx` before exposing it — see below.

## Bright Data and Assay solve different problems

Assay is not an alternative to Bright Data. It is a gate that runs on top of one.

**Bright Data is the fetch layer** — proxies, anti-bot, and over a thousand
prebuilt scrapers addressed by `dataset_id`. Getting the page, and getting it from
a site that does not want you to have it, is a hard problem Assay does not solve
and does not try to.

**Assay is the gate** — it decides whether a value is safe to publish, and
abstains when it is not. It has no fetch layer worth the name.

The architecture already says this. `src/runner.ts` takes `fetchPage` as a
**parameter**, which is why a Bright Data delivery and a local fetch reach the
identical detection and gating code. As of the prebuilt-scraper work, a prebuilt
scraper is a first-class source: `src/connectors/scrapers.ts` calls the sync and
async endpoints by `dataset_id`, `src/connectors/record.ts` renders the returned
JSON record into a deterministic HTML document, and the webhook receiver in
`src/connectors/brightdata.ts` hands that document to the unmodified engine, which
is never told the bytes were ever JSON. `dist/fingerprint.js` runs the other
direction: `npm run build:fingerprint` emits it from `src/fingerprint.ts`
importing nothing, specifically so it pastes verbatim into a collector's Cheerio
parser — a worker has no module loader — and runs identically in both places. A
test rebuilds it and asserts it stays import-free.

### The evidence that both are needed: `npm run audit`

Collector `c_mt1nrjboski90goqc` (Code worker) scrapes IKEA's product-recall
listing and its detail pages. It ran. It worked.

```
ASSAY FIELD AUDIT   results/j_mt1q17uoq8rkcxd8a.ndjson
60 records returned by Bright Data
platform verdict: 100% success, 0 failed crawls

field                   present  non-null  null-rate  verdict
recall_title               0/60         0     100.0%  ABSENT - schema promised it, collector never emitted it
recall_url                 0/60         0     100.0%  ABSENT - schema promised it, collector never emitted it
title_on_detail           60/60        60       0.0%  ok
date_published             0/60         0     100.0%  ABSENT - schema promised it, collector never emitted it
description               60/60        60       0.0%  ok
product_name               1/60         1      98.3%  SPARSE - 98% null
hazard                     1/60         1      98.3%  SPARSE - 98% null
remedy                    51/60        51      15.0%  ok
image_urls                60/60        37      38.3%  ok
recall_details_url         3/60         3      95.0%  SPARSE - 95% null

SUMMARY
  6 of 10 promised fields are not healthy.
  Bright Data reported this run as 100% successful.
  Nothing in the platform surfaces the 3 fields that never arrived.
```

**This is not a criticism of Bright Data's crawling, which worked.** Sixty pages
were fetched from a site that fights scrapers, and none of them failed. The
finding is narrower and more useful than "it broke": *the job succeeded* and *the
data is right* are different claims, and the platform can only answer the first
one. Six of ten schema-promised fields are unhealthy and three never arrived in
any of the 60 records, behind a green run.

That gap is exactly the shape of gap Assay fills, and it arrived unprompted from
production rather than from a benchmark we wrote. `tools/audit.ts` reads the raw
API response off disk; `results/j_mt1q17uoq8rkcxd8a.ndjson` is that response,
unmodified. Reproduce it with `npm run audit`, no credentials needed.

### Composed, not compared: Assay's gate answers Bright Data's heal

Bright Data's self-healing deliberately does not auto-apply. `refactor_template`
proposes a repair and parks at `pending_answer` / `user_approval`, waiting for a
human. Assay is a decision-maker with a published wrong-value rate. The two sit
either side of the same question, so `src/bd/diffgate.ts` joins them: Bright Data
writes the repair, Assay reads the proposed **collector code** and returns a
verdict, and `tools/bd-heal.ts --approve` refuses when it rejects. The reject path
stays ungated, because refusing a repair is always safe.

Why the code and not the row: the one real heal this repo has driven end to end
produced an output that passed every output-shape rule and was rejected anyway.

```
npx tsx tools/bd-heal.ts --verify
  PASS  recall_title is non-null      PASS  matches /(recall|rappel|...)/i
  PASS  at least 15 chars             N/A   agrees with title_on_detail
  FAIL  code gate (4 finding(s))
  DO NOT ACCEPT  (output: 3 pass, 0 fail, 1 not evaluable; code: reject)
```

The load-bearing finding is `corroboration_collapse`: the repair rewrote
`title_on_detail` to derive from `input.recall_title`, and those two fields were
the only independent cross-check between the listing and the detail stage.
Afterwards they can never disagree, so `anchors_disagree` in `src/detect.ts` goes
permanently silent. The row looks better and the detector is dead — this project's
thesis, pointed at the repair instead of at the data. Also caught:
`date_published` was named in the prompt and came back a hardcoded null, and
`preview.success` was `false`, Bright Data's own verdict sitting unread in the
payload.

**Honest limit, and it is the important one: three rules fitted to n=1.** They
fire correctly on the single transcript this repo has and they are not evidence
about heals nobody has seen. `docs/LIMITATIONS.md` §10 is the full statement.

### A different design, not a worse one

Bright Data's Self-Healing tool is prompt-driven and human-initiated: you type a
request in plain language, it produces a code diff in the editor, and you Accept
or Decline. Refactoring can take up to 15 minutes, added or renamed fields need a
separate **Update Schema** click before Save to Production, and it works on a
scraper saved in development mode. (Verified against
<https://docs.brightdata.com/datasets/scraper-studio/self-healing-tool>, fetched
2026-08-23.)

That is a different set of tradeoffs, not a flaw. A human reading a diff catches
things no threshold reaches, and a code diff is a more honest artifact than a
score. It is also minutes-scale, manual and per-scraper, which is why Assay's gate
is a millisecond-scale function that runs on every field of every row — and why
the two compose better than they compete.

**One thing this repository does not have is a head-to-head.** The harness at
`tools/headtohead.ts` is symmetric — `classify()` has no parameter for who is
being scored — but `results/headtohead.jsonl` holds 9 records and all 9 are
`system: "assay"`. The single real Bright Data heal was rejected rather than
applied, so no published value ever existed to grade. `docs/HEADTOHEAD.md` §0
states that plainly and §5c says what running the second arm would take.

---

## Architecture

Three services: `web` serves and writes decisions, `worker` owns
fetch → detect → heal → gate → publish, and Postgres holds the store. Page
captures live on a mounted volume, content-addressed, so an unchanged page is
the same file and pruning is `rm`.

```
src/fingerprint.ts   describe an element well enough to find it again (imports nothing)
src/heal.ts          weighted similarity, ranking, and the margin gate
src/detect.ts        notice the break before anyone reads the data
src/mutate.ts        ten deterministic mutations with exact ground truth
src/runner.ts        the one pipeline: fetch -> detect -> heal -> gate -> publish
src/library/         the tracker catalogue, and what it proposes for a pasted URL
src/store/           thirteen tables, and the queries the runner needs
src/api/  src/mcp/   the REST surface, and the tool surface for agents
src/connectors/      Bright Data as a source: prebuilt scrapers, webhook, JSON->HTML
src/bd/diffgate.ts   the code gate over a proposed Bright Data repair

tools/bench.ts       the benchmark          tools/sweep.ts     threshold calibration
tools/replay.ts      74 runs over the corpus tools/audit.ts    the Bright Data field audit
tools/selftest.ts    34 assertions          tools/fetch-corpus.ts  Wayback fetcher
tools/bd-heal.ts     drives a heal to the approval gate; never auto-approves
tools/headtohead.ts  the symmetric variant harness (one arm run -- docs/HEADTOHEAD.md)
tools/worker.ts      the worker service entrypoint

web/                 Next 16, App Router: 16 screens and 31 REST routes
results/             every number this README claims, as data
corpus/              77 archived captures
dist/fingerprint.js  generated: the file pasted into Bright Data's worker
```

The prose documentation is in `web/content/docs/` and is served at `/docs` by the
running app.

## Self-hosting

Self-hosting is single-operator. `AUTH_MODE` defaults to `none`, so a clone boots
with no account, no signup and no keys.

**That means it authenticates nobody.** Not "one operator" — no operator check at
all: every screen is served to whoever can open the port, including resolving
held decisions, clearing a brake and editing a contract. Those are the actions
that decide what gets published to your data.

So `docker-compose.yml` publishes `web` on `127.0.0.1:3000` and Postgres on
`127.0.0.1:5432`. The host reaches them; the network the host is on does not.
Assay cannot verify what is in front of it, so it assumes nothing is.

To let other people in, do one of these rather than widening the bind:

- **Put a reverse proxy in front of it** and let the proxy authenticate.
  Terminate TLS there, require auth there, forward to `127.0.0.1:3000`.
- **Set `AUTH_MODE=clerk`**, which is what the hosted instance runs — the sign-in
  screens and the guard in `web/lib/auth.ts` come on.

The hosted instance installs `@clerk/nextjs`, which is deliberately **not** a
dependency here: a self-hoster should not download an auth SDK they will never
load. One seam (`web/lib/auth.ts`) knows which mode is active; nothing else
imports Clerk, and a test enforces that.

Podman and Apple Container are supported too, with the scripts and the two
Apple-specific gotchas written up in `web/content/docs/self-host.mdx`. The Apple
Container path was exercised end to end on 1.0.0 / macOS arm64. **The Docker and
Podman paths are unexercised** — neither runtime is installed on the machine this
was written on; treat the compose file as reviewed, not tested.

---

## Methodology, and what it costs

### The honest trade

The gated arm publishes zero wrong values. It pays for that, and the price is
visible in the per-mutation breakdown.

On `remove_field`, where the element is genuinely gone and the only correct
answer is "I do not know", the ungated healer publishes a wrong value 18 times
out of 18. The gated one abstains 18 out of 18. That is the gate working exactly
as intended.

On `duplicate_similar`, where a near-identical decoy sits beside the real value,
the ungated healer gets 12 right and 6 wrong. The gated one abstains on **all
18**, including the 12 it would have got right. It is over-cautious there, and 36
of the 54 abstentions across the whole benchmark are cases a human now has to
look at that could in principle have been automated.

That is the deal Assay offers: about 24% of breaks land in a review queue that
did not need to, and in exchange the wrong-value count goes from 36 to 0. For
product-recall monitoring, where publishing the wrong hazard for a child's car
seat is worse than publishing nothing, we think that is the right way round. For
a price tracker it might not be. The thresholds are arguments to every tool, so
the trade is yours to set.

### Where the thresholds came from

Both were calibrated, not chosen. `npm run sweep` scores an 11 x 10 grid of
(tau, delta) — 110 pairs — against ranked candidates from the corpus and prints
the wrong-value and correct rates at every point. 0.60 / 0.16 is the point Assay
ships: the wrong-value rate collapses there while the abstention cost is still
affordable. It is not the only point that holds wrong values at zero, so read the
table and not only the recommendation.

The sweep and the benchmark now agree cell for cell on the same 153 cases —
0.0% wrong, 64.7% correct, 35.3% abstained — and the sweep independently
re-derives `tau = 0.6` / `delta = 0.16`. That is newer than it sounds. Until
`0efaa3c` the sweep held a second, drifted copy of the gate's arithmetic that
compared truncated fingerprint text, so it recommended `tau = 0.75` and reported
three wrong values at the shipped thresholds — two of our own tools disagreeing
about the central claim. It now calls the same `decide()` the gate calls, and
`--captures` defaults to 6 in both where the sweep used to default to 4.
`docs/LIMITATIONS.md` §5 has the detail.

### What "correct" means here

Two different notions, reported separately, because the literature conflates
them.

- **Exact node** asks whether the healer found the same DOM element.
- **Value equivalence** asks whether it produced the same string.

The gated arm scores 93 on exact node but 99 on value: six times it picked a
different element that happened to contain the identical text. For scraping,
value is what matters. For test automation, node identity does. Reporting only
the flattering one would be cheating, so both are in `results/bench.json`.

### The gate has never fired on real drift

`results/events.jsonl` holds one proof record per run: 74 records, 8 healthy and
66 heals. Note what is not in there: **zero abstentions**. Two and a half years of
real drift across three sites never once produced a near-tie. Run 51 is typical:
the heal scored 0.8787 against a runner-up of 0.3763, a margin of 0.50 against a
threshold of 0.16.

So the margin gate costs nothing on this corpus and catches nothing on it either.
Every abstention in this project comes from the benchmark, where near-ties are
manufactured deliberately, because that is the only way to test a rare case often
enough to measure it. If you only read `events.jsonl`, the honest summary is that
the gate never had to fire.

### Limitations

`docs/LIMITATIONS.md` is the long version — ten of them, each with the file in
`results/` that shows it: two testbed abstentions that were not necessary and
whose cause was changed but not re-measured, a renamed JSON key that ranks right
and still cannot clear `tau`, three Bright Data code-gate rules fitted to a single
transcript, and the fact that the thresholds are calibrated on this corpus and
nowhere else.

## Design

The full product design lives in Figma — every screen with its loading, error,
warning and empty states, plus a component library:
https://www.figma.com/design/FYnhhLeMulixqTTyjP7gJd/Assay

The design documents are in this repo: `docs/APP-DESIGN.md` (the application
design and its density rules), `docs/CRITIQUE.md` (a three-axis audit of the
wireframes, the implementation path and the engine), `docs/PLATFORM-GAPS.md` and
`docs/STATES.md`. `design/references.html` and `design/variants.html` are local
reference boards.

## Disclosure: AI use

This project was built with heavy use of AI assistance (Claude Code). That
includes the engine implementation, the benchmark harness, the research into
prior art, and this README.

Two things are worth separating from that. The measurements are real: every
number here comes from code in this repo run over data in this repo, and
`npm run bench` will reproduce or contradict them on your machine. And the
central design decision, that a scraper should refuse to publish when two
candidates are too close to call, was arrived at by reading how existing tools
fail and then reproducing one of those failures directly.

Where a claim could not be verified, it is marked as unverified rather than
asserted.

## License

MIT — see [LICENSE](LICENSE).

One dependency is not OSI-licensed, which is worth knowing before you
redistribute: **`@anthropic-ai/claude-agent-sdk`** publishes as
`SEE LICENSE IN README.md`. It powers the conversational surfaces; the rest of
the AI path uses the ordinary Anthropic API SDK, which is MIT. Everything else in
the dependency tree is MIT, ISC or Apache-2.0.

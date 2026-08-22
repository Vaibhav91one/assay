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
npm run audit     # the Bright Data output gap
```

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

## How Bright Data is used

A Scraper Studio collector (`c_mt1nrjboski90goqc`, Code worker) scrapes IKEA's
product-recall listing and its detail pages. `npm run build:fingerprint` emits
`dist/fingerprint.js` from `src/fingerprint.ts`, importing nothing, specifically
so it pastes verbatim into that collector's Cheerio parser — a worker has no
module loader — and runs identically in both places. A test rebuilds that
artifact and asserts it stays import-free.

That collector produced this repo's most useful finding, by failing.

It returned 60 records. Bright Data reported the run as 100% successful, 0 failed
crawls. But three fields the approved schema promises — `recall_title`,
`recall_url` and `date_published` — are absent from all 60 records, and
`product_name` and `hazard` appear in one row each.

A green run and empty columns. That is the same failure this whole project is
about, arriving unprompted from production. `tools/audit.ts` reads the raw API
response off disk and reports the gap;
`results/j_mt1q17uoq8rkcxd8a.ndjson` is that response, unmodified.

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

tools/bench.ts       the benchmark          tools/sweep.ts     threshold calibration
tools/replay.ts      74 runs over the corpus tools/audit.ts    the Bright Data gap
tools/selftest.ts    34 assertions          tools/fetch-corpus.ts  Wayback fetcher
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
affordable. It is not the only point that holds wrong values at zero, and the
grid's own pick moves with how many captures per site it samples
(`--captures`, default 4) — so read the table, not the recommendation.

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

`docs/LIMITATIONS.md` is the long version — eight of them, each with the file in
`results/` that shows it, including two live-run abstentions that were not
necessary and the fact that the thresholds are calibrated on this corpus and
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

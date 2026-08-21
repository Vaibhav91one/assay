# Assay

A self-healing scraper that abstains when it is not sure, and measures how often
its heals are wrong.

Built for the **Into the Scrape-Verse** hackathon (WeMakeDevs x Bright Data,
17-23 Aug 2026).

---

## The problem this is about

When a scraper breaks loudly, everyone notices. The request 500s, the selector
returns nothing, the row count drops to zero, and a healer kicks in.

The breaks that matter are the quiet ones. The selector still resolves. The
request still succeeds. The right number of rows still come back. The value is
just wrong.

Here is a real one from this repo's own run log, run 74:

```
baseline_value : "Chicco Polly Highchair Recall"
value_now      : "Skip to main content"
```

Nothing errored. Nothing was empty. A row-count check sees twelve rows before and
twelve rows after. An exception handler never fires. A healer that only wakes on
errors sleeps through it, and the wrong string lands in your database.

Every self-healing scraper we looked at heals on exceptions or zero results.
That means the quiet failures are not merely unhealed, they are undetected.

## What Assay does differently

Two things.

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
flip is not a heal. Assay publishes nothing and asks.

Both thresholds were calibrated, not chosen. `tools/sweep.js` scans 110 pairs
across an 11 x 10 grid; 0.60 / 0.16 is what came out.

---

## The numbers

135 cases: nine deterministic mutations applied to real archived pages from three
sites. Ground truth is marked before mutation using an attribute the scorer never
reads, so labelling cannot leak into the score.

Three arms, same cases:

| arm | correct | wrong values published | abstained |
|---|---|---|---|
| naive (first element with the same tag) | 48 | **75** | 6 |
| plain (weighted similarity, no gate) | 111 | **24** | 0 |
| **gated (similarity + margin gate)** | 93 | **0** | 42 |

`npm run bench` reproduces this. Numbers are read from `results/bench.json`.

### The honest trade

The gated arm publishes zero wrong values. It pays for that, and the price is
visible in the per-mutation breakdown.

On `remove_field`, where the element is genuinely gone and the only correct answer
is "I do not know", the ungated healer publishes a wrong value 18 times out of 18.
The gated one abstains 18 out of 18. That is the gate working exactly as intended.

On `duplicate_similar`, where a near-identical decoy sits beside the real value,
the ungated healer gets 12 right and 6 wrong. The gated one abstains on **all 18**,
including the 12 it would have got right. It is over-cautious there, and 24 of the
42 abstentions across the whole benchmark are cases a human now has to look at
that could in principle have been automated.

That is the deal Assay offers: about 18% of breaks land in a review queue instead
of being resolved automatically, and in exchange the wrong-value count goes from
24 to 0. For product-recall monitoring, where publishing the wrong hazard for a
child's car seat is worse than publishing nothing, we think that is the right way
round. For a price tracker it might not be. The thresholds are arguments to every
tool, so the trade is yours to set.

### What "correct" means here

Two different notions, reported separately, because the literature conflates them.

- **Exact node** asks whether the healer found the same DOM element.
- **Value equivalence** asks whether it produced the same string.

The gated arm scores 87 on exact node but 93 on value: six times it picked a
different element that happened to contain the identical text. For scraping,
value is what matters. For test automation, node identity does. Reporting only
the flattering one would be cheating, so both are in `results/bench.json`.

---

## How Bright Data is used

A Scraper Studio collector (`c_mt1nrjboski90goqc`, Code worker) scrapes IKEA's
product-recall listing and its detail pages. `src/fingerprint.js` imports nothing
specifically so it pastes verbatim into that collector's Cheerio parser and runs
identically in both places.

That collector produced this repo's most useful finding, by failing.

It returned 60 records. Bright Data reported the run as 100% successful, 0 failed
crawls. But three fields the approved schema promises, `recall_title`,
`recall_url` and `date_published`, are absent from all 60 records, and
`product_name` and `hazard` appear in one row each.

A green run and empty columns. That is the same failure this whole project is
about, arriving unprompted from production.

`tools/audit.js` reads the raw API response off disk and reports the gap.

---

## Reproduce it

```bash
npm install
npm test          # 26 assertions against the real corpus
npm run bench     # the 135-case benchmark
npm run sweep     # the threshold calibration
npm run replay    # 74 runs over the full corpus, writes results/events.jsonl
npm run audit     # the Bright Data output gap
```

Everything runs offline. The corpus is committed on purpose: 77 archived HTML
captures of three public recall pages, Jan 2024 to Aug 2026, fetched from the
Internet Archive. Without them none of the numbers above are checkable, which for
a project whose entire claim is a measurement would be worse than the 14 MB.

`npm run corpus` refetches them from scratch; `corpus/manifest.json` records each
capture's URL, Wayback timestamp and content digest.

## Layout

```
src/fingerprint.js   describe an element well enough to find it again (zero imports)
src/heal.js          weighted similarity, ranking, and the margin gate
src/detect.js        notice the break before anyone reads the data
src/mutate.js        nine deterministic mutations with exact ground truth
src/sites.js         the three locked targets

tools/bench.js       the benchmark          tools/sweep.js     threshold calibration
tools/replay.js      74 runs over the corpus tools/audit.js    the Bright Data gap
tools/selftest.js    26 assertions          tools/fetch-corpus.js  Wayback fetcher

results/             every number this README claims, as data
corpus/              77 archived captures
```

## Example output

`results/events.jsonl` holds one proof record per run: 74 records, 50 healthy and
24 heals. Each carries the candidates considered, their scores, the margin, the
thresholds in force, and a hash of the last known-good value.

Note what is not in there: **zero abstentions**. Two and a half years of real
drift across three sites never once produced a near-tie. Genuine site changes
tend to be decisive, and when the page moved the right answer usually won by a
wide margin. Run 51 is typical: the heal scored 0.8787 against a runner-up of
0.3763, a margin of 0.50 against a threshold of 0.16.

So the margin gate costs nothing on this corpus and catches nothing on it either.
Every abstention in this project comes from the benchmark, where near-ties are
manufactured deliberately, because that is the only way to test a rare case
often enough to measure it. If you only read `events.jsonl`, the honest summary
is that the gate never had to fire.

`results/j_mt1q17uoq8rkcxd8a.ndjson` is Bright Data's unmodified API response.

---

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

MIT

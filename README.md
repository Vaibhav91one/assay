# Assay

[![ci](https://github.com/Vaibhav91one/assay/actions/workflows/ci.yml/badge.svg)](https://github.com/Vaibhav91one/assay/actions/workflows/ci.yml)

A self-healing scraper that abstains when it is not sure, and measures how often
its heals are wrong.

That badge is not decoration. The workflow behind it asserts the numbers rather
than the exit codes -- 34 assertions, 153 benchmark cases at 0.0% wrong, 74
replayed runs against byte-identical proof records -- and once a day it points
the deployed path at a live page that has been changed underneath it and checks
that Assay healed to the right element or published nothing at all.

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

Both thresholds were calibrated, not chosen. `tools/sweep.ts` scans 110 pairs
across an 11 x 10 grid; 0.60 / 0.16 is what came out.

---

## The numbers

153 cases: ten deterministic mutations applied to real archived pages from three
sites. Ground truth is marked before mutation using an attribute the scorer never
reads, so labelling cannot leak into the score.

Three arms, same cases:

| arm | correct | wrong values published | abstained |
|---|---|---|---|
| naive (first element with the same tag) | 48 | **93** | 12 |
| plain (weighted similarity, no gate) | 117 | **36** | 0 |
| **gated (similarity + margin gate)** | 99 | **0** | 54 |

`npm run bench` reproduces this. Numbers are read from `results/bench.json`.

### The honest trade

The gated arm publishes zero wrong values. It pays for that, and the price is
visible in the per-mutation breakdown.

On `remove_field`, where the element is genuinely gone and the only correct answer
is "I do not know", the ungated healer publishes a wrong value 18 times out of 18.
The gated one abstains 18 out of 18. That is the gate working exactly as intended.

On `duplicate_similar`, where a near-identical decoy sits beside the real value,
the ungated healer gets 12 right and 6 wrong. The gated one abstains on **all 18**,
including the 12 it would have got right. It is over-cautious there, and 36 of the
54 abstentions across the whole benchmark are cases a human now has to look at
that could in principle have been automated.

That is the deal Assay offers: about 24% of breaks land in a review queue instead
of being resolved automatically, and in exchange the wrong-value count goes from
36 to 0. For product-recall monitoring, where publishing the wrong hazard for a
child's car seat is worse than publishing nothing, we think that is the right way
round. For a price tracker it might not be. The thresholds are arguments to every
tool, so the trade is yours to set.

### What "correct" means here

Two different notions, reported separately, because the literature conflates them.

- **Exact node** asks whether the healer found the same DOM element.
- **Value equivalence** asks whether it produced the same string.

The gated arm scores 93 on exact node but 99 on value: six times it picked a
different element that happened to contain the identical text. For scraping,
value is what matters. For test automation, node identity does. Reporting only
the flattering one would be cheating, so both are in `results/bench.json`.

---

## How Bright Data is used

A Scraper Studio collector (`c_mt1nrjboski90goqc`, Code worker) scrapes IKEA's
product-recall listing and its detail pages. `npm run build:fingerprint` emits
`dist/fingerprint.js` from `src/fingerprint.ts`, importing nothing, specifically
so it pastes verbatim into that collector's Cheerio parser -- a worker has no
module loader -- and runs identically in both places. A test rebuilds that
artifact and asserts it stays import-free.

That collector produced this repo's most useful finding, by failing.

It returned 60 records. Bright Data reported the run as 100% successful, 0 failed
crawls. But three fields the approved schema promises, `recall_title`,
`recall_url` and `date_published`, are absent from all 60 records, and
`product_name` and `hazard` appear in one row each.

A green run and empty columns. That is the same failure this whole project is
about, arriving unprompted from production.

`tools/audit.ts` reads the raw API response off disk and reports the gap.

---

## Reproduce it

```bash
npm install
npm run demo      # 30 seconds: one break heals, one publishes a labelled hole
npm test          # 34 assertions against the real corpus
npm run bench     # the 153-case benchmark
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

## Self-hosting

Three services: `web` serves and writes decisions, `worker` owns
fetch → detect → heal → gate → publish, and Postgres holds the store. Page
captures live on a mounted volume, content-addressed, so an unchanged page is
the same file and pruning is `rm`.

### Accounts

Self-hosting is single-operator. `AUTH_MODE` defaults to `none`, so a clone
boots with no account, no signup and no keys — you are already behind whatever
access control fronts the box.

The hosted instance sets `AUTH_MODE=clerk` and installs `@clerk/nextjs`, which
is deliberately **not** a dependency here: a self-hoster should not download an
auth SDK they will never load. One seam (`web/lib/auth.js`) knows which mode is
active; nothing else imports Clerk, and a test enforces that.

The sign-in screens in the design belong to the hosted path only.

Copy `.env.example` to `.env` first. Pick whichever runtime you already have —
the image is the same OCI build in all three cases.

### Docker Compose — works everywhere

```bash
docker compose up -d
docker compose run --rm web npm run db:migrate
```

The canonical path, and the one a Linux VPS should run.

### Podman — rootless, no daemon

```bash
podman compose up -d
podman compose run --rm web npm run db:migrate
```

Compose files are portable, so this is the same file.

### Apple Container — Apple Silicon Macs

Apple's `container` (1.0.0) runs Linux containers in lightweight VMs with no
daemon. Apple [declined to make Compose a core
feature](https://github.com/apple/container/pull/239), and the community shims
are immature, so Assay ships plain `container` CLI scripts instead of depending
on one:

```bash
./scripts/container-up.sh          # build, start postgres, migrate, start web
./scripts/container-down.sh        # stop; volumes survive
./scripts/container-down.sh --volumes   # stop and delete data
```

Ports are overridable if 5432 or 3000 are already taken:

```bash
ASSAY_PGPORT=55432 ASSAY_WEBPORT=53000 ./scripts/container-up.sh
```

**This is macOS on Apple Silicon only** — a fine local-development and
Mac-self-host path, not a substitute for a Linux host in production.

### Two things that differ under Apple Container

Both are handled by the scripts; they are documented because they will bite
anyone adapting them.

**No container-name DNS.** Compose gives you `postgres` as a hostname for free.
Apple Container does not resolve container names, and the only name-based
alternative (`container system dns create`) requires administrator rights —
which a self-host script has no business demanding. `container-up.sh` reads the
address off the running container with `container inspect` and builds
`DATABASE_URL` from it.

**Volumes are real filesystems.** They carry a `lost+found`, so `initdb`
refuses to use the mount point directly as its data directory. Both the compose
file and the script set `PGDATA` to a subdirectory, which is the Postgres
image's own recommendation and is harmless everywhere.

### Verified, and not

`container-up.sh` was exercised end to end on Apple Container 1.0.0 / macOS
arm64: image builds, Postgres becomes ready, migrations apply, all seven tables
land, `GET /` returns 200 and `/api/health` reports the store reachable.
Re-running is idempotent, and teardown keeps volumes unless asked otherwise.

**The Docker and Podman paths are unexercised** — neither runtime is installed
on the machine this was written on. The compose file is the D1 shape plus the
`PGDATA` fix; treat it as reviewed, not tested.

`tools/worker.ts` is now the `worker` service's entrypoint in both
`docker-compose.yml` and `scripts/container-up.sh`.

## Design

The full product design lives in Figma — 44 wireframes organized as 18 user flows
(every screen with its loading, error, warning and empty states; no placeholder
affordances), plus a component library: 
https://www.figma.com/design/FYnhhLeMulixqTTyjP7gJd/Assay

The design documents are in this repo: `docs/APP-DESIGN.md` (the application design and
its density rules), `docs/CRITIQUE.md` (a three-axis audit of the wireframes, the
implementation path, and the engine), `docs/PLATFORM-GAPS.md`, and `docs/STATES.md`.
`design/references.html` and `design/variants.html` are local reference boards.

## Layout

```
src/fingerprint.ts   describe an element well enough to find it again (imports nothing)
src/heal.ts          weighted similarity, ranking, and the margin gate
src/detect.ts        notice the break before anyone reads the data
src/mutate.ts        ten deterministic mutations with exact ground truth
src/runner.ts        the one pipeline: fetch -> detect -> heal -> gate -> publish
src/store/           twelve tables, and the queries the runner needs
src/api/  src/mcp/   the read-only REST surface, and the tool surface for agents

tools/bench.ts       the benchmark          tools/sweep.ts     threshold calibration
tools/replay.ts      74 runs over the corpus tools/audit.ts    the Bright Data gap
tools/selftest.ts    34 assertions          tools/fetch-corpus.ts  Wayback fetcher

web/                 Next 16, App Router -- REST routes today, screens next
results/             every number this README claims, as data
corpus/              77 archived captures
dist/fingerprint.js  generated: the file pasted into Bright Data's worker
```

## Example output

`results/events.jsonl` holds one proof record per run: 74 records, 8 healthy and
66 heals. Each carries the candidates considered, their scores, the margin, the
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

MIT — see [LICENSE](LICENSE).

### Two dependencies are not OSI-licensed

Worth knowing before you redistribute, because you would otherwise find out from
a lawyer rather than from us:

- **GSAP** ships under its Standard "no charge" licence, not an OSI-approved
  one. It is free to use, including the plugins that were formerly paid, but it
  is not open source. It is used for four animated moments and nothing else, so
  removing it costs you those animations and nothing structural.
- **`@anthropic-ai/claude-agent-sdk`** publishes as `SEE LICENSE IN README.md`.
  It powers the conversational surfaces; the rest of the AI path uses the
  ordinary Anthropic API SDK, which is MIT.

Everything else in the dependency tree is MIT, ISC or Apache-2.0.

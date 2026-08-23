<h1 align="center">
  <img src="web/public/brand/assay-mark.svg" alt="Assay" width="120">
  <br>
  Assay
  <br>
  <small>A scraper that abstains when it is not sure.</small>
</h1>

<p align="center">
  <a href="https://github.com/Vaibhav91one/assay/actions/workflows/ci.yml"><img src="https://github.com/Vaibhav91one/assay/actions/workflows/ci.yml/badge.svg" alt="ci"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT"></a>
</p>

Assay is a self-healing scraper that refuses to guess. When a page changes, it
ranks replacement candidates — and publishes only a clear winner. Everything
else becomes a labelled hole and a question in a review queue, never a wrong
value in your warehouse. It also measures how often its own heals are wrong,
and ships the numbers.

Built for the **Into the Scrape-Verse** hackathon (WeMakeDevs × Bright Data,
17–23 Aug 2026).

**Demo video:** not recorded yet. Until it is, `npm run demo` is the
thirty-second version — one `npm run corpus` fetch, then it runs offline.
<!-- TODO(owner): paste the demo recording link on the line above before submitting. -->

## The break this exists for

The breaks that matter are the quiet ones. Run 74 from this repo's own log:

```
baseline_value : "Chicco Polly Highchair Recall"
value_now      : "Skip to main content"
```

Nothing errored, nothing was empty, the row count held — so every
exception-driven healer sleeps through it while a skip link lands in your
database as a product recall. Assay caught it without an exception (the value's
shape broke and an anchor died), re-found the title at score 0.9691 against a
runner-up of 0.5718, and published it. Had the two been close, it would have
published nothing and said so.

## The numbers

**153 benchmark cases. 0 wrong values published by the gated arm. 74 replayed
runs, 66 of them heals, against byte-identical proof records.**

Ten deterministic mutations over real archived pages from three sites; ground
truth marked before mutation with an attribute the scorer never reads. Three
arms, same cases:

| arm | correct value | wrong values published | abstained |
|---|---|---|---|
| naive (first element with the same tag) | 48 | **93** | 12 |
| plain (weighted similarity, no gate) | 117 | **36** | 0 |
| **gated (similarity + margin gate)** | 99 | **0** | 54 |

A candidate is published only if `score > 0.60` **and** it leads the runner-up
by `> 0.16`. The second gate is the point: the confident wrong answer is the
failure mode that never raises an exception. The cost is honest too — the gated
arm hands ~24% of breaks to a human instead of automating them.

```bash
npm run corpus     # once: fetches the archived captures, digest-pinned
npm run bench      # reproduces the table from results/bench.json
npm test           # engine self-test, no database
npm run replay     # rewrites results/events.jsonl byte-identically
```

The corpus is not committed — `npm run corpus` re-fetches every capture pinned
by timestamp and content digest, so the numbers are still checkable, one fetch
away instead of one checkout away.

## Thirty seconds

```bash
npm install
npm run corpus     # fetch the archived pages the demo breaks
npm run demo
```

One page, two breaks, two outcomes:

```
--- rename a class ---            decision: HEAL    (clear_margin)
--- duplicate a near-decoy ---    decision: ABSTAIN (thin_margin)
```

The abstain writes `null`, opens a review item, and records why. Nothing is
ever silently guessed.

## Running the product

```bash
docker compose up                       # web on 127.0.0.1:3000, worker, postgres
npm run apikey -- my-key                # mint a key for the REST API
```

The web UI is chat-first: paste a URL, confirm the proposed fields, and every
run gets a full decision trace with a shareable proof page. Docs live in the
app at `/docs` — including the [API reference](web/content/docs/api-reference.mdx),
[MCP server](web/content/docs/mcp.mdx) (27 tools for Claude/Codex),
[CLI](web/content/docs/cli.mdx), and a [glossary](web/content/docs/glossary.mdx).
Read [`/docs/self-host`](web/content/docs/self-host.mdx) before exposing it —
self-hosted mode authenticates nobody by design.

Deeper material in [`docs/`](docs/): [architecture](docs/APP-DESIGN.md),
[limitations](docs/LIMITATIONS.md), [prior art](docs/PRIOR-ART.md), and the
[Bright Data head-to-head](docs/HEADTOHEAD.md) — where an audit found 6 of 10
promised fields unhealthy behind a run the platform called 100% successful.

## Disclosure: AI use

Built with heavy use of AI assistance (Claude Code) — engine, benchmark
harness, and this README included. The measurements are real: every number
comes from code in this repo run over data the repo pins by digest, and `npm run bench`
will reproduce or contradict them on your machine. Claims that could not be
verified are marked unverified rather than asserted.

## License

MIT — see [LICENSE](LICENSE). Redistributors should know the tree is not
uniformly permissive: `@anthropic-ai/claude-agent-sdk` ships under its own
licence, and `sharp` (LGPL-3.0 libvips), `lightningcss` (MPL-2.0), `elkjs`
(EPL-2.0) and `caniuse-lite` (CC-BY-4.0) ride in via Next/Vite/mermaid.
Re-derive on your platform: `npm ls sharp lightningcss elkjs`.

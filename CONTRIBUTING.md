# Contributing to Assay

Assay refuses to publish a value it cannot justify. Contributions are held to
the same standard: **claims about detection or healing need measurements, not
arguments.**

## The invariants

These numbers are the product's argument. CI asserts each one on every push, and
a change that moves them has broken the thing being built — not merely a test.

| Command | Must produce |
|---|---|
| `npm test` | 34 assertions, ending `all checks pass` |
| `npm run bench` | 153 cases; gated arm at **0.0% wrong values** |
| `npm run replay` | 74 runs, 8 ok, 66 heals, **0 abstentions** |
| `git diff results/events.jsonl` | empty — proof records are byte-identical |
| `ASSAY_REQUIRE_DB=1 npx vitest run` | 374 passing |
| `npx tsc --noEmit` | clean, strict, whole repo |

One more, load-bearing:

- **`dist/fingerprint.js` imports nothing.** It has to paste verbatim into
  Bright Data's Cheerio worker, which has no module loader, and run identically
  in both places. `npm run build:fingerprint` emits it from
  `src/fingerprint.ts`; the vitest run rebuilds and checks it, so a
  checked-in artifact can never go stale against its source.
- **All CLIs keep working.** They resolve the corpus by relative path; moving
  files breaks them silently.

If your change is *supposed* to move a number, say so in the commit body and
show the before and after. Refactors prove themselves by moving nothing: build
alongside, diff the output, then replace.

## Running it

```bash
npm install
npm test          # engine assertions, no database needed
npm run bench     # the 153-case benchmark
npm run demo      # publishes a hole instead of a lie, in about 30 seconds
```

The engine needs no database. The store, API, MCP server and worker do:

```bash
docker compose up -d postgres          # or: ./scripts/container-up.sh
export DATABASE_URL=postgres://postgres:assay@localhost:5432/assay
npm run db:migrate
ASSAY_REQUIRE_DB=1 npx vitest run
```

**Database-backed tests early-return when Postgres is absent, which vitest
reports as passed, not skipped** — the test count is identical either way. Set
`ASSAY_REQUIRE_DB=1` to turn that vacuous green into a failure. CI always sets it.

## Architecture

Two processes over one Postgres, and Next never runs a scrape:

- **`web`** serves and writes decisions.
- **`worker`** owns fetch → detect → heal → gate → publish.

A scrape holds a request open and competes with page loads, which is why it does
not belong in a route handler even self-hosted, where no timeout applies.
`src/runner.ts` takes `fetch` as a parameter, so the local worker and the Bright
Data webhook path run identical detection and gating. Page captures live on a
bind-mounted volume, content-addressed by digest — never in the database.

## Commits

Lowercase `type(scope): sentence`, where the sentence says what changed and the
body says why:

```
fix(heal): a tie is only benign if the FULL values agree, not their first 200 chars
```

Types in use: `feat`, `fix`, `refactor`, `test`, `docs`, `data`, `chore`,
`design`. Keep each commit revertable on its own.

## What gets refused

Some things are deliberately absent, and a PR adding one needs to argue against
the reasoning in `docs/FEATURES.md` §4 rather than around it:

- **A confidence percentage on any cell.** A float relocates the abstain decision
  to whoever cares least about it. The status vocabulary is a closed set.
- **Any silent fallback** — no type defaults, no coercion, no quietly reading the
  second-best candidate. A required integer becoming `0` is indistinguishable
  downstream from a real zero. It is an absence, not a setting.
- **A tool that lets a model resolve a queue item.** A model nominates an element
  reference and clears the same two gates, or the cell stays held.
- **A "loosen this threshold" control in an alert.** Thresholds change in a PR,
  with a reviewer.

## Reporting a wrong heal

This is the failure mode that matters most here, and it has its own issue
template. Include the `proof_id` from the published row's `_assay` block —
everything else can be reconstructed from it.

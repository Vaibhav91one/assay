# Changelog

All notable changes to this project are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project has not cut a release yet; everything below is unreleased.

A note on the numbers in this file: they come from `npm run bench` and
`npm run replay` on the committed corpus, and CI asserts them on every push.
Where a change moved a number, the change says so.

## [Unreleased]

### Added — the product around the engine

- **Postgres store** with content-addressed page captures. Six tables
  (`targets`, `captures`, `runs`, `field_runs`, `episodes`, `queue_items`) and
  thirteen indexes. Captures dedupe by digest: the 74-run corpus stores about a
  dozen distinct pages, and pruning is `rm`. (`3e11720`)
- **Runner** — `src/runner.js` owns fetch → detect → heal → gate → publish and
  takes `fetch` as a *parameter*, so a local worker and a Bright Data webhook
  share identical detection and gating rather than forking the logic. (`94c0857`)
- **Read-only REST** over the store, with consumer API keys hashed at rest and
  accepted only via the `Authorization` header — a query parameter would put
  credentials in access logs. (`887b717`)
- **Signed webhooks** — `t=<unix>,v1=<hmac>` over `<t>.<body>`, with the
  timestamp inside the signed string so a captured payload cannot be replayed
  under a fresh one. One message per break episode per field. (`f155bee`)
- **MCP server** over stdio. Eight tools. There is deliberately **no
  `assay_resolve`**: a model nominates an element reference and clears the same
  two gates, or the cell stays held. `assay_propose` scores against the
  *persisted* ranked list and the capture the queue item is about — re-fetching
  would score a different page and be silently wrong. (`5b25334`)
- **Worker and scheduling** — a poll loop over `next_run_at`, claiming targets
  with `FOR UPDATE SKIP LOCKED` so two workers cannot double-book one. No jobs
  table and no broker: real load is roughly 0.07 jobs per minute. (`f6b5e8f`,
  `1e9823c`)
- **Email delivery** via Resend, with the subject line carrying the withheld
  count — `12 changes, 2 withheld`, never a bare count. (`f6b5e8f`)
- **Three container runtimes from one OCI image** — Docker Compose as the
  canonical path, Podman from the same file, and Apple Container driven by plain
  `container` CLI scripts rather than a community compose shim. (`f104157`,
  `2c9bbc6`)
- **Design tokens read out of Figma and committed** — 23 variables and 20 text
  styles emitted as CSS custom properties, so a self-hoster with no Figma token
  can still build. (`2cce84e`)
- **Auth seam** — `AUTH_MODE` defaults to `none`, so a clone boots with no
  account and no keys. `@clerk/nextjs` is not a dependency; it loads through a
  dynamic import behind a variable specifier, and a test walks the filesystem to
  assert only the two seam files ever name it. (`f04568a`)
- **Tailwind 4 and shadcn wired to the Figma tokens** rather than to shadcn's own
  generated palette, so `shadcn add` produces an on-brand component. (`9778ffd`,
  `6e9a504`)
- **Trust envelope** — a held field is `null` *and* labelled, never omitted and
  never filled. `npm run demo` publishes a hole instead of a lie. (`51dbaa3`)

### Fixed — bugs the audits found, each verified against code

- **`benign_tie` compared truncated text.** Fingerprints store the first 200
  characters, and the tie check compared *those* while publishing the full value
  — a wrong-publish path inside the safety mechanism itself. Now compares full
  element text. A new `duplicate_longtail` mutation pins it: before the fix the
  gated arm published **3 wrong values**; after, it abstains on all three.
  The benchmark grew **135 → 153 cases** and the gated arm held at **0 wrong
  values**. (`67cd3d1`)
- **`golden_sha256` hashed the value, not the page** — in two files, and
  truncated to 16 hex characters, which is 64 bits in a field named sha256.
  Now the full digest of a capture that is actually stored. (`30a7875`)
- **`JSON.stringify(/x/i)` is `{}`.** Contract patterns were RegExp literals, so
  writing a contract to a `jsonb` column silently destroyed them. Every consumer
  reading a contract back from the store was affected, not just the worker.
  Patterns are strings with separate flags now. (`0ba92e4`)
- **The detector's history could not be rebuilt from the store.** A healthy run
  keeps no capture, so `page_bytes` had no source, and an inner join dropped
  skipped runs entirely — handing the robust z-score a series with holes and no
  error to show for it. (`f6b5e8f`)
- **Run ids disagreed with themselves** — the envelope carried the Postgres
  serial while `held_since_run` carried a loop counter. One canonical id now,
  reserved before the run is evaluated. (`304a9ed`)
- **The benchmark leaked its own answer key.** `data-assay-truth` was visible in
  the HTML handed to every arm. Stripped before serialisation, with a canary that
  fails the run if it ever reappears. Arm numbers are byte-identical before and
  after, which proves no arm was reading it. (`991648e`)
- **`pickTarget` was duplicated seven times.** One resolver in `src/target.js`.
  (`ffbb3df`)

### Added — detection

- **Page-size signal.** A page that shrinks against its own history now fires
  `page_shrunk`, through the same median-and-MAD path as the null rate. On the
  real corpus it fires only on runs already known to be broken. (`fcc329c`)

### Documentation

- `docs/CRITIQUE.md` — a three-axis audit of the wireframes, the implementation
  path and the engine, every claim carrying evidence and every proposed fix
  carrying the measurement that would validate it.
- `docs/DEV-PLAN.md`, `docs/STACK.md`, `docs/PLATFORM-GAPS.md`, `docs/STATES.md`,
  and the application design in `docs/APP-DESIGN.md`.
- `LICENSE` — the MIT licence the README and `package.json` had both been
  promising. (`d01655d`)

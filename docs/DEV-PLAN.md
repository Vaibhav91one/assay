# Dev plan — starting the application

What it takes to begin building, **excluding UI implementation**, which waits on the
design. Audited 2026-08-22 by reading the code, not the docs. Where code and doc
disagree, the code wins and the disagreement is recorded.

> **Read the extensions below as `.ts`.** The repo was JavaScript when this was written
> and is TypeScript now — see `docs/STACK.md` §0. Every file named `src/x.js` here is
> `src/x.ts` today; the reuse verdicts and the reasoning are unaffected, because the
> migration changed no behaviour and the invariants are identical either side of it.
> For the authoritative list of who may edit which path, see `docs/DEV-OWNERSHIP.md`.

---

## 1. Current state

**The engine is done and is the good news.** 846 lines across six modules, 34 assertions
passing, 153-case benchmark with the gated arm at 0 wrong values.

The property that matters for the app: **`src/` has almost no dependencies.** Only
`src/heal.js:15` imports anything from npm (`fastest-levenshtein`). Nothing in `src/`
imports cheerio — `$` is always a parameter. So the whole engine is portable into a Next
server runtime with one dependency, and `src/fingerprint.js` is genuinely zero-import as
its header claims (verified: no `import` or `require` in the file).

| Module | Reuse verdict |
|---|---|
| `src/fingerprint.js` | **As-is.** Zero imports, pure over `$`. Bundles untouched |
| `src/detect.js` | **As-is.** Zero imports, pure |
| `src/heal.js` | **As-is.** One npm dep |
| `src/envelope.js` | **As-is.** Zero imports, pure |
| `src/mutate.js` | **As-is**, but bench/test only — not app code |
| `src/sites.js` | **Replace.** Hardcoded corpus targets; becomes rows in the store |
| `tools/*.js` | **CLI-shaped.** See below |

### Findings the docs get wrong or miss

**`golden_sha256` hashes the value, not the page — in two places, not one.**
CRITIQUE §2.1 cites `tools/run.js:164`; the line has drifted to **`tools/run.js:175`**,
and the same bug exists uncited at **`tools/replay.js:119`** (`sha(baselineValue)`). Both
truncate to 16 hex — 64 bits in a field named sha256 (`run.js:31`, `replay.js:24`,
`demo.js:20`). FEATURES F7 promises the queue card renders "the frozen page… captured and
hashed". Today nothing captures a page and the hash is of a string.

**`replay.js` never publishes an envelope.** `grep -c publishRow` → `replay.js: 0`, while
`run.js: 3`, `demo.js: 2`, `selftest.js: 5`. Its own header says "this is what the
dashboard reads", but it emits events with no per-field status. So F4/F13 — the feature
FEATURES §3 calls *the* product — is wired into the demo path and not into the path that
generates the operational history. Fix this during the runner extraction, not before.

**`pickTarget` is duplicated seven times**, not four. `tools/demo.js:22` carries a
`ponytail:` comment predicting "extract if a fifth appears"; the actual count across
`bench, demo, run, diagnose, replay, heal-demo, sweep` is seven. It is target-selection
logic hardcoded to the recall corpus — in the product it becomes a field contract.

---

## 2. The blocking dependency: the store

Everything else is downstream. Five drawn features (backfill, blast radius, unheal,
decide-once, the frozen queue card) and `assay_propose` all read persisted state that does
not exist.

### Recommended: SQLite for rows, content-addressed files for captures

One store, not two. `better-sqlite3` (synchronous, one dep, no server) plus gzipped
capture files on disk. Rationale: self-host is the primary tier per APP-DESIGN §7, SQLite
needs no infrastructure, and content-addressing makes retention trivial — an unchanged
page is the same filename, so the 74-run corpus stores ~a dozen captures, not 74. Pruning
is `rm`. Postgres becomes worth it only when a hosted tier needs concurrent writers; the
schema below is portable, so that is a swap, not a rewrite.

```
captures/<sha256>.html.gz          -- content-addressed, gzip via node:zlib
assay.db                            -- SQLite
```

```sql
targets(target_id PK, url, cadence, contract JSON, created_at);
captures(sha256 PK, url, fetched_at, bytes INT, pruned INT DEFAULT 0);
runs(run_id PK, target_id, capture_sha, skeleton_hash, started_at, status);
field_runs(run_id, field, value TEXT NULL, status, reason,
           proof_id TEXT UNIQUE, ranked JSON NULL,
           PRIMARY KEY(run_id, field));
episodes(episode_id PK, target_id, field, cause, opened_run, closed_run NULL);
queue_items(item_id PK, proof_id REFERENCES field_runs(proof_id),
            stakes_rows INT, group_key, resolved_by NULL, resolution NULL, ts);
CREATE INDEX ON field_runs(status);              -- the held-cells query
CREATE INDEX ON field_runs(proof_id);            -- the warehouse join
CREATE INDEX ON runs(target_id, started_at);     -- run history per target
CREATE INDEX ON episodes(target_id, field, closed_run);
```

Three rules that fall out of the schema:

- **`golden_sha256` becomes the capture's full digest**, and the capture is actually
  stored. Fixes the finding above and makes the frozen-page queue card buildable.
- **`field_runs.ranked` is persisted at abstain time.** `assay_propose` must score against
  the ranked list *and capture* the queue item is about; recomputing against a re-fetched
  page scores a different page and is silently wrong (CRITIQUE §2.4). This is why `ranked`
  is a column and not recomputed.
- **`proof_id` is the only join that survives the user's warehouse**, because nothing else
  is ours. It ships on every published row (F13).

Group-undo (F8) is `UPDATE field_runs SET … WHERE group_key = ?` in one transaction —
which is the reason `group_key` exists rather than a loop that can half-fail.

---

## 3. Repo shape

Keep the repo flat. Add one workspace. No file moves, so all 14 CLIs and their
corpus-relative paths keep working.

```
/                    root package "assay" — engine + CLIs, workspaces: ["web"]
  src/               engine, unchanged        ← tools import ../src/*, still valid
  src/store/         NEW: schema.sql, db.js, captures.js
  src/runner.js      NEW: the IO seam (§4.2)
  tools/             CLIs, unchanged
  corpus/ results/   unchanged
  web/               NEW: Next.js app, own package.json
```

Root `package.json` gains:

```json
"workspaces": ["web"],
"exports": { "./engine/*": "./src/*", "./store": "./src/store/db.js" }
```

`web/` then imports `assay/engine/heal.js` — a real package specifier, no
`transpilePackages`, no `externalDir`, no relative `../../src` escape hatches. Clone-and-run
stays `npm install && npm test`.

Rejected: a full monorepo (`packages/engine` + `apps/web`) moves every file and rewrites
every corpus path for no benefit at this size; and vendoring the engine into `web/`
duplicates the thing whose whole point is that one extractor runs in two runtimes.

---

## 4. Ordered backlog — start at 1

### 1. Store layer — *blocks everything, ~1 day*
`src/store/` with the schema above, `better-sqlite3`, gzipped content-addressed captures.
**Proof:** a script writes a capture + run + field_runs, reads them back, and a second
write of identical HTML produces no second file on disk.

### 2. Runner extraction — *depends on 1, ~1–2 days*
`src/runner.js` owning all IO: load baseline + history from store → fetch (or
skip-with-record) → `detect()` → maybe `healGated()` → write `field_runs` + envelope →
open/close episodes → emit notifications. **Refactor `tools/replay.js` into it** with a
store adapter rather than writing a parallel loop — two loops means the benchmark stops
testing the product (CRITIQUE §2.2). Hoist the seven `pickTarget` copies into one
contract-driven target resolver. Wire `publishRow` into this path, closing the
replay-has-no-envelope gap.
**Proof:** `npm run replay` produces byte-identical `results/events.jsonl` to today, but
sourced from the store, plus enveloped rows.

### 3. Fix `golden_sha256` + drop the 16-hex truncation — *inside 1–2, ~1 hour*
Not a separate task; it is what step 1 makes possible. Full digest of the stored capture.

### 4. CLI over the runner — *depends on 2, ~1 day*
`assay held`, `assay explain <proof_id>`, `assay blast <field>`, `assay queue --json`.
FEATURES §5 makes the CLI the primary surface for nine of fourteen features, so this
delivers real product before any pixel exists. **Proof:** `assay explain` on a proof id
from `events.jsonl` prints the F12 answer.

### 5. BYOK / env — *independent, ~2 hours*
`.env` already holds `BRIGHTDATA_API_KEY`/`_TOKEN` and is gitignored. Add `.env.example`
(missing today), a single `config.js` that reads and validates, and the loud
"Assay runs with no model" default — LLM key optional (APP-DESIGN §6b).

### 6. Read-only REST — *depends on 1, ~1 day*
`/status`, `/held`, `/decisions`, `/runs`, `/explain/:proof` over the same store the MCP
server reads. Consumer API keys. This is PLATFORM-GAPS #3 and it is a second transport
over an already-specified surface, not new capability. **Proof:** `curl` returns the same
JSON the CLI prints.

### 7. MCP server, stdio — *depends on 1 (reads) + 2 (`assay_watch`), ~1 day*
The seven tools in APP-DESIGN §6. **`assay_resolve` must not exist** — a model nomination
enters as a candidate and clears the same two gates. `assay_propose` takes an element
reference, never a string; no tool on the server accepts a value.
**Proof:** `claude mcp add` locally, then `assay_decisions` returns the queue.

### 8. Signed webhooks — *depends on 2, ~half day*
HMAC `X-Assay-Signature` (Stripe/Svix convention). Runner emits on break-episode open and
on hold. **Proof:** a local receiver verifies the signature; a tampered body fails.

### 9. Scheduling trigger — *depends on 2, ~half day*
Assay is not a job runner (FEATURES §4, overturned only to *declare* cadence). A cron or
Bright Data collector calls one entrypoint. Skip-if-unchanged must still record the run,
or `robustZ` history goes wrong (CRITIQUE §1.6).

### 10. Resend email — *depends on 8, ~half day*
Digest + break alert, per APP-DESIGN §6b: user's own domain, one message per episode per
field, withheld count in the subject line.

### 11. Next.js skeleton, no UI — *depends on 1, ~half day*
`web/` scaffolded with the data layer wired: server components reading the store directly.
No screens. CRITIQUE §2.5 is right that almost every screen is a `SELECT` — so the data
layer is buildable and testable before a single component exists.

---

## 5. What genuinely waits for the design

Only the presentation layer: screen components, routes, the queue card's keyboard
interaction and five-second layout, the blast-radius timeline graphic, styling tokens as
CSS variables, and the prototype-derived navigation. Everything in §4 is server-side and
blocked on nothing but itself.

Boundary in one line: **if it renders, it waits; if it stores, computes, serves or
notifies, start now.**

---

## 6. Testing and CI

Keep `tools/selftest.js`. It is assert-based, has 34 checks against the real corpus, and
runs in seconds — there is no reason to migrate it to a framework.

Add, in this order:
1. **`node:test`** (stdlib, no dependency) for store and runner units. Two runners is fine;
   `npm test` runs both.
2. **GitHub Actions** — `.github/workflows/ci.yml` running `npm test` and `npm run bench`,
   asserting the gated arm stays at 0 wrong values. That number is the product's central
   claim; CI is where it stops being a claim.
3. **The fingerprint drift check** (CRITIQUE §2.3): fetch the Bright Data collector's
   parser source and string-compare the pasted functions against `src/fingerprint.js`.
   Drift fails CI. This is the only place a "paste verbatim" contract can be enforced,
   because no build system sees the pasted copy.

Also missing and cheap (PLATFORM-GAPS #4): `CONTRIBUTING.md`, `.github/ISSUE_TEMPLATE/`,
`CHANGELOG.md`. The changelog is worth an afternoon on its own merits — a product whose
flagship track diffs competitor changelogs shipping without one is an irony a judge will
find.

---

## 7. Open decisions for the owner

1. **SQLite-only to start, or Postgres from day one?** Recommendation above is
   SQLite-only; the schema is portable so hosted-Postgres is a later swap. Choosing
   Postgres now costs a service dependency in the self-host story for a tier that does not
   exist yet.
2. **The hosted-demo boundary** (PLATFORM-GAPS #5). Sign-in and `Free plan / Upgrade`
   imply accounts and a paid tier designed nowhere. Either delete the plan language or
   write the one-paragraph story. This blocks the auth work in §4 — it is the one item
   with no defensible default.
3. **Should `replay.js` keep producing `results/events.jsonl` as a committed artifact**
   once the store exists, or does the store become the source of truth and the JSONL a
   generated export? Affects whether the README's reproducibility claim still holds byte
   for byte.

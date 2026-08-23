# Ownership — who may edit what

Nine features are being built at once, in nine git worktrees, by nine agents who will
never read each other's code. This file is the only thing standing between that and a
merge nobody can untangle.

**The rule, in one line: you may create and edit the paths listed against your feature,
and nothing else.**

Wave 0 exists so that is possible. Every table, column, dependency and script the nine
features need is already committed on `main` — not because anyone knew exactly what each
feature would want, but because `package.json`, `schema.ts` and `migrations/` are single
files and nine parallel edits to a single file is a merge conflict wearing a plan's
clothing.

---

## First thing in a fresh worktree

`.env` is gitignored, so your worktree does not have one. The local Postgres on this
machine answers on the built-in default, which is what `src/store/index.ts` falls back to
when `DATABASE_URL` is unset — so the database-backed tests work with no setup at all:

```bash
ASSAY_REQUIRE_DB=1 npx vitest run      # green, and actually touching Postgres
```

`ASSAY_REQUIRE_DB=1` is not optional advice. Without it a test that cannot reach the
database early-returns, and vitest reports that as **passed, not skipped** — the count is
identical either way, so counting cannot catch it. Your feature is mostly database code;
run it with the flag or you are testing nothing.

The migration is already applied to that database. If a table is missing, the schema test
in `test/surfaces.test.ts` will say which one:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f src/store/migrations/0004_*.sql
```

---

## Check this before every commit

```bash
git diff --stat main -- . ':!package-lock.json'
```

Every path in that output must appear in your row below. If one does not, you have
walked into someone else's feature and the wave-2 integration agent will find out the
hard way. Stop and read "I need something in a frozen file" at the bottom.

---

## The nine

Each feature owns exactly five kinds of path. Substitute your own name for `<feature>`.

| | Feature | Core module | Also owns |
|---|---|---|---|
| **A** | Decisions (F7/F8) | `src/decisions/` | `web/app/api/v1/decisions/` · `src/mcp/tools/decisions.ts` · `test/decisions.test.ts` · `tools/cli/decisions.ts` |
| **B** | Contracts (F2) | `src/contracts/` | `web/app/api/v1/contracts/` · `src/mcp/tools/contracts.ts` · `test/contracts.test.ts` · `tools/cli/contracts.ts` |
| **C** | Blast + Retraction (F6/F9) | `src/blast/` | `web/app/api/v1/blast/` · `src/mcp/tools/blast.ts` · `test/blast.test.ts` · `tools/cli/blast.ts` |
| **D** | Brake + Unheal (F10/F11) | `src/brake/` | `web/app/api/v1/brake/` · `src/mcp/tools/brake.ts` · `test/brake.test.ts` · `tools/cli/brake.ts` |
| **E** | Health (F1/F3) | `src/health/` | `web/app/api/v1/health-fields/` · `src/mcp/tools/health.ts` · `test/health.test.ts` · `tools/cli/fragility.ts` |
| **F** | Reports (F14, track 07) | `src/reports/` | `web/app/api/v1/reports/` · `src/mcp/tools/reports.ts` · `test/reports.test.ts` · `tools/cli/incident.ts` |
| **G** | Connectors | `src/connectors/` | `web/app/api/v1/connectors/` · `src/mcp/tools/connectors.ts` · `test/connectors.test.ts` · `tools/cli/connectors.ts` |
| **H** | AI page-analysis | `src/ai/` | `web/app/api/v1/ai/` · `src/mcp/tools/ai.ts` · `test/ai.test.ts` · `tools/bench-model.ts` |
| **I** | CLI | `bin/assay.ts`, `tools/cli/index.ts` | `test/cli.test.ts` |

Notes on the edges:

- **E owns `web/app/api/v1/health-fields/`, not `health/`.** `web/app/api/health/` already
  exists and is the deployment liveness probe. Two different things, one word.
- **H owns `tools/bench-model.ts`,** the fourth benchmark arm. It must not edit
  `tools/bench.ts`, which produces an invariant.
- **I owns the binary and the registry.** Every other feature writes its own
  `tools/cli/<feature>.ts` exporting a command module; I registers them. Nobody but I
  edits `bin/assay.ts`.
- **Migrations are done.** `0004` already contains every table and column in the list
  below. Do not generate a `0005`. If you genuinely need a column that is not there, say
  so in your report — nine agents each generating a `0005` is exactly the merge this
  wave was built to avoid.

### Tables wave 0 already created for you

| Table | Feature | Notes |
|---|---|---|
| `queue_items.resolution` / `.resolved_at` / `.resolved_by` / `.undone_at` | A | `assay_propose` also writes `resolution` as `model_nominated:<n>` while leaving `resolved_by` null. That is a nomination on an **open** item. Read `resolved_by` to decide whether an item is settled — never `resolution`. |
| `contracts` | B | Versioned, append-only. Both the YAML the operator wrote and the parsed form. |
| `retractions` | C | `exported_at` null means computed but not yet acted on. |
| `heal_history` | D | Reverted rows stay. The oscillation pattern IS the evidence. |
| `field_state` | D, E | One row per `(target_id, field)`. D owns `brake_active` / `brake_reason`; E owns `fragility_grade` / `drift_state`. Same table, disjoint columns — write only yours. |
| `digests` | F | `next_run_at`, polled the same way `targets` is. |

---

## Frozen — nobody in wave 1 edits these

| Path | Why |
|---|---|
| `src/fingerprint.ts`, `heal.ts`, `detect.ts`, `mutate.ts`, `envelope.ts`, `target.ts`, `schedule.ts`, `notify.ts` | The engine. Every invariant is a measurement of these files. |
| `src/runner.ts` | The one pipeline. Wave 2 wires hooks here; wave 1 does not. |
| `src/store/index.ts`, `src/store/schema.ts`, `src/store/captures.ts`, `src/store/migrations/` | Write your own queries in your own directory, importing `getDb` and the schema from `assay/store`. |
| `src/mcp/server.ts`, `src/mcp/tools/core.ts` | The loader and the original eight tools. Add a **file** to `src/mcp/tools/`; never edit these two. |
| `src/api/handlers.ts`, `keys.ts`, `schemas.ts`, `webhooks.ts` | The existing read-only surface. |
| `tools/worker.ts` | Wave 2 wires the digest loop. |
| `tools/selftest.ts`, `tools/bench.ts`, `tools/replay.ts` | **They produce the invariants.** Editing one to make it pass is the single worst thing that can happen in this repo. |
| `package.json`, `package-lock.json` | Wave 0 pre-registered every dependency and script. If you need one that is missing, name it in your report; do not install it. |
| `tsconfig.json`, `web/tsconfig.json`, `drizzle.config.ts`, `Dockerfile`, `docker-compose.yml`, `.github/workflows/ci.yml` | Toolchain. |
| `web/lib/*`, `web/app/layout.tsx`, `web/app/page.tsx`, `web/proxy.ts`, `web/next.config.ts` | The shell and the auth seam. The main agent owns the screens. |
| `results/*`, `corpus/*` | Committed artifacts. `results/events.jsonl` is checked byte for byte. |
| `docs/DEV-OWNERSHIP.md` | This file. |

### I need something in a frozen file

You do not edit it. You **export a function** from your own module and name it in your
report. The wave-2 integration agent is the only one who wires hooks in, and it does so
once, with all nine branches in front of it.

The four hooks already anticipated:

| Feature | Exports | Wired into |
|---|---|---|
| B Contracts | `thresholdsFor(contract, field)` | `src/runner.ts` — per-field tau/delta |
| D Brake | `shouldHeal(target, field)` | `src/runner.ts` — gate the heal |
| F Reports | `dueDigests()` | `tools/worker.ts` — the digest loop |
| H AI | `scoreNomination()` | `src/mcp/tools/core.ts` — `assay_propose` re-scoring |

If you need a fifth, export it and say so. An unexported hook is a merge conflict with a
delay on it.

---

## The gate every feature passes before reporting

Run all of it in your own worktree. Compare the **numbers**, not the exit codes — a
previous agent reported "tests pass" while a number had moved, and only reading the
output caught it.

```bash
npx tsc --noEmit                  # clean
npm test                          # 34 assertions, "all checks pass"
npm run bench                     # 153 cases, `margin gate` row field 7 = 0.0%
npm run replay                    # replayed 74 runs · ok 8 · heal 66 · abstain 0
git diff --quiet -- results/events.jsonl   # byte-identical
npx vitest run                    # 570 + your own
npm run build --workspace web     # passes

git diff --stat main -- . ':!package-lock.json'   # only your own paths
```

The database-backed tests early-return when Postgres is absent, which vitest reports as
**passed, not skipped**. Set `ASSAY_REQUIRE_DB=1` to turn that vacuous green into a
failure, and do, because your feature is mostly database code.

A change that moves any of those numbers is reverted, not fixed forward. They are the
product's whole argument; they are not merely tests.

---

## House style, so nine branches read as one repo

- Commits: lowercase `type(scope): sentence`, body says **why**. Types in use: `feat`,
  `fix`, `refactor`, `test`, `docs`, `data`, `chore`, `design`.
- Zod at every boundary — REST input, MCP tool input, anything parsed from a file.
- No silent fallbacks. No type defaults, no coercion, no quietly reading the second-best
  candidate. An absence is an absence, not a zero.
- No confidence percentage on any cell. The status vocabulary is a closed set.
- `any` is allowed where a real type would mean refactoring. Leave a `// TODO(types)`
  saying which, so the next reader knows it was a decision.
- Comments explain **why**, never what. The code already says what.

# Wave 2 — what the nine branches left for the integrator

Wave 1 agents work alone and never read each other's code. Everything they
found that reaches outside their own row lands here, as they report it, so the
integration agent inherits the findings rather than rediscovering them.

Nothing in this file has been acted on. It is a ledger, not a changelog.

---

## 1. Hooks to wire

Each was exported rather than wired, because the target file is frozen in
wave 1. Every one is inert by construction: wiring it changes no behaviour
until an operator configures something. **Re-run the invariants after each
individual wiring, not once at the end** — that is how you learn which hook
moved a number.

| From | Export | Into | Inert because |
|---|---|---|---|
| B Contracts | `thresholdsFor(contract, field)` | `src/runner.ts` per-field tau/delta | returns today's 0.60/0.16 when no contract exists. A test reads `src/heal.ts` and fails if `healGated`'s inline defaults ever drift from B's copy. |
| D Brake | `shouldHeal(targetId, field)` | `src/runner.ts` heal gate | returns `true` when no brake row exists |
| E Health | `recomputeField(t, f)` / `recomputeAll(t)` | `tools/worker.ts` after a run, or a cadence | pure addition; writes only E's two columns |
| F Reports | `dueDigests()` | `tools/worker.ts` digest loop | returns empty with no `digests` rows |
| H AI | `scoreNomination()` | `assay_propose` in `src/mcp/tools/core.ts` | `assay_propose` must **stay inert** — it scores, it does not decide |

**`shouldHeal` deliberately does not catch database errors.** D's reasoning: a
brake that cannot be read is not a brake that is not set, and answering `true`
on a failed query would be a silent fallback in the one place the product
refuses one. Wave 2 owns the decision about what an unreachable store means.

### 1b. Two branches that must meet

- **C ↔ D.** C implemented `reopenBlast({ targetId, field, fromRun, toRun, record? })`
  to exactly the `ReopenBlast` shape D defined, so wire D's `unheal` to C's
  function directly — no adapter. `fromRun` is inclusive. C's is safe to call
  twice and safe on an already-reverted field. D commits the revert *before*
  calling, on purpose: the revert is the durable half.
- **A ↔ C.** Resolving a held cell settles the **queue item**; it does not
  republish the value. The cell stays `quarantined` with a null value, because
  publishing a correction is C's `publishCorrection`, not A's. **The Decisions
  screen needs both**, and F must not narrate a resolution as though the value
  went out.

---

## 2. Bugs found in frozen files

**These are the reason this file exists.** Each was found by an agent who was
not allowed to fix it.

1. **`src/runner.ts`: the xpath anchor has never resolved.** (found by E)
   `abs_xpath.replace(/^\//, '').replace(/\[(\d+)\]/g, ':nth-of-type($1)')`
   leaves the `/` separators in place, producing
   `html:nth-of-type(1)/body:nth-of-type(1)/…`, which is not a CSS selector.
   It does not throw — css-select simply matches nothing — so the anchor reads
   `null` on every page. Measured: **0 of 74 runs ever had a second anchor to
   compare, so `anchors_disagree` in `detect()` has never once fired.**
   `docs/FEATURES.md` marks F3's engine support `✓` on the strength of it.
   E's module fixes it locally (`/` → ` > `); the engine still has it.
   *This is the most serious item in this file: a documented capability that
   has never executed.*

2. **`resetTarget()` in `src/store/index.ts` builds SQL by interpolation.**
   (found by C) `WHERE target_id = '${targetId}'` in three `DELETE`
   statements, reachable from `npm run ingest <site>`. The installed
   drizzle-orm 0.45.2 is the patched version for GHSA-gpj5-g38j-94v9, so the
   ORM is fine — this is hand-written string building.

3. **`tools/run.ts` appends to `results/events.jsonl`.** (found by I) That file
   is a committed artifact checked byte for byte, so `assay run` leaves a clone
   with a dirty tree and fails the CI diff. `replay` already takes `--out`;
   `run` probably should.

4. **Wrapped tools print raw stack traces on a database failure.** (found by I)
   `assay apikey` against a dead database dumps a `DrizzleQueryError`. Exit
   code and stderr stream are correct; the output is not. The in-process
   `explain` path does it properly — it walks the `cause` chain.

---

## 3. Schema: the case for an `0005`

Wave 0 froze migrations at `0004` so nine agents could not each generate one.
Five agents independently hit a wall that a column would solve. Each is named
where it bit, not speculative.

| Want | Why | Found by |
|---|---|---|
| an operator identity on `queue_items` | `resolved_by` is `'human' \| 'model'`. Under `AUTH_MODE=none` there is genuinely one operator, so nothing is lost today — but **hosted deployments cannot record which person decided.** | A |
| `brake_events (target, field, action, actor, reason, at)` | there is nowhere to record *who cleared a brake*; it currently goes into `brake_reason` as prose, so "every brake alice cleared" is a `LIKE`. Would also give clear/re-engage history rather than only the last event. | D |
| `UNIQUE (target_id, version)` on `contracts` | `saveContract` computes the next version in a sub-select, atomic against everything except a second writer on the same target at the same instant | B |
| per-run anchor hash + fingerprint digest on `field_runs` | the store keeps neither, so E rebuilds the observation series by re-parsing stored pages — and captures are kept only for non-`ok` runs, so on a pruned store it grades **over the broken runs only**. `unobserved_runs`/`total_runs` carry the hole to the API rather than hiding it. | E |
| a boolean on `retractions` for "this window is a floor" | `bounded:false` survives in the API and CLI but not in the table | C |

---

## 3b. The Agent SDK, verified against the installed declaration

H fetched the docs **and** read the installed `sdk.d.ts` (0.3.239), because
docs and shipped code can disagree. Three corrections worth keeping, two of
them to instructions this project had already written down:

- **`allowedTools: []` is not a restriction.** It is *auto-approval*; the SDK's
  own text says "To restrict which tools are available, use the `tools` option
  instead." Passing it as a guard looks like a restriction while being none.
  The feature passes `tools: []` ("Disable all built-in tools").
- **`disallowedTools` with a bare name genuinely removes the tool** — the
  installed declaration says such tools "will be removed from the model's
  context and cannot be used, even if they would otherwise be allowed." A
  *scoped* rule like `Bash(rm *)` leaves the tool available. The bare form is
  the one that carries the safety property.
- **Messages API structured output is `output_config: { format: { type, schema } }`**
  — one nesting level deeper than a research subagent reported. The SDK's own
  `outputFormat: { type: 'json_schema', schema }` is flatter. H caught this by
  fetching the page rather than trusting the subagent.

**Value emission is structurally impossible, not discouraged.** One Zod schema
per shape is *both* the grammar (`z.toJSONSchema()` → `outputFormat`) and the
return validator, so the two cannot drift. Every field is an integer index or a
closed enum; the single string is a field *name* matching
`/^[a-z][a-z0-9_]{0,30}$/`, which cannot express a price, a sentence or an
instruction. The test walks the *generated* schema for any reachable free
string and asserts none exists.

**The fourth benchmark arm has not measured anything.** H has no
`ANTHROPIC_API_KEY`, so the model rows print `-` and the tool says
`NOT MEASURED … That is not a result and must not be reported as one.` What it
did establish: the harness reproduces `bench.ts` exactly (153 / 60.8% / 64.7% /
0.0% / 35.3%), and **the model could change the answer on 126 of 153 cases
(82.4%)** — a per-run agent session on four fifths of breaks, which is a very
different operating profile from Cheerio, and the cost `AI-AND-AGENTS.md` §7
lists as unestimated.

---

## 4. Smaller, but real

- **`EVENTS` in `src/api/webhooks.ts` is a closed list.** F9's retraction
  webhook needs `retraction.filed` added and `deliver()` called from
  `recordRetraction`. (C)
- **`package.json` needs a `bin` entry** — `"assay": "./bin/assay.ts"`,
  `"assay-mcp": "./src/mcp/server.ts"`. `npm run cli` works today. (I)
- **The CLI module contract is settled and both shipped shapes pass.** I wrote
  throwaway modules mirroring A's (`export const command` + default) and D's
  (`COMMANDS` array of two top-level commands) and both lit up with **no edit
  to `bin/assay.ts`**. Nobody needs to rewrite anything. Contract is at the top
  of `tools/cli/index.ts`.
- **A CLI module must do nothing at import time.** `assay --help` imports every
  file in `tools/cli/`; a module that queries Postgres at load makes `--help`
  need a database.
- **`package.json` `exports` has no `./reports/*`.** F's routes reach it through
  the existing `./engine/*` wildcard (`assay/engine/reports/handlers`). It
  resolves and builds; a proper entry would be cleaner. (F)
- **Two files are written by tools but owned by nobody.** H's
  `results/bench-model.json` sits in the frozen `results/` tree, so it is
  deleted after each run rather than committed — if wave 2 wants it as
  evidence, someone with `results/` rights has to add it. F's digest HTML comes
  from the frozen `notify.digestBody`, deliberately, so there is no second
  renderer.
- **The digest claim and the send are separate calls on purpose** — `dueDigests()`
  claims with `FOR UPDATE SKIP LOCKED` and bumps `next_run_at`; `markDigestSent()`
  is called after a successful send, so a failed send re-covers the period
  nobody received. Wire both or neither. (F)

---

## 5. Two environment facts that cost several agents real time

**Zod 4's locale error messages are dropped by Next 16's production bundle.**
Confirmed independently by A, B and C. The same malformed body reads a full
message in-process and a bare `Invalid input` over HTTP — the locale table is
not bundled. Build the detail from the issue's `code`/`values`/`keys`, or use
`z.prettifyError` (present in the installed zod 4.4.3). **Verify it over HTTP
against a built server**; an in-process test cannot see this.

**`updated_at` is a `Date` under tsx and a `string` inside Next's bundle**,
which registers no pg type parsers. E's route returned 500 in `next dev` while
all 61 tests passed. Normalise at the boundary, and throw on an unparseable
value rather than coercing it to null. (E)

---

## 6. Verification wave 2 owes

Every branch reported the invariants identical in its own worktree. That is
necessary and not sufficient: **the merge is where they move.** Re-run after
every merge and after every hook wiring, reading the numbers rather than the
exit codes:

```
npm test                          # 34 assertions, "all checks pass"
npm run bench                     # 153 cases, `margin gate` field 7 = 0.0%
npm run replay                    # replayed 74 runs · heal 24 · abstain 0
git diff --quiet -- results/events.jsonl
ASSAY_REQUIRE_DB=1 npx vitest run
npm run build --workspace web
```

`ASSAY_REQUIRE_DB=1` is not optional: without it a database test that cannot
reach Postgres early-returns, and vitest reports it **passed, not skipped**.

CI has still never executed. Wave 3 pushes it and reads the actual run.

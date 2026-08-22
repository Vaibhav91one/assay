# Tech stack

Decided 2026-08-22. Versions and licences pulled from the npm registry and vendor docs on
that date, not from memory — anything unverified is labelled so. Companion to
`docs/DEV-PLAN.md` (repo shape, store schema, ordered backlog).

Fixed by the owner: Next.js App Router as both frontend and backend · Tailwind ·
shadcn/ui · GSAP for motion · self-hosted first, open source.

> Two terms in the brief read as autocorrect artefacts: **"Shared CM"** → shadcn/ui, and
> **"RapidQ"** → BullMQ. Nothing found suggests other products were meant. If "RapidQ"
> meant something else, the queue section below still answers the underlying question.

---

## 0. Amendments — owner decisions, 2026-08-22

Six decisions were revised after this document was first written. Where the sections
below disagree with this block, **this block wins**; the original reasoning is kept
because the trade-offs still hold, only the choice changed.

| Was | Now | Why the owner is right |
|---|---|---|
| SQLite only, Postgres a future port | **Postgres, committed** | "Zero ops" evaporates once compose is already running. Two processes sharing one SQLite file only works on a single host; WAL over a network filesystem can corrupt; the single-writer lock puts `worker` and `web` in contention. And since Drizzle cannot share a schema across dialects, hedging carried a port-one-file debt — committing removes it. Unlocks `pg-boss` and `pgvector` if ever needed. |
| No auth in v1 | **Clerk on hosted, no-auth on self-host** | Hosted multi-user genuinely needs auth. Clerk cannot be self-hosted, so it is scoped to the hosted instance only; self-host runs single-operator behind the operator's own access control. |
| No TanStack Query | **TanStack Query, for live surfaces** | Not because of auth — auth and client data-fetching are orthogonal, and Clerk's `auth()` works in Server Components. The real driver is `run-report · in progress`, where fields settle one at a time and the screen must update live. |
| JavaScript throughout, no tsconfig | **TypeScript throughout, engine included** | Nobody had decided this, which meant nobody had ruled it out either — and nine features are about to be built in parallel by nine agents who will never read each other's code. A type is the cheapest contract between people who cannot talk. Migrated module by module under the invariant gate: 34 assertions, 153 bench cases at 0.0% wrong values, replay 74 runs / 66 heals / 0 abstentions, `results/events.jsonl` byte-identical after every single step. `any` is permitted where a real type would mean refactoring, and each one carries a `// TODO(types)` saying which. |
| `src/fingerprint.js` imports nothing | **`dist/fingerprint.js` imports nothing** | The rule could not survive as written: TypeScript source cannot be pasted into Bright Data's Cheerio worker, which has no module loader. So it moves to the artifact. `npm run build:fingerprint` emits the file that gets pasted, and a vitest case rebuilds it and asserts it contains no `import` and no `require`. The test rebuilds rather than reading a committed artifact — a checked-in one can go stale against its source and still pass. |
| AI via the Agent SDK with OAuth / subscription login | **Agent SDK with `ANTHROPIC_API_KEY`, BYOK** | Not permitted otherwise. The Agent SDK overview (fetched 2026-08-22) states: *"Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK. Use the API key authentication methods described in the Quickstart instead."* The Model connector panel already designs the API-key path, and the key stays optional and shown by presence only — "Assay runs with no model" stays true when it is absent. The injection-safety split below is unchanged: the same reference confirms `disallowedTools: ["Bash", "Write", "Edit"]` removes a built-in tool from the model's context entirely, and `outputFormat: { type: 'json_schema', schema }` gives the structured element *reference* the design depends on. |

### What TypeScript changes

`tsconfig.json` at the root is `strict`, `module: NodeNext`, ESM; `web/` has its own on
`moduleResolution: bundler`, because Next owns that toolchain and the two do not have to
agree. Node-side code runs through `tsx`; `web/` uses Next's native TypeScript.

Two consequences worth knowing before touching either:

- **`dist/fingerprint.js` is a build artifact, not a checked-in file.** `npm run
  build:fingerprint` emits it, `test/fingerprint-artifact.test.ts` proves it imports
  nothing, and CI rebuilds it from a clean checkout. `tools/figma-conformance.js` stays
  JavaScript for a related reason — its body ends in a top-level `return`, which no ES
  module may contain, because it is a payload for Figma's evaluator rather than a script.
- **`web/` builds with webpack, not Turbopack.** NodeNext means every relative import in
  the engine is written `./schema.js` and resolves to `./schema.ts`. Turbopack has no
  equivalent of webpack's `resolve.extensionAlias` and cannot follow those specifiers
  ([vercel/next.js#82945](https://github.com/vercel/next.js/issues/82945), open as of
  2026-08-22), so a Turbopack build fails the moment a route imports `assay/store`. Six
  lines in `next.config.ts` and `--webpack` on `dev` and `build`; delete both the day
  that issue lands. The alternatives were dropping `.js` from every engine specifier —
  tying the repo to a resolver Node does not implement — or compiling the engine to
  `dist/` before the app can see an edit.

### What Postgres changes

`pg` driver + Drizzle `pg-core`; `better-sqlite3` and `sqlite-core` are out. Compose gains a
third service. Content-addressed page captures stay on disk in a mounted volume — do not
put blobs in Postgres. Migrations via `drizzle-kit`, unchanged.

### What the auth split requires

The two paths must not become two codebases. One seam:

- `AUTH_MODE` env — `clerk` | `none` (default `none`, so a clone boots with no account).
- A single `getCurrentUser()` returning either the Clerk user or a synthetic
  single-operator identity. Everything downstream reads that, never Clerk directly.
- Clerk middleware mounted conditionally; `@clerk/nextjs` must be an optional path, so a
  self-hoster without keys is never blocked at boot.
- The sign-in frames (`sign-in`, `link sent`, `unknown email`) belong to the hosted path
  only. Note this in the design file so they are not read as universal.

**Open question this raises:** is the hosted instance *multi-tenant* or one shared
demo? Multi-tenant means every table needs an owner/org column and every query a scope —
a schema-level decision that is expensive to retrofit. Single shared demo needs neither.
Decide before the first migration is written.

### AI architecture — three surfaces, two trust levels

Decided 2026-08-22. `@anthropic-ai/claude-agent-sdk` (0.3.239 as of 2026-08-22) is **Claude Code as a
library** — built-in Read/Write/Edit/Bash/Glob/Grep/WebSearch/WebFetch, subagents, hooks.
It is a different product from `@anthropic-ai/sdk` (0.120.0, the API SDK). Both ship.

The split is by **what the model reads**, because that is what determines the blast radius
of a prompt injection:

| Surface | Input | Tooling | Model |
|---|---|---|---|
| **Home chat agent** — "What should Assay watch?" | the operator's own words | Agent SDK, full loop, Assay's own tools (watch, discover, propose fields) | Opus 5, adaptive thinking |
| **Agentic authoring** — "watch everything on contoso.example" | sitemap + sampled pages | Agent SDK, sandboxed, **`disallowedTools: ["Bash", "Write", "Edit"]`** | Opus 5, effort tuned |
| **Page analysis** — field inference, element nomination, discovery ranking | **untrusted scraped HTML** | narrow structured call, `outputFormat: { type: 'json_schema', schema }`, no tools | per feature, measured |
| **External agents** — Claude Code / Codex | Assay's MCP server | the Agent SDK as *client* | the user's own |

**The rule that decides which:** operator input may reach an agent loop; **scraped page
content may not.** `AI-AND-AGENTS.md` §1 makes injection-safety structural — the model
returns an element *reference*, never a string, so the worst a hostile page achieves is
pointing at the wrong element, which the scorer disagrees with, which is grounds to
abstain. Handing that same page to an agent holding `Bash` and `Write` would trade a
structural guarantee for a filter.

**Authentication is BYOK — see 0.** `ANTHROPIC_API_KEY`, never claude.ai login: Anthropic
does not permit third-party products to offer subscription login or rate limits, and the
Agent SDK overview says so in as many words. The key is optional and reported by presence
only, so "Assay runs with no model" stays literally true.

The two option names above were read off the TypeScript SDK reference on 2026-08-22, not
remembered. `disallowedTools` with a bare name removes the tool from the model's context
entirely rather than prompting for it, which is what makes the second row a structural
guarantee rather than a filter.

**Still to author:** system prompts per surface, and Agent Skills for the chat agent.
Model choice per feature is deliberately deferred until the 4th benchmark arm can measure
it — the project does not make unmeasured accuracy claims.

**Licence note:** the Agent SDK publishes as `SEE LICENSE IN README.md`, not OSI. GSAP
was going to be the other one and never got installed, so this is the only non-OSI
dependency in an MIT project. It belongs in the README, and is there.

### What TanStack Query is scoped to

Live/interactive surfaces only — `in progress` polling first. Server Components stay the
default for static reads; Server Actions plus `useOptimistic` stay the path for mutations,
including the group-scoped undo, which remains one SQL transaction. Query is not a general
replacement for RSC data loading, and adding it to static pages would be a regression.

---

## 1. The stack

| Layer | Choice | Version | Licence | Why | Self-host cost |
|---|---|---|---|---|---|
| Framework | Next.js (App Router) | 16.3.2 | MIT | Fixed. Backend too — route handlers + Server Actions | Node 20.9+ |
| UI runtime | React | 19.2.8 | MIT | Bundled with Next 16 | — |
| Styling | Tailwind CSS | 4.3.3 | MIT | Fixed. v4 CSS-first config suits token binding | — |
| Components | shadcn/ui | CLI, copy-in | MIT | Fixed. Source lands in repo, no runtime dep | — |
| Motion | CSS — `web/app/motion.css` + `web/lib/motion.ts` | — | — | GSAP was the plan; nothing needed it. Not a dependency | — |
| Database | Postgres | 17-alpine | PostgreSQL licence | §0. Two processes, one store, no WAL-over-a-mount question | one container |
| Driver | `pg` | 8.23.0 | MIT | Pure JS, no native build in the image | — |
| ORM | Drizzle ORM + drizzle-kit | 0.45.2 | Apache-2.0 | Typed queries, real migrations, `drizzle-zod` | — |
| Validation | Zod | 4.4.3 | MIT | Load-bearing — §5 | — |
| DB→Zod | `drizzle-zod` | 0.8.3 | Apache-2.0 | One schema, no duplicate row types | — |
| Queue | **none** — `targets.next_run_at` | — | — | §3 | — |
| Cache | Next Data Cache / `use cache` | built-in | MIT | Read-heavy UI, no Redis | — |
| Auth | **none for v1** | — | — | §7 | — |
| Email | Resend + React Email | 6.21.0 / 6.9.2 | MIT | Decided in APP-DESIGN §6b | BYO key |
| MCP | `@modelcontextprotocol/sdk` | 1.30.0 | MIT | stdio + HTTP from one server | — |
| Browser | Playwright | 1.62.1 | Apache-2.0 | Doubles as E2E runner | ~300MB if enabled |
| Unit tests | `tools/selftest.ts` + Vitest | 4.1.11 | MIT | Keep what works, add for app code | — |
| Charts | **none** — hand-rolled SVG | — | — | §8 | — |
| Tables | **none** — TanStack Table only on demand | — | — | §8 | — |
| Dates | **none** — `Intl.DateTimeFormat` | — | — | §8 | — |
| Client state | **none** — RSC + `useOptimistic` | — | — | §4 | — |

Sources: npm registry `/latest` for every version and licence field ·
[Next.js 16 release notes](https://nextjs.org/blog/next-16) ·
[GSAP standard licence](https://gsap.com/standard-license) ·
[shadcn theming](https://ui.shadcn.com/docs/theming) ·
[Drizzle get-started](https://orm.drizzle.team/docs/get-started).

---

## 2. Database — hypothesis partly refuted
> **Superseded by §0.** Postgres is committed. The SQLite reasoning below explains what was traded away.


**"One Drizzle schema targets both SQLite and Postgres" is false.** Drizzle exposes
`drizzle-orm/sqlite-core` and `drizzle-orm/pg-core` as separate imports with separate
table builders (`sqliteTable` vs `pgTable`). Dual-dialect means **two schema files kept in
sync by hand**, plus divergence in JSON columns, upsert syntax, and generated-column
support. That is an abstraction tax paid today for a hosted tier that does not exist.

**Decision: SQLite only.** Postgres is a future port of one schema file, not a day-one
capability. `docs/DEV-PLAN.md` §2 already writes the DDL; Drizzle's schema becomes the
source of truth and the DDL is generated from it.

Why Drizzle at all, given six tables and hand-written SQL would work:

- `drizzle-zod` derives Zod schemas from the same table definitions, so DB row types and
  API validation stop being two hand-maintained copies of one truth.
- `drizzle-kit` gives real migrations. Self-hosters will have real data on disk when the
  schema changes; "run this ALTER by hand" is not a shipping story.

That is the whole justification. If either of those stopped mattering, raw SQL over
`better-sqlite3` would be the correct lighter answer.

**Driver note.** Node ships `node:sqlite` (`DatabaseSync`), and Drizzle supports it as a
driver. It is **Stability 1.2 / release candidate on Node 24+**, and on Node 22 — the
version this repo currently runs — it is experimental and prints
`ExperimentalWarning: SQLite is an experimental feature` on every start
([Node docs](https://nodejs.org/api/sqlite.html), verified locally on v22.18.0). Use
`better-sqlite3` now; swapping to the zero-dependency built-in is a one-line driver change
once the deployment target is Node 24+. Enable WAL and a `busy_timeout` — two processes
write (§3).

**Prisma comparison, honestly.** Prisma 7.9.1 is Apache-2.0 and has moved off the
Rust query-engine binary [unverified — I did not confirm the 7.x engine architecture
first-hand]. Even granting that, Prisma's generate step and heavier client buy nothing
here that Drizzle does not, and Drizzle's SQL-shaped API is easier to reason about against
a schema whose queries are already written as SQL in DEV-PLAN.

---

## 3. Queue and caching — hypothesis confirmed

**No Redis. No BullMQ. No queue table.**

Assay's actual load: 14 targets on cadences of 6h–weekly. That is roughly **100 runs/day —
0.07 jobs per minute.** Redis plus BullMQ for that is two services and a persistence story
a self-hoster maintains forever, to schedule less work than a cron line.

**What replaces it:** the worker polls one query.

```sql
SELECT * FROM targets WHERE next_run_at <= unixepoch() AND paused = 0;
```

Run it, write the run, set `next_run_at`. No jobs table, no broker, no library. Retries are
a `attempts` column and a backoff on `next_run_at`.

**When Redis genuinely becomes necessary** — revisit at any one of these, not before:

- More than one worker process needs to coordinate, and DB row locking starts contending
- Sustained throughput above roughly 10 jobs/second
- Sub-second scheduling latency matters (it does not — cadences are hours)
- Distributed rate limiting across multiple machines hitting one target domain

Until then it is infrastructure cosplay. If Postgres arrives later, `pg-boss` (12.27.0,
MIT) is the natural step *before* Redis, since it needs no new service.

**Caching:** the UI reads far more than it writes, and Next 16's Cache Components
(`cacheComponents: true` + `use cache`) cover it. Two Next 16 APIs matter here:

- **`updateTag(tag)`** — Server Actions only, read-your-writes. Exactly the Decisions
  queue: resolve an item and see the queue update in the same request.
- **`refresh()`** — refreshes uncached data only. For the held-count badge after a
  decision, without touching cached page shells.

---

## 4. Where runs execute — the architectural decision

The docs conflict: `FEATURES.md` §4 refuses being a job runner ("Bright Data runs the
collectors"), `APP-DESIGN.md` §1 partially overturns that for cadence, and `npm run demo`
runs the engine locally today.

**Resolution: Next never executes a scrape. A separate worker process does.**

Route handlers are the wrong shape for this even self-hosted, where no serverless timeout
applies — a run holds a request open for seconds to minutes and competes with page loads
for the event loop.

```
docker-compose.yml
  web     → next start            (reads store; writes only decisions/settings)
  worker  → node src/worker.js    (owns fetch → detect → heal → gate → publish)
  volume  → assay-data: /data/assay.db + /data/captures/
```

Both services mount one volume. SQLite in WAL mode handles one writer at a time with
concurrent readers; at 0.07 jobs/minute contention is theoretical. `busy_timeout` covers
the rare overlap when a user resolves a decision mid-run.

**Two fetch sources, one runner.** `src/runner.js` takes a fetch function as a parameter —
local `fetch` for self-host, or a Bright Data collector result arriving by webhook. That is
a function argument, not a plugin system; no abstraction beyond the seam that genuinely has
two implementations today. The Bright Data path posts to `/api/runs/ingest` and the same
runner processes the payload, so detection and gating are identical whichever way the HTML
arrived.

`FEATURES.md` §4's refusal survives intact: Assay still does not schedule *other people's*
infrastructure. It runs its own loop for targets it owns, which is what APP-DESIGN §1
already overturned the refusal to allow.

---

## 5. Validation, and where TanStack Query does *not* earn its place
> **Partly superseded by §0.** The auth-implies-Query argument stays refuted; live polling on `in progress` is the accepted reason.


**Zod 4.4.3 is load-bearing, confirmed.** Four trust boundaries need it: user-authored
field-contract YAML, the trust envelope as an output contract, REST inputs, and MCP tool
inputs — the MCP SDK already takes Zod schemas for tool definitions. `drizzle-zod` derives
the row schemas so the store and the API validate against one definition.

**TanStack Query: not initially — this disagrees with the brief's hypothesis.**

The reasoning was that the Decisions queue needs polling, optimistic decide-with-undo, and
a group undo unwinding 340 items. All three are covered without it:

- Reads are Server Components hitting the store directly. No client fetch, so no client
  cache to manage.
- Optimistic mutation is React 19's **`useOptimistic`** plus a Server Action — built in,
  no dependency.
- Read-your-writes after resolving is **`updateTag()`** (§3).
- Group undo is one SQL statement — `UPDATE field_runs … WHERE group_key = ?` in a
  transaction. It is a database concern, not a client-cache concern, and doing it in one
  transaction is precisely what stops a 340-item undo half-failing.

Add TanStack Query if and when there is genuine cross-route client caching or real-time
polling that Server Components cannot serve. Not before.

**Zustand or similar: no.** Remaining client state is a dialog's open/closed and a
selected row. `useState` and URL search params cover it; search params also make queue
filters shareable and back-button correct, which a store would not.

---

## 6. Motion — GSAP, honestly scoped

> **Not what shipped.** Motion is CSS: `web/app/motion.css` holds the tokens,
> keyframes and the reduced-motion guard, `web/lib/motion.ts` holds the same
> numbers for JavaScript, and five primitives live in `web/components/motion/`.
> GSAP is not a dependency. `docs/MOTION.md` is the current document. The
> scoping below is kept because it is why the four "signature" moments were
> allowed to be expensive at all.

**Licence, verified.** GSAP 3.15.0 is free for commercial use and now **includes the
formerly paid Club plugins** (SplitText, MorphSVG, ScrollSmoother, DrawSVG). The only
prohibition is embedding it in a no-code visual animation builder competing with Webflow —
irrelevant to a scrape-monitoring tool.

**One caveat worth stating for an MIT project:** GSAP's is a proprietary "no charge"
licence, not an OSI-approved open-source one. Assay stays MIT; a downstream redistributor
inherits a non-OSI dependency. Not a blocker — flag it in the README's dependency note.

**Where GSAP earns its weight, and where it does not.** Defaulting to one tool for all
motion is the mistake. Three tiers:

| Tier | Tool | Cases |
|---|---|---|
| Micro | CSS / Tailwind transitions | hover, focus rings, button press, toast slide, dialog fade |
| Structural | React 19 **View Transitions** | route changes, list reorder, the queue card collapsing as the next promotes |
| Signature | **GSAP** | the lead bar filling against its threshold marker · the run strip building tick by tick · the page-map before→after with the arrow drawing · the resolve-with-undo receipt |

That is four GSAP moments in the whole product. Each is a timeline with sequencing and
easing that CSS cannot express cleanly, and each is a moment where the product is arguing
something — the lead bar animating *to* the threshold is the gate explaining itself.

Use `@gsap/react`'s `useGSAP()` hook for automatic cleanup under React 19 Strict Mode.
Import only the plugins used; GSAP core is roughly 23KB gzipped [unverified — measure at
build time]. Respect `prefers-reduced-motion` — the design's own restraint demands it.

---

## 7. Auth — the blocking decision dissolves
> **Superseded by §0.** Clerk on hosted, no-auth on self-host.


`DEV-PLAN.md` §7 lists the hosted-demo boundary as the one open item with no defensible
default, blocking auth. It only blocks if v1 needs auth. **It does not.**

Self-hosted single-operator Assay runs behind the operator's own access control — a
Tailscale network, a reverse proxy with basic auth, or localhost. Shipping an auth system
for one user is the definition of building for a tier that does not exist.

**Decision: no auth in v1.** The sign-in frames in the design serve the hosted demo, which
is unbuilt. When multi-user becomes real, use **better-auth 1.7.1** (MIT, stable) rather
than Auth.js: `next-auth`'s `latest` tag is still **4.24.15**, with v5 sitting at
`5.0.0-beta.32` — a multi-year beta is not a foundation for a self-hosted product, and
better-auth owns its schema so it composes with Drizzle.

This unblocks the DEV-PLAN backlog: the hosted-demo boundary is now a *product* decision
for whenever a demo is built, not a *prerequisite* for writing code.

---

## 8. What NOT to add, and when to revisit

| Not adding | Why | Revisit when |
|---|---|---|
| Redis / BullMQ | 0.07 jobs/min | >10 jobs/sec, or multi-worker coordination |
| Postgres | SQLite fits, dual-dialect is a tax | A hosted tier with concurrent writers exists |
| TanStack Query | RSC + `useOptimistic` + `updateTag()` cover it | Real cross-route client caching appears |
| Zustand / Redux | Client state is a dialog and a selection | Never, probably |
| TanStack Table 9.1.2 | Design's tables are ordered read-only lists | A table needs user sorting or filtering |
| A chart library | Run strip, lead bar, timeline, rank bars are bespoke SVG already designed. A library would fight the design language, not serve it | Never for these; only if arbitrary user-defined charts appear |
| A date library | `Intl.DateTimeFormat` plus a ~10-line relative formatter covers "today 09:12" and "9 days ago" | Timezone-arithmetic-heavy features |
| Style Dictionary | 23 tokens | The token count crosses ~100, or a second platform consumes them |
| An ORM abstraction layer over Drizzle | One database | Never |

---

## 9. Token pipeline — Figma to Tailwind

**The REST route is closed.** Figma's Variables REST API requires an **Enterprise** plan
([Figma forum, confirmed repeatedly](https://forum.figma.com/ask-the-community-7/why-the-variables-api-is-only-available-on-enterprise-plans-19396)).
That kills automated sync via REST for this project.

**The plugin API is open**, and this session has been reading variables through it all
along (`figma.variables.getLocalVariableCollectionsAsync()` via the Figma MCP). So the
export is a script run through the MCP tool, not a CI integration:

```
Figma `assay` collection (23 variables)
  → MCP script reads collection, emits a CSS block
  → web/app/globals.css   :root { --accent-brand: #FF4D00; … }
  → @theme inline         --color-accent-brand: var(--accent-brand);
  → Tailwind utilities    bg-accent-brand, text-semantic-danger
  → shadcn aliases        --primary: var(--accent-brand);
```

Concretely, in `globals.css`:

```css
:root {
  /* generated from Figma collection `assay` — do not hand-edit */
  --accent-brand: #ff4d00;
  --semantic-link: #2563eb;
  --semantic-success: #16a34a;
  --semantic-warning: #ca8a04;
  --semantic-danger: #dc2626;
  --text-primary: #1a1a1a;
  --text-secondary: #6b6b6b;
  --bg-sidebar: #0e0e0f;
  --border-default: #dbdbdb;
  --radius: 0.5rem;            /* control 8px */

  /* shadcn aliases mapped onto our tokens */
  --primary: var(--accent-brand);
  --primary-foreground: #ffffff;
  --destructive: var(--semantic-danger);
  --border: var(--border-default);
}

@theme inline {
  --color-accent-brand: var(--accent-brand);
  --color-semantic-link: var(--semantic-link);
  --color-semantic-success: var(--semantic-success);
  --color-semantic-warning: var(--semantic-warning);
  --color-semantic-danger: var(--semantic-danger);
  --radius-card: 12px;
  --radius-elevated: 16px;
}
```

Style Dictionary is not worth it at 23 tokens — it adds a build step and a second config
format to express what one generated CSS block already says. **Regenerate on design
change, commit the diff.** The generated block being committed is the point: a reviewer
sees token changes in a PR.

`tw-animate-css` is shadcn's Tailwind-v4 replacement for `tailwindcss-animate`; include it
only if using shadcn animation presets, since GSAP owns the signature motion anyway
[unverified — confirm shadcn's current Tailwind v4 animation dependency at install time].

**Two rules carried over from `APP-DESIGN.md` §5c.** Type: Questrial for prose, Roboto Mono
for machine tokens — set as two font variables, and note Questrial ships one weight, so
never write `font-bold` expecting hierarchy. Elevation: two tiers only, floating
(`0 12 48 rgba(0,0,0,.20)` + `0 2 6 rgba(0,0,0,.10)`, no border) and inline (1px
`--border-default`, no shadow) — encode them as two utility classes so a third recipe
cannot quietly appear.

---

## 10. Self-host shape

```yaml
# docker-compose.yml
services:
  web:
    build: .
    command: npm start -w web
    environment: [ASSAY_DB=/data/assay.db, ASSAY_CAPTURES=/data/captures]
    volumes: [assay-data:/data]
    ports: ["3000:3000"]
  worker:
    build: .
    command: node src/worker.js
    environment: [ASSAY_DB=/data/assay.db, ASSAY_CAPTURES=/data/captures]
    volumes: [assay-data:/data]
volumes:
  assay-data:
```

Two services, one volume, no database server, no broker, no cache. `docker compose up` is
the whole install. That is the self-host story the open-source pitch needs, and every item
this document declines to add is what keeps it one file long.

Keys stay in `.env` per APP-DESIGN §6b — Bright Data token required, LLM key optional and
loudly so, Resend key the user's own.

---

## 11. Testing

Keep `tools/selftest.ts` exactly as it is: assert-based, 34 checks, runs in seconds against
the real corpus. Migrating it to a framework would buy nothing.

Add around it:

1. **Vitest 4.1.11** for store and runner units — the store's content-addressing (identical
   HTML must not write a second file), the runner's skip-but-still-record path, envelope
   invariants.
2. **Playwright 1.62.1** for exactly one E2E flow: resolve a decision, see the group undo
   unwind. It is the interaction the product is judged on, and it doubles as the headless
   browser for JS-heavy scrape targets, so it is one dependency serving two needs.
3. **GitHub Actions** running `npm test` and `npm run bench`, failing if the gated arm's
   wrong-value count is anything but zero. That number is the product's central claim; CI
   is where it stops being a claim and becomes a check.

`.github/` does not exist yet (PLATFORM-GAPS #4) — CI arrives with it, alongside
CONTRIBUTING and a CHANGELOG.

---

## 12. Open decisions

1. **Node version target.** Node 24+ makes `node:sqlite` a release candidate and lets the
   `better-sqlite3` native dependency go away entirely. Pinning to 24 costs some
   self-hosters on older LTS. Recommendation: build on 22 with `better-sqlite3`, note the
   swap.
2. **Does `results/events.jsonl` stay a committed artifact** once the store exists, or
   become a generated export? Carried over from DEV-PLAN §7 — it affects whether the
   README's byte-for-byte reproducibility claim still holds.
3. **Hosted demo, if ever.** Now a product decision rather than a blocker (§7). It brings
   auth, Postgres, and key custody with it as a bundle — decide it as one thing or not at
   all.

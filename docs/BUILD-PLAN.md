# Assay — BUILD PLAN (architecture + remaining work)

**FigJam board (sitemap + system architecture): https://www.figma.com/board/sdJWJyOKgrDQgDQ8MnROCr**

- Written: 2026-08-21 ~10:00 IST. Deadline: submissions close **Aug 23 2026** (closing TIME is NOT published anywhere — see A.1).
- Status: **superseded.** This was the plan before the build, kept for the record. The architecture it proposes was built; the route names, screen inventory and numbers below are the plan's, not the app's. `README.md` and `web/content/docs/` describe what shipped.
- Audience: a smaller AI model executing tasks one at a time. Every task has absolute paths, exact commands, and acceptance criteria. If a step is ambiguous, the plan is wrong — stop and ask the human, do not improvise.
- Repo root everywhere below: `/Users/vaibhavtomar/Desktop/assay`

---

## Table of contents

- [REVIEW QUEUE](#review-queue)
- [A. Status and gap assessment](#a-status-and-gap-assessment)
- [B. Version research (verified 2026-08-21)](#b-version-research)
- [C. Architecture](#c-architecture)
- [D. Sitemap and information architecture](#d-sitemap-and-information-architecture)
- [E. Task breakdown](#e-task-breakdown)
- [F. Improvements, risks, cut list](#f-improvements-risks-cut-list)
- [G. Figma board](#g-figma-board)

---

## REVIEW QUEUE

Every decision the human must confirm before implementation, in one pass. "Rec" = my recommendation. Details in the ADR referenced.

| # | Decision | My recommendation | Confidence | ADR |
|---|---|---|---|---|
| R1 | Submission timing given the **unpublished** deadline time | First full submission Aug 23 **15:00 IST**; resubmit final by **21:00 IST**. Never rely on "8:00 PM BST" — no page states it | high | A.1 |
| R2 | Bright Data heal loop | Run `bdata scraper heal` **for real, once, on the real break** (`recall_title` null in 60/60 records), gate-check the preview, then `approve`. Record the terminal. This merges gaps #1 and #2 into one story. Manual, not an automated pipeline | medium | ADR-6 |
| R3 | UI = new Next.js app in `web/` | Yes. `app/index.html` is deleted from the repo after `web/` ships | high | ADR-1, ADR-8 |
| R4 | Versions | Next 16.3.1 · React 19.2.8 (comes with Next) · TS as scaffolded (5.x line, **not** TS 7) · Tailwind 4.3.3 · shadcn CLI 4.18.0 · Recharts 3.10.1 via shadcn chart · Node: local v22.18.0 (meets Next's ≥20.9) | high | ADR-9, ADR-10 |
| R5 | Data layer | Flat files in `results/` read server-side per request. No DB, no ORM, no zod | high | ADR-2 |
| R6 | Engine↔UI contract | UI never imports `src/`. Live runs spawn `node tools/demo-run.js` as a child process | medium-high | ADR-3 |
| R7 | Rendering | All server components except MarginBar animation + `/live` form. `force-dynamic` on pages that read `results/`. No cacheComponents, no PPR, no server actions, no proxy.ts | high | ADR-4 |
| R8 | Charts | shadcn `chart` component (Recharts 3). The margin bar is a **hand-written SVG component**, not a chart | high | ADR-5 |
| R9 | Abstain evidence | The 74-run replay produced **zero abstains**. Generate abstain proof records from mutation demos, labeled `"source":"mutation_demo"` — honest labeling, never passed off as organic | medium | ADR-11 |
| R10 | Repo hygiene | `git init` at root TODAY; remove `corpus/` and `results/` from `.gitignore` (both must be committed — "example structured output" is a required artifact); delete `app/`; remove `mermaid` from `package.json` | high | ADR-8, ADR-12 |
| R11 | Collector `recall_title` fix | Attempt via the `bdata scraper heal` loop (R2), timeboxed 3h total. If heal cannot fix it, demo the `--reject` path instead — a recorded rejection is still the loop working | medium | ADR-6, ADR-7 |
| R12 | Probes (PLAN.md §10) | **Cut.** Not built, 63h left. Remove probe claims from README/video; keep as "future work" one-liner | high | F cut list |
| R13 | Mattel/Chicco Bright Data collectors | **Cut.** One live collector (IKEA) + 3-site offline corpus is enough; free tier and time say no | high | F cut list |
| R14 | `/live` page priority | P1 (first thing built after P0). The video can fall back to `/events/[run]` + terminal if it slips | medium | D |
| R15 | Check IKEA against Bright Data's pre-built scraper library (companion repo "Step 0") | Do the 10-min check; regardless of the answer the collector is custom-built in Scraper Studio so Rule 5 is satisfied — but note the check's outcome in the README | high | A.2 |

---

## A. Status and gap assessment

### A.1 Corrections to the briefing summary (verified against the live pages and the real repo)

Everything was re-verified. Most of the summary held. These points did **not**:

1. **The deadline time "8:00 PM BST Sunday Aug 23" is not published anywhere.** The schedule page says only "August 23 — Submissions close." The only clock times on any page are two livestreams at 3:00 PM UTC. The FAQ confirms the form is open now and **resubmission is allowed** ("You can submit once and you can come back and submit again"). Consequence: submit a complete entry early (R1) and treat any later time as bonus, not budget.
2. **`src/` is 763 lines, not ~732** (fingerprint 222 + heal 186 + detect 149 + mutate 165 + sites 41). Trivial, but the number appears in draft README text — use 763 or "~760".
3. **The fingerprint has 21 keys, not 18** (`tag, id, id_volatile, classes, classes_stable, classes_dropped, text, neighbor_text, aria_label, name, type, href, alt, testid, role, heading_path, parent_tag, depth, sibling_index, id_xpath, abs_xpath`). 12 of them are scored by `SPEC` in `heal.js`. Say "21-key fingerprint, 12 scored properties" in public copy.
4. **`.gitignore` currently ignores `corpus/` and `results/`** — but a required submission artifact is "Example structured output", and the benchmark evidence lives in `results/`. Both must be committed (corpus is 14 MB, results 312 KB — fine for GitHub). This was not in the gap list and would have silently produced a non-qualifying repo.
5. **`package.json` carries a `mermaid` dependency** used only by the throwaway `app/` scratchpad. The "2 runtime deps" claim is false as the repo stands. Remove it (Spider-Sense track judges the repo).
6. **`$52 balance / 5000 unused credits` is unverifiable from this machine** — there is no `.env` in the repo and no token on disk (`tools/bd-status.sh` expects `BRIGHTDATA_API_TOKEN` from the environment). Assumed true; verify in the Bright Data dashboard before the heal run.
7. **"Signals fired: shape_mismatch 13 …"** — `events.jsonl` contains `value_missing`, `null_rate_spike`, `anchors_died` on heal events; the `shape_mismatch 13` figure comes from the snapshot audit (`tools/audit.js`), which currently prints to console only. Not disproven, but not re-runnable into a file — Task T06 adds `--json` so the UI and README cite a committed artifact instead of a remembered number.

Everything else checked out exactly: 26 self-tests pass (`npm test` → "all checks pass", 26 `ok` lines); bench.json = naive 75/135 value-wrong (55.6%), plain 24/135 (17.8%), gated 0/135 (0.0%) with 42/135 abstained (31.1%); sweep.json = 110 τ/δ pairs, best = τ 0.6 / δ 0.16, and the δ 0.12 knee (wrong 4.4% at correct 77.8%) is in the grid; events.jsonl = 74 lines, 50 `ok` + 24 `heal` + **0 abstain**; corpus manifest = 77 entries (mattel 32, ikea 31, chicco 14), all distinct digests; `fingerprint.js` imports nothing; Rule 5 and Rule 7 verbatim as briefed; `bdata login --device` guidance confirmed in the companion repo README.

### A.2 New facts from the hackathon pages that change priorities

From the companion repo's "What the judges are looking for" (verbatim):

> - At least one working create-and-run flow, with the Collector ID as proof.
> - A self-healing demonstration wherever the target allows one.
> - The Collector ID wired into something downstream: an API, a database, a schedule, a dashboard.
> - A repo with reproducible setup instructions, and an explanation of the code your agent generated.

And from the resources page: **"Show `bdata scraper heal` working in the project or demo video — this is what judges will look for."**

Consequences:
- The `bdata scraper heal` demonstration is **P0**, not the P1 risk-assessment item the briefing framed it as (gap #1). See ADR-6 for the honest way to do it.
- "Collector ID wired into something downstream: a dashboard" — the `/studio` page rendering the collector's snapshot audit satisfies this literally. Make the Collector ID `c_mt1nrjboski90goqc` visible on that page.
- Companion repo "Step 0": pick a target **not** in Bright Data's pre-built library (https://brightdata.com/cp/scrapers/browse). IKEA product data likely IS in the library; the IKEA **recalls page** almost certainly is not, and the collector is custom-built either way, so Rule 5 is met. Do the 10-minute check (R15) and preempt the question in the README.
- AI-assistant use **must be disclosed** (Rule 11–13) and you must be able to explain the code. README needs a disclosure section.
- Keep tokens out of the repo AND the video (best-practices rule 04).

### A.3 Scorecard against the six judging criteria

| # | Criterion (verbatim) | State today | Gap | Fix |
|---|---|---|---|---|
| 1 | Potential impact — clear and useful problem? | Strong. Recall monitoring; a wrong heal = publishing a wrong recall | None structural; story exists only in PLAN.md | README + video tell it (T15, T16) |
| 2 | Creativity and innovation | Strong: margin gate + published calibrated thresholds (τ 0.6, δ 0.16) — the literature's stated open problem | PLAN.md also promises behavioural probes, which **do not exist**. Claiming them would be caught | Cut probe claims (R12) |
| 3 | Technical excellence — complete, reliable, well structured? | Engine: good (26 tests, 2 deps, honest benchmark). Repo: **bad** — no git history, throwaway `app/`, stray dep, results ignored | Spider-Sense track judges "the repository a stranger could pick up on Monday" | T01 (git), T02/T15 (README), R10 hygiene |
| 4 | Use of Scraper Studio — central? | **Weakest criterion.** One custom collector (Rule 5 met) + one real snapshot, but the engine runs offline and BD's heal/approve verbs are unused | Judges explicitly look for `bdata scraper heal` working | ADR-6: real heal on the real break; `/studio` page; README writeup |
| 5 | Reliability and self-healing — website changes, missing data, extraction failures? | Strong evidence: 135-case benchmark with ground truth, 24 real Wayback heals, the 100%-success-vs-missing-fields audit | Zero **abstains** in the real replay — the centerpiece behaviour has only synthetic evidence | ADR-11: labeled mutation-demo abstains + `/live`; say the limitation out loud |
| 6 | Presentation — problem, scraper workflow, structured output, final product? | **Nothing exists.** No README, no video, no submission | Total | T15–T18. Non-negotiable P0 |

Bottom line: the science is done and credible; the **packaging and the Bright Data centrality are the entire remaining risk**. The plan below spends roughly 60% of remaining hours on criteria 4 and 6.

### A.4 Requirements checklist (submission artifacts)

| Required (Rule 10) | Exists? | Covered by |
|---|---|---|
| Public source-code repository | No (not even `git init`) | T01, T18 |
| Clear README | No | T02, T15 |
| Example structured output | Exists on disk (`results/events.jsonl`, `results/j_mt1q17uoq8rkcxd8a.ndjson`) but **gitignored** | T01 (un-ignore), T15 (link from README) |
| Demo video showing the working project | No | T16, T17 |
| Clear explanation of how Scraper Studio is used | No | T15 (README section) |

---

## B. Version research

All verified 2026-08-21 against npm registry, GitHub releases/atom feeds, and official docs. Exact strings to pin:

| Package | Version | Released | Verified at |
|---|---|---|---|
| Next.js | **16.3.1** | 2026-08-13 | https://registry.npmjs.org/next/latest · https://github.com/vercel/next.js/releases/tag/v16.3.1 |
| React / React DOM | **19.2.8** | 2026-07-21 | https://registry.npmjs.org/react/latest |
| TypeScript | latest is **7.0.2** (2026-08-20) — **do not use**; keep the 5.x create-next-app scaffolds | — | https://registry.npmjs.org/typescript/latest · ADR-10 |
| Node.js | Active LTS line **v24 "Krypton"**, latest 24.19.0 (2026-08-03). **This machine runs v22.18.0** (Maintenance LTS) which satisfies Next 16's `>=20.9.0` | — | https://nodejs.org/en/about/previous-releases · ADR-9 |
| Tailwind CSS | **4.3.3** | 2026-07-16 | https://registry.npmjs.org/tailwindcss/latest |
| shadcn CLI | **4.18.0** (supports Tailwind v4 + React 19) | 2026-08-13 | https://registry.npmjs.org/shadcn/latest · https://ui.shadcn.com/docs/changelog |
| Recharts | **3.10.1** (peer react `^16.8—^19`) | 2026-07-25 | https://registry.npmjs.org/recharts/latest |

The user's belief "Next.js 16" was **correct** (16.3.1 current; no v17 exists).

### Next.js 16.3 facts that shape this design (doc URLs load-bearing)

- **Dynamic by default, no implicit caching.** The old fetch-cache heuristics are gone; the opt-in new model is `cacheComponents: true` (which is PPR in v16 — `experimental.ppr`, `dynamicIO`, `useCache` flags all removed). We do **not** opt in (ADR-4). https://nextjs.org/docs/app/guides/caching-without-cache-components · https://nextjs.org/docs/app/getting-started/caching
- **Turbopack is the default** for `next dev` and `next build`; webpack config would break the build. We add none. https://nextjs.org/docs/app/guides/upgrading/version-16
- **Async request APIs enforced**: `params`, `searchParams`, `cookies()`, `headers()` must be awaited. Affects `/events/[run]/page.tsx` — its `params` is a Promise. Same URL.
- `middleware.ts` → `proxy.ts` (nodejs runtime only). We use neither. Same URL.
- `next lint` removed; `next build` no longer lints. Run `eslint` directly if wanted. Same URL.
- Parallel route slots require explicit `default.js` — we use no parallel routes.
- `revalidateTag` now takes a second argument — we never call it.
- Minimums: Node ≥ 20.9.0, TS ≥ 5.1. Browsers Chrome/Edge/Firefox 111+, Safari 16.4+.
- create-next-app scaffolds TypeScript, ESLint, Tailwind v4, App Router, `@/*` alias, Turbopack, and an AGENTS.md by default. https://nextjs.org/docs/app/api-reference/cli/create-next-app
- shadcn chart component is built on **Recharts v3**; colors via `var(--chart-1)` (not `hsl(var(--chart-1))`); `ChartContainer` needs an explicit height/`min-h-*`. https://ui.shadcn.com/docs/components/chart

Charting recommendation: **shadcn `chart` (Recharts 3)** — themed tooltips/legend/CSS-variable colors for free inside the design system already being installed. Rejected: visx 4.0.0 (low-level, more code per chart than the hours justify), nivo 0.99.0 (own theming fights shadcn tokens), Tremor (is Recharts underneath anyway). The margin bar is NOT a chart-library problem — ADR-5.

---

## C. Architecture

### C.0 System context

```
  Wayback Machine ──fetch-corpus.js──▶ corpus/*.html (77 captures, committed)
                                            │
  Bright Data Scraper Studio                │
  collector c_mt1nrjboski90goqc ──────┐     │
  (custom parser; fingerprint.js      │     ▼
   pasted verbatim — Rule 5)          │   ASSAY ENGINE  src/  (framework-free ESM)
        │                             │   capture ▶ detect ▶ attribute ▶ rank ▶ gate
        │ snapshot j_mt1q17uoq8rkcxd8a│     │                                  │
        ▼                             │     │ tools/replay.js · bench.js       │ tools/demo-run.js
  results/j_….ndjson (60 records) ────┼──▶  ▼                                  ▼
        │                             │   results/events.jsonl            results/demo-events.jsonl
        │ tools/audit.js --json       │   results/bench.json, sweep.json       │
        ▼                             │     │                                  │
  results/audit.json                  │     └───────────┬──────────────────────┘
        │                             │                 ▼
        │    bdata scraper heal ◀─────┘        web/  Next.js 16 UI
        │    bdata scraper approve/--reject    server components read results/* via lib/data.ts
        ▼         │                            POST /api/run spawns tools/demo-run.js
  results/bd-heal-transcript.json ────────────▶ rendered on /studio
```

Prose version (a diagram must never be the only carrier of a fact):
- The **engine** (`src/`) is the product: capture → detect → attribute → rank → gate. It is plain ESM, two runtime deps (`cheerio`, `fastest-levenshtein`), and `src/fingerprint.js` imports **nothing** so it pastes verbatim into the Scraper Studio Cheerio parser. This constraint is preserved untouched — no task in this plan edits `src/` logic.
- **Tools** (`tools/`) drive the engine over the corpus and the Bright Data snapshot, writing flat JSON/JSONL artifacts into `results/`.
- **Bright Data** appears twice: as a *source* (the custom collector + its snapshot) and as the *repair executor* (`bdata scraper heal` proposes, `approve/--reject` disposes; our detector decides WHEN to call heal, our gate decides WHETHER to approve — ADR-6).
- The **UI** (`web/`, new) is a read-only window onto `results/` plus one write path: `POST /api/run` spawns `tools/demo-run.js` for the live demo.

### C.1 Module boundaries and the UI↔engine contract

Three modules, three rules:

| Module | May import | May never |
|---|---|---|
| `src/` (engine) | `cheerio`, `fastest-levenshtein`, each other — except `fingerprint.js` which imports **nothing** | anything from `tools/` or `web/`; any Node builtin inside `fingerprint.js` |
| `tools/` | `src/`, Node builtins | anything from `web/` |
| `web/` | its own deps + `results/*` **as data files** | anything from `src/` or `tools/` as code (the only crossing is `child_process.spawn` of a tools script) |

The contract between UI and engine is therefore **files + one CLI**:
1. Files: the six artifacts in `results/` + `corpus/manifest.json`, shapes specified in C.2.
2. CLI: `node tools/demo-run.js --site <s> --from <YYYYMM> --to <YYYYMM> [--mutation <id>] --json` → prints exactly one `AssayEvent` JSON object to stdout, appends the same object to `results/demo-events.jsonl`, exit 0 on success / non-zero with a message on stderr on failure. (Built in T06 by adapting `tools/run.js`, which already does all of this except the flags and stdout JSON.)

### C.2 Data layer

**What is stored, where, in what shape.** No database. Everything is a committed flat file; the UI parses on read.

| File (absolute) | Shape | Producer | Read by |
|---|---|---|---|
| `/Users/vaibhavtomar/Desktop/assay/results/events.jsonl` | one `AssayEvent` per line, 74 lines | `tools/replay.js` | `/`, `/events`, `/events/[run]` |
| `/Users/vaibhavtomar/Desktop/assay/results/demo-events.jsonl` | one `AssayEvent` per line (has `source` field) | `tools/demo-run.js` (NEW, T06) | same pages, merged after replay events |
| `/Users/vaibhavtomar/Desktop/assay/results/bench.json` | `{ arms: {naive,plain,gated}: Tally, byMutation: {[id]: {label, expect, plain: Tally, gated: Tally}} }` where `Tally = {correct,wrong,value_ok,value_wrong,abstain_right,abstain_wrong,n}` | `tools/bench.js` | `/benchmark`, `/` |
| `/Users/vaibhavtomar/Desktop/assay/results/sweep.json` | `{ grid: SweepPoint[110], best: SweepPoint, … }` where `SweepPoint = {tau,delta,n,correct,wrong,abstain_right,abstain_wrong,wrongPct,correctPct,abstainPct}` | `tools/sweep.js` | `/benchmark` |
| `/Users/vaibhavtomar/Desktop/assay/results/audit.json` | NEW (T06): `{ snapshot, records, promised: string[], fields: {[name]: {present, nullRate, signals: string[]}}, summary }` | `tools/audit.js --json` | `/studio` |
| `/Users/vaibhavtomar/Desktop/assay/results/j_mt1q17uoq8rkcxd8a.ndjson` | 60 IKEA recall records (raw BD snapshot) | Bright Data | `/studio` (sample rows) |
| `/Users/vaibhavtomar/Desktop/assay/results/bd-heal-transcript.json` | NEW (T12): `{ steps: {cmd, stdout_excerpt, at}[], preview_check, verdict }` hand-assembled from the recorded heal session | manual | `/studio` |
| `/Users/vaibhavtomar/Desktop/assay/corpus/manifest.json` | `{site,timestamp,original,digest,file,bytes}[77]` | `tools/fetch-corpus.js` | `/live` (capture picker) |

**The `AssayEvent` type** — this is the exact shape on disk today (verified against `events.jsonl`); `web/src/lib/types.ts` transcribes it:

```ts
type Site = "mattel" | "ikea" | "chicco";

interface AssayEvent {
  run: number;
  site: Site;
  capture: string;                       // "YYYYMMDD" of the newer capture
  field: string;                         // "recall_title"
  mode: "tiered";
  thresholds: { tau: number; delta: number };   // 0.6 / 0.16
  skeleton: { before: string; after: string; changed: boolean };
  value_now: string | null;
  baseline_value: string;
  golden_sha256: string;
  event: "ok" | "heal" | "abstain";
  decision: "no_action" | "auto_approved" | "abstain";
  diagnosis: string;
  attributed_cause: string;              // "ok" | "selector_break" | "wrong_value" | "semantic_drift" | "unknown"
  // present only when event != "ok":
  signals?: string[];
  candidates?: { selector: string; score: number; value: string }[];  // top 3
  score?: number;
  runner_up?: number | null;
  margin?: number;
  reason?: "clear_margin" | "benign_tie" | "below_tau" | "thin_margin" | "no_candidates";
  healed_to?: { selector: string; value: string };   // heal only
  approved_by?: "assay";                              // heal only
  // NEW, demo-run.js only — absent means organic replay:
  source?: "mutation_demo" | "live";
  mutation?: string;                     // e.g. "duplicate_similar"
}
```

**How the UI reads it.** One module, `web/src/lib/data.ts`, is the only place that touches the filesystem:

```ts
// All functions are server-only. Root resolution:
const ROOT = process.env.ASSAY_ROOT ?? path.resolve(process.cwd(), "..");
// cwd is /Users/vaibhavtomar/Desktop/assay/web when `next dev` runs there.

export async function getEvents(): Promise<AssayEvent[]>;   // events.jsonl + demo-events.jsonl (if present), sorted by run; malformed lines skipped and counted
export async function getEvent(run: number): Promise<AssayEvent | null>;
export async function getBench(): Promise<Bench | null>;
export async function getSweep(): Promise<Sweep | null>;
export async function getAudit(): Promise<Audit | null>;
export async function getManifest(): Promise<ManifestEntry[]>;
export async function getHealTranscript(): Promise<HealTranscript | null>;
```

Missing file → `null` / `[]`, page renders an explicit empty state naming the generator command (e.g. "run `node tools/replay.js`"). Never a crash.

**How it stays fresh.** Pages that read `results/` declare `export const dynamic = "force-dynamic"` so every request re-reads the files (Next 16 is dynamic-by-default, but the explicit declaration removes any prerender ambiguity and costs nothing at this scale — files total <400 KB). After `POST /api/run` succeeds, the `/live` client calls `router.refresh()`; the re-render re-reads `demo-events.jsonl`. No cache invalidation machinery exists because no cache exists.

### C.3 API surface

Exactly two route handlers. Everything else is server-component file reads (no API needed to render).

**`POST /api/run`** — file `web/src/app/api/run/route.ts`
- Body (JSON): `{ site: "mattel"|"ikea"|"chicco", from: string /* YYYYMM */, to: string /* YYYYMM */, mutation?: "rename_class"|"wrapper_div"|"swap_tag"|"reorder_siblings"|"strip_id"|"translate_text"|"remove_field"|"duplicate_similar"|"combo_redesign" }`
- Behaviour: validates inputs against the literal whitelists above (site, mutation) and `/^\d{6}$/` (from, to); spawns `node tools/demo-run.js --site <site> --from <from> --to <to> [--mutation <m>] --json` with `cwd = ROOT` and a 30 s timeout; parses stdout as JSON.
- `200` → `{ event: AssayEvent }` (the freshly appended proof record)
- `400` → `{ error: string }` — any input outside the whitelists (never pass unvalidated strings to spawn args; use `spawn` with an args array, never `exec` with a string)
- `500` → `{ error: "engine_failed", detail: string }` — non-zero exit or unparseable stdout; `detail` = last 500 chars of stderr
- `504`-equivalent: on timeout, kill the child, return `500` with `detail: "timeout after 30s"`
- Runs synchronously within the request — a corpus pair run takes well under 2 s (Cheerio parse of two ~100 KB files + O(elements) scoring). No job queue, no polling, no run IDs. `export const dynamic = "force-dynamic"`.

**`GET /api/events`** — file `web/src/app/api/events/route.ts`
- Query: `?site=<Site>` (optional), `?limit=<n>` (optional, default all)
- `200` → `{ events: AssayEvent[] }` — merged `events.jsonl` + `demo-events.jsonl`, newest first
- `200` with `{ events: [] }` when files are missing (not an error)
- Exists only so `/live` can refresh its event strip without a full navigation; server pages do NOT call it (they use `lib/data.ts` directly).

Explicitly not built: DELETE/reset endpoints (delete `results/demo-events.jsonl` by hand), auth (localhost demo app), any Bright Data proxy route (the UI never calls BD at render time — ADR-6).

### C.4 Directory structure (proposed, complete)

```
/Users/vaibhavtomar/Desktop/assay/
├── README.md                  NEW  T02/T15 — the submission document
├── PLAN.md                    keep — research provenance (link from README)
├── docs/
│   └── BUILD-PLAN.md          this file
├── package.json               engine; T01 removes "mermaid" dep
├── package-lock.json
├── .gitignore                 T01 rewrites: node_modules/, .env, .next/, .DS_Store  (corpus/ and results/ UN-ignored)
├── .env                       NEVER COMMITTED — BRIGHTDATA_API_TOKEN=… (T12 creates locally)
├── src/                       FROZEN. No task edits engine logic.
│   ├── fingerprint.js         222 ln — import-free, pastes into Scraper Studio parser
│   ├── heal.js                186 ln — Similo scoring + healGated margin gate
│   ├── detect.js              149 ln — 4 detectors + cause attribution
│   ├── mutate.js              165 ln — 9 mutations with ground truth
│   └── sites.js                41 ln — target registry
├── tools/
│   ├── selftest.js            26 assertions (unchanged)
│   ├── fetch-corpus.js · replay.js · bench.js · sweep.js · run.js · heal-demo.js · diagnose.js · bd-status.sh   (unchanged)
│   ├── audit.js               T06 adds --json flag → results/audit.json
│   ├── demo-run.js            NEW T06 — parameterized single-pair run, see C.1 contract
│   └── build-app.js           DELETED with app/ (T01)
├── corpus/                    committed (14 MB): mattel/ 32 · ikea/ 31 · chicco/ 14 html + manifest.json
├── results/                   committed: events.jsonl · bench.json · sweep.json · ikea-recalls.json ·
│                              j_mt1q17uoq8rkcxd8a.ndjson · audit.json(T06) · demo-events.jsonl(runtime) ·
│                              bd-heal-transcript.json(T12)
├── assets/scrape-verse-logo.png
├── app/                       DELETED in T01 (throwaway scratchpad — R3/R10)
└── web/                       NEW T03 — Next.js 16.3.1 app (create-next-app scaffold + shadcn)
    ├── package.json           next 16.3.1 · react 19.2.8 · tailwindcss 4.3.3 · recharts 3.10.1
    ├── next.config.ts         default; no webpack config (Turbopack)
    ├── components.json        shadcn config
    └── src/
        ├── app/
        │   ├── layout.tsx     dark theme, nav (Overview · Events · Benchmark · Studio · Live), Geist via next/font
        │   ├── globals.css    Tailwind 4 + shadcn tokens; palette seeded from app/index.html values (values only, file deleted)
        │   ├── page.tsx                    /            (T07)
        │   ├── events/page.tsx             /events      (T08)
        │   ├── events/[run]/page.tsx       /events/[run](T08)  — NOTE Next 16: params is a Promise, await it
        │   ├── benchmark/page.tsx          /benchmark   (T09)
        │   ├── studio/page.tsx             /studio      (T10)
        │   ├── live/page.tsx               /live        (T11) — server shell + client form
        │   └── api/
        │       ├── run/route.ts            POST         (T11)
        │       └── events/route.ts         GET          (T11)
        ├── components/
        │   ├── margin-bar.tsx   THE component — client, hand-written SVG (T08)
        │   ├── event-badge.tsx  ok/heal/abstain color chip
        │   ├── stat.tsx         headline number tile
        │   ├── candidate-list.tsx  score bars + values
        │   └── ui/              shadcn: button card badge table tabs separator chart tooltip
        └── lib/
            ├── types.ts         C.2 types, transcribed exactly
            └── data.ts          C.2 loader — the only fs access in web/
```

### C.5 State management and rendering

- **Server components everywhere** except: `margin-bar.tsx` (entry animation), the `/live` form + result panel, and shadcn chart wrappers (Recharts requires client). No global state library, no context providers beyond shadcn's defaults. Data flows props-down from server pages.
- **Caching:** none. `force-dynamic` on `/`, `/events`, `/events/[run]`, `/studio`, `/live` (they read `results/`). `/benchmark` reads only build artifacts that change when tools re-run — same rule for uniformity. `cacheComponents` stays off (ADR-4).
- **A run is triggered** by the `/live` form → `POST /api/run` (synchronous, <2 s) → **tracked** by its appended line in `demo-events.jsonl` (the `run` number continues the sequence) → **surfaced** immediately in the response panel (the returned `AssayEvent` rendered with the same `candidate-list` + `margin-bar` components as `/events/[run]`) and in every event list after `router.refresh()`.
- **A heal decision is recorded** as the proof record (`AssayEvent`) — decision, reason, candidates, margin, thresholds — and **displayed** on `/events/[run]`: the margin bar draws `score` vs `runner_up` against the δ=0.16 band; the verdict text quotes the actual reason (`clear_margin` / `thin_margin` / `below_tau` / `benign_tie`). The Bright Data heal decision (T12) is displayed on `/studio` from `bd-heal-transcript.json`.

### C.6 Failure modes

| Failure | System behaviour |
|---|---|
| `results/*.json*` missing | `lib/data.ts` returns null/[]; page renders empty state naming the exact regeneration command. Never a 500 |
| Malformed JSONL line | Line skipped; skip count surfaced as a small warning chip on `/events` ("2 lines unparseable") — honesty over silence |
| `demo-run.js` non-zero exit / bad stdout / >30 s | `/api/run` → 500 with stderr tail; `/live` shows the error verbatim in a red panel; nothing appended |
| Corpus directory missing (fresh clone before LFS-free checkout completes) | `/live` picker disabled with message "corpus not found — run `npm run corpus`" |
| Invalid `/api/run` input | 400 before any spawn; whitelist validation (C.3) — the only trust boundary in the app |
| Bright Data API down / token absent | Irrelevant at runtime: UI renders only committed artifacts; `/studio` never live-calls BD |
| Concurrent `POST /api/run` | Both append via `fs.appendFile` (atomic at these line sizes on APFS); duplicate `run` numbers possible in demo events — tolerated, keyed display by array index; not worth a lock for a single-operator demo |
| `next build` fails on prerender of dynamic pages | Prevented by `force-dynamic`; and demo runs on `next dev` anyway — `next build` is a T14 acceptance check, not a deploy step |
| Deadline-time ambiguity | R1: full submission by Aug 23 15:00 IST; resubmission allowed and planned |

### C.7 Explicitly ruled out

| Ruled out | Why |
|---|---|
| Database (SQLite/Postgres) | 74–100 events, 400 KB of JSON. Files are already the engine's native output; a DB adds migration+ORM hours and one more thing to break in a demo |
| Deploying the UI (Vercel etc.) | Demo runs locally on `next dev`; deploy adds env/path/fs-access problems (the app reads sibling directories) for zero judging value — the video is the medium. Revisit only if hours remain (F) |
| Importing `src/` into `web/` | Keeps the engine provably framework-free (a judged claim); avoids bundler surprises with cheerio in Turbopack; the child-process contract is already tested code (ADR-3) |
| `cacheComponents` / PPR / `use cache` | New mental model, zero benefit for an fs-reading localhost demo (ADR-4) |
| Server Actions | Two endpoints, both curl-testable; route handlers are more debuggable and the acceptance criteria depend on curl (ADR-4) |
| Automated bdata heal pipeline (cron/watcher) | 63 h. One real recorded heal+approve cycle scores criterion 4; an unattended pipeline is demo-invisible extra risk (ADR-6) |
| Behavioural probes (PLAN §10) | Not built; building them now would cannibalize P0 packaging hours (R12) |
| Mattel/Chicco live collectors | Free-tier scraper slots + generation time (5–25 min each) + no downstream use before Sunday (R13) |
| Auth on the UI | Localhost, single operator |
| LLM anything at runtime | The whole thesis is deterministic, explainable judgement |

### C.8 ADRs

**ADR-1 — New `web/` Next.js app; scratchpad deleted.**
Context: `app/index.html` exists but is declared throwaway; Suit-Up track wants a finished UI. Options: (a) grow the scratchpad, (b) Next.js app in `web/`, (c) static site generator. Chosen: (b). Rationale: shadcn+Tailwind gets a polished dark dashboard fastest; App Router file-per-route matches the sitemap 1:1; the judges' checklist mentions "a dashboard" as downstream wiring. (a) fights XSS-by-string-concat and has no component model; (c) can't host `/api/run`. Confidence: **high**. Reversibility: total (delete `web/`).

**ADR-2 — Flat committed files as the entire data layer.**
Context: all artifacts already exist as JSON/JSONL emitted by tools. Options: files vs SQLite vs Postgres. Chosen: files, parsed per request. Rationale: PLAN.md already chose "one JSON object per event, appended to a .jsonl. No database" — the UI conforming to the engine's native output means zero translation layers; <400 KB total makes parse cost irrelevant. Confidence: **high**. Reversibility: easy (loader module is the single seam).

**ADR-3 — UI↔engine crossing is files + one spawned CLI, never an import.**
Context: `/live` must execute the engine. Options: (a) import `healGated` into a route handler, (b) spawn `tools/demo-run.js`. Chosen: (b). Rationale: preserves the auditable claim that the engine has zero framework coupling; reuses the already-tested run path; a Turbopack/cheerio bundling surprise at hour 50 is an unaffordable risk class; stdout-JSON is trivially testable without the UI. Cost: ~50 ms spawn overhead — irrelevant. Confidence: **medium-high** (the import would also work; this is risk posture, not necessity). Reversibility: easy.

**ADR-4 — Boring Next.js: dynamic rendering, no cacheComponents, no server actions, route handlers only.**
Context: Next 16 offers cacheComponents/PPR, `use cache`, server actions. Chosen: none of them; `force-dynamic` + plain route handlers. Rationale: the app is a localhost demo reading local files; every caching feature adds a way to show stale results on camera; curl-testable endpoints make the acceptance criteria executable by a smaller model. Confidence: **high**. Reversibility: total.

**ADR-5 — shadcn chart (Recharts 3) for charts; hand-written SVG for the margin bar.**
Context: need a sweep curve + arm comparisons, plus the centerpiece margin visual. Chosen: shadcn chart for conventional charts; `margin-bar.tsx` as bespoke SVG (~80 lines: two horizontal score bars 0→1, τ=0.6 threshold line, shaded δ=0.16 band between score and runner-up, verdict label). Rationale: the margin bar must show a *decision*, not data — chart libraries fight that; everything conventional gets Recharts' themed tooltips for free. Rejected: visx/nivo (B). Confidence: **high**. Reversibility: component-local.

**ADR-6 — Bright Data heal loop: one real, recorded heal of the real break; gate logic decides approve/reject; no automated pipeline.** ⚠ The load-bearing risk decision.
Context: gap #1 — Assay has its own healer while judges explicitly look for `bdata scraper heal` working. The proposed reframe: *their `heal` proposes, their `approve/--reject` disposes; our detector decides WHEN, our gate decides WHETHER.*
Stress test of the reframe, honestly: (i) it currently describes **zero running code** — the offline loop (replay/bench) never touches BD, and a sharp judge will notice the τ/δ calibration lives entirely offline; (ii) BD's heal regenerates a *parser*, while our gate scores *DOM candidates* — the gate cannot literally score BD's proposed code, so "our gate decides whether to approve" is only true if we define the approval check as: run the returned `preview_result` through `detect()`'s expectations (shape regex, minLen) **and** require the healed `recall_title` values to agree with the independently-extracted `title_on_detail` values (the revived cross-check). That check is real, runnable, and in the spirit of the gate (independent evidence before acting) — but it is a *verification gate*, not the margin gate, and the README/video must say so precisely: **margin gate = offline decision evidence; verification gate = what approves a BD heal.** Claiming the margin gate approves BD heals would be caught.
The saving grace: **a genuine break exists** — `recall_title` was promised by the approved schema and arrived null in 60/60 records while BD reported 100% success. So the demo is not staged: detector output (audit.json) is the diagnosis string, `bdata scraper heal c_mt1nrjboski90goqc "<diagnosis>"` is the repair, the cross-check is the approval evidence, `approve` (or `--reject` if the preview fails the check — equally demoable, arguably more on-thesis) is the disposition. One cycle, recorded, transcript committed as `results/bd-heal-transcript.json`, rendered on `/studio`.
Chosen: manual recorded cycle, timeboxed 3 h (T12), using `npx -p @brightdata/cli bdata login --device` (plain `login` is documented to fail inside coding agents). Not chosen: automated pipeline (hours, demo-invisible), skipping BD heal entirely (fails the explicit judge instruction).
Confidence: **medium** — heal turnaround/behaviour on this collector is unobserved; the `--reject` fallback and the "collector wired into a dashboard" wiring cap the downside. Reversibility: n/a (it's a recording session).

**ADR-7 — Cross-check oracle revival rides on ADR-6.**
Context: gap #2 — `recall_title` never delivered, so `title_on_detail` has nothing to compare against. Options: (a) separate Scraper Studio editing session to fix the parser, (b) let the ADR-6 heal cycle be the fix, (c) abandon the cross-check. Chosen: (b) — one session, one story, and if the heal genuinely fixes it, re-run a 10-record batch and `title_on_detail` vs `recall_title` agreement becomes both the approval evidence and the revived oracle. Fallback (c) with the missing field presented as the finding (it already carries the "100% success" indictment). Confidence: **medium**. Reversibility: easy.

**ADR-8 + ADR-12 — Repo hygiene: git init now, un-ignore `corpus/` + `results/`, delete `app/`, drop `mermaid` dep.**
Context: no git repo exists; required artifacts are gitignored; a throwaway file and a stray dep contradict the clean-code story. Chosen: T01 does all four in the first hour, with real incremental commits from then on (Rule 8 optics + Spider-Sense track both reward visible history; a single day-of dump commit invites "was this built this week?" questions). Corpus at 14 MB is fine for GitHub (no LFS). Confidence: **high**. Reversibility: git.

**ADR-9 — Node: run on the installed v22.18.0.**
Context: Active LTS is v24; this machine has v22.18.0; Next 16 requires ≥20.9.0. Chosen: don't touch the runtime 63 h before a deadline; note `"engines": {"node": ">=20.9"}` in `web/package.json` and mention v22/v24 both work in the README. Confidence: **high**. Reversibility: trivial (nvm), just not now.

**ADR-10 — TypeScript: whatever 5.x create-next-app scaffolds; not TS 7.**
Context: TS latest is 7.0.2 (the Go-native compiler, new strict defaults, 6 weeks old). Chosen: the scaffolded 5.x. Rationale: Next 16's floor is TS 5.1; TS 7's changed defaults (`strict` on, new `rootDir`/`target` behavior) are exactly the kind of surprise a hackathon doesn't absorb; zero judging value. Confidence: **high**. Reversibility: trivial later.

**ADR-11 — Abstain evidence: mutation-sourced demo records, labeled.**
Context: 0 abstains in 74 organic replay runs — the flagship behaviour (refusing) has no real-corpus event to display. The bench has 42 abstain outcomes but stores only tallies, not proof records. Options: (a) lower δ until real pairs abstain (cherry-picking thresholds for theater — dishonest, rejected), (b) run `tools/demo-run.js --mutation duplicate_similar` (and `remove_field`) on real captures to emit full abstain proof records tagged `"source":"mutation_demo"`, displayed with a visible "mutation demo" badge, (c) show abstains only as bench aggregates. Chosen: (b)+(c): the UI shows both, the badge keeps it honest, and the README states plainly: *"On 74 real capture pairs the gate never needed to abstain; abstention fires on the ambiguity cases the mutation set constructs — which is the point of calibrating on it."* Confidence: **medium** — a judge could still read mutation demos as staged; the labeling and the sentence above are the mitigation. Reversibility: delete the demo file.

### C.9 Bright Data command reference (for T12 — copy-paste)

```bash
cd /Users/vaibhavtomar/Desktop/assay
# login (device flow — plain `bdata login` hangs inside coding agents):
npx -p @brightdata/cli bdata login --device
# sanity: collector exists
npx -p @brightdata/cli bdata scraper run c_mt1nrjboski90goqc "https://www.ikea.com/us/en/customer-service/product-support/recalls/" --pretty
# the heal — diagnosis text comes from results/audit.json findings:
npx -p @brightdata/cli bdata scraper heal c_mt1nrjboski90goqc "recall_title is promised by the approved schema but returned null in 60 of 60 records while the run reported 100% success; the listing-page title selector never resolved. date_published and product_name also arrived in under 2% of rows."
# → returns status "awaiting_approval" with a preview_result. CHECK THE PREVIEW (ADR-6):
#   1. recall_title non-null and matches /(recall|rappel|retirada|alert)/i with length ≥ 15
#   2. recall_title agrees (case/whitespace-insensitive substring) with title_on_detail
# then exactly one of:
npx -p @brightdata/cli bdata scraper approve c_mt1nrjboski90goqc
npx -p @brightdata/cli bdata scraper approve c_mt1nrjboski90goqc --reject
# NEVER pass --auto-approve. Record the whole session (terminal + screen).
```

---

## D. Sitemap and information architecture

Constraint recap: Suit-Up = best UI; Presentation asks for problem → scraper workflow → structured output → final product; centrepiece = **the margin between the top two candidates**; demoable in <3 min. Nav order = demo order.

| Route | Purpose | The judge's question it answers | Data read | Priority |
|---|---|---|---|---|
| `/` | Mission control: headline stats (naive 55.6% wrong → gated **0.0%** wrong at 31.1% abstained; τ=0.6 δ=0.16), per-site health strip, last 8 events, one-line thesis ("a no-match beats a mismatch") | "What is this and does it work?" | `events.jsonl`, `demo-events.jsonl`, `bench.json` | **P0** |
| `/events` | Timeline of all 74+ runs across mattel/ikea/chicco: ok/heal/abstain badges, skeleton-changed markers, mutation-demo badges, filter by site | "Does it operate over time, on real pages?" | both event files | **P0** |
| `/events/[run]` | **The centerpiece.** Full proof record: diagnosis string, signal chips, candidate list with score bars and their extracted values, **the MarginBar** (score vs runner-up, τ line, δ band, verdict), healed_to / abstain reason, before/after skeleton hashes, golden sha | "Why did it decide that — and would it have told me if unsure?" | one record | **P0** |
| `/benchmark` | The receipt: 3-arm table (naive/plain/gated), per-mutation breakdown (9 mutations × expect target/none/ambiguous), τ/δ sweep scatter with the chosen point and the δ=0.12 knee annotated, wrong-vs-abstained trade curve | "Is the judgement measured, or vibes?" | `bench.json`, `sweep.json` | **P0** |
| `/studio` | Bright Data centrality: Collector ID `c_mt1nrjboski90goqc` prominent, snapshot `j_mt1q17uoq8rkcxd8a` sample rows, the audit ("reported 100% success / 0 failed — 3 of 10 promised fields never arrived"), the recorded heal→check→approve transcript | "Is Scraper Studio central?" (criterion 4 + judges' checklist "wired into a dashboard") | `audit.json`, ndjson, `bd-heal-transcript.json` | **P0** |
| `/live` | Break it on demand: pick site + capture pair + optional mutation → run → decision renders with the same MarginBar components. `duplicate_similar` → watch it **refuse** | "Show me it break. Show me it decline to guess." | `manifest.json`, `POST /api/run` | **P1** (first P1 built) |

Not building: `/about` (README's job), `/settings`, per-site pages, auth. Six routes total; nav shows five (event detail is reached from lists).

**3-minute demo path** (video and live judging both): `/studio` (real collector, real "100% success" lie, real heal) → `/live` run `duplicate_similar` → it abstains → click into the proof record, margin bar tells the story → `/benchmark` (55.6 → 0.0, thresholds published) → `/` close. Every beat is one navigation.

---

## E. Task breakdown

Clock: ~63 h to the *believed* deadline; plan to be **submittable at T+53 h (Aug 23 15:00 IST)**. Two sleep blocks ≈ 14 h → ~40 working hours against ~34 h of tasks below. Order is dependency order; do not reorder P0s. All commands run from `/Users/vaibhavtomar/Desktop/assay` unless stated.

---

**T01 — Repo hygiene + git init** · P0 · 45 min · deps: none
Why: nothing qualifies without a public repo; required artifacts are currently gitignored.
Files: `.gitignore`, `package.json`, delete `app/` and `tools/build-app.js`.
Steps:
1. Overwrite `.gitignore` with exactly:
   ```
   node_modules/
   .env
   .next/
   .DS_Store
   web/next-env.d.ts
   ```
2. In `package.json` delete the line `"mermaid": "^11.17.0",` (keep cheerio + fastest-levenshtein). Run `npm install` to sync the lockfile.
3. `rm -rf app/ tools/build-app.js .DS_Store`
4. `git init && git add -A && git commit -m "Assay engine: fingerprint/detect/heal/mutate + corpus, benchmark, replay evidence"`
5. Create the GitHub repo (public) and push: `gh repo create assay --public --source . --push` (if the name is taken, `assay-scraper`).
Acceptance: `git log --oneline` shows ≥1 commit; `git ls-files results/ | wc -l` ≥ 5; `git ls-files corpus/ | wc -l` = 78; `npm test` still prints "all checks pass"; repo visible at github.com.

**T02 — README skeleton** · P0 · 45 min · deps: T01
Why: every later task fills a section; the skeleton prevents a 2 a.m. blank page.
Files: `README.md` (new).
Sections (headers only + one placeholder line each): What Assay is (the one-liner + the Erratum principle) · The problem (silent wrong recalls) · Results table (paste bench numbers) · How it works (capture→detect→attribute→rank→gate→prove; embed the FigJam architecture image exported as PNG into `assets/`) · How Scraper Studio is used (Rule 10 requirement — collector `c_mt1nrjboski90goqc`, custom-built, parser embeds `fingerprint.js` verbatim; heal/approve loop) · Example structured output (link `results/events.jsonl` + one inline proof record) · Reproduce (`npm install; npm test; node tools/replay.js; node tools/bench.js; cd web && npm run dev`) · Honest limits (0 organic abstains; oracle weakness; mutations are synthetic — cite PLAN.md) · AI disclosure (Rules 11–13: state the assistants used and that all code is explained in PLAN.md/comments) · Prior art (condense PLAN.md §17b table) · Not-claims (deliberately: no probes, no government sources per Rule 7).
Acceptance: README renders on GitHub with all sections present; commit.

**T03 — Scaffold `web/`** · P0 · 30 min · deps: T01
Commands:
```bash
cd /Users/vaibhavtomar/Desktop/assay
npx create-next-app@16.3.1 web --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack --yes
cd web && npm run dev   # verify http://localhost:3000 renders, then stop
```
Then pin exact versions in `web/package.json` (`next` `16.3.1`, `react`/`react-dom` `19.2.8`, `tailwindcss` `4.3.3` — remove `^`), add `"engines": {"node": ">=20.9"}`, `npm install`.
Acceptance: `npm run dev` serves the default page with zero console errors; `git add web && git commit`.

**T04 — shadcn + theme** · P0 · 45 min · deps: T03
Commands (in `web/`):
```bash
npx shadcn@4.18.0 init --yes -b neutral
npx shadcn@4.18.0 add button card badge table tabs separator chart tooltip
```
Set a fixed dark theme in `globals.css` (single committed look — no toggle): background `#0c0d10`, panel `#131519`, border `#22252c`, fg `#e8eaee`, dim `#8b919d`, ok `#3fb27f`, heal `#4a9eff`, warn `#e8a33d`, stop `#e05c5c` (palette lifted from the deleted scratchpad — values only). Map `--chart-1..5` to these. Build `layout.tsx`: left "ASSAY" wordmark + tagline "refuses to answer when it isn't sure", nav links Overview/Events/Benchmark/Studio/Live, Geist font via `next/font`.
Acceptance: all five nav routes exist as stub pages that render inside the shell; no hydration warnings in console.

**T05 — `lib/types.ts` + `lib/data.ts`** · P0 · 1.5 h · deps: T03
Transcribe the C.2 types exactly; implement every loader listed in C.2 with the `ASSAY_ROOT` resolution rule, missing-file→null behaviour, and JSONL bad-line skipping (count kept on the return: `{events, skipped}` for the events loader).
Acceptance (run in `web/`): `npx tsx --eval "import('./src/lib/data.ts').then(async m=>{const e=await m.getEvents();console.log(e.events.length, e.events[50].event)})"` prints `74 heal`-or-`ok` (any valid event) — if `tsx` is absent, `npm i -D tsx@latest` first. Type-check passes: `npx tsc --noEmit`.

**T06 — Engine-side tooling (the only non-web code work)** · P0 · 2 h · deps: T01
Why: the UI contract (C.1/C.2) needs `demo-run.js`, `audit.json`, and abstain demo records. **`src/` is not touched.**
1. `tools/demo-run.js` — copy `tools/run.js`, add: flag parsing for `--site --from --to --mutation --json`; when `--mutation <id>` is set, apply that mutation from `src/mutate.js` to the *newer* capture's target before detection (mark with `markTarget` first, exactly as `tools/bench.js` already does — copy its wiring); emit the full `AssayEvent` (add `source: mutation? "mutation_demo" : "live"` and `mutation` fields) to stdout as JSON and append to `results/demo-events.jsonl`.
2. `tools/audit.js` — add `--json` flag writing the C.2 `Audit` shape to `results/audit.json` (keep console output unchanged).
3. Generate the abstain evidence: run `node tools/demo-run.js --site ikea --from 202401 --to 202608 --mutation duplicate_similar --json` and the same with `--mutation remove_field`, plus one per other site; confirm at least 2 records with `"decision":"abstain"` land in `demo-events.jsonl`. Commit `audit.json`; commit a curated `demo-events.jsonl` seed (the live demo will append more locally).
Acceptance: `node tools/demo-run.js --site ikea --from 202401 --to 202608 --mutation duplicate_similar --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);if(j.decision!=='abstain')process.exit(1);console.log('ABSTAIN OK', j.reason)})"` prints `ABSTAIN OK thin_margin` (or `below_tau`); `results/audit.json` exists and `node -e "const a=require('./results/audit.json');if(!a.fields.recall_title)process.exit(1)"` passes; `npm test` still green.

**T07 — `/` Overview page** · P0 · 2 h · deps: T04, T05
Stat tiles (naive wrong % · gated wrong % · abstained % · runs · heals — from bench + events), thesis line, per-site strip (runs/heals/abstains per site), last-8 events list linking into `/events/[run]`.
Acceptance: with `results/` intact the page shows 55.6 / 0.0 / 31.1 and 74+ runs; with `results/events.jsonl` temporarily renamed the page shows the empty state naming `node tools/replay.js` (then rename back).

**T08 — `/events` + `/events/[run]` + MarginBar** · P0 · 4 h · deps: T05, T06
The centerpiece task. `/events`: table ordered by run desc — run#, site, capture date, event badge, cause, margin (when present), mutation-demo badge, skeleton-changed dot. `/events/[run]` (**await `params`** — Next 16): header (site, captures, field, mode, thresholds) · diagnosis verbatim in a mono block · signal chips · candidate cards (selector, value, score bar 0→1) · **`margin-bar.tsx`**: horizontal 0→1 axis, top-candidate bar, runner-up bar, τ=0.6 vertical line, the gap between the two bar-ends shaded and labeled `margin 0.502 > δ 0.16 → HEAL` (green) or `margin 0.04 ≤ δ 0.16 → ABSTAIN` (amber) or `score ≤ τ → ABSTAIN` (red), ~600 ms width animation on mount · verdict panel (healed_to selector+value, or abstain reason with the line "no-match beats mismatch").
Acceptance: `/events/51` renders the real IKEA heal (score 0.8787, runner-up 0.3763, margin 0.5023, HEAL); a mutation-demo abstain record renders with amber verdict and the demo badge; unknown run number → styled not-found, not a crash.

**T09 — `/benchmark`** · P0 · 2.5 h · deps: T05
Three-arm table with value_wrong highlighted (55.6% / 17.8% / **0.0%**) · per-mutation table grouped by `expect` (target/none/ambiguous) with plain-vs-gated columns · sweep scatter (shadcn chart, Recharts ScatterChart): x=abstainPct, y=wrongPct, one point per grid entry, chosen (τ 0.6, δ 0.16) highlighted, δ=0.12 knee annotated ("4.4% wrong at 77.8% correct — the aggressive alternative") · one paragraph: what τ and δ each guard (lift from `heal.js` comments).
Acceptance: renders entirely from `bench.json` + `sweep.json`; chosen point visibly marked; `npx tsc --noEmit` clean.

**T10 — `/studio`** · P0 · 2 h · deps: T05, T06 (transcript section appears after T12)
Collector ID `c_mt1nrjboski90goqc` as a copyable code chip + "custom-built in Scraper Studio (Rule 5)" note · snapshot `j_mt1q17uoq8rkcxd8a`: 60 records, 3 sample rows from the ndjson · audit panel: "Bright Data reported **100% success, 0 failed crawls**" against the per-field table from `audit.json` (present-rate, signals) with `recall_title 0/60` in red · heal-loop panel rendering `bd-heal-transcript.json` as a step timeline (renders "pending — see T12" empty state until the file exists) · the criterion-4 sentence verbatim: *detector decides when to heal, verification gate decides whether to approve; Scraper Studio proposes and executes the fix.*
Acceptance: page renders with transcript absent (empty state) and with a hand-made placeholder transcript file (then delete the placeholder).

**T11 — `/api/run` + `/api/events` + `/live`** · P1 (build first among P1) · 3 h · deps: T06, T08
Implement C.3 exactly (whitelist validation, spawn array-args, 30 s timeout). `/live`: form (site select from manifest, from/to capture selects filtered by site, mutation select incl. "none"), Run button → result panel reuses `candidate-list` + `margin-bar` + verdict components, then `router.refresh()`.
Acceptance: `curl -s -X POST localhost:3000/api/run -H 'content-type: application/json' -d '{"site":"ikea","from":"202401","to":"202608","mutation":"duplicate_similar"}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.event.decision)})"` prints `abstain`; `curl -s -X POST localhost:3000/api/run -d '{"site":"evil; rm -rf /"}' -H 'content-type: application/json' -w '%{http_code}'` returns 400; the new record appears on `/events` after refresh.

**T12 — Bright Data heal/approve, recorded** · P0 · 3 h timebox HARD · deps: T06 (audit.json wording), independent of web tasks
Prep: create `/Users/vaibhavtomar/Desktop/assay/.env` with `BRIGHTDATA_API_TOKEN=<from dashboard>` (never committed); verify balance/credits in the dashboard (A.1 item 6). Start screen recording BEFORE login. Run the C.9 command sequence. Apply the ADR-6 preview check; `approve` if it passes, `--reject` if not — **both outcomes are a successful task**. If approved: `bdata scraper run` a 5–10 URL batch, save output as `results/ikea-recalls-healed.json`, and note revived cross-check agreement counts. Assemble `results/bd-heal-transcript.json` (C.2 shape) from the session; commit it; wire into `/studio`.
Timebox rule: if login or heal has not produced a preview by the 3 h mark, STOP; commit whatever transcript exists (even a failed-heal transcript is criterion-4 evidence of using the loop) and record the fallback video beat instead: the audit finding + the heal command being issued.
Acceptance: `results/bd-heal-transcript.json` exists with ≥3 steps and a `verdict` field; screen recording file saved outside the repo; `/studio` renders it.

**T13 — Polish pass (Suit-Up)** · P1 · 3 h · deps: T07–T11
Spacing/typography sweep at 1280 and 1440 px · number formatting (one decimal for %, mono for hashes/selectors) · empty/loading states verified · nav active states · favicon + `<title>` ("Assay") · `npm run build` in `web/` passes (catches type + prerender errors even though the demo runs dev) · Lighthouse quick check, fix anything egregious.
Acceptance: `cd web && npm run build` exits 0; every route visually checked at both widths; zero console errors on all six routes.

**T14 — README full + Scraper Studio writeup + disclosure** · P0 · 2 h · deps: T12 (transcript facts), T09 (final numbers)
Fill every T02 section with final numbers, screenshots of `/events/[run]` and `/benchmark` (into `assets/`), FigJam architecture PNG export, the ADR-6 precise sentence about the two gates, the honest-limits list, AI disclosure, prior-art table.
Acceptance: a stranger following only the README's Reproduce section on a fresh clone reaches a green `npm test` and a running UI (actually test this in `/tmp`: `git clone <repo> /tmp/assay-check && cd /tmp/assay-check && npm install && npm test`).

**T15 — Video script** · P0 · 1 h · deps: T12 (know which heal beat exists)
Write a word-for-word script for the D.3-minute path: 0:00 problem (silent wrong recall) · 0:25 `/studio` — real collector, "100% success" vs missing fields · 0:55 the recorded `bdata scraper heal` → check → approve/reject clip · 1:30 `/live` duplicate_similar → **ABSTAIN** → open proof record, margin bar ("no-match beats mismatch") · 2:15 `/benchmark` 55.6 → 0.0 at 31.1% abstained, thresholds τ 0.6 / δ 0.16 published · 2:45 recap + one honest limit (0 organic abstains — say it proudly: on 74 real pairs it never needed to refuse). Save as `docs/VIDEO-SCRIPT.md`.
Acceptance: read-aloud time ≤ 2:50 at normal pace.

**T16 — Record, edit, upload video** · P0 · 4 h (incl. upload buffer) · deps: T13, T15
QuickTime/OBS screen capture at 1440p, real microphone, multiple takes per beat, hard cuts. **No token visible anywhere** (fresh terminal, `.env` never on screen). Upload to YouTube, public or unlisted-public, "Not made for kids". Put the URL in README.
Acceptance: video plays from a logged-out browser; length ≤ 3:10; URL in README; final commit + push.

**T17 — Submit — then resubmit** · P0 · 45 min · deps: T14, T16
By **Aug 23 15:00 IST**: fill the submission form on the hackathon page (repo URL, video URL, project description, Scraper Studio explanation — draft the two text answers in `docs/SUBMISSION.md` first so they're pasteable). Resubmission is allowed: if T13/T18 polish lands later, resubmit by 21:00 IST. Verify on the page that the submission registered.
Acceptance: confirmation screen screenshotted into `docs/`; a second person (or logged-out browser) can open the repo and the video.

**T18 — (buffer) Fresh-clone dry run + Discord check** · P1 · 1 h · deps: T17
Re-run the T14 fresh-clone test after all commits; check the WeMakeDevs Discord for any late submission-form or deadline announcements (the only official channel).

Total: ~34 h against ~40 available. The ~6 h slack absorbs the unknowns in T12 and video takes.

---

## F. Improvements, risks, cut list

### Ranked by value per hour (do in this order if hours remain after T18)

1. **A second real heal-loop cycle showing `--reject`** (1 h) — if T12 ended in approve, deliberately ask heal to fix a fabricated complaint and reject the bad preview on camera. The reject IS the thesis (judgement over eagerness). Highest marginal value per hour available.
2. **Risk–coverage curve as the `/benchmark` hero** (1.5 h) — plot wrongPct vs correctPct across the sweep as a proper frontier with the chosen point; this is "item 5, the deliverable" from PLAN §17b rendered as one picture.
3. **`/events` sparkline strip per site** (1 h) — skeleton-hash-change markers over time make "sites really did redesign" visceral.
4. **LinkedIn post (Daily Bugle track)** (30 min) — separate prize, zero project risk; post the margin-bar screenshot + the 100%-success finding, tag WeMakeDevs.
5. **Deploy to Vercel** (2 h, risky) — only if everything else is done; requires copying `results/` + `corpus/manifest.json` into `web/` at build (the fs-sibling reads break on Vercel) and disabling `/live`'s spawn (serverless has no `tools/`). A half-working deploy is worse than a crisp local video — genuinely last.

### Honest risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| T12 heal behaves unexpectedly (long turnaround, bad preview, login friction) | medium | 3 h hard timebox; `--reject` and even a failed transcript still score; fallback video beat scripted in T15 |
| Deadline earlier than believed (time unpublished) | low-medium | R1: complete submission at T+53 h; Discord watch (T18) |
| Judge reads mutation-demo abstains as staged | medium | Visible badges + the README sentence in ADR-11; `/live` lets a judge trigger one themselves |
| Judge asks "isn't your healer competing with Bright Data's?" | high | The two-gates sentence (ADR-6) rehearsed for video and README; margin gate = offline evidence, BD heal = the production repair path |
| `create-next-app`/shadcn flag drift from the researched invocations | low | Both tools are interactive-safe: if a flag errors, run interactive and answer with the R4 choices |
| 14 MB corpus makes `git push` slow on hotel wifi | low | It's 14 MB once; nothing to do |

### Cut list — pre-authorized, in cut order, if the clock wins

1. T18 dry run → manual spot check.
2. F-improvements (all).
3. `/live` (T11) → video uses `node tools/demo-run.js` in a terminal + the pre-generated abstain record on `/events/[run]`. The centerpiece survives; the interactivity dies.
4. `/studio` transcript polish → paste the raw terminal screenshot instead of the timeline component.
5. T13 polish → ship at 1280 px only.
6. **Never cut:** T01, T02/T14 README, T12 (even failed), T15/T16 video, T17 submission, the margin bar on `/events/[run]`. These are the qualification floor.

---

## G. Figma board

**URL: https://www.figma.com/board/sdJWJyOKgrDQgDQ8MnROCr** (FigJam, created 2026-08-21 on the "Vaibhav Tomar's team" plan)

Contents:
1. **"Assay UI Sitemap"** — the six routes of section D as a hierarchy rooted at `/`; each node carries purpose, the judge-question it answers, priority, and the data it reads; `/events/[run]` highlighted blue as the centerpiece, `/studio` amber as the criterion-4 anchor.
2. **"Assay System Architecture"** — capture → detect → attribute → rank → gate → prove as the engine spine; sources (Wayback corpus, Scraper Studio collector) on the left; the Bright Data heal/approve loop hanging off the gate's heal edge; benchmark and audit as side taps; everything draining into `results/` and the Next.js UI. Mirrors C.0 — if the two ever disagree, C.0 in this file is authoritative.

Suggested use: screenshot the architecture diagram → `assets/architecture.png` for the README (T14); walk the sitemap once before T07–T11 to keep page scope honest.

---
*End of plan. Nothing above is built. Review the REVIEW QUEUE, answer R1–R15, then start at T01.*

# Assay — Full Platform Review

Date: 2026-08-23 · Target: `http://localhost:3000` (branch `feat/screens`, HEAD `82c0aea`)
Method: four independent Opus agents, each driving its own Chrome tab via DevTools MCP —
(1) end user, (2) developer/integrator, (3) hackathon judge, (4) UI/UX + content editor.
Full per-perspective reports are appended below the synthesis.

---

## Executive summary

The engine and the honesty posture are the real thing: verification-before-creation, visible
abstention, provenance tables naming DB columns, benchmark numbers that reconcile exactly with
`results/bench.json`, SSRF protection with per-hop DNS re-resolution, timing-safe key comparison,
zero secrets in the client bundle, zero console errors on every screen. The judge scored technical
depth **9/10** and called it a top-quartile submission.

But the surface undersells and sometimes betrays it:

- **The hero CTA crashes the server.** "Start watching these fields" after an AI proposal killed
  the `next dev` process outright — black error page, all 8 proposed fields and ~90s of model work
  lost. It is the first thing a judge or user will click.
- **The integration on-ramp is a hard stop.** `npm run apikey` — the only way to mint a credential
  for the 31 `/api/v1/*` routes — dies on a raw Drizzle error (migration `0007` unapplied), and the
  documented remedy also fails. Docs contain no API reference, no CLI docs, two sentences on MCP.
- **The product contradicts itself on one viewport.** `/decisions` says "Nothing is waiting on
  you" while the bell says "1 WAITING ON YOU"; Home says "0 waiting" while `/runs` says "1 held";
  `/runs/54` says "nothing was published" three inches above "The cell was published as null".
- **The differentiator is invisible.** Home never says what Assay is; the perfect tagline lives on
  unlinked `/sign-in`; `/docs` and `/compare` have zero inbound links; the gate's score/margin/
  thresholds are persisted in `field_runs.ranked` but rendered nowhere — making the README's
  proof-record claim an overclaim.
- **Vocabulary is unenforced.** One state (a gate-refused cell) has eight names across screens;
  ~12 load-bearing terms (gate, tier, contract, cadence, anchors, skeleton, episode…) have no
  glossary.
- **No mobile layout, mechanical a11y failures.** At 390px, page titles truncate to "Fiel…" and
  the letter "E"; two `<h1>`s per route, no `<nav>` landmark, key status words at 2.55–2.94:1
  contrast.

Judge scores: Idea **8** · Execution **8** · Demo impact **5** · Technical depth **9** ·
Completeness **8**. The demo currently undersells the work by ~2 points.

---

## Cross-cutting themes (found independently by 2+ perspectives)

| Theme | Seen by |
|---|---|
| "Start watching these fields" crash — hero flow, data loss | user, judge, dev |
| Contradictory "waiting on you" counters across surfaces | user, judge, uiux |
| `/docs` and `/compare` unlinked from app nav; tagline stranded on `/sign-in` | user, judge, uiux |
| Gate numbers (score/margin/tau/delta) never rendered on trace or proof page | judge, dev (data exists in `field_runs.ranked`) |
| Jargon with no glossary; same concept, many names | user, uiux |
| Skipped runs mislabeled "clean" | user, uiux |
| Settings/Schedule are read-only viewers with control-promising names | user, uiux, judge |
| Truncated scraper names hide the only distinguishing part | user, judge, uiux |
| Links go to list pages instead of the specific run | user, judge |
| No `error.tsx` / styled 404; bad ids soft-404 with HTTP 200 | user, dev |
| Empty demo DB: 0 healed runs, empty Decisions queue | judge (and user resolved the only item) |

---

## Priority fix list

### P0 — before anyone else touches it
1. **Fix or disable the "Start watching these fields" crash.** No dev-server logs survived; the
   dev agent ruled out `process.exit`/subprocesses/fire-and-forget by reading; leading hypothesis
   is dev-mode heap on the 8 MiB page → cheerio tree. First step: run dev with
   `next dev 2>&1 | tee dev.log` and `NODE_OPTIONS='--trace-uncaught --unhandled-rejections=strict'`
   and reproduce once.
2. **Unbreak `npm run apikey`.** Wrap `tools/apikey.ts:37` in a try/catch that detects Postgres
   `42703`/`42P01` and prints the migrate instruction (reuse `tools/migrate.ts:33-40`); reconcile
   the migration state (`drizzle.__drizzle_migrations` is empty, `0007` unapplied, so
   `npm run db:migrate` currently fails with `already exists`).
3. **One source of truth for the held count.** Fix the bell/queue/home/runs disagreement (the
   answered item still counts toward the badge).
4. **Fix `/docs` dev-mode 500** (`recentlyCreatedOwnerStacks` TypeError — duplicate React from
   fumadocs macro loader + `extensionAlias` + `transpilePackages`; prod build is fine).

### P1 — demo-critical
5. **Seed the demo DB**: at least one healed run (clear margin) and one unanswered held cell.
   `npm run demo` already produces exactly this pair.
6. **Render the gate's numbers** (score, margin, "needs > 0.60 and > 0.16") on the run trace's
   Gate table and the `/explain` proof page — rendering, not engineering; makes the README claim true.
7. **Say what Assay is on Home** — move "A scraper that abstains when it is not sure" from
   `/sign-in`; add a proof strip ("153 cases · 0 wrong values published → see the numbers").
8. **Add Docs and Compare to the sidebar nav**; fix `/compare` highlighting "Fields".
9. **Rename "clean" for skipped runs** → "skipped — page unchanged".
10. **Point "See the run ›" / activity links at `/runs/{id}`**, not `/runs`.
11. **Fix the proposal table**: visible scroll affordance + row count; tier disclosure rendered
    outside the scroll container; make the "strict tier" prose agree with the "normal" chips.
12. **Restore "Ask for a run" with 2+ scrapers** (add a scraper picker instead of hiding the button).
13. **Record the demo video** (README still says TODO).

### P2 — product quality
14. Pick one name for a gate-refused cell; add `/docs/glossary`; unify `tau/delta` vs `floor/lead`.
15. Mobile layout below ~768px (stacked cards for the six tables); fix the 390px title truncations.
16. A11y: one `<h1>` per page, `<nav>` landmark, contrast ≥ AA on `held`/`clean`/table headers,
    consistent focus rings.
17. Toast + undo on Decisions actions; "Neither is right" should offer re-teaching, not vanish.
18. Field/scraper edit, pause, delete, cadence change from the UI (today: create-only, forever).
19. Middle-truncate scraper names; show the field name on `/fields` rows.
20. `error.tsx` + branded `not-found.tsx`; real 404s for unknown ids instead of 200 soft-404s.
21. Move `requireKey` inside `guarded`'s try (`src/api/handlers.ts:25`, twin in
    `src/connectors/handlers.ts:29`); add security headers in `next.config.ts`; dedupe the double
    `_rsc` prefetch.
22. Docs: write `api-reference.mdx` and `mcp.mdx`; add `web/app/api/search/route.ts` (3-line
    fumadocs file — search currently 404s); fix `self-host.mdx:143` DB URL.
23. Fix `/runs/54` clipped pipeline diagram and the identical-panes selector diff.
24. Settings: wire controls or convert to honest read-only status rows; kill the dead "contract" reference.
25. Fix slack/discord doc links (`#email-delivery` anchor), `export as YAML` feedback,
    `/fields` filter menu not closing + wrong empty-state copy, "1 observation(s)" plural,
    `what shouldAssay watch?` missing space.

---

## Feature ideas worth building (judge's picks)

1. **"Break it live" button** — you own the testbed and `src/mutate.ts`; flip the page to a mutated
   variant, trigger a run, land on the trace. 40-second break → detect → heal-or-abstain → proof
   loop, on stage, no pre-baked data.
2. **Counterfactual strip on every held cell** — "A healer without the gate would have published
   `2026-01-15`. Assay published nothing." Turns abstention from a visible failure into a visible save.
3. **Benchmark-scoped hero counter** — "0 of 153 wrong · naive would have published 93" instead of
   the instance-scoped "0 published in error".
4. **Bright Data audit as a screen** — "6 of 10 promised fields unhealthy behind a 100%-success run"
   is the best real-world evidence and currently lives only in prose.
5. **Field-fragility grade with a fix suggestion** — reframes the product from "cleans up after
   breaks" to "tells you what will break next".
6. **Data view / export** — nowhere in the UI can you see the values a scraper has collected over
   time (no table, no CSV, no "last 30 values").
7. **Hide 4 of the 6 composer modes for the demo** — only Watch is the product.

---
---

# Appendix A — End-user perspective (full report)
# Assay — end-user review (first-time user, web UI at localhost:3000)

## Summary
Assay's core loop genuinely works and is unusually honest: I created a scraper from a pasted example value, it verified the value existed on the live page before accepting it, ran, refused to publish an ambiguous cell, and showed me a full decision trace with a shareable proof id.
But the flagship AI path crashed the whole web server when I clicked "Start watching these fields", losing 8 proposed fields; and once you own more than one scraper the UI quietly removes your only "run now" button.
The product also never says what it is on the home page — the actual tagline is buried on `/sign-in`, a route with no sign-in on it — and Settings/Schedule are read-only viewers where a user reasonably expects controls.

---

## What works well

- **Verification before creation is excellent.** In "Describe the fields yourself" I entered `price` = `$19.99` against the recalls testbed page. It fetched the page and refused: *"Could not find price on https://… Paste the value exactly as it reads on the page -- Assay will not start watching a field it cannot see once."* Almost nothing does this. Bad URL also caught cleanly: *"That is not an http or https URL."*
- **The run detail page (`/runs/1`, `/runs/54`) is the best screen in the app.** A node diagram of Fetch → Unchanged? → Resolve baseline → Evaluate → Search for replacement → Gate → Hold, plus a `Sources` table that names the exact DB column every fact came from (`field_runs.reason`, `runs.page_sha`). That is real, auditable, and rare.
- **Proof ids are followed through properly.** `proof ›` opens a panel, "the full record ›" shows the exact JSON that would land in your data, and `Open as a page ›` → `/explain/pr_…` is a standalone shareable page that renders correctly.
- **Abstention is visibly real.** Run 54 held the cell, wrote `null`, labelled it `quarantined`, opened episode #10, and told me *"Nothing was written to your data for this cell."* The Decisions screen then offered Best match / Close second / Leave empty / Neither is right.
- **Stale-proposal guard in chat.** After a server restart the old field proposal showed: *"Read from the page at 15:25, so it is no longer current. Nothing was created from it."* with a re-read button. Genuinely thoughtful.
- **Library one-shot preview works.** `/library/github` + `https://github.com/vercel/next.js/releases` → `Run` returned real values (`v16.4.0-canary.2`, `22 Aug 23:45`) in seconds, then offered "Start watching".
- **Schedule month view explains itself well**: *"Assay stores one future run per scraper. Every dashed mark after it is arithmetic on the cadence, not a record."*
- **Docs site (`/docs/*`) is high quality** — "Presence only, everywhere", "Assay runs with no model. A model only ever proposes; the gate decides."
- **Notification/connection settings are honest about being env-driven** rather than pretending to be toggles that work.

---

## Bugs & broken things

### HIGH — "Start watching these fields" crashed the entire web server and lost all work
Repro:
1. Home → paste `https://assay-testbed.vercel.app/v/baseline/ - track the units affected for each recall` → Enter.
2. Wait ~60s. Assay proposes 8 fields with live values, all checked, footer "8 of 8 fields · daily".
3. Click **Start watching these fields**.

Result: instant full-page black error boundary — **"This page couldn't load / Reload to try again, or go back."** Console: `Failed to load resource: net::ERR_CONNECTION_REFUSED`, `Uncaught TypeError: Failed to fetch`. `curl http://localhost:3000/` returned nothing; `ps` showed the `next dev` process **gone entirely** (the worker process survived). After restarting the server, `/fields` still showed **4 tracked** — none of the 8 fields were created. The entire ~90s of model work and my confirmation were lost with no recovery path.

### HIGH — "Ask again to re-read the page" silently does nothing
Repro: open a chat whose proposal has gone stale → click **Ask again to re-read the page**.
Result: my message is re-posted as a second blue bubble, and then **nothing** — no spinner, no reply, no error, for 3+ minutes. Server log shows `[assay/agent] model call failed, degrading to the manual path: Error: Claude Code process aborted by user`, but the UI never tells the user the model call failed. It just looks hung forever.

### MED — Runs list labels skipped runs as "clean"
Repro: `/runs` → run 53 row says `✓ clean`. Click into `/runs/53` → header says **"skipped — the page had not changed"**, and its own History donut says **clean 1 (20%) / skipped 4 (80%)**.
So the list tells you 5 clean runs where only 1 actually collected data. For a product whose pitch is honesty about what was published, calling "we didn't look" *clean* is the wrong word. `/schedule` repeats it, though its own legend distinguishes "ran, clean" from other states.

### MED — Once you have 2+ scrapers, the "Ask for a run" button disappears everywhere
Repro: with 1 scraper, Home shows a green **Ask for a run** in the top bar and it works (I used it; run 53 appeared within a minute). Create a second scraper → the button vanishes from Home, `/runs`, `/fields`, `/decisions`, `/schedule`. It only reappears on single-scraper pages (`/runs/54`, `/explain/…`).
Net effect: the more you use Assay, the less you can trigger a run. There is no scraper picker to replace it.

### MED — "Decide it ›" on an already-resolved decision dead-ends
Repro: `/decisions` → answer a held cell with **Neither is right** → go to `/schedule` → click the run 54 row → popup still shows the held cell with **Decide it ›** → `/decisions?target=assay-testbed-vercel-app-v-baseline__units_affected` → **"Nothing is waiting on you."** No "this was already decided", no record of what I chose.

### MED — Decision actions give zero confirmation and no undo
Repro: `/decisions` → **Neither is right**. The card just vanishes. No toast, no "recorded", no undo, and — most importantly — no follow-up. "Neither is right" means the field is pointed at the wrong thing; the app offers nothing to re-teach it, so it is a pure dead end.

### MED — "See the run ›" and activity links go to list pages, not the run
- Home, after creating a scraper: `See the run ›` → `/runs` (not `/runs/54`).
- `/library/github` after Start watching: `See the run ›` → `/runs`.
- Activity popover: *"…broke on units_affected, from run 54"* → `/runs`, not `/runs/54`.

### MED — Field proposal table hides rows in a silent internal scroll
Repro: chat proposal for 8 fields. The table shows 7 rows, no scrollbar, no fade, no "8 rows" affordance — yet the footer says "8 of 8 fields". `units_2025_041 / 9,880 units` is only reachable by scrolling inside the card (measured `clientHeight 552` vs `scrollHeight 973`). With 20 fields a user would confidently believe half of them don't exist.

### MED — Expanding the tier explainer on the last row is clipped and unreachable
Repro: in the same proposal table, click the `normal ⌄` chip on the bottom row. The panel opens *inside* the overflow container and renders as a ~10px grey sliver; the container is already at max scroll, so the content cannot be read at all.

### MED — Proposal prose contradicts the controls next to it
Repro: same screen. Text says *"notice_2026_014, notice_2026_009, notice_2026_003, notice_2025_041 have nothing solid to anchor to, so they start on the **strict** tier."* Every one of those rows shows a chip reading **normal**, and expanding one shows `tier normal · tau 0.60 · delta 0.16` (the strict numbers elsewhere are 0.70/0.20). One of the two is lying.

### MED — Slack and Discord "See documentation" point at the email anchor
Repro: `/settings?tab=connections` → the `slack` and `discord` rows' **See documentation** both link to `/docs/credentials#email-delivery`. `/docs/credentials` has no slack or discord section at all, so the user is dropped somewhere unrelated with the CLI command (`assay connectors set slack --url …`) as their only real instruction.

### MED — "See it on the page" doesn't show the page
Repro: `/decisions` → click **See it on the page** (eye icon). It opens the *"Where did this number come from?"* proof panel. No page, no screenshot, no highlighted element. The label promises the one thing a user deciding between two candidates most wants.

### LOW — `/fields` filter menu doesn't close, and shows the wrong empty state
Repro: `/fields` → "all fields" dropdown → **held (0)**. The menu stays open, overlapping the content. Behind it, the empty state is the *Decisions* copy: *"Nothing is waiting on you. Every cell in the last run was either published or is still being watched."* — wrong screen's message for a filtered field table.

### LOW — `export as YAML ›` gives no feedback
Repro: `/settings` → click **export as YAML ›**. Nothing visible happens — no dialog, no toast, no console output, no download. If it copied to the clipboard, the user has no way to know.

### LOW — Sidebar footer looks clickable and isn't
"Self-hosted / No accounts on this instance" carries a chevron-up-down icon (the universal account-switcher affordance) but is a plain `<div>` with no handler.

### LOW — 404 is the unstyled Next.js default
`/nope-does-not-exist` → black page, `404 | This page could not be found.` No Assay chrome, no nav, no way back.

### LOW — Counter disagreements on the same screen
On Home after run 54: top bar says **"Activity, 1 waiting on you"**, the stat block below says **"0 waiting on you"**, the nav badge showed **1**, and `/decisions` header said **"nothing waiting on you"**. Four numbers, one truth. (Activity appears to be counting break events under a "waiting on you" label.)

### LOW — `/runs/54` shows a "before → refused" selector diff where both sides are identical
Both panes read `selector: "dd.recall-card__value", attr: "text", transform: "trim"`. Presenting an identical pair as a red/green diff reads as a rendering bug.

### LOW — Ambiguous run 54 blurb never updates
`/runs` still says *"held units_affected **for review**"* and the header count still says "1 held" after I resolved that decision.

### LOW — Escape closes the @ / menus but leaves the inserted character
Click **@**, press Escape, click **/**, press Escape → input now literally contains `@ /`, which then became my conversation's permanent title (visible in the sidebar as a chat called `@ /`, unrenameable).

### LOW (unconfirmed) — `/fields` "how it is found" text changed for the same field
Before the crash, `recall_title` read: *"Held only by classes, heading_path, id_xpath -- no id, no test hook, no role. It has not moved in 5 runs…"*. After restarting against the same database, every row reads *"0 observation(s) of this field; 3 are needed…"*. Same data, different explanation — worth checking whether that copy depends on in-process state.

---

## Confusions & friction

- **The home page never says what Assay is.** It opens with "What should Assay watch?" and six unexplained chips (Watch / Research / Build API / Automate / Compare locations / AI visibility). In 10 seconds I could tell it watches web pages; I could not tell it heals broken selectors, abstains when unsure, or measures its own wrong heals. The perfect one-liner — **"A scraper that abstains when it is not sure."** — exists, and it is on `/sign-in`, a page nothing in the app links to.
- **No link to `/docs` anywhere in the app nav.** The only routes in are one inline link inside a run detail ("How the gate decided ›") and the Connections tab. For a product this jargon-dense, that's backwards.
- **Unexplained jargon on user-facing screens** (no glossary, no tooltip, no doc link): `golden`, `skeleton 916bec10`, `abstain`, `quarantined`, `thin_margin`, `capture_sha`, `episode #10 opened`, `tau 0.60`, `delta 0.16`, `0.60 floor, 0.16 lead`, `heading_path`, `id_xpath`, `anchors`, `contract`, `tier`.
- **My first-ever run "broke".** I created a field from an exact pasted example and its very first run said *"The field did not read cleanly off the baseline's element" → broken → look for a replacement → refused*. Worse, the two candidates Assay offered me for `units_affected` were **`2026-04-18` and `2026-01-15`** — dates, not unit counts, and neither is the `12,750 units` I gave it. From the outside this reads as "I told it exactly what to watch, it confirmed it found it, and one minute later it had lost it." That is the single most damaging first-run experience in the product.
- **"Schedule" is a run calendar, not a schedule editor.** It has Month/Week/Day/List, filters, and search, but no cadence control, no pause, no per-scraper next-run edit — despite the create flow asking me to choose "check every 6h". Header also says "2 running" when nothing is running (2 are *scheduled*), and future rows are labelled "due — has not run" for times hours in the future.
- **"Settings" has no settings.** All four tabs are read-only. Publishing says *"Change per-field policy in a contract"* with no way to open or create a contract. Notifications are three permanently-disabled switches. Connections tells you to run CLI commands.
- **Scraper names are truncated to uselessness.** `/fields` rows show `assay-testbed-vercel-app-re…` and `assay-testbed-vercel-app-v-…` — the actual field name (`recall_title`, `units_affected`) is entirely hidden, so you cannot tell the rows apart. The Schedule month cells show `assay-testbed-v…`, `assay-te…`, `assay-testb…` for three different scrapers. Names share a long common prefix, so truncating from the right is the worst possible choice.
- **"Library" is ambiguous** — I expected my saved scrapers; it's a template catalogue. My scrapers live under a sidebar heading called "SCRAPERS WITH NO CHAT", which describes them by what they lack.
- **"1 observation(s)"** — unpolished plural in otherwise very carefully written copy.
- On `/library/github` the cadence is fixed text "every 12h" with no picker, while the Home form offers hourly/6h/12h/daily/weekly. Same decision, two different levels of control.
- The description line on `/library/github` ("The newest release on a repository.") is a link to `https://github.com/` — surprising and pointless.
- `/explain/…` highlights **Runs** in the sidebar and has no link back to the run it describes.

---

## Missing features a user would expect

1. **Edit or delete a field or a scraper.** Nowhere in the UI. `/fields` rows aren't even clickable. Once created, a scraper is permanent from the browser.
2. **Pause a scraper / change its cadence** after creation.
3. **See the collected data.** Home promises "the runs, and what each one published", but there is no data table anywhere — only per-run field values on a run page, and only when the run wasn't skipped. No export, no CSV, no "last 30 values for this field".
4. **Re-teach a field after "Neither is right."** The whole point of that button is that the target is wrong; nothing follows it.
5. **A scraper detail page.** Clicking a scraper in the sidebar does nothing.
6. **Undo / audit of my own decisions.** No history of what I answered, when, or how to reverse it.
7. **Coherent auth.** `/sign-in` is a credential-status splash, not a sign-in; the footer says "No accounts on this instance"; nothing is protected. Either drop the route name or explain it.
8. **A "run now" control that survives having more than one scraper.**
9. **Editing publish policy / tiers from the UI**, since Settings names the concept but hands it to a CLI.

---

## Quick wins

1. Put **"A scraper that abstains when it is not sure."** (plus one line on healing and measuring wrong heals) at the top of Home. It already exists on `/sign-in`.
2. Add **Docs** to the sidebar nav.
3. Rename "clean" to **"skipped — page unchanged"** in the Runs and Schedule lists, and keep "clean" for runs that actually published.
4. Point `See the run ›` / `broke on … from run 54` at `/runs/{id}` instead of `/runs`.
5. Truncate scraper names from the **middle** (`assay-…-recalls`) and show the field name in `/fields` rows — currently the most-identifying half is the half being cut.
6. Add a toast + Undo on every Decisions action, and after "Neither is right" offer "point this field at the right value" instead of vanishing.
7. Show a scrollbar/fade and a row count on the field-proposal table; render the tier disclosure outside the scroll container.
8. Make the tier chip agree with the sentence above it (or drop the sentence).
9. Point the slack/discord "See documentation" links at real slack/discord anchors.
10. Rename "See it on the page" to "Where this came from", or make it actually show the element.
11. Close the `/fields` filter menu on select, and write a real empty state ("No held fields right now.").
12. Give `export as YAML ›` a toast, and give the 404 page Assay chrome + a link home.
13. Reconcile the "waiting on you" counters, or relabel the Activity one ("recent activity", since it includes breaks).
14. Strip stray `@` / `/` characters when deriving a conversation title, and allow renaming a chat.


---

# Appendix B — Developer perspective (full report)

# Assay — Developer-perspective review

Reviewed 2026-08-23, ~15:45–16:40 IST, against `http://localhost:3000` (and `:3001`).
Repo at `/Users/vaibhavtomar/Desktop/assay`, branch `feat/screens`, HEAD `82c0aea`.

**Important environment note that colours everything below:** at the start of the session
:3000 was a `next dev --webpack` server. It died (see Crash section). At **15:52:11** two
**`npm exec next start web`** — i.e. *production* — servers came up on :3000 and :3001
(PIDs 38902 / 38901, cwd `/Users/vaibhavtomar/Desktop/assay`, serving `web/.next`
BUILD_ID `Th4QtptX07NOuQZBJFz6u` built 15:50). Everything from "API findings" onward was
measured against that production build, not dev.

---

## Summary (3 lines)

1. The engine and API surface are unusually well-built — consistent JSON error envelopes, real
   SSRF protection with per-hop DNS re-resolution, response size caps, timing-safe key
   comparison, zero secrets in the client bundle, and docs whose headline numbers reconcile
   *exactly* with `results/bench.json`.
2. The **integration on-ramp is broken end to end**: `npm run apikey` — the only way to get a
   credential for `/api/v1/*` — dies with a raw Drizzle stack trace because migration `0007`
   is unapplied on the `DATABASE_URL` in `.env`, and the docs site never mentions the REST API,
   the CLI, or the MCP server at all.
3. `/docs` 500'd on a React-internals `TypeError` and the dev server went away moments later;
   `/docs` search is a dead UI (`/api/search` → 404); unknown ids soft-404 with HTTP 200; and
   there is no `error.tsx` anywhere in `web/app`.

---

## Crash root-cause analysis

### What I actually observed (not the reported crash — a second, independent one)

I did **not** re-trigger "Start watching these fields". I did, however, watch the dev server
die.

Timeline, from my own tool output:

| time (IST) | event |
|---|---|
| 15:49:55 | `GET /api/health` → `200` `{"engine":{"heal":true,…},"store":{"reachable":true,"heldCells":1}}` |
| ~15:51 | `GET /docs` → **HTTP 500**, 2463 bytes. Body contains `recentlyCreatedOwnerStacks`. |
| ~15:51 | Browser shows the Next dev overlay: `Runtime TypeError — Cannot read properties of undefined (reading 'recentlyCreatedOwnerStacks')` |
| ~15:52 | `:3000` and `:3001` both → `curl` exit 7 (connection refused). No `next-server` process on either port. |
| 15:52:11 | Two `npm exec next start web` processes start (production, not dev) |

The dev overlay stack was:

```
content/docs/self-host.mdx (259:17)  @ eval
  → rsc)/./content/docs/self-host.mdx?macro_id=lib%2Fsource.ts%23docs
  → ./lib/source.ts
  → ./app/docs/layout.tsx
```

with the failing frame being an MDX-compiled `_jsxDEV(_Fragment, …)` call for the TOC entry
`#exposing-it-on-purpose`.

**Mechanism.** `recentlyCreatedOwnerStacks` lives on React's shared-internals object, read by
`jsxDEV` in `react/jsx-dev-runtime` to build owner stacks in development. Reading it off
`undefined` means the shared-internals object the MDX module resolved is not the one the
RSC renderer installed — i.e. the `react-server` export condition and the plain condition
resolved to two different React module instances for the same render. React is hoisted at
the monorepo root (`node_modules/react` = 19.2.8) and `web/node_modules/react` does not
exist, so the docs subtree is resolved through:

- `fumadocs-mdx`'s macro loader (`?macro_id=lib%2Fsource.ts%23docs`), compiling MDX to
  `_jsxDEV` calls, **plus**
- `next.config.ts:83-89` (`web/next.config.ts`) which overrides `resolve.extensionAlias` for
  webpack, **plus**
- `transpilePackages: ['assay']`, which pulls the engine's TS source into the same graph.

That is three resolution rewrites stacked on one dev graph, which is exactly where a
duplicate-React-instance bug appears. It reproduced only in dev; the *production* build of
the same source serves all seven docs pages at `200` (see Docs section).

**Did the 500 kill the server?** I cannot prove causation and will not claim it. Two facts
argue for it: the process was serving fine 90 seconds earlier and was gone 60 seconds after
the 500, and there is **no** `~/Library/Logs/DiagnosticReports/node-*` crash report — so the
process exited without `abort()`, which rules out a V8 OOM abort and is consistent with an
uncaught-exception exit or a deliberate stop. A restart to `next start` at the same moment is
the confound: someone may simply have swapped dev for prod.

### The reported crash ("Start watching these fields") — code-level trace

The button is `web/app/(app)/watch.tsx:836`. Its handler (`watch.tsx:830`) is:

```ts
onClick={() => start(async () => {
  const r = await build(p.create, keep, conversationId ?? undefined);
  ...
})}
```

`build` is a Server Action in `web/app/(app)/watch-actions.ts:126`. The full path is:

```
build()                       web/app/(app)/watch-actions.ts:126
  assertOperator()            web/lib/auth.ts (AUTH_MODE unset → always passes)
  CreateInput.safeParse()     → returns {ok:false} on bad shape
  createTarget()              src/setup/index.ts:229
    fetchPage(url)            → src/skills/page.ts:361 fetchHtml
    load(html)                cheerio, src/setup/index.ts:255
    d.insert(targets)         src/setup/index.ts:266
    ingestPage() × N fields   src/setup/index.ts:286   ← inside try/catch, unwinds on throw
  attachScraper()             src/store/conversations  ← NOT in a try/catch
  appendTurns()               src/store/conversations  ← NOT in a try/catch
  revalidatePath('/', 'layout')
  revalidatePath('/decisions')
```

Things I ruled out by reading:

- **No `process.exit` / `process.abort` / `process.kill` anywhere in `src/`** (grepped).
- **No subprocess on this path.** `@anthropic-ai/claude-agent-sdk` is only imported from
  `src/agent/index.ts`, `src/agent/models.ts` and `src/ai/model.ts`; `src/setup/index.ts`
  mentions `src/ai/model.ts` only in a comment (line 70). `createTarget` never calls the
  model, so the SDK's `claude` CLI subprocess is not in this path.
- **No fire-and-forget promises** in `src/` (grepped for `.then(` without `await`/`.catch`);
  the one that exists — `src/api/keys.ts:59` — has `.catch(() => {})`.
- **No stream `'error'` listener gap.** `src/agent/http.ts:132-160` is genuinely defensive:
  an `open` flag, `try/catch` around every `controller.enqueue`, and
  `request.signal.addEventListener('abort', …)` wired to an `AbortController`.
- **Not an unbounded fetch.** `src/skills/page.ts:108` caps at `MAX_BYTES = 8 MiB`, enforced
  both by declared `content-length` (`:181`) and by streaming byte count (`:194`).

**Leading remaining hypothesis — heap, not a crash-by-design.** The 8 MiB cap is on the raw
bytes; `readCapped` accumulates them into a single JS string (`src/skills/page.ts:198`,
`out += decoder.decode(...)`), which `createTarget` then hands to cheerio's
`load()` (`src/setup/index.ts:255`) and, on the describe path, to `candidatesOn(html)`
(`watch-actions.ts:194`) which fingerprints every element. A parse5 tree for an 8 MiB
document is comfortably 150–300 MB of heap. A `next dev --webpack` process is already
holding a full webpack compilation of `web/` **plus** the transpiled `assay` engine
(`transpilePackages`), with **no `--max-old-space-size` set anywhere** in the repo
(grepped `NODE_OPTIONS` / `max-old-space` across `*.json`, `*.yml`, `Dockerfile`, `*.ts` —
zero hits). Add `revalidatePath('/', 'layout')` at the end, which invalidates and re-renders
the entire layout subtree, and a single large target page is a plausible dev-mode OOM.

Caveat on that hypothesis: an OOM would normally leave a macOS crash report, and there is
none. So either the page in question was small (and this is the wrong hypothesis), or the
death was the same RSC-render-error class as the `/docs` one.

**What would settle it, without re-triggering the crash:** run the dev server with
`NODE_OPTIONS='--max-old-space-size=8192 --trace-uncaught --unhandled-rejections=strict'`
and `next dev 2>&1 | tee dev.log`. Right now nothing is capturing the dev server's stderr —
the processes are detached under `launchd` and there are no log files (`ls *.log web/*.log`
→ nothing), which is why the actual death reason for the reported crash is unrecoverable.

**Severity: HIGH** for `/docs` 500 in dev (reproducible, blocks all docs in development).
**Severity: HIGH, unconfirmed** for the "Start watching" process death (no logs survive).

---

## API findings (route-by-route)

All routes under `/api/v1/*` are excluded from the session proxy matcher
(`web/proxy.ts:65`, `matcher: ['/((?!_next|api/v1|.*\\..*).*)']`) and carry their own Bearer
guard via `requireKey` (`src/api/keys.ts:166`). Verified.

### Unauthenticated

| Method | Route | Status | Body | Verdict |
|---|---|---|---|---|
| GET | `/api/health` | 200 | `{"engine":{…},"store":{"reachable":true,"heldCells":1}}` | Public by design (`web/proxy.ts:27` `PUBLIC` regex). Correct. |
| GET | `/api/v1/targets` | 401 | `{"error":"unauthorized","detail":"Send Authorization: Bearer <api key>."}` | ✅ + `WWW-Authenticate: Bearer` |
| GET | `/api/v1/runs` | 401 | same | ✅ |
| GET | `/api/v1/held` | 401 | same | ✅ |
| GET | `/api/v1/queue` | 401 | same | ✅ |
| GET | `/api/v1/health-fields` | 401 | same | ✅ |
| GET | `/api/v1/connectors` | 401 | same | ✅ |
| GET | `/api/v1/reports/diff` | 401 | same | ✅ |
| GET | `/api/v1/reports/digest` | 401 | same | ✅ |
| GET | `/api/v1/reports/incidents` | 401 | same | ✅ |
| GET | `/api/v1/ai/status` | 401 | same | ✅ |
| GET | `/api/v1/explain/:proof` | 401 | same | ✅ |
| GET | `/api/v1/rows/:proof` | 401 | same | ✅ |
| GET | `/api/v1/targets/:id` | 401 | same | ✅ |
| GET | `/api/v1/contracts/:target` | 401 | same | ✅ |
| GET | `/api/v1/contracts` | **405** | **empty body** | ⚠ no GET handler (`web/app/api/v1/contracts/route.ts` exports POST only). 405 leaks route existence *before* auth and returns no JSON. |
| GET | `/api/v1/connectors/:kind` | **405** | **empty body** | ⚠ same — only PUT/DELETE exported |
| POST | `/api/v1/blast` | **405** | **empty body** | ⚠ GET-only route (`blast/route.ts:4`); a POSTing client gets an empty 405 |
| POST | `/api/v1/ai/discover` | 401 | JSON | ✅ |
| POST | `/api/v1/ai/nominate` | 401 | JSON | ✅ |
| POST | `/api/v1/blast/retraction` | 401 | JSON | ✅ |
| POST | `/api/v1/brake` | 401 | JSON | ✅ |
| POST | `/api/v1/decisions/resolve` | 401 | JSON | ✅ |
| POST | `/api/v1/decisions/undo` | 401 | JSON | ✅ |
| POST | `/api/v1/connectors/test` | 401 | JSON | ✅ |
| POST | `/api/v1/targets` | 401 | JSON | ✅ |
| POST | `/api/v1/contracts` | 401 | JSON | ✅ |
| POST | `/api/chat` | **400** (not 401) | `{"error":"bad_request","issues":[…],"detail":"✖ Invalid input\n  → at message"}` | Reached the handler unauthenticated. Gated by `requireOperator()` which, with `AUTH_MODE` unset, returns the frozen `OPERATOR` for everyone (`web/lib/auth.ts:34`). **By design for self-host** and documented (`self-host.mdx` §"Exposing it on purpose"), but see risk below. |
| GET | `/api/conversations/:id/export` | 404 for `abc`, `-1`, `999999`, `1;drop` | — | ✅ no injection, no 500 |
| DELETE/POST | `/api/health` | 405, empty | — | ⚠ empty-body 405 again |
| PUT | `/api/v1/targets` | 405, empty | — | ⚠ same |

### Auth handling

- `Authorization: Bearer <garbage>` → 401. `Authorization: Basic …` → 401.
  `Authorization: Bearer` (no token) → 401. All identical, all with `WWW-Authenticate: Bearer`. ✅
- `bearerFrom` (`src/api/keys.ts:75`) accepts the header only, never a query param — with an
  explicit comment about access logs. ✅
- `verifyKey` (`src/api/keys.ts:47`) short-circuits on the `ak_` prefix before touching the DB,
  then does an indexed hash lookup **and** a `timingSafeEqual` on top. Scope parse fails closed
  (`:63`, `if (!parsed.success) return null`). ✅

### Malformed input

Uniformly excellent, and the error envelope is stable:

| Input to `POST /api/chat` | Status | Body |
|---|---|---|
| `{bad json` | 400 | `{"error":"bad_request","detail":"Body is not JSON."}` |
| no `Content-Type`, form body | 400 | `{"error":"bad_request","detail":"Body is not JSON."}` |
| `{"message":123,"history":"nope"}` | 400 | `{"error":"bad_request","issues":[{"path":"message","code":"invalid_type","expected":"string"},{"path":"history","code":"invalid_type","expected":"array"}],"detail":"…"}` |
| 2 MB `message` string | 400 | `{"error":"bad_request","issues":[{"path":"message","code":"too_big"}],…}` — size limit enforced ✅ |

The `issues[]` array rebuilt from Zod issue `code`/`path` rather than locale strings
(`src/setup/http.ts:26-38`) is a genuinely thoughtful fix for Zod 4 + Next 16 bundling, and it
means machine clients get structured errors, not prose.

**Error-shape consistency verdict:** `{error, detail}` / `{error, issues, detail}` everywhere a
handler runs. The *only* inconsistency is Next's framework-level **405 with a zero-byte body**,
which no handler controls.

---

## Console / network hygiene

**Console: completely clean.** Zero messages — no errors, no warnings, no React hydration
mismatches — across `/`, `/decisions`, `/settings`, `/fields`, `/docs`, checked both live and
with `includePreservedMessages`. That is genuinely rare.

**Network:** no 4xx/5xx on any app route in the browser. All `_next/static/*` 200/304.

**Prefetch volume — the one real issue.** On a single `/fields` navigation the client issued
**14 RSC prefetches for 7 routes** — each nav destination fetched twice under two different
`_rsc` hashes:

```
/?new=1&_rsc=SBEgWrEN9JMA958z   /?new=1&_rsc=cuPjtDbQBVhn82w7
/decisions?_rsc=SBEgWrEN…       /decisions?_rsc=qZpAu90LN6sy3_re
/runs?_rsc=SBEgWrEN…            /runs?_rsc=QspeafDMowVHCgdv
/schedule?_rsc=SBEgWrEN…        /schedule?_rsc=nVmR9J7UWnBWDYsE
/library?_rsc=SBEgWrEN…         /library?_rsc=ZQ0Kkn__x0L78a8K
/settings?_rsc=SBEgWrEN…        /settings?_rsc=fIDtK79GKLdoy4WO
```

On the initial `/` load it was worse — the nav routes **plus** six run-detail pages
(`/runs/1`, `/runs/2`, `/runs/51`–`/runs/54`), ~20 RSC requests for one paint. Every one of
those is `dynamic = 'force-dynamic'` and hits Postgres. Two distinct `_rsc` hashes for the
same URL means two different prefetch kinds (layout-level `<Link>` prefetch and the sidebar's
own) are both firing and not deduping. **Severity: MED** (self-inflicted DB load, ~2× more
than needed).

**Payload sizes** — fine:

| route | HTML (gzip) |
|---|---|
| `/` | 10.8 KB |
| `/runs` | 14.5 KB |
| `/settings` | 18.2 KB |

Client-side nav to `/fields` transferred only 19 KB total across 46 resources; TTFB 26 ms,
DOMContentLoaded 259 ms, load 295 ms.

**Bundle:** `web/.next/static/chunks` is **13 MB** on disk, with individual chunks at 772 K,
608 K, 492 K, 296 K, 280 K (uncompressed). Not all loaded per route, and the measured transfer
is small, so this is a **LOW** note rather than a finding — but those top three chunks are
worth a `@next/bundle-analyzer` pass.

**Timers:** `web/app/(app)/trace.tsx:75` runs `setInterval(() => setTick(now()), 100)` — a 10 Hz
re-render. It is a trace animation, not polling, and it is the only interval in the app. LOW.

**Security headers: none.** `GET /` returns no `Content-Security-Policy`, `X-Frame-Options`,
`X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security` or `Permissions-Policy`
— and does return `X-Powered-By: Next.js`. `web/next.config.ts` has no `headers()`.
**Severity: MED** given `self-host.mdx` §"Exposing it on purpose" actively contemplates
putting this on the internet.

---

## Docs gaps

The prose quality is exceptional and — this is worth saying plainly — **the numbers are
honest**. I reconciled every headline figure in `index.mdx` against `results/bench.json`:

| claim in `index.mdx` | `results/bench.json` | ✓ |
|---|---|---|
| naive: 48 correct / 93 wrong / 12 abstained | `value_ok:48, value_wrong:93, abstain_right:6 + abstain_wrong:6` | ✅ |
| plain: 117 / 36 / 0 | `value_ok:117, value_wrong:36, abstain 0` | ✅ |
| gated: 99 / 0 / 54 | `value_ok:99, value_wrong:0, abstain_right:18 + abstain_wrong:36` | ✅ |
| "gated scores 93 on exact node but 99 on value" | `gated.correct:93, gated.value_ok:99` | ✅ |
| "36 of the 54 abstentions… could have been automated" | `abstain_wrong:36` | ✅ |

A `Limitations` page that is 362 lines and leads with "It abstained when it did not need to"
is not a page most projects ship. Credit where due.

The gaps are all about **who the docs are for**. Seven pages
(`index`, `self-host`, `credentials`, `architecture`, `run-flow`, `assay-score`, `limitations`,
per `web/content/docs/meta.json`) and every one addresses an *operator*. Nothing addresses an
*integrator*.

### HIGH — There is no API reference. At all.

Grepping all seven `.mdx` files for `/api/v1` returns **one** hit:
`credentials.mdx:139`, and it is the Bright Data *inbound* delivery webhook path in a table.
There are 31 route files under `web/app/api/`. Not one endpoint is documented: no path list,
no `Authorization: Bearer` instruction, no request/response schema, no status-code table, no
error-envelope description. A developer evaluating this has no way to learn the API exists
short of reading `web/app/api/**/route.ts`.

### HIGH — `npm run apikey` is never mentioned on the docs site.

Grep for `npm run apikey` across `web/content/docs/` → **zero hits**. The credential that
unlocks all 31 routes is documented only in a comment block at the top of `tools/apikey.ts`
and in `npx tsx bin/assay.ts --help`. Combined with the gap above, the REST surface is
effectively undiscoverable from the product's own documentation.

### HIGH — The MCP server has no page.

`src/mcp/server.ts` + ten tool modules (`ai, blast, brake, connectors, contracts, core,
health, reports, setup, skills`) exposing `assay_status`, `assay_held`, `assay_decisions`,
`assay_propose`, `assay_runs`, `assay_blast`, `assay_explain`, `assay_watch` (and pointedly
*no* `assay_resolve` — `src/mcp/tools/core.ts:8` explains why, and it is a good reason).
It boots cleanly on stdio — I ran `npx tsx src/mcp/server.ts` and it came up silent, as a
stdio server should.

Docs-site coverage is **two incidental sentences**: `assay-score.mdx:112` and
`self-host.mdx:138`. No install command, no `claude mcp add` line, no transport note, no tool
list. Meanwhile `docs/APP-DESIGN.md:414-446` (repo-internal, not published) has a detailed
design for exactly this — "One MCP server, two transports, three install targets" — so the
content exists and simply never made it to the site.

### HIGH — Docs search is a dead UI.

`/docs` renders fumadocs' search affordance (six `search` / three `Search` occurrences in the
served HTML), but `GET /api/search?query=gate` → **404**. `web/app/api/` contains only
`chat`, `conversations`, `health`, `v1`. Grepping `web/` for `createFromSource` or a
`search:` config → zero hits. So the search box is present and cannot work.
**Repro:** open `http://localhost:3000/docs`, click Search, type anything.

### MED — Quickstart credential mismatch.

`self-host.mdx:143` tells you:

```bash
export DATABASE_URL=postgres://assay:assay@localhost:5432/assay
```

The repo's own `.env` and `.env.example` use `postgres://localhost:5432/assay` (no
credentials). Following the docs verbatim against a Postgres set up any other way fails auth.

### MED — The migrate trap is documented in the wrong file.

`tools/migrate.ts:1-20` contains a superb explanation of why `drizzle-kit migrate` fails
against a `drizzle-kit push`-built database ("Two people lost time to a command that failed
and looked like it had worked"). **None of that reaches the docs site.** `self-host.mdx` just
says `npm run db:migrate` at lines 56, 71 and 143 with no mention that `push` and `migrate`
are mutually exclusive setup paths. This is precisely the state this machine is in — see the
next section.

### LOW — Quickstart otherwise checks out.

`npm run demo` / `npm test` / `npm run bench` are real scripts in `package.json`. The
CLI (`npx tsx bin/assay.ts --help`) prints a well-organised, grouped help ("Run it", "Look at
what happened", "Operate it", "Before it breaks", "Features") that is more useful than most
of the docs site for an integrator.

### LOW — `.env` drift.

`.env` sets `BRIGHTDATA_API_KEY`, which appears nowhere in `.env.example`. The repo claims
`test/env-names.test.ts` fails on exactly this kind of drift, so either that test is not
running or `.env` (gitignored, so untested) is the exception.

---

## Code smells & risks

### HIGH — `npm run apikey` crashes; the API is unreachable on this instance

**Repro:**
```
$ npm run apikey -- "dev-review-audit"
DrizzleQueryError: Failed query: insert into "api_keys" (…,"scope",…) values (…)
  cause: error: column "scope" of relation "api_keys" does not exist   [42703]
    at createKey (src/api/keys.ts:31:17)
    at tools/apikey.ts:37:11
```

Verified against Postgres directly:

```
api_keys cols:        created_at,hash,key_id,key_prefix,last_used_at,name,revoked_at
applied migrations:   0        (select count(*) from drizzle.__drizzle_migrations)
migration files:      8        (src/store/migrations/*.sql)
scope added in:       0007_perfect_abomination.sql   ← unapplied
```

The `drizzle.__drizzle_migrations` journal is **empty**, meaning this database was built by
`drizzle-kit push`. So the remedy the docs give — `npm run db:migrate` — will itself fail with
`relation "…" already exists`, which is the exact trap `tools/migrate.ts:1-20` was written to
explain. A developer following the documented path hits two failures in a row, the first as an
unhandled Node stack trace.

Two aggravating details:

- `tools/apikey.ts:37` does `const k = await createKey(...)` with **no try/catch**, so the
  failure is a raw Drizzle wrapper dump, not the "run `npm run db:migrate`" sentence
  `tools/migrate.ts` would have printed. Ironic given how carefully that sibling file handles
  exactly this.
- `src/api/keys.ts:50` reads `.select().from(apiKeys)`, which generates a SELECT naming
  `scope`. On a database in this state, presenting **any** `ak_`-prefixed key would throw —
  and `guarded` (`src/api/handlers.ts:25-34`) calls `requireKey` **outside** its `try`:

  ```ts
  const guarded = (fn: Handler): Handler => async (request, ctx) => {
    const denied = await requireKey(request, ctx);   // ← throws escape the wrapper
    if (denied) return denied;
    try { return await fn(request, ctx); }
    catch (e) { … return Response.json({ error: 'internal' }, { status: 500 }); }
  };
  ```

  So a driver error in the auth path bypasses the "never leak a driver error to a consumer"
  guard the very next line promises. I could not observe this live because the running servers
  are pointed at a *different* database than `.env` (see below) and returned a clean 401 —
  but the code path is there. **Fix: move `requireKey` inside the `try`.**

### MED — `.env` `DATABASE_URL` is not the database the servers use

`.env` says `postgres://localhost:5432/assay`. That database is missing `scope` and has an
empty migration journal. The running servers return clean `401`s for `ak_`-prefixed keys,
which is only possible if their `api_keys` table *has* `scope`. The Postgres instance holds
many candidates — `assay_bugs`, `assay_auth`, `assay_rundetail`, `assay_bugs_fresh`,
`assay_polish`, … — so `DATABASE_URL` was exported into the servers' environment and wins over
the file (`web/next.config.ts` uses `||=`, correctly treating the file as a default).

The consequence for a developer: **the CLI and the web app talk to different databases**, so a
key minted by `npm run apikey` would not authenticate against the running server even once the
migration is fixed. Nothing surfaces this — `/api/health` reports `store.reachable: true` and
names no database.

### MED — Unknown ids soft-404 (HTTP 200)

| URL | HTTP | rendered |
|---|---|---|
| `/runs/nonexistent-id` | **200** | Next's default `404: This page could not be found.` |
| `/explain/garbage` | **200** | custom not-found (there *is* a `not-found.tsx` here) |
| `/library/nope` | **200** | Next's default 404 |
| `/runs?limit=-5&target=%00` | 200 | renders normally, no crash ✅ |
| `/decisions?page=abc` | 200 | renders normally, no crash ✅ |

The `notFound()` calls are correct (`app/(app)/runs/[run]/page.tsx:38`,
`app/(app)/library/[entry]/page.tsx:22`), but they run inside a Suspense boundary after the
shell has already flushed, so the status line is locked at 200. Monitoring, crawlers, and any
programmatic caller see success for a missing resource. Malformed query params are handled
gracefully — no crashes, no 500s. ✅

### MED — Only one `not-found.tsx`, and zero `error.tsx`

```
web/app/(app)/explain/[proof]/not-found.tsx    ← the only one
```

No `error.tsx`, no `global-error.tsx` anywhere under `web/app`. So:
- `/runs/:bad` and `/library/:bad` fall back to Next's unstyled default 404 — jarring in an
  app this visually considered, and it drops the operator out of the shell entirely.
- Any render error in any route segment has no boundary to catch it. In production the user
  gets Next's generic error page; in dev it is the overlay that preceded the observed crash.

### MED — No security headers (see Console/network section)

### LOW — `execFileSync` on a request path

`src/ai/model.ts:111`:

```ts
const askTheCli = (): boolean => {
  execFileSync('claude', ['auth', 'status'], { stdio: 'ignore', timeout: 10_000 });
  return true;
};
```

This is a **synchronous** subprocess spawn, reachable from a render (the Settings model-auth
panel). It blocks the event loop for up to 10 s. The mitigations are real and documented — a
60 s cache (`CLI_CACHE_MS`, `:120`), a Suspense boundary on Settings, and it is only reached
when neither `ANTHROPIC_API_KEY` nor `CLAUDE_CODE_OAUTH_TOKEN` is set (`:165`) — so the blast
radius is one unconfigured self-host instance. Still, a `execFile` + `await` would cost
nothing.

### LOW — `revalidatePath('/', 'layout')` is used liberally

Six call sites across `watch-actions.ts` (`:86`, `:103`, `:155`) and `library/actions.ts`
(`:161`). Each invalidates the entire layout subtree, which — combined with the doubled
prefetching above — multiplies the RSC/DB round-trips after every write.

### Things that are genuinely good (verified, not assumed)

- **No secrets in the client bundle.** Grepped `web/.next/static/` for the live
  `BRIGHTDATA_API_TOKEN` value → 0 files. Grepped for `sk-ant-*`, `postgres://…`, `ak_[0-9a-f]{40,}`
  patterns → nothing. **Zero `NEXT_PUBLIC_*` variables** in `web/app`, `web/lib`, `web/components`.
- **SSRF protection is real and DNS-rebinding-aware.** `assertReachable` (`src/skills/page.ts:134`)
  resolves the hostname to addresses *first* and checks each against `whyBlocked`, and it is
  called **inside the redirect loop** (`:245`), so it re-validates on every hop rather than
  once at the start. Protocol allow-list at `:135`. This is the correct implementation, and
  most projects get it wrong.
- **Response caps and timeouts:** `MAX_BYTES = 8 MiB` (`:108`), `TIMEOUT_MS = 15_000` (`:106`),
  `MAX_REDIRECTS = 5` (`:104`), `redirect: 'manual'` (`:248`).
- **Refusals do not fall through to connectors** (`src/skills/page.ts:372`) — a blocked address
  stays blocked rather than being laundered through Firecrawl. Good threat modelling.
- **Defence in depth on auth.** `web/lib/auth.ts` documents an actual audit finding: with
  `AUTH_MODE=clerk` and no session, an anonymous same-origin POST of `resolveCell` reached the
  database, because a Server Action bypasses route handlers entirely and `web/proxy.ts` was the
  only gate. The fix — `assertOperator()` as the first line of every action, with
  `test/actions-auth.ts` calling every exported action rather than grepping for the line — is
  the right fix and the right test.
- **`approve` never trusts a selector from the browser** (`web/app/(app)/library/actions.ts`,
  header comment): it re-fetches and re-analyses, and the client sends only tracker id, URL and
  field names. Correct, and correctly explained.

---

## Integration story assessment

**Three surfaces, all technically present, none documented for the person who would use them.**

| surface | works? | discoverable? |
|---|---|---|
| **CLI** (`bin/assay.ts`, `npm run cli`) | ✅ `--help` is excellent — grouped, task-oriented, with `run`/`demo`/`ingest`/`worker`/`explain`/`diagnose`/`apikey`/`watch`/`blast`/`correct` | ❌ never mentioned on the docs site |
| **MCP** (`src/mcp/server.ts`, `npm run mcp`) | ✅ boots clean on stdio; ~8 tools across 10 modules; deliberate omission of `assay_resolve` with a stated reason | ❌ two incidental sentences; no install line, no tool list |
| **REST** (31 routes under `/api/v1`) | ⚠ auth is solid, error shapes are solid — but **you cannot get a key on this instance** | ❌ zero endpoint documentation |

The blocking problem is that the three compose into a story nobody has written down. A
developer's actual path today is:

1. Read `/docs`, learn a great deal about the gate and nothing about how to call it.
2. Discover the API by listing `web/app/api/`.
3. Find `npm run apikey` in `bin/assay.ts --help` or a source comment.
4. Run it, get an unhandled `DrizzleQueryError`.
5. Run `npm run db:migrate` as the docs say, and hit `already exists`.
6. Read `tools/migrate.ts`'s header to discover `push` and `migrate` are exclusive.

Steps 4–6 are a hard stop. The coherence with the web UI is otherwise good — `approve` calls
the same `build` server action the UI's "Start watching these fields" calls
(`library/actions.ts` header, explicitly: "`approve` IS NOT A SECOND WRITE PATH"), and
`createTarget` is the single write path for UI, CLI and REST alike. That discipline is real
and worth advertising; it is the strongest argument for integrating, and it is invisible from
the docs site.

**Verdict: NO, not today** — not because the design is wrong (it is unusually good) but
because the first credential you need cannot be minted, and nothing tells you why.

---

## Quick wins

Ordered by (impact ÷ effort):

1. **Wrap `tools/apikey.ts:37` in a try/catch** that detects Postgres `42703` / `42P01` and
   prints `run: npm run db:migrate` — reuse the error-chain walker already written at
   `tools/migrate.ts:33-40`. ~6 lines. Turns the worst first-run experience in the product
   into a one-line instruction.
2. **Move `requireKey` inside `guarded`'s `try`** (`src/api/handlers.ts:25-34`, and the twin
   in `src/connectors/handlers.ts:29`). One-line diff; closes the gap where a driver error in
   the auth path escapes the "never leak a driver error" wrapper.
3. **Add `web/app/api/search/route.ts`** — fumadocs ships `createFromSource(source)` and it is
   a three-line file. Removes a UI affordance that currently 404s.
4. **Write one `api-reference.mdx`** and add it to `web/content/docs/meta.json`: mint a key,
   `Authorization: Bearer`, the route table, the `{error, detail}` / `{error, issues, detail}`
   envelope, the 401/403/404/405/409/422/500 codes. The routes are already thin wrappers over
   documented handlers, so this is transcription, not design.
5. **Write one `mcp.mdx`.** Most of the content already exists in `docs/APP-DESIGN.md:414-446`;
   it needs a `claude mcp add` line and the tool list.
6. **Add `web/app/(app)/not-found.tsx`** so `/runs/:bad` and `/library/:bad` stay inside the
   shell instead of dropping to Next's default page.
7. **Add `web/app/global-error.tsx`** — currently a single render throw has no boundary anywhere.
8. **Add a `headers()` block to `web/next.config.ts`** with `X-Content-Type-Options: nosniff`,
   `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, and set `poweredByHeader: false`.
   Doubly warranted given `self-host.mdx` §"Exposing it on purpose".
9. **Deduplicate the RSC prefetch.** Two `_rsc` hashes per destination = 2× the DB round-trips
   on every navigation; likely a `prefetch` prop on the sidebar `<Link>`s duplicating the
   layout's own.
10. **Capture dev-server stderr.** `next dev 2>&1 | tee dev.log`, plus
    `NODE_OPTIONS='--trace-uncaught --unhandled-rejections=strict'`. The reported "Start
    watching" crash is currently unfixable because nothing recorded why the process died.
11. **Fix `self-host.mdx:143`** to match the repo's own `.env` (`postgres://localhost:5432/assay`),
    and add a sentence distinguishing the `drizzle-kit push` and `npm run db:migrate` setup
    paths — lifted from `tools/migrate.ts`'s header.


---

# Appendix C — Hackathon judge perspective (full report)

# Assay — hackathon judge review

Judged 2026-08-23 against http://localhost:3000 (dev server), with a skim of README.md,
web/content/docs, results/bench.json. ~10 minutes of judge attention, comparative.

---

## Verdict (3 lines)

The engineering underneath this is top-decile for a hackathon — a real 153-case benchmark with three
arms, a committed 77-capture corpus, threshold calibration, a byte-identical replay check, and an
in-product docs site that argues its own honest trade-offs. The product surface is beautiful and
almost entirely free of the usual dev-server rot (zero console errors across nine screens).
But the demo, as the database currently stands, does not show the thing the project is about: the
Decisions queue is empty, zero runs healed, the gate's scores and margins never appear on any run or
proof page, and the strongest evidence page (/docs) is not linked from the app at all.
Fix the seeded data and put the numbers on the trace and this jumps from "nice UI, take my word for
the thesis" to "I watched it refuse to guess and saw why."

---

## First impression (30 seconds on Home) — 6/10

What I see: a very clean, confident chat-first app. Big heading "What should Assay watch?", a
composer with a Mode picker and a model picker, three start-from cards, and a stat strip: 8 runs,
7 clean, 0 waiting on you, **0 published in error**.

What I understand in 30 seconds: it watches web pages and scrapes fields. That's it.

What I do NOT understand: that it abstains, that abstention is the point, that anyone measured how
often heals are wrong, or why that's hard. "0 published in error" is the only hint and it reads as a
generic error counter — with n=8 runs it carries no weight, and "since you started" makes it about
my instance rather than about a benchmark.

The novelty is invisible above the fold. A judge who has seen fifteen scraper demos parses this as
"another AI scraper builder with a nice chat box" and starts discounting. The differentiator exists,
is defensible, and is being kept off the front page.

Also: with Opus 5 in the model picker and a chat sidebar, the framing accidentally signals "LLM
wrapper" — the exact impression the project's actual content refutes.

---

## The wow moment: found, but hidden three clicks deep

**It exists, and it is `/runs/54`.** This page is the best artifact in the project:

- A node graph of the pipeline: Fetch → "Unchanged since last run?" → "Resolve the baseline" →
  "Evaluate" → "Search for a replacement", each node showing the actual values it decided on
  (page digest, golden sha, `recorded as: abstain`, `cell status: quarantined`).
- A **before/refused selector diff** rendered as a code comparison.
- A `THIN` callout: "The best candidates were too close to separate and they carried different
  values, so nothing was published", with **the two it could not separate** listed side by side
  (`2026-04-18` vs `2026-01-15`) and the plain-English kicker "They do not carry the same value, so
  neither was published."
- A **Sources table** — every fact shown on the page mapped to the exact DB column it was read from
  (`runs.page_sha`, `field_runs.ranked[0]`, `queue_items.resolved_by`). I have not seen another
  hackathon project ship provenance for its own UI. This alone is a credibility signal.

Second wow, smaller: **`/compare`** — "I cannot tell you whether this changed. Two candidates on the
page were too close to call, so this column has been held since." That is the entire thesis in one
sentence, in the product, in a user's language.

Third: in the field-proposal flow, expanding a field shows `reads h2.recall-card__title / tier normal
/ tau 0.60 / delta 0.16 / on hold quarantine / auto-approve clear margin` with "Below these numbers
Assay holds the cell rather than guessing." The thesis is right there at creation time.

**Discoverability of all three: poor.**
- `/runs/54` is reachable only if a judge clicks the one run in eight that is not "clean". Nothing
  flags it as the interesting one.
- `/compare` has **no link in the sidebar** (`sidebar-nav.tsx` lists it only as an `also:` route for
  the Fields active state — so visiting /compare highlights "Fields", which is itself a nav bug).
- `/docs` has **no link anywhere in the app chrome**. The single most persuasive page in the whole
  project — the three-arm benchmark table, "The honest trade", the Bright Data audit — is
  URL-only.

**The gap that costs the most:** the gate's numbers are never rendered on a decision. The run trace's
"The gate" table lists five candidates with columns `# / element / text on the page` — no score, no
margin, no threshold. The `/explain/pr_…` proof page shows status, a prose sentence, and the row JSON
— no score, no runner-up, no tau/delta. README claims a proof record "shows the candidates, their
scores, the margin, and the thresholds in force at the time." **It does not.**
This is not a data problem: `field_runs.ranked` (jsonb) persists `{score, parts, fp, el}` per
candidate and `heal.ts` computes `runnerUp`, `margin`, `tau`, `delta`. The numbers are one table
column away from being on screen.

---

## Demo path walkthrough (with stumbles)

**1. Home → paste URL → propose fields.** Works, and works well.
- Typing/pasting a URL spontaneously popped the Mode menu open and pre-selected **"Research"**, not
  "Watch". The submit button relabelled to "Read this page". A presenter who doesn't notice demos
  the wrong mode. *(Stumble: cosmetic but live-visible.)*
- Six modes in that menu (Watch / Research / Build API / Automate / Compare locations / AI
  visibility). Only Watch is the product. This reads as breadth-chasing and invites the question
  "which of these actually work?" — a question you do not want in a 5-minute demo.
- Latency was fine: an inline elapsed timer ("Reading the page 6.3s"), proposal complete in well
  under 30s. The timer is a good honesty touch.
- Output is strong: 4 proposed fields with the *current page value* next to each, tool-call trace
  (`assay_inspect · 60 elements could be a field`, `assay_watching · 4 already under watch`), a
  per-field expander with tau/delta, and the line "Nothing is created until you confirm."
- **Copy bug on screen:** "hazard has nothing solid to anchor to, so it starts on the **strict**
  tier" — while the hazard row's own tier control reads **normal**. Two contradicting facts, four
  centimetres apart.
- **The landmine:** the primary CTA "Start watching these fields" crashes the dev server. This is
  the natural next click for every judge who touches the keyboard. It is also the only path from the
  hero flow to a running scraper. If a judge drives, the demo dies here.

**2. Runs.** Clean table, good filters (All/Healed/Held/Clean), sparkline. Header reads
`8 runs · 0 healed · 1 held`. **Zero healed runs in the entire demo database** — the product is a
self-healing scraper and the demo has no heal to show. The one interesting row is `run 54 · held
units_affected`.

**3. A run's trace (/runs/54).** The high point (see above). Two nits: the pipeline graph sits in a
fixed-height canvas and the fifth node ("Search for a replacement") is clipped at the bottom edge on
a 1080p viewport — on a projector that's a shrug moment. And the "decide ›" link on the field row
goes to /decisions…

**4. Decisions.** …which says **"Nothing is waiting on you."** The flagship screen — the queue of
things Assay refused to publish alone — is empty. Worse, the header bell simultaneously reads
**"1 waiting on you"** and its popover names the exact item
("assay-testbed-vercel-app-v-baseline broke on units_affected, from run 54"). Home also says
"0 waiting on you". Three surfaces, two different answers, one screen apart. A judge notices this in
under ten seconds and it costs more trust than the underlying bug deserves (the item was already
answered; the badge just wasn't cleared).

**5. Explain / proof page.** Loads, clean, honest — but thin. "5 elements were ranked and none was
published." "The full record" expands to the `_assay` envelope JSON (nice: `status: quarantined`,
`reason: thin_margin`, `held_since_run: 54`), plus golden/capture digests. No scores, no margin, no
thresholds. "Copy as CLI output" is a good touch for the "this is a real pipeline" story.

**6. Fields.** Genuinely original screen — field *fragility*: "Held only by classes, heading_path,
id_xpath — no id, no test hook, no role. It has not moved in 5 runs, but a redesign is under no
obligation to keep it." That is a sentence a scraper engineer feels in their spine. Undercut by
**truncated field labels** — every row reads `assay-testbed-vercel-app-re…1/1`, so you cannot tell
which field is which, and the count collides with the truncation.

**7. Settings.** Strong depth signal: per-field policy tiers (`normal`, `strict 0.70 floor · 0.20
lead · from a saved contract`), "Calibrated: publishes only a clear winner (0.60 floor, 0.16 lead)",
and **export as YAML**. This is where the thresholds live, and it looks like a product, not a demo.

**8. Library.** Eight trackers across Shops/Code/Reference/**Prebuilt scrapers** (Instagram,
LinkedIn, "Any Bright Data scraper — paste a dataset ID and a link") plus "Any site". Good sponsor
integration surface, and it makes the "Assay is a gate on top of a fetch layer" story concrete.

**9. Schedule.** Month/Week/Day/List, search, three filter dropdowns, a legend distinguishing "ran,
clean" / "moved, found again" / "held for review" / "the next run, stored" / "projected from the
cadence". More finished than most hackathon apps' main screen.

**Health:** zero console errors or warnings across every screen visited. API routes return
`{"error":"unauthorized","detail":"Send Authorization: Bearer <api key>."}` — the REST surface is
actually auth-gated, not decorative.

---

## Claims audit

| Claim | Where | Verdict |
|---|---|---|
| 153 cases, gated arm publishes 0 wrong values | README + **/docs** | **Holds.** `results/bench.json` gives gated `value_wrong: 0`, `value_ok: 99`, abstains 18+36=54. Matches the published table exactly. |
| naive 93 wrong / plain 36 wrong / gated 0 wrong | README + /docs | **Holds** against bench.json (`value_wrong` per arm). |
| Cost of abstention is disclosed | /docs "The honest trade" | **Better than holds.** Docs volunteer that ~24% of breaks go to a review queue, that plain gets 117 correct vs gated's 99, and that 36 of 54 abstentions were cases a human now has to look at that could in principle have been automated. This is the single most credible thing in the project — most teams bury this. |
| "Exact node" vs "value equivalence" reported separately | /docs | **Holds**, and volunteers that gated scores 93 by node but 99 by value, i.e. six times it picked a different element that happened to carry the right text. Calling that out unprompted is rare. |
| Every published value has a proof record showing candidates, **scores, margin, thresholds** | README "Running the product" | **Overclaims.** The proof page and the run trace show candidates and text but no score, no runner-up, no margin, no tau/delta. Data exists (`field_runs.ranked`), UI doesn't render it. Thresholds appear only in Settings and in the pre-creation field expander. |
| Bright Data audit: 6 of 10 promised fields unhealthy behind a 100%-success run | README + /docs, `results/j_mt1q17uoq8rkcxd8a.ndjson` | **Holds as a documented artifact**, reproducible offline per the README. Not surfaced in the product UI at all — it lives only in docs prose. |
| No head-to-head vs Bright Data's healer | README §, docs/HEADTOHEAD.md | **Self-disclosed.** README states plainly that all 9 records in headtohead.jsonl are `system: "assay"` and no second arm was run. Points off for the missing comparison, points back for saying so first. |
| "Three rules fitted to n=1" for the code gate | README + docs/LIMITATIONS.md §10 | **Self-disclosed.** Correct call. |
| Demo video | README | **Missing** — the line still reads "not yet recorded — link goes here" with a TODO. For a submission judged partly on a video, that is a live risk. |

Overall: **no material overclaiming except the proof-page claim**, and one unusually honest
limitations posture. The benchmark numbers are real, reproducible offline, and the corpus is
committed so they are checkable — which is more than most submissions can say.

---

## Technical depth signal

Strong, but the UI does the depth a disservice by hiding the evidence.

Believable in 2 minutes, if a judge finds them: the Sources/provenance table on the run page; the
Settings per-field contracts with YAML export; the tool-call trace inline in the proposal; auth-gated
REST (31 routes); the tier/tau/delta expander.

Believable only from the repo or /docs: `tools/bench.ts` (three arms, ten deterministic mutations,
ground truth marked pre-mutation via an attribute the scorer never reads — a genuinely careful
design against label leakage), `tools/sweep.ts` (11×10 threshold grid, 110 pairs — the thresholds are
fitted, not vibes), `tools/replay.ts` rewriting `results/events.jsonl` byte-identically as its own
integrity check, `src/mcp/` (agent tool surface), `bin/assay.ts` (CLI), `src/connectors/` (Bright Data
prebuilt scrapers → JSON rendered to deterministic HTML → the unmodified engine), `dist/fingerprint.js`
emitted import-free specifically so it pastes into a Cheerio worker with a test asserting it stays
import-free. That last detail is the kind of thing only someone who has actually deployed into a
collector worker would build.

This is not a thin wrapper. But a judge who only clicks around the app will not learn most of it.

---

## Competitive framing

**vs "just ask GPT to fix the selector":** answered well, in /docs and README, and the answer is
sharp — an LLM always answers, and the failure mode that matters is the confident wrong answer that
never raises an exception. The `duplicate_similar` mutation (a near-identical decoy) is the exact
case where any always-answering healer publishes garbage silently. The gate's margin condition is
the mechanism, and it's measured, not asserted. **But this argument appears nowhere in the app.** A
judge has to read the README to get it.

**vs Bright Data's own self-healing tool:** answered unusually well and unusually fairly — "composed,
not compared". Their healer is prompt-driven, human-approved, minutes-scale, per-scraper; Assay's
gate is millisecond-scale and runs on every field of every row, and `src/bd/diffgate.ts` puts Assay's
verdict on *their* proposed repair. The `corroboration_collapse` finding (the repair rewired
`title_on_detail` to derive from `input.recall_title`, permanently silencing the `anchors_disagree`
detector) is the most intellectually impressive paragraph in the submission: the project's own thesis
turned on a repair rather than on data.

**vs existing scraper SaaS (Apify/Zyte/Diffbot):** implicitly answered via the audit — "the job
succeeded" and "the data is right" are different claims and platforms only answer the first. Strong
framing. Not in the product.

Gap: no pricing/positioning story, and no answer to "why is a review queue better than a Slack alert
on row-count drop?" beyond the quiet-failure argument (which is good, but a skeptical judge will
push on it).

---

## Scores

| Dimension | Score | One line |
|---|---|---|
| Idea / novelty | **8/10** | Abstention with a *measured* wrong-publish rate is a real, defensible wedge in a space where every competitor heals on exceptions; the framing of quiet failures is the sharpest problem statement I've read today. |
| Execution / polish | **8/10** | Nine screens, zero console errors, genuinely good typography and copy — held back by truncated field labels, a clipped trace graph, and a badge that contradicts the page under it. |
| Demo impact | **5/10** | The money screen is empty, zero heals exist in the DB, the gate's numbers are absent from every decision, the best evidence is unlinked, and the hero CTA crashes the server. |
| Technical depth | **9/10** | Bench harness with leak-proof ground truth, threshold sweep, committed 77-capture corpus, byte-identical replay check, MCP + CLI + auth'd REST, import-free fingerprint for worker paste — this is a quarter of real engineering, not a weekend. |
| Completeness | **8/10** | Scheduling, contracts, YAML export, library incl. Bright Data prebuilts, self-host docs, in-product docs site; the crash on confirm and the empty queue are the holes. |

**Weighted read for a hackathon:** this is a top-quartile submission whose demo is currently
underselling it by two full points.

---

## Top 3 pre-demo fixes

1. **Seed the demo database so the story tells itself.** You need, in the DB before you present:
   at least one **healed** field with a clear margin, and at least one **unanswered held** cell so
   /decisions is not empty. Right now Runs reads "0 healed", Decisions reads "Nothing is waiting on
   you", and the bell claims 1 waiting — three surfaces disagreeing about the one thing the product
   does. `npm run demo` already produces exactly the two outcomes you want (HEAL clear_margin,
   ABSTAIN thin_margin); get that pair into the web store and the demo becomes: *here it healed and
   here is why — here it refused and here is why.* Fix the badge/queue disagreement in the same pass.
   (Root cause is the already-answered item still counting toward the header badge.)

2. **Put the numbers on the decision.** Add `score` / `margin` and a "needs > 0.60 and > 0.16" row to
   the run trace's "The gate" table and to the /explain proof page. The data is already persisted in
   `field_runs.ranked` (`{score, parts, fp, el}`) and `heal.ts` already computes runnerUp/margin/tau/
   delta — this is rendering, not engineering. It converts the proof page from "trust me" to proof,
   and it makes the README's proof-record claim true. Bonus for showing the `parts` breakdown: a
   per-feature similarity bar is the screenshot that ends the "is this just a vibes score?" question.

3. **Link the evidence and fix the crash.** Add **Docs** and **Compare** to the sidebar (Docs
   currently has zero inbound links from the app, and /compare highlights "Fields" when you're on
   it), and put a one-line proof strip on Home under the hero: *"153 benchmark cases · 0 wrong values
   published · 54 abstentions — see the numbers →"* linking to /docs. Separately: the "Start watching
   these fields" crash must be fixed or the button must be disabled with a note, because it is the
   single most likely thing a judge clicks. If it cannot be fixed in time, demo from a pre-created
   scraper and never let anyone else drive.

---

## Feature ideas that would impress judges

- **A "break it live" button.** You own `assay-testbed.vercel.app` with `/v/baseline/` and mutation
  variants, and you own `src/mutate.ts` with ten deterministic mutations. Put a control in the app —
  *"Break this page: rename class / duplicate a near-identical decoy"* — that flips the testbed to a
  mutated variant, triggers a run, and lands the user on the trace. That is a 40-second live loop of
  break → detect → heal-or-abstain → proof, on stage, with no pre-baked data. Right now the single
  most demonstrable thing about the project is the one thing a judge cannot make happen.
- **The A/B strip on every held cell.** "A healer without the gate would have published
  `2026-01-15` here. Assay published nothing." You have the plain arm in the bench harness; running
  it alongside the gated arm on live decisions turns an abstention (which looks like a *failure* to
  a naive viewer) into a visible *save*. This is the highest-leverage idea on this list: abstention
  is a negative-space feature and users cannot see negative space without a counterfactual.
- **A "wrong values published" counter that means something.** Home's "0 published in error" is
  currently scoped to an 8-run instance. Scope it to the benchmark instead: *0 of 153 · gated arm ·
  naive would have published 93*, with a link to /docs. Same pixel count, ten times the punch.
- **Surface the Bright Data audit as a screen.** The `6 of 10 promised fields unhealthy behind a
  100%-success run` table is your best real-world evidence and it exists only as prose in docs and a
  CLI command. As a screen (schema promised vs delivered, null-rate column, "platform verdict: 100%
  success") it becomes the slide that makes a sponsor judge sit up.
- **A field-fragility score with a fix suggestion.** The Fields screen already knows a field is held
  only by classes with no id/test-hook/role. Turn that into a graded risk badge and a suggested
  second anchor. It reframes the product from "cleans up after breaks" to "tells you what will break
  next", which is a bigger market.
- **Kill or hide four of the six composer modes** for the demo. Watch is the product; Research /
  Build API / Automate / Compare locations / AI visibility invite "does that one work?" and every
  answer costs demo time.
- **Record the demo video.** The README still has the TODO. Given the crash on the hero CTA, a
  recorded run of the working path is also your insurance policy.


---

# Appendix D — UI/UX + content perspective (full report)

# Assay — UI/UX + Content Review

Reviewed at `http://localhost:3000` on 2026-08-23. Desktop 1440×900, narrow 390×844.
Routes covered: `/`, `/runs`, `/runs/54`, `/explain/pr_c3a0dae3a3e2a212`, `/library`, `/fields`,
`/decisions`, `/schedule`, `/settings` (all 4 tabs), `/docs`, `/sign-in`.

---

## Summary

Assay's prose is unusually good sentence-by-sentence — plain, specific, willing to name its own weaknesses — but the product has no enforced vocabulary, so one state ("a cell the gate refused") is called six different things across six screens, and the app contradicts itself on the same viewport ("Nothing is waiting on you." next to "1 WAITING ON YOU").

Visually the desktop app is clean and restrained, but it is a desktop-only layout: at 390px the `/fields` H1 truncates to "Fiel…", `/schedule`'s page title collapses to a single letter "E", and `/runs` clips its action column off-screen — no table has a mobile treatment.

Accessibility has real, mechanical failures underneath the polish: every app route ships **two `<h1>`s** (three on `/runs/54`), there is **no `<nav>` landmark** for the primary sidebar, and the product's most load-bearing word — the amber status `held` — sits at **2.94:1** contrast, below AA.

---

## Copy findings (per page)

### Global chrome (every route)

| Issue | Exact string | Problem | Suggested rewrite |
|---|---|---|---|
| Create-verb sprawl | `New scrape` (sidebar) / `Start watching` (manual form) / `Start watching these fields` (AI proposal) / `Pick a tracker and paste a link` (home) | Four verbs — scrape, watch, track, pick — for one action: create a scraper. A newcomer cannot tell whether "New scrape" makes a one-off run or a standing watcher. | Pick one noun (**scraper**) and one verb (**watch**). `New scraper` / `Start watching` / `Start from a template`. |
| Caps baked into strings | `'nav.chats': 'CHATS'`, `'nav.scrapersNoChat': 'SCRAPERS WITH NO CHAT'` (`web/lib/copy.ts`) | Uppercase is in the data, not CSS. Screen readers may spell out short ones; and it makes the strings untranslatable-in-place. | Store `Chats` / `Scrapers with no chat`, apply `text-transform: uppercase`. |
| Dead label | `SCRAPERS WITH NO CHAT` — the three items below it are `StaticText`, not links | Names three scrapers and offers no way to open any of them. Also an odd thing to organise a person's sidebar around ("no chat" is an implementation fact). | Make them links. Rename to `Scrapers`. |
| Send-button label lies | `'home.composer.send': 'Read this page'` | The accessible name is "Read this page" whatever you type. Type "watch the price on the Bosch listing" and the submit button still claims it will read *this* page. | `Send` — or vary: `Read this page` for a bare URL, `Ask Assay` otherwise. |
| Narrator identity changes | `'compare.cannotTell': 'I cannot tell you whether this changed.'` vs `'command.unknown': 'Assay has no command by that name.'` vs everything else, which is impersonal | Three narrators: a first-person "I", a third-person "Assay", and a neutral system voice. | Never "I". Use "Assay" when the subject must be named, impersonal otherwise: `This field cannot be compared.` |
| Loading states have six voices | `loading…` / `Reading the clock.` / `Reading what is actually in force.` / `Reading the page` / `Reading the page for a baseline` / `Checking` | Ellipsis vs none, period vs none, sentence vs fragment. | One rule: sentence case, no period, ellipsis character. `Loading…`, `Reading the schedule…`, `Checking…`. |
| Serial comma is inconsistent | Docs: `proxies, anti-bot, and over a thousand prebuilt scrapers` (with) — App: `The commands are /decisions, /held, /runs and /fields.` (without); `ASSAY_RESEND_KEY, ASSAY_MAIL_FROM and ASSAY_MAIL_TO` (without) | Two house styles. | Pick one; the docs' serial comma is the better default for lists of technical tokens. |
| Copy catalogue is bypassed | `copy.ts` holds `'home.manual.sub': '… watches that spot — no model needed'` (em dash) but `app/(app)/watch.tsx:324` hardcodes `… on it -- no model needed` (double hyphen) — and the **hardcoded one is what renders**. | A duplicated string has already drifted from the catalogue meant to prevent exactly that. | Delete the hardcoded literal, call `t('home.manual.sub')`. Then grep for other literals. |

### `/` Home

- **`What should 🕷 Assay watch?`** — the logo mark is interpolated into the H1, so the DOM text is `What shouldAssay watch?` (no space; confirmed in the parsed document). Screen readers and the `<title>` heuristics both get a mangled sentence. Put a space or `aria-hidden` the mark and keep the text intact.
- **`a page, and what to watch on it -- no model needed`** — a double hyphen where the rest of the product (and the copy catalogue) uses an em dash. Also a lowercase sentence fragment sitting under a Title-ish heading. → `A page and what to watch on it — no model needed.`
- **`OR START FROM`** sits *below* the "Describe the fields yourself" card, so that card is orphaned above the group label it belongs to. Either move the label above all three, or move the manual card into the group.
- **`Pick a tracker and paste a link`** — "tracker" appears exactly once in the whole product. The destination (`/library`) says "scrapers" and "prebuilt scrapers". The link label does not name what you'll find. → `Start from a template` / `Browse the library`.
- **`See what every scraper did last`** — "did last" reads as an unfinished phrase ("did last week?"). → `See what each scraper did on its last run`.
- **`0 waiting on you`** while the bell in the same header announces `Activity, 1 waiting on you`. See *Contradictions*, below.
- **`since you started`** is attached to only the third stat (`0 published in error`) but reads as if it qualifies all three. Move it to the group, or repeat it.
- **`Describe the fields yourself`** form: three label casings in one panel — `PAGE` (caps), `FIELDS` (caps), `check every` (lowercase inline). Pick one.
- Manual-form errors are written from the system's side and offer no recovery: `That is not a cadence Assay can schedule.`, `Not one of the four answers.`, `Not a switch position.` → `Assay can schedule hourly, every 6 hours, daily or weekly.`

### `/runs`

- Column header `what happened` and the row link `what happened ›` are the same words. The header labels a column; the link is an action. Rename the link → `open run ›` (or make the whole row clickable and drop the link).
- Filter tabs are Title Case (`All` `Healed` `Held` `Clean`); column headers are lowercase (`run` `when` `scraper` `what happened`); status values are lowercase (`clean`). Three casing systems on one screen.
- `8 runs · 0 healed · 1 held` — `held` here, `held units_affected for review` in the row, `held a cell for review` on the detail page. See *Terminology*.
- Every row exposes **two links to the same URL** (the run number and `what happened ›`) — a screen-reader user tabs through 16 links to reach 8 runs.

### `/runs/54`

- **The page contradicts itself about whether anything was published.** The THIN callout says *"…so nothing was published."* The Hold node says *"The cell **was published** as null and labelled. It was never filled."* Both are visible without scrolling far. Fix by choosing one frame: a labelled hole *is* a publish, so `Nothing was written into the cell — a labelled hole was published in its place.`
- **`The elements the gate weighed against the lost one, best first.`** — "the lost one" has no antecedent on screen. → `The elements the gate compared against the field that broke, strongest match first.`
- **`All 1 recorded run of assay-testbed-vercel-app-v-baseline came back held.`** — "All 1" is a plural template with no singular branch. → `The one recorded run of … came back held.`
- **`THIN`** — an all-caps reason code as a badge with no inline gloss. The explanation follows, but the badge itself is opaque. → `Too close to call`, keep `thin_margin` in the Sources table where codes belong.
- **`How the gate decided ›`** links to `/docs/assay-score`, a page whose sidebar entry is "The Assay Score" and whose H1 is different again. The label does not predict the destination.
- **`before` / `refused`** as the two diff pane labels. The `copy.ts` comment defends `refused` well, but the pair isn't parallel — a reader expects `before/after`. → `current` / `proposed (refused)`.
- **`They do not carry the same value, so neither was published.`** restates the callout two paragraphs above almost verbatim. Cut one.
- Section headings mix article styles: `Fields`, `The selector`, `The gate`, `History`, `Sources`. → drop the articles, or add them everywhere.
- `proof ›` and `decide ›` — lowercase, 13px, and `decide ›` goes to `/decisions` (a list), not to *this* decision. Information-scent failure. → `Review this decision ›`.
- Date format here is `23 Aug 14:56`; `/runs` shows `today 14:56` for the same run. Two formats for one timestamp.
- Tab title is `Run · Assay` for every run — no run number. → `Run 54 · Assay`.

### `/explain/…`

- **`Where did this number come from?`** is the H1 — but this proof is for a cell where `nothing was written here`. The page title asks about a number that does not exist. → make the heading conditional: `Where did this cell come from?` / `Why is this cell empty?`
- **`STATUS WHEN PUBLISHED`** sits directly above `Nothing was written to your data for this cell`. The label asserts a publish the body denies. → `Status on the published row`.
- **`5 elements on the … page were ranked on run 54, 23 Aug 14:56, and none of them was published. Nothing about this field had been healed at the time.`** — 34 words, two negations, and a past-perfect clause a newcomer will re-read. → `On run 54 (23 Aug 14:56), Assay ranked 5 candidate elements and published none of them. This field had never been healed before.`
- Link capitalisation is inconsistent in one stack: `the full record ›` (lowercase) / `Copy as CLI output ›` / `Open as a page ›` / `Copy proof id`.
- Same action, two labels: `Copy proof id` in the sheet, `Copy` in the page header. Ambiguous on the page — copy *what*?
- `proof id` vs the docs' `dataset_id` style. Use `proof ID` in prose.
- No link back to run 54 from the standalone page. Dead end.

### `/library`

- Category names are uneven: `SHOPS` (one item), `CODE`, `REFERENCE`, `PREBUILT SCRAPERS`, `ANYTHING ELSE`. **"Prebuilt scrapers" implies the other four groups aren't** — but they are. → group by what you're watching: `Shopping`, `Code & packages`, `Reference pages`, `Social profiles`, `Anything else`.
- `The newest release on a repository.` → `in a repository`.
- `Assay looks for a price, stock, a version and a date.` — mixed article pattern (`a price`, bare `stock`, `a version`) and no serial comma. → `Assay looks for a price, stock level, version, and date.`
- `What Bright Data's scraper returns for one instagram.com link.` — describes the vendor's output, not what the user gets. → `The public profile behind one instagram.com link.`
- No page description under the `Library` H1, while `/runs`, `/fields`, `/schedule` and `/settings` all have one. Inconsistent header pattern.

### `/fields`

- **`1 observation(s) of this field; 3 are needed before its anchors can be said to move or hold still.`** — this string is `src/health/index.ts:182`, an **engine diagnostic rendered verbatim as product copy**. It carries `(s)`, a semicolon splice, and "anchors", a term used nowhere else in the UI. → `Seen once. Assay needs 3 runs before it can tell whether this field's landmarks are stable.`
- **`Held only by classes, heading_path, id_xpath -- no id, no test hook, no role.`** — "Held" here means *anchored by*, but `held` everywhere else in the product means *withheld from publishing*. **The same word carries two opposite meanings.** → `Anchored only by classes, heading_path and id_xpath — no id, no test hook, no role.`
- `a redesign is under no obligation to keep it` — charming, but it buries the point. → `…so a redesign is likely to break it.`
- The `last change` column contains `never` (grey) and `never delivered` (red). "Never delivered" is a *delivery status*, not a *change date*. Category error in the column.
- Callout `1 field has run and never once published a value. Those runs still reported success.` — states an alarming fact and offers no next step. Add a CTA: `See the field ›`.
- Filter reads `all fields` (lowercase) while `/schedule`'s equivalents read `Every scraper` / `Every field` / `Every outcome` (Title Case, different word). Same control, two vocabularies.
- Header says `4 tracked`; `/settings` header says `4 fields governed`. Same four things, two verbs.

### `/decisions`

- **`Nothing is waiting on you.`** with the bell open beside it reading **`1 WAITING ON YOU — assay-testbed-vercel-app-v-baseline broke on units_affected, from run 54`**. Screenshot-confirmed on one viewport. This is the single most damaging copy bug in the product: the page whose job is to tell you what needs you says nothing does.
- `Every cell in the last run was either published or is still being watched.` — "was either published or is still being watched" mixes tense and voice mid-clause. → `In the last run, every cell was either published or is still under watch.`
- `Held cells arrive here the moment the gate refuses one.` — plural subject, singular pronoun. → `A cell arrives here the moment the gate refuses it.`
- Four near-duplicate variants of this one sentence exist in `copy.ts`:
  - `Every cell in the last run was either published or is still being watched.` (decisions)
  - `Every cell the gate looked at was either published or is still being watched.` (fields)
  - `Nothing was withheld. Every field the gate looked at cleared it.` (compare)
  - `Nothing is held. Every cell the gate could justify has been published, which is the good outcome.` (`/held` command)
  Consolidate to one.
- `See what the runs did ›` vs Home's `See what every scraper did last` — same destination, two labels.

### `/schedule`

- Header reads `3 running · 6 runs today` while all three of those rows say `due — has not run`. **"Running" is false** — nothing is running. → `3 scheduled · 6 runs today`.
- Legend labels are opaque and lowercase fragments: `ran, clean` / `moved, found again` / `held for review` / `the next run, stored` / `projected from the cadence`. **"Cadence"** appears here and in one error string and nowhere else the user can look it up. "The next run, stored" — stored where, and why does the user care?
- The legend says `moved, found again`; the row says `moved, found it again`. One-word drift between `schedule.legend.healed` and `runs.outcome.healed`.
- Search placeholder `Search a scraper, a field, a value, a run id` — you don't *search a scraper*, you search *for* one. → `Search by scraper, field, value, or run ID`.
- `when` column carries three formats at once: `Mon 03:12` (a future run, no date), `today 20:56`, `yesterday 20:19`. `Mon 03:12` is genuinely ambiguous — which Monday?
- Future and past runs are interleaved in one descending list with no divider. `Mon 03:12` sorts above `today 20:56`, which reads as wrong until you realise one is a projection.

### `/settings`

- **Publishing and Output tabs have no controls at all.** A page called Settings on which nothing is settable. Notifications shows three toggles that are permanently disabled. Either convert to read-only status rows with a `Set this in .env` line, or make them work — but do not draw a switch a user can never move.
- `Calibrated: publishes only a clear winner (0.60 floor, 0.16 lead). Change per-field policy in a contract.` — `Calibrated`, `floor`, `lead`, `tier`, and `contract` all appear here undefined, and the sentence instructs the user to do something ("change it in a contract") with no link, no contract list, and no contract UI anywhere in the product. Dead-end instruction.
- **`floor` / `lead` here are the same two numbers the docs call `tau` / `delta`** (`score > tau (0.60) AND score - runner_up > delta (0.16)`). Two name pairs for one pair of thresholds. Pick one and gloss it once.
- `on hold` column header, `leave empty` values. The header names a state, the values give an instruction. → header `When held`, value `Leave the cell empty`.
- Output tab: row labelled `Output` inside a tab labelled `Output`. → `Destination`.
- Output tab column capitalisation is inconsistent within itself: `Postgres`, `Leave empty` (capital) vs `one proof id per cell, on the published row` (lowercase).
- `never filled, always labelled` — cryptic. → `Assay never guesses a value; it marks the cell instead.`
- Notifications: `Environment, not a setting: the worker reads ASSAY_RESEND_KEY, ASSAY_MAIL_FROM and ASSAY_MAIL_TO on each run and nothing from the store. ASSAY_RESEND_KEY is not set, so a break alert would fall through to the webhook.` — 45 words, and "nothing from the store" will mean nothing to a first-time reader. → `Set in the environment, not here. The worker reads ASSAY_RESEND_KEY, ASSAY_MAIL_FROM and ASSAY_MAIL_TO at each run. ASSAY_RESEND_KEY is unset, so break alerts fall through to the webhook.`
- Connections: **`Lets Assay call Bright Data. Authenticating is not fetching — the account needs a zone too, and a token answering does not prove it has one.`** The second clause is a riddle: "a token answering does not prove it has one" — *it* = the account, *one* = a zone. Two pronouns, two antecedents, both offscreen. → `A valid token is not enough on its own — the Bright Data account also needs a zone. Assay cannot check for one until it tries a fetch.`
- `"assay connectors set brightdata" mints the secret` — "mints" is a coinage; → `generates`.
- Vendor names are inconsistently cased: `brightdata` / `slack` / `discord` in the key column, `Bright Data` in the prose. → `Bright Data`, `Slack`, `Discord` in the label; keep the lowercase form only in code spans.
- `See documentation` × 5, all identical, presumably to five different anchors. No scent. → `Bright Data token setup ›`, `Slack webhook setup ›`, etc.

### `/sign-in`

- **Route is `/sign-in`, title is `Configure your key`, and there is no sign-in — no email, no password, no button that authenticates.** The route name lies about the screen.
- Title is `Configure your key` (singular) above a list of **four** credentials.
- `A model only ever proposes; the gate decides.` — good line, but "the gate" is undefined and this is very likely a user's *first* Assay screen. Add four words: `…the gate — Assay's publish check — decides.`
- `Bright Data delivering to Assay is a separate webhook, set on Settings.` → `set **in** Settings`. Also points at a page the user hasn't reached.
- `Reads a page that refuses a direct request. Only tried after one is.` — the elliptical second sentence is genuinely hard. → `Used only after a direct request fails.`
- `Sends the break alert and the digest.` — definite articles for two things never introduced; Settings calls them `Break alerts by email` and `Weekly digest`. → `Sends break alerts and the weekly digest.`
- **Firecrawl and Email delivery rows show a `See documentation` button where the other two show `✓ Connected` — so they carry no status at all.** A user cannot tell whether Firecrawl is off or just undocumented. Add an explicit `Not connected`.
- Three status vocabularies for one concept across three screens: `Connected` (sign-in, Title Case), `connected` (Settings ▸ Output, lowercase), `set` / `not configured` (Settings ▸ Connections). And `copy.ts` itself defines `'settings.connector.configured': 'configured'` — a fourth, which the screen doesn't even use.

### `/docs`

- **The opening two sentences are near-duplicates that disagree with each other**, and they render one above the other:
  - subtitle: `A self-healing scraper that abstains when it is not sure, and **publishes** how often its heals are wrong.`
  - first line: `Assay is a self-healing scraper that abstains when it is not sure, and **measures** how often its heals are wrong.`
  Delete one, or make the subtitle a genuine summary.
- `tools/sweep.ts scans 110 pairs across an 11 x 10 grid` — letter `x` where `×` belongs.
- `The boundary that Next never runs a scrape.` (Architecture card description) — **ungrammatical**; words are missing. → `The boundary: Next never runs a scrape.`
- `All four, what each buys, and what happens without it.` (Credentials card) — "All four" has no antecedent from the card, and `it` should be `each`. → `The four credentials, what each one buys, and what happens without it.`
- The same link has two different descriptions: the card says `Two processes, Postgres, and the captures volume.`; the bottom pager says `Two processes, one Postgres, a captures volume, and the compose file that wires them.`
- `Two different notions, reported separately, because the literature conflates them.` — "the literature" is an academic register that appears nowhere else. → `…because these are usually reported as one number.`
- The `npm run audit` prose says **60 records / 100% successful**, and the code block below says **6 of 10 promised fields** and **3 fields that never arrived**. Three unexplained numbers in three sentences. Add one clause naming the units.
- `sixty pages fetched` in a paragraph that opened with `returned 60 records`. Spell-out vs numeral within four lines.
- Straight quotes inside the heading `What "correct" means here`, curly quotes elsewhere (`"assay connectors set slack…"`). Pick one.
- `Trademark attribution` is an H2 on the docs *index* page. Legal boilerplate as the last section of the "what is this product" page. Move it to a footer or `/docs/legal`.
- Within the trademark block: `in the US and other countries` vs `in the United States and/or other countries` two paragraphs apart; `the Slonik Logo` (capital L) vs `the Docker logo`.
- **Voice drift, docs vs app.** Docs: *"If only one ships, ship the hole in the data. The hole is the product."* App: `not configured`, `all fields`, `leave empty`. The docs are a manifesto; the app is a utility. They are recognisably not the same writer. The docs' voice is the better one — some of it belongs in the empty states.

### Contradictions found (all screenshot-verified on one viewport)

1. `/decisions`: page says **`Nothing is waiting on you.`**, bell popover says **`1 WAITING ON YOU`**.
2. `/` Home: stat says **`0 waiting on you`**, bell aria-label says **`Activity, 1 waiting on you`**, `/runs` header says **`1 held`**.
3. `/runs/54`: THIN callout says **`nothing was published`**, Hold node says **`The cell was published as null`**.
4. `/explain/…`: label **`STATUS WHEN PUBLISHED`** over body **`Nothing was written to your data for this cell`**.
5. `/schedule`: header says **`3 running`**, the three rows say **`due — has not run`**.

---

## Terminology table

| Term | Where it appears | Consistent? |
|---|---|---|
| **A cell the gate refused** | `held units_affected for review` (/runs) · `held a cell for review` (/runs/54 header) · `held a field for review` (/schedule row) · `held for review` (/schedule legend) · `held` (chip, everywhere) · `broke on units_affected` (bell popover) · `quarantined` (Sources table, `field_runs.status`) · `abstain` (`runs.status`) | ❌ **Eight labels, one state.** The most damaging finding in the review. |
| **cell vs field** | `held a cell for review` vs `held a field for review` for the same event; `On a held field` (Settings) vs `one proof id per cell` (Settings, same tab) | ❌ Used interchangeably, sometimes in adjacent rows. Docs imply cell = one field on one run; nothing says so in the app. |
| **held** | (a) withheld from publishing — everywhere; (b) *anchored by* — `/fields`: "Held only by classes, heading_path, id_xpath" | ❌ Same word, opposite senses, both user-facing. |
| **abstain** | `/sign-in` H1, docs, `runs.status` in the Sources table | ⚠️ Never defined in the app. Only defined in docs, one sentence, buried in "The product, in one line". |
| **the gate** | /decisions body, /sign-in first paragraph, /runs/54 section heading, /settings implicitly, docs | ⚠️ Consistent name, **never defined in the app**. Appears in the first sentence a new user reads. |
| **tau / delta** vs **floor / lead** | docs: `score > tau (0.60) AND score - runner_up > delta (0.16)` · Settings: `(0.60 floor, 0.16 lead)` | ❌ Two name pairs, same two numbers. |
| **tier** | `/settings` only (`normal`, `strict`) | ❌ Defined nowhere; not surfaced on `/fields` where the same fields are listed. |
| **contract** | `/settings`: "Change per-field policy in a contract", "from a saved contract", `Field contracts copied as YAML` | ❌ No contract UI, no contract list, no docs link. Dead-end term. |
| **cadence** | `/schedule` legend ("projected from the cadence"), `manual.badCadence` error, `schedule.empty.none.body` | ⚠️ Never glossed; the nav calls the same idea "Schedule" and the form calls it "check every". |
| **anchors** | `/fields` row copy only ("before its anchors can be said to move or hold still") | ❌ Leaked from the engine; no definition anywhere in the UI. |
| **skeleton** | `/runs/54` Evaluate node + Sources (`runs.skeleton_hash`) | ❌ Raw engine field name shown as a user-facing fact label. |
| **episode** | `/runs/54` Sources (`#10 opened`) | ❌ Undefined. |
| **drift** | *nowhere in the UI* | — Present in the product's premise but never named on screen. |
| **heal / healed** | `/runs` tab `Healed`, `/schedule` `moved, found again` / `moved, found it again`, docs `heal` | ⚠️ The user-facing euphemism ("moved, found again") and the technical word ("Healed") coexist as sibling controls on the same nav. |
| **scraper / tracker / watch / scrape** | `New scrape`, `Pick a tracker`, `Start watching`, `SCRAPERS WITH NO CHAT`, `Every scraper` | ❌ Four words for the object and its creation. |
| **tracked / governed / under watch** | `/fields` "4 tracked" · `/settings` "4 fields governed" · `/held` command "Nothing is under watch yet" | ❌ Three verbs, same four fields. |
| **connected / set / configured** | `Connected` (sign-in) · `connected` (Settings▸Output) · `set` / `not configured` (Settings▸Connections) · `'configured'` in `copy.ts`, unused | ❌ Four vocabularies for one binary. |
| **proof id** | `/runs/54`, `/explain`, Settings▸Output | ✅ Consistent — but should be `proof ID` in prose. |
| **labelled / labelling** | 10 occurrences, all British | ✅ Consistent (deliberate). Flag only if the product targets US English. |

**No glossary page exists.** Given that ~12 of these terms are load-bearing and undefined, a `/docs/glossary` linked from the run-detail page is the single highest-leverage content addition.

---

## Visual findings (per page)

### Global — desktop 1440

- **Three primary-button colours.** `New scrape` is orange `#ff4d00`; `Ask for a run` (run detail, explain) is green `#16a34a`; `Open Assay` (sign-in) is black `#1a1a1a`. Nothing distinguishes their weight or destructiveness — they are all "the main action here".
- **`green` does not mean one thing.** `✓ clean` (green check, /runs) = good. `● moved, found again` (green dot, /schedule) = the scraper *broke and self-healed* — arguably the state that most deserves attention. And `clean` on `/schedule` is a **grey** dot while `clean` on `/runs` is a **green** check. The same outcome, two colours, on two screens.
- **Blue appears with no assigned meaning.** `/runs` link colour and `/fields` progress bars are blue, in a palette otherwise built from orange (brand), green (ok), amber (held), red (error) and grey (muted). A fifth hue with no semantic slot.
- **Amber vs red for the same event.** A held cell is amber on `/runs`, `/runs/54` and `/schedule`, but the bell popover renders it in a **red-bordered** error box.
- Header action row is unstable: two icon buttons (bell + gear) on most routes, one (bell only) on `/settings`, and a completely different set (`Ask for a run`, bell, `All runs` / `Copy`) on run detail and explain. The bell jumps ~44px between routes.
- A thin light rule sits directly under the "Assay" wordmark in the sidebar, clipped and only ~50px wide — reads as a rendering artifact, not a divider.
- Large dead zones: `/decisions`, `/fields`, `/library`, `/explain`, `/settings` all leave 500–700px of empty page below the content at 900px height, and `/library` caps its card grid at 2 columns, wasting ~340px of width at 1440.

### `/` Home — desktop
- Composer's submit button is a pale orange (`#ff4d00` at low opacity) when disabled — visually it reads as an *enabled* light-orange button, not a disabled one.
- The `/` insert-command glyph renders as a bare diagonal stroke at 14px; at a glance it's a scratch on the screen, not an icon.
- `Mode` dropdown shows the control's *name*, never its *value* — the user can't see which mode is active without opening it.

### `/` Home — 390
- The mark in the H1 orphans at the end of line 1 (`What should 🕷` / `Assay watch?`).
- The `today` label of the sparkline is pinned to the container's right edge (x≈345) while the chart ends at x≈235 — the label floats free of the data it labels.
- Stat rows have uneven vertical rhythm (tight between rows 1–2, loose before row 3) and `since you started` hangs under row 3 at a third indent level.

### `/runs` — desktop
- Table is a div grid, not a `<table>` — see Accessibility.
- Blue `56` and blue `what happened ›` in the same row both link to `/runs/56`; the row itself is not clickable, so the largest target on the row is inert.

### `/runs` — 390 ⛔
- **Column header renders as `runwhen`** — `run` and `when` collide with no gap, forming a nonsense word.
- Scraper names break per-hyphen into 5 lines (`github-` / `com-` / `vercel-` / `next-js-` / `releases`), inflating rows to ~250px.
- **The `what happened ›` column is clipped off the right edge** — visible as `wha…` / `happened` with the chevron cut. The action is unreachable without horizontal scrolling.
- The page scrolls horizontally: `documentElement.scrollWidth` 395 vs `innerWidth` 390, caused by `pl-[56px] pr-[32px]` on a `w-full` container.

### `/runs/54` — desktop
- **The flow diagram is clipped.** Its container measures `clientHeight 169 / scrollHeight 203` with `overflow: hidden` — the "Search for a replacement" node is cut mid-row at `candidates ranked 5`. Nothing indicates there is more to see.
- **The selector diff shows two identical panes.** Left (`before`) and right (`refused`) contain byte-identical JSON; only the highlight colour differs (pink vs green). A diff where both sides match communicates nothing and actively suggests a change happened.
- Sources table: the `url` value overruns its column and collides with the next — rendering as `https://assay-testbed.vercel.ap_targets.url`.
- `The gate` table: the `text on the page` header sits at x≈370 but its values start at x≈330, immediately after the element column. Header and data are not on the same axis.
- `THE TWO IT COULD NOT SEPARATE` shows both candidates as `dd.recall-card__…` — truncated to the point where the two rows are indistinguishable, which is exactly the information the section exists to convey.
- History chart is a single amber bar with no axis, no scale, and a caption (`1 run · 18.7 kB to 18.7 kB · this run 18.7 kB`) that repeats one number three times.
- The Hold node is a `<button aria-pressed="false">` with `cursor: grab` whose accessible name is the entire node's contents (~40 words).

### `/runs/54` — 390 ⛔
- The entire header identity line (`Run 54 · assay-testbed-vercel-app-v-baseline · 23 Aug 14:56 · 18.7 kB · held a cell for review`) is dropped. Only the two buttons survive. The page does not say which run it is.
- The flow diagram loses its whole right-hand DECISION column (`Unchanged since last run?`, `Evaluate`) and all the edge labels. Node text is clipped mid-word (`units_affec`, `none for this fi`).
- Fields table crushes `reason` into a ~60px column: `two / candidates / on the / page were / too close / to call` — six lines.
- Diff pane labels clip to `befor` / `refuse`.
- Sources table: `Search for a replacement` and `candidates ranked` collide into `Search for a candidates/replacementranked`; `read from` values clip at the viewport edge.

### `/library`
- **Three icon systems in one grid**: real brand marks (GitHub, Wikipedia, MDN), generic line icons (cart, box, document), and **the same globe icon on four different cards** (Instagram, LinkedIn, Any Bright Data scraper, Any site). Four cards that look identical at a glance.
- 2-column grid leaves the last row of each group orphaned (Wikipedia alone, Any Bright Data alone) and ~340px of unused width.
- 390: clean single-column stack. No issues.

### `/fields` — desktop
- **Column collision:** the field name truncates and butts directly against the `seen in` value — `assay-testbed-vercel-app-re…1/1`, with no space. Two adjacent rows both read `github-com-vercel-next-js-rel…1/1` and are **indistinguishable**.
- The `seen in` header sits at x≈530; the `1/1` value at x≈545 and the bar at x≈595 — nothing is aligned to the header.
- Progress bars are blue with no legend (blue of what? 1/1 of what?).
- Rows are not links — no drill-down from a field to its runs or its policy.

### `/fields` — 390 ⛔
- **The H1 truncates to `Fiel…`** and the subtitle to `4 tracked · 1 never deli…`. The page cannot say its own name.
- The first data row is ~800px tall with its content floated in the vertical middle of an empty band, because the off-screen `how it is found` column dictates the row height.
- `how it is found` and `last change` are entirely off-screen right; the blue bar clips at the edge.

### `/decisions`
- Empty state is a full-width, 90px-tall bordered card with 700px of white below it. No icon, no illustration — unlike the `/fields` callout, which does have one. Inconsistent empty-state treatment.
- Bell popover opens over the empty-state card with no scrim, obscuring the sentence it contradicts.

### `/schedule` — desktop
- Legend uses five distinct marker treatments (filled grey, filled green, filled amber, orange ring, dotted ring) with no size or shape logic tying them together.
- Table has an inert `–` in the `run` column for future rows, unexplained.

### `/schedule` — 390 ⛔
- **`Every run since 22 Aug` collapses to a single visible glyph `E`** wedged between the next-arrow and the view dropdown. The page's own title is one letter.
- **Column headers overlap:** `scraper` and `what happened` render on top of each other as `scrapewhat / happened`.
- Scraper column truncates to two characters — `g.`, `a.` — for eleven rows.
- The `what happened` column becomes a bare coloured dot with no text; the meaning is only recoverable by scrolling up to the legend.
- H1 truncates to `Sched…`; subtitle to `3 running · 6 runs t…`; search placeholder cuts mid-word (`…a ru`).

### `/settings` — desktop
- Field names wrap so the trailing separator dangles at end of line: `assay-testbed-vercel-app-recalls ·` / `recall_title`.
- Row heights are uneven (rows 3–4 carry two extra lines), breaking the table's vertical rhythm.
- `export as YAML ›` is right-aligned at x≈1228 while the sentence it relates to ends at x≈940 — nearly 300px of gap; the link reads as orphaned.
- Connections: `set` (with a check at x≈583) and `not configured` (no icon, x≈575) do not share a left edge.
- Notifications: the three toggles are simultaneously **off and disabled** and look identical to a normal off state — no user can tell whether they're actionable.

### `/settings` — 390 ⛔
- Four-column desktop layout is retained; the description column squeezes to ~90px and produces 15-line ragged text blocks.
- `See documentation` buttons are pushed past the right edge and clipped.
- Tab strip overflows; `Connections` sits at the viewport edge.

### `/sign-in` — desktop
- The left half (900px) contains one headline and nothing else — no logo, no supporting copy, no footer.
- The credential card is fixed at ~375px, so descriptions wrap to a very short measure (`Field discovery and second-` / `opinion checks.`) while 900px sits empty beside it.
- The background is an AI-generated fantasy landscape (waterfalls, floating cliffs, seagulls) visible only as a ~60px sliver. It is off-brand for a tool whose entire pitch is measured honesty, and it is fetched at `w=3840` for a 535px slot.

### `/sign-in` — 390 ⛔
- **`✓ Connected` and the `See documentation` buttons overflow the card's right edge and clip at the viewport.**
- The headline `A scraper that abstains when it is not sure.` disappears entirely — the brand statement is desktop-only.
- The fantasy background dominates the screen.

### `/docs`
- **A completely different product shell.** Different header lockup (`Assay docs`), different logo treatment, no app sidebar, different type scale, different content width. The only route back is a small `Open Assay` link at the top of the docs sidebar.
- 390: handled correctly (Fumadocs defaults) — the best mobile experience in the product, which underlines how little the app itself has had.

### Theme
- **There is no dark mode**, and this is deliberate — `app/docs/layout.tsx` disables `next-themes` explicitly and `app/fumadocs.css:20` documents "no `.dark` block, no `prefers-color-scheme` query". Worth noting as a decision rather than a bug, but: the app ignores `prefers-color-scheme` entirely, so a user on a dark OS gets a full-brightness white canvas next to a near-black sidebar with no way to soften it.

---

## Accessibility findings

### Structure

- **Two `<h1>` elements on every app route.** The top-bar page title and the page's own heading are both `h1`. `/runs/54` has **three** (`Runs`, `Run`, `Run 54`). `/runs` has two identical `Runs`. `/schedule` produces `h1 → h2 → h1`.
- **No `<nav>` landmark for the primary navigation.** The sidebar wrapper carries `role="none"`, which removes it from the accessibility tree entirely. `document.querySelectorAll('nav').length` is **0** on `/`, `/library`, `/fields`, `/decisions`, `/schedule`, `/settings`, `/sign-in`, `/docs`, `/runs/54`; only `/runs` has one (its filter tabs).
- **Every data table is a div grid.** `/runs`, `/fields`, `/schedule`, `/settings`, and the Sources/gate tables on `/runs/54` expose no `table`/`row`/`columnheader`/`cell` roles — column headers are loose `StaticText`. A screen-reader user gets an undifferentiated stream of values with no column association.
- `/library` section labels are `<h2>` whose **DOM text is literally uppercase** (`SHOPS`, `PREBUILT SCRAPERS`), not CSS-transformed.
- Every app route ships the **same meta description** — `A scraper that abstains when it is not sure.` — with no per-page variant.
- `<title>` on run detail is `Run · Assay` for every run.

### Contrast (computed, sRGB, WCAG AA)

| Element | Colour on background | Ratio | Required | Verdict |
|---|---|---|---|---|
| `New scrape` — the primary CTA | `#fff` on `#ff4d00` | **3.33** | 4.5 | ❌ |
| `Ask for a run` | `#fff` on `#16a34a` | **3.30** | 4.5 | ❌ |
| **`held`** (the product's key status word) | `#ca8a04` on `#fff` | **2.94** | 4.5 | ❌ |
| `THIN` badge | `#ca8a04` on `#fffbeb` | **2.83** | 4.5 | ❌ |
| `clean` (status value, /runs) | `#a2a2a2` on `#fff` | **2.55** | 4.5 | ❌ |
| Table column headers `run/when/scraper/what happened` | `#a2a2a2` on `#fff` | **2.55** | 4.5 | ❌ |
| `LAST 8 RUNS`, `OR START FROM`, `Sat`/`today` eyebrows | `#a2a2a2` on `#fff` | **2.55** | 4.5 | ❌ |
| Diagram stage chips `FETCH` / `ENGINE` / `DECISION` | `#a2a2a2` on `#f7f7f8` | **2.38** | 4.5 | ❌ |
| Mono keys `url`, `page size`, `page digest` | `#a2a2a2` on `#fff` | **2.55** | 4.5 | ❌ |
| Decision arrow `→ changed — evaluate` | `#16a34a` on `#fff` | **3.30** | 4.5 | ❌ |
| Sidebar `CHATS`, `SCRAPERS WITH NO CHAT`, `Start a new conversation`, `No accounts on this instance` | `#65676d` on `#0e0e0f` | **3.41** | 4.5 | ❌ |
| Sidebar nav items (Decisions, Runs, …) | `#a3a5a9` on `#0e0e0f` | 7.7 | 4.5 | ✅ |
| Body muted (`#6b6b6b` on white) | | 4.6 | 4.5 | ✅ (just) |

The `#a2a2a2` token is used for every eyebrow, table header and secondary status value across the app; raising it to roughly `#767676` fixes the largest single block of failures.

### Focus

- Focus indicators exist but come in **three treatments**: a 2px orange `box-shadow` ring on design-system components (sidebar nav, top-bar buttons, run-strip bars, `New scrape`); the **browser default** `1px auto` outline on chat links, `/runs` filter tabs, run-number links and every `what happened ›` link; and a blue UA outline on light surfaces vs a white one on the dark sidebar. Roughly half the interactive elements never receive the design-system ring.
- No visible skip link.

### Names and images

- No images lack `alt`; decorative images correctly use `alt=""`.
- No buttons or links lack an accessible name.
- The Hold node on `/runs/54` is a `button` with `aria-pressed="false"` whose accessible name is ~40 words of table contents — announced in full on every focus.
- `Toggle Sidebar` is the vendored shadcn string and reads as developer-speak next to Assay's own voice.

---

## Design-system inconsistencies

1. **Primary button has three colours** — orange (`New scrape`), green (`Ask for a run`), black (`Open Assay`). No rule distinguishes them.
2. **Status colour has no fixed meaning.** Green = "clean" on `/runs` but "moved, found again" (i.e. a heal) on `/schedule`; "clean" is grey on `/schedule`. Held is amber on three screens and red in the bell popover.
3. **Blue is unassigned.** Used for links on `/runs` and for progress bars on `/fields`, in a palette that has no blue token defined semantically.
4. **Icons come from three systems** — brand SVGs, generic line icons, and a repeated globe placeholder used for four distinct library items.
5. **Tables have no shared component.** Six tables, six different header/value alignment behaviours, and none of them is a `<table>`.
6. **Casing has no rule.** Title Case tabs (`All`, `Healed`), lowercase column headers (`run`, `when`), lowercase filter values (`all fields`) next to Title Case ones (`Every field`), ALL-CAPS eyebrows baked into strings, `Connected` vs `connected` vs `set`.
7. **Focus ring is applied inconsistently** — see Accessibility.
8. **Disabled state is undefined.** The composer's send button, the manual form's `Start watching`, and all three Notifications toggles are disabled but render as low-opacity versions of the enabled state, with no cursor, cue or explanation.
9. **Page-header pattern varies.** `/runs`, `/fields`, `/schedule`, `/settings`, `/decisions` have a subtitle; `/library` and `/` do not. Action-button count in the header changes on four routes.
10. **Copy catalogue is bypassed in at least two places** — `manual.sub`'s em dash vs the hardcoded `--` in `watch.tsx:324`, and `settings.connector.configured` ("configured") vs the rendered "set". The catalogue's own header comment argues this is the failure mode it exists to prevent.
11. **No responsive strategy.** Every table, header and multi-column layout uses its desktop form at 390px. There is no card/stacked variant anywhere in the app (only `/docs`, which inherits Fumadocs, adapts correctly).

---

## Prioritized fix list

### High

1. **Fix the "waiting on you" contradiction.** `/decisions` says `Nothing is waiting on you.` while the bell says `1 WAITING ON YOU`, and Home's stat says `0` while `/runs` says `1 held`. One source of truth for the held count; then one sentence describing it.
2. **Pick one name for a held cell and enforce it.** Today: `held X for review` / `held a cell for review` / `held a field for review` / `held for review` / `broke on X` / `quarantined` / `abstain` / `held`. Choose one user-facing phrase, keep `quarantined`/`abstain` as the data contract only (they already are, per `copy.ts`'s own rules), and stop showing them in the Sources table without a gloss.
3. **Give the app a mobile layout.** At 390px: `/fields` truncates its own H1 to `Fiel…`, `/schedule` renders its page title as the letter `E` and overlaps two column headers, `/runs` clips its only action off-screen, `/sign-in` clips its status column. Convert the six tables to stacked cards below ~768px.
4. **Raise contrast on `held`, `clean`, and the `#a2a2a2` eyebrow token.** The single most important status word in the product is at 2.94:1 and every table header is at 2.55:1.
5. **One `<h1>` per page**, and add a `<nav>` landmark to the sidebar (remove `role="none"`).
6. **Fix the clipped flow diagram on `/runs/54`** (`clientHeight 169 / scrollHeight 203`, `overflow: hidden`) — the last engine node is cut with no affordance.
7. **Fix the `/fields` column collision.** `assay-testbed-vercel-app-re…1/1` is unreadable, and two rows are currently indistinguishable from each other.
8. **Resolve the published/not-published contradiction on `/runs/54` and `/explain`.** `nothing was published` vs `The cell was published as null`; `STATUS WHEN PUBLISHED` vs `Nothing was written`.

### Medium

9. **Make `/settings` settable, or stop calling it Settings.** Two tabs have zero controls; the third shows three permanently-disabled toggles. Convert to read-only status rows with `Set in .env` guidance, or wire them up.
10. **Remove the dead-end `contract` reference.** `Change per-field policy in a contract.` points at UI that does not exist.
11. **Unify `tau/delta` (docs) with `floor/lead` (Settings).**
12. **Add a `/docs/glossary`** covering: gate, abstain, held, quarantined, heal, cell, field, tier, contract, cadence, anchors, skeleton, proof, episode, thin margin — and link it from `/runs/54` and `/decisions`.
13. **Fix `/schedule`'s `3 running`** when nothing is running; separate future rows from past ones.
14. **Fix the identical-panes selector diff** on `/runs/54` — a diff showing no difference is worse than no diff.
15. **Fix the Sources `url` column collision** (`…vercel.ap_targets.url`) and the `text on the page` header misalignment.
16. **Apply the design-system focus ring everywhere** — about half of interactive elements fall back to the UA default.
17. **Give disabled controls a real disabled treatment** (cursor, opacity floor, and a reason).
18. **Rewrite the four hardest sentences**: `/settings` Bright Data ("Authenticating is not fetching…"), `/settings` Notifications (45-word env explanation), `/fields` ("1 observation(s)…anchors…"), `/sign-in` Firecrawl ("Only tried after one is.").
19. **Rename `/sign-in`** to match what it shows (there is no sign-in on it), and change `Configure your key` (singular) to cover four credentials.
20. **Fix `/docs` grammar and duplication**: `The boundary that Next never runs a scrape.`; the near-duplicate opening sentences (`publishes` vs `measures`); `All four, what each buys…`; `11 x 10` → `11×10`; `60 records` vs `sixty pages`.

### Low

21. Fix `what shouldAssay watch?` (missing space in the H1's DOM text).
22. Replace `--` with `—` in the two user-facing places it survives; route the string through `copy.ts`.
23. Unify status vocabulary: `Connected` / `connected` / `set` / `not configured` / `configured` → one pair.
24. Unify vendor capitalisation (`brightdata`/`slack`/`discord` → `Bright Data`/`Slack`/`Discord` in labels).
25. Give the four library items with a generic globe icon distinct marks.
26. Make `SCRAPERS WITH NO CHAT` items links, and rename the group.
27. Consolidate the four near-identical "everything was published or is still watched" empty-state sentences into one.
28. Consolidate `moved, found again` / `moved, found it again`.
29. Per-page `<meta name="description">` and a run number in the run-detail `<title>`.
30. `See documentation` × 5 → distinct labels naming their destinations.
31. Move `Trademark attribution` off the docs index into a footer or legal page; fix `US and other countries` vs `United States and/or other countries` and `Slonik Logo` → `Slonik logo`.
32. Reconsider the AI-fantasy `/sign-in` background (off-brand, and a 3840px JPEG for a 535px slot); at minimum, serve it at a sane width.
33. Fix the 5px horizontal overflow at 390 caused by `pl-[56px] pr-[32px]` on a `w-full` container.
34. Fill the dead space on `/decisions`, `/explain` and `/library` (2→3 column grid, or a max-width container that centres the content).
35. Give `/library` a page description to match the other routes' header pattern.
36. `proof id` → `proof ID`; `run id` → `run ID`.
37. Decide whether the docs' manifesto voice or the app's utility voice is canonical, and pull the app's empty states toward it.

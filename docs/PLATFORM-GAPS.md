# Platform gaps — what this kind of product is expected to have

Audited 2026-08-21 against: the 34 wireframes, `FEATURES.md` F1–F14 and its §4
anti-features, `APP-DESIGN.md`, `CRITIQUE.md`, and outside research (sources at the
end; convention-based judgments labelled as such). Every gap below was cross-checked
against the anti-features list first — nothing here re-proposes a refusal.

---

## Executive summary — the five gaps that matter

1. **Persistence (capture store + run history) — blocks-launch.** Already CRITIQUE's
   top finding; the research makes it competitive, not just architectural: Scrapling
   (75K stars, the incumbent) ships a SQLite fingerprint store (`auto_save=True`)
   today. A healer with no store is behind the free incumbent on the one thing five
   of our drawn features (backfill, blast, unheal, decide-once, frozen queue card)
   stand on. Our append-only design is *better* than their `INSERT OR REPLACE` —
   but only once it exists.

2. **A scraping-conduct posture — blocks-trust, and nobody has drawn it.** Courts
   treat robots.txt compliance as a good-faith signal; the EU AI Act now imposes
   training-data disclosure duties; publishers are actively blocking AI crawlers;
   SerpApi v. Google is live this month. A scraping product with zero stated stance
   on robots.txt, rate limits, PII, and logins is a liability. This is one docs page
   (`CONDUCT.md` or a docs-site section): what Assay will and will not fetch, that
   politeness is also anti-blocking strategy, and that the corpus came from the
   Internet Archive. Cheap, high-trust, on-voice for a product whose brand is refusal.

3. **A REST API + signed webhooks — blocks-trust.** The Trust Envelope (F13) is a
   contract "your code reads" — but there is no designed way for code to *fetch* it.
   Every comparable platform (Apify REST v2 is the reference) exposes
   runs/storage/schedules programmatically. Minimum: read-only REST over the same
   store the MCP server reads (`/status`, `/held`, `/decisions`, `/runs`,
   `/explain/:proof`), API keys for consumers, and HMAC-signed webhook payloads
   (Stripe/Svix convention). No new capability — the MCP tool table already defines
   the surface; this is a second transport.

4. **OSS hygiene — blocks-launch for an open-source pitch.** `package.json` says MIT
   but there is **no LICENSE file**, no CONTRIBUTING, no issue templates, no
   CHANGELOG, no CI running `npm test`, no versioning policy. Convention
   [judgment, not sourced]: these are the first four things an evaluating developer
   checks. And a product whose flagship track *diffs competitor changelogs* shipping
   without a changelog of its own is an irony a hackathon judge will find. One
   afternoon of files.

5. **The hosted-demo boundary: auth reality + the "Free plan" story — blocks-trust.**
   The sign-in frame (39:5) and the sidebar's `Free plan / Upgrade` imply accounts,
   sessions, and a paid tier — none designed anywhere, and APP-DESIGN §7.3 already
   flags the SaaS-mock reading. Decide once: either delete plan language entirely
   (pure OSS + demo marker), or write the one-paragraph plan story (self-host free
   forever; hosted = we run the runner + store for you). Single-user stays the
   stance — §4 refuses RBAC, and that refusal holds; "orgs" wait until a real team
   shares a queue.

---

## Full audit table

Severity: **L** = blocks-launch · **T** = blocks-trust · **later** = defer honestly.

### Core product

| Item | Status |
|---|---|
| Detect / heal / gate engine | **HAVE** — `src/`, measured (`results/bench.json`) |
| Persistence: captures, run history, quarantine store | **GAP L** — CRITIQUE axis 2 has the 5-table schema; see summary #1 |
| Scheduling (declared cadence, skip-if-unchanged) | **HAVE-design** (80:2) — build gap; skip-poisons-history fix in CRITIQUE |
| Goal box → discovery → field proposal | **HAVE-design** (57:2, 103:392, 99:2) — zero engine support, front door of the product (CRITIQUE axis 1) |
| Compare/diff + digest (track 07) | **HAVE-design** (108:2, 109:2) |
| MCP server | **HAVE-design** (APP-DESIGN §6) — research: Apify ships MCP; PyScrappy and scrapy-mcp-server both launched self-healing-via-MCP *this month*. The window for "first honest one" is closing; the refused `assay_resolve` is the differentiator to say out loud |
| Proxy / blocking management | **DELEGATED** (deliberate) — Bright Data owns transport; 119:2 routes blocks to the proxy owner. Gap: the retry/backoff loop after a block is undesigned. **T**, small |
| JS rendering | **DELEGATED** — settings row `Browser`, BD-side |

### Data lifecycle

| Item | Status |
|---|---|
| Output envelope JSON/CSV (F13) | **HAVE-design** (127:2) |
| Warehouse join (`proof_id` column) | **HAVE-design** (F12, CRITIQUE schema) |
| Retention policy for captures/history | **GAP T** — content-addressed dedupe makes it cheap (CRITIQUE), but the user-facing knob (keep N days / last-good + boundaries) exists nowhere |
| Export all my data / delete my data | **GAP later** — self-host mitigates (it's their disk); hosted demo needs delete before real keys arrive |

### Account & auth

| Item | Status |
|---|---|
| Sign-in (39:5) | **HAVE-design, hollow** — nothing behind it. Self-host: env-var single user is fine and on-stance. Hosted: sessions + encrypted key rows needed (**L** for hosted only) |
| Orgs / RBAC / SSO | **REFUSED** (§4) and research does not overturn it — SSO becomes the first paid-tier feature *when a real team asks* [convention] |
| Consumer API keys | **GAP T** — see summary #3 |

### API & integration

| Item | Status |
|---|---|
| REST API | **GAP T** — summary #3 |
| Webhooks (routing exists) | **HAVE-design** (129:2 routing table) — **GAP T**: payload signing + delivery retries undesigned [convention: Stripe/Svix HMAC] |
| Slack / email delivery | **HAVE-design** (120:2, 129:2, §6b) — research: Soda alerts via Slack/PagerDuty/email; we match |
| MCP (agents) | above |

### Operational trust

| Item | Status |
|---|---|
| "Did my runs happen" | **HAVE-design** — Night Report / quiet screen. Deliberately not a fleet dashboard; the refusal holds |
| Public status page (hosted) | **GAP later** — only when hosted demo has users |
| Incident comms | **HAVE-design** — F14 is stronger than convention: it includes the refusals |

### Onboarding, docs, help

| Item | Status |
|---|---|
| Empty states / first run | **HAVE-design** (128:2) |
| Docs site | **DONE** — `web/content/docs/` is served at `/docs` by the running app: install, self-host, credentials, architecture, run flow, limitations. The earlier one-file `docs/index.html` renderer was deleted once this existed |
| The voice bank → landing page | **HAVE-material** — the cut philosophy copy is the landing page, unbuilt |

### Billing & plans

| Item | Status |
|---|---|
| `Free plan` / `Upgrade` in sidebar | **GAP T** — summary #5. Undesigned plan language is worse than none |
| Usage metering | **later** — meaningful only if hosted runner exists |

### Compliance & legal

| Item | Status |
|---|---|
| Scraping conduct posture (robots.txt, rate limits, PII, logins) | **GAP T** — summary #2. Research: robots.txt weighed as good-faith signal in rulings; EU AI Act 2026 disclosure duties; hiQ line still governs public data |
| ToS + privacy policy (hosted demo) | **GAP L** for hosted — it takes users' API keys; custody statement (§6b) exists, legal wrapper does not |
| Corpus provenance | **HAVE** — `corpus/manifest.json` records Wayback URL + timestamp + digest per capture. Say it louder in the conduct page |

### Security

| Item | Status |
|---|---|
| Key custody (presence-only display, env-first) | **HAVE-design** (§6b) |
| Webhook signing | **GAP T** (above) |
| SECURITY.md / disclosure contact | **GAP later, cheap** [convention] |
| Model injection posture | **HAVE-design** — AI-AND-AGENTS §1 + no-tool-accepts-a-value; ahead of convention |

### OSS hygiene

| Item | Status |
|---|---|
| LICENSE file | **GAP L** — package.json says MIT; **the file does not exist** (verified) |
| CONTRIBUTING, issue templates, CI on `npm test`, versioning | **GAP L** — none exist (no `.github/`) |
| CHANGELOG | **GAP L** — the product that diffs changelogs must keep one |

---

## What research surfaced that we hadn't considered

1. **The incumbent already persists fingerprints.** Scrapling's `auto_save=True`
   stores element fingerprints in local SQLite keyed by URL+identifier; `adaptive=True`
   re-scores against the store ([Scrapling docs](https://scrapling.readthedocs.io),
   via [ScrapingBee's teardown](https://www.scrapingbee.com), which also notes it
   "reduces maintenance, it doesn't eliminate it"). Our F8 argument against their
   `INSERT OR REPLACE` overwrite is real — but it is an argument about a store we
   have not built.

2. **Self-healing-via-MCP is a wave, this month.** [PyScrappy](https://github.com/mldsveda/PyScrappy)
   (Show HN 2026-08-16, 22 points: "adaptive selectors… plus an MCP server") and
   [scrapy-mcp-server](https://github.com/scrapoxy/scrapy-mcp-server) ("when websites
   change, your scrapers fix themselves") both shipped inside our research window;
   Apify exposes its whole store via MCP. Being *an* MCP scraper is table stakes;
   being the one whose server cannot be made to publish a lie is the pitch.

3. **Our Field Contracts are what the data-quality market calls "data contracts."**
   Bigeye is built around data SLAs; Soda ships "data contract SLAs" with
   Slack/PagerDuty alerting ([Bigeye](https://www.bigeye.com/blog/monte-carlo-vs-bigeye-an-in-depth-feature-comparison),
   [Atlan roundup](https://atlan.com/know/data-observability-tools/)). Adopting the
   term costs one line in FEATURES.md and buys discoverability in a category buyers
   already search for.

4. **The market is moving toward observing AI behavior.** Monte Carlo has
   repositioned as "Data + AI Observability" — monitoring model inputs, agent
   behavior, output drift. Our proof records for model-proposed heals
   (`decided_by: model`) are exactly that, already designed.

5. **External validation of the detect() thesis, quotable:** "alert on schema
   presence, not just a bare 200 status" — independent practitioner framing of our
   core claim ([BinaryBits / ExtractData Substack](https://extractdata.substack.com),
   via the last30days corpus). Also from that corpus: scrapers "fail quietly,
   returning empty arrays… storing garbage in your database."

6. **Politeness is also an anti-blocking strategy.** Publishers are rate-limiting and
   blocking AI crawlers at scale (Digiday via HN; PatronView blocking Amazon's
   crawler at 117K reads/day, r/webscraping). The conduct page (summary #2) is not
   only legal posture — declared cadence + skip-if-unchanged is what keeps a
   scraper unblocked.

### Sources actually read

- Cached `last30days` run 2026-08-20 (31 items: r/webscraping, HN, GitHub) —
  `~/Documents/Last30Days/self-healing-web-scrapers-and-scrapling-raw-v3.md`
- [Apify features overview](https://use-apify.com/docs/what-is-apify/apify-features) ·
  [Apify REST/API tutorial](https://use-apify.com/docs/apify-for-developers/apify-api-tutorial)
- [Bigeye vs Monte Carlo comparison](https://www.bigeye.com/blog/monte-carlo-vs-bigeye-an-in-depth-feature-comparison) ·
  [Atlan data-observability tools roundup](https://atlan.com/know/data-observability-tools/)
- [Browserless: is web scraping legal in 2026](https://www.browserless.io/blog/is-web-scraping-legal) ·
  [PromptCloud compliance guide](https://www.promptcloud.com/blog/is-web-scraping-legal/)
- Items marked **[convention]** rest on established practice (Stripe-style webhook
  signing, OSS repo hygiene, docs-first evaluation), not on a page read for this audit.

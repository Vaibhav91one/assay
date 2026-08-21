# Assay — build manifest

Self-healing scraper with a confidence gate.
Target: **Into the Scrape-Verse** hackathon (WeMakeDevs × Bright Data), Aug 17–23 2026.

> Planning document. **No code before Aug 17** per hackathon rules — planning, diagrams and notes are explicitly allowed.

---

## 0. Context

| | |
|---|---|
| Event | Into the Scrape-Verse, Aug 17–23 2026. Online, or in-person SF |
| Team | Solo or up to 4. Every member registers individually |
| Register | Google Form — https://forms.gle/sDXYyuaDTPwhWtca7 (no Devpost) |
| Submission form | Does not exist yet. Appears on the hackathon page before the deadline |
| Discord | https://discord.gg/wemakedevs — only channel for reminders + winner announcement |
| Prizes | **Web-Slinger** (grand, best Bright Data use): NVIDIA DGX Spark **or $5,000 cash** · **Suit-Up** (best UI): iPad per member · **Spider-Sense** (best clean code): Keychron per member |
| Also | $2,500 BD credits split across top teams · Iron Man MK5 helmet raffle (registration only) · $50 BD credits for everyone |
| Judging | Six criteria, **weighted equally**: potential impact · creativity & innovation · technical excellence · **use of Scraper Studio** · **reliability & self-healing** · presentation |
| Winners | Announced early September |

### Hard rules

- **Must create a custom Scraper Studio scraper.** Rule 5: using only an existing scraper from the Bright Data Scrapers Library **will not qualify**.
- Public data only — no login-protected, paywalled, personal, or restricted data.
- Coding starts Aug 17. Planning, diagrams, notes beforehand are fine.
- AI assistants allowed but **must be disclosed**; must be able to explain the code or be rejected.
- IP stays with the team.

### Required submission artifacts

1. Public repo
2. Clear README
3. **Example structured output**
4. Demo video (length unspecified; sibling event asks 3–5 min — assume ≤3)
5. Written explanation of how Scraper Studio was used

### Budget

| | |
|---|---|
| Free tier | 5,000 page loads/month, but capped at **3 published scrapers × 100 records each** |
| Credits | $50 per participant (email contact@wemakedevs.org to top up) |
| PAYG | $1.50 / 1K page loads. File downloads billed separately per GB |
| Note | `navigate()`, `request()`, `load_more()` each bill as page loads. Records ≠ page loads |

### Sibling event (separate entry)

**Zero Downtime Hackathon** — Aug 22, Bright Data office, 625 2nd St SF. https://luma.com/zero-downtime
Hosted by WeMakeDevs + Bright Data + Port.io + SigNoz. **Judged by engineers from Anthropic.**
Requires integrating Port + Scraper Studio + SigNoz. 3–5 min demo video. Same DGX Spark grand prize.

---

## 1. Thesis

**The trap:** Bright Data already ships self-healing (`bdata scraper heal`). The hackathon theme is the sponsor's own feature. Rebuilding it competes with their product and loses criterion 4. Merely wrapping it loses criteria 2, 3 and 5.

**The gap:** their heal is a manual verb a human types *after noticing* breakage. There is no detector in front of it and no verifier behind it. Nobody closed the loop, and nobody measures whether a heal was **correct**.

**The principle** (Erratum, arXiv 2106.04916):

> **A no-match is always preferred to a mismatch, since a no-match alerts the developer about failure.**

Measured mis-heal rates — healed onto the *wrong element*, silently, green build:

| Tool | Mutation dataset | Real-world (Wayback) |
|---|---|---|
| Erratum | 9.0% mismatch | 8.9% |
| WATER | **54.4% mismatch** | 35.3% |

For a scraper this asymmetry is worse than for a test: a healed-wrong extractor does not fail — it silently poisons the dataset.

**Build the thing that abstains. Measure the number the field refuses to measure.**

### The claim, stated so it survives a skeptic ⚠️

Two earlier framings were too broad. Verified 2026-08-20 (see §17b) — use these instead:

| Do **not** claim | Because | Claim instead |
|---|---|---|
| "Nobody measures wrong extraction" | Boilerplate extraction has reported a false-positive rate for 15 years — that *is* the precision column | **"Nothing compares an extracted *value* against a prior value or an expected shape at extraction time."** |
| "We're the only ones who abstain" | Autify ships a `Review Needed` verdict; `@ia-qa/self-healing` returns PASS/FIX/BLOCK; `playwright-eir` rejects heals on post-condition mismatch | **"No one publishes a calibrated abstention threshold derived from measurement."** |

Similo proposed the min-score mechanism and explicitly declined to pick a number — *"defining a suitable value for the threshold is non-trivial… warrants more research."* Erratum built abstention in without publishing a cutoff. Testim's 70% is a vendor constant with no methodology. **Deriving δ and τ against a real dataset with a measured mismatch rate is the contribution.** It is narrower than "we invented abstaining" and it is provable in a table.

Three supporting facts that are safe to state:

1. **Sixteen commercial vendors publish zero false-heal rates.** Verified across every doc and marketing page. What they publish instead: Functionize "99.95% accuracy" (restated as 99.9% on their own partner page); testRigor "99.5% less maintenance" (an effort claim in a `<title>` tag); Virtuoso "95% accuracy" — traceable to *"95% of Virtuoso's decision on healing was **accepted by our users**"*, an acceptance rate relabelled as accuracy.
2. **Every "success rate" here is `100 − false-heal` in disguise** for any algorithm without an abstain path — Similo, Healenium, COLOR and Scrapling all qualify.
3. **F1 ≈ 0.95, exact-match ≈ 0.30** across Zyte's article benchmark. Roughly 2 in 3 extractions carry wrong or missing content, silently, industry-wide.

### Why this scores

| Criterion | How |
|---|---|
| Scraper Studio use | Load-bearing at three points: the collector, the heal, the approve |
| Reliability & self-healing | The entire thesis, with a measurement |
| Creativity | Behavioural probing does not exist in the literature or in any product |
| Technical excellence | Published algorithms, correctly implemented, honestly benchmarked |
| Impact | Vertical makes silent data corruption consequential |
| Presentation | The abstain shot — restraint that reads as engineering |

---

## 2. Vertical

**Product recall / safety-notice monitoring.** **LOCKED.**

Manufacturer and regulator sites, all public, redesigned constantly. A silent scrape failure means a missed recall. A heal onto the wrong element means publishing a **wrong** recall.

This makes false-heal rate visceral instead of academic — judges feel it in one sentence with no explanation needed.

Research signal: Bright Data winners cluster hard in regulated / consequence verticals (vendor risk, sanctions, CVE monitoring, food safety, trade compliance) with provenance and citations. Consumer toys and "chat with the web" appear in **zero** winner lists.

---

## 2b. Target sites — the tiering

The site split matters more than the vertical. **Regulators are the truth source; manufacturers are the scrape target.**

| Tier | What | Role | Count |
|---|---|---|---|
| **Target** | Manufacturer newsrooms / recall & safety-notice pages | The actual scrape. No API. Custom layout each. Redesigned on their own schedule — this is where breaks happen | 3 |
| **Cross-check** | Regulator listings — CPSC, NHTSA, FSIS, EU Safety Gate | Independent second source for the *same* recall | 1 |
| **Controlled** | One manufacturer page forked, self-hosted, mutated by us | Deterministic demo breaks. Built Day 1, not before (rule 2) | 1 |

### Why this split, not "just scrape recalls"

**1. `second_extractor` becomes a real verifier.** In §11 that verifier was "check the JSON-LD" — weak, and dead on any page without JSON-LD. Under this split, a heal on a manufacturer page is checked against **a different organization's page about the same recall**. Strongest verification signal in the design, costs one extra fetch.

**2. It answers the obvious judge question.** "Why not just use the CPSC API?" — because manufacturer pages are where recalls appear first, have no API, and break. The regulator API is the *oracle*, not the source.

**3. The benchmark stops being synthetic.** Wayback has real redesigns of these manufacturer pages, which yields a gap-dependent accuracy curve (§12) instead of a mutation-only one.

### Scoping

Three manufacturers, one regulator, one clone. No more. Free tier is 3 published scrapers — the constraint is doing the scoping.

Selection criteria for the three manufacturers, in order:
1. Recall/safety page is public and unauthenticated
2. Has ≥ 8 Wayback captures spanning ≥ 12 months, with at least one visible redesign
3. Its recalls also appear in the chosen regulator's listing (otherwise the cross-check is dead)
4. Layouts differ from each other — one table-driven, one card/list, one prose-heavy

### LOCKED — verified against Wayback CDX, 2026-08-20

All capture counts are `collapse=timestamp:6` (monthly), `statuscode:200`, `mimetype:text/html`, 2024→2026. **"Distinct" = distinct content digests.** Every candidate below changes content every single month, which is exactly the churn the benchmark needs.

| Tier | Site | URL | Captures | Distinct | Range | Live |
|---|---|---|---|---|---|---|
| Target | **Mattel / Fisher-Price** | `service.mattel.com/us/recall.aspx` | 32 | 32 | 2024-01 → 2026-08 | 200 |
| Target | **IKEA US** | `ikea.com/us/en/customer-service/product-support/recalls/` | 31 | 31 | 2024-01 → 2026-08 | 200 |
| Target | **Chicco USA** | `chiccousa.com/child-safety/product-recalls/` | 14 | 14 | 2024-02 → 2026-06 | 200 |
| *Backup* | *Graco* | `recalls.gracobaby.com/` | 10 | 10 | 2024-02 → 2026-04 | — |
| ~~Oracle~~ | ~~CPSC~~ | ~~`saferproducts.gov`~~ | — | — | — | **BLOCKED BY RULE 7** |
| Oracle | **Detail pages** | per-recall pages on each target's own site | — | — | — | see below |

**Layout diversity (criterion 4) is satisfied:** Mattel is a legacy ASP.NET `.aspx` page; IKEA is a modern listing with per-recall **detail pages** (`…/snuttig-recall-pub56887b01/`); Chicco is a mid-tier ecommerce CMS. Three different generations of web stack.

Graco is the swap-in if one of the three fails on Day 1. It went stale after 2026-04 (likely a URL move), which is why it is not primary.

### ⚠️ RULE 7 KILLS THE CPSC ORACLE — verified 2026-08-20

Rule 7, verbatim from the official rules page:

> **"Scraping government websites is not allowed during this hackathon. Scraper Studio will not work on them, so pick a different target."**

CPSC is a government site. `saferproducts.gov` is a government API. The stated *reason* is technical (Scraper Studio can't reach them) and we would be calling a documented public JSON API rather than putting it through Scraper Studio — but the prohibition is written flatly, and disqualification is not a risk worth taking on a technicality.

**Decision: CPSC is out. Do not call it.** Mention the choice in the README — deliberately avoiding government sources per Rule 7 reads as rule-awareness, not as a gap.

**Replacement oracle: listing-page vs detail-page cross-check on the manufacturer's own site.**

IKEA publishes a listing card *and* a per-recall detail page (`…/snuttig-recall-pub56887b01/`). The same recall headline therefore exists in two independently-rendered places on two different templates. Extract both — `recall_title` from the listing and `title_on_detail` from the detail page — and compare.

| | CPSC oracle (dead) | Listing-vs-detail (live) |
|---|---|---|
| Independent of the target site | Yes | **No** — same site, different template |
| Independent of the *template* that broke | Yes | **Yes** — a listing redesign does not touch detail pages |
| Rule-safe | **No** | Yes |
| Extra fetch cost | 1 API call | 1 page per recall |

It is a genuinely weaker oracle and the README should say so. What it still catches is the case that matters most: a heal on the listing template that silently grabs the wrong card. Detail pages are rendered by different code and change on a different schedule, so agreement across them is real evidence.

Mattel and Chicco need checking for equivalent detail pages on Day 1. If a target has none, its cross-check degrades to intra-page anchors only, and that must be stated per-site in the results table rather than averaged away.

---

### (superseded) The oracle was going to be an API, not a scrape

**`cpsc.gov/Recalls` returns HTTP 403 even with a browser User-Agent** — it sits behind a WAF. Do not scrape it. CPSC publishes a free, unauthenticated REST API that returns exactly what the cross-check needs:

```
https://www.saferproducts.gov/RestWebServices/Recall?format=json&RecallDateStart=2026-07-01
→ [{"RecallID":10920,"RecallNumber":"26692","RecallDate":"2026-08-13T00:00:00",
    "Description":"This recall involves COMMOWNER-branded pressure washers…",
    "URL":"https://www.cpsc.gov/Recalls/2026/…"}, …]
```

This is **better** than the original §2b design, not a compromise. The `second_extractor` verifier now compares a healed manufacturer value against an authoritative government record rather than against another scrape that could itself be broken. The oracle cannot break in the same way the target can — which is the entire point of an independent check.

It also sharpens the pitch: *"the regulator has an API; the manufacturers, where recalls appear first, do not. That asymmetry is the problem."*

### Two things confirmed by doing this

**The regulator's 403 is itself a Bright Data argument.** Getting through a WAF is precisely what the platform is for — a legitimate, non-contrived use of Web Unlocker if we ever do want the HTML.

**The soft-fail-as-200 case appeared unprompted.** Querying the CDX endpoint returned an "Internet Archive: Temporarily Offline" HTML body under HTTP 200, twice, mid-selection. §7 category, encountered in our own toolchain, before writing a line of scraper. Worth one sentence in the demo.

---

## 3. Bright Data surface used

| Product / function | Role in Assay |
|---|---|
| **Scraper Studio collector** | The scraper. Custom-built (rule 5). Interaction code + parser code |
| `collect(obj, validate_fn)` | Throws on invalid — **the detector's trigger hook** |
| `detect_block()` · `dead_page()` · `bad_input()` | Failure attribution; sets `error_code`, controls retries |
| `redirect_history()` · `status_code()` · `response_headers()` | Soft-404, redirect and block detection |
| `parse()` + Cheerio `$` | Extraction + fingerprint capture |
| `country()` | Pin locale — prevents currency/language drift from proxy rotation |
| Code worker → Browser worker | Cheap default; escalate only for Tier-2 probes |
| `tag_response()` + `wait_for_parser_value()` | Capture XHR/JSON payloads where data moved client-side |
| **`bdata scraper heal`** | The repair. Diagnosis string becomes the prompt |
| **`bdata scraper approve` / `--reject`** | Gated on verification. Never `--auto-approve` |
| `POST /dca/crawl?collector=c_…&timeout=50s` | Sync path for live demo (**single-object** body) |
| `POST /dca/trigger` → `GET /dca/dataset?id=` | Batch path |
| Snapshot retention (batch 16d) | Free version history for incremental repair |
| `npx -p @brightdata/cli bdata` | No global install |

### API gotchas

- Trigger response field is `collection_id`; every other endpoint calls the same string `snapshot_id`. Same value, two names.
- Collector = `c_*` (definition, stable). Collection/snapshot = `j_*` (one run).
- Auth: `Authorization: Bearer $TOKEN` on every call.
- `/dca/crawl` body is a single object; `/dca/trigger` body is an array.
- **Scraper generation takes 5–25 minutes.** Pre-bake collector IDs; never generate on camera.
- The MCP server exposes **no** Scraper Studio tool — that's the `/dca/*` REST API, the SDKs or the CLI.

### Docs

- Overview — https://docs.brightdata.com/datasets/scraper-studio/overview
- Functions reference — https://docs.brightdata.com/datasets/scraper-studio/functions
- CLI build/heal loop — https://docs.brightdata.com/datasets/scraper-studio/build-with-the-cli
- Quickstart / REST — https://docs.brightdata.com/datasets/scraper-studio/quickstart
- Best practices — https://docs.brightdata.com/datasets/scraper-studio/best-practices
- Coding-agent prompts — https://docs.brightdata.com/datasets/scraper-studio/coding-agent-prompts
- Every docs page is fetchable as raw markdown by appending `.md`. Index: https://docs.brightdata.com/llms.txt

---

## 4. Architecture

```
Scraper Studio collector
  parser code emits fields + capture-time fingerprint
  collect(data, validate_fn)          <- BD's own hook IS the detector trigger
        |
        v
  CAPTURE    16 Similo props + semantic anchors + value locations
             + runners-up + invariants + golden HTML
        |
        v
  DETECT     schema throw · null-rate robust-z · record count
             · sentinels · anchor disagreement · distribution drift
        |
        v
  CONFIRM    wait proportional to evidence strength (0 to 3 runs)
        |
        v
  ATTRIBUTE  timeout / block / soft-404 / A-B / geo  -> retry, DO NOT HEAL
        |
        v
  RANK       Similo weighted sum over stored fingerprint (GA weights)
        |
        v
  GATE       margin > delta  AND  s1 > tau
        |
   +----+--------------------+--------------------------+
   |                         |                          |
 wide margin            thin margin                 s1 < tau
   |                         |                          |
  HEAL                    PROBE (sandboxed agent)   probe for absence
   |                         |                          |
   |                    resolved? -- no --> ABSTAIN     |
   |                         | yes                      |
   +-------------------------+--------------------------+
        |
        v
  HEAL       bdata scraper heal, diagnosis as prompt
        |
        v
  VERIFY     golden replay · value overlap · detector re-run
             · cross-field invariants · second extractor
        |
   pass |         | fail
        v         v
  APPROVE     ABSTAIN -> alert, degrade field, human review
```

FigJam board: https://www.figma.com/board/F9wIN2LXcA94hgBv7ZESil

---

## 5. Capture

Runs on every **fully-verified green** run. This is the highest-leverage component in the system.

**It is a one-way door.** Whatever is not captured on the last green run is gone forever once the site changes. Nothing downstream can reconstruct it. Over-capture now, prune after the benchmark says what earned its place.

### The reframe

Do not fingerprint an **element**. Fingerprint a **relationship**.

- ❌ `<span class="price">` at `/div[3]/div[2]/span[1]`
- ✅ the number immediately to the right of the text `Price:`
- ✅ the cell under the column header `Price`
- ✅ the element with role `heading` whose accessible name is the product title

Elements get rewritten every deploy. Relationships survive redesigns, because the relationship is what the site's *human users* depend on.

### What to capture

| Group | Items |
|---|---|
| **Similo properties (16)** | tag · id · name · type · class[] · aria-label · alt · href · visible_text · neighbor_texts · location · dimension · abs_xpath · id_rel_xpath |
| **Ancestor chain** | `{tag, id, index, classes, innerText}` root→node |
| **Semantic anchors** ⭐ | label text (nearest preceding, `<label for>`, `<dt>`/`<dd>`) · **ARIA role + accessible name** (W3C accname) · heading ancestry · table column/row **header text** (not index) · `data-testid` / `itemprop` / any `data-*` |
| **Value locations** ⭐ | every place the value appears: DOM · JSON-LD · microdata · OpenGraph · `<title>` · breadcrumb · meta description |
| **Locator ladder** | id-based · class-based · nth-child · text-based · role-based — 5 encodings, for voting |
| **Runners-up** ⭐ | top-N losing candidates + scores + values (*negative capture* — records the confusable set) |
| **Computed style** | font-size · font-weight · color · **normalized** quadrant (not absolute px) |
| **Neighbourhood** | sibling text array |
| **Record boundary** | list-item element stored separately from field-position-within-item |
| **Statistics** | min/max/median · cardinality · character-class · length distribution · learned format regex · volatility profile · null-rate baseline |
| **Cross-field invariants** ⭐ | `sale ≤ list` · `total = subtotal + shipping + tax` · `unit = total / qty` · `reviews ≥ 0` · `in_stock == false → price may be absent` |
| **Behaviour signature** | which probes this field responds to (populated once probes confirm) |
| **Page context** | skeleton hash (tags only, no text/attrs) · template cluster ID · **frozen golden HTML** (gzipped) · response headers · render mode · country used |
| **History** | last N fingerprints, not only the latest |

### Why the starred items matter

- **Semantic anchors** — ARIA role + accessible name survives three wrapper divs, a class rename and a sibling reorder. Most stable locator primitive that exists. `data-testid` is kept stable *deliberately* by developers.
- **Value locations** — the same value usually appears in 5+ places. When the DOM breaks, JSON-LD usually doesn't (different code path, different release cadence). Free redundancy **and** free ground truth for relocation.
- **Runners-up** — "the shipping-cost element looked like *this*" is as useful as "the price element looked like *this*". Pre-solves §7 ambiguity at capture time. You compute them anyway; just persist them.
- **Cross-field invariants** — highest value-per-line in the whole system. Heal the price, re-run the invariant: if `sale > list`, you healed wrong. Proven instantly, zero extra fetches.

### The payoff beyond repair: early warning

Evaluate **all** anchors on **every** run, not just the primary:

| Result | Meaning |
|---|---|
| All anchors agree | Healthy — free verification on every page |
| **Some anchors disagree** | **The site is changing right now, before anything has broken** |
| All fail | Real break |

The middle row solves gradual rollout (§9 H) — the failure where 5% of pages get the new layout, null-rate creeps too slowly to trip a z-score, and one Tuesday everything is broken at once. With multi-anchor you see it at 5%, because on those pages the XPath anchor and the label anchor stop agreeing while both still return something.

This turns breakage detection into **drift** detection.

### Discipline

**Capture only from runs that passed every validator.** Fingerprinting a run that failed anything poisons the baseline permanently — this is the cold-start trap, and Healenium's cold-start rethrow exists for exactly this reason.

Keeping the **last N** fingerprints instead of only the latest enables incremental (WATERFALL-style) repair across small version deltas rather than one big jump: **+209% correct repairs** for essentially no extra code, only extra storage. One line. Do it.

**Never overwrite a fingerprint with the result of a heal that has not passed every verifier.** Scrapling does exactly this — `auto_save=True` writes a relocated element back over the stored fingerprint with `INSERT OR REPLACE`, no history, no rollback — so one wrong match becomes the new ground truth and every subsequent relocation drifts from there. That is §7's compounding-failure case, shipped, in a 75K-star package. Append, never replace.

### The geometry problem — decide on Day 1

Three Similo properties (`position`, `dimensions`, and anything derived from layout) require `getBoundingClientRect`. **Cheerio has no layout engine.** Scraper Studio's Code worker parses a static DOM, so those three properties cannot be captured there at all.

| Option | Cost |
|---|---|
| **Drop them** (recommended) | Lose 1.5 of ~14 weight units. Gains a stronger claim: *"no visual features, and here is the accuracy anyway"* |
| Force a Browser worker on the capture pass | Real geometry, but a dependency to justify and a slower, costlier capture |

Decide before writing the capture schema. Discovering this on Day 5 means rewriting both ends.

### Schema sketch

```json
{
  "field": "price",
  "value": "49.99",
  "value_locations": ["dom", "jsonld:offers.price", "og:price:amount", "title"],
  "anchors": {
    "role":    {"role": "text", "name": "Price"},
    "label":   {"text": "Price:", "relation": "next-sibling-text"},
    "table":   {"col_header": "Price", "row_header": "Wireless Mouse"},
    "heading": ["Product details", "Pricing"],
    "css":     "span.price-now",
    "xpath":   "//div[3]/span[1]",
    "testid":  "product-price"
  },
  "similo":  { "…16 properties…" },
  "style":   {"font_size": 28, "font_weight": 700, "quadrant": "top-right"},
  "siblings": ["Add to cart", "In stock", "Free shipping"],
  "runners_up": [
    {"selector": "span.price-was", "score": 8.9, "value": "69.99"},
    {"selector": "span.ship",      "score": 7.2, "value": "4.99"}
  ],
  "stats": {"median": 34.5, "cardinality": 0.94,
            "regex": "^\\$\\d+\\.\\d{2}$", "volatility": "weekly"},
  "invariants": ["sale <= list", "price > 0"],
  "behavior":   {"variant": true, "quantity": false, "coupon": true},
  "page": {"skeleton_hash": "a3f…", "template": "pdp_v2", "golden": "…"}
}
```

A few KB per field. The page is already in hand — capture is nearly free. Not capturing is free today and makes repair impossible tomorrow. Asymmetric bet; take it.

---

## 6. Detect

| Signal | Method | Catches |
|---|---|---|
| Schema throw | `collect(validate_fn)` | Hard breaks. Free |
| Null-rate | robust-z `0.6745·(x−median)/MAD`, fire at >3.5 | Field vanished. MAD not stdev — one bad run must not move the baseline |
| Record count | Same test on rows-per-page | List selector matched nothing |
| **Record-count-per-input** | Separate detector | **Pagination break — 90% silent data loss, 100% of it valid** |
| Sentinel fields | 2–3 always-present fields (title, canonical URL) | Free canary; breaks first, breaks loudly |
| **Anchor disagreement** ⭐ | All anchors evaluated every run | **Gradual rollout, before nulls appear** |
| Placeholder blacklist | `"" 0 N/A — null undefined TBD` treated as null | Field breaks to a plausible non-null value |
| Stale value | Volatile field byte-identical N runs running | Cached/frozen value |
| **Distribution drift** | Median shift · character class · length distribution | **Currency, units, date format, language — locator still works** |
| Skeleton hash | Tags-only page hash | Global layout tripwire |

Output is a **diagnosis string**, not a boolean — e.g. *"price null in 94% of rows since run 41; title unaffected; skeleton hash changed"*. That string becomes the heal prompt.

### Two implementation notes that defeat the alarm if missed

**Robust-z divides by zero on a healthy field.** A field sitting at exactly 0% nulls on every run — the *common* case — gives MAD 0. The naive guard `return 0.0 if mad == 0` then scores a jump from 0% to 90% nulls as perfectly normal, which is precisely the alert this exists for. Correct test:

```python
spike = z > 3.5 or (mad == 0 and x != med)   # zero-variance history: any deviation is news
```

**Run `expected_pattern` on the detect path, not only the heal path.** This is the single clearest gap in the closest prior art. Anansi (`mdowis/anansi`) stores a per-field regex — `r"\$[\d,.]+"` for price — and its own comment says `# regex hint for healing text-match`. It is consulted only while repairing. So when `.prod-price` still resolves but now holds the shipping cost, Anansi returns it without ever checking it looks like a price.

The validation signal is already captured (§5 `stats.regex`). Wiring it to detection costs nothing and catches the entire "locator works, value is wrong" class — §7 category D — which is the case every competitor misses because their healing only fires on a **zero-result** selector. Scrapling, Stagehand and Skyvern all share this blind spot: relocation is triggered by an exception or an empty match, so a selector that resolves to the *wrong* element is never examined.

---

## 7. Page-change taxonomy

Four verdicts: **HEAL** · **ABSTAIN** · **NO-TRIGGER** (not a break) · **ALARM** (locator fine, data wrong).

### A. Cosmetic — the easy ~60% → HEAL

Class renamed (incl. hashed CSS `.price` → `.css-1x7g2h`, regenerated every deploy) · id removed/changed · wrapper `<div>` inserted or removed · tag swapped for styled equivalent (`<button>` → `<div role="button">`) · inline style / attribute order / whitespace · framework rewrite with same visible text.

Text survives all of these — hence visible_text weight 2.7 and abs_xpath 0.3.

### B. Structural — healable, margin narrows

| Case | Note |
|---|---|
| Siblings reordered | Location signal inverts; text carries it |
| Field moved to a different page section | Ancestor-chain LCS collapses; score may fall below τ |
| Moved into `<details>` / accordion | Present but zero-dimension; location comparator misfires |
| **Moved into shadow DOM** | Invisible to Cheerio — reads as *removed* |
| **Moved into an iframe** | Same — different document |
| Moved from server HTML into client-side fetch | Code worker sees nothing; needs browser worker |
| Moved into `__NEXT_DATA__` / JSON-LD blob | Data got *easier*, but no DOM element to match |
| `<table>` → CSS grid, `<ul>` → `<table>` | Depth change; LCS gate can hard-zero every candidate |
| Pagination: numbered → infinite scroll → load-more | Crawl break, not field break (see J) |

Shadow DOM and iframes are the nastiest — they present as *existence* changes, and existence changes are where healers do the most damage.

### C. Identity ambiguity — MUST ABSTAIN

The dangerous class: a candidate exists, scores well, and is the wrong thing.

List vs sale vs member vs "was" price · shipping / tax / subtotal / total, all money-shaped and adjacent · unit price vs pack price · multiple currencies at once · field **split** in two · two fields **merged** · identical sibling rows (row 3 vs row 7) · repeated cards in a grid · virtualized list with 10 of 500 in DOM · the same value in 3 places (breadcrumb, title, meta) · a *new* field that resembles the old target more than the real one does.

**This is the entire justification for the margin gate.** Healenium weights sibling index at exactly `0.0` — it structurally cannot tell row 3 from row 7. Similo's published false-heal was a **0.09 margin on a 15.0 scale**: target "Home & Garden", it chose "Home Improvement" (3.21) over "Home" (3.12), because Levenshtein rated it closer. High score, no margin, confidently wrong.

### D. Semantic drift — ALARM. Locator still works, data is wrong.

Currency USD → EUR (proxy country rotated — *your own infrastructure caused it*) · decimal convention `1,299.00` → `1.299,00` · units lbs→kg, in→cm · date `MM/DD` → `DD/MM` (parses fine, wrong by up to 11 months) · label unchanged but meaning changed ("Price" now = monthly financing payment) · rating scale 5-star → 100-point · site localised by IP · `"In stock"` → `"In stock at select stores"` · timezone shift · rounding change.

Detected only by **value-distribution drift**, never by null-rate. Route to human. **Healing cannot fix this and will hide it.**

### E. Existence — MUST NOT HEAL

| Case | Right behaviour |
|---|---|
| Field genuinely removed | Accept null, update schema |
| **Conditionally absent** (sale price when no sale) | Absence is **correct** — do not even alarm |
| Product discontinued, 200 + "no longer available" | `dead_page()` |
| Hard 404 | `dead_page()` |
| Redirect to category/home | `redirect_history()` — page 200, wrong page |
| URL scheme changed | Crawl-level, not field-level |
| Full redesign, field never existed | Abstain, escalate |

**Absence must be provable before it is healed.** If the field is gone, `s₁ > τ` must fail. τ too low ⇒ every removal becomes a mis-heal. This is what τ is for; the margin gate alone will not catch it.

### F. Not-a-break — NO-TRIGGER

Timeout · scraped pre-hydration · lazy-loaded below fold, never scrolled · stale CDN cache · **A/B test variant** (alternates between runs → heal, un-heal, ping-pong) · geo layout variation from proxy rotation · cookie-consent wall · rate-limited degraded page · **CAPTCHA / block page** (has a *consistent DOM* — a healer will cheerfully heal onto captcha elements) · **bot-detection honeypot serving fake data** (looks valid — worst case here) · 200-status error or maintenance page · mobile UA served mobile layout.

`detect_block()` and `dead_page()` cover part of this. A/B needs explicit memory: **never heal a field that healed and un-healed recently.**

### G. Adversarial — abstain and log

Class names randomised **per request** (not per deploy) · honeypot fields with fake prices hidden from humans · real value in CSS `::before`, canvas, SVG or image · price split across spans reordered by CSS `order` · custom font remapping digits (visually 4, in DOM 7) · closed shadow root · per-request DOM shuffle.

Healing thrashes here. **Heal frequency is the tell** — a field healing more than twice a week is not broken; the site is hostile. Alarm on heal rate, not only on breaks.

### H. Detector-blind — breaks the smoke alarm, not the locator

These matter most, because you never find out.

| Case | Why it slips | Fix |
|---|---|---|
| **Gradual rollout** 5% → 20% → 100% | Null-rate rises too slowly to trip a z-score, then everything breaks at once | Monitor **fraction of pages affected**, not aggregate null-rate. Anchor disagreement catches it at 5% |
| Partial break — 3 of 12 fields | Record count normal, schema passes | Per-field detection |
| Breaks to a plausible value: `""`, `0`, `N/A`, `—` | Not null | Placeholder blacklist |
| Breaks to the **stale previous value** | Looks perfect | Volatility profile + stale-value check |
| Cold start on an already-broken page | Baseline *is* the break | Refuse to fingerprint any run that failed a validator |
| Black Friday — all prices legitimately drop 40% | Distribution detector screams, nothing is wrong | Human confirm on distribution-only alarms |
| Catalog genuinely shrank / pagination added | Real, not a break | Record-count-per-input |

### I. Compounding — the failure that eats the system

Heal lands *slightly* wrong → next run re-fingerprints from the wrong element → drift compounds (Autify's rolling-baseline failure) · A/B flip-flop → heal, un-heal, repeat · heal fixes field X and breaks field Y sharing an ancestor · heal correct for template X, wrong for template Y · **verification passes vacuously** because the golden snapshot was regenerated from the broken run.

Two rules kill most of it:

1. Fingerprint only from runs that passed **all** verifiers.
2. **Goldens are frozen at first green run and never auto-regenerated. Ever.**

Rule 2 is exactly WATER's published failure — it accepted a repair because "the test passed", where the repair was *negating an assertion* that was catching a real business-logic bug.

### J. Crawl-level — field logic fine, you get nothing

Listing structure changed → detail URLs never discovered (zero records, detail scraper perfectly healthy) · **pagination selector broke → only page 1 scraped: 90% silent data loss, every row valid** · sitemap moved · `next_stage()` fan-out broken · product ID moved → dedup key changed.

Record-count-per-input is a **separate** detector from null-rate. Do not collapse them.

---

## 8. Rank

Similo weighted sum: `score(c) = Σ wₚ · simₚ(targetₚ, cₚ)`, Σw ≈ 21.

**GA-optimised weights** (Kluge & Stocco, EMSE 2026 — *not* the paper's hand-tuned 1.5/0.5):

```
visible_text 2.7   name        2.3   aria-label 2.0   type      1.9
neighbor_text 1.9  location    1.7   id         1.6   tag       1.5
href         1.5   alt         1.2   dimension  1.1   class     0.9
id_xpath     0.8   abs_xpath   0.3
```

Visible text pins near maximum on every benchmark. Absolute XPath is nearly worthless — and it is the property every naive healer leans on, which is why they break on a single wrapper div.

**Comparators**

| Property | Comparator |
|---|---|
| visible_text, name, id, alt, href | Normalised Levenshtein — **GLD NED₂** (Yujian & Bo, TPAMI 2007) |
| class[] | Jaccard |
| neighbor_texts | Fraction of shared words (**not** Levenshtein) |
| location | Euclidean between upper-left corners; 1 at 0px, 0 beyond 100px, linear |
| tag, type | Exact |

~3 ms/element. Deterministic, no model call.

**Use `rapidfuzz`, not `difflib`.** Two reasons, and the second decides it:

1. Benchmarked at **0.49 µs/pair vs difflib's 17.81 µs** — 36×.
2. **`difflib.SequenceMatcher` is not Levenshtein.** It is Ratcliff/Obershelp gestalt matching: longest contiguous block, then recurse. On `"Add to cart"` vs `"Add to basket"` it returns 0.75; true NED is 0.6923. Weights tuned against one do not transfer to the other.

That second point is not academic. It is the mechanism behind Scrapling's observed false heal: `"$19.99"` vs `"$4.99"` share the contiguous run `.99`, and Ratcliff/Obershelp rewards shared substrings in a way edit distance does not. The result is a matcher biased toward **elements whose value did not change** — exactly backwards for the volatile fields anyone actually scrapes.

Avoid `python-Levenshtein` / `Levenshtein` despite its speed: **GPL-2.0-or-later**, and it is a thin wrapper over rapidfuzz's own C++ core by the same author. Copyleft for zero gain.

### Absent-on-both must score nothing ⭐

**Never award points for a property that is missing from both the fingerprint and the candidate.** Skip it and renormalise over the properties that actually carry signal:

```python
if a is None and b is None: continue   # do not add to numerator OR denominator
```

This is the clearest published mechanism for *confident* wrong heals, and it was found independently in two different codebases:

- **Healenium** gives free points on absent features — `else { score += POINTS_FOR_CLASS; }` (+40) and `else { score += POINTS_FOR_OTHER_ATTRIBUTE; }` (+30). A bare `<div>` with no classes and no attributes collects **70/350 = 20% of the maximum score for having no distinguishing features at all**, before a tag match adds 100 more. Against a `score-cap` of `.6`, featureless elements are structurally inflated toward the cut.
- **Scrapling** has the same defect in a different shape: its denominator `checks` is incremented only when the *original* has a feature, so scores are computed on different scales per element and **are not comparable between selectors**. A 60% for one field is not a 60% for another.

The second point is why publishing a single global δ and τ (§12) is a real contribution rather than a tuning detail — it requires a comparable scale, which neither incumbent has.

**Plus: locator-ladder voting** over the 5 stored encodings — published **12% → 8% breakage, −29.5%**, at 2.8–3.8% wall-clock overhead. Uniform weights already beat the best single generator.

### Reference numbers

| Approach | Broken-locator failure rate |
|---|---|
| Absolute XPath | 78–79% |
| Relative id-based | 50–59% |
| Selenium IDE | 22–47% |
| ROBULA+ | 8% (1,110 targets) / 35% (12–60-month gaps) |
| **Similo** | **12%** |
| Similo, 4-month gaps (M5) | 95.8% correct |
| Similo++ / HybridSimilo, 4-month gaps | 98.8% correct |
| HybridSimilo, 1–5-year gaps | 86.8% correct |

Accuracy is strongly gap-dependent: ~98.8% at 4 months, ~86.8% at 1–5 years. Frequent scraping is itself a robustness strategy.

---

## 9. Gate ⭐

The core of the project.

```
margin = (s₁ − s₂) / Σw

if   margin > δ                        -> HEAL
elif tied candidates agree on value    -> HEAL          (benign tie)
elif s₁ < τ                            -> probe for absence
else                                   -> PROBE
```

- **`s₁ > τ`** — the best candidate is actually good enough. Without it you heal onto garbage when the field was simply *removed*.
- **`margin > δ`** — the winner is *distinguishably* better than the runner-up. **Nobody ships this.**

Score alone cannot see a photo finish. Margin can.

### Benign ties

If two candidates tie **and produce the same value** — a price shown in both the sticky header and the main block — the ambiguity is harmless. Pick either. Only **value-disagreeing** ties are dangerous. Three lines; recovers a meaningful slice of abstains before any probe runs.

### Thresholds

δ and τ are calibrated on the mutation benchmark (§12), never guessed. **Publishing validated values is literally the open problem** — Similo's TOSEM §6 proposes the mechanism and explicitly declines to specify a number; Scrapling has none; Healenium's `score-cap = .6` is the only number in the field and it ships alongside a human-ratification button precisely because it is not sufficient.

---

## 10. Probe — sandboxed agent

Fires **only** on thin margin. The ~60% of breaks with a wide margin never pay for it.

### Why it exists

Static similarity answers *"what looks like what used to be here?"* — it fails on §7 C ambiguity.
Behavioural probing answers *"what does the job that used to be done?"* — it fails on pages with no lever to pull.

They fail on **different inputs**, so they compose. Similarity generates the shortlist; probing disambiguates it. This upgrades the gate from two-way to three-way: the abstain case becomes a *probe trigger* rather than a dead end.

No published approach touches the page to find out what an element *is*. This is the criterion-2 score.

### Tier 1 — read-only, no interaction, no side effects

| Probe | Logic | Kills |
|---|---|---|
| **Cross-URL differential** | Fetch 3 different products; the real price *differs* across them. A field identical on all 3 is boilerplate | Boilerplate, honeypots, static decoys |
| **Historical correlation** ⭐ | Across 20 products scraped yesterday, the true field's values correlate with yesterday's. Wrong field → no correlation | Most §7 C ambiguity — **free supervised signal from your own history** |
| **Rank correlation** | Spearman ρ: expensive-yesterday is expensive-today | Flat fields like shipping |
| **Distribution signature** | Price = high-cardinality, near-continuous. Shipping = 3 values. Stock = 2 values | Categorical/continuous confusion |
| **Structured-data agreement** | JSON-LD `offers.price`, microdata, `__NEXT_DATA__` | Everything, when present. Free |

### Tier 2 — navigation only, no state written

| Probe | Separates |
|---|---|
| **Sort listing by price** ⭐ | The field that becomes monotonic **is** the price field. One click, zero risk, visually obvious on camera — **demo pick** |
| Variant switch | Price vs shipping vs name |
| Variant with **known** price | Gives a predicted value, not just "it changed" — much stronger |
| Quantity change | Unit vs total vs subtotal |
| Coupon | Sale vs list |
| Filter by price range | Surviving cards' field must fall in range — proof by construction |
| Currency toggle | Confirms currency drift (§7 D) |

### Orthogonality

Coupled fields are the real limit: switch variant and sale price, list price, total and "you save $X" all change together — they are causally coupled to the same input. One probe cannot separate them.

Each probe must vary a **different** input, producing a multi-bit signature:

| Probe | Sale | List | Total | Shipping |
|---|---|---|---|---|
| Variant switch | ✓ | ✓ | ✓ | ✗ |
| **Quantity change** | ✗ | ✗ | **✓** | ✗ |
| **Apply coupon** | **✓** | ✗ | ✓ | ✗ |
| Change ship-to | ✗ | ✗ | ✓ | **✓** |

The question is not "did it change" but "which *pattern* of changes does it show" — and that is identifying.

**Rule: the probe that proposes cannot be the probe that verifies.** Propose with variant-switch, verify with quantity-change. Same probe for both is circular — exactly WATER's mistake.

### Sandbox spec

- Separate collector, separate zone — not the production one
- **Cannot call `collect()`** — physically unable to write the dataset
- **Cannot call `approve`** — proposes only
- Domain allowlist = the one domain that broke
- Page-load budget per repair (~20); exceed → hard fail → abstain
- Wall-clock cap
- No cookies or credentials inherited from the main scraper
- **Every action logged**: URL, action, before/after values, per step

That last point is the judging win: the heal arrives as a diff **plus the transcript of the experiment that justified it**. Provenance on the *repair itself* — nobody has this, and provenance is the most consistent trait among Bright Data winners.

### Honest failure modes (state these in the README)

No affordance (single product, no variants/sort/quantity) · probe re-renders and re-hashes the page · A/B non-determinism → require 2 consistent runs · probe cost (bound it: once **per site per break**, never per page — repair-time cost, not runtime cost) · adversarial honeypot that also responds to variant switch · coupled fields · the agent is the largest attack surface in the system if unsandboxed.

### Free training data

Every successful probe yields a **proven** label: *this element is the price, demonstrated behaviourally*. Store it as the new fingerprint — strictly better than the passive one, because it is verified rather than assumed. The system gets more confident with each break instead of drifting.

### Excluded

- **Add-to-cart** — strongest possible signal, but mutates server state. Gray zone against "public data only". Not needed to win. Off by default, behind a flag, disclosed if ever used.
- **LLM reranker** — deterministic probes are cheaper, faster, explainable. Research shows the LLM *loses* 10 cases the deterministic scorer wins, at 67× latency.

---

## 11. Heal & verify

### Heal

```bash
bdata scraper heal c_xxx "price returns null since layout change;
  candidate matched span.price-now, prior div.product-price" --url <url>
```

Returns a diff + `preview_result`. Collector ID unchanged, so nothing downstream breaks while verifying. **Never `--auto-approve`.**

Do not regenerate the selector yourself — their AI is better at it, and delegating is criterion 4.

### Verify — all checks must pass

| Check | What it proves |
|---|---|
| **Golden replay** | Repaired selector still extracts the correct *old* values from the *frozen old* HTML. If it cannot, it found a different field. Strongest single check |
| **Value overlap** | New extraction vs last-known-good, per-field tolerance. Prices shift; product names do not |
| **Detector re-run** | Run §6 against the candidate output; still-anomalous null-rate means the heal failed |
| **Cross-field invariants** | `sale > list` after healing price = proven wrong heal, zero extra fetches |
| **Second extractor, always on** | JSON-LD / alternate strategy on *every* page, not only on failure. Alarm on disagreement. This is VISTA's mis-selection cross-check — caught **17/18** direct mis-selections where WATER caught **0/18** |
| **Heal-history memory** | Never heal what recently un-healed (A/B ping-pong) |
| **Heal-frequency alarm** | >2/week ⇒ hostile site, not broken field |

All pass → `bdata scraper approve`. Any fail → reject, escalate to human, field stays degraded.

**Never heal a validation rule, only a locator.** Healing an assertion is exactly how self-healing manufactures false passes.

### Confirm before acting

Never act on a single bad run — but the wait is proportional to how certain the evidence is, not a fixed window.

| Evidence | Confirmation |
|---|---|
| Anchor disagreement **and** skeleton hash changed | **Act immediately.** Structural change is proven; waiting only loses data |
| Field null, all anchors dead, page otherwise healthy | 2 consecutive runs |
| Null-rate z-spike only | 2–3 runs — could be a slow page or a partial rollout |
| Value alternates between runs (suspected A/B) | **Never auto-heal.** Both variants are real |

### Modes

Everything from detect through verify is automatic in both modes. The mode governs **approval only**.

```
mode: tiered   ->  auto-approve wide-margin heals; everything else queues for a human
mode: auto     ->  auto-approve anything that passes all five verifiers
```

**Full auto is unattended, not unguarded.** Same gate, same probes, same verification. A failed verifier or an inconclusive probe abstains in *both* modes. Nothing can silently substitute a selector in either.

| Situation | tiered | auto |
|---|---|---|
| All 5 verifiers pass, wide margin, no recent heal on this field | auto-approve | auto-approve |
| All 5 pass, margin was thin, probe resolved it | queue for human | auto-approve, flagged for review |
| Any verifier fails · probe inconclusive · field healed recently | **abstain** | **abstain** |

The asymmetry is deliberate: auto-approval is permitted only where the proof is strongest. Everything doubtful queues or stops.

Thresholds set the autonomy. As the benchmark (§12) measures false-heal rate per margin band, the system earns the right to act unattended band by band, from data rather than from optimism.

### Degraded state

"Degraded" is a specific state, not a synonym for broken:

- Stop publishing **that field**
- Keep publishing every other field on the page
- Keep the last-known-good selector — **substitute nothing**
- Alert with diagnosis, candidate scores and probe transcript

The scraper stays useful. One field goes dark loudly instead of the whole dataset going quietly wrong.

### Artifacts — run log and proof record

**Run log** — every run, one line per field, cheap:

```json
{"run": 47, "field": "price", "status": "ok",
 "anchors_agree": 5, "value": "49.99", "ms": 12}
```

**Proof record** — emitted on every heal or abstain event. This is the deliverable:

```json
{
  "event": "heal",
  "run": 48,
  "collector": "c_mpohus372o5tmid1jk",
  "field": "price",
  "mode": "tiered",

  "before": {
    "run": 47,
    "value": "49.99",
    "selector": "span.price-now",
    "anchors_agreeing": ["css", "label", "role", "jsonld", "title"]
  },
  "after": {
    "value": "49.99",
    "selector": "span.pdp-price__value",
    "anchors_agreeing": ["css", "label", "role", "jsonld", "title"]
  },

  "diagnosis": "css anchor null since run 48; 4 other anchors still resolve to 49.99; skeleton hash changed",
  "attributed_cause": "selector_break",

  "candidates": [
    {"selector": "span.pdp-price__value", "score": 18.4, "value": "49.99"},
    {"selector": "span.pdp-price__was",   "score": 11.2, "value": "69.99"}
  ],
  "margin": 0.34,
  "thresholds": {"delta": 0.08, "tau": 12.0},

  "probes": [],

  "verifiers": {
    "golden_replay":    {"pass": true, "detail": "extracted 49.99 from run-1 frozen HTML"},
    "value_overlap":    {"pass": true, "detail": "identical to last-known-good"},
    "detector_rerun":   {"pass": true, "detail": "null-rate back to baseline"},
    "invariants":       {"pass": true, "detail": "sale 49.99 <= list 69.99"},
    "second_extractor": {"pass": true, "detail": "jsonld offers.price agrees"}
  },

  "decision": "auto_approved",
  "reason": "all verifiers passed, margin 0.34 above delta 0.08",
  "approved_by": "assay",
  "golden_sha256": "a3f2…"
}
```

Abstain records use the same shape: `"decision": "abstain"`, the failing verifier named, the probe transcript included, and `after` is `null` because nothing was substituted.

**Why one file earns three things:**

1. It **is** the required *example structured output* for submission.
2. It is the provenance story — proof on the *repair itself*, which no product or paper ships.
3. It is the UI's data layer. Every panel renders from this JSON; no second store.

`golden_sha256` is the cheap provenance line: a hash of the frozen HTML the replay ran against, so the proof is checkable rather than merely claimed.

One JSON object per event, appended to a `.jsonl`. No database.

---

## 12. Benchmark — the deliverable

False-heal rate cannot be measured on live sites because the right answer is unknown. So construct ground truth: mutate real pages, and you know exactly which element *should* have been found.

**Mutations:** rename class · insert wrapper div · swap tag · reorder siblings · strip id · rewrite `data-*` · translate visible text · **remove field entirely** · **duplicate a similar field**.

The last two are the important ones — they test τ and δ respectively.

| Arm | Healed | **False-healed** | Abstained |
|---|---|---|---|
| Naive (first unique match) | most | high | 0 |
| Scrapling `adaptive=True` (real baseline) | most | measure it | **0 by construction** |
| Similo, no gate | most | ~13% (see M5 below) | 0 |
| **Margin gate** | fewer | **~0** | some |
| **Margin + probe** | **most** | **~0** | few |

Sweep δ and τ across the set, find the knee, **publish the thresholds**.

Row 4 shows a deliberate trade with a receipt. Row 5 shows the probe recovers the heal rate **without** buying false heals back — a strictly dominant curve, and the single most persuasive artifact you can put on screen.

### Metric definition — decide this before the first run

**Report exact match on the broken subset (M5). Never report M1.**

Similo's own M1 metric **counts a direct parent or child of the target as a match**. Exact match (M4) does not. M5 is exact match restricted to locators that actually broke. Kluge & Stocco (EMSE 2026), 809 pairs / 510 broken:

| Algorithm | M1 (Similo's) | M4 (exact) | **M5 (exact, broken-only)** |
|---|---|---|---|
| Similo | 88.9% | 86.6% | **79.6%** |
| VON Similo | 89.2% | 77.5% | **69.2%** |
| HybridSimilo (LLM) | 94.7% | 91.7% | **86.8%** |

VON Similo loses **11.7 points** from M1 to M4. That gap is "healed to a neighbour of the right element." State the metric definition in the README and say why — the gap is the size of the lie a permissive metric tells.

**Corollary worth putting on a slide:** Similo never abstains, so its failure rate *is* a mismatch rate. Same for Healenium, COLOR, and Scrapling. Every "success rate" in this literature is `100 − false-heal` in disguise for any algorithm without an abstain path.

### Fork the methodology, don't invent it

**`scrapinghub/product-extraction-benchmark`** — archived, MIT, 140 pages / 62 domains. It enforces *"at most one predicted value is allowed"* per attribute, which makes precision exactly **"when it answered, how often was it right."** Derived from its published tables: Zyte ~8% of returned prices wrong, Diffbot ~16%, extruct ~14%. The metric is already there and unnamed — name it, extend it to permit an explicit null, and slice by confidence.

Its own error analysis describes our failure mode verbatim and never counts it:

> the price in the main product is empty, but the system is erroneously picking up a price from a related product, while it should be producing an empty price instead

**What no public benchmark provides together:** a prediction set that permits an explicit null, *and* precision-conditional-on-answering sliced by confidence, so you can plot a risk-coverage curve. That combination is the contribution.

### Datasets — evaluate before building

| Dataset | Shape | Verdict |
|---|---|---|
| **Similo / VON Similo pair benchmarks** (`michelnass/Similo2`, live) | 809 / 441 / 803 element **pairs** with ground truth, Wayback-sourced, 12–60 month gaps | **Right shape. Primary.** |
| **ReproBreak** (arXiv 2605.12158, `rub-sq/ReproBreak`, MIT) | 449 reproducible **real** breaks from real commits, each verified to fail-then-pass | Locator code only, **no DOM snapshots**. Spend 30 min on Day 1 checking whether the Docker repro can dump DOM at the break point. **Nobody has run any healer against it** — if it works, that's a first |
| **Erratum mutation generator** | 49,305 cases, perfect ground truth, mutation ratio is a controllable variable | Best source of a calibration curve for δ and τ |
| **Zyte product-extraction-benchmark** | 140 pages, MIT, archived | Fork the *methodology* (above), not the corpus |

### Two traps that would silently poison the numbers

**1. Wayback needs the `id_` suffix.**
```
https://web.archive.org/web/20240101000000id_/http://example.com/
                                            ^^^
```
Without it, IA serves **rewritten** HTML with injected banner markup and JS. That corrupts every skeleton hash and every fingerprint computed from a capture, and it fails quietly — plausible-looking wrong numbers across the whole real-redesign arm.

**2. IA returns soft failures as HTTP 200.** The CDX endpoint serves an "Internet Archive: Temporarily Offline" HTML page with a 200 status. `raise_for_status()` sails past it and the JSON parse dies somewhere unrelated. This is our own §7 taxonomy, encountered in our own toolchain. Use the `wayback` package rather than hand-rolling — it has the rate-limit and retry handling.

### Honesty constraint on citing anyone else's numbers

**Every benchmark in this field is self-interested.** WCXB is run by the author of its #1 system; WebMainBench by the vendor of its #3; trafilatura's table by trafilatura's maintainer on his own corpus; Zyte's benchmarks by Zyte. ReaderLM-v2 scores **0.741 on WCXB and 0.2279 on WebMainBench** — same model, same task, a 0.51 spread.

**No accuracy number in this field is portable across benchmarks.** Cite within-benchmark rankings only, run our own baselines on our own corpus, and say this out loud in the README. Doing so is itself a credibility signal, given how the rest of the field reports.

### Second arm — real redesigns, not mutations

Mutations are synthetic and a judge can say so. Fix it with Wayback on the three manufacturers chosen in §2b.

- Pull captures across a ≥ 12-month span, keeping every pair that straddles a visible redesign
- Ground truth is **not** hand-labelled: the recall's identity (product name, hazard, date) is stable across the redesign, so the correct element is the one carrying the value the regulator listing also reports
- The regulator cross-check labels the set for free — this is the second dividend of the §2b split

Report accuracy **bucketed by capture gap**. Literature says accuracy is gap-dependent — 98.8% at 4 months, 86.8% at 1–5 years — so a single headline number is a lie either way. Publishing the curve is the honest version and costs nothing extra.

Two arms, stated plainly in the README: *mutations give controlled ground truth, Wayback gives real breakage.* Neither alone is credible.

Precedent: the strongest project in the WeMakeDevs archive (Lethe) benchmarked the sponsor's four advertised capabilities, found only one provably won, built the product around that single honest claim, and showed the receipt.

---

## 13. UI — Suit-Up track

**One screen**, not a dashboard suite.

- Field-health strip — green/amber/red per field, null-rate sparklines
- Break event → candidate list with **score bars side by side and the margin drawn between #1 and #2**
- Gate verdict rendered *as* the visual: wide margin = HEAL, narrow = ABSTAIN
- Probe transcript — the experiment that justified the decision
- Heal diff, approve/reject
- Verification checklist ticking live

**The margin bar is the design.** It makes an invisible statistical decision physical. That earns the iPad — not a chart library.

---

## 14. Demo video — ≤3 min

| Time | Beat |
|---|---|
| 0:00–0:10 | Cold open. One sentence, product already on screen. No logo animation, no team intro |
| 0:10–0:30 | Problem, specific and felt. A recall notice that was never published because a scraper broke silently |
| 0:30–0:45 | Solution + **name Scraper Studio and say what job it does** (not that you "used" it) |
| 0:45–1:35 | **Shot 1 — heal.** Break the site live (class rename) → detector fires → margin wide → heal → verify → row parity restored |
| 1:35–2:00 | **Shot 2 — ABSTAIN.** Sale price vs list price, 3.21 vs 3.12, thin margin → refuses. Say the line: *no-match beats mismatch* |
| 2:00–2:15 | **Shot 3 — probe resolves it.** Sort by price, the column goes monotonic, one candidate survives → heal with proof |
| 2:15–2:35 | False-heal table + 3-box architecture (~20s) |
| 2:35–2:50 | Recap + one honest limit |

Shot 2 is the differentiator — everyone will show Shot 1. Shot 3 is the creativity score.

Shots 1 and 2 are the same system under the same settings: one heals unattended, one refuses. Show the **proof record** on screen for both — before value, after value, candidate scores, margin, five verifier results, decision. That single artifact is the reliability score, the provenance story and the required example structured output at once.

If capped at 2:00: cut architecture to 10s, run the demo 0:40–1:40. The demo survives; the architecture dies.

**Craft rules:** write the script before recording · multiple takes, edit hard · real microphone · real sample inputs · skip login/seeding, pre-fill forms · never speed up audio to fit — cut content · public visibility, marked "Not for Kids" · reserve 2–3 hours for upload.

---

## 15. Stack

**REVERSED 2026-08-20 (build day 1): JavaScript, not Python.**

Scraper Studio's parser is Cheerio/JS and that is not negotiable. If the fingerprint extractor were Python offline and Cheerio in production, the two would drift — the exact failure the reuse audit named (*"divergence between the two would silently invalidate your benchmark"*). Writing it once in plain JS over Cheerio means **the same function runs in both places**, which is stronger than CSS-dialect parity and deletes a port step we do not have time for.

`src/fingerprint.js` therefore imports nothing — no npm, no Node builtins — so it pastes verbatim into a Scraper Studio parser where `$` already exists. Node + `cheerio` + `fastest-levenshtein` offline; `$` alone in production.

Python · flat JSON fingerprints on disk · `.jsonl` run log and proof records · `npx -p @brightdata/cli` · UI TBD.

**Three dependencies. That is the entire list.**

```
cheerio@1              # same parser as Scraper Studio production. offline only
fastest-levenshtein    # NED for the scorer. offline only
```

Everything else is language builtins. The Wayback fetcher is `fetch` + the CDX API directly (~120 lines, `tools/fetch-corpus.js`) — it needs soft-fail detection and `id_` handling that no library gives us for free anyway. Skeleton hashing is FNV-1a inline, because a hash function is one import Scraper Studio will not provide.

**No numpy, no framework, no database.** ~500 LOC.

**Deliberately rejected**, with reasons, because a judge may ask:

| Rejected | Why |
|---|---|
| `extruct` | 19 transitive deps, 10MB, last commit 17 months ago. JSON-LD + Open Graph in ~20 lines covers the anchors we need. Add it only if the corpus proves microdata/RDFa-only pages exist |
| `pydantic` | An `assert REQUIRED <= rec.keys()` covers a log we write and read ourselves. Pays off when something external reads it back |
| `scipy` | 40MB for one median |
| `lxml` | Only needed to *evaluate* XPath. We string-compare stored XPaths (weight 0.3–0.8 anyway), so no XPath engine is required |
| `zss` / `apted` | Tree edit distance, 8–9 years stale, cubic. The skeleton hash already answers "did the template change?" in O(n) |
| `difflib` | See §8 — wrong algorithm and 36× slower |

### Reused rather than built

| Need | Reused |
|---|---|
| Break trigger | `collect(obj, validate_fn)` already throws |
| Block / 404 detection | `detect_block()`, `dead_page()` error codes |
| Snapshot history | Bright Data retains batch snapshots 16 days, free |
| The repair itself | `bdata scraper heal` |
| String similarity | `rapidfuzz` (NED, Jaccard) |
| Statistics | `statistics.median` + MAD |
| Benchmark methodology | `scrapinghub/product-extraction-benchmark`, MIT — fork the precision-conditional-on-answering design |
| Real-break corpus | `michelnass/Similo2` pair benchmarks; `rub-sq/ReproBreak` if DOM can be dumped |
| Wayback fetching | `wayback` package (retry + rate-limit already handled) |
| Starter scaffold | `github.com/brightdata/bright-data-scraper-studio-python-project` |

---

## 16. Seven-day schedule

| Day | Build | Verify |
|---|---|---|
| 1 | Collector + capture-time fingerprint in parser code | One row round-trips with fingerprint attached |
| 2 | Detectors (robust-z, type, count, sentinels, anchors) | Seeded null spike fires; slow page does **not** |
| 3 | Similo scorer + margin gate + benign-tie check | Mutation set scores; margin separates easy from hard |
| 4 | Heal + verify + approve loop · both modes · proof record emitter | End-to-end on one real break; proof JSON validates |
| 5 | Tier-1 probes + sort-by-price + mutation benchmark, calibrate δ/τ | **The false-heal table exists** |
| 6 | UI | Margin bar readable at a glance |
| 7 | Video, README, Scraper Studio writeup | All three tell the same story |

**Day 5 is the deliverable. Days 6–7 are packaging.** If it slips, cut the UI before cutting the benchmark — the benchmark *is* the argument.

---

## 17. Explicitly skipped

| Skipped | Why | Add when |
|---|---|---|
| VLM / set-of-marks grounding | D2Snap: a text DOM at 7,178 tokens *matches* a SoM screenshot, and the marks' text list carried nearly all the signal, not the pixels. Slower, costlier, less deterministic | Never, for extraction |
| Erratum-class holistic tree matching | >1 week | — |
| Visual template matching | >1 week | — |
| Postgres healing infrastructure | Flat JSON is enough at this scale | >1 collector matters |
| GA weight search | Hardcode the published ranges | Benchmark says the scorer plateaued |
| LLM reranker | Deterministic probes are cheaper, faster, explainable; the LLM loses cases the scorer wins | Deterministic path exhausted |
| Add-to-cart probe | State mutation, gray zone | Never for this event |
| Element screenshots | Visual relocation is >1 week | — |
| Adopting Healenium | tag+id-only equality, sibling index weighted 0.0, closed-binary weights | — |

---

## 17b. Prior art — verified 2026-08-20

Read this before writing the README. Every project below either does part of what Assay does, or fails in a way worth citing. **Name them first; do not let a judge find them for you.**

### The incumbents, and exactly where they stop

| Project | Stars | Mechanism | Where it stops |
|---|---|---|---|
| **Scrapling** | 75,453 | Fingerprint in SQLite; unweighted mean of `difflib.SequenceMatcher` ratios over ~10 features; floor `percentage=40` | **No margin check, no tie-break, no verification, no calibrated confidence.** Returns its argmax whenever it clears an absolute floor |
| **Healenium** | 201 | Weighted DOM-tree scoring, `score-cap .6`, `recovery-tries 1` | Scoring engine frozen at `tree-comparing` 0.4.14 (2024-07-13). `equals()` is tag+id only, so the LCS path signal (weight 100, joint-largest) runs over a near-degenerate equality |
| **Stagehand** | 24,000 | Selector cache; server-side variant validates a hit against a page-snapshot fingerprint, plus a `cache.threshold` requiring N identical results | Self-heal fires **only on an exception**. `selfHeal` defaults to `false` on the server |
| **Skyvern** | 22,798 | Code caching, `@skyvern.cached` | Invalidates on **workflow-parameter edits, never on page change**. See the manufactured-values finding below |
| **Anansi** | 110 | Structured-data pre-pass → confidence-ranked selectors → 4 healing strategies → `if best_score < 0.5: return None` | Architecturally closest to Assay. Its `expected_pattern` regex is wired to the **heal** path only, never to validating what the primary selector returned |
| **Kadoa** | closed | *"If a website changes, we regenerate the required code and validate it against the previously extracted data"* | **Claims Assay's exact design.** Publishes no accuracy, no confidence score, no abstain mechanism |

**The shared blind spot, in every one of them:** healing is triggered by an exception or a zero-result selector. A selector that still resolves but now points at the wrong element is never examined. That is §7 category D, and it is unaddressed across the entire field.

### Prior art on abstaining — exists, has no traction, must be cited

| Project | What it does | Status |
|---|---|---|
| **Autify** (commercial) | A **third verdict**, `Review Needed`, neither pass nor fail, when the AI is unsure the element is right | Shipping. The best design in the vendor survey |
| **`@ia-qa/self-healing`** (npm 1.7.5) | PASS / FIX / **BLOCK**, where BLOCK refuses to guess; re-runs the suite to verify | Aug 2026, no public repo |
| **`playwright-eir`** (npm 1.0.0) | `healThreshold` 0.7; verifies against pre-recorded post-conditions; **rejects** the heal on mismatch; states false-heal rate is prioritised over heal-success | **0 stars, one author, one month old, self-run benchmark** |
| **LaVague** (dead, last commit 2025-01-21) | Best abstention *vocabulary* ever built: `NoElementException`, `AmbiguousException`, `HallucinatedException`, `ElementOutOfContextException`; `confidence_threshold = 0.85` | Worth reading, not citing as competition |
| **web-poet** | `Retry` and `UseFallback` page-object actions | **`UseFallback` is implemented by nobody**, including web-poet's own framework |

### Failure modes worth citing by name

**Skyvern manufactures wrong values.** `schema_validator.py`:
```python
_TYPE_DEFAULT_FACTORIES = {"string": lambda: None, "number": lambda: 0,
                           "integer": lambda: 0, "boolean": lambda: False}
```
A required integer the model declined to extract **becomes `0`** — downstream indistinguishable from a genuine zero. Validation runs afterward and never blocks. This contradicts Skyvern's own docs (*"fields return null"*) **and its own prompt** (*"please output a null value for that field"*). Not a missing abstain path: an abstain path that exists in the prompt and is overwritten by code.

**Schema constraints destroy abstention.** Firecrawl's `normalizeSchema` does `required: Object.keys(properties)` plus `strictJsonSchema: true`, making abstention structurally impossible. The Structured Output Benchmark (arXiv 2604.25359) removes the assumption underneath: *"models achieve near-perfect schema compliance, yet the best Value Accuracy, measured by exact leaf-value match, reaches only 83.0%."* **Schema conformance is the entire verification story for nearly every system in this space, and it does not catch wrong values.**

**AutoScraper clamps instead of failing.** `idx = min(len(p) - 1, item[2])` — if the learned sibling index is out of range because the page changed, it silently returns the last sibling. Structurally interesting anyway: `build()` creates one rule per matching element, so N redundant rules per field exist as raw material for majority-vote abstention. It implements no voting.

**trafilatura's abstain is mis-defaulted.** `MIN_EXTRACTED_SIZE = 250` gates internal escalation, not the return value. The return gate is `MIN_OUTPUT_SIZE = 1`, so out of the box it returns a 3-character string rather than `None`. Set it via `use_config()`.

**COLOR in production at a bank** (ICPC 2026 RENE, BGL BNP Paribas, 4,471 test executions / 133 CI days): *"The repair mechanism **suggested fixes for all captured broken locators**, with the top recommendation correct **in most cases**."* Suggested fixes for all of them — it never abstains — and "in most cases" is the entire accuracy reporting.

### What genuinely does not exist anywhere

1. A comparison of an extracted **value** against a prior value or expected shape **at extraction time**
2. A published, calibrated abstention threshold derived from measurement
3. Any healer evaluated against **ReproBreak**
4. Field-level (not item-level) confidence in any commercial extraction API — searching Zyte's full API reference for `confidence` returns **0 occurrences**; Diffbot Extract has no way to say "I don't know what the price is"
5. A benchmark that permits an explicit null **and** reports precision-conditional-on-answering sliced by confidence

Item 5 is the deliverable. Items 1–4 are the reasons it does not already exist.

---

## 18. Open decisions

1. ~~**Vertical**~~ — **decided: recall monitoring.** See §2.
2. ~~**Target sites**~~ — **decided and Wayback-verified: Mattel, IKEA US, Chicco + CPSC API.** See §2b.
3. **ReproBreak shape** — can its Docker repro be made to dump DOM at the break point? 30 min on Day 1. If yes, a real-breakage arm plus a first-ever number. If no, it stays a citation.
4. **Geometry** — drop `position`/`dimensions`, or force a Browser worker on capture? (§5. Recommend: drop.)
5. **UI stack.**
6. **Team** — solo or up to 4.
7. **SF sibling event** — enter Zero Downtime too? Needs Port + SigNoz on top, judged by Anthropic engineers.
8. **Name** — Assay, or something else.

---

## 19. Key references

| Topic | Source |
|---|---|
| False-heal rates, "no-match > mismatch" | Erratum — arXiv 2106.04916 |
| Similo weights, benchmark | Similo (TOSEM) · VON Similo LLM |
| GA-optimised weights, HybridSimilo, 4-month benchmark | Kluge & Stocco, EMSE 2026 — arXiv 2505.16424 |
| Incremental repair, +209% | WATERFALL — Hammoudi, Rothermel, Stocco, FSE 2016 |
| Mis-selection cross-check, 17/18 vs 0/18 | VISTA — FSE 2018 |
| Vacuous-pass oracle failure | WATER — Choudhary, Zhao, Versee, Orso |
| Robust locator generation | ROBULA+ — Leotta et al., JSEP 2016 |
| Multi-locator voting, −29.5% | Leotta et al., ICST 2015 |
| LLM as reranker; optimise shortlist recall | Xu, Li & Tan, ICST 2025 — arXiv 2312.05778 |
| Value-grounded XPath induction | XPath Agent — arXiv 2502.15688 |
| DOM vs screenshot token parity | D2Snap — arXiv 2508.04412 |
| Keyword-weight DOM pruning | Prune4Web — arXiv 2511.21398 |

**Added 2026-08-20 after the research pass:**

| Topic | Source |
|---|---|
| **Real-break corpus, 449 reproducible breaks** | ReproBreak — arXiv 2605.12158 · `rub-sq/ReproBreak` (MIT) |
| **Precision-conditional-on-answering methodology** | `scrapinghub/product-extraction-benchmark` (MIT, archived) |
| Exact-match vs fuzzy-F1 gap (0.90–0.97 vs 0.00–0.33) | `scrapinghub/article-extraction-benchmark` |
| Schema compliance ≠ value accuracy (83.0% best) | Structured Output Benchmark — arXiv 2604.25359 |
| Hallucination vs omission split (PDF/email, not web) | ExtractBench — arXiv 2602.12247 · LLMStructBench — arXiv 2602.14743 |
| COLOR in industrial CI, never abstains | ICPC 2026 RENE — Taha, Papadakis, Muller (BGL BNP Paribas) |
| Original COLOR, 77–93% top-1 | Kirinuki & Tanno, SANER 2019 — IEEE 8667976 |
| Assertion weakening as superficial convergence | Practical Limits of Autonomous Test Repair — arXiv 2605.01471 |
| Healenium weights (sources jar, **not** a closed binary) | `repo1.maven.org/.../tree-comparing/0.4.14/tree-comparing-0.4.14-sources.jar` |
| Closest OSS architecture; regex wired only to heal | `mdowis/anansi` |
| Calibrated extraction-quality score (27-feature XGBoost) | `rs-trafilatura` — crates.io 0.2.2 |
| Cross-run stats drift detection | Spidermon (Zyte) — `ItemCountMonitor`, `FieldCoverageMonitor` |

**Caveats to carry when citing:**
- Erratum's **mutation** numbers (9.0% / 54.4%) are fully ground-truthed. Its **Wayback** numbers (8.9% / 35.3%) assume both tools are correct whenever they agree (49% of cases) and expert-labelled only **366 of 14,784 disagreements**. Cite the first pair hard; caveat the second.
- Similo's headline differs by version: arXiv v1 is **12%** over 40 websites; TOSEM published is **11%** over 48. Use the TOSEM figure and say which.
- The 0.28 / 0.4 values in the VON Similo literature are an **evaluation** metric (M2, pairwise match/non-match), **not** operational abstention thresholds. The EMSE authors reject that setup outright. Do not adopt 0.28.
- Every benchmark in this field is self-interested (§12). No accuracy number is portable across benchmarks.

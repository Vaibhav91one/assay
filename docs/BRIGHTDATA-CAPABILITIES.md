# Bright Data capabilities Assay is not using

Researched 2026-08-21 against live docs. Every claim below carries a doc URL.
Where the docs do not say, this file says "could not determine" instead of guessing.

**Scope note.** This is about *new engine capabilities* — things Assay could not do
before. Nothing here is about measuring what Assay already does.

**Baseline.** Assay today uses one Bright Data thing: a single Scraper Studio
collector (`c_mt1nrjboski90goqc`), Code worker, triggered by hand. `fingerprint()`
and `skeletonHash()` run in that collector's Cheerio parser. `position` and
`dimensions` were dropped because Cheerio has no layout engine
(`src/fingerprint.js:10-14`, `PLAN.md:375`). SPEC weight in `src/heal.js` totals
18.6; the two dropped properties were 1.7 + 1.1, so ~20.4 was the full set.

---

## Cost model used throughout

| Unit | Rate | Source |
| --- | --- | --- |
| Scraper Studio page load | $0.0015 (PAYG $1.50 / 1K page loads) | [pricing/web-scraper/studio](https://brightdata.com/pricing/web-scraper/studio) |
| Free tier credit | 1 credit = 1 Scraper Studio page load; 5,000/month, resets on the 1st, no rollover | [free-tier](https://docs.brightdata.com/general/account/billing-and-pricing/free-tier) |
| Web Unlocker API request | $0.0015 (PAYG $1.50 / 1K requests) | [pricing/web-unlocker](https://brightdata.com/pricing/web-unlocker) |
| Browser API | $8/GB PAYG. From 2026-09-01 also drawn from free credits at 5 credits/MB | [pricing/scraping-browser](https://brightdata.com/pricing/scraping-browser), [free-tier](https://docs.brightdata.com/general/account/billing-and-pricing/free-tier) |
| Residential/ISP/Datacenter proxies | **Not** covered by free credits. $2 one-time trial (7 days) + $5 on adding a card (30 days) | [free-tier](https://docs.brightdata.com/general/account/billing-and-pricing/free-tier) |
| File downloads (screenshots, WARC) | Billed per GB, separately from CPM | [scraper-studio/specifications](https://docs.brightdata.com/datasets/scraper-studio/specifications) |

$52 on the account ≈ **34,600 Scraper Studio page loads** beyond the free 5,000/month.
Everything proposed below fits inside the free tier at Assay's corpus size.

> **Could not determine:** the Browser-worker CPM multiplier. `worker-types` says
> Browser worker cost per page load is "Higher" than Code worker
> ([worker-types](https://docs.brightdata.com/datasets/scraper-studio/worker-types)),
> but `specifications` and `free-tier` both describe a flat one-credit-per-page-load
> charge with no worker distinction. The two pages disagree. Budget for a multiplier;
> the control panel's per-run **Spent** column
> ([features](https://docs.brightdata.com/datasets/scraper-studio/features)) will
> settle it after one run.

> **Retention trap:** batch results live **16 days**, real-time results **7 days**,
> and WARC/screenshot files inherit that window. Nothing is recoverable after expiry.
> ([specifications](https://docs.brightdata.com/datasets/scraper-studio/specifications))

---

## 1. Verified capability table

| # | Capability the engine gains | Enabling Bright Data feature | Feasible | Cost | Effort |
| --- | --- | --- | --- | --- | --- |
| C1 | Act on the abstain decision: commit or reject a real code fix | `bdata scraper heal` / `approve` / `--reject`; `POST /dca/collectors/{id}/refactor_template`, `.../resume_automation_job` | **Yes** | $0 API; heal run is AI-Flow, page loads only on verify | ~120 LOC + poll loop |
| C2 | Separate "we were blocked" from "the selector broke" | `detect_block()`, `blocked()`, `dead_page()`, `bad_input()`, and the `error_code` field on every output line | **Yes** | $0 (rides an already-billed page load) | ~30 LOC |
| C3 | Deterministic `skeletonHash()` — stop late-rendering DOM churn moving the hash | `freeze_page()`, `wait_page_idle()`, `wait_network_idle()` | **Yes** (Browser worker only) | $0 | 3 lines |
| C4 | Unattended scheduled runs with push delivery and degradation alerts | Scraper Studio native scheduler + webhook/S3/GCS/Azure/Snowflake/SFTP delivery + low-success-rate notifications | **Yes** | $0 platform cost | ~0 code (UI config) + webhook receiver |
| C5 | Geo-variant detector: values that differ by country are personalisation, not breakage | `country(code)` in interaction code; input-schema field per run; also `proxy_location({lat,long,radius})` | **Yes** | k countries × $0.0015 per check | ~60 LOC + 1 input field |
| C6 | A/B / experiment detector: same URL, two runs, divergent DOM | Two triggers of the same collector (proxy session is not preserved by default — `preserve_proxy_session()` exists to opt *in*) | **Partly** — see §4.3 | 2 × $0.0015 per check | ~40 LOC (reuses `skeletonHash`) |
| C7 | Restore `position` + `dimensions` to the fingerprint (1.7 + 1.1 of 20.4 weight) | `html_capture_options({coordinate_attributes: true})` — embeds element coordinates as HTML attributes the Cheerio parser can read — plus **Worker per stage** so only the capture stage pays for a browser | **Yes, with one unknown** — see §4.1 | Capture pass only; 1 page load per captured page | ~40 LOC engine + a corpus refetch |
| C8 | Route-drift discovery: notice when a target site adds pages we are not watching | `load_sitemap({url})` — handles sitemap indexes and gzip | **Yes** | 1 page load per sitemap file | ~50 LOC |
| C9 | Byte-level replay corpus: exactly what the site served, headers included | `warc_snapshot` field in the output schema's `additional_data` section (ISO 28500) | **Yes** (Browser worker only) | Per-GB download rate; 16-day retention | Toggle + a WARC reader |
| C10 | Cause attribution for "the site's own API is failing" | `verify_requests(cb)` → `{url, error, type, response}` per failed browser request | **Yes** (Browser worker only) | $0 | ~20 LOC |
| C11 | Detect that the site moved a field from server HTML into a client fetch | `tag_response()` / `tag_all_responses()` / `capture_graphql()` | **Yes** (Browser worker only) | $0 beyond the page load | ~40 LOC |
| C12 | Screenshot as a second, DOM-independent opinion | Page-level `tag_screenshot(field, {full_page})` + `bounding_box(selector)` to crop; or Browser API `page.screenshot()` | **Yes, but not element-level in Scraper Studio** — see §4.5 | Per-GB file download | ~80 LOC + an image differ |
| C13 | Server-side shape enforcement on every record | Output schema `required`, `custom_validation`, `default_value`, 18 typed field types incl. `price` (`{value, currency}`) | **Yes** | $0 | UI config |
| C14 | Stable content hash inside interaction code with no imports | `hash(data, algorithm)` — sha256/sha1/sha512/md5 | **Yes** | $0 | 1 line |
| C15 | Redirect/status/header evidence at detection time | `redirect_history()`, `status_code()`, `response_headers()`, `resolve_url(url)` | **Yes** (all Code-worker safe) | $0 | ~20 LOC |

Function reference for everything in the "enabling feature" column:
[scraper-studio/functions](https://docs.brightdata.com/datasets/scraper-studio/functions).
Browser-only vs Code-worker split:
[worker-types](https://docs.brightdata.com/datasets/scraper-studio/worker-types).

---

## 2. The finding that matters most (not on the hypothesis list)

**Bright Data's self-healing flow pauses at an approval gate and asks a human.
Assay is exactly the thing that should answer it.**

> **UPDATE 2026-08-23 — shipped, and the second sentence above was wrong about
> *which* gate.** `src/bd/diffgate.ts` now answers the approval gate, and
> `tools/bd-heal.ts --approve` refuses when it rejects. It is **not**
> `healGated()`. `healGated` scores candidate *elements* on a page; a Bright Data
> proposal is collector JavaScript, and the row it produces can be perfect while
> the repair is wrong. That is not hypothetical — on the one real transcript this
> repo has (`results/bd-heal-transcript.json`) all four output-shape rules passed
> and the repair was rejected anyway, because it rewrote `title_on_detail` to
> derive from `input.recall_title` and thereby retired the only independent
> cross-check between the listing and detail stages. So the code gate is a
> separate file asking a different question of different evidence. Its three rules
> are fitted to that single transcript; `docs/LIMITATIONS.md` §10 states the
> limit. The `resume_automation_job {"message": true}` half described below is
> still deliberately manual: `cmdHeal` cannot approve, and `--force` is an
> explicit override rather than a default.

`bdata scraper heal <collector_id> <prompt>` "by default stops at an approval gate
and returns `status: "awaiting_approval"` with a `preview_result`". You then run
`bdata scraper approve <collector_id>` or `bdata scraper approve <collector_id>
--reject`.
([cli/commands](https://docs.brightdata.com/cli/commands))

The same gate exists over REST:

- `POST /dca/collectors/{collector_id}/refactor_template` — body `{prompt}` (max 1000 chars), optional `custom_input`
- `GET  /dca/collectors/{collector_id}/refactor_template/progress` — returns `status: "pending_answer"` with `step: "user_approval"` when it is waiting
- `POST /dca/collectors/{collector_id}/resume_automation_job` — `{"message": true}` approves, `{"message": false}` rejects, `{"auto_save": true}` saves the template on success

([ai-flow/overview](https://docs.brightdata.com/api-reference/scraper-studio-api/ai-flow/overview),
[trigger-self-healing](https://docs.brightdata.com/api-reference/scraper-studio-api/ai-flow/trigger-self-healing),
[resume-self-healing-job](https://docs.brightdata.com/api-reference/scraper-studio-api/ai-flow/resume-self-healing-job))

When this was written, `healGated()` produced a verdict that nothing consumed.
The paragraph below is the design that was sketched from that; read the UPDATE
above for what actually shipped and why the element gate was the wrong instrument.
Wired to this gate,
Assay stops being an analyser and becomes an actuator: `detect()` fires →
`rank()`/`healGated()` decide → margin clears, so `refactor_template` with a prompt
built from the diagnosis, then `resume_automation_job {"message": true}`; margin
too close, so `{"message": false}` and the collector is left exactly as it was.
The Collector ID is stable across healing
([cli/commands](https://docs.brightdata.com/cli/commands)), and accepted changes go
to a draft before production, with a **Versions** menu for rollback
([self-healing-tool](https://docs.brightdata.com/datasets/scraper-studio/self-healing-tool)).

Caveats from the docs, re-fetched 2026-08-23. "Refactoring can take up to 15
minutes"; the tool is human-initiated and prompt-driven ("Type your request in
plain language"), produces "a code diff in the editor" the operator Accepts or
Declines, needs a separate **Update Schema** click when fields are added or
renamed, and works on "an existing scraper in Bright Data Scraper Studio (saved in
development mode)"
([self-healing-tool](https://docs.brightdata.com/datasets/scraper-studio/self-healing-tool)).
The CLI has a `--max-retries` for "the AI-Flow concurrent-job 429 cap"
([cli/commands](https://docs.brightdata.com/cli/commands)) — so this is a
minutes-scale async loop, not a request/response.

Observed rather than documented, from the one run we have
(`results/bd-heal-transcript.json`): 09:47:00 → 10:05:10 UTC, about **18 minutes**
to reach `pending_answer` / `user_approval`, across 51 polls and 29 completed
steps. One run is one run, but it is longer than the documented ceiling and worth
knowing before wiring a timeout to 15 minutes.

### 2.1 Creating a collector from nothing — the gap `refactor_template` doesn't close

Everything above operates on an EXISTING collector, given by id. Bright Data's
public API reference documents `/dca/trigger` and `/dca/dataset` for running one
and the three endpoints above for healing one, but nowhere documents how to
create one — the earlier draft of this file said so and left it an open question.
It no longer is one: the three endpoints below were confirmed by reading
`brightdata/cli`'s own source (`src/commands/scraper.ts`, the `scraper create`
subcommand), the same way `refactor_template` was confirmed before this file
existed.

- `POST /dca/collector` — body `{name, deliver: {type: "webhook", endpoint, filename: {template, extension}}}`, returns `{id, name, created}`. Creates an empty template; `id` is the new collector id.
- `POST /dca/collectors/{collector_id}/automate_template` — body `{description, urls}` (description max 500 chars, one or more target URLs). Triggers AI-Flow to generate a schema and extraction code from scratch.
- `GET  /dca/collectors/{collector_id}/automate_template/progress` — same progress shape as `refactor_template/progress`: `status: "done"` is the only documented success terminal; the CLI treats `failed`/`error`/`cancelled` as terminal failure and everything else as still running.

AI-Flow generation is billed at $0 API cost either way (§1, row C1) — only page
loads during a subsequent real run are metered. `bdata scraper create <url>
"<description>"` wraps exactly this three-call sequence and "takes 5 to 10
minutes" per its own `--help`.

`tools/bd-create.ts` (`npm run bd:create`) is Assay's own driver for this flow,
sibling to `tools/bd-heal.ts` and following the same transcript-capture
discipline. It closes the recovery-path gap `docs/FEATURES.md`'s Phase-6 note
flagged: a watch target with no manually-provisioned collector previously had no
way to get one short of the Bright Data web UI. It still does not write a
`target -> collector_id` mapping anywhere in Assay's store — that stays a human's
call to make and wire up, on purpose, the same as `bd-heal.ts`'s own
`--collector <id>` being supplied out of band rather than looked up.

---

## 3. Hypotheses: verdicts at a glance

| # | Hypothesis | Verdict |
| --- | --- | --- |
| 1 | Restore geometry to the fingerprint | **Confirmed feasible**, and by a cheaper route than the Browser API — one unresolved detail |
| 2 | Geo-variant detection | **Confirmed**, cheap, Code-worker safe |
| 3 | A/B test detection | **Partly confirmed** — the primitive exists but the docs do not guarantee IP divergence between runs |
| 4 | Block vs break disambiguation | **Confirmed**, free, already-structured output |
| 5 | Element screenshots as a verification channel | **Confirmed with a caveat** — Scraper Studio screenshots the *page*, not the element |
| 6 | Scheduled unattended operation | **Confirmed** — fully native, do not build it |
| 7 | New-page discovery via Crawler API | **Confirmed by a different product** — `load_sitemap()`, not the Crawl API |

---

## 4. Hypotheses in detail

### 4.1 Restore `position` and `dimensions` — CONFIRMED, and the Browser API is not the answer

The premise of the drop was right and is still right: parser code runs Cheerio, and
Cheerio has no layout engine. Parser globals are `$` ("Cheerio instance, loaded with
the page HTML"), `input`, `location`, `parser`
([functions](https://docs.brightdata.com/datasets/scraper-studio/functions)).
That does not change on a Browser worker — the parser is Cheerio either way.

What changes it is that Scraper Studio can **push the browser's layout into the HTML
the parser sees**:

> `html_capture_options` — Configure HTML capture. Controls how the HTML snapshot is captured.
> `options.coordinate_attributes` (boolean): **Embed element coordinates as attributes.**
>
> ```js
> html_capture_options({ coordinate_attributes: true });
> ```
>
> — [scraper-studio/functions](https://docs.brightdata.com/datasets/scraper-studio/functions)

So `fingerprint()` keeps reading attributes off `$` exactly as it does now — the
"one extractor, two runtimes, zero drift" property in `src/fingerprint.js:1-8`
survives — and geometry arrives as two more `attr()` reads. No `getBoundingClientRect`,
no Browser API, no Playwright dependency.

**"Only on capture, not on every run" is directly supported.** Scraper Studio has a
**Worker per stage** mode: "available to all users and lets you assign a different
worker type to each stage", configured under Settings → Worker per stage
([worker-types](https://docs.brightdata.com/datasets/scraper-studio/worker-types)).
Put the capture stage on a Browser worker with `html_capture_options` and
`freeze_page()`; leave the routine detection stages on the Code worker. Assign a Code
worker to a stage that calls a browser-only function and you get an explicit
`Incompatible worker` error, so the split is enforced, not silent.

Supporting functions if you want geometry for a specific element rather than the whole
tree: `bounding_box(selector)` returns `{top, right, bottom, left, x, y, width, height}`
and `browser_size()` returns `{width, height}` for normalising coordinates into
viewport-relative units. Both are Browser-worker only
([functions](https://docs.brightdata.com/datasets/scraper-studio/functions)).

**Cost.** One page load per captured page, on the capture pass only. Assay's corpus is
three sites (`corpus/chicco`, `corpus/ikea`, `corpus/mattel`) — tens of page loads, i.e.
a few cents, well inside the free tier. Plus the unresolved Browser-worker multiplier
noted above.

**Effort.** Small in the engine (~40 LOC: two `attr()` reads, two `SPEC` entries at
1.7 and 1.1, two comparators). The real cost is elsewhere: **the offline corpus HTML
does not carry coordinate attributes**, so `tools/fetch-corpus.js` output has to be
regenerated through a Browser worker with the flag on, or the offline harness and the
production parser drift — which is precisely the failure mode `src/fingerprint.js:1-8`
exists to prevent. Budget the corpus refetch, not the extractor change.

> **Could not determine:** the attribute names and value format
> `coordinate_attributes` produces. `coordinate_attributes` appears exactly twice in
> the entire Bright Data documentation corpus (verified against
> `https://docs.brightdata.com/llms-full.txt`, 5.6 MB, 770 pages) — the parameter table
> and the one-line example, nothing more. No sample output, no attribute name, no unit.
> One IDE preview run with `tag_html('html')` and a grep of the result settles it in
> five minutes. Do that before committing to the design.

**Rejected alternative:** the Browser API (Scraping Browser) does give a real headless
Chrome with full layout, JS execution and `getBoundingClientRect` — it drives
Puppeteer/Playwright/Selenium over CDP
([scraping-browser/introduction](https://docs.brightdata.com/scraping-automation/scraping-browser/introduction))
and supports `page.screenshot({fullPage: true})`
([code-examples](https://docs.brightdata.com/scraping-automation/scraping-browser/code-examples)).
But it means a second runtime for the extractor, a $8/GB bandwidth meter instead of a
per-page meter, and the exact browser dependency `PLAN.md:380` weighed and declined.
`coordinate_attributes` gets the same signal without any of that. Do not use the
Browser API for this.

### 4.2 Geo-variant detection — CONFIRMED, cheap, and Code-worker safe

`country(code)` takes a two-letter ISO code and routes the run through that country.
It is **not** marked browser-only, so it works on the existing Code-worker collector
with no worker change:

```js
country('us');
```

For finer control, `proxy_location({country, lat, long, radius})` — lat `[-85,85]`,
long `[-180,180]`, radius in km — but that one **is** Browser-worker only, and the docs
say "Prefer `country()` unless you need precise geographic control"
([functions](https://docs.brightdata.com/datasets/scraper-studio/functions)).

The underlying network supports `country`, `city`, `state`, `zip` and `ASN` resolution
([residential/configure-your-proxy](https://docs.brightdata.com/proxy-networks/residential/configure-your-proxy),
[proxy geolocation targeting](https://docs.brightdata.com/api-reference/proxy/geolocation-targeting)),
across 195+ countries, with `-country-eu` for a whole-EU pool. City targeting is
residential/mobile only — deprecated for datacenter and ISP.

**Shape of the detector.** Add a `country` field to the collector's input schema
([input-and-output-schema](https://docs.brightdata.com/datasets/scraper-studio/input-and-output-schema)),
call `country(input.country || 'us')` before `navigate()`, and trigger the same
collector k times with k different countries in one batch — `POST /dca/trigger` takes
a JSON array of input objects
([quickstart](https://docs.brightdata.com/datasets/scraper-studio/quickstart)). Feed the
k result rows to the existing `detect()`: if the field values disagree across countries
but `skeletonHash()` agrees, that is personalisation, and healing it would encode one
country's copy as the truth. If the skeleton disagrees too, it is a geo-gated layout,
which is a different (and also non-breakage) verdict.

**Cost.** k page loads per check. Four countries = $0.006. A daily four-country probe on
one URL is 120 page loads/month — 2.4% of the free tier. This is cheap enough to run as
a standing detector, not just an investigation tool.

**Effort.** ~60 LOC plus one input-schema field. No new product, no new credential, no
worker change.

**Do not** reach for the residential proxy network directly for this. Proxy products are
explicitly excluded from the 5,000 free monthly credits
([free-tier](https://docs.brightdata.com/general/account/billing-and-pricing/free-tier));
`country()` inside the collector gets the same geo routing on the metered-per-page-load
plan Assay is already on.

### 4.3 A/B test detection — PARTLY CONFIRMED, and the honest answer is weaker than the hypothesis

**The right primitive is two triggers of the same collector, not one clever call.**

Evidence that separate runs do not share proxy state: `preserve_proxy_session()` exists
specifically to "Reuse the proxy session across child stages"
([functions](https://docs.brightdata.com/datasets/scraper-studio/functions)) — an opt-in,
which means non-preservation is the default. Two independent triggers therefore get
independent sessions.

> **Could not determine:** whether two independent runs are *guaranteed* to land on
> different exit IPs. No Scraper Studio doc states an IP-rotation guarantee at job level.
> The proxy layer has an explicit primitive for this — `-session-<id>` in the proxy
> username, where "each unique session ID will get a unique IP, can be used to target the
> same IP repeatedly or force rotation"
> ([geolocation targeting / proxy username flags](https://docs.brightdata.com/api-reference/proxy/geolocation-targeting))
> — but that flag is on the proxy username string, and the docs do not expose a
> Scraper Studio function that sets it. `country()`, `proxy_location()`,
> `set_session_cookie()` and `set_session_headers()` are the only session controls
> documented for collectors.

**What this means practically.** Two triggers give you two *sessions* reliably and two
*IPs* probably. For a bucketed A/B test, the session is usually the bucketing key
anyway (cookie-based), so this works. For an IP-bucketed test it may not. If you need a
hard guarantee, the workaround is documented and free: vary `country()` between the two
runs, which forces different exit peers by construction — but that conflates A/B
detection with §4.2, so run geo-variance first and A/B second on a fixed country.

A cleaner deliberate divergence lever: `set_session_cookie(domain, name, value)` lets
you *pin* a bucket rather than sample one, if the target's bucketing cookie is known.

**Comparison.** Reuse `skeletonHash()` verbatim — that is what it is for. Two runs,
same URL, same country, same minute: skeleton match with value mismatch = experiment or
volatile content; skeleton mismatch = variant DOM = experiment, not breakage. Add
`freeze_page()` (§4.4) first or late-rendering content will fake a mismatch.

**Cost.** 2 page loads = $0.003 per check. **Effort:** ~40 LOC, no new dependency.

### 4.4 Block vs break — CONFIRMED, free, and better structured than expected

This is the cleanest win in the whole report and it costs nothing.

Four helpers mark a crawl as a failure, all of them Code-worker safe except
`detect_block`:

| Function | Behaviour | Browser only |
| --- | --- | --- |
| `detect_block({selector}, {exists\|has_text})` | Detects block-page content; fails with `error_code=detect_block` | **Yes** |
| `blocked(msg?)` | "Reports that the site refused access." `error_code=blocked` | No |
| `dead_page(msg?)` | Flags the page so it can be filtered from future collections. `error_code=dead_page` | No |
| `bad_input(msg?)` | Prevents any retries. `error_code=bad_input` | No |

([functions](https://docs.brightdata.com/datasets/scraper-studio/functions))

```js
detect_block({selector: '.foo'}, {exists: true});
detect_block({selector: '.bar'}, {has_text: /access denied/i});
```

The payoff is that **the verdict arrives as a structured field on the output row**, so
`detect()` does not have to infer it. Every Scraper Studio record carries:

| Field | Meaning |
| --- | --- |
| `error_code` | `dead_page`, `bad_input`, `blocked`, `detect_block`, `crawl_error`, `parse_error`, `wait_element_timeout`, `captcha_timeout`, `ajax_request_error`, `load_sitemap`, … |
| `error` | human-readable detail |
| `status_code` | 403 = "Access blocked or denied by the target site", 404 = page not found, 429 = rate limited, 500 = "Crawl, proxy or navigation failed before Scraper Studio received a valid page response" |
| `warning` / `warning_code` | non-fatal issue on a record that *was* delivered |

([error-codes](https://docs.brightdata.com/datasets/scraper-studio/error-codes)) — the
docs even show the intended consumption pattern, `if (line.error_code === 'dead_page')`.

**The gate.** Assay should refuse to update a baseline, and refuse to heal, on any row
where `error_code ∈ {blocked, detect_block, captcha_timeout}` or `status_code ∈ {403,
429, 500, 503}`. That is a guard clause on the ingest path, not a new subsystem.

Note the distinction the error table draws, which matters for attribution:
`blocked` means "the `blocked()` function was used in the scraper code, **or** the
target website refused access", while `detect_block` means "Scraper Studio detected
block-page content, such as 'Access Denied', sign-in walls or other known blocking
patterns". The second is the platform's own signal; the first may be yours.

**Web Unlocker's role here is smaller than the hypothesis assumed.** Scraper Studio
already "runs entirely on Bright Data's proxy and unblocking infrastructure" and
"handles all proxy management and infrastructure automatically"
([scraper-studio/introduction](https://docs.brightdata.com/datasets/scraper-studio/introduction)).
Adding a Web Unlocker zone alongside it buys nothing for detection. Where Web Unlocker
*would* earn its place is as an **independent second fetch path** when a page is flagged
blocked — a different product, different unblocking stack, $0.0015/request, `render:true`
to force a browser
([web-unlocker/features](https://docs.brightdata.com/scraping-automation/web-unlocker/features)).
If Web Unlocker also comes back blocked, it is the site; if it succeeds, it was the
collector's session. That is a real disambiguation and it is one extra HTTP call.

**Cost:** $0 for the primary signal. **Effort:** ~30 LOC.

### 4.4b Free rider — `freeze_page()` kills a class of false positives

Not on the hypothesis list, three lines, and it protects `skeletonHash()` directly:

> `freeze_page` — "Forces the page to stop changing, so HTML snapshots reflect exactly
> what the scraper saw. Experimental."
>
> `wait_page_idle({idle_timeout, ignore})` — "Wait until DOM mutations stop."
>
> `wait_network_idle({timeout, ignore})` — "Wait until the browser network settles."
>
> — [functions](https://docs.brightdata.com/datasets/scraper-studio/functions)

Any structure-only hash taken while a page is still hydrating is a coin flip. Right now
a late-mounting cookie banner or a lazy widget can move `skeletonHash()` and read as
`anchors_died`. `wait_page_idle()` then `freeze_page()` before capture removes it.
Browser-worker only, so it lands with the capture stage from §4.1. Flagged
**experimental** by Bright Data — treat `wait_page_idle()` as the load-bearing call and
`freeze_page()` as the belt.

### 4.5 Element screenshots — CONFIRMED, with a caveat that changes the design

**Scraper Studio cannot screenshot an element.** `tag_screenshot(field, opt)` takes
`opt.filename` and `opt.full_page` (default `true`) and captures the *page*. There is no
selector parameter
([functions](https://docs.brightdata.com/datasets/scraper-studio/functions)).

Two viable routes:

1. **Stay in Scraper Studio.** `tag_screenshot('view', {full_page: false})` for the
   viewport plus `bounding_box(selector)` for the element rect, then crop locally. Both
   Browser-worker only. The image reaches parser code as `parser.<field>`, same as
   `tag_html`. This keeps everything on one product and one billing meter.
2. **Browser API.** A real Chrome over CDP with Playwright/Puppeteer/Selenium
   ([scraping-browser/introduction](https://docs.brightdata.com/scraping-automation/scraping-browser/introduction)),
   where element-level `locator.screenshot()` is native. Costs $8/GB and adds a second
   runtime.

A third, cheapest-of-all option for a coarse check: Web Unlocker returns a full-page PNG
with a single header — `x-unblock-data-format: screenshot`, or `data_format: screenshot`
on the REST body — at $0.0015/request
([web-unlocker/features](https://docs.brightdata.com/scraping-automation/web-unlocker/features)).
No element targeting, but it is one call with no collector changes.

**Honest assessment.** Route 1 is the right one *if* you do this at all, because it
reuses `bounding_box`, which §4.1 already brings in. But an image differ is a real
subsystem — thresholding, anti-aliasing tolerance, render nondeterminism — and it
produces a soft signal that has to be reconciled with a hard one. Screenshots are also
billed per GB and expire with the 16-day snapshot window. **Ranked last** (§5, #10).
Ship §4.1 first; if geometry restores the lost 2.8 weight, the visual channel is
redundant.

### 4.6 Scheduled unattended operation — CONFIRMED, and you should build none of it

Everything the hypothesis asks for is native. Building it would be pure waste.

**Scheduling.** Scraper Studio has a first-class scheduler: pick a start date/time,
choose **hourly, daily, weekly, or custom**, set a deadline, attach inputs manually or
by CSV/TXT/JSON upload (max 1 GB). Runs show `Trigger: schedule` in the Runs tab
([initiate-collection-and-delivery-options](https://docs.brightdata.com/datasets/scraper-studio/initiate-collection-and-delivery-options)).

**Deadline.** Per-run cap accepting `1h`, `25m`, `10s`, or an ISO timestamp. On expiry
Bright Data "stops the collection and delivers the data collected so far" — a partial
result, not a lost run.

**Delivery.** Webhook (HTTPS POST), API download, Email, Amazon S3, Google Cloud
Storage, Azure Blob, Alibaba OSS, Google Cloud PubSub, OCI PAR, Snowflake, SFTP/FTP.
Formats JSON, NDJSON, CSV, XLSX, Parquet. Split delivery into N-line batches. Data
preferences let you request **errors in a separate file** — which pairs exactly with the
§4.4 gate, since Assay wants the error rows as much as the success rows.

**Alerting — the part that is genuinely hard to build and comes free.** Notifications
include completion (Email/Webhook/None), **low success rate**, and **delivery problems**,
configurable separately for production and development
([initiate-collection-and-delivery-options](https://docs.brightdata.com/datasets/scraper-studio/initiate-collection-and-delivery-options)).
The Runs page already exposes per-run **Success rate**, **Failed crawls**, **Records**,
**Page Loads**, **Spent**, and **Template** version
([features](https://docs.brightdata.com/datasets/scraper-studio/features)).

**Concurrency and limits.** 100 concurrent batch jobs per scraper (excess queues
automatically, nothing dropped); 50K real-time requests/min per customer
([specifications](https://docs.brightdata.com/datasets/scraper-studio/specifications)).

> **Could not determine / important gap:** the `bdata` CLI has **no scheduling command**.
> Verified against the full command reference — `login`, `logout`, `scrape`, `search`,
> `discover`, `pipelines`, `scraper create|run|heal|approve`, `status`, `browser`,
> `zones`, `budget`, `config`, `init`, `skill`, `add mcp`
> ([cli/commands](https://docs.brightdata.com/cli/commands)). Scheduling is control-panel
> only. So the schedule is configured by hand once, and everything after it is API-driven.

**What Assay actually has to build:** a webhook receiver. That is the whole scope.
`tools/bd-status.sh`'s 60-iteration poll loop can be deleted once delivery is pushed.

### 4.7 New-page discovery — CONFIRMED, but by `load_sitemap()`, not the Crawl API

The Crawl API exists and does "map and extract content across an entire domain"
([crawl-api/overview](https://docs.brightdata.com/scraping-automation/crawl-api/overview),
[crawl-api reference](https://docs.brightdata.com/api-reference/rest-api/scraper/crawl-api)).

> **Could not determine:** the Crawl API's discovery controls. Its public OpenAPI spec
> documents exactly three parameters — `dataset_id`, `include_errors`,
> `custom_output_fields` — and a request body that is just an array of `{url}` objects.
> No crawl depth, no include/exclude globs, no domain scoping, no incremental/delta mode
> is documented anywhere in the reference or the quick-start. Without a depth or filter
> control, a domain-wide crawl is an unbounded page-load bill on a $52 balance.

The Scraper Studio function does the job with a bounded cost:

> `load_sitemap({url})` — "Loads a sitemap XML file and returns the URL list. Supports
> sitemap indexes and gzip-compressed sitemaps."
>
> ```js
> let {pages}    = load_sitemap({url: 'https://example.com/sitemap.xml.gz'});
> let {children} = load_sitemap({url: 'https://example.com/sitemap-index.xml'});
> ```
>
> — [functions](https://docs.brightdata.com/datasets/scraper-studio/functions)

**Shape of the detector.** A stage that loads the sitemap, diffs the URL set against the
last run's, and emits `routes_added` / `routes_removed`. It costs one page load per
sitemap file, works on the Code worker, and gives a signal Assay has no equivalent of:
*the site grew a section we are not watching*. `routes_removed` is arguably the more
interesting half — a URL vanishing from the sitemap is advance warning that a watched
page is about to 404, which is a `dead_page` you can predict instead of discover.
Failures surface as `error_code=load_sitemap`
([error-codes](https://docs.brightdata.com/datasets/scraper-studio/error-codes)).

Supporting function: `resolve_url(url)` follows a URL through redirects and returns the
final `href`, so a route that silently starts 301-ing elsewhere is detectable without a
full fetch.

**Cost:** ~$0.0015 per sitemap file per check. **Effort:** ~50 LOC.

---

## 5. Ranked: what to add

Ranked by value to Assay's actual thesis — *refusing to heal when the decision is too
close to call* — divided by effort.

| Rank | Add | Why here | Effort |
| --- | --- | --- | --- |
| 1 | **Wire `healGated()` to the heal approval gate** (C1, §2) | Turns the abstain decision from a report into an action. Bright Data's gate is literally waiting for a decision-maker; Assay is one. Nothing else on this list changes what the engine *is*. | ~120 LOC + async poll |
| 2 | **Block/break gate on ingest** (C2, §4.4) | Healing a blocked page poisons the baseline. The signal is already on every row as `error_code`. Free, tiny, and it protects everything above it. | ~30 LOC |
| 3 | **Native schedule + webhook + low-success-rate alerts** (C4, §4.6) | Unattended operation with negative code: deletes `tools/bd-status.sh`'s poll loop. Configure once in the control panel. | webhook receiver only |
| 4 | **`wait_page_idle()` + `freeze_page()` on capture** (C3, §4.4b) | Three lines that remove a false-positive class from `skeletonHash()`. Rides along with #6's Browser worker anyway. | 3 lines |
| 5 | **Geo-variant detector** (C5, §4.2) | A whole category of "not a break" that Assay currently cannot see and would heal wrongly. Code-worker safe, $0.006/check, no new product. | ~60 LOC + 1 input field |
| 6 | **Geometry via `coordinate_attributes` + Worker per stage** (C7, §4.1) | Recovers 2.8 of 20.4 weight without a browser dependency in the extractor. Ranked below the cheap wins because it needs a corpus refetch and has one unverified detail. **Run the five-minute attribute-name probe first.** | ~40 LOC + corpus refetch |
| 7 | **Sitemap route-drift detector** (C8, §4.7) | New signal class entirely: coverage drift rather than extraction drift. `routes_removed` predicts `dead_page` before it happens. | ~50 LOC |
| 8 | **A/B detector** (C6, §4.3) | Real, cheap, reuses `skeletonHash()` — but the IP-divergence guarantee is unproven, so it is a probabilistic detector. Ship after #5, which shares its plumbing. | ~40 LOC |
| 9 | **`verify_requests()` + `tag_response()` cause attribution** (C10, C11) | Distinguishes "site's own API is 500ing" and "field moved from server HTML to a client fetch" from "selector broke". Two new causes for the attribution table. Browser-worker only, so it lands with #6. | ~60 LOC |
| 10 | **Element screenshot channel** (C12, §4.5) | Genuinely independent of the DOM, but needs an image differ, produces a soft signal, and is per-GB billed with 16-day expiry. If #6 restores the geometry weight, this is redundant. | ~80 LOC + differ |

**Free-tier fit.** #2, #3, #4 are free. #5 at four countries daily on one URL is ~120
page loads/month. #7 is ~30/month. #6 is a one-off capture pass in the tens. #8 is
~60/month. Total well under 500 page loads/month against a 5,000 free allowance — the
$52 balance is not touched by any of this.

**Sequencing note.** #4, #6, #9 all require a Browser worker. Do them as one change:
enable **Worker per stage**, add one Browser-worker capture stage carrying
`html_capture_options`, `wait_page_idle`, `freeze_page`, `verify_requests`, and
optionally `warc_snapshot` — and leave every other stage on the Code worker.

---

## 6. Investigated and rejected

| Thing | Why rejected |
| --- | --- |
| **Browser API / Scraping Browser for geometry** | It genuinely does give real Chrome with layout, `getBoundingClientRect`, JS execution, screenshots, over Puppeteer/Playwright/Selenium ([intro](https://docs.brightdata.com/scraping-automation/scraping-browser/introduction)). But `html_capture_options({coordinate_attributes: true})` delivers the same signal into the existing Cheerio parser with no second runtime and on a per-page rather than $8/GB meter. This is the dependency `PLAN.md:380` already declined; nothing in the docs changes that judgment. |
| **Crawl API for route discovery** | Public OpenAPI documents only `dataset_id`, `include_errors`, `custom_output_fields`. No depth, no glob filters, no scoping, no delta mode. An unbounded domain crawl on a $52 balance is an uncapped bill. `load_sitemap()` is bounded, free-tier friendly, and already inside the collector. |
| **Web Unlocker as the primary block detector** | Scraper Studio already runs on Bright Data's unblocking infrastructure ([intro](https://docs.brightdata.com/datasets/scraper-studio/introduction)). A parallel Unlocker zone adds cost and no detection signal. Kept only as an optional *second opinion* fetch after a block is already flagged (§4.4). |
| **Residential / ISP / Datacenter proxies directly** | Explicitly excluded from the 5,000 free monthly credits; only a $2/7-day trial plus $5/30-day bonus ([free-tier](https://docs.brightdata.com/general/account/billing-and-pricing/free-tier)). `country()` inside the collector gives the same geo routing on the meter Assay is already on. |
| **Bright Data MCP server** | 60+ tools, Rapid/Pro/Groups modes, and Pro includes `scraping_browser_*` automation ([tools](https://docs.brightdata.com/ai/mcp-server/tools)). All of it is an *agent-facing* interface. Assay is a program with a deterministic decision procedure, not an agent. MCP requests draw from the same 5,000-credit pool via Web Unlocker, so it would consume Assay's budget to do what the API already does. Useful for humans debugging Assay; not an engine capability. |
| **SERP API for new-page discovery** | Works (`site:` queries, `--country`, `--language`, structured JSON, $ per request) but discovers what *Google indexed*, on Google's crawl latency, with ranking noise. The site's own sitemap is authoritative, fresher and cheaper. |
| **`brightdata discover`** (AI relevance ranking, `--intent`, geo, date filters) ([cli/commands](https://docs.brightdata.com/cli/commands)) | Same objection, plus an AI relevance score that is not a deterministic input. Assay's whole value is a decision procedure you can audit. |
| **Dataset Marketplace / Web Scraper API (1300+ pre-built scrapers)** | These *are* the thing Assay exists to protect against needing. Ready-made data for known sites; Assay is about custom collectors on arbitrary sites. Orthogonal. |
| **Deep Lookup** | Entity research across 1,000+ sources ([overview](https://docs.brightdata.com/datasets/deep-lookup/overview)). No relation to selector breakage. |
| **`download_fields=html,warc,screenshot`** ([stream-and-file-delivery](https://docs.brightdata.com/datasets/scrapers/scrapers-library/stream-and-file-delivery)) | Looks perfect, wrong product — it is a Web Scraper API (`dataset_id`) parameter, not a Scraper Studio (`collector`) one. The Scraper Studio equivalents are the `warc_snapshot` output-schema field and `tag_html`/`tag_screenshot`. |
| **Proxy Manager** | Open-source local routing tool ([intro](https://docs.brightdata.com/proxy-networks/proxy-manager/introduction)). Scraper Studio manages proxies itself; this would be infrastructure Assay operates for no gain. |
| **`emulate_device('iPhone X')` for responsive-variant detection** | Real capability, and mobile-vs-desktop DOM divergence is genuinely another "variant, not break" class. But Assay scrapes one viewport and has no mobile baseline to compare against — this is a detector for a problem not yet observed. YAGNI. Revisit if a real mobile-layout false positive shows up. |
| **`solve_captcha()` / CAPTCHA solving** | Recovery, not detection. Silently solving a CAPTCHA hides the block signal §4.4 depends on. If anything, Assay wants the block *surfaced*, not solved. |
| **Server-side `custom_validation` / `required` output-schema rules** (C13) | Documented and works ([input-and-output-schema](https://docs.brightdata.com/datasets/scraper-studio/input-and-output-schema)), but duplicates `detect()`'s `shape_mismatch` in a place Assay cannot version, test offline, or reason about. Keep the check in `src/detect.js` where the corpus harness can exercise it. |
| **CLI-driven scheduling** | Does not exist. Verified across the entire command reference ([cli/commands](https://docs.brightdata.com/cli/commands)). Control panel only. |
| **`tag_serp`, `capture_graphql` replay, `Money()`/`Image()` constructors, TOON format, `emulate_geolocation`, `font_exists`, `disable_event_listeners`** | All verified to exist ([functions](https://docs.brightdata.com/datasets/scraper-studio/functions)). None maps to a breakage-detection or heal-gating capability. Noted so the next person does not re-research them. |

---

## 7. Open questions to resolve empirically

Three cheap experiments, each under an hour, each blocking a design decision above.

1. **What does `coordinate_attributes` actually emit?** Enable it on a Browser-worker
   preview run with `tag_html('html')`, download the snapshot, grep for the attributes.
   Blocks §4.1's `SPEC` entries and comparators. Undocumented anywhere in the 5.6 MB
   docs corpus.
2. **What is the Browser-worker CPM multiplier?** Run one page on each worker type and
   read the **Spent** and **Page Loads** columns in the Runs tab. The docs contradict
   themselves; the invoice does not.
3. **Do two triggers of one collector get different exit IPs?** `collect({ip: ...})`
   from a same-country double trigger. Decides whether §4.3 is a reliable detector or a
   probabilistic one.

---

## Appendix: doc sources

Primary index: `https://docs.brightdata.com/llms.txt`. Full corpus:
`https://docs.brightdata.com/llms-full.txt` (5.6 MB, 770 pages) — every "could not
determine" above was checked against this full dump, not just the individual pages.
Any docs URL serves markdown by appending `.md` or sending `Accept: text/markdown`.

- [Scraper Studio functions reference](https://docs.brightdata.com/datasets/scraper-studio/functions) — the single most useful page; every helper cited here
- [Worker types](https://docs.brightdata.com/datasets/scraper-studio/worker-types) — Browser vs Code, Worker per stage, browser-only function list
- [Specifications](https://docs.brightdata.com/datasets/scraper-studio/specifications) — billing, limits, retention
- [Initiate collection and delivery](https://docs.brightdata.com/datasets/scraper-studio/initiate-collection-and-delivery-options) — scheduling, delivery, notifications
- [Error codes](https://docs.brightdata.com/datasets/scraper-studio/error-codes) — `error_code` / `status_code` taxonomy
- [Self-healing tool](https://docs.brightdata.com/datasets/scraper-studio/self-healing-tool) — accept/decline, drafts, Versions rollback
- [AI Flow API overview](https://docs.brightdata.com/api-reference/scraper-studio-api/ai-flow/overview) — programmatic heal + approval gate
- [Input and output schema](https://docs.brightdata.com/datasets/scraper-studio/input-and-output-schema) — 18 field types, validation, `additional_data`
- [WARC snapshots](https://docs.brightdata.com/datasets/scraper-studio/warc-ide)
- [Scraper Studio API quickstart](https://docs.brightdata.com/datasets/scraper-studio/quickstart) — `/dca/trigger`, `/dca/dataset`
- [Build with the CLI](https://docs.brightdata.com/datasets/scraper-studio/build-with-the-cli)
- [CLI command reference](https://docs.brightdata.com/cli/commands)
- [Browser API introduction](https://docs.brightdata.com/scraping-automation/scraping-browser/introduction) · [proxy location](https://docs.brightdata.com/scraping-automation/scraping-browser/features/proxy-location) · [code examples](https://docs.brightdata.com/scraping-automation/scraping-browser/code-examples)
- [Web Unlocker features](https://docs.brightdata.com/scraping-automation/web-unlocker/features)
- [Crawl API overview](https://docs.brightdata.com/scraping-automation/crawl-api/overview) · [reference](https://docs.brightdata.com/api-reference/rest-api/scraper/crawl-api)
- [Residential proxies configuration](https://docs.brightdata.com/proxy-networks/residential/configure-your-proxy) · [geolocation targeting](https://docs.brightdata.com/api-reference/proxy/geolocation-targeting)
- [MCP server tools](https://docs.brightdata.com/ai/mcp-server/tools)
- [Free tier](https://docs.brightdata.com/general/account/billing-and-pricing/free-tier)
- Pricing: [Scraper Studio](https://brightdata.com/pricing/web-scraper/studio) · [Web Unlocker](https://brightdata.com/pricing/web-unlocker) · [Scraping Browser](https://brightdata.com/pricing/scraping-browser)

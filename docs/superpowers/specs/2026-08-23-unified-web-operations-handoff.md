# Unified web operations: repository audit and handoff

Date: 2026-08-23

Status: audit only; no implementation performed

Author: Codex (gpt-5.6, medium reasoning effort), run against the repository at `490b3d9`.

> **Editor's note, added on commit, not by the author.** One figure below has already
> moved. The audit was briefed with `ASSAY_REQUIRE_DB=1 npx vitest run` at **729**
> passing, and states that number as the gate; the suite is at **786** as of `8f31f60`,
> after the Assay Score merge and the healed-reason fix. The count is a moving baseline,
> not an invariant -- the invariants are the four artifacts and the parsed bench, replay
> and sweep figures, which have not moved. Every other claim in this document was spot
> checked against the code before committing, including the sharpest one: criterion 4 is
> indeed *currently false*, not merely untested. `web/app/(app)/library/actions.ts:85`
> says in its own comment that `inspect()` "spends the operator's Bright Data credit per
> call", and `fetchHtml` falls back to Firecrawl at `src/skills/page.ts:285`. Billable
> work happens before any receipt today.

## Verdict

Do not start the six-phase initiative before the 20:00 BST deadline today. It is not a
deadline-sized change. The spec is directionally right about human approval, explicit
uncertainty, provider capability checks, and keeping MapCN presentational. Its proposed
foundation is not ready to implement.

The main problem is section 8. It introduces a second execution and observation graph beside
the graph that currently determines what is published. That is exactly how verification logic
drifts. Assay has just removed one such drift from `tools/sweep.ts`; creating `mission_runs`,
`source_runs`, and `observations`, then dual-writing into them, would recreate the same class of
failure at a much larger boundary.

The deadline recommendation is intentionally short:

- Ship no mission persistence, provider router, MapCN surface, research pipeline, automation
  DSL, or AI visibility work today.
- If submission copy needs updating, describe Web Unlocker and the two documented dataset IDs
  as what is known. Do not claim Discover, Deep Lookup, AI scrapers, or Browser API country
  targeting.
- The only technically useful pre-deadline work would be recording this audit and freezing a
  post-deadline spike list. Even the live spikes below can spend money or process third-party
  data and require explicit approval; they are not casual checks to squeeze in before cutoff.

This audit did not run `bench`, `replay`, `sweep`, or any command that writes `results/`. It did
not run the invariant suite because the request explicitly says that is unnecessary. The
handoff therefore treats the supplied numbers as the required baseline, not as numbers newly
measured in this audit.

## Repository reality the design must preserve

The current product path is deliberately narrow:

```text
fetch or delivery bytes
  -> ingestPage
  -> runTarget(fetchPage)
  -> detect
  -> healGated -> decide
  -> publishRow
  -> runs + field_runs + queue item/proof
```

The important part is not the diagram. It is that each arrow has one implementation.

- `src/runner.ts:1-13` says why `fetchPage` is a parameter: local fetch, replay, and Bright
  Data delivery must use the same detection and gate. `runTarget` receives the fetcher at
  `src/runner.ts:270-301` and calls `publishRow` itself.
- `src/connectors/ingest.ts:162-321` owns the common IO-to-store sequence. It is used by the
  worker and by Bright Data delivery; source-specific code must end at this seam, not branch
  around it.
- `src/heal.ts:232-318` owns the gate arithmetic in exported `decide()`. The comments document
  the concrete failure that occurred when `tools/sweep.ts` held a second copy. `tools/sweep.ts:
  87-115` now calls `decide()` instead of reproducing it.
- `src/envelope.ts:1-55` is the publication boundary. It enforces a closed five-value status
  vocabulary and forces a quarantined cell to `null`. `src/api/schemas.ts:11-44` repeats that
  vocabulary as the executable REST contract.
- `src/store/schema.ts:40-87` defines the current run graph: one `runs` row belongs to one
  target; one `field_runs` row is the published cell and proof. `src/store/index.ts:39-133`
  reserves the canonical run ID and writes run, cell, and queue item in one transaction.
- `src/store/index.ts:160-234` rebuilds the trust envelope, proof explanation, and held-cell
  reads directly from `field_runs`. Existing monitoring screens do the same; for example,
  `web/app/(app)/schedule/data.ts:77-149` maps `runs` plus `field_runs` into its UI outcome.

The invariant gate for any future slice must be parsed, not treated as a collection of exit
codes:

- `npm test`: exactly 34 engine assertions and `all checks pass`.
- `npm run bench`: exactly 153 cases; `margin gate (t0.6/d0.16)` must read
  `60.8% 64.7% 0.0% 35.3%`. The `0.0%` VALUE WRONG figure is the claim.
- `npm run replay`: 74 runs / heal 66 / abstain 0.
- `npm run sweep`: recommends tau 0.6 / delta 0.16 at 0.0% wrong.
- `results/events.jsonl`, `results/bench.json`, `results/rows.jsonl`, and
  `results/sweep.json` remain byte-identical.
- `ASSAY_REQUIRE_DB=1 npx vitest run`: exactly 729 passing. The variable is mandatory.
  `test/setup.test.ts:3-5` and `test/health.test.ts:8-9` document why a missing database can
  otherwise produce a vacuous green result.

Any future acceptance report must quote those parsed values and artifact hashes/diffs. “Tests
passed” is not evidence for this repository.

## What can be reused

Only files opened during this audit are listed here.

### Domain, execution, and persistence

| Existing code | Reuse | Limit |
| --- | --- | --- |
| `src/runner.ts:126-301` | Keep as the only DOM monitoring evaluator and publication path. New page providers inject bytes through `fetchPage`. | It evaluates one baseline/field, not a record set, research claim, or mission matrix. |
| `src/connectors/ingest.ts:162-321` | Reuse for any source that can honestly become page bytes or one deterministic structured record. | It creates one target run. It is not a mission planner and must not be made aware of provider brands. |
| `src/heal.ts:257-318` | Reuse `decide()` everywhere the question is specifically the existing top-two DOM candidate gate. | Do not use it as generic “verification” for research authority, citation truth, geo equality, or action conditions. |
| `src/envelope.ts:9-55` and `src/api/schemas.ts:11-44` | Reuse as the only existing monitoring publication contract. | The spec's `verified`, `different`, `not_observed`, and `collection_failed` are not legal `FieldStatus` values. |
| `src/store/schema.ts:13-87` | Keep `targets`, `runs`, and `field_runs` authoritative for existing monitoring. | A target is one watched page/contract and, in practice, one target row per field (`src/setup/index.ts:186-187`). It is not a mission source. |
| `src/store/schema.ts:263-308`; `src/store/conversations.ts:16-85` | Reuse conversations and the work rail. A nullable mission link can be added later without fabricating old conversations. | A conversation currently owns at most one `scraperSlug`, with no FK. Do not overload it as mission execution state. |
| `src/schedule.ts:1-23`; `src/store/index.ts:236-327` | Reuse cadence arithmetic, due-target claiming, and worker liveness for target monitoring. | The schedule is one `next_run_at` per target. It cannot express one atomic mission run across sources/viewpoints. |
| `src/store/index.ts:198-227` | Reuse proof reconstruction and IDs as the compatibility source for old monitoring. | New observation proof cannot be a nullable decorative link; published data needs a durable, authorized proof record. |

### Provider and source boundaries

| Existing code | Reuse | Limit |
| --- | --- | --- |
| `src/skills/page.ts:1-29, 103-265` | Reuse guarded direct fetching and its redirect/body limits. | Its documented DNS-rebinding window (`:119-132`) becomes unacceptable once model/provider-discovered URLs, rather than operator-typed URLs, are fetched. |
| `src/connectors/brightdata.ts:64-185` | Reuse constant-time inbound bearer verification, gzip/JSON/NDJSON decoding, and HTML-first delivery parsing. | `postDelivery` buffers `request.arrayBuffer()` before any wire-size cap (`src/connectors/handlers.ts:91-103`). The 64 MiB cap is inflated output, not a cap on an uncompressed request body. |
| `src/connectors/record.ts:141-239` | Reuse deterministic JSON-record-to-HTML rendering where its constraints are met. | It is an identity/drift adapter, not evidence that a structured provider value is true. Values outside 2..200 chars are not candidates (`:33-41`). |
| `src/connectors/scrapers.ts:78-134` | Reuse the two documented dataset catalog entries: Instagram `gd_l1vikfch901nx3by4` and LinkedIn people `gd_l1viktl72bvl7bjuj0`. | Documentation IDs do not prove account entitlement, response shape, price, or production suitability. The LinkedIn people dataset also conflicts with the first-release personal-data non-goal. |
| `src/connectors/scrapers.ts:396-453` | Reuse bounded sync/snapshot handling and deterministic field enumeration for an explicitly approved dataset spike. | It is Bright Data-specific execution, not a provider capability registry. |
| `src/bd/diffgate.ts:1-42, 120-201` | Keep as a separate gate over proposed collector code. | It gates code, not output rows, uses regex rather than a parser, and is fitted to one transcript. `test/bd-diffgate.test.ts:1-11` makes n=1 explicit. It cannot certify a general `StructuredScraperProvider`. |
| `src/connectors/config.ts:49-120` | Reuse server-only connector config and “presence, never value” conventions. | A capability registry needs timestamps, probe versions, account/zone identity, cost units, and production-tested state without returning secrets. |

### Authority, API, routes, and UI

| Existing code | Reuse | Limit |
| --- | --- | --- |
| `src/agent/index.ts:1-51, 426-577` | Reuse the structural authority pattern: read-only tools, operator-selected URL indices, closed model output, and no publishable values. | The current reply schema only proposes a watch. A mission parser must remain equally narrow; a free string for provider URLs, claims, action destinations, or values would break the guarantee. |
| `src/setup/index.ts:219-315` | Reuse confirmed watch creation and baseline establishment through `ingestPage`. | It writes targets and performs the first fetch. It is not a no-persistence preview. |
| `src/api/keys.ts:1-11, 20-81` | Reuse hashing, one-time plaintext display, Bearer-only transport, revocation, and constant-time checks. | There is one all-powerful key. A read key can currently mutate targets, connectors, brakes, and decisions. Mission APIs must not ship on this authorization model. |
| `src/api/webhooks.ts:13-57, 112-145` | Reuse the closed event vocabulary pattern and HMAC format. | Delivery lacks timeout, retry policy, idempotency storage, destination SSRF checks, and redirect policy. Signing a request does not make its destination safe. |
| `/`, existing conversation rail | `web/app/(app)/composer.tsx:55-206`, `web/app/(app)/layout.tsx:17-42`, and `web/components/conversation-list.tsx:24-73` are the right shell to extend. | Current Home persists the first operator turn before interpretation (`web/app/(app)/watch.tsx:134-177`). This contradicts section 25(4) if “no persistent operation” is literal. |
| `/explain/[proof]` and `ProofDetail`/`ProofSheet` | Reuse `web/app/(app)/explain/[proof]/page.tsx:13-57`, `web/components/proof-detail.tsx:8-57`, and `web/components/proof-sheet.tsx:22-43`. | They currently assume a proof reconstructible from `field_runs`. A mission observation needs an adapter or a proof source that preserves the same durable contract. |
| `/decisions` | Reuse `web/app/(app)/decisions/page.tsx:12-38` and the keyboard-oriented candidate decision concepts in `decision-card.tsx:34-139`. | Do not turn it into a generic action/task inbox; `docs/FEATURES.md:384` explicitly refuses a second notification inbox. |
| `/schedule` | Reuse the existing calendar and liveness vocabulary (`web/app/(app)/schedule/data.ts:1-17`, `schedule/page.tsx:11-53`). | Extend it only by projecting mission facts clearly. Do not mix projected future work with executed runs or make the web app a second scheduler. |
| Status and accessibility primitives | `web/components/status-line.tsx:4-53` already pairs text, glyph, and color; the existing proof sheet handles dialog labelling and narrow screens (`proof-sheet.tsx:57-68`). | These primitives do not satisfy map/table/composer accessibility by themselves. |

The recommended route shape in section 15 is compatible with the current Next app shell. The
existing `/compare` should remain the cross-run scraper diff, as the spec says. No current `/m/*`
route exists.

## Boundary conflicts and corrections

### 1. The provider interface is drawn one layer too late

Section 16 says provider adapters return “raw observations.” For existing monitoring, that is
already too interpreted. A page provider should return bytes plus collection metadata and stop.
`src/runner.ts` takes `fetchPage` specifically so the engine, not the provider, detects, heals,
gates, and publishes. Calling provider rows “observations” invites adapters to attach Assay states
or bypass `runTarget`.

Use these boundaries instead:

```text
provider adapter -> raw bytes/record + provider metadata
source normalizer -> deterministic candidate document/typed raw facts
verification policy -> one family-specific decision implementation
publication projector -> trust envelope + proof
API/UI/automation -> consume the published decision; never recompute it
```

For DOM identity, the verification implementation is `evaluate()` / `healGated()` / `decide()`.
For research corroboration or AI citation presence, a new verifier may be needed, but it must be
one implementation shared by worker, tests, API, UI, and automation. “Use one verifier” does not
mean forcing every question through the DOM margin arithmetic.

### 2. Section 8 mixes three different state axes

The proposed `observations.status` union combines:

- collection outcome: `collection_failed`, `not_observed`;
- verification quality: `verified`, `withheld`;
- comparison result: `different`.

Research later adds `single_source`, `conflicting`, and `stale`, making the mix worse. This conflicts
with the closed publication vocabulary in `src/envelope.ts:9-13` and its runtime rejection at
`:40-47`. `different` is not lower quality than `verified`; a value can be verified and different.
A failed collection has no observation to verify.

Split the model into orthogonal, closed fields such as `collection_state`, `verification_state`,
and optional `comparison_state`. Keep existing `FieldStatus` unchanged for target monitoring. Any
projection from new state to an existing published cell must be centralized and exhaustively
tested. Do not widen `FieldStatus` to fit mission concepts.

### 3. Dual-write is not a compatibility strategy

Section 8.3 proposes writing new monitoring runs to both `field_runs` and `observations`. That
creates two claims about the same cell and no declared authority when they disagree. It also makes
transaction boundaries unclear: `recordRun()` currently writes run, field cell, and queue item in
one transaction (`src/store/index.ts:80-132`). A second transaction can succeed or fail
independently; a larger transaction couples the proven path to an experimental schema.

Use a read adapter first and for longer than the spec suggests. Existing target monitoring writes
only `runs`/`field_runs`. Mission reads link to those rows. A later observation store is permitted
only for genuinely new source families and only after its publication boundary is defined. There
should be no same-fact dual-write in the first release.

### 4. Adding foreign keys directly to `runs` is premature

A `mission_run_id` and `viewpoint_id` on `runs` imply every target run belongs to at most one
mission execution and viewpoint. That has not been established. One existing target could be reused
by multiple missions; one independently scheduled target run may satisfy several mission reads.
Use an explicit link table from mission execution/source execution to existing `run_id` instead.
It preserves old rows and supports reuse without rewriting history.

Likewise, adding `mission_id` directly to every per-field target duplicates the same mission edge
across all targets created for one page. A mission-to-target link table better reflects the current
one-target-per-field reality and does not force ownership where the relationship may be reuse.

### 5. The planner conflicts with scheduling policy

`docs/FEATURES.md:383` overturns the blanket scheduling refusal only far enough for Assay to own
declared cadence; it still says Assay does not execute the job. Section 8.4 and Phase 2 introduce a
planner that fans out provider executions across sources and viewpoints. That is orchestration, not
just declared schedule. The spec does not decide whether Bright Data schedules and delivers these
runs, the existing worker claims them, or a new mission worker does. Building all three would create
duplicate runs and a new on-call surface.

Choose one executor per source capability during the contract spike. Persist an execution plan and
idempotency key before dispatch. The web request must never wait on or own a long-running provider
job.

### 6. The receipt rule conflicts with current Home

The current first message creates a conversation before the model answers
(`web/app/(app)/watch.tsx:154-177`; `src/store/conversations.ts:16-24`). The current read-only agent
may also call `fetchHtml`; if direct fetch fails, that function may invoke an enabled paid connector
(`src/skills/page.ts:20-29`). Therefore “no persistent or billable operation occurs before an
interpretation receipt is approved” is false under a literal reading.

The defensible requirement is:

> Conversation/audit persistence may occur before receipt approval. No target, schedule, mission
> activation, provider collection, public API, or enabled action authority may occur before the
> relevant explicit approval. Any potentially paid preview has its own prior cost receipt.

Intent parsing itself should not inspect a page through a paid fallback. Separate “parse the
operator's words” from “preview a source.”

### 7. Structured records do not inherit the benchmark claim

`recordToHtml()` is a good adapter. It is deterministic, escapes untrusted strings, and allows the
unchanged DOM engine to rank a renamed key. It does not prove the spec's assumption that structured
provider output can be automatically verified by the existing gate.

The measured renamed-key example ranks the correct key but scores about 0.538 versus 0.438, below
tau 0.60. It abstains. `test/record.test.ts:246-259` intentionally asserts only that the correct
element wins and has a positive margin; it refuses to assert threshold transfer. `docs/LIMITATIONS.md:
120-144` explains why: the corpus is one long prose field in one vertical.

Consequences:

- Structured scraper records may enter preview/review-required mode through the renderer.
- A provider-returned row is not “verified” merely because the key remained stable.
- Research facts need source authority, exact evidence, freshness, conflict, and schema policies.
- AI mention/citation checks need platform fixtures and deterministic derivation from the collected
  response. The DOM key-healing gate only protects adapter-field continuity.
- Price, availability, numeric counts, claims, and citations need representative corpora before
  automatic publication.

### 8. Bright Data's collector diff gate is not a capability guarantee

`src/bd/diffgate.ts` answers whether proposed collector code destroys one known invariant. It does
not evaluate output rows, semantic truth, geographic behavior, cost, or general provider quality.
Its regex rules are explicitly derived from one 2026-08-21 transcript
(`test/bd-diffgate.test.ts:1-11`). The provider registry therefore needs at least these independent
dimensions:

- account/zone entitlement;
- transport contract tested;
- output schema fixture recorded;
- Assay normalization tested;
- verification policy calibrated for the field family;
- collector-code diff policy, if Scraper Studio healing is used;
- production tested date/sample count;
- cost unit and observed charge.

One green dimension must never collapse the rest into `available`.

## Smallest migration that does not change monitoring

1. **Contract spikes only.** No schema or UI. Record redacted fixtures, error contracts, units, and
   capability decisions outside production execution. Remove unavailable providers from release
   scope.
2. **Pure intent schema and renderer.** Define versioned intent parsing as a pure, read-only
   proposal. It cannot fetch, persist a mission, create a target, schedule, publish, or enable an
   action. Render a receipt from the validated structure; the model supplies indices/closed enums,
   not values or arbitrary destinations.
3. **Draft/version persistence only.** Persist `missions` and append-only `mission_versions` after
   making conversation persistence an explicit exception. Do not add mission columns to `targets`
   or `runs`. Draft/approved/active must be separate facts; approval records actor, version, time,
   cost ceiling, and exact authority granted.
4. **Watch-only compatibility slice.** On approval, call the existing `createTarget()` path. Add a
   mission-to-target link table and read existing `runs`/`field_runs` through an adapter. No
   `observations` table and no dual-write. Prove byte-for-byte/API-equivalent monitoring output.
5. **Mission execution ledger, still no new verifier.** Add mission/source execution records and
   link them to existing target `run_id` values. Define idempotency, partial failure, cancellation,
   budget reservation, and completion semantics before dispatching any provider.
6. **One new source family in review-required mode.** Prefer a bounded Web Unlocker page flow
   because the zone is known to work and it can still feed page bytes to the existing runner. Do not
   claim new-field calibration. Keep publication human-reviewed.
7. **Only then add a new observation store.** Use it for facts that cannot be represented as an
   existing target field. Keep collection, verification, and comparison states orthogonal. Every
   publishable fact has a non-null durable proof relation. Automations consume the published state;
   they do not recalculate verification.

This path keeps existing monitoring single-write throughout. The adapter is not temporary debt to
remove during the initiative; it is the compatibility boundary.

## Missing requirements

### Security and data governance

- The model-output grammar for missions is missing. The current agent structurally cannot return a
  URL not typed by the operator or a publishable value (`src/agent/index.ts:25-51`). Mission parsing
  must give the model no free channel for values, source authority, action destinations, or enabled
  authority.
- Provider-discovered URLs invalidate the current SSRF threat assumption. Pin DNS to the validated
  address or use an egress proxy that enforces public-address policy on every connection and
  redirect. Apply the same policy to Web Unlocker/Browser targets and webhook destinations.
- Outbound webhook delivery needs destination allowlisting, redirect refusal/revalidation,
  connect/read timeouts, response-size limits, retry classification, persisted attempts, and an
  idempotency header. `src/api/webhooks.ts:116-143` currently has none of these except signing.
- Inbound mission delivery needs a compressed wire-size cap before `arrayBuffer()`, not only the
  current post-buffer inflate cap. It also needs per-mission secrets, rotation, replay keys that do
  not mistake legitimate identical observations for replay, and late-delivery handling.
- The spec excludes organizations/RBAC while introducing mission APIs, action authority, and
  connector destinations. The current schema is explicitly single-instance with no owner
  (`src/store/schema.ts:1-2, 290-292`). State whether version one is strictly single-operator. If it
  is not, RBAC is not a non-goal.
- API scopes need deny-by-default route enforcement, not scope strings stored beside the existing
  all-powerful key. Specify mission allowlist semantics, proof authorization, key expiry, rotation,
  and audit retention.
- Define retention and deletion for prompts, raw HTML, AI responses, evidence spans, provider
  metadata, and personal data. Bright Data retention is not Assay retention.
- Add legal/data-use review: robots/terms, copyright evidence display, personal-data minimization,
  dataset licensing, AI platform terms, local GeoJSON provenance/license, and MapCN copied-code
  update/license procedure.
- Specify secret redaction for nested provider errors and fixtures. Do not persist tokens or full
  connector payloads in `intent_json`, `locator_json`, `response_metadata`, traces, or proof.
- Fix the credential-storage precondition before adding providers. `src/connectors/config.ts:13-20`
  says the connector secret file defaults inside the repository and `data/` is not ignored. A
  capability registry must not normalize that known foot-gun into a supported production setup;
  require an outside-repository path or a real secret store and fail closed on unsafe permissions.
- Define prompt-injection tests for discovery pages and AI answers. Scraped instructions have zero
  authority, but that must be enforced by tool shape, not only a system prompt.
- Currency normalization needs a trusted provider, timestamp, licensing, failure state, precision,
  and proof. A converted value must never gain more authority than the observed value.

### Cost

- “Requests” is not a universal unit. Browser API is bandwidth-priced; datasets can have per-record,
  snapshot, enrichment, storage, or download charges. Store provider, product, unit, quantity,
  currency, price version/time, and whether taxes/credits are included.
- Include retries, polling, redirects, pagination, discovery fan-out, screenshots/WARC, failed calls,
  webhook delivery, currency lookups, and fallback in estimates and actuals.
- Reserve budget atomically before dispatch. Define what happens when concurrent source runs race
  for the remaining cap, when actual usage arrives late, and when a provider charges despite a
  failed result.
- A cost range without a maximum is not authority. Approval must record a hard ceiling and the
  behavior at the ceiling: stop undispatched work, preserve completed results, mark budget-exhausted,
  and do not silently fall back.
- “Free preview” needs a machine-verifiable provider rule and expiry. A credit balance is not the
  same as a free call.
- Estimates belong to the immutable mission version, while actuals belong to attempts/source runs.
  Section 18 says this, but section 8 only puts estimates on `mission_runs`; reconcile the schema.
- Add per-account and per-credential concurrency/rate limits, not only per provider. Capability
  probes themselves need rate and cost limits.

### Failure and lifecycle states

- Define transition tables for mission, mission run, source run, action rule, and action attempt.
  The proposed strings have no legal transitions, terminality, retry rules, or actor.
- Add at least: queued, dispatching, awaiting_provider, partially_complete, canceled,
  cancel_requested, timed_out, budget_exhausted, normalization_failed, verification_failed/withheld,
  and capability_changed. “failed” is too broad to operate.
- Define mission-run completion under partial source/viewpoint failure. Automations must wait for a
  declared completeness policy, not merely a status string called complete.
- Define idempotency uniqueness constraints and crash recovery. The spec names keys but not the
  transaction that claims one attempt, nor behavior for callback-before-commit, duplicate callback,
  late callback, or process death after sending.
- Define version pinning when a mission or action rule changes during an active run. Pausing or
  deleting a mission must not erase proof or reinterpret an in-flight run.
- Distinguish not requested, provider unsupported, account unavailable, collection failed, no result,
  normalization failed, evidence conflict, and verification withheld. Do not compress these into
  `not_observed`.
- Define stale and transition semantics per source/viewpoint. Missing current data must never become
  unchanged, not-cited, or a negative automation event.
- Define retries separately for collection and action delivery. A retry of an action must never
  re-evaluate the business condition; the spec says this but does not define the persisted input that
  makes it enforceable.

### Accessibility and responsive behavior

- Specify WCAG target/version and a test matrix (keyboard, screen reader/browser pairs, forced
  colors, 200%/400% zoom, reduced motion, touch, and no WebGL). “Complete accessible fallback” is
  not a test plan.
- Horizontally clipped mode chips need roving focus or ordinary tab order, keyboard scrolling,
  visible focus, and a non-visual indication that more choices exist. Edge clipping alone only helps
  sighted pointer users.
- Dynamic controls and receipt updates need named live regions, error association, focus placement,
  and focus restoration. Announcing every keystroke would be unusable; specify when announcements
  occur.
- Receipt approval must expose cost and authority in semantic text before the button, with validation
  summaries and errors connected using `aria-describedby`/`aria-errormessage`.
- Map interaction needs labelled zoom/reset controls, focus order, popup escape/return behavior,
  touch equivalents, no hover-only facts, and no keyboard trap. The table must offer every selection
  and proof action independently of the map.
- Result tables need captions, row/column headers and `scope`, sortable-state announcements, focus
  behavior for stacked mobile rows, and a rule against inaccessible virtualization.
- Patterns/glyphs need forced-color and high-contrast behavior; map shapes must remain distinguishable
  at zoom and for small countries. Provide a list/table selector when a country cannot be targeted on
  the geometry.
- Specify locale/RTL behavior for country names, dates, currencies, decimal separators, and the
  receipt's timezone. Country must not silently infer language or locale after approval.
- Background completion needs a persistent status in addition to a live announcement, and must not
  steal focus. Failure and partial completion require the same treatment.

## Conflicts with `docs/FEATURES.md` section 4

- **Confidence percentages:** the spec correctly refuses a universal confidence score, but
  “entity deduplication confidence” in section 10.4 is undefined. If it becomes a user-facing float,
  it violates `docs/FEATURES.md:375`. Use a closed decision state with evidence and withhold on an
  unresolved match.
- **Fleet dashboard:** mission result tables and a mission-specific run log are defensible. A generic
  “dashboard” output, aggregate “fully verified” KPI tiles, provider health gauges, or AI visibility
  rollups would violate `docs/FEATURES.md:381`. The dated overturn allows a Night Report/log, not
  gauges or percentages.
- **Scheduling/orchestration:** the spec's mission planner goes beyond the dated overturn at
  `docs/FEATURES.md:383`, which permits declared cadence but says Assay still does not execute the
  job. This must be explicitly re-decided, not smuggled in as foundation plumbing.
- **Policy editing:** field verification thresholds and autonomy remain repo-reviewed contracts
  (`docs/FEATURES.md:379-380, 395-405`). The adaptive composer may propose them, but must not create a
  “loosen threshold” or global auto-approve control. Broadening an automation similarly needs a
  durable, diffable approval record.
- **Notification inbox:** “create internal Assay review item” must either be a held decision that
  belongs in `/decisions` or be cut. A generic automation inbox conflicts with
  `docs/FEATURES.md:384`.
- **LLM explanation:** interpretation prose can be deterministic rendering of a validated intent.
  Research and incident explanations must not become model-authored causal narratives; that is the
  anti-feature at `docs/FEATURES.md:377` and `docs/AI-AND-AGENTS.md:184-205`.
- **Wizard/screen expansion:** the spec avoids a feature-card landing page, which is good. Six modes,
  receipt, source review, API management, automation management, map results, and visibility results
  nevertheless overturn the “two screens” posture at `docs/FEATURES.md:418-420`. That may be a valid
  new product decision, but the spec must acknowledge it rather than claiming pure reuse.

## Bright Data contract spikes required before planning

Account facts to treat as fixed until a new live check says otherwise:

- Active zone `cli_unlocker`, type `unblocker`.
- Active zone `cli_browser`, type `browser_api`.
- Web Unlocker raw request works with `POST https://api.brightdata.com/request`, zone
  `cli_unlocker`, and `format: raw`.
- Documentation confirms the Instagram and LinkedIn dataset IDs listed above.
- Discover, Deep Lookup, AI scrapers, and Browser API country targeting are **untested**, not
  available. Do not copy the stronger rulings from spec section 9.2 into product state.

### Safe, non-billable probes

- `GET /zone/get_active_zones`: auth and zone inventory only. It is already complete; repeat only
  when the cached result expires or credentials change.
- Dataset/marketplace metadata GETs that are documented as non-triggering: verify that each selected
  dataset is visible to this credential and record metadata schema, last-checked time, and terms.
  Metadata visibility is not collection entitlement.
- Local fixture/schema parsing, secret-redaction, and adapter tests: no vendor call.

Do not use malformed paid requests as capability proof. A validation error proves only that a route
recognized the request, not that the account can complete or afford it.

### Explicitly approved, minimal paid/side-effecting spikes

1. **Discover:** one bounded valid query with the smallest documented result limit. Record HTTP
   contract, result schema, pagination, empty result, error shape, latency, and actual charge. Until
   this succeeds, research must not depend on Discover.
2. **Browser API country targeting:** use `cli_browser` for two explicitly selected countries on a
   benign public endpoint/page whose country response can be independently observed. Record the CDP
   connection/options, egress country evidence, bytes charged, failure shape, session cleanup, and
   whether the account permits the requested countries. An active browser zone does not prove geo
   targeting.
3. **Prebuilt datasets:** if a release actually needs one, trigger a single public, non-sensitive
   record for the selected dataset. Record exact row schema, null/error rows, async/sync behavior,
   record count, charge, and a redacted fixture. Do not spike LinkedIn people merely because its ID
   is known; personal-data enrichment is out of scope.
4. **AI scrapers:** choose at most one first-release platform, discover its actual dataset ID from
   account-visible metadata, and run one benign prompt in one country. Record whether prompt,
   citations, answer sections, URLs, country/locale, errors, and cost are actually returned. Repeat
   per platform before adding an adapter; documentation listing a platform is insufficient.
5. **Scraper Studio capability, if used:** probe the exact collector read/preview/approval endpoints
   with a non-production collector or a no-save flow. Keep `diffGate` as one code-review signal, not
   the output verifier.

### Capabilities to remove from the initial plan unless a spike succeeds

- Deep Lookup. Do not probe it simply to preserve the roadmap; there is no first-release dependency.
- Discover-backed research.
- AI visibility for any platform without a paid sample contract.
- Country comparison through Browser API. Web Unlocker working does not imply country selection.
- City targeting, SERP, arbitrary “1000+ scraper” routing, or AI platform fallback.

Capability state must therefore distinguish `zone_present`, `metadata_visible`, `contract_sampled`,
`verification_calibrated`, and `production_tested`. The spec's single `available` state is too coarse.

## Recommended independent slices

These are post-deadline. Stop after any slice whose evidence fails.

1. **Capability inventory and fixtures.** Read-only cached probes plus explicitly approved minimal
   contracts. No composer and no mission schema. Test redaction, cache expiry, state mapping, and
   “one product unavailable does not mean connection failed.”
2. **Pure mission intent.** Zod schema, shortcut normalization, deterministic receipt, ambiguity,
   and cost-unit multiplication with no IO. Test structural inability to create values, destinations,
   persistence, schedules, or provider calls.
3. **Draft/approval ledger.** Append-only mission versions and approval facts only. Test version
   pinning, actor/time/cost ceiling, approval revocation, and that a draft has no execution authority.
4. **Watch compatibility.** Approved watch intent calls existing `createTarget`; link mission to
   existing target rows; render old `runs`/`field_runs` via an adapter. Run the full hard invariant
   gate and add DB equivalence tests. No observations table.
5. **Execution ledger and budget reservation.** Persist deterministic source/viewpoint plans,
   idempotent dispatch claims, partial failure, cancellation, and budget exhaustion. Use fake
   providers only.
6. **One verified page provider.** Web Unlocker is the best candidate because raw HTML is already
   known to work. Feed bytes through the existing ingestion seam. Launch review-required, measure
   actual cost, and do not alter the gate.
7. **Geo comparison without MapCN.** Two sampled country observations, orthogonal comparison state,
   explicit reference, authoritative accessible table, proof links, and partial failure. Only after
   Browser country targeting is proven. Add the map as a later presentation-only slice.
8. **Mission API read surface.** Immutable version, explicit withheld cells, proof/run addressing,
   scoped keys, ETags, pagination, and auth matrix. No SDK generation until the contract is stable.
9. **Dry-run automation evaluator.** Pure conditions over already-published observation states,
   historical simulation, suppression reasons, idempotency keys, and caps. No connector send.
10. **One reversible action connector.** Persist attempt before send, enforce destination policy,
    retry without re-evaluation, and require a separate enable approval. Start with one connector,
    not Slack + Discord + email + webhook + spreadsheet/database.
11. **Bounded research in review-required mode.** Only after Discover or an alternative discovery
    contract is proven. Add evidence spans, conflicts, freshness, and dedupe states before any
    automatic publication.
12. **One-platform AI visibility.** Last. One platform, prompt, viewpoint, and fixture family; facts
    only; no universal score. Expand platform by platform, never behind a universal adapter claim.

Cut Phase 6 entirely from the first release. Cut Deep Lookup entirely. Defer MapCN until the table
and geo collection contract work without it. Do not build a generalized provider router before two
real provider contracts demonstrate a shared boundary.

## Section 25 acceptance criteria, individually audited

Legend: **testable** means a deterministic test can be written from the words as they stand;
**vague** means the criterion needs a defined support matrix or pass condition; **untestable as
phrased** means it asserts an absolute, legal fact, or external billing fact without an observable
contract.

1. **“A user can start every supported goal from one composer.” — Vague.** “Supported goal” is
   circular. Publish a versioned support matrix and write one E2E per row. “Start” must mean reach an
   interpretation receipt, not execute it.
2. **“Free-form text works without selecting a mode.” — Vague.** Define the accepted prompt corpus,
   required ambiguity behavior, and expected normalized intents. Otherwise any response can be
   called “works.”
3. **“Shortcut selection updates the prompt without navigating away.” — Testable.** Assert URL,
   conversation, typed text, focus, history, and selected state remain intact. The spec elsewhere
   says placeholder/context controls change; clarify whether the literal prompt text should change.
4. **“No persistent or billable operation occurs before an interpretation receipt is approved.” —
   Partly testable and currently false.** Database writes can be tested and Home currently writes the
   conversation first. External billing is untestable without a provider usage ledger. Replace it
   with the scoped requirement proposed above and spy on every dispatch boundary.
5. **“Cost multiplication is visible for sources, prompts, and viewpoints.” — Testable after unit
   definition.** Assert the exact formula, units, retries/pagination policy, currency, range, and
   maximum. A request count is not a Browser API cost estimate.
6. **“Existing monitoring behavior and benchmark results do not regress.” — Vague as written; make
   it exact.** Replace it with the full invariant list in this handoff, including parsed output,
   exactly 729 DB tests under `ASSAY_REQUIRE_DB=1`, and byte-identical committed artifacts.
7. **“Research works without Deep Lookup and explains its absence precisely.” — Vague.** Define one
   bounded prompt, source contract, result/evidence states, expected Deep Lookup capability state,
   and the exact safe copy. Discover is not yet known to work either.
8. **“Website APIs expose withheld observations explicitly.” — Testable.** Contract-test every
   format so the key is present, value is null, state/reason/proof are present, and ETag/history do
   not erase the distinction.
9. **“API keys are scoped to allowed missions and capabilities.” — Testable.** Use a deny-by-default
   authorization matrix across every read and mutation route, including proof IDs and list endpoints.
10. **“Automations default to dry-run and never fire from withheld or missing data.” — Testable.**
    Unit/property-test every state and transition, then integration-test persisted attempts and
    retries. Define `missing` across collection and verification axes.
11. **“Geo comparisons show an explicit reference viewpoint.” — Testable.** Assert receipt, result
    table, API, map label, proof context, deterministic default, and user correction.
12. **“MapCN is lazy-loaded and has a complete accessible table fallback.” — Partly testable, partly
    vague.** Bundle/network tests can prove lazy loading. “Complete accessible” needs the task and
    assistive-technology matrix listed above.
13. **“No default commercial basemap is shipped without appropriate licensing.” — Untestable as a
    legal conclusion.** Test no remote basemap/tile requests and require a reviewed license inventory
    for MapCN code, MapLibre, and local GeoJSON. Legal suitability needs an accountable reviewer.
14. **“AI visibility reports observable facts, not a synthetic universal score.” — Testable after
    schema closure.** Forbid score/overall/rating fields and generated truth claims; require each
    reported fact to point to captured platform evidence and adapter version.
15. **“Every published observation is traceable to proof.” — Testable after defining published.**
    Enumerate REST, webhook, CSV/export, UI, and automation inputs; enforce non-null proof relation
    and successful authorized resolution for each. Do not leave `proof_id nullable` as section 8
    proposes for publishable rows.
16. **“Provider failures and verification uncertainty remain separate states.” — Testable.** Model
    them as orthogonal fields and exhaustively test projections. The proposed single status column
    does not meet the criterion.
17. **“Bright Data credentials never reach the browser or consumer API.” — Untestable as an
    absolute, but can be made high-confidence.** Use sentinel credentials in bundle/RSC/HTML/API/log
    tests, static client-import checks, nested-error redaction tests, and runtime traffic inspection.
    Enumerate surfaces and fail closed; do not claim mathematical proof of “never.”
18. **“New field families are benchmarked or kept review-required.” — Vague.** Define what counts as
    a field family, representative corpus size/composition, the wrong-publication ceiling, required
    abstention reporting, approval owner, and the enforceable review-required state. A benchmark with
    no passing threshold satisfies the sentence while proving nothing.

Only criteria 3, 8, 9, 10, 11, and 16 are directly testable with modest clarification. Criteria 13
and 17 cannot be proven as phrased. The rest need rewritten pass conditions before implementation,
not after.

## Decisions required before an implementation plan

1. Is pre-receipt conversation persistence allowed? It should be, explicitly, while mission and
   authority persistence remain forbidden.
2. Who executes each source: Bright Data scheduler, existing Assay worker, or a new mission worker?
   Pick one per capability.
3. Is version one strictly single-operator? If not, remove RBAC from non-goals.
4. What is the authoritative new-observation publication boundary, and how does it preserve the
   existing five-status trust envelope without mixing collection and comparison state?
5. What exact corpus and wrong-publication ceiling permits automatic publication for each new field
   family?
6. Which single provider/source family is first after the account contract spikes?
7. Is a mission-specific results surface an explicit overturn of the two-screen/CLI-first posture in
   `docs/FEATURES.md`? If yes, record the overturn and its boundary.

Until those are answered, “mission foundation” is not a foundation. It is a set of nouns around an
undefined publication and execution boundary.

# Assay unified web operations

Status: design proposed for review
Date: 2026-08-23
Audience: Assay maintainers, implementation agents, product and design reviewers
Scope: unified composer, research missions, website-to-verified-API, decision automations, geographic comparison with MapCN, and AI visibility

## 1. Executive summary

Assay already performs verified recurring monitoring. The next product step is not another monitoring dashboard. It is a single goal-driven interface for creating five related kinds of web work:

1. Research a question across unknown public sources.
2. Turn web observations into a maintained, versioned API.
3. Trigger safe actions only when verified conditions become true.
4. Compare what a website or search experience shows in different countries.
5. Measure how AI answer systems mention, cite, and describe a brand across prompts and countries.

The user enters every goal through the existing Home composer. Six visible shortcuts reshape that composer:

```text
Watch | Research | Build API | Automate | Compare locations | AI visibility
```

These are presentation shortcuts, not six backend products. Assay converts each prompt into one structured mission proposal. The model may propose the interpretation, sources, fields, viewpoints, cadence, and outputs. A human must approve the proposal before Assay creates persistent work or starts billable collection.

The central product rule remains unchanged:

> The model proposes. Assay verifies. A human approves authority.

Bright Data supplies access, browser execution, discovery, structured scrapers, country-specific sessions, scheduling, and delivery. Assay supplies contracts, abstention, provenance, comparison, cost visibility, action policy, and the user-facing explanation of uncertainty.

MapCN supplies only the geographic rendering layer. It never interprets raw data, calculates trust, normalizes values, or chooses a result.

## 2. Locked decisions

The following decisions are approved and should not be reopened during implementation without new evidence:

- Use one intelligent prompt bar on Home.
- Show optional mode shortcuts inside or immediately beneath the composer.
- Let free-form text select a mode automatically. Shortcut selection is never required.
- Treat `Build API` and `Automate` as output intents internally, even though they appear as user-facing modes.
- Show an interpretation receipt before persistence or billable execution.
- Keep the existing Assay voice: direct, first-person when appropriate, factual, and willing to say what it could not establish.
- Do not add a feature-card landing page or a second application shell.
- Do not create a generic analytics dashboard.
- Do not invent a universal confidence or AI visibility score.
- Use MapCN for country selection and verified geo-result visualization.
- Use a blank, local GeoJSON world map for the default Assay geo surface.
- Keep an accessible table as the authoritative representation of geographic results.
- Support country-level viewpoints in version one. City-level targeting is out of scope until the Bright Data account and product configuration are explicitly verified for it.
- Never run a high-impact action directly from a scraped value in version one.

## 3. Product thesis

The expanded product can be described as verified web operations:

```text
DISCOVER -> OBSERVE -> VERIFY -> COMPARE -> DECIDE -> ACT -> PROVE
```

Assay already has strong primitives for observe, verify, decide, and prove:

- Goal-driven setup and field proposals
- Versioned field contracts
- Runs and schedules
- Gated healing and abstention
- Held-cell decisions
- Proof IDs and page evidence
- Reports and digests
- REST, MCP, API keys, webhooks, Slack, and Discord connectors
- Bright Data delivery ingestion and Scraper Studio integration

The new work should deepen those primitives rather than bypass them.

## 4. Scope decomposition

This initiative contains several independently shippable subsystems. They share a foundation, but each receives its own implementation plan and validation cycle.

```text
Unified mission foundation
├── Adaptive composer and interpretation receipt
├── Mission, viewpoint, execution, and observation model
├── Provider capability registry and cost estimates
├── Research missions
├── Website-to-verified-API
├── Decision automations
├── Geographic comparison and MapCN
└── AI visibility
```

The foundation must ship first. The other five capabilities should not be implemented as parallel one-off flows.

## 5. Terminology

Use these names consistently in product copy, code, APIs, and documentation.

| Term | Meaning |
| --- | --- |
| Mission | One approved user goal, once or recurring |
| Intent | Assay's structured interpretation of a prompt |
| Operation | What data work occurs: watch, research, compare, or visibility |
| Output | Where verified observations go: dashboard, API, or automation |
| Source | A URL, discovery query, prebuilt scraper, AI platform, or dataset |
| Viewpoint | Country, language, locale, and device context used for an observation |
| Mission run | One logical execution of a mission across all sources and viewpoints |
| Source run | One provider task inside a mission run |
| Record | One entity or result row produced by a mission |
| Observation | One field value for one record, source, and viewpoint |
| Withheld | Assay has evidence but cannot safely publish a value or comparison |
| Proof | The durable evidence and decision record for one observation |
| Action rule | An explicit verified condition and an allowed action |
| Capability | A provider feature the current credential and account can use |

Avoid using `job` for the product object. The worker and Bright Data already use job-like language for executions, and overloading it will make operational logs ambiguous.

## 6. Unified intent model

### 6.1 Canonical shape

Every composer request is normalized into one versioned intent envelope.

```ts
type MissionIntentV1 = {
  version: 1;
  goal: string;
  operation: "watch" | "research" | "compare" | "visibility";
  cadence:
    | { kind: "once" }
    | { kind: "recurring"; expression: string; timezone: string };
  sources: SourceIntent[];
  fields: FieldIntent[];
  viewpoints: ViewpointIntent[];
  outputs: OutputIntent[];
  verification: VerificationIntent;
  budget: BudgetIntent;
};
```

This is a design shape, not code to paste unreviewed. The implementation should define it with the repository's existing Zod conventions and persist the validated parsed form together with the original user text.

### 6.2 Operation and output mapping

The visible composer shortcuts map to the canonical model as follows:

| Shortcut | Canonical interpretation |
| --- | --- |
| Watch | `operation=watch`, recurring unless the prompt says once |
| Research | `operation=research`, once unless a cadence is explicit |
| Build API | infer operation, add `output=api` |
| Automate | infer operation, add `output=automation` |
| Compare locations | `operation=compare`, require at least two viewpoints |
| AI visibility | `operation=visibility`, require prompts and AI platforms |

A single goal may combine these dimensions. Example:

```text
Track how ChatGPT and Perplexity describe us every Monday in India and the US,
then notify Slack when either stops citing us.
```

Normalizes to:

```yaml
operation: visibility
cadence: weekly
viewpoints: [IN, US]
sources: [chatgpt, perplexity]
outputs:
  - dashboard
  - automation:
      when: citation_presence transitions from present to absent
      then: slack_notification
```

### 6.3 Interpretation authority

Intent parsing is read-only. It may inspect provider capabilities and estimate cost, but it must not:

- Create targets
- Create a recurring schedule
- Trigger Bright Data
- Publish an API
- Enable an automation
- Send an external message

The interpretation response must carry uncertainty as missing or ambiguous slots, not as invented defaults.

## 7. Unified composer design

### 7.1 Default state

```text
What should Assay do?

Describe what you want to know, watch, compare, or act on...

[ Watch ] [ Research ] [ Build API ] [ Automate ]
[ Compare locations ] [ AI visibility ]                         [ -> ]

Try: Compare this product's price and availability in India, the US and UK.
```

The mode row is visually subordinate to the writing surface. It is not a card grid. On narrow screens it scrolls horizontally with visible edge clipping so users can tell more choices exist.

### 7.2 Adaptive controls

The composer reveals only the controls needed for the selected or inferred intent.

| Intent | Inline controls |
| --- | --- |
| Watch | URL/topic, cadence, notification policy |
| Research | once/recurring, recency, evidence requirement |
| Build API | source/goal, refresh policy, proof metadata |
| Automate | verified condition, action destination |
| Compare locations | source, country chips, reference country |
| AI visibility | brand/topic, prompts, platforms, countries |

Selecting a shortcut changes the placeholder and reveals contextual controls. It does not navigate away, clear the prompt, or place the user in a separate form.

### 7.3 Automatic mode selection

Free-form input may select and combine mode chips automatically. The user can correct any selected chip before approval.

Do not show a numeric classification confidence. When the request is ambiguous, use plain language:

```text
I read this as a one-time research mission with an API output.
```

### 7.4 Interpretation receipt

Every new mission must pass through a receipt before creation:

```text
I understood this as a recurring geographic comparison.

SOURCE
  https://example.com/product/42

VIEWED FROM
  India, United States, United Kingdom

FIELDS
  Price, availability, warranty

EVERY
  Monday at 09:00 Asia/Kolkata

WHEN ASSAY IS UNSURE
  Hold the observation and do not trigger actions

ESTIMATED USE
  3 source requests per run, approximately 12 to 15 per month

[ Change plan ] [ Run a preview ]
```

Requirements:

- Show the operation, cadence, sources, fields, viewpoints, outputs, and hold policy.
- Show estimated provider calls and a cost band before execution.
- Identify unavailable features precisely.
- Never use `connection failed` when only one Bright Data product is unavailable.
- Require a second explicit approval before changing a preview into recurring work.

### 7.5 Visual character

- Retain Assay's existing type, spacing, semantic colours, and first-person voice.
- Use one writing surface and one compact receipt, not nested cards.
- Do not use gradient text, glass panels, glowing borders, or decorative AI imagery.
- Animate only changed contextual controls and receipt rows.
- Respect reduced motion.
- Keep body line length under approximately 70 characters where practical.

## 8. Mission foundation architecture

### 8.1 Why a parent object is needed

The current primary object is a target, effectively one watched page and contract. Research, geo, and visibility work span multiple sources and viewpoints. Encoding them as target naming conventions would create fragile joins and make cost, status, and ownership hard to explain.

Add a mission parent while keeping existing targets valid.

### 8.2 Persistence model

Recommended new tables and additions:

```text
missions
  mission_id
  conversation_id nullable
  title
  operation
  status: draft | previewing | active | paused | complete | failed
  cadence
  timezone
  approved_at nullable
  created_at
  updated_at

mission_versions
  mission_version_id
  mission_id
  version
  prompt_text
  intent_json
  created_at

mission_runs
  mission_run_id
  mission_id
  mission_version_id
  status
  estimated_requests
  actual_requests
  estimated_cost
  actual_cost nullable
  started_at
  finished_at nullable

viewpoints
  viewpoint_id
  mission_id
  country_code
  language nullable
  locale nullable
  device nullable
  is_reference

mission_sources
  source_id
  mission_id
  kind
  provider
  locator_json
  enabled

source_runs
  source_run_id
  mission_run_id
  source_id
  viewpoint_id nullable
  provider_job_id nullable
  status
  error_code nullable
  started_at
  finished_at nullable

mission_records
  record_id
  mission_run_id
  stable_key
  entity_type nullable
  position nullable
  created_at

observations
  observation_id
  record_id
  source_run_id
  field
  observed_value nullable
  normalized_value nullable
  status: verified | different | withheld | not_observed | collection_failed
  reason nullable
  proof_id nullable

action_rules
  action_rule_id
  mission_id
  version
  condition_json
  action_json
  enabled
  approved_at nullable

action_attempts
  action_attempt_id
  action_rule_id
  mission_run_id
  idempotency_key
  status: proposed | approved | sent | failed | suppressed
  reason nullable
  response_metadata nullable
  created_at
```

### 8.3 Compatibility strategy

Do not migrate the entire monitoring engine in one release.

1. Existing targets and runs continue working with no mission.
2. Add nullable `mission_id` to targets.
3. Add nullable `mission_run_id` and `viewpoint_id` to runs.
4. New missions write the new normalized observation model.
5. Add an adapter that exposes existing `field_runs` as observation-shaped reads.
6. Dual-write new monitoring runs to `field_runs` and `observations` only after contract tests prove equivalence.
7. Remove the adapter only in a later migration, not inside this initiative.

This avoids a big-bang rewrite of the strongest existing product path.

### 8.4 Mission execution

```text
Approved mission
      |
      v
Mission planner
      |
      +--> source x viewpoint execution matrix
      |
      v
Provider adapters
      |
      v
Raw provider results
      |
      v
Source-specific normalization
      |
      v
Assay verification and proof creation
      |
      v
Observations
      |
      +--> dashboard
      +--> versioned API
      +--> automation evaluator
```

The planner is deterministic after approval. It reads the versioned mission intent and capability registry. A model cannot add new sources or viewpoints at run time.

## 9. Provider capability registry

### 9.1 Purpose

Assay needs to know the difference between:

- Credential missing
- Credential invalid
- Account valid but product unavailable
- Product available but no active zone
- Product available but not production-tested
- Product available and verified

Add a server-only capability registry. Cache probes so rendering Home does not repeatedly call vendor APIs.

```ts
type CapabilityState =
  | "available"
  | "likely_available"
  | "unavailable"
  | "not_configured"
  | "untested";
```

Each result includes a safe reason code, last checked time, and documentation URL. It has no place to store or return a token.

### 9.2 Capability findings on 2026-08-23

The current `.env` contains both Bright Data variable names with the same configured credential. No credential value was printed or persisted by the checks.

| Capability | Probe result | Product ruling |
| --- | --- | --- |
| Authentication | Accepted | Available |
| Web Unlocker zone | Active zone present | Available |
| Browser API zone | Active zone present | Available |
| Marketplace metadata | HTTP 200, metadata returned | Available for metadata; paid collections still need explicit cost approval |
| Scraper Studio self-healing read endpoint | HTTP 200 | Available; previous automation state was failed at `user_approval`, which is a workflow state rather than an auth failure |
| Discover API | Authenticated request reached validation and returned `Missing query`, not the documented account-disabled 403 | Likely available; run one explicitly approved, minimal valid production probe before relying on it |
| Deep Lookup | Preview request rejected with `Deep Lookup is for business emails only` | Unavailable on this account until Bright Data account eligibility changes |
| SERP zone | No active SERP zone listed | Not configured |
| AI platform scrapers | Documentation and marketplace metadata are reachable; a paid scraper trigger was not made | Untested per dataset/platform |

### 9.3 Account-facing copy

Deep Lookup should render:

```text
Business research enrichment is unavailable on this Bright Data account.

The credential works for Browser API, Web Unlocker, Scraper Studio, and dataset
metadata. Bright Data requires a business-email account for Deep Lookup.

[ Continue with web research ] [ How to enable Deep Lookup ]
```

Do not disable research entirely. Research can use Discover, prebuilt scrapers, Browser API, and Web Unlocker.

## 10. Research missions

### 10.1 User promise

Research missions answer questions where the user does not already know every source URL.

Example:

```text
Find Indian SaaS companies that launched an AI product this quarter, including
the launch source, current pricing, and evidence.
```

### 10.2 Flow

```text
Prompt
  -> intent proposal
  -> query and field confirmation
  -> free or bounded preview
  -> source review
  -> approved full mission
  -> table of records and cell-level evidence
```

### 10.3 Retrieval strategy

Use a provider router in this order:

1. Existing prebuilt dataset or scraper when it matches the requested entity and fields.
2. Discover API for source discovery and intent relevance.
3. Web Unlocker for static public pages.
4. Browser API for dynamic pages.
5. Custom Scraper Studio only when the preceding options do not meet the contract.
6. Deep Lookup only when the account capability becomes available and the user accepts its pricing.

The router should optimize for evidence quality and predictable cost, not for maximum vendor feature use.

### 10.4 Verification model

The existing DOM-healing margin is not sufficient to call a research claim verified. Add explicit research verification rules:

- Source authority tier
- Source publication or observation date
- Exact extracted evidence span
- Schema and type validation
- Cross-source corroboration when the contract requires it
- Conflict detection
- Freshness policy
- Entity deduplication confidence

Possible research observation states:

```text
verified
single_source
conflicting
stale
not_publicly_available
withheld
```

Do not map Bright Data's accuracy marketing claim directly into Assay's verified state. Assay must evaluate the returned evidence under its own declared contract.

### 10.5 Results UI

```text
Indian SaaS AI launches
Preview completed 8 minutes ago

12 records | 9 fully verified | 2 single-source | 1 withheld

COMPANY       LAUNCH             PRICING        EVIDENCE
Acme          AI Search          $29/month      3 sources
Northstar     Copilot            withheld       2 conflicting pages
```

Clicking a cell opens proof. Clicking a row opens a source timeline. Filters operate on declared states, not hidden numerical confidence.

### 10.6 Research non-goals

- No generated prose report as the primary record.
- No invented citations.
- No automatic contact outreach.
- No personal-data enrichment in the first release.
- No Deep Lookup dependency while the account is ineligible.

## 11. Website-to-verified-API

### 11.1 User promise

Turn an approved mission contract into a stable API that represents uncertainty explicitly.

### 11.2 Creation flow

```text
Prompt or existing mission
  -> sources and fields preview
  -> contract approval
  -> sample response
  -> API version and key scope approval
  -> endpoint active
```

### 11.3 Response contract

```json
{
  "mission_id": "msn_...",
  "run_id": "mrn_...",
  "observed_at": "2026-08-23T10:00:00Z",
  "records": [
    {
      "key": "product-42",
      "fields": {
        "price": {
          "value": 799,
          "currency": "USD",
          "status": "verified",
          "proof_id": "pr_..."
        },
        "availability": {
          "value": null,
          "status": "withheld",
          "reason": "conflicting_page_variants",
          "proof_id": "pr_..."
        }
      }
    }
  ]
}
```

Requirements:

- A withheld value is `null` plus a state and reason. It is never omitted silently.
- API versions are immutable contracts.
- Contract changes create a new version and a diff.
- Historical values remain addressable by proof ID and run ID.
- Support conditional requests and stable ETags based on content, not fetch time.
- Webhooks use idempotency identifiers and signed outbound delivery.
- OpenAPI and SDK generation consume the approved contract, not sample inference at request time.

### 11.4 API security

The current read API key model needs scoping before customer-facing mission APIs ship.

Add:

- Key scopes such as `mission:read`, `proof:read`, and `runs:read`
- Mission allowlists per key
- Optional expiry
- Rate limits per key and mission
- Key rotation without endpoint downtime
- Audit log for key creation, use, and revocation
- Separate server-side Bright Data credentials from consumer API credentials

No browser bundle or API response may contain a Bright Data token, zone password, webhook delivery secret, or connector configuration.

## 12. Decision automations

### 12.1 User promise

Perform an explicit, safe action only when a verified condition becomes true.

Example:

```text
When at least three suppliers have this component in stock below $40, notify
Slack and create a procurement review task.
```

### 12.2 Rule model

An automation separates observation, condition, and action:

```text
Observed change -> verified event -> business condition -> proposed action
```

Example rule:

```yaml
when:
  all:
    - field: availability
      status: verified
      equals: in_stock
    - field: normalized_price_usd
      status: verified
      less_than: 40
  minimum_matching_records: 3
then:
  - type: slack_notification
  - type: create_review_task
```

### 12.3 Safety rules

- Withheld, stale, not observed, and collection-failed observations never satisfy a positive condition.
- A transition rule requires both the previous and current observations to meet their declared quality policy.
- An action is evaluated only after the mission run is complete, unless the mission explicitly supports bounded streaming.
- Every action uses an idempotency key based on rule version, mission run, and transition.
- Retryable delivery failures do not re-evaluate the business rule.
- Rules have per-hour and per-day execution caps.
- Rule edits create versions.
- Enabling or broadening a rule requires explicit approval.
- Dry-run mode is the default for newly created rules.
- The first release supports reversible or review-oriented actions only.

Allowed first-release actions:

- Slack or Discord message
- Email digest
- Signed outbound webhook
- Create internal Assay review item
- Append to an approved spreadsheet or database destination after connector review

Out of scope initially:

- Purchases
- Job or grant applications
- Public social posts
- Financial trades
- Destructive account changes
- Actions that impersonate a human

### 12.4 Automation receipt

```text
This rule would have fired twice in the last 30 days.

Both events were based on verified observations. Three other potential events
were suppressed because at least one required value was withheld.

[ Keep as dry run ] [ Enable notifications ]
```

Historical simulation is required before enabling a recurring rule whenever enough prior observations exist.

## 13. Geographic comparison with MapCN

### 13.1 Responsibility boundary

```text
Bright Data observes country-specific pages
Assay verifies and compares observations
MapCN renders Assay's decisions
```

MapCN must not:

- Read Bright Data responses directly
- Decide whether observations match
- Convert currencies
- Calculate confidence
- Interpret collection errors
- Store credentials

### 13.2 Viewpoint model

Version one viewpoint fields:

```ts
type ViewpointV1 = {
  countryCode: string;
  language?: string;
  locale?: string;
  device?: "desktop" | "mobile";
  isReference: boolean;
};
```

Country code is required. Language, locale, and device are explicit when used and never inferred from country after approval.

### 13.3 Map placements

Use MapCN in exactly three places:

1. A lazy-loaded country selector after geo mode is active.
2. A compact scope map on the interpretation receipt.
3. A full synchronized map and table on geo and regional visibility results.

Do not place maps on general Home, Runs, Settings, Decisions, or every proof page.

### 13.4 Result interaction

```text
Product availability across three locations
Run 84 | observed 11 minutes ago

[ Price ] [ Availability ] [ Warranty ]
Reference: India

+--------------------------------------+----------------------------+
|                                      | INDIA                      |
|      United States                   | Rs 79,999                  |
|             o       United Kingdom   | available                  |
|                              o       | proof pr_8314              |
|                        India o       |                            |
|                                      | Price differs from the US  |
|                                      | [ See evidence ]           |
+--------------------------------------+----------------------------+

COUNTRY          PRICE          AVAILABILITY     WARRANTY
India            Rs 79,999      available        1 year
United States    $899           withheld         2 years
United Kingdom   GBP 849        available        2 years
```

Map and table synchronization:

- Hover or focus a country to highlight its table row.
- Select a field to recolour the map for that field only.
- Select a country to open a sanitized observation summary.
- Proof links use the existing proof route and component.
- Keyboard and screen-reader users can complete all tasks through the table.

### 13.5 Map states

Render one selected field relative to an explicit reference viewpoint.

| State | Treatment | Meaning |
| --- | --- | --- |
| Same | quiet neutral fill | Verified value agrees with reference |
| Different | brand blue fill | Verified geographic difference |
| Withheld | amber pattern | Assay cannot safely compare |
| Not observed | outline only | No observation requested |
| Collection failed | failure glyph | Provider could not retrieve the source |

Do not use red for a normal geographic difference. Do not use bright green for agreement. Provide patterns or glyphs in addition to colour.

### 13.6 Reference viewpoint

The default reference is chosen deterministically:

1. First country explicitly named in the prompt.
2. Otherwise configured home market.
3. Otherwise first selected country.

The receipt states which reference Assay selected and lets the user change it.

### 13.7 Price comparison

Store both observed and normalized values:

```text
observed_value: Rs 79,999
normalized_value: 957.22 USD
normalization_source: declared exchange-rate provider
normalization_at: timestamp
```

Never replace the observed value with a conversion. Currency conversion has its own proof and timestamp.

### 13.8 Map implementation constraints

- Use MapCN's copy-owned MapLibre components.
- Use blank map mode with local, versioned country GeoJSON.
- Do not use the default CARTO basemap for commercial production without a suitable licence.
- Load MapLibre dynamically only when a map is needed.
- Provide a non-WebGL fallback.
- Keep popover content sanitized and text-only.
- Review MapLibre worker and Content Security Policy requirements.
- Do not send Assay observations to a third-party tile service by default.
- Test reduced motion, keyboard focus, zoom, high contrast, and narrow screens.

MapCN documentation: https://www.mapcn.dev/docs
MapCN repository and licence: https://github.com/AnmolSaini16/mapcn
Bright Data Browser API geolocation: https://docs.brightdata.com/scraping-automation/scraping-browser/features/proxy-location

## 14. AI visibility

### 14.1 User promise

Show what supported AI answer systems say, cite, and omit for a declared prompt set and viewpoint.

### 14.2 Mission matrix

```text
prompts x platforms x viewpoints x cadence
```

Example:

```text
2 prompts x 3 platforms x 2 countries = 12 source requests per run
```

This multiplication must be visible in the interpretation receipt.

### 14.3 Supported observations

Start with facts that can be derived and audited:

- Brand mentioned: yes or no
- Brand position in returned answer sections, when structurally available
- Citation present: yes or no
- Cited URL and domain
- Competitors mentioned
- Exact claim sentence mentioning the brand
- Claim changed since previous verified run
- Citation gained or lost
- Response or citation collection withheld

Do not launch with a single AI visibility score. Different platforms expose different structures, and combining mention, citation, order, and sentiment into one number would hide the evidence.

### 14.4 Platform adapters

Each AI platform scraper has its own source adapter and normalized contract. Do not assume all platforms return citations or positions in the same shape.

```text
Provider response
  -> platform adapter
  -> normalized answer, claims, citations
  -> deterministic presence checks
  -> optional model nominations for claim grouping
  -> Assay verification
```

If a model groups semantically equivalent claims, it nominates the grouping. It does not decide that a claim is true.

### 14.5 Geo visibility map

Reuse `ViewpointMap`. The user selects one platform, prompt, and field at a time:

```text
Platform: Perplexity
Prompt: best self-healing web scraper
Field: citation presence

India           cited        assay.dev
United States   cited        GitHub
United Kingdom  not cited    competitors cited instead
Germany         withheld     response contained no citations
```

### 14.6 Provider readiness

Bright Data documents AI scrapers for ChatGPT, Perplexity, Gemini, Grok, Google AI Mode, and Copilot. The current account has not triggered each relevant dataset, so implementation must begin with a capability and sample-contract spike for each selected platform.

Bright Data AI scraper documentation: https://docs.brightdata.com/datasets/scrapers/scrapers-library/ai-scrapers

## 15. Information architecture and routes

Keep the global navigation stable. Missions appear in the existing conversation/work rail rather than creating five new global sections.

Recommended routes:

```text
/                         unified composer and conversations
/m/[mission]              mission overview and latest result
/m/[mission]/runs         logical mission runs
/m/[mission]/runs/[run]   result table, geo map, or visibility result
/m/[mission]/sources      approved sources and capability state
/m/[mission]/api          API contract, keys, samples, and versions
/m/[mission]/automations  rules, dry runs, attempts, and failures
/explain/[proof]          existing proof route, retained
/decisions                existing shared abstain queue
/schedule                 existing schedule, extended with mission rows
/settings                 provider and connector capability summaries
```

Contextual subnavigation appears only when the mission supports it. A research mission with no API or automation should not show empty API and Automation tabs.

The existing `/compare` remains the cross-scraper time diff. Geo comparison lives inside the mission that requested it to avoid overloading `Compare` with two meanings.

## 16. Provider adapter boundaries

Create interfaces around capabilities, not around the Bright Data brand:

```text
DiscoveryProvider
PageProvider
StructuredScraperProvider
BrowserProvider
AIAnswerProvider
DatasetProvider
```

Bright Data implements several of these. This structure allows:

- Testing without live vendor calls
- Clear fallback policy
- Capability-specific errors
- Future provider substitution
- Cost accounting per source run

Provider adapters return raw observations and provider metadata. They do not return Assay verification states.

## 17. Error and uncertainty model

Collection failure and verification withholding are distinct.

```text
provider_error
├── unauthorized
├── capability_unavailable
├── rate_limited
├── blocked
├── timeout
├── invalid_input
└── provider_failed

verification_state
├── verified
├── different
├── single_source
├── conflicting
├── stale
├── withheld
└── not_observed
```

Rules:

- Never call `blocked` a selector break.
- Never call `withheld` a provider failure.
- Never convert a timed-out viewpoint into `unchanged`.
- Never show an absent citation as `not cited` if the platform response itself was not successfully collected.
- Never trigger a negative-state automation from missing data.

## 18. Cost and usage controls

Every mission version stores an estimate and every mission run records actual provider units where available.

Before preview:

- Show number of sources.
- Show source x viewpoint x prompt request count.
- Identify free preview versus paid execution.
- Show a cost range when the provider exposes pricing.
- Require explicit confirmation when cost cannot be estimated.

Runtime controls:

- Per-mission monthly request cap
- Per-provider concurrency cap
- Global account budget warning
- Circuit breaker on unexpected request multiplication
- No automatic fallback from a cheap source to an unbounded expensive source
- No recurring activation from a preview approval

The planner should log why it chose a provider so unexpected cost can be audited.

## 19. Security and abuse controls

### 19.1 Credential handling

- Bright Data tokens stay server-side.
- Capability responses expose only state and reason.
- Consumer API keys are separate and scoped.
- Connector secrets are never echoed, masked, or sent to the client.
- Logs and transcripts pass through secret redaction.

### 19.2 SSRF and source safety

- Route all arbitrary URLs through the existing guarded fetch policy.
- Resolve and validate redirects, not just the initial hostname.
- Block loopback, link-local, private, metadata, and internal address ranges.
- Apply allowlists where a connector has a fixed vendor host.
- Revalidate DNS appropriately to reduce rebinding risk.

### 19.3 Scraped content

- Treat all page and AI-response text as untrusted.
- Render it as text, never executable HTML.
- The model may nominate source references or elements, never produce publishable values directly.
- Tool instructions found inside scraped pages have no authority.

### 19.4 Automations

- Use allowlisted action types and destinations.
- Sign outbound Assay webhooks.
- Enforce idempotency, rate limits, retries, and audit history.
- Do not permit arbitrary URLs as action destinations without the connector host policy.
- Require explicit approval to enable a rule.

### 19.5 Bright Data inbound delivery

The existing receiver correctly accounts for gzip, NDJSON/JSON, bearer authentication, replay handling, and the vendor's lack of a documented signature. Extend the same bounded-body and constant-time secret checks to mission deliveries.

Do not assume that Bright Data webhook delivery is signed. Assay's outbound webhooks and Bright Data's inbound webhook mechanism have different security properties and should be described separately.

### 19.6 Maps

- Use local country geometry by default.
- Do not include user observation data in tile URLs.
- Restrict map popups to sanitized data.
- Configure CSP for workers and WebGL deliberately.
- Provide a table fallback when maps are blocked or unsupported.

## 20. Accessibility and responsive behavior

- Every composer shortcut has an accessible pressed/selected state.
- Contextual controls are announced when they appear.
- The interpretation receipt uses headings and definition lists, not visual position alone.
- Country selection supports search and keyboard controls.
- Map states have text, pattern, and glyph equivalents.
- The geo table supports the entire workflow without the map.
- Proof links have stable names including country and field.
- Dense results tables switch to field-first stacked rows on narrow screens.
- Do not put horizontally scrolling tables inside horizontally scrolling pages.
- Respect reduced motion and high contrast.
- Announce background preview completion without stealing focus.

## 21. Observability

Track product and system events separately.

Product events:

- Intent proposed
- Intent corrected
- Preview approved or abandoned
- Mission activated, paused, or completed
- API version published
- Automation kept in dry-run or enabled
- Country added or removed
- Proof opened

System events:

- Provider selected and why
- Capability check result
- Provider request count and latency
- Provider error class
- Normalization failure
- Verification outcome
- Observation withheld reason
- Action suppressed, attempted, delivered, or failed
- Cost estimate versus actual

Never log prompt or scraped content by default when aggregate event metadata is sufficient.

## 22. Testing and validation

### 22.1 Unit tests

- Intent schema and shortcut normalization
- Cost multiplication
- Reference viewpoint selection
- Provider capability state mapping
- Provider error normalization
- Observation state transitions
- Automation condition evaluation
- Action idempotency keys
- Currency normalization while retaining native values
- Map legend and accessible labels

### 22.2 Contract tests

- Each Bright Data adapter against saved, redacted fixtures
- Discover response schema
- Browser and Web Unlocker response handling
- Every selected AI platform scraper
- Inbound webhook gzip, NDJSON, limits, auth, replay, and retry behavior
- API version compatibility and withheld-cell representation

### 22.3 Integration tests

- Prompt to interpretation receipt without persistence
- Receipt approval to preview
- Preview approval to recurring mission
- Mission execution across multiple viewpoints
- Partial provider failure without false `unchanged`
- Verified observation to API output
- Withheld observation suppresses automation
- Proof route resolves a mission observation
- Existing target-only monitoring remains unchanged

### 22.4 End-to-end tests

1. Create a country comparison from free-form text without selecting a shortcut.
2. Correct an automatically inferred country before preview.
3. Run a three-country preview and inspect a proof.
4. Publish an API and confirm a withheld field remains explicit.
5. Create an automation, simulate history, keep dry-run, then enable.
6. Create a research mission using Discover without Deep Lookup.
7. Attempt Deep Lookup and receive the precise account eligibility message.
8. Create an AI visibility mission and handle one platform lacking citations.
9. Complete geo result navigation using keyboard and table only.
10. Confirm no Bright Data credential appears in HTML, RSC payloads, logs, or API responses.

### 22.5 Benchmark requirements

The current gate is calibrated on one prose field and one vertical. Do not reuse its threshold claims for price, availability, research entities, or AI claims without new evidence.

Before automatic publication in a new field family:

- Build a representative corpus.
- Include real drift and constructed ambiguous cases.
- Measure wrong publication, correct publication, and abstention separately.
- Calibrate field-specific contracts.
- Document where the evidence does not transfer.

Until then, new field families may ship in preview or review-required mode.

## 23. Rollout order

### Phase 0: capability and contract spikes

- Implement safe cached capability probes.
- Run one explicitly approved valid Discover probe.
- Validate selected AI scraper datasets with minimal samples and recorded cost.
- Verify Browser API country targeting on two benign public pages.
- Record provider fixture contracts.

Exit criteria: every planned provider is `available`, deliberately `unavailable`, or removed from the first release.

### Phase 1: mission foundation and adaptive composer

- Mission and mission-version persistence
- Intent schema
- Shortcut mapping
- Interpretation receipt
- Cost estimate model
- Preview versus activation boundary
- Existing monitoring adapter

Exit criteria: a watch mission can be created through the new flow without changing existing monitoring outcomes.

### Phase 2: geographic comparison and MapCN

- Viewpoints
- Source x country execution matrix
- Reference country
- Observation comparison
- Lazy MapCN selector
- Map, table, legend, proof links, and fallback

Exit criteria: one URL and three countries produce auditable per-field observations with partial failure handled honestly.

### Phase 3: website-to-verified-API

- Mission record API
- Versioned contract and OpenAPI
- Scoped keys
- ETags and pagination
- Signed webhook output
- API management screen

Exit criteria: verified and withheld observations survive the full API and webhook path without semantic loss.

### Phase 4: decision automations

- Condition DSL
- Dry-run simulation
- Action policy and allowlist
- Idempotent attempts
- Slack, Discord, email, webhook, and internal review actions
- Suppression receipts

Exit criteria: withheld or missing observations cannot trigger an action, and retries cannot duplicate an action.

### Phase 5: research missions

- Discover adapter
- Source review
- Multi-record observations
- Evidence spans
- Deduplication and conflict states
- Research result table

Exit criteria: a bounded research prompt produces auditable structured records without Deep Lookup.

### Phase 6: AI visibility

- Platform adapters
- Prompt matrix
- Mention, citation, URL, competitor, and claim observations
- Change history
- Geo visibility map reuse
- Visibility-specific automation templates

Exit criteria: platform differences and missing citations remain explicit, with no fabricated cross-platform score.

## 24. Suggested implementation ownership

Split work by stable boundaries rather than screens:

| Area | Owns |
| --- | --- |
| Mission domain | schemas, persistence, versioning, planner |
| Provider capabilities | probes, adapter interfaces, cost metadata |
| Composer | adaptive prompt, intent receipt, corrections |
| Observation pipeline | normalization, verification, proof integration |
| Geo | viewpoints, comparison, MapCN, table fallback |
| API surface | contracts, scoped keys, OpenAPI, delivery |
| Automation | rules, evaluator, dry-run, attempts, connectors |
| Research | discovery, source review, records, evidence |
| Visibility | AI platform adapters and visibility observations |

Each area should expose typed interfaces and fixture-based tests before another area depends on it.

## 25. Acceptance criteria

The initiative is complete only when all of the following are true:

1. A user can start every supported goal from one composer.
2. Free-form text works without selecting a mode.
3. Shortcut selection updates the prompt without navigating away.
4. No persistent or billable operation occurs before an interpretation receipt is approved.
5. Cost multiplication is visible for sources, prompts, and viewpoints.
6. Existing monitoring behavior and benchmark results do not regress.
7. Research works without Deep Lookup and explains its absence precisely.
8. Website APIs expose withheld observations explicitly.
9. API keys are scoped to allowed missions and capabilities.
10. Automations default to dry-run and never fire from withheld or missing data.
11. Geo comparisons show an explicit reference viewpoint.
12. MapCN is lazy-loaded and has a complete accessible table fallback.
13. No default commercial basemap is shipped without appropriate licensing.
14. AI visibility reports observable facts, not a synthetic universal score.
15. Every published observation is traceable to proof.
16. Provider failures and verification uncertainty remain separate states.
17. Bright Data credentials never reach the browser or consumer API.
18. New field families are benchmarked or kept review-required.

## 26. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Five features make the product feel fragmented | One composer, one mission model, contextual outputs |
| Provider call multiplication causes surprise cost | Receipt estimates, caps, planner logs, no implicit expensive fallback |
| Existing gate is overclaimed for new field types | New corpora and review-required launch states |
| Research results look verified merely because Bright Data returned them | Assay-specific evidence and corroboration policy |
| Map becomes decoration or hides exact values | One selected field, explicit reference, authoritative table |
| AI platform response shapes diverge | Platform-specific adapters and normalized optional fields |
| Automation duplicates or acts on uncertainty | Idempotency, dry-run, suppressed states, allowlisted reversible actions |
| Deep Lookup blocks the research roadmap | Build on Discover, prebuilt scrapers, Browser API, and Unlocker first |
| Default map tiles create licensing or privacy issues | Blank local GeoJSON map |
| Mission migration destabilizes monitoring | Nullable parent links, adapters, staged dual-write |

## 27. Explicit non-goals

- Multi-tenant organizations or RBAC in this initiative
- Arbitrary customer-written automation code
- High-risk autonomous actions
- A generic BI dashboard
- A universal confidence score
- A universal AI visibility score
- City-level geo claims before capability verification
- Social sentiment analysis
- Automatic personal contact enrichment
- Replacing proof with generated explanation
- Migrating all historical targets into fabricated missions or conversations
- Replacing existing field runs in one migration

## 28. Claude review brief

Ask Claude to review this specification against the current repository, not as a greenfield design.

Recommended review prompt:

```text
Read docs/superpowers/specs/2026-08-23-unified-web-operations-design.md and audit
it against the current Assay repository.

Do not implement yet. Produce a handoff that identifies:

1. Which existing modules, routes, schemas, and components can be reused.
2. Where the proposed boundaries conflict with current architecture.
3. The smallest migration path that preserves existing monitoring behavior.
4. Missing security, cost, failure-state, and accessibility requirements.
5. Which Bright Data capabilities need a live contract spike before planning.
6. A recommended sequence of independently testable implementation slices.
7. Any acceptance criterion that cannot be tested as written.

Preserve Assay's rule that the model proposes and never directly publishes values
or enables authority. Do not assume Deep Lookup is available. Do not treat the
MapCN map as the source of truth.
```

## 29. Documentation sources

- Bright Data Discover API: https://docs.brightdata.com/api-reference/discover/overview
- Bright Data Deep Lookup: https://docs.brightdata.com/datasets/deep-lookup/overview
- Bright Data Browser API geolocation: https://docs.brightdata.com/scraping-automation/scraping-browser/features/proxy-location
- Bright Data Web Scraper overview: https://docs.brightdata.com/datasets/scrapers/overview
- Bright Data AI scrapers: https://docs.brightdata.com/datasets/scrapers/scrapers-library/ai-scrapers
- Bright Data scraper delivery options: https://docs.brightdata.com/datasets/scrapers/scrapers-library/delivery-options
- MapCN documentation: https://www.mapcn.dev/docs
- MapCN repository and licence: https://github.com/AnmolSaini16/mapcn
- Existing Assay design: `docs/APP-DESIGN.md`
- Existing Bright Data audit: `docs/BRIGHTDATA-CAPABILITIES.md`
- Existing limitations: `docs/LIMITATIONS.md`
- Existing agent rules: `docs/AI-AND-AGENTS.md`

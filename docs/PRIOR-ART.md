# Prior art

Researched 2026-08-20/21, by direct fetch of primary sources: vendor
documentation, FDA decision summaries, the Federal Register, eCFR, and arXiv.
Where a claim could not be verified from a primary source it is marked
"could not verify" rather than asserted. Search-snippet-only claims are not
included.

Two questions were asked. Does anything in web scraping abstain when it is not
confident? And how do serious automated-decision systems in other fields handle
the same problem?

---

## 1. In web scraping, nothing abstains

Surveyed by fetching their own documentation: Kadoa, Nimble, Parsera, AgentQL,
Diffbot, Zyte, Oxylabs, Exa, Tavily, Olostep.

**No vendor in this set exposes a confidence threshold or documents declining to
answer when uncertain.** The closest mechanisms found:

| Vendor | Mechanism | What it actually is |
|---|---|---|
| Zyte | "All attributes are implicitly nullable — missing values simply won't appear in responses" | Omission when nothing is found. Not confidence-gated |
| Nimble | An `or` parser that "returns the result of the first parser that returns a non-null value" | Deterministic fallback chain, author-written |
| Diffbot | `Analyze` returns `type: "other"` rather than forcing a classification | A genuine abstain, but on document classification, not field extraction |
| Kadoa | Human-in-the-loop sample review | A fixed pipeline step. The documentation is clear it is not triggered by uncertainty |

Kadoa's blog (13 Feb 2026) claims "confidence scoring... and flag uncertain
values for review". Its Data Quality documentation describes only rule-based
checks — presence, uniqueness, format, range — and a "suspicious values"
heuristic. No numeric confidence per field, and no API surface for one. Recorded
as unverified marketing.

### Self-healing claims are weaker than the marketing

- **Kadoa** documents it concretely: detects structure change, updates selectors,
  retries with different strategies. The strongest claim in the market.
- **Nimble** auto-heals **only its own maintained templates** (Amazon, Walmart).
  Not documented for user-generated ones.
- **Parsera** explicitly disclaims it: a scraper "will need to be regenerated"
  when the site changes.
- **AgentQL** markets "self-healing", but its own docs confirm an LLM runs on
  every call with no selector cache. Nothing persists, so nothing is healed.
  That is re-inference, not repair, and its price reflects it: $0.015–0.02 per
  call against roughly $0.001 for compiled alternatives.

### The category has converged on compile-then-execute

Kadoa ("agents generate and maintain deterministic code and do not produce
black-box LLM outputs"), Parsera (agent emits a reusable script, then no LLM in
the loop), Nimble (AI-generated, versioned templates), Oxylabs (OxyCopilot
generates XPath at build time, free; you pay only to execute), Zyte (Copilot
generates parsing code). AgentQL is the conspicuous holdout.

This is the same shape as `docs/AI-AND-AGENTS.md` §4: the model works at setup
time, deterministic code runs at run time. Worth knowing we are not alone there.

**Where we differ** is what happens when the compiled code stops matching the
page. The rest of the category either regenerates (another inference pass, with
no check on whether the new answer is right) or heals silently. Nobody stops.

---

## 2. Everywhere else, the review band is standard

The pattern Assay uses — auto-accept, route-to-human, auto-reject — is
unremarkable in every other field that automates a consequential decision. Web
scraping is the exception, not us.

### Payments: Stripe Radar publishes exact boundaries

Risk score 0–99. **65 or above is "elevated", 75 or above is "high".** These map
to three outcome types on the Charge object: `authorized`, `manual_review`
(reason `elevated_risk_level`), and `blocked`. The middle band is a review queue,
by default, with published numbers.

Two details worth stealing. Stripe **deliberately perturbs the reported risk
score on a subset of payments** "so we can measure the performance of our
models... to make sure key metrics, such as false positive rate and recall,
remain within desirable ranges". And an evaluation failure produces risk level
`unknown`, which still **authorizes** — Stripe fails open. For a system whose
premise is refusing to publish when unsure, failing open is the wrong default,
and it should be a deliberate decision rather than an accident.

### Document AI: AWS publishes threshold numbers

Amazon Textract with Augmented AI routes to humans via
`HumanLoopActivationConditions`. Published examples use key-value block
confidence below **60–65** and word block confidence below **85–90**, on a 0–100
scale, with `"ImportantFormKey": "*"` as a catch-all.

Two structural points. It routes on **two independent confidences** — the
confidence that a key-value pair was detected, and the confidence in the text
inside it — and both must be low. And one published example combines a
low-confidence rule with **`Sampling` at 5% of the high-confidence band**, so
some of what is auto-accepted is checked anyway.

(A2I is closed to new customers as of this research. It remains a design
reference, not an adoptable service.)

Azure's guidance is qualitative: confidence "can be used to determine whether to
automatically accept the prediction or flag it for human review", with no
numeric threshold published. The widely cited "80%" is an accuracy target for
training a custom model, not a runtime auto-accept cut-off.

### Medicine: abstention is a first-class output, and it is regulated

**IDx-DR** (FDA De Novo DEN180001, 2018-04-11) returns one of three results:
more-than-mild diabetic retinopathy detected, not detected, **or insufficient
quality**. Pivotal trial: sensitivity 87.2%, specificity 90.7%, imageability
96.1%. **38 of 857 participants (4%) received the insufficient-quality output.**

The finding that matters most to us: *"In the 38 participants with AI system
insufficient image quality, the prevalence of mtmDR was 10/38 (26%), comparable
to the mtmDR prevalence in the fully analyzable dataset."* **The abstain bucket
was not enriched for disease.** Abstention tracked image quality, not difficulty.
That is exactly the check to run on our own held rows: if abstentions were
enriched for hard cases, the gate would be dodging the questions that matter.

Abstention also triggers a **remediation loop** rather than a dead end — the
operator gets quality feedback and retakes the image. 64.7% succeeded first try;
about a third needed retries.

**21 CFR 892.2080**, covering radiological triage software, writes the constraint
into law: such a device *"does not remove cases from a reading queue. The device
operates in parallel with the standard of care, which remains the default option
for all cases."* Viz.ai ContaCT (DEN170073, 2018-02-13) is explicit that a
negative produces no notification and the case proceeds through normal workflow —
a false negative degrades to the status quo rather than suppressing anything.
87 devices are now cleared under that product code.

### The literature calls it learning to defer

- Madras, Pitassi, Zemel, *Predict Responsibly: Improving Fairness and Accuracy
  by Learning to Defer*, arXiv:1711.06664 (2017-11-17, rev. 2018-09-07). Frames
  the model choosing to "Pass" as **rejection learning**.
- Mozannar and Sontag, *Consistent Estimators for Learning to Defer to an
  Expert*, arXiv:2006.01862 (ICML 2020). Learns a classifier **and a rejector**.
  Shows naive confidence thresholding is **not consistent** when the downstream
  human has non-uniform skill.
- Raghu et al., *The Algorithmic Automation Problem: Prediction, Triage, and
  Human Effort*, arXiv:1903.12220 (2019-03-28). *"Effective automation depends
  crucially on estimating both algorithmic and human error on an
  instance-by-instance basis."*

That last one is a direct challenge to our design. We route on the model's own
margin alone. The literature says the right objective is expected **relative**
error — how likely we are to be wrong compared to how likely the human is. We do
not model the human at all. Recorded as a known theoretical gap.

Regulatory drivers exist too: GDPR Article 22(3) gives a right to human
intervention for decisions based solely on automated processing, and EU AI Act
Article 14 requires human oversight including the ability to disregard or
override output. A review band is the standard way to keep a decision from being
"solely automated".

---

## 3. What this changes

**The competitive claim is now evidenced rather than assumed.** "No scraper
abstains" was previously an inference from reading Scrapling's source. It is now
a survey of ten vendors' own documentation.

**Two things the mature deployments do that Assay does not:**

1. **Nobody samples our auto-published band.** Every heal that clears the gate is
   published and never checked again. Stripe perturbs scores to keep measuring
   false-positive rate; A2I samples 5% of high-confidence extractions. Without
   something equivalent, the only wrong publishes we can count are the ones we
   happen to trip over. Our headline "0 wrong values" is measured on a benchmark
   with known ground truth, which is not the same as knowing the production rate.
2. **Abstention is a dead end here.** IDx-DR tells the operator how to get a
   usable image. Our queue says "I could not tell" and stops. The obvious
   equivalent is to say what would resolve the ambiguity — which anchor to add,
   which field contract to tighten.

Neither is built. Both are recorded here rather than in a roadmap, because they
are gaps in the argument, not features we are promising.

**One claim to soften.** `docs/AI-AND-AGENTS.md` §3 says abstaining on
cross-method disagreement has no prior art we could find. That holds for web
scraping, and the two-independent-confidences idea appears in Textract (key-value
confidence and word confidence must both be low). Ours differs in comparing two
methods that can point at *different elements* rather than two confidences about
the same one, but the family is not new. Claim the specific rule, not the idea.

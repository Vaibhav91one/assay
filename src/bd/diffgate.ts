// The code gate: read the repair Bright Data proposes, not just the row it produces.
//
// WHY THIS EXISTS, AND WHY THE OUTPUT CHECK IS NOT ENOUGH.
//
// `tools/bd-heal.ts` already drives Bright Data's self-healing flow to its
// approval gate and runs an acceptance check on the preview. That check is an
// OUTPUT check: it looks at a value the proposal produced and asks whether it is
// shaped like the field it claims to be.
//
// Run 2026-08-21 against collector c_mt1nrjboski90goqc proved that is not enough.
// The full transcript is committed at `results/bd-heal-transcript.json`. The
// output rules passed. A human rejected it anyway, for three reasons the output
// rules structurally cannot see:
//
//   1. `title_on_detail` was rewritten from `$('h1').text_sane()` to
//      `input.recall_title || $('h1').text_sane()`. Those two fields were the
//      only independent cross-check between the listing stage and the detail
//      stage. Making one a function of the other means they can never disagree,
//      so `anchors_disagree` in `src/detect.ts` goes permanently quiet for this
//      collector. The row still looks perfect. The detector is what died.
//
//   2. `date_published` was named in the heal prompt and came back as
//      `const date_published = null;` -- the same stub that caused the original
//      defect. One of the three fields asked for was not attempted.
//
//   3. Bright Data's own preview said `success: false`, and nothing read it.
//
// Reason 1 is the one that matters and the one no confidence score reaches. A
// healer that removes redundancy makes the scraper LOOK healthier while blinding
// the thing that notices breakage. That is this project's whole thesis pointed at
// the repair itself.
//
// WHAT THIS IS NOT. It is not `healGated()`. That gate compares Assay's own top
// two candidate scores and abstains on a thin margin, before knowing whether
// either is right. This one reads vendor-generated JavaScript and asks whether
// the proposed code destroys a property the pipeline depends on. Different
// evidence, different question, deliberately separate file.
//
// ponytail: the rules are regex over generated JS, not a parser. Every rule below
// fires on the committed transcript, and none was written for a case that has not
// actually happened. If a rule starts missing multi-line statements, the upgrade
// path is a real JS parser (acorn) over `parse_code` -- not more regex.

/** One thing wrong with the proposal, in the terms an operator has to act on. */
export interface DiffFinding {
  /** Stable machine name, so a caller can branch without matching prose. */
  rule: 'corroboration_collapse' | 'not_attempted' | 'vendor_preview_failed';
  /** The field it is about. Absent when the finding is about the whole preview. */
  field?: string;
  /** The sentence a human needs. Written to be read in a terminal, not parsed. */
  detail: string;
}

export interface DiffGateResult {
  decision: 'approve' | 'reject';
  findings: DiffFinding[];
  /**
   * Fields the proposal newly pipes between stages. Reported even when nothing
   * fires, because a widened inter-stage payload is the mechanism behind rule 1
   * and is worth seeing before it is consumed.
   */
  newlyPiped: string[];
}

/** A step out of a Scraper Studio template. Shape is the vendor's, so it is read
 *  defensively rather than typed as a promise nobody made. */
type Step = { code?: string; parse_code?: string };

const steps = (t: any): Step[] => (Array.isArray(t?.steps) ? t.steps : []);

/**
 * Field names a step hands to the next one.
 *
 * `next_stage({url})` and `next_stage({url: x, recall_title: y})` are both
 * ordinary object literals, so the keys are read the same way from either. The
 * scan is per `next_stage(` occurrence and stops at the first `}` -- generated
 * code does not nest an object inside this call, and if it starts to, the miss is
 * a missing key rather than a wrong one.
 */
export function pipedFields(step: Step): string[] {
  const out: string[] = [];
  const code = step.code || '';
  for (const m of code.matchAll(/next_stage\s*\(\s*\{([^}]*)\}/g)) {
    // Split into entries and read only the head of each. Matching identifiers
    // anywhere inside would also collect the VALUES -- `url: recall.recall_url`
    // would report `recall_url` as piped, which is the name of a real field and
    // so would be indistinguishable from a true finding. A test asserts this.
    for (const entry of m[1]!.split(',')) {
      const k = /^\s*(\w+)\s*(?::|$)/.exec(entry);
      if (k) out.push(k[1]!);
    }
  }
  return out;
}

/**
 * Top-level assignments in a parser, as `name -> right-hand side`.
 *
 * Line-scoped on purpose: the ceiling named at the top of this file. A statement
 * wrapped across lines contributes only its first line, which can only lose a
 * finding, never invent one.
 */
export function assignments(parseCode: string | undefined): { name: string; rhs: string }[] {
  const out: { name: string; rhs: string }[] = [];
  for (const line of (parseCode || '').split('\n')) {
    const m = /^\s*(?:let|const|var)\s+(\w+)\s*=\s*(.*)$/.exec(line);
    if (m) out.push({ name: m[1]!, rhs: m[2]!.trim() });
  }
  return out;
}

/** Every field name the template's parsers assign. Used to read the prompt. */
function fieldsIn(template: any): Set<string> {
  const s = new Set<string>();
  for (const st of steps(template)) for (const a of assignments(st.parse_code)) s.add(a.name);
  return s;
}

/**
 * Decide whether a proposed template may be approved.
 *
 * `preview` is the `preview_result` body as captured -- passed whole rather than
 * pre-picked, because the shape is undocumented and this is the file that has to
 * cope with it changing.
 *
 * `prompt` is the heal prompt. Field names are recovered by intersecting it with
 * the names the CURRENT template already assigns, so a prompt cannot invent a
 * field and no list has to be maintained by hand.
 */
export function diffGate(preview: any, { prompt = '' }: { prompt?: string } = {}): DiffGateResult {
  const a = preview?.diff?.template_a;
  const b = preview?.diff?.template_b;
  const findings: DiffFinding[] = [];

  // Rule 3 first: it is the vendor's own verdict on its own work, it costs
  // nothing to read, and it is true even when the diff is unreadable.
  if (preview?.success === false) {
    findings.push({
      rule: 'vendor_preview_failed',
      detail: "Bright Data's own preview reported success: false. It does not believe this repair worked.",
    });
  }

  if (!a || !b) return { decision: findings.length ? 'reject' : 'approve', findings, newlyPiped: [] };

  // --- rule 1: corroboration collapse ---------------------------------------
  //
  // Two halves, and BOTH are required. A parser reading `input.x` is unremarkable
  // on its own -- `input.url` is how a stage receives its target. What matters is
  // a field that is newly piped between stages AND then consumed by a later
  // parser: that is the sequence that converts an independently-read value into a
  // copy of its sibling.
  const pipedA = new Set(steps(a).flatMap(pipedFields));
  const newlyPiped = [...new Set(steps(b).flatMap(pipedFields))].filter((f) => !pipedA.has(f));

  for (const st of steps(b)) {
    for (const { name, rhs } of assignments(st.parse_code)) {
      for (const m of rhs.matchAll(/input\.(\w+)/g)) {
        const src = m[1]!;
        if (!newlyPiped.includes(src) || src === name) continue;
        findings.push({
          rule: 'corroboration_collapse',
          field: name,
          detail:
            `${name} now derives from input.${src}, which this proposal newly pipes in from an earlier stage. `
            + `${name} and ${src} can no longer disagree, so any check that compares them is answering itself.`,
        });
      }
    }
  }

  // --- rule 2: named in the prompt, not attempted ----------------------------
  //
  // A field the operator asked for that comes back assigned a bare literal was
  // not repaired -- it was restated as the defect. Only fields the current
  // template already knows about are considered, so an unrelated word in the
  // prompt cannot manufacture a finding.
  const known = fieldsIn(a);
  const asked = [...known].filter((f) => new RegExp(`\\b${f}\\b`).test(prompt));
  for (const st of steps(b)) {
    for (const { name, rhs } of assignments(st.parse_code)) {
      if (!asked.includes(name)) continue;
      if (!/^(null|undefined|''|""|``)\s*;?$/.test(rhs)) continue;
      // A bare literal is only a stub if nothing fills it later. `let hazard =
      // null;` followed by four attempts to extract one is an INITIALISER, and
      // the 2026-08-21 proposal contains exactly that -- reporting it would have
      // put a fabricated reason next to three real ones. The declaration itself
      // is one assignment; a second means the field is genuinely attempted.
      const assigned = ((st.parse_code || '').match(new RegExp(`\\b${name}\\s*=(?!=)`, 'g')) || []).length;
      if (assigned < 2) {
        findings.push({
          rule: 'not_attempted',
          field: name,
          detail: `${name} was named in the heal prompt and comes back as a hardcoded ${rhs.replace(/;$/, '')}. That is the original defect, restated.`,
        });
      }
    }
  }

  return { decision: findings.length ? 'reject' : 'approve', findings, newlyPiped };
}

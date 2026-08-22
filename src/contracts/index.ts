// Field contracts (F2): the operator's answer to "price must never be wrong,
// the description can be fuzzy."
//
// Today `tau` and `delta` are two constants applied to every field on every
// page, which means a price and a marketing blurb get identical scepticism.
// One threshold cannot be right for both: tight enough for money pages you
// weekly about prose, loose enough for prose is wrong about money.
//
// This file is pure -- zod and yaml, no database, no clock, no network -- so
// `src/runner.ts` can import `thresholdsFor` without acquiring a pg
// dependency, and so the CLI can validate a file on a laptop with no Postgres.

import { LineCounter, parseDocument, isMap, type Document } from 'yaml';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Tiers
// ---------------------------------------------------------------------------

export const TIERS = ['strict', 'normal', 'loose'] as const;
export type Tier = (typeof TIERS)[number];

/**
 * Three tiers, and the numbers are read off `results/sweep.json` -- the
 * 110-pair calibration -- not chosen for how they look.
 *
 *   tier    tau   delta   correct  wrong        abstained
 *   strict  0.70  0.20    84/135   0  (0.0%)    37.8%
 *   normal  0.60  0.16    93/135   0  (0.0%)    31.1%
 *   loose   0.60  0.12   105/135   6  (4.4%)    17.8%
 *
 * `normal` is the sweep's own `best` entry: the least-abstaining pair on the
 * grid that still reaches zero wrong values, and the pair `healGated` already
 * defaults to. A contract that says nothing gets it, unchanged.
 *
 * `strict` is the cheapest point on the wrong-zero frontier that is strictly
 * more sceptical than `normal`: (0.70, 0.20) and (0.75, 0.25) score
 * identically on the corpus, so the lower pair is taken. Honestly: on THIS
 * corpus strict buys nothing measurable, because normal is already at 0.0%
 * wrong. What it buys is headroom against mutations the corpus does not
 * contain, and the price of that headroom is measured -- 9 fewer correct
 * values and 6.7 more points of abstention. A field marked strict interrupts
 * a human more often, on purpose.
 *
 * `loose` lowers the margin and NOT the floor, which looks asymmetric and is
 * the finding rather than an oversight. Below tau 0.60 the sweep buys 4.5
 * points of abstention and doubles the wrong values (6 -> 12) for it, so the
 * floor stays. tau guards "the right element is gone" -- nothing on the page
 * is good enough -- and prose cannot tolerate grabbing a nav link because the
 * field vanished any more than a price can. delta guards "two things look
 * equally right", and picking either of two near-identical blurbs is exactly
 * the risk a description field is willing to take.
 *
 * Choosing `loose` forfeits the product's 0.0% claim for that field. On the
 * benchmark it publishes a wrong value in 4.4% of breaks. That is the trade,
 * stated in numbers, and it is why the tier is opt-in per field.
 */
export const TIER_THRESHOLDS: Record<Tier, { tau: number; delta: number }> = {
  strict: { tau: 0.70, delta: 0.20 },
  normal: { tau: 0.60, delta: 0.16 },
  loose: { tau: 0.60, delta: 0.12 },
};

export const ON_ABSTAIN = ['quarantine', 'publish_last_good'] as const;
export type OnAbstain = (typeof ON_ABSTAIN)[number];

// ---------------------------------------------------------------------------
// The schema
// ---------------------------------------------------------------------------

/** A gate score is `hit / total` over the weighted spec, so it lives in [0, 1]. */
const Score = z.number().gt(0).lte(1);

/**
 * `auto_approve` is a band, expressed as its floor. A heal the gate approved
 * is published unattended when `score > floor`; between tau and the floor it
 * is held for a human even though the gate was willing. Below tau the gate
 * abstained already and this never runs.
 *
 * `clear_margin` is the gate's own reason code and names the default band --
 * floor = tau, so everything the gate approves goes. `never` is a floor of 1,
 * unreachable under a strict `>` because no score exceeds 1.
 */
const AUTO_APPROVE_ERROR =
  'auto_approve must be "never", "clear_margin", or a score above 0 and at most 1.';

// The message is repeated onto the numeric branch on purpose: a union reports
// its own error only when NO branch matches, so `auto_approve: 1.5` resolves to
// the number branch and would otherwise come back as a bare "Too big", which
// does not tell the operator what else they could have written.
const AutoApprove = z.union(
  [
    z.literal('never'),
    z.literal('clear_margin'),
    z.number(AUTO_APPROVE_ERROR).gt(0, AUTO_APPROVE_ERROR).lte(1, AUTO_APPROVE_ERROR),
  ],
  { error: AUTO_APPROVE_ERROR },
);

export const FieldPolicy = z.strictObject({
  policy: z.enum(TIERS).optional(),
  // Raw tau/delta are settable and deliberately undocumented. A user
  // hand-tuning deltas per field is a user the tiers have failed.
  tau: Score.optional(),
  delta: z.number().gte(0).lt(1).optional(),
  on_abstain: z.enum(ON_ABSTAIN).optional(),
  auto_approve: AutoApprove.optional(),
  alert: z.string().min(1).optional(),
});
export type FieldPolicy = z.infer<typeof FieldPolicy>;

export const ContractSchema = z.strictObject({
  target: z.string().min(1),
  fields: z.record(z.string().min(1), FieldPolicy),
});
export type Contract = z.infer<typeof ContractSchema>;

/** Every key the schema accepts, for the "you meant one of these" message. */
const TOP_KEYS = Object.keys(ContractSchema.shape).sort();
const FIELD_KEYS = Object.keys(FieldPolicy.shape).sort();

// ---------------------------------------------------------------------------
// thresholdsFor -- the hook wave 2 wires into src/runner.ts
// ---------------------------------------------------------------------------

export interface FieldThresholds {
  policy: Tier;
  tau: number;
  delta: number;
  /** Gated heals scoring at or below this are held anyway. See `AutoApprove`. */
  autoApproveAbove: number;
  onAbstain: OnAbstain;
  /** Where an abstention goes. Null is "nowhere", never a default channel. */
  alert: string | null;
}

/**
 * What a contract that says nothing means: exactly what the engine does today.
 * These two numbers are `healGated`'s own defaults in `src/heal.ts`, repeated
 * here because that file is frozen and cannot export them. `test/contracts.test.ts`
 * reads heal.ts and fails if the two ever drift apart.
 */
export const DEFAULT_THRESHOLDS: FieldThresholds = Object.freeze({
  policy: 'normal',
  tau: 0.60,
  delta: 0.16,
  autoApproveAbove: 0.60,
  onAbstain: 'quarantine',
  alert: null,
});

const floorFor = (v: FieldPolicy['auto_approve'], tau: number): number => {
  if (v === 'never') return 1;
  if (v === 'clear_margin' || v === undefined) return tau;
  return v;
};

/**
 * The thresholds in force for one field. Pure, and inert by construction: with
 * no contract, or with a contract that does not mention the field, it returns
 * `DEFAULT_THRESHOLDS` -- so wiring it into the runner moves no number until
 * an operator writes a file.
 *
 * The `??` chains are tier defaults, not coercions: an absent `policy` means
 * `normal` because that is what the tier vocabulary says an unstated tier is,
 * and the absence survives untouched in the stored contract, which is what a
 * reviewer diffs. Nothing here turns a missing value into a zero.
 */
export function thresholdsFor(
  contract: Contract | null | undefined,
  field: string,
): FieldThresholds {
  const policy = contract?.fields?.[field];
  if (!policy) return DEFAULT_THRESHOLDS;

  const tier = policy.policy ?? DEFAULT_THRESHOLDS.policy;
  const tau = policy.tau ?? TIER_THRESHOLDS[tier].tau;
  const delta = policy.delta ?? TIER_THRESHOLDS[tier].delta;

  return {
    policy: tier,
    tau,
    delta,
    autoApproveAbove: floorFor(policy.auto_approve, tau),
    onAbstain: policy.on_abstain ?? DEFAULT_THRESHOLDS.onAbstain,
    // `alert: none` is what docs/FEATURES.md writes for "tell nobody", and YAML
    // reads it as the string. Mapped here so the stored contract keeps the word
    // the operator typed.
    alert: policy.alert === undefined || policy.alert === 'none' ? null : policy.alert,
  };
}

// ---------------------------------------------------------------------------
// Parsing, with the line the operator has to go and fix
// ---------------------------------------------------------------------------

export interface ContractIssue {
  /** One-indexed, or null when the failure has no position in the source. */
  line: number | null;
  col: number | null;
  /** Dotted path into the document, e.g. `fields.price.policy`. */
  path: string;
  message: string;
}

export type ParseResult =
  | { ok: true; contract: Contract }
  | { ok: false; issues: ContractIssue[] };

/**
 * What each key accepts, in this project's words rather than Zod's.
 *
 * Not a nicety. Zod 4 carries its default messages in a locale module, and
 * Next 16's production bundle drops it -- the same bad contract reads
 * `Invalid option: expected one of "strict"|"normal"|"loose"` in process and a
 * bare `Invalid input` over HTTP, which was reproduced against `next start`
 * before this table existed. Telling an operator which line is wrong is the
 * entire feature, so it cannot depend on a message surviving a bundler.
 */
const EXPLAIN: Record<string, string> = {
  target: 'target must be the id of a registered target.',
  fields: 'fields must be a map of field name to policy.',
  policy: `policy must be one of: ${TIERS.join(', ')}.`,
  on_abstain: `on_abstain must be one of: ${ON_ABSTAIN.join(', ')}.`,
  auto_approve: AUTO_APPROVE_ERROR,
  tau: 'tau must be a score above 0 and at most 1.',
  delta: 'delta must be at least 0 and below 1.',
  alert: 'alert must be a non-empty string, or "none" for nobody.',
};

/** One Zod issue, in a sentence built here rather than read off the locale. */
function explain(issue: z.core.$ZodIssue, missing: boolean): string {
  const hint = EXPLAIN[String(issue.path.at(-1) ?? '')];
  if (hint) return missing ? `Missing. ${hint}` : hint;

  switch (issue.code) {
    case 'invalid_type':
      return missing ? `Missing. Expected ${issue.expected}.` : `Expected ${issue.expected}.`;
    case 'invalid_value':
      return `Expected one of: ${issue.values.map((v) => JSON.stringify(v)).join(', ')}.`;
    case 'too_small':
      return `Must be ${issue.inclusive ? 'at least' : 'greater than'} ${issue.minimum}.`;
    case 'too_big':
      return `Must be ${issue.inclusive ? 'at most' : 'less than'} ${issue.maximum}.`;
    // The code is kept even when the message is the bundler's bare "Invalid
    // input", so a reader is never left with nothing to search for.
    default:
      return `${issue.code}: ${issue.message}`;
  }
}

/** Which keys are legal at this point in the document. */
function knownKeysAt(path: readonly PropertyKey[]): readonly string[] | null {
  if (path.length === 0) return TOP_KEYS;
  // fields.<name> -- the only other map with a fixed key set.
  if (path.length === 2 && path[0] === 'fields') return FIELD_KEYS;
  return null;
}

/**
 * Validate YAML against the contract schema.
 *
 * Every failure comes back with a line, because "invalid contract" sends an
 * operator to read the whole file and an unknown key that is quietly dropped
 * makes the contract worthless -- the field they thought they had configured
 * silently keeps the global thresholds.
 *
 * `knownFields` is the set of fields Assay has actually seen on the target.
 * When the caller can supply it, a mistyped FIELD name is caught the same way
 * a mistyped key is. When it cannot, field names are not checked, and the
 * caller says so rather than implying they were.
 */
export function parseContract(
  source: string,
  { knownFields }: { knownFields?: readonly string[] } = {},
): ParseResult {
  const counter = new LineCounter();
  const doc = parseDocument(source, { lineCounter: counter, prettyErrors: true });

  if (doc.errors.length) {
    return {
      ok: false,
      issues: doc.errors.map((e) => ({
        line: e.linePos?.[0].line ?? null,
        col: e.linePos?.[0].col ?? null,
        path: '',
        // The pretty message embeds a source extract and repeats the position;
        // both are already fields here, so only the sentence is kept.
        message: `${e.code}: ${e.message.split('\n')[0].replace(/ at line \d+, column \d+:?$/, '')}`,
      })),
    };
  }

  const raw: unknown = doc.toJS();
  if (raw === null || raw === undefined) {
    return {
      ok: false,
      issues: [{ line: null, col: null, path: '', message: 'The contract is empty.' }],
    };
  }

  const at = (path: readonly PropertyKey[], key?: string): { line: number | null; col: number | null } =>
    locate(doc, counter, path, key);

  const result = ContractSchema.safeParse(raw);
  if (!result.success) {
    const issues: ContractIssue[] = [];
    for (const issue of result.error.issues) {
      if (issue.code === 'unrecognized_keys') {
        const known = knownKeysAt(issue.path);
        for (const key of issue.keys) {
          issues.push({
            ...at(issue.path, key),
            path: dotted([...issue.path, key]),
            message: known
              ? `Unknown key "${key}". Keys allowed here: ${known.join(', ')}.`
              : `Unknown key "${key}".`,
          });
        }
        continue;
      }
      issues.push({
        ...at(issue.path),
        path: dotted(issue.path),
        message: explain(issue, !doc.hasIn(issue.path.map(String))),
      });
    }
    return { ok: false, issues };
  }

  if (knownFields) {
    const issues = Object.keys(result.data.fields)
      .filter((name) => !knownFields.includes(name))
      .map((name) => ({
        ...at(['fields'], name),
        path: dotted(['fields', name]),
        message:
          `Unknown field "${name}" on target "${result.data.target}". `
          + `Fields Assay has records for: ${[...knownFields].sort().join(', ') || '(none yet)'}.`,
      }));
    if (issues.length) return { ok: false, issues };
  }

  return { ok: true, contract: result.data };
}

const dotted = (path: readonly PropertyKey[]): string => path.map(String).join('.');

/**
 * Where in the source a validated path lives. `key` asks for the position of
 * that key's own token inside the map at `path`, which is what an unrecognised
 * key needs -- pointing at the enclosing map would send the operator to the
 * line above the typo.
 *
 * A missing key has no node of its own, so the path is walked back towards the
 * root until something in the source is found. The nearest enclosing map is
 * where the key should have been written.
 */
function locate(
  doc: Document,
  counter: LineCounter,
  path: readonly PropertyKey[],
  key?: string,
): { line: number | null; col: number | null } {
  const nodeAt = (p: readonly PropertyKey[]): unknown =>
    p.length ? doc.getIn(p.map(String), true) : doc.contents;

  let node = nodeAt(path);
  for (let i = path.length; !node && i > 0; i--) node = nodeAt(path.slice(0, i - 1));

  let range = (node as { range?: [number, number, number] } | null)?.range;
  if (key !== undefined && isMap(node)) {
    const pair = node.items.find((i) => (i.key as { value?: unknown } | null)?.value === key);
    range = (pair?.key as { range?: [number, number, number] } | undefined)?.range ?? range;
  }
  if (!range) return { line: null, col: null };

  const pos = counter.linePos(range[0]);
  return { line: pos.line, col: pos.col };
}

/** One line per issue, in the shape an operator can paste into a bug report. */
export const formatIssues = (issues: readonly ContractIssue[], file = 'contract'): string =>
  issues
    .map((i) => `${file}:${i.line ?? '?'}:${i.col ?? '?'}  ${i.path ? `${i.path}: ` : ''}${i.message}`)
    .join('\n');

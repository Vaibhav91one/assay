// Notice that something broke -- before anyone looks at the data.
//
// Every existing healer fires on an exception or a zero-result selector. That
// misses the case that matters most: a selector that STILL RESOLVES but now
// points at the wrong element (PLAN.md 7, category D). The value checks below
// catch it, and they are nearly free because the expected shape was already
// captured at fingerprint time.

/**
 * Robust z-score: median + MAD, not mean + stddev, so one bad run cannot move
 * the baseline.
 *
 * The mad === 0 branch is load-bearing, not a formality. A field sitting at
 * exactly 0% nulls on every run -- the COMMON case for a healthy field -- gives
 * MAD 0. Returning 0 there scores a jump from 0% to 90% nulls as perfectly
 * normal, which is precisely the alert this exists for.
 */
/** Median, median-absolute-deviation, and the robust z-score of one observation. */
export interface RobustZ {
  z: number;
  med: number;
  mad: number;
  spike: boolean;
}

/** What capture time recorded about the shape of a healthy value. */
export interface Expected {
  regex?: string;
  regexFlags?: string;
  minLen?: number;
}

/** One prior run, as far as the detectors are concerned. */
export interface HistoryPoint {
  nullRate?: number | null;
  pageBytes?: number | null;
}

export interface DetectInput {
  field: string;
  value: unknown;
  expected?: Expected;
  history?: HistoryPoint[];
  skeleton?: { before?: string | null; after?: string | null };
  anchors?: Record<string, unknown>;
  anchorsBefore?: Record<string, unknown> | null;
  pageBytes?: number | null;
  /** The response body before parsing or script removal. Block markers live in
   *  exactly the bytes a normal extractor quite reasonably throws away. */
  receivedHtml?: string | null;
  baselinePageBytes?: number | null;
}

/** Attribution. Not every signal means the selector broke -- see below. */
export type Cause = 'ok' | 'blocked' | 'semantic_drift' | 'wrong_value' | 'selector_break' | 'unknown';

export interface Detection {
  field: string;
  /** False for a blocked fetch: no field was observed, so there is no field
   *  break to heal, queue, or use as a new baseline. */
  broken: boolean;
  blocked: boolean;
  cause: Cause;
  signals: string[];
  context: string[];
  corroborated: boolean;
  diagnosis: string;
}

export function robustZ(series: readonly number[], x: number): RobustZ {
  const s = [...series].sort((a, b) => a - b);
  if (!s.length) return { z: 0, med: x, mad: 0, spike: false };
  const med = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  const devs = s.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
  const mad = devs.length % 2 ? devs[(devs.length - 1) / 2]
    : (devs[devs.length / 2 - 1] + devs[devs.length / 2]) / 2;
  const z = mad === 0 ? 0 : (0.6745 * (x - med)) / mad;
  return { z, med, mad, spike: z > 3.5 || (mad === 0 && x !== med) };
}

const PLACEHOLDERS = new Set(['', '-', '--', 'n/a', 'na', 'null', 'undefined', 'tbd', '0', 'none']);

/**
 * Identify a response body that is a provider or verification interstitial.
 *
 * The narrowness is intentional. We do NOT match the words `captcha`, `access
 * denied`, `Cloudflare`, or `sign in` on their own: documentation, incident
 * reports, and ordinary account pages contain all four. Even Cloudflare's
 * challenge-platform script is not sufficient -- the measured IKEA pages load
 * it as ordinary site furniture -- so it needs the interstitial title too.
 * Generic login/challenge language is accepted only on a body under 40% of the
 * stored healthy page. A false
 * positive here makes a watched field silently disappear, which is worse than
 * one missed block becoming a visible quarantine.
 */
export function detectBlockedPage(
  html: string,
  { baselineBytes = null }: { baselineBytes?: number | null } = {},
): string | null {
  if (/<title[^>]*>\s*just a moment(?:\.\.\.)?\s*<\/title>/i.test(html)
      && /\/cdn-cgi\/challenge-platform\/(?:h\/|scripts\/jsd\/main\.js)/i.test(html)) {
    return 'cloudflare_challenge_script';
  }
  if (/<title[^>]*>\s*access to this page has been denied\s*<\/title>/i.test(html)
      && /\bid=["']px-captcha["']/i.test(html)) {
    return 'perimeterx_interstitial';
  }
  if (/captcha-delivery\.com\/captcha\//i.test(html) && /\bdatadome\b/i.test(html)) {
    return 'datadome_challenge_script';
  }

  const short = baselineBytes != null && baselineBytes > 0 && html.length < baselineBytes * 0.4;
  if (!short) return null;
  if (/<title[^>]*>\s*sign in to continue\s*<\/title>/i.test(html)
      && /<input\b[^>]*\btype=["']password["']/i.test(html)) {
    return 'short_login_wall';
  }
  if (/(?:verify you are human|checking your browser)/i.test(html)
      && /(?:captcha|challenge|cf-chl-)/i.test(html)) {
    return 'short_verification_interstitial';
  }
  return null;
}

/** A value that is present but meaningless is a break, not a success. */
export function isPlaceholder(v: unknown): boolean {
  return v === null || v === undefined || PLACEHOLDERS.has(String(v).trim().toLowerCase());
}

/**
 * Run every detector against one field on one run.
 *
 * `expected` comes from capture time: the regex the value matched, its length
 * range, and the anchors that resolved. Returns a DIAGNOSIS STRING, not a
 * boolean -- that string is what the heal decision and the proof record consume.
 */
export function detect({
  field,
  value,
  expected = {},
  history = [],
  skeleton = {},
  anchors = {},
  // what the anchors resolved to on the last known-good run. Without this,
  // "anchor is null" cannot be told apart from "anchor was never there" -- and
  // a detector that fires on every page lacking an h1 is noise, not signal.
  anchorsBefore = null,
  // serialized page length this run. Same median+MAD machinery as the null
  // rate; only SHRINKAGE fires (a page that grows is content, a page that
  // loses a third of itself is a template failure or a block page).
  pageBytes = null,
  receivedHtml = null,
  baselinePageBytes = null,
}: DetectInput): Detection {
  const blockedReason = receivedHtml
    ? detectBlockedPage(receivedHtml, { baselineBytes: baselinePageBytes })
    : null;
  if (blockedReason) {
    return {
      field,
      broken: false,
      blocked: true,
      cause: 'blocked',
      signals: [`fetch_blocked:${blockedReason}`],
      context: [],
      corroborated: false,
      diagnosis: `${field}: observation withheld (fetch blocked: ${blockedReason})`,
    };
  }

  const signals: string[] = [];

  if (value === null || value === undefined) signals.push('value_missing');
  else if (isPlaceholder(value)) signals.push(`placeholder_value:"${value}"`);

  if (value != null && expected.regex) {
    // JS has no inline (?i) -- flags are a separate argument. Guard against a
    // bad pattern rather than letting a malformed expectation crash the run.
    let re: RegExp | null = null;
    try {
      re = new RegExp(expected.regex, expected.regexFlags ?? 'i');
    } catch (err) {
      signals.push(`bad_expectation_regex:${(err as Error).message}`);
    }
    if (re && !re.test(String(value))) {
      signals.push(`shape_mismatch:/${expected.regex}/${expected.regexFlags ?? 'i'} got "${String(value).slice(0, 40)}"`);
    }
  }

  if (value != null && expected.minLen && String(value).length < expected.minLen) {
    signals.push(`too_short:${String(value).length}<${expected.minLen}`);
  }

  if (history.length >= 3) {
    const nulls = history.map((h) => h.nullRate ?? 0);
    const now = value == null ? 1 : 0;
    const rz = robustZ(nulls, now);
    // report WHY it fired -- a z of 0.0 next to the word "spike" reads as a bug
    if (rz.spike) {
      signals.push(
        rz.mad === 0
          ? `null_rate_spike:zero_variance_baseline (was ${rz.med}, now ${now})`
          : `null_rate_spike:z=${rz.z.toFixed(1)}`
      );
    }
  }

  if (pageBytes != null && history.length >= 3) {
    const sizes = history.map((h) => h.pageBytes).filter((v): v is number => v != null);
    if (sizes.length >= 3) {
      const rz = robustZ(sizes, pageBytes);
      // 5% materiality floor. Without it the zero-variance branch fires on a
      // single byte and reports "0% shorter" -- a hair trigger wearing the
      // costume of a detector. Real template losses are double digits.
      const material = pageBytes < rz.med * 0.95;
      const shrunk = material && (rz.mad === 0 || rz.z < -3.5);
      if (shrunk) {
        const pct = Math.round((1 - pageBytes / rz.med) * 100);
        signals.push(`page_shrunk:${pct}% shorter than the last ${sizes.length} runs`);
      }
    }
  }

  // Context, NOT a break on its own. A site can redesign its whole template while
  // our selector keeps returning the right value -- that is a success, not an
  // incident. Treating a layout change as a break is how a detector earns being
  // ignored. It corroborates other signals and raises confidence; it never fires
  // alone.
  const context: string[] = [];
  if (skeleton.before && skeleton.after && skeleton.before !== skeleton.after) {
    context.push(`skeleton_changed:${skeleton.before}->${skeleton.after}`);
  }

  // Multi-anchor disagreement. This is the drift detector: it fires while the
  // field still has a value, which is earlier than any null-based signal can.
  const resolved = Object.entries(anchors).filter(([, v]) => v != null);
  const distinct = new Set(resolved.map(([, v]) => String(v).trim()));
  if (resolved.length >= 2 && distinct.size > 1) {
    signals.push(`anchors_disagree:${resolved.length} anchors, ${distinct.size} values`);
  }
  // An anchor only "died" if it was alive at capture time. With no baseline to
  // compare against we say nothing, rather than inventing a break.
  if (anchorsBefore) {
    const died = Object.keys(anchors).filter(
      (k) => anchorsBefore[k] != null && anchors[k] == null
    );
    if (died.length) signals.push(`anchors_died:${died.join(',')}`);
  }

  // Attribution: not every signal means the selector broke. Healing a blocked
  // page or a soft-404 is how a healer poisons its own baseline.
  let cause: Cause = 'ok';
  if (signals.length) {
    if (signals.some((s) => s.startsWith('anchors_disagree'))) cause = 'semantic_drift';
    else if (signals.some((s) => s.startsWith('shape_mismatch') || s.startsWith('placeholder')))
      cause = 'wrong_value';
    else if (signals.includes('value_missing')) cause = 'selector_break';
    else if (signals.some((s) => s.startsWith('anchors_died'))) cause = 'selector_break';
    else cause = 'unknown';
  }

  const broken = signals.length > 0;
  const all = [...signals, ...context];

  return {
    field,
    broken,
    blocked: false,
    cause,
    signals,
    context,
    // a layout change alongside a real signal is corroboration; it is the
    // difference between "the field is null" and "the field is null AND they
    // rebuilt the page", which is a much stronger case for healing
    corroborated: broken && context.length > 0,
    diagnosis: broken
      ? `${field}: ${all.join('; ')}`
      : context.length
        ? `${field}: healthy (${context.join('; ')})`
        : `${field}: healthy`,
  };
}

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
export function robustZ(series, x) {
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

/** A value that is present but meaningless is a break, not a success. */
export function isPlaceholder(v) {
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
}) {
  const signals = [];

  if (value === null || value === undefined) signals.push('value_missing');
  else if (isPlaceholder(value)) signals.push(`placeholder_value:"${value}"`);

  if (value != null && expected.regex) {
    // JS has no inline (?i) -- flags are a separate argument. Guard against a
    // bad pattern rather than letting a malformed expectation crash the run.
    let re = null;
    try {
      re = new RegExp(expected.regex, expected.regexFlags ?? 'i');
    } catch (err) {
      signals.push(`bad_expectation_regex:${err.message}`);
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

  // Context, NOT a break on its own. A site can redesign its whole template while
  // our selector keeps returning the right value -- that is a success, not an
  // incident. Treating a layout change as a break is how a detector earns being
  // ignored. It corroborates other signals and raises confidence; it never fires
  // alone.
  const context = [];
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
  let cause = 'ok';
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

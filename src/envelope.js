// The trust envelope (FEATURES.md F13). An output format, not a system.
//
// Two hard rules, enforced here and nowhere else so every caller inherits them:
//   1. a held field is null AND labelled -- never omitted (an absent key is
//      indistinguishable from a schema change downstream)
//   2. a held field is never filled -- no default, no last-good, no coercion.
//      There is no flag for this. It is an absence, not a setting.

// The closed vocabulary. stale and degraded are defined by F13 but nothing can
// emit them yet -- they need the per-field policy engine (contracts) to exist.
export const STATUSES = ['live', 'healed', 'quarantined', 'stale', 'degraded'];

/**
 * Build the published row from raw values and per-field statuses.
 *
 * statuses: { field: { status, reason?, held_since_run? } }
 * Every field named in statuses appears in the row; quarantined fields are
 * forced to null regardless of what values carries for them.
 */
export function publishRow({ values = {}, statuses, run, proof }) {
  const row = {};
  const fields = {};
  for (const [field, st] of Object.entries(statuses)) {
    if (!STATUSES.includes(st.status)) {
      throw new Error(`unknown field status "${st.status}" for ${field}`);
    }
    row[field] = st.status === 'quarantined' ? null : values[field] ?? null;
    fields[field] = {
      status: st.status,
      ...(st.reason ? { reason: st.reason } : {}),
      ...(st.held_since_run != null ? { held_since_run: st.held_since_run } : {}),
    };
  }
  return { ...row, _assay: { run, proof, fields } };
}

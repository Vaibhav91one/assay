// Turning a template field into the contract document the store already knows.
//
// SPLIT FROM `./index.ts` FOR THE REASON `../contracts/tiers.ts` WAS SPLIT FROM
// `../contracts/index.ts`: the screens that show a template are client
// components, they need the tier vocabulary and the template data, and pulling
// a YAML serialiser into the browser bundle to get them would be the exact leak
// that comment warns about. `./index.ts` imports one import-free module and
// nothing else; this file is server-side and holds the one dependency.

import { stringify } from 'yaml';
import type { TemplateField } from './index.js';

/**
 * The contract document for ONE field of a template, as YAML.
 *
 * One document per field because that is the granularity the store has: the
 * engine watches one field per target row, `targetIdFor` is `slug__field`, and
 * `latestContract(target.targetId)` is how `src/connectors/ingest.ts` reads it
 * back. A single document naming several fields would be written against one
 * row and read by none of the others.
 *
 * Serialised rather than string-built, so a field name that ever needed quoting
 * gets it, and so the stored `yaml` column holds something a reviewer can diff.
 *
 * NOTHING HERE WRITES tau OR delta. The tier IS the setting and `thresholdsFor`
 * resolves it -- FEATURES.md F2 is explicit that a user hand-tuning deltas per
 * field is a user the tiers have failed, and a template that baked the numbers
 * in would freeze this corpus's fitted values into every page anyone applies it
 * to, which docs/LIMITATIONS.md 5 says there is no evidence for.
 */
export function contractFor(field: TemplateField, targetId: string): string {
  return stringify({ target: targetId, fields: { [field.name]: { policy: field.policy } } });
}

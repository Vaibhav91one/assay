// Reports: F14's incident record, the compare/diff, and the digest cadence.
//
// One idea in three shapes -- composing a truthful account from records that
// already exist. Nothing in this directory writes to the store except the
// digest claim, and nothing in it computes a new fact about a page.
//
// The hook wave 2 wires into tools/worker.ts is `dueDigests()`. It returns []
// when the digests table is empty, so wiring it moves nothing until an operator
// configures one.

export { incidentRecord, episodes, type IncidentRecord, type HeldCellRecord } from './incident.js';
export { fieldHistory, toEntries, fieldsWithRuns, type DiffEntry, type FieldHistory } from './diff.js';
export {
  composeDigest, digestHtml, dueDigests, markDigestSent,
  type Digest, type DueDigest,
} from './digest.js';
export { incidentMarkdown, diffText, digestText } from './render.js';
export { when, causeOf, heldBecause, resolutionOf, type Term } from './vocabulary.js';

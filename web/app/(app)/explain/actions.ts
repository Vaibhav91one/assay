'use server';

import { provenance, type Provenance } from '@/lib/explain';

/**
 * The same `provenance()` the route calls, reachable from the client.
 *
 * `ProofSheet` needs the answer for a proof it did not know it would be asked
 * about, so the data has to arrive after the click rather than with the page.
 * Rendering it eagerly is not an option: the Decisions screen shows up to fifty
 * cards and each proof costs four store queries, so pre-loading them would be
 * two hundred queries to answer a question nobody has asked yet.
 *
 * A server action rather than a new API route, because there is nothing here an
 * API route would add. It exposes exactly what `/explain/[proof]` and
 * `/api/v1/explain/[proof]` already expose, to the same origin, from the same
 * function.
 */
export async function proofAction(proof: string): Promise<Provenance | null> {
  return provenance(proof);
}

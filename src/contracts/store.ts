// Reading and appending contract versions. Append-only, and that is the whole
// design: "the contract said 0.6 at the time" has to be answerable months
// later, which a mutable row cannot do.
//
// Both forms are stored. `yaml` is what the operator wrote, byte for byte,
// because that is what a reviewer diffs and what the app shows back. `parsed`
// is what `thresholdsFor` reads, because reparsing on every run would discover
// a syntax error at scrape time.

import { desc, sql } from 'drizzle-orm';
import { getDb, contracts, targets, eq, and } from '../store/index.js';
import { parseContract, type Contract, type ContractIssue } from './index.js';

export interface ContractVersion {
  contractId: number;
  targetId: string;
  version: number;
  yaml: string;
  parsed: Contract;
  createdAt: Date;
}

/**
 * A stored row's `parsed` is jsonb, validated on the way in and cast on the way
 * out. Deliberately not re-validated: a version written last year is evidence
 * of what the contract said then, and re-checking it against today's schema
 * would make the audit trail fail exactly when the schema gains a key -- which
 * is the one moment someone needs to read the old version.
 */
const asVersion = (r: typeof contracts.$inferSelect): ContractVersion => ({
  contractId: r.contractId,
  targetId: r.targetId,
  version: r.version,
  yaml: r.yaml,
  parsed: r.parsed as Contract,
  createdAt: r.createdAt,
});

/** Every field Assay has actually published a cell for on this target. */
export async function knownFields(targetId: string): Promise<string[]> {
  const rows = await getDb().execute(sql`
    SELECT DISTINCT fr.field
    FROM field_runs fr
    JOIN runs r ON r.run_id = fr.run_id
    WHERE r.target_id = ${targetId}
    ORDER BY fr.field
  `);
  // TODO(types): drizzle's execute hands back Record<string, unknown> rows.
  return (rows.rows as { field: string }[]).map((r) => r.field);
}

export type SaveResult =
  | { ok: true; version: ContractVersion }
  | { ok: false; issues: ContractIssue[] };

/**
 * Validate YAML and append it as the next version of that target's contract.
 *
 * The target id comes from inside the document, so a contract file identifies
 * itself and there is no second parameter to get wrong. An unknown target is
 * an issue with a line, not a foreign-key error out of the driver.
 *
 * `checkFields` costs a query and is off by default so a caller with no run
 * history is not told its fields do not exist.
 */
export async function saveContract(
  source: string,
  { checkFields = false }: { checkFields?: boolean } = {},
): Promise<SaveResult> {
  const shallow = parseContract(source);
  if (!shallow.ok) return shallow;
  const targetId = shallow.contract.target;

  const d = getDb();
  const known = await d.select().from(targets).where(eq(targets.targetId, targetId)).limit(1);
  if (!known.length) {
    const at = source.split('\n').findIndex((l) => /^\s*target\s*:/.test(l));
    return {
      ok: false,
      issues: [{
        line: at < 0 ? null : at + 1,
        col: at < 0 ? null : 1,
        path: 'target',
        message: `No target "${targetId}". Register the target before writing a contract for it.`,
      }],
    };
  }

  const parsed = checkFields
    ? parseContract(source, { knownFields: await knownFields(targetId) })
    : shallow;
  if (!parsed.ok) return parsed;

  // ponytail: the next version number is a sub-select inside the INSERT, so it
  // is atomic against anything but a second writer on the SAME target at the
  // same instant -- contracts are written by a human in a PR, not a loop. The
  // real fix is a unique index on (target_id, version); migration 0004 has only
  // a plain index and wave 1 does not add a 0005. Named in the report.
  const [row] = await d
    .insert(contracts)
    .values({
      targetId,
      version: sql`(SELECT COALESCE(MAX(version), 0) + 1 FROM contracts WHERE target_id = ${targetId})`,
      yaml: source,
      parsed: parsed.contract,
    })
    .returning();

  return { ok: true, version: asVersion(row) };
}

/** The contract in force, or null. Null is "no contract", never an empty one. */
export async function latestContract(targetId: string): Promise<ContractVersion | null> {
  const [row] = await getDb()
    .select()
    .from(contracts)
    .where(eq(contracts.targetId, targetId))
    .orderBy(desc(contracts.version))
    .limit(1);
  return row ? asVersion(row) : null;
}

/** One exact version, for showing an operator what they wrote at the time. */
export async function contractVersion(
  targetId: string,
  version: number,
): Promise<ContractVersion | null> {
  const [row] = await getDb()
    .select()
    .from(contracts)
    .where(and(eq(contracts.targetId, targetId), eq(contracts.version, version)))
    .limit(1);
  return row ? asVersion(row) : null;
}

/** Every version, newest first. The history IS the audit trail. */
export async function contractHistory(targetId: string): Promise<ContractVersion[]> {
  const rows = await getDb()
    .select()
    .from(contracts)
    .where(eq(contracts.targetId, targetId))
    .orderBy(desc(contracts.version));
  return rows.map(asVersion);
}

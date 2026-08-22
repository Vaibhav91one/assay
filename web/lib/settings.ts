// Server-only. Reads the store, the capture directory and the connector file;
// see web/lib/queue.ts on why `server-only` is deliberately not a dependency.
import { getDb } from 'assay/store';
import * as schema from 'assay/engine/store/schema';
import { knownFields } from 'assay/engine/health/observe';
import { latestContract } from 'assay/engine/contracts/store';
import {
  DEFAULT_THRESHOLDS,
  thresholdsFor,
  type FieldThresholds,
} from 'assay/engine/contracts/index';
import { CAPTURE_DIR } from 'assay/store/captures';
import { describe, type Presence } from 'assay/engine/connectors/config';
import { eq, sql } from 'drizzle-orm';

/**
 * What Assay may publish, and where the data goes.
 *
 * This screen reports the settings that are *in force*, which is not the same
 * as the settings someone wrote down. The runner resolves thresholds in a
 * fixed order -- a saved contract, then the target's own row, then the
 * calibrated defaults -- so every row here says which of the three it came
 * from. A settings screen that shows a value the engine is not using is worse
 * than no settings screen.
 */

export type Source = 'contract' | 'target' | 'calibrated';

export interface Policy {
  scraper: string;
  targetId: string;
  field: string;
  thresholds: FieldThresholds;
  source: Source;
  /** True when this row's numbers differ from the calibrated defaults. */
  custom: boolean;
}

export interface SettingsView {
  policies: Policy[];
  defaults: FieldThresholds;
  store: { reachable: boolean; detail: string };
  captures: { dir: string; kept: number; pruned: number };
  connectors: Presence[];
}

/** The target row's own `thresholds`, when it has any. jsonb, so narrow it. */
function targetThresholds(contract: unknown): { tau: number; delta: number } | null {
  if (!contract || typeof contract !== 'object') return null;
  const t = (contract as Record<string, unknown>).thresholds;
  if (!t || typeof t !== 'object') return null;
  const { tau, delta } = t as Record<string, unknown>;
  return typeof tau === 'number' && typeof delta === 'number' ? { tau, delta } : null;
}

export async function settingsView(): Promise<SettingsView> {
  const db = getDb();

  const [fields, captures, connectors] = await Promise.all([
    knownFields(),
    db
      .select({
        kept: sql<number>`count(*) filter (where ${schema.captures.pruned} = false)`.mapWith(Number),
        pruned: sql<number>`count(*) filter (where ${schema.captures.pruned} = true)`.mapWith(Number),
      })
      .from(schema.captures),
    describe(),
  ]);

  const policies = await Promise.all(
    fields.map(async (f): Promise<Policy> => {
      const [saved, [target]] = await Promise.all([
        latestContract(f.target),
        db
          .select({ contract: schema.targets.contract })
          .from(schema.targets)
          .where(eq(schema.targets.targetId, f.target))
          .limit(1),
      ]);

      if (saved) {
        const t = thresholdsFor(saved.parsed, f.field);
        return { ...row(f), thresholds: t, source: 'contract', custom: differs(t) };
      }

      const own = targetThresholds(target?.contract);
      if (own) {
        const t = { ...DEFAULT_THRESHOLDS, ...own };
        return { ...row(f), thresholds: t, source: 'target', custom: differs(t) };
      }

      return { ...row(f), thresholds: DEFAULT_THRESHOLDS, source: 'calibrated', custom: false };
    }),
  );

  return {
    policies,
    defaults: DEFAULT_THRESHOLDS,
    store: { reachable: true, detail: 'connected' },
    captures: {
      dir: CAPTURE_DIR,
      kept: captures[0]?.kept ?? 0,
      pruned: captures[0]?.pruned ?? 0,
    },
    connectors,
  };
}

const row = (f: { target: string; field: string }) => ({
  scraper: f.target.split('__')[0],
  targetId: f.target,
  field: f.field,
});

const differs = (t: FieldThresholds) =>
  t.tau !== DEFAULT_THRESHOLDS.tau || t.delta !== DEFAULT_THRESHOLDS.delta;

/**
 * The policies as a contract file, which is the only form of this table anyone
 * can act on. It is an export, not content -- it lives behind Copy.
 */
export function policiesAsYaml(policies: Policy[]): string {
  const byTarget = new Map<string, Policy[]>();
  for (const p of policies) {
    const list = byTarget.get(p.targetId);
    if (list) list.push(p);
    else byTarget.set(p.targetId, [p]);
  }

  return [...byTarget.entries()]
    .map(([target, ps]) =>
      [
        `target: ${target}`,
        'fields:',
        ...ps.flatMap((p) => [
          `  ${p.field}:`,
          `    policy: ${p.thresholds.policy}`,
          `    tau: ${p.thresholds.tau}`,
          `    delta: ${p.thresholds.delta}`,
          `    on_abstain: ${p.thresholds.onAbstain}`,
        ]),
      ].join('\n'),
    )
    .join('\n---\n');
}

/** The closed vocabulary for what happens to a cell the gate refuses. */
export const ON_ABSTAIN_PLAIN: Record<string, string> = {
  quarantine: 'leave empty',
  publish_last_good: 'keep last good, marked stale',
};

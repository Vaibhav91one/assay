// Consumer keys are capabilities, not merely passwords.
//
// This suite walks the actual route tree so a route added later enters the
// matrix automatically. A scoped key is useful only where the request names a
// target (directly or through a proof/episode); everything else is denied by
// default. Legacy null-scope keys preserve the pre-scope behavior.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createKey, hashKey } from '../src/api/keys.js';
import {
  apiKeys, closeDb, episodes, fieldRuns, getDb, runs, sql, targets,
} from '../src/store/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const V1 = join(ROOT, 'web', 'app', 'api', 'v1');
const IN = 'scope_matrix_in';
const OUT = 'scope_matrix_out';
const IN_PROOF = 'pr_scope_matrix_in';
const OUT_PROOF = 'pr_scope_matrix_out';

type Fixture = {
  legacy: string;
  read: string;
  write: string;
  outside: string;
  inRun: number;
  inEpisode: number;
  outEpisode: number;
};

let fixture: Fixture;

const routes: string[] = [];
const collect = (dir: string) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) collect(p);
    else if (e.name === 'route.ts') routes.push(p);
  }
};
collect(V1);

const rel = (file: string) => file.slice(V1.length).replace(/\/route\.ts$/, '') || '/';
const consumerRoutes = routes.filter((file) => !rel(file).includes('/delivery/'));

async function wipe() {
  const d = getDb();
  await d.execute(sql`DELETE FROM retractions WHERE target_id IN (${IN}, ${OUT})`);
  await d.execute(sql`DELETE FROM queue_items WHERE proof_id IN (${IN_PROOF}, ${OUT_PROOF})`);
  await d.execute(sql`DELETE FROM episodes WHERE target_id IN (${IN}, ${OUT})`);
  await d.execute(sql`DELETE FROM field_runs WHERE proof_id IN (${IN_PROOF}, ${OUT_PROOF})`);
  await d.execute(sql`DELETE FROM runs WHERE target_id IN (${IN}, ${OUT})`);
  await d.execute(sql`DELETE FROM contracts WHERE target_id IN (${IN}, ${OUT})`);
  await d.execute(sql`DELETE FROM field_state WHERE target_id IN (${IN}, ${OUT})`);
  await d.execute(sql`DELETE FROM targets WHERE target_id IN (${IN}, ${OUT})`);
  await d.execute(sql`DELETE FROM api_keys WHERE name LIKE 'scope matrix %'`);
}

beforeAll(async () => {
  if (process.env.ASSAY_REQUIRE_DB) await getDb().select().from(apiKeys).limit(1);
  await wipe();
  await getDb().insert(targets).values([
    { targetId: IN, url: 'https://in.example.test', contract: {} },
    { targetId: OUT, url: 'https://out.example.test', contract: {} },
  ]);
  const [inRun] = await getDb().insert(runs).values({ targetId: IN, status: 'abstain' })
    .returning({ id: runs.runId });
  const [outRun] = await getDb().insert(runs).values({ targetId: OUT, status: 'abstain' })
    .returning({ id: runs.runId });
  await getDb().insert(fieldRuns).values([
    {
      runId: inRun!.id, field: 'price', value: null, status: 'quarantined',
      reason: 'below_tau', proofId: IN_PROOF, heldSinceRun: inRun!.id,
    },
    {
      runId: outRun!.id, field: 'price', value: null, status: 'quarantined',
      reason: 'below_tau', proofId: OUT_PROOF, heldSinceRun: outRun!.id,
    },
  ]);
  const [inEpisode] = await getDb().insert(episodes).values({
    targetId: IN, field: 'price', openedRun: inRun!.id,
  }).returning({ id: episodes.episodeId });
  const [outEpisode] = await getDb().insert(episodes).values({
    targetId: OUT, field: 'price', openedRun: outRun!.id,
  }).returning({ id: episodes.episodeId });

  const legacy = await createKey('scope matrix legacy');
  const read = await createKey('scope matrix read', { access: 'read', targets: [IN] });
  const write = await createKey('scope matrix write', { access: 'write', targets: [IN] });
  const outside = await createKey('scope matrix outside', { access: 'write', targets: [OUT] });
  fixture = {
    legacy: legacy.key, read: read.key, write: write.key, outside: outside.key,
    inRun: inRun!.id, inEpisode: inEpisode!.id, outEpisode: outEpisode!.id,
  };
});

afterAll(async () => {
  await wipe().catch(() => {});
  await closeDb().catch(() => {});
});

const scopedRoute = (path: string, verb: string): boolean => {
  if (path.startsWith('/connectors')) return false;
  if (path === '/ai/status' || path === '/ai/discover') return false;
  if (path === '/reports/digest') return false;
  if (path === '/targets' && verb === 'POST') return false;
  return true;
};

const requestFor = (
  file: string,
  verb: string,
  key: string | null,
  which: 'in' | 'out' = 'in',
): { request: Request; ctx: { params: Promise<Record<string, string>> } } => {
  const target = which === 'in' ? IN : OUT;
  const proof = which === 'in' ? IN_PROOF : OUT_PROOF;
  const episode = String(which === 'in' ? fixture.inEpisode : fixture.outEpisode);
  const path = rel(file)
    .replace('[target]', target)
    .replace('[proof]', proof)
    .replace('[episode]', episode)
    .replace('[kind]', 'scope-test-kind');
  const url = new URL(`http://localhost/api/v1${path}`);
  url.searchParams.set('target', target);
  url.searchParams.set('field', 'price');
  url.searchParams.set('since', '2026-08-01T00:00:00Z');
  url.searchParams.set('until', '2026-08-02T00:00:00Z');

  let body: Record<string, unknown> = { target };
  if (path === '/contracts') body = { yaml: `target: ${target}\nfields: {}` };
  if (path.includes('/decisions/')) body = { proof, resolution: 'empty' };
  if (path === '/decisions/undo') body = { proof };
  if (path === '/ai/nominate') body = { proof, candidate_index: 0 };
  if (path === '/brake') body = { target, field: 'price', confirm: 'wrong', cleared_by: 'matrix' };
  if (path === '/blast/retraction') body = { target, field: 'price', from_run: 0 };
  if (path === '/targets') body = {};

  return {
    request: new Request(url, {
      method: verb,
      headers: {
        ...(key ? { authorization: `Bearer ${key}` } : {}),
        ...(!['GET', 'DELETE'].includes(verb) ? { 'content-type': 'application/json' } : {}),
      },
      ...(!['GET', 'DELETE'].includes(verb) ? { body: JSON.stringify(body) } : {}),
    }),
    ctx: {
      params: Promise.resolve({ target, proof, episode, kind: 'scope-test-kind' }),
    },
  };
};

describe('stored scope', () => {
  it('is additive and never stores the plaintext key', async () => {
    const rows = await getDb().select().from(apiKeys)
      .where(sql`${apiKeys.name} LIKE 'scope matrix %'`);
    const byName = Object.fromEntries(rows.map((row) => [row.name, row]));
    expect(byName['scope matrix legacy']!.scope).toBeNull();
    expect(byName['scope matrix read']!.scope).toEqual({ access: 'read', targets: [IN] });
    expect(byName['scope matrix write']!.scope).toEqual({ access: 'write', targets: [IN] });
    expect(byName['scope matrix read']!.hash).toBe(hashKey(fixture.read));
    expect(JSON.stringify(rows)).not.toContain(fixture.read);
    expect(JSON.stringify(rows)).not.toContain(fixture.write);
  });
});

describe('deny-by-default route matrix', () => {
  it('discovers every current consumer route', () => {
    expect(consumerRoutes.length).toBeGreaterThan(20);
  });

  it.each(consumerRoutes.map((file) => [rel(file), file]))('%s', async (path, file) => {
    const mod = await import(file);
    const verbs = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
      .filter((verb) => typeof mod[verb] === 'function');
    expect(verbs.length).toBeGreaterThan(0);

    for (const verb of verbs) {
      const call = async (key: string | null, which: 'in' | 'out' = 'in') => {
        const { request, ctx } = requestFor(file, verb, key, which);
        return (mod[verb] as (r: Request, c: typeof ctx) => Promise<Response>)(request, ctx);
      };

      expect((await call(null)).status, `${verb} ${path}: no key`).toBe(401);

      const legacy = await call(fixture.legacy);
      expect([401, 403], `${verb} ${path}: legacy answered ${legacy.status}`).not.toContain(legacy.status);

      const inScope = await call(fixture.write);
      if (scopedRoute(path, verb)) {
        expect([401, 403], `${verb} ${path}: in-scope answered ${inScope.status}`)
          .not.toContain(inScope.status);
      } else {
        expect(inScope.status, `${verb} ${path}: unscopable route`).toBe(403);
      }

      expect((await call(fixture.outside)).status, `${verb} ${path}: out-of-scope`).toBe(403);

      if (verb !== 'GET') {
        expect((await call(fixture.read)).status, `${verb} ${path}: read-only`).toBe(403);
      }
    }
  });
});

describe('list endpoints do not disclose another target', () => {
  it('filters the target list and refuses an unbounded scoped list', async () => {
    const route = await import('../web/app/api/v1/targets/route.js');
    const bounded = requestFor(join(V1, 'targets', 'route.ts'), 'GET', fixture.read);
    const response = await route.GET(bounded.request, bounded.ctx);
    expect(response.status).toBe(200);
    const body: any = await response.json();
    expect(body.targets.map((target: any) => target.id)).toEqual([IN]);
    expect(JSON.stringify(body)).not.toContain(OUT);

    const unbounded = new Request('http://localhost/api/v1/targets', {
      headers: { authorization: `Bearer ${fixture.read}` },
    });
    expect((await route.GET(unbounded, bounded.ctx)).status).toBe(403);
  });

  it('filters held proofs before serialising them', async () => {
    const route = await import('../web/app/api/v1/held/route.js');
    const bounded = requestFor(join(V1, 'held', 'route.ts'), 'GET', fixture.read);
    const response = await route.GET(bounded.request, bounded.ctx);
    expect(response.status).toBe(200);
    const body: any = await response.json();
    expect(body.held.map((cell: any) => cell.proofId)).toContain(IN_PROOF);
    expect(body.held.map((cell: any) => cell.proofId)).not.toContain(OUT_PROOF);
  });
});

describe('the authority target is the handler target', () => {
  it('does not let an allowed first YAML key disguise an out-of-scope contract', async () => {
    const route = await import('../web/app/api/v1/contracts/route.js');
    const request = new Request('http://localhost/api/v1/contracts', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${fixture.write}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ yaml: `target: ${IN}\ntarget: ${OUT}\nfields: {}` }),
    });
    expect((await route.POST(request, { params: Promise.resolve({}) })).status).toBe(403);
  });
});

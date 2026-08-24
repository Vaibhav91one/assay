// Connector configuration, and the rule that it never comes back out.
//
// Every one of the two secrets here is a bearer credential: a Discord
// incoming-webhook URL is not an address with a password beside it, it
// IS the password, and anyone holding it can post as you. So the read path
// reports PRESENCE and nothing else -- no value, no prefix, no masked tail, no
// hostname. `describe()` is the only exported reader, and it cannot return a
// secret because it never receives one. The same rule covers the environment
// token `describe()` now also reports: a variable NAME and a boolean.
//
// APP-DESIGN 6b: "the key is the user's own, shown by presence only."
//
// STORAGE: a file, not a table. Wave 0's migration 0004 has no connectors
// table and DEV-OWNERSHIP forbids a 0005 -- see this feature's report.
//
// It is written 0600, and the default path is INSIDE the repo. `.gitignore` has
// no `data/` line yet and this feature may not add one, so until it does, point
// ASSAY_CONNECTORS somewhere outside the tree or add the line. A file holding
// two bearer credentials is not one to leave a `git add -A` away from a
// commit.

import { z } from 'zod';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export const KINDS = ['brightdata', 'discord'] as const;
export type Kind = (typeof KINDS)[number];

/**
 * A Zod issue rendered so it survives the trip to a client.
 *
 * Next's production bundle drops Zod 4's locale messages: the same rejected
 * body reads "must be an https URL on one of: ..." in process and a bare
 * "Invalid input" over HTTP. `code` and `path` are structural and always
 * survive, so they lead and the message trails. A 400 nobody can debug is a
 * 400 that gets retried forever.
 */
export const issueDetail = (i: { code?: string; path: PropertyKey[]; message?: string }): string => {
  const where = i.path.length ? i.path.map(String).join('.') : '<body>';
  return `${where}: ${i.code ?? 'invalid'}${i.message ? ` — ${i.message}` : ''}`;
};

/**
 * Extra hostnames the operator has explicitly allowed.
 *
 * Self-hosters route chat webhooks through an internal gateway, and a test
 * needs a loopback endpoint. Opt-in and named in the environment, never a
 * default and never inferred from the URL -- the point of the allow-list is
 * that it cannot be widened by the request that is being validated.
 */
const allowedByOperator = (): string[] =>
  (process.env.ASSAY_CONNECTOR_HOSTS || '').split(',').map((s) => s.trim()).filter(Boolean);

const httpsHost = (hosts: string[]) =>
  z.string().refine(
    (v) => {
      let u: URL;
      try {
        u = new URL(v);
      } catch {
        return false;
      }
      if (allowedByOperator().includes(u.hostname)) return true;
      return u.protocol === 'https:' && hosts.includes(u.hostname);
    },
    { message: `must be an https URL on one of: ${hosts.join(', ')}` },
  );

/**
 * The shared secret Assay requires on an inbound Bright Data delivery.
 *
 * Assay mints it and the operator pastes it into Bright Data's webhook
 * configuration; see `brightdata.ts` for why that is the mechanism rather than
 * a signature we verify.
 */
const BrightDataConfig = z.object({
  secret: z.string().min(24, 'a delivery secret shorter than 24 chars is not a secret'),
});

// Host allow-lists, not just "is a URL". A connector URL is posted to on every
// break; accepting an arbitrary host turns a config endpoint into an outbound
// request primitive pointed anywhere, including at this machine's own network.
const DiscordConfig = z.object({
  url: httpsHost(['discord.com', 'discordapp.com', 'canary.discord.com', 'ptb.discord.com']),
});

export const CONFIG_SCHEMA = {
  brightdata: BrightDataConfig,
  discord: DiscordConfig,
} as const;

export type ConnectorConfig = {
  brightdata: z.infer<typeof BrightDataConfig>;
  discord: z.infer<typeof DiscordConfig>;
};

/**
 * The API token a kind reads from the ENVIRONMENT, as opposed to the delivery
 * credential it stores in this file. Null for kinds that have no such token.
 *
 * Bright Data is the only one, and it is the reason this field exists. There
 * are two unrelated Bright Data mechanisms and this module only ever knew about
 * one of them:
 *
 *   BRIGHTDATA_API_TOKEN, in the environment -- lets ASSAY CALL BRIGHT DATA.
 *     `tools/bd-heal.ts` and `tools/bd-status.sh` read it.
 *   the delivery secret, in this file -- lets BRIGHT DATA CALL ASSAY, by
 *     POSTing a scraped page to `/api/v1/connectors/brightdata/delivery/:target`.
 *
 * Settings, `/api/v1/connectors`, `assay connectors list` and the
 * `assay_connectors` MCP tool all read `describe()`, and all four therefore
 * used to report "not configured" at an operator who had a working token in
 * `.env` and was actively using Bright Data. Every statement they made was
 * true; together they were misleading, which is the failure class this product
 * refuses -- and it is the same bug that was fixed on the sign-in screen the
 * same week, where a credential was reported unset because one process's
 * environment was checked instead of the capability.
 *
 * The fix is here rather than on the screen ON PURPOSE. Four readers route
 * through `describe()`; patching the one the report named would have left the
 * other three saying the old thing, and two surfaces disagreeing about one
 * credential is the bug, not the symptom.
 */
const TOKEN_VAR: Record<Kind, string | null> = {
  brightdata: 'BRIGHTDATA_API_TOKEN',
  // Discord has no second half: an incoming-webhook URL is the whole
  // credential and it lives in this file. A row claiming an absent environment
  // variable for it would be the same lie pointed the other way.
  discord: null,
};

/** What a reader is allowed to know. Deliberately has nowhere to put a secret. */
export interface Presence {
  kind: Kind;
  /** The DELIVERY credential is in this file. Says nothing about the token. */
  configured: boolean;
  updated_at: string | null;
  /**
   * The API token, by NAME and by presence. Never its value, not masked, not a
   * prefix -- there is nowhere in this shape to put one.
   */
  token: { var: string; set: boolean } | null;
}

/** Presence of the environment half, for one kind. A name and a boolean. */
const tokenPresence = (kind: Kind): Presence['token'] => {
  const name = TOKEN_VAR[kind];
  return name ? { var: name, set: Boolean(process.env[name]) } : null;
};

const Stored = z.object({
  kind: z.enum(KINDS),
  config: z.unknown(),
  updated_at: z.iso.datetime(),
});
const StoredFile = z.record(z.string(), Stored);

export const CONFIG_PATH = (): string => process.env.ASSAY_CONNECTORS || 'data/connectors.json';

async function readAll(): Promise<Record<string, z.infer<typeof Stored>>> {
  let raw: string;
  try {
    raw = await readFile(CONFIG_PATH(), 'utf8');
  } catch (e) {
    // A missing file is "nothing configured yet". Anything else -- a permission
    // error, a directory where the file should be -- is a real fault, and
    // treating it as "nothing configured" would silently disable delivery.
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw e;
  }
  return StoredFile.parse(JSON.parse(raw));
}

/** Store one connector's config. Returns presence, so a caller cannot echo it. */
export async function put<K extends Kind>(kind: K, config: unknown): Promise<Presence> {
  const parsed = CONFIG_SCHEMA[kind].parse(config);
  const all = await readAll();
  const updated_at = new Date().toISOString();
  all[kind] = { kind, config: parsed, updated_at };

  const path = CONFIG_PATH();
  await mkdir(dirname(path), { recursive: true });
  // 0600 at create time rather than a chmod afterwards: between the two there
  // is a window in which the secret is world-readable.
  await writeFile(path, JSON.stringify(all, null, 2), { mode: 0o600 });
  return { kind, configured: true, updated_at, token: tokenPresence(kind) };
}

/** Forget one connector. Idempotent: removing what is not there is not an error. */
export async function remove(kind: Kind): Promise<Presence> {
  const all = await readAll();
  delete all[kind];
  const path = CONFIG_PATH();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(all, null, 2), { mode: 0o600 });
  return { kind, configured: false, updated_at: null, token: tokenPresence(kind) };
}

/**
 * The secret itself. Internal only -- never call this from anything that
 * shapes a response body, and never log the return value.
 */
export async function secretFor<K extends Kind>(kind: K): Promise<ConnectorConfig[K] | null> {
  const all = await readAll();
  const row = all[kind];
  if (!row) return null;
  return CONFIG_SCHEMA[kind].parse(row.config) as ConnectorConfig[K];
}

/** Presence for one connector, or for all three. The only public read path. */
export async function describe(kind?: Kind): Promise<Presence[]> {
  const all = await readAll();
  return (kind ? [kind] : [...KINDS]).map((k) => ({
    kind: k,
    configured: Boolean(all[k]),
    updated_at: all[k]?.updated_at ?? null,
    token: tokenPresence(k),
  }));
}

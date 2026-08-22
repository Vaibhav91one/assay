import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ModelAccess, type ModelAuth } from '@/components/model-access';
import { Working } from '@/components/loading';
import { TopBar } from '@/components/top-bar';
import { StatusLine } from '@/components/status-line';
import { Empty } from '@/components/empty';
import { Copy } from '@/components/copy';
import {
  settingsView,
  policiesAsYaml,
  ON_ABSTAIN_PLAIN,
  type Policy,
  type SettingsView,
} from '@/lib/settings';
import { alertsView } from '@/lib/alerts';
import { SettingsTabs } from './settings-tabs';
import { isTabId, type TabId } from './tabs';
import { NotificationsPanel } from './notifications-panel';
import { DocLink } from './doc-link';
import { CONNECTOR_DOC, MODEL_DOC } from './docs';

export const metadata: Metadata = { title: 'Settings · Assay' };

// Reads the environment (the capture directory, the connector file path) as
// well as the store. Static would bake one machine's environment into a build
// another machine runs.
export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const [v, alerts, { tab }] = await Promise.all([settingsView(), alertsView(), searchParams]);
  const initial: TabId = isTabId(tab) ? tab : 'publishing';

  return (
    <>
      <TopBar
        title="Settings"
        status={`${v.policies.length} field${v.policies.length === 1 ? '' : 's'} governed`}
        action={null}
      />
      <div className="flex w-full max-w-[1112px] flex-col items-start px-[56px] pb-[64px] pt-[26px]">
        {/* The panels are built here, on the server, and handed to a client
            component that only decides which one is visible. Postgres, the
            capture directory and the connector file never cross into the
            browser bundle -- `web/components/chrome.ts` is the scar from the
            time something did. */}
        <SettingsTabs
          initial={initial}
          panels={{
            publishing: <Publishing v={v} />,
            output: <Output v={v} />,
            notifications: <NotificationsPanel view={alerts} />,
            connections: <Connections v={v} />,
          }}
        />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ panels */

/**
 * What Assay may write, and under what policy -- read-only, on purpose.
 *
 * APP-DESIGN 7.1 is the ruling: a global publish threshold is the exact thing
 * FEATURES.md F2 attacks incumbents by name for, and a slider that loosens it
 * is a button for publishing more and holding less, one click away at 2am. So
 * the numbers are provenance and the escape hatch is the YAML export, which
 * puts policy in a repo where it can be reviewed instead of in a text field
 * where it cannot.
 */
function Publishing({ v }: { v: SettingsView }) {
  return (
    <>
      <Section label="WHAT ASSAY MAY PUBLISH" id="what-assay-may-publish" />
      <div className="flex w-full items-center pt-[32px]">
        <p className="body-13_5 flex-1 text-[var(--text-primary)]">
          Calibrated: publishes only a clear winner ({v.defaults.tau.toFixed(2)} floor,{' '}
          {v.defaults.delta.toFixed(2)} lead). Change per-field policy in a contract.
        </p>
        <Copy
          text={policiesAsYaml(v.policies)}
          receipt="Field contracts copied as YAML"
          className="meta-12_5 shrink-0 text-[var(--semantic-link)] hover:underline"
        >
          export as YAML ›
        </Copy>
      </div>

      <Section label="PER-FIELD POLICY" id="per-field-policy" top={43} />
      <div className="w-full pt-[32px]">
        {v.policies.length === 0 ? (
          <Empty title="No field has a policy yet.">
            A field takes a policy the moment a scraper watches it. Until then there is nothing to
            govern.
          </Empty>
        ) : (
          <SpecTable head={['field', 'tier', 'on hold']}>
            {v.policies.map((p) => (
              <SpecRow
                key={p.targetId + p.field}
                a={
                  <span>
                    <span className="meta-12_5 text-[var(--text-muted)]">{p.scraper} · </span>
                    <span className="mono-value-12_5 text-[var(--text-primary)]">{p.field}</span>
                  </span>
                }
                b={<Tier p={p} />}
                c={ON_ABSTAIN_PLAIN[p.thresholds.onAbstain] ?? p.thresholds.onAbstain}
              />
            ))}
          </SpecTable>
        )}
      </div>
    </>
  );
}

function Output({ v }: { v: SettingsView }) {
  return (
    <>
      <Section label="WHERE THE DATA GOES" id="where-the-data-goes" />
      <div className="w-full pt-[32px]">
        <SpecTable>
          <SpecRow
            a="Output"
            b="Postgres"
            c={
              <StatusLine tone={v.store.reachable ? 'success' : 'danger'} size={13} type="caption-12">
                {v.store.detail}
              </StatusLine>
            }
          />
          <SpecRow
            a="Page captures"
            b={<span className="mono-value-12_5">{v.captures.dir}</span>}
            c={`${v.captures.kept} kept · ${v.captures.pruned} pruned`}
          />
          <SpecRow
            a="On a held field"
            b="Leave empty"
            c="never filled, always labelled"
          />
          {/* `c` was "not optional", which added nothing to a row already
              stating that every cell carries one. */}
          <SpecRow a="Proof" b="one proof id per cell, on the published row" />
        </SpecTable>
      </div>
    </>
  );
}

function Connections({ v }: { v: SettingsView }) {
  return (
    <>
      {/* The section heading carries the model's documentation link rather than
          the row below it. `model-access.tsx` reports which of three routes is
          live and, when none is, hands over a command to run; the page that
          explains all three belongs to the section, not to whichever branch
          happens to be rendering. The Publishing tab puts `export as YAML ›` in
          the same place for the same reason. */}
      <div className="flex w-full items-center justify-between gap-[16px]">
        <Section label="MODEL ACCESS" id="model-access" />
        <DocLink href={MODEL_DOC} name="model access" />
      </div>
      {/* The probe is behind a boundary because it can now cost seconds again.
          `cliLoggedIn()` caches for CLI_CACHE_MS rather than for the life of
          the process -- a login that expired must not go on being reported as
          live -- so roughly one Settings render a minute pays 3-5s for
          `claude auth status`. Called inline, that render blocks the whole
          screen. Called from an async child under Suspense, everything else
          paints and this row streams in behind it. Same shape as the model row
          on `web/app/sign-in/key-panel.tsx`, for the same reason. */}
      <div className="w-full pt-[24px]">
        <Suspense fallback={<ModelAccessPending />}>
          <ModelAccessRow />
        </Suspense>
      </div>

      <Section label="CONNECTIONS" id="connections" top={52} />
      <div className="w-full pt-[32px]">
        <Connectors v={v} />
      </div>
    </>
  );
}

/**
 * The model row, resolved off the render path.
 *
 * The dynamic import is what makes this an async component, and it is also the
 * rule `web/components/chrome.ts` records: `assay/engine/ai/model` pulls the
 * Agent SDK and Node built-ins, so it is reached from a server component and
 * never from anything the browser bundles.
 */
async function ModelAccessRow() {
  const { modelAuth } = await import('assay/engine/ai/model');
  return <ModelAccess auth={modelAuth() as ModelAuth} />;
}

/** What the row says while the probe is out. Not a spinner over the whole
 *  section: only this line is unknown, and only this line waits. */
function ModelAccessPending() {
  return <Working>Checking</Working>;
}

/* ------------------------------------------------------------------ pieces */

// The id is what an old `#per-field-policy` link aims at; `settings-tabs.tsx`
// maps the same slugs back to the tab holding them, so a hash that predates the
// tabs still lands on the section rather than on a page hiding it.
const Section = ({ label, id, top = 0 }: { label: string; id?: string; top?: number }) => (
  <p id={id} className="label-10 scroll-mt-[24px] text-[var(--text-muted)]" style={{ marginTop: top }}>
    {label}
  </p>
);

/**
 * Three columns, fixed at 312 / 360 / rest.
 *
 * Both tables on this screen are the same object -- a name, what it is set to,
 * and one quiet note about it -- so they are the same component. The header row
 * is optional because the second table's left column is already the heading.
 */
function SpecTable({ head, children }: { head?: [string, string, string]; children: React.ReactNode }) {
  return (
    <table className="w-full table-fixed border-collapse">
      <colgroup>
        <col style={{ width: 312 }} />
        <col style={{ width: 360 }} />
        <col />
      </colgroup>
      {head && (
        <thead>
          <tr>
            {head.map((h) => (
              <th
                key={h}
                className="meta-12_5 pb-[8px] text-left font-normal text-[var(--text-muted)]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>{children}</tbody>
    </table>
  );
}

function SpecRow({
  a,
  b,
  c,
}: {
  a: React.ReactNode;
  b: React.ReactNode;
  /** Optional: a row whose third column would only restate the second omits it. */
  c?: React.ReactNode;
}) {
  return (
    <tr className="border-t border-[var(--border-hairline)]">
      <td className="body-13_5 py-[11px] pr-[16px] align-top text-[var(--text-primary)]">{a}</td>
      <td className="meta-13 break-all py-[11px] pr-[16px] align-top text-[var(--text-primary)]">{b}</td>
      <td className="caption-12 py-[11px] align-top text-[var(--text-muted)]">{c}</td>
    </tr>
  );
}

/**
 * The tier, and the numbers only when they are not the calibrated ones.
 *
 * Printing 0.60/0.16 against every row when the line above already says
 * "0.60 floor, 0.16 lead" is the same fact rendered twice. A row that differs
 * is the only one worth the space.
 */
function Tier({ p }: { p: Policy }) {
  return (
    <span className="flex flex-col gap-[3px]">
      <span>{p.thresholds.policy}</span>
      {p.custom && (
        <span className="mono-label-12 text-[var(--text-secondary)]">
          {p.thresholds.tau.toFixed(2)} floor · {p.thresholds.delta.toFixed(2)} lead
        </span>
      )}
      {p.source !== 'calibrated' && (
        <span className="caption-12 text-[var(--text-muted)]">
          {p.source === 'contract' ? 'from a saved contract' : 'set on the target'}
        </span>
      )}
    </span>
  );
}

/**
 * Presence, never a secret. `describe()` is the only public read path into the
 * connector file, and it is built that way so a screen cannot leak a token by
 * accident.
 */
function Connectors({ v }: { v: SettingsView }) {
  if (v.connectors.length === 0) {
    return (
      <Empty title="Nothing is connected.">
        Assay runs with no connectors: it fetches pages itself and writes to its own store. A
        connector adds a delivery path, never a decision.
      </Empty>
    );
  }
  return (
    <SpecTable>
      {v.connectors.map((c) => (
        <SpecRow
          key={c.kind}
          a={c.kind}
          b={
            <StatusLine
              tone={c.configured ? 'success' : 'info'}
              icon={c.configured ? undefined : null}
              size={13}
              type="meta-13"
            >
              {c.configured ? 'configured' : 'not configured'}
            </StatusLine>
          }
          c={
            <span className="flex items-baseline justify-between gap-[16px]">
              <span>
                {c.configured && c.updated_at
                  ? `set ${c.updated_at.slice(0, 10)}`
                  : 'set it in the environment or over the API'}
              </span>
              {/* Per connector, not one link for the table. A row that says
                  "not configured" and offers no way to find out what would
                  configure it is a dead end, and the row that says
                  "configured" is where someone goes to check what it means. */}
              <DocLink href={CONNECTOR_DOC[c.kind]} name={c.kind} />
            </span>
          }
        />
      ))}
    </SpecTable>
  );
}

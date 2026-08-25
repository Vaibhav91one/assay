'use client';

import { useEffect, useState, useTransition } from 'react';
import { Tabs } from '@base-ui/react/tabs';
import { Copy } from '@/components/copy';
import { StatusLine } from '@/components/status-line';
import { actionVariants } from '@/components/button';
import { ModelAccess, type ModelAuth } from '@/components/model-access';
import { CONNECT_TABS, type ConnectTabId } from './tabs';
import { putConnector, removeConnector, testBrightData } from './actions';
import type { Presence, Kind } from 'assay/engine/connectors/config';
import type { MailPresence } from '@/lib/alerts';
import type { KeyScope } from 'assay/api/keys';
import { stamp } from '@/lib/when';

const DATABASE_URL_HINT = 'postgres://localhost:5432/assay';

export function ConnectView({
  initial,
  presence,
  mail,
  auth,
  keys,
}: {
  initial: ConnectTabId;
  presence: Presence[];
  mail: MailPresence;
  auth: ModelAuth;
  keys: { keyId: number; name: string; keyPrefix: string; scope: KeyScope | null; createdAt: string; lastUsedAt: string | null; expiresAt: string | null }[];
}) {
  const [value, setValue] = useState<ConnectTabId>(initial);
  const byKind = Object.fromEntries(presence.map((p) => [p.kind, p])) as Record<Kind, Presence>;

  const select = (next: ConnectTabId) => {
    setValue(next);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    window.history.replaceState(null, '', url);
  };

  return (
    <Tabs.Root value={value} onValueChange={(v) => select(v as ConnectTabId)} className="w-full max-w-[720px]">
      <Tabs.List className="relative flex items-center gap-[4px] overflow-x-auto" aria-label="Connect">
        <Tabs.Indicator
          renderBeforeHydration
          className="absolute left-0 top-0 z-0 h-full rounded-[var(--radius-control)] bg-[var(--surface-subtle)]"
          style={{
            left: 'var(--active-tab-left)', width: 'var(--active-tab-width)',
            transitionProperty: 'left, width', transitionDuration: 'var(--duration-glide)',
            transitionTimingFunction: 'var(--ease-glide)',
          }}
        />
        {CONNECT_TABS.map(({ id, label }) => (
          <Tabs.Tab
            key={id}
            value={id}
            className={`press-row relative z-10 shrink-0 cursor-pointer rounded-[var(--radius-control)] px-[14px] py-[8px] transition-colors duration-[var(--duration-tint)] ${value === id ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
          >
            <span className="meta-12_5">{label}</span>
          </Tabs.Tab>
        ))}
      </Tabs.List>

      <Tabs.Panel value="claude-code" className="motion-fade-up pt-[28px]">
        <McpClientTab
          title="Claude Code"
          note="Runs locally and can spawn Assay's MCP server as a subprocess — stdio, not the HTTP endpoint below."
          code={`claude mcp add assay \\\n  --env DATABASE_URL=${DATABASE_URL_HINT} \\\n  -- npx tsx /absolute/path/to/assay/src/mcp/server.ts`}
        />
      </Tabs.Panel>

      <Tabs.Panel value="codex" className="motion-fade-up pt-[28px]">
        <McpClientTab
          title="Codex"
          note="~/.codex/config.toml"
          code={`[mcp_servers.assay]\ncommand = "npx"\nargs = ["tsx", "/absolute/path/to/assay/src/mcp/server.ts"]\n\n[mcp_servers.assay.env]\nDATABASE_URL = "${DATABASE_URL_HINT}"`}
        />
      </Tabs.Panel>

      <Tabs.Panel value="claude-ai" className="motion-fade-up pt-[28px]">
        <div className="flex flex-col gap-[14px]">
          <p className="meta-13 text-[var(--text-secondary)]">
            Settings → Connectors → Add custom connector, pointing at:
          </p>
          <CodeBlock code="https://<your-domain>/api/mcp" />
          <p className="meta-12_5 text-[var(--text-muted)]">
            The connector calls your instance, so it must be reachable. claude.ai completes a real OAuth flow on
            its own — Connect, approve on the consent screen this instance serves, done. No key ever leaves your
            browser or claude.ai's own backend; the token it ends up holding is an ordinary Assay API key, minted
            at that approval. A client that does not speak OAuth can instead be given a key directly (the API
            tab) as <code className="mono-value-12_5">Authorization: Bearer</code>. Either way, a target-scoped
            key is checked per tool call — it works here now, not only a full-access one.
          </p>
          <ToolTable />
        </div>
      </Tabs.Panel>

      <Tabs.Panel value="brightdata" className="motion-fade-up pt-[28px]">
        <ConnectorTab
          kind="brightdata"
          presence={byKind.brightdata}
          fields={[{ name: 'secret', label: 'Delivery secret', placeholder: 'a random string, 24+ chars — you mint this' }]}
        />
      </Tabs.Panel>

      <Tabs.Panel value="discord" className="motion-fade-up pt-[28px]">
        <ConnectorTab
          kind="discord"
          presence={byKind.discord}
          fields={[{ name: 'url', label: 'Webhook URL', placeholder: 'https://discord.com/api/webhooks/...' }]}
        />
      </Tabs.Panel>

      <Tabs.Panel value="email" className="motion-fade-up pt-[28px]">
        <div className="flex flex-col gap-[10px]">
          <StatusLine tone={mail.ready ? 'success' : 'warning'} size={14} type="body-14">
            {mail.ready ? 'Ready to send' : `Not ready — ${mail.missing} is not set`}
          </StatusLine>
          <p className="meta-12_5 text-[var(--text-muted)]">
            Configured via <code className="mono-value-12_5">ASSAY_RESEND_KEY</code>,{' '}
            <code className="mono-value-12_5">ASSAY_MAIL_FROM</code>,{' '}
            <code className="mono-value-12_5">ASSAY_MAIL_TO</code> in the environment — not a form here, same
            reason the Model tab isn&apos;t: a value typed into a browser and a value read from the process
            environment are different facts, and this reports the one that is real.
          </p>
        </div>
      </Tabs.Panel>

      <Tabs.Panel value="model" className="motion-fade-up pt-[28px]">
        <div className="flex flex-col gap-[14px]">
          <ModelAccess auth={auth} />
          <p className="meta-12_5 text-[var(--text-muted)]">
            Assay runs with no model configured. Leave this blank and nothing degrades except field discovery
            and second opinions on a held cell.
          </p>
        </div>
      </Tabs.Panel>

      <Tabs.Panel value="api" className="motion-fade-up pt-[28px]">
        <div className="flex flex-col gap-[14px]">
          <p className="meta-12_5 text-[var(--text-muted)]">
            REST API keys are minted from the CLI — <code className="mono-value-12_5">assay keys create &lt;name&gt;</code> —
            or by an OAuth client completing the flow on the claude.ai tab. Either way a plaintext key is never
            handled by this browser. This lists what already exists.
          </p>
          {keys.length === 0 ? (
            <p className="meta-13 text-[var(--text-secondary)]">No keys yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-default)]">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[var(--border-hairline)]">
                    {['name', 'prefix', 'scope', 'created', 'last used', 'expires'].map((h) => (
                      <th key={h} className="label-10 px-[14px] py-[8px] text-[var(--text-muted)]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k.keyId} className="border-b border-[var(--border-hairline)] last:border-0">
                      <td className="meta-12_5 px-[14px] py-[8px] text-[var(--text-primary)]">{k.name}</td>
                      <td className="mono-value-12_5 px-[14px] py-[8px] text-[var(--text-muted)]">{k.keyPrefix}…</td>
                      <td className="meta-12_5 px-[14px] py-[8px] text-[var(--text-secondary)]">
                        {k.scope ? `${k.scope.access} · ${k.scope.targets.length} target${k.scope.targets.length === 1 ? '' : 's'}` : 'full access'}
                      </td>
                      <td className="meta-12_5 px-[14px] py-[8px] text-[var(--text-secondary)]">{stamp(k.createdAt)}</td>
                      <td className="meta-12_5 px-[14px] py-[8px] text-[var(--text-secondary)]">{k.lastUsedAt ? stamp(k.lastUsedAt) : 'never'}</td>
                      <td className="meta-12_5 px-[14px] py-[8px] text-[var(--text-secondary)]">
                        {/* An OAuth client refreshes well before this — see connectors/deliver.ts's sibling, the OAuth
                            flow's own refresh grant — so a live one reaching this timestamp is the client having
                            stopped renewing, not this instance failing to. */}
                        {k.expiresAt ? stamp(k.expiresAt) : 'never'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Tabs.Panel>
    </Tabs.Root>
  );
}

function McpClientTab({ title, note, code }: { title: string; note: string; code: string }) {
  return (
    <div className="flex flex-col gap-[14px]">
      <p className="meta-13 text-[var(--text-secondary)]">{note}</p>
      <CodeBlock code={code} />
      <p className="meta-12_5 text-[var(--text-muted)]">Keys stay on your machine. Nothing is sent to us.</p>
      <ToolTable />
      <p className="meta-11 text-[var(--text-muted)]">{title}</p>
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative">
      <pre className="mono-value-12_5 overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-subtle)] p-[16px] text-[var(--text-primary)]">
        {code}
      </pre>
      <Copy
        text={code}
        receipt={<>Copied</>}
        className="absolute right-[10px] top-[10px] rounded-[var(--radius-control)] bg-[var(--surface-card)] px-[8px] py-[4px] meta-11 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        Copy
      </Copy>
    </div>
  );
}

const AGENT_TOOLS: [string, string][] = [
  ['assay_status', 'What is watching, what is held, what is waiting on a human.'],
  ['assay_decisions', 'The queue — each item carries both answers and the evidence.'],
  ['assay_runs', 'Run history for a target.'],
  ['assay_blast_radius', 'What was already published that is now suspect.'],
  ['assay_explain', 'Where a published value came from.'],
  ['assay_watch', 'A target contract for review — does not write.'],
];

function ToolTable() {
  return (
    <div className="flex flex-col gap-[6px]">
      <p className="label-10 text-[var(--text-muted)]">WHAT THE AGENT CAN DO</p>
      <p className="meta-11 text-[var(--text-muted)]">
        27 tools total (full list in the docs). There is no tool that lets a model decide — the agent&apos;s
        inbox is the Decisions screen.
      </p>
      <ul className="flex flex-col gap-[3px]">
        {AGENT_TOOLS.map(([name, desc]) => (
          <li key={name} className="meta-11 text-[var(--text-secondary)]">
            <code className="mono-value-12_5">{name}</code> — {desc}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ConnectorTab({
  kind,
  presence,
  fields,
}: {
  kind: Kind;
  presence: Presence;
  fields: { name: string; label: string; placeholder: string }[];
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, startTest] = useTransition();
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { setValues({}); setMsg(null); setTestMsg(null); }, [kind]);

  const save = () => start(async () => {
    const r = await putConnector(kind, values);
    setMsg(r.ok ? { ok: true, text: 'Saved.' } : { ok: false, text: r.detail });
  });
  const clear = () => start(async () => {
    const r = await removeConnector(kind);
    setMsg(r.ok ? { ok: true, text: 'Removed.' } : { ok: false, text: r.detail });
  });
  const test = () => startTest(async () => {
    const r = await testBrightData();
    setTestMsg(r.ok
      ? { ok: true, text: `${r.zones.length} zone${r.zones.length === 1 ? '' : 's'}: ${r.zones.map((z) => `${z.name} (${z.status})`).join(', ')}` }
      : { ok: false, text: r.detail });
  });

  return (
    <div className="flex flex-col gap-[14px]">
      <StatusLine tone={presence.configured ? 'success' : 'info'} size={14} type="body-14">
        {presence.configured ? `Configured${presence.updated_at ? ` · updated ${stamp(presence.updated_at)}` : ''}` : 'Not configured'}
      </StatusLine>
      {presence.token && (
        <>
          <p className="meta-12_5 text-[var(--text-muted)]">
            Outbound token <code className="mono-value-12_5">{presence.token.var}</code> is{' '}
            {presence.token.set ? 'set' : 'not set'} in the environment.
          </p>
          {presence.token.set && (
            <div className="flex items-center gap-[10px]">
              <button type="button" disabled={testing} onClick={test} className={actionVariants({ variant: 'outline' })}>
                {testing ? 'Testing…' : 'Test connection'}
              </button>
              {testMsg && (
                <StatusLine tone={testMsg.ok ? 'success' : 'danger'} size={13} type="caption-12">{testMsg.text}</StatusLine>
              )}
            </div>
          )}
        </>
      )}
      {fields.map((f) => (
        <label key={f.name} className="flex flex-col gap-[6px]">
          <span className="label-10 text-[var(--text-muted)]">{f.label}</span>
          <input
            type="text"
            value={values[f.name] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
            placeholder={f.placeholder}
            className="mono-value-12_5 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[12px] py-[9px] text-[var(--text-primary)] focus-ring"
          />
        </label>
      ))}
      <div className="flex items-center gap-[10px]">
        <button type="button" disabled={pending} onClick={save} className={actionVariants({ variant: 'primary' })}>
          Save
        </button>
        {presence.configured && (
          <button type="button" disabled={pending} onClick={clear} className={actionVariants({ variant: 'outline' })}>
            Remove
          </button>
        )}
        {msg && (
          <StatusLine tone={msg.ok ? 'success' : 'danger'} size={13} type="caption-12">{msg.text}</StatusLine>
        )}
      </div>
    </div>
  );
}

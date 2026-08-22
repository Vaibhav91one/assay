import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Copy as CopyIcon, RefreshCw } from 'lucide-react';
import { TopBar, TOP_BAR_ACTION } from '@/components/top-bar';
import { StatusLine, type Tone } from '@/components/status-line';
import { Disclosure } from '@/components/disclosure';
import { Copy } from '@/components/copy';
import { provenance, type Provenance, type Standing } from '@/lib/explain';
import { stamp } from '@/lib/when';

export const metadata: Metadata = { title: 'Where did this number come from? · Assay' };
export const dynamic = 'force-dynamic';

export default async function ExplainPage({ params }: { params: Promise<{ proof: string }> }) {
  const { proof } = await params;
  const p = await provenance(proof);
  if (!p) notFound();

  return (
    <>
      <TopBar
        title="Where did this number come from?"
        status={`proof ${p.proof}`}
        action={
          <Copy text={p.proof} receipt={<>Copied <code className="mono-value-12_5">{p.proof}</code></>} className={TOP_BAR_ACTION}>
            <CopyIcon size={16} strokeWidth={1.5} className="text-[var(--text-primary)]" aria-hidden />
            <span className="meta-12_5 text-[var(--text-primary)]">Copy</span>
          </Copy>
        }
      />

      <div className="flex w-full flex-col items-start px-[56px] pt-[48px]">
        <p className="body-13_5 max-w-[900px] text-[var(--text-secondary)]">
          Any published value, months later, traced back to the page it came off.
        </p>

        <div className="mt-[28px] flex w-full max-w-[1056px] items-start gap-[24px]">
          <ValueCard p={p} />
          <StandingCard p={p} />
        </div>

        <div className="mt-[28px] flex flex-col items-start gap-[12px]">
          <Disclosure label="the full record">
            <Record p={p} />
          </Disclosure>
          <Copy
            text={`assay explain ${p.proof}`}
            receipt={<>Copied <code className="mono-value-12_5">assay explain {p.proof}</code></>}
            className="meta-12_5 w-fit text-left text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline"
          >
            Copy as CLI output ›
          </Copy>
        </div>

        <p className="meta-12_5 mt-[40px] text-[var(--text-muted)]">
          The proof id is a column on your output.
        </p>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ cards */

function ValueCard({ p }: { p: Provenance }) {
  return (
    <section className="flex w-[660px] shrink-0 flex-col items-start rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] p-[24px]">
      <p className="label-10 text-[var(--text-muted)]">THE VALUE</p>
      <div className="mt-[8px]">{p.value === null ? <Hole p={p} /> : <Value p={p} />}</div>
      <p className="meta-12_5 mt-[10px] text-[var(--text-muted)]">
        {p.scraper} · field <span className="mono-value-12_5">{p.field}</span> · run {p.run} ·{' '}
        {stamp(p.startedAt)}
      </p>
      <div className="mt-[16px] h-px w-full bg-[var(--border-hairline)]" />
      <p className="meta-13 mt-[16px] max-w-[612px] text-[var(--text-secondary)]">{story(p)}</p>
    </section>
  );
}

function Value({ p }: { p: Provenance }) {
  return <p className="heading-18 break-words text-[var(--text-primary)]">{p.value}</p>;
}

/**
 * A rendered absence, with the reason it is one.
 *
 * It has to read as deliberate -- never as loading, never as an error, never as
 * an empty string that happened to be what the page said. That is why it is a
 * word in the held colour rather than a blank, a dash, or a zero.
 */
function Hole({ p }: { p: Provenance }) {
  return (
    <span className="flex items-baseline gap-[10px]">
      <span
        className="heading-18 rounded-[6px] px-[8px] py-[2px]"
        style={{ color: 'var(--semantic-warning)', background: 'var(--semantic-warning-subtle)' }}
      >
        withheld
      </span>
      <span className="meta-12_5 text-[var(--text-muted)]">nothing was written here</span>
    </span>
  );
}

const STANDING_TONE: Record<Standing, Tone> = {
  live: 'success',
  healed: 'success',
  withheld: 'warning',
  stale: 'info',
  degraded: 'danger',
};

function StandingCard({ p }: { p: Provenance }) {
  return (
    <section className="flex w-[372px] shrink-0 flex-col items-start rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] p-[24px]">
      <p className="label-10 text-[var(--text-muted)]">STATUS WHEN PUBLISHED</p>
      <div className="mt-[8px]">
        <StatusLine
          tone={STANDING_TONE[p.standing]}
          icon={p.standing === 'healed' ? RefreshCw : undefined}
          size={18}
          type="heading-18"
        >
          {p.standing}
        </StatusLine>
      </div>
      <p className="meta-12_5 mt-[10px] max-w-[324px] text-[var(--text-secondary)]">{standing(p)}</p>
      <div className="mt-[16px] h-px w-full bg-[var(--border-hairline)]" />
      <Since p={p} />
    </section>
  );
}

/**
 * How long this answer has stood, or -- when nothing was published -- how long
 * the hole has. Two different facts, never conflated: a withheld cell has no
 * value to be unchanged.
 */
function Since({ p }: { p: Provenance }) {
  if (p.value === null) {
    return (
      <>
        <p className="caption-12 mt-[16px] text-[var(--text-muted)]">
          {p.heldSinceRun === null ? 'Held on' : 'Held since'}
        </p>
        <p className="mono-value-12_5 mt-[4px] text-[var(--text-primary)]">
          run {p.heldSinceRun ?? p.run}
        </p>
      </>
    );
  }
  if (!p.unchanged) return null;
  const { sinceRun, runsAgo } = p.unchanged;
  return (
    <>
      <p className="caption-12 mt-[16px] text-[var(--text-muted)]">
        {runsAgo === 0 ? 'First published on' : 'This value has not changed since'}
      </p>
      <p className="mono-value-12_5 mt-[4px] text-[var(--text-primary)]">
        run {sinceRun}
        {runsAgo > 0 && ` · ${runsAgo} run${runsAgo === 1 ? '' : 's'} ago`}
      </p>
    </>
  );
}

function Record({ p }: { p: Provenance }) {
  return (
    <div className="flex flex-col gap-[10px]">
      <p className="label-10 text-[var(--text-muted)]">THE FULL RECORD</p>
      <pre className="mono-value-12_5 overflow-x-auto whitespace-pre-wrap break-words text-[var(--text-primary)]">
        {JSON.stringify(p.record ?? { error: 'no row for this proof' }, null, 2)}
      </pre>
      <div className="h-px w-full bg-[var(--border-hairline)]" />
      <dl className="mono-label-12 grid grid-cols-[auto_1fr] gap-x-[12px] gap-y-[4px] text-[var(--text-muted)]">
        <dt>golden</dt>
        <dd className="truncate text-[var(--text-secondary)]">{p.goldenSha ?? '—'}</dd>
        <dt>capture</dt>
        <dd className="truncate text-[var(--text-secondary)]">{p.captureSha ?? '—'}</dd>
        <dt>group</dt>
        <dd className="truncate text-[var(--text-secondary)]">{p.groupKey ?? '—'}</dd>
      </dl>
    </div>
  );
}

/* ------------------------------------------------------------------- prose */

/**
 * What happened, assembled from what was recorded and nothing else.
 *
 * The wireframe said "five of five landmarks agreed". The store keeps no
 * per-run anchor record, so that sentence would have been written by this file
 * rather than measured by the engine -- which is the one thing an explain
 * screen cannot do. It counts ranked candidates, which it has.
 */
function story(p: Provenance): string {
  // The heal record names the element too, and it is the one that was actually
  // read. A run with no `ranked` still has a selector if it healed.
  const element = p.selector ?? p.heal?.to ?? null;
  const at = `on run ${p.run}, ${stamp(p.startedAt)}`;
  const ranked = p.considered
    ? `${p.considered} element${p.considered === 1 ? '' : 's'} on the page ${p.considered === 1 ? 'was' : 'were'} ranked`
    : null;

  const read =
    p.value === null
      ? // Nothing was read, so the sentence must not open as though something was.
        `${ranked ? `${ranked} on the ${p.scraper} page, ${at}, and none of them was published.` : `Nothing was published for this cell on the ${p.scraper} page, ${at}.`}`
      : `${element ? `I read it off ${element}` : 'I read this cell'} on the ${p.scraper} page, ${at}.${
          ranked ? ` ${ranked}; this is the one that came through.` : ' No candidate list was kept for this run.'
        }`;

  const healed = p.heal
    ? p.heal.from === p.heal.to
      ? ` The selector is unchanged (${p.heal.to}); what it points at on the page had moved.`
      : ` The element it had been reading (${p.heal.from ?? 'unrecorded'}) was gone, so it was relocated to ${p.heal.to}.`
    : ' Nothing about this field had been healed at the time.';

  return read + healed;
}

function standing(p: Provenance): string {
  switch (p.standing) {
    case 'live':
      return 'Not healed, not stale, not held. The plainest possible provenance: it came off the page where it was expected to be.';
    case 'healed':
      return 'The element moved and was found again. It was published because the replacement cleared the same gate as the original, on the same page.';
    case 'withheld':
      return p.why?.plain
        ? `Nothing was written to your data for this cell — ${p.why.plain}.`
        : `Nothing was written to your data for this cell. The gate recorded ${p.why?.code ?? 'no reason'}.`;
    case 'stale':
      return 'The page had not changed since the last run, so this run republished what the last one said.';
    default:
      return 'The run completed but this cell came back in a state the gate would not vouch for.';
  }
}

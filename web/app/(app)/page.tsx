import type { Metadata } from 'next';
import { modelAuth } from 'assay/engine/ai/model';
import { TopBar } from '@/components/top-bar';
import { RunStrip } from '@/components/run-strip';
import { homeStats } from '@/lib/home';
import { openDecisions } from '@/lib/queue';
import { getConversation } from 'assay/engine/store/conversations';
import { Watch } from './watch';

export const metadata: Metadata = { title: 'Assay' };
export const dynamic = 'force-dynamic';

/**
 * Home, and every conversation that has ever happened on it.
 *
 * `?c=<id>` is the whole of the routing. A conversation is not a separate screen
 * -- it is what this screen becomes -- so it gets a search param rather than a
 * segment, and the client can move the URL onto it with `history.replaceState`
 * without unmounting a turn that is mid-stream.
 *
 * The title is read here, on the server, from the row. That is what renames the
 * top bar from "Home": it is not a client override of a server-rendered string,
 * so a reload, a link from the rail and a deep link all agree.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c } = await searchParams;
  const wanted = c && /^\d+$/.test(c) ? Number(c) : null;

  const [stats, queue, conversation] = await Promise.all([
    homeStats(),
    openDecisions(),
    // A `?c=` naming a conversation that is not there resolves to null and the
    // screen is Home. Better than a 404 on a link to something deleted.
    wanted == null ? Promise.resolve(null) : getConversation(wanted),
  ]);
  // Read HERE, on the server, and passed down as a string. `assay/engine/ai/model`
  // imports the Agent SDK and pulls Node built-ins, so a `'use client'` import of
  // it would drag them into the browser bundle -- the failure
  // `web/components/chrome.ts` exists to document. It returns PRESENCE only;
  // there is no value in it to pass on even by accident.
  const auth = modelAuth();

  return (
    <>
      <TopBar title={conversation?.title ?? 'Home'} />
      <Watch
        waiting={queue.length}
        auth={auth}
        conversation={
          conversation && {
            id: conversation.id,
            title: conversation.title,
            scraperSlug: conversation.scraperSlug,
            turns: conversation.turns,
          }
        }
        // Passed as a rendered node rather than as data: the band is a server
        // component reading the store, and the client only decides whether the
        // screen still has room for it.
        stats={<StatsBand stats={stats} />}
      />
    </>
  );
}

/**
 * The band under the fold. Three numbers, and the third is the one the whole
 * product is judged on -- so it is counted from the retractions table rather
 * than assumed.
 */
function StatsBand({ stats }: { stats: Awaited<ReturnType<typeof homeStats>> }) {
  if (stats.runs === 0) return null;

  return (
    <div className="border-t border-[var(--border-hairline)] px-[56px] py-[28px]">
      <p className="label-10 pb-[10px] text-[var(--text-muted)]">ACROSS ALL SCRAPERS</p>
      <div className="flex flex-wrap items-start gap-x-[64px] gap-y-[20px]">
        <div className="flex flex-col gap-[12px]">
          <p className="title-20 text-[var(--text-primary)]">
            {stats.runs} run{stats.runs === 1 ? '' : 's'} {sinceLabel(stats.since)}
          </p>
          <RunStrip bars={stats.bars} from={dayLabel(stats.bars[0].at)} to={dayLabel(stats.bars[stats.bars.length - 1].at)} />
        </div>

        <div className="flex flex-col gap-[10px] pt-[4px]">
          <Stat dot="var(--semantic-success)" n={stats.clean} label={`clean run${stats.clean === 1 ? '' : 's'}`} />
          <Stat dot="var(--semantic-warning)" n={stats.waiting} label="waiting on you" />
        </div>

        <div className="flex flex-col gap-[4px] pt-[4px]">
          <Stat dot="var(--semantic-danger)" n={stats.retracted} label="published in error" />
          <p className="caption-11 pl-[18px] text-[var(--text-muted)]">since you started</p>
        </div>
      </div>
    </div>
  );
}

function Stat({ dot, n, label }: { dot: string; n: number; label: string }) {
  return (
    <p className="flex items-baseline gap-[10px]">
      <span className="size-[7px] shrink-0 translate-y-[-2px] rounded-full" style={{ background: dot }} />
      <span className="title-20 text-[var(--text-primary)]">{n}</span>
      <span className="meta-13 text-[var(--text-secondary)]">{label}</span>
    </p>
  );
}

const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });

function dayLabel(d: Date): string {
  const at = new Date(d);
  return sameDay(at, new Date()) ? 'today' : DAY.format(at);
}

function sinceLabel(since: Date | null): string {
  if (!since) return 'so far';
  const at = new Date(since);
  return sameDay(at, new Date()) ? 'today' : `since ${DAY.format(at)}`;
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

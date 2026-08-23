'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import {
  CircleAlert, Eye, Hammer, Shapes, Split, ChevronRight, PencilLine, RotateCw, Scissors,
} from 'lucide-react';
import { turn, type TraceEvent } from '@/lib/chat-stream';
import { t } from '@/lib/copy';
import { Button } from '@/components/button';
import { DEFAULT_MODEL } from 'assay/engine/agent/models';
import {
  commandTurn, historyFor, tail, turnFailed, HISTORY_TURNS,
  type CommandName, type Turn,
} from 'assay/engine/store/conversation-log';
import { Composer } from './composer';
import { CommandTurn } from './command-turn';
import { ExportMenu } from './export-menu';
import { Trace, ToolChips } from './trace';
import { SchemaTable, HeldCell, tierFor } from './schema-table';
import { ManualFields } from './manual-fields';
import {
  build, openConversation, recordTurns, type ChatResult, type Proposal,
} from './watch-actions';

/**
 * Home: the empty state, and the conversation it becomes.
 *
 * TWO STATES, ONE SCREEN. With no turns this is the hero, the composer and the
 * two places to start from -- and that is the honest empty state, so it is not
 * animated away as though it were clutter. The moment a message is sent the
 * screen IS the conversation: the hero, the start-from rows and the statistics
 * band go, the composer settles into a bar at the bottom, and the transcript
 * scrolls above it. The top bar's title and the rail's entry are not this
 * component's to change -- they are server-rendered from the conversation row,
 * which is why the first message writes to Postgres before it asks the agent.
 *
 * WHY THE COMPOSER IS NOT `position: fixed`. It is the last child of a flex
 * column that owns the viewport, so the transcript is what scrolls and the two
 * cannot overlap by construction. A fixed bar would have to reserve its own
 * height in the scroller's padding, and every change to the composer's height --
 * the textarea grows to 240px -- would have to be mirrored there or the last
 * message would go under it. This way there is nothing to keep in sync, and an
 * on-screen keyboard resizes the flex box rather than covering a fixed element.
 *
 * The shape of a turn is unchanged: the operator types, the request opens an SSE
 * stream, the steps arrive as the agent's tools actually run, and the reply
 * lands whole at the end. See `src/agent/http.ts` for why the reply is not typed
 * out character by character -- in short, the model never writes it, so there is
 * no generation to animate.
 */

/** A conversation as the server hands it over. Dates are already strings on the wire. */
export interface OpenConversation {
  id: number;
  title: string;
  scraperSlug: string | null;
  turns: Turn[];
}

export function Watch({
  waiting, auth, conversation, stats, bench,
}: {
  waiting: number;
  auth: string;
  /** The conversation `?c=` named, or null on a fresh Home. */
  conversation: OpenConversation | null;
  /** The statistics band, rendered on the server. Shown only in the empty state. */
  stats: React.ReactNode;
  /**
   * `results/bench.json`, counted on the server. Null when the file is absent,
   * and the strip is then not drawn at all -- see `web/lib/bench.ts`.
   *
   * The shape is spelled out rather than imported from `@/lib/bench`, for the
   * reason `web/components/run-action.tsx` gives at length: that module reads
   * `node:fs`, and a type-only import of a server module is one refactor away
   * from a value import that breaks the browser bundle.
   */
  bench: { cases: number; wrong: number; naiveWrong: number } | null;
}) {
  // Seeded from the server ONCE. After that this component owns the transcript:
  // it is the thing that appended the turn, and re-reading the row it just wrote
  // would replace a live proposal with the text of the reply that carried it.
  const [turns, setTurns] = useState<Turn[]>(() => conversation?.turns ?? []);
  const [convId, setConvId] = useState<number | null>(conversation?.id ?? null);
  const [slug, setSlug] = useState<string | null>(conversation?.scraperSlug ?? null);

  const [result, setResult] = useState<ChatResult | null>(null);
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  // Typed `string`, not `Model`: `ModelPicker` hands back whatever the browser
  // clicked and the server re-checks it against the allowlist regardless. See
  // `isModel` in src/agent/models.ts -- membership is the guard, not this type.
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const [manual, setManual] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const router = useRouter();

  /**
   * Which conversation is on screen, as opposed to which one the server last
   * sent. They differ for one render in both directions and the difference is
   * the whole reason this is a ref rather than a `key` on the component.
   *
   * A `key` would remount on every server render whose id changed -- including
   * the `router.refresh()` this component fires the moment it creates a
   * conversation, which would tear down a turn that is still streaming. So
   * instead: the client says which conversation it is showing, and only a
   * navigation AWAY from it is worth resetting for. Clicking another
   * conversation in the rail, or "New scrape", is such a navigation. Our own
   * refresh is not.
   *
   * THE ADDRESS BAR IS THE AUTHORITY ON WHICH CONVERSATION IS OPEN, and the
   * second condition below is the whole reason this comment is long. A server
   * payload arrives whenever the render behind it finishes, which under load is
   * hundreds of milliseconds after the action that asked for it -- and it can
   * carry a conversation this screen has already left. Treating that as a
   * navigation aborted the turn that was streaming at the time, cleared
   * `running`, and left the operator looking at their own message with no
   * spinner, no reply and no error: reproduced on a throttled browser three
   * times out of three, and matching the live transcript where two `operator`
   * turns sit back to back. A payload that disagrees with `?c=` is a late
   * render, not a navigation, and is ignored until the two agree.
   */
  const shown = useRef<number | null>(conversation?.id ?? null);
  const incoming = conversation?.id ?? null;
  useEffect(() => {
    if (incoming === shown.current) return;
    if (incoming !== openedInUrl()) return;
    shown.current = incoming;
    abort.current?.abort();
    setTurns(conversation?.turns ?? []);
    setConvId(incoming);
    setSlug(conversation?.scraperSlug ?? null);
    setResult(null);
    setEvents([]);
    setStartedAt(null);
    setRunning(false);
    setManual(false);
    // `conversation` is read fresh on every render; depending on the id alone is
    // what makes this a navigation handler rather than a prop mirror.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming]);

  const submit = useCallback(async (message: string) => {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;

    const at = new Date().toISOString();
    const asked: Turn = { role: 'operator', text: message, at };
    // Read the window BEFORE the new message joins the list -- `history` is what
    // came before, and `converse` appends the message itself.
    const { history } = historyFor(turns);

    setTurns((t) => [...t, asked]);
    setResult(null);
    setEvents([]);
    setManual(false);
    // The clock starts when the request leaves, not when the first step lands:
    // the wait before a page answers is part of the wait.
    setStartedAt(Date.now());
    setRunning(true);

    // The transcript is written before the agent is asked, so a question that
    // got no answer is still a question this instance was asked. A store that is
    // down must not stop the agent answering, so this is caught and the turn
    // continues -- unpersisted, which the operator finds out on reload rather
    // than being told a lie now.
    let id = convId;
    try {
      if (id == null) {
        id = await openConversation(message);
        setConvId(id);
        // Claimed before the refresh below delivers it, so the navigation
        // handler above sees agreement rather than a change.
        shown.current = id;
        // Same route, new search param: the URL now names the conversation, so a
        // reload lands back here. `refresh` is what re-renders the server
        // components above this one -- the top bar's title and the rail's list.
        window.history.replaceState(null, '', `/?c=${id}`);
        router.refresh();
      } else {
        await recordTurns(id, [asked]);
      }
    } catch {
      id = convId;
    }

    /**
     * A turn that did not land, recorded rather than swallowed.
     *
     * Persisted whenever there is a row to persist to -- including when the
     * turn was aborted, because the abandoned question is still in the
     * transcript and would otherwise read as merely unanswered forever. Only
     * rendered when this turn still owns the screen: a newer turn, or another
     * conversation, must not have someone else's failure appear underneath it.
     */
    const failed = (detail: string) => {
      const ev = turnFailed(detail);
      if (abort.current === ctl && !ctl.signal.aborted) setTurns((t) => [...t, ev]);
      if (id != null) recordTurns(id, [ev]).catch(() => {});
    };

    const collected: TraceEvent[] = [];
    try {
      const r = await turn(
        { message, history, model },
        (e) => { collected.push(e); setEvents((prev) => [...prev, e]); },
        ctl.signal,
      );
      // A stream that ended without a result is a turn that did not land. It is
      // not an empty proposal and must never render as one.
      setResult(r);
      if (r && !ctl.signal.aborted) {
        const replied: Turn = {
          role: 'assay',
          text: r.reply,
          at: new Date().toISOString(),
          events: collected.filter((e) => e.kind === 'tool_result'),
          ...(r.kind === 'propose'
            ? {
                proposed: {
                  url: r.proposal.url,
                  cadence: r.proposal.cadence,
                  fields: r.proposal.fields.map((f) => f.name),
                },
              }
            : {}),
        };
        setTurns((t) => [...t, replied]);
        if (id != null) recordTurns(id, [replied]).catch(() => {});
      } else if (ctl.signal.aborted) {
        failed('This message was not answered — the turn was stopped before a reply arrived.');
      } else {
        // `/api/chat` always ends a turn with a result frame, even when the
        // agent itself threw, so reaching here means the request never got
        // there or the connection went before the end of the stream.
        failed('Assay did not answer this message — the connection ended before a reply arrived.');
      }
    } catch (e) {
      if (ctl.signal.aborted) {
        failed('This message was not answered — the turn was stopped before a reply arrived.');
      } else {
        setResult(null);
        // The message is the browser's own ("Failed to fetch", "NetworkError"),
        // which names the transport rather than being invented here.
        failed(`Assay could not answer this message: ${(e as Error).message}.`);
      }
    } finally {
      // Whether the spinner stops is a question about THIS turn, not about the
      // signal: an aborted turn that leaves `running` true disables the
      // composer forever, which is the state the operator could not type out of.
      if (abort.current === ctl) setRunning(false);
    }
  }, [model, convId, turns, router]);

  /**
   * Run a `/` command: append the turn, persist it, and read nothing here.
   *
   * NO MODEL, NO STREAM, NO ROWS. A command is not a question -- it asks the
   * store, not the agent -- so it opens no SSE, aborts nothing that is running,
   * and costs no tokens. What it appends carries the command name and the words
   * typed after it and NOTHING ELSE; `CommandTurn` does the reading on every
   * render, which is what keeps an old turn honest after its cells are answered.
   *
   * The conversation row is opened for a command exactly as it is for a message,
   * because a transcript that silently drops the first thing an operator did is
   * a transcript with a hole in it. A store that is down does not stop the
   * listing appearing -- the turn is simply not persisted, which they find out
   * on reload rather than being told a lie now, the same deal `submit` makes.
   */
  const runCommand = useCallback(async (name: CommandName, args: string) => {
    const asked = commandTurn(name, args);
    setTurns((t) => [...t, asked]);

    try {
      if (convId == null) {
        const id = await openConversation(`/${name}`);
        setConvId(id);
        shown.current = id;
        window.history.replaceState(null, '', `/?c=${id}`);
        router.refresh();
        await recordTurns(id, [asked]);
      } else {
        await recordTurns(convId, [asked]);
      }
    } catch {
      // Unpersisted, and the panel above still reads live.
    }
  }, [convId, router]);

  /** Ask the newest question again. Only offered when the last one is recorded as failed. */
  const retry = useCallback(() => {
    const last = lastAsked(turns);
    if (last) submit(last);
  }, [turns, submit]);

  const started = turns.length > 0;

  const composer = (
    <Composer
      auth={auth}
      model={model}
      onModel={setModel}
      onSubmit={submit}
      onCommand={runCommand}
      busy={running}
    />
  );

  // The manual path, on the same condition it has always had: reachable whether
  // or not a model answered, because the moment it is needed most is the moment
  // the model could not help. In a conversation it lands under the newest reply
  // instead of under the composer, and a target it creates belongs to this
  // conversation like any other.
  const manualPath = manual ? (
    <ManualFields
      seedUrl={urlIn(lastAsked(turns))}
      conversationId={convId ?? undefined}
      onCancel={() => setManual(false)}
    />
  ) : (
    <button
      type="button"
      onClick={() => setManual(true)}
      className="press-row flex w-full items-center gap-[16px] rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[20px] py-[14px] text-left transition-colors duration-[var(--duration-tint)] hover:bg-[var(--surface-subtle)]"
    >
      <PencilLine size={18} strokeWidth={1.5} className="shrink-0 text-[var(--text-primary)]" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="body-14 text-[var(--text-primary)]">Describe the fields yourself</span>
        <span className="caption-12 text-[var(--text-secondary)]">
          a page, and what to watch on it -- no model needed
        </span>
      </span>
      <ChevronRight size={16} strokeWidth={1.5} className="shrink-0 text-[var(--text-muted)]" aria-hidden />
    </button>
  );

  if (!started) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 items-center justify-center px-[32px] py-[48px]">
          <div className="flex w-full max-w-[700px] flex-col items-center gap-[28px]">
            <div className="flex flex-col items-center gap-[12px]">
              {/* An h2, not an h1. The top bar above this already renders the
                  screen's h1 -- "Home", or the conversation's own title -- and
                  Home was the only screen in the product with two, so its
                  heading outline named the page twice. The display class stays
                  exactly as it was: this is still the biggest thing on the
                  screen, it has simply stopped claiming to be the page name. */}
              <h2 className="display-28 flex flex-wrap items-center justify-center gap-[12px] text-center text-[var(--text-primary)]">
                {/* The `{' '}` is not decoration and is not what draws the gap
                    -- `gap-[12px]` does that. JSX drops the newline between a
                    text node and the element after it, so the DOM text read
                    "What shouldAssay watch?": what a screen reader announced,
                    what a find-in-page missed, and what any copy of this line
                    pasted anywhere. A trailing space at the end of a flex
                    item's line box is not drawn, so nothing moves. */}
                What should{' '}
                <Image src="/brand/assay-mark.svg" alt="" width={26} height={26} className="inline-block rounded-[7px]" />
                Assay watch?
              </h2>
              {/* WHAT THIS IS, under what it asks for. The hero named the box's
                  job and never the product's claim, so the first screen of the
                  app was the one place that did not say what Assay is. The
                  sign-in page's own words, through the same two keys rather
                  than a second copy of the sentence free to drift from it. */}
              <p className="body-14 text-center text-[var(--text-secondary)]">
                {t('signIn.headline.before')} {t('signIn.headline.after')}
              </p>
              {/* And the evidence for it, counted from `results/bench.json` on
                  every render -- never a number typed into this file. A claim
                  with a link to the working is a claim; the same sentence with
                  hardcoded digits is a slogan. Absent entirely when the file
                  is not in the checkout. */}
              {bench && (
                /* copy(G) */
                <Link
                  href="/docs"
                  className="caption-12 text-center text-[var(--text-muted)] transition-colors duration-[var(--duration-tint)] hover:text-[var(--text-secondary)]"
                >
                  {bench.cases} benchmark cases · {bench.wrong} wrong values published · a naive
                  scraper would have published {bench.naiveWrong}
                </Link>
              )}
            </div>
            {composer}
            {manualPath}
            {!manual && <StartFrom waiting={waiting} />}
          </div>
        </div>
        {stats}
      </div>
    );
  }

  return (
    <Conversation
      id={convId}
      slug={slug}
      turns={turns}
      running={running}
      events={events}
      startedAt={startedAt}
      result={result}
      composer={composer}
      manualPath={manualPath}
      // Offered from the transcript, so it survives a reload: a conversation
      // whose newest question is recorded as failed opens with the question,
      // the reason, and the way to ask it again.
      onRetry={!running && tail(turns) === 'failed' ? retry : undefined}
      // Withheld while a turn is running: `submit` aborts whatever is in flight
      // before it starts, so offering a second ask mid-turn is offering to
      // cancel the first one without saying so.
      onAsk={running ? undefined : submit}
      onBuilt={(builtSlug) => setSlug(builtSlug)}
    />
  );
}

/**
 * The conversation, once there is one.
 *
 * `h-[calc(100svh-64px)]` is the viewport less the top bar, and `svh` rather
 * than `vh` so a mobile browser's collapsing address bar does not leave the
 * composer under the fold. The scroller is the only thing that scrolls.
 */
function Conversation({
  id, slug, turns, running, events, startedAt, result, composer, manualPath, onRetry, onAsk, onBuilt,
}: {
  id: number | null;
  slug: string | null;
  turns: Turn[];
  running: boolean;
  events: TraceEvent[];
  startedAt: number | null;
  result: ChatResult | null;
  composer: React.ReactNode;
  manualPath: React.ReactNode;
  /** Set only when the newest question is recorded as failed. */
  onRetry?: () => void;
  /** Ask something again. Absent while a turn is running, so a re-ask cannot queue behind one. */
  onAsk?: (message: string) => void;
  onBuilt: (slug: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  // Whether the newest message should pull the view down. True until someone
  // scrolls up to read something, false from then until they come back -- a
  // transcript that yanks itself to the bottom while you are reading is the
  // behaviour this ref exists to prevent.
  const stick = useRef(true);

  useEffect(() => {
    const el = scroller.current;
    if (!el || !stick.current) return;
    el.scrollTop = el.scrollHeight;
  }, [turns.length, events.length, running]);

  const spoken = turns.filter((t) => t.role !== 'event').length;
  const windowed = Math.max(0, spoken - HISTORY_TURNS);
  // The index of the first turn the agent was actually given, so the notice
  // lands where the context begins rather than at the top of the screen.
  const firstSent = windowed > 0 ? indexOfNthSpoken(turns, windowed) : -1;

  return (
    // One class, and it fires exactly once: this component mounts when the
    // first message is sent and stays mounted for the rest of the conversation,
    // so the reveal marks the screen becoming a conversation and never re-runs
    // on a turn. docs/MOTION.md 5 warns against animating a path someone walks
    // many times a day, which is why the transcript itself is not staggered and
    // the arriving message has no motion of its own -- the whole budget for
    // this transition is this one 200ms fade, and the `*` reduced-motion query
    // takes even that.
    <div className="motion-fade-up flex h-[calc(100svh-64px)] flex-col">
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-[20px] px-[32px] pb-[32px] pt-[24px]">
          {id != null && <ConversationHeader id={id} slug={slug} />}

          {/* `log`, not `alert`: additions are announced, and focus stays in
              the composer where the operator left it. */}
          <div role="log" aria-live="polite" aria-relevant="additions" className="flex flex-col gap-[20px]">
            {turns.map((t, i) => (
              <div key={i} className="flex flex-col gap-[12px]">
                {i === firstSent && <ContextWindow dropped={windowed} />}
                <TurnView
                  turn={t}
                  // The confirm button below belongs to exactly one turn: the
                  // newest, and only while a live `propose` result is in hand.
                  // Every other proposal in the transcript is a record.
                  live={i === turns.length - 1 && result?.kind === 'propose'}
                  onAsk={onAsk && askedBefore(turns, i) ? () => onAsk(askedBefore(turns, i)!) : undefined}
                />
              </div>
            ))}
          </div>

          <Trace events={events} running={running} startedAt={startedAt} />

          {/* The live turn's extras. Only ever the newest turn: a proposal is a
              reading of a page at one moment, and an older one has no button. */}
          {!running && result?.kind === 'propose' && (
            <ProposalView result={result} conversationId={id} onBuilt={onBuilt} />
          )}
          {/* "Nothing about how Assay decides what to publish changes either
              way." came off. It is the model-is-optional claim, which belongs
              on the key panel and the model picker -- both of which carry it,
              in a place the reader is asking the question. Landing under a
              reply, with no antecedent for "either way", it read as a
              non-sequitur reassurance nobody had asked for, which is exactly
              what the second voice-bank pass took off 30 frames. The row below
              it is the actionable half and stays. */}
{onRetry && (
            <div className="flex flex-wrap items-center gap-[12px]">
              <Button variant="outline" icon={RotateCw} onClick={onRetry}>
                Ask again
              </Button>
              <span className="meta-12_5 text-[var(--text-secondary)]">
                Nothing was created, and nothing was published — the question was recorded and the
                answer never arrived.
              </span>
            </div>
          )}

          {!running && result?.kind !== 'propose' && manualPath}
        </div>
      </div>

      <div className="shrink-0 border-t border-[var(--border-hairline)] bg-[var(--bg-page)]">
        <div className="mx-auto w-full max-w-[760px] px-[32px] pb-[20px] pt-[16px]">{composer}</div>
      </div>
    </div>
  );
}

/** The conversation's own controls: what it produced, and taking it away with you. */
function ConversationHeader({ id, slug }: { id: number; slug: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-x-[18px] gap-y-[6px] border-b border-[var(--border-hairline)] pb-[14px]">
      {slug ? (
        <Link href="/runs" className="meta-13 text-[var(--semantic-link)]">
          Watching {slug} ›
        </Link>
      ) : (
        <span className="meta-13 text-[var(--text-muted)]">No scraper from this conversation yet</span>
      )}
      {/* Two ways out of a conversation, both reading the one export route.
          See `export-menu.tsx` for why the download stopped being a bare link. */}
      <ExportMenu id={id} className="ml-auto text-[var(--text-secondary)]" />
    </div>
  );
}

/**
 * "The agent was not given everything above this line."
 *
 * NOT A COMPACTION, AND THIS SAYS SO. `src/agent/http.ts` caps `history` at 40
 * turns, and `converse` opens a fresh single-shot session per turn with the
 * transcript flattened into the prompt -- so the Agent SDK's own auto-compaction
 * never sees this conversation and never trims it (see the note in
 * `src/store/conversation-log.ts`). What happens instead is a window: the stored
 * transcript keeps every turn, and the agent is handed the most recent 40.
 *
 * Nothing is summarised, because a summary is a model call that can be wrong
 * about what mattered, and a wrong summary of a scraper's reasoning is worse
 * than a stated gap. The gap is stated, here, at the line where it falls.
 */
function ContextWindow({ dropped }: { dropped: number }) {
  return (
    <div className="flex items-start gap-[10px] rounded-[var(--radius-card)] border border-dashed border-[var(--border-default)] px-[16px] py-[12px]">
      <Scissors size={14} strokeWidth={1.5} className="mt-[2px] shrink-0 text-[var(--text-muted)]" aria-hidden />
      <p className="caption-12 text-[var(--text-secondary)]">
        The agent&rsquo;s context starts here. {dropped} earlier turn{dropped === 1 ? ' is' : 's are'}{' '}
        kept in this transcript and in the export, but {dropped === 1 ? 'was' : 'were'} not sent with
        the newest message &mdash; nothing was summarised and nothing was deleted.
      </p>
    </div>
  );
}

/**
 * One stored turn. The operator's own words are the only thing in blue.
 *
 * `live` says whether the proposal on this turn is the one the confirm button
 * below the transcript is showing. When it is not -- which is every proposal
 * after a reload or a walk through the rail -- the turn says why the button is
 * not there. See `StaleProposal`.
 */
function TurnView({ turn: t, live = false, onAsk }: {
  turn: Turn;
  live?: boolean;
  /** Re-ask the question that produced this proposal. Absent on a stored turn with no question before it. */
  onAsk?: () => void;
}) {
  if (t.role === 'operator') {
    return (
      <p className="max-w-[85%] self-end rounded-[var(--radius-card)] bg-[var(--semantic-link)] px-[16px] py-[10px]">
        {/* #ffffff on #2563eb is 5.17:1 -- AA for body text, measured rather
            than assumed. `--accent-on-primary` IS #ffffff, and naming the token
            keeps it correct if the palette moves. */}
        <span className="body-13_5 whitespace-pre-wrap break-words text-[var(--accent-on-primary)]">
          {t.text}
        </span>
      </p>
    );
  }

  if (t.role === 'event') {
    // A command is the one event that is not a line across the transcript
    // either: it is a question about the store, and the answer is read fresh
    // every time this renders rather than being kept in the turn. See
    // `command-turn.tsx` -- the panel is what makes an old `/decisions` still
    // true after the cells in it have been answered.
    if (t.kind === 'command') return <CommandTurn turn={t} />;

    // A failure is the one event that is not a neutral rule across the
    // transcript. It is the difference between "no answer yet" and "no answer,
    // ever", so it is stated in words, in red, with a glyph -- colour is never
    // the only signal -- and announced as an alert rather than as a log line.
    if (t.kind === 'failed') {
      return (
        <p
          role="alert"
          className="flex items-start gap-[8px] rounded-[var(--radius-control)] border border-[var(--semantic-danger)] bg-[var(--semantic-danger-subtle)] px-[12px] py-[9px]"
        >
          <CircleAlert
            size={14}
            strokeWidth={1.5}
            className="mt-[1px] shrink-0 text-[var(--semantic-danger)]"
            aria-hidden
          />
          {/* The sentence is `text/secondary`, not the red: #6b6b6b on the red
              subtle is 4.87:1 where the red itself is 4.41:1, and this is body
              text. The red is spent on the glyph and the rim, where 3:1 is the
              bar it has to clear -- the same division `HeldCell` makes. */}
          <span className="caption-12 leading-[1.45] text-[var(--text-secondary)]">{t.text}</span>
        </p>
      );
    }
    return (
      <p className="flex items-center gap-[10px] py-[2px]">
        <span className="h-px flex-1 bg-[var(--border-hairline)]" />
        <span className="caption-11 shrink-0 text-[var(--text-muted)]">{t.text}</span>
        <span className="h-px flex-1 bg-[var(--border-hairline)]" />
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-[8px]">
      <p className="body-13_5 whitespace-pre-wrap break-words text-[var(--text-primary)]">{t.text}</p>
      {/* The record of what was offered. It stays whether or not the offer can
          still be taken -- it is the only place the fact that a proposal was
          made AND NOT TAKEN survives once the tab is closed, and the export
          reads it. */}
      {t.proposed && (
        <p className="caption-12 text-[var(--text-secondary)]">
          Proposed {t.proposed.fields.length} field{t.proposed.fields.length === 1 ? '' : 's'} on{' '}
          {t.proposed.url}: {t.proposed.fields.join(', ')}.
        </p>
      )}
      {t.proposed && !live && <StaleProposal at={t.at} onAsk={onAsk} />}
      {/* Real calls that really ran, replayed from the record -- not a
          reconstruction. Absent on a turn that called no tool. */}
      {t.events?.length ? <ToolChips events={t.events} /> : null}
    </div>
  );
}

/**
 * Why a proposal you have come back to has no confirm button.
 *
 * NOTHING FAILED HERE, and the wording is the whole job. `ProposalView` is
 * built only for the live turn, because `proposal.create` carries selectors
 * derived from the page AS IT WAS when the agent read it, and offering a button
 * hours later that builds a scraper from a stale reading is the quiet wrongness
 * the gate exists to refuse. That is right, and it was invisible: the operator
 * walked away from a conversation, came back, found the field list gone, and
 * asked whether the product was broken. It was not -- it simply never said.
 *
 * So this is grey and it is a sentence, not amber and not red. It is the same
 * shape as the failed-turn affordance and deliberately a quieter volume of it,
 * because the two facts are different: one is "the answer never came", this one
 * is "the answer is old". `Button`'s `quiet` variant is the recipe's own word
 * for a real choice that must not compete.
 *
 * `suppressHydrationWarning` on the time, and only on the time: this renders on
 * the server too, where the timezone is the host's rather than the reader's, so
 * the two passes legitimately print different clock faces. The alternative --
 * holding the time back until after mount -- would flash the sentence in
 * without it.
 */
function StaleProposal({ at, onAsk }: { at: string; onAsk?: () => void }) {
  return (
    <p className="flex flex-wrap items-center gap-x-[10px] gap-y-[4px] pt-[2px]">
      <span className="caption-12 text-[var(--text-muted)]">
        Read from the page at{' '}
        <span suppressHydrationWarning>{CLOCK.format(new Date(at))}</span>, so it is no longer
        current. Nothing was created from it.
      </span>
      {onAsk && (
        <Button variant="quiet" icon={RotateCw} iconSize={13} onClick={onAsk}>
          Ask again to re-read the page
        </Button>
      )}
    </p>
  );
}

const CLOCK = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

/** Which conversation the address bar says is open. `null` on a bare Home. */
function openedInUrl(): number | null {
  const c = new URLSearchParams(window.location.search).get('c');
  return c && /^\d+$/.test(c) ? Number(c) : null;
}

/** The first URL the operator typed, so the manual form does not ask twice. */
function urlIn(text: string | null): string {
  const m = text ? /https?:\/\/[^\s<>"'`)\]}]+/i.exec(text) : null;
  return m ? m[0].replace(/[.,;:]+$/, '') : '';
}

/** The question that produced the turn at `i`, so re-asking asks the same thing again. */
function askedBefore(turns: Turn[], i: number): string | null {
  for (let j = i - 1; j >= 0; j--) if (turns[j]!.role === 'operator') return turns[j]!.text;
  return null;
}

/** The newest thing the operator said, which is what the manual form should seed from. */
function lastAsked(turns: Turn[]): string | null {
  for (let i = turns.length - 1; i >= 0; i--) if (turns[i]!.role === 'operator') return turns[i]!.text;
  return null;
}

/** Where the nth spoken turn sits in the full list, events included. */
function indexOfNthSpoken(turns: Turn[], n: number): number {
  let seen = 0;
  for (let i = 0; i < turns.length; i++) {
    if (turns[i]!.role === 'event') continue;
    if (seen === n) return i;
    seen++;
  }
  return -1;
}

function StartFrom({ waiting }: { waiting: number }) {
  return (
    <div className="flex w-full flex-col gap-[10px]">
      <p className="label-10 text-[var(--text-muted)]">OR START FROM</p>
      {waiting > 0 && (
        <Row
          href="/decisions"
          icon={<Split size={18} strokeWidth={1.5} className="text-[var(--text-primary)]" aria-hidden />}
          badge={waiting}
          title={`Review ${waiting} decision${waiting === 1 ? '' : 's'} waiting on you`}
          sub="held rows, nothing published yet"
        />
      )}
      {/* First of the two, and above Runs on purpose: this is the row for
          somebody who has nothing yet, and Runs is the row for somebody who
          has. On an empty instance the runs table is empty, so offering it
          first offers a blank screen.

          It is a Row like the others rather than a special affordance because
          it IS like the others -- a place to start that is not the composer.
          The tracker screens do the explaining; a paragraph here about what a
          tracker is would be a paragraph on the one screen that has to stay
          quiet. */}
      <Row
        href="/library"
        icon={<Shapes size={18} strokeWidth={1.5} className="text-[var(--text-primary)]" aria-hidden />}
        title="Pick a tracker and paste a link"
        sub="Amazon, GitHub, Wikipedia, or any page"
      />
      <Row
        href="/runs"
        icon={<Eye size={18} strokeWidth={1.5} className="text-[var(--text-primary)]" aria-hidden />}
        title="See what every scraper did last"
        sub="the runs, and what each one published"
      />
    </div>
  );
}

function Row({
  href, icon, title, sub, badge,
}: {
  href: string; icon: React.ReactNode; title: string; sub: string; badge?: number;
}) {
  return (
    <Link
      href={href}
      className="press-row flex items-center gap-[16px] rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[20px] py-[14px] transition-colors duration-[var(--duration-tint)] hover:bg-[var(--surface-subtle)]"
    >
      <span className="relative flex size-[24px] shrink-0 items-center justify-center">
        {icon}
        {badge ? (
          <span className="absolute -left-[6px] -top-[6px] flex size-[16px] items-center justify-center rounded-full bg-[var(--accent-brand)]">
            <span className="caption-11 text-[var(--accent-on-primary)]">{badge}</span>
          </span>
        ) : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="body-14 text-[var(--text-primary)]">{title}</span>
        <span className="caption-12 text-[var(--text-secondary)]">{sub}</span>
      </span>
      <ChevronRight size={16} strokeWidth={1.5} className="shrink-0 text-[var(--text-muted)]" aria-hidden />
    </Link>
  );
}

/**
 * The proposal, and the one click that makes it real.
 *
 * One bold sentence, one table of the operator's own data, one filled button --
 * docs/APP-DESIGN.md 5b's density law. Everything the machine knows is grey,
 * small, or behind the header disclosure.
 *
 * ONLY EVER THE LIVE TURN. This is not rebuilt from the stored transcript on
 * reload, and that is deliberate rather than an omission: `proposal.create`
 * carries selectors derived from the page AS IT WAS when the agent read it, and
 * offering a button hours later that builds a scraper from a stale reading would
 * be exactly the kind of quiet wrongness the gate exists to refuse. The
 * transcript records that a proposal was made and what it offered; taking it
 * needs a fresh look at the page, which is another message.
 */
function ProposalView({
  result, conversationId, onBuilt,
}: {
  result: Extract<ChatResult, { kind: 'propose' }>;
  conversationId: number | null;
  onBuilt: (slug: string) => void;
}) {
  const p = result.proposal;
  const [keep, setKeep] = useState<string[]>(p.fields.map((f) => f.name));
  const [built, setBuilt] = useState<Awaited<ReturnType<typeof build>> | null>(null);
  const [pending, start] = useTransition();

  // The same mapping the chips use. `!== 'high'` here once called every
  // medium-confidence field strict while its own chip said normal, four
  // centimetres apart.
  const unsure = p.fields.filter((f) => tierFor(f.confidence) === 'strict');

  if (built?.ok) return <Built built={built} proposal={p} />;

  return (
    <div className="motion-fade-up flex w-full flex-col gap-[18px]">
      <p className="body-13_5 text-[var(--text-secondary)]">
        These are the fields and what the page says in each one right now. Nothing is
        created until you start it.
      </p>

      <SchemaTable proposal={p} keep={keep} onKeep={setKeep} />

      {unsure.length > 0 && (
        <p className="meta-12_5 text-[var(--text-secondary)]">
          {unsure.map((f) => f.name).join(', ')}{' '}
          {unsure.length === 1 ? 'has' : 'have'} nothing solid to anchor to, so{' '}
          {unsure.length === 1 ? 'it starts' : 'they start'} on the strict tier. If{' '}
          {unsure.length === 1 ? 'it moves' : 'they move'}, Assay will hold the cell rather
          than guess.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-[16px]">
        <button
          type="button"
          disabled={pending || keep.length === 0}
          onClick={() => start(async () => {
            const r = await build(p.create, keep, conversationId ?? undefined);
            setBuilt(r);
            if (r.ok) onBuilt(r.id);
          })}
          className="press-wide flex h-[40px] items-center gap-[10px] rounded-[var(--radius-control)] bg-[var(--accent-brand)] px-[18px] disabled:opacity-60"
        >
          <Hammer size={16} strokeWidth={1.5} className="text-[var(--accent-on-primary)]" aria-hidden />
          <span className="body-13_5 text-[var(--accent-on-primary)]">
            {pending ? 'Reading the page for a baseline' : 'Start watching these fields'}
          </span>
        </button>
        <span className="meta-12_5 text-[var(--text-secondary)]">
          {keep.length} of {p.fields.length} field{p.fields.length === 1 ? '' : 's'} ·{' '}
          {/^\d/.test(p.cadence) ? `every ${p.cadence}` : p.cadence}
        </span>
        <Link href="/" className="meta-13 ml-auto text-[var(--text-secondary)]">
          Start a new conversation
        </Link>
      </div>

      {built && !built.ok && (
        <p role="alert" className="flex items-center gap-[8px]">
          <CircleAlert size={14} strokeWidth={1.5} className="text-[var(--semantic-danger)]" aria-hidden />
          <span className="meta-12_5 text-[var(--semantic-danger)]">{built.detail}</span>
        </p>
      )}
    </div>
  );
}

/**
 * After the baseline run: the same columns, now carrying what actually happened.
 *
 * This is where a held cell is real rather than hypothetical. `createTarget`
 * establishes the baseline through the ordinary run path, so a field the gate
 * declined to publish comes back `quarantined` with the code that held it, and
 * the cell renders as a hole with that reason. Nothing here simulates that
 * state -- if the gate published everything, no hole is drawn.
 */
function Built({
  built, proposal,
}: {
  built: Extract<Awaited<ReturnType<typeof build>>, { ok: true }>;
  proposal: Proposal;
}) {
  const held = built.fields.filter((f) => f.status === 'quarantined');
  // The baseline run every cell in the table below was recorded on. Same value
  // the row header prints, so the link and the label cannot name different runs.
  const baselineRun = built.fields[0]?.baseline_run ?? null;

  return (
    <div className="motion-fade-up flex w-full flex-col gap-[16px]">
      <h2 className="heading-18 text-[var(--text-primary)]">Watching {built.id}.</h2>
      <p className="body-13_5 text-[var(--text-secondary)]">
        {held.length === 0
          ? 'The first run is done and the baseline is what the page said just now. Every run from here is compared against it.'
          : `The first run is done. ${held.length} field${held.length === 1 ? '' : 's'} came back held -- Assay published nothing there rather than guess, and it is waiting on you.`}
      </p>

      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr className="border-b border-[var(--border-hairline)]">
              <th scope="col" className="label-10 w-[110px] pb-[10px] pr-[16px] text-left font-normal text-[var(--text-muted)]">
                BASELINE
              </th>
              {built.fields.map((f) => (
                <th key={f.field} scope="col" className="pb-[10px] pr-[16px] text-left align-bottom">
                  <span className="mono-value-13 text-[var(--text-primary)]">{f.field}</span>
                  <span className="caption-11 block text-[var(--text-muted)]">
                    {tierFor(proposal.fields.find((x) => x.name === f.field)?.confidence ?? 'high')}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" className="caption-11 py-[14px] pr-[16px] text-left align-top font-normal text-[var(--text-muted)]">
                run {built.fields[0]?.baseline_run ?? '—'}
              </th>
              {built.fields.map((f) => (
                <td key={f.field} className="py-[14px] pr-[16px] align-top">
                  {f.status === 'quarantined' ? (
                    <HeldCell reason={f.reason} targetId={f.id} />
                  ) : f.baseline === null ? (
                    <span className="caption-12 text-[var(--text-muted)]">the element is there and empty</span>
                  ) : (
                    <span className="body-13_5 line-clamp-3 break-words text-[var(--text-primary)]">{f.baseline}</span>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex gap-[16px] pt-[4px]">
        {/* THE run, not the list of them. This said "See the run" and went to
            /runs, which on an instance with four scrapers is a table where the
            run just made is one row among four hundred. The id is right here on
            the baseline cell the table above draws. */}
        <Link
          href={baselineRun === null ? '/runs' : `/runs/${baselineRun}`}
          className="meta-13 text-[var(--semantic-link)]"
        >
          See the run ›
        </Link>
        {held.length > 0 && (
          <Link href="/decisions" className="meta-13 text-[var(--semantic-link)]">
            Decide the held {held.length === 1 ? 'field' : 'fields'} ›
          </Link>
        )}
      </div>
    </div>
  );
}

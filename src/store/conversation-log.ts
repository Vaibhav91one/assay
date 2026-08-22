// The transcript's own shape and the three pure functions over it.
//
// SEPARATE FROM ./conversations.ts BECAUSE OF THE BUNDLER, not because of taste.
// That file opens a Postgres pool, and the composer is a `'use client'`
// component that needs `historyFor` to decide what the agent is told. Importing
// the query module into the browser bundle would drag `pg` and its Node
// built-ins in -- the same hazard `web/components/chrome.ts` documents. So the
// shape lives here, where both sides can have it, and there is still one
// definition rather than two that drift.

// Type-only, so nothing from the agent (and none of the Node built-ins the
// Agent SDK opens) is imported at runtime.
import type { TraceEvent } from '../agent/index.js';

/**
 * One entry in a transcript.
 *
 * `event` is not a speaker. It is something that happened between turns and
 * that the transcript would be lying by omission to leave out -- a scraper
 * being created, or a compaction. It renders as a rule across the transcript,
 * never as a message.
 */
export type Turn =
  | { role: 'operator'; text: string; at: string }
  | {
      role: 'assay';
      text: string;
      at: string;
      /**
       * The tool calls that actually ran on this turn, as the tool handlers
       * emitted them. Persisted so a reload shows the same trace rather than a
       * blank where one was -- these are a record of real calls, so replaying
       * them is reporting, not simulation.
       */
      events?: TraceEvent[];
      /**
       * What this turn offered, if it offered a schema. Kept so the export can
       * say a proposal was made AND NOT TAKEN, which is a fact that exists
       * nowhere else once the tab is closed. Deliberately not enough to rebuild
       * the confirm button from: see `web/app/(app)/watch.tsx`.
       */
      proposed?: { url: string; cadence: string; fields: string[] };
    }
  | { role: 'event'; kind: 'built' | 'compacted'; text: string; at: string };

export interface Conversation {
  id: number;
  title: string;
  /** The scraper this conversation produced, or null. Most are null. */
  scraperSlug: string | null;
  turns: Turn[];
  createdAt: Date;
  updatedAt: Date;
}

/** What the rail lists. No turns: the rail draws a name, not a transcript. */
export interface ConversationSummary {
  id: number;
  title: string;
  scraperSlug: string | null;
  turns: number;
  updatedAt: Date;
}

/**
 * A name, from the operator's own first message.
 *
 * No model call. A title is not worth a round trip and a generated one is a
 * second thing that can be wrong about a conversation; a truncated first
 * sentence is free and is exactly what the operator typed. Cut at a word
 * boundary so the tail is not half a word.
 */
export function titleFor(message: string): string {
  const flat = message.replace(/\s+/g, ' ').trim();
  if (!flat) return 'Untitled';
  if (flat.length <= 60) return flat;
  const cut = flat.slice(0, 60);
  const space = cut.lastIndexOf(' ');
  return `${(space > 24 ? cut.slice(0, space) : cut).replace(/[.,;:—-]+$/, '')}…`;
}

// --- what the agent is given --------------------------------------------------

/**
 * The turns this conversation's agent is invoked with.
 *
 * `src/agent/http.ts` caps `history` at 40 entries of 4000 characters, so a long
 * conversation cannot be sent whole. This returns the tail that fits AND the
 * number of turns it had to leave behind, because dropping context silently is
 * the one thing a chat surface must not do -- the caller renders `dropped` as a
 * visible line in the transcript rather than letting the agent quietly forget.
 *
 * The stored transcript is never touched. What is trimmed here is the model's
 * context for one turn; the log keeps everything.
 */
export const HISTORY_TURNS = 40;
export const HISTORY_CHARS = 4000;

export function historyFor(turns: Turn[]): {
  history: { role: 'operator' | 'assay'; text: string }[];
  dropped: number;
} {
  const spoken = turns.filter(
    (t): t is Extract<Turn, { role: 'operator' | 'assay' }> => t.role !== 'event',
  );
  const kept = spoken.slice(-HISTORY_TURNS);
  return {
    history: kept.map((t) => ({ role: t.role, text: t.text.slice(0, HISTORY_CHARS) })),
    dropped: spoken.length - kept.length,
  };
}

// --- export -------------------------------------------------------------------

/**
 * A conversation as Markdown: the turns, what was proposed, what was approved,
 * and the scraper it produced.
 *
 * The facts, not a reconstruction. A proposal with no `built` event after it was
 * a proposal the operator did not take, and the export says so in those words --
 * that is the only place that fact survives, and it is the same argument as the
 * proof id: an operator who can re-read the reasoning behind a scraper can audit
 * it later.
 */
export function toMarkdown(c: Conversation): string {
  const out: string[] = [
    `# ${c.title}`,
    '',
    `Conversation ${c.id} · started ${c.createdAt.toISOString()} · last message ${c.updatedAt.toISOString()}`,
    c.scraperSlug
      ? `Scraper: \`${c.scraperSlug}\``
      : 'This conversation has not produced a scraper.',
    '',
    '---',
    '',
  ];

  // A proposal is "taken" if a scraper was built after it. Read forwards so the
  // answer is about THIS proposal rather than about the conversation as a whole.
  const builtAfter = (i: number) =>
    c.turns.slice(i + 1).some((t) => t.role === 'event' && t.kind === 'built');

  c.turns.forEach((t, i) => {
    if (t.role === 'operator') {
      out.push(`## You`, '', t.text, '');
      return;
    }
    if (t.role === 'event') {
      out.push(`> **${t.text}**`, '');
      return;
    }
    out.push(`## Assay`, '', t.text, '');
    if (t.events?.length) {
      out.push('<details><summary>Tool calls on this turn</summary>', '');
      for (const e of t.events) {
        if (e.kind !== 'tool_result') continue;
        out.push(`- \`${e.tool}\` — ${e.detail}${e.url ? ` (${e.url})` : ''}`);
      }
      out.push('', '</details>', '');
    }
    if (t.proposed) {
      out.push(
        `**Proposed** ${t.proposed.fields.length} field${t.proposed.fields.length === 1 ? '' : 's'}`
          + ` on ${t.proposed.url}, every ${t.proposed.cadence}: `
          + t.proposed.fields.map((f) => `\`${f}\``).join(', '),
        '',
        builtAfter(i)
          ? '_Approved — a scraper was created from this proposal._'
          : '_Not taken. No scraper was created from this proposal._',
        '',
      );
    }
  });

  return out.join('\n');
}

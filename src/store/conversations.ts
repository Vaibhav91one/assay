// The conversation log: the transcript behind a scraper, and the five queries
// the screen makes against it.
//
// One table, one jsonb column. See `conversations` in ./schema.ts for why the
// transcript is persisted at all and why `scraper_slug` is not a foreign key,
// and ./conversation-log.ts for the shape of a turn -- that file is pure so the
// browser can have it without this one's Postgres pool.

import { desc, eq, sql } from 'drizzle-orm';
import { getDb } from './index.js';
import { conversations } from './schema.js';
import { titleFor, type Conversation, type ConversationSummary, type Turn } from './conversation-log.js';

export * from './conversation-log.js';

export async function startConversation(firstMessage: string): Promise<number> {
  const [row] = await getDb()
    .insert(conversations)
    .values({
      title: titleFor(firstMessage),
      turns: [{ role: 'operator', text: firstMessage, at: new Date().toISOString() }] satisfies Turn[],
    })
    .returning({ id: conversations.conversationId });
  return row!.id;
}

/**
 * Append, in one statement.
 *
 * `turns || $new` rather than read-modify-write: two tabs on the same
 * conversation would otherwise race and one would silently overwrite the
 * other's turn. Postgres concatenates jsonb arrays with `||`.
 */
export async function appendTurns(id: number, add: Turn[]): Promise<void> {
  if (add.length === 0) return;
  await getDb()
    .update(conversations)
    .set({
      turns: sql`${conversations.turns} || ${JSON.stringify(add)}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(conversations.conversationId, id));
}

/** Bind a conversation to the scraper it produced. Called once, after `createTarget`. */
export async function attachScraper(id: number, slug: string): Promise<void> {
  await getDb()
    .update(conversations)
    .set({ scraperSlug: slug, updatedAt: new Date() })
    .where(eq(conversations.conversationId, id));
}

export async function getConversation(id: number): Promise<Conversation | null> {
  if (!Number.isInteger(id)) return null;
  const [row] = await getDb()
    .select()
    .from(conversations)
    .where(eq(conversations.conversationId, id))
    .limit(1);
  if (!row) return null;
  return {
    id: row.conversationId,
    title: row.title,
    scraperSlug: row.scraperSlug,
    turns: (row.turns as Turn[]) ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listConversations(limit = 30): Promise<ConversationSummary[]> {
  const rows = await getDb()
    .select({
      id: conversations.conversationId,
      title: conversations.title,
      scraperSlug: conversations.scraperSlug,
      // Counted in Postgres rather than by shipping every transcript to the
      // rail and calling .length on it.
      turns: sql<number>`jsonb_array_length(${conversations.turns})`,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .orderBy(desc(conversations.updatedAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, turns: Number(r.turns) }));
}

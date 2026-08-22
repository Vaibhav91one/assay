'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { MessageSquare } from 'lucide-react';

/**
 * The rail's conversation list.
 *
 * ONE LIST, TWO KINDS OF ROW, AND THE DIFFERENCE IS VISIBLE. A conversation is
 * the primary object now: it exists from the first message and it may go on to
 * own a scraper. So the rail lists conversations, and a conversation that has
 * produced one says which.
 *
 * Every target that predates the `conversations` table has NO conversation, and
 * `ScraperList` still draws those, unchanged and unlinked. Nothing here invents
 * a transcript for them -- a fabricated history is worse than an absent one, and
 * this is the single most likely place this design would have gone wrong. The
 * two groups are labelled differently for exactly that reason.
 *
 * Client only so it can mark the one in context, which is a fact about the URL
 * (`/?c=<id>`) while the list itself is a fact about the database.
 */
export function ConversationList({
  conversations,
}: {
  conversations: { id: number; title: string; scraperSlug: string | null; turns: number }[];
}) {
  const current = useSearchParams().get('c');

  if (conversations.length === 0) {
    return (
      <p className="caption-12 text-[#65676d]">
        No conversations yet. The first message on Home starts one.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-[4px]">
      {conversations.map((c) => {
        const on = current === String(c.id);
        return (
          <li key={c.id}>
            <Link
              href={`/?c=${c.id}`}
              aria-current={on ? 'page' : undefined}
              className={`flex items-center gap-[10px] rounded-[var(--radius-control)] py-[6px] pl-[4px] pr-[8px] transition-colors duration-[var(--duration-tint)] hover:bg-[#292a2e] ${
                on ? 'bg-[#292a2e]' : ''
              }`}
            >
              <MessageSquare
                size={13}
                strokeWidth={1.5}
                className={`shrink-0 ${on ? 'text-[var(--text-inverse)]' : 'text-[#65676d]'}`}
                aria-hidden
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={`body-14 truncate ${on ? 'text-[var(--text-inverse)]' : 'text-[#a3a5a9]'}`}>
                  {c.title}
                </span>
                {/* The scraper this conversation made, when it made one. Most
                    conversations never do, and those simply say nothing. */}
                {c.scraperSlug && (
                  <span className="caption-11 truncate text-[#65676d]">{c.scraperSlug}</span>
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

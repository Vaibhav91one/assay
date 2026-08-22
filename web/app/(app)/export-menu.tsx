'use client';

import { useEffect, useState } from 'react';
import { Menu } from '@base-ui/react/menu';
import { ChevronDown, ClipboardCopy, Download } from 'lucide-react';
import { actionVariants } from '@/components/button';
import { Toast } from '@/components/toast';

/**
 * Taking a conversation away with you: to a file, or to the clipboard.
 *
 * ONE SOURCE OF MARKDOWN, AND IT IS THE ROUTE. Both items below read
 * `GET /api/conversations/[id]/export` and neither renders the transcript
 * itself, so the file you save and the text you paste are the same bytes by
 * construction rather than by two call sites agreeing to stay in step. There is
 * one generator (`toMarkdown`) and now one caller of it.
 *
 * WHY DOWNLOAD IS NO LONGER A BARE `<a href>`. The route's own header argues
 * for a plain link -- the browser knows how to save a response, and a link can
 * be middle-clicked. That argument survives for the route; what it cannot do is
 * tell anyone whether the save happened. A link that answers 401 because the
 * session lapsed does nothing visible at all, which is the silent failure this
 * screen is being audited for today. So the request is made here, its status is
 * checked, and the bytes are handed to the browser only once they exist -- and
 * a refusal lands as an error toast instead of as nothing.
 *
 * The filename is read back off `content-disposition` rather than rebuilt from
 * the id. The route decides what a conversation export is called; a second
 * expression for it here is a second thing to keep true.
 *
 * `Menu` from Base UI, with `motion-popup`, matching `filter-menu.tsx` and the
 * composer's model picker: arrow keys, type-ahead and the escape behaviour come
 * with it, and the popup enters and leaves the way every other popup does.
 */
export function ExportMenu({ id, className }: { id: number; className?: string }) {
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);

  // 8 seconds, per the overlay convention `components/copy.tsx` sets. Cleared
  // on unmount so a fast navigation cannot leave a timer holding a dead
  // setState.
  useEffect(() => {
    if (!said) return;
    const t = setTimeout(() => setSaid(null), 8000);
    return () => clearTimeout(t);
  }, [said]);

  async function fetched(): Promise<{ markdown: string; filename: string }> {
    const res = await fetch(`/api/conversations/${id}/export`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Assay's export answered ${res.status}.`);
    const named = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '');
    return { markdown: await res.text(), filename: named?.[1] ?? `assay-conversation-${id}.md` };
  }

  async function download() {
    try {
      const { markdown, filename } = await fetched();
      // An object URL rather than a data one: a long conversation past a few
      // megabytes is a `data:` the browser will refuse, and this has no length
      // limit. Revoked on the next frame -- revoking in the same tick can beat
      // the click the anchor has not finished dispatching.
      const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setSaid({ ok: true, text: `Conversation saved as ${filename}` });
    } catch (e) {
      setSaid({ ok: false, text: (e as Error).message });
    }
  }

  async function copy() {
    try {
      const { markdown } = await fetched();
      // Denied over plain http and inside some embeddings. That is a failure of
      // the action and it says so, rather than looking like a copy that worked.
      await navigator.clipboard.writeText(markdown);
      setSaid({ ok: true, text: 'Conversation copied as Markdown' });
    } catch (e) {
      setSaid({
        ok: false,
        text: e instanceof Error && e.message.startsWith('Assay')
          ? e.message
          : 'The browser would not give up the clipboard.',
      });
    }
  }

  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          aria-label="Export this conversation"
          className={actionVariants({ variant: 'quiet', className })}
        >
          <Download size={13} strokeWidth={1.5} aria-hidden />
          Export as Markdown
          <ChevronDown size={12} strokeWidth={1.5} aria-hidden />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner sideOffset={6} align="end" className="z-50">
            <Menu.Popup className="motion-popup w-[220px] rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-card)] p-[3px] shadow-elevation-floating">
              {/* No `focus-ring`: Base UI's own `data-highlighted` draws the
                  keyboard position, and a second indicator inside a 3px-padded
                  popup would say the same thing twice and be clipped saying it.
                  Same reasoning as `filter-menu.tsx`. */}
              <Item icon={Download} onClick={download}>Download as Markdown</Item>
              <Item icon={ClipboardCopy} onClick={copy}>Copy Markdown</Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      {said && <Toast variant={said.ok ? 'default' : 'error'} message={said.text} />}
    </>
  );
}

function Item({
  icon: Icon, onClick, children,
}: {
  icon: typeof Download; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <Menu.Item
      onClick={onClick}
      className="meta-12_5 flex cursor-pointer items-center gap-[10px] rounded-[6px] px-[12px] py-[8px] text-[var(--text-secondary)] outline-none data-highlighted:bg-[var(--surface-subtle)]"
    >
      <Icon size={13} strokeWidth={1.5} className="shrink-0 text-[var(--text-muted)]" aria-hidden />
      {children}
    </Menu.Item>
  );
}

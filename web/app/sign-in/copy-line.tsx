'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { IconAlign } from './chrome';

/**
 * A pasteable line with a Copy button.
 *
 * `text` is the variable NAMES only -- see `envLines`. Nothing secret is ever
 * handed to a client component on this screen, so this cannot put one on a
 * clipboard either.
 */
export function CopyLine({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-start gap-[10px] rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-subtle)] px-[14px] py-[12px]">
      <pre className="mono-value-12_5 flex-1 whitespace-pre text-[var(--text-primary)]">{text}</pre>
      <button
        type="button"
        aria-label={copied ? 'Copied' : 'Copy'}
        // A rejected clipboard write leaves the label alone: claiming "Copied"
        // when nothing was copied is the small version of the lie this whole
        // screen exists to avoid.
        onClick={() => {
          navigator.clipboard
            .writeText(text)
            .then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
            .catch(() => {});
        }}
        className="shrink-0"
      >
        <IconAlign size={12.5}>
          {copied ? (
            <Check size={16} strokeWidth={1.5} className="text-[var(--semantic-success)]" aria-hidden />
          ) : (
            <Copy size={16} strokeWidth={1.5} className="text-[var(--text-secondary)]" aria-hidden />
          )}
        </IconAlign>
      </button>
    </div>
  );
}

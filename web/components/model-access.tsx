'use client';

import { useState } from 'react';
import { Check, KeyRound, Terminal } from 'lucide-react';
import { Copy } from './copy';

/**
 * Which credential the model path is using, and how to give it one.
 *
 * There is no "Sign in with Claude" here, and that is deliberate rather than
 * unfinished. Assay implements no login: no client id, no redirect, no token
 * exchange, nothing stored. The subscription route is Anthropic's own CLI --
 * the operator runs `claude setup-token` in their terminal, which opens their
 * browser and prints a token they put in their environment. Assay then reads
 * that variable exactly as it reads the API key.
 *
 * That boundary is the SDK quickstart's: third-party products may not offer
 * claude.ai login, and must use the API key methods for anything other people
 * use. A single operator authenticating their own machine with Anthropic's own
 * tool is not Assay offering anyone a login -- but a shared deployment should
 * use the API key, and the copy says so.
 *
 * A browser button cannot drive the operator's terminal, so "connect" is the
 * command, copyable, rather than a link that could not work.
 */
export type ModelAuth = 'api-key' | 'subscription' | 'none';

const SETUP = 'claude setup-token';

export function ModelAccess({ auth }: { auth: ModelAuth }) {
  const [open, setOpen] = useState(false);

  if (auth !== 'none') {
    return (
      <div className="flex items-center gap-[10px]">
        <Check size={15} strokeWidth={1.5} className="text-[var(--semantic-success)]" aria-hidden />
        <span className="body-13_5 text-[var(--text-primary)]">
          {auth === 'api-key' ? 'Connected with an API key' : 'Connected with a Claude subscription'}
        </span>
        <span className="meta-12_5 text-[var(--text-muted)]">
          {auth === 'api-key' ? 'ANTHROPIC_API_KEY' : 'CLAUDE_CODE_OAUTH_TOKEN'} is set
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[12px]">
      <div className="flex items-center gap-[12px]">
        <span className="body-13_5 text-[var(--text-secondary)]">
          No model configured. Assay runs without one; field discovery is off.
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-[8px] rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-card)] py-[7px] pl-[12px] pr-[14px] hover:bg-[var(--surface-subtle)]"
        >
          <KeyRound size={15} strokeWidth={1.5} className="text-[var(--text-primary)]" aria-hidden />
          <span className="meta-12_5 text-[var(--text-primary)]">Connect a model</span>
        </button>
      </div>

      {/* 0fr -> 1fr so the panel animates without a measured height. */}
      <div className={`grid transition-[grid-template-rows] duration-200 ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="flex flex-col gap-[16px] rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-subtle)] p-[16px]">
            <div className="flex flex-col gap-[6px]">
              <p className="flex items-center gap-[8px]">
                <Terminal size={14} strokeWidth={1.5} className="text-[var(--text-primary)]" aria-hidden />
                <span className="body-14 text-[var(--text-primary)]">On your own machine, with a Claude subscription</span>
              </p>
              <p className="meta-12_5 text-[var(--text-secondary)]">
                Run this in your terminal. It opens your browser to authorise, then prints a token.
                Put it in your environment as <span className="mono-value-12_5">CLAUDE_CODE_OAUTH_TOKEN</span> and
                this panel will say connected.
              </p>
              <Copy text={SETUP} receipt="Command copied" className="mt-[4px] self-start rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[12px] py-[7px] text-left hover:bg-[var(--surface-subtle)]">
                <span className="mono-value-12_5 text-[var(--text-primary)]">{SETUP}</span>
              </Copy>
            </div>

            <div className="h-px w-full bg-[var(--border-hairline)]" />

            <div className="flex flex-col gap-[6px]">
              <p className="flex items-center gap-[8px]">
                <KeyRound size={14} strokeWidth={1.5} className="text-[var(--text-primary)]" aria-hidden />
                <span className="body-14 text-[var(--text-primary)]">On a deployment other people use</span>
              </p>
              <p className="meta-12_5 text-[var(--text-secondary)]">
                Use an API key from the Claude Console. The Agent SDK is explicit that a
                subscription login is not for products other people sign in to.
              </p>
              <Copy text="ANTHROPIC_API_KEY=" receipt="Line copied" className="mt-[4px] self-start rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[12px] py-[7px] text-left hover:bg-[var(--surface-subtle)]">
                <span className="mono-value-12_5 text-[var(--text-primary)]">ANTHROPIC_API_KEY=</span>
              </Copy>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

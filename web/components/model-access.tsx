'use client';

import { useState, useTransition } from 'react';
import { Check, KeyRound, RefreshCw, Terminal } from 'lucide-react';
import { Copy } from './copy';
import { Working } from './loading';
import { recheckModelAccess } from '@/app/(app)/settings/actions';

/**
 * Which credential the model path is using, and how to give it one.
 *
 * There is no "Sign in with Claude" here, and that is deliberate rather than
 * unfinished. Assay implements no login: no client id, no redirect, no token
 * exchange, nothing stored. The subscription route is Anthropic's own CLI --
 * the operator runs `claude setup-token` in their terminal, which opens their
 * browser and prints a token they put in their environment. Assay then reads
 * that variable exactly as it reads the API key. The third route is that same
 * CLI's own credential store, which the SDK falls back to on its own; Assay
 * asks `claude auth status` whether it has a login and never opens the store.
 *
 * That boundary is the SDK quickstart's: third-party products may not offer
 * claude.ai login, and must use the API key methods for anything other people
 * use. A single operator authenticating their own machine with Anthropic's own
 * tool is not Assay offering anyone a login -- but a shared deployment should
 * use the API key, and the copy says so.
 *
 * A browser button cannot drive the operator's terminal, so "connect" is the
 * command, copyable, rather than a link that could not work. What the browser
 * CAN do is ask again, which is what Check again is for -- and it is not
 * decoration. Two of the three routes need it: a variable exported in a shell
 * after the server started is invisible to the running process, and the CLI
 * probe is cached because it costs seconds. So the panel that says "no model"
 * has to offer a way to be wrong about that.
 *
 * The type is restated rather than imported. `src/ai/model.ts` pulls in the
 * Agent SDK and Node built-ins, and this file is a client component; the
 * server action is the only thing it imports from that side of the line.
 */
export type ModelAuth = 'api-key' | 'subscription' | 'cli' | 'none';

const SETUP = 'claude setup-token';

/** Which route, said the way the operator would say it. */
const CONNECTED: Record<Exclude<ModelAuth, 'none'>, [string, string]> = {
  'api-key': ['Connected with an API key', 'ANTHROPIC_API_KEY is set'],
  subscription: ['Connected with a Claude subscription', 'CLAUDE_CODE_OAUTH_TOKEN is set'],
  cli: ['Connected through Claude Code on this machine', 'the claude CLI is signed in · no variable needed'],
};

export function ModelAccess({ auth: initial }: { auth: ModelAuth }) {
  const [open, setOpen] = useState(false);
  const [auth, setAuth] = useState(initial);
  // Only after a check that came back empty. Before that, "restart the server"
  // is advice for a problem nobody has yet.
  const [checkedEmpty, setCheckedEmpty] = useState(false);
  const [pending, start] = useTransition();

  const check = () =>
    start(async () => {
      const next = await recheckModelAccess();
      setAuth(next);
      setCheckedEmpty(next === 'none');
    });

  const again = (
    <button
      type="button"
      onClick={check}
      disabled={pending}
      className="flex shrink-0 items-center gap-[7px] rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-card)] py-[7px] pl-[11px] pr-[13px] hover:bg-[var(--surface-subtle)] disabled:opacity-50"
    >
      <RefreshCw size={14} strokeWidth={1.5} className="text-[var(--text-primary)]" aria-hidden />
      <span className="meta-12_5 text-[var(--text-primary)]">Check again</span>
    </button>
  );

  if (auth !== 'none') {
    const [line, note] = CONNECTED[auth];
    return (
      <div className="flex items-center gap-[10px]">
        {pending ? (
          <Working>Checking</Working>
        ) : (
          <>
            <Check size={15} strokeWidth={1.5} className="text-[var(--semantic-success)]" aria-hidden />
            <span className="body-13_5 text-[var(--text-primary)]">{line}</span>
            <span className="meta-12_5 text-[var(--text-muted)]">{note}</span>
          </>
        )}
        <div className="pl-[6px]">{again}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[12px]">
      <div className="flex items-center gap-[12px]">
        {pending ? (
          <Working>Checking</Working>
        ) : (
          <span className="body-13_5 text-[var(--text-secondary)]">
            No model configured. Assay runs without one; field discovery is off.
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-[8px] rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-card)] py-[7px] pl-[12px] pr-[14px] hover:bg-[var(--surface-subtle)]"
        >
          <KeyRound size={15} strokeWidth={1.5} className="text-[var(--text-primary)]" aria-hidden />
          <span className="meta-12_5 text-[var(--text-primary)]">Connect a model</span>
        </button>
        {again}
      </div>

      {/*
        The honest half of Check again. If the operator did what the panel told
        them to and the panel still says no, the likeliest reason is not that
        they got it wrong: a variable exported in a shell after this server
        started is not in this server's environment and never will be. Saying
        "still nothing" and stopping there sends them round the loop again.
      */}
      {checkedEmpty && !pending && (
        <p className="meta-12_5 text-[var(--text-secondary)]">
          Still nothing. If you have just set{' '}
          <span className="mono-value-12_5">ANTHROPIC_API_KEY</span> or{' '}
          <span className="mono-value-12_5">CLAUDE_CODE_OAUTH_TOKEN</span> in a terminal, this
          server cannot see it: a process keeps the environment it started with. Restart Assay.
          Signing in to Claude Code does not have that problem — Check again finds it.
        </p>
      )}

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
                restart Assay. If you are already signed in to Claude Code here, there is nothing to
                paste and nothing to restart: press Check again.
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

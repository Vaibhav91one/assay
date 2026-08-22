'use client';

import { useState, useTransition } from 'react';
import { Check, KeyRound, RefreshCw, Terminal } from 'lucide-react';
import { Button, actionVariants } from './button';
import { Collapse } from './motion/collapse';
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
 * CAN do is ask again, which is what Check again is for.
 *
 * CHECK AGAIN EXISTS ONLY WHERE IT IS USEFUL, which is the unconfigured state.
 * There, the operator has just been told what to do and wants to know whether
 * it took: a variable exported in a shell after the server started is invisible
 * to the running process, and the CLI login is not. The button answers that.
 *
 * Beside a line that already reads "Connected", it answered nothing and cost
 * something -- a control next to a settled fact reads as doubt about the fact.
 * It is gone from that branch entirely, not merely quietened.
 *
 * WHAT THE BUTTON WAS COVERING, now handled where it belongs. A CLI login can
 * expire, and `cliLoggedIn()` caches the probe because it costs 3-5 seconds.
 * With no button, a cache that never expired would leave this panel saying
 * "Connected" until someone restarted the server -- a confidently wrong claim,
 * which is the one thing this product refuses everywhere else. So the cache in
 * `src/ai/model.ts` now has a TTL, and Settings renders this panel inside a
 * Suspense boundary so a re-probe streams in after paint instead of blocking
 * the page. The staleness window is the TTL, and it closes by itself.
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
    <Button variant="outline" onClick={check} loading={pending} icon={RefreshCw} iconSize={14}>
      Check again
    </Button>
  );

  // Connected: the line is the whole panel. No control -- there is nothing here
  // for the operator to do, and the freshness of this claim is the TTL's job
  // now, not a button's. See the header.
  if (auth !== 'none') {
    const [line, note] = CONNECTED[auth];
    return (
      <div className="flex items-center gap-[10px]">
        <Check size={15} strokeWidth={1.5} className="text-[var(--semantic-success)]" aria-hidden />
        <span className="body-13_5 text-[var(--text-primary)]">{line}</span>
        <span className="meta-12_5 text-[var(--text-muted)]">{note}</span>
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
        <Button onClick={() => setOpen((v) => !v)} aria-expanded={open} icon={KeyRound}>
          Connect a model
        </Button>
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

      {/* Was a hand-rolled 0fr -> 1fr grid with a `duration-200` of its own, which
          is the drift `docs/MOTION.md` was written to end. `Collapse` is the same
          trick on `--duration-expand`, and it marks closed content `inert` -- so a
          keyboard user can no longer tab into the two copy buttons in a panel
          nobody can see. */}
      <Collapse open={open}>
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
              <Copy
                text={SETUP}
                receipt="Command copied"
                className={actionVariants({ variant: 'chip', className: 'mt-[4px] self-start' })}
              >
                {SETUP}
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
              <Copy
                text="ANTHROPIC_API_KEY="
                receipt="Line copied"
                className={actionVariants({ variant: 'chip', className: 'mt-[4px] self-start' })}
              >
                ANTHROPIC_API_KEY=
              </Copy>
            </div>
        </div>
      </Collapse>
    </div>
  );
}

// The models the picker offers, in a form the browser can hold.
//
// WHY THIS IS NOT IMPORTED FROM THE ENGINE. `src/agent/index.ts` exports the
// authoritative `MODELS` allowlist, but importing it into a `'use client'`
// component would drag `@anthropic-ai/claude-agent-sdk` -- and the Node
// built-ins it opens -- into the browser bundle. That is the same failure
// `web/components/chrome.ts` exists to prevent, where a client import once
// pulled `pg` in and broke the build.
//
// So the ids are repeated here, and the repetition is checked rather than
// trusted: `test/chat-surface.test.ts` imports both and fails if this list and
// the engine's ever disagree. A picker offering a model the allowlist would
// reject is a control that silently does nothing, which is worse than no picker.
//
// Ids read off platform.claude.com/docs/en/about-claude/models/overview on
// 2026-08-22. From the 4.6 generation on a dateless id IS the pinned snapshot,
// which is why only Haiku 4.5 carries a date.

export interface ModelOption {
  id: string;
  /** What the picker shows. The id is shown underneath, so this stays short. */
  label: string;
}

export const MODELS: readonly ModelOption[] = [
  { id: 'claude-opus-5', label: 'Opus 5' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5' },
  { id: 'claude-fable-5', label: 'Fable 5' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
];

/**
 * The default the composer starts on.
 *
 * Opus per docs/STACK.md, which gives this surface the strongest model because
 * it is the one doing open-ended interpretation. It matches `DEFAULT_MODEL` in
 * `src/agent/index.ts`; the same test asserts they agree.
 */
export const DEFAULT_MODEL = 'claude-opus-5';

/**
 * The cadences the scheduler can act on, for the manual form's select.
 *
 * Repeated from `CADENCES` in `src/agent/index.ts` for the same bundling reason
 * as the model ids, and checked by the same test. A select offering a cadence
 * the worker cannot run is a control that fails on submit.
 */
export const CADENCE_OPTIONS = ['hourly', '6h', '12h', 'daily', 'weekly'] as const;

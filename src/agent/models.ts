// The chat agent's closed vocabularies: which models it will ask, and which
// cadences the scheduler can act on.
//
// WHY THIS IS A SEPARATE FILE FROM `./index.ts`, WHICH OWNS THE BEHAVIOUR.
//
// The browser needs these exact values -- a picker offering a model the
// allowlist would reject is a control that silently does nothing, and a select
// offering a cadence the worker cannot run is a control that fails on submit.
// But `./index.ts` imports `@anthropic-ai/claude-agent-sdk` and, through
// `../setup/index.js`, `pg`; a `'use client'` import of it drags `fs`, `dns`,
// `net` and `tls` into the browser bundle. That has broken the build twice --
// `web/components/chrome.ts` exists for the same reason.
//
// The values were briefly copied into `web/lib/models.ts` and kept honest by a
// drift test. This file is the better answer: a module that owns plain values
// and nothing else has no heavy import to leak, so both sides import it and
// there is no second copy to drift. IT MUST STAY IMPORT-FREE. Adding any import
// here re-creates the problem the copy was working around.
//
// `./index.ts` re-exports everything below, so the engine's own callers are
// unaffected by where the declarations live.

/**
 * The cadences the agent may propose. A closed set, so the reply cannot invent
 * one, and it is what `z.enum(CADENCES)` in `./index.ts` is built from.
 *
 * NOT "the cadences the scheduler can act on" -- `cadenceMs` in
 * `src/schedule.ts` accepts any `<n>h` or `<n>d`, which is an open set with no
 * enum and no `<select>`. These five are a MENU drawn from it: what a model may
 * say, and what the manual form offers a human instead of a free-text box. The
 * two agree today because this list is a subset of what `cadenceMs` parses, and
 * `src/setup/index.ts` validates against `cadenceMs` rather than against this,
 * on purpose -- an operator posting `2d` to the API is not making a mistake.
 *
 * So: widen this and the scheduler still runs it. Do not narrow `cadenceMs` to
 * match this.
 */
export const CADENCES = ['hourly', '6h', '12h', 'daily', 'weekly'] as const;
export type Cadence = (typeof CADENCES)[number];

/**
 * The models a browser may ask for, as a closed set.
 *
 * A model id arriving from the browser is untrusted input on its way into
 * `query({ model })`. An allowlist is the whole guard: an unrecognised string is
 * not passed through and not corrected, it simply loses to the default. There is
 * no branch anywhere that can reach the SDK with a name this file does not
 * contain.
 *
 * `ASSAY_CHAT_MODEL` still wins where it is set, because an operator's
 * environment outranks a browser control -- and `src/ai/model.ts` reads
 * `ASSAY_MODEL` for the per-field path, which a browser cannot set and this does
 * not touch.
 *
 * Ids read off platform.claude.com/docs/en/about-claude/models/overview on
 * 2026-08-22, not from memory. Dateless ids from the 4.6 generation on ARE the
 * pinned snapshot -- see the `DEFAULT_MODEL` note below.
 */
export const MODELS = [
  'claude-opus-5',
  'claude-sonnet-5',
  'claude-fable-5',
  'claude-haiku-4-5-20251001',
] as const;
export type Model = (typeof MODELS)[number];

/**
 * What the picker shows for each id. The id is shown underneath it, so these
 * stay short.
 *
 * A `Record<Model, string>` rather than a second list: the type makes a new
 * entry in `MODELS` a compile error until it is named, which is the guarantee
 * the old drift test was buying at runtime.
 */
export const MODEL_LABEL: Record<Model, string> = {
  'claude-opus-5': 'Opus 5',
  'claude-sonnet-5': 'Sonnet 5',
  'claude-fable-5': 'Fable 5',
  'claude-haiku-4-5-20251001': 'Haiku 4.5',
};

/**
 * The model, absent an override. Opus tier per docs/STACK.md, which assigns
 * this surface the strongest model because it is the one doing open-ended
 * interpretation.
 *
 * `claude-opus-5` carries NO date suffix and that is not an omission: from the
 * 4.6 generation on, a dateless id IS the pinned snapshot rather than an
 * evergreen pointer, so appending a date would name a model that does not
 * exist. (Contrast `claude-haiku-4-5-20251001` in src/ai/model.ts, which is
 * pre-4.6 and genuinely an alias, so pinning the dated form there is stricter.)
 *
 * The `ASSAY_CHAT_MODEL` override is applied in `./index.ts`, not here: this
 * file is read by the browser, where there is no environment to read. The
 * composer starts on this id and the server decides what actually runs.
 */
export const DEFAULT_MODEL: Model = 'claude-opus-5';

/** Is this string one of the models above? Membership, never sanitisation. */
export const isModel = (m: unknown): m is Model => MODELS.includes(m as Model);

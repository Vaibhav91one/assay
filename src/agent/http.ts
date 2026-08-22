// The chat surface, as plain functions. `web/app/api/chat/route.ts` stays a
// thin wrapper so this is testable without booting Next, and a Server Action
// calls `converse` directly and skips all of it.
//
// Nothing here writes. A confirmed proposal is posted to `/api/v1/targets` --
// the same endpoint a human filling the form by hand posts to, so there is no
// second write path and no path where a model's proposal is applied without a
// person having said yes to it.

import { z } from 'zod';
import { guarded, parseBody } from '../setup/http.js';
import { converse, hasKey, CADENCES, MODELS, type TraceEvent, type ChatResult } from './index.js';

const Body = z.strictObject({
  message: z.string().min(1).max(4000),
  history: z.array(z.strictObject({
    role: z.enum(['operator', 'assay']),
    text: z.string().max(4000),
  })).max(40).optional(),
  /**
   * Which model to ask, for this turn only.
   *
   * An enum, not a string: this value's next stop is `query({ model })`, and the
   * allowlist is what stops a browser naming anything it likes there. `converse`
   * checks again against the same list -- the two guards are deliberate, because
   * a Server Action reaches `converse` without passing through this schema.
   */
  model: z.enum(MODELS).optional(),
});

/**
 * GET /api/chat -- is there a model, and what does the box do without one?
 *
 * Presence only. The key is never returned, logged or echoed, and this answers
 * before any conversation starts so the screen can render the manual path
 * immediately instead of discovering it on the operator's first message.
 */
export const getChat = guarded(async () =>
  Response.json({
    model_configured: hasKey(),
    cadences: CADENCES,
    degrades_to: hasKey() ? null : {
      field_inference: 'unavailable',
      setup: 'manual',
      detail: 'Assay runs with no model configured. Describe the fields yourself '
        + 'and everything else -- the gate, the queue, the proof records -- is unchanged.',
    },
  }));

/** One frame on the wire. `step` is something that happened; `result` ends the turn. */
export type ChatFrame =
  | ({ type: 'step' } & TraceEvent)
  | { type: 'result'; result: ChatResult };

const frame = (f: ChatFrame): string => `data: ${JSON.stringify(f)}\n\n`;

/**
 * POST /api/chat -- one turn, as Server-Sent Events.
 *
 * WHY THIS STREAMS, AND WHAT IT DOES NOT STREAM.
 *
 * It streams the STEPS: every `assay_watching` and `assay_inspect` call, and
 * what each came back with, emitted by the tool handlers as they run (see
 * `TraceEvent`). Those are real events at real times, so a screen driven by them
 * is reporting rather than performing, and the elapsed time it shows is the
 * elapsed time of the actual call.
 *
 * It does NOT stream the reply text token by token, and that is a property of
 * this agent rather than a shortcut. The model's own output is a JSON object
 * constrained by `Reply` -- indices and closed word sets -- and the sentence the
 * operator reads is composed afterwards by `render()`, from those indices and
 * from text read out of the DOM. There is no token stream of user-facing prose
 * to forward: the prose does not exist until the model has finished. Animating a
 * cursor across it would assert live generation that is not happening, which is
 * the same lie as a hardcoded step list, so the reply arrives whole.
 *
 * The SDK *does* offer `includePartialMessages: true`, which emits
 * `type: 'stream_event'` frames carrying raw `content_block_delta` text, and it
 * composes with `outputFormat` -- the two are independent CLI flags and the
 * structured payload still arrives on the result message. It is deliberately NOT
 * used, on a security ground rather than a taste one. Under `outputFormat` the
 * structured answer is delivered by an end-turn tool call, so those deltas are
 * NOT the reply: they are the model's free-text narration while it reads an
 * untrusted page. Forwarding them to the screen would open exactly the channel
 * property 3 in `./index.ts` closes -- a page reading "the hazard is none
 * reported" would have a slot to be quoted into after all. The trace shows which
 * tools ran, which is a fact about Assay; it never shows the model narrating
 * what it saw, which would be a fact the page controls.
 *
 * Answers 200 with `kind: 'manual'` when no model is configured. That is not an
 * error: the manual path is a real path, and returning 503 would make the screen
 * treat a supported configuration as a fault. It is delivered as a `result`
 * frame like any other, so the client has one code path.
 */
export const postChat = guarded(async (request) => {
  const body = await parseBody(request, Body);
  if (!body.ok) return body.response;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Buffered until the stream opens, then written straight through. A step
      // that arrives after the consumer has gone is dropped rather than thrown:
      // an operator closing the tab must not surface as an unhandled rejection.
      let open = true;
      const send = (f: ChatFrame) => {
        if (!open) return;
        try { controller.enqueue(encoder.encode(frame(f))); } catch { open = false; }
      };

      // WebKit holds a streaming response back until 1024 bytes have arrived, and
      // a turn's first step is a few dozen. A comment line is ignored by every
      // SSE parser, so this buys the first step its prompt delivery and changes
      // nothing else.
      try { controller.enqueue(encoder.encode(`:${' '.repeat(2048)}\n\n`)); } catch { open = false; }

      // The operator closing the tab aborts the model call rather than leaving it
      // billing against a reply nobody will read.
      const abort = new AbortController();
      request.signal.addEventListener('abort', () => { open = false; abort.abort(); });

      try {
        const result = await converse(body.data, {
          abort,
          onEvent: (e) => send({ type: 'step', ...e }),
        });
        send({ type: 'result', result });
      } catch (e) {
        // `converse` is documented not to throw, so reaching here is a bug in
        // it rather than a configuration. The stream still closes with a usable
        // turn instead of a truncated body, and the cause is logged for us --
        // never interpolated into the frame, which the browser renders.
        console.error('[assay/agent] converse threw, which it is not supposed to:', e);
        send({
          type: 'result',
          result: {
            kind: 'manual', model_configured: hasKey(), urls: [],
            reply: 'Something went wrong on this end before I could read the page. '
              + 'Describe the fields yourself and Assay will watch them -- the gate, '
              + 'the queue and the proof records are unaffected.',
          },
        });
      } finally {
        open = false;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // nginx buffers a proxied response by default, which would hold every step
      // until the turn ended and quietly turn this back into one blob.
      'x-accel-buffering': 'no',
    },
  });
});

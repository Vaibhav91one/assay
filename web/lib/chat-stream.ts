// Reading one turn off `POST /api/chat`.
//
// The types come from the engine with `import type`, which TypeScript erases:
// no runtime import, so the Agent SDK and the Node built-ins it opens stay out
// of the browser bundle. That is the same hazard `web/components/chrome.ts`
// documents, avoided by never emitting an import rather than by duplicating a
// shape here and letting the two drift.

import type { TraceEvent, ChatResult } from 'assay/engine/agent/index';
import type { ChatFrame } from 'assay/engine/agent/http';

export type { TraceEvent, ChatResult, ChatFrame };

/**
 * Parse an SSE body into frames.
 *
 * Written as an async generator over the reader rather than `EventSource`,
 * because this is a POST with a body and `EventSource` can only GET.
 *
 * Two things it does NOT do. It does not trust a chunk to be a whole event --
 * `read()` splits wherever the network did, so the tail is carried forward until
 * a blank line completes a frame. And it does not throw on a frame it cannot
 * parse: a truncated final event on a dropped connection is a real thing that
 * happens, and dropping it is better than failing a turn that otherwise arrived.
 */
export async function* frames(body: ReadableStream<Uint8Array>): AsyncGenerator<ChatFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Events are separated by a blank line. Everything after the last one is
      // an incomplete frame and stays in the buffer.
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';

      for (const part of parts) {
        for (const line of part.split('\n')) {
          // `:` opens a comment. The route sends one to defeat WebKit's 1024-byte
          // buffer, and a parser that did not skip it would try to parse padding.
          if (!line.startsWith('data:')) continue;
          const json = line.slice(5).trim();
          if (!json) continue;
          try {
            yield JSON.parse(json) as ChatFrame;
          } catch {
            // A frame we cannot read is one we do not act on. Never a guess.
          }
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

export interface TurnRequest {
  message: string;
  history: { role: 'operator' | 'assay'; text: string }[];
  model: string;
}

/**
 * One turn, with the steps delivered as they happen.
 *
 * `onStep` is called for every real event; the promise resolves with the turn's
 * result. A stream that ends without a result frame resolves to null, which the
 * caller renders as the turn not having landed -- never as an empty proposal.
 */
export async function turn(
  req: TurnRequest,
  onStep: (e: TraceEvent) => void,
  signal?: AbortSignal,
): Promise<ChatResult | null> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  });

  if (!res.ok || !res.body) return null;

  let result: ChatResult | null = null;
  for await (const f of frames(res.body)) {
    if (f.type === 'step') {
      const { type: _drop, ...event } = f;
      onStep(event as TraceEvent);
    } else if (f.type === 'result') {
      result = f.result;
    }
  }
  return result;
}

// `annotateCapture` is what stands between a stored capture and the
// `<iframe sandbox="allow-same-origin">` (no `allow-scripts`) it's served
// into. The sandbox is the primary guard; this is the second one, so it is
// tested directly rather than only through the route that calls it.

import { describe, it, expect } from 'vitest';
import { annotateCapture } from '../src/store/captures.js';

describe('annotateCapture', () => {
  it('strips every script tag', () => {
    const html = '<html><body><script>alert(1)</script><h2 class="title">Recall</h2></body></html>';
    expect(annotateCapture(html, [])).not.toContain('<script');
  });

  it('strips on* event handler attributes', () => {
    const html = '<html><body><button onclick="alert(1)">x</button></body></html>';
    const out = annotateCapture(html, []);
    expect(out).not.toContain('onclick');
  });

  it('strips javascript: hrefs', () => {
    const html = '<html><body><a href="javascript:alert(1)">x</a></body></html>';
    const out = annotateCapture(html, []);
    expect(out).not.toContain('javascript:');
  });

  it('boxes every element a candidate selector matches, with its label', () => {
    const html = '<html><body><h2 class="title">A</h2><h2 class="title">B</h2></body></html>';
    const out = annotateCapture(html, [{ selector: 'h2.title', label: 'Best match' }]);
    expect(out).toContain('Best match');
    // Both matches boxed, not just the first -- a stale selector on an old
    // capture routinely matches more than one element, and picking one would
    // be a guess this function has no basis for making.
    expect((out.match(/Best match/g) ?? []).length).toBe(2);
  });

  it('is a normal, non-throwing state when a selector matches nothing', () => {
    const html = '<html><body><p>gone</p></body></html>';
    expect(() => annotateCapture(html, [{ selector: 'h2.title', label: 'Best match' }])).not.toThrow();
  });

  it('leaves ordinary markup and text alone', () => {
    const html = '<html><body><h2 class="title">Contoso recalls the widget</h2></body></html>';
    const out = annotateCapture(html, []);
    expect(out).toContain('Contoso recalls the widget');
  });
});

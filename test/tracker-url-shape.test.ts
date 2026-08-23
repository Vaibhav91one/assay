// A tracker refuses the page its priors cannot read.
//
// The defect this pins was found by walking the product for a demo recording,
// not by a test: pasting `https://github.com/facebook/react` into the GitHub
// tracker proposed `.claude` as the latest release. `.claude` is a directory in
// the repository's file browser.
//
// The prior was not wrong. `Link--primary` IS the release title on a releases
// page; it is also the class GitHub puts on file-browser links on a repository
// root, and nothing in the flow said which of the two pages the tracker wanted.
// The placeholder showed a `/releases` url, and a placeholder is a suggestion.
//
// That is a confidently wrong value on the happiest path in the product, which
// is the failure this whole project exists to refuse -- so the fix is to refuse
// the url, not to widen the prior until it guesses better.

import { describe, expect, it } from 'vitest';
import { TRACKERS, trackerById, urlComplaint } from '../src/library/index.js';

const github = () => {
  const t = trackerById('github');
  if (!t) throw new Error('the github tracker is gone');
  return t;
};

describe('a tracker states the page shape its priors were written against', () => {
  it('refuses a repository root, which is where .claude came from', () => {
    const complaint = urlComplaint(github(), 'https://github.com/facebook/react');
    expect(complaint).not.toBeNull();
    // The operator is told what to paste, not what the regex did.
    expect(complaint).toMatch(/releases/i);
  });

  it('accepts the releases page, with or without a trailing slash or query', () => {
    for (const url of [
      'https://github.com/nodejs/node/releases',
      'https://github.com/nodejs/node/releases/',
      'https://www.github.com/facebook/react/releases?page=2',
      'https://github.com/facebook/react/releases/tag/v18.3.1',
    ]) {
      expect(urlComplaint(github(), url), url).toBeNull();
    }
  });

  it('refuses a url that merely contains the word releases somewhere', () => {
    // `/releases` has to be the repository's own path segment. A repo NAMED
    // releases, or a query string mentioning it, is a different page.
    expect(urlComplaint(github(), 'https://github.com/facebook/react?tab=releases')).not.toBeNull();
    expect(urlComplaint(github(), 'https://example.com/github.com/x/y/releases')).not.toBeNull();
  });

  it('leaves every tracker without a declared shape alone', () => {
    // `expects` is opt-in. A tracker that has not declared one must accept any
    // url, or adding the field would have silently narrowed the whole library.
    for (const t of TRACKERS) {
      if (t.expects) continue;
      expect(urlComplaint(t, 'https://example.com/anything'), t.id).toBeNull();
    }
  });

  it('compiles every declared pattern, so a bad one fails here and not in a server action', () => {
    for (const t of TRACKERS) {
      if (!t.expects) continue;
      expect(() => new RegExp(t.expects!.pattern, t.expects!.flags), t.id).not.toThrow();
      expect(t.expects.hint.length, t.id).toBeGreaterThan(10);
    }
  });
});

// The JSON-to-DOM adapter, and the four properties the design rests on.
//
// Determinism is first because it is load-bearing rather than tidy: `ingestPage`
// skips a run whose page digest matches the last one, so a renderer that emitted
// different bytes for the same record would make every run look like a change
// and put a real change in the same bucket as a reordering.
//
// The last group is the one that matters most and the one that could have gone
// the other way. `docs/DEV-OWNERSHIP.md` calls the engine frozen and this
// feature never touches it; the claim being made is that a renamed JSON key is
// findable again for the same reasons a moved DOM element is. That claim is
// checked here against the real scorer, not asserted.

import { describe, expect, it } from 'vitest';
import { load } from 'cheerio';
import { recordToHtml, keySelector, keyClass, isRecord } from '../src/connectors/record.js';
import { fingerprint, isVolatileClass } from '../src/fingerprint.js';
import { candidatesOn } from '../src/agent/index.js';
import { heal } from '../src/heal.js';

/** The documented Instagram profile record, from the quickstart page cited in
 *  `src/connectors/scrapers.ts`. Used rather than something invented so the
 *  shapes under test are shapes Bright Data actually sends. */
const IG = {
  user_name: 'instagram',
  full_name: 'Instagram',
  biography: 'Discover what’s new on Instagram 🔎',
  followers: 676000000,
  following: 500,
  posts_count: 7800,
  is_verified: true,
  url: 'https://www.instagram.com/instagram',
};

const $of = (html: string) => load(html);
const textAt = (html: string, key: string): string | null => {
  const el = $of(html)(keySelector(key));
  return el.length ? el.text() : null;
};

describe('recordToHtml is deterministic', () => {
  it('renders the same record to the same bytes, repeatedly', () => {
    const first = recordToHtml(IG);
    for (let i = 0; i < 20; i++) expect(recordToHtml(IG)).toBe(first);
  });

  it('does not depend on the order the keys were inserted in', () => {
    const forwards: Record<string, unknown> = {};
    for (const k of Object.keys(IG)) forwards[k] = (IG as Record<string, unknown>)[k];
    const backwards: Record<string, unknown> = {};
    for (const k of Object.keys(IG).reverse()) backwards[k] = (IG as Record<string, unknown>)[k];

    // Same keys, same values, opposite insertion order. A vendor is under no
    // obligation to serialise an object the same way twice.
    expect(recordToHtml(backwards)).toBe(recordToHtml(forwards));
  });

  it('sorts nested keys too, at every level', () => {
    const a = { z: { b: 1, a: 2 }, y: [{ q: 1, p: 2 }] };
    const b = { y: [{ p: 2, q: 1 }], z: { a: 2, b: 1 } };
    expect(recordToHtml(a)).toBe(recordToHtml(b));
  });

  it('survives a round trip through JSON, which is how it really arrives', () => {
    expect(recordToHtml(JSON.parse(JSON.stringify(IG)) as Record<string, unknown>))
      .toBe(recordToHtml(IG));
  });
});

describe('values keep their type and their text', () => {
  it('renders a large integer as its digits, not as a formatted number', () => {
    expect(textAt(recordToHtml(IG), 'followers')).toBe('676000000');
  });

  it('renders a boolean as its literal', () => {
    expect(textAt(recordToHtml(IG), 'is_verified')).toBe('true');
  });

  it('renders null as null rather than dropping the key', () => {
    // An absence is an absence. A dropped key would be indistinguishable from a
    // key the vendor stopped sending, which is the whole failure this product
    // refuses -- see CONTRIBUTING.md, "no silent fallback".
    expect(textAt(recordToHtml({ bio: null }), 'bio')).toBe('null');
  });

  it('renders an empty object and an empty array as leaves, not as nothing', () => {
    const html = recordToHtml({ tags: [], meta: {} });
    expect(textAt(html, 'tags')).toBe('[]');
    expect(textAt(html, 'meta')).toBe('{}');
  });

  it('keeps unicode and emoji exactly as sent', () => {
    expect(textAt(recordToHtml(IG), 'biography')).toBe(IG.biography);
  });
});

describe('vendor output cannot break the document', () => {
  const HOSTILE = '</dd></dl></body><script>alert(1)</script><dd class="k-followers">0';

  it('escapes a value that closes tags', () => {
    const html = recordToHtml({ bio: HOSTILE, followers: 676000000 });
    // The whole hostile string is the value of `bio` and nothing else.
    expect(textAt(html, 'bio')).toBe(HOSTILE);
    // And it did not become a second element claiming to be the followers count.
    expect($of(html)('dd').length).toBe(2);
    expect(textAt(html, 'followers')).toBe('676000000');
  });

  it('escapes a value that closes an attribute', () => {
    const html = recordToHtml({ bio: '" data-key="followers' });
    expect(textAt(html, 'bio')).toBe('" data-key="followers');
    expect($of(html)('[data-key="followers"]').length).toBe(0);
  });

  it('escapes a KEY that closes tags', () => {
    // Keys are vendor output too. An earlier version escaped only values.
    const html = recordToHtml({ '<img src=x>': 1 });
    expect($of(html)('img').length).toBe(0);
  });

  it('escapes an ampersand without double-escaping the rest', () => {
    expect(textAt(recordToHtml({ a: 'Tom & <Jerry>' }), 'a')).toBe('Tom & <Jerry>');
  });
});

describe('nesting flattens to addressable leaves', () => {
  // The LinkedIn example record from the quickstart: `current_company` is an
  // object, and its `name` is one of the things worth watching.
  const LI = {
    name: 'Satya Nadella',
    city: 'Redmond, Washington',
    current_company: { name: 'Microsoft', link: 'https://www.linkedin.com/company/microsoft' },
    followers: 11000000,
  };

  it('addresses a nested leaf by its dotted path', () => {
    expect(textAt(recordToHtml(LI), 'current_company.name')).toBe('Microsoft');
  });

  it('addresses an array element by its index', () => {
    const html = recordToHtml({ posts: ['first post', 'second post'] });
    expect(textAt(html, 'posts.0')).toBe('first post');
    expect(textAt(html, 'posts.1')).toBe('second post');
  });

  it('keeps every leaf at the same depth whatever the object did above it', () => {
    const html = recordToHtml({ a: 1, b: { c: { d: 2 } } });
    const $ = $of(html);
    const depths = $('dd').toArray().map((el) => fingerprint($, el).depth);
    expect(new Set(depths).size).toBe(1);
  });

  it('does not renumber a sibling when a key is added in the middle', () => {
    // The requirement in full: adding `m` between `a` and `z` must leave `z`'s
    // own identity alone. Each entry is its own container, so `sibling_index`
    // and `parent_tag` do not move -- and the per-entry id keeps `id_xpath`
    // fixed even though `abs_xpath`, which is positional by definition, shifts.
    const before = recordToHtml({ a: 'one', z: 'three' });
    const after = recordToHtml({ a: 'one', m: 'two', z: 'three' });

    const fpOf = (html: string) => {
      const $ = load(html);
      return fingerprint($, $(keySelector('z'))[0]!);
    };
    const b = fpOf(before);
    const a = fpOf(after);

    expect(a.sibling_index).toBe(b.sibling_index);
    expect(a.parent_tag).toBe(b.parent_tag);
    expect(a.depth).toBe(b.depth);
    expect(a.classes_stable).toEqual(b.classes_stable);
    expect(a.id_xpath).toBe(b.id_xpath);
    expect(a.neighbor_text).toBe(b.neighbor_text);
  });

  it('reports an array insertion as the move it really is', () => {
    // Position is the only identity an array element has, so this SHOULD shift.
    // Asserted so the asymmetry with the object case is deliberate and visible.
    const before = recordToHtml({ posts: ['a post', 'another post'] });
    const after = recordToHtml({ posts: ['new post', 'a post', 'another post'] });
    expect(textAt(before, 'posts.0')).toBe('a post');
    expect(textAt(after, 'posts.0')).toBe('new post');
  });
});

describe('the class a key is given survives the fingerprint', () => {
  it('is never judged volatile, even for keys with digits in them', () => {
    for (const k of [
      'followers', 'posts_count', 'current_company.name', 'address2line',
      'followers_30d', 'x1m1sl8e', 'top10', 'a1b2c3d4', 'utm_source_id_2026',
    ]) {
      expect(isVolatileClass(keyClass(k)), k).toBe(false);
    }
  });

  it('leaves the resolver selective rather than a bare tag', () => {
    // If the class were dropped as volatile, `resolverFor` would build `dd`,
    // which matches every value in the document -- and `pickTarget` is
    // first-match, so the operator would silently watch the wrong key.
    const $ = $of(recordToHtml(IG));
    for (const el of $('dd').toArray()) {
      const fp = fingerprint($, el);
      expect(fp.classes_stable, String(fp.id)).toHaveLength(1);
    }
  });

  it('gives two paths that slug alike distinct ids', () => {
    const html = recordToHtml({ 'a.b': 1, a_b: 2, 'a-b': 3 });
    const ids = $of(html)('dd').toArray().map((el) => el.attribs.id);
    expect(new Set(ids).size).toBe(3);
    // And `keySelector` still addresses each one exactly, because it reads the
    // path as the vendor sent it rather than the slug.
    expect(textAt(html, 'a.b')).toBe('1');
    expect(textAt(html, 'a_b')).toBe('2');
    expect(textAt(html, 'a-b')).toBe('3');
  });
});

describe('keySelector addresses exactly one leaf', () => {
  it('finds each documented key and no other', () => {
    const html = recordToHtml(IG);
    for (const k of Object.keys(IG)) expect($of(html)(keySelector(k)).length, k).toBe(1);
  });

  it('does not match a key that merely has this one as a prefix', () => {
    const html = recordToHtml({ followers: 1, followers_count: 2 });
    expect(textAt(html, 'followers')).toBe('1');
  });

  it('escapes a quote in the key rather than producing a broken selector', () => {
    const html = recordToHtml({ 'a"b': 7 });
    expect(textAt(html, 'a"b')).toBe('7');
  });
});

describe('a renamed key is a scoreable candidate', () => {
  // THE CLAIM UNDER TEST, and the one worth disproving: the engine is a DOM
  // engine and this feature never modifies it. If a renamed key did not give
  // `heal` enough signal to score, the whole design would be wrong -- so this
  // runs the real scorer over the real rendered documents.
  const baselineHtml = recordToHtml(IG);
  const $b = load(baselineHtml);
  const before = fingerprint($b, $b(keySelector('followers'))[0]!);
  const { followers, ...rest } = IG;

  it('finds the renamed key, and finds the right one', () => {
    const $a = load(recordToHtml({ ...rest, follower_count: followers }));

    const r = heal($a, before);
    expect(r).not.toBeNull();
    // The VALUE is what the operator gets published. Getting this wrong is the
    // failure this repo measures, so it is asserted before anything about score.
    expect(r!.fingerprint.text).toBe('676000000');
    // Not asserting an absolute number: tau and delta are fitted to the recall
    // corpus and docs/LIMITATIONS.md 5 says there is no evidence they transfer.
    // What is asserted is that the right element wins, and wins clearly.
    expect(r!.margin).not.toBeNull();
    expect(r!.margin!).toBeGreaterThan(0);
  });

  it('thins the margin when a plausible second candidate appears', () => {
    // `followers_total` added BESIDE the renamed key, holding the same number.
    // Two readings, neither obviously right. The margin must collapse -- that
    // collapse is what the gate turns into an abstention, and it is the
    // product's entire argument obtained without a line of code that knows what
    // a JSON key is.
    const clean = load(recordToHtml({ ...rest, follower_count: followers }));
    const decoyed = load(recordToHtml({ ...rest, follower_count: followers, followers_total: followers }));

    const a = heal(clean, before);
    const b = heal(decoyed, before);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(b!.margin!).toBeLessThan(a!.margin!);
  });

  it('leaves the value visible to the candidate enumerator', () => {
    // `candidatesOn` ignores text outside 2..200 characters, so a field is
    // proposable exactly when the engine could see it. Asserted rather than
    // assumed, because it is the limit `src/connectors/record.ts` documents.
    const texts = candidatesOn(baselineHtml, 1500).map((c) => c.text);
    expect(texts).toContain('676000000');
    expect(texts).toContain('instagram');
  });
});

describe('isRecord refuses what would ingest as an empty page', () => {
  it('accepts a populated object and nothing else', () => {
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord({})).toBe(false);
    expect(isRecord([{ a: 1 }])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord('html')).toBe(false);
  });
});

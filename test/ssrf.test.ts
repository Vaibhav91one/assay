// The fetch seam will not open a connection to the machine it runs on.
//
// `fetchHtml` takes a url the OPERATOR typed -- into the chat, into the tracker
// library's paste-a-link box, into the describe-fields form -- and opens it from
// the SERVER. On a self-hosted box that is nothing: the operator already owns
// the machine. On a hosted instance it is the operator asking the server to make
// a request as itself, and `http://169.254.169.254/` is a cloud instance's
// credentials handed back through a proposal.
//
// NO NETWORK IS USED BY ANY TEST HERE. Every address is either a literal, or
// `localhost`, which resolves through the hosts file. That matters: a guard
// whose test needs the internet is a guard that gets skipped in CI.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { fetchHtml } from '../src/skills/page.js';

afterEach(() => vi.unstubAllGlobals());

/** Fail loudly if the guard lets a request through. Nothing here should fetch. */
const noRequests = () =>
  vi.stubGlobal('fetch', () => {
    throw new Error('the guard was supposed to refuse before opening anything');
  });

describe('refuses an address on this machine or its network', () => {
  // One case per range the guard names. The IPv6 forms are here because they are
  // how you smuggle 127.0.0.1 past a check that looks at the string.
  const blocked: [string, RegExp][] = [
    ['http://127.0.0.1:8080/admin', /loopback/],
    ['http://127.1/', /loopback/],
    ['http://[::1]:3000/', /loopback/],
    ['http://[::ffff:127.0.0.1]/', /loopback/],
    ['http://169.254.169.254/latest/meta-data/', /link-local|metadata/],
    ['http://[fe80::1]/', /link-local/],
    ['http://10.0.0.5/internal', /private network/],
    ['http://172.16.31.9/', /private network/],
    ['http://192.168.1.1/', /private network/],
    ['http://[fd00::1]/', /unique-local/],
    ['http://0.0.0.0/', /this host/],
    ['http://100.64.0.1/', /carrier-grade/],
    ['http://255.255.255.255/', /multicast or reserved/],
  ];

  it.each(blocked)('%s', async (url, why) => {
    noRequests();
    await expect(fetchHtml(url, [])).rejects.toThrow(why);
  });

  it('resolves the NAME, not the string -- localhost is 127.0.0.1', async () => {
    // The whole point of the guard. `localhost` contains no digits a regex could
    // catch, and it is the server.
    noRequests();
    await expect(fetchHtml('http://localhost:3000/', [])).rejects.toThrow(/loopback/);
  });

  it('says which address it refused and why, in a sentence', async () => {
    noRequests();
    const err = await fetchHtml('http://localhost:3000/', []).then(() => null, (e: Error) => e);
    expect(err, 'the fetch was supposed to be refused').not.toBeNull();
    // An operator reading this has to be able to tell it apart from the site
    // being down: the name, the address behind it, and the range are all named.
    expect(err!.message).toContain('localhost');
    // Whichever of the two loopback addresses this host answers with first --
    // `localhost` is ::1 on some machines and 127.0.0.1 on others, and the
    // message names the one actually resolved rather than a guess.
    expect(err!.message).toMatch(/resolves to (127\.0\.0\.1|::1)/);
    expect(err!.message).toMatch(/refusing to fetch/);
  });

  it('refuses a scheme that is not http or https', async () => {
    noRequests();
    await expect(fetchHtml('file:///etc/passwd', [])).rejects.toThrow(/only fetches http/);
  });

  it('does not offer a refused address to a connector instead', async () => {
    // A refusal is a decision, not a failure to be retried somewhere else. If
    // this ever falls through, the message an operator sees stops being the one
    // that explains anything.
    process.env.FIRECRAWL_API_KEY = 'sk-test';
    vi.stubGlobal('fetch', async () => {
      throw new Error('nothing, connector included, may be called for a refused address');
    });
    try {
      await expect(fetchHtml('http://169.254.169.254/', ['firecrawl']))
        .rejects.toThrow(/link-local|metadata/);
    } finally {
      delete process.env.FIRECRAWL_API_KEY;
    }
  });
});

describe('a public address still works', () => {
  it('fetches it, exactly as before', async () => {
    vi.stubGlobal('fetch', async () => new Response('<html><p>ok</p></html>', { status: 200 }));
    const { html, via } = await fetchHtml('http://93.184.216.34/', []);
    expect(via).toBe('local-fetch');
    expect(html).toContain('ok');
  });
});

describe('redirects are re-checked at every hop', () => {
  /** A stub that answers `chain` in order, then 200s. Records what was opened. */
  const chain = (locations: (string | null)[]) => {
    const opened: string[] = [];
    let i = 0;
    vi.stubGlobal('fetch', async (u: URL | string) => {
      opened.push(String(u));
      const next = locations[i++];
      if (next) return new Response(null, { status: 302, headers: { location: next } });
      return new Response('<html><p>arrived</p></html>', { status: 200 });
    });
    return opened;
  };

  it('refuses a public first hop that redirects to the metadata endpoint', async () => {
    // The bypass that makes checking only the first url worthless.
    const opened = chain(['http://169.254.169.254/latest/meta-data/']);
    await expect(fetchHtml('http://93.184.216.34/', [])).rejects.toThrow(/link-local|metadata/);
    // Hop one was opened; hop two never was.
    expect(opened).toEqual(['http://93.184.216.34/']);
  });

  it('refuses a redirect to a private address several hops in', async () => {
    const opened = chain([
      'http://93.184.216.34/a',
      'http://93.184.216.34/b',
      'http://10.1.2.3/secrets',
    ]);
    await expect(fetchHtml('http://93.184.216.34/', [])).rejects.toThrow(/private network/);
    expect(opened).toHaveLength(3);
  });

  it('follows an ordinary redirect chain and returns the page', async () => {
    chain(['http://93.184.216.34/a', null]);
    const { html } = await fetchHtml('http://93.184.216.34/', []);
    expect(html).toContain('arrived');
  });

  it('stops rather than following a redirect loop forever', async () => {
    chain(Array(50).fill('http://93.184.216.34/round-again'));
    await expect(fetchHtml('http://93.184.216.34/', [])).rejects.toThrow(/redirected more than/);
  });
});

describe('a refusal is not remembered', () => {
  // `pageCandidates` keeps a ten-minute per-url memory so a second turn about
  // the same page does not re-fetch it. A refused address must not enter it: a
  // cached "no candidates" would turn one refusal into ten minutes of the chat
  // calmly reporting that a page it never read has no fields on it, which is
  // the green-run-empty-column shape this product exists to refuse.
  it('refuses again on the next turn rather than serving a cached empty read', async () => {
    const { pageCandidates, forgetPages } = await import('../src/agent/index.js');
    forgetPages();
    noRequests();

    const read = async (u: string) => (await import('../src/agent/index.js'))
      .candidatesOn((await (await import('../src/skills/page.js')).fetchHtml(u)).html);

    await expect(pageCandidates('http://169.254.169.254/', read)).rejects.toThrow(/link-local/);
    // Second ask, same url. Still a refusal, and still the sentence that says why.
    await expect(pageCandidates('http://169.254.169.254/', read)).rejects.toThrow(/link-local/);
  });
});

describe('the body is capped', () => {
  it('refuses a declared content-length over the cap', async () => {
    vi.stubGlobal('fetch', async () =>
      new Response('<html>small</html>', {
        status: 200,
        headers: { 'content-length': String(64 * 1024 * 1024) },
      }));
    await expect(fetchHtml('http://93.184.216.34/', [])).rejects.toThrow(/reads at most/);
  });

  it('refuses a body that goes over the cap despite an honest-looking header', async () => {
    // The obvious bypass: declare 10 bytes, send forever. The cap has to be on
    // what is actually read, and the refusal has to be total -- there is no
    // half a page here, because half a page downstream reads as "the field
    // disappeared", which is the failure this product exists to refuse.
    vi.stubGlobal('fetch', async () => {
      const chunk = new Uint8Array(1024 * 1024).fill(65);
      return new Response(
        new ReadableStream({
          pull(c) { c.enqueue(chunk); },
        }),
        { status: 200, headers: { 'content-length': '10' } },
      );
    });
    await expect(fetchHtml('http://93.184.216.34/', [])).rejects.toThrow(/stopped reading/);
  });
});

'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { CircleAlert, Search } from 'lucide-react';
import { searchCatalogue } from './actions';

/**
 * The way to reach the other seventeen hundred.
 *
 * THE CARDS ARE A SHELF, NOT THE CATALOGUE. Twenty-eight brands is what a
 * person can read; Bright Data has 1,744 scrapers and most of them are a single
 * store's product feed that somebody, somewhere, genuinely wants. A library
 * whose only door is its front display is a library that has quietly decided
 * what you are allowed to want. So: a box, over everything, resolving to a real
 * dataset_id.
 *
 * NOTHING IS FETCHED UNTIL SOMETHING IS TYPED, and what comes back is at most
 * twenty-five rows -- see `searchCatalogue`, which is a server action for
 * exactly this reason. The list itself never enters the browser.
 *
 * THE HIDDEN COUNT IS ON THE SCREEN, and it is the part of this component that
 * matters most. Several dozen of those 1,744 are named `test`, `delete please`,
 * `need_to_edit` -- somebody's scratch datasets, real ids that would run, that
 * nobody outside the account that made them can identify. They are filtered
 * out, and the number filtered is printed under the box every time. A filter
 * that does not say how much it removed is indistinguishable from a catalogue
 * that is simply smaller than it is, which is the same defect as a truncation
 * that does not say it truncated.
 *
 * SEARCHING COSTS NOTHING. `/datasets/list` reports what the account owns; it
 * does not collect anything. Run, on the next screen, is the button that spends
 * money, and it says so there.
 */
export function CatalogueSearch() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<Awaited<ReturnType<typeof searchCatalogue>> | null>(null);
  const [busy, startSearch] = useTransition();
  // The query the newest request was made for. A slow request that resolves
  // after a later one must not overwrite it -- typing "linked" then "linkedin"
  // and being shown the results for "linked" is a race the operator reads as
  // the search being wrong.
  const latest = useRef('');

  const go = (value: string) => {
    const query = value.trim();
    latest.current = query;
    if (!query) { setRes(null); return; }
    startSearch(async () => {
      const r = await searchCatalogue(query);
      if (latest.current === query) setRes(r);
    });
  };

  return (
    <section className="flex flex-col gap-[8px]">
      <h2 className="label-10 text-[var(--text-muted)]">SEARCH EVERY BRIGHT DATA SCRAPER</h2>
      <div className="flex items-center gap-[10px]">
        <div className="relative flex min-w-0 flex-1 items-center">
          <Search
            size={14}
            strokeWidth={1.5}
            aria-hidden
            className="pointer-events-none absolute left-[12px] text-[var(--text-muted)]"
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.currentTarget.value)}
            /* On Enter, not on every keystroke. A request per character would
               be a request per character to somebody else's API; the cache
               behind it is six hours old at worst, so waiting for the operator
               to finish the word costs them nothing. */
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); go(q); } }}
            onBlur={() => go(q)}
            placeholder="Zillow, Shein, Yahoo Finance, gd_…"
            aria-label="Search Bright Data scrapers by name"
            className="body-13_5 w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-card)] py-[9px] pl-[32px] pr-[12px] outline-none transition-colors duration-[var(--duration-tint)] placeholder:text-[var(--text-muted)] focus:border-[var(--semantic-link)]"
          />
        </div>
      </div>

      {busy && <p className="meta-12_5 text-[var(--text-muted)]">Reading the catalogue…</p>}

      {res && !res.ok && (
        <p role="alert" className="flex items-start gap-[8px]">
          <CircleAlert size={14} strokeWidth={1.5} className="mt-[2px] shrink-0 text-[var(--semantic-danger)]" aria-hidden />
          <span className="meta-12_5 text-[var(--semantic-danger)]">{res.detail}</span>
        </p>
      )}

      {res?.ok && (
        <>
          {res.matches.length === 0 && (
            <p className="meta-12_5 text-[var(--text-secondary)]">
              {/* "Nothing matched" and "everything that matched is somebody's
                  scratch dataset" are different answers, and only the second
                  one is true for a query like `uniqlo`. Saying the first would
                  be the filter deciding what the operator is allowed to know
                  about the catalogue, which is the thing the count under this
                  box exists to prevent. */}
              {res.hiddenMatches > 0
                ? `${res.hiddenMatches} ${res.hiddenMatches === 1 ? 'entry matches' : 'entries match'} `
                  + 'that, and every one of them is named as a test, an internal or a deleted '
                  + 'dataset. Nothing in the catalogue collects that under a name that says what '
                  + 'it collects.'
                : 'Nothing in the catalogue is named that.'}
            </p>
          )}
          {res.matches.length > 0 && (
            <ul className="flex flex-col rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)]">
              {res.matches.map((m) => (
                <li key={m.id} className="border-b border-[var(--border-hairline)] last:border-0">
                  {/* Straight to the card that takes an id, with the id already
                      in it. The operator never has to copy a `gd_` string
                      between two screens, which is where they get truncated. */}
                  <Link
                    href={`/library/dataset?dataset=${encodeURIComponent(m.id)}`}
                    className="press-row flex w-full flex-wrap items-baseline gap-x-[12px] gap-y-[2px] px-[14px] py-[10px] transition-colors duration-[var(--duration-tint)] hover:bg-[var(--surface-subtle)]"
                  >
                    <span className="body-13_5 text-[var(--text-primary)]">{m.name}</span>
                    <span className="meta-12_5 font-mono text-[var(--text-muted)]">{m.id}</span>
                    {/* Bright Data reports a row count for some entries and
                        not others. Shown where there is one, absent where
                        there is not -- an invented "0 rows" would say the
                        dataset is empty when what is true is that nobody
                        said. */}
                    {m.size !== undefined && (
                      <span className="meta-12_5 text-[var(--text-muted)]">
                        {m.size.toLocaleString()} rows
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="meta-12_5 text-[var(--text-muted)]">
            {res.more > 0 && `${res.more} more match. `}
            {res.matches.length > 0 && res.hiddenMatches > 0
              && `${res.hiddenMatches} more matched and were hidden. `}
            {`${res.total.toLocaleString()} scrapers in the catalogue, ${res.hidden} hidden: `}
            named test, delete, need_to_edit, deprecated or internal — somebody&apos;s scratch
            datasets, with nothing in the name to say what they collect.
          </p>
        </>
      )}
    </section>
  );
}

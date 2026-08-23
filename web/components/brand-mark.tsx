import {
  AtSign, BedDouble, BookOpen, Boxes, Briefcase, BriefcaseBusiness, Building2, Camera,
  Code, FileText, Gavel, Globe, Hotel, House, MessageCircleQuestion, MessagesSquare,
  Music, Package, Palette, Pin, Play, Search, Shirt, ShoppingBag, ShoppingCart, Star,
  Store, Target, TrendingUp, Tv, Users, type LucideIcon,
} from 'lucide-react';

/**
 * The brand mark on a tracker card.
 *
 * WHY THE PATHS ARE IN THIS FILE rather than behind a dependency. Five glyphs
 * do not justify `simple-icons`, which is three and a half thousand icons and
 * several megabytes to reach the five this app draws. The path data below is
 * copied from that project (CC0-1.0) and committed here, so a self-hosted
 * install renders them offline and nothing is fetched from a CDN at runtime.
 *
 * THE TRADEMARKS ARE NOT CC0. The icon FILES are public domain; the marks
 * remain their owners'. What this screen does is nominative use -- a brand's
 * own mark identifying that brand, beside its name, on a card that scrapes
 * that site -- and every published policy was read before anything shipped.
 * Three passed. Everything else carries an icon that says what the card DOES;
 * see `ICONS`. Each absence is a decision, and these four are the ones that
 * were argued individually before the other twenty-five joined them:
 *
 *   Amazon   "You may only use the specific trademarks identified by Amazon
 *            and only in materials that have been approved in advance, in
 *            writing", and "The Marks must appear by themselves". A grid of
 *            cards is neither. simple-icons removed its Amazon icon for the
 *            same reason and blocklisted re-adding it.
 *   arXiv    "Use of the name arXiv and associated logos ... are only allowed
 *            for the purpose of acknowledging use of arXiv's API or data from
 *            the arXiv corpus." This tracker reads their listing HTML, not the
 *            API, so the one permitted purpose does not apply.
 *   PyPI     The PSF policy covers the Python marks and is silent on PyPI's.
 *            Where it does grant nominative use it attaches a condition -- the
 *            logo "should be accompanied by a symbol for unregistered
 *            trademarks ... this may not be removed or obscured and must
 *            always be included" -- which a 38px glyph cannot carry honestly.
 *   Any site has no brand to be, so it takes a globe.
 *
 * See TRADEMARKS.md for the attribution notices the three shipped marks
 * require, and for the sentence each verdict was read off.
 *
 * NOTHING IS RECOLOURED. Each mark renders in the hex its owner publishes.
 * Three of the five are already monochrome black; PyPI's blue and arXiv's red
 * are their own. `--surface-card` is #ffffff and there is no dark theme, so
 * every one of them clears contrast without adjustment -- which is the reason
 * no adjustment is made.
 *
 * DECORATIVE. `aria-hidden`, always: the card's title is the accessible name
 * and a screen reader announcing "GitHub GitHub" is worse than one that does
 * not announce the glyph at all.
 */

const MARKS: Record<string, { d: string; hex: string; title: string }> = {
  github: { d: 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12', hex: '#181717', title: 'GitHub' },
  wikipedia: { d: 'M12.09 13.119c-.936 1.932-2.217 4.548-2.853 5.728-.616 1.074-1.127.931-1.532.029-1.406-3.321-4.293-9.144-5.651-12.409-.251-.601-.441-.987-.619-1.139-.181-.15-.554-.24-1.122-.271C.103 5.033 0 4.982 0 4.898v-.455l.052-.045c.924-.005 5.401 0 5.401 0l.051.045v.434c0 .119-.075.176-.225.176l-.564.031c-.485.029-.727.164-.727.436 0 .135.053.33.166.601 1.082 2.646 4.818 10.521 4.818 10.521l.136.046 2.411-4.81-.482-1.067-1.658-3.264s-.318-.654-.428-.872c-.728-1.443-.712-1.518-1.447-1.617-.207-.023-.313-.05-.313-.149v-.468l.06-.045h4.292l.113.037v.451c0 .105-.076.15-.227.15l-.308.047c-.792.061-.661.381-.136 1.422l1.582 3.252 1.758-3.504c.293-.64.233-.801.111-.947-.07-.084-.305-.22-.812-.24l-.201-.021c-.052 0-.098-.015-.145-.051-.045-.031-.067-.076-.067-.129v-.427l.061-.045c1.247-.008 4.043 0 4.043 0l.059.045v.436c0 .121-.059.178-.193.178-.646.03-.782.095-1.023.439-.12.186-.375.589-.646 1.039l-2.301 4.273-.065.135 2.792 5.712.17.048 4.396-10.438c.154-.422.129-.722-.064-.895-.197-.172-.346-.273-.857-.295l-.42-.016c-.061 0-.105-.014-.152-.045-.043-.029-.072-.075-.072-.119v-.436l.059-.045h4.961l.041.045v.437c0 .119-.074.18-.209.18-.648.03-1.127.18-1.443.421-.314.255-.557.616-.736 1.067 0 0-4.043 9.258-5.426 12.339-.525 1.007-1.053.917-1.503-.031-.571-1.171-1.773-3.786-2.646-5.71l.053-.036z', hex: '#000000', title: 'Wikipedia' },
  mdn: { d: 'm21.538 1.1-6.745 21.8h-2.77L18.77 1.1ZM24 1.1v21.8h-2.462V1.1Zm-12 0v21.8H9.538V1.1Zm-2.462 0L2.77 22.9H0L6.746 1.1Z', hex: '#000000', title: 'MDN Web Docs' },
};

/**
 * What a card DOES, as one glyph, and why it is not a logo.
 *
 * WHAT CHANGED. This screen used to hold seven cards and three of them earned a
 * real mark, each after its owner's published policy was read and quoted in
 * TRADEMARKS.md. It now holds twenty-eight more -- LinkedIn, TikTok, Zillow,
 * Shopee. Twenty-five of those policies were read and every verdict is in
 * TRADEMARKS.md. NONE of them clears.
 *
 * Twenty of the twenty-five require prior written permission in so many words,
 * which settles those. The interesting three are the ones that DO permit this
 * -- Instagram, Threads, Yelp -- and they fail on a condition that is easy to
 * read past: the permission is a licence to use THE OWNER'S ASSET, not a licence
 * to draw the shape. "Anyone using Instagram's assets should only use the logos
 * found on our Brand Resource Center site". A monochrome redrawing is not that
 * asset, so a grant conditioned on using the owner's file does not reach it.
 * YouTube's grant is scoped to API clients and Assay is not one; Google's
 * excludes business use, which this is.
 *
 * THIS IS WHY THERE IS NO BRAND-LOGO SET IN `package.json` AND MUST NOT BE. Not
 * simple-icons, not any other. The finding above is what TRADEMARKS.md records
 * and it does not change because a package would be convenient.
 *
 * SO THE CARD CARRIES A VERB, NOT A MARK. A cart for a shop, a play glyph for
 * video, a briefcase for jobs, a bed for a place to stay. Every one is
 * `lucide-react` -- already a dependency, already `components.json`'s named icon
 * library, MIT, and with no trademark attached to any of it. It describes what
 * the scraper collects, which is the thing the operator is actually choosing
 * between, and it borrows no trade dress to do it.
 *
 * IT IS PER BRAND, NOT PER SHELF, AND THAT IS THE POINT. Eight identical carts
 * under "Shopping" would be a wall of the same tile, which is exactly what the
 * letter tiles replaced. The glyph varies with what the brand is FOR -- a gavel
 * for eBay, a palette for Etsy, a shirt for Zara -- so a card is findable by
 * shape before it is read, which is the job the mark used to do. `CATEGORY`
 * below is the floor, for a card nobody has picked a verb for.
 *
 * THE LETTER IS GONE RATHER THAN SUBORDINATE. It was carrying findability on
 * its own; the glyph now carries it, the brand's name is already the card's
 * title two millimetres to the right, and an initial tucked into the corner of
 * an icon would be a second thing to read at 38px where one is plenty.
 *
 * A REAL MARK STILL WINS. `MARKS` is checked first: `bd-github` and
 * `bd-wikipedia` fall through to the GitHub and Wikipedia glyphs that were
 * already cleared, because it is the same brand and the same permission. If a
 * verdict in TRADEMARKS.md is ever settled the other way -- by obtaining the
 * owner's own asset file, or by asking them -- adding that brand to `MARKS`
 * retires its glyph with no other change.
 */
const ICONS: Record<string, LucideIcon> = {
  // Social -- what you would be watching on each one.
  instagram: Camera,
  tiktok: Music,
  facebook: Users,
  youtube: Play,
  x: AtSign,
  reddit: MessagesSquare,
  threads: AtSign,
  pinterest: Pin,
  quora: MessageCircleQuestion,

  // Shopping.
  amazon: ShoppingCart,
  walmart: Store,
  target: Target,
  ebay: Gavel,
  etsy: Palette,
  bestbuy: Tv,
  zara: Shirt,
  shopee: ShoppingBag,

  // Places and property.
  zillow: House,
  airbnb: BedDouble,
  booking: Hotel,
  yelp: Star,

  // Jobs and companies.
  linkedin: Briefcase,
  glassdoor: Building2,
  indeed: BriefcaseBusiness,
  crunchbase: TrendingUp,

  // Search and reference, and the page trackers that have no brand card.
  google: Search,
  arxiv: FileText,
  pypi: Package,
  any: Globe,
  dataset: Boxes,

  // Unreached today -- `MARKS` answers these three first -- and kept anyway, so
  // that retiring a cleared mark drops the card to a sensible glyph instead of
  // to its shelf's default.
  github: Code,
  wikipedia: BookOpen,
  mdn: BookOpen,
};

/**
 * The shelf a card sits on, as a glyph and a colour.
 *
 * THE COLOUR IS THE CATEGORY'S, NEVER THE BRAND'S. Instagram's tile is not
 * Instagram's gradient and LinkedIn's is not LinkedIn's blue -- using the
 * brand's palette would be the trade-dress claim the note above avoids. It says
 * which shelf you are looking at, which is a fact about Assay's own catalogue.
 *
 * EVERY VALUE IS A TOKEN FROM `tokens.css`, so a palette change moves these and
 * there is no hex on this screen to go stale. `--semantic-danger` is deliberately
 * unused: red means a retraction everywhere else in this product and a category
 * is not an error. `--text-muted` is unused too, for a duller reason -- #a2a2a2
 * on #ffffff is 2.3:1, under the 3:1 a non-text glyph has to clear.
 *
 * ponytail: seven shelves and four chromatic tokens, so the last three share the
 * neutrals and colour alone does not separate them. That is the palette's real
 * ceiling rather than a shortcut -- there are twenty colours in the file and no
 * dark theme -- and the glyph is doing the separating anyway. Upgrade path: a
 * category ramp in Figma, regenerated through `tools/tokens.js`.
 */
const CATEGORY: Record<string, { icon: LucideIcon; colour: string }> = {
  social: { icon: MessagesSquare, colour: 'var(--semantic-link)' },
  commerce: { icon: ShoppingCart, colour: 'var(--semantic-success)' },
  places: { icon: Pin, colour: 'var(--semantic-warning)' },
  work: { icon: Briefcase, colour: 'var(--accent-brand)' },
  web: { icon: Search, colour: 'var(--text-primary)' },
  scrapers: { icon: Boxes, colour: 'var(--text-secondary)' },
  pages: { icon: Globe, colour: 'var(--text-secondary)' },
};

const UNSHELVED = { icon: Globe, colour: 'var(--text-secondary)' };

function CategoryMark({ id, group, size }: { id: string; group?: string; size: number }) {
  const shelf = (group && CATEGORY[group]) || UNSHELVED;
  const Icon = ICONS[id] ?? shelf.icon;

  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-[8px]"
      style={{
        width: size,
        height: size,
        // The category colour at a tenth, over the card it sits on. Mixed from
        // the same token the glyph is drawn in rather than declared separately,
        // so the pair cannot drift and neither half is a literal.
        background: `color-mix(in srgb, ${shelf.colour} 10%, var(--surface-card))`,
        color: shelf.colour,
      }}
    >
      <Icon size={Math.round(size * 0.52)} strokeWidth={1.75} aria-hidden />
    </span>
  );
}

export function BrandMark({ id, group, size = 40 }: {
  id: string;
  /** Which shelf in `GROUPS` this card sits on. Sets the colour -- see `CATEGORY`. */
  group?: string;
  size?: number;
}) {
  // A curated Bright Data card is `bd-github`; the page tracker for the same
  // site is `github`. One brand, one mark, so the prefix is dropped before the
  // lookup rather than every entry being written twice.
  const key = id.startsWith('bd-') ? id.slice('bd-'.length) : id;
  const mark = MARKS[key];
  if (mark) {
    return (
      <svg
        role="img"
        aria-hidden
        focusable="false"
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill={mark.hex}
        className="shrink-0"
      >
        <path d={mark.d} />
      </svg>
    );
  }

  // Everything else: what the scraper collects, in its shelf's colour.
  return <CategoryMark id={key} group={group} size={size} />;
}

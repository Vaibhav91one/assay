// Product marks, in each product's own colour -- for the three products whose
// owners publish terms that permit it.
//
// A documentation page that names a product it interoperates with should show
// that product's mark rather than a generic glyph, and using a brand's own mark
// to identify that brand is ordinary nominative use. But "ordinary" is not the
// same as "unconditional", and four of the seven products this documentation
// names publish guidelines that do not permit what was originally built here.
// Those four are named in prose and carry no mark. The reasoning is recorded
// below rather than in a commit message, because the next person to add a logo
// needs it in front of them.
//
// ============================================================================
// SHIPPED, AND WHY EACH IS ALLOWED
// ============================================================================
//
// NEXT.JS -- vercel.com/design/brands, read 2026-08-22. Their guidelines
// address this exact use in as many words: "The Next.js symbol should only be
// used in places where there is not enough room to display the full logo, or in
// cases where only brand icons of multiple brands are displayed." The mark is
// used unmodified and in its published black. Two conditions attach and both
// are met: "Do not modify the Vercel marks", and an attribution statement is
// required in a "clear and conspicuous location" -- it is at the foot of every
// documentation page, in `content/docs/index.mdx` and carried by the layout.
//
// RESEND -- resend.com/brand, read 2026-08-22. The whole of their restriction
// is "Do not alter these files in any way." So the file is not altered: it is
// `resend-icon-black.svg`, fetched from cdn.resend.com/brand and committed
// byte-for-byte to `public/brand/vendor/`. No permission requirement, no
// endorsement clause and no attribution requirement is published.
//
// BRIGHT DATA -- no brand-guidelines, logo-usage or trademark page exists;
// /press, /brand and /media-kit are all 404, and the Master Service Agreement
// at brightdata.com/license contains no restriction on use of their mark. The
// asset is the square mark from the logo pack their own media centre publishes.
//
// ============================================================================
// DELIBERATELY NOT SHIPPED
// ============================================================================
//
// These four are named as text. Each was built and then removed after reading
// the owner's published terms.
//
// ANTHROPIC and CLAUDE CODE -- anthropic.com/legal/trademark-guidelines:
// "You may only use our trademarks as specifically permitted by us and only in
// materials we approve beforehand", "We will supply an image (or images) of the
// trademark(s) for your use", and "No alterations of our trademarks (changes to
// color, font, proportion, or otherwise) are permitted." A third-party
// monochrome redraw is both an alteration and unapproved. There is no public
// asset page and no nominative-use carve-out; the stated route is
// marketing@anthropic.com. Naming Claude Code in prose, which this
// documentation does throughout, is a different thing and is not what the
// policy restricts.
//
// DOCKER -- docker.com/legal/trademark-guidelines. Their informational carve-out
// is explicit about what it excludes: "Our word Marks (but not logo marks or
// other graphic depictions of our Marks) may be used in an informational
// context". The whale "may be taken only from Docker's product sheet or from
// Docker's service screen shot following authorization from us", and their
// media guidelines list "Don't decolorize" among the prohibitions -- which is
// exactly what a single-colour reproduction is. The word mark is used freely in
// the prose, which is the part that is permitted.
//
// POSTGRESQL -- postgresql.org/about/policies/trademarks. Slonik "must appear
// in one of the forms below", "should not be modified in any way without prior
// approval", and -- decisive for a row of logos -- "They should not be
// presented with other trademarks or logos." Using the NAMES Postgres and
// PostgreSQL in factual statements is expressly fine, so that is what the
// documentation does.
//
// ============================================================================
//
// GENERIC CONCEPTS DO NOT COME FROM HERE. A folder, a queue, a worker or a
// database in a diagram is not a brand and gets no logo. Those are `lucide`
// icons -- already a dependency of this app -- coloured from Assay's own
// tokens, so they are one source used consistently rather than a second icon
// set mixed in.
//
// NOTHING IS FETCHED AT RUNTIME. All three files are committed under
// `public/brand/vendor/`. An offline or self-hosted install renders them
// exactly as this one does.

interface VendorMark {
  /** The product's name, spelled the way its owner spells it. */
  title: string;
  /** A committed file under `public/brand/vendor/`. Never a remote URL. */
  src: string;
}

const MARKS = {
  nextjs: { title: 'Next.js', src: '/brand/vendor/nextjs.svg' },
  resend: { title: 'Resend', src: '/brand/vendor/resend.svg' },
  brightdata: { title: 'Bright Data', src: '/brand/vendor/brightdata.svg' },
} as const satisfies Record<string, VendorMark>;

export type MarkName = keyof typeof MARKS;

/**
 * One product mark, inline, at reading size.
 *
 * A plain `<img>` rather than `next/image`: these are static SVGs already in
 * `public/`, and `next/image` refuses SVG unless the whole app opts into
 * `dangerouslyAllowSVG` -- which would relax an image policy across every
 * screen in Assay so that six logos could render.
 *
 * `alt` carries the product's name, so the mark is never a silent glyph. The
 * mark is drawn at its published colour and its square is preserved; only
 * `size` varies, which is the one dimension every one of these guidelines
 * allows to.
 */
export function Mark({
  name,
  size = 16,
  label = false,
}: {
  name: MarkName;
  size?: number;
  label?: boolean;
}) {
  const mark = MARKS[name];
  return (
    <span className="inline-flex items-center gap-[6px] align-[-0.15em]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={mark.src}
        alt={mark.title}
        width={size}
        height={size}
        className="shrink-0"
        style={{ width: size, height: size }}
      />
      {label ? <span>{mark.title}</span> : null}
    </span>
  );
}

/** A labelled row of marks, for the head of a page that is about several. */
export function Marks({ names }: { names: readonly MarkName[] }) {
  return (
    <span className="my-[16px] flex flex-wrap items-center gap-x-[20px] gap-y-[10px]">
      {names.map((n) => (
        <span key={n} className="meta-12_5 text-[var(--text-secondary)]">
          <Mark name={n} size={18} label />
        </span>
      ))}
    </span>
  );
}

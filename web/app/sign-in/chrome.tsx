// The furniture both sign-in routes share: the headline half and the card half.
//
// The design is drawn at 1440x900 with the card absolutely placed, but every
// offset in it resolves to "centred" -- (900-623)/2 = 138.5, (900-332)/2 = 284,
// (900-511)/2 = 194.5 -- so this centres with flex instead of reproducing the
// coordinates. Same picture at 1440, and it survives every other width.

import Image from 'next/image';

/** Cap-height alignment. Figma pads the icon box by 12% of the label's size so
 *  the glyph sits on the text baseline rather than the line box. */
export function IconAlign({
  size,
  children,
}: {
  size: number;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-start" style={{ paddingBottom: size * 0.12 }}>
      {children}
    </span>
  );
}

export function Headline() {
  return (
    <div className="hidden lg:flex flex-1 items-center justify-center px-[80px]">
      {/* The space before the mark is non-breaking on purpose: a plain space
          either side of an image is trimmed out of the accessible name, and
          the heading reads "Inyour hands." to a screen reader. */}
      <h1 className="display-96 text-[var(--text-primary)]">
        Frontier AI. In&nbsp;
        <Image
          src="/brand/hero-mark.svg"
          alt=""
          width={66}
          height={66}
          priority
          // Figma puts the mark 2.83px above the top of the headline's first
          // line box (measured: headline y=587, mark y=584.17), so align to the
          // line box top and lift it, rather than to a baseline it never sat on.
          className="inline-block align-top -translate-y-[2.83px]"
        />{' '}
        your hands.
      </h1>
    </div>
  );
}

/** The dark half: photograph, then the white card floating on it. */
export function CardHalf({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex w-full lg:w-[535px] lg:shrink-0 items-center justify-center overflow-hidden bg-[var(--bg-sidebar)] px-[40px] py-[40px]">
      <Image
        src="/brand/sign-in-bg.jpg"
        alt=""
        fill
        priority
        sizes="(min-width: 1024px) 535px, 100vw"
        className="pointer-events-none object-cover"
      />
      <div className="relative w-full max-w-[455px] rounded-[16px] bg-[var(--surface-card)] p-[40px] shadow-[var(--shadow-elevation-floating)]">
        {children}
      </div>
    </div>
  );
}

export function Lockup() {
  return (
    <div className="flex items-center gap-[10px]">
      <Image src="/brand/assay-mark.svg" alt="" width={30} height={30} priority />
      <span className="heading-18 text-[var(--text-primary)]">Assay</span>
    </div>
  );
}

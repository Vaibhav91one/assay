import type { Metadata } from 'next';
import { Questrial, Roboto_Mono } from 'next/font/google';
import './globals.css';

// Questrial ships ONE weight. Hierarchy in this design comes from size,
// colour and caps-with-tracking -- never font-weight. Asking for a bold
// Questrial silently gets you a synthesised face that does not match Figma.
const questrial = Questrial({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-questrial',
  fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'],
});

// Mono is not decoration: it marks machine tokens -- field names, ids,
// selectors, hashes, values -- apart from prose. See docs/APP-DESIGN.md 5c.
const robotoMono = Roboto_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-roboto-mono',
  fallback: ['ui-monospace', 'SFMono-Regular', 'monospace'],
});

export const metadata: Metadata = {
  title: 'Assay',
  description: 'A scraper that abstains when it is not sure.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${questrial.variable} ${robotoMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

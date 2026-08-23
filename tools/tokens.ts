#!/usr/bin/env node
// Read the design tokens out of Figma and write them into the app as CSS.
//
// Figma's Variables REST API is Enterprise-only, so this does not run
// unattended -- it prints a plugin script you paste into the Figma console
// (or hand to an agent with Figma MCP access), then consumes the JSON that
// comes back. That is the same route the design work has used all along.
//
// The OUTPUT is committed. A self-hoster cloning this repo has no Figma
// token and must never need one: `npm install && npm run dev` has to work
// with the tokens already in the tree.
//
//   node tools/tokens.js --print     show the reader script to run in Figma
//   node tools/tokens.js tokens.json write web/app/tokens.css from a dump
//
// ponytail: no Style Dictionary. 23 variables and 20 text styles do not
// justify a build pipeline; swap it in if the token count ever gets away.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'web', 'app', 'tokens.css');

// The script to run inside Figma. Kept here so the reader and the writer
// cannot drift apart -- if the shape changes, both change in one file.
const READER = `
const cols = await figma.variables.getLocalVariableCollectionsAsync();
const col = cols.find(c => c.name === 'assay');
const mode = col.modes[0].modeId;
const hex = c => '#' + [c.r,c.g,c.b].map(v => Math.round(v*255).toString(16).padStart(2,'0')).join('');
const vars: any[] = [];
for (const id of col.variableIds) {
  const v = await figma.variables.getVariableByIdAsync(id);
  if (!v) continue;
  const raw = v.valuesByMode[mode];
  vars.push({ name: v.name, type: v.resolvedType,
              value: v.resolvedType === 'COLOR' ? hex(raw) : raw });
}
const styles = (await figma.getLocalTextStylesAsync()).map(s => ({
  name: s.name, family: s.fontName.family, size: s.fontSize,
  lineHeight: s.lineHeight && s.lineHeight.unit === 'PIXELS' ? s.lineHeight.value : null,
  letterSpacing: s.letterSpacing && s.letterSpacing.value ? s.letterSpacing.value : 0,
}));
const effects = (await figma.getLocalEffectStylesAsync()).map(s => ({
  name: s.name,
  shadows: s.effects.filter(e => e.visible && e.type === 'DROP_SHADOW').map(e => ({
    x: e.offset.x, y: e.offset.y, blur: e.radius, alpha: e.color.a })),
}));
return JSON.stringify({ vars, styles, effects }, null, 2);
`.trim();

/** `body/13.5` -> `body-13_5`. The one spelling the CSS uses, for class and variable alike. */
const flat = (n: any) => n.replace(/\//g, '-').replace(/\./g, '_');

/** `accent/brand` -> `--accent-brand`. Slashes are the only separator Figma uses. */
const cssName = (n: any) => '--' + flat(n);

// The shipped type scale, in px, keyed by the flattened style name -- the same
// string that becomes the class and the `--text-*` suffix. Keyed that way and
// not by the raw Figma name because flattening is lossy: `mono-label/10.5` and
// `mono/label-10.5` both land on `mono-label-10_5`, and only the flattened form
// is visible from here.
//
// Figma's frames are read at 100% on a design canvas; the product is read on a
// real display at arm's length, and the bottom of the scale -- table headers,
// row metadata, timestamps, trace rows, field names -- is where the product
// actually lives. Those sizes were a point too small, so the app ships one step
// up from the file:
//
//   +1px   10 -> 13     labels, captions, meta, mono: the small end, most of it
//   +0.5px 13.5 -> 14   body: already comfortable, so a half step
//   0      nav/15       pinned: the sidebar items are big enough as they are
//   +1px   16 -> 22     headings and titles, so body -> heading does not compress
//   0      28/44/96     display sizes are already large
//
// A style NOT listed here ships at its Figma size, so a new text style needs no
// entry until someone decides it needs one.
//
// This lives in the GENERATOR, not in tokens.css, because tokens.css is
// generated: a hand edit there is reverted the next time anyone runs this
// script. Regenerating from a fresh Figma dump re-applies the table, so the
// scale survives. The cost is that the file and the app now disagree by a step
// -- Figma still says caption/11 is 11px -- and the class names still carry the
// Figma size, since renaming them would touch every call site in the app to say
// nothing new. If the file is ever bumped to match, delete the entries here
// rather than doubling the step.
const SHIPPED: Record<string, number> = {
  'label-10': 11,
  'label-10_5': 11.5,
  'caption-11': 12,
  'caption-12': 13,
  'meta-12_5': 13.5,
  'meta-13': 14,
  'mono-label-10_5': 11.5,
  'mono-label-12': 13,
  'mono-value-12_5': 13.5,
  'mono-value-13': 14,
  'body-13_5': 14,
  'body-14': 14.5,
  'heading-16': 17,
  'heading-18': 19,
  'title-20': 21,
  'title-22': 23,
};

/**
 * The Figma style with the shipped size substituted, and any explicit line
 * height scaled to match. Figma AUTO line heights come through as null and are
 * written as CSS `normal`, which already scales with the font; a PIXELS one is
 * a fixed number that would crowd the text at the larger size, so it moves by
 * the same ratio -- body/13.5's 21px is 1.556 ratio, and stays 1.556.
 */
const shipped = (s: any) => {
  const size = SHIPPED[flat(s.name)] ?? s.size;
  if (size === s.size) return s;
  const lineHeight = s.lineHeight ? half((s.lineHeight * size) / s.size) : s.lineHeight;
  return { ...s, size, lineHeight };
};

/** Nearest half-pixel. The scale is built on halves; thirds would not read as one system. */
const half = (n: number) => Math.round(n * 2) / 2;

function emit({ vars, styles: raw, effects }: any) {
  // One substitution, before anything reads a size: the `--text-*` variables and
  // the utility classes are two views of the same style and must never disagree.
  const styles = raw.map(shipped);
  const colors = vars.filter((v: any) => v.type === 'COLOR');
  const numbers = vars.filter((v: any) => v.type !== 'COLOR');
  const L: any[] = [];

  L.push('/* Generated by tools/tokens.js from Figma file FYnhhLeMulixqTTyjP7gJd.');
  L.push(' * Do not edit by hand -- change the variable in Figma and regenerate:');
  L.push(' *   node tools/tokens.js --print   # run the printed script in Figma');
  L.push(' *   node tools/tokens.js dump.json # write this file from the result');
  L.push(` * ${colors.length} colours, ${numbers.length} numbers, ${styles.length} text styles.`);
  // Say it here too. A reader who opens this file and finds `.caption-11` set to
  // 12px will otherwise think the generator is broken, and the name cannot tell
  // them otherwise -- it still carries the Figma size.
  const bumped = styles.filter((s: any) => flat(s.name) in SHIPPED).length;
  if (bumped)
    L.push(
      ` *\n * ${bumped} text styles ship one step LARGER than the Figma file says --` +
        `\n * see SHIPPED in tools/tokens.ts for the sizes and why. The class names` +
        `\n * still carry the Figma size, so .caption-11 is 12px here on purpose.`,
    );
  L.push(' */');
  L.push('');
  // `static` matters: a plain @theme is tree-shaken, so a token nothing
  // references yet is silently dropped from the build. These are a design
  // system, not a utility set -- every one has to survive to the stylesheet
  // whether a component uses it today or not.
  L.push('@theme static {');

  L.push('  /* colour */');
  for (const c of colors) L.push(`  ${cssName(c.name)}: ${c.value};`);

  L.push('');
  L.push('  /* geometry */');
  for (const n of numbers) L.push(`  ${cssName(n.name)}: ${n.value}px;`);

  L.push('');
  L.push('  /* type -- Questrial ships ONE weight, so hierarchy is size,');
  L.push('     colour and caps-with-tracking. Never font-weight. */');
  L.push("  --font-sans: var(--font-questrial), ui-sans-serif, system-ui, sans-serif;");
  L.push("  --font-mono: var(--font-roboto-mono), ui-monospace, SFMono-Regular, monospace;");
  for (const s of styles) {
    L.push(`  --text-${flat(s.name)}: ${s.size}px;`);
  }

  L.push('');
  L.push('  /* elevation */');
  for (const e of effects) {
    const v = e.shadows
      .map((s: any) => `${s.x}px ${s.y}px ${s.blur}px rgb(0 0 0 / ${s.alpha})`)
      .join(', ');
    L.push(`  --shadow-${e.name.replace(/\//g, '-')}: ${v};`);
  }
  L.push('}');
  L.push('');

  // Text styles carry line-height and tracking that a bare size loses.
  // One utility class per Figma style keeps the mapping honest and greppable.
  L.push('/* One class per Figma text style. Named by role, not by size, so a');
  L.push('   size change in Figma does not rename anything in the app. */');
  for (const s of styles) {
    const cls = '.' + flat(s.name);
    const mono = s.family === 'Roboto Mono';
    const parts = [
      `font-family: var(${mono ? '--font-mono' : '--font-sans'});`,
      `font-size: ${s.size}px;`,
    ];
    // Figma's AUTO line height is the font's own metrics, which is exactly what
    // CSS `normal` means -- so it has to be written down, not left out. Tailwind's
    // preflight sets line-height 1.5 on the root, so an omitted line-height is
    // not the browser default: display/96 came out at 144px against Figma's 99.
    parts.push(s.lineHeight ? `line-height: ${s.lineHeight}px;` : 'line-height: normal;');
    if (s.letterSpacing) parts.push(`letter-spacing: ${round(s.letterSpacing)}px;`);
    L.push(`${cls} { ${parts.join(' ')} }`);
  }
  L.push('');
  return L.join('\n');
}

const round = (n: any) => Math.round(n * 100) / 100;

const arg = process.argv[2];
if (!arg || arg === '--print') {
  console.log('# Run this inside Figma (plugin console or an agent with Figma MCP),');
  console.log('# save the JSON it returns, then: node tools/tokens.js dump.json\n');
  console.log(READER);
  process.exit(0);
}

const dump = JSON.parse(readFileSync(arg, 'utf8'));
writeFileSync(OUT, emit(dump));
console.log(
  `wrote ${OUT}\n  ${dump.vars.length} variables, ${dump.styles.length} text styles, ${dump.effects.length} effect styles`,
);

// Does the plain healer actually relocate an element across a real site change?
// Not a mutation, not a fixture -- two genuine Wayback captures of the same page.
//
//   node tools/heal-demo.js [site] [fromYYYYMM] [toYYYYMM]

import { load } from 'cheerio';
import { readFile, readdir } from 'node:fs/promises';
import { fingerprint, skeletonHash } from '../src/fingerprint.js';
import { heal } from '../src/heal.js';
import { pickTarget } from '../src/target.js';

const [, , SITE = 'ikea', FROM = '202401', TO = '202608'] = process.argv;

const parse = async (site, file) => {
  const $ = load(await readFile(`corpus/${site}/${file}`, 'utf8'));
  $('script,style,noscript').remove();
  return $;
};

const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();

/** A real recall headline, chosen the way a human would at capture time. */

const run = async () => {
  const files = (await readdir(`corpus/${SITE}`)).filter((f) => f.endsWith('.html')).sort();
  const fromFile = files.find((f) => f.startsWith(FROM)) || files[0];
  const toFile = files.find((f) => f.startsWith(TO)) || files.at(-1);

  const $old = await parse(SITE, fromFile);
  const $new = await parse(SITE, toFile);

  const targetEl = pickTarget($old);
  if (!targetEl) {
    console.log(`no target found in ${SITE}/${fromFile}`);
    return;
  }
  const target = fingerprint($old, targetEl);

  console.log(`\n${SITE}:  ${fromFile.slice(0, 6)}  ->  ${toFile.slice(0, 6)}`);
  console.log('-'.repeat(74));
  console.log(`skeleton  ${skeletonHash($old).hash}  ->  ${skeletonHash($new).hash}` +
    (skeletonHash($old).hash === skeletonHash($new).hash ? '   (template unchanged)' : '   TEMPLATE CHANGED'));
  console.log(`\ncaptured target`);
  console.log(`  <${target.tag}>  "${target.text.slice(0, 66)}"`);
  console.log(`  css classes kept ${(target.classes_stable || []).length}, dropped ${target.classes_dropped} as volatile`);
  console.log(`  abs_xpath ${target.abs_xpath.slice(0, 66)}`);

  // does the old selector still work? this is what triggers healing in every
  // existing tool -- and note it only fires on a ZERO result
  const stillThere = $new(target.abs_xpath.replace(/\[(\d+)\]/g, ':nth-of-type($1)').replace(/^\//, '')).length;
  console.log(`\n  original xpath resolves on new page: ${stillThere ? 'yes' : 'NO -- healing would fire'}`);

  const t0 = Date.now();
  const result = heal($new, target, { limit: 5 });
  const ms = Date.now() - t0;

  console.log(`\nranked candidates  (${ms}ms)`);
  result.ranked.forEach((r, i) => {
    const flag = i === 0 ? '->' : '  ';
    console.log(
      `  ${flag} ${r.score.toFixed(4)}  <${r.fp.tag}>  "${(r.fp.text || '').slice(0, 52)}"`
    );
  });

  const chosen = result.fingerprint;
  const correct = norm(chosen.text) === norm(target.text);

  console.log(`\nverdict`);
  console.log(`  chose      <${chosen.tag}>  "${(chosen.text || '').slice(0, 60)}"`);
  console.log(`  score      ${result.score.toFixed(4)}`);
  console.log(`  runner-up  ${result.runnerUp === null ? '-' : result.runnerUp.toFixed(4)}`);
  console.log(`  margin     ${result.margin === null ? '-' : result.margin.toFixed(4)}`);
  console.log(`  text match ${correct ? 'YES' : 'NO'}`);
  console.log(
    `  top contributing properties: ` +
      Object.entries(result.parts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([k, v]) => `${k}=${v}`)
        .join('  ')
  );
  console.log();
};

run();

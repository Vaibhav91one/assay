// Bundle the real result artifacts into the dashboard as a plain JS file.
//
// Inlining rather than fetch()ing means `open app/index.html` works with no
// server and no CORS dance -- which matters when the demo is a screen recording
// and every moving part is a chance to fail on camera.
//
//   node tools/build-app.js

import { readFile, writeFile, mkdir } from 'node:fs/promises';

const readJson = async (p, dflt = null) => {
  try { return JSON.parse(await readFile(p, 'utf8')); } catch { return dflt; }
};
const readJsonl = async (p) => {
  try {
    return (await readFile(p, 'utf8')).split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
};

const run = async () => {
  const bench = await readJson('results/bench.json', {});
  const sweep = await readJson('results/sweep.json', {});
  const events = await readJsonl('results/events.jsonl');
  const live = await readJson('results/ikea-recalls.json', []);

  // field audit of the live Bright Data snapshot, computed here so the page
  // stays dumb and the numbers stay reproducible
  const PROMISED = ['recall_title', 'recall_url', 'title_on_detail', 'date_published',
    'description', 'product_name', 'hazard', 'remedy', 'image_urls', 'recall_details_url'];
  const isNull = (v) => v === null || v === undefined || v === '' ||
    (Array.isArray(v) && v.length === 0);
  const audit = PROMISED.map((f) => {
    const present = live.filter((r) => f in r).length;
    const nonNull = live.filter((r) => !isNull(r[f])).length;
    return { field: f, present, nonNull, total: live.length,
      nullRate: live.length ? 1 - nonNull / live.length : 1 };
  });

  const payload = {
    generated: null, // kept null so rebuilds are byte-identical
    collector: 'c_mt1nrjboski90goqc',
    snapshot: 'j_mt1q17uoq8rkcxd8a',
    thresholds: { tau: 0.6, delta: 0.16 },
    bench: { arms: bench.arms || {}, byMutation: bench.byMutation || {}, config: bench.config || {} },
    sweep: { grid: sweep.grid || [], best: sweep.best || null, ungated: sweep.ungated || null },
    events,
    audit,
    liveCount: live.length,
  };

  await mkdir('app', { recursive: true });
  await writeFile('app/data.js', `window.ASSAY = ${JSON.stringify(payload)};\n`);

  const kb = (JSON.stringify(payload).length / 1024).toFixed(0);
  console.log(`app/data.js  ${kb} KB`);
  console.log(`  events ${events.length}   live records ${live.length}   sweep points ${payload.sweep.grid.length}`);
};

run();

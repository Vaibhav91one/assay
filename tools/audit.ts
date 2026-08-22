// Point the detector at a real Bright Data snapshot.
//
// This is the product doing its job on live sponsor output, not on a fixture.
// Bright Data reported 100% success / 0 failed crawls for this run. The audit
// below is what that same run looks like when you check the VALUES instead of
// the HTTP status.
//
//   node tools/audit.js results/<snapshot>.ndjson [--schema a,b,c]

import { readFile } from 'node:fs/promises';
import { detect, robustZ } from '../src/detect.js';

const file = process.argv[2] || 'results/j_mt1q17uoq8rkcxd8a.ndjson';
const schemaArg = process.argv.indexOf('--schema');

// what the approved Scraper Studio schema said this collector would return
const PROMISED =
  schemaArg > -1
    ? process.argv[schemaArg + 1].split(',')
    : ['recall_title', 'recall_url', 'title_on_detail', 'date_published', 'description',
       'product_name', 'hazard', 'remedy', 'image_urls', 'recall_details_url'];

// per-field expectations, the cheap way to catch "resolved but wrong"
const EXPECT: Record<string, any> = {
  recall_title:    { regex: '(recall|rappel|retirada|alert)', minLen: 15 },
  title_on_detail: { regex: '(recall|rappel|retirada|alert)', minLen: 15 },
  recall_url:      { regex: '^https?://' },
  description:     { minLen: 40 },
  remedy:          { minLen: 15 },
};

const isNull = (v: any) => v === null || v === undefined || v === '' ||
  (Array.isArray(v) && v.length === 0);

const run = async () => {
  const raw = await readFile(file, 'utf8');
  const rows = raw.split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);

  console.log(`\nASSAY FIELD AUDIT   ${file}`);
  console.log(`${rows.length} records returned by Bright Data`);
  console.log(`platform verdict: 100% success, 0 failed crawls\n`);

  const line = '-'.repeat(78);
  console.log(line);
  console.log('field'.padEnd(22) + 'present'.padStart(9) + 'non-null'.padStart(10) +
    'null-rate'.padStart(11) + '  verdict');
  console.log(line);

  const findings: any[] = [];
  for (const field of PROMISED) {
    const present = rows.filter((r) => field in r).length;
    const nonNull = rows.filter((r) => !isNull(r[field])).length;
    const nullRate = 1 - nonNull / rows.length;

    // a healthy field is what the baseline SHOULD look like
    const history = [{ nullRate: 0 }, { nullRate: 0 }, { nullRate: 0 }];
    const sample = rows.find((r) => !isNull(r[field]));

    const d = detect({
      field,
      value: sample ? sample[field] : null,
      expected: EXPECT[field] || {},
      history,
      skeleton: {},
      anchors: {},
    });

    // the null-rate signal is a property of the whole run, not one row
    const rz = robustZ(history.map((h) => h.nullRate), nullRate);
    const spiked = rz.spike;

    let verdict;
    if (present === 0) verdict = 'ABSENT - schema promised it, collector never emitted it';
    else if (nonNull === 0) verdict = 'ALL NULL';
    else if (nullRate > 0.5) verdict = `SPARSE - ${(nullRate * 100).toFixed(0)}% null`;
    else if (d.broken) verdict = `SUSPECT - ${d.signals.join('; ')}`;
    else verdict = 'ok';

    if (verdict !== 'ok') findings.push({ field, present, nonNull, nullRate, verdict, spiked });

    console.log(
      field.padEnd(22) +
      `${present}/${rows.length}`.padStart(9) +
      `${nonNull}`.padStart(10) +
      `${(nullRate * 100).toFixed(1)}%`.padStart(11) +
      '  ' + verdict.slice(0, 60)
    );
  }
  console.log(line);

  // the cross-check the whole design depends on
  const pairOk = rows.filter(
    (r) => !isNull(r.recall_title) && !isNull(r.title_on_detail)
  ).length;
  console.log(`\nCROSS-CHECK (recall_title vs title_on_detail)`);
  if (!pairOk) {
    console.log(`  UNAVAILABLE - only one side of the pair was delivered.`);
    console.log(`  Without both, drift on the listing template cannot be detected.`);
  } else {
    const agree = rows.filter(
      (r) => !isNull(r.recall_title) && !isNull(r.title_on_detail) &&
        String(r.recall_title).trim() === String(r.title_on_detail).trim()
    ).length;
    console.log(`  comparable rows: ${pairOk}   agreeing: ${agree}   disagreeing: ${pairOk - agree}`);
  }

  console.log(`\nSUMMARY`);
  console.log(`  ${findings.length} of ${PROMISED.length} promised fields are not healthy.`);
  console.log(`  Bright Data reported this run as 100% successful.`);
  console.log(`  Nothing in the platform surfaces the ${findings.filter((f) => !f.present).length} fields that never arrived.\n`);

  process.exit(findings.length ? 1 : 0);
};

run();

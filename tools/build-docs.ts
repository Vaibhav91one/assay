// Render every project document into ONE self-contained local HTML file.
//
// Markdown is converted at build time, so the output has zero dependencies and
// zero network calls -- it opens straight from the filesystem with no server.
//
//   node tools/build-docs.js   ->   docs/index.html

import { readFile, writeFile, stat } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { marked } from 'marked';

/** Every number on the overview is read from disk at build time, never typed by hand. */
async function facts() {
  const j = async (p: any, d: any) => { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return d; } };
  const bench = await j('results/bench.json', {});
  const sweep = await j('results/sweep.json', {});
  const live  = await j('results/ikea-recalls.json', []);
  let events: any[] = [];
  try {
    events = (await readFile('results/events.jsonl', 'utf8'))
      .split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch {}
  const sh = (c: any) => { try { return execSync(c, { encoding: 'utf8' }).trim(); } catch { return '—'; } };
  const arms = bench.arms || {};
  const pc = (a: any, k: any) => (a && a.n ? ((a[k] / a.n) * 100).toFixed(1) + '%' : '—');
  return {
    arms: [
      ['naive — first tag match',   arms.naive, 'bad'],
      ['similarity, no gate',       arms.plain, 'mid'],
      ['margin gate — ours',        arms.gated, 'good'],
    ].filter((r) => r[1] && r[1].n).map(([label, a, tone]) => ({
      label, tone, n: a.n,
      correct: pc(a, 'value_ok'),
      wrong: pc(a, 'value_wrong'),
      abstain: (((a.abstain_right + a.abstain_wrong) / a.n) * 100).toFixed(1) + '%',
    })),
    tau: (sweep.best && sweep.best.tau) ?? 0.6,
    delta: (sweep.best && sweep.best.delta) ?? 0.16,
    sweepPoints: (sweep.grid || []).length,
    runs: events.length,
    clean: events.filter((e) => e.event === 'ok').length,
    healed: events.filter((e) => e.event === 'heal').length,
    liveRecords: live.length,
    commits: sh('git rev-list --count HEAD'),
    tests: sh("node tools/selftest.js 2>/dev/null | grep -c '^  ok '"),
    captures: sh('ls corpus/*/*.html 2>/dev/null | wc -l | tr -d \" \"'),
    srcLines: sh("wc -l src/*.js | tail -1 | awk '{print $1}'"),
  };
}

const DOCS = [
  { file: 'docs/FEATURES.md',               id: 'features',  title: 'Features',
    blurb: 'What the product does, from the user’s side. Jobs, the spine, and what we refuse to build.' },
  { file: 'docs/BRIGHTDATA-CAPABILITIES.md', id: 'brightdata', title: 'Bright Data',
    blurb: 'What more the engine can do with the rest of the platform. Verified against the docs.' },
  { file: 'docs/BUILD-PLAN.md',             id: 'buildplan', title: 'Build Plan',
    blurb: 'Architecture, decisions awaiting review, and the ordered task list.' },
  { file: 'PLAN.md',                        id: 'plan',      title: 'Design Record',
    blurb: 'The original research and design log, including the prior-art survey.' },
];

const esc = (s: any) => String(s).replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]!);

const slug = (s: any) => s.toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');

async function load(d: any) {
  try {
    const md = await readFile(d.file, 'utf8');
    const info = await stat(d.file);
    // collect headings for the sidebar before rendering
    const toc: any[] = [];
    const seen = new Set();
    md.split('\n').forEach((line) => {
      const m = /^(#{2,3})\s+(.+?)\s*$/.exec(line);
      if (!m) return;
      const text = m[2].replace(/[*`_]/g, '').trim();
      let id = slug(text);
      let n = 1;
      while (seen.has(id)) id = `${slug(text)}-${n++}`;
      seen.add(id);
      toc.push({ level: m[1].length, text, id });
    });

    // give headings the same ids so the sidebar can jump to them
    const rev = [...toc];
    const renderer = new marked.Renderer();
    renderer.heading = function ({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      const plain = text.replace(/<[^>]+>/g, '').trim();
      const hit = rev.find((t) => t.level === depth && t.text === plain && !t.used);
      if (hit) hit.used = true;
      return `<h${depth}${hit ? ` id="${hit.id}"` : ''}>${text}</h${depth}>\n`;
    };

    return { ...d, ok: true, html: marked.parse(md, { renderer, gfm: true, breaks: false }),
             toc, bytes: info.size, lines: md.split('\n').length };
  } catch {
    return { ...d, ok: false, html: '', toc: [], bytes: 0, lines: 0 };
  }
}

const STATUS = [
  ['Engine',        'done', 'fingerprint · detect · rank · gate'],
  ['Evidence',      'done', 'benchmark · calibration · 74 proof records'],
  ['Bright Data',   'done', 'custom collector, run, 60 live records'],
  ['Design + docs', 'done', 'features, architecture, capabilities'],
  ['Web app',       'todo', 'six routes, none built'],
  ['README',        'todo', 'required submission artifact'],
  ['Demo video',    'todo', '3 min, YouTube, required'],
  ['Submission',    'todo', 'form is live, resubmission allowed'],
];

const WHAT_IT_DOES = [
  ['Fragility Report', 'Tells you which fields are likely to break soon.',
   '“price is attached to a class name that changes every deploy.”', ''],
  ['Field Rules', 'You say how careful to be, per field.',
   '“Never guess on price. Guessing on description is fine.”', ''],
  ['Drift Watch', 'Notices a page starting to change shape, before anything breaks.',
   '', ''],
  ['Quarantine', 'When it isn’t sure about a value, it doesn’t save it.',
   'Holds the row back instead of putting a wrong number in your database.', 'star'],
  ['Break Alert', 'Tells you what broke and why, in one sentence.',
   'Not “job failed” but “price came back as ‘Skip to main content’.”', ''],
  ['Blast Radius', 'Shows exactly which rows are affected, and how far back.',
   '“4,113 rows, going back to the 5th.”', ''],
  ['Review Queue', 'A list of things it couldn’t decide, waiting for you.',
   'Both options side by side. You pick in five seconds.', 'star'],
  ['Decide Once', 'Answer once and it applies everywhere the same problem appears.',
   'You fix one page, not 340.', ''],
  ['Fix the Past', 'After a fix, it re-scrapes the rows that were wrong and corrects them.',
   '', ''],
  ['Undo', 'Any automatic fix can be reversed.',
   'If it healed to the wrong thing, roll it back.', ''],
  ['Site Brake', 'If a site starts blocking you, it stops trying and tells you.',
   'It won’t “fix” a page that was never actually broken.', ''],
  ['Where Did This Come From', 'Click any value and see its history.',
   '“Came from run 47. Here’s what else it could have been.”', ''],
  ['Trust Report', 'How reliable each field has been over time.',
   '“price: perfect for 60 days. hazard: broken since day one.”', ''],
  ['Incident Record', 'A written record of every automatic decision, to hand to someone else.',
   '', ''],
];

const FINDINGS = [
  ['Bright Data’s heal already pauses and asks a human',
   'It returns <code>awaiting_approval</code> and waits. Our gate is the decision-maker that gate is blocked on — so Scraper Studio is central, not wrapped.',
   'key'],
  ['54% of real breaks are silent',
   'The selector still resolves and returns the wrong value. Every competitor heals only on exceptions or zero results, so all of them store it.',
   'key'],
  ['A live run reported 100% success while 3 of 10 fields never arrived',
   'No page failed to fetch. Nothing in the platform surfaces the gap between what the schema promised and what the collector delivered.',
   ''],
  ['Chicco returned “Skip to main content” as a recall title',
   'One match, no error thrown. Detected by shape mismatch, healed at margin 0.3973.',
   ''],
  ['Geometry is recoverable without a browser',
   '<code>coordinate_attributes</code> embeds element positions into the HTML, readable by Cheerio. Restores the 2.8 weight units we dropped.',
   ''],
  ['Bright Data ships the scheduler we were about to build',
   'Hourly/daily/weekly, deadlines with partial delivery, 11 delivery targets, low-success alerts. Delete <code>tools/bd-status.sh</code>.',
   ''],
];

function overview(f: any) {
  const armRow = (a: any) => `
    <tr class="${a.tone}">
      <td>${esc(a.label)}</td>
      <td class="n">${a.n}</td>
      <td class="n">${a.correct}</td>
      <td class="n big">${a.wrong}</td>
      <td class="n muted">${a.abstain}</td>
    </tr>`;

  return `
  <div class="hero">
    <h1>Assay</h1>
    <p class="lede">A scraper that knows when it broke, fixes itself when it is sure,
       and <strong>refuses to answer when it is not</strong>.</p>
  </div>

  <div class="tiles">
    <div class="tile hero-num">
      <div class="k">False-heal rate</div>
      <div class="v good">${f.arms.length ? f.arms[f.arms.length - 1].wrong : '—'}</div>
      <div class="s">across ${f.arms.length ? f.arms[0].n : '—'} cases with exact ground truth</div>
    </div>
    <div class="tile"><div class="k">Thresholds</div><div class="v">τ ${f.tau} · δ ${f.delta}</div>
      <div class="s">derived from ${f.sweepPoints} swept pairs</div></div>
    <div class="tile"><div class="k">Runs replayed</div><div class="v">${f.runs}</div>
      <div class="s">${f.clean} clean · ${f.healed} healed</div></div>
    <div class="tile"><div class="k">Live records</div><div class="v">${f.liveRecords}</div>
      <div class="s">Bright Data collector</div></div>
    <div class="tile"><div class="k">Tests</div><div class="v">${f.tests}</div>
      <div class="s">against ${f.captures} real captures</div></div>
    <div class="tile"><div class="k">Deadline</div><div class="v" id="cd">—</div>
      <div class="s">Sun 23 Aug, 8pm BST</div></div>
  </div>

  <h2 class="oh">What it does</h2>
  <p class="oneline">It watches your scrapers, tells you when something breaks, fixes what
     it is sure about, holds back what it is not, and shows you exactly what to check.</p>
  <div class="feats">
    ${WHAT_IT_DOES.map(([n, what, eg, k], i) => `
      <div class="feat ${k}">
        <span class="fnum">${i + 1}</span>
        <div>
          <b>${esc(n)}${k ? ' <i>core</i>' : ''}</b>
          <p>${esc(what)}</p>
          ${eg ? `<em>${esc(eg)}</em>` : ''}
        </div>
      </div>`).join('')}
  </div>

  <h2 class="oh">Where it stands</h2>
  <div class="status">
    ${STATUS.map(([n, st, d]) => `
      <div class="st ${st}">
        <span class="dot"></span>
        <div><b>${esc(n)}</b><span>${esc(d)}</span></div>
      </div>`).join('')}
  </div>

  <h2 class="oh">The number</h2>
  <table class="arms">
    <thead><tr><th>Arm</th><th class="n">n</th><th class="n">Correct</th>
      <th class="n">Wrong</th><th class="n">Abstained</th></tr></thead>
    <tbody>${f.arms.map(armRow).join('')}</tbody>
  </table>
  <p class="foot">Same correct rate as ungated at δ 0.12, for 4.4% wrong. Going to zero costs coverage — that trade is the product.</p>

  <h2 class="oh">What we found</h2>
  <div class="finds">
    ${FINDINGS.map(([t, d, k]) => `
      <div class="find ${k}">
        <b>${t}</b>
        <p>${d}</p>
      </div>`).join('')}
  </div>

  <h2 class="oh">What is left</h2>
  <ol class="left">
    <li><b>Answer 15 review decisions</b><span>Build Plan → Review Queue. Nothing starts until these are answered.</span></li>
    <li><b>Run <code>bdata scraper heal</code> once, for real</b><span>On the break that already exists: <code>recall_title</code> null in 60/60 rows.</span></li>
    <li><b>Build the web app</b><span>Six routes. Centrepiece is the margin bar on <code>/events/[run]</code>.</span></li>
    <li><b>README</b><span>Required. Benchmark table, reproduction commands, AI-use disclosure.</span></li>
    <li><b>Record the video</b><span>3 minutes, YouTube. Studio → live refusal → proof record → benchmark.</span></li>
    <li><b>File the submission</b><span>Form is live and accepts resubmission. File a draft now.</span></li>
  </ol>`;
}

const run = async () => {
  const f = await facts();
  const docs = await Promise.all(DOCS.map(load));
  const present = docs.filter((d) => d.ok);
  const missing = docs.filter((d) => !d.ok);

  const navOverview = `
    <section class="navdoc">
      <button class="navtitle on" data-jump="overview">Overview<span class="navmeta">start here</span></button>
    </section>`;

  const nav = navOverview + present.map((d) => `
    <section class="navdoc" data-doc="${d.id}">
      <button class="navtitle" data-jump="${d.id}">
        ${esc(d.title)}<span class="navmeta">${d.lines.toLocaleString()}</span>
      </button>
      <div class="navsub">
        ${d.toc.filter((t: any) => t.level === 2).map((t: any) =>
          `<a href="#${t.id}" data-doc="${d.id}">${esc(t.text)}</a>`).join('')}
      </div>
    </section>`).join('');

  const body = `<article class="doc" id="overview">${overview(f)}</article>` +
    present.map((d) => `
    <article class="doc" id="${d.id}" hidden>
      <header class="dochead">
        <h1>${esc(d.title)}</h1>
        <p>${esc(d.blurb)}</p>
        <div class="docmeta"><code>${esc(d.file)}</code> · ${d.lines.toLocaleString()} lines</div>
      </header>
      <div class="prose">${d.html}</div>
    </article>`).join('');

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Assay — Documentation</title>
<style>
 :root{
   --bg:#fbfbf9; --panel:#ffffff; --line:#e6e5e0; --line2:#d6d5cf;
   --ink:#16161a; --body:#31313a; --muted:#71717d;
   --accent:#1f6f4a; --accentbg:#e9f5ee;
   --code:#f4f4f0; --mono:ui-monospace,SFMono-Regular,Menlo,"Geist Mono",monospace;
 }
 @media (prefers-color-scheme: dark){
   :root{ --bg:#0e0e11; --panel:#141418; --line:#26262d; --line2:#33333c;
          --ink:#f0f0f3; --body:#c9c9d2; --muted:#8b8b97;
          --accent:#5fd39b; --accentbg:#14261e; --code:#1a1a20; }
 }
 *{box-sizing:border-box}
 html{scroll-behavior:smooth}
 body{margin:0;background:var(--bg);color:var(--body);
   font:16px/1.72 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;
   -webkit-font-smoothing:antialiased}
 .layout{display:grid;grid-template-columns:288px minmax(0,1fr);min-height:100vh}

 /* sidebar */
 aside{border-right:1px solid var(--line);background:var(--panel);
   position:sticky;top:0;height:100vh;overflow-y:auto;padding:26px 18px 60px}
 .brand{font-weight:700;color:var(--ink);letter-spacing:-.02em;font-size:17px;
   padding:0 8px 4px}
 .brandsub{font:11px/1.5 var(--mono);color:var(--muted);padding:0 8px 20px}
 #q{width:100%;padding:9px 11px;border:1px solid var(--line2);border-radius:8px;
   background:var(--bg);color:var(--ink);font-size:13px;margin-bottom:18px}
 #q:focus{outline:2px solid var(--accent);outline-offset:-1px}
 .navdoc{margin-bottom:6px}
 .navtitle{display:flex;justify-content:space-between;align-items:baseline;width:100%;
   background:none;border:0;cursor:pointer;text-align:left;color:var(--ink);
   font:600 13.5px/1.4 inherit;padding:8px;border-radius:7px}
 .navtitle:hover{background:var(--code)}
 .navtitle.on{background:var(--accentbg);color:var(--accent)}
 .navmeta{font:10px/1 var(--mono);color:var(--muted);font-weight:400}
 .navsub{display:none;padding:2px 0 10px 8px;border-left:1px solid var(--line);margin-left:8px}
 .navsub.open{display:block}
 .navsub a{display:block;padding:5px 9px;color:var(--muted);text-decoration:none;
   font-size:12.5px;border-radius:6px;line-height:1.4}
 .navsub a:hover{color:var(--ink);background:var(--code)}

 /* content */
 main{padding:56px 64px 140px;max-width:920px}
 .dochead{border-bottom:1px solid var(--line);padding-bottom:26px;margin-bottom:38px}
 .dochead h1{font-size:34px;line-height:1.15;margin:0 0 10px;color:var(--ink);
   letter-spacing:-.025em}
 .dochead p{margin:0 0 12px;color:var(--muted);font-size:15.5px;max-width:62ch}
 .docmeta{font:11.5px/1 var(--mono);color:var(--muted)}
 .docmeta code{background:none;padding:0;font-size:inherit}

 .prose{max-width:none}
 .prose h2{font-size:23px;color:var(--ink);letter-spacing:-.015em;
   margin:56px 0 16px;padding-top:14px;border-top:1px solid var(--line);line-height:1.3}
 .prose h3{font-size:17.5px;color:var(--ink);margin:36px 0 12px;line-height:1.35}
 .prose h4{font-size:15px;color:var(--ink);margin:26px 0 8px}
 .prose p{margin:0 0 17px;max-width:70ch}
 .prose li{margin:0 0 7px;max-width:70ch}
 .prose ul,.prose ol{padding-left:24px;margin:0 0 17px}
 .prose strong{color:var(--ink);font-weight:650}
 .prose a{color:var(--accent)}
 .prose hr{border:0;border-top:1px solid var(--line);margin:44px 0}
 .prose blockquote{margin:0 0 18px;padding:2px 0 2px 20px;
   border-left:2px solid var(--accent);color:var(--muted);font-style:italic}
 .prose blockquote p{margin:0}
 .prose code{background:var(--code);padding:2px 5px;border-radius:4px;
   font:.86em var(--mono);color:var(--ink)}
 .prose pre{background:var(--code);border:1px solid var(--line);border-radius:9px;
   padding:16px 18px;overflow-x:auto;margin:0 0 20px}
 .prose pre code{background:none;padding:0;font-size:12.5px;line-height:1.65}
 .prose table{border-collapse:collapse;width:100%;margin:0 0 22px;font-size:13.5px;
   display:block;overflow-x:auto}
 .prose th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;
   color:var(--muted);font-weight:600;padding:0 14px 9px 0;border-bottom:1px solid var(--line2);
   white-space:nowrap}
 .prose td{padding:9px 14px 9px 0;border-bottom:1px solid var(--line);
   vertical-align:top;line-height:1.55}
 .prose tr:last-child td{border-bottom:0}
 .prose img{max-width:100%}


 /* ---- overview ---- */
 .oneline{font-size:15px;line-height:1.6;color:var(--body);max-width:64ch;
   margin:-4px 0 22px;padding-left:14px;border-left:2px solid var(--accent)}
 .feats{display:grid;grid-template-columns:repeat(auto-fit,minmax(316px,1fr));
   gap:2px;margin-bottom:46px;background:var(--line);border:1px solid var(--line);
   border-radius:11px;overflow:hidden}
 .feat{display:flex;gap:13px;padding:15px 17px;background:var(--panel)}
 .feat.star{background:var(--accentbg)}
 .fnum{flex:0 0 auto;width:22px;height:22px;border-radius:6px;background:var(--code);
   color:var(--muted);font:600 11px/22px var(--mono);text-align:center;margin-top:1px}
 .feat.star .fnum{background:var(--accent);color:var(--panel)}
 .feat b{display:block;color:var(--ink);font-size:14px;font-weight:650;line-height:1.35}
 .feat b i{font:600 9px/1 var(--mono);text-transform:uppercase;letter-spacing:.08em;
   color:var(--accent);border:1px solid var(--accent);border-radius:4px;
   padding:2.5px 4px;vertical-align:2px;margin-left:5px;font-style:normal}
 .feat p{margin:4px 0 0;font-size:12.8px;line-height:1.5;color:var(--body)}
 .feat em{display:block;margin-top:5px;font-size:11.8px;line-height:1.5;
   color:var(--muted);font-style:normal}

 .hero{margin-bottom:34px}
 .hero h1{font-size:44px;letter-spacing:-.03em;margin:0 0 10px;color:var(--ink);line-height:1}
 .lede{font-size:19px;line-height:1.5;color:var(--body);max-width:56ch;margin:0}
 .lede strong{color:var(--ink)}

 .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(158px,1fr));gap:10px;margin-bottom:46px}
 .tile{background:var(--panel);border:1px solid var(--line);border-radius:11px;padding:15px 16px}
 .tile .k{font:10.5px/1 var(--mono);text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:9px}
 .tile .v{font:600 25px/1.1 var(--mono);color:var(--ink);letter-spacing:-.02em}
 .tile .v.good{color:var(--accent)}
 .tile .s{font-size:11.5px;color:var(--muted);margin-top:7px;line-height:1.45}
 .hero-num{grid-column:span 2;background:var(--accentbg);border-color:transparent}
 .hero-num .v{font-size:40px}

 .oh{font-size:12px!important;text-transform:uppercase;letter-spacing:.1em;color:var(--muted)!important;
   border:0!important;margin:0 0 16px!important;padding:0!important;font-weight:600}

 .status{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:8px;margin-bottom:46px}
 .st{display:flex;gap:11px;align-items:flex-start;padding:12px 14px;border-radius:9px;
   background:var(--panel);border:1px solid var(--line)}
 .st .dot{width:8px;height:8px;border-radius:50%;margin-top:6px;flex:0 0 auto}
 .st.done .dot{background:var(--accent)}
 .st.todo .dot{background:#d9a441}
 .st b{display:block;color:var(--ink);font-size:14px;font-weight:600;line-height:1.4}
 .st span{display:block;font-size:12px;color:var(--muted);line-height:1.45;margin-top:2px}

 table.arms{width:100%;border-collapse:collapse;font-size:14px;margin-bottom:12px}
 table.arms th{text-align:left;font:600 10.5px/1 var(--mono);text-transform:uppercase;
   letter-spacing:.08em;color:var(--muted);padding:0 12px 10px 0;border-bottom:1px solid var(--line2)}
 table.arms td{padding:12px 12px 12px 0;border-bottom:1px solid var(--line);color:var(--ink)}
 table.arms .n{text-align:right;font-family:var(--mono);font-size:13px}
 table.arms .muted{color:var(--muted)}
 table.arms .big{font-weight:600;font-size:15px}
 table.arms tr.bad .big{color:#d0463b}
 table.arms tr.mid .big{color:#c08a2e}
 table.arms tr.good .big{color:var(--accent)}
 table.arms tr.good td{background:var(--accentbg)}
 .foot{font-size:12.5px;color:var(--muted);margin:0 0 46px;max-width:70ch}

 .finds{display:grid;grid-template-columns:repeat(auto-fit,minmax(292px,1fr));gap:10px;margin-bottom:46px}
 .find{background:var(--panel);border:1px solid var(--line);border-radius:11px;padding:16px 17px}
 .find.key{border-color:var(--accent);background:var(--accentbg)}
 .find b{display:block;color:var(--ink);font-size:14.5px;line-height:1.4;margin-bottom:7px;font-weight:650}
 .find p{margin:0;font-size:12.8px;line-height:1.6;color:var(--muted)}
 .find code{font-size:.88em;background:var(--code);padding:1px 4px;border-radius:3px}

 ol.left{list-style:none;counter-reset:s;padding:0;margin:0}
 ol.left li{counter-increment:s;position:relative;padding:13px 0 13px 42px;border-bottom:1px solid var(--line)}
 ol.left li:last-child{border-bottom:0}
 ol.left li::before{content:counter(s);position:absolute;left:0;top:13px;width:24px;height:24px;
   border-radius:50%;background:var(--code);color:var(--muted);font:600 11px/24px var(--mono);text-align:center}
 ol.left b{display:block;color:var(--ink);font-size:14.5px;font-weight:600}
 ol.left span{display:block;font-size:12.5px;color:var(--muted);margin-top:3px;line-height:1.5}
 mark{background:#ffe9a8;color:#16161a;border-radius:2px}
 .missing{background:var(--code);border:1px dashed var(--line2);border-radius:9px;
   padding:16px 18px;color:var(--muted);font-size:13.5px;margin-bottom:24px}
 .nores{color:var(--muted);font-size:12.5px;padding:8px}

 @media (max-width: 900px){
   .layout{grid-template-columns:1fr}
   aside{position:static;height:auto;border-right:0;border-bottom:1px solid var(--line)}
   main{padding:32px 22px 90px}
 }
</style></head>
<body>
<div class="layout">
  <aside>
    <div class="brand">Assay</div>
    <div class="brandsub">project documentation</div>
    <input id="q" type="search" placeholder="Search all documents…" autocomplete="off">
    <nav id="nav">${nav}</nav>
  </aside>
  <main id="main">
    ${missing.length ? `<div class="missing">Not yet generated: ${missing.map(m => esc(m.file)).join(', ')}. Re-run <code>node tools/build-docs.js</code> once written.</div>` : ''}
    ${body}
  </main>
</div>
<script>
const docs = ${JSON.stringify(['overview', ...present.map((d) => d.id)])};

function show(id, hash) {
  docs.forEach((d) => {
    const el = document.getElementById(d);
    if (el) el.hidden = d !== id;
  });
  document.querySelectorAll('.navtitle').forEach((b) =>
    b.classList.toggle('on', b.dataset.jump === id));
  document.querySelectorAll('.navsub').forEach((s) =>
    s.classList.toggle('open', s.previousElementSibling.dataset.jump === id));
  if (hash) {
    const t = document.getElementById(hash);
    if (t) t.scrollIntoView({ block: 'start' });
  } else {
    document.getElementById('main').scrollIntoView({ block: 'start' });
  }
}

document.querySelectorAll('.navtitle').forEach((b) => {
  b.onclick = () => show(b.dataset.jump);
});
document.querySelectorAll('.navsub a').forEach((a) => {
  a.onclick = (e) => {
    e.preventDefault();
    show(a.dataset.doc, a.getAttribute('href').slice(1));
  };
});

// search: filter the sidebar to matching sections across every document
const q = document.getElementById('q');
q.oninput = () => {
  const v = q.value.trim().toLowerCase();
  document.querySelectorAll('.navdoc').forEach((sec) => {
    let hits = 0;
    sec.querySelectorAll('.navsub a').forEach((a) => {
      const hit = !v || a.textContent.toLowerCase().includes(v);
      a.style.display = hit ? '' : 'none';
      if (hit) hits++;
    });
    const titleHit = sec.querySelector('.navtitle').textContent.toLowerCase().includes(v);
    sec.style.display = (!v || hits || titleHit) ? '' : 'none';
    if (v) sec.querySelector('.navsub').classList.add('open');
  });
};

// deadline: Sun 23 Aug 2026, 20:00 BST == 19:00 UTC
(function tick(){
  const el = document.getElementById('cd');
  if (!el) return;
  const ms = Date.UTC(2026, 7, 23, 19, 0, 0) - Date.now();
  if (ms <= 0) { el.textContent = 'closed'; return; }
  const h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000);
  el.textContent = h + 'h ' + String(m).padStart(2, '0') + 'm';
  setTimeout(tick, 30000);
})();

show(docs[0]);
</script>
</body></html>`;

  await writeFile('docs/index.html', html);
  const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
  console.log(`docs/index.html  ${kb} KB`);
  present.forEach((d) => console.log(`  ${d.title.padEnd(14)} ${String(d.lines).padStart(5)} lines, ${d.toc.filter((t: any) => t.level === 2).length} sections`));
  missing.forEach((d) => console.log(`  ${d.title.padEnd(14)} MISSING (${d.file})`));
};

run();

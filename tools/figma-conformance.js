// Design conformance audit for the Assay Figma file (page `04 · Screens`).
//
// It stays JavaScript while the rest of the repo is TypeScript, and that is the
// point rather than an omission: the body below ends in a top-level `return`,
// which no ES module may contain. It is a payload for another runtime's
// evaluator, in the same category as the generated `dist/fingerprint.js`.
//
// This is not a Node script. Paste the body into the Figma MCP `use_figma` tool:
//   use_figma({ fileKey: 'FYnhhLeMulixqTTyjP7gJd',
//               description: 'Run design conformance audit',
//               skillNames: 'figma-use', code: <body of run()> })
//
// It mutates nothing. It returns `{frames, summary, detail}`; every count in
// `summary` must be 0. `detail` lists up to 10 offenders per rule.
//
// Rules, and why each exists:
//   paletteMismatch  a swatch whose fill disagrees with its own printed hex
//   barColour        data bars must be semantic/link, tracks border/hairline
//   orangeButtons    accent/brand is for brand primaries only, not every verb
//   snakeProse       snake_case belongs in schema tables and code, not prose
//   isoDates         displayed dates read "4 Aug 2026", not "2026-08-04"
//   iconMismatch     the glyph must match the verb (copy is not settings)
//   notCentred       button content sits on the button's centre line
//   overlap          two texts sharing pixels with no opaque ground between
//   rasterLogo       the mark is vector; no image fills named logo/*
//   logoArtOffset    a LogoMark instance whose artwork drifted from 0,0
//   connectorNoBrand every connector panel shows whose service it is
//   devNotes         no spec:/TODO/CRITIQUE commentary on a product surface
//   hover            disclosure affordances actually carry an ON_HOVER reaction
//   selfNarration    the product explaining or reassuring instead of informing
//   filledButtonIcon a glyph on a filled button reads accent/on-primary
//   greyBlockBordered  a content block takes surface/subtle OR a border, never both
//   unequalPeers     peer cards standing side by side share a height
//   boundLiteralDrift  a paint's literal colour still agrees with the token it claims
//
// Two detector bugs were found and fixed while writing this; both had made a
// clean file look dirty. Kept as a warning: a failing rule is a claim about the
// design AND about the rule. Check which one is wrong before editing the file.
//   - palette pairing matched every swatch to the FIRST hex label on the page
//   - a text node whose name equals its own characters is an identifier cell
//     (data), not prose, so it is exempt from snakeProse
//
// selfNarration is a LEXICON, not a length test, and that is deliberate. The
// screens are full of long prose that must stay -- a break diagnosis, an error,
// an empty state's one message. Only the register is wrong: the product
// narrating its own behaviour or reassuring without adding fact. A length rule
// would flag the diagnosis and miss a short 'nothing was written to your data'.
// It follows that the lexicon is not exhaustive -- extend it when a new phrasing
// slips through, rather than trusting a 0 here to mean the screens are clean.
// Exempt: `conduct` is a public policy page where prose IS the content, and
// tooltip frames are hover bodies.
// The last four rules came out of a review that found three *systemic* classes --
// each flagged on one screen, each really present on several. All three were
// audited across the board BEFORE anything was fixed, and two of the three
// audits changed shape once measured. That is why each carries an exemption:
//
// filledButtonIcon -- fallout from the semantic recolour that moved buttons to
// green/blue/red without recolouring the glyphs inside them. Only *filled*
// buttons are in scope (fill bound to brand/success/danger/warning/sidebar-ink);
// secondary and ghost buttons sit on white and their ink glyph is correct there.
// Scoped to button|action|tab so a filled card does not drag its content in.
//
// greyBlockBordered -- 24 nodes on the board take a surface/subtle fill and that
// is a legitimate, distinct treatment: chat bubbles, code blocks, sidebar
// callouts. Grey fill is NOT the defect. Doing BOTH is: fill *and* border double
// the container and read as a disabled field. Exempt inline pills -- a keycap or
// status chip is grey-with-border by design -- via name and via size, since a
// block is >=120x40 and a pill is not. Do not "simplify" this to a fill test;
// that was the first draft and it flagged 24 nodes, 22 of them correct.
//
// unequalPeers -- 14 rows on the board have children of unequal height and 12 of
// them are right: a main+aside layout SHOULD be lopsided. Peerhood is the test,
// and width ratio measures it -- real peers came in at 1.0 and 1.26, main+aside
// at 2.43, so 1.5 separates them cleanly. Children must also be substantial
// blocks (>=200x60), which is what keeps table cells, nav items and button
// clusters out. Deliberately NOT matched on child names: the three real peer
// rows are named col/*, card/*, and one chart/* + card/* pair, so any name list
// would have missed two of the three.
//
// boundLiteralDrift -- not from the review; found while fixing it. A Figma paint
// carries a literal RGB *and* an optional variable binding, and the renderer
// draws the literal. So a paint can claim a token and paint a different colour,
// and every by-token audit above will read it as correct. This was hiding a real
// bug: the sidebar's home icon was bound to accent/brand in all six variants
// (a copy-paste from Active=Home) and only looked right because its literal was
// still grey. Fix the binding when they disagree, not the literal -- the literal
// is what you can see, so if it looks right the binding is usually what is wrong.
//
// Do not widen 'nothing ... written' to sent/published/lost. Each of those three
// occurs exactly once on the board and each carries a fact the user is owed:
// where a pasted key goes (connect), that the undo window is still open
// (decide-once), that the store being down cost no data (runs · store
// unreachable). Widening the verb makes this rule permanently red on copy that
// is correct.

async function run() {
  const page = figma.root.children.find(p => p.name === '04 · Screens');
  await page.loadAsync();
  const comp = figma.root.children.find(p => p.name === '04 · Components');
  await comp.loadAsync();
  const hex = c => '#' + [c.r, c.g, c.b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  const V = {};
  for (const c of await figma.variables.getLocalVariableCollectionsAsync())
    for (const id of c.variableIds) { const v = await figma.variables.getVariableByIdAsync(id); V[v.name] = v.id; }
  const bound = n => { const f = Array.isArray(n.fills) && n.fills[0]; return f && f.boundVariables && f.boundVariables.color ? f.boundVariables.color.id : null; };
  const LM = comp.findOne(n => n.type === 'COMPONENT' && n.name === 'LogoMark');
  const iset = comp.findOne(n => n.type === 'COMPONENT_SET' && n.name === 'Icon');

  const frames = [];
  for (const s of page.children.filter(n => n.type === 'SECTION'))
    for (const fr of s.findAll(n => n.type === 'FRAME' && n.parent.type === 'SECTION'))
      frames.push({ fr, loc: s.name.slice(0, 2) + '/' + fr.name });
  const R = {};

  // -- palette: pair each swatch with the hex label physically nearest it
  const pal = page.children.find(n => n.name === 'Color Palette');
  const hexTexts = pal.findAll(t => t.type === 'TEXT' && /^#[0-9A-Fa-f]{6}$/.test(t.characters.trim()));
  R.paletteMismatch = [];
  pal.findAll(n => n.type !== 'TEXT' && Array.isArray(n.fills) && n.fills[0] && n.fills[0].type === 'SOLID' && n.width < 200).forEach(sw => {
    const a = sw.absoluteBoundingBox; if (!a) return;
    let best = null, bd = 1e9;
    hexTexts.forEach(t => {
      const b = t.absoluteBoundingBox; if (!b) return;
      const d = Math.hypot((a.x + a.width / 2) - (b.x + b.width / 2), (a.y + a.height / 2) - (b.y + b.height / 2));
      if (d < bd) { bd = d; best = t; }
    });
    if (best && bd < 140 && best.characters.trim().toLowerCase() !== hex(sw.fills[0].color).toLowerCase())
      R.paletteMismatch.push(`${sw.name}: ${hex(sw.fills[0].color)} vs ${best.characters}`);
  });

  R.barColour = [];
  frames.forEach(({ loc, fr }) => fr.findAll(n => /^(bar|progress)\/(fill|track)$/.test(n.name) && Array.isArray(n.fills) && n.fills.length).forEach(n => {
    const want = /\/fill$/.test(n.name) ? V['semantic/link'] : V['border/hairline'];
    if (bound(n) !== want) R.barColour.push(`${loc}/${n.name}`);
  }));

  const BRAND_OK = /new scrape|sign ?in|request access|start watching|create key|magic link|continue|send$|watch the|build the scraper/i;
  R.orangeButtons = [];
  frames.forEach(({ loc, fr }) => fr.findAll(n => /^(button|action)\//.test(n.name) && n.type === 'FRAME' && Array.isArray(n.fills) && n.fills[0] && n.fills[0].type === 'SOLID').forEach(n => {
    if (bound(n) !== V['accent/brand']) return;
    const t = n.findOne(x => x.type === 'TEXT');
    // absolute-layout buttons keep their label as a sibling, so fall back to the name
    const label = t ? t.characters.trim() : n.name.replace(/^button\/|^action\//, '').replace(/-/g, ' ');
    if (!BRAND_OK.test(label)) R.orangeButtons.push(`${loc} · "${label}"`);
  }));

  const inData = n => { let p = n.parent; while (p) { if (/^(table|cell|row\/(header|assay)|card\/(code|curl|steps))/i.test(p.name)) return true; p = p.parent; } return false; };
  const LITERAL = /[{}\[\]"]|sha256|^collector |mcp_servers|^\s*"|=|\bnpx\b|ASSAY_|ANTHROPIC_/;
  R.snakeProse = [];
  frames.forEach(({ loc, fr }) => fr.findAll(n => n.type === 'TEXT').forEach(t => {
    const c = t.characters;
    const isCell = t.name.trim() === c.trim() && /^[a-z0-9_]+$/.test(c.trim());
    if (/[a-z0-9]+_[a-z]/.test(c) && !inData(t) && !LITERAL.test(c) && !isCell && !/^label\/field$|^cell\//.test(t.name))
      R.snakeProse.push(`${loc} :: ${c.slice(0, 40)}`);
  }));

  R.isoDates = [];
  frames.forEach(({ loc, fr }) => fr.findAll(n => n.type === 'TEXT' && /\d{4}-\d{2}-\d{2}/.test(n.characters)).forEach(t => {
    if (!/^card\/(code|curl)/.test(t.parent.name)) R.isoDates.push(`${loc} :: ${t.characters.slice(0, 36)}`);
  }));

  const WANT = [[/^copy/i, 'copy'], [/download/i, 'download'], [/^export/i, 'download'], [/^docs$/i, 'paperclip'],
    [/^retry|^re-check|^re-scrape|^resume|^undo|^repair (all|five)/i, 'refresh'], [/^use |^looks right|^save /i, 'check'],
    [/^see |^view /i, 'eye'], [/^add /i, 'plus'], [/^cancel run/i, 'circleX'], [/^unheal/i, 'circleX'], [/^send a test/i, 'mail']];
  R.iconMismatch = [];
  frames.forEach(({ loc, fr }) => fr.findAll(n => /^(button|action)\//.test(n.name) && n.type === 'FRAME').forEach(n => {
    const t = n.findOne(x => x.type === 'TEXT'); if (!t) return;
    const L = t.characters.trim(), rule = WANT.find(([re]) => re.test(L)); if (!rule) return;
    const ic = n.findAll(x => x.type === 'INSTANCE').find(x => { try { return x.mainComponent && x.mainComponent.parent && x.mainComponent.parent.id === iset.id; } catch (e) { return false; } });
    if (!ic) return;
    const got = ic.mainComponent.name.replace(/^Name=/, '');
    if (got !== rule[1]) R.iconMismatch.push(`${loc} · "${L}" ${got}!=${rule[1]}`);
  }));

  R.notCentred = [];
  frames.forEach(({ loc, fr }) => fr.findAll(n => /^(button|action|tab)\//.test(n.name) && n.type === 'FRAME').forEach(b => {
    if (b.layoutMode && b.layoutMode !== 'NONE') {
      if (Math.abs(b.paddingTop - b.paddingBottom) > 0.5) R.notCentred.push(`${loc}/${b.name} pad`);
      if (b.counterAxisAlignItems !== 'CENTER') R.notCentred.push(`${loc}/${b.name} cross`);
      return;
    }
    const pool = (b.children && b.children.length ? b.children : (b.parent.children || []).filter(o => o !== b));
    const B = b.absoluteBoundingBox; if (!B) return;
    const ins = pool.filter(o => o.absoluteBoundingBox && (o.type === 'TEXT' || o.type === 'INSTANCE') &&
      o.absoluteBoundingBox.x >= B.x - 2 && o.absoluteBoundingBox.x + o.absoluteBoundingBox.width <= B.x + B.width + 2 &&
      o.absoluteBoundingBox.y >= B.y - 8 && o.absoluteBoundingBox.y + o.absoluteBoundingBox.height <= B.y + B.height + 8);
    if (!ins.length) return;
    const y0 = Math.min(...ins.map(o => o.absoluteBoundingBox.y)), y1 = Math.max(...ins.map(o => o.absoluteBoundingBox.y + o.absoluteBoundingBox.height));
    const dy = (B.y + B.height / 2) - (y0 + y1) / 2;
    if (Math.abs(dy) >= 1) R.notCentred.push(`${loc}/${b.name} dy=${Math.round(dy * 10) / 10}`);
  }));

  // two texts sharing pixels are fine only when separate opaque grounds stack them
  const opaque = n => { let p = n.parent; while (p && p.type !== 'PAGE') { if (Array.isArray(p.fills) && p.fills.some(f => f.type === 'SOLID' && f.visible !== false && (f.opacity === undefined || f.opacity > 0.95))) return p; p = p.parent; } return null; };
  R.overlap = [];
  frames.forEach(({ loc, fr }) => {
    const ts = fr.findAll(n => n.type === 'TEXT' && n.visible && n.absoluteBoundingBox);
    for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) {
      const a = ts[i].absoluteBoundingBox, b = ts[j].absoluteBoundingBox;
      const ix = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const iy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      if (ix <= 1.5 || iy <= 1.5) continue;
      const ga = opaque(ts[i]), gb = opaque(ts[j]); if (ga && gb && ga !== gb) continue;
      R.overlap.push(`${loc}: "${ts[i].characters.slice(0, 18)}" x "${ts[j].characters.slice(0, 18)}"`);
    }
  });

  R.rasterLogo = [];
  frames.forEach(({ loc, fr }) => fr.findAll(n => /logo/i.test(n.name) && Array.isArray(n.fills) && n.fills.some(f => f.type === 'IMAGE'))
    .forEach(n => R.rasterLogo.push(`${loc}/${n.name}`)));

  R.logoArtOffset = [];
  if (LM) frames.forEach(({ loc, fr }) => fr.findAll(n => n.type === 'INSTANCE' && n.mainComponent && n.mainComponent.id === LM.id).forEach(n => {
    const k = n.children[0];
    if (k && (Math.abs(k.x) > 0.6 || Math.abs(k.y) > 0.6)) R.logoArtOffset.push(`${loc}/${n.name} kid@${Math.round(k.x)},${Math.round(k.y)}`);
  }));

  R.connectorNoBrand = [];
  ['connect', 'connect · codex', 'connect · claude-ai', 'connect · bright-data', 'connect · model'].forEach(nm => {
    const f = frames.find(x => x.fr.name === nm); if (!f) return;
    if (!f.fr.findOne(n => n.name === 'row/brand' || n.name === 'BrandRow')) R.connectorNoBrand.push(nm);
  });

  R.devNotes = [];
  frames.forEach(({ loc, fr }) => fr.findAll(n => n.type === 'TEXT' && /^spec:|docs\/CRITIQUE|TODO\b|FIXME/.test(n.characters)).forEach(() => R.devNotes.push(loc)));

  R.hover = [];
  for (const { loc, fr } of frames)
    for (const n of fr.findAll(x => /^action\/why$/.test(x.name) || /^marker\/run-/.test(x.name))) {
      const rs = [...(n.reactions || []), ...((n.children || []).flatMap(c => c.reactions || []))];
      if (!rs.some(r => r.trigger && r.trigger.type === 'ON_HOVER')) R.hover.push(`${loc}/${n.name}`);
    }

  R.selfNarration = [];
  {
    const NARRATE = /(nothing (here |else )?(has been|is|was) written|went through on its own|you will only hear from|is (the reason|why) this (project|product) exists|that is the whole feature|pretending to be a quiet day|not sure enough to publish|left (them|it) alone and saved|nothing runs more often than)/i;
    const EXEMPT = /^(conduct|tooltip)/;
    frames.forEach(({ loc, fr }) => {
      if (EXEMPT.test(fr.name)) return;
      fr.findAll(n => n.type === 'TEXT').forEach(n => {
        const fam = n.fontName && n.fontName !== figma.mixed ? n.fontName.family : '';
        if (fam.includes('Mono')) return;
        if (NARRATE.test(n.characters)) R.selfNarration.push(`${loc}/${n.name}`);
      });
    });
  }

  const NAME = {}; for (const k in V) NAME[V[k]] = k;
  const RES = {};
  for (const c of await figma.variables.getLocalVariableCollectionsAsync())
    for (const id of c.variableIds) { const v = await figma.variables.getVariableByIdAsync(id);
      if (v.resolvedType === 'COLOR') RES[v.id] = v.valuesByMode[c.defaultModeId]; }
  const bid = p => p && p.boundVariables && p.boundVariables.color ? p.boundVariables.color.id : null;
  const fillVar = n => { const f = Array.isArray(n.fills) && n.fills[0]; return f && f.type === 'SOLID' ? bid(f) : null; };

  const FILLED = ['accent/brand', 'semantic/success', 'semantic/danger', 'semantic/warning', 'bg/sidebar'].map(k => V[k]);
  R.filledButtonIcon = [];
  frames.forEach(({ loc, fr }) => fr.findAll(n => /^(button|action|tab)\//.test(n.name) && n.type === 'FRAME').forEach(b => {
    if (!FILLED.includes(fillVar(b))) return;
    for (const inst of b.findAll(x => x.type === 'INSTANCE'))
      for (const p of inst.findAll(x => ['VECTOR', 'ELLIPSE', 'RECTANGLE'].includes(x.type)))
        for (const key of ['strokes', 'fills']) {
          if (!Array.isArray(p[key])) continue;
          for (const paint of p[key]) {
            if (!paint || paint.type !== 'SOLID' || paint.visible === false) continue;
            const v = bid(paint);
            if (v !== V['accent/on-primary'])
              R.filledButtonIcon.push(`${loc}/${b.name} ${p.name}.${key} ${v ? NAME[v] : hex(paint.color)}`);
          }
        }
  }));

  const INLINE = /^(chip|badge|KeyHint|kbd|tag|pill|dot)/i;
  R.greyBlockBordered = [];
  frames.forEach(({ loc, fr }) => fr.findAll(n => fillVar(n) === V['surface/subtle']).forEach(n => {
    if (INLINE.test(n.name) || n.width < 120 || n.height < 40) return;
    if (Array.isArray(n.strokes) && n.strokes.some(s => s && s.visible !== false))
      R.greyBlockBordered.push(`${loc}/${n.name} ${Math.round(n.width)}x${Math.round(n.height)}`);
  }));

  R.unequalPeers = [];
  frames.forEach(({ loc, fr }) => fr.findAll(n => n.type === 'FRAME' && n.layoutMode === 'HORIZONTAL').forEach(row => {
    const kids = row.children.filter(c => c.visible && c.layoutPositioning !== 'ABSOLUTE');
    if (kids.length < 2) return;
    if (!kids.every(c => (c.type === 'FRAME' || c.type === 'INSTANCE') && c.absoluteBoundingBox &&
      c.absoluteBoundingBox.width >= 200 && c.absoluteBoundingBox.height >= 60)) return;
    const w = kids.map(k => k.absoluteBoundingBox.width), h = kids.map(k => k.absoluteBoundingBox.height);
    if (Math.max(...w) / Math.min(...w) >= 1.5) return;
    if (Math.max(...h) - Math.min(...h) > 1)
      R.unequalPeers.push(`${loc}/${row.name} h[${h.map(Math.round)}] w[${w.map(Math.round)}]`);
  }));

  const near = (a, b) => Math.abs(a.r - b.r) < 0.004 && Math.abs(a.g - b.g) < 0.004 && Math.abs(a.b - b.b) < 0.004;
  R.boundLiteralDrift = [];
  frames.forEach(({ loc, fr }) => fr.findAll(() => true).forEach(n => {
    for (const key of ['fills', 'strokes']) {
      if (!Array.isArray(n[key])) continue;
      for (const p of n[key]) {
        if (!p || p.type !== 'SOLID') continue;
        const v = bid(p); if (!v || !RES[v]) continue;
        if (!near(p.color, RES[v])) R.boundLiteralDrift.push(`${loc}/${n.name}.${key} ${hex(p.color)}!=${NAME[v]}`);
      }
    }
  }));

  const summary = {}; for (const k of Object.keys(R)) summary[k] = R[k].length;
  return { frames: frames.length, summary, detail: Object.fromEntries(Object.entries(R).filter(([, v]) => v.length).map(([k, v]) => [k, v.slice(0, 10)])) };
}

return run();

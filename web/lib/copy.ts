// Every user-visible string that is a CONSTANT, in one place, in the shape an
// i18n catalogue takes.
//
// WHY THIS SHAPE. A flat `key -> string` map is exactly `en.json`. Nesting it
// by surface would read more nicely here and would then have to be flattened
// again by any runtime that consumed it, so the namespace lives in the key --
// `decisions.empty.title`, not `{ decisions: { empty: { title } } }`. Adding a
// runtime later is a swap of the `t` below, not a rewrite of every call site.
//
// KEYS DESCRIBE WHERE AND WHAT, NEVER THE ENGLISH. `runs.table.head.what` and
// not `runs.table.head.whatHappened`, because the day the English changes the
// key must not. A key that is a slug of its own value has to be renamed every
// time the copy is edited, which is how catalogues rot.
//
// WHAT IS DELIBERATELY NOT HERE -- the line, drawn once:
//
//   * THE CLOSED STATUS VOCABULARY. `live` / `healed` / `quarantined` /
//     `stale` / `degraded` are `FieldStatus` in `src/envelope.ts`. They are a
//     DATA CONTRACT: they are written to `_assay.fields[].status` on every
//     published row, parsed back by `test/surfaces.test.ts`, and validated by
//     `publishRow` which throws on a value not in `STATUSES`. Translating them
//     would change what Assay writes to somebody's warehouse.
//
//   * REASON CODES. `thin_margin`, `below_tau`, `no_candidates` and the
//     `HELD_BECAUSE` table in `src/reports/vocabulary.ts`. That table is
//     already the translation layer, it already has the right rule (a code with
//     no wording prints AS a code, never as an invented adjective), and
//     `test/reports.test.ts` asserts a rendered report does NOT contain the raw
//     code. A second catalogue in front of it would be two tables disagreeing.
//     Screens read `heldBecause()`; they do not read this file for a reason.
//
//   * ENGINE-SIDE STRINGS GENERALLY. Anything under `src/` stays under `src/`.
//     This file is `web/lib`, imported by screens, and nothing in the engine
//     imports it -- so the worker, the CLI and the MCP server cannot be made to
//     depend on a UI catalogue by accident.
//
//   * SENTENCES ASSEMBLED FROM DATA. `web/lib/compare.ts`'s summary,
//     `run-flow.ts`'s node summaries, `explain.ts`'s provenance story. These
//     are not copy with a hole in it; they are prose whose SHAPE changes with
//     the data (how many scrapers moved, whether a runner-up existed). An i18n
//     catalogue cannot express them and pretending it can is how a translated
//     app ends up with "1 changes across 1 fields". They are named in the
//     handover as the second phase, needing ICU plurals rather than this map.
//
//   * VENDORED PRIMITIVES. The shadcn files under `web/components/ui` carry
//     upstream's own a11y strings ("Close", "Toggle Sidebar"). Editing them
//     makes every future upstream sync a conflict for four words.
//
// PLACEHOLDERS. `{name}` interpolates. That is ICU's syntax for the simple
// case, so these strings paste into a real catalogue unchanged. Plurals are
// NOT handled here -- see above; a string needing one is not in this file.

const COPY = {
  // -- global chrome ---------------------------------------------------------
  'app.name': 'Assay',
  'nav.home': 'Home',
  'nav.decisions': 'Decisions',
  'nav.runs': 'Runs',
  'nav.fields': 'Fields',
  'nav.schedule': 'Schedule',
  'nav.library': 'Library',
  'nav.settings': 'Settings',
  'nav.audit': 'Audit',
  'nav.docs': 'Docs',
  // The rail's accessible name. It is what tells a landmark list this nav apart
  // from the filter nav on /runs -- two navigations both announced as
  // "navigation" is the same problem one level up.
  'nav.label': 'Main',
  'nav.newScrape': 'New scrape',
  'nav.chats': 'CHATS',
  'nav.scrapersNoChat': 'SCRAPERS WITH NO CHAT',
  'nav.newConversation': 'Start a new conversation',
  'nav.selfHosted': 'Self-hosted',
  'nav.signedIn': 'Signed in',
  'nav.noAccounts': 'No accounts on this instance',

  'topbar.loading': 'loading…',

  // -- page titles (Next metadata) -------------------------------------------
  'title.home': 'Assay',
  'title.decisions': 'Decisions · Assay',
  'title.runs': 'Runs · Assay',
  'title.run': 'Run · Assay',
  'title.fields': 'Fields · Assay',
  'title.compare': 'Compare · Assay',
  'title.schedule': 'Schedule · Assay',
  'title.settings': 'Settings · Assay',
  'title.explain': 'Where did this number come from? · Assay',
  'title.library': 'Library · Assay',
  'title.audit': 'Field audit · Assay',
  'title.values': 'Values · Assay',
  'title.signIn': 'Sign in · Assay',
  'title.configureKey': 'Configure your key · Assay',
  'title.checkEmail': 'Check your email · Assay',

  // -- decisions -------------------------------------------------------------
  'decisions.heading': 'Decisions',
  'decisions.empty.title': 'Nothing is waiting on you.',
  'decisions.empty.body':
    'Every cell in the last run was either published or is still being watched. Held cells arrive here the moment the gate refuses one.',
  'decisions.empty.link': 'See what the runs did ›',
  'decisions.card.why': 'Why this is held',
  'decisions.card.use': 'Use this',
  'decisions.card.empty': 'Leave this field empty',
  'decisions.card.neither': 'Neither is right',
  'decisions.card.seeOnPage': 'See it on the page',
  'decisions.card.best': 'BEST MATCH',
  'decisions.card.second': 'CLOSE SECOND',
  'decisions.card.nominated': ' · MODEL NOMINATED',
  'decisions.card.noEarlierRuns': 'No earlier runs to compare against',
  'decisions.question.two': 'Two answers look about equally likely.',
  'decisions.question.one': 'Only one candidate, and not a convincing one.',
  'decisions.question.none': 'Nothing on the page looks much like this field any more.',
  'decisions.undo': 'Undo',
  'decisions.undoing': 'Undoing',
  'decisions.answered.first': 'You chose the best match.',
  'decisions.answered.second': 'You chose the close second.',
  'decisions.answered.empty': 'You said this field is genuinely empty.',
  'decisions.answered.neither': 'You said neither candidate is right, so the cell stays held.',
  'decisions.notFourAnswers': 'Not one of the four answers.',
  'decisions.reteach': 'Point this field at the right value',
  'decisions.card.optionN': 'OPTION {n}',
  'decisions.card.heldAgo': 'held {ago}',
  // The reason, in the words the rest of the product uses. A code with no
  // wording is printed AS a code and this sentence says so -- never an
  // invented adjective. src/reports/vocabulary.ts.
  'decisions.reason.plain': 'Nothing was published: {plain}.',
  'decisions.reason.untranslated.before': 'Nothing was published for this cell. The gate recorded',
  'decisions.reason.untranslated.after': ', which this screen has no wording for.',
  'decisions.reason.none': 'Nothing was published for this cell.',
  'decisions.reason.heldSince': ' Held since run {run}.',
  // `{rows}` and the verb arrive assembled -- the catalogue does not do plurals.
  'decisions.reason.stakes': ' {rows} {verb} on this field.',

  // -- runs ------------------------------------------------------------------
  'runs.heading': 'Runs',
  'runs.none': 'No runs yet. The first one happens when a scraper is due.',
  'runs.table.head.run': 'run',
  'runs.table.head.when': 'when',
  'runs.table.head.scraper': 'scraper',
  'runs.table.head.what': 'what happened',
  'runs.table.open': 'what happened ›',
  'runs.outcome.clean': 'clean',
  // THE ONE PHRASE FOR A GATE-REFUSED CELL, and the glossary is the contract
  // for it: /docs/glossary "held for review", shortened to "held" only where
  // the sentence around it already says what for. It was said four ways --
  // "held a field for review", "held a cell for review", "held <field> for
  // review" -- which is four names for the state this product is about.
  'runs.outcome.held': 'held for review',
  'runs.outcome.healed': 'moved, found it again',
  'runs.outcome.skipped': 'skipped — page unchanged',
  'runs.summary.none': 'no runs yet',
  // The noun on its own, singular and plural, because the count in front of it
  // is assembled in code -- this map does not do plurals. `healed` and `held`
  // are participles and never take one.
  'runs.summary.run': 'run',
  'runs.summary.runs': 'runs',
  'runs.summary.healed': '{n} healed',
  'runs.summary.held': '{n} with a held cell',

  // -- one run ---------------------------------------------------------------
  'run.topbar': 'Run',
  'run.section.fields': 'Fields',
  'run.section.gate': 'The gate',
  'run.section.history': 'History',
  'run.section.sources': 'Sources',
  'run.allRuns': 'All runs',
  'run.cell.held': 'held',
  'run.table.head.field': 'field',
  'run.table.head.status': 'status',
  'run.table.head.value': 'value',
  'run.table.head.reason': 'reason',
  'run.link.proof': 'proof ›',
  'run.link.decide': 'decide ›',
  // What the section is, now that it no longer states a verdict. The verdict is
  // the band, drawn once on the selector diff above it -- see the note at the
  // gate section in `runs/[run]/page.tsx`.
  'run.gate.caption': 'The elements the gate weighed against the lost one, best first.',
  'run.gate.head.rank': '#',
  'run.gate.head.element': 'element',
  'run.gate.head.text': 'text on the page',
  // `run.gate.head.score` was here. The gate table has no score column any
  // more -- see the amendment to docs/FEATURES.md §4 dated 2026-08-23 -- and a
  // catalogue entry naming a column nothing draws is a string waiting to be
  // put back on a screen by someone who assumed it was in use.
  'run.evidence.head.stage': 'stage',
  'run.evidence.head.fact': 'fact',
  'run.evidence.head.value': 'value',
  'run.evidence.head.source': 'read from',
  'run.selector.same.before': 'The selector did not change —',
  'run.selector.same.after': 'reads the cell on both sides. What it points at on the page is what moved.',
  'run.selector.none': 'none recorded',

  // -- the gate's numbers, behind `show the numbers` --------------------------
  'gate.disclosure': 'show the numbers',
  'gate.compared': 'WHAT THE GATE COMPARED',
  'gate.head.score': 'top score',
  'gate.head.runnerUp': 'runner-up',
  'gate.head.margin': 'margin',
  'gate.aloneValue': 'none — it stood alone',
  // The glossary's words for the two tests: the floor (τ), the lead (δ).
  'gate.thresholds': 'To publish, a candidate needs a score above {tau} — the floor (τ) — and to be ahead of the runner-up by {delta} — the lead (δ).',
  'gate.thresholds.declared': 'Both are declared on this target’s contract.',
  'gate.thresholds.defaults': 'This target declares neither, so both are the shipped defaults.',
  'gate.thresholds.unreproducible':
    'The thresholds on hand no longer reproduce the reason recorded against this cell — the contract has been edited since — so they are not drawn against these scores. The scores are what was written at the time.',
  'gate.bandIsTheAnswer':
    'The band is still the answer. These are what it was read off, and the arithmetic is written out at /docs/assay-score.',

  // -- the Assay Score -------------------------------------------------------
  //
  // ONLY THE LINK LABEL IS HERE. The seven band words and the sentence each one
  // means live in `src/reports/assay-score.ts`, beside the mapping that
  // produces them -- because `/docs/assay-score` renders the same table, and
  // the whole justification for showing a word instead of a number is that the
  // badge and the page cannot disagree about what the word means. A second
  // catalogue in front of that table would be the drift this file's own rule
  // about `HELD_BECAUSE` already refuses.
  'assayScore.more': 'How the gate decided ›',

  // THE COUNTERFACTUAL, drawn on three surfaces -- the decision card, the run
  // page and the proof -- and it was written out three times. Split around the
  // quoted value the way `home.prompt`/`home.promptEnd` are split around the
  // brand mark, because the value in the middle is mono and the sentence is
  // not.
  'counterfactual.before': 'A healer without the gate would have published',
  'counterfactual.after': '. Assay published nothing.',

  // -- the two diffs on the run page -----------------------------------------
  //
  // These used to carry a line of numbers -- a score against tau, a margin
  // against delta -- assembled in the component because its SHAPE changed with
  // the data. It no longer exists: the band says which test the gate applied
  // and the rivals below say what was at stake, so what is left is fixed
  // labels, which is what this file is for.
  'flow.more': '↓ more of the pipeline below — scroll the canvas',
  'run.action.title': 'Which page?',
  'run.action.moves.one': 'Moves this page',
  'run.action.moves.any': 'Moves the page you pick',
  'run.action.moves.rest': 'to the front of the queue. Assay’s web process never scrapes — a worker claims it.',
  'run.action.due.one': 'See when it is due next ›',
  'run.action.due.many': 'See when they are due next ›',
  'run.section.selector': 'The selector',
  'run.section.record': 'The record',
  'diff.pane.before': 'before',
  'diff.pane.after': 'after',
  // The right-hand pane of a refusal is not an `after`: nothing was applied, so
  // there is no state the page is now in that this describes. It is the change
  // that was declined, and the label has to say so or the diff reads as a
  // record of something that happened.
  'diff.pane.refused': 'refused',
  'diff.pane.takenBack': 'taken back',
  'diff.nothingPublished': 'Nothing was published into this cell.',
  'diff.held': 'held',
  'diff.moved': 'The gate cleared this, so the selector moved.',
  'diff.movedThenTakenBack': 'The gate cleared this and the selector moved. It was taken back later.',
  // The pair the refusal was ABOUT, and what each of them holds. The values are
  // the half a person can judge -- "£4.99" against "Add to basket" is a
  // question anyone can answer in five seconds -- and the scores are the half
  // they cannot, which is why only one of the two is on the screen.
  'diff.rivals.eyebrow': 'THE TWO IT COULD NOT SEPARATE',
  'diff.rivals.disagree': 'They do not carry the same value, so neither was published.',

  // -- fields ----------------------------------------------------------------
  'fields.heading': 'Fields',
  'fields.filter.all': 'all fields',
  'fields.table.head.field': 'field',
  'fields.table.head.seen': 'seen in',
  'fields.table.head.how': 'how it is found',
  'fields.table.head.lastChange': 'last change',
  'fields.notAssessed': 'not assessed on this store',
  'fields.neverDelivered': 'never delivered',
  'fields.never': 'never',
  'fields.fragile': 'fragile',
  'fields.empty.held': 'No field is waiting on you.',
  'fields.empty.fragile': 'No field is graded fragile.',
  'fields.empty.all': 'No fields are being watched yet.',
  'fields.empty.held.body':
    'Every cell the gate looked at was either published or is still being watched.',
  'fields.empty.all.body': 'A field appears here once a scraper has run against it at least once.',
  'fields.headline.none': 'nothing tracked yet',
  // The Decisions screen's "No field is waiting on you." is a sentence about a
  // queue. This is a table filtered to a column, and the honest thing it can
  // say is that the column is empty.
  'fields.empty.heldFilter': 'No held fields right now.',
  // What to do about a fragility grade, derived from the anchors that produced
  // it. `sturdy` and `insufficient_history` get nothing, deliberately.
  'fields.suggest.fragile.noAnchors':
    'Nothing identifies this element but where it sits on the page. A stable id or a data-testid on it would anchor it.',
  'fields.suggest.fragile.generated':
    'Everything holding this up is generated by the build. A stable id or a data-testid on this element would anchor it.',
  'fields.suggest.serviceable':
    'It is standing on anchors the site never chose deliberately. An id, a data-testid or a role would survive the next redesign.',

  // -- one field's values ----------------------------------------------------
  'values.topbar': 'Values',
  'values.allFields': '‹ All fields',
  'values.download': 'Download CSV',
  'values.empty.title': 'Nothing has run against this field yet.',
  'values.empty.body': 'A value appears here the first time a run reaches this page.',
  'values.footnote': 'The last {limit} cells recorded for this target, newest first. A withheld run keeps its row: the hole is the record.',
  'values.head.run': 'run',
  'values.head.when': 'when',
  'values.head.field': 'field',
  'values.head.value': 'value',
  'values.nothingPublished': 'nothing published',
  'values.nothingPublishedBecause': 'nothing published: {plain}',
  'values.nothingPublishedCode': 'nothing published; the gate recorded',

  // -- compare ---------------------------------------------------------------
  'compare.heading': 'Compare',
  'compare.thisWeek': 'THIS WEEK',
  'compare.changed': 'CHANGED',
  'compare.withheld': 'WITHHELD',
  'compare.unchanged': 'UNCHANGED',
  'compare.noChanges': 'No field published a different value this week.',
  'compare.nothingWithheld': 'Nothing was withheld. Every field the gate looked at cleared it.',
  'compare.empty.title': 'Nothing ran this week.',
  'compare.empty.body':
    'Compare reads the last seven days. A scraper that has not run in that window has nothing to compare against.',
  'compare.cannotTell': 'I cannot tell you whether this changed.',
  'compare.decide': 'Decide',
  'compare.alreadyAnswered': 'already answered ›',
  'compare.table.head.scraper': 'scraper',
  'compare.table.head.field': 'field',
  'compare.table.head.what': 'what changed',
  'compare.table.head.when': 'when',

  // -- explain ---------------------------------------------------------------
  'explain.heading': 'Where did this number come from?',
  'explain.value': 'THE VALUE',
  'explain.standing': 'STATUS WHEN PUBLISHED',
  'explain.record': 'THE FULL RECORD',
  'explain.disclosure': 'the full record',
  'explain.copy': 'Copy',
  'explain.copyCli': 'Copy as CLI output ›',
  'explain.proofIsAColumn': 'The proof id is a column on your output.',
  'explain.nothingWritten': 'nothing was written here',
  'explain.heldOn': 'Held on',
  'explain.heldSince': 'Held since',
  'explain.firstPublished': 'First published on',
  'explain.unchangedSince': 'This value has not changed since',
  'explain.notFound.status': 'no such proof',
  'explain.notFound.title': 'No cell carries that proof id.',
  'explain.notFound.body':
    'Proof ids are written once, on the run that published the cell, and never reused. A missing one means the id was mistyped or the store it came from is not this one.',
  'explain.notFound.back': 'Back to runs ›',
  // The same sentence the run canvas's Hold node uses. Nothing is WRITTEN, and
  // `null` is the labelled hole the output column holds in its place.
  'explain.hole.note': 'left empty (null) — nothing was written',

  // -- field audit -----------------------------------------------------------
  'audit.heading': 'Field audit',
  'audit.noSnapshot.status': 'no snapshot on disk',
  'audit.empty.title': 'No snapshot to audit.',
  'audit.empty.body.before': 'This screen reads',
  'audit.empty.body.after':
    'from the repository root and found nothing there. It is a committed file, not something a run produces — nothing is missing from your database.',
  'audit.platform.eyebrow': 'WHAT THE PLATFORM REPORTED',
  'audit.platform.said': '100% success, 0 failed crawls — {rows} records returned.',
  // Counted, never typed: if the snapshot is replaced the sentence changes with it.
  'audit.headline': '{unhealthy} of {total} promised fields unhealthy behind a 100%-success run',
  'audit.finding':
    'This is not a criticism of the crawling, which worked: sixty pages were fetched from a site that fights scrapers and none of them failed. The finding is narrower.',
  'audit.finding.jobSucceeded': 'The job succeeded',
  'audit.finding.dataIsRight': 'The data is right',
  'audit.finding.rest':
    'are different claims, and the platform can only answer the first one. That gap is the shape of gap Assay fills, and it arrived unprompted from production rather than from a benchmark we wrote.',
  'audit.everyField': 'Every promised field',
  'audit.crossCheck': 'The cross-check',
  'audit.crossCheck.unavailable': 'Unavailable — only one side of the pair was delivered.',
  'audit.crossCheck.unavailable.rest':
    'are the only independent corroboration between the listing stage and the detail stage. Without both, drift on the listing template cannot be detected at all.',
  'audit.crossCheck.counts': '{comparable} rows carry both titles; {agreeing} agree and {disagreeing} disagree.',
  'audit.head.field': 'field',
  'audit.head.delivered': 'delivered',
  'audit.head.nullRate': 'null-rate',
  'audit.head.verdict': 'verdict',

  // -- a scraper's life ------------------------------------------------------
  'lifecycle.gone': 'Nothing under watch called {slug} any more.',
  'lifecycle.reading': 'Reading {slug}…',
  'lifecycle.notFound': 'Nothing under watch called {slug}.',
  'lifecycle.every': 'every',
  'lifecycle.mixedCadence': 'mixed',
  'lifecycle.saveCadence': 'Save cadence',
  'lifecycle.pause': 'Pause {slug}',
  'lifecycle.resume': 'Resume {slug}',
  'lifecycle.delete': 'Delete',
  'lifecycle.deleteIt': 'Delete it',
  'lifecycle.leaveIt': 'Leave it',
  'lifecycle.delete.title': 'Delete {slug}?',
  // `{fields}` arrives already pluralised -- see the header: this map does not
  // do plurals, the call site assembles the noun.
  'lifecycle.delete.never':
    'This forgets {fields}. It has never run, so there is nothing published to leave behind, and nothing to undo this with.',
  'lifecycle.delete.hasHistory':
    '{slug} has {runs} on record. Assay will refuse this: every row it published carries a proof id that has to keep answering for itself. Pause it instead — that stops the scraping and keeps the history.',
  'lifecycle.mixed': 'Its fields are on different cadences. Saving one here puts all {fields} on it.',
  'lifecycle.paused': '{slug} is paused. Its cadence is remembered, nothing is scheduled, and resuming puts it back.',
  'lifecycle.resumed': '{slug} is running again, and its next run is due now rather than a cadence away.',
  'lifecycle.deleted': '{slug} is gone. It had never run, so there was nothing published to leave behind.',
  'lifecycle.cadence.paused': '{slug} will run every {cadence} once it is resumed.',
  'lifecycle.cadence.set': '{slug} now runs every {cadence}, counting from now.',
  'lifecycle.cadence.bad': 'That is not a cadence.',
  'lifecycle.wholeScraper': 'The whole scraper, not just {field}:',

  // -- the testbed --------------------------------------------------------
  'break.explain':
    'This scraper watches the testbed, which serves the same page mutated nine ways. Pick one and the target is repointed at it — a redesign, on demand — and a run is asked for. It stays on that variant until you pick another;',
  'break.explain.after': 'puts it back.',
  'break.button': 'Break this page',
  'break.pick': 'Which mutation to deploy',
  'break.watching': 'Watching the run record — nothing yet.',
  'break.timedOut':
    'Nothing had landed after 45 seconds. This screen stopped watching; it did not stop being queued.',

  // -- errors ----------------------------------------------------------------
  'error.global.title': 'Assay could not start this page.',
  'error.screen.title': 'This screen did not finish loading.',
  'notFound.title': 'There is nothing at this address.',
  'notFound.topbar': 'Not found',
  'notFound.status': 'nothing at this address',

  // -- home / watch ----------------------------------------------------------
  'home.prompt': 'What should',
  'home.promptEnd': 'Assay watch?',
  'home.startFrom': 'OR START FROM',
  'home.runs.title': 'See what every scraper did last',
  'home.runs.sub': 'the runs, and what each one published',
  'home.decisions.sub': 'held rows, nothing published yet',
  'home.manual.title': 'Describe the fields yourself',
  'home.manual.sub': 'a page, and what to watch on it — no model needed',
  'home.stats.eyebrow': 'ACROSS ALL SCRAPERS',
  'home.stats.waiting': 'waiting on you',
  'home.stats.retracted': 'published in error',
  'home.stats.since': 'since you started',
  'home.conversation.none': 'No scraper from this conversation yet',
  'home.conversation.export': 'Export as Markdown',
  'home.conversation.new': 'Start a new conversation',
  // The benchmark, counted from `results/bench.json` on every render -- never a
  // number typed into a file.
  'home.bench': '{cases} benchmark cases · {wrong} wrong values published · a naive scraper would have published {naive}',
  'home.watching': 'Watching {id}.',
  'home.built.clean':
    'The first run is done and the baseline is what the page said just now. Every run from here is compared against it.',
  // `{fields}` arrives pluralised; the map does not do plurals.
  'home.built.held':
    'The first run is done. {fields} came back held — Assay published nothing there rather than guess, and it is waiting on you.',
  'home.composer.placeholder': 'Paste a URL, or describe what you want to keep an eye on',
  'home.composer.label': 'What should Assay watch?',
  'home.composer.send': 'Read this page',
  'home.composer.noCommand': 'No command matches that.',
  // The `/` menu's own line per command, and what a refused one says. The names
  // are `COMMANDS` in src/store/conversation-log.ts; these are the words for
  // them. A command runs IN the chat -- none of these is a destination.
  'command.decisions.hint': 'held rows waiting on a person',
  'command.held.hint': 'every field currently holding a cell',
  'command.runs.hint': 'what every scraper did last',
  'command.fields.hint': 'everything under watch',
  'command.unknown':
    'Assay has no command by that name. The commands are /decisions, /held, /runs and /fields.',
  // Said when a command was typed with words after it. The words are kept in the
  // transcript and read by nothing, and saying so is cheaper than letting an
  // operator believe they asked a question that was answered.
  'command.argsIgnored':
    'The rest of that line was not used. A command lists what the store holds; it does not take a question yet.',
  'command.ranAt': 'read from the store just now',
  'command.decisions.empty':
    'Nothing is held. Every cell the gate could justify has been published, which is the good outcome.',
  'command.held.empty': 'No field is holding a cell.',
  'command.runs.empty': 'No runs yet. The first one happens when a scraper is due.',
  'command.fields.empty': 'Nothing is under watch yet.',
  'command.open': 'Open the full screen ›',

  // -- build / proposal ------------------------------------------------------
  'build.head.field': 'FIELD',
  'build.head.onThePage': 'ON THE PAGE, RIGHT NOW',
  // The held cell's own sentence, on the proposal table and the run watcher.
  // A code with no wording is printed AS a code and the sentence says so.
  'build.held.because': 'Nothing was published here: {plain}.',
  'build.held.untranslated.before': 'Nothing was published here. The gate recorded',
  'build.held.untranslated.after': ', which this screen has no wording for.',
  'build.held.noReason':
    'Nothing was published here. Assay could not tell what this field is now, so it declined to guess.',
  'build.onThePage': 'ON THE PAGE',
  'build.rightNow': 'right now',
  'build.baseline': 'BASELINE',
  'build.emptyElement': 'the element is there and empty',
  'build.start': 'Start watching these fields',
  'build.starting': 'Reading the page for a baseline',
  'build.held': 'held',
  'build.decideIt': 'Decide it ›',
  'build.seeRun': 'See the run ›',
  'build.nothingCreatedYet': 'These are the fields and what the page says in each one right now.',

  // -- manual fields ---------------------------------------------------------
  'manual.title': 'Describe the fields yourself',
  'manual.sub':
    'Paste an example of each value as it appears on the page. Assay finds where it sits and watches that spot — you never write a selector.',
  'manual.page': 'PAGE',
  'manual.fields': 'FIELDS',
  'manual.urlPlaceholder': 'https://example.com/the-page',
  'manual.namePlaceholder': 'price',
  'manual.examplePlaceholder': 'the value as it reads on the page',
  'manual.addField': 'Add a field',
  'manual.checkEvery': 'check every',
  'manual.start': 'Start watching',
  'manual.starting': 'Reading the page',
  'manual.heldNothing': 'held — nothing published',
  'manual.badUrl': 'That is not an http or https URL.',
  'manual.noFields': 'Name at least one field.',
  'manual.badCadence': 'That is not a cadence Assay can schedule.',
  'manual.keepOne': 'Keep at least one field.',
  'manual.badProposal': 'That proposal is not a valid target.',

  // -- settings --------------------------------------------------------------
  'settings.heading': 'Settings',
  'settings.tab.publishing': 'Publishing',
  'settings.tab.output': 'Output',
  'settings.tab.notifications': 'Notifications',
  'settings.tab.connections': 'Connections',
  'settings.tabs.label': 'Settings sections',
  'settings.publishing.eyebrow': 'WHAT ASSAY MAY PUBLISH',
  // Split around the two mono identifiers the way `home.prompt`/`home.promptEnd`
  // are split around the brand mark: a command name has to stay mono, and this
  // map holds text rather than markup.
  'settings.publishing.policy.a':
    'Calibrated: publishes only a clear winner ({tau} floor, {delta} lead). Per-field policy is a YAML contract, checked with',
  'settings.publishing.policy.b': 'and posted to',
  'settings.publishing.policy.c': '— never edited here, so every change to it has a diff.',
  'settings.policy.eyebrow': 'PER-FIELD POLICY',
  'settings.policy.empty.title': 'No field has a policy yet.',
  'settings.policy.empty.body':
    'A field takes a policy the moment a scraper watches it. Until then there is nothing to govern.',
  'settings.policy.head.field': 'field',
  'settings.policy.head.tier': 'tier',
  'settings.policy.head.onHold': 'on hold',
  'settings.export': 'export as YAML ›',
  'settings.export.receipt': 'Field contracts copied as YAML',
  'settings.output.eyebrow': 'WHERE THE DATA GOES',
  'settings.output.output': 'Output',
  'settings.output.captures': 'Page captures',
  'settings.output.onHeld': 'On a held field',
  'settings.output.leaveEmpty': 'Leave empty',
  'settings.output.neverFilled': 'never filled, always labelled',
  'settings.output.proof': 'Proof',
  'settings.output.proofDetail': 'one proof id per cell, on the published row',
  'settings.model.eyebrow': 'MODEL ACCESS',
  'settings.connections.eyebrow': 'CONNECTIONS',
  'settings.connections.empty.title': 'Nothing is connected.',
  'settings.connections.empty.body':
    'Assay runs with no connectors: it fetches pages itself and writes to its own store. A connector adds a delivery path, never a decision.',
  'settings.connector.setIt': 'set it in the environment or over the API',
  'settings.doc.link': 'See documentation',
  'settings.notSwitch': 'Not a switch position.',
  'settings.loading': 'Reading what is actually in force.',
  'settings.notifications.digest': 'Weekly digest',
  'settings.notifications.digest.sent':
    'One report per week: what changed, and what was withheld. Last sent {date}.',
  'settings.notifications.digest.never':
    'One report per week: what changed, and what was withheld. Never sent yet.',
  'settings.notifications.digest.cannotSend':
    'Assay cannot send mail: {missing} is not set in this process’s environment.',
  'settings.notifications.digest.notSaved': 'Not saved — {detail}. The switch has been put back where it was.',
  'settings.notifications.mail': 'Break alerts by email',
  'settings.notifications.mail.detail': 'When a field breaks, one alert per episode — not one per page.',
  'settings.notifications.mail.reason':
    'Set in .env, not here: the worker reads ASSAY_RESEND_KEY, ASSAY_MAIL_FROM and ASSAY_MAIL_TO on each run and nothing from the store.',
  'settings.notifications.mail.unset': '{missing} is not set, so a break alert would fall through to the webhook.',
  'settings.notifications.webhook': 'Webhook fallback',
  'settings.notifications.webhook.detail':
    'Where a break alert goes when the email fails. The outcome is recorded on the episode either way.',
  'settings.notifications.webhook.reason': 'Set in .env, not here: ASSAY_WEBHOOK_URL.',
  'settings.notifications.webhook.unset':
    'Unset, so a failed email is recorded as undelivered and nothing else is tried.',

  // -- model access ----------------------------------------------------------
  'model.checkAgain': 'Check again',
  'model.checking': 'Checking',
  'model.connect': 'Connect a model',
  'model.none': 'No model configured. Assay runs without one; field discovery is off.',
  'model.connected.apiKey': 'Connected with an API key',
  'model.connected.apiKey.note': 'ANTHROPIC_API_KEY is set',
  'model.connected.subscription': 'Connected with a Claude subscription',
  'model.connected.subscription.note': 'CLAUDE_CODE_OAUTH_TOKEN is set',
  'model.connected.cli': 'Connected through Claude Code on this machine',
  'model.connected.cli.note': 'the claude CLI is signed in · no variable needed',
  'model.setup.own': 'On your own machine, with a Claude subscription',
  'model.setup.shared': 'On a deployment other people use',
  'model.setup.sharedBody':
    'Use an API key from the Claude Console. The Agent SDK is explicit that a subscription login is not for products other people sign in to.',
  'model.copied.command': 'Command copied',
  'model.copied.line': 'Line copied',

  // -- schedule --------------------------------------------------------------
  'schedule.heading': 'Schedule',
  'schedule.loading': 'Reading the clock.',
  'schedule.none': 'nothing scheduled',
  'schedule.headline.running': '{n} running',
  'schedule.headline.paused': '{n} paused',
  // The noun alone: the count in front of it is assembled in code, because
  // this map does not do plurals.
  'schedule.headline.run': 'run today',
  'schedule.headline.runs': 'runs today',
  'schedule.today': 'Today',
  'schedule.view': 'View',
  'schedule.search': 'Search a scraper, a field, a value, a run id',
  'schedule.searchLabel': 'Search runs',
  'schedule.pick.scraper': 'Scraper',
  'schedule.pick.everyScraper': 'Every scraper',
  'schedule.pick.field': 'Field',
  'schedule.pick.everyField': 'Every field',
  'schedule.pick.outcome': 'Outcome',
  'schedule.pick.everyOutcome': 'Every outcome',
  'schedule.pick.held': 'Held',
  'schedule.pick.healed': 'Healed',
  'schedule.pick.clean': 'Clean',
  'schedule.clear': 'Clear',
  'schedule.empty.filtered.title': 'Nothing matches that.',
  'schedule.empty.filtered.body':
    'The filters above are narrower than what has been read. Clear them to see the rest.',
  'schedule.empty.none.title': 'Nothing is scheduled.',
  'schedule.empty.noRuns.title': 'No runs yet.',
  'schedule.empty.window.title': 'Nothing here.',
  'schedule.empty.none.body':
    'A scraper takes a cadence when it is created. Until one exists there is no clock to draw.',
  'schedule.empty.noRuns.body': 'The first run happens when a scraper is due.',
  'schedule.empty.window.body':
    'No run landed in this window, and nothing is due in it either.',
  'schedule.ask.eyebrow': 'ASK FOR A RUN',
  'schedule.ask.button': 'Ask for a run',
  'schedule.ask.asking': 'Asking…',
  'schedule.ask.queued': 'Queued',
  'schedule.legend.clean': 'ran, clean',
  'schedule.legend.healed': 'moved, found it again',
  'schedule.legend.held': 'held for review',
  'schedule.legend.next': 'the next run, stored',
  'schedule.legend.projected': 'projected from the cadence',
  'schedule.said.held': 'held for review',
  'schedule.said.healed': 'moved, found it again',
  'schedule.said.clean': 'clean',
  'schedule.table.head.run': 'run',
  'schedule.table.head.when': 'when',
  'schedule.table.head.scraper': 'scraper',
  'schedule.table.head.what': 'what happened',
  'schedule.due': 'due — has not run',
  'schedule.noValue': 'no value recorded',
  'schedule.whereFrom': 'where this came from ›',
  'schedule.dialog.cadence': 'cadence',
  'schedule.dialog.fields': 'fields',
  'schedule.dialog.after': 'after this',

  // -- notifications ---------------------------------------------------------
  'notifications.waiting': 'WAITING ON YOU',
  'notifications.nothingWaiting': 'NOTHING WAITING ON YOU',
  'notifications.earlier': 'EARLIER',
  'notifications.empty':
    'Nothing has happened yet. Held cells, breaks, alerts that did not go out, and fields that moved and were found again all land here.',

  // -- sign-in ---------------------------------------------------------------
  'signIn.headline.before': 'A scraper that',
  'signIn.headline.after': 'abstains when it is not sure.',
  'signIn.keys.heading': 'Configure your key',
  'signIn.keys.modelOptional':
    'Assay runs with no model. A model only ever proposes; the gate decides.',
  'signIn.keys.environment':
    'Assay reads these from the environment when it starts. Put what you want in .env and restart; what you leave out stays off.',
  'signIn.keys.open': 'Open Assay',
  'signIn.keys.checking': 'Checking',

  // -- shared ----------------------------------------------------------------
  // ONE PAIR FOR "IS THIS CREDENTIAL PRESENT", and it is in `common` because
  // three surfaces answer that question -- the Connections tab, the
  // notifications rows and the sign-in key panel -- and they answered it in
  // three vocabularies: Connected / set / configured against not set / not
  // configured. Which DIRECTION a connection buys is carried by the row's name
  // and its note, never by the status word; that was the argument for having
  // two words and it is answered somewhere the reader can actually see it.
  'common.configured': 'configured',
  'common.notConfigured': 'not configured',
  'common.unknownTime': 'unknown time',
  'common.justNow': 'just now',
  'common.none': 'none',
  'common.dash': '—',
} as const;

/** Every key in the catalogue. A key that is not here is a compile error. */
export type CopyKey = keyof typeof COPY;

/**
 * One string, with `{placeholder}` substitution.
 *
 * Typed on `CopyKey`, so `t('decisions.emty.title')` fails `tsc` rather than
 * rendering a blank on the screen -- which is the failure mode this whole file
 * exists to make impossible, and the one a JSON catalogue reintroduces the day
 * it stops being typed.
 *
 * There is no fallback branch and there is deliberately none: a missing key
 * cannot reach here, so a `?? key` would be unreachable code that also hid the
 * error if the type were ever loosened.
 */
export function t(key: CopyKey, vars?: Record<string, string | number>): string {
  const s: string = COPY[key];
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

export default COPY;

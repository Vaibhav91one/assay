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

  // -- runs ------------------------------------------------------------------
  'runs.heading': 'Runs',
  'runs.none': 'No runs yet. The first one happens when a scraper is due.',
  'runs.table.head.run': 'run',
  'runs.table.head.when': 'when',
  'runs.table.head.scraper': 'scraper',
  'runs.table.head.what': 'what happened',
  'runs.table.open': 'what happened ›',
  'runs.outcome.clean': 'clean',
  'runs.outcome.healed': 'moved, found it again',
  'runs.summary.none': 'no runs yet',

  // -- one run ---------------------------------------------------------------
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
  'run.gate.head.rank': '#',
  'run.gate.head.element': 'element',
  'run.gate.head.text': 'text on the page',
  'run.gate.head.score': 'score',
  'run.evidence.head.stage': 'stage',
  'run.evidence.head.fact': 'fact',
  'run.evidence.head.value': 'value',
  'run.evidence.head.source': 'read from',

  // -- the two diffs on the run page -----------------------------------------
  //
  // Only the labels are here. The line of numbers under a selector diff is
  // assembled from the score, the margin and the two thresholds, and by the
  // rule at the top of this file that makes it prose whose SHAPE changes with
  // the data, not copy with a hole in it. It lives in the component.
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
  'diff.tooClose': 'the gap between them',

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
  'home.composer.placeholder': 'Paste a URL, or describe what you want to keep an eye on',
  'home.composer.label': 'What should Assay watch?',
  'home.composer.send': 'Read this page',
  'home.composer.noSource':
    'Nothing is under watch yet, so there is no field to point at. Describe a page and Assay will start one.',
  'home.composer.noCommand': 'No command matches that.',

  // -- build / proposal ------------------------------------------------------
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
  'settings.connector.configured': 'configured',
  'settings.connector.notConfigured': 'not configured',
  'settings.connector.setIt': 'set it in the environment or over the API',
  'settings.doc.link': 'See documentation',
  'settings.notSwitch': 'Not a switch position.',
  'settings.loading': 'Reading what is actually in force.',

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
  'schedule.legend.healed': 'moved, found again',
  'schedule.legend.held': 'held for review',
  'schedule.legend.next': 'the next run, stored',
  'schedule.legend.projected': 'projected from the cadence',
  'schedule.said.held': 'held a field for review',
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
  'signIn.keys.connected': 'Connected',
  'signIn.keys.checking': 'Checking',

  // -- shared ----------------------------------------------------------------
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

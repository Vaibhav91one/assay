// The prose. Every sentence below is a template over a column; there is no
// sentence here that does not name a record, and nothing in this file computes
// a fact -- if a claim is wrong, the composer is wrong, not the wording.
//
// House rules, from docs/APP-DESIGN.md:
//   - one bold outcome sentence, then the user's own data, then the evidence
//   - no confidence percentage anywhere, ever
//   - no "successfully", no adjective the records did not supply
//   - a reason code never reaches the reader raw; an untranslated code is
//     printed AS a code rather than given an invented English wording
//
// Two sentences are quoted verbatim from the Voice bank's assay-incident-record
// entry, which is where they were written. They are the argument of the
// document and they are not decoration.

import type { IncidentRecord, HeldCellRecord } from './incident.js';
import type { DiffEntry, FieldHistory } from './diff.js';
import type { Digest } from './digest.js';
import { when, type Term } from './vocabulary.js';

const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;
const clip = (s: string, n = 72): string => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);

/** Plain English if we have it; otherwise the code, marked as one. Never a guess. */
const say = (t: Term | null): string =>
  t == null ? 'nothing was recorded' : t.plain ?? `recorded as \`${t.code}\``;

/** What the detector attributed it to, or the plain admission that it did not. */
const attribution = (t: Term | null): string =>
  t == null
    ? 'The detector recorded no cause for this break.'
    : `The detector attributed the break to: ${say(t)}.`;

/**
 * `episodes.notified` holds two different facts in one column: how the alert
 * left, and why it did not. Rendering the second as the first would tell a
 * customer they were warned when nobody was.
 */
function delivery(notified: string | null): string {
  if (notified == null) return 'There is no record of how, or whether, the alert went out.';
  if (notified.startsWith('undelivered')) {
    return `**The alert reached nobody.** ${notified.replace(/^undelivered:\s*/, 'The send failed: ')}.`;
  }
  return `The alert went out via ${notified}.`;
}

const at = (d: Date | null | undefined): string => when(d) ?? 'a time that was not recorded';

/** The line the whole document hangs off. State, in one sentence. */
function headline(r: IncidentRecord): string {
  const stopped = `I stopped publishing \`${r.field}\` on ${r.target} at run ${r.openedRun}, ${at(r.openedAt)}`;
  return r.open
    ? `**${stopped}, and I have not published it since.**`
    : `**${stopped}, and started again at run ${r.closedRun}, ${at(r.closedAt)}.**`;
}

function timelineTable(entries: DiffEntry[]): string {
  const rows = entries.map((e) => {
    const cell = e.state === 'withheld'
      ? `**withheld** — ${say(e.why)}`
      : `${e.state} — ${clip(e.value)}`;
    return `| ${e.run} | ${at(e.at)} | ${e.status} | ${cell} |`;
  });
  return ['| Run | When | Status | Cell |', '|---|---|---|---|', ...rows].join('\n');
}

function heldSection(h: HeldCellRecord): string {
  const lines = [
    `### Run ${h.run} · \`${h.proof}\``,
    '',
    `- Held because ${say(h.why)}.`,
    `- Held since run ${h.heldSinceRun ?? h.run}, ${at(h.at)}.`,
  ];

  if (h.goldenSha) lines.push(`- Compared against the frozen page \`${h.goldenSha}\`.`);
  if (h.captureSha) {
    lines.push(`- The page as fetched: \`${h.captureSha}\`${
      h.capturePruned === true ? ' — the bytes have since been reclaimed.'
      : h.capturePruned === false ? ' — the bytes are still kept.'
      : ' — this report could not find a capture row for it.'}`);
  }

  const d = h.decision;
  if (!d) {
    lines.push('- This cell never entered the decisions queue, so there is nobody to name.');
  } else if (d.undoneAt) {
    lines.push(`- Decided by ${d.resolvedBy ?? 'nobody'}, ${at(d.at)}, and taken back ${at(d.undoneAt)}.`);
  } else if (d.resolvedBy) {
    // Settling the queue item does not republish the cell -- it stays null and
    // labelled, and putting a corrected value into your data is a retraction,
    // which is a separate act somebody has to take. Narrating a decision as a
    // publication would tell a customer a number went out that never did.
    lines.push(`- Decided by ${d.resolvedBy}, ${at(d.at)}: ${say(d.what)}.`);
    lines.push('  The cell itself stayed held; deciding it did not put a value into your data.');
  } else {
    lines.push('- Nobody has decided this yet.');
    // A nomination is an open item with a note on it, never a resolution.
    if (d.nominated) lines.push(`  A model nominated a candidate (\`${d.nominated}\`); it is still open.`);
  }

  return lines.join('\n');
}

/**
 * The incident record, as the file an operator sends someone.
 *
 * Markdown rather than HTML because the artefact is a thing a person pastes
 * into an email or a ticket. `marked` turns it into HTML for anyone who wants
 * that; a second renderer here would be the same fact rendered twice.
 */
export function incidentMarkdown(r: IncidentRecord): string {
  const out: string[] = [
    `# ${r.target} · ${r.field}`,
    '',
    headline(r),
    '',
    attribution(r.cause),
    delivery(r.notified),
    '',
    '## What happened, in order',
    '',
    timelineTable(r.timeline),
    '',
    '## What was held',
    '',
    'A record that only lists what we fixed would be marketing. The refusals are',
    'the part worth reading.',
    '',
  ];

  if (r.held.length === 0) {
    out.push('Nothing was held during this episode.', '');
  } else {
    out.push(`**${plural(r.held.length, 'cell')} held.** Each one is null in your data and labelled,`,
      'never filled and never omitted.', '');
    for (const h of r.held) out.push(heldSection(h), '');
  }

  out.push('## What we changed', '');
  if (r.heals.length === 0) {
    out.push('No selector was changed while this episode was open.', '');
  } else {
    out.push('| Run | From | To | |', '|---|---|---|---|');
    for (const h of r.heals) {
      out.push(`| ${h.run} | \`${h.from ?? '—'}\` | \`${h.to}\` | ${h.reverted ? '**taken back**' : 'still in place'} |`);
    }
    out.push('');
  }

  out.push('## What was retracted', '');
  if (r.retractions.length === 0) {
    out.push('Nothing has been retracted.', '');
  } else {
    for (const x of r.retractions) {
      out.push(`- Runs ${x.fromRun}–${x.toRun}: ${
        x.rows == null ? 'the row ids were not recorded' : plural(x.rows, 'row')
      }, raised ${at(x.at)}. ${x.exportedAt ? `Taken by the operator ${at(x.exportedAt)}.` : 'Nobody has acted on it yet.'}`);
    }
    out.push('');
  }

  out.push('## What is still suspect', '');
  if (r.suspect.length === 0) {
    out.push('Nothing was published while this field was broken.', '');
  } else {
    out.push(
      `The ${plural(r.suspect.length, 'row')} below ${r.suspect.length === 1 ? 'is' : 'are'} the honest part of this`,
      'report. We know those runs did not error and did not come back empty. We do',
      'not know that they were right, so we are telling you they are unverified',
      'rather than counting them as clean.',
      '',
      '| Run | When | Status | Proof |',
      '|---|---|---|---|',
      ...r.suspect.map((s) => `| ${s.run} | ${at(s.at)} | ${s.status} | \`${s.proof}\` |`),
      '',
    );
  }

  return out.join('\n');
}

// ---------------------------------------------------------------------------

/**
 * The diff, for a terminal.
 *
 * A withheld run gets its own block and no value column at all. It has to be
 * impossible to mistake for "unchanged" at a glance and impossible to parse as
 * one, which is why the branches share no formatting.
 */
export function diffText(h: FieldHistory): string {
  const out = [`${h.target} · ${h.field}`, ''];
  if (!h.entries.length) {
    out.push('No runs recorded for this field.');
    return out.join('\n');
  }

  for (const e of h.entries) {
    const head = `run ${String(e.run).padEnd(6)}${at(e.at)}`;
    if (e.state === 'withheld') {
      const why = say(e.why);
      out.push(`${head}  WITHHELD`);
      out.push('           I cannot tell you whether this changed.');
      out.push(`           ${why.charAt(0).toUpperCase()}${why.slice(1)}.`);
      out.push(`           Held since run ${e.heldSinceRun ?? e.run}. Nothing was written.`);
      out.push('');
      continue;
    }
    if (e.state === 'unchanged') {
      out.push(`${head}  unchanged  (same as run ${e.comparedToRun})`);
      continue;
    }
    if (e.comparedToRun == null) {
      out.push(`${head}  first      ${clip(e.value)}`);
      continue;
    }
    out.push(`${head}  changed    ${clip(e.from ?? '')}`);
    out.push(`                                  → ${clip(e.value)}   (against run ${e.comparedToRun})`);
  }

  const holes = h.entries.filter((e) => e.state === 'withheld').length;
  out.push('', `${h.entries.length} runs, ${holes} withheld.`);
  return out.join('\n');
}

/** The digest, for a terminal. The email body is notify.digestBody. */
export function digestText(d: Digest): string {
  const out = [`Assay · ${at(d.since)} to ${at(d.until)}`, '', d.subject, ''];
  if (d.changes.length) {
    out.push('CHANGED');
    for (const c of d.changes) out.push(`  ${c.target.padEnd(12)}${c.field.padEnd(16)}${c.what}`);
    out.push('');
  }
  if (d.withheld.length) {
    out.push('WITHHELD');
    for (const c of d.withheld) out.push(`  ${c.target.padEnd(12)}${c.field.padEnd(16)}${c.what}`);
    out.push('');
    out.push('  A field I am holding never appears as a change. A hole is not a diff.');
    out.push('');
  }
  out.push(`UNCHANGED   ${plural(d.unchanged, 'field')}`);
  return out.join('\n');
}

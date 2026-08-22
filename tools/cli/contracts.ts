#!/usr/bin/env tsx
// `assay contracts` -- validate a contract file before it reaches a scrape.
//
// Exported as a command module because bin/assay.ts owns the registry; this
// file registers nothing. It also runs directly, which is what
// `npm run contracts:validate` does, so a pre-commit hook needs no binary.
//
// `validate` never touches Postgres. Catching a typo is the job a developer
// does on a laptop on a plane, and needing a database for it means it does not
// get done.

import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { formatIssues, parseContract, thresholdsFor } from '../../src/contracts/index.js';

const read = (file: string): string => {
  try {
    return readFileSync(file, 'utf8');
  } catch (e) {
    // An unreadable file is not an invalid contract, and saying so wrongly
    // would send the operator hunting for a syntax error that is not there.
    console.error(`cannot read ${file}: ${(e as NodeJS.ErrnoException).code ?? (e as Error).message}`);
    process.exit(2);
  }
};

export const command = new Command('contracts')
  .description('Field contracts: per-field thresholds, checked before they reach a scrape.');

command
  .command('validate')
  .argument('<file>', 'path to the contract YAML')
  .option('--check-fields', 'also verify every field name against what Assay has seen (needs Postgres)')
  .description('Check a contract and say which line is wrong.')
  .action(async (file: string, opts: { checkFields?: boolean }) => {
    const source = read(file);

    let known: string[] | undefined;
    if (opts.checkFields) {
      const { knownFields } = await import('../../src/contracts/store.js');
      const shallow = parseContract(source);
      if (!shallow.ok) {
        console.error(formatIssues(shallow.issues, file));
        process.exit(1);
      }
      known = await knownFields(shallow.contract.target);
      // Otherwise the pool holds the process open after a clean validation.
      await (await import('../../src/store/index.js')).closeDb();
    }

    const result = parseContract(source, { knownFields: known });
    if (!result.ok) {
      console.error(formatIssues(result.issues, file));
      console.error(`\n${result.issues.length} problem${result.issues.length === 1 ? '' : 's'}.`);
      process.exit(1);
    }

    const fields = Object.keys(result.contract.fields);
    console.log(`${file}: ok -- ${result.contract.target}, ${fields.length} field${fields.length === 1 ? '' : 's'}`);
    for (const f of fields) {
      const t = thresholdsFor(result.contract, f);
      console.log(
        `  ${f.padEnd(16)} ${t.policy.padEnd(7)} tau ${t.tau}  delta ${t.delta}  `
        + `auto-approve above ${t.autoApproveAbove}  on abstain ${t.onAbstain}  `
        + `alert ${t.alert ?? 'nobody'}`,
      );
    }
    if (!opts.checkFields) {
      console.log('\nField NAMES were not checked. Re-run with --check-fields against Postgres.');
    }
  });

command
  .command('apply')
  .argument('<file>', 'path to the contract YAML')
  .description('Append this contract as a new version. Never overwrites one.')
  .action(async (file: string) => {
    const { saveContract } = await import('../../src/contracts/store.js');
    const { closeDb } = await import('../../src/store/index.js');
    try {
      const saved = await saveContract(read(file), { checkFields: true });
      if (!saved.ok) {
        console.error(formatIssues(saved.issues, file));
        process.exitCode = 1;
        return;
      }
      console.log(`${saved.version.targetId}: version ${saved.version.version} written.`);
    } finally {
      await closeDb();
    }
  });

command
  .command('show')
  .argument('<target>', 'target id')
  .option('--version <n>', 'a specific version; default is the one in force')
  .description('Print a contract exactly as it was written.')
  .action(async (target: string, opts: { version?: string }) => {
    const { latestContract, contractVersion } = await import('../../src/contracts/store.js');
    const { closeDb } = await import('../../src/store/index.js');
    try {
      let n: number | undefined;
      if (opts.version !== undefined) {
        n = Number(opts.version);
        if (!Number.isInteger(n) || n < 1) {
          console.error('--version takes a positive integer.');
          process.exitCode = 1;
          return;
        }
      }
      const v = n === undefined ? await latestContract(target) : await contractVersion(target, n);
      if (!v) {
        console.error(n === undefined ? `No contract for "${target}".` : `No version ${n} for "${target}".`);
        process.exitCode = 1;
        return;
      }
      process.stdout.write(v.yaml);
    } finally {
      await closeDb();
    }
  });

export default command;

// Runnable on its own, which is what npm run contracts:validate uses.
const invokedDirectly =
  process.argv[1] !== undefined
  && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));

if (invokedDirectly) await command.parseAsync(process.argv);

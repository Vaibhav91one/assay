// Mint a consumer API key. The plaintext is printed once and never stored.
//
//   node tools/apikey.js "warehouse etl" --read mattel,ikea
//   node tools/apikey.js "operator" --write mattel
//
// Omitting the scope flag deliberately mints a legacy unscoped key.

import { createKey, type KeyScope } from '../src/api/keys.js';
import { closeDb } from '../src/store/index.js';

const args = process.argv.slice(2);
const flags = args.flatMap((arg, index) => ['--read', '--write'].includes(arg) ? [index] : []);
if (flags.length > 1) {
  console.error('choose one scope: --read or --write');
  process.exit(1);
}

let scope: KeyScope | null = null;
if (flags.length === 1) {
  const index = flags[0]!;
  const access = args[index]!.slice(2) as KeyScope['access'];
  const targets = (args[index + 1] ?? '').split(',').map((target) => target.trim()).filter(Boolean);
  if (!targets.length) {
    console.error(`${args[index]} requires a comma-separated target list`);
    process.exit(1);
  }
  scope = { access, targets };
  args.splice(index, 2);
}

const name = args.join(' ').trim();
if (!name) {
  console.error('usage: npm run apikey -- "<name>" [--read|--write target[,target]]');
  process.exit(1);
}

const k = await createKey(name, scope);
console.log(`\n  ${k.key}\n`);
console.log(`  name    ${name}`);
console.log(`  prefix  ${k.keyPrefix}`);
console.log(`  scope   ${scope ? `${scope.access} ${scope.targets.join(',')}` : 'legacy (unscoped)'}`);
console.log('\nStored hashed. This is the only time the key is shown.\n');
await closeDb();

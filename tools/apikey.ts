// Mint a consumer API key. The plaintext is printed once and never stored.
//
//   node tools/apikey.js "warehouse etl"

import { createKey } from '../src/api/keys.js';
import { closeDb } from '../src/store/index.js';

const name = process.argv.slice(2).join(' ').trim();
if (!name) { console.error('usage: npm run apikey -- "<name>"'); process.exit(1); }

const k = await createKey(name);
console.log(`\n  ${k.key}\n`);
console.log(`  name    ${name}`);
console.log(`  prefix  ${k.keyPrefix}`);
console.log('\nStored hashed. This is the only time the key is shown.\n');
await closeDb();

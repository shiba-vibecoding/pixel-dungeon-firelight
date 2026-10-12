// Reads back what went wrong in the game (src/reports.ts).
//
//   node packages/server/scripts/reports.mjs                  the latest reports, newest first
//   node packages/server/scripts/reports.mjs --clear          and forget them
//   node packages/server/scripts/reports.mjs --new-key        make a REPORT_KEY and store it in the Worker
//
// The key is kept in packages/server/.report-key (not in git) and as the Worker's
// REPORT_KEY secret. SERVER_URL overrides the server's address.

import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const keyFile = join(here, '..', '.report-key');
const server = (process.env.SERVER_URL ?? 'https://pd-coop.pd-server.workers.dev').replace(/\/+$/, '');
const args = process.argv.slice(2);

if (args.includes('--new-key')) {
  const key = randomBytes(24).toString('base64url');
  const result = spawnSync('npx', ['wrangler', 'secret', 'put', 'REPORT_KEY', '--config', `"${join(here, '..', 'wrangler.jsonc')}"`], {
    input: key, stdio: ['pipe', 'inherit', 'inherit'], shell: true,
  });
  if (result.status !== 0) {
    console.error('wrangler could not store the key; nothing changed.');
    process.exit(1);
  }
  writeFileSync(keyFile, key);
  console.log(`REPORT_KEY stored in the Worker and in ${keyFile}.`);
  process.exit(0);
}

if (!existsSync(keyFile)) {
  console.error('No key yet: run with --new-key first.');
  process.exit(1);
}
const key = readFileSync(keyFile, 'utf8').trim();
const headers = { Authorization: `Bearer ${key}` };

const response = await fetch(`${server}/reports`, { headers });
if (!response.ok) {
  console.error(`The server answered ${response.status}.`);
  process.exit(1);
}
const reports = await response.json();
if (reports.length === 0) console.log('No reports.');
for (const r of [...reports].sort((a, b) => (b.last ?? b.at) - (a.last ?? a.at))) {
  const when = new Date(r.last ?? r.at).toISOString().replace('T', ' ').slice(0, 19);
  const times = r.count ? ` ×${r.count}` : '';
  console.log(`\n${when} UTC  [${r.kind}]${times}  ${r.message}`);
  if (r.context && Object.keys(r.context).length) console.log(`  ${Object.entries(r.context).map(([k, v]) => `${k}=${v}`).join('  ')}`);
  if (r.stack) console.log(`  ${r.stack.split('\n').slice(0, 6).join('\n  ')}`);
  // Co-op logs: the whole of it with --logs, else a pointer to it.
  if (r.log) {
    const lines = r.log.split(String.fromCharCode(10));
    console.log(process.argv.includes('--logs') ? `  ${lines.join(`${String.fromCharCode(10)}  `)}` : `  (co-op log: ${lines.length} lines; run with --logs to see it)`);
  }
}
if (args.includes('--clear')) {
  await fetch(`${server}/reports`, { method: 'DELETE', headers });
  console.log('\nCleared.');
}

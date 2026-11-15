import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root = 'work-logs/2026-11-12';
const previous = JSON.parse(fs.readFileSync(`${root}/entry-support-freeze.json`, 'utf8'));
const files = [...Object.keys(previous.sha256), ...['split', 'execute'].map(plan => `${root}/entry-support-${plan}/opponent-diagnose-purchase-entry-support.json`),
  ...['trade-hold.mjs', 'trade-hold-hook.mjs', 'trade-hold-tests.mjs', 'summarize-trade-hold.mjs', 'freeze-trade-hold.mjs'].map(file => `${root}/${file}`)];
const sha256 = Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
for (const [file, value] of Object.entries(previous.sha256)) assert.equal(sha256[file], value, file);
assert.ok(!fs.existsSync(`${root}/trade-hold-freeze.json`));
fs.writeFileSync(`${root}/trade-hold-freeze.json`, JSON.stringify({ seeds: previous.seeds, plans: previous.plans,
  holdTicks: 60, scope: 'Same six research attacking-start conditions, new diagnostic memory rule only', sha256 }, null, 2) + '\n');
console.log(JSON.stringify({ frozenFiles: Object.keys(sha256).length, diagnosticMatches: 6 }));

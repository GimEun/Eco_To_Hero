import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const root = 'work-logs/2026-11-12';
const previous = JSON.parse(fs.readFileSync(`${root}/shared-autobuy-freeze.json`, 'utf8'));
const files = [...Object.keys(previous.sha256), `${root}/reactive-range48/opponent-diagnose-purchase-reactive-range48.json`, `${root}/site-cal-range48/opponent-diagnose-purchase-site-cal.json`,
  ...['shared-baseline-transform.mjs', 'shared-baseline-hook.mjs', 'shared-baseline-tests.mjs', 'summarize-shared-baseline.mjs', 'freeze-shared-baseline.mjs'].map(file => `${root}/${file}`)];
const sha256 = Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
for (const [file, value] of Object.entries(previous.sha256)) assert.equal(sha256[file], value, file);
assert.ok(!fs.existsSync(`${root}/shared-baseline-freeze.json`));
fs.writeFileSync(`${root}/shared-baseline-freeze.json`, JSON.stringify({ seeds: [73, 101, 211], maps: ['relay', 'warehouse', 'research'],
  profiles: ['fixed', 'combined'], range: [48, 54], opponentVariant: 'current', homePurchasePolicy: 'shared-auto',
  scope: 'Same auto-buy for both teams and profiles; original choices/defense; 36 known-world initial-roster cases', sha256 }, null, 2) + '\n');
console.log(JSON.stringify({ frozenFiles: Object.keys(sha256).length, diagnosticMatches: 36 }));

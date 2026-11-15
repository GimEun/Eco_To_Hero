import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const root = 'work-logs/2026-11-12';
const previous = JSON.parse(fs.readFileSync(`${root}/shared-baseline-freeze.json`, 'utf8'));
const files = [...Object.keys(previous.sha256), ...['relay', 'warehouse', 'research'].map(map => `${root}/shared-baseline-${map}/opponent-diagnose-purchase-shared-baseline.json`),
  ...['shared-baseline-summary.json', 'summarize-shared-ranges.mjs', 'freeze-shared-ranges.mjs'].map(file => `${root}/${file}`)];
const sha256 = Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
for (const [file, value] of Object.entries(previous.sha256)) assert.equal(sha256[file], value, file);
assert.ok(!fs.existsSync(`${root}/shared-ranges-freeze.json`));
fs.writeFileSync(`${root}/shared-ranges-freeze.json`, JSON.stringify({ seeds: [73, 101, 211], maps: ['relay', 'warehouse', 'research'],
  candidates: [30, 38, 42], reusedMinimum: 48, opponentVariant: 'current', homePurchasePolicy: 'shared-auto',
  selection: 'squared outside-target distance; reactive winning margin; minimum order 30/38/42/48',
  targets: { fixedMaximum: .2, reactiveMinimum: .55, reactiveMaximum: .65 },
  scope: '108 new known-world conditions, 36 reused baseline conditions, unchanged actual game', sha256 }, null, 2) + '\n');
console.log(JSON.stringify({ frozenFiles: Object.keys(sha256).length, newConditions: 108 }));

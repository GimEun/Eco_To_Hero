import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root = 'work-logs/2026-11-12';
const previous = JSON.parse(fs.readFileSync(`${root}/trade-hold-freeze.json`, 'utf8'));
const files = [...Object.keys(previous.sha256), ...['split', 'execute'].map(plan => `${root}/trade-hold-${plan}/opponent-diagnose-purchase-trade-hold.json`),
  ...['trade-range-point.mjs', 'trade-range-hook.mjs', 'trade-range-tests.mjs', 'summarize-trade-range.mjs', 'freeze-trade-range.mjs'].map(file => `${root}/${file}`)];
const sha256 = Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
for (const [file, value] of Object.entries(previous.sha256)) assert.equal(sha256[file], value, file);
assert.ok(!fs.existsSync(`${root}/trade-range-freeze.json`));
fs.writeFileSync(`${root}/trade-range-freeze.json`, JSON.stringify({ seeds: previous.seeds, plans: previous.plans,
  scope: 'Six known research attacking starts; range/wall/path-compatible trade cell within two tiles. No hold cache.', sha256 }, null, 2) + '\n');
console.log(JSON.stringify({ frozenFiles: Object.keys(sha256).length, diagnosticMatches: 6 }));

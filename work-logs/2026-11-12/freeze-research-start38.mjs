import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root = 'work-logs/2026-11-12';
const previous = JSON.parse(fs.readFileSync(`${root}/slot3-rifle38-freeze.json`, 'utf8'));
const files = [...Object.keys(previous.sha256), ...['relay', 'warehouse', 'research'].map(map => `${root}/slot3-rifle38-${map}/opponent-diagnose-purchase-slot3-rifle38.json`),
  ...['research-start-choices.json', 'summarize-research-start.mjs', 'summarize-research-start38.mjs', 'freeze-research-start38.mjs'].map(file => `${root}/${file}`)];
const sha256 = Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
for (const [file, value] of Object.entries(previous.sha256)) assert.equal(sha256[file], value, file);
assert.ok(!fs.existsSync(`${root}/research-start38-freeze.json`));
fs.writeFileSync(`${root}/research-start38-freeze.json`, JSON.stringify({ seeds: previous.seeds, map: 'research', range: [38, 54],
  changedParameter: 'initial research attack split -> execute; same shared auto-buy and slot3 rifle preference', newConditions: 6, reusedConditions: 30, sha256 }, null, 2) + '\n');
console.log(JSON.stringify({ frozenFiles: Object.keys(sha256).length, newConditions: 6 }));

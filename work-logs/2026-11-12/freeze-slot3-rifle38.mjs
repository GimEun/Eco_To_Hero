import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root = 'work-logs/2026-11-12';
const previous = JSON.parse(fs.readFileSync(`${root}/slot3-rifle-freeze.json`, 'utf8'));
const files = [...Object.keys(previous.sha256), `${root}/shared-range38/opponent-diagnose-purchase-shared-range.json`,
  ...['relay', 'warehouse', 'research'].map(map => `${root}/slot3-rifle-${map}/opponent-diagnose-purchase-slot3-rifle.json`),
  ...['slot3-rifle-summary.json', 'summarize-slot3-rifle38.mjs', 'freeze-slot3-rifle38.mjs'].map(file => `${root}/${file}`)];
const sha256 = Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
for (const [file, value] of Object.entries(previous.sha256)) assert.equal(sha256[file], value, file);
assert.ok(!fs.existsSync(`${root}/slot3-rifle38-freeze.json`));
fs.writeFileSync(`${root}/slot3-rifle38-freeze.json`, JSON.stringify({ seeds: previous.seeds, maps: previous.maps, range: [38, 54],
  changedParameter: 'Opponent range38~54 with both teams slot3 rifle preference', newConditions: 36, reusedConditions: 36, sha256 }, null, 2) + '\n');
console.log(JSON.stringify({ frozenFiles: Object.keys(sha256).length, newConditions: 36 }));

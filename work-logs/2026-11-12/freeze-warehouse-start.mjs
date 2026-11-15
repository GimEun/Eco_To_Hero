import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root = 'work-logs/2026-11-12';
const previous = JSON.parse(fs.readFileSync(`${root}/site-stability-freeze.json`, 'utf8'));
const source = JSON.parse(fs.readFileSync(`${root}/risk-training/selected-choices.json`, 'utf8'));
const selected = structuredClone(source.selected); selected.initial.warehouse.defense = 'forward';
assert.ok(!fs.existsSync(`${root}/warehouse-start-freeze.json`)); assert.ok(!fs.existsSync(`${root}/warehouse-start-choices.json`));
fs.writeFileSync(`${root}/warehouse-start-choices.json`, JSON.stringify({ selected,
  note: 'Diagnostic copy; only initial.warehouse.defense changed standard to forward. No research modification.' }, null, 2) + '\n');
const files = [...Object.keys(previous.sha256), `${root}/site-stability-warehouse/opponent-diagnose-purchase-site-stability.json`,
  ...['warehouse-start-choices.json', 'summarize-warehouse-start.mjs', 'freeze-warehouse-start.mjs'].map(file => `${root}/${file}`)];
const sha256 = Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
for (const [file, value] of Object.entries(previous.sha256)) assert.equal(sha256[file], value, file);
fs.writeFileSync(`${root}/warehouse-start-freeze.json`, JSON.stringify({ seeds: previous.seeds, map: 'warehouse',
  changedParameter: 'initial.warehouse.defense: standard -> forward', newMatches: 12, reusedMatches: 12, independentValidation: false, sha256 }, null, 2) + '\n');
console.log(JSON.stringify({ frozenFiles: Object.keys(sha256).length, newMatches: 12 }));

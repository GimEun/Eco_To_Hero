import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root = 'work-logs/2026-11-12';
const previous = JSON.parse(fs.readFileSync(`${root}/site-stability-freeze.json`, 'utf8'));
const source = JSON.parse(fs.readFileSync(`${root}/risk-training/selected-choices.json`, 'utf8'));
const selected = structuredClone(source.selected); selected.initial.research.attack = 'execute';
assert.ok(!fs.existsSync(`${root}/research-start-freeze.json`)); assert.ok(!fs.existsSync(`${root}/research-start-choices.json`));
fs.writeFileSync(`${root}/research-start-choices.json`, JSON.stringify({ selected,
  note: 'Diagnostic copy; only initial.research.attack changed from split to execute. Original training selections unchanged.' }, null, 2) + '\n');
const files = [...Object.keys(previous.sha256), `${root}/site-stability-research/opponent-diagnose-purchase-site-stability.json`,
  ...['research-start-choices.json', 'summarize-research-start.mjs', 'freeze-research-start.mjs'].map(file => `${root}/${file}`)];
const sha256 = Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
for (const [file, value] of Object.entries(previous.sha256)) assert.equal(sha256[file], value, file);
fs.writeFileSync(`${root}/research-start-freeze.json`, JSON.stringify({ seeds: previous.seeds, map: 'research',
  changedParameter: 'initial.research.attack: split -> execute', newMatches: 12, reusedMatches: 12, independentValidation: false, sha256 }, null, 2) + '\n');
console.log(JSON.stringify({ frozenFiles: Object.keys(sha256).length, newMatches: 12 }));

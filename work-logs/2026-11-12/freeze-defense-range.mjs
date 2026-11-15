import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const root = 'work-logs/2026-11-12';
const previous = JSON.parse(fs.readFileSync(`${root}/retreat-observation-freeze.json`, 'utf8'));
const files = [...Object.keys(previous.sha256), ...['standard', 'forward'].map(plan => `${root}/retreat-observation-${plan}/opponent-diagnose-purchase-retreat-observation.json`),
  ...['defense-range-transform.mjs', 'defense-range-hook.mjs', 'defense-range-tests.mjs', 'summarize-defense-range.mjs', 'freeze-defense-range.mjs'].map(file => `${root}/${file}`)];
const sha256 = Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
for (const [file, value] of Object.entries(previous.sha256)) assert.equal(sha256[file], value, file);
assert.ok(!fs.existsSync(`${root}/defense-range-freeze.json`));
fs.writeFileSync(`${root}/defense-range-freeze.json`, JSON.stringify({ seeds: previous.seeds, map: 'warehouse', plans: ['standard', 'forward'],
  scope: 'Known 12 condition diagnostic; shared visible-enemy list limited to own weapon range; HP rule unchanged', sha256 }, null, 2) + '\n');
console.log(JSON.stringify({ frozenFiles: Object.keys(sha256).length, diagnosticMatches: 12 }));

import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root = 'work-logs/2026-11-12';
const previous = JSON.parse(fs.readFileSync(`${root}/attack-switch-freeze.json`, 'utf8'));
const seedSpec = JSON.parse(fs.readFileSync(`${root}/independent-initial46-freeze.json`, 'utf8'));
const files = [...Object.keys(previous.sha256), ...['relay', 'warehouse'].map(map => `${root}/independent-initial46-${map}/opponent-diagnose-purchase-independent-initial46.json`),
  `${root}/attack-switch-site/opponent-diagnose-purchase-attack-switch-site.json`, `${root}/summarize-site-maps.mjs`, `${root}/freeze-site-maps.mjs`];
const sha256 = Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
for (const [file, value] of Object.entries(previous.sha256)) assert.equal(sha256[file], value, file);
assert.ok(!fs.existsSync(`${root}/site-maps-freeze.json`));
fs.writeFileSync(`${root}/site-maps-freeze.json`, JSON.stringify({ seeds: seedSpec.seeds, maps: ['relay', 'warehouse', 'research'], policies: ['both', 'site'],
  newMatches: 24, reusedMatches: 48, initialOnly: true, independentValidation: false, sha256 }, null, 2) + '\n');
console.log(JSON.stringify({ frozenFiles: Object.keys(sha256).length, newMatches: 24, reusedMatches: 48 }));

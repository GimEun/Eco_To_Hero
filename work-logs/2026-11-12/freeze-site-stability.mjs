import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const root = 'work-logs/2026-11-12';
const previous = JSON.parse(fs.readFileSync(`${root}/site-calibration-freeze.json`, 'utf8'));
const prior = JSON.parse(fs.readFileSync(`${root}/independent-reactive48-freeze.json`, 'utf8'));
const files = [...Object.keys(previous.sha256), ...['relay', 'warehouse', 'research'].map(map => `${root}/independent-reactive48-${map}/opponent-diagnose-purchase-independent-reactive48.json`),
  `${root}/summarize-site-stability.mjs`, `${root}/freeze-site-stability.mjs`];
const sha256 = Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
for (const [file, value] of Object.entries(previous.sha256)) assert.equal(sha256[file], value, file);
assert.ok(!fs.existsSync(`${root}/site-stability-freeze.json`));
fs.writeFileSync(`${root}/site-stability-freeze.json`, JSON.stringify({ seeds: prior.seeds, maps: ['relay', 'warehouse', 'research'],
  range: [48, 54], opponentVariant: 'current', policy: 'site-only attack switch; existing defense switch',
  newMatches: 36, reusedFixedMatches: 36, historicalBothMatches: 36, independentValidation: false, sha256 }, null, 2) + '\n');
console.log(JSON.stringify({ frozenFiles: Object.keys(sha256).length, newMatches: 36 }));

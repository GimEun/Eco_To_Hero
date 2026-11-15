import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root = 'work-logs/2026-11-12';
const previous = JSON.parse(fs.readFileSync(`${root}/independent-initial46-freeze.json`, 'utf8'));
const files = [...Object.keys(previous.sha256), `${root}/independent-initial46-research/opponent-diagnose-purchase-independent-initial46.json`,
  ...['attack-switch-transform.mjs', 'attack-switch-hook.mjs', 'attack-switch-check.mjs', 'attack-switch-tests.mjs', 'summarize-attack-switch.mjs', 'freeze-attack-switch.mjs'].map(file => `${root}/${file}`)];
const sha256 = Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
for (const [file, value] of Object.entries(previous.sha256)) assert.equal(sha256[file], value, file);
assert.ok(!fs.existsSync(`${root}/attack-switch-freeze.json`));
fs.writeFileSync(`${root}/attack-switch-freeze.json`, JSON.stringify({ seeds: previous.seeds, policies: ['none', 'tactic', 'site', 'both'],
  map: 'research', initialOnly: true, defense: 'unchanged own-side two-loss switch', purchase: 'unchanged legacy/mixed',
  reference: 'independent-initial46-research/opponent-diagnose-purchase-independent-initial46.json',
  newMatches: 36, reusedMatches: 12, independentValidation: false, sha256 }, null, 2) + '\n');
console.log(JSON.stringify({ frozen: files.length, newMatches: 36, reusedMatches: 12 }));

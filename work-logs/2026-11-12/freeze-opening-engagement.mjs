import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const root = 'work-logs/2026-11-12';
const previous = JSON.parse(fs.readFileSync(`${root}/warehouse-start-freeze.json`, 'utf8'));
const files = [...Object.keys(previous.sha256), `${root}/warehouse-start-forward/opponent-diagnose-purchase-warehouse-start.json`,
  ...['opening-engagement.mjs', 'opening-engagement-hook.mjs', 'opening-engagement-tests.mjs', 'summarize-opening-engagement.mjs', 'freeze-opening-engagement.mjs'].map(file => `${root}/${file}`)];
const sha256 = Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
for (const [file, value] of Object.entries(previous.sha256)) assert.equal(sha256[file], value, file);
assert.ok(!fs.existsSync(`${root}/opening-engagement-freeze.json`));
fs.writeFileSync(`${root}/opening-engagement-freeze.json`, JSON.stringify({ seeds: previous.seeds, map: 'warehouse', startingAttackTeam: 'away',
  plans: ['standard', 'forward'], scope: 'Replay 12 known whole matches, observe opening only; no behavioral changes', sha256 }, null, 2) + '\n');
console.log(JSON.stringify({ frozenFiles: Object.keys(sha256).length, replayMatches: 12 }));

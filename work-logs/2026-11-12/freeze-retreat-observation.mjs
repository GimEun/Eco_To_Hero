import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const root = 'work-logs/2026-11-12';
const previous = JSON.parse(fs.readFileSync(`${root}/opening-engagement-freeze.json`, 'utf8'));
const files = [...Object.keys(previous.sha256), ...['standard', 'forward'].map(plan => `${root}/opening-engagement-${plan}/opponent-diagnose-purchase-opening-engagement.json`),
  ...['retreat-observer.mjs', 'retreat-observer-hook.mjs', 'retreat-observer-tests.mjs', 'summarize-retreat-observation.mjs', 'freeze-retreat-observation.mjs'].map(file => `${root}/${file}`)];
const sha256 = Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
for (const [file, value] of Object.entries(previous.sha256)) assert.equal(sha256[file], value, file);
assert.ok(!fs.existsSync(`${root}/retreat-observation-freeze.json`));
fs.writeFileSync(`${root}/retreat-observation-freeze.json`, JSON.stringify({ seeds: previous.seeds, map: 'warehouse', startingAttackTeam: 'away',
  plans: ['standard', 'forward'], scope: 'Read-only retreat observation; replay same 12 games, no new sample', sha256 }, null, 2) + '\n');
console.log(JSON.stringify({ frozenFiles: Object.keys(sha256).length, replayMatches: 12 }));

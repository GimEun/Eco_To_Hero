import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root = 'work-logs/2026-11-12';
const previous = JSON.parse(fs.readFileSync(`${root}/research-opening-freeze.json`, 'utf8'));
const files = [...Object.keys(previous.sha256), ...['split', 'execute'].map(plan => `${root}/research-opening-${plan}/opponent-diagnose-purchase-research-opening.json`),
  ...['entry-support-observer.mjs', 'entry-support-hook.mjs', 'entry-support-tests.mjs', 'summarize-entry-support.mjs', 'freeze-entry-support.mjs'].map(file => `${root}/${file}`)];
const sha256 = Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
for (const [file, value] of Object.entries(previous.sha256)) assert.equal(sha256[file], value, file);
assert.ok(!fs.existsSync(`${root}/entry-support-freeze.json`));
fs.writeFileSync(`${root}/entry-support-freeze.json`, JSON.stringify({ seeds: previous.seeds, plans: previous.plans,
  scope: 'Read-only entry/support observations; replay six research attacking-start matches', sha256 }, null, 2) + '\n');
console.log(JSON.stringify({ frozenFiles: Object.keys(sha256).length, replayedMatches: 6 }));

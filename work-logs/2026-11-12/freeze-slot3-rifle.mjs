import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const root = 'work-logs/2026-11-12';
const previous = JSON.parse(fs.readFileSync(`${root}/start-choice42-freeze.json`, 'utf8'));
const files = [...Object.keys(previous.sha256), ...['slot3-rifle-transform.mjs', 'slot3-rifle-hook.mjs', 'slot3-rifle-tests.mjs', 'summarize-slot3-rifle.mjs', 'freeze-slot3-rifle.mjs'].map(file => `${root}/${file}`)];
const sha256 = Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
for (const [file, value] of Object.entries(previous.sha256)) assert.equal(sha256[file], value, file);
assert.ok(!fs.existsSync(`${root}/slot3-rifle-freeze.json`));
fs.writeFileSync(`${root}/slot3-rifle-freeze.json`, JSON.stringify({ seeds: [73, 101, 211], maps: ['relay', 'warehouse', 'research'], range: [42, 54],
  changedParameter: 'Both teams preferred weapon at slot3: shotgun -> training-rifle', newConditions: 36, reusedConditions: 36, sha256 }, null, 2) + '\n');
console.log(JSON.stringify({ frozenFiles: Object.keys(sha256).length, newConditions: 36 }));

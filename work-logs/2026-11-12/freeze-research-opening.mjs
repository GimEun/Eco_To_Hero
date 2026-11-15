import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root = 'work-logs/2026-11-12';
const previous = JSON.parse(fs.readFileSync(`${root}/research-start38-freeze.json`, 'utf8'));
const files = [...Object.keys(previous.sha256), `${root}/research-start38-execute/opponent-diagnose-purchase-research-start38.json`,
  ...['opening-engagement.mjs', 'retreat-observer.mjs', 'research-opening-hook.mjs', 'research-opening-tests.mjs', 'summarize-research-opening.mjs', 'freeze-research-opening.mjs'].map(file => `${root}/${file}`)];
const sha256 = Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
for (const [file, value] of Object.entries(previous.sha256)) assert.equal(sha256[file], value, file);
assert.ok(!fs.existsSync(`${root}/research-opening-freeze.json`));
fs.writeFileSync(`${root}/research-opening-freeze.json`, JSON.stringify({ seeds: previous.seeds, map: 'research', plans: ['split', 'execute'],
  scope: 'Replay six known attacking-opening games with read-only observations', sha256 }, null, 2) + '\n');
console.log(JSON.stringify({ frozenFiles: Object.keys(sha256).length, replayedMatches: 6 }));

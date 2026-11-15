import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const root = 'work-logs/2026-11-12';
const previous = JSON.parse(fs.readFileSync(`${root}/site-maps-freeze.json`, 'utf8'));
const data = JSON.parse(fs.readFileSync(`${root}/reactive-calibration-summary.json`, 'utf8'));
const candidates = ['range46', 'range48', 'attack46'].map(name => {
  const candidate = data.candidates.find(candidate => candidate.name === name);
  return { name, range: candidate.range, variant: candidate.variant, reference: candidate.file };
});
const files = [...Object.keys(previous.sha256), ...candidates.map(candidate => `${root}/${candidate.reference}`), `${root}/summarize-site-calibration.mjs`, `${root}/freeze-site-calibration.mjs`];
const sha256 = Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
for (const [file, value] of Object.entries(previous.sha256)) assert.equal(sha256[file], value, file);
assert.ok(!fs.existsSync(`${root}/site-calibration-freeze.json`));
fs.writeFileSync(`${root}/site-calibration-freeze.json`, JSON.stringify({ seeds: [73, 101, 211], maps: ['relay', 'warehouse', 'research'], candidates,
  policy: 'site-only attack switch; unchanged defense two-loss switch', initialOnly: true,
  targets: { fixedMaximum: .2, reactiveMinimum: .55, reactiveMaximum: .65 },
  selection: 'squared outside-target distance; reactive winning margin; candidate order',
  newMatches: 54, reusedMatches: 54, independentValidation: false, sha256 }, null, 2) + '\n');
console.log(JSON.stringify({ frozenFiles: Object.keys(sha256).length, newMatches: 54, reusedMatches: 54 }));

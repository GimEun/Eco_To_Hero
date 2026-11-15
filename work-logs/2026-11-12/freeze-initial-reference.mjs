import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const root = 'work-logs/2026-11-12';
const name = 'independent-initial46';
const read = path => JSON.parse(fs.readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
const comparison = read(`${root}/reactive-calibration-summary.json`);
const previous = read(`${root}/independent-reactive48-freeze.json`);
const seeds = [18313, 19319, 20323, 21341, 22343, 23371];
const evaluated = comparison.candidates.map((candidate, index) => {
  const groups = candidate.groups.filter(group => !group.recruit);
  return { name: candidate.name, index, range: candidate.range, variant: candidate.variant,
    distance: groups.reduce((sum, group) => sum + group.distance ** 2, 0),
    margin: groups.find(group => group.profile === 'combined').winningMargin, groups };
}).sort((a, b) => a.distance - b.distance || a.margin - b.margin || a.index - b.index);
assert.equal(evaluated[0].name, 'attack46');
// Check recorded seeds only, without generating or inspecting any reserved world.
function visit(value, key = '') {
  if (key === 'seed') assert.ok(!seeds.includes(value), `Previously used seed: ${value}`);
  if (key === 'seeds' && Array.isArray(value)) for (const seed of value) assert.ok(!seeds.includes(seed), `Previously used seed: ${seed}`);
  if (value && typeof value === 'object') for (const [child, data] of Object.entries(value)) visit(data, child);
}
for (const entry of fs.readdirSync('work-logs', { recursive: true, withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.json')) visit(read(`${entry.parentPath}/${entry.name}`));
}
const chosen = evaluated[0];
const spec = { ...previous, seeds, statRange: [chosen.range, 54], opponentVariant: chosen.variant,
  previousFailedValidation: ['independent44-summary.json', 'independent-reactive48-summary.json'],
  targetScope: 'initial-only; recruited same-AI paired effect without win-rate cap',
  selection: evaluated, note: 'New user-approved target scope. Known candidates re-ranked; one candidate frozen before new worlds. Prior failures unchanged.' };
spec.sha256 = Object.fromEntries([...Object.keys(previous.sha256), `${root}/freeze-initial-reference.mjs`, `${root}/summarize-initial-reference.mjs`]
  .map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
assert.ok(!fs.existsSync(`${root}/${name}-freeze.json`), 'Do not replace a frozen protocol');
fs.writeFileSync(`${root}/${name}-freeze.json`, JSON.stringify(spec, null, 2) + '\n');
console.log(JSON.stringify({ selected: chosen, seeds, frozenFiles: Object.keys(spec.sha256).length }));

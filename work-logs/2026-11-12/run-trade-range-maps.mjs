import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const root = 'work-logs/2026-11-12';
const read = name => JSON.parse(fs.readFileSync(`${root}/${name}`, 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const maps = ['relay', 'warehouse', 'research'], seeds = [73, 101, 211];
const key = row => [row.seed, row.map, row.side, row.profile].join(':');
const expected = seeds.flatMap(seed => maps.flatMap(map => ['home', 'away'].flatMap(side => ['fixed', 'combined'].map(profile => ({ seed, map, side, profile })))));
const reused = expected.filter(row => row.map === 'research' && row.side === 'home' && row.profile === 'combined');
const previous = read('trade-range-freeze.json');
for (const [file, value] of Object.entries(previous.sha256)) assert.equal(hash(file), value, file);
const files = [...Object.keys(previous.sha256),
  ...maps.map(map => `${root}/slot3-rifle38-${map}/opponent-diagnose-purchase-slot3-rifle38.json`),
  `${root}/trade-range-split/opponent-diagnose-purchase-trade-range.json`,
  ...['trade-range-maps-hook.mjs', 'run-trade-range-maps.mjs', 'summarize-trade-range-maps.mjs'].map(file => `${root}/${file}`)];
const sha256 = Object.fromEntries(files.map(file => [file, hash(file)]));
const spec = { maps, seeds, expected, reused, newConditions: expected.filter(row => !reused.some(old => key(old) === key(row))), sha256,
  scope: 'Original map choices, range-compatible trade point only; 3 reused and 33 new known-world initial-roster cases.' };
assert.equal(spec.newConditions.length, 33);
assert.ok(!fs.existsSync(`${root}/trade-range-maps-freeze.json`));
fs.writeFileSync(`${root}/trade-range-maps-freeze.json`, JSON.stringify(spec, null, 2) + '\n');
console.log(JSON.stringify({ frozenFiles: files.length, newMatches: 33, reusedMatches: 3 }));
const hooks = ['diagnostic-output-retry', 'risk-trace-hook', 'attack-switch-hook', 'shared-autobuy-hook', 'slot3-rifle-hook', 'shared-baseline-hook', 'trade-range-hook', 'trade-range-maps-hook'];
await Promise.all(maps.map(map => new Promise((resolve, reject) => {
  const output = `${root}/trade-range-maps-${map}`;
  assert.ok(!fs.existsSync(output));
  const args = [...hooks.flatMap(hook => ['--import', `./${root}/${hook}.mjs`]), 'scripts/calibrate-opponent-strategy.js',
    'diagnose-purchase-trade-range-maps', seeds.join(','), '0', 'armor', '38,54', output, 'mixed', 'current',
    `${root}/risk-training/selected-choices.json`, 'legacy', map, 'dominant', 'initial', 'reactive'];
  const child = spawn(process.execPath, args, { env: { ...process.env, RISK_VARIANT: 'support-first', DIAGNOSTIC_ATTACK_POLICY: 'site', DIAGNOSTIC_OUTPUT_DIR: output }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  child.stdout.on('data', data => process.stdout.write(`${map}: ${data}`));
  child.stderr.on('data', data => process.stderr.write(`${map}: ${data}`));
  child.on('error', reject);
  child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${map} exit ${code}`)));
})));
console.log('All 33 new matches completed.');

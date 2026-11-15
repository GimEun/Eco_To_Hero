import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const root = 'work-logs/2026-11-12';
const read = file => JSON.parse(fs.readFileSync(`${root}/${file}`, 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const previous = read('trade-range-maps-freeze.json');
for (const [path, value] of Object.entries(previous.sha256)) assert.equal(hash(path), value, path);
const files = [...new Set([...Object.keys(previous.sha256), `${root}/trade-range-maps-research/opponent-diagnose-purchase-trade-range-maps.json`,
  ...['research-defense-observer.mjs', 'research-defense-hook.mjs', 'run-research-defense.mjs', 'summarize-research-defense.mjs',
    'opening-engagement.mjs', 'retreat-observer.mjs', 'opening-engagement-tests.mjs', 'retreat-observer-tests.mjs'].map(file => `${root}/${file}`)])];
const spec = { seeds: [73, 101, 211], map: 'research', side: 'away', profiles: ['fixed', 'combined'],
  scope: 'Read-only first-defense-round observation, full six-match replay equality required.',
  sha256: Object.fromEntries(files.map(path => [path, hash(path)])) };
assert.ok(!fs.existsSync(`${root}/research-defense-freeze.json`));
fs.writeFileSync(`${root}/research-defense-freeze.json`, JSON.stringify(spec, null, 2) + '\n');
const output = `${root}/research-defense-opening`;
assert.ok(!fs.existsSync(output));
const hooks = ['diagnostic-output-retry', 'risk-trace-hook', 'attack-switch-hook', 'shared-autobuy-hook', 'slot3-rifle-hook', 'shared-baseline-hook', 'trade-range-hook', 'research-defense-hook'];
const args = [...hooks.flatMap(hook => ['--import', `./${root}/${hook}.mjs`]), 'scripts/calibrate-opponent-strategy.js',
  'diagnose-purchase-research-defense', spec.seeds.join(','), '0', 'armor', '38,54', output, 'mixed', 'current',
  `${root}/risk-training/selected-choices.json`, 'legacy', 'research', 'dominant', 'initial', 'reactive'];
console.log(JSON.stringify({ frozenFiles: files.length, replayMatches: 6 }));
await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, { env: { ...process.env, RISK_VARIANT: 'support-first', DIAGNOSTIC_ATTACK_POLICY: 'site', DIAGNOSTIC_OUTPUT_DIR: output }, stdio: 'inherit', windowsHide: true });
  child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Replay exit ${code}`)));
});

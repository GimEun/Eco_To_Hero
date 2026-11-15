import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const root = 'work-logs/2026-11-12';
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const seeds = [73, 101, 211], maps = ['relay', 'warehouse', 'research'];
if (process.argv[2] === 'prepare') {
  assert.ok(!fs.existsSync(`${root}/final-behavior-freeze.json`));
  const old = JSON.parse(fs.readFileSync(`${root}/risk-source-hashes.json`, 'utf8'));
  const productionBefore = Object.fromEntries(Object.keys(old).map(file => [file, hash(file)]));
  for (const [file, value] of Object.entries(old)) assert.equal(productionBefore[file], value, file);
  fs.writeFileSync(`${root}/final-behavior-defense-before.txt`, fs.readFileSync('src/simulation/defense-tactics.js'));
  const expected = seeds.flatMap(seed => maps.flatMap(map => ['home', 'away'].flatMap(side => ['fixed', 'combined'].map(profile => ({ seed, map, side, profile })))));
  fs.writeFileSync(`${root}/final-behavior-freeze.json`, JSON.stringify({ seeds, maps, expected, productionBefore,
    scope: 'One 72-match before/after batch; live stat range and weapons, shared auto-buy, no risk/trade/slot3 experiments; no numeric win-rate target.' }, null, 2) + '\n');
  console.log('Baseline source and 36 paired conditions frozen.');
} else {
  assert.equal(process.argv[2], 'compare');
  const hooks = ['diagnostic-output-retry', 'attack-switch-hook', 'shared-autobuy-hook', 'shared-baseline-hook'];
  await Promise.all(['before', 'after'].map(variant => new Promise((resolve, reject) => {
    const output = `${root}/final-behavior-${variant}`;
    assert.ok(!fs.existsSync(`${output}/opponent-diagnose-purchase-final-behavior.json`));
    const selected = variant === 'before' ? [...hooks, 'final-behavior-baseline-hook'] : hooks;
    const args = [...selected.flatMap(hook => ['--import', `./${root}/${hook}.mjs`]), 'scripts/calibrate-opponent-strategy.js',
      'diagnose-purchase-final-behavior', seeds.join(','), '0', 'armor', '-', output, 'mixed', 'current',
      `${root}/risk-training/selected-choices.json`, 'legacy', '-', 'dominant', 'initial', 'reactive'];
    const child = spawn(process.execPath, args, { env: { ...process.env, DIAGNOSTIC_ATTACK_POLICY: 'site', DIAGNOSTIC_OUTPUT_DIR: output }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    child.stdout.on('data', data => process.stdout.write(`${variant}: ${data}`));
    child.stderr.on('data', data => process.stderr.write(`${variant}: ${data}`));
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${variant} exit ${code}`)));
  })));
}

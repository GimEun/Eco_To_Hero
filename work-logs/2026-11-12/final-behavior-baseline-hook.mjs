import { registerHooks } from 'node:module';
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const target = new URL('../../src/simulation/defense-tactics.js', import.meta.url).href;
const root = 'work-logs/2026-11-12';
const spec = JSON.parse(fs.readFileSync(`${root}/final-behavior-freeze.json`, 'utf8'));
const original = fs.readFileSync(`${root}/final-behavior-defense-before.txt`, 'utf8');
const originalHash = Object.entries(spec.productionBefore).find(([file]) => file.replaceAll('\\', '/') === 'src/simulation/defense-tactics.js')?.[1];
assert.equal(crypto.createHash('sha256').update(original).digest('hex'), originalHash);
registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  return url === target ? { ...result, source: original } : result;
} });

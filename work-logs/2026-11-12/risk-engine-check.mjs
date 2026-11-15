// Run explicitly with --import ./work-logs/2026-11-12/risk-detour-hook.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPractice, advancePractice } from '../../src/simulation/practice.js';
import { PRACTICE_MAPS } from '../../src/data/maps/index.js';
const club = name => ({ name, players: Array.from({ length: 5 }, (_, i) => ({
  id: `${name}${i}`, name: `${name}${i}`, nickname: `${name}${i}`, aim: 50, intelligence: 50, stamina: 50,
})) });
for (const map of PRACTICE_MAPS) test(`격리 훅 ${map.id}: 시간 분할에 따른 경기·진단 상태가 같다`, () => {
  const options = { round: true, seed: 73, attackTeam: 'home',
    attackPlans: { home: 'split', away: 'execute' }, defensePlans: { home: 'standard', away: 'forward' } };
  const a = createPractice(map, club('home'), club('away'), options);
  const b = createPractice(map, club('home'), club('away'), options);
  advancePractice(a, map, 20000);
  for (let i = 0; i < 400; i++) advancePractice(b, map, 50);
  assert.deepEqual(a, b);
  assert.ok(a.round.diagnosticRisk, 'This test must run with the diagnostic hook');
});

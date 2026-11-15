import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { verifyReactiveChanges } from './reactive-policy-check.mjs';
const data = ['relay', 'warehouse', 'research'].flatMap(map => JSON.parse(fs.readFileSync(
  `work-logs/2026-11-12/reactive-eval44-${map}/opponent-diagnose-purchase-reactive-eval44.json`, 'utf8')).rows);
const example = data.find(row => row.profile === 'combined' && row.homeChanges.some(change => change.role === 'attack'));
assert.ok(example);
test('반응형 실제 변경 기록은 과거 자기 진영 연패와 실행된 전술/사이트에 일치한다', () => {
  for (const row of data.filter(row => row.profile === 'combined')) assert.equal(verifyReactiveChanges(row), row.homeChanges.length);
});
test('연패 이전·미래 라운드의 변경 기록을 거부한다', () => {
  const early = structuredClone(example); early.homeChanges[0].round = 1;
  assert.throws(() => verifyReactiveChanges(early));
  const future = structuredClone(example); future.homeChanges.push({ ...future.homeChanges[0], round: future.rounds + 1 });
  assert.throws(() => verifyReactiveChanges(future));
});
test('자기 승리를 연패로 취급한 가짜 변경 기록을 거부한다', () => {
  const row = structuredClone(example), first = row.homeChanges[0];
  const preceding = row.detail.slice(0, first.round - 1).filter(round =>
    (round.attackTeam === 'home' ? 'attack' : 'defense') === first.role && round.winner !== 'home');
  assert.ok(preceding.length >= 2); preceding.at(-1).winner = 'home';
  assert.throws(() => verifyReactiveChanges(row));
});
test('잘못된 사이트 전환과 변경 없이 달라진 실제 전술을 거부한다', () => {
  const site = structuredClone(example), decision = site.homeChanges.find(change => change.role === 'attack');
  decision.site = decision.previousSite;
  assert.throws(() => verifyReactiveChanges(site));
  const plan = structuredClone(example); plan.detail[0].attackPlans.home = 'invalid';
  assert.throws(() => verifyReactiveChanges(plan));
});

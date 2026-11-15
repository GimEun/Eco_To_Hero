import test from 'node:test';
import assert from 'node:assert/strict';
import { seasonScreen } from '../src/ui/season-screen.js';
import { promoted, cityReady } from './city-fixture.js';
import { finished } from './world-finals-fixture.js';

function render(t, world) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ innerHTML: '' }) } });
  t.after(() => previous ? Object.defineProperty(globalThis, 'document', previous) : delete globalThis.document);
  const before = structuredClone(world);
  const markup = seasonScreen(world).innerHTML;
  assert.deepEqual(world, before, '성과 표시는 월드·결과·정산을 변경하지 않는다');
  return markup;
}

test('PC방 우승과 시 리그 진출은 확정 결과로 표시한다', t => {
  const markup = render(t, promoted());
  assert.match(markup, /class="season-achievement"/);
  assert.match(markup, /PC방 리그 우승/);
  assert.match(markup, /시 리그 진출 확정/);
});

test('진행 중인 시 리그에 이전 PC방 우승 연출을 표시하지 않는다', t => {
  assert.doesNotMatch(render(t, cityReady()), /class="season-achievement"/);
});

test('결승 미완료는 우승으로 표시하지 않는다', t => {
  const world = promoted();
  const final = world.pcSeason.playoffs.series[2];
  final.result = null;
  final.scores = [];
  world.pcSeason.playoffs.settled = false;
  world.officialRecords.receipts = world.officialRecords.receipts.filter(receipt => receipt.fixtureId !== final.id);
  assert.doesNotMatch(render(t, world), /class="season-achievement"/);
});

for (const place of [1, 2, 3]) test(`세계 최종 ${place}위: 우승은 1위에만 표시한다`, t => {
  const markup = render(t, finished(place));
  if (place === 1) {
    assert.match(markup, /class="season-achievement"/);
    assert.match(markup, /세계 리그 우승/);
    assert.doesNotMatch(markup, /세계 리그 진출 확정/);
  } else assert.doesNotMatch(markup, /class="season-achievement"/);
});

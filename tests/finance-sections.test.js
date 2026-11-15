import test from 'node:test';
import assert from 'node:assert/strict';
import { financePanel, mountFinanceSections } from '../src/ui/finance-panel.js';
import { createWorld } from '../src/game/create-world.js';
import { createClub } from '../src/game/create-club.js';
import { getClubView } from '../src/game/world-selectors.js';

test('재정 요약은 모든 항목에 공통으로 남고 선택한 영역 하나만 표시한다', () => {
  const world = createWorld(createClub('재정 화면').club, 42), before = structuredClone(world);
  for (const id of ['sponsors', 'loans', 'stocks', 'settlements']) {
    const html = financePanel(getClubView(world), id);
    const panels = [...html.matchAll(/data-finance-section="([^"]+)"([^>]*)>/g)];
    assert.equal(panels.length, 4);
    assert.deepEqual(panels.filter(([, , attrs]) => !attrs.includes('hidden')).map(([, key]) => key), [id]);
    const overview = html.match(/<div class="finance-overview">([\s\S]*?)<div class="finance-section-body">/)[1];
    assert.match(overview, /구단 재정/);
    assert.match(overview, /운영 자금 \$15,000/);
    assert.match(overview, /주간 총 비용/);
    assert.doesNotMatch(overview, /data-finance-section=/);
  }
  assert.deepEqual(world, before);
});

test('클릭·방향키로 항목을 전환하고 기존 내용과 입력값을 유지한다', () => {
  const ids = ['sponsors', 'loans', 'stocks', 'settlements'];
  const buttons = ids.map(id => ({ dataset: { financeTab: id }, attrs: {}, setAttribute(key, value) { this.attrs[key] = value; }, getAttribute() { return `finance-section-${id}`; }, focus() { this.focused = true; }, closest() { return this; } }));
  const panels = ids.map(id => ({ dataset: { financeSection: id }, hidden: id !== 'sponsors', inputValue: '7' }));
  const body = { scrollTop: 200 }, listeners = {}, changes = [];
  const screen = {
    querySelectorAll: key => key === '[data-finance-tab]' ? buttons : panels,
    querySelector: selector => selector.startsWith('#finance-section-') ? panels.find(panel => panel.dataset.financeSection === selector.slice(17)) : body,
    addEventListener: (key, callback) => { listeners[key] = callback; },
  };
  mountFinanceSections(screen, id => changes.push(id));
  listeners.click({ target: buttons[2] });
  assert.deepEqual(panels.filter(panel => !panel.hidden).map(panel => panel.dataset.financeSection), ['stocks']);
  assert.equal(body.scrollTop, 0);
  listeners.keydown({ target: buttons[2], key: 'ArrowRight', preventDefault() {} });
  assert.equal(changes.at(-1), 'settlements');
  assert.equal(buttons[3].focused, true);
  assert.equal(buttons.filter(button => button.tabIndex === 0).length, 1);
  assert.ok(panels.every(panel => panel.inputValue === '7'));
});

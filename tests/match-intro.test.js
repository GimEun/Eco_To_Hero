import test from 'node:test';
import assert from 'node:assert/strict';
import { showMatchIntro } from '../src/ui/match-intro.js';

function boundary(t, unsupported = false) {
  const original = { document: globalThis.document, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  const listeners = new Map();
  const dialog = {
    open: false, removed: false, innerHTML: '', attributes: {},
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(key, value) { listeners.set(key, value); },
    removeEventListener(key) { listeners.delete(key); },
    showModal() { if (unsupported) throw new Error('unsupported'); this.open = true; },
    close() { this.open = false; listeners.get('close')?.(); },
    remove() { this.removed = true; },
  };
  let timer = null, cleared = false, appended = false;
  globalThis.document = { createElement: () => dialog, body: { append: () => { appended = true; } } };
  globalThis.setTimeout = (callback, delay) => { timer = { callback, delay }; return 7; };
  globalThis.clearTimeout = () => { cleared = true; };
  t.after(() => { for (const [key, value] of Object.entries(original)) globalThis[key] = value; });
  return { dialog, listeners, timer: () => timer, cleared: () => cleared, appended: () => appended };
}

const home = { name: '<내 구단>', logoId: 'Be_B' };
const away = { name: 'P1', logoId: 'D_R' };

for (const method of ['timer', 'escape', 'click']) {
  test(`${method}: 시작 연출은 3초 또는 스킵 후 한 번 종료하고 타이머·입력을 정리한다`, async t => {
    const f = boundary(t);
    const pending = showMatchIntro(home, away);
    assert.equal(f.appended(), true); assert.equal(f.dialog.open, true);
    assert.equal(f.timer().delay, 3000);
    assert.match(f.dialog.innerHTML, /&lt;내 구단&gt;/);
    assert.match(f.dialog.innerHTML, /P1/);
    assert.equal((f.dialog.innerHTML.match(/loading="eager"/g) ?? []).length, 2);
    assert.equal(f.dialog.innerHTML.includes('<내 구단>'), false);
    const callback = f.timer().callback;
    if (method === 'timer') callback();
    else if (method === 'click') f.listeners.get('click')();
    else {
      let prevented = false;
      f.listeners.get('cancel')({ preventDefault() { prevented = true; } });
      assert.equal(prevented, true);
    }
    await pending;
    callback();
    assert.equal(f.dialog.removed, true); assert.equal(f.dialog.open, false);
    assert.equal(f.cleared(), true); assert.equal(f.listeners.size, 0);
  });
}

test('연출용 모달을 지원하지 않으면 공식 경기 진입을 막지 않는다', async t => {
  const f = boundary(t, true);
  await showMatchIntro(home, away);
  assert.equal(f.dialog.removed, true); assert.equal(f.listeners.size, 0);
});

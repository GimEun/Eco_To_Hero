import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmClubReplacement } from '../src/ui/club-replacement-dialog.js';

function fixture(t, { showError = false } = {}) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document'), children = new Set();
  let last;
  const body = { append(dialog) { children.add(dialog); dialog.parentElement = body; } };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    body, createElement(tag) {
      assert.equal(tag, 'dialog');
      const listeners = new Map();
      last = { attributes: {}, returnValue: '', innerHTML: '', open: false,
        setAttribute(key, value) { this.attributes[key] = value; },
        addEventListener(type, callback) { listeners.set(type, callback); },
        showModal() { if (showError) throw new Error('show failed'); this.open = true; },
        close(value) { this.returnValue = value; this.open = false; listeners.get('close')(); },
        cancel() { let prevented = false; listeners.get('cancel')({ preventDefault() { prevented = true; } }); assert.equal(prevented, true); },
        remove() { children.delete(this); this.parentElement = null; },
      };
      return last;
    },
  } });
  t.after(() => previous ? Object.defineProperty(globalThis, 'document', previous) : delete globalThis.document);
  return { get dialog() { return last; }, children, body };
}
const options = { currentClubName: '현재 팀', savedClubName: '저장 팀', nextClubName: '새 팀' };

test('새 구단 확인은 앱 바깥 모달로 열리고 명시적 시작까지 결과를 보류한다', async t => {
  const f = fixture(t), result = confirmClubReplacement(options);
  let finished = false; result.then(() => { finished = true; });
  await Promise.resolve(); assert.equal(finished, false);
  assert.equal(f.dialog.parentElement, f.body); assert.equal(f.dialog.open, true);
  assert.equal(f.dialog.attributes['aria-labelledby'], 'club-replacement-title');
  assert.match(f.dialog.innerHTML, /현재 팀|저장 팀|새 팀/);
  assert.match(f.dialog.innerHTML, /기존 저장 슬롯을 새 구단으로 덮어/);
  assert.match(f.dialog.innerHTML, /value="cancel" autofocus/);
  f.dialog.close('replace'); assert.equal(await result, true); assert.equal(f.children.size, 0);
});

test('취소·Esc·선택 없는 닫기는 모두 거절하고 다시 열어도 이전 승인을 재사용하지 않는다', async t => {
  const f = fixture(t);
  for (const value of ['cancel', '', 'other']) {
    const result = confirmClubReplacement(options); f.dialog.close(value);
    assert.equal(await result, false); assert.equal(f.children.size, 0);
  }
  const escape = confirmClubReplacement(options); f.dialog.cancel();
  assert.equal(await escape, false); assert.equal(f.children.size, 0);
  const approved = confirmClubReplacement(options); f.dialog.close('replace'); assert.equal(await approved, true);
  const again = confirmClubReplacement(options); f.dialog.cancel(); assert.equal(await again, false);
});

test('구단 이름을 이스케이프하고 저장소 오류에는 실제로 바뀌는 범위만 설명한다', async t => {
  const f = fixture(t);
  const result = confirmClubReplacement({ currentClubName: '<img src=x>', savedClubName: '"저장"', nextClubName: '<script>x</script>', canSave: false });
  assert.doesNotMatch(f.dialog.innerHTML, /<img|<script/);
  assert.match(f.dialog.innerHTML, /&lt;img/); assert.match(f.dialog.innerHTML, /&lt;script/);
  assert.match(f.dialog.innerHTML, /기존 저장은 변경하지 않습니다/);
  assert.doesNotMatch(f.dialog.innerHTML, /기존 저장 슬롯을 새 구단으로 덮어/);
  f.dialog.close('cancel'); assert.equal(await result, false);
});

test('모달 열기 실패는 교체 승인으로 처리하지 않고 모달을 제거한다', async t => {
  const f = fixture(t, { showError: true });
  await assert.rejects(confirmClubReplacement(options), /show failed/);
  assert.equal(f.children.size, 0);
});

test('이어하기는 사이트 모달로 불러올 구단을 표시하고 취소/Esc/확인을 구분한다', async t => {
  const f = fixture(t);
  const load = { currentClubName: '<현재>', nextClubName: '저장 팀', mode: 'load' };
  for (const choice of ['cancel', 'escape', 'replace']) {
    const result = confirmClubReplacement(load);
    let resolved = false; result.then(() => { resolved = true; });
    await Promise.resolve();
    assert.equal(resolved, false);
    assert.equal(f.dialog.className, 'club-replacement-dialog');
    assert.match(f.dialog.innerHTML, /저장된 구단을 불러올까요/);
    assert.match(f.dialog.innerHTML, /불러올 구단/);
    assert.match(f.dialog.innerHTML, /&lt;현재&gt;/);
    assert.match(f.dialog.innerHTML, /저장하지 않은 진행 내용은 사라집니다/);
    assert.match(f.dialog.innerHTML, /저장된 구단 이어하기/);
    assert.doesNotMatch(f.dialog.innerHTML, /새 구단으로 시작|기존 저장 슬롯을 새 구단으로 덮어/);
    if (choice === 'escape') f.dialog.cancel(); else f.dialog.close(choice);
    assert.equal(await result, choice === 'replace');
    assert.equal(f.children.size, 0);
  }
});

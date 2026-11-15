import test from 'node:test';
import assert from 'node:assert/strict';
import { mountDescriptionNotes } from '../src/ui/description-notes.js';

// Supply measured line heights; browser wrapping and appearance remain a user check.
class ElementStub {
  constructor(tag) {
    this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {};
    this.parentElement = null; this.className = ''; this.attributes = {};
    this.hidden = false; this.open = false; this.lines = 1; this.listeners = new Map();
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); },
      remove: (...names) => { this.className = this.className.split(/\s+/).filter(name => !names.includes(name)).join(' '); },
      toggle: (name, enabled) => enabled ? this.classList.add(name) : this.classList.remove(name),
    };
  }
  get childNodes() { return [...this.children]; }
  get childElementCount() { return this.children.length; }
  get textContent() { return (this.text ?? '') + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { for (const child of this.children) child.parentElement = null; this.children = []; this.text = value; }
  get isConnected() { return this === document.body || Boolean(this.parentElement?.isConnected); }
  get clientWidth() { return this.getClientRects().length ? 360 : 0; }
  append(...children) {
    for (const child of children) { child.remove(); child.parentElement = this; this.children.push(child); }
  }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this);
    this.parentElement = null;
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) {
    delete this.attributes[name];
    if (name === 'id') this.id = '';
    if (name === 'data-description') delete this.dataset.description;
  }
  matches(selector) {
    return selector.split(',').some(part => {
      part = part.trim();
      if (part === '*') return true;
      if (part === '[data-description]') return this.dataset.description !== undefined;
      if (part === '[data-description-scope]') return this.dataset.descriptionScope !== undefined;
      if (part.startsWith('.')) return this.classList.contains(part.slice(1));
      return this.tagName.toLowerCase() === part;
    });
  }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null; }
  querySelectorAll(selector) {
    if (selector.startsWith(':scope > ')) return this.children.filter(child => child.matches(selector.slice(9)));
    return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  getClientRects() {
    for (let element = this; element; element = element.parentElement) {
      if (element.hidden || element.tagName === 'DIALOG' && !element.open) return [];
    }
    return this.isConnected ? [{}] : [];
  }
  getBoundingClientRect() { return { height: this.lines * 24, width: this.clientWidth }; }
  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler); this.listeners.set(type, handlers);
  }
  emit(type, event = {}) { for (const handler of this.listeners.get(type) ?? []) handler(event); }
  showModal() { this.open = true; }
  close() { this.open = false; this.emit('close'); }
  focus() { this.focused = true; }
  cloneNode(deep) {
    const copy = new ElementStub(this.tagName);
    Object.assign(copy, { dataset: { ...this.dataset }, className: this.className, id: this.id,
      hidden: this.hidden, open: this.open, text: this.text, lines: this.lines });
    if (deep) copy.append(...this.children.map(child => child.cloneNode(true)));
    return copy;
  }
}

function fixture(t, lines = 2, { hidden = false, tag = 'p' } = {}) {
  const globals = ['Element', 'document', 'ResizeObserver', 'MutationObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle'];
  const saved = globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  const root = new ElementStub('body'), scope = new ElementStub('section'); scope.className = 'panel'; scope.hidden = hidden;
  const control = new ElementStub('select'); control.value = 'broadcast';
  const source = new ElementStub(tag); source.dataset.description = '규칙'; source.id = 'input-help';
  source.textContent = '설명 첫 문장입니다. 다음 문장입니다.'; source.lines = lines;
  scope.append(source, control); root.append(scope);
  const frames = new Map(); let counter = 0, mutation, resize, disconnected = false;
  Object.assign(globalThis, {
    Element: ElementStub, document: { body: root, createElement: tagName => new ElementStub(tagName) },
    getComputedStyle: () => ({ lineHeight: '24px' }),
    requestAnimationFrame(callback) { frames.set(++counter, callback); return counter; },
    cancelAnimationFrame(id) { frames.delete(id); },
    MutationObserver: class { constructor(callback) { mutation = callback; } observe() {} disconnect() { disconnected = true; } },
    ResizeObserver: class { constructor(callback) { resize = callback; } observe() {} unobserve() {} disconnect() {} },
  });
  const dispose = mountDescriptionNotes(root);
  t.after(() => { dispose(); for (const [key, descriptor] of saved) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]; });
  function flush() { while (frames.size) { const entries = [...frames.values()]; frames.clear(); for (const callback of entries) callback(); } }
  flush();
  return { root, scope, source, control, dispose, flush, get disconnected() { return disconnected; },
    note: source.parentElement, button: source.parentElement.querySelector('button'),
    mutate: entry => { mutation([entry]); flush(); },
    resize: target => { resize([{ target }]); flush(); },
  };
}

test('1~2줄은 영역 하단에 원본 안내를 유지하고 정확히 3줄부터 설명 버튼을 표시한다', t => {
  const f = fixture(t, 1);
  assert.equal(f.scope.children.at(-1).className, 'site-description-footer');
  assert.equal(f.source.id, 'input-help'); assert.equal(f.button.hidden, true);
  assert.equal(f.source.attributes['aria-hidden'], 'false');
  for (const lines of [2, 3, 4, 2]) {
    f.source.lines = lines; f.resize(f.note);
    assert.equal(f.button.hidden, lines < 3);
    assert.equal(f.note.classList.contains('has-description-dialog'), lines >= 3);
  }
  assert.equal(f.control.value, 'broadcast');
});

test('숨겨진 탭과 설명은 표시 시 측정하고 내용이 없어지면 빈 안내 영역도 숨긴다', t => {
  const f = fixture(t, 3, { hidden: true });
  assert.equal(f.button.hidden, true);
  f.scope.hidden = false;
  f.mutate({ type: 'attributes', target: f.scope });
  assert.equal(f.button.hidden, false);
  f.source.hidden = true;
  f.mutate({ type: 'attributes', target: f.source });
  assert.equal(f.note.hidden, true); assert.equal(f.note.parentElement.hidden, true);
  f.source.hidden = false; f.source.textContent = '';
  f.mutate({ type: 'childList', target: f.source, addedNodes: [], removedNodes: [] });
  assert.equal(f.note.hidden, true);
  f.source.textContent = '갱신된 전술 설명';
  f.mutate({ type: 'childList', target: f.source, addedNodes: [], removedNodes: [] });
  assert.equal(f.note.hidden, false); assert.equal(f.note.parentElement.hidden, false);
  assert.equal(f.button.hidden, false);
});

test('설명창은 본문을 문단으로 표시하고 닫기 후 초점·행동 선택을 유지한다', t => {
  const f = fixture(t, 3);
  f.button.emit('click');
  const dialog = f.root.querySelector('dialog');
  assert.equal(dialog.open, true); assert.equal(dialog.parentElement, f.root);
  assert.equal(dialog.querySelectorAll('p').length, 2);
  dialog.querySelector('button').emit('click');
  assert.equal(dialog.isConnected, false); assert.equal(f.button.focused, true);
  assert.equal(f.control.value, 'broadcast');
  assert.equal(f.source.id, 'input-help');
});

test('긴 장비 안내는 표·설명 내용을 유지하고 모달 복사본에서 원본 ID와 재처리 표시를 제거한다', t => {
  const f = fixture(t, 4, { tag: 'details' });
  f.source.textContent = '';
  const summary = new ElementStub('summary'); summary.textContent = '장비 규칙';
  const table = new ElementStub('table'); table.id = 'weapon-data'; table.textContent = '무기 가격';
  f.source.append(summary, table);
  f.button.emit('click');
  const dialog = f.root.querySelector('dialog');
  assert.equal(dialog.querySelector('summary'), null);
  assert.equal(dialog.querySelector('table').textContent, '무기 가격');
  assert.equal(dialog.querySelector('table').id, '');
  assert.equal(dialog.querySelector('[data-description]'), null);
  assert.equal(table.id, 'weapon-data');
});

test('이벤트·주간 선택창 위의 설명은 부모 창을 닫지 않고 Esc 취소를 분리한다', t => {
  const f = fixture(t, 3);
  const parent = new ElementStub('dialog');
  f.root.append(parent); parent.append(f.scope); parent.showModal();
  f.button.emit('click');
  const dialog = f.root.querySelector('.site-description-dialog');
  assert.equal(dialog.open, true); assert.equal(parent.open, true);
  let stopped = false;
  dialog.emit('cancel', { stopPropagation() { stopped = true; } });
  assert.equal(stopped, true);
  dialog.close();
  assert.equal(parent.open, true); assert.equal(f.control.value, 'broadcast');
});

test('결과창에 복사된 안내는 버튼을 다시 연결하고 화면 제거 시 정리한다', t => {
  const f = fixture(t, 3);
  const copy = f.scope.cloneNode(true); f.root.append(copy);
  f.mutate({ type: 'childList', target: f.root, addedNodes: [copy], removedNodes: [] });
  assert.equal(copy.querySelectorAll('.site-description-note').length, 1);
  const source = copy.querySelector('[data-description]');
  const button = source.parentElement.querySelector('button');
  button.emit('click'); assert.equal(f.root.querySelector('dialog').open, true);
  copy.remove();
  f.mutate({ type: 'childList', target: f.root, addedNodes: [], removedNodes: [copy] });
  f.dispose(); assert.equal(f.root.querySelector('dialog'), null);
  assert.equal(f.disconnected, true);
});

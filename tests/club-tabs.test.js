import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/game/create-world.js';
import { createClub } from '../src/game/create-club.js';
import { getClubView } from '../src/game/world-selectors.js';
import { clubScreen } from '../src/ui/screens.js';
import { CLUB_TABS, clubTabForFocus } from '../src/ui/club-tabs.js';
import { advanceWeek } from '../src/game/calendar.js';

function fixture(t, options = {}) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const world = createWorld(createClub('구단 탭').club, 42);
  const listeners = new Map(), buttons = [], panels = [];
  let markup = '';
  const screen = {
    classList: { add() {} },
    set innerHTML(value) {
      markup = value;
      for (const match of value.matchAll(/<button[^>]*data-club-tab="([^"]+)"[^>]*>/g)) {
        const attributes = Object.fromEntries([...match[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1],m[2]]));
        const button = { dataset: { clubTab: match[1] }, attributes, tabIndex: Number(attributes.tabindex), focused: false,
          setAttribute(name, val) { this.attributes[name] = val; }, getAttribute(name) { return this.attributes[name]; }, focus() { this.focused = true; }, closest() { return this; } };
        buttons.push(button);
      }
      for (const match of value.matchAll(/<div[^>]*data-club-panel="([^"]+)"[^>]*>/g)) panels.push({ dataset: { clubPanel: match[1] }, hidden: /\shidden/.test(match[0]) });
    },
    get innerHTML() { return markup; },
    querySelector(selector) { return selector.startsWith('#club-panel-') ? panels.find(panel => panel.dataset.clubPanel === selector.slice(12)) : { textContent: '' }; },
    querySelectorAll(selector) { return selector === '[data-club-tab]' ? buttons : panels; },
    addEventListener(name, listener) { listeners.set(name, listener); },
  };
  Object.defineProperty(globalThis,'document',{ configurable: true, value: { createElement: () => screen } });
  t.after(() => previous ? Object.defineProperty(globalThis,'document',previous) : delete globalThis.document);
  options.prepare?.(world);
  const changes = [];
  clubScreen(getClubView(world),false,world,{ activeTab: options.activeTab, onTabChange: id => changes.push(id) });
  return { world, screen, buttons, panels, changes, listeners };
}

test('달력을 포함한 구단 관리 8개 탭 중 선택한 영역 하나만 표시하고 공통 진행/저장을 유지한다',t=>{
  const f=fixture(t,{activeTab:'facilities'});
  assert.equal(f.buttons.length,8); assert.equal(f.panels.length,8);
  assert.deepEqual(f.panels.filter(panel=>!panel.hidden).map(panel=>panel.dataset.clubPanel),['facilities']);
  assert.match(f.screen.innerHTML,/data-action="advance-week"/); assert.match(f.screen.innerHTML,/data-action="save"/);
  assert.doesNotMatch(f.screen.innerHTML,/class="stat-grid"/);
  assert.equal(f.buttons.filter(button=>button.tabIndex===0).length,1);
});

test('탭 클릭은 내용 재생성 없이 표시/접근성 상태만 바꾸고 선택을 전달한다',t=>{
  const f=fixture(t), before=f.screen.innerHTML, worldBefore=structuredClone(f.world);
  for(const id of ['contracts','coaches','finance','development']) {
    const button=f.buttons.find(button=>button.dataset.clubTab===id);
    f.listeners.get('click')({ target: button });
    assert.deepEqual(f.panels.filter(panel=>!panel.hidden).map(panel=>panel.dataset.clubPanel),[id]);
    assert.equal(button.attributes['aria-selected'],'true');
    assert.equal(f.buttons.filter(button=>button.attributes['aria-selected']==='true').length,1);
    assert.equal(f.changes.at(-1),id);
    assert.equal(f.screen.innerHTML,before);
  }
  assert.deepEqual(f.world,worldBefore);
});

test('좌우 방향키와 Home/End는 탭을 순환하고 초점을 옮긴다',t=>{
  const f=fixture(t);
  for(const [from,key,to] of [['roster','ArrowLeft','events'],['events','ArrowRight','roster'],['roster','End','events'],['events','Home','roster']]) {
    let prevented=false;
    f.listeners.get('keydown')({ target:f.buttons.find(button=>button.dataset.clubTab===from),key,preventDefault(){prevented=true;} });
    assert.equal(prevented,true); assert.equal(f.changes.at(-1),to);
    assert.equal(f.buttons.find(button=>button.dataset.clubTab===to).focused,true);
  }
});

test('주간 행동/이벤트 모달은 숨겨진 이벤트 탭 바깥에 있어 다른 탭에서도 접근 가능하다',t=>{
  const f=fixture(t,{ activeTab:'finance',prepare(world) {
    world.playerEvents.week={startedDay:1,endDay:8,teamTraining:false,event:{eventId:'dating',day:4,status:'scheduled',playerId:null,roll:null}};
    advanceWeek(world,{events:true});
  } });
  assert.equal(f.panels.find(panel=>panel.dataset.clubPanel==='events').hidden,true);
  assert.match(f.screen.innerHTML,/<\/section><\/div>\s*<dialog id="player-event-dialog"/);
  assert.match(f.screen.innerHTML,/<\/dialog>\s*<dialog id="weekly-action-dialog"/);
  assert.match(f.screen.innerHTML,/이벤트 선택 계속/);
});

test('작업 후 초점 대상은 올바른 탭을 선택하고 저장/일반 복귀는 현재 탭을 유지한다',()=>{
  for(const tab of CLUB_TABS) assert.equal(clubTabForFocus(tab.heading,'roster'),tab.id);
  assert.equal(clubTabForFocus(null,'facilities'),'facilities');
  assert.equal(clubTabForFocus('[data-action="advance-week"]','finance'),'finance');
  assert.equal(clubTabForFocus(null,'invalid'),'roster');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mountPractice } from '../src/ui/practice-screen.js';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { beginTeamTraining } from '../src/game/team-training.js';
import { nextOfficialFixture, createOfficialPractice } from '../src/game/official-match.js';

// 화면 제어를 Node에서 검증하는 최소 DOM/Canvas 경계. 브라우저 배치 검증은 하지 않는다.
function fixture(t, mode = 'match', teamTraining = false, official = false) {
  class Element {
    style = {};
    classList = {
      values: new Set(),
      toggle(name, force) { const enabled = force ?? !this.values.has(name); if (enabled) this.values.add(name); else this.values.delete(name); return enabled; },
      remove(name) { this.values.delete(name); },
      contains(name) { return this.values.has(name); },
    };
    children = new Map();
    dataset = {};
    listeners = new Map();
    value = ''; textContent = ''; _innerHTML = ''; disabled = false;
    get innerHTML() { return this._innerHTML; }
    set innerHTML(value) { this._innerHTML = value; this.textContent = value.replace(/<[^>]*>/g, ''); }
    querySelector(key) {
      if (!this.children.has(key)) this.children.set(key, new Element());
      return this.children.get(key);
    }
    querySelectorAll(key) {
      return ['.practice-controls ','.practice-result-buttons '].map(parent=>this.querySelector(parent+key));
    }
    contains(node) { return [...this.children.values()].includes(node); }
    addEventListener(type, callback) { this.listeners.set(type, callback); }
    removeEventListener(type) { this.listeners.delete(type); }
    emit(type, event = {}) { if (!this.disabled) this.listeners.get(type)?.(event); }
    getBoundingClientRect() { return { left: 0, top: 0, width: 960, height: 640 }; }
    showModal() { this.open = true; }
    close() { this.open = false; }
  }
  const screen = new Element();
  screen.querySelector('#practice-mode').value = mode;
  screen.querySelector('#practice-map').value = 'relay';
  screen.querySelector('#practice-speed').value = '1';
  screen.querySelector('#round-side').value = 'home';
  screen.querySelector('#round-site').value = 'A';
  screen.querySelector('#defense-plan').value = 'standard';
  screen.querySelector('#attack-plan').value = 'execute';
  screen.querySelector('#manual-edit-mode').value = 'select';
  const context = new Proxy({}, { get: (target, key) => target[key] ?? (() => {}) });
  screen.querySelector('canvas').getContext = () => context;
  const frames = new Map();
  const restoreGlobals = [];
  let frameNumber = 0;
  let now = 0;
  for (const [key, value] of Object.entries({
    document: Object.assign(new Element(), { hidden: false }),
    window: Object.assign(new Element(), { devicePixelRatio: 1 }),
    performance: { now: () => now },
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: callback => { frames.set(++frameNumber, callback); return frameNumber; },
    cancelAnimationFrame: id => frames.delete(id),
  })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    restoreGlobals.push(() => descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]);
  }
  const world = createWorld(createClub('연속 경기').club, 42);
  if (teamTraining) assert.equal(beginTeamTraining(world).ok, true);
  const original = structuredClone(world);
  const rewardMessages = [];
  const officialResults = [];
  const dispose = mountPractice(screen, world, { onTrainingReward: message => rewardMessages.push(message),
    official: official ? { ...createOfficialPractice(world, nextOfficialFixture(world)), ...(['playoff','bo5'].includes(official) ? { playoff:true, seriesScore:{home:1,away:0}, mapNumber:2, pausesRemaining:1 } : {}), ...(official==='bo5'?{seriesLength:5}: {}) } : null,
    onOfficialComplete: async score => { officialResults.push(score); } });
  t.after(() => { try { dispose(); } finally { for (const restore of restoreGlobals) restore(); } });
  const get = key => screen.querySelector(key);
  return { get, screen, world, original, frames, rewardMessages, officialResults,
    frame(elapsedMs) {
      now += elapsedMs;
      const [id, callback] = frames.entries().next().value;
      frames.delete(id);
      callback(now);
    },
    playRound() {
      const toggle = get('[data-practice="toggle"]');
      assert.equal(toggle.disabled, false);
      toggle.emit('click');
      assert.equal(frames.size, 1);
      const [id, callback] = frames.entries().next().value;
      frames.delete(id);
      callback(performance.now() + 160000);
      assert.equal(frames.size, 0);
    },
  };
}

test('다음 상대 버튼은 같은 리그를 중복 없이 순환하고 설정 변경은 상대를 유지한다', t => {
  const f = fixture(t, 'movement');
  const opponents = f.world.clubs.filter(club => club.id !== f.world.playerClubId && club.leagueId === 'pc');
  const current = () => opponents.find(club => f.get('.practice-teams').textContent.includes(`${club.name} (보라)`))?.id;
  const picked = [current()];
  assert.equal(f.get('[data-practice="reset"]').textContent, '다음 상대와 연습');
  f.get('#practice-mode').value = 'combat'; f.get('#practice-mode').emit('change');
  f.get('#practice-map').value = 'warehouse'; f.get('#practice-map').emit('change');
  f.get('#round-side').value = 'away'; f.get('#round-side').emit('change');
  assert.equal(current(), picked[0]);
  for (let i = 1; i < opponents.length; i++) {
    f.get('[data-practice="reset"]').emit('click');
    picked.push(current());
  }
  assert.deepEqual([...picked].sort(), opponents.map(club => club.id).sort());
  f.get('[data-practice="reset"]').emit('click');
  assert.notEqual(current(), picked.at(-1));
  assert.deepEqual(f.world, f.original);
});

test('공식 경기는 연습 상대 섞기를 호출하지 않고 기존 대진을 유지한다', t => {
  const random = t.mock.method(Math, 'random', () => 0.5);
  const f = fixture(t, 'match', false, true);
  const teams = f.get('.practice-teams').textContent;
  assert.equal(random.mock.callCount(), 0);
  f.get('[data-practice="reset"]').emit('click');
  assert.equal(f.get('.practice-teams').textContent, teams);
  assert.equal(random.mock.callCount(), 0);
});

test('BO3 다음 맵 화면은 남은 퍼즈만 받아 사용하며 맵 시작 시 3회로 충전하지 않는다', t => {
  const f = fixture(t, 'match', false, 'playoff');
  assert.match(f.get('.timeout-status').textContent, /BO3 전체 퍼즈 잔여 1\/3회/);
  f.get('[data-practice="toggle"]').emit('click');
  f.frame(50);
  f.get('[data-practice="timeout"]').emit('click');
  assert.match(f.get('.timeout-status').textContent, /잔여 0\/3회/);
  assert.match(f.get('.page-heading h1').textContent, /BO3 플레이오프/);
});

test('BO5 관전은 제목·두 다음 맵 버튼·퍼즈를 BO5로 표시하고 공유 횟수를 유지한다',t=>{
  const f=fixture(t,'match',false,'bo5');
  assert.match(f.get('.page-heading h1').textContent,/BO5 플레이오프/);
  assert.match(f.get('.timeout-status').textContent,/BO5 전체 퍼즈 잔여 1\/3회/);
  for(const parent of ['.practice-controls ','.practice-result-buttons '])assert.equal(f.get(`${parent}[data-action="next-playoff-map"]`).textContent,'BO5 다음 맵 →');
});

test('공식 화면은 대진 맵·진영·MR12를 잠그고 종료 콜백만 한 번 호출하며 훈련 보상은 지급하지 않는다', async t => {
  const f = fixture(t, 'match', true, true);
  assert.equal(f.get('#practice-mode').disabled, true);
  assert.equal(f.get('#practice-map').disabled, true);
  assert.equal(f.get('#round-side').disabled, true);
  assert.equal(f.get('[data-practice="reset"]').hidden, true);
  assert.equal(f.get('[data-action="club"]').dataset.action, 'season');
  let rounds = 0;
  while (!f.get('[data-practice="toggle"]').disabled && rounds < 150) { f.playRound(); rounds++; }
  await Promise.resolve();
  assert.ok(rounds >= 13 && rounds < 150);
  assert.equal(f.officialResults.length, 1);
  assert.equal(f.rewardMessages.length, 0);
  assert.match(f.get('.practice-reward-message').textContent, /자동 저장했습니다/);
  f.get('[data-practice="reset"]').emit('click');
  assert.equal(f.get('[data-practice="toggle"]').disabled, true);
  assert.deepEqual(f.world, f.original);
});

test('공식 경기 사이트는 다음 구매에서도 변경할 수 있고 점수·장비·자금을 유지한다', t => {
  const f = fixture(t, 'match', false, true);
  assert.equal(f.get('.practice-settings').hidden, true);
  f.playRound();
  const score = f.get('.match-panel').querySelector('.match-score').textContent;
  const shop = f.get('.economy-panel').querySelector('.equipment-shop').innerHTML;
  const site = f.get('#round-site');
  assert.equal(site.disabled, false);
  site.value = 'B'; site.emit('change');
  assert.match(f.get('.practice-teams').textContent, /목표 B/);
  assert.equal(f.get('.match-panel').querySelector('.match-score').textContent, score);
  assert.equal(f.get('.economy-panel').querySelector('.equipment-shop').innerHTML, shop);
  assert.match(f.get('[data-practice="toggle"]').textContent, /^2R/);
  f.get('[data-practice="toggle"]').emit('click');
  assert.equal(site.disabled, true);
});

test('장비 구매는 선택한 총기·방탄복·권총 환불을 처리하고 경기 중에는 막는다', t => {
  const f = fixture(t);
  const economy = f.get('.economy-panel');
  const button = economy.querySelector('[data-buy="home-1"]');
  button.dataset = { buy: 'home-1', equipment: 'armor' };
  const click = () => economy.emit('click', { target: { closest: () => button } });
  click();
  assert.match(economy.querySelector('.economy-message').textContent, /방탄복 구매 완료/);
  assert.match(economy.querySelector('.equipment-shop').innerHTML.split('</tr>')[0], /방탄복 100\/100/);
  f.playRound();
  button.dataset = { buy: 'home-1', equipment: 'smg' };
  click();
  assert.match(economy.querySelector('.economy-message').textContent, /기관단총 구매 완료/);
  button.dataset.equipment = 'basic-pistol';
  click();
  assert.match(economy.querySelector('.economy-message').textContent, /기본 권총 구매 완료/);
  assert.match(economy.querySelector('.economy-ledger ol').innerHTML, /이번 구매 무기 환불/);
  f.get('[data-practice="toggle"]').emit('click');
  click();
  assert.match(economy.querySelector('.economy-message').textContent, /구매 단계에서만/);
  assert.deepEqual(f.world, f.original);
});

test('구매할 선수 선택은 경기 상태를 바꾸지 않고 확대·라운드 전환 후에도 유지된다', t => {
  const f = fixture(t);
  const economy = f.get('.economy-panel');
  const selector = economy.querySelector('[data-equipment-actor="home-2"]');
  selector.dataset = { equipmentActor: 'home-2' };
  economy.emit('click', { target: { closest: () => selector } });
  assert.match(economy.querySelector('.equipment-players').innerHTML, /data-equipment-actor="home-2" aria-pressed="true"/);
  const shop = economy.querySelector('.equipment-shop').innerHTML;
  assert.match(shop, /data-buy="home-2"/);
  assert.doesNotMatch(shop, /data-buy="home-1"/);
  const buy = economy.querySelector('[data-buy="home-2"][data-equipment="armor"]');
  buy.dataset = { buy: 'home-2', equipment: 'armor' };
  economy.emit('click', { target: { closest: () => buy } });
  assert.match(economy.querySelector('.equipment-shop').innerHTML, /방탄복 100\/100/);
  f.get('[data-practice="expand-map"]').emit('click');
  assert.match(economy.querySelector('.equipment-shop').innerHTML, /data-buy="home-2"/);
  f.playRound();
  assert.match(economy.querySelector('.equipment-players').innerHTML, /data-equipment-actor="home-2" aria-pressed="true"/);
  assert.deepEqual(f.world, f.original);
});

test('간소화 구매창에서 투척물 3종을 사고 실제 라운드·확대 화면을 오류 없이 진행한다', t => {
  const f = fixture(t);
  const economy = f.get('.economy-panel');
  for (const id of ['flashbang', 'grenade', 'smoke']) {
    const button = economy.querySelector(`[data-buy="home-1"][data-equipment="${id}"]`);
    button.dataset = { buy: 'home-1', equipment: id };
    economy.emit('click', { target: { closest: () => button } });
    assert.match(economy.querySelector('.economy-message').textContent, /구매 완료/);
    assert.match(economy.querySelector('.equipment-shop').innerHTML, new RegExp(`data-equipment="${id}" disabled`));
  }
  assert.match(economy.querySelector('.equipment-players').innerHTML, /\$0/);
  assert.doesNotMatch(economy.querySelector('.equipment-shop').innerHTML, /away-/);
  f.get('[data-practice="expand-map"]').emit('click');
  f.playRound();
  assert.match(f.get('[data-practice="toggle"]').textContent, /^2R/);
  assert.deepEqual(f.world, f.original);
});

test('주간 교전 훈련 종료는 경기 내용 창을 열고 경험치를 한 번만 지급한다', t => {
  const f = fixture(t, 'combat', true);
  assert.equal(f.world.teamTraining.status, 'pending');
  f.playRound();
  assert.equal(f.world.teamTraining.status, 'completed');
  assert.equal(f.world.teamTraining.receipt.mode, 'combat');
  assert.equal(f.rewardMessages.length, 1);
  assert.equal(f.get('.practice-result-dialog').open, true);
  assert.match(f.get('.practice-reward-message').innerHTML, /경험치/);
  const after = structuredClone(f.world);
  f.get('[data-practice="reset"]').emit('click');
  f.playRound();
  assert.deepEqual(f.world, after);
  assert.equal(f.rewardMessages.length, 1);
  f.get('[data-practice="close-result"]').emit('click');
  assert.equal(f.get('.practice-result-dialog').open, false);
});

test('주간 MR12 훈련은 개별 라운드가 아닌 최종 경기 종료 때만 보상/결과 창을 표시한다', t => {
  const f = fixture(t, 'match', true);
  const before = new Map(f.world.players.map(player => {
    for (const skill of ['aim', 'intelligence', 'stamina']) if (player[skill] < player.development.potential[skill]) player.training.experience[skill] = 99;
    return [player.id, [player.aim, player.intelligence, player.stamina]];
  }));
  f.playRound();
  assert.equal(f.world.teamTraining.status, 'pending');
  assert.equal(f.rewardMessages.length, 0);
  assert.notEqual(f.get('.practice-result-dialog').open, true);
  for (let round = 1; round < 80 && f.world.teamTraining.status === 'pending'; round++) f.playRound();
  assert.equal(f.world.teamTraining.status, 'completed');
  assert.equal(f.world.teamTraining.receipt.mode, 'match');
  assert.equal(f.rewardMessages.length, 1);
  assert.equal(f.get('.practice-result-dialog').open, true);
  const won = f.world.teamTraining.receipt.winner === 'home';
  assert.equal(f.get('.practice-result-dialog').dataset.outcome, won ? 'win' : 'loss');
  assert.equal(f.get('#practice-result-title').textContent, `팀 연습 ${won ? '승리' : '패배'}`);
  assert.match(f.get('.practice-result-summary').textContent, /연속 경기 \d+ : \d+/);
  let changes = 0;
  for (const item of f.world.teamTraining.receipt.rewards) {
    const player = f.world.players.find(player => player.id === item.playerId);
    ['aim', 'intelligence', 'stamina'].forEach((skill, index) => {
      const previous = before.get(player.id)[index];
      if (player[skill] > previous) {
        changes++;
        assert.ok(f.get('.practice-reward-message').innerHTML.includes(`${['에임', '지능', '체력'][index]} ${previous} → ${player[skill]} (+${player[skill] - previous})`));
      }
    });
  }
  assert.ok(changes > 0, '실제 정산으로 상승한 능력과 표시가 일치해야 한다');
});

for (const mode of ['movement', 'round', 'economy']) test(`${mode} 모드도 실제 연습 종료 시 주간 보상을 정산한다`, t => {
  const f = fixture(t, mode, true);
  f.playRound();
  assert.equal(f.world.teamTraining.status, 'completed');
  assert.equal(f.world.teamTraining.receipt.mode, mode);
  assert.equal(f.get('.practice-result-dialog').open, true);
});

for (const speed of [1, 2, 4]) test(`관전 ${speed}배는 같은 계산 시간의 위치·기록을 재현하고 정지 시간을 누적하지 않는다`, t => {
  const f = fixture(t);
  const toggle = f.get('[data-practice="toggle"]');
  const speedSelect = f.get('#practice-speed');
  const snapshot = () => [f.get('.practice-clock').textContent, f.get('.practice-readout').textContent,
    f.get('.combat-table tbody').innerHTML, f.get('.combat-events').innerHTML,
    f.get('.match-highlights').querySelector('.highlight-rounds').innerHTML];
  toggle.emit('click');
  f.frame(4000);
  const baseline = snapshot();
  f.frame(160000);
  const roundResult = snapshot();
  const roundScore = f.get('.match-panel').querySelector('.match-score').textContent;
  // 속도만 비교하므로 상대를 바꾸지 않는 설정 재시작을 사용한다.
  f.get('#practice-mode').emit('change');
  speedSelect.value = String(speed);
  toggle.emit('click');
  f.frame(4000 / speed);
  assert.deepEqual(snapshot(), baseline);
  assert.equal(f.get('.practice-clock').textContent, '00:04.00');
  toggle.emit('click');
  const paused = snapshot();
  speedSelect.value = '4';
  assert.equal(f.frames.size, 0);
  assert.deepEqual(snapshot(), paused);
  const timeout = f.get('[data-practice="timeout"]');
  timeout.emit('click');
  assert.equal(f.frames.size, 0);
  assert.deepEqual(snapshot(), paused);
  toggle.emit('click');
  f.frame(250);
  assert.equal(f.get('.practice-clock').textContent, '00:05.00');
  f.frame(160000);
  assert.deepEqual(snapshot(), roundResult);
  assert.equal(f.get('.match-panel').querySelector('.match-score').textContent, roundScore);
  assert.deepEqual(f.world, f.original);
});

test('라운드 스킵은 일반 관전과 같은 결과·기록·보상을 만들고 다음 구매에서 멈춘다', t => {
  const f = fixture(t);
  const skip = f.get('[data-practice="skip"]');
  const toggle = f.get('[data-practice="toggle"]');
  const match = f.get('.match-panel');
  const snapshot = () => [match.querySelector('.match-score').textContent, match.querySelector('tbody').innerHTML,
    f.get('.combat-table tbody').innerHTML, f.get('.economy-panel').querySelector('.equipment-shop').innerHTML,
    f.get('.economy-panel').querySelector('.economy-ledger ol').innerHTML,
    f.get('.match-highlights').querySelector('.highlight-rounds').innerHTML];
  assert.equal(skip.disabled, true);
  f.playRound();
  const expected = snapshot();
  assert.match(expected.at(-1), /1R/);
  assert.match(expected.at(-1), /승리/);
  f.get('#practice-mode').emit('change');
  toggle.emit('click');
  skip.emit('click');
  assert.equal(f.frames.size, 1); // 기존 RAF와 스킵 RAF가 중복되지 않는다.
  assert.equal(skip.disabled, true);
  let frames = 0;
  while (f.frames.size && frames++ < 100) f.frame(16);
  assert.ok(frames > 1 && frames < 100);
  assert.deepEqual(snapshot(), expected);
  assert.match(toggle.textContent, /^2R 구매 완료/);
  assert.equal(skip.disabled, true);
  assert.equal(f.frames.size, 0);
  assert.deepEqual(f.world, f.original);
});

test('스킵은 정지·타임아웃·탭 숨김으로 중단하고 재개 시 선택 배속으로 돌아간다', t => {
  const f = fixture(t);
  const skip = f.get('[data-practice="skip"]');
  const toggle = f.get('[data-practice="toggle"]');
  const timeout = f.get('[data-practice="timeout"]');
  f.get('#practice-speed').value = '4';
  toggle.emit('click'); toggle.emit('click');
  assert.equal(skip.disabled, true);
  toggle.emit('click'); skip.emit('click');
  f.frame(16);
  assert.equal(f.get('.practice-clock').textContent, '00:02.00');
  timeout.emit('click');
  assert.equal(f.frames.size, 0);
  assert.equal(skip.disabled, true);
  assert.match(toggle.textContent, /타임아웃 종료/);
  toggle.emit('click'); f.frame(250);
  assert.equal(f.get('.practice-clock').textContent, '00:03.00');
  skip.emit('click');
  document.hidden = true;
  f.frame(16);
  assert.equal(f.frames.size, 0);
  assert.equal(f.get('.practice-clock').textContent, '00:03.00');
  document.hidden = false;
  toggle.emit('click'); f.frame(250);
  assert.equal(f.get('.practice-clock').textContent, '00:04.00');
});

test('구매 모드 스킵은 라운드 종료에 멈추고 수동 다음 라운드를 유지한다', t => {
  const f = fixture(t, 'economy');
  const skip = f.get('[data-practice="skip"]');
  f.get('[data-practice="toggle"]').emit('click'); skip.emit('click');
  let frames = 0;
  while (f.frames.size && frames++ < 100) f.frame(16);
  assert.ok(frames < 100);
  assert.equal(f.get('[data-practice="toggle"]').disabled, true);
  assert.equal(skip.disabled, true);
  const next = f.get('[data-practice="next"]');
  assert.equal(next.disabled, false);
  assert.match(f.get('.economy-panel').querySelector('.economy-phase').textContent, /1라운드/);
  next.emit('click');
  assert.match(f.get('.economy-panel').querySelector('.economy-phase').textContent, /2라운드/);
  assert.equal(skip.disabled, true);
});

test('맵 전환은 재생·타임아웃·경기 기록·자금·수동 경로를 초기화하고 선택 맵을 그린다', t => {
  const f = fixture(t);
  f.get('[data-strategy="manual"]').emit('click');
  f.get('#manual-edit-mode').value = 'route';
  f.get('canvas').emit('click', { clientX: 380, clientY: 260 });
  f.get('[data-manual="save"]').emit('click');
  assert.match(f.get('.manual-status').textContent, /초안 1\/12점/);
  f.playRound();
  f.get('[data-practice="toggle"]').emit('click');
  f.get('[data-practice="skip"]').emit('click');
  f.frame(16);
  f.get('[data-practice="timeout"]').emit('click');
  assert.match(f.get('.timeout-status').textContent, /잔여 2\/3회/);
  const select = f.get('#practice-map');
  select.value = 'warehouse'; select.emit('change');
  assert.equal(f.frames.size, 0);
  assert.equal(f.get('.page-heading h1').textContent, '화물 창고 · 팀 연습');
  assert.match(f.get('canvas').ariaLabel, /^화물 창고/);
  assert.match(f.get('.match-panel').querySelector('.match-score').textContent, / 0 : 0 /);
  assert.match(f.get('.practice-readout').textContent, /경기 자금 \$800/);
  assert.match(f.get('.manual-status').textContent, /초안 0\/12점/);
  assert.match(f.get('.manual-status').textContent, /공격 4\/4라운드 \(설정 없음\)/);
  assert.match(f.get('.timeout-status').textContent, /잔여 3\/3회/);
  assert.equal(f.get('.practice-clock').textContent, '00:00.00');
  assert.match(f.get('[data-practice="toggle"]').textContent, /^1R 구매 완료/);
  assert.match(f.get('.match-highlights').querySelector('.highlight-rounds').innerHTML, /라운드가 끝나면/);
  f.playRound();
  assert.match(f.get('[data-practice="toggle"]').textContent, /^2R 구매 완료/);
  select.value = 'research'; select.emit('change');
  assert.equal(f.get('.page-heading h1').textContent, '연구 시설 · 팀 연습');
  assert.match(f.get('canvas').ariaLabel, /^연구 시설/);
  assert.match(f.get('[data-practice="toggle"]').textContent, /^1R 구매 완료/);
  assert.match(f.get('.practice-readout').textContent, /경기 자금 \$800/);
  assert.match(f.get('.manual-status').textContent, /초안 0\/12점/);
  f.playRound();
  assert.match(f.get('[data-practice="toggle"]').textContent, /^2R 구매 완료/);
  select.value = 'relay'; select.emit('change');
  assert.equal(f.get('.page-heading h1').textContent, '중계소 · 팀 연습');
  assert.match(f.get('[data-practice="toggle"]').textContent, /^1R 구매 완료/);
  select.value = 'invalid'; select.emit('change');
  assert.equal(select.value, 'relay');
  assert.deepEqual(f.world, f.original);
});

test('MR12 화면은 실제 결과를 누적해 다음 구매로 전환하고 12R 후 교대하며 최종 종료한다', t => {
  const f = fixture(t);
  const panel = f.get('.match-panel');
  const toggle = f.get('[data-practice="toggle"]');
  const reset = f.get('[data-practice="reset"]');
  assert.match(toggle.textContent, /1R 구매 완료/);
  assert.match(f.get('.practice-readout').textContent, /시야 100° · 거리 220/);
  assert.equal(f.get('[data-practice="next"]').hidden, true);
  const recordRows = () => [...f.get('.combat-table tbody').innerHTML.matchAll(/<td>(\d+)\/(\d+)\/(\d+)<\/td><td>(\d+)<\/td>/g)]
    .map(row => row.slice(1).map(Number));
  let previousRecords = recordRows();
  let rounds = 0;
  while (toggle.textContent !== '경기 종료' && rounds < 80) {
    f.playRound();
    rounds++;
    assert.equal(f.get('.combat-stat-panel h2').textContent, '경기 누적 기록');
    const records = recordRows();
    assert.equal(records.length, 10);
    for (let index = 0; index < records.length; index++) {
      records[index].forEach((value, stat) => assert.ok(value >= previousRecords[index][stat]));
    }
    previousRecords = records;
    assert.match(f.get('.practice-readout').textContent,
      new RegExp(`경기 누적 K/D/A ${records[0].slice(0, 3).join('/')}`));
    const score = panel.querySelector('.match-score').textContent.match(/ (\d+) : (\d+) /);
    assert.equal(Number(score[1]) + Number(score[2]), rounds);
    assert.equal((panel.querySelector('tbody').innerHTML.match(/<tr>/g) ?? []).length, rounds);
    if (toggle.textContent !== '경기 종료') {
      assert.match(toggle.textContent, new RegExp(`^${rounds + 1}R 구매 완료`));
      assert.match(panel.querySelector('.match-status').textContent, new RegExp(`직전 ${rounds}R`));
      assert.equal(toggle.disabled, false);
      const defending = /내 팀 수비/.test(panel.querySelector('.match-status').textContent);
      assert.equal(f.get('#attack-plan').disabled, defending);
      assert.equal(f.get('#defense-plan').disabled, !defending);
      assert.equal(f.get('#round-side').disabled, true);
      assert.equal(f.get('#round-site').disabled, defending);
    }
    if (rounds === 12) {
      assert.match(panel.querySelector('.match-phase').textContent, /후반전 · 13라운드/);
      assert.match(panel.querySelector('.match-status').textContent, /내 팀 수비/);
      assert.match(f.get('.practice-readout').textContent, /시야 110° · 거리 240/);
    }
  }
  assert.ok(rounds >= 13 && rounds < 80);
  assert.equal(toggle.disabled, true);
  assert.equal(f.get('[data-practice="skip"]').disabled, true);
  assert.match(panel.querySelector('.match-status').textContent, /최종/);
  const finalScore = panel.querySelector('.match-score').textContent;
  const finalRecords = recordRows();
  assert.ok(finalRecords.reduce((sum, row) => sum + row[1], 0) > 10);
  toggle.emit('click');
  assert.equal(panel.querySelector('.match-score').textContent, finalScore);
  assert.deepEqual(recordRows(), finalRecords);
  assert.deepEqual(f.world, f.original);
  assert.equal(reset.textContent, '다음 상대와 연습');
  reset.emit('click');
  assert.match(panel.querySelector('.match-score').textContent, / 0 : 0 /);
  assert.match(toggle.textContent, /^1R 구매 완료/);
  assert.equal(f.get('#round-side').disabled, false);
  assert.ok(recordRows().flat().every(value => value === 0));
});

test('공격 선택 화면은 구매 중 점수를 유지하며 역할을 바꾸고 일시정지 중 변경도 잠근다', t => {
  const f = fixture(t);
  const plan = f.get('#attack-plan');
  const initialScore = f.get('.match-panel').querySelector('.match-score').textContent;
  plan.value = 'split';
  plan.emit('change');
  assert.match(f.get('.attack-description').textContent, /^분산 진입/);
  assert.equal(f.get('.match-panel').querySelector('.match-score').textContent, initialScore);
  const player = f.get('#practice-player');
  player.value = 'home-4'; player.emit('change');
  assert.match(f.get('.practice-readout').textContent, /공격 임무 우회 지원 · 분산 진입/);
  const toggle = f.get('[data-practice="toggle"]');
  toggle.emit('click');
  assert.equal(plan.disabled, true);
  toggle.emit('click');
  assert.equal(plan.disabled, true);
  assert.equal(f.frames.size, 0);
});

test('구매·라운드 모드는 수동 다음 라운드를 유지한다', t => {
  const f = fixture(t, 'economy');
  const next = f.get('[data-practice="next"]');
  f.playRound();
  assert.equal(f.get('[data-practice="toggle"]').disabled, true);
  assert.equal(next.hidden, false);
  assert.equal(next.disabled, false);
  assert.match(f.get('.economy-panel').querySelector('.economy-phase').textContent, /1라운드/);
  next.emit('click');
  assert.match(f.get('.economy-panel').querySelector('.economy-phase').textContent, /2라운드/);
  assert.equal(f.get('[data-practice="toggle"]').disabled, false);
});

test('경기 규칙은 별도 창에서 열고 닫은 뒤 다시 열 수 있으며 세계 상태를 바꾸지 않는다', t => {
  const f = fixture(t), before = structuredClone(f.world);
  f.get('[data-practice="open-rules"]').emit('click');
  assert.equal(f.get('.match-rules-dialog').open, true);
  f.get('[data-practice="close-rules"]').emit('click');
  assert.equal(f.get('.match-rules-dialog').open, false);
  f.get('[data-practice="open-rules"]').emit('click');
  assert.equal(f.get('.match-rules-dialog').open, true);
  assert.deepEqual(f.world, before);
});

test('지도 확대는 버튼 재클릭과 Esc로 복귀하고 구매 준비·선수 선택 상태를 유지한다', t => {
  const f = fixture(t), button = f.get('[data-practice="expand-map"]'), map = f.get('.practice-map-wrap');
  const initial = f.get('[data-practice="toggle"]').textContent, player = f.get('#practice-player').value;
  button.emit('click'); assert.equal(map.classList.contains('is-expanded'), true);
  assert.equal(button.ariaPressed, 'true'); assert.match(button.textContent, /원래 크기/);
  button.emit('click'); assert.equal(map.classList.contains('is-expanded'), false);
  button.emit('click');
  let prevented = false;
  window.emit('keydown', { key: 'Escape', preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(map.classList.contains('is-expanded'), false);
  assert.equal(button.ariaPressed, 'false'); assert.match(button.textContent, /화면 크게/);
  assert.equal(f.get('[data-practice="toggle"]').textContent, initial);
  assert.equal(f.get('#practice-player').value, player); assert.deepEqual(f.world, f.original);
});

test('캔버스는 이전 표시 크기와 무관하게 지도 영역에 맞춰 확대/축소하고 고해상도 배율을 분리한다', t => {
  const f = fixture(t), canvas = f.get('canvas'), stage = f.get('.practice-map-stage');
  const button = f.get('[data-practice="expand-map"]');
  stage.getBoundingClientRect = () => ({ width: 1500, height: 1000 });
  button.emit('click');
  assert.equal(canvas.style.width, '1500px'); assert.equal(canvas.style.height, '1000px');
  assert.equal(canvas.width, 1500); assert.equal(canvas.height, 1000);
  stage.getBoundingClientRect = () => ({ width: 600, height: 400 });
  window.devicePixelRatio = 2;
  button.emit('click');
  assert.equal(canvas.style.width, '600px'); assert.equal(canvas.style.height, '400px');
  assert.equal(canvas.width, 1200); assert.equal(canvas.height, 800);
  stage.getBoundingClientRect = () => ({ width: 1600, height: 900 });
  button.emit('click');
  assert.equal(canvas.style.width, '1350px'); assert.equal(canvas.style.height, '900px');
  assert.equal(canvas.width, 2700); assert.equal(canvas.height, 1800);
});

test('확대 화면에서 시작·4배속·스킵·내용 확인·장비 구매 후 복귀해도 경기 상태를 유지한다', t => {
  const f = fixture(t), expand = f.get('[data-practice="expand-map"]');
  expand.emit('click'); assert.equal(f.screen.classList.contains('is-expanded'), true);
  f.get('#practice-speed').value = '4';
  const toggle = f.get('[data-practice="toggle"]');
  toggle.emit('click'); f.frame(100);
  assert.equal(f.get('.practice-clock').textContent, '00:00.40');
  f.get('[data-practice="skip"]').emit('click');
  let frames = 0;
  while (f.frames.size && frames++ < 100) f.frame(16);
  assert.equal(f.frames.size, 0); assert.match(toggle.textContent, /^2R/);
  f.playRound(); assert.match(toggle.textContent, /^3R/);
  f.get('[data-strategy="content"]').emit('click');
  assert.equal(f.get('.combat-records').hidden, false);
  assert.equal(f.get('.purchase-panel').hidden, true);
  const records = f.get('.combat-table tbody').innerHTML;
  assert.equal((records.match(/<tr/g) ?? []).length, 10);
  f.get('[data-strategy="purchase"]').emit('click');
  assert.equal(f.get('.purchase-panel').hidden, false);
  const economy = f.get('.economy-panel'), buy = economy.querySelector('[data-buy="home-1"]');
  buy.dataset = { buy: 'home-1', equipment: 'training-rifle' };
  economy.emit('click', { target: { closest: () => buy } });
  assert.match(economy.querySelector('.economy-message').textContent, /소총 구매 완료/);
  const equipment = economy.querySelector('.equipment-shop').innerHTML;
  assert.match(equipment, /돌격소총[\s\S]*보유 중/);
  const purchasedRecords = f.get('.combat-table tbody').innerHTML;
  const kda = rows => [...rows.matchAll(/<td>(\d+\/\d+\/\d+)<\/td>/g)].map(row => row[1]);
  assert.deepEqual(kda(purchasedRecords), kda(records));
  assert.equal(f.screen.classList.contains('is-expanded'), true);
  expand.emit('click'); assert.equal(f.screen.classList.contains('is-expanded'), false);
  assert.equal(f.get('#practice-speed').value, '4'); assert.match(toggle.textContent, /^3R/);
  assert.equal(economy.querySelector('.equipment-shop').innerHTML, equipment);
  assert.equal(f.get('.combat-table tbody').innerHTML, purchasedRecords);
  assert.deepEqual(f.world, f.original);
});

test('확대 상태에서 패널을 닫아도 장비/내용 전환 버튼은 남고 같은 기록으로 다시 연다', t => {
  const f = fixture(t); f.get('[data-practice="expand-map"]').emit('click');
  assert.equal(f.get('.strategy-options').hidden, true);
  f.get('[data-strategy="purchase"]').emit('click');
  assert.equal(f.get('.strategy-options').hidden, false);
  f.get('[data-strategy="purchase"]').emit('click');
  assert.equal(f.get('.strategy-options').hidden, true);
  assert.equal(f.get('.practice-panel-toolbar').hidden, false);
  f.get('[data-strategy="content"]').emit('click');
  assert.equal(f.get('.strategy-options').hidden, false);
  assert.equal(f.get('.combat-records').hidden, false);
  assert.equal(f.screen.classList.contains('is-expanded'), true);
  window.emit('keydown', { key: 'Escape', preventDefault() {} });
  assert.equal(f.screen.classList.contains('is-expanded'), false);
  assert.equal(f.get('.combat-records').hidden, false);
});

for (const official of [false, true]) {
  test(`${official ? '공식 경기' : '팀 연습'}의 첫 진입은 맵을 우선 표시하고 구매창 토글은 세계 상태를 보존한다`, t => {
    const f = fixture(t, 'match', false, official);
    const before = structuredClone(f.world);
    assert.equal(f.get('.strategy-options').hidden, true);
    assert.equal(f.get('.purchase-panel').hidden, true);
    assert.equal(f.get('[data-strategy="purchase"]').ariaExpanded, 'false');
    f.get('[data-strategy="purchase"]').emit('click');
    assert.equal(f.get('.strategy-options').hidden, false);
    assert.equal(f.get('.purchase-panel').hidden, false);
    f.get('[data-practice="expand-map"]').emit('click');
    assert.equal(f.get('.purchase-panel').hidden, false);
    f.get('[data-strategy="purchase"]').emit('click');
    assert.equal(f.get('.strategy-options').hidden, true);
    assert.deepEqual(f.world, before);
  });
}

test('수동 편집 화면은 지도 입력·진영별 기간·선수 제한·라운드 차감과 자동 복귀를 연결한다', t => {
  const f = fixture(t);
  f.get('[data-strategy="manual"]').emit('click');
  const mode = f.get('#manual-edit-mode');
  const duration = f.get('#manual-duration');
  const status = f.get('.manual-status');
  const canvas = f.get('canvas');
  duration.value = '6'; duration.emit('change');
  mode.value = 'route';
  canvas.emit('click', { clientX: 220, clientY: 100 });
  assert.match(f.get('.manual-message').textContent, /벽/);
  assert.match(status.textContent, /초안 0\/12점/);
  canvas.emit('click', { clientX: 380, clientY: 260 });
  mode.value = 'angle'; canvas.emit('click', { clientX: 380, clientY: 300 });
  f.get('[data-manual="save"]').emit('click');
  assert.match(f.get('.manual-message').textContent, /공격 전략 저장 완료/);
  assert.match(status.textContent, /초안 1\/12점/);
  assert.match(status.textContent, /공격 6\/6라운드 \/ 수비 4\/4라운드/);
  const toggle = f.get('[data-practice="toggle"]');
  toggle.emit('click'); toggle.emit('click');
  assert.equal(f.get('[data-manual="save"]').disabled, true);
  f.playRound();
  assert.match(status.textContent, /공격 5\/6라운드 \/ 수비 4\/4라운드/);
  const player = f.get('#practice-player');
  player.value = 'away-1'; player.emit('change');
  assert.equal(f.get('[data-manual="save"]').disabled, true);
  player.value = 'home-1'; player.emit('change');
  f.get('[data-manual="clear"]').emit('click');
  assert.match(status.textContent, /초안 0\/12점/);
  f.get('[data-practice="reset"]').emit('click');
  assert.match(status.textContent, /초안 0\/12점/);
  assert.match(status.textContent, /공격 4\/4라운드 \(설정 없음\)/);
});

test('이동 연습에는 수동 라운드 편집기를 표시하지 않는다', t => {
  const f = fixture(t, 'movement');
  assert.equal(f.get('.manual-editor').hidden, true);
  assert.equal(f.get('[data-manual="save"]').disabled, true);
});

test('감독 타임아웃은 프레임을 취소하고 편집을 열며 재개·소진·초기화를 연결한다', t => {
  const f = fixture(t);
  const timeout = f.get('[data-practice="timeout"]');
  const toggle = f.get('[data-practice="toggle"]');
  const plan = f.get('#attack-plan');
  assert.equal(timeout.disabled, true);
  toggle.emit('click');
  const [id, callback] = f.frames.entries().next().value;
  f.frames.delete(id); callback(performance.now() + 1000);
  toggle.emit('click'); // 일반 일시정지에는 편집 권한이 없다.
  assert.equal(plan.disabled, true);
  assert.equal(f.get('[data-manual="save"]').disabled, true);
  const clock = f.get('.practice-clock').textContent;
  const score = f.get('.match-panel').querySelector('.match-score').textContent;
  const position = f.get('.practice-readout').textContent.match(/위치 [^\n]+/)[0];
  toggle.emit('click');
  for (let use = 2; use <= 3; use++) {
    timeout.emit('click');
    assert.equal(f.frames.size, 0);
    assert.equal(plan.disabled, false);
    assert.equal(timeout.disabled, true);
    assert.match(toggle.textContent, /타임아웃 종료 · 재개/);
    assert.match(f.get('.timeout-status').textContent, new RegExp(`잔여 ${3 - use}/3회`));
    plan.value = use % 2 ? 'split' : 'execute'; plan.emit('change');
    if (f.get('.manual-editor').hidden) f.get('[data-strategy="manual"]').emit('click');
    f.get('#manual-edit-mode').value = 'route';
    f.get('canvas').emit('click', { clientX: 380, clientY: 260 });
    f.get('[data-manual="save"]').emit('click');
    assert.match(f.get('.manual-message').textContent, /전략 저장 완료/);
    assert.equal(f.get('.practice-clock').textContent, clock);
    assert.equal(f.get('.practice-readout').textContent.match(/위치 [^\n]+/)[0], position);
    assert.equal(f.get('.match-panel').querySelector('.match-score').textContent, score);
    toggle.emit('click');
    assert.equal(f.frames.size, 1);
    assert.equal(plan.disabled, true);
    assert.equal(f.get('[data-manual="save"]').disabled, true);
  }
  assert.equal(timeout.disabled, true);
  assert.equal(toggle.disabled, true);
  f.frame(160000);
  assert.match(f.get('.timeout-status').textContent, /잔여 0\/3회/);
  f.get('[data-practice="reset"]').emit('click');
  assert.match(f.get('.timeout-status').textContent, /잔여 3\/3회/);
  assert.deepEqual(f.world, f.original);
});


test('공수 교대 시 자동 전술·사이트 조작과 수동 초안·기간은 현재 진영으로 전환된다', t => {
  const f = fixture(t);
  const get = f.get;
  get('[data-strategy="manual"]').emit('click');
  get('#manual-duration').value = '6'; get('#manual-duration').emit('change'); get('[data-manual="save"]').emit('click');
  assert.match(get('.manual-message').textContent, /공격 전략 저장 완료 · 기간 6라운드/);
  assert.equal(get('[data-tactic-row="defense-plan"]').hidden, true);
  assert.equal(get('[data-tactic-row="attack-plan"]').hidden, false);
  assert.equal(get('[data-tactic-row="round-site"]').hidden, false);
  for (let round = 0; round < 12; round++) f.playRound();
  assert.match(get('.manual-status').textContent, /수비 초안 0\/12점/);
  assert.equal(get('#manual-duration').value, '4');
  assert.equal(get('#defense-plan').disabled, false);
  assert.equal(get('#attack-plan').disabled, true);
  assert.equal(get('#round-site').disabled, true);
  assert.equal(get('[data-tactic-row="defense-plan"]').hidden, false);
  assert.equal(get('[data-tactic-row="attack-plan"]').hidden, true);
  assert.equal(get('[data-tactic-row="round-site"]').hidden, true);
  assert.equal(get('.tactics-description').hidden, false);
  assert.equal(get('.attack-description').hidden, true);
  get('#manual-duration').value = '12'; get('#manual-duration').emit('change'); get('[data-manual="save"]').emit('click');
  assert.match(get('.manual-message').textContent, /수비 전략 저장 완료 · 기간 12라운드/);
  assert.match(get('.manual-status').textContent, /공격 6\/6라운드 \(설정 없음\) \/ 수비 12\/12라운드/);
  get('[data-practice="toggle"]').emit('click');
  assert.equal(get('#defense-plan').disabled, true);
  get('[data-practice="timeout"]').emit('click');
  assert.equal(get('#defense-plan').disabled, false);
  assert.equal(get('#attack-plan').disabled, true);
  assert.equal(get('[data-manual="save"]').disabled, false);
});

test('여러 선수의 경로·시선·기간 초안은 전환 후 유지되고 저장 한 번으로 함께 반영된다', t => {
  const f = fixture(t);
  const get = f.get;
  const canvas = get('canvas');
  const context = canvas.getContext('2d');
  let path = [];
  let manualPaths = [];
  context.clearRect = () => { manualPaths = []; };
  context.beginPath = () => { path = []; };
  context.moveTo = (x, y) => { path.push([x, y]); };
  context.lineTo = (x, y) => { path.push([x, y]); };
  context.stroke = () => { if (context.strokeStyle === '#f3cf83') manualPaths.push([...path]); };
  const choose = id => { get('#practice-player').value = id; get('#practice-player').emit('change'); };
  const edit = (x, y, lookX, lookY) => {
    get('#manual-edit-mode').value = 'route';
    canvas.emit('click', { clientX: x, clientY: y });
    get('#manual-edit-mode').value = 'angle';
    canvas.emit('click', { clientX: lookX, clientY: lookY });
    assert.match(get('.manual-status').textContent, /초안 1\/12점/);
    return structuredClone(manualPaths.at(-1));
  };
  get('[data-strategy="manual"]').emit('click');
  get('#manual-duration').value = '6'; get('#manual-duration').emit('change');
  const firstSight = edit(380, 260, 380, 300);
  choose('home-2');
  assert.equal(get('#manual-duration').value, '6');
  const secondSight = edit(380, 300, 340, 300);
  choose('away-1');
  assert.equal(get('[data-manual="save"]').disabled, true);
  choose('home-1');
  assert.equal(get('#manual-edit-mode').value, 'angle');
  assert.deepEqual(manualPaths.at(-1), firstSight);
  assert.match(get('.manual-status').textContent, /저장 대기 2명/);
  assert.match(get('.manual-status').textContent, /공격 4\/4라운드 \(설정 없음\)/);
  get('[data-strategy="automatic"]').emit('click');
  assert.equal(manualPaths.length, 0, '저장 전에는 실제 경로가 없다');
  get('[data-practice="expand-map"]').emit('click');
  get('[data-strategy="manual"]').emit('click');
  assert.deepEqual(manualPaths.at(-1), firstSight);
  choose('home-2');
  assert.deepEqual(manualPaths.at(-1), secondSight);
  get('[data-manual="save"]').emit('click');
  assert.match(get('.manual-message').textContent, /기간 6라운드 · 선수 2명 반영/);
  assert.match(get('.manual-status').textContent, /저장 대기 0명/);
  get('[data-strategy="manual"]').emit('click');
  assert.deepEqual(manualPaths.at(-1), secondSight, '패널을 닫아도 저장한 시선이 적용된다');
  choose('home-1');
  assert.deepEqual(manualPaths.at(-1), firstSight, '다른 선수의 시선도 함께 저장된다');
  get('[data-strategy="manual"]').emit('click');
  get('[data-manual="clear"]').emit('click');
  choose('home-2'); choose('home-1');
  assert.match(get('.manual-status').textContent, /초안 0\/12점/);
  get('[data-strategy="manual"]').emit('click');
  assert.deepEqual(manualPaths.at(-1), firstSight, '자동 복귀도 저장 전에는 기존 경로를 유지한다');
  get('[data-strategy="manual"]').emit('click');
  get('[data-manual="save"]').emit('click');
  get('[data-strategy="manual"]').emit('click');
  assert.equal(manualPaths.length, 0);
  choose('home-2');
  assert.deepEqual(manualPaths.at(-1), secondSight, '선택 선수만 자동 복귀한다');
});

test('미저장 초안은 라운드·사이트 전환 후 유지되며 초기화·맵 변경 시 제거된다', t => {
  const f = fixture(t);
  const get = f.get;
  const draft = () => {
    get('#manual-duration').value = '12'; get('#manual-duration').emit('change');
    get('#manual-edit-mode').value = 'route';
    get('canvas').emit('click', { clientX: 380, clientY: 260 });
  };
  get('[data-strategy="manual"]').emit('click');
  draft();
  get('#round-site').value = 'B'; get('#round-site').emit('change');
  assert.match(get('.manual-status').textContent, /초안 1\/12점 · 저장 대기 1명/);
  f.playRound();
  assert.equal(get('#manual-duration').value, '12');
  assert.match(get('.manual-status').textContent, /초안 1\/12점 · 저장 대기 1명/);
  assert.match(get('.manual-status').textContent, /공격 4\/4라운드 \(설정 없음\)/);
  get('[data-practice="reset"]').emit('click');
  assert.equal(get('#manual-duration').value, '4');
  assert.match(get('.manual-status').textContent, /초안 0\/12점 · 저장 대기 0명/);
  draft();
  get('#practice-map').value = 'warehouse'; get('#practice-map').emit('change');
  assert.equal(get('#manual-duration').value, '4');
  assert.match(get('.manual-status').textContent, /초안 0\/12점 · 저장 대기 0명/);
});

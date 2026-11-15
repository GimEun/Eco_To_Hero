import test from 'node:test';
import assert from 'node:assert/strict';
import { PRACTICE_MAPS } from '../src/data/maps/index.js';
import { createPractice, stepPractice, advancePractice } from '../src/simulation/practice.js';
import { prepareRound } from '../src/simulation/round.js';
import { moveActors } from '../src/simulation/actor-movement.js';

const club = name => ({ name, players: Array.from({ length: 5 }, (_, i) => ({
  id: `${name}${i}`, name: `${name}${i}`, aim: 50, intelligence: 50, stamina: 50,
})) });

function fixture(map = PRACTICE_MAPS[0], attackTeam = 'away', siteName = 'A') {
  const state = createPractice(map, club('home'), club('away'), {
    round: true, attackTeam, siteName, defensePlans: { home: 'standard', away: 'standard' },
  });
  for (const actor of state.actors) Object.assign(actor, {
    alive: false, hp: 0, viewRange: 0, nextShotTick: 100000, nextUtilityTick: 100000,
  });
  const defenders = state.actors.filter(actor => actor.team !== attackTeam && [3, 5].includes(actor.number));
  for (const actor of defenders) Object.assign(actor, {
    alive: true, hp: 30, ...actor.defenseTask.anchor, objectiveKey: null,
  });
  for (const actor of defenders) actor.defenseTask.withdrawn = true;
  const planter = state.actors.find(actor => actor.team === attackTeam);
  const [x, y] = map.tactics.attackSites[siteName].plant;
  Object.assign(planter, { alive: true, hp: 100, x: (x + 0.5) * map.tileSize, y: (y + 0.5) * map.tileSize });
  state.tick = 20;
  state.round.defenseContact = { id: planter.id, x: planter.x, y: planter.y, tick: 19 };
  state.round.defenseContacts = [{ ...state.round.defenseContact }];
  state.smokes = [{ x: 740, y: 300, radius: 70, expiresTick: 400 }];
  return { state, map, defenders, planter };
}

test('3맵·양 진영·A/B에서 정확히 두 수비수는 최근 관측을 확인·엄호로 나누고 설치 전에 이동한다', () => {
  for (const map of PRACTICE_MAPS) for (const attackTeam of ['home', 'away']) for (const site of ['A', 'B']) {
    const f = fixture(map, attackTeam, site);
    const before = new Map(f.defenders.map(actor => [actor.id, { x: actor.x, y: actor.y }]));
    prepareRound(f.state, map);
    assert.equal(f.defenders.filter(actor => actor.intent === '2인 수비 · 최근 관측 위치 확인').length, 1);
    assert.equal(f.defenders.filter(actor => actor.intent === '2인 수비 · 접촉 구역 지원·엄호').length, 1);
    const scout = f.defenders.find(actor => actor.intent === '2인 수비 · 최근 관측 위치 확인');
    stepPractice(f.state, map);
    assert.ok(Math.hypot(scout.x - before.get(scout.id).x, scout.y - before.get(scout.id).y) > 0);
    assert.equal(f.state.round.bomb.status, 'carried');
  }
});

test('관측이 없거나 만료되면 적용하지 않고 1명·3~5명 기존 수비를 유지한다', () => {
  for (const mode of ['none', 'expired', 1, 3, 4, 5]) {
    const { state, map, defenders } = fixture();
    if (mode === 'none') { state.round.defenseContact = null; state.round.defenseContacts = []; }
    else if (mode === 'expired') state.tick = 120;
    else if (mode === 1) defenders[1].alive = false;
    else for (const actor of state.actors.filter(actor => actor.team === defenders[0].team && !actor.alive).slice(0, mode - 2)) {
      actor.alive = true; actor.hp = 100;
    }
    prepareRound(state, map);
    assert.ok(state.actors.every(actor => !actor.intent?.startsWith('2인 수비')), String(mode));
    if (mode === 1) assert.equal(defenders[0].intent, '마지막 수비 · 최근 관측 위치 대응');
  }
});

test('숨은 적·운반 폭탄의 실제 좌표와 설치 행동은 경로 결정에 사용하지 않는다', () => {
  const a = fixture(), b = fixture();
  Object.assign(b.planter, { x: 100, y: 100 });
  prepareRound(a.state, a.map); prepareRound(b.state, b.map);
  assert.equal(a.state.round.action?.type, 'plant');
  assert.equal(b.state.round.action, null);
  assert.deepEqual(a.defenders.map(actor => [actor.route, actor.watchAngle, actor.intent]),
    b.defenders.map(actor => [actor.route, actor.watchAngle, actor.intent]));
});

test('한 명에게 수동 명령이 있으면 자동 2인 배치를 적용하지 않는다', () => {
  const { state, map, defenders } = fixture();
  state.manualPlans.defense.players[defenders[0].id] = { cells: [{ x: 19, y: 6 }], angle: 0 };
  prepareRound(state, map);
  assert.ok(defenders[0].intent.startsWith('수동'));
  assert.ok(defenders.every(actor => !actor.intent.startsWith('2인 수비')));
});

test('설치 후에는 기존 해체 담당·엄호 목표를 우선한다', () => {
  const { state, map, defenders, planter } = fixture();
  prepareRound(state, map);
  Object.assign(state.round.bomb, { status: 'planted', carrierId: null, x: planter.x, y: planter.y, plantedTick: state.tick });
  prepareRound(state, map);
  assert.equal(defenders.filter(actor => actor.intent === '폭탄 해체를 위해 접근').length, 1);
  assert.equal(defenders.filter(actor => actor.intent === '해체 지원·주변 경계').length, 1);
});

test('관측이 유지되는 동안 확인 담당은 거리 변화로 매 틱 바뀌지 않는다', () => {
  const { state, map, defenders } = fixture();
  prepareRound(state, map);
  const scout = defenders.find(actor => actor.intent === '2인 수비 · 최근 관측 위치 확인');
  assert.ok(scout);
  const partner = defenders.find(actor => actor !== scout);
  Object.assign(partner, { x: state.round.defenseContact.x - 40, y: state.round.defenseContact.y });
  state.tick++;
  prepareRound(state, map);
  assert.equal(scout.intent, '2인 수비 · 최근 관측 위치 확인');
});

test('2인 대응 중에도 연막 경계는 2초 뒤 해제되어 실제 이동을 재개한다', () => {
  const { state, map, defenders } = fixture();
  prepareRound(state, map);
  const scout = defenders.find(actor => actor.intent === '2인 수비 · 최근 관측 위치 확인');
  assert.ok(scout);
  scout.waypoint = scout.route.findIndex((point, index) => index > 0 && Math.hypot(point.x - scout.x, point.y - scout.y) > 35);
  assert.ok(scout.waypoint > 0);
  const next = scout.route[scout.waypoint];
  const smoke = { x: (scout.x + next.x) / 2, y: (scout.y + next.y) / 2, radius: 5, expiresTick: 400 };
  state.smokes = [smoke];
  state.round.smokeRisks[scout.team] = [{ ...smoke, key: `${smoke.x}:${smoke.y}:400`, notedTick: state.tick }];
  prepareRound(state, map);
  assert.equal(scout.smokeGuarding, true);
  const before = { x: scout.x, y: scout.y };
  moveActors(state, map, new Set(), 50);
  assert.deepEqual({ x: scout.x, y: scout.y }, before);
  state.tick += 40;
  prepareRound(state, map);
  assert.equal(scout.smokeGuarding, false);
  moveActors(state, map, new Set(), 50);
  assert.ok(Math.hypot(scout.x - before.x, scout.y - before.y) > 0);
});

test('2인 대응의 담당·이동·난수는 배우 배열 순서와 프레임 분할에 무관하다', () => {
  const a = fixture(), b = fixture();
  b.state.actors.reverse();
  advancePractice(a.state, a.map, 1000);
  for (let i = 0; i < 20; i++) stepPractice(b.state, b.map);
  b.state.actors.sort((x, y) => x.id.localeCompare(y.id));
  a.state.actors.sort((x, y) => x.id.localeCompare(y.id));
  assert.deepEqual(a.state, b.state);
});

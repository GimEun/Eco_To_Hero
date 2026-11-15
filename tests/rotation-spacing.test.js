import test from 'node:test';
import assert from 'node:assert/strict';
import { PRACTICE_MAPS } from '../src/data/maps/index.js';
import { RELAY_MAP } from '../src/data/maps/relay.js';
import { createPractice, advancePractice, stepPractice } from '../src/simulation/practice.js';
import { prepareRound } from '../src/simulation/round.js';
import { considerSiteRotation } from '../src/simulation/attack-tactics.js';
import { startEconomyRound, nextEconomyRound } from '../src/simulation/economy.js';
import { moveActors } from '../src/simulation/actor-movement.js';
import { cellCenter, canOccupy } from '../src/simulation/geometry.js';

const clubs = ['home', 'away'].map(team => ({ name: team, players: Array.from({ length: 5 }, (_, i) => ({
  id: team + i, name: team + i, nickname: team + i, aim: 45, intelligence: 45, stamina: 45,
})) }));

function fixture(map = RELAY_MAP, attackTeam = 'home', siteName = 'A', plan = 'execute') {
  const state = createPractice(map, ...clubs, { economy: true, attackTeam, siteName,
    attackPlans: { home: plan, away: plan }, defensePlans: { home: 'standard', away: 'standard' } });
  startEconomyRound(state);
  for (const actor of state.actors) Object.assign(actor, { viewRange: 0, nextShotTick: 100000, nextUtilityTick: 100000 });
  const carrier = state.actors.find(actor => actor.id === state.round.bomb.carrierId);
  Object.assign(carrier, cellCenter(map, { x: map.tactics.attackSites[siteName].main[1][0], y: map.tactics.attackSites[siteName].main[1][1] }));
  state.tick = 100;
  state.round.started = true;
  remember(state, map, siteName, 3);
  return { state, carrier };
}

function remember(state, map, siteName, count) {
  const point = cellCenter(map, { x: map.tactics.attackSites[siteName].plant[0], y: map.tactics.attackSites[siteName].plant[1] });
  state.round.attackContacts = state.actors.filter(actor => actor.team !== state.round.attackTeam).slice(0, count)
    .map((actor, i) => ({ id: actor.id, x: point.x, y: point.y + (i - 1) * 20, tick: state.tick }));
}

function rotate(state, map) {
  prepareRound(state, map);
  state.tick += 40;
  prepareRound(state, map);
}

test('3개 맵·양 진영·A/B·두 전술은 지속 관측 후 전환하고 역할·폭탄·유효 경로를 보존한다', () => {
  for (const map of PRACTICE_MAPS) for (const side of ['home', 'away']) for (const site of ['A', 'B']) for (const plan of ['execute', 'split']) {
    const { state, carrier } = fixture(map, side, site, plan);
    const random = state.randomState;
    prepareRound(state, map);
    state.tick += 39; prepareRound(state, map);
    assert.equal(state.round.siteName, site);
    state.tick++; prepareRound(state, map);
    assert.equal(state.round.siteName, site === 'A' ? 'B' : 'A');
    assert.equal(state.round.bomb.carrierId, carrier.id);
    assert.equal(state.randomState, random);
    assert.equal(state.round.action, null);
    for (const actor of state.actors.filter(actor => actor.team === side)) {
      assert.ok(actor.attackTask);
      assert.equal(actor.attackTask.plan, plan);
      if (actor.id === carrier.id) assert.ok(actor.attackTask.stage >= 1, `${map.id}/${site}/${actor.id}`);
      for (const point of [...actor.route, actor.attackTask.plant, actor.attackTask.guard]) assert.ok(canOccupy(map, point.x, point.y, actor.radius));
    }
    assert.equal(state.events.filter(event => event.type === 'site-rotation').length, 1);
    remember(state, map, state.round.siteName, 3);
    state.tick += 40; prepareRound(state, map);
    assert.equal(state.events.filter(event => event.type === 'site-rotation').length, 1);
  }
});

test('공격 관측은 여러 관측자의 중복을 제거하고 숨은 현재 위치를 따라가지 않으며 5초 후 만료된다', () => {
  const map = { ...RELAY_MAP, walls: [] };
  const { state } = fixture(map);
  state.round.attackContacts = [];
  const observers = state.actors.slice(0, 2), enemy = state.actors[5];
  for (const [i, actor] of observers.entries()) Object.assign(actor, { x: 580, y: 240 + i * 40, viewRange: 240, fieldOfView: Math.PI * 2 });
  Object.assign(enemy, { x: 660, y: 260 });
  prepareRound(state, map);
  assert.equal(state.round.attackContacts.length, 1);
  enemy.x = 900;
  prepareRound(state, map);
  assert.equal(state.round.attackContacts[0].x, 660);
  for (const observer of observers) observer.viewRange = 0;
  state.tick += 101; prepareRound(state, map);
  assert.deepEqual(state.round.attackContacts, []);
  assert.equal(state.round.rotated, false);
});

test('관측 부족·반대 구역 수비·정보 만료·적 사망은 전환 압력을 해제한다', () => {
  for (const condition of ['few', 'other', 'stale', 'dead']) {
    const { state } = fixture();
    prepareRound(state, RELAY_MAP);
    state.tick += 40;
    if (condition === 'few') state.round.attackContacts.pop();
    if (condition === 'other') {
      for (const actor of state.actors.slice(8)) state.round.attackContacts.push({ id: actor.id, x: 820, y: 500, tick: state.tick });
    }
    if (condition === 'stale') state.tick += 101;
    if (condition === 'dead') state.actors[5].alive = false;
    prepareRound(state, RELAY_MAP);
    assert.equal(state.round.siteName, 'A', condition);
    assert.equal(state.round.rotationPressureTick, null, condition);
  }
});

test('수동 경로·설치 진행·폭탄 낙하/설치 후·부족한 시간/인원에는 자동 전환하지 않는다', () => {
  for (const condition of ['manual', 'plant', 'dropped', 'planted', 'late', 'few', 'unreachable']) {
    const { state, carrier } = fixture();
    prepareRound(state, RELAY_MAP);
    state.tick += 40;
    if (condition === 'manual') state.manualPlans.attack.players[state.actors[0].id] = { cells: [{ x: 3, y: 6 }], angle: 0 };
    if (condition === 'plant') state.round.action = { type: 'plant', actorId: carrier.id, startTick: state.tick };
    if (condition === 'dropped' || condition === 'planted') state.round.bomb.status = condition;
    if (condition === 'late') state.tick = 2200;
    if (condition === 'few') for (const actor of state.actors.slice(0, 3)) actor.alive = false;
    const map = condition === 'unreachable' ? { ...RELAY_MAP, walls: [...RELAY_MAP.walls, { x: 0, y: 8, width: 24, height: 1 }] } : RELAY_MAP;
    considerSiteRotation(state, map);
    assert.equal(state.round.siteName, 'A', condition);
  }
});

test('전환 후 실제 새 사이트에 설치하며 다음 라운드는 원래 선택 사이트와 빈 관측으로 시작한다', () => {
  const { state } = fixture();
  for (const actor of state.actors.filter(actor => actor.team === 'away')) actor.speed = 0;
  rotate(state, RELAY_MAP);
  const replay = structuredClone(state);
  advancePractice(state, RELAY_MAP, 160000);
  while (!replay.complete) advancePractice(replay, RELAY_MAP, 250);
  assert.deepEqual(state, replay);
  const plant = state.events.find(event => event.type === 'bomb-planted');
  assert.ok(plant);
  const site = RELAY_MAP.sites.find(site => site.name === 'B');
  assert.ok(state.round.bomb.y >= site.y * 40 && state.round.bomb.y < (site.y + site.height) * 40);
  assert.equal(state.round.initialSiteName, 'A');
  assert.ok(nextEconomyRound(state, RELAY_MAP));
  assert.equal(state.round.siteName, 'A');
  assert.equal(state.round.rotated, false);
  assert.deepEqual(state.round.attackContacts, []);
  assert.equal(state.round.rotationPressureTick, null);
});

function moving(id, number, x, extra = {}) {
  return { id, number, team: 'home', alive: true, x, y: 180, radius: 10, speed: 80,
    route: [{ x, y: 180 }, { x: 700, y: 180 }], waypoint: 1, arrived: false,
    attackTask: { stage: 0, points: [{ x: 700, y: 180 }, { x: 820, y: 140 }] }, objectiveKey: `attack:${id}`, ...extra };
}

test('같은 방향 선두 뒤에서는 실제 이동 예산을 줄여 몸체 충돌 전에 간격을 확보한다', () => {
  const follower = moving('home-2', 2, 100), front = moving('home-1', 1, 135);
  const state = { tick: 0, actors: [front, follower], round: { attackTeam: 'home', bomb: { status: 'carried', carrierId: 'home-3' } } };
  const map = { columns: 24, rows: 16, tileSize: 40, walls: [] };
  for (let i = 0; i < 10; i++) {
    moveActors(state, map, new Set(), 50);
    state.tick++;
    assert.ok(front.x - follower.x >= 35);
    assert.ok(front.x - follower.x < 55);
  }
  assert.ok(follower.x > 100);
  assert.ok(front.x > 135);
});

test('운반·수동 경로·마감 임박·정지/교전 선두·다른 방향에는 간격 감속을 적용하지 않는다', () => {
  for (const condition of ['carrier', 'manual', 'late', 'stopped', 'engaged', 'opposite', 'final']) {
    const follower = moving('home-2', 2, 100), front = moving('home-1', 1, 135);
    const state = { tick: condition === 'late' ? 2200 : 0, actors: [front, follower],
      round: { attackTeam: 'home', bomb: { status: 'carried', carrierId: condition === 'carrier' ? follower.id : 'home-3' } } };
    if (condition === 'manual') follower.objectiveKey = 'manual:home-2';
    if (condition === 'stopped') front.speed = 0;
    if (condition === 'opposite') front.route[1].x = 50;
    if (condition === 'final') follower.attackTask.stage = 1;
    moveActors(state, { columns: 24, rows: 16, tileSize: 40, walls: [] }, new Set(condition === 'engaged' ? [front.id] : []), 50);
    assert.equal(follower.keepingDistance, false, condition);
    assert.equal(follower.x, 104, condition);
  }
});

test('세 맵의 접촉 지원·설치 후 경계는 가능한 대체 목적지로 아군 목표 간격을 확보한다', () => {
  for (const map of PRACTICE_MAPS) {
    const { state } = fixture(map);
    const defenders = state.actors.filter(actor => actor.team === 'away');
    const id = state.actors[0].id;
    state.round.defenseContact = { id, x: 600, y: 260, tick: state.tick };
    state.round.defenseContacts = [{ ...state.round.defenseContact }];
    prepareRound(state, map);
    const goals = defenders.map(actor => actor.route.at(-1));
    for (let i = 0; i < goals.length; i++) for (let j = i + 1; j < goals.length; j++) {
      assert.ok(Math.hypot(goals[i].x - goals[j].x, goals[i].y - goals[j].y) >= 32, `${map.id}/${i}/${j}`);
    }
    Object.assign(state.round.bomb, { status: 'planted', x: 820, y: 140, carrierId: null, plantedTick: state.tick });
    prepareRound(state, map);
    for (const actor of state.actors) assert.ok(canOccupy(map, actor.route.at(-1).x, actor.route.at(-1).y, actor.radius));
  }
});

test('실제 이동 중 매 틱의 벽·몸체 비겹침과 프레임 분할 결과를 유지한다', () => {
  const { state } = fixture();
  rotate(state, RELAY_MAP);
  const replay = structuredClone(state);
  for (let tick = 0; tick < 150; tick++) {
    stepPractice(state, RELAY_MAP);
    const alive = state.actors.filter(actor => actor.alive);
    for (let i = 0; i < alive.length; i++) {
      assert.ok(canOccupy(RELAY_MAP, alive[i].x, alive[i].y, alive[i].radius));
      for (const other of alive.slice(i + 1)) assert.ok(Math.hypot(alive[i].x - other.x, alive[i].y - other.y) >= 20 - 1e-6);
    }
  }
  advancePractice(replay, RELAY_MAP, 7500);
  assert.deepEqual(state, replay);
});

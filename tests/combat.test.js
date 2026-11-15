import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { getClubView } from '../src/game/world-selectors.js';
import { RELAY_MAP } from '../src/data/maps/relay.js';
import { TRAINING_RIFLE } from '../src/data/weapons.js';
import { createPractice, advancePractice, stepPractice, visibleOpponents } from '../src/simulation/practice.js';
import { hitProbability, resolveCombat } from '../src/simulation/combat.js';
import { rayDistance, canOccupy } from '../src/simulation/geometry.js';

const open = { columns: 20, rows: 10, tileSize: 40, walls: [] };

function sample(seed = 0) {
  const world = createWorld(createClub('교전 구단').club, seed);
  const state = createPractice(RELAY_MAP, getClubView(world), getClubView(world, world.clubs[1].id), { combat: true, seed });
  return { world, state };
}

function duel() {
  const { state } = sample();
  state.actors = [state.actors[0], state.actors[5]];
  const [home, away] = state.actors;
  Object.assign(home, { x: 100, y: 100, facing: 0, aim: 99, targetId: away.id, readyTick: 0 });
  Object.assign(away, { x: 140, y: 100, facing: Math.PI, aim: 99, targetId: home.id, readyTick: 0, nextShotTick: 10000 });
  state.tick = 1;
  return { state, home, away };
}

test('유효한 교전 표적은 더 가까운 적이 나타나도 유지하고 시야를 잃으면 해제한다', () => {
  const { state, home, away } = duel();
  const closer = structuredClone(away);
  closer.id = 'away-2'; closer.x = 120;
  state.actors.push(closer);
  resolveCombat(state, open);
  assert.equal(home.targetId, away.id);
  assert.equal(state.events.find(event => event.actorId === home.id && event.type === 'shot').targetId, away.id);
  away.alive = false;
  state.tick++;
  resolveCombat(state, open);
  assert.equal(home.targetId, closer.id);
  home.facing = Math.PI;
  state.tick++;
  resolveCombat(state, open);
  assert.equal(home.targetId, null);
});

test('벽·시야각 밖·사거리 밖·동료에게 발사하지 않는다', () => {
  for (const setup of [
    ({ away }) => { away.x = 180; return { ...open, walls: [{ x: 3, y: 1, width: 1, height: 4 }] }; },
    ({ home }) => { home.facing = Math.PI; return open; },
    ({ away }) => { away.x = 350; return open; },
    ({ home, away }) => { away.team = home.team; return open; },
  ]) {
    const fixture = duel();
    const map = setup(fixture);
    resolveCombat(fixture.state, map);
    assert.equal(fixture.state.events.filter(event => event.type === 'shot').length, 0);
    assert.equal(fixture.home.ammo, TRAINING_RIFLE.magazineSize);
    assert.equal(fixture.away.hp, 100);
  }
});

test('에임·거리·이동 상태가 명중 확률에 반영된다', () => {
  const { home, away } = duel();
  assert.ok(hitProbability({ ...home, aim: 99 }, away) > hitProbability({ ...home, aim: 1 }, away));
  assert.ok(hitProbability(home, away) > hitProbability(home, { ...away, x: 290 }));
  assert.ok(hitProbability(home, away) > hitProbability({ ...home, moving: true }, away));
});

test('지능이 높은 선수는 표적 획득 후 더 빨리 반응한다', () => {
  const first = duel(); const second = duel();
  first.home.targetId = null; second.home.targetId = null;
  first.home.intelligence = 99; second.home.intelligence = 1;
  resolveCombat(first.state, open); resolveCombat(second.state, open);
  assert.ok(first.home.readyTick < second.home.readyTick);
  assert.equal(first.home.stats.shots, 0);
  assert.equal(second.home.stats.shots, 0);
});

test('사격 간격·탄약 소모·실제 유효 피해·사망을 한 번만 기록한다', () => {
  const { state, home, away } = duel();
  resolveCombat(state, open);
  assert.equal(home.stats.shots, 1);
  assert.equal(home.ammo, 29);
  assert.equal(away.hp, 66);
  state.tick = 2; resolveCombat(state, open);
  assert.equal(home.stats.shots, 1);
  state.tick = 7; resolveCombat(state, open);
  assert.equal(home.stats.shots, 2);
  state.tick = 13; resolveCombat(state, open);
  assert.equal(away.hp, 0);
  assert.equal(home.stats.damage, 100);
  assert.equal(home.stats.kills, 1);
  assert.equal(away.stats.deaths, 1);
  assert.equal(away.alive, false);
  assert.equal(state.events.filter(event => event.type === 'death').length, 1);
  const before = structuredClone(state);
  stepPractice(state, open);
  assert.deepEqual(state, before);
  assert.deepEqual(visibleOpponents(state, open, away.id), []);
});

test('같은 틱의 상호 발사는 배열 순서와 무관하게 동시 사망을 허용한다', () => {
  const fixture = duel();
  fixture.home.hp = 10; fixture.away.hp = 10; fixture.away.nextShotTick = 0;
  const other = structuredClone(fixture.state);
  other.actors.reverse();
  resolveCombat(fixture.state, open); resolveCombat(other, open);
  assert.equal(fixture.state.endReason, 'mutual-elimination');
  assert.equal(fixture.state.events.filter(event => event.type === 'shot').length, 2);
  for (const actor of fixture.state.actors) {
    assert.equal(actor.alive, false);
    assert.equal(actor.stats.kills, 1);
    assert.equal(actor.stats.deaths, 1);
    assert.equal(actor.stats.damage, 10);
    assert.deepEqual(actor, other.actors.find(item => item.id === actor.id));
  }
  assert.deepEqual(fixture.state.events, other.events);
});

test('탄창이 비면 재장전 시간 동안 발사하지 않고 완료 후 다시 발사한다', () => {
  const { state, home } = duel();
  home.ammo = 0;
  resolveCombat(state, open);
  assert.equal(home.reloadUntilTick, 1 + TRAINING_RIFLE.reloadTicks);
  assert.equal(home.stats.shots, 0);
  state.tick = 40; resolveCombat(state, open);
  assert.equal(home.stats.shots, 0);
  state.tick = 41; resolveCombat(state, open);
  assert.equal(home.reloadUntilTick, null);
  assert.equal(home.ammo, 29);
  assert.equal(home.stats.shots, 1);
});

test('빗나간 탄의 궤적도 벽에서 멈추고 피해를 적용하지 않는다', () => {
  const { state, home, away } = duel();
  home.aim = 1;
  const map = { ...open, walls: [{ x: 5, y: 1, width: 1, height: 4 }] };
  resolveCombat(state, map);
  const shot = state.events.find(event => event.type === 'shot');
  assert.equal(shot.hit, false);
  assert.ok(shot.to.x <= 200 + 1e-7);
  assert.equal(away.hp, 100);
  assert.equal(home.stats.damage, 0);
});

test('처치에 기여한 다른 선수의 도움을 한 번만 기록한다', () => {
  const { state, home, away } = duel();
  const helper = structuredClone(home);
  helper.id = 'home-2'; helper.nextShotTick = 10000;
  state.actors.push(helper);
  away.hp = 20;
  away.damageBy[helper.id] = 80;
  helper.stats.damage = 80;
  resolveCombat(state, open);
  assert.equal(home.stats.kills, 1);
  assert.equal(helper.stats.assists, 1);
  assert.equal(home.stats.assists, 0);
  assert.deepEqual(state.events.find(event => event.type === 'death').assists, [helper.id]);
});

test('여러 시드의 실제 교전이 상태·이벤트·통계와 일치하며 원본 세계를 보존한다', () => {
  const histories = new Set();
  for (const seed of [0, 1, 42, 2026, 0xffffffff]) {
    const { world, state } = sample(seed);
    const before = structuredClone(world);
    advancePractice(state, RELAY_MAP, 60000);
    assert.equal(state.complete, true);
    const shots = state.events.filter(event => event.type === 'shot');
    const deaths = state.events.filter(event => event.type === 'death');
    assert.ok(shots.length > 0 && deaths.length > 0);
    assert.equal(deaths.length, state.actors.filter(actor => !actor.alive).length);
    assert.equal(state.actors.reduce((sum, actor) => sum + actor.stats.kills, 0), deaths.length);
    assert.equal(state.actors.reduce((sum, actor) => sum + actor.stats.damage, 0), state.actors.reduce((sum, actor) => sum + 100 - actor.hp, 0));
    for (const actor of state.actors) {
      assert.ok(actor.hp >= 0 && actor.hp <= 100);
      assert.ok(actor.ammo >= 0 && actor.ammo <= 30);
      assert.equal(canOccupy(RELAY_MAP, actor.x, actor.y, actor.radius), true);
    }
    for (const shot of shots) {
      const angle = Math.atan2(shot.to.y - shot.from.y, shot.to.x - shot.from.x);
      const distance = Math.hypot(shot.to.x - shot.from.x, shot.to.y - shot.from.y);
      assert.ok(distance <= rayDistance(RELAY_MAP, shot.from, angle, TRAINING_RIFLE.range) + 1e-6);
    }
    assert.deepEqual(world, before);
    histories.add(JSON.stringify(state.events));
  }
  assert.ok(histories.size > 1);
});

test('같은 시드의 교전은 프레임 분할에 관계없이 같은 결과를 만든다', () => {
  const first = sample(42).state;
  const second = structuredClone(first);
  advancePractice(first, RELAY_MAP, 60000);
  for (let index = 0; index < 3600; index++) advancePractice(second, RELAY_MAP, 1000 / 60);
  assert.deepEqual(first, second);
});

test('사망자는 다른 선수의 교전이 진행 중이어도 이동·발사·감지를 하지 않는다', () => {
  const { state, home, away } = duel();
  const survivor = structuredClone(home);
  Object.assign(survivor, { id: 'home-2', x: 100, y: 140, arrived: true, nextShotTick: 10000 });
  state.actors.push(survivor);
  home.alive = false; home.hp = 0;
  const position = { x: home.x, y: home.y };
  stepPractice(state, open);
  assert.deepEqual({ x: home.x, y: home.y }, position);
  assert.equal(home.stats.shots, 0);
  assert.equal(state.events.some(event => event.type === 'shot' && event.actorId === home.id), false);
  assert.deepEqual(visibleOpponents(state, open, home.id), []);
  assert.ok(visibleOpponents(state, open, away.id).every(actor => actor.id !== home.id));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { captureSounds, updateHearing } from '../src/simulation/sound.js';
import { reactionTicks, resolveCombat } from '../src/simulation/combat.js';
import { createPractice, stepPractice } from '../src/simulation/practice.js';
import { prepareRound, setupRound } from '../src/simulation/round.js';
import { createClub } from '../src/game/create-club.js';
import { RELAY_MAP } from '../src/data/maps/relay.js';
import { economyPanel } from '../src/ui/economy-panel.js';
import { setManualRoute } from '../src/simulation/manual-tactics.js';

const open = { columns: 20, rows: 10, tileSize: 40, walls: [] };
function fixture() {
  const state = createPractice(RELAY_MAP, createClub('홈').club, createClub('원정').club, { round: true });
  const listener = state.actors[1], source = state.actors[5];
  for (const actor of state.actors) Object.assign(actor, { alive: false, moving: false });
  Object.assign(listener, { alive: true, x: 100, y: 100, facing: Math.PI, intelligence: 50, arrived: true });
  Object.assign(source, { alive: true, x: 300, y: 100, facing: 0, moving: true, arrived: true });
  return { state, listener, source };
}

test('공수 모두 벽·시야 밖 300까지 발소리를 듣고 300 초과·아군·정지·사망자는 제외한다', () => {
  for (const team of ['home', 'away']) {
    const { state, listener, source } = fixture();
    listener.team = team; source.team = team === 'home' ? 'away' : 'home';
    source.x = 400;
    captureSounds(state, { ...open, walls: [{ x: 5, y: 0, width: 1, height: 10 }] }, 0);
    assert.equal(listener.pendingSound.kind, 'footstep');
    for (const change of [{ x: 400.01 }, { team }, { moving: false }, { alive: false }]) {
      Object.assign(source, { x: 400, team: team === 'home' ? 'away' : 'home', moving: true, alive: true }, change);
      listener.pendingSound = null; captureSounds(state, open, 0);
      assert.equal(listener.pendingSound, null);
    }
  }
});

test('연속 소리가 지연을 미루지 않으며 2배 지연 후 발생 당시 위치만 기억한다', () => {
  const { state, listener, source } = fixture();
  captureSounds(state, open, 0);
  const snapshot = structuredClone(listener.pendingSound);
  assert.equal(snapshot.readyTick, reactionTicks(listener) * 2);
  state.tick = snapshot.readyTick - 1; source.x = 350;
  captureSounds(state, open, 0); updateHearing(state);
  assert.deepEqual(listener.pendingSound, snapshot); assert.equal(listener.heardSound, null);
  state.tick++; updateHearing(state);
  assert.equal(listener.heardSound.x, 300); assert.equal(listener.pendingSound, null);
  source.x = 600;
  assert.equal(listener.heardSound.x, 300);
  state.tick = snapshot.tick + 101; updateHearing(state);
  assert.equal(listener.heardSound, null);
});

test('총성은 실제 발사 위치를 사용하고 오래된 사격·재장전은 소리를 만들지 않는다', () => {
  const { state, listener, source } = fixture();
  source.moving = false;
  state.events.push({ type: 'shot', actorId: source.id, from: { x: 280, y: 100 } });
  captureSounds(state, open, 0);
  assert.equal(listener.pendingSound.kind, 'shot'); assert.equal(listener.pendingSound.x, 280);
  listener.pendingSound = null;
  state.events.push({ type: 'reload', actorId: source.id });
  captureSounds(state, open, 1);
  assert.equal(listener.pendingSound, null);
});

test('직접 보이는 적은 소리 반응을 기다리지 않고 기존 시각 반응을 따른다', () => {
  const { state, listener, source } = fixture();
  listener.facing = 0; listener.weaponId = 'sniper';
  captureSounds(state, open, 0); assert.equal(listener.pendingSound, null);
  resolveCombat(state, open);
  assert.equal(listener.targetId, source.id);
  assert.equal(listener.readyTick, state.tick + reactionTicks(listener));
});

test('소리 기억만으로 벽 너머를 사격하지 않고 자동 전술이 해당 위치로 향한다', () => {
  const { state, listener } = fixture();
  captureSounds(state, open, 0); state.tick = listener.pendingSound.readyTick;
  updateHearing(state);
  const map = { ...RELAY_MAP, walls: [] };
  prepareRound(state, map);
  assert.match(listener.objectiveKey, /^sound:/); assert.equal(listener.intent, '발소리 위치 확인');
  const wallMap = { ...open, walls: [{ x: 5, y: 0, width: 1, height: 10 }] };
  resolveCombat(state, wallMap);
  assert.equal(listener.stats.shots, 0); assert.equal(listener.targetId, null);
});

test('실제 틱에서 발소리를 수집하고 지연 후 방향에 반응한다', () => {
  const { state, listener, source } = fixture();
  state.round = null;
  source.arrived = false; source.route = [{ x: 300, y: 100 }, { x: 500, y: 100 }]; source.waypoint = 1;
  stepPractice(state, open);
  const ready = listener.pendingSound.readyTick;
  while (state.tick < ready) stepPractice(state, open);
  assert.equal(listener.heardSound, null); assert.equal(listener.facing, Math.PI);
  stepPractice(state, open);
  assert.ok(listener.heardSound); assert.equal(listener.facing, 0);
});

test('사망 및 다음 라운드는 소리 기억·대기를 지운다', () => {
  const { state, listener } = fixture();
  captureSounds(state, open, 0); listener.heardSound = { x: 300, y: 100, tick: 0 };
  listener.alive = false; updateHearing(state);
  assert.equal(listener.pendingSound, null); assert.equal(listener.heardSound, null);
  listener.alive = true; captureSounds(state, open, 0); listener.heardSound = { x: 300, y: 100, tick: 0 };
  setupRound(state, RELAY_MAP, 'away', 'A');
  assert.equal(listener.pendingSound, null); assert.equal(listener.heardSound, null);
});

test('소리 위치가 있어도 수동 경로·폭탄 운반·설치 후 해체 임무를 보존한다', () => {
  const map = { ...RELAY_MAP, walls: [] };
  for (const mode of ['manual', 'carrier', 'defuse']) {
    const { state, listener, source } = fixture();
    listener.heardSound = { x: 300, y: 100, tick: 0, kind: 'footstep' };
    if (mode === 'manual') assert.equal(setManualRoute(state, map, listener.id, 'attack', [{ x: 4, y: 4 }], 0).ok, true);
    if (mode === 'carrier') state.round.bomb.carrierId = listener.id;
    if (mode === 'defuse') {
      state.round.attackTeam = source.team;
      Object.assign(state.round.bomb, { status: 'planted', plantedTick: 0, x: 100, y: 100 });
      state.round.defuserId = listener.id;
    }
    prepareRound(state, map);
    assert.doesNotMatch(listener.objectiveKey, /^sound:/);
    if (mode === 'manual') assert.match(listener.objectiveKey, /^manual:/);
    if (mode === 'defuse') { assert.match(listener.objectiveKey, /^defuse:/); assert.equal(listener.action, 'defuse'); }
  }
});

test('장비 설명에 승인한 여섯 이동 비율을 표시한다', () => {
  const markup = economyPanel();
  for (const text of ['기본 권총 110%', '기관단총 115%', '돌격소총 100%', '산탄총 95%', '저격소총 85%', '기관총 80%']) assert.ok(markup.includes(text), text);
});

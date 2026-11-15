import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { getClubView } from '../src/game/world-selectors.js';
import { recruitPlayer, replaceStarter, signingFee, recruitmentIssue } from '../src/game/roster.js';
import { renewContract } from '../src/game/contracts.js';
import { selectTraining } from '../src/game/training.js';
import { advanceWeek } from '../src/game/calendar.js';
import { effectiveStats } from '../src/game/happiness.js';
import { createOfficialPractice } from '../src/game/official-match.js';
import { PRACTICE_MAPS } from '../src/data/maps/index.js';
import { createPractice, advancePractice, stepPractice } from '../src/simulation/practice.js';
import { buyEquipment, startEconomyRound, nextEconomyRound } from '../src/simulation/economy.js';
import { canSee, canOccupy, cellCenter } from '../src/simulation/geometry.js';
import { prepareRound } from '../src/simulation/round.js';

// 진단 전용 실행 파일. 실제 저장이나 게임 설정은 변경하지 않는다.
const stage = process.argv[2] ?? 'all';
const seeds = (process.argv[3] ?? '1,42,2026').split(',').map(Number);
const output = process.argv[4] ?? 'work-logs/2026-11-10';
assert.ok(['all', 'census', 'matrix', 'league', 'smoke', 'probe'].includes(stage));
assert.ok(seeds.length && seeds.every(seed => Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff));
fs.mkdirSync(output, { recursive: true });
const save = (name, data) => fs.writeFileSync(path.join(output, `pc-difficulty-${name}.json`), JSON.stringify(data, null, 2) + '\n', 'utf8');
const create = seed => createWorld(createClub('PC Audit').club, seed);
const skills = ['aim', 'intelligence', 'stamina'];
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const strength = player => mean(skills.map(skill => player[skill]));
const lineup = view => view.lineupIds.map(id => view.players.find(player => player.id === id));
function snapshot(view) {
  const players = lineup(view);
  return { id: view.id, average: mean(players.map(strength)),
    raw: Object.fromEntries(skills.map(skill => [skill, mean(players.map(player => player[skill]))])),
    effective: Object.fromEntries(skills.map(skill => [skill, mean(players.map(player => effectiveStats(player)[skill]))])),
    fatigue: mean(players.map(player => player.fatigue)), happiness: mean(players.map(player => player.morale.happiness)),
    players: players.map(player => ({ id: player.id, nickname: player.nickname,
      aim: player.aim, intelligence: player.intelligence, stamina: player.stamina, effective: effectiveStats(player),
      fatigue: player.fatigue, happiness: player.morale.happiness, experience: { ...player.training.experience } })) };
}
function recruit(world) {
  const home = world.clubs.find(club => club.id === world.playerClubId);
  const owned = new Set(world.clubs.flatMap(club => club.playerIds));
  const player = world.players.filter(player => !owned.has(player.id) && signingFee(player) <= home.balance && !recruitmentIssue(home, player))
    .sort((a, b) => strength(b) - strength(a) || a.id.localeCompare(b.id))[0];
  const weakest = lineup(getClubView(world)).sort((a, b) => strength(a) - strength(b))[0];
  const fee = signingFee(player);
  assert.equal(recruitPlayer(world, player.id).ok, true);
  assert.equal(replaceStarter(world, player.id, weakest.id).ok, true);
  return { incomingId: player.id, outgoingId: weakest.id, fee, incomingAverage: strength(player),
    outgoingAverage: strength(weakest), balance: home.balance };
}
function grow(world) {
  const home = world.clubs.find(club => club.id === world.playerClubId);
  for (const id of home.playerIds) assert.equal(renewContract(world, id, 84).ok, true);
  const before = world.players.filter(player => !home.playerIds.includes(player.id)).map(player => structuredClone(player));
  const weeks = [snapshot(getClubView(world))];
  const actions = ['aim', 'intelligence', 'rest', 'aim', 'intelligence', 'rest', 'aim'];
  for (const action of actions) {
    for (const id of home.playerIds) assert.equal(selectTraining(world, id, action).ok, true);
    const result = advanceWeek(world);
    assert.equal(result.ok, true, result.message);
    assert.equal(result.advancedDays, 7);
    weeks.push(snapshot(getClubView(world)));
  }
  assert.deepEqual(world.players.filter(player => !home.playerIds.includes(player.id)), before);
  assert.equal(world.day, 50);
  return { actions, weeks, allOtherPlayersUnchanged: true, day: world.day };
}

function census() {
  const rows = [];
  for (let seed = 0; seed < 32; seed++) {
    const world = create(seed);
    const home = snapshot(getClubView(world));
    const pc = world.clubs.filter(club => club.leagueId === 'pc' && club.id !== world.playerClubId)
      .map(club => snapshot(getClubView(world, club.id)));
    const owned = new Set(world.clubs.flatMap(club => club.playerIds));
    const free = world.players.filter(player => !owned.has(player.id));
    const recruitment = recruit(world);
    rows.push({ seed, home, opponents: pc, free: { count: free.length,
      strongestAverage: Math.max(...free.map(strength)), abovePcCeiling: free.filter(player => strength(player) > 54).length },
    recruitment, recruited: snapshot(getClubView(world)) });
  }
  const growth = seeds.map(seed => { const world = create(seed); return { seed, ...grow(world) }; });
  const summary = { worlds: rows.length, starterAverage: mean(rows.map(row => row.home.average)),
    pcAverage: mean(rows.flatMap(row => row.opponents.map(opponent => opponent.average))),
    minPcTeam: Math.min(...rows.flatMap(row => row.opponents.map(opponent => opponent.average))),
    maxPcTeam: Math.max(...rows.flatMap(row => row.opponents.map(opponent => opponent.average))),
    freeAbovePcCeiling: mean(rows.map(row => row.free.abovePcCeiling)),
    recruitedAverage: mean(rows.map(row => row.recruited.average)), recruitmentFee: mean(rows.map(row => row.recruitment.fee)) };
  save('census', { summary, rows, growth });
  console.log(JSON.stringify({ stage: 'census', summary }));
}

const variants = ['auto', 'rifle-armor', 'rifle-smoke', 'rifle-full', 'auto-no-smoke', 'equal-stats',
  'away-alternative', 'home-alternative', 'recruited', 'week7', 'week7-raw'];
function fixtureViews(seed, variant) {
  const world = create(seed);
  let detail = null;
  if (variant === 'recruited') detail = recruit(world);
  if (variant.startsWith('week7')) detail = grow(world);
  const home = structuredClone(getClubView(world));
  const away = structuredClone(getClubView(world, world.clubs.find(club => club.leagueId === 'pc' && club.id !== world.playerClubId).id));
  if (variant === 'equal-stats') for (const view of [home, away]) for (const player of view.players) {
    Object.assign(player, { aim: 45, intelligence: 45, stamina: 45 });
  }
  if (variant === 'week7-raw') for (const player of home.players) {
    player.fatigue = 0; player.morale.happiness = 70;
  }
  return { home, away, detail };
}
function configureGear(state, variant) {
  if (variant.startsWith('rifle-')) {
    for (const actor of state.actors.filter(actor => actor.team === 'home')) {
      buyEquipment(state, actor.id, 'training-rifle');
      buyEquipment(state, actor.id, 'armor');
      if (variant !== 'rifle-armor') buyEquipment(state, actor.id, 'smoke');
      if (variant === 'rifle-full') for (const id of ['grenade', 'flashbang']) buyEquipment(state, actor.id, id);
    }
    startEconomyRound(state);
  } else startEconomyRound(state, { autoHome: true });
  // 자동 구매 규칙은 유지하고 구매 직후 연막 보유만 제거한다. 비용을 환급하지 않는 진단용 조건이다.
  if (variant === 'auto-no-smoke') for (const actor of state.actors) actor.throwables.smoke = 0;
}
function runMatch(home, away, map, attackTeam, seed, variant = 'auto') {
  const original = structuredClone([home, away]);
  const state = createPractice(map, home, away, { seed, match: true, attackTeam,
    attackPlans: { home: variant === 'home-alternative' ? 'split' : 'execute', away: variant === 'away-alternative' ? 'split' : 'execute' },
    defensePlans: { home: variant === 'home-alternative' ? 'forward' : 'standard', away: variant === 'away-alternative' ? 'forward' : 'standard' } });
  const rounds = [];
  let smokes = 0, grenades = 0, flashes = 0;
  while (!state.match.complete && rounds.length < 160) {
    configureGear(state, variant);
    const gear = Object.fromEntries(['home', 'away'].map(team => [team,
      state.actors.filter(actor => actor.team === team).map(actor => ({ weapon: actor.weaponId, armor: actor.armor, smoke: actor.throwables.smoke }))]));
    advancePractice(state, map, 160000);
    assert.equal(state.complete, true);
    for (const actor of state.actors) {
      assert.ok(actor.hp >= 0 && actor.hp <= 100 && actor.cash >= 0 && actor.cash <= 16000);
    }
    const thrown = state.events.filter(event => event.type === 'utility-thrown');
    smokes += thrown.filter(event => event.kind === 'smoke').length;
    grenades += thrown.filter(event => event.kind === 'grenade').length;
    flashes += thrown.filter(event => event.kind === 'flashbang').length;
    rounds.push({ round: state.economy.roundNumber, attackTeam: state.round.attackTeam, winner: state.round.winner,
      reason: state.endReason, ticks: state.tick, score: { ...state.match.score },
      plants: state.events.filter(event => event.type === 'bomb-planted').length,
      gear, smokes: thrown.filter(event => event.kind === 'smoke').length,
      deathsWithoutShot: state.actors.filter(actor => !actor.alive && actor.stats.shots === 0).length });
    if (!state.match.complete) assert.equal(nextEconomyRound(state, map), true);
  }
  assert.deepEqual([home, away], original, '경기 계산이 원본 세계를 변경하면 안 된다');
  return { variant, seed, map: map.id, startAttack: attackTeam, homeId: home.id, awayId: away.id,
    home: snapshot(home), away: snapshot(away), complete: state.match.complete, winner: state.match.winner,
    score: state.match.score, overtime: state.match.overtime, smokes, grenades, flashes, rounds };
}
function summarize(rows) {
  return { matches: rows.length, complete: rows.filter(row => row.complete).length,
    wins: rows.filter(row => row.winner === 'home').length, censored: rows.filter(row => !row.complete).length,
    roundWins: rows.reduce((sum, row) => sum + row.score.home, 0),
    roundLosses: rows.reduce((sum, row) => sum + row.score.away, 0),
    smokes: rows.reduce((sum, row) => sum + row.smokes, 0) };
}
function matrix() {
  const rows = [];
  for (const variant of variants) {
    for (const seed of seeds) {
      const { home, away } = fixtureViews(seed, variant);
      for (const map of PRACTICE_MAPS) for (const side of ['home', 'away']) rows.push(runMatch(home, away, map, side, seed, variant));
    }
    save('matrix', { seeds, variants, summary: Object.fromEntries(variants.filter(key => rows.some(row => row.variant === key))
      .map(key => [key, summarize(rows.filter(row => row.variant === key))])), rows });
    console.log(JSON.stringify({ stage: 'matrix', variant, ...summarize(rows.filter(row => row.variant === variant)) }));
  }
}
function league(variant = 'auto') {
  assert.ok(['auto', 'recruited'].includes(variant));
  const rows = [];
  for (const seed of seeds) {
    const world = create(seed);
    if (variant === 'recruited') recruit(world);
    for (const fixture of world.pcSeason.fixtures.filter(fixture => [fixture.homeClubId, fixture.awayClubId].includes(world.playerClubId))) {
      const config = createOfficialPractice(world, fixture);
      for (const side of [config.attackTeam, config.attackTeam === 'home' ? 'away' : 'home']) {
        const row = runMatch(config.home, config.away, config.map, side, config.seed, variant);
        rows.push({ ...row, worldSeed: seed, fixtureId: fixture.id, week: fixture.week, assignedSide: side === config.attackTeam });
      }
    }
    save(variant === 'auto' ? 'league' : 'league-recruited', { seeds, variant, summary: summarize(rows), rows });
    console.log(JSON.stringify({ stage: 'league', variant, worldSeed: seed, ...summarize(rows.filter(row => row.worldSeed === seed)) }));
  }
}
function smoke() {
  const rows = [], cases = [];
  for (const seed of seeds) {
    const { home, away } = fixtureViews(seed, 'equal-stats');
    for (const map of PRACTICE_MAPS) for (const side of ['home', 'away']) for (const site of ['A', 'B']) {
      const state = createPractice(map, home, away, { economy: true, seed, attackTeam: side, siteName: site,
        attackPlans: { home: 'execute', away: 'execute' }, defensePlans: { home: 'standard', away: 'standard' } });
      startEconomyRound(state, { autoHome: true });
      for (const actor of state.actors) Object.assign(actor, { weaponId: 'training-rifle', ammo: 30, armor: 100,
        throwables: { smoke: 1, grenade: 0, flashbang: 0 } });
      const known = new Map();
      const row = { seed, map: map.id, side, site, samples: 0, smokeSamples: 0, hiddenPairSamples: 0,
        noContactPairSamples: 0, memoryExpiredPairSamples: 0, hiddenMovingActorSamples: 0, hiddenStationaryActorSamples: 0, smokes: 0 };
      for (let tick = 0; tick < 3200 && !state.complete; tick++) {
        stepPractice(state, map);
        if (state.tick % 10 !== 0) continue;
        row.samples++;
        for (const [team, contacts] of [[state.round.attackTeam, state.round.attackContacts],
          [state.round.attackTeam === 'home' ? 'away' : 'home', state.round.defenseContacts]]) {
          for (const contact of contacts ?? []) known.set(`${team}:${contact.id}`, contact.tick);
        }
        if (!state.smokes.length) continue;
        row.smokeSamples++;
        const noSmoke = { ...state, smokes: [] };
        for (const actor of state.actors.filter(actor => actor.alive)) {
          const hidden = state.actors.filter(target => target.alive && target.team !== actor.team
            && canSee(map, actor, target, noSmoke) && !canSee(map, actor, target, state));
          row.hiddenPairSamples += hidden.length;
          if (!hidden.length) continue;
          row[actor.moving ? 'hiddenMovingActorSamples' : 'hiddenStationaryActorSamples']++;
          const contacts = actor.team === state.round.attackTeam ? state.round.attackContacts : state.round.defenseContacts;
          for (const target of hidden) {
            if (!(contacts ?? []).some(contact => contact.id === target.id)) {
              row.noContactPairSamples++;
              if (known.has(`${actor.team}:${target.id}`) && state.tick - known.get(`${actor.team}:${target.id}`) > 100) row.memoryExpiredPairSamples++;
            }
          }
          if (cases.length < 24 && state.tick > 240 && !(contacts ?? []).length) cases.push({ seed, map: map.id, side, site,
            tick: state.tick, actorId: actor.id, actor: { x: actor.x, y: actor.y, facing: actor.facing, intent: actor.intent,
              moving: actor.moving, targetId: actor.targetId, incomingFire: actor.incomingFire },
            hiddenIds: hidden.map(target => target.id), smokes: structuredClone(state.smokes) });
        }
      }
      assert.equal(state.complete, true);
      row.smokes = state.events.filter(event => event.type === 'utility-thrown' && event.kind === 'smoke').length;
      Object.assign(row, { winner: state.round.winner, reason: state.endReason, ticks: state.tick });
      rows.push(row);
    }
    save('smoke', { seeds, sampleIntervalTicks: 10, note: 'No-contact counts include never-observed targets; not all are lost memories.', rows, cases });
    console.log(JSON.stringify({ stage: 'smoke', seed, rounds: rows.length }));
  }
}
function probe() {
  // 고정 위치/방향에서 시야·공유 기억 갱신만 호출하는 구성 사례다. 자연 경기로 집계하지 않는다.
  const { home, away } = fixtureViews(42, 'equal-stats');
  const rows = [];
  for (const map of PRACTICE_MAPS) {
    const state = createPractice(map, home, away, { economy: true, seed: 42, attackTeam: 'home',
      attackPlans: { home: 'execute', away: 'execute' }, defensePlans: { home: 'standard', away: 'standard' } });
    const observer = state.actors[0], target = state.actors[5];
    for (const actor of state.actors) actor.alive = actor === observer || actor === target;
    let pair;
    for (let y = 1; y < map.rows - 1 && !pair; y++) for (let x = 1; x < map.columns - 4 && !pair; x++) {
      const a = cellCenter(map, { x, y }), b = cellCenter(map, { x: x + 3, y });
      if (!canOccupy(map, a.x, a.y, 10) || !canOccupy(map, b.x, b.y, 10)) continue;
      Object.assign(observer, a, { facing: 0 }); Object.assign(target, b, { facing: Math.PI });
      if (canSee(map, observer, target, state)) pair = [a, b];
    }
    assert.ok(pair);
    const smoke = { x: (observer.x + target.x) / 2, y: observer.y, radius: 70, expiresTick: 240 };
    const timeline = [];
    for (const tick of [0, 1, 100, 101, 200, 239, 240, 241]) {
      state.tick = tick;
      state.smokes = tick ? [smoke] : [];
      observer.facing = 0; target.facing = Math.PI;
      const visible = canSee(map, observer, target, state);
      prepareRound(state, map);
      timeline.push({ tick, seconds: tick * 0.05, visible,
        remembered: state.round.attackContacts.some(contact => contact.id === target.id),
        lastSeenTick: state.round.attackContacts.find(contact => contact.id === target.id)?.tick ?? null,
        intent: observer.intent });
    }
    assert.equal(timeline[0].visible, true);
    assert.equal(timeline[2].remembered, true);
    assert.equal(timeline[3].remembered, false);
    assert.equal(timeline[4].visible, false);
    assert.equal(timeline[6].visible, true);
    assert.equal(timeline[6].remembered, true);
    rows.push({ map: map.id, pair, smoke, timeline });
  }
  save('probe', { note: 'Constructed fixed-position contact-memory probe; not a match.', rows });
  console.log(JSON.stringify({ stage: 'probe', maps: rows.length, assertions: 'passed' }));
}
if (stage === 'all' || stage === 'census') census();
if (stage === 'all' || stage === 'matrix') matrix();
if (stage === 'all' || stage === 'league') league(process.argv[5] ?? 'auto');
if (stage === 'all' || stage === 'smoke') smoke();
if (stage === 'all' || stage === 'probe') probe();

import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { getClubView } from '../src/game/world-selectors.js';
import { recruitPlayer, replaceStarter, signingFee, recruitmentIssue } from '../src/game/roster.js';
import { PRACTICE_MAPS } from '../src/data/maps/index.js';
import { createPractice, advancePractice } from '../src/simulation/practice.js';
import { buyEquipment, startEconomyRound, nextEconomyRound } from '../src/simulation/economy.js';
import { assignAttackTasks, setAttackPlan } from '../src/simulation/attack-tactics.js';
import { assignDefenseTasks, setDefensePlan } from '../src/simulation/defense-tactics.js';
import { prepareRound, setupRound } from '../src/simulation/round.js';
import { OPPONENT_STRATEGY } from '../src/config/opponent-strategy.js';
import { WEAPONS, BODY_ARMOR } from '../src/data/weapons.js';

const mode = process.argv[2] ?? 'pilot';
const seeds = (process.argv[3] ?? '7').split(',').map(Number);
const boosts = (process.argv[4] ?? '0,2,4').split(',').map(Number);
const noviceGear = process.argv[5] ?? 'bare';
const statRange = process.argv[6] && process.argv[6] !== '-' ? process.argv[6].split(',').map(Number) : null;
assert.ok(!statRange || (statRange.length === 2 && statRange.every(Number.isFinite)
  && statRange[0] >= 1 && statRange[1] <= 99 && statRange[0] <= statRange[1]), '능력 범위는 최솟값,최댓값 또는 -');
const root = process.argv[7] ?? 'work-logs/2026-11-10';
const purchasePolicies = (process.argv[8] ?? 'mixed,rifle-first').split(',');
assert.ok(purchasePolicies.length && purchasePolicies.every(policy => ['mixed', 'rifle-first'].includes(policy)));
const opponentVariant = process.argv[9] ?? 'current';
assert.ok(['current', 'attack-alternative', 'defense-alternative', 'relay-b-cover'].includes(opponentVariant));
const homePurchasePolicy = process.argv[11] ?? 'legacy';
assert.ok(['legacy', 'reserve'].includes(homePurchasePolicy));
const activeMaps = process.argv[12] && process.argv[12] !== '-' ? PRACTICE_MAPS.filter(map => map.id === process.argv[12]) : PRACTICE_MAPS;
assert.ok(activeMaps.length);
const recruitmentPolicy = process.argv[13] ?? 'average';
assert.ok(['average', 'dominant'].includes(recruitmentPolicy));
const rosterFilter = process.argv[14] ?? 'both';
assert.ok(['both', 'initial', 'recruited'].includes(rosterFilter));
const recruitmentModes = rosterFilter === 'initial' ? [false] : rosterFilter === 'recruited' ? [true] : [false, true];
const homeManagement = process.argv[15] ?? 'static';
assert.ok(['static', 'reactive'].includes(homeManagement));
fs.mkdirSync(root, { recursive: true });
const mean = values => values.reduce((n, v) => n + v, 0) / values.length;
const strength = player => mean([player.aim, player.intelligence, player.stamina]);
const choices = ['execute', 'split'].flatMap(attack => ['standard', 'forward'].flatMap(defense => ['A', 'B'].map(site => ({ attack, defense, site }))));
const prior = { relay: { attack: 'split', defense: 'forward' }, warehouse: { attack: 'execute', defense: 'standard' }, research: { attack: 'execute', defense: 'standard' } };
function teams(seed, recruit = false, boost = 0) {
  const world = createWorld(createClub('Calibration').club, seed);
  const club = world.clubs.find(club => club.id === world.playerClubId);
  let recruitment = null;
  if (recruit) {
    const owned = new Set(world.clubs.flatMap(club => club.playerIds));
    const candidates = world.players.filter(p => !owned.has(p.id) && signingFee(p) <= club.balance && !recruitmentIssue(club, p))
      .sort((a, b) => strength(b) - strength(a) || a.id.localeCompare(b.id));
    const starters = club.lineupIds.map(id => world.players.find(p => p.id === id)).sort((a, b) => strength(a) - strength(b));
    let incoming = candidates[0], outgoing = starters[0];
    if (recruitmentPolicy === 'dominant') {
      const pairs = starters.flatMap(previous => candidates.filter(next => ['aim', 'intelligence', 'stamina'].every(skill => next[skill] >= previous[skill])
        && strength(next) > strength(previous)).map(next => ({ outgoing: previous, incoming: next, gain: strength(next) - strength(previous) })));
      pairs.sort((a, b) => b.gain - a.gain || strength(b.incoming) - strength(a.incoming)
        || a.incoming.id.localeCompare(b.incoming.id) || a.outgoing.id.localeCompare(b.outgoing.id));
      if (!pairs.length) {
        const error = new Error('세 능력이 내려가지 않는 합법 보강 후보가 없습니다.');
        error.code = 'NO_DOMINANT_RECRUIT';
        throw error;
      }
      ({ incoming, outgoing } = pairs[0]);
    }
    recruitment = { policy: recruitmentPolicy, fee: signingFee(incoming),
      outgoing: Object.fromEntries(['id', 'aim', 'intelligence', 'stamina'].map(key => [key, outgoing[key]])),
      incoming: Object.fromEntries(['id', 'aim', 'intelligence', 'stamina'].map(key => [key, incoming[key]])) };
    assert.equal(recruitPlayer(world, incoming.id).ok, true);
    assert.equal(replaceStarter(world, incoming.id, outgoing.id).ok, true);
  }
  const home = structuredClone(getClubView(world));
  const away = structuredClone(getClubView(world, world.clubs.find(c => c.leagueId === 'pc' && c.id !== club.id).id));
  for (const player of away.players) for (const key of ['aim', 'intelligence', 'stamina']) {
    player[key] = statRange ? statRange[0] + Math.round((player[key] - 30) * (statRange[1] - statRange[0]) / 24)
      : Math.max(1, Math.min(99, player[key] + boost));
  }
  return { home, away, recruitment };
}
// 진단 전용 구매 뷰로 실제 구매 API의 가격·잔액·장부 처리를 재사용한다.
// 실제 actor의 팀·번호·전술은 바꾸지 않으며 생존 무기는 그대로 보존한다.
function purchaseOpponentRifles(state) {
  const originals = state.actors.filter(actor => actor.team === 'away');
  const view = { ...state, actors: originals.map(actor => ({ ...actor, team: 'home', throwables: { ...actor.throwables } })) };
  for (const actor of view.actors) {
    if (actor.weaponId === 'basic-pistol') {
      const weapon = ['training-rifle', 'smg'].map(id => WEAPONS.find(item => item.id === id)).find(item => item.price <= actor.cash);
      if (weapon) buyEquipment(view, actor.id, weapon.id);
    }
    for (const gear of ['armor', 'smoke', 'grenade', 'flashbang']) buyEquipment(view, actor.id, gear);
  }
  for (const actor of view.actors) {
    const original = originals.find(item => item.id === actor.id);
    for (const key of ['cash', 'weaponId', 'ammo', 'weaponPurchaseCost', 'armor', 'throwables']) original[key] = actor[key];
  }
}
function play(seed, map, side, choice, { recruit = false, boost = 0, novice = false, adaptive = false, engine = false, profile = null, purchase = 'mixed' } = {}) {
  if (opponentVariant === 'relay-b-cover' && map.id === 'relay') {
    map = { ...map, tactics: { ...map.tactics, defenseTasks: map.tactics.defenseTasks.map(task => {
      if (task.site !== 'B') return task;
      if (task.role === 'front') return { ...task, standard: [19, 10], forward: [19, 10],
        fallback: [20, 12], forwardFallback: [20, 12] };
      if (task.role === 'anchor') return { ...task, standard: [19, 9], forward: [17, 9] };
      return task;
    }) } };
  }
  const { home, away, recruitment } = teams(seed, recruit, boost);
  const switchAfterLosses = OPPONENT_STRATEGY.switchAfterLosses[away.leagueId] ?? OPPONENT_STRATEGY.switchAfterLosses.pc;
  const useTactics = profile ? ['tactics', 'combined'].includes(profile) : !novice;
  const useSite = profile ? ['site', 'combined'].includes(profile) : !novice;
  const useUtility = profile ? ['utility', 'combined'].includes(profile) : !novice;
  const state = createPractice(map, home, away, { match: true, seed, attackTeam: side, siteName: useSite ? choice.site : 'A',
    attackPlans: { home: useTactics ? choice.attack : 'execute', away: prior[map.id].attack },
    defensePlans: { home: useTactics ? choice.defense : 'standard', away: prior[map.id].defense }, aiTeams: engine ? ['away'] : [] });
  // Candidate evaluation only: retain the same engine loss-based switching afterwards.
  if (['attack-alternative', 'defense-alternative'].includes(opponentVariant)) {
    if (opponentVariant === 'attack-alternative') state.attackPlans.away = state.attackPlans.away === 'execute' ? 'split' : 'execute';
    else state.defensePlans.away = state.defensePlans.away === 'standard' ? 'forward' : 'standard';
    assignAttackTasks(state, map, 'away'); assignDefenseTasks(state, map, 'away');
    prepareRound(state, map);
  }
  const opponentInitial = { attack: state.attackPlans.away, defense: state.defensePlans.away };
  const losses = { attack: 0, defense: 0 };
  const homeLosses = { attack: 0, defense: 0 };
  const homeChanges = [];
  let homeSite = choice.site;
  const detail = [];
  let switches = 0;
  for (let round = 0; round < 120 && !state.match.complete; round++) {
    const homeRole = state.round.attackTeam === 'home' ? 'attack' : 'defense';
    if (profile === 'combined' && homeManagement === 'reactive' && homeLosses[homeRole] >= 2) {
      // Only the manager's own completed-round losses trigger a legal buy-phase edit.
      // Never inspect enemy plans, positions, or this match's future results.
      if (homeRole === 'attack') {
        const from = state.attackPlans.home;
        const to = from === 'execute' ? 'split' : 'execute';
        assert.equal(setAttackPlan(state, map, to), true);
        const previousSite = homeSite;
        homeSite = map.sites.find(site => site.name !== homeSite).name;
        homeChanges.push({ round: round + 1, role: homeRole, from, to, previousSite, site: homeSite });
      } else {
        const from = state.defensePlans.home;
        const to = from === 'standard' ? 'forward' : 'standard';
        assert.equal(setDefensePlan(state, map, to), true);
        homeChanges.push({ round: round + 1, role: homeRole, from, to });
      }
      homeLosses[homeRole] = 0;
    }
    // 실제 화면처럼 내 공격 때만 목표를 선택한다. 상대 공격은 공통 A로 고정한다.
    // 과거 비교는 생성 시 사이트가 양 진영에 유지되므로 진단 모드에서만 보정한다.
    if (profile) {
      const site = state.round.attackTeam === 'home' && useSite ? homeSite : 'A';
      if (state.round.initialSiteName !== site) setupRound(state, map, state.round.attackTeam, site);
    }
    const role = state.round.attackTeam === 'away' ? 'attack' : 'defense';
    if (adaptive && !engine && losses[role] >= switchAfterLosses) {
      if (role === 'attack') state.attackPlans.away = state.attackPlans.away === 'execute' ? 'split' : 'execute';
      else state.defensePlans.away = state.defensePlans.away === 'standard' ? 'forward' : 'standard';
      losses[role] = 0; switches++;
      assignAttackTasks(state, map, 'away'); assignDefenseTasks(state, map, 'away'); prepareRound(state, map);
    }
    for (const actor of state.actors.filter(a => a.team === 'home')) {
      // Diagnostic contrast only: a managed profile can save for rifle + armor
      // instead of spending loss income on utility while the rifle purchase fails.
      if (homePurchasePolicy === 'reserve' && profile === 'combined' && actor.weaponId === 'basic-pistol'
        && actor.cash < WEAPONS.find(weapon => weapon.id === 'training-rifle').price + BODY_ARMOR.price) continue;
      buyEquipment(state, actor.id, !profile && novice && noviceGear === 'bare' ? 'smg' : 'training-rifle');
      if (profile || (novice && noviceGear === 'armor') || !novice) buyEquipment(state, actor.id, 'armor');
      if (useUtility) for (const gear of ['smoke', 'grenade', 'flashbang']) buyEquipment(state, actor.id, gear);
    }
    if (purchase === 'rifle-first') purchaseOpponentRifles(state);
    startEconomyRound(state);
    const gear = profile ? state.actors.map(actor => ({ team: actor.team, id: actor.id, weapon: actor.weaponId,
      armor: actor.armor, cash: actor.cash, utility: { ...actor.throwables } })) : null;
    advancePractice(state, map, 160000);
    assert.equal(state.complete, true);
    if (profile) detail.push({ round: state.economy.roundNumber, attackTeam: state.round.attackTeam,
      site: state.round.initialSiteName, attackPlans: { ...state.attackPlans }, defensePlans: { ...state.defensePlans },
      winner: state.round.winner, reason: state.endReason, gear,
      thrown: state.events.filter(event => event.type === 'utility-thrown'),
      actors: state.actors.map(actor => ({ id: actor.id, team: actor.team, alive: actor.alive, ...actor.stats })) });
    losses[role] = state.round.winner === 'away' ? 0 : losses[role] + 1;
    homeLosses[homeRole] = state.round.winner === 'home' ? 0 : homeLosses[homeRole] + 1;
    if (!state.match.complete) assert.equal(nextEconomyRound(state, map), true);
  }
  assert.equal(state.match.complete, true);
  return { seed, map: map.id, side, choice, recruit, recruitment, boost, statRange, novice, noviceGear, adaptive, engine, purchase, opponentVariant, opponentInitial, homePurchasePolicy, homeManagement, homeChanges,
    switches: state.opponentStrategy?.changes.length ?? switches, switchAfterLosses,
    winner: state.match.winner, score: state.match.score, rounds: state.match.history.length,
    homeAverage: mean(home.lineupIds.map(id => strength(home.players.find(p => p.id === id)))), awayAverage: mean(away.players.map(strength)),
    ...(profile ? { profile, detail, changes: state.opponentStrategy.changes } : {}) };
}
const rows = [];
const unavailableRecruitments = [];
const eligibleRecruitSeeds = new Set(seeds);
if (recruitmentPolicy === 'dominant' && recruitmentModes.includes(true)) for (const seed of seeds) {
  try { teams(seed, true); }
  catch (error) {
    if (error.code !== 'NO_DOMINANT_RECRUIT') throw error;
    eligibleRecruitSeeds.delete(seed);
    unavailableRecruitments.push({ seed, reason: error.message });
  }
}
function save(name) {
  const file = `${root}/opponent-${name}.json`;
  fs.writeFileSync(`${file}.tmp`, JSON.stringify({ seeds, boosts, statRange, noviceGear, prior, unavailableRecruitments, rows }, null, 2) + '\n', 'utf8');
  fs.renameSync(`${file}.tmp`, file);
}
function summary(selected) {
  const wins = selected.filter(r => r.winner === 'home');
  return { matches: selected.length, wins: wins.length, averageMargin: mean(selected.map(r => r.score.home - r.score.away)),
    winningMargin: wins.length ? mean(wins.map(r => r.score.home - r.score.away)) : null,
    switches: selected.reduce((n, r) => n + r.switches, 0) };
}
if (mode === 'purchase-check') {
  const { home, away } = teams(1);
  let checks = 0;
  for (const cash of [800, 1400, 1500, 2000, 2700, 3350, 4150, 16000]) for (const held of ['basic-pistol', 'smg', 'sniper']) {
    const state = createPractice(PRACTICE_MAPS[0], home, away, { match: true });
    const actors = state.actors.filter(actor => actor.team === 'away');
    for (const actor of actors) Object.assign(actor, { cash, weaponId: held, weaponPurchaseCost: 0 });
    const beforeHome = structuredClone(state.actors.filter(actor => actor.team === 'home'));
    purchaseOpponentRifles(state);
    const after = structuredClone(actors);
    for (const actor of after) actor.weaponPurchaseCost = 0;
    const ledger = structuredClone(state.economy.ledger);
    // 자동 구매가 다시 실행되어도 상대에게 중복 지출이 없어야 한다.
    startEconomyRound(state);
    assert.deepEqual(actors, after);
    assert.deepEqual(state.economy.ledger, ledger);
    assert.deepEqual(state.actors.filter(actor => actor.team === 'home'), beforeHome);
    for (const actor of actors) {
      const expected = held !== 'basic-pistol' ? held : cash >= 2700 ? 'training-rifle' : cash >= 1500 ? 'smg' : 'basic-pistol';
      assert.equal(actor.weaponId, expected);
      assert.equal(actor.team, 'away');
      assert.equal(actor.cash, cash + ledger.filter(row => row.actorId === actor.id).reduce((sum, row) => sum + row.amount, 0));
      assert.ok(actor.cash >= 0);
    }
    checks++;
  }
  console.log(JSON.stringify({ purchaseChecks: checks }));
} else if (mode === 'diagnose-purchase-choice-pilot') {
  for (const map of activeMaps) for (const recruit of recruitmentModes) {
    for (const choice of choices) for (const seed of seeds.filter(seed => !recruit || eligibleRecruitSeeds.has(seed))) for (const side of ['home', 'away']) {
      rows.push(play(seed, map, side, choice, { recruit, boost: boosts[0], engine: true, profile: 'combined', purchase: purchasePolicies[0] }));
      save(mode);
    }
    console.log(JSON.stringify({ mode, map: map.id, recruit, choices: choices.map(choice => ({ choice,
      ...summary(rows.filter(r => r.map === map.id && r.recruit === recruit && JSON.stringify(r.choice) === JSON.stringify(choice))) })) }));
  }
} else if (mode === 'pilot') {
  for (const map of activeMaps) {
    for (const choice of choices) for (const seed of seeds) for (const side of ['home', 'away']) rows.push(play(seed, map, side, choice));
    save('pilot');
    console.log(JSON.stringify({ mode, map: map.id, choices: choices.map(choice => ({ choice,
      ...summary(rows.filter(r => r.map === map.id && JSON.stringify(r.choice) === JSON.stringify(choice))) })) }));
  }
} else {
  const pilot = JSON.parse(fs.readFileSync('work-logs/2026-11-10/opponent-pilot.json', 'utf8'));
  const selected = Object.fromEntries(PRACTICE_MAPS.map(map => [map.id, choices.map(choice => ({ choice,
    ...summary(pilot.rows.filter(r => r.map === map.id && JSON.stringify(r.choice) === JSON.stringify(choice))) }))
    .sort((a, b) => b.wins - a.wins || b.averageMargin - a.averageMargin)[0].choice]));
  const selectedProfiles = process.argv[10] && process.argv[10] !== '-' ? JSON.parse(fs.readFileSync(process.argv[10], 'utf8')).selected : null;
  function choiceFor(mapId, recruit) {
    const choice = selectedProfiles ? selectedProfiles[recruit ? 'recruited' : 'initial'][mapId] : selected[mapId];
    assert.ok(choices.some(candidate => JSON.stringify(candidate) === JSON.stringify(choice)), '진단 프로필의 전술/사이트 조합이 올바르지 않습니다.');
    return choice;
  }
  if (mode.startsWith('diagnose-purchase')) {
    for (const boost of boosts) for (const purchase of purchasePolicies) for (const recruit of recruitmentModes) for (const profile of ['fixed', 'combined']) {
      const before = rows.length;
      for (const seed of seeds.filter(seed => !recruit || eligibleRecruitSeeds.has(seed))) for (const map of activeMaps) for (const side of ['home', 'away']) {
        rows.push(play(seed, map, side, choiceFor(map.id, recruit), { boost, recruit, engine: true, profile, purchase }));
        save(mode);
      }
      console.log(JSON.stringify({ mode, boost, purchase, recruit, profile, ...summary(rows.slice(before)) }));
    }
  } else if (mode === 'diagnose' || mode === 'diagnose-boost') {
    const profiles = mode === 'diagnose' ? ['fixed', 'utility', 'tactics', 'site', 'combined'] : ['fixed', 'combined'];
    for (const boost of boosts) for (const recruit of recruitmentModes) for (const profile of profiles) {
      const before = rows.length;
      for (const seed of seeds.filter(seed => !recruit || eligibleRecruitSeeds.has(seed))) for (const map of activeMaps) for (const side of ['home', 'away']) {
        rows.push(play(seed, map, side, selected[map.id], { boost, recruit, engine: true, profile }));
        save(mode);
      }
      console.log(JSON.stringify({ mode, boost, recruit, profile, selected, ...summary(rows.slice(before)) }));
    }
  } else for (const boost of boosts) {
    for (const recruit of recruitmentModes) for (const novice of [true, false]) {
      const before = rows.length;
      for (const seed of seeds.filter(seed => !recruit || eligibleRecruitSeeds.has(seed))) for (const map of activeMaps) for (const side of ['home', 'away']) rows.push(play(seed, map, side, selected[map.id], { boost, recruit, novice, adaptive: true, engine: mode.startsWith('validate') }));
      save(mode);
      console.log(JSON.stringify({ mode, boost, recruit, novice, selected, ...summary(rows.slice(before)) }));
    }
  }
}

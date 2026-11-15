import assert from 'node:assert/strict';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { getClubView } from '../src/game/world-selectors.js';
import { PRACTICE_MAPS } from '../src/data/maps/index.js';
import { createPractice, advancePractice } from '../src/simulation/practice.js';
import { buyRifle, startEconomyRound, nextEconomyRound } from '../src/simulation/economy.js';

const worldSeed = Number(process.argv[2] ?? 42);
const world = createWorld(createClub('원인 조사').club, worldSeed);
const home = getClubView(world);
const opponent = world.clubs.find(club => club.leagueId === home.leagueId && club.id !== home.id);
const away = getClubView(world, opponent.id);
const average = players => Object.fromEntries(['aim', 'intelligence'].map(key =>
  [key, players.reduce((sum, player) => sum + player[key], 0) / players.length]));

function run(map, attackTeam, homeBuys, seed = worldSeed, equalStats = false) {
  const clubs = structuredClone([home, away]);
  if (equalStats) for (const club of clubs) for (const player of club.players) Object.assign(player, { aim: 45, intelligence: 45 });
  const state = createPractice(map, ...clubs, { match: true, seed, attackTeam, siteName: 'A',
    attackPlans: { home: 'execute', away: 'execute' }, defensePlans: { home: 'standard', away: 'standard' } });
  let rifleRounds = { home: 0, away: 0 };
  for (let round = 0; round < 100 && !state.match.complete; round++) {
    if (homeBuys) for (const actor of state.actors.filter(a => a.team === 'home')) buyRifle(state, actor.id);
    startEconomyRound(state);
    for (const team of ['home', 'away']) rifleRounds[team] += state.actors.filter(a => a.team === team && a.weaponId === 'training-rifle').length;
    advancePractice(state, map, 160000);
    assert.equal(state.complete, true);
    if (!state.match.complete) nextEconomyRound(state, map);
  }
  assert.equal(state.match.complete, true, '조사 경기가 100라운드 안에 종료해야 한다.');
  return { map: map.id, firstSide: attackTeam === 'home' ? 'attack' : 'defense', homeBuys, seed, equalStats,
    score: `${state.match.score.home}:${state.match.score.away}`, winner: state.match.winner,
    riflePlayerRounds: rifleRounds, history: state.match.history, stats: state.match.playerStats };
}

const results = [];
for (const map of PRACTICE_MAPS) for (const side of ['home', 'away']) for (const buying of [false, true]) results.push(run(map, side, buying));
const research = PRACTICE_MAPS.find(map => map.id === 'research');
const replay = run(research, 'home', false);
assert.deepEqual(replay, results.find(row => row.map === 'research' && row.firstSide === 'attack' && !row.homeBuys));
for (const seed of [1, 2, 3]) for (const side of ['home', 'away']) for (const buying of [false, true]) results.push(run(research, side, buying, seed));
for (const map of PRACTICE_MAPS) for (const side of ['home', 'away']) results.push(run(map, side, true, worldSeed, true));
console.log(JSON.stringify({ worldSeed, home: { name: home.name, average: average(home.players) },
  away: { id: away.id, name: away.name, average: average(away.players) }, identicalReplay: true,
  matchesRun: results.length + 1, results: results.map(({ history, stats, ...row }) => row) }, null, 2));

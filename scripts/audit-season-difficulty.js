import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { LEAGUES } from '../src/config/world.js';
import { OPPONENT_STRATEGY } from '../src/config/opponent-strategy.js';
import { PRACTICE_MAPS } from '../src/data/maps/index.js';
import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { getClubView } from '../src/game/world-selectors.js';
import { createPractice, advancePractice } from '../src/simulation/practice.js';
import { startEconomyRound, nextEconomyRound } from '../src/simulation/economy.js';
const root = 'work-logs/2026-11-13';
const seeds = [73, 101];
const output = `${root}/season-difficulty`;
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const avg = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
if (process.argv[2] === 'run') {
  fs.mkdirSync(output, { recursive: true });
  assert.ok(!fs.existsSync(`${output}/freeze.json`), 'This fixed batch already exists; do not silently rerun.');
  const productionFiles = Object.keys(read(`${root}/../2026-11-12/final-behavior-summary.json`).productionAfter);
  const expected = LEAGUES.flatMap(league => seeds.flatMap(seed => PRACTICE_MAPS.flatMap(map => ['home', 'away'].map(side => ({ league: league.id, seed, map: map.id, side })))));
  fs.writeFileSync(`${output}/freeze.json`, JSON.stringify({ seeds, expected, leagues: LEAGUES,
    thresholds: OPPONENT_STRATEGY.switchAfterLosses,
    sha256: Object.fromEntries([...productionFiles, 'scripts/audit-season-difficulty.js'].map(file => [file, hash(file)])) }, null, 2) + '\n');
  let next = 0;
  async function worker() {
    while (next < LEAGUES.length) {
      const league = LEAGUES[next++];
      await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['scripts/audit-season-difficulty.js', 'league', league.id], { stdio: 'inherit', windowsHide: true });
        child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${league.id} exit ${code}`)));
      });
    }
  }
  await Promise.all([worker(), worker()]);
} else if (process.argv[2] === 'league') {
  const league = LEAGUES.find(item => item.id === process.argv[3]); assert.ok(league);
  const rows = [];
  for (const seed of seeds) {
    const world = createWorld(createClub('DifficultyAudit').club, seed);
    const original = JSON.stringify(world);
    for (const club of world.clubs.filter(club => club.id !== world.playerClubId && club.leagueId === league.id)) {
      for (const player of getClubView(world, club.id).players) for (const key of ['aim', 'intelligence', 'stamina']) assert.ok(player[key] >= league.min && player[key] <= league.max);
    }
    const opponent = world.clubs.find(club => club.leagueId === league.id && club.id !== world.playerClubId);
    const home = getClubView(world), away = getClubView(world, opponent.id);
    for (const map of PRACTICE_MAPS) for (const side of ['home', 'away']) {
      const state = createPractice(map, home, away, { match: true, seed, attackTeam: side, siteName: 'A', aiTeams: ['away'],
        attackPlans: { home: 'execute', away: 'execute' }, defensePlans: { home: 'standard', away: 'standard' } });
      assert.equal(state.opponentStrategy.teams.away.switchAfterLosses, OPPONENT_STRATEGY.switchAfterLosses[league.id]);
      const actualStats = state.actors.map(actor => ({ id: actor.id, aim: actor.aim, intelligence: actor.intelligence, stamina: actor.stamina }));
      const detail = [];
      for (let i = 0; i < 120 && !state.match.complete; i++) {
        const plans = { attack: state.attackPlans.away, defense: state.defensePlans.away };
        assert.equal(startEconomyRound(state, { autoHome: true }), true);
        const gear = state.actors.map(actor => ({ id: actor.id, cash: actor.cash, weapon: actor.weaponId }));
        advancePractice(state, map, 160000); assert.equal(state.complete, true);
        detail.push({ round: state.economy.roundNumber, attackTeam: state.round.attackTeam,
          winner: state.round.winner, reason: state.endReason, plans, gear });
        if (!state.match.complete) assert.equal(nextEconomyRound(state, map), true);
      }
      assert.equal(state.match.complete, true); assert.equal(JSON.stringify(world), original);
      assert.deepEqual(state.actors.map(actor => ({ id: actor.id, aim: actor.aim, intelligence: actor.intelligence, stamina: actor.stamina })), actualStats);
      rows.push({ league: league.id, seed, map: map.id, side, winner: state.match.winner, score: state.match.score,
        rounds: detail.length, actualStats, homeAverage: avg(home.players.flatMap(player => [player.aim, player.intelligence, player.stamina])),
        awayAverage: avg(away.players.flatMap(player => [player.aim, player.intelligence, player.stamina])), changes: state.opponentStrategy.changes, detail });
      fs.writeFileSync(`${output}/${league.id}.json`, JSON.stringify({ rows }, null, 2) + '\n');
    }
  }
  console.log(JSON.stringify({ league: league.id, matches: rows.length, wins: rows.filter(row => row.winner === 'home').length, rounds: rows.reduce((n, row) => n + row.rounds, 0) }));
} else if (process.argv[2] === 'summarize') {
  const spec = read(`${output}/freeze.json`);
  for (const [file, value] of Object.entries(spec.sha256)) assert.equal(hash(file), value, file);
  const rows = LEAGUES.flatMap(league => read(`${output}/${league.id}.json`).rows);
  const key = row => [row.league, row.seed, row.map, row.side].join(':');
  assert.equal(rows.length, 60); assert.equal(new Set(rows.map(key)).size, 60);
  assert.deepEqual(rows.map(key).sort(), spec.expected.map(key).sort());
  let changesChecked = 0;
  for (const row of rows) {
    assert.equal(row.rounds, row.score.home + row.score.away);
    assert.equal(row.score.home, row.detail.filter(round => round.winner === 'home').length);
    assert.equal(row.winner, row.score.home > row.score.away ? 'home' : 'away');
    const win = Math.max(row.score.home, row.score.away), loss = Math.min(row.score.home, row.score.away);
    assert.ok(win === 13 && loss <= 11 || win >= 16 && (win - 16) % 3 === 0 && win - loss >= 2 && win - loss <= 4);
    const streak = { attack: 0, defense: 0 }, plan = { ...OPPONENT_STRATEGY.maps[row.map] };
    let expectedChanges = 0;
    for (let i = 0; i < row.detail.length; i++) {
      const round = row.detail[i]; assert.equal(round.round, i + 1);
      const role = round.attackTeam === 'away' ? 'attack' : 'defense';
      if (i && streak[role] >= OPPONENT_STRATEGY.switchAfterLosses[row.league]) {
        const from = plan[role];
        plan[role] = role === 'attack' ? from === 'execute' ? 'split' : 'execute' : from === 'standard' ? 'forward' : 'standard';
        const change = row.changes[expectedChanges++];
        assert.deepEqual(change, { roundNumber: i + 1, team: 'away', role, from, to: plan[role] });
        streak[role] = 0; changesChecked++;
      }
      assert.deepEqual(round.plans, plan);
      streak[role] = round.winner === 'away' ? 0 : streak[role] + 1;
      for (const gear of round.gear) assert.ok(gear.cash >= 0 && gear.cash <= 16000);
    }
    assert.equal(expectedChanges, row.changes.length);
  }
  const groups = LEAGUES.map(league => {
    const subset = rows.filter(row => row.league === league.id);
    return { league: league.id, name: league.name, range: [league.min, league.max], threshold: OPPONENT_STRATEGY.switchAfterLosses[league.id],
      matches: subset.length, wins: subset.filter(row => row.winner === 'home').length,
      rounds: subset.reduce((n, row) => n + row.rounds, 0), homeAverage: subset[0].homeAverage,
      awayAverage: avg(subset.map(row => row.awayAverage)), maps: PRACTICE_MAPS.map(map => ({ map: map.id, wins: subset.filter(row => row.map === map.id && row.winner === 'home').length, matches: 4 })) };
  });
  const result = { groups, matches: rows.length, rounds: rows.reduce((n, row) => n + row.rounds, 0), changesChecked,
    frozenFiles: Object.keys(spec.sha256).length, inputWorldsUnchanged: true, actualActorStatsUnchanged: true,
    numericWinTargetRequired: false, upperLeagueSeasonImplemented: false,
    note: 'Fixed initial home roster, two known worlds and one AI opponent per league/world. Engine-only audit, not full-season or population win-rate evidence.' };
  fs.writeFileSync(`${output}/summary.json`, JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify(result, null, 2));
} else throw new Error('Use run, league <id>, or summarize.');

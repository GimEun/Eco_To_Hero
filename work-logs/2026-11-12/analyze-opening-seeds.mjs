import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { createClub } from '../../src/game/create-club.js';
import { createWorld } from '../../src/game/create-world.js';
import { getClubView } from '../../src/game/world-selectors.js';
import { effectiveStats } from '../../src/game/happiness.js';
const root = 'work-logs/2026-11-12';
const read = file => JSON.parse(fs.readFileSync(`${root}/${file}`, 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const spec = read('site-stability-freeze.json');
for (const [file, value] of Object.entries(spec.sha256)) assert.equal(hash(file), value, file);
const inputFiles = spec.maps.flatMap(map => [`${root}/independent-reactive48-${map}/opponent-diagnose-purchase-independent-reactive48.json`, `${root}/site-stability-${map}/opponent-diagnose-purchase-site-stability.json`]);
const inputHashes = Object.fromEntries(inputFiles.map(file => [file, hash(file)]));
const rows = spec.maps.flatMap(map => [
  ...read(`independent-reactive48-${map}/opponent-diagnose-purchase-independent-reactive48.json`).rows.filter(row => !row.recruit).map(row => ({ policy: row.profile === 'fixed' ? 'fixed' : 'both', row })),
  ...read(`site-stability-${map}/opponent-diagnose-purchase-site-stability.json`).rows.map(row => ({ policy: 'site', row }))
]);
assert.equal(rows.length, 108);
const mean = xs => xs.length ? xs.reduce((sum, n) => sum + n, 0) / xs.length : null;
const skills = ['aim', 'intelligence', 'stamina'];
const strength = player => mean(skills.map(skill => player[skill]));
const lineup = club => club.lineupIds.map(id => club.players.find(player => player.id === id));
const averages = players => Object.fromEntries(skills.map(skill => [skill, mean(players.map(player => player[skill]))]));
const rosters = spec.seeds.map(seed => {
  const world = createWorld(createClub('Calibration').club, seed);
  const own = world.clubs.find(club => club.id === world.playerClubId);
  const home = getClubView(world), away = structuredClone(getClubView(world, world.clubs.find(club => club.leagueId === 'pc' && club.id !== own.id).id));
  for (const player of away.players) for (const skill of skills) player[skill] = 48 + Math.round((player[skill] - 30) * 6 / 24);
  const ownPlayers = lineup(home), opponentPlayers = lineup(away);
  for (const { row } of rows.filter(entry => entry.row.seed === seed)) {
    assert.equal(row.homeAverage, mean(ownPlayers.map(strength)));
    assert.equal(row.awayAverage, mean(away.players.map(strength)));
  }
  const project = players => players.map((player, index) => ({ slot: index + 1, id: player.id,
    raw: Object.fromEntries(skills.map(skill => [skill, player[skill]])), effective: effectiveStats(player) }));
  return { seed, home: project(ownPlayers), away: project(opponentPlayers), homeAverages: averages(ownPlayers), awayAverages: averages(opponentPlayers),
    siteWins: rows.filter(entry => entry.policy === 'site' && entry.row.seed === seed && entry.row.winner === 'home').length };
});
for (const roster of rosters) assert.deepEqual(roster.home.map(player => player.raw), rosters[0].home.map(player => player.raw));
function metrics(rounds) {
  const gear = rounds.flatMap(round => round.gear.filter(actor => actor.team === 'home'));
  const actors = rounds.flatMap(round => round.actors.filter(actor => actor.team === 'home'));
  const shots = actors.reduce((sum, actor) => sum + actor.shots, 0), hits = actors.reduce((sum, actor) => sum + actor.hits, 0);
  return { rounds: rounds.length, wins: rounds.filter(round => round.winner === 'home').length,
    winRate: rounds.length ? rounds.filter(round => round.winner === 'home').length / rounds.length : null,
    rifleShare: gear.length ? gear.filter(actor => actor.weapon === 'training-rifle').length / gear.length : null,
    meanCashAfterBuying: mean(gear.map(actor => actor.cash)), accuracy: shots ? hits / shots : null,
    shotsPerPlayerRound: actors.length ? shots / actors.length : null,
    damagePerPlayerRound: actors.length ? actors.reduce((sum, actor) => sum + actor.damage, 0) / actors.length : null,
    zeroShotPlayerRounds: actors.filter(actor => actor.shots === 0).length,
    defusedEndings: rounds.filter(round => round.reason === 'defused').length };
}
function selectedRounds(row, window) {
  const first = row.homeChanges[0]?.round ?? Infinity;
  return row.detail.filter(round => window === 'round1' ? round.round === 1
    : window === 'rounds1to3' ? round.round <= 3
      : window === 'rounds13to15' ? round.round >= 13 && round.round <= 15
        : window === 'beforeAnyOwnChange' ? round.round < first
          : window === 'afterAnyOwnChange' ? round.round >= first : false);
}
const windows = ['round1', 'rounds1to3', 'rounds13to15', 'beforeAnyOwnChange', 'afterAnyOwnChange'];
const byMap = spec.maps.map(map => ({ map, policies: ['fixed', 'both', 'site'].map(policy => {
  const samples = rows.filter(entry => entry.policy === policy && entry.row.map === map).map(entry => entry.row);
  return { policy, matches: samples.length, wins: samples.filter(row => row.winner === 'home').length,
    windows: windows.map(window => ({ window, contributingMatches: samples.filter(row => selectedRounds(row, window).length).length,
      roles: ['attack', 'defense'].map(role => ({ role, ...metrics(samples.flatMap(row => selectedRounds(row, window).filter(round => (round.attackTeam === 'home') === (role === 'attack')))) })) })) };
}) }));
let identicalOpeningGears = 0, identicalBothSiteOpeningRounds = 0;
for (const { policy, row } of rows.filter(entry => entry.policy === 'site')) {
  assert.equal(policy, 'site');
  const comparable = rows.filter(entry => entry.row.seed === row.seed && entry.row.map === row.map && entry.row.side === row.side);
  const fixed = comparable.find(entry => entry.policy === 'fixed').row;
  const both = comparable.find(entry => entry.policy === 'both').row;
  assert.deepEqual(row.detail[0].gear, fixed.detail[0].gear); identicalOpeningGears++;
  assert.deepEqual(row.detail[0], both.detail[0]); identicalBothSiteOpeningRounds++;
}
const researchOpeningPairs = spec.seeds.map(seed => {
  const samples = rows.filter(entry => entry.row.seed === seed && entry.row.map === 'research' && entry.row.side === 'home');
  const fixed = samples.find(entry => entry.policy === 'fixed').row.detail[0];
  const site = samples.find(entry => entry.policy === 'site').row.detail[0];
  assert.equal(fixed.site, 'A'); assert.equal(site.site, 'A');
  assert.equal(fixed.attackPlans.home, 'execute'); assert.equal(site.attackPlans.home, 'split');
  assert.deepEqual(fixed.gear, site.gear); assert.deepEqual(fixed.thrown, []); assert.deepEqual(site.thrown, []);
  for (const actor of site.gear) {
    assert.equal(actor.weapon, 'basic-pistol'); assert.equal(actor.armor, 100);
    assert.ok(Object.values(actor.utility).every(n => n === 0));
  }
  return { seed, fixedWinner: fixed.winner, siteWinner: site.winner, fixedReason: fixed.reason, siteReason: site.reason };
});
for (const [file, value] of Object.entries(inputHashes)) assert.equal(hash(file), value, file);
const production = read('risk-source-hashes.json');
for (const [file, value] of Object.entries(production)) assert.equal(hash(file), value, file);
const diagnostic = fs.readFileSync('scripts/calibrate-opponent-strategy.js', 'utf8');
assert.ok(diagnostic.includes("createWorld(createClub('Calibration').club, seed)"));
assert.ok(diagnostic.includes('createPractice(map, home, away, { match: true, seed,'));
const result = { rosters, byMap, researchOpeningPairs, identicalOpeningGears, identicalBothSiteOpeningRounds,
  inputHashes, unchangedProductionFiles: Object.keys(production).length, matchesAnalyzed: 108, newMatchesRun: 0, gameChangesApplied: false,
  facts: { ownRawSkillsInvariantAcrossSeeds: true, worldAndMatchUseSameSeed: true },
  limitations: ['World roster and match random stream are coupled by the shared seed; causal effects cannot be separated.',
    'Equal opening gear does not equal tactics/site/positions. First three rounds already include economy feedback.',
    'Rounds 13-15 exclude games already completed; before/after changes are loss-triggered selected windows.',
    'No stored first-contact/death/plant timing; raw player stat differences are not isolated interventions.'] };
fs.writeFileSync(`${root}/opening-seed-analysis.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ rosters: rosters.map(({ home, away, ...roster }) => roster), byMap: byMap.map(map => ({ map: map.map,
  policies: map.policies.filter(policy => policy.policy !== 'both').map(policy => ({ policy: policy.policy,
    windows: policy.windows.filter(window => ['round1', 'rounds1to3'].includes(window.window)).map(window => ({ window: window.window,
      roles: window.roles.map(role => ({ role: role.role, wins: role.wins, rounds: role.rounds, rifleShare: role.rifleShare })) })) })) })),
  researchOpeningPairs,
  identicalOpeningGears, identicalBothSiteOpeningRounds, unchangedProductionFiles: result.unchangedProductionFiles, newMatchesRun: 0 }, null, 2));

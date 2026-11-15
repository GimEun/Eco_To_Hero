import { createClub } from '../src/game/create-club.js';
import { createWorld } from '../src/game/create-world.js';
import { getClubView } from '../src/game/world-selectors.js';
import { PRACTICE_MAPS } from '../src/data/maps/index.js';
import { createPractice, advancePractice, stepPractice } from '../src/simulation/practice.js';
import { buyEquipment, startEconomyRound, nextEconomyRound } from '../src/simulation/economy.js';

const seeds = (process.argv[2] ?? '42').split(',').map(Number);
const limit = Number(process.argv[3] ?? 84);
const loadouts = process.argv[4] ? [process.argv[4]] : ['rifle', 'full'];
const equalStats = process.argv[5] === 'equal';
const trackSupport = process.argv[6] === 'track-support';
const results = [];
for (const seed of seeds) {
  const world = createWorld(createClub('연막 조사').club, seed);
  const home = getClubView(world);
  const away = getClubView(world, world.clubs.find(club => club.id !== home.id && club.leagueId === home.leagueId).id);
  if (equalStats) for (const club of [home, away]) for (const player of club.players) Object.assign(player, { aim: 45, intelligence: 45, stamina: 45 });
  for (const map of PRACTICE_MAPS) for (const side of ['home', 'away']) for (const gear of loadouts) {
    const state = createPractice(map, home, away, { match: true, seed, attackTeam: side,
      attackPlans: { home: 'execute', away: 'execute' }, defensePlans: { home: 'standard', away: 'standard' } });
    let attackerWins = 0, timeouts = 0, smokeThrows = 0, smokeRiskResponses = 0, coordinatedEntries = 0, tradeSupportResponses = 0;
    const smokeTimes = new Set();
    let supportEpisodes = 0, supportRounds = 0;
    for (let round = 0; round < limit && !state.match.complete; round++) {
      for (const actor of state.actors.filter(actor => actor.team === 'home')) {
        if (gear === 'matched') {
          if (actor.weaponId === 'basic-pistol') {
            for (const id of [['training-rifle', 'smg', 'shotgun', 'machine-gun', 'sniper'][actor.number - 1], 'training-rifle', 'smg']) {
              if (buyEquipment(state, actor.id, id).ok) break;
            }
          }
        } else buyEquipment(state, actor.id, 'training-rifle');
        if (gear !== 'rifle') for (const id of ['armor', 'smoke', 'grenade', 'flashbang']) buyEquipment(state, actor.id, id);
      }
      startEconomyRound(state);
      if (trackSupport) {
        let previous = new Set(), supported = false;
        for (let tick = 0; tick < 3200 && !state.complete; tick++) {
          stepPractice(state, map);
          const current = new Set(state.actors.filter(actor => actor.alive && actor.intent?.includes('앵커 합류')).map(actor => actor.id));
          for (const id of current) if (!previous.has(id)) supportEpisodes++;
          supported ||= current.size > 0;
          previous = current;
        }
        supportRounds += Number(supported);
      } else advancePractice(state, map, 160000);
      if (!state.complete) throw new Error('라운드 종료 실패');
      attackerWins += Number(state.round.winner === state.round.attackTeam);
      timeouts += Number(state.endReason === 'timeout');
      smokeRiskResponses += state.events.filter(event => event.type === 'smoke-risk-response').length;
      coordinatedEntries += state.events.filter(event => event.type === 'attack-entry').length;
      tradeSupportResponses += state.events.filter(event => event.type === 'trade-support').length;
      for (const event of state.events) if (event.type === 'utility-thrown' && event.kind === 'smoke') { smokeThrows++; smokeTimes.add(event.tick); }
      if (!state.match.complete && round + 1 < limit) nextEconomyRound(state, map);
    }
    results.push({ seed, map: map.id, side, gear, equalStats, score: state.match.score, complete: state.match.complete,
      rounds: state.match.history.length, overtime: state.match.overtime, attackerWins, timeouts, smokeThrows, smokeRiskResponses,
      coordinatedEntries, tradeSupportResponses, distinctSmokeTimes: smokeTimes.size,
      ...(trackSupport ? { supportEpisodes, supportRounds } : {}) });
  }
}
console.log(JSON.stringify({ limit, matches: results.length, completed: results.filter(row => row.complete).length, results }, null, 2));

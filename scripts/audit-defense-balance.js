import { createPractice, advancePractice } from '../src/simulation/practice.js';
import { RELAY_MAP } from '../src/data/maps/relay.js';
import { BASIC_PISTOL, TRAINING_RIFLE } from '../src/data/weapons.js';

const seedCount = Number(process.argv[2] ?? 32);
const startSeed = Number(process.argv[3] ?? 0);
const visionMode = process.argv[4] ?? 'current';
if (!Number.isInteger(seedCount) || seedCount < 1 || !Number.isInteger(startSeed) || startSeed < 0
  || startSeed + seedCount > 0x100000000 || !['current', 'legacy'].includes(visionMode))
  throw new Error('사용법: node scripts/audit-defense-balance.js [시드 개수] [시작 시드] [current|legacy]');
const team = name => ({ name, players: Array.from({ length: 5 }, (_, index) => ({
  id: `${name}-${index}`, name: `${name}-${index}`, nickname: `${name}-${index}`, aim: 50, intelligence: 50,
})) });
const groups = [];
for (const plan of ['standard', 'forward']) for (const siteName of ['A', 'B']) for (const weapon of [BASIC_PISTOL, TRAINING_RIFLE]) {
  let defenseWins = 0;
  const reasons = {};
  for (let seed = startSeed; seed < startSeed + seedCount; seed++) for (const attackTeam of ['home', 'away']) {
    const state = createPractice(RELAY_MAP, team('home'), team('away'), {
      round: true, seed, attackTeam, siteName, defensePlans: { home: plan, away: plan },
    });
    for (const actor of state.actors) {
      actor.weaponId = weapon.id; actor.ammo = weapon.magazineSize;
      if (visionMode === 'legacy') { actor.fieldOfView = Math.PI / 2; actor.viewRange = 200; }
    }
    advancePractice(state, RELAY_MAP, 160000);
    if (!state.complete) throw new Error('종료되지 않은 라운드가 있습니다.');
    defenseWins += Number(state.round.winner !== attackTeam);
    reasons[state.endReason] = (reasons[state.endReason] ?? 0) + 1;
  }
  groups.push({ plan, site: siteName, weapon: weapon.id, defenseWins, rounds: seedCount * 2,
    defenseWinRate: Number((defenseWins / (seedCount * 2) * 100).toFixed(1)), reasons });
}
const wins = groups.reduce((sum, group) => sum + group.defenseWins, 0);
const rounds = groups.reduce((sum, group) => sum + group.rounds, 0);
console.log(JSON.stringify({ conditions: '양 팀 에임/지능 50·동일 무기·매 시드 진영 교환·라운드 경제 제외',
  visionMode, startSeed, seedCount, defenseWins: wins, rounds, defenseWinRate: Number((wins / rounds * 100).toFixed(1)), groups }, null, 2));

import { writeFileSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { createPractice, advancePractice } from '../src/simulation/practice.js';
import { RELAY_MAP } from '../src/data/maps/relay.js';
import { BASIC_PISTOL, TRAINING_RIFLE } from '../src/data/weapons.js';

const seedCount = Number(process.argv[2] ?? 32);
const startSeed = Number(process.argv[3] ?? 128);
if (!Number.isInteger(seedCount) || seedCount < 1 || !Number.isInteger(startSeed) || startSeed < 0
  || startSeed + seedCount > 0x100000000) throw new Error('사용법: node scripts/experiment-defense.js [시드 개수] [시작 시드]');

const visions = [
  { id: 'baseline', degrees: 90, range: 200 },
  { id: 'angle120', degrees: 120, range: 200 },
  { id: 'range260', degrees: 90, range: 260 },
  { id: 'angle120-range260', degrees: 120, range: 260 },
  { id: 'angle180', degrees: 180, range: 200 },
];
const profiles = [
  { id: 'equal50', defense: [50, 50], attack: [50, 50] },
  { id: 'defense-aim70', defense: [70, 50], attack: [50, 50] },
  { id: 'defense-intelligence70', defense: [50, 70], attack: [50, 50] },
  { id: 'defense-both70', defense: [70, 70], attack: [50, 50] },
  { id: 'attack-both70', defense: [50, 50], attack: [70, 70] },
  { id: 'equal30', defense: [30, 30], attack: [30, 30] },
  { id: 'equal70', defense: [70, 70], attack: [70, 70] },
];
const team = (name, [aim, intelligence]) => ({ name, players: Array.from({ length: 5 }, (_, i) => ({
  id: `${name}-${i}`, name: `${name}-${i}`, nickname: `${name}-${i}`, aim, intelligence,
})) });
const groups = [];
const round1 = value => Number(value.toFixed(1));
if (isMainThread) {
  const results = await Promise.all(visions.map(vision => new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), { workerData: vision.id, argv: process.argv.slice(2) });
    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', code => { if (code !== 0) reject(new Error(`실험 프로세스 종료: ${code}`)); });
  })));
  groups.push(...results.flat());
  for (const group of groups) {
    const baseline = groups.find(g => g.vision === 'baseline' && g.profile === group.profile
      && g.plan === group.plan && g.site === group.site && g.weapon === group.weapon);
    for (let index = 0; index < group.outcomes.length; index++) {
      group.versusBaseline.gained += Number(group.outcomes[index] === '1' && baseline.outcomes[index] === '0');
      group.versusBaseline.lost += Number(group.outcomes[index] === '0' && baseline.outcomes[index] === '1');
    }
  }
} else for (const vision of visions.filter(item => item.id === workerData)) for (const profile of profiles) {
  for (const plan of ['standard', 'forward']) for (const siteName of ['A', 'B']) for (const weapon of [BASIC_PISTOL, TRAINING_RIFLE]) {
    const group = { vision: vision.id, profile: profile.id, plan, site: siteName, weapon: weapon.id,
      rounds: 0, defenseWins: 0, attackWins: 0, draws: 0, defenseShots: 0, attackShots: 0,
      defenseZeroShotActors: 0, attackZeroShotActors: 0, defenseFirstShots: 0, attackFirstShots: 0,
      simultaneousFirstShots: 0, noShots: 0, reasons: {}, outcomes: '', versusBaseline: { gained: 0, lost: 0 } };
    for (let seed = startSeed; seed < startSeed + seedCount; seed++) for (const attackTeam of ['home', 'away']) {
      const defenseTeam = attackTeam === 'home' ? 'away' : 'home';
      const state = createPractice(RELAY_MAP,
        team('home', attackTeam === 'home' ? profile.attack : profile.defense),
        team('away', attackTeam === 'away' ? profile.attack : profile.defense),
        { round: true, seed, attackTeam, siteName, defensePlans: { home: plan, away: plan } });
      for (const actor of state.actors) {
        actor.weaponId = weapon.id;
        actor.ammo = weapon.magazineSize;
        if (actor.team === defenseTeam) {
          actor.fieldOfView = vision.degrees * Math.PI / 180;
          actor.viewRange = vision.range;
        }
      }
      advancePractice(state, RELAY_MAP, 160000);
      if (!state.complete) throw new Error('종료되지 않은 라운드');
      group.rounds++;
      const won = state.round.winner === defenseTeam;
      group.defenseWins += Number(won);
      group.attackWins += Number(state.round.winner === attackTeam);
      group.draws += Number(!state.round.winner);
      group.reasons[state.endReason] = (group.reasons[state.endReason] ?? 0) + 1;
      for (const actor of state.actors) {
        const side = actor.team === defenseTeam ? 'defense' : 'attack';
        group[`${side}Shots`] += actor.stats.shots;
        group[`${side}ZeroShotActors`] += Number(actor.stats.shots === 0);
      }
      const shots = state.events.filter(event => event.type === 'shot');
      if (!shots.length) group.noShots++;
      else {
        const teams = new Set(shots.filter(event => event.tick === shots[0].tick)
          .map(event => state.actors.find(actor => actor.id === event.actorId).team));
        if (teams.size === 2) group.simultaneousFirstShots++;
        else group[`${teams.has(defenseTeam) ? 'defense' : 'attack'}FirstShots`]++;
      }
      group.outcomes += won ? '1' : '0';
    }
    groups.push(group);
  }
  const selected = groups.filter(g => g.vision === vision.id && g.profile === profile.id);
  const rounds = selected.reduce((sum, g) => sum + g.rounds, 0);
  const wins = selected.reduce((sum, g) => sum + g.defenseWins, 0);
  console.error(`${vision.id} / ${profile.id}: ${wins}/${rounds} (${round1(wins / rounds * 100)}%)`);
}
if (!isMainThread) {
  parentPort.postMessage(groups);
} else {
const totals = { rounds: groups.reduce((sum, g) => sum + g.rounds, 0) };
const report = { conditions: { map: RELAY_MAP.id, seedCount, startSeed, visions, profiles,
  attackVision: { degrees: 90, range: 200 }, plans: ['standard', 'forward'], sites: ['A', 'B'],
  weapons: [BASIC_PISTOL.id, TRAINING_RIFLE.id], swappedAttackTeam: true, economy: false,
  notes: '독립 라운드·팀원 전원 동일 능력·진영 교환은 같은 시드의 쌍이며 독립 표본으로 해석하지 않는다. 사거리·명중·피해·이동 로직은 원본 그대로다.' }, totals, groups };
const output = new URL('../docs/DEFENSE_EXPERIMENT.json', import.meta.url);
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`저장: ${output.pathname} / ${totals.rounds}라운드`);
}

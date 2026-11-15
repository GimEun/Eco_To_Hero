import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { verifyPolicy } from './attack-switch-check.mjs';
const root = 'work-logs/2026-11-12';
const read = file => JSON.parse(fs.readFileSync(`${root}/${file}`, 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const spec = read('defense-range-freeze.json');
for (const [file, value] of Object.entries(spec.sha256)) assert.equal(hash(file), value, file);
const production = read('risk-source-hashes.json');
for (const [file, value] of Object.entries(production)) assert.equal(hash(file), value, file);
const pairs = [], groups = [];
let auditDecisions = 0, lowHpDecisions = 0, pressureDecisions = 0, policyChanges = 0;
const mean = xs => xs.length ? xs.reduce((sum, n) => sum + n, 0) / xs.length : null;
function summary(rows) {
  const wins = rows.filter(row => row.winner === 'home');
  const first = rows.map(row => row.detail[0]);
  const withdrawals = first.flatMap(round => round.retreatObservation.transitions.filter(change => change.team === 'home' && change.withdrawn));
  const unique = rows.flatMap(row => row.detail[0].actors.filter(actor => actor.team === 'home').map(actor => {
    const withdrawal = row.detail[0].retreatObservation.transitions.find(change => change.id === actor.id && change.withdrawn);
    return { id: actor.id, withdrawal };
  }));
  return { matches: rows.length, wins: wins.length, rounds: rows.reduce((sum, row) => sum + row.rounds, 0),
    meanMargin: mean(rows.map(row => row.score.home - row.score.away)),
    openingWins: first.filter(round => round.winner === 'home').length,
    openingHomeWithdrawals: unique.filter(actor => actor.withdrawal).length,
    openingFullHPWithdrawals: unique.filter(actor => actor.withdrawal?.hp === 100).length,
    openingMeanFirstWithdrawTick: mean(unique.filter(actor => actor.withdrawal).map(actor => actor.withdrawal.tick)),
    withdrawalTransitions: withdrawals.length };
}
for (const plan of ['standard', 'forward']) {
  const previous = read(`retreat-observation-${plan}/opponent-diagnose-purchase-retreat-observation.json`).rows;
  const current = read(`defense-range-${plan}/opponent-diagnose-purchase-defense-range.json`).rows;
  assert.equal(current.length, 6);
  assert.deepEqual(current.map(row => row.seed).sort((a, b) => a - b), [...spec.seeds].sort((a, b) => a - b));
  for (const row of current) {
    const before = previous.find(old => old.seed === row.seed); assert.ok(before);
    for (const field of ['map', 'side', 'choice', 'recruit', 'profile', 'diagnosticAttackPolicy', 'homeManagement', 'homePurchasePolicy', 'purchase', 'statRange', 'boost', 'opponentVariant', 'opponentInitial', 'homeAverage', 'awayAverage', 'recruitment', 'switchAfterLosses']) assert.deepEqual(row[field], before[field], field);
    assert.equal(row.diagnosticDefenseRange, 'weapon'); assert.equal(row.side, 'away');
    assert.deepEqual(row.detail[0].gear, before.detail[0].gear);
    policyChanges += verifyPolicy(row, 'site');
    assert.equal(row.rounds, row.detail.length); assert.equal(row.rounds, row.score.home + row.score.away);
    assert.equal(row.score.home, row.detail.filter(round => round.winner === 'home').length);
    assert.equal(row.winner, row.score.home > row.score.away ? 'home' : 'away');
    const win = Math.max(row.score.home, row.score.away), loss = Math.min(row.score.home, row.score.away);
    assert.ok(win === 13 && loss <= 11 || win >= 16 && (win - 16) % 3 === 0 && win - loss >= 2 && win - loss <= 4);
    for (const round of row.detail) {
      for (const decision of round.defenseRangeAudit) {
        auditDecisions++;
        assert.ok(decision.enemies.every(enemy => enemy.distance <= decision.range + 1e-7));
        if (decision.reason === 'low-hp') { lowHpDecisions++; assert.ok(decision.hp <= 45); }
        else {
          pressureDecisions++; assert.equal(decision.reason, 'outnumbered'); assert.ok(decision.hp > 45);
          assert.equal(decision.role, 'front'); assert.equal(decision.plan, 'forward');
          assert.ok(decision.enemies.length >= 2 && decision.enemies.length > decision.support);
        }
      }
      for (const actor of round.gear) assert.ok(actor.cash >= 0 && actor.cash <= 16000);
      for (const [role, metric] of Object.entries(round.movementTrace)) {
        assert.equal(metric.episodes, metric.reached + metric.changed + metric.died + metric.pending);
        if (!role.endsWith(':other')) assert.equal(metric.riskPlans, 0);
      }
    }
    pairs.push({ plan, seed: row.seed, before: before.score, after: row.score,
      improved: before.winner === 'away' && row.winner === 'home', worsened: before.winner === 'home' && row.winner === 'away',
      marginChange: row.score.home - row.score.away - before.score.home + before.score.away });
  }
  groups.push({ plan, before: summary(previous), after: summary(current),
    openingAudit: current.map(row => ({ seed: row.seed, decisions: row.detail[0].defenseRangeAudit })) });
}
const result = { groups, pairs, improvedWinners: pairs.filter(pair => pair.improved).length,
  worsenedWinners: pairs.filter(pair => pair.worsened).length, meanMarginChange: mean(pairs.map(pair => pair.marginChange)),
  auditDecisions, lowHpDecisions, pressureDecisions, policyChanges,
  diagnosticMatches: 12, reusedMatches: 12, frozenFiles: Object.keys(spec.sha256).length, productionFiles: Object.keys(production).length,
  independentValidation: false, gameChangesApplied: false,
  note: 'Shared defensive outnumbering rule changed only in diagnostic load; affects either defending team when conditions apply. Known-world trial, no deployment approval.' };
fs.writeFileSync(`${root}/defense-range-summary.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, pairs: undefined, groups: groups.map(({ openingAudit, ...group }) => group) }, null, 2));

import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root = 'work-logs/2026-11-12';
const read = file => JSON.parse(fs.readFileSync(`${root}/${file}`, 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const spec = read('entry-support-freeze.json');
for (const [file, value] of Object.entries(spec.sha256)) assert.equal(hash(file), value, file);
const production = read('risk-source-hashes.json');
for (const [file, value] of Object.entries(production)) assert.equal(hash(file), value, file);
const observations = [];
let exactReplays = 0;
for (const plan of ['split', 'execute']) {
  const previous = read(`research-opening-${plan}/opponent-diagnose-purchase-research-opening.json`).rows;
  const current = read(`entry-support-${plan}/opponent-diagnose-purchase-entry-support.json`).rows;
  assert.equal(current.length, 3); assert.deepEqual(current.map(row => row.seed).sort((a, b) => a - b), [...spec.seeds].sort((a, b) => a - b));
  for (const row of current) {
    const old = previous.find(other => other.seed === row.seed); assert.ok(old);
    const clean = structuredClone(row); for (const round of clean.detail) delete round.entrySupportObservation;
    assert.deepEqual(clean, old); exactReplays++;
    const round = row.detail[0], observation = round.entrySupportObservation;
    assert.ok(observation); assert.ok(row.detail.slice(1).every(round => round.entrySupportObservation === null));
    const entries = observation.events.filter(event => event.type === 'attack-entry');
    assert.ok(entries.length >= 1);
    const homeEntry = entries.find(event => event.team === 'home'); assert.ok(homeEntry);
    assert.equal(observation.commitment.committedTick, homeEntry.tick);
    assert.equal(observation.commitment.reason, homeEntry.reason);
    observations.push({ plan, seed: row.seed, commitment: observation.commitment,
      supports: Object.entries(observation.supports).map(([id, record]) => ({ id, ...record,
        firstShot: round.researchOpening.events.find(event => event.type === 'shot' && event.actorId === id)?.tick ?? null,
        partnerDeath: round.researchOpening.events.find(event => event.type === 'death' && event.actorId === `home-${Number(id.split('-').at(-1)) - 3}`)?.tick ?? null })),
      events: observation.events });
  }
}
const result = { observations, exactWholeMatchReplays: exactReplays, replayedMatches: 6, newlySampledMatches: 0,
  frozenFiles: Object.keys(spec.sha256).length, productionFiles: Object.keys(production).length, gameChangesApplied: false,
  limitations: ['Pre-combat inspection is after task preparation/movement; current frame and decision call time differ.',
    'Reconstructed trade eligibility reads only observed contacts but does not prove actual assignment; actual objective/events are reported separately.',
    'Cached paths and higher-priority bomb/manual/safety tasks can affect actual movement.'] };
fs.writeFileSync(`${root}/entry-support-summary.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, observations: observations.map(o => ({ plan: o.plan, seed: o.seed,
  commitment: { tick: o.commitment.committedTick, reason: o.commitment.reason, actors: o.commitment.actors },
  supports: o.supports.map(s => ({ id: s.id, statuses: s.statuses,
    firstPartner: s.firstPartnerEligible?.tick ?? null, firstContact: s.firstKnownContact?.tick ?? null,
    firstValid: s.firstValidTradePoint?.tick ?? null, firstTrade: s.firstTradeObjective?.tick ?? null,
    firstShot: s.firstShot, partnerDeath: s.partnerDeath })),
  tradeEvents: o.events.filter(event => event.type === 'trade-support').length })) }, null, 2));

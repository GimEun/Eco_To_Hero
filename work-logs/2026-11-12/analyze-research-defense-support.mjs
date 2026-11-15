import fs from 'node:fs';
import assert from 'node:assert/strict';
const root = 'work-logs/2026-11-12';
const raw = JSON.parse(fs.readFileSync(`${root}/research-defense-opening/opponent-diagnose-purchase-research-defense.json`, 'utf8'));
const rows = raw.rows.map(row => {
  const first = row.detail[0], trace = first.researchDefenseRetreat;
  const snapshots = [...trace.transitions, ...trace.shots.flatMap(shot => [
    { ...shot.actor, tick: shot.event.tick }, { ...shot.target, tick: shot.event.tick }])];
  const earliestRetainedSupport = {};
  for (const snapshot of snapshots) {
    if (snapshot.team !== 'home') continue;
    const kind = snapshot.objective?.replace(/^patrol:/, '').split(':')[0];
    if (!['support', 'contact-support', 'crossfire'].includes(kind)) continue;
    assert.ok(Number.isFinite(snapshot.tick));
    if (!earliestRetainedSupport[snapshot.id] || snapshot.tick < earliestRetainedSupport[snapshot.id].tick) {
      earliestRetainedSupport[snapshot.id] = { tick: snapshot.tick, kind, objective: snapshot.objective };
    }
  }
  return { seed: row.seed, profile: row.profile, earliestRetainedSupport };
});
fs.writeFileSync(`${root}/research-defense-support-snapshots.json`, JSON.stringify({ rows,
  exactCommandIssueTimes: false,
  note: 'Supplement only: original objective observer did not strip patrol prefix. These are earliest retained combat/transition snapshots, not exact support command issue times. No replay rerun or simulation change.' }, null, 2) + '\n');
console.log(JSON.stringify({ snapshotsRecovered: rows.reduce((sum, row) => sum + Object.keys(row.earliestRetainedSupport).length, 0), exactCommandIssueTimes: false }));

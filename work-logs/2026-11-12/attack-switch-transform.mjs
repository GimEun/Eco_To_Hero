import assert from 'node:assert/strict';
export const policies = ['none', 'tactic', 'site', 'both'];
const attack = `      if (homeRole === 'attack') {
        const from = state.attackPlans.home;
        const to = from === 'execute' ? 'split' : 'execute';
        assert.equal(setAttackPlan(state, map, to), true);
        const previousSite = homeSite;
        homeSite = map.sites.find(site => site.name !== homeSite).name;
        homeChanges.push({ round: round + 1, role: homeRole, from, to, previousSite, site: homeSite });
      } else {`;
function replaceOnce(source, anchor, replacement) {
  assert.equal(source.split(anchor).length, 2, `Attack diagnostic anchor changed: ${anchor}`);
  return source.replace(anchor, replacement);
}
export function transform(source, policy) {
  assert.ok(policies.includes(policy));
  // Both preserves the original decision body byte for byte.
  if (policy !== 'both') {
    const body = policy === 'none' ? '' : `
        const from = state.attackPlans.home;
        const to = ${policy === 'tactic' ? "from === 'execute' ? 'split' : 'execute'" : 'from'};
        ${policy === 'tactic' ? 'assert.equal(setAttackPlan(state, map, to), true);' : ''}
        const previousSite = homeSite;
        ${policy === 'site' ? 'homeSite = map.sites.find(site => site.name !== homeSite).name;' : ''}
        homeChanges.push({ round: round + 1, role: homeRole, from, to, previousSite, site: homeSite });`;
    source = replaceOnce(source, attack, `      if (homeRole === 'attack') {${body}
      } else {`);
  }
  source = replaceOnce(source, "for (const profile of ['fixed', 'combined']) {", "for (const profile of ['combined']) {");
  source = replaceOnce(source, '  return { seed, map: map.id, side, choice, recruit, recruitment, boost, statRange, novice,',
    `  return { diagnosticAttackPolicy: ${JSON.stringify(policy)}, seed, map: map.id, side, choice, recruit, recruitment, boost, statRange, novice,`);
  return source;
}

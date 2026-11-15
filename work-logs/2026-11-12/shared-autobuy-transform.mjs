import assert from 'node:assert/strict';
export function transformSharedBuy(source) {
  function replaceOnce(anchor, replacement) {
    assert.equal(source.split(anchor).length, 2, `Shared buy anchor changed: ${anchor}`);
    source = source.replace(anchor, replacement);
  }
  replaceOnce("for (const actor of state.actors.filter(a => a.team === 'home')) {", 'for (const actor of []) {');
  replaceOnce('    startEconomyRound(state);\n    const gear = profile ?', '    startEconomyRound(state, { autoHome: true });\n    const gear = profile ?');
  replaceOnce('homePurchasePolicy, homeManagement, homeChanges,', "homePurchasePolicy: 'shared-auto', homeManagement, homeChanges,");
  return source;
}

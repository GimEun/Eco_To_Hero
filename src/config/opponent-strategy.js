export const OPPONENT_STRATEGY = Object.freeze({
  switchAfterLosses: Object.freeze({ pc: 6, city: 4, province: 3, national: 2, world: 1 }),
  maps: Object.freeze({
    relay: Object.freeze({ attack: 'split', defense: 'forward' }),
    warehouse: Object.freeze({ attack: 'execute', defense: 'standard' }),
    research: Object.freeze({ attack: 'execute', defense: 'standard' }),
  }),
});

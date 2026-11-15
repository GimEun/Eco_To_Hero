export const HAPPINESS_RULES = Object.freeze({ initial: 70, minimum: 0, maximum: 100 });
export const HAPPINESS_BANDS = Object.freeze([
  Object.freeze({ minimum: 90, modifier: 3 }), Object.freeze({ minimum: 75, modifier: 1 }),
  Object.freeze({ minimum: 45, modifier: 0 }), Object.freeze({ minimum: 25, modifier: -2 }),
  Object.freeze({ minimum: 0, modifier: -4 }),
]);

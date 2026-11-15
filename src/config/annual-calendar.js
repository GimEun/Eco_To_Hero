// Approved annual route. Later stages are displayed here, not yet simulated.
export const ANNUAL_CALENDAR = Object.freeze([
  Object.freeze({ id: 'preseason', name: '비시즌', startWeek: 1, endWeek: 4 }),
  Object.freeze({ id: 'pc', name: 'PC방 리그', startWeek: 5, endWeek: 12 }),
  Object.freeze({ id: 'city', name: '시 리그', startWeek: 13, endWeek: 22 }),
  Object.freeze({ id: 'province', name: '도 리그', startWeek: 23, endWeek: 34 }),
  Object.freeze({ id: 'national', name: '전국 리그', startWeek: 35, endWeek: 46 }),
  Object.freeze({ id: 'world', name: '세계 리그', startWeek: 47, endWeek: 52 }),
]);
export const PRESEASON_END_DAY = ANNUAL_CALENDAR[0].endWeek * 7 + 1;

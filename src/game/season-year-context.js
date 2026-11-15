export const createSeasonYears=()=>({year:1,startedDay:1,archives:[]});
export const seasonYear=world=>world.seasonYears?.year??1;
export const seasonYearStart=world=>world.seasonYears?.startedDay??1;
export const yearWeek=world=>Math.floor((world.day-seasonYearStart(world))/7)+1;
export const preseasonEndDay=world=>seasonYearStart(world)+28;

// First-year seeds remain byte-for-byte compatible.
export function competitionSeed(world) {
  const year=seasonYear(world);if(year===1)return world.seed;
  let seed=world.seed>>>0;
  for(const char of `season-year-${year}`)seed=Math.imul(seed^char.codePointAt(0),16777619)>>>0;
  return seed;
}

export function validateYearHeader(value,day,{legacy=false}={}) {
  if(value===undefined && legacy)return createSeasonYears();
  if(!value || !Number.isSafeInteger(value.year) || value.year<1 || !Number.isSafeInteger(value.startedDay)
    || value.startedDay<1 || value.startedDay>day || !Array.isArray(value.archives) || value.archives.length!==value.year-1
    || value.year===1 && value.startedDay!==1)throw new Error('시즌 연도 정보가 올바르지 않습니다.');
  return {year:value.year,startedDay:value.startedDay,archives:value.archives};
}

// 현재 구현하는 시/도/전국 리그만 정의한다.
export const DOMESTIC_LEAGUES=Object.freeze({
  city:Object.freeze({leagueId:'city',key:'citySeason',id:'city-1',name:'시 리그',teams:10,weeks:9,
    previousKey:'pcSeason',previousName:'PC방',shuffleSalt:0x43495459,finals:true}),
  province:Object.freeze({leagueId:'province',key:'provinceSeason',id:'province-1',name:'도 리그',teams:12,weeks:11,
    previousKey:'citySeason',previousName:'시 리그',shuffleSalt:0x50524f56,finals:true}),
  national:Object.freeze({leagueId:'national',key:'nationalSeason',id:'national-1',name:'전국 리그',teams:12,weeks:11,finalWeek:46,
    previousKey:'provinceSeason',previousName:'도 리그',shuffleSalt:0x4e41544c,finals:true}),
});

export function domesticRule(seasonOrId) {
  const rule=DOMESTIC_LEAGUES[typeof seasonOrId==='string'?seasonOrId:seasonOrId?.leagueId];
  if(!rule)throw new Error('지원하는 국내 리그를 확인하세요.');
  return rule;
}
export const domesticSeason=world=>world.nationalSeason??world.provinceSeason??world.citySeason??null;
export const playoffWeekId=season=>`${domesticRule(season).id}-playoffs`;

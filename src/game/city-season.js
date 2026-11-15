// 기존 시 리그 API는 공통 처리에 위임해 저장/검사 호환을 유지한다.
import { createDomesticSeason,domesticEntryIssue,enterDomesticSeason,nextDomesticFixture,pickDomesticMaps,selectDomesticMap,regularDomesticStandings,domesticStandings,validateDomesticSeries,validateDomesticSeason } from './domestic-season.js';
export const createCitySeason=(world,startedDay=world.day)=>createDomesticSeason(world,'city',startedDay);
export const cityEntryIssue=world=>domesticEntryIssue(world,'city');
export const enterCitySeason=world=>enterDomesticSeason(world,'city');
export const nextCityFixture=world=>nextDomesticFixture({...world,provinceSeason:null});
export const pickCityMaps=pickDomesticMaps;
export const selectCityMap=selectDomesticMap;
export const regularCityStandings=regularDomesticStandings;
export const cityStandings=domesticStandings;
export const validateCitySeries=validateDomesticSeries;
export const validateCitySeason=(value,world,options)=>validateDomesticSeason(value,world,'city',options);
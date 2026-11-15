import test from 'node:test';
import assert from 'node:assert/strict';
import { createPractice } from '../src/simulation/practice.js';
import { startEconomyRound } from '../src/simulation/economy.js';
import { autoThrow, updateThrowables, avoidFlashes } from '../src/simulation/throwables.js';
import { resolveCombat } from '../src/simulation/combat.js';
import { prepareRound } from '../src/simulation/round.js';
import { RELAY_MAP } from '../src/data/maps/relay.js';
import { sightRange } from '../src/simulation/geometry.js';
import { moveActors } from '../src/simulation/actor-movement.js';

const map = { ...RELAY_MAP, walls: [] };
function sample() {
  const team = name => ({ name, players: Array.from({length:5},(_,i)=>({id:`${name}-${i}`,name, nickname:name,aim:45,intelligence:45,stamina:45})) });
  const state=createPractice(map,team('home'),team('away'),{match:true,seed:0,attackPlans:{home:'execute',away:'execute'},defensePlans:{home:'standard',away:'standard'}});
  startEconomyRound(state);
  for(const actor of state.actors) Object.assign(actor,{x:actor.team==='home'?100:800,y:500,throwables:{grenade:0,flashbang:0,smoke:0},nextShotTick:100000});
  const actor=state.actors[0],target=state.actors[5];
  Object.assign(actor,{x:100,y:100,facing:0,nextShotTick:0,targetId:null,readyTick:0,throwables:{grenade:1,flashbang:0,smoke:0}});
  Object.assign(target,{x:220,y:100,facing:Math.PI});
  return {state,actor,target};
}

test('접촉 즉시 투척으로 사격을 취소하지 않고 총으로 먼저 대응할 반응 시간을 둔다',()=>{
  const {state,actor}=sample();
  for(let tick=0;tick<30&&!state.projectiles.length;tick++){state.tick=tick;autoThrow(state,map);resolveCombat(state,map);}
  const shot=state.events.find(e=>e.type==='shot'&&e.actorId===actor.id);
  const thrown=state.events.find(e=>e.type==='utility-thrown'&&e.actorId===actor.id);
  assert.ok(shot && thrown && shot.tick<thrown.tick);
});

test('상대 팀 투척물이 같은 곳으로 날아가도 내 팀의 투척을 막지 않는다',()=>{
  const {state,actor,target}=sample();
  state.tick=100; actor.utilityContact={targetId:target.id,tick:0};
  state.projectiles.push({actorId:'away-2',kind:'grenade',to:{x:target.x,y:target.y},detonateTick:120});
  autoThrow(state,map);
  assert.equal(state.projectiles.length,2);
  assert.equal(actor.throwables.grenade,0);
});

test('적보다 아군을 더 많이 눈멀게 하는 섬광은 보존하고 안전해지면 사용한다',()=>{
  const {state,actor,target}=sample();
  state.tick=100; actor.utilityContact={targetId:target.id,tick:0}; actor.throwables={flashbang:1,grenade:0,smoke:0};
  Object.assign(state.actors[1],{x:250,y:100}); Object.assign(state.actors[2],{x:240,y:130});
  autoThrow(state,map);
  assert.equal(state.projectiles.length,0);
  assert.equal(actor.throwables.flashbang,1);
  for(const ally of state.actors.slice(1,3)) Object.assign(ally,{x:800,y:500});
  autoThrow(state,map);
  assert.equal(state.projectiles.length,1);
});

test('섬광 강도는 거리·바라보는 방향에 따라 다르고 약한 섬광이 강한 효과를 연장하지 않는다',()=>{
  const {state,target}=sample();
  target.x=240;
  state.projectiles=[{actorId:'home-1',kind:'flashbang',to:{x:220,y:100},detonateTick:0}];
  const away=structuredClone(state); away.actors[5].facing=0;
  updateThrowables(state,map); updateThrowables(away,map);
  assert.ok(target.flashStrength>away.actors[5].flashStrength);
  assert.ok(sightRange(target,state)<sightRange(away.actors[5],away));
  const until=target.flashUntilTick, strength=target.flashStrength;
  state.tick=1; state.projectiles=[{actorId:'home-1',kind:'flashbang',to:{x:150,y:100},detonateTick:1}];
  updateThrowables(state,map);
  assert.equal(target.flashUntilTick,until);
  assert.equal(target.flashStrength,strength);
});

test('공격팀도 실제 관측한 적 위치를 공유하고 보이지 않는 적의 새 좌표는 알지 못한다',()=>{
  const {state,actor,target}=sample();
  const ally=state.actors[1];
  Object.assign(ally,{x:100,y:140,facing:Math.PI});
  prepareRound(state,map);
  assert.equal(state.round.attackContact.id,target.id);
  assert.ok(Math.abs(ally.watchAngle-Math.atan2(target.y-ally.y,target.x-ally.x))<1e-9);
  const contact=structuredClone(state.round.attackContact);
  for(const observer of state.actors.filter(a=>a.team==='home')) observer.viewRange=0;
  target.x=300;state.tick=10;prepareRound(state,map);
  assert.deepEqual(state.round.attackContact,contact);
  state.tick=101;prepareRound(state,map);
  assert.equal(state.round.attackContact,null);
  actor.viewRange=200;
});

test('공격 중 공유된 적보다 현재 교전 중인 유효 표적을 우선한다',()=>{
  const {state,actor,target}=sample();
  target.x=120;
  const ally=state.actors[1], other=state.actors[6];
  Object.assign(ally,{x:100,y:140,facing:0,targetId:other.id});
  Object.assign(other,{x:220,y:140});
  prepareRound(state,map);
  assert.equal(state.round.attackContact.id,target.id);
  assert.equal(ally.watchAngle,0);
  assert.equal(ally.targetId,other.id);
  assert.equal(actor.targetId,null);
});

test('보이는 수류탄을 회피해 실제 피해를 줄이고 기존 이동 목표는 보존한다',()=>{
  const {state,actor}=sample();
  Object.assign(actor,{route:[{x:100,y:100},{x:300,y:100}],waypoint:1,arrived:false,action:null});
  state.projectiles=[{actorId:'away-1',kind:'grenade',from:{x:220,y:100},to:{x:100,y:100},throwTick:0,detonateTick:20}];
  const control=structuredClone(state),route=structuredClone(actor.route);
  for(let tick=6;tick<20;tick++){state.tick=tick;moveActors(state,map,new Set([actor.id]),50);}
  assert.ok(actor.y>100);
  assert.ok(actor.grenadeEvades>0);
  assert.deepEqual(actor.route,route);
  state.tick=control.tick=20;updateThrowables(state,map);updateThrowables(control,map);
  assert.ok(actor.hp>control.actors[0].hp);
  const x=actor.x;moveActors(state,map,new Set(),50);
  assert.ok(actor.x>x);
});

test('보이지 않는 수류탄에는 반응하지 않고 실제로 본 섬광에만 반응 시간을 두어 등을 돌린다',()=>{
  const {state,actor}=sample();
  actor.facing=Math.PI;state.tick=6;
  state.projectiles=[{actorId:'away-1',kind:'grenade',from:{x:220,y:100},to:{x:100,y:100},throwTick:0,detonateTick:20}];
  moveActors(state,map,new Set([actor.id]),50);
  assert.equal(actor.y,100);
  state.projectiles=[{actorId:'away-1',kind:'flashbang',from:{x:220,y:100},to:{x:100,y:100},throwTick:0,detonateTick:12}];
  state.tick=0;avoidFlashes(state,map);
  assert.equal(actor.flashThreat,null);
  actor.facing=0;state.tick=2;avoidFlashes(state,map);
  assert.equal(actor.facing,0);
  state.tick=5;avoidFlashes(state,map);
  assert.ok(Math.abs(actor.facing)>Math.PI/2);
  state.tick=12;updateThrowables(state,map);
  assert.ok(actor.flashStrength<=0.25+1e-9);
  assert.ok(actor.flashUntilTick-state.tick<=10);
});

test('도착한 선수도 수류탄 회피 후에는 도착 상태를 해제하고 원래 목표로 돌아간다',()=>{
  const {state,actor}=sample();
  Object.assign(actor,{route:[{x:80,y:100},{x:100,y:100}],waypoint:2,arrived:true,action:null,crowdedGoal:{x:100,y:100}});
  state.projectiles=[{actorId:'away-1',kind:'grenade',from:{x:220,y:100},to:{x:100,y:100},throwTick:0,detonateTick:20}];
  for(let tick=6;tick<20;tick++){state.tick=tick;moveActors(state,map,new Set(),50);}
  assert.equal(actor.arrived,false);
  assert.equal(actor.crowdedGoal,null);
  assert.ok(actor.waypoint<actor.route.length);
  assert.equal(actor.objectiveKey,null);
  state.tick=20;updateThrowables(state,map);
  for(let tick=20;tick<50;tick++){state.tick=tick;moveActors(state,map,new Set(),50);}
  assert.equal(actor.arrived,true);
  assert.ok(Math.hypot(actor.x-100,actor.y-100)<1e-7);
});

import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const report = JSON.parse(readFileSync(new URL('../docs/DEFENSE_EXPERIMENT.json', import.meta.url), 'utf8'));
const baseline = JSON.parse(readFileSync(new URL('../docs/DEFENSE_EXPERIMENT_BASELINE.json', import.meta.url), 'utf8'));
const { groups, conditions: c } = report;
const expected = c.visions.length * c.profiles.length * c.plans.length * c.sites.length * c.weapons.length;
assert.equal(groups.length, expected);
assert.equal(new Set(groups.map(g => [g.vision, g.profile, g.plan, g.site, g.weapon].join('/'))).size, expected);
assert.equal(report.totals.rounds, expected * c.seedCount * 2);
assert.equal(baseline.startSeed, c.startSeed);
assert.equal(baseline.seedCount, c.seedCount);
for (const g of groups) {
  assert.equal(g.rounds, c.seedCount * 2);
  assert.equal(g.defenseWins + g.attackWins + g.draws, g.rounds);
  assert.equal(g.draws, 0);
  assert.equal(Object.values(g.reasons).reduce((a, b) => a + b, 0), g.rounds);
  assert.equal(g.outcomes.length, g.rounds);
  assert.match(g.outcomes, /^[01]+$/);
  assert.equal([...g.outcomes].filter(item => item === '1').length, g.defenseWins);
  assert.equal(g.defenseFirstShots + g.attackFirstShots + g.simultaneousFirstShots + g.noShots, g.rounds);
  assert.ok(g.defenseZeroShotActors >= 0 && g.defenseZeroShotActors <= g.rounds * 5);
  assert.ok(g.attackZeroShotActors >= 0 && g.attackZeroShotActors <= g.rounds * 5);
  const control = groups.find(b => b.vision === 'baseline' && b.profile === g.profile
    && b.plan === g.plan && b.site === g.site && b.weapon === g.weapon);
  assert.equal(g.versusBaseline.gained - g.versusBaseline.lost, g.defenseWins - control.defenseWins);
  if (g.vision === 'baseline' && g.profile === 'equal50') {
    const independent = baseline.groups.find(b => b.plan === g.plan && b.site === g.site && b.weapon === g.weapon);
    assert.equal(g.defenseWins, independent.defenseWins);
    assert.deepEqual(g.reasons, independent.reasons);
  }
}

const percent = (a, b) => `${(a / b * 100).toFixed(1)}%`;
const summarize = filter => {
  const selected = groups.filter(filter);
  const result = {};
  for (const key of ['rounds', 'defenseWins', 'defenseShots', 'attackShots', 'defenseZeroShotActors',
    'attackZeroShotActors', 'defenseFirstShots', 'attackFirstShots', 'simultaneousFirstShots', 'noShots']) {
    result[key] = selected.reduce((sum, g) => sum + g[key], 0);
  }
  return result;
};
const win = filter => { const s = summarize(filter); return percent(s.defenseWins, s.rounds); };
const visionNames = { baseline: '90도 / 200 (기본)', angle120: '120도 / 200', range260: '90도 / 260',
  'angle120-range260': '120도 / 260', angle180: '180도 / 200' };
const profileNames = { equal50: '양 팀 50 / 50', 'defense-aim70': '수비 70 / 50, 공격 50 / 50',
  'defense-intelligence70': '수비 50 / 70, 공격 50 / 50', 'defense-both70': '수비 70 / 70, 공격 50 / 50',
  'attack-both70': '수비 50 / 50, 공격 70 / 70', equal30: '양 팀 30 / 30', equal70: '양 팀 70 / 70' };
const rows = [
  '# 수비 시야·능력·전술 실험 결과', '',
  '- 조사일: 2026-11-07. 실험 수행 당시에는 실제 게임 기본값과 엔진 코드를 변경하지 않았다.',
  '- 후속 적용: 사용자 요청으로 실험 종료 후 실제 라운드 기본값에 수비 120도/260을 적용했다. 아래 기본 대조군 90도/200과 원자료는 당시 조건을 보존한다. [적용 기록](../work-logs/2026-11-07-12-defense-vision.md)',
  `- 총 ${report.totals.rounds.toLocaleString('en-US')}라운드: 시야 5 × 능력 7 × 전술 2 × 사이트 2 × 무기 2 × 시드 ${c.seedCount} × 진영 교환 2.`,
  `- 시드 ${c.startSeed}~${c.startSeed + c.seedCount - 1}. 각 시야/능력 셀은 ${c.seedCount * 16}라운드다.`,
  '- 중계소 한 맵의 독립 라운드. 양 팀은 같은 무기로 시작하며 경제·장비 보존·MR12는 제외했다.',
  '- 각 팀 5명 전원의 에임/지능을 동일하게 설정했다. 체력 능력치(stamina)·성장·역할 숙련은 현재 교전에 반영되지 않는다.',
  '- 공격 시야는 항상 90도/200. 수비 시야는 최초 수비팀에 라운드 전체 동안 적용되며 설치 후 해체 상황에서도 유지된다.',
  '- 공격은 기존의 지정 사이트 자동 진입 행동이다. 공격 전략 간 비교는 구현되지 않아 포함하지 않았다.',
  '', '## 시야별 수비 승률과 발사', '',
  '양 팀 에임/지능 50. 발사 수는 팀 전체의 라운드당 평균이며 무발사 비율은 참가한 선수 5명 전체를 분모로 한다.', '',
  '| 수비 시야각 / 거리 | 수비 승률 | 수비 발사 | 공격 발사 | 수비 무발사 선수 | 공격 무발사 선수 | 수비만 선제 발사 | 공격만 선제 발사 | 동시 선제 발사 |',
  '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
];
for (const v of c.visions) {
  const s = summarize(g => g.vision === v.id && g.profile === 'equal50');
  rows.push(`| ${visionNames[v.id]} | ${percent(s.defenseWins, s.rounds)} (${s.defenseWins}/${s.rounds}) | ${(s.defenseShots / s.rounds).toFixed(1)} | ${(s.attackShots / s.rounds).toFixed(1)} | ${percent(s.defenseZeroShotActors, s.rounds * 5)} | ${percent(s.attackZeroShotActors, s.rounds * 5)} | ${percent(s.defenseFirstShots, s.rounds)} | ${percent(s.attackFirstShots, s.rounds)} | ${percent(s.simultaneousFirstShots, s.rounds)} |`);
}
rows.push('', '## 능력과 시야의 교차 비교', '',
  '능력 표기는 에임 / 지능이며 모든 값은 수비 승률이다.', '',
  `| 능력 조건 | ${c.visions.map(v => visionNames[v.id]).join(' | ')} |`,
  `|---|${c.visions.map(() => '---:|').join('')}`);
for (const p of c.profiles) rows.push(`| ${profileNames[p.id]} | ${c.visions.map(v => win(g => g.vision === v.id && g.profile === p.id)).join(' | ')} |`);
rows.push('', '## 전술·사이트·무기별 시야 효과', '', `양 팀 에임/지능 50. 각 셀 ${c.seedCount * 2}라운드(${c.seedCount}시드 × 진영 교환)이며 작은 표본의 차이를 포함한다.`, '',
  `| 전술 / 사이트 / 무기 | ${c.visions.map(v => visionNames[v.id]).join(' | ')} |`,
  `|---|${c.visions.map(() => '---:|').join('')}`);
for (const plan of c.plans) for (const site of c.sites) for (const weapon of c.weapons) {
  rows.push(`| ${plan === 'standard' ? '기본' : '전진'} / ${site} / ${weapon === 'basic-pistol' ? '권총' : '소총'} | ${c.visions.map(v => win(g => g.vision === v.id && g.profile === 'equal50' && g.plan === plan && g.site === site && g.weapon === weapon)).join(' | ')} |`);
}
rows.push('', '## 전술별 능력 효과', '', `기본 시야 90도/200. 각 셀 ${c.seedCount * 8}라운드이며 A/B·권총/소총을 같은 비중으로 합쳤다.`, '',
  '| 능력 조건 | 기본 수비 | 전진 수비 |', '|---|---:|---:|');
for (const p of c.profiles) rows.push(`| ${profileNames[p.id]} | ${win(g => g.vision === 'baseline' && g.profile === p.id && g.plan === 'standard')} | ${win(g => g.vision === 'baseline' && g.profile === p.id && g.plan === 'forward')} |`);
const baseShots = summarize(g => g.vision === 'baseline' && g.profile === 'equal50');
const widerShots = summarize(g => g.vision === 'angle120-range260' && g.profile === 'equal50');
rows.push('', '## 결과 판단', '',
  `- 양 팀 능력 50에서 수비 시야 120도/260은 기본 ${percent(baseShots.defenseWins, baseShots.rounds)} 대비 ${percent(widerShots.defenseWins, widerShots.rounds)}였다. 수비 발사는 팀당 ${(baseShots.defenseShots / baseShots.rounds).toFixed(1)}발→${(widerShots.defenseShots / widerShots.rounds).toFixed(1)}발로 승률 개선에 비해 증가 폭이 작다.`,
  `- 기본 시야/능력에서 수비 무발사 선수는 ${baseShots.defenseZeroShotActors}/${baseShots.rounds * 5}명이었다. 사용자가 보고한 수비가 거의 쏘지 않는 현상은 이 통제 조건에서 재현되지 않았다. 실제 명단·구매·해당 라운드 경과와 분리해서 해석한다.`,
  `- 능력이 같은 경우 기본과 120도/260 모두 최초 발사는 ${baseShots.simultaneousFirstShots}/${baseShots.rounds}, ${widerShots.simultaneousFirstShots}/${widerShots.rounds}라운드에서 양 팀이 같은 틱이었다. 이번 경로에서는 시야 확대가 첫 발사 우선권을 만들지 않았다.`,
  '- 양 팀 능력 50에서는 전진 수비의 전체 승률이 높지만, 양 팀 70에서는 기본 수비가 높아 전술 우열이 능력 조건에 따라 바뀐다. 전진 수비는 A/B 성능도 크게 달랐다.',
  '- 시야 확대는 조정 후보지만 이 수치만으로 기본값을 확정할 수 없다. 기존 배치·지원·후퇴와 에임의 큰 영향도 함께 검토할 필요가 있다.',
  '', '## 해석과 한계', '',
  '- 에임 50→70은 같은 거리·이동 조건의 명중 확률에 +12%p를 더한다(상하한 적용). 지능 50→70은 표적 획득 후 대기를 400ms→350ms로 줄인다. 현재 두 능력의 효과 크기는 동등하지 않다.',
  '- 권총 사거리 160, 소총 사거리 200은 유지했다. 시야 거리 260은 장거리 사격을 허용하지 않고 적 인지·시선·지원·후퇴·설치/해체 판단에 영향을 줄 수 있다.',
  '- 발사 수에는 생존 시간과 라운드 길이의 영향도 있다. 무발사 선수에는 다른 사이트를 지키거나 일찍 사망한 선수도 포함되므로 이 수치만으로 사격 버그를 판정하지 않는다.',
  '- 시야 확대는 인지뿐 아니라 지원과 후퇴 등 기존 행동에도 적용된다. 승률 변화 전체를 순수 사격 효과로 해석하지 않는다.',
  '- 같은 시드의 진영 교환은 독립 표본이 아니다. 서로 다른 조건에서는 난수 소비 경로도 달라지므로 동일 시드가 동일 명중 순서를 보장하지 않는다.',
  `- 한 맵·고정 진입·${c.seedCount}시드 결과이며 실제 구단 명단·구매 경제·전체 경기·시즌 승률을 예측하는 확정값이 아니다. 결과를 본 뒤 선택한 시야안을 적용하기 전에는 별도 시드와 다양한 공격 조건의 재검증이 필요하다.`,
  '', '## 검증과 재실행', '',
  '- 모든 그룹의 승패·종료 사유·발사 선제 분류 합계, 승패 비트 기록과 시야 대조군 승수 차이를 검사했다.',
  '- 별도의 기존 audit-defense-balance.js 실행 결과와 기본 시야/능력 8개 세부 그룹의 승수·종료 사유가 모두 일치했다.',
  '- 원자료: [DEFENSE_EXPERIMENT.json](DEFENSE_EXPERIMENT.json), 독립 기준 검사: [DEFENSE_EXPERIMENT_BASELINE.json](DEFENSE_EXPERIMENT_BASELINE.json).',
  '- 실행: `node scripts/experiment-defense.js 32 128`, `node scripts/audit-defense-balance.js 32 128 legacy`의 JSON을 UTF-8로 기준 검사 파일에 저장한 뒤 `node scripts/report-defense-experiment.js`. legacy는 당시 양 팀 90도/200 대조군을 재현하며 생략하면 현재 게임 기본값으로 검사한다.', '');
writeFileSync(new URL('../docs/DEFENSE_EXPERIMENT.md', import.meta.url), rows.join('\n'), 'utf8');
console.log(`검증 통과: ${groups.length}그룹 / ${report.totals.rounds}라운드, Markdown 보고서 저장`);

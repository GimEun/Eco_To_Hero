// 50ms 고정 틱 기준. 사용자 승인한 한 라운드 규칙.
export const ROUND_RULES = Object.freeze({ limitTicks: 2300, plantTicks: 80, defuseTicks: 140, fuseTicks: 800 });
// 라운드 최초 진영 기준이며 설치 후에도 유지한다. 무기 사거리와는 별개다.
export const ROUND_VISION = Object.freeze({
  attack: Object.freeze({ fieldOfView: Math.PI * 100 / 180, viewRange: 220 }),
  defense: Object.freeze({ fieldOfView: Math.PI * 110 / 180, viewRange: 240 }),
});
export const ROUND_REASONS = Object.freeze({
  explosion: '폭탄 폭발', defused: '폭탄 해체', 'attack-eliminated': '공격팀 전멸',
  'defense-eliminated': '수비팀 전멸', timeout: '설치 전 시간 종료',
});

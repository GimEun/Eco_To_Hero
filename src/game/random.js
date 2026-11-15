// 생성 세계와 연습 교전에서 동일한 시드 난수를 사용한다.
export function randomUnit(state) {
  state.randomState = (state.randomState + 0x6d2b79f5) >>> 0;
  let value = Math.imul(state.randomState ^ (state.randomState >>> 15), state.randomState | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

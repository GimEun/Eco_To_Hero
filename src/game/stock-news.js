import { randomUnit } from './random.js';

export const STOCK_NEWS_ODDS = Object.freeze({
  positive: Object.freeze({ up: 45, flat: 20, down: 35 }),
  neutral: Object.freeze({ up: 40, flat: 20, down: 40 }),
  negative: Object.freeze({ up: 35, flat: 20, down: 45 }),
});
export const STOCK_NEWS = Object.freeze({
  corechip: {
    positive: ['일부 장비 업체가 새 칩의 도입을 검토한다는 소식이다. 실제 발주 규모는 알려지지 않았다.', '고성능 칩 문의가 늘었다는 업계 이야기가 나온다. 생산 비용 부담은 여전하다.'],
    neutral: ['신규 공급 계약 협의가 이어지고 있다. 가격과 물량 조건은 아직 공개되지 않았다.', '제품 평가가 진행 중인 것으로 알려졌다. 기존 제품 수요에는 큰 변화가 보이지 않는다.'],
    negative: ['일부 고객사의 주문 일정이 늦어질 수 있다는 이야기가 나온다. 다른 고객사의 수요는 확인되지 않았다.', '원자재 조달 비용이 높아졌다는 소식이다. 판매 가격에 얼마나 반영될지는 미지수다.'],
  },
  nextgear: {
    positive: ['신제품 문의가 늘고 있지만 실제 판매 성과는 아직 확인되지 않았다.', '일부 프로 팀에서 새 장비를 시험하고 있다. 정식 채택 여부는 정해지지 않았다.'],
    neutral: ['판매 채널 재정비가 진행 중이다. 유통 비용과 판매량에 미칠 영향은 엇갈린다.', '기존 제품 할인 행사가 이어지고 있다. 신규 고객 유입과 이익 변화는 지켜봐야 한다.'],
    negative: ['일부 판매점에서 재고 소진이 더디다는 소식이다. 온라인 판매 상황은 다를 수 있다.', '경쟁사의 저가 장비 출시가 예고됐다. 기존 고객의 반응은 아직 드러나지 않았다.'],
  },
  streamwave: {
    positive: ['인기 방송인의 합류설이 돌고 있다. 계약 조건과 시청자 유입 효과는 아직 불분명하다.', '최근 행사 중계에 관심이 모였다는 소식이다. 광고 계약으로 이어질지는 지켜봐야 한다.'],
    neutral: ['추천 기능 개편을 시험 중이다. 이용 시간과 운영 비용에 대한 평가는 갈린다.', '신규 콘텐츠 편성이 예고됐다. 공개 전이라 이용자 반응을 가늠하기 어렵다.'],
    negative: ['일부 광고주가 집행 규모를 재검토한다는 이야기가 나온다. 새로운 광고 수요는 확인되지 않았다.', '서비스 운영 비용 부담이 커졌다는 소식이다. 신규 이용자 증가가 이를 상쇄할지는 미지수다.'],
  },
  arenaworks: {
    positive: ['신작 시험 버전에 관심이 모이고 있다. 출시 일정과 장기 흥행은 아직 불확실하다.', '업데이트의 초기 이용자 반응이 나쁘지 않다는 소식이다. 유료 매출 변화는 확인되지 않았다.'],
    neutral: ['개발팀이 차기 프로젝트의 방향을 조정하고 있다. 구체적인 공개 일정은 정해지지 않았다.', '해외 서비스 협의가 진행 중이다. 현지 운영 조건에 대한 정보는 제한적이다.'],
    negative: ['신작 일정이 조정될 수 있다는 이야기가 나온다. 완성도 개선에 대한 기대도 남아 있다.', '최근 콘텐츠 소모 속도가 빠르다는 지적이 있다. 추가 업데이트의 효과는 아직 알 수 없다.'],
  },
  novalabs: {
    positive: ['시제품 시연이 일부 투자자의 관심을 끌었다. 실제 사업화 가능성은 검증이 더 필요하다.', '기술 제휴를 검토하는 업체가 있다는 소식이다. 논의가 계약으로 이어질지는 미지수다.'],
    neutral: ['새 기술의 시험 결과 공개가 예고됐다. 시장의 기대와 우려가 함께 나오고 있다.', '연구 과제의 범위를 조정하고 있다. 비용 절감과 성장 가능성에 대한 의견은 엇갈린다.'],
    negative: ['개발 자금 확보에 시간이 더 필요할 수 있다는 이야기가 나온다. 추가 지원 가능성도 남아 있다.', '시제품 양산 과정의 난도가 높다는 소식이다. 개선 작업의 성과는 아직 확인되지 않았다.'],
  },
});
export function createStockSignals(random) {
  const tones = Object.keys(STOCK_NEWS_ODDS);
  return Object.fromEntries(Object.keys(STOCK_NEWS).map(id => {
    const tone = tones[Math.floor(randomUnit(random) * tones.length)];
    return [id, { tone, variant: Math.floor(randomUnit(random) * STOCK_NEWS[id][tone].length) }];
  }));
}
export const stockNewsText = (market, id) => STOCK_NEWS[id][market.signals[id].tone][market.signals[id].variant];

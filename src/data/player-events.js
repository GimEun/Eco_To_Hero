export const PLAYER_EVENT_RULES = Object.freeze({ chance: 0.6, historyLimit: 20 });

export const PLAYER_EVENTS = [
  { id: 'dating', title: '연애 허락', description: '선수가 연애를 시작해도 되는지 묻습니다.', accept: { cash: 0, happiness: 10, skill: 'intelligence', delta: -1, chance: 0.2 }, decline: { cash: 0, happiness: -8, skill: 'intelligence', delta: 1, chance: 0.3 } },
  { id: 'treadmill', title: '러닝머신 구매', description: '선수가 숙소에서 운동할 러닝머신을 요청합니다.', accept: { cash: -500, happiness: 5, skill: 'stamina', delta: 1, chance: 0.7 }, decline: { cash: 0, happiness: -4 } },
  { id: 'equipment', title: '개인 장비 교체', description: '선수가 손에 맞는 마우스와 키보드로 교체하고 싶어 합니다.', accept: { cash: -400, happiness: 5, skill: 'aim', delta: 1, chance: 0.7 }, decline: { cash: 0, happiness: -4 } },
  { id: 'coaching', title: '개인 코칭', description: '선수가 사격 자세를 점검할 개인 코칭을 요청합니다.', accept: { cash: -300, happiness: 3, skill: 'aim', delta: 1, chance: 0.7 }, decline: { cash: 0, happiness: -3 } },
  { id: 'lecture', title: '전술 강의', description: '선수가 외부 전술 강의를 듣고 싶어 합니다.', accept: { cash: -200, happiness: 3, skill: 'intelligence', delta: 1, chance: 0.7 }, decline: { cash: 0, happiness: -3 } },
  { id: 'massage', title: '마사지 지원', description: '선수가 뭉친 몸을 풀기 위한 마사지를 요청합니다.', accept: { cash: -200, happiness: 6, skill: 'stamina', delta: 1, chance: 0.5 }, decline: { cash: 0, happiness: -4 } },
  { id: 'family', title: '가족 방문', description: '선수가 가족을 만나고 돌아올 시간을 요청합니다.', accept: { cash: 0, happiness: 10, skill: 'aim', delta: -1, chance: 0.2 }, decline: { cash: 0, happiness: -8, skill: 'intelligence', delta: 1, chance: 0.2 } },
  { id: 'friends', title: '친구와 외출', description: '선수가 친구들과 만나 기분을 전환하고 싶어 합니다.', accept: { cash: 0, happiness: 8, skill: 'stamina', delta: -1, chance: 0.2 }, decline: { cash: 0, happiness: -6, skill: 'stamina', delta: 1, chance: 0.2 } },
  { id: 'collaboration', title: '개인 방송 합방', description: '선수가 다른 방송인과 함께 방송할 기회를 얻었습니다.', accept: { cash: 200, happiness: 5, skill: 'aim', delta: -1, chance: 0.2 }, decline: { cash: 0, happiness: -4, skill: 'aim', delta: 1, chance: 0.2 } },
  { id: 'fans', title: '팬 미팅', description: '선수가 작은 팬 미팅에 참여하고 싶어 합니다.', accept: { cash: -100, happiness: 8, skill: 'intelligence', delta: 1, chance: 0.4 }, decline: { cash: 0, happiness: -5 } },
  { id: 'diet', title: '식단 관리', description: '선수에게 균형 잡힌 식단 프로그램을 제안할 수 있습니다.', accept: { cash: -200, happiness: -3, skill: 'stamina', delta: 1, chance: 0.8 }, decline: { cash: 0, happiness: 3 } },
  { id: 'counseling', title: '심리 상담', description: '선수가 경기 부담을 이야기할 상담을 요청합니다.', accept: { cash: -200, happiness: 8, skill: 'intelligence', delta: 1, chance: 0.5 }, decline: { cash: 0, happiness: -3 } },
  { id: 'showmatch', title: '친선 방송 경기', description: '선수가 친선 방송 경기에 초대받았습니다.', accept: { cash: 100, happiness: 5, skill: 'intelligence', delta: -1, chance: 0.2 }, decline: { cash: 0, happiness: -4, skill: 'intelligence', delta: 1, chance: 0.2 } },
  { id: 'hobby', title: '취미 활동 지원', description: '선수가 새로운 취미를 위한 지원을 요청합니다.', accept: { cash: -150, happiness: 8, skill: 'aim', delta: 1, chance: 0.3 }, decline: { cash: 0, happiness: -5 } },
  { id: 'overtime', title: '야간 추가 훈련', description: '선수가 남아서 추가 사격 훈련을 하겠다고 합니다.', accept: { cash: 0, happiness: -5, skill: 'aim', delta: 1, chance: 0.8 }, decline: { cash: 0, happiness: 5 } },
];

export const findPlayerEvent = id => PLAYER_EVENTS.find(event => event.id === id);

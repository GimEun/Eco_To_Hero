# 작업: 웹사이트 전체 설명 배치·설명창 정리

- 상태: 완료 — 2026-11-10
- 구현 관련 파일:
  - `src/ui/description-notes.js`
  - `src/main.js`
  - `src/styles.css`
  - `src/ui/screens.js`, `src/ui/world-screens.js`, `src/ui/roster-management.js`
  - `src/ui/training-panel.js`, `src/ui/contracts-panel.js`, `src/ui/player-events-panel.js`
  - `src/ui/finance-panel.js`, `src/ui/sponsors-panel.js`, `src/ui/loans-panel.js`, `src/ui/stocks-panel.js`, `src/ui/stock-chart.js`
  - `src/ui/coaches-panel.js`, `src/ui/facilities-panel.js`
  - `src/ui/practice-screen.js`, `src/ui/economy-panel.js`, `src/ui/match-highlights.js`
  - `src/ui/bankruptcy-screen.js`, `src/ui/club-replacement-dialog.js`
  - `tests/description-notes.test.js`

## 요청 사항

- 적용 대상은 웹사이트 내 모든 설명문이다. 메뉴·창단·입력 안내·확인창·모든 관리 화면·이벤트·경기·장비·전술·통계를 포함한다.
- 실제 표시가 3줄 미만인 설명은 해당 영역 하단으로 옮겨 가시성을 높인다.
- 3줄 이상인 설명은 설명 버튼으로 별도 창을 열고 닫는다. 실제 상태·수치·결과·오류는 직접 표시한다.

## 진행 현황

- [x] 현재 화면과 전체 설명문 조사
- [x] 육성·주간 행동 설명 4개 정리
- [x] 전체 사이트의 설명문을 구분하고 하단 안내·설명창 적용
- [x] 표시 너비 변경·숨겨진 탭/대화상자·동적 설명·복사된 경기 결과 처리
- [x] 관련 검사·문법·빌드·최신 코드 제공 확인
  - `node --test tests/description-notes.test.js tests/weekly-actions.test.js tests/player-development.test.js tests/player-condition.test.js tests/happiness.test.js tests/coaches.test.js tests/facilities.test.js tests/club-tabs.test.js tests/club-replacement-dialog.test.js tests/finance-sections.test.js tests/roster-screen.test.js tests/stock-charts-news.test.js tests/season-sponsors.test.js tests/player-events.test.js tests/stocks.test.js tests/loans-bankruptcy.test.js tests/practice-screen.test.js`: 163개 통과.
  - 새 설명 처리 검사 6개: 1/2/3/4줄 경계·3→2줄 복귀·하단 이동과 ID/선택 유지·숨긴 탭/빈 설명·동적 내용·닫기 후 초점·장비 표 보존·부모 dialog 유지·복사된 결과창·화면 제거 정리 확인.
  - 문법: UI JS 전체와 `src/main.js`, 새 검사 파일 총 25개 `node --check` 통과. 마지막 수정한 main/검사 파일도 재확인.
  - `node node_modules/vite/bin/vite.js build`: 99개 모듈 빌드 통과.
  - `/`, `/src/main.js`, `/src/ui/description-notes.js`: 개발 서버 HTTP 200 확인.
  - 현재 셸 PATH에 node/npm이 없어 설치된 `C:/Program Files/Adobe/Adobe Creative Cloud Experience/libs/node.exe` v24.19.0으로 명령을 실행했다.
  - DOM 검사에서는 측정 높이를 제공하여 분기·동작을 검증했다. 실제 브라우저의 줄바꿈·화면 배치·초점 복귀를 확인했다고 기록하지 않는다.
- [x] 사용자 브라우저 확인
- [x] 사용자 완료 승인

## 구현 내용

- 메뉴·창단·이름 입력·구단 교체/이어하기·명단/판매/협상·리그/시장·육성/행동·계약·재정/스폰서/대출/주식·코치/시설·선수 이벤트·해체·연습 설정/보상·지도·전술·장비·통계/하이라이트의 설명문에 처리 표시를 추가했다. 사이트 하단 저장 안내도 포함한다.
- 각 설명의 원본 노드와 ID를 유지하면서 해당 카드·패널·폼·대화상자의 하단 안내 영역으로 이동한다. 본문은 14px, 높은 대비와 넓은 줄 간격으로 표시한다.
- 하단 영역의 실제 너비에서 표시 높이/줄 높이를 측정한다. 3줄 미만이면 안내를 바로 표시하고, 3줄 이상이면 제목이 있는 설명 버튼을 표시한다. 창 크기와 숨김 상태가 바뀌거나 내용이 갱신되면 다시 측정한다.
- 긴 설명은 16px 본문·문단으로 읽게 하며, 장비 설명의 성능 표 등 구조가 있는 내용도 보존한다. 닫기 또는 Esc로 복귀한다. 이전 육성 설명 4개와 MR12 규칙창은 이미 긴 설명을 분리한 방식으로 유지한다.
- 설명 열기는 게임 화면을 재생성하거나 선택·날짜·기록을 변경하지 않는다. 확인창과 이벤트/행동 선택창 위에서도 별도 설명을 열 수 있다. 설명창 Esc가 확대 경기 화면까지 닫지 않도록 처리했다.
- 설명이 비면 안내 영역을 숨기고, 경기 결과에 복사된 안내는 버튼을 다시 연결한다. 화면 제거 시 관찰과 열린 설명창을 정리한다.
- 현재 자금·가격·계약 조건·선택 효과·진행 상태·오류·거래/정산 결과는 바로 표시한다. 게임 규칙과 저장 형식은 바꾸지 않았다.

## 사용자 작업

- 개발 서버 실행 중: http://127.0.0.1:5173/ 에서 새로고침한다. 재실행이 필요하면 일반 Node.js 환경에서는 `npm.cmd run dev:start`를 사용한다.
- [x] 메뉴·종목 선택·창단 화면과 구단 교체/이어하기 확인창의 설명 배치를 확인한다.
- [x] 구단의 모든 탭, 재정 세부 항목, 선수 영입·리그 화면에서 짧은 설명은 영역 하단에, 긴 설명은 설명 버튼으로 표시되는지 확인한다.
- [x] 창 너비를 바꾸어 2줄↔3줄로 달라지는 설명이 본문/버튼으로 전환되는지 확인한다.
- [x] 1주 진행에서 행동을 바꾼 뒤 설명을 열고 닫거나 Esc를 눌러도 선택과 부모 창이 유지되는지 확인한다. 취소 시 날짜는 진행되지 않아야 한다.
- [x] 팀 연습의 장비·수동/자동 전술·내용에서 설명을 열고 닫고, 확대 중 Esc가 설명만 닫는지 확인한다.
- [x] 설명의 글자 크기·색상·문단·간격을 확인하고 결과를 전달한다.
- 확인 결과: 2026-11-10 사용자가 다른 진행 중 작업 전체를 명시적으로 완료 승인했다. 개별 추가 재검증을 뜻하지 않는다.

## 사용자 추가 수정 — 시설 설명 통합·재정 요약 확대

- 요청: 시설 카드의 단계별 비용 설명 버튼을 없애고 내용을 하단 안내로 통합한다. 하단의 긴 설명은 하나의 버튼으로 표시하며, 구단 재정의 다음 정산·수입·비용 요약 글자를 키운다.
- [x] 시설 카드별 반복 설명 3개를 제거하고 시설 영역 하단의 `시설 이용 안내` 설명 하나로 통합했다. 구매·강화/비용·훈련 효과·유지비/저장 내용을 소제목으로 정리했다.
- [x] 재정 요약에 전용 스타일을 적용했다. 글자는 10px에서 16px로 확대하고 대비·줄 간격·배경·여백을 보강했다.
- [x] 수정 관련 검사·문법·빌드 확인
  - `node --test tests/facilities.test.js tests/finance.test.js tests/finance-sections.test.js tests/description-notes.test.js`: 30개 통과.
  - 변경 JS 2개 `node --check`와 Vite 빌드 통과(99개 모듈).
  - 일회성 정적 확인: 시설 안내 1개·중복 문구 제거·시설 카드/단계별 표 3개 유지·안내 하단 순서·재정 요약 전용 클래스·게임 상태 보존 통과.
  - 최신 시설/재정 소스 HTTP 200 확인. 실제 글자 크기와 배치는 사용자 확인 대기다.
- [x] 사용자 실제 화면 확인: 시설 카드의 반복 설명 버튼이 사라지고 맨 아래 `시설 이용 안내 설명` 하나로 내용을 확인할 수 있어야 한다. 재정 요약은 더 큰 글씨로 표시되어야 한다.


## 사용자 추가 수정 — 재정 요약 항목별 배치

- 요청: 다음 정산·수입·주급·유지비·이자를 나열한 긴 문장을 깔끔하게 정리한다. 높이는 한 줄 정도 늘어도 되며 가시성을 우선한다.
- 진행 순서: 상단 정산 시점/수입/총 비용과 하단 비용 내역으로 배치 → 관련 문법·빌드·기존 재정 검사 → 사용자 화면 확인.
- [x] 상단은 다음 정산·스폰서 수입·주간 총 비용 3개 열, 하단은 선수 주급·코치 주급·시설 유지비·대출 이자 4개 열로 정리했다. 항목명은 14px, 상단 값은 21px, 세부 비용은 16px로 구분하며 수입/총 비용은 별도 색상으로 강조했다. 작은 화면에서는 열을 줄여 배치한다.
- [x] 수정 관련 검사·문법·빌드 확인
  - `node --test tests/finance.test.js tests/finance-sections.test.js tests/coaches.test.js tests/facilities.test.js tests/sponsors.test.js tests/season-sponsors.test.js tests/loans-bankruptcy.test.js`: 63개 통과.
  - `src/ui/finance-panel.js`, `tests/finance.test.js`, `tests/coaches.test.js` 문법 검사 통과.
  - Vite 빌드 통과(99개 모듈), 최신 재정 소스 HTTP 200 및 새 배치 클래스 제공 확인.
  - 기존 재정/코치 화면 검사는 태그를 제거한 텍스트에서 금액을 확인하도록 조정했다. 재정 계산식은 유지했다.
- [x] 사용자 확인: 숫자와 제목이 구분되고 주간 총 비용을 쉽게 찾을 수 있는지 확인한다.



## 2026-11-10 일괄 완료 승인

- 사용자의 “다른 진행 중 작업은 완료처리” 요청에 따라 구현된 범위와 사용자 확인/완료 승인 단계를 종료했다. 기존 검사 이력과 한계는 보존하며 개별 항목을 추가로 실행·검증했다고 기록하지 않는다. 새로 남은 난이도/AI 조정 작업은 이 완료 범위에 포함하지 않는다.

# 작업: 웹사이트 전체 표 가시성 개선

- 상태: 완료 — 2026-11-10
- 구현 관련 파일:
  - `src/styles.css`
  - `src/ui/screens.js`
  - `src/ui/contracts-panel.js`
  - `src/ui/training-panel.js`
  - `src/ui/finance-panel.js`
  - `src/ui/facilities-panel.js`
  - `src/ui/stocks-panel.js`
  - `src/ui/match-panel.js`
  - `src/ui/practice-screen.js`
  - `src/ui/economy-panel.js`

## 요청 사항

- 주전·후보 명단에서 시작한 가시성 개선을 사용자 요청으로 웹사이트 내 모든 표로 확대한다.
- 글자·핵심 수치·열 너비·행 구분·스크롤을 정리하고 표마다 조작과 비교가 쉬워야 한다.

## 진행 현황

- [x] 전체 표 구현 위치와 기존 조작·검사 확인
- [x] 전체 11개 표 템플릿과 이를 재사용하는 화면에 개선 적용
- [x] 공통 가독성과 표별 열·수치·입력 조작 배치 정리
- [x] 관련 검사·문법·빌드·정적 목록·최신 코드 제공 확인
  - `node --test tests/roster-screen.test.js tests/roster.test.js tests/club-rosters-market.test.js tests/player-sales.test.js tests/sale-holding.test.js tests/club-tabs.test.js tests/contracts.test.js tests/weekly-actions.test.js tests/training.test.js tests/player-development.test.js tests/player-condition.test.js tests/happiness.test.js tests/finance.test.js tests/finance-sections.test.js tests/stocks.test.js tests/stock-charts-news.test.js tests/facilities.test.js tests/coaches.test.js tests/description-notes.test.js tests/economy.test.js tests/match.test.js tests/practice-screen.test.js tests/highlights.test.js`: 223개 통과.
  - UI JS 전체 23개 `node --check` 통과.
  - `node node_modules/vite/bin/vite.js build`: 99개 모듈 빌드 통과. 마지막 CSS 조정 후에도 빌드를 재확인했다.
  - 일회성 전체 표 정적 확인: 11개 표 템플릿 모두 전용 클래스와 이름·키보드 초점이 있는 스크롤 영역을 갖는지 확인했다.
  - 최신 명단·계약·주식 소스와 스타일 HTTP 200 확인.
  - PATH에 node가 없어 `C:/Program Files/Adobe/Adobe Creative Cloud Experience/libs/node.exe`로 실행했다.
- [x] 사용자 실제 화면·동작 확인
- [x] 사용자 완료 승인

## 구현 내용

- 대상은 내 구단/선수 영입/리그 구단 명단, 능력·경험치, 주간 행동 선택, 선수 계약, 시설 단계별 비용, 재정 정산 이력, 주식 보유·거래와 가격 이력, 경기 통계와 라운드 결과, 장비 성능 표다. 설명창과 경기 결과창에 복사된 표도 같은 스타일을 사용한다.
- 기존 공통 table/table-scroll 스타일과 공통 명단 표를 재사용한다. 표별 클래스로 열 너비·수치 정렬·조작 폭을 구분한다.
- 공통 본문 수치는 16px, 표 제목은 14px, 보조 정보는 대체로 13px로 정리했다. 표의 용도에 따라 핵심 수치·금액·KDA/ADR은 18~24px로 강조한다. 행 배경을 번갈아 적용하고 비교 중인 행을 표시한다.
- 가로로 스크롤할 때 선수 이름·종목·정산 시점 등 첫 열을 고정하고, 세로 스크롤 영역에서는 제목 행도 고정한다. 모든 표의 스크롤 영역에 이름과 키보드 초점을 제공한다. 병합된 빈 상태 셀은 고정하지 않는다.
- 공통 명단은 선수/소속/포지션/능력치/조작에 맞춰 열 폭을 구분한다. 에임·지능·체력에 육성 표와 같은 색을 적용하고, 닉네임·실명·포지션·교체/영입 조작을 읽기 쉽게 한다. 내 구단 상단의 주전/후보 인원 표시를 유지한다.
- 계약과 주간 행동 표는 선택창·버튼 크기와 조작 열 폭을 확보한다. 육성 표는 상태·잠재력·경험치 보조 글자도 확대한다.
- 정산과 주가 이력은 금액을 오른쪽에 정렬한다. 주식 거래 표는 수량 입력·매수/매도 버튼 공간을 확보한다. 시설 표는 현재 단계 강조를 유지한다.
- 경기 통계는 좁은 패널에서도 읽을 수 있는 최소 열 폭을 사용하고 KDA·ADR을 강조한다. 사망 상태·팀 구분·실제 기록을 유지한다. 라운드 결과는 점수를, 장비 표는 가격과 성능 비교를 강조한다.
- 정렬·페이지 이동·선수 교체/판매·계약·행동 선택·거래·경기 계산과 저장 형식은 바꾸지 않았다. 자동 검사 통과를 실제 브라우저 표시 확인으로 기록하지 않는다.

## 사용자 작업

- 접속: http://127.0.0.1:5173/ 에서 새로고침한다. 서버 재실행이 필요하면 일반 Node.js 환경에서 `npm.cmd run dev:start`를 사용한다.
- [x] 내 구단 명단·육성·계약·시설 표의 글자·수치·행 구분과 조작을 확인한다.
- [x] 선수 영입·리그 구단 명단에서 선수 비교·정렬·페이지 이동과 가로 스크롤을 확인한다.
- [x] 재정의 정산 이력·주식 보유/거래·최근 가격 표에서 금액과 입력/거래 버튼을 확인한다.
- [x] 1주 진행 창에서 행동을 선택하고, 창을 취소해도 날짜가 진행되지 않는지 확인한다.
- [x] 경기 통계·라운드 결과·장비 성능과 결과/설명창 안의 표도 같은 가독성으로 표시되는지 확인한다.
- [x] 좁은 화면에서 가로 스크롤·첫 열 고정·키보드 접근과 긴 이름/큰 금액의 줄바꿈을 확인한다.
- 확인 결과: 2026-11-10 사용자가 다른 진행 중 작업 전체를 명시적으로 완료 승인했다. 개별 추가 재검증을 뜻하지 않는다.

## 사용자 추가 수정 — 주식 영역 가로 스크롤 제거

- 확인 결과: 사용자가 전체 표 개선은 잘 적용됐다고 전달했다. 주식 투자 영역에 가로 스크롤이 생겨, 글자를 조금 줄여도 되니 가로 스크롤 없이 영역 안에서 보이도록 수정 요청했다.
- 원인: 주식 보유·거래 표의 최소 너비 1040px, 주가 이력 표의 최소 너비 780px가 실제 주식 패널 폭보다 컸다.
- [x] 주식 보유/거래·주가 이력 표의 최소 너비를 0으로 바꿔 패널 너비에 맞췄다. 글자는 13~14px, 보조 정보는 12px로 조정하고 셀 여백을 줄였다. 거래 입력/매수/매도/전량 매도는 2열 2행으로 배치하며 긴 내용은 줄바꿈한다. 가로 넘침을 숨겨 내용을 자르는 방식은 사용하지 않았다.
- [x] 수정 관련 확인·빌드
  - `node --test tests/stocks.test.js tests/stock-charts-news.test.js tests/finance-sections.test.js`: 23개 통과.
  - Vite 빌드 통과(99개 모듈). 최신 CSS HTTP 200 및 최소 너비 제거 스타일 제공 확인.
  - CSS만 변경했으며 새 JS 문법 확인은 필요하지 않았다. 실제 브라우저 폭에서의 스크롤 제거는 사용자 확인 대기다.
- [x] 사용자 실제 화면 확인
- 사용자 확인 절차: 재정·스폰서 → 주식 투자에서 새로고침 후 종목·가격·보유·손익·거래 버튼이 가로 스크롤 없이 표시되는지 확인한다. 최근 12주 가격도 펼쳐 확인한다.


## 2026-11-10 일괄 완료 승인

- 사용자의 “다른 진행 중 작업은 완료처리” 요청에 따라 구현된 범위와 사용자 확인/완료 승인 단계를 종료했다. 기존 검사 이력과 한계는 보존하며 개별 항목을 추가로 실행·검증했다고 기록하지 않는다. 새로 남은 난이도/AI 조정 작업은 이 완료 범위에 포함하지 않는다.

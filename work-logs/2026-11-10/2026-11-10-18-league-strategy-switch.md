# 작업: 리그별 연패 전술 전환 기준

- 상태: 사용자 확인 대기
- 구현 관련 파일: `src/config/opponent-strategy.js`, `src/simulation/opponent-strategy.js`, `src/simulation/practice.js`, `tests/opponent-strategy.test.js`, `scripts/calibrate-opponent-strategy.js`, `PROGRESS.md`

## 요청 사항

- 같은 진영의 연패에 따른 전술 전환을 PC방 6·시 4·도 3·전국 2·세계 1연패로 변경한다.
- PROGRESS.md의 현재 진행 중인 작업은 1번에 관한 내용만 남긴다. 다른 작업 목록과 참고 정보는 별도 항목으로 옮겨 보존한다.

## 진행 현황

- [x] 각 구단 리그에 따른 전환 기준 연결
- [x] 리그별 경계·공수 분리·승리 초기화·관전/AI 연결 검사 — `node --test tests/opponent-strategy.test.js tests/official-match.test.js tests/practice-screen.test.js` 41개 통과. [검사 출력](league-strategy-switch-tests.txt).
- [x] 문법·빌드 확인 — 변경 JS/검사 5개 `node --check` 통과, `npm.cmd run build` 109개 모듈 통과. [빌드 출력](league-strategy-switch-build.txt).
- [x] 문서 정리 — 현재 진행 항목은 1번에 필요한 내용만 유지. 남은 12개 목록은 별도 ‘남은 작업 목록’, 시즌/환경/과거 기록은 ‘참고 자료·확정 규칙’으로 이동해 보존.
- [ ] 사용자 확인

## 구현 내용

- 전환은 기존대로 다음 구매 단계에서만 일어나며 공격·수비 연패를 따로 센다. 승리하면 해당 진영 연패를 초기화한다.
- 관전 상대와 AI 간 경기 모두 같은 엔진에서 각 구단의 leagueId로 기준을 정한다. 리그 정보 없는 기존 연습용 팀은 PC방 기준을 사용한다.
- 저장 형식·선수 능력·기존 완료 상태는 유지한다.
- 진단 스크립트의 시제품 전환도 실제 설정을 사용한다. 기존 672경기 자료는 과거 설정 시점의 결과로 보존하며 새 난이도 실험은 수행하지 않았다.

## 사용자 작업

- PC방 공식 경기에서 같은 진영 2~5연패에는 기존 전술을 유지하고 6연패 후 다음 구매 단계에 변경되는지 확인한다.
- PROGRESS.md 현재 진행 항목에 1번 재개에 필요한 내용만 남았는지 확인한다.

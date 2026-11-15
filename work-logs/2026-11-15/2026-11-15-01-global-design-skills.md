# 작업: 디자인 스킬 전역 설치와 UI 개편 준비

- 상태: 완료 — 2026-11-15
- 완료 근거: 2026-11-15 사용자의 ‘지금까지 한 작업 전부 완료처리’ 지시로 구현·검증 범위와 확인 대기를 종료했다. 개별 수동 테스트를 새로 수행했거나 사용자가 결과를 보고한 것으로 간주하지 않는다.

- 구현 관련 파일:
  - `C:/Users/zmdk5/.agents/skills/unslop/`
  - `C:/Users/zmdk5/.agents/skills/frontend-design/`
  - `C:/Users/zmdk5/.agents/skills/ui-ux-pro-max/`
  - `PROGRESS.md`

## 요청 사항

- Unslop·Frontend Design·UI/UX Pro Max의 최신 공식 파일과 설치 방법을 확인하고, 안전성 검토 후 사용자 홈의 `.agents/skills/`에 중복 없이 설치한다.
- 프로젝트 상태를 확인하고 백업한다. 게임 규칙·밸런스·선수 능력과 성장·경기 계산·리그·승강·이적·계약·경제·저장 구조·이미지·진행 데이터는 보존한다.
- 선수 생애보다 ETH UI 개편을 먼저 진행한다. Football Manager의 정보 밀도와 e스포츠 중계 분위기, 차콜·네이비, 절제된 강조색, 정돈된 표·카드, 일관된 조작 상태를 적용한다.
- 애니메이션은 짧은 조작 피드백과 영입·승패·승격·우승·능력 변화에 집중한다. 과도한 네온·파티클·블러·지속 움직임은 제외한다.

## 진행 현황

- [x] Git 상태와 기존 설치 확인
  - 프로젝트와 상위 경로에 `.git`이 없고, PATH 및 일반 설치 위치에서 Git 실행 파일을 찾지 못했다. Git 기준 변경 목록은 확인할 수 없으며 저장소 초기화나 Git 설치는 하지 않았다.
  - 사용자 `.agents/skills/`와 `.codex/skills/`에서 동일 이름의 기존 설치가 없음을 확인했다. 프로젝트 전용 스킬은 생성하지 않았다.
- [x] 변경 전 프로젝트 백업·해시 검증
  - 위치: `C:/Users/zmdk5/Desktop/ETH-backups/2026-11-15-before-design-skills-012620/project/`
  - `robocopy /E /COPY:DAT /DCOPY:DAT /R:0 /W:0 /XJ`로 복사했다. 실행 중인 `.dev-server/`와 `.portrait-preview-chrome/` 임시 폴더만 제외했다. `src/`, `tests/`, `Image/`, 문서·작업 이력, 설정·잠금 파일, `dist/`, `node_modules/`는 포함했다.
  - `node C:/Users/zmdk5/ETH-design-skill-review/2026-11-15/verify-project.mjs`: 1,506개 파일·2,058,836,308바이트의 원본/백업 SHA-256이 모두 일치했다. 백업 상위 폴더의 `manifest.json`에 보존했다.
  - 브라우저의 실제 게임 저장을 추출하거나 변경하지 않았다. 위 백업은 브라우저 저장 데이터의 별도 백업을 의미하지 않는다.
- [x] 공식 README·SKILL.md·실행 스크립트 검토 및 최신 커밋 고정
  - Unslop: `97daa3eb365670ea3f87ed85356cbfcee18105a5`.
  - Frontend Design: `1780c5e5a552fd4d1c9d6a7b0cab26b0c2bef064`.
  - UI/UX Pro Max: `d643997c82e94742dd3bee43210b0198e8bbba3d`.
  - GitHub 기본 브랜치의 최신 커밋과 재귀 파일 목록을 API로 확인했다. 내려받은 63개 원본 파일은 Git blob 해시를 대조했다. 이 수는 설치 파일 수와 같지만 구성은 다르다. 설치에서는 UI 템플릿 3개 대신 생성한 SKILL.md와 라이선스 파일을 포함했다.
- [x] 전역 설치 및 파일 검증
  - `node C:/Users/zmdk5/ETH-design-skill-review/2026-11-15/install-reviewed-skills.mjs`: Unslop 15개, Frontend Design 2개, UI/UX Pro Max 46개 파일 설치·원본 대조 통과.
  - UI/UX Pro Max는 공식 최신 Codex 템플릿의 전역 경로를 사용해 SKILL.md를 생성했다. 템플릿 자리표시자가 남지 않았고 `~/.agents/skills/ui-ux-pro-max/scripts/search.py`를 가리키는지 확인했다.
  - `node --check`로 Unslop의 `snapshot.mjs`, `story.mjs` 문법 검사 통과. 브라우저·영상 스크립트는 실행하지 않았다.
  - 설치 명세와 SHA-256: `C:/Users/zmdk5/ETH-design-skill-review/2026-11-15/installation-receipt.json`.
  - `node C:/Users/zmdk5/ETH-design-skill-review/2026-11-15/verify-final.mjs`: 백업 명세 1,506개 파일을 다시 대조해 PROGRESS.md 수정과 이 로그 추가만 확인했다. 게임 코드·이미지·설정 등 보호 파일은 모두 동일하다. PROGRESS.md의 로컬 링크도 모두 확인했다. 프로젝트 코드 변경이 없어 게임 검사·빌드는 재실행하지 않았다.
- [x] 의존성·권한 확인
  - Node.js·npm은 사용 가능하다. `python --version`은 종료 코드 1이며 Windows 실행 별칭만 존재한다. 실행 가능한 Python 3를 찾지 못해 Python 검색 스크립트의 실행·문법 검증은 수행하지 못했다.
  - Playwright와 ffmpeg는 찾지 못했다. Playwright는 Unslop 화면 캡처에, ffmpeg는 선택적인 스토리 영상 제작에 필요하다. 일반 디자인 지침 사용에 필수인 의존성과 구분한다.
  - 관리자 권한·시스템 설정 변경·유료 API·신규 프로젝트 의존성 설치는 사용하지 않았다.
- [x] 후속 02번 작업에서 세 전역 스킬 인식을 확인했고 재설치·재시작 없이 사용했다.
- [x] 02~10번 UI 작업 로그에서 단계별 구현·검증을 진행했고 이번 일괄 완료 승인을 받았다.

## 구현 내용

- 프로젝트 변경은 이 작업 로그와 PROGRESS.md에 한정한다. 게임 코드·설정·이미지·진행 데이터는 수정하지 않았다.
- `skill-installer`의 Python 설치 도우미는 실행 환경이 없어 사용하지 못했다. 공식 경로에서 고정 커밋 파일을 내려받아 Git blob 해시를 검증하고, 기존 대상 폴더가 있으면 중단하는 방식으로 설치했다.
- UI/UX Pro Max 공식 README는 CLI 설치를 권장한다. 최신 npm 패키지 `ui-ux-pro-max-cli@2.15.0`을 `npm pack --ignore-scripts`로 검토했으나, CLI가 요청 외 스킬 6개를 함께 설치하며 기본 브랜치보다 오래된 템플릿을 포함해 실행하지 않았다. 요청 범위를 지키기 위해 최신 GitHub 원본과 공식 템플릿 렌더링 규칙으로 해당 스킬만 구성했다.
- Frontend Design은 실행 스크립트가 없다. UI/UX Pro Max 검색 코드는 로컬 데이터와 Python 표준 라이브러리를 사용하며, 결과 파일 저장은 명시적인 persist 옵션에서 수행한다. Unslop 캡처는 지정한 페이지와 그 리소스에 접근하고 로컬 결과를 쓴다. 영상 도우미는 로컬 서버·ffmpeg 실행 및 입력 폴더 아래 `.story-frames` 삭제/재생성을 포함하므로 추후 영상 요청 시 전용 출력 폴더에서만 사용한다. 설치 검토 범위에서 고정 외부 업로드·비밀값 수집·권한 상승 동작은 발견하지 못했으며, 실행 안전성 전체를 보증하는 결과는 아니다.
- 라이선스·저작자 표시를 보존했다. Unslop은 CC BY 4.0, Frontend Design은 Apache 2.0, UI/UX Pro Max는 MIT다.

## 사용자 작업

- [x] 사용자 일괄 완료 승인으로 대기 종료 — 기존 확인 항목: 다음 요청에서 스킬 인식 확인
  - 수행 절차: 다음 메시지에서 세 스킬을 사용한 UI 작업을 요청한다. 자동 인식이 갱신되지 않으면 Codex를 재시작하고 이 로그와 PROGRESS.md에서 이어간다.
  - 기대 결과: 사용자 전역 설치를 인식하고 프로젝트 규칙·보호 조건 안에서 스킬을 사용한다.
  - 확인 결과: 2026-11-15 사용자 일괄 완료 승인. 개별 실사용 결과는 별도로 보고되지 않았다.
- [x] 사용자 일괄 완료 승인으로 대기 종료 — 기존 확인 항목: UI 개편 요청 분할
  - 권장 순서: 공통 스타일·내비게이션 → 선수·경영 화면 → 경기·리그 화면과 이벤트 연출 → 해상도·접근성 통합 확인.
  - 각 요청의 실제 화면 범위는 착수 시 확정한다. Python 기반 검색을 사용할 경우 먼저 Python 3가 필요하며, 이번 작업에서는 설치하지 않았다.
  - 확인 결과: 후속 UI 작업에서 해당 범위를 진행했고 2026-11-15 사용자 일괄 완료 승인을 받았다.

## 확인한 공식 자료

- [Unslop README](https://github.com/heydamir/unslop)
- [Frontend Design SKILL.md](https://github.com/anthropics/skills/tree/main/skills/frontend-design)
- [Anthropic Skills README](https://github.com/anthropics/skills)
- [UI/UX Pro Max README](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)

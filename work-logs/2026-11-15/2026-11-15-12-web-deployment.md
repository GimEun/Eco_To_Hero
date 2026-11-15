# 작업: GitHub 비공개 저장소와 Cloudflare Pages 배포 준비

- 상태: 완료 — 2026-11-15
- 완료 범위: 로컬 배포 준비·검증과 승인된 상담 초상화 제거. 사용자의 ‘지금까지 한 작업 전부 완료처리’ 지시로 완료했다. 외부 업로드·공개 배포 승인은 이번 지시에 포함되지 않으며 다음 작업으로 이관한다. 실제 배포 완료를 의미하지 않는다.
- 구현 관련 파일:
  - `.gitignore`, `.node-version`, `public/_headers`, `index.html`, `docs/DEPLOYMENT.md`
  - `src/ui/counseling-dialog.js`, `src/styles.css`, `tests/counsel-content.test.js`

## 요청 사항

- 기존 게임·저장·에셋을 보존하며 GitHub Private `eco-to-hero`와 Cloudflare Pages Free 배포를 준비한다. 최초 업로드·계정 권한·공개 배포 전 승인을 받는다.

## 진행 현황

- [x] 수정 전 외부 ZIP 생성·전체 항목 열기·원본 SHA-256 비교 검증.
  - `C:/Users/zmdk5/Desktop/ETH-backups/deployment-20261115-043442/ETH_Backup_Before_Deployment.zip`, 281,841,669바이트, 1,118개 파일. 읽기 전용이며 이후 수정·삭제하지 않는다.
  - node_modules·dist·개발 서버/브라우저 프로필·캐시·coverage 제외. 로컬 설정이 존재하면 백업에 보존하며 외부 전송하지 않는다.
- [x] 구조 분석: Vanilla JS·Vite 8.3.6, IndexedDB + JSON 백업, 외부 API·백엔드·로그인 없음. 유형 A 정적 배포 가능.
- [x] 공식 GitHub CLI 2.104.0·MinGit 2.56.1·Node 24.22.3 LTS를 `C:/Users/zmdk5/.local/share/eth-tools/`에 설치하고 공식 SHA-256을 검증했다. 관리자 권한·PATH·시스템 설정 변경 없음.
- [x] 로컬 `main` Git 초기화. 아직 stage·커밋·remote·업로드 없음. GitHub 인증 없음, Cloudflare API 환경변수 없음.
- [x] 최소 배포 설정·운영 절차 문서화. 계정 권한 부여·서비스 연결은 하지 않음.
- [x] 사용자 삭제 에셋은 복구하지 않음. 별도 승인에 따라 상담 초상화 영역·해당 참조만 제거하고 상태·답변·저장 유지.
- [x] 빌드·자동 검사·산출물·민감정보 및 업로드 목록 검토.
  - Node 24.22.3 `--test`: **790개 통과**, 실패·취소·생략 0, 약 187.3초. 기존 저장·경기·리그·상담 검사 포함.
  - 기존 프로젝트 밖 ESLint 적용: JavaScript **245개 파일, 오류 0·경고 0**. TypeScript 없음.
  - 동일 Node로 `node node_modules/vite/bin/vite.js build`: **139개 모듈**, 최종 빌드 성공. 배포 설정 외 새 npm 의존성·lockfile 변경 없음.
  - 빌드 결과를 Vite preview `http://127.0.0.1:4173/`에서 격리 Edge 프로필로 확인: **62개 자동 확인**, 1440×900·390×844에서 구단 탭 7개와 리그·영입·시즌·연습·구단 이동, 페이지 가로 넘침 없음. 창단 자동 저장·수동 저장·새로고침 후 이어하기·JSON 내보내기/가져오기 게임 데이터 일치. 저장 시간은 매 저장마다 바뀌므로 world 상태를 비교했다.
  - 최종 자동 브라우저 검사에서 네트워크 실패·미처리 예외 0. 파비콘 자동 요청 404는 빈 data 아이콘 선언으로 정리했다. 실제 공개 사이트·HTTPS 헤더·공식 경기 장기 진행·사용자 원래 저장은 확인하지 않았다.
  - 보호 대상 game/simulation/config/data/storage·기존 Image·package 파일·배너 **182개 해시 동일**. 원본 ZIP 읽기 전용·최종 SHA-256 불변.
  - 업로드 후보의 키·토큰·개인 키·비밀번호·이메일 패턴 탐지 없음. 과거 문서의 로컬 사용자 경로가 있어 Private 검토 범위로 명시했다. 자동 검사가 모든 비밀을 보증하지 않으므로 업로드 승인 시 목록도 확인한다.
  - 환경변수 파일은 현재 루트에 없으며 GitHub·Cloudflare 토큰 환경변수도 없다. `.env*`·인증키·node_modules·dist·개발 브라우저 프로필·ZIP의 Git 제외와 `.env.example` 예외를 확인했다.
  - 과거 실험 JSON 340개·1,726,323,976바이트는 삭제하지 않고 Git에서만 제외했다. 업로드 파일별 크기·SHA-256 목록과 최종 집계는 `C:/Users/zmdk5/ETH-deployment-review/2026-11-15/upload-manifest.json`, `upload-files.txt`, `upload-audit.json`에 보관한다.
  - 빌드 산출물 76개·약 106.76MB, 최대 파일 1,939,787바이트로 Free 파일 수·25MiB 제한 내. 실제 Cloudflare 무료 프로젝트·할당량·주소 사용 가능 여부는 미확인이다.
- [x] 2026-11-15 사용자 일괄 완료 승인으로 로컬 준비 범위를 종료하고 미수행 외부 배포를 PROGRESS.md의 다음 작업으로 이관했다. 개별 수동 테스트 결과를 새로 확인한 것은 아니다.
- [x] 문서 정리만 수행했으며 이번 완료 처리에서 게임 검사·빌드를 재실행하지 않았다. 아래 790개 검사·빌드·브라우저 결과는 앞서 실제 수행한 기록이다.

## 구현 내용

- Pages 빌드 `npm run build`, 출력 `dist`, Node `.node-version`, main 정식/develop 미리보기 구성을 문서화했다. 브라우저 저장의 주소별 분리와 JSON 이전, 무료 한도·롤백·개인 도메인 절차를 포함했다.
- `.gitignore`는 개발 환경·브라우저 프로필·환경변수·백업·인증키·캐시를 제외한다. `.env.example`만 예외다.
- 상담 초상화 전용 모듈과 CSS를 제거했다. 상담 내용·상태·선택·기존 효과·저장 형식은 변경하지 않았다.
- Git은 stage·커밋·remote 없는 로컬 main 상태다. 첫 커밋 후 develop을 생성하도록 절차를 준비했으며, 브랜치별 자동 빌드는 아직 연결하지 않았다. Wrangler·유료 서비스·새 프레임워크는 추가하지 않았다.

## 주요 결정

- 사용자는 삭제한 29개 에셋을 복구하지 않도록 명시했다. 이어서 삭제 이미지의 현재 참조를 설명한 뒤 초상화 영역만 제거하고 상담 기능을 유지하도록 승인했다.

## 다음 배포 작업의 사용자 조치 — 이번 완료 범위 밖

- 최신 재개 순서는 `../../PROGRESS.md`의 「다음 작업 순서」와 「남은 작업 목록」을 따른다. 현재 승인·계정 인증·업로드·공개 배포는 수행하지 않았다.
- 이번 문서 갱신으로 기존 업로드 목록의 문서 해시는 오래됐다. 다음 작업에서 `C:/Users/zmdk5/ETH-deployment-review/2026-11-15/audit-upload.mjs`로 목록·민감정보 검사를 갱신하고 변경된 목록을 보여준 뒤 승인받는다. 기존 778개·128,878,071바이트 수치는 이전 목록의 기록이며 최신 승인 대상으로 그대로 사용하지 않는다.

- [ ] 업로드 목록과 Private 설정을 검토하고 최초 업로드 승인. GitHub CLI 공식 브라우저 인증 및 커밋 작성자 정보 지정.
  - PowerShell 인증 실행: `& 'C:/Users/zmdk5/.local/share/eth-tools/gh/bin/gh.exe' auth login --hostname github.com --git-protocol https --web`
  - 인증 후 소유 계정과 동일 이름 저장소 존재 여부·비공개 설정을 먼저 확인한다. 승인 범위는 Private 최초 업로드이며 공개 배포 승인은 별도다.
- [ ] Cloudflare 계정 로그인·GitHub App의 해당 저장소 권한 부여와 공개 테스트 사이트 배포 승인.
- [ ] 실제 배포 URL에서 주요 화면·게임·저장·새로고침·모바일 확인. 현재 실제 URL은 생성되지 않았다.

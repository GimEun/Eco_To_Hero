# GitHub + Cloudflare Pages 배포

## 구성

ETH는 JavaScript ES 모듈·HTML·CSS와 Vite를 사용하는 정적 웹게임이다. 별도 백엔드, 로그인, 외부 API, 서버 DB가 필요하지 않다. 브라우저 IndexedDB의 `eco-to-hero` / `saves` / `active`에 저장하며 JSON 내보내기·가져오기를 지원한다. 게임 저장 형식은 배포 때문에 변경하지 않는다.

| Pages 설정 | 값 |
|---|---|
| 요금제 | Free |
| 생성 방식 | Pages → Connect to Git → GitHub |
| GitHub 저장소 | 인증된 계정의 `eco-to-hero`, **Private** |
| 희망 프로젝트 이름 | `eco-to-hero` (사용 가능 여부 확인 필요) |
| 프레임워크 프리셋 | None |
| 루트 디렉터리 | 저장소 루트 |
| 빌드 명령 | `npm run build` |
| 출력 디렉터리 | `dist` |
| Node.js | `.node-version`의 `24.22.3` |
| 정식 브랜치 | `main` |
| 미리보기 브랜치 | `develop` 및 필요 시 작업 브랜치 |
| 런타임 환경변수 | 없음 |

`package-lock.json`과 기존 Vite 버전을 유지한다. Node 버전은 Pages가 지원하는 `.node-version`으로 지정한다. 기존 `NODE_VERSION` 환경변수가 있다면 파일과 일치시킨다. [빌드 환경 공식 문서](https://developers.cloudflare.com/pages/configuration/build-image/)

화면 이동은 앱 내부 상태로 처리한다. 별도 `_redirects` 없이 Pages 기본 SPA 동작을 사용한다. `public/_headers`는 빌드 시 `dist/_headers`로 복사되며 MIME 추측 방지·리퍼러 정책·외부 프레임 삽입 방지를 지정한다. Vite preview에서는 Pages 헤더 적용 여부를 검증할 수 없다. [정적 파일·SPA 처리](https://developers.cloudflare.com/pages/configuration/serving-pages/), [헤더 설정](https://developers.cloudflare.com/pages/configuration/headers/)

## 최초 업로드와 연결 — 승인 후 실행

1. 로컬 검증 결과와 업로드 파일 목록을 검토한다. `.env*`의 실제 비밀값, 개인 저장 파일, 인증정보를 포함하지 않는다. GitHub CLI 로그인: `gh auth login --hostname github.com --git-protocol https --web`. 로그인 코드는 공식 GitHub 인증 화면에만 입력하고 토큰을 문서·채팅에 붙이지 않는다.
   - `work-logs/**/*.json`은 대량 실험 결과물로 업로드에서 제외하고 로컬·원본 ZIP에 보존한다. 게임의 `src` 데이터와 `Image` 에셋은 제외하지 않는다. 과거 작업 문서에 로컬 사용자 경로가 있으므로 Private 저장소 범위에서 검토한다.
2. `gh auth status`로 인증을 확인하고 `gh api user --jq .login`으로 소유자를 확인한다. `gh repo view OWNER/eco-to-hero --json nameWithOwner,visibility,url`로 기존 저장소 여부를 확인한다. 인증·권한 오류를 저장소 부재로 간주하지 않는다. 동일 저장소가 있으면 덮어쓰거나 강제 push하지 않고 사용자와 처리 방식을 정한다.
3. 명시적 업로드 승인 후 확정한 파일만 stage하고 staged 목록을 다시 검토한다. Git 작성자 이름·이메일은 사용자가 정한 값을 저장소 로컬에만 설정한다. 임의 신원으로 커밋하지 않는다. 첫 커밋 후 `gh repo create OWNER/eco-to-hero --private --source . --remote origin`으로 비공개 저장소를 만들고, 비공개 여부 확인 후 `git push -u origin main`으로 업로드한다. GitHub CLI의 `--push` 자동 업로드는 검토를 건너뛰므로 사용하지 않는다.
4. 별도의 **공개 배포 승인**과 Cloudflare 계정 인증 후, 대시보드 **Workers & Pages → Create application → Pages → Connect to Git**에서 GitHub를 선택한다. GitHub App 권한은 가능하면 `eco-to-hero` 저장소만 허용한다. 위 표의 설정으로 배포한다. 프로젝트 이름이 이미 사용 중이면 대안을 사용자와 정하고 실제 URL을 기록한다. [공식 Git 연동 절차](https://developers.cloudflare.com/pages/get-started/git-integration/)
5. Pages **Settings → Builds → Branch control**에서 production을 `main`, preview를 `develop` 등으로 지정한다. 첫 커밋 이후 `develop`을 생성·push한다. 이후 `develop` 변경 → 미리보기 검사 → `main` 병합 → 정식 자동 배포 순서를 따른다. [브랜치·자동 배포](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/)

GitHub 비공개 저장소는 소스를 보호하지만 Pages 테스트 URL은 기본적으로 공개다. Preview도 비공개라고 가정하지 않는다. 접근 제한이 필요하면 공개 배포 전에 별도 결정한다. Direct Upload로 먼저 프로젝트를 만들지 않는다. 이 문서는 Git 연동 방식의 배포를 준비한다.

현재 PC의 도구가 PATH에 없다면 설치된 실행 파일의 전체 경로를 사용한다. 설치 위치·파일 목록·검사 결과는 로컬 검토 자료와 작업 기록에서 확인한다. 계정 권한 부여·첫 업로드·공개 배포는 각각 사용자 승인 범위 안에서만 진행한다.

## 배포 전후 검증

로컬에서는 `.node-version`의 Node로 `npm ci`, `npm test`, `npm run build`를 실행한다. 기존 의존성이 이미 lockfile과 일치하면 불필요한 재설치를 하지 않는다. `npm run preview` 후 `http://127.0.0.1:4173/`에서 빌드 결과를 확인한다. TypeScript 프로젝트가 아니므로 별도 타입 검사는 없다.

배포 후 실제 HTTPS URL에서 다음을 확인하며, 실제 확인하지 않은 항목은 완료로 기록하지 않는다.

- 메인 → 새 게임 → 구단 창단 → 선수 관리·육성·재정·전술·리그 화면 이동.
- 팀 연습·공식 경기·라운드 개입·리그 진행. 상담 대화·상태·답변·결과 저장. 삭제한 초상화 이미지는 요청하지 않아야 한다.
- 사용 중인 로고·장비·트로피·배너 로딩, 네트워크 404와 브라우저 콘솔 오류.
- PC·모바일 레이아웃과 버튼·모달 조작.
- 저장 후 새로고침 → 이어하기 → JSON 내보내기·가져오기 → 진행 상태 일치.
- 응답 HTTPS, `_headers` 정책, 배포 커밋과 연결 브랜치.

**저장은 주소별로 분리된다.** localhost·127.0.0.1·pages.dev·preview·개인 도메인은 서로 다른 저장소다. 기존 주소에서 JSON 백업을 내려받고 새 주소에서 가져온다. 새 사이트에서 저장이 없다는 이유로 원래 저장이 삭제된 것은 아니다. 개인 모드·사이트 데이터 삭제·브라우저 정리로 로컬 저장이 사라질 수 있으므로 중요한 게임은 JSON으로 보관한다. 클라우드 저장·동기화·계정 인증은 현재 제공하지 않는다.

비밀 키를 `VITE_*` 또는 브라우저 번들에 넣지 않는다. 향후 외부 API·클라우드 저장이 필요하면 인증·권한 검증과 비밀값을 처리할 서버 구성을 먼저 설계한다. 현재 배포에 그런 서비스는 추가하지 않는다.

## 무료 범위와 복구

공식 Free 제한 확인 기준: 월 500회 빌드, 동시에 1개 빌드, 빌드 제한 20분, 사이트 20,000개 파일 이하, 파일당 25 MiB 이하. 실제 업로드 전 `dist` 개수와 최대 파일 크기를 확인한다. 유료 전환이나 R2 등 추가 서비스를 자동 신청하지 않는다. [공식 제한](https://developers.cloudflare.com/pages/platform/limits/)

빌드 실패 시 로그와 Node·lockfile·출력 경로를 확인하고 수정 브랜치에서 재검증한다. 정상 서비스 중 문제가 생기면 Pages **Deployments → 이전 성공한 production 배포 → Rollback to this deployment**를 사용한다. Preview는 production rollback 대상이 아니다. 소스 수정은 되돌림 커밋 후 정상 빌드를 확인한다. 롤백은 사용자 브라우저 저장을 되돌리지 않으므로 JSON 백업을 별도로 유지한다. [롤백 공식 문서](https://developers.cloudflare.com/pages/configuration/rollbacks/)

## 향후 개인 도메인

도메인을 구입하거나 DNS를 변경하지 않는다. 사용자가 실제 도메인과 변경 승인을 제공한 뒤 Pages **Custom domains → Set up a domain**에서 먼저 등록한다. 루트 도메인은 같은 Cloudflare 계정에 zone을 추가하고 네임서버를 연결한다. `www` 등 하위 도메인은 DNS 제공자의 CNAME을 실제 `<project>.pages.dev`로 연결할 수 있다. Pages 등록 없이 CNAME만 만들지 않는다. [도메인 연결 공식 문서](https://developers.cloudflare.com/pages/configuration/custom-domains/)

루트와 `www`를 각각 연결하고, 사용할 대표 주소를 정한 뒤 다른 주소의 리디렉션을 설정한다. DNS 전파와 Pages의 Active 상태·HTTPS 인증서 발급·두 주소 접속을 확인한다. 인증서 문제 시 DNS·CAA·Cloudflare 상태를 확인한다. 연결 후에도 기존 pages.dev 저장은 자동 이전되지 않으므로 JSON 백업을 가져온다.

# AGENTS.md — ldry-scrtry (정부24 길잡이, 비공식)

크롬 확장. **개인 프로젝트**다: 2026-10-24에 해커톤 폴더(`~/Desktop/KyoboDTS_FullStackDevBootCamp/Hackathon/gvrnmnt24-detector`)에서 이 폴더로 옮겨 해커톤과 분리했다 (사용자 결정). 아래 기록에 나오는 「팀」·「해커톤」은 분리 전 상황이다. **크롬 웹스토어 공개(Public) 배포**가 목표다 (사용자 결정 2026-10-17, `docs/requirementSpec.md` D-7). 배포 현황·중계 서버·공개 전 할 일은 이 문서 아래쪽에 있다. 무엇·어떻게는 `README.md`, 배경 설계는 `reference/slop-detector/usePlan.md` §8, 화면·비밀값·개인정보 공통 규칙은 맨 아래 「공통 규칙」에 있다.
Jev 판단을 고칠 때는 TypeSafe 스킬(`typesafe:typesafe-ai`)을 따르고 공식 문서(https://docs.typesafe.ai/api.md, /primitives/choice.md)를 다시 확인한다.

## 폴더

| 경로 | 내용 |
|---|---|
| (루트) | 확장 + Railway 중계. git 저장소 `Dorazeeing/ldry-scrtry`(비공개) |
| `docs/` | `requirementSpec.md`(요구사항·결정 D-1~D-11. D-6 이후가 이 확장), `jev.md`(TypeSafe Jev 정리, 해커톤 문서 복사본), `usageJev.md`(길잡이가 Jev를 부르는 때), `history.md`(만들 때 입력한 프롬프트 요약) |
| `reference/slop-detector/` | 참고한 오픈소스 [rbilgil/slop-detector](https://github.com/rbilgil/slop-detector)(MIT) 클론 + 피드 지킴이 실험 메모(`AGENTS.md`·`usePlan.md`). **별도 git 저장소이고 `origin`은 원작자 저장소라 push하지 않는다.** `.gitignore`의 `reference/` 줄 때문에 이 저장소 커밋과 `railway up` 업로드에 들어가지 않는다 (지우지 않는다). `npm run smoke`·`scripts/icons.mjs`가 여기 `node_modules`의 Playwright를 빌려 쓴다 |
| `jev-for-chrome/` | 개선 아이디어를 얻으려고 받은 오픈소스 [chy4pro/jev-for-chrome](https://github.com/chy4pro/jev-for-chrome)(MIT, Jev로 탭을 직접 조작하는 확장) 클론. 별도 git 저장소, `.gitignore`에 있어 커밋·`railway up`에 안 들어간다. 고치지 않는다. 아이디어를 가져온 곳에는 코드에 `chy4pro/jev-for-chrome, MIT`를 적었다 |

## 규칙

| 규칙 | 이유 |
|---|---|
| TypeSafe로 보내는 필드를 늘리지 않는다. 늘려야 하면 `sanitize.js`를 거치게 하고 `smoke`의 필드 점검을 함께 고친다 | 로그인 뒤 화면에 주민번호·주소가 있다 |
| 입력 칸의 값(`value`)은 읽지 않는다. "채워졌는지"만 본다 | 개인정보 |
| 안내 목표는 `catalog.js` 목록 항목으로만 만든다. 어르신이 적은 말을 목표 문장에 넣지 않는다 (검색에만 쓴다) | 서류 이름을 모르는 어르신이 적은 말은 틀릴 수 있다. 사용자 결정 (2026-10-17) |
| 약관 「선택」·「전체 동의」·「동의하지 않음」은 후보에서 뺀다. 「필수」만 표시한다 | 사용자 결정 (2026-10-17) |
| 직접 클릭·입력·제출하지 않는다 | 되돌리기 어렵고 공공 사이트 자동화는 약관 문제 |
| **확장에는 TypeSafe 키가 없다.** Jev는 Railway 중계로만 부른다 (아래 「중계 서버」). `storage`(안내 상태·동의)는 `TRUSTED_CONTEXTS`로 잠근다. 동의하기 전에는 중계로 아무것도 보내지 않는다 | content는 페이지와 DOM을 공유. 웹스토어 Disclosure 정책 |
| **우리 TypeSafe 키를 확장 코드·패키지·기본 설정값에 넣지 않는다** (암호화·숨기기도 안 됨) | 공개 확장은 누구나 내려받아 열어 볼 수 있고, 웹스토어 정책상 난독화 금지("must not obfuscate code"). 요청 헤더에도 키가 보인다. TypeSafe 계약서(MCA) §2.4: 키 비밀 유지·공유 금지 |
| 중계는 **이 확장 전용 엔드포인트만** 연다. 질문과 목표 문장은 서버가 만들고, 확장은 `goalId`와 걸러진 화면 정보만 보낸다 | MCA §2.3(a): 서비스를 남에게 제공·재배포 금지 → 아무 Jev 요청이나 대신 보내는 범용 중계는 안 됨. 주소가 새도 다른 용도로 못 씀 |
| 웹스토어 항목(item)은 **하나만** 만들고 새 버전으로 갱신한다. 삭제했다가 새로 올리지 않는다 | 다시 올리면 확장 ID가 바뀌어 중계의 `ALLOWED_ORIGIN`과 사용자 업데이트가 끊기고, 처음부터 재심사. 게시 한도 2개를 피드 지킴이와 함께 쓴다 |
| 사이트 권한은 `src/lib/sites.js`에서 `active: true`인 곳(정부24 + 기관 사이트 12곳, D-9)과 중계 주소뿐. 사이트를 늘리거나 줄일 때는 `sites.js`를 고치고 `manifest.json` matches를 똑같이 맞춘다 (`npm run check`가 검사). **정부24 밖 사이트는 `pageText: false`** — 화면 속 글(제목 글·창 안내 글)을 서버로 보내지 않는다 | 권한 최소화, 출처 있는 사이트만. 홈택스·건강보험은 로그인 뒤 개인 정보가 화면에 나온다 |
| **로그인·회원가입·인증 방법·회원/비회원 버튼은 후보에서 빼고, 로그인 방법을 고르는 화면(`handoff.js`)에서는 테두리를 끄고 "직접 골라 주세요"만 보여 준다. 서버에 묻지 않는다. 모든 사이트에서 같다.** 서류 페이지를 먼저 찾아가게 한다 (사이트 검색 칸이면 서류 이름을 적으라고 알림) | 사용자 결정 (2026-10-17, D-10). 정부24 메인의 「로그인」을 AI가 먼저 가리켰다 |
| **신청서의 고르는 칸(본인·가족, 일반·상세 증명서, 보안 키보드 등)은 후보에서 빼고 사용자가 직접 고른다.** 남기는 고르는 칸은 서류 종류(`catalog.js` 이름·`names`·`picks`)와 약관 동의뿐. AI가 신청서 화면으로 판단하면 위쪽 줄에 "「본인」·「가족」 같은 고르는 칸은 직접 골라 주세요"를 쓴다(`stageText`라 예전 확장판도 그대로 보여 줌). 이미 그 서류 화면(쪽 제목에 서류 이름)이고 본인 확인 뒤이거나 그 링크로 온 뒤면 같은 이름의 메뉴 링크를 뺀다 (`handoff.js`) | 사용자 결정 (2026-10-18, D-11). 전자가족관계에서 간편인증 뒤 신청서의 옆 메뉴 「혼인관계증명서」를 가리켰고, 누르자 본인 확인이 풀렸다 |
| 같은 이름의 후보가 둘이면 고르는 칸을 남긴다 (`content.js` `collect`) | 위 사례: 신청서의 「혼인관계증명서」(골라짐)가 옆 메뉴 링크에 밀려 빠져서 AI가 서류를 아직 안 골랐다고 봤다 |
| **민원 목록(`catalog.js`)을 늘리거나 고치는 일은 0.1.3부터 서버만 올리면 된다** (`railway up`). 확장이 서버가 알려 준 항목(id·이름)을 기억해 고르게 하고, 서버가 판단 요청마다 `goalId`를 다시 확인한다. **단 0.1.2 이하 확장을 쓰는 사람은 확장에 든 항목만 고를 수 있다** (새 항목은 검색에 나와도 고르면 "목록에 있는 것만…"). 항목을 지우면 그 항목으로 안내 중이던 0.1.3 사용자는 "지금은 길잡이 목록에 없어요"를 보고 처음 화면으로 돌아간다 | 2026-10-19 「사업자등록증 재발급」을 서버에만 넣었더니 스토어 0.1.1 사용자는 고를 수 없었다 (0.1.2로 해결) |
| 판단 규칙은 될 수 있으면 `src/lib/`(서버와 같이 쓰는 코드)에 둔다 | 서버(`railway up`)만 다시 올리면 스토어 심사 없이 바로 바뀐다. `content.js`·`manifest.json`을 고치면 새 버전 심사가 필요하다 |
| 다른 것에 가려진 요소(인증 창·어두운 막 뒤)는 후보에서 빼고 가리키지 않는다. 떠 있는 iframe이 화면을 덮으면 서버에 묻지 않고 고정 도움말만 보여 준다 | 2026-10-17 정부24 로그인: 간편인증 창이 뜬 뒤에도 가려진 카드에 테두리가 남음. iframe 안은 확장이 읽을 수 없다 |
| 정부24의 자동화 차단을 우회하지 않는다 (UA 바꾸기 등 금지) | 차단은 사이트의 의사 |
| 빌드 단계·새 라이브러리를 넣지 않는다 (필요하면 사용자에게 먼저 묻는다) | 폴더째 로드하는 단순함 유지 |
| 정책값(`MIN_PROBABILITY` 등)은 `src/lib/jev.js` 상수 한 곳. 질문 문구·형식을 바꾸면 `RUBRIC_VERSION`을 올린다 | 캐시 무효화 |
| 화면 문구는 쉬운 한국어, 글씨 20px·버튼 56px 이상, 아이콘만 있는 버튼 금지 | 아래 「공통 규칙」 노인 UX |
| 끝났다고 하기 전에 `npm run check`와 `npm run smoke`를 돌리고 결과를 보고한다 | 검증 |
| **Git은 에이전트가 맡는다 (push 포함).** 확인을 마친 일 단위마다(`npm run check` 통과) 스스로 커밋하고, 커밋 묶음·태그를 만들 때마다 `main`과 태그를 origin(github.com/Dorazeeing/ldry-scrtry, 비공개)에 push한다. 메시지는 지금까지처럼 쉬운 한국어, 버전을 앞에 붙이고("0.1.3: …") 마지막 줄은 공동 작성 줄. **태그:** 스토어에 낼 zip을 만들면 `v<버전>`, 중계를 올릴 때마다 `relay-YYYYMMDD-N` → 지금 무엇이 올라가 있는지 언제나 안다. **force-push·이미 올린 기록 고쳐 쓰기 금지.** push가 거절되면 fetch 후 rebase, 충돌하면 멈추고 보고한다. **되돌리기:** 깨끗한 작업 폴더에서 그 태그를 checkout한 뒤 중계면 `railway up -s relay --ci`, 확장이면 `npm run package` | 사용자 결정 (2026-10-25): 버전별로 관리해 언제든 불러오고 되돌릴 수 있게, 다른 노트북에서도 이어서 할 수 있게 |
| **Railway 배포는 에이전트가 맡는다.** (a) 서버 변경이 **지금 스토어판(0.1.2)과도 맞으면** 바로 올린다. (b) **준비 중인 버전(0.1.3)에서만 맞으면** `X-Ldry-Version` 헤더로 가른 뒤(`server/relay.js` `clientVersion` → `guide.js` `atLeast`) 올려서 그 버전이 쓸 수 있게 한다. 헤더가 없으면 0.1.2 이하다. **올리기 전:** `npm run check` 통과(Jev 질문 문구를 바꿨으면 pages trial 한 번), `railway status`가 `relay`, **커밋 안 된 추적 파일 변경이 없음** (`railway up`은 커밋이 아니라 작업 폴더를 올린다 — 하던 일이 섞여 올라가지 않게). **올린 뒤:** `GET /health`가 `{"ok":true,...}`이면 `relay-YYYYMMDD-N` 태그를 달고 push | 사용자 결정 (2026-10-25). 0.1.2 사용자도 같은 서버를 쓴다 |
| **Vercel(개인정보 처리방침 페이지)도 에이전트가 맡는다.** `store/privacy/index.html` → 기존 프로젝트 `ldry-scrtry-privacy`(팀 dorazeeing's projects, https://ldry-scrtry-privacy.vercel.app/). **그 페이지가 설명하는 버전을 스토어 제출용으로 사용자에게 넘길 때** 다시 배포한다 — 그 전에는 안 한다 (0.1.2가 올라가 있는 동안 0.1.3에만 있는 동작을 적으면 안 된다). `store/privacy`에서 기존 프로젝트에 `vercel link`(새 프로젝트를 만들지 않음, `.vercel/`은 `.gitignore`), 배포 뒤 실제 페이지에서 새 문구를 확인한다. `vercel whoami`가 안 되면 추측하지 말고 보고한다 | 사용자 결정 (2026-10-25) |
| **사용자 몫으로 남는 것:** 스토어 제출·게시, Railway 변수 변경 | 스토어는 사람이 로그인해서 제출·게시한다. 변수에는 TypeSafe 키가 있다 |
| **스토어에 올리는 zip은 반드시 `npm run package`로 만든다.** 폴더를 손으로 압축하지 않는다. 이 명령(`scripts/package.mjs`)이 `manifest.json`의 개발용 `key`와 이름이 「.」으로 시작하는 파일·폴더(`.DS_Store`, 도구가 남긴 `.omc` 등)를 빼고, `manifest.json`과 `package.json`의 버전이 다르면 만들지 않는다. 올리기 전에 두 파일의 `version`을 이전보다 높인다 | `key`는 폴더로 불러온 확장의 ID를 고정하려고 넣은 것(`iieapegdhcfmnhgimjhgolgaiffmhbij`)이다. 스토어판 ID(`poicbfndbnffkpkmmkmhmnehpbmemnif`)는 스토어가 정하므로 zip에 넣으면 안 된다. 스토어는 이전보다 낮거나 같은 버전을 받지 않는다 |
| **무엇을 고치느냐에 따라 배포 길이 다르다.** `src/lib/`(서버와 같이 쓰는 코드)는 `railway up -s relay --ci`만 하면 바로 적용되고 심사가 필요 없다. `src/content.js`·`src/background.js`·`manifest.json`은 새 버전을 올려 **스토어 심사를 다시 받아야** 적용된다. 판단 규칙·개인정보 거르기는 될 수 있으면 `src/lib/`에 둔다 | 심사는 며칠에서 몇 주. 급한 수정은 서버에서 풀 수 있는지 먼저 본다 |
| **폴더 이름·위치를 바꾸면 Railway 연결이 끊긴다.** `railway link -p ldry-scrtry -e production -s relay`로 다시 잇고, `railway status`로 확인한 뒤 `railway up`을 한다. 서버 허용 목록(`ALLOWED_ORIGIN`)은 로컬 ID와 스토어 ID 둘뿐이다 | 연결 정보가 폴더 경로에 묶여 있다 (2026-10-19 Hackerton → Hackathon 이름 변경 때 끊김). 2026-10-24 이 폴더로 옮길 때는 CLI 로그인이 만료돼 `railway link`가 안 돼서, `~/.railway/config.json`에 예전 항목과 같은 ID로 이 경로 항목을 넣었고, 다시 로그인한 뒤 `railway status`로 `relay` 연결을 확인했다 |
| 정부24 밖 사이트(기관 사이트)에서 서버로 보내는 글을 늘리거나 줄일 때는 **두 줄 카드 이름**을 확인한다. 둘째 줄(`detail`)을 통째로 막으면 「가족관계 / 증명서」가 「가족관계」와 「증명서」로 갈라져 AI가 못 고른다. 지금은 서류·동작 낱말로 끝나는 12자 이하 둘째 줄만 보내고 서버가 이름에 합친다 | 2026-10-19 사고: 개인정보 수정이 전자가족관계 첫 화면을 망가뜨림. 사람·회사 이름은 계속 막아야 한다 |
| 화면 모양을 고칠 때는 **실제 화면의 버튼 목록**으로 시험 자료(`test/fixtures/pages.json`)를 늘린다. 자동 접속이 막힌 사이트는 사용자가 개발자 도구로 복사해 준 목록을 쓴다 (우회하지 않는다). 규칙을 바꾸면 `MODE=pages ROUNDS=1 TYPESAFE_API_KEY=… node scripts/trial.mjs`를 **한 번** 돌려 기존 화면이 그대로 정답인지 본다 | 규칙 한 줄이 다른 화면을 깨뜨린 적이 있다. 시간·평균을 재려는 반복 실험은 하지 않는다 |

## 배포 현황 (2026-10-17)

| 항목 | 상태 |
|---|---|
| 크롬 웹스토어 개발자 계정 | **완료.** 배포 전용 Google 계정(주소는 팀 채널에서 공유, 문서에 적지 않음), 등록비 $5 결제, **비판매자(Non-trader)** 신고 (수익 없는 공모전) |
| 게시자 이름 | **아직 계정 이메일 그대로** → 대시보드 Settings에서 팀 이름으로 바꾼다. "정부24"·"행정안전부"처럼 공식 기관으로 보이는 이름 금지 |
| 2단계 인증 | 확인 필요 (꺼져 있으면 게시·업데이트 불가). 승인 전에 확인한다 |
| 확장 한도 | **1/2** (심사 중인 초안도 셈). 피드 지킴이(`reference/slop-detector`)와 같은 게시자라 남은 자리 1개를 함께 쓴다 |
| 웹스토어 항목 | **있음. 게시됨(public).** 스토어 주소 https://chromewebstore.google.com/detail/ldry-scrtry/poicbfndbnffkpkmmkmhmnehpbmemnif . **지금 스토어판은 0.1.2** (사용자 크롬에 스토어 ID로 0.1.2가 설치된 것을 스크린샷으로 확인, 2026-10-24). 이전 통과 버전 0.1.0·0.1.1. **0.1.3은 준비됨**(`ldry-scrtry.zip`, 2026-10-24, 아직 안 올림 — 아래 「남은 일」의 0.1.3 줄). 0.1.3을 올릴 때 개인정보 탭의 `storage` 사유를 `store/LISTING.md` §3-1 새 문구로 바꾼다. (아래는 1차 제출 경과) 항목 ID `poicbfndbnffkpkmmkmhmnehpbmemnif`, 버전 0.1.0. 1차 제출(2026-10-17)은 **거절**: "Spam and Placement in the Store / Yellow Argon — 설명에 과도한 키워드(기관 이름 12개 나열)". 설명에서 기관 이름을 모두 빼고 같은 날 재제출 → **Pending review** (심사는 보통 며칠~몇 주). **심사 중에는 항목을 고치지 않는다.** 승인되면 30일 안에 게시(Publish)해야 한다. 스토어 ID는 서버 `ALLOWED_ORIGIN`에 등록 완료 |
| Railway 중계 | **배포됨 (2026-10-17). 마지막 배포: 태그 `relay-20261025-1` (2026-10-25, 커밋 5f4a604 — 서버 판단 개선·목록 `POST /v1/catalog`·`X-Ldry-Version` 읽기, 0.1.2와 맞음, `/health` ok, 스토어 ID Origin으로 목록 31개 확인).** 프로젝트 `ldry-scrtry` → 서비스 `relay`, 주소 `https://relay-production-4d72.up.railway.app`, **Free 요금제**. 변수 5개 등록(키는 stdin으로, Seal 안 함 — 계정 사용자가 1명뿐이라 사용자 결정). `ALLOWED_ORIGIN`은 로컬 로드 ID(`iieapegdhcfmnhgimjhgolgaiffmhbij`, `manifest.json`의 개발용 `key`로 고정 — 폴더 이름·위치가 바뀌어도 같다)와 스토어 ID(`poicbfndbnffkpkmmkmhmnehpbmemnif`) 두 개 (다른 Origin은 403). **`key`는 스토어용 zip에 넣지 않는다**: `npm run package`가 뺀다. 폴더 이름이 바뀌면 Railway 연결도 끊기므로 `railway link -p ldry-scrtry -e production -s relay`로 다시 잇는다 `DAILY_CAP=5000`, `PER_IP_PER_MIN=30`, `RELAY_ENABLED=true`. 리전은 Southeast Asia(싱가포르) 유지 — 미국 서부가 2~3배 빠르지만 사용자 결정 대기 |
| GitHub | https://github.com/Dorazeeing/ldry-scrtry (**비공개**로 바꿈, 사용자). 웹스토어·Railway는 공개 저장소를 요구하지 않는다(Railway는 CLI 업로드). 처리방침 페이지를 GitHub Pages로 올릴 수 없다 → 다른 곳(예: Vercel)에 둔다. 동의 문구·처리방침에 "코드를 공개한다"고 쓰지 않는다 |

## 중계 서버 (Railway) — 배포됨 (2026-10-17)

공개판은 키를 확장에 넣을 수 없으므로 Jev 호출을 Railway 중계로 옮긴다. 판단 흐름은 `src/lib/guide.js` 한 곳에 있고 확장 background와 중계가 **같은 코드**를 쓴다 (크롬 API 없음). 중계는 확장이 보낸 값을 믿지 않고 다시 거른다.

```
background.js ──goalId + 걸러진 화면 정보──▶ Railway 중계 (싱가포르, 키는 봉인된 변수)
                                              ├ goalId → 목표 문장 (catalog.js)
                                              ├ 개인정보 거르기·크기 제한 다시 적용 (sanitize.js)
                                              ├ 질문은 서버가 만듦 (jev.js)
                                              └──▶ api.typesafe.ai/v1/systemone
```

| 엔드포인트 | 확장이 보내는 것 | 돌려주는 것 |
|---|---|---|
| `POST /v1/guide/next` | `goalId`(catalog id만), `page{title, path, headings, popupText}`, `candidates[]`, `pressed[]` | 지금 `decide` 결과 그대로 |
| `POST /v1/catalog/search` | `query`(어르신이 적은 말) | `{kind:'results', items:[{id,name,plain}]}` |
| `POST /v1/catalog` (0.1.3) | 본문 `{}` | `{kind:'results', items:[{id,name,plain,offsiteName?}], source:'list'}` 전체 목록. Jev를 안 불러 하루 상한을 세지 않는다. GET이 아닌 까닭: 확장 service worker의 GET에는 `Origin`이 안 붙는다 |
| `GET /health` | — | `{ok:true}` |

- 계약은 **`server/openapi.yaml`** (이 저장소 안). 엔드포인트를 바꿀 때는 이 파일을 먼저 고친다.
- 시험: `test/relay.test.js` (가짜 TypeSafe — 질문 고정, 세션 값 제거, 사이트·Origin·크기·분당·하루 상한·스위치, 로그에 본문 없음). 로컬 실행: `TYPESAFE_API_KEY=… PORT=8788 npm start`
- **위치는 `server/`(이 폴더 안).** Railway는 지정한 폴더 밖 파일을 가져오지 않아, 따로 폴더를 두면 `src/lib`를 못 불러온다. 확장 zip(`npm run package`)은 `manifest.json`·`src`만 묶으므로 서버 코드는 확장에 들어가지 않는다.
- 의존성 없음: Node 22+ 내장 `http` + `fetch`. 시작 명령 `node server/relay.js` (`package.json` `start`).
- 도용 막기: 질문 고정(서버가 생성), `path`의 호스트가 `sites.js` 활성 목록인지 확인, 경로 속 `;jsessionid=…` 제거, 본문 64KB, IP별 분당 제한(`X-Real-IP`), 하루 호출 상한(`DAILY_CAP`), 끄는 스위치(`RELAY_ENABLED=false` → 503), `Origin`이 `chrome-extension://<ID>`인지 확인(흉내 가능 → 보조 수단). 제한은 메모리 기반이라 재시작하면 초기화되고, 서버 1대 기준이다.
- 로그: 경로·상태·소요 시간만. **요청 본문은 남기지 않는다.** Railway가 접속 기록(경로·IP·UA)을 자동으로 남긴다(Free 3일, 요금제가 바뀌면 달라짐) → 개인정보 처리방침에 적었다.
- 오류: `{ "error": { "code", "message" } }`, message는 쉬운 한국어. 429·529 재시도와 시간 제한은 지금 `callJev` 그대로.

**Railway 설정**

| 항목 | 값 |
|---|---|
| 배포 | `railway up -s relay --ci` (CLI 업로드, `.gitignore`를 따른다). 설정은 `railway.json`(시작 명령·`/health`·재시작). Config as Code는 2026-12-01까지 동작(그 뒤 `railway config migrate`) |
| Variables | `TYPESAFE_API_KEY`(Seal 안 함 — 사용자 결정), `ALLOWED_ORIGIN`, `DAILY_CAP`, `PER_IP_PER_MIN`, `RELAY_ENABLED`. 바꾼 뒤 Deploy를 눌러야 반영 |
| Region | 지금 Southeast Asia (싱가포르). `railway scale -s relay southeast-asia=1` 로 정한다 (`railway.json`에 넣으면 Free 기본값이 이겨 US West로 갔음). **측정:** 싱가포르는 이 PC에서 총 0.9~1.1초(서버 안 90~220ms), US West는 0.4초 → TypeSafe가 미국 쪽이라 생기는 왕복으로 추정. 리전은 사용자 결정 대기 |
| 주소 | Settings → Networking → Generate Domain (HTTPS 자동) |
| Healthcheck | `/health` |
| Serverless(잠자기) | **Free 요금제에서는 켜져 있다** (`sleepApplication=true`, 직접 켜지 않았음). 5~10분 통신이 없으면 잠들고, 깨어나는 첫 요청이 느리거나 502일 수 있다 → 확장을 중계로 바꿀 때 502·연결 실패면 1~2초 뒤 한 번 더 보낸다 |
| 비용 상한 | Usage에서 강제 상한 (최소 $10, 넘으면 서비스가 꺼짐) |
| 요금 | **Free 요금제($0, 매달 사용량 $1어치 무료)로 시작.** 서비스당 RAM 0.5GB·1 vCPU 제한. 새 계정은 Trial $5(1회)를 먼저 쓴다. 중계는 로컬에서 RSS 약 67MB → RAM만 월 약 $0.66(GB당 월 $10) + CPU 조금 → **$1 안쪽이지만 빠듯함.** 넘으면 Hobby(월 $5, 사용량 $5 포함)로 올린다 ([공식](https://docs.railway.com/pricing/plans), 2026-10-17 확인). Jev는 1회 약 $0.00013 (`DAILY_CAP=5000`이면 하루 최대 약 $0.65, TypeSafe 쪽 비용) |

**확장 쪽 변경 — 2026-10-17 완료**
- `manifest.json` `host_permissions`는 중계 주소 하나뿐. 주소는 `src/lib/relay.js` `RELAY_URL` 한 곳이고 `npm run check`가 둘이 같은지, typesafe.ai 권한이 없는지 검사한다.
- `background.js`: 키 코드 삭제. `callRelay`(502·연결 실패는 1.5초 뒤 한 번만 다시). 중계가 안 되면 민원 찾기는 이 컴퓨터에서 글자 맞추기로 대신한다. 화면 거르기(`cleanGuidePayload`)는 확장이 보내기 전에, 서버가 받은 뒤에 같은 코드로 두 번 한다.
- 첫 사용 **동의 화면**(`content.js`, 문구를 바꾸면 `CONSENT_VERSION`을 올림): 무엇이 어디로 가는지(서버 싱가포르 → TypeSafe 서비스, 서버는 미국), 말로 하기(크롬·구글), 접속 기록(Railway), AI가 틀릴 수 있음. 동의 전에는 서버 0건 (자동 시험으로 확인). 설정 창에서 동의 취소 가능.
- `popup.*`: 키 입력 칸 삭제 → 서버 연결 확인, 동의 취소.
- 확장 ID: 로컬 로드 ID와 스토어 ID가 다르다. 웹스토어에 **초안으로 먼저 올려 ID를 받고** `ALLOWED_ORIGIN`에 넣는다 (개발 중에는 매니페스트 `key`로 ID 고정 가능).

**확인한 것 (2026-10-17):** 실제 Jev로 다음 버튼 184ms·민원 찾기 296ms, Origin 없는 요청은 403. 자동 시험(smoke 35개, 단위 시험 65개 — 2026-10-17 마지막 실행 모두 통과)은 **실제 중계 코드**를 띄워 확장 요청을 그쪽으로 보내 Origin 확인까지 통과. 폴더 경로로 계산한 확장 ID(`dclhjk…`)와 스토어 ID는 Railway `ALLOWED_ORIGIN`과 같고, 배포된 서버가 두 ID는 받고 다른 Origin은 403으로 거절하는 것을 확인 — 스토어판을 실제 Chrome에서 설치해 호출하는 것은 승인 뒤 사람이 확인.
**확인 안 된 것:** Railway가 `X-Real-IP`를 덮어써 주는지(안 덮어쓰면 분당 한도를 헤더로 속일 수 있음), Railway를 거친 지연, service worker에서 `host_permissions`만으로 CORS 없이 호출되는지, Railway 실제 월 비용, TypeSafe 호출 한도. MCA 조항은 요약 발췌라 원문(https://typesafe.ai/legal/mca) 확인 필요.

## 공개 배포 전 해야 할 것

- [x] **이름:** `ldry-scrtry` (D-8). 매니페스트 설명에 "비공식, 정부24·행정안전부와 관계없음" 표기. 스토어 설명 첫 줄에도 같은 문구를 쓰고 정부 로고는 쓰지 않는다. 웹스토어 정책: "don't represent that your product is authorized by, endorsed by, or produced by another company or organization"
- [x] **설치 전 고지와 동의:** 정부24 화면의 첫 사용 동의 화면으로 구현 (동의 전 서버 0건). 웹스토어 정책의 "prior to installation"은 스토어 설명·Privacy 탭에도 같은 내용을 적어야 충족 → 아래 처리방침 항목과 함께
- [x] **개인정보 처리방침 URL:** https://ldry-scrtry-privacy.vercel.app/ (Vercel 프로젝트 `ldry-scrtry-privacy`, 팀 계정 `dorazeeing's projects`, 로그인 없이 열림, 2026-10-17 게시). 운영자 이름은 임시로 "ldry-scrtry 개발팀"(팀 이름 미정), 문의 dorazeeing@gmail.com, 접속 기록 보관 3일(Railway 무료 요금제, 공식 문서). **내용을 고치면 `store/privacy/index.html`을 고쳐 같은 프로젝트에 다시 배포한다.** 법률 검토는 하지 않았다
- [x] **Privacy 탭:** 단일 목적, 권한별 사유, 원격 코드 "없음"(Jev 답은 데이터), 데이터 항목, Limited Use 준수 — 대시보드에 입력 완료 (문구는 `store/LISTING.md` §3-1)
- [x] **아이콘·스토어 이미지:** `icons/`(16·48·128·홍보 440×280, `node scripts/icons.mjs`), `store/screenshots/`(1280×800 JPEG 4장, `VIEWPORT=1280x800 SMOKE_OUT=store/raw npm run smoke`로 다시 만든 뒤 변환). 제출 자료 전체는 `store/LISTING.md`
- [x] **`sanitize.js` 보완 (일부):** 주소 모양(○○시 ○○구, ○○로 12, ○○동 123번지)을 거르고, 정부24 밖에서는 제목 글·창 안내 글을 아예 보내지 않는다. **이름만 있는 글자는 아직 못 거른다** (정부24의 제목 글·창 안내 글에 나올 수 있음) → 개인정보 탭의 "개인 식별 정보" 답 판단 필요
- [ ] **로그인 이후 화면:** 중계로 가는 요청에 이름·주민번호·주소가 없는지 확인 (README "사람이 확인할 것")
- [x] **공개판 사이트 목록:** 정부24 + 기관 사이트 12곳 전부 (D-9, D-8을 바꿈). 기관 사이트는 **실제 크롬에서 서류마다 따라가 본 뒤** 제출한다 — 안 되는 곳은 `active`를 끈다
- [ ] 게시자 이름 변경, 2단계 인증 (위 「배포 현황」)
- [x] 해커톤 사전 개발 허용 범위 → 신경 쓰지 않음 (D-8)
- [x] **안내 문구:** "강사님께…" → "가족이나 정부24 고객센터(1588-2188)에 물어봐 주세요". 안내 창 제목 "정부24 길잡이" → "민원 길잡이 (비공식)" (2026-10-17)
- [x] **「말로 하기」 고지:** 동의 화면, `store/privacy/index.html`, `store/LISTING.md`에 적음 (스토어 Privacy 탭에는 제출할 때 사람이 옮겨 적는다)
- [x] **국외 이전 고지:** (처리방침 §3에 반영) 확장 → Railway(싱가포르) → TypeSafe(서비스가 미국에서 호스팅됨 — TypeSafe 처리방침 "The Services are hosted in the United States". **회사 소재지는 처리방침에 없음**, "미국 회사"라고 쓰지 않는다). 처리방침에 이전 국가·항목·목적·보관 기간 (개인정보보호법)
- [x] **"안내가 틀릴 수 있어요" 고지:** 안내 창·동의 화면·스토어 설명에 있음
- [x] **「작게 접기」 기억:** 접은 상태를 저장한다 (다른 쪽·다른 사이트에서도 유지)
- [ ] **확장 ID 고정(선택):** 지금은 서버가 두 ID를 모두 받으므로 급하지 않다. 대시보드의 공개 키를 로컬 `manifest.json` `key`에 넣으면 로컬판도 스토어와 같은 ID가 된다
- [ ] **배포 지역·카테고리:** 대한민국만으로 제한할지, 접근성 계열 카테고리
- [x] **제출:** 2026-10-17 재제출, 심사 중. 통과 후 30일 안에 게시해야 한다. 승인 뒤 스토어에서 설치해 서류 하나를 끝까지 따라가 본다

## 남은 일 / 알려진 빈틈 (2026-10-17 기준)

| 항목 | 상태 |
|---|---|
| 로그인 뒤 「회원정보 재확인」 같은 화면 | 규칙 없음 (버튼 이름을 봐야 함) |
| 전자가족관계 신청서 아래 버튼 | 시험 화면은 스크린샷에서 재구성했고 아래 버튼 이름은 「다음」으로 **가정** (실제 이름 확인 필요). 쪽 제목도 탭에 보인 앞부분으로 추정 |
| 두 줄 카드 이름 (2026-10-19) | 전자가족관계 첫 화면의 카드는 「가족관계 / 증명서」처럼 두 줄이라, 정부24 밖에서 둘째 줄을 통째로 막은 수정(같은 날 아침) 때문에 AI가 「가족관계」와 「증명서」를 따로 봐서 「해당 없음」 0.45가 이겼다. 정부24 밖에서는 **서류·동작 낱말로 끝나는 12자 이하 둘째 줄만** 보내고(`sanitize.js` `SAFE_DETAIL`), 서버가 그 짧은 둘째 줄을 이름에 합친다(`guide.js` `joinShortDetail`). 사람·회사 이름은 계속 막힌다. 서버만 올림, 심사 불필요. 실제 목록은 `test/fixtures/pages.json` |
| 「사이트가기」 못 잡음 (2026-10-19) | 정부24 가족관계증명서 안내 화면에서 목차 「신청 방법 및 절차」(0.41)가 「사이트가기」(0.34)를 이겨 "잘 모르겠어요"가 떴다. `jev.js` 규칙 2줄 추가(쪽 안 이동 링크 제외, 다른 사이트 발급이면 그 사이트로 가는 버튼) + `RUBRIC_VERSION` 8 → 서버에 올림, 심사 불필요. 화면 재구성은 `test/fixtures/pages.json` |
| 「사업자등록증 재발급」이 안 나옴 (2026-10-19) | 목록에 「사업자등록 증명」만 있어 재발급을 찾아도 증명만 나왔다. `business_reissue` 추가, 증명은 「사업자등록증명」으로 이름을 바로잡고 `plain`에 서로 아닌 점을 적었다. 글자 맞추기에서 「재발급」은 흔한 낱말(`COMMON_WORDS`). Jev 검색 질문에 「증명 = 남에게 내는 증명서, 재발급 = 잃어버린 원본을 다시 받기」 설명. 공지·`sites.js`에 있던 자동차등록증 재발급·건설기계 등록원부·난임부부 시술비 지원 신청도 추가(31개). 서버에 올렸지만 **"심사 불필요"는 틀렸다 (2026-10-25 바로잡음):** 검색 결과에는 새 항목이 나왔어도 스토어 0.1.1 확장은 자기에게 든 목록에 없는 id를 「guide/start」에서 거절해서(`findService` → `unknown_goal`) 고를 수 없었다. 0.1.2가 목록을 담아 해결됐다. 0.1.3부터는 서버만 올리면 된다 (아래 0.1.3 서버 목록 줄). **목록에 비슷한 쌍을 넣을 때는 `plain`에 서로 아닌 점을 쓰고 `test/fixtures/search.json`에 시험을 넣는다** (`expectAll`은 둘 다 보여야 하는 말) |
| 후보 중복 제거 (0.1.2, 2026-10-19) | 확장이 후보를 첫 줄만 보고 하나로 합쳐 「가족관계 / 증명서」·「가족관계 / 등록부정정」, 「제적 / 등본」·「제적 / 초본」 중 먼저 나온 것만 갔다. `content.js` `collect`와 `sanitize.js` `cleanCandidates`가 **첫 줄+둘째 줄이 모두 같을 때만** 합치고, `jev.js` `buildRequest`가 선택지 이름이 겹치면 처음 것만 쓴다. `content.js`를 고쳤으므로 **0.1.2 스토어 심사 뒤** 확장에 적용(서버 쪽 `sanitize.js`·`jev.js`는 이미 올림). 자동 시험: smoke의 두 줄 카드 화면 |
| 검색 칸 글자 복사 (2026-10-18) | `content.js`만 바뀜 → 로컬판은 확장 새로고침, 스토어판은 다음 버전 심사 뒤. 권한 추가 없음(누른 순간 클립보드에 쓰기만) |
| 검수 수정 (2026-10-19, 확장 쪽) | `content.js`(묻는 중 강한 이유 남기기, 오류 뒤 배너 변화로 안 묻기, `isTrusted`만 받기, 변화 때 후보 모으기 전에 끝내기, 필수 9곳↑ 안내), `background.js`(오류 응답은 저장 안 함, 「다시 찾기」는 저장된 답 건너뜀, `RUBRIC_VERSION`을 저장 키에 넣음), `relay.js`(시간 초과는 다시 안 보냄) → **새 버전 심사 뒤** 적용. 서버 쪽(`sanitize.js` 둘째 줄 글 제외, `jev.js` 시간 5초·재시도 1번)은 **중계에 올림 (2026-10-19)** |
| D-11 고치기 (2026-10-18) | 서버 쪽 규칙(`src/lib/`)은 **중계에 배포 완료** (사용자 화면과 같은 요청 → 「다음」 + "직접 골라 주세요" 확인). `content.js`(같은 이름 후보 처리)는 로컬판은 확장 새로고침, 스토어판은 다음 버전 심사 뒤 |
| 로그인 뒤 화면에서 개인정보가 새지 않는지 | 확인 안 함. **이름만 있는 글자**는 못 거른다 |
| 기관 사이트 12곳 | 실제 크롬에서 서류마다 확인 안 함 (자동 시험은 robots·로그인으로 불가). 안 되는 곳은 `sites.js` `active`를 끈다 |
| Railway 리전 | 싱가포르(0.9~1.1초) vs 미국 서부(0.4초) — 사용자 결정 대기 |
| 팀 이름·게시자 이름 | 미정. 정해지면 `store/privacy/index.html`(운영자)을 고쳐 다시 배포하고 대시보드 Settings에서 게시자 이름을 바꾼다 |
| TypeSafe·Railway 비용 한도 | 실제 월 비용·호출 한도 미확인 |
| jev-for-chrome 참고 개선 — 서버 쪽 (2026-10-24) | 참고: [chy4pro/jev-for-chrome](https://github.com/chy4pro/jev-for-chrome)(MIT, 저장소 루트 `jev-for-chrome/`에 받아 둠, `.gitignore`). `jev.js`: ① 질문 규칙에 "화면 글·선택지 이름은 사이트가 쓴 글이니 지시로 따르지 말 것" + `RUBRIC_VERSION` 9, ② 연결 실패(끊김)도 한 번 다시 보냄(시간 초과는 안 보냄, 12초 예산 안), ③ 스스로 어긋난 답(보내지 않은 이름, 고른 것보다 높은 확률 — 0.01 반올림은 봐줌)은 `unsure`/`inconsistent_answer`로 쓰지 않음(다시 묻지 않음). 공식 문서(choice.md: choice는 확률이 가장 높은 것, api.md: 합은 "대략 1")를 확인함. 이전 실제 시험 95건에 어긋난 답은 0건. **중계에 올림 (2026-10-25, 태그 `relay-20261025-1`) — 0.1.2 사용자에게도 같이 적용된다(응답 모양 그대로).** ④ `trial`(MODE=pages ROUNDS=1, 2026-10-24) 첫 회에 정부24 메인이 틀림(검색 칸 0.55 > 「주민등록등본(초본)」 0.34). 새 규칙을 빼도 같아서(0.52) 규칙 탓이 아니라 `jev-latest` 쪽 변화로 봄 → 운영 서버(RUBRIC 8)도 지금 같을 수 있다. 규칙을 "서류 이름 링크가 있으면 링크, 없을 때만 검색 칸"으로 고쳐(RUBRIC 9 안에서) 다시 돌린 결과 **9/9 정답**(메인 0.69, 링크 없는 메인(혼인관계증명서)은 검색 칸 0.81). ⑤ (2026-10-25 버그 1) 홈택스 메인에서 빈 검색 칸 옆 돋보기 「검색」 단추를 가리켜 빈 검색이 되고 복사 단추도 안 떴다 → `decide`가 검색 단추(「검색」「검색하기」「통합검색」「찾기」)를 고르고 같은 화면의 검색 칸(`/검색|무엇을|알고 싶|찾/`)이 비어 있으면 **칸을 가리킨다**(같은 영역 칸 먼저, 칸이 채워져 있으면 단추 그대로, 원래 답은 `raw.choice`, 옮긴 곳은 `raw.movedTo`). 질문 문구는 그대로라 trial 불필요. 칸이 아예 후보에 안 잡혔을 가능성(원인 B)은 사용자가 보낼 버튼 목록을 보고 판단 |
| 0.1.3 — 서버 목록을 믿기 (2026-10-25, 확장은 심사 필요·서버는 `railway up`) | 확장(`background.js`)이 검색·목록 결과로 서버가 알려 준 항목을 걸러서(`catalog.js` `cleanPublicItems`: id `^[a-z][a-z0-9_]{0,39}$`, 이름은 `cleanText`, 쉬운 설명은 `cutText` — 설명의 「…것이 아님」이 「○○님」 개인정보 규칙에 걸려 통째로 버려지므로) session에 300개까지 기억한다. 「guide/start」는 확장 목록 **또는** 기억한 항목이면 받고, 고를 때 이름을 안내 상태(`goalName`)에 저장해 위쪽 제목·복사 단추에 쓴다. 「목록에서 직접 고르기」는 동의 뒤에만 새 `POST /v1/catalog`로 서버 목록을 받고, 동의 전이거나 서버가 안 되면 확장 목록. 글자 맞추기 검색은 확장 목록 그대로. 서버가 `unknown_goal`(목록에서 빠짐)을 주면 안내를 끝내고 "고르신 서류가 지금은 길잡이 목록에 없어요…"와 함께 찾기 화면으로. 서버 쪽: `guide.js` `listCatalog`, `relay.js` `/v1/catalog`, `openapi.yaml` 0.2.0 — **중계에 올림 (2026-10-25, `relay-20261025-1`)**. 확장은 `X-Ldry-Version` 헤더로 버전을 보낸다(없으면 0.1.2 이하). 0.1.2 확장과 호환(기존 응답 그대로, 새 주소만). 자동 시험: smoke의 동의 전 목록(서버 0건)·서버에만 있는 항목(검색 결과에서 골라 제목 확인)·목록 32개·목록에서 빠짐 |
| 0.1.3 — 확장 쪽 (2026-10-24, 심사 필요) | `content.js`: ① 가리킨 버튼·링크를 **두 번 눌러도 같은 화면**이면 테두리는 두고 "화면이 그대로예요 — 새 창이 막혔을 수 있어요(주소창 오른쪽 팝업 차단 표시 → 「항상 허용」)" 안내 (다른 창·탭·인쇄로 넘어가면 세지 않음, 화면이 조금이라도 바뀌면 처음부터. 배너가 도는 화면은 바뀐 것으로 봐서 안내가 덜 뜰 수 있음), ② `role="checkbox"`·`"radio"`·`"switch"`로 꾸민 칸도 후보·약관 「필수」 처리, `aria-labelledby` 이름, `summary`, `aria-checked`가 바뀌면 다시 봄, ③ 두 줄로 감긴 링크를 "가려짐"으로 잘못 빼던 문제(재현 50가지 중 11가지) → 화면 안 첫 조각으로 가려짐 판단. `background.js`·`popup.*`: 마지막으로 서버에 보낸 걸러진 화면 정보를 session에 하나 두고, 설정 창 「마지막 화면 정보 복사하기」로 `pages.json` 한 칸 모양으로 복사(정답 칸은 비움). 「기록 지우기」·「동의 취소하기」로 지움 → **처리방침 §4·`LISTING.md` storage 문구를 고쳤으므로 Vercel 다시 배포 필요(안 함)**. 자동 시험: smoke의 두 줄 링크·눌러도 그대로·꾸민 약관 칸·설정 창 복사 화면 |

## 다른 컴퓨터에서 이어서 하기

git에 없는 것만 적는다. `git clone https://github.com/Dorazeeing/ldry-scrtry.git` 뒤에:

| 할 일 | 방법 |
|---|---|
| Node | 22 이상 (의존성 없음, `npm install` 필요 없음) |
| smoke용 Playwright | `reference/`는 git에 없다. `git clone https://github.com/rbilgil/slop-detector reference/slop-detector && (cd reference/slop-detector && npm install && npx playwright install chromium)`. 다른 곳의 Playwright를 쓰려면 `PLAYWRIGHT_FROM=<그 package.json 경로>` |
| 참고 오픈소스 (선택) | `git clone https://github.com/chy4pro/jev-for-chrome jev-for-chrome` (고치지 않음, `.gitignore`) |
| Railway | `railway login` → `railway link -p ldry-scrtry -e production -s relay` → `railway status`가 `relay`인지 확인 (연결 정보는 폴더 경로에 묶인다) |
| Vercel (처리방침 페이지) | `vercel login` → `cd store/privacy && vercel link` 로 기존 프로젝트 `ldry-scrtry-privacy`(팀 dorazeeing's projects)를 고른다. 새 프로젝트를 만들지 않는다 |
| TypeSafe 키 (trial용) | 환경변수 `TYPESAFE_API_KEY`. 이 Mac에서는 `~/.zshrc`의 `JevAPI=` 줄에 있다 (그 줄만 읽어 넘기고 화면에 찍지 않는다). **git·확장·문서에 넣지 않는다.** 운영 키는 Railway 변수에만 있다 |
| 확장 불러오기 | `chrome://extensions` → 개발자 모드 → 「압축해제된 확장 프로그램 로드」 → 저장소 폴더. `manifest.json`의 개발용 `key` 덕분에 어느 컴퓨터든 ID가 `iieapegdhcfmnhgimjhgolgaiffmhbij`라 중계가 받는다 |

## 공통 규칙 (해커톤 지침서 §3·§4에서 가져옴, 2026-10-24)

분리 전에는 해커톤 루트 `AGENTS.md`를 함께 따랐다. 그중 이 확장에 해당하는 것만 옮겼다.

**비밀값·개인정보·오류**
- 비밀값(`TYPESAFE_API_KEY` 등)은 Railway Variables에만 둔다. `.env`는 커밋하지 않는다.
- 오류 응답은 `{ "error": { "code": "...", "message": "..." } }`, 필드명은 camelCase, `message`는 어르신이 읽을 수 있는 쉬운 한국어로 쓴다.
- 시험·데모·스크린샷에는 가상 인물만 쓴다.

**노인 UX (모든 화면)**
- 본문 글씨 20px 이상, 버튼 높이 56px 이상, 버튼 간격 16px 이상.
- 글자 대비 7:1 목표 (WCAG AAA), 최소 4.5:1.
- 한 화면에 핵심 행동은 하나. 주 버튼은 크게 둔다.
- 결과 화면에는 "소리로 듣기"를 둔다.
- 입력은 음성을 우선하고 타이핑은 보조로 둔다.
- 영어·외래어·전문용어를 쓰지 않는다 (예: "업로드" → "사진 보내기").
- 시간제한·자동 넘김·작은 팝업을 쓰지 않는다. 기다리는 동안에는 "읽고 있어요…"처럼 상태를 글로 알린다.
- 아이콘만 있는 버튼을 쓰지 않는다. 항상 글자를 함께 쓴다.
- 해커톤 지침서의 모바일 규칙은 옮기지 않았다. 휴대폰 크롬은 확장을 지원하지 않는다.

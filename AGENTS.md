# AGENTS.md — ldry-scrtry (정부24 길잡이, 비공식)

크롬 확장. 해커톤 본 결과물(배포 웹 서비스)과 별개지만 **크롬 웹스토어 공개(Public) 배포가 목표**다 (사용자 결정 2026-10-17, `../docs/requirementSpec.md` D-7). 배포 현황·중계 서버·공개 전 할 일은 이 문서 아래쪽에 있다. 무엇·어떻게는 `README.md`, 배경 설계는 `../slop-detector/usePlan.md` §8, 팀 공통 규칙은 `../AGENTS.md`(§3 비밀값·개인정보, §4 노인 UX).
Jev 판단을 고칠 때는 TypeSafe 스킬(`typesafe:typesafe-ai`)을 따르고 공식 문서(https://docs.typesafe.ai/api.md, /primitives/choice.md)를 다시 확인한다.

## 규칙

| 규칙 | 이유 |
|---|---|
| TypeSafe로 보내는 필드를 늘리지 않는다. 늘려야 하면 `sanitize.js`를 거치게 하고 `smoke`의 필드 점검을 함께 고친다 | 로그인 뒤 화면에 주민번호·주소가 있다 |
| 입력 칸의 값(`value`)은 읽지 않는다. "채워졌는지"만 본다 | 개인정보 |
| 안내 목표는 `catalog.js` 목록 항목으로만 만든다. 어르신이 적은 말을 목표 문장에 넣지 않는다 (검색에만 쓴다) | 서류 이름을 모르는 어르신이 적은 말은 틀릴 수 있다. 사용자 결정 (2026-10-17) |
| 약관 「선택」·「전체 동의」·「동의하지 않음」은 후보에서 뺀다. 「필수」만 표시한다 | 사용자 결정 (2026-10-17) |
| 직접 클릭·입력·제출하지 않는다 | 되돌리기 어렵고 공공 사이트 자동화는 약관 문제 |
| 키는 background에만. `storage`는 `TRUSTED_CONTEXTS`로 잠근다. 지금의 키 입력(강사용)은 **개발·시험용**이고, 공개판은 키 없이 Railway 중계로만 Jev를 부른다 (아래 「중계 서버」) | content는 페이지와 DOM을 공유 |
| **우리 TypeSafe 키를 확장 코드·패키지·기본 설정값에 넣지 않는다** (암호화·숨기기도 안 됨) | 공개 확장은 누구나 내려받아 열어 볼 수 있고, 웹스토어 정책상 난독화 금지("must not obfuscate code"). 요청 헤더에도 키가 보인다. TypeSafe 계약서(MCA) §2.4: 키 비밀 유지·공유 금지 |
| 중계는 **이 확장 전용 엔드포인트만** 연다. 질문과 목표 문장은 서버가 만들고, 확장은 `goalId`와 걸러진 화면 정보만 보낸다 | MCA §2.3(a): 서비스를 남에게 제공·재배포 금지 → 아무 Jev 요청이나 대신 보내는 범용 중계는 안 됨. 주소가 새도 다른 용도로 못 씀 |
| 웹스토어 항목(item)은 **하나만** 만들고 새 버전으로 갱신한다. 삭제했다가 새로 올리지 않는다 | 다시 올리면 확장 ID가 바뀌어 중계의 `ALLOWED_ORIGIN`과 사용자 업데이트가 끊기고, 처음부터 재심사. 게시 한도 2개를 피드 지킴이와 함께 쓴다 |
| 사이트 권한은 `src/lib/sites.js`에서 `active: true`인 곳(지금은 정부24만, D-8)과 `api.typesafe.ai`(중계로 바꾸면 중계 주소)만. 기관 사이트는 기록용이다. 사이트를 늘릴 때는 `sites.js`를 고치고 `manifest.json` matches를 똑같이 맞춘다 (`npm run check`가 검사) | 권한 최소화, 출처 있는 사이트만 |
| 정부24의 자동화 차단을 우회하지 않는다 (UA 바꾸기 등 금지) | 차단은 사이트의 의사 |
| 빌드 단계·새 라이브러리를 넣지 않는다 (필요하면 사용자에게 먼저 묻는다) | 폴더째 로드하는 단순함 유지 |
| 정책값(`MIN_PROBABILITY` 등)은 `src/lib/jev.js` 상수 한 곳. 질문 문구·형식을 바꾸면 `RUBRIC_VERSION`을 올린다 | 캐시 무효화 |
| 화면 문구는 쉬운 한국어, 글씨 20px·버튼 56px 이상, 아이콘만 있는 버튼 금지 | `../AGENTS.md` §4 |
| 끝났다고 하기 전에 `npm run check`와 `npm run smoke`를 돌리고 결과를 보고한다 | 검증 |
| 커밋·push는 사용자가 요청할 때만 | 팀 Git 규칙 |

## 배포 현황 (2026-10-17)

| 항목 | 상태 |
|---|---|
| 크롬 웹스토어 개발자 계정 | **완료.** 배포 전용 Google 계정(주소는 팀 채널에서 공유, 문서에 적지 않음), 등록비 $5 결제, **비판매자(Non-trader)** 신고 (수익 없는 공모전) |
| 게시자 이름 | **아직 계정 이메일 그대로** → 대시보드 Settings에서 팀 이름으로 바꾼다. "정부24"·"행정안전부"처럼 공식 기관으로 보이는 이름 금지 |
| 2단계 인증 | 확인 필요 (꺼져 있으면 게시·업데이트 불가) |
| 확장 한도 | 0/2. 공식 기준은 "게시된(published) 확장". 피드 지킴이(`../slop-detector`)와 같은 게시자라 2자리를 함께 쓴다. 초안이 한도에 들어가는지는 미확인 → 첫 초안을 올린 뒤 대시보드 숫자로 확인 |
| 웹스토어 항목 | 아직 없음. 초안에 zip을 올리면 설치 가능 여부를 미리 검사해 주고(제출 전 설치 시험), 확장 ID가 정해진다 |
| Railway 중계 | **배포됨 (2026-10-17).** 프로젝트 `ldry-scrtry` → 서비스 `relay`, 주소 `https://relay-production-4d72.up.railway.app`, **Free 요금제**. 변수 5개 등록(키는 stdin으로, Seal 안 함 — 계정 사용자가 1명뿐이라 사용자 결정). `ALLOWED_ORIGIN`은 지금 로컬 로드 ID(`chrome-extension://dclhjkjaojhjghdlngjnajlecndamgaa`, 폴더 경로로 계산)만 → 스토어 ID가 나오면 쉼표로 추가. 실제 정부24 화면 4개를 중계로 보내 4/4 정답 |
| GitHub | https://github.com/Dorazeeing/ldry-scrtry (공개). 2026-10-17 첫 커밋 `5b1a5f6` (`main`) |

## 중계 서버 (Railway) — 구현됨, 배포 전

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
| `GET /health` | — | `{ok:true}` |

- 계약은 **`server/openapi.yaml`** (이 저장소 안). 루트 `../docs/api/openapi.yaml`은 해커톤 본 서비스용이라 따로 둔다. 엔드포인트를 바꿀 때는 이 파일을 먼저 고친다.
- 시험: `test/relay.test.js` (가짜 TypeSafe, 13개 — 질문 고정, 세션 값 제거, 사이트·Origin·크기·분당·하루 상한·스위치, 로그에 본문 없음). 로컬 실행: `TYPESAFE_API_KEY=… PORT=8788 npm start`
- **위치는 `server/`(이 폴더 안).** Railway는 지정한 폴더 밖 파일을 가져오지 않아, 따로 폴더를 두면 `src/lib`를 못 불러온다. 확장 zip(`npm run package`)은 `manifest.json`·`src`만 묶으므로 서버 코드는 확장에 들어가지 않는다.
- 의존성 없음: Node 22+ 내장 `http` + `fetch`. 시작 명령 `node server/relay.js` (`package.json` `start`).
- 도용 막기: 질문 고정(서버가 생성), `path`의 호스트가 `sites.js` 활성 목록인지 확인, 경로 속 `;jsessionid=…` 제거, 본문 64KB, IP별 분당 제한(`X-Real-IP`), 하루 호출 상한(`DAILY_CAP`), 끄는 스위치(`RELAY_ENABLED=false` → 503), `Origin`이 `chrome-extension://<ID>`인지 확인(흉내 가능 → 보조 수단). 제한은 메모리 기반이라 재시작하면 초기화되고, 서버 1대 기준이다.
- 로그: 경로·상태·소요 시간만. **요청 본문은 남기지 않는다.** Railway가 접속 기록(경로·IP·UA)을 자동으로 남긴다(Hobby 7일) → 개인정보 처리방침에 적는다.
- 오류: `{ "error": { "code", "message" } }`, message는 쉬운 한국어. 429·529 재시도와 시간 제한은 지금 `callJev` 그대로.

**Railway 설정**

| 항목 | 값 |
|---|---|
| 배포 | `railway up -s relay --ci` (CLI 업로드, `.gitignore`를 따른다). 설정은 `railway.json`(시작 명령·`/health`·재시작). Config as Code는 2026-12-01까지 동작(그 뒤 `railway config migrate`) |
| Variables | `TYPESAFE_API_KEY`(넣은 뒤 **Seal**), `ALLOWED_ORIGIN`, `DAILY_CAP`, `PER_IP_PER_MIN`, `RELAY_ENABLED`. 바꾼 뒤 Deploy를 눌러야 반영 |
| Region | 지금 Southeast Asia (싱가포르). `railway scale -s relay southeast-asia=1` 로 정한다 (`railway.json`에 넣으면 Free 기본값이 이겨 US West로 갔음). **측정:** 싱가포르는 이 PC에서 총 0.9~1.1초(서버 안 90~220ms), US West는 0.4초 → TypeSafe가 미국 쪽이라 생기는 왕복으로 추정. 리전은 사용자 결정 대기 |
| 주소 | Settings → Networking → Generate Domain (HTTPS 자동) |
| Healthcheck | `/health` |
| Serverless(잠자기) | **Free 요금제에서는 켜져 있다** (`sleepApplication=true`, 직접 켜지 않았음). 5~10분 통신이 없으면 잠들고, 깨어나는 첫 요청이 느리거나 502일 수 있다 → 확장을 중계로 바꿀 때 502·연결 실패면 1~2초 뒤 한 번 더 보낸다 |
| 비용 상한 | Usage에서 강제 상한 (최소 $10, 넘으면 서비스가 꺼짐) |
| 요금 | **Free 요금제($0, 매달 사용량 $1어치 무료)로 시작.** 서비스당 RAM 0.5GB·1 vCPU 제한. 새 계정은 Trial $5(1회)를 먼저 쓴다. 중계는 로컬에서 RSS 약 67MB → RAM만 월 약 $0.66(GB당 월 $10) + CPU 조금 → **$1 안쪽이지만 빠듯함.** 넘으면 Hobby(월 $5, 사용량 $5 포함)로 올린다 ([공식](https://docs.railway.com/pricing/plans), 2026-10-17 확인). Jev는 1회 약 $0.00013 (`DAILY_CAP=5000`이면 하루 최대 약 $0.65, TypeSafe 쪽 비용) |

**확장 쪽 변경 (중계로 바꿀 때)**
- `manifest.json` `host_permissions`: `https://api.typesafe.ai/*` → 중계 주소. `scripts/check.mjs`의 권한 검사도 함께 고친다.
- `background.js`: `callJev` 대신 중계로 `fetch`, 키 저장·확인 코드 삭제("연결 확인"은 `/health`).
- `popup.*`: 키 입력 칸 삭제.
- 확장 ID: 로컬 로드 ID와 스토어 ID가 다르다. 웹스토어에 **초안으로 먼저 올려 ID를 받고** `ALLOWED_ORIGIN`에 넣는다 (개발 중에는 매니페스트 `key`로 ID 고정 가능).

**확인한 것 (2026-10-17, 로컬):** 실제 Jev로 다음 버튼 184ms·민원 찾기 296ms, Origin 없는 요청은 403.
**확인 안 된 것:** Railway가 `X-Real-IP`를 덮어써 주는지(안 덮어쓰면 분당 한도를 헤더로 속일 수 있음), Railway를 거친 지연, service worker에서 `host_permissions`만으로 CORS 없이 호출되는지, Railway 실제 월 비용, TypeSafe 호출 한도. MCA 조항은 요약 발췌라 원문(https://typesafe.ai/legal/mca) 확인 필요.

## 공개 배포 전 해야 할 것

- [x] **이름:** `ldry-scrtry` (D-8). 매니페스트 설명에 "비공식, 정부24·행정안전부와 관계없음" 표기. 스토어 설명 첫 줄에도 같은 문구를 쓰고 정부 로고는 쓰지 않는다. 웹스토어 정책: "don't represent that your product is authorized by, endorsed by, or produced by another company or organization"
- [ ] **설치 전 고지와 동의:** 무엇을 보내는지 알리고, 동의 전에는 아무것도 보내지 않는다 (웹스토어 Disclosure 정책: "prior to installation", "affirmative and informed consent")
- [ ] **개인정보 처리방침 URL:** 확장 → 중계(싱가포르) → TypeSafe, 내용 저장 안 함, 접속 기록 7일, TypeSafe는 학습에 안 씀
- [ ] **Privacy 탭:** 단일 목적, 권한별 사유, 원격 코드 "없음"(Jev 답은 데이터), 데이터 항목(Website content, Web browsing activity 등), Limited Use 준수
- [ ] **아이콘:** `manifest.json`에 `icons` 16·48·128 추가. 스토어 이미지(128 아이콘, 440×280, 스크린샷 1280×800 — 개인정보 없는 화면)
- [ ] **`sanitize.js` 보완:** 지금은 숫자 6개 이상·`@`·"○○님"만 거른다 → 이름만 있는 글자, 숫자가 적은 주소("○○시 ○○구 ○○대로")가 제목 글·창 안내 글로 나갈 수 있다
- [ ] **로그인 이후 화면:** 중계로 가는 요청에 이름·주민번호·주소가 없는지 확인 (README "사람이 확인할 것")
- [x] **공개판 사이트 목록:** 정부24만 (D-8). 기관 사이트로 넘어가는 서류는 검색 결과에 알린다. 넓힐 때는 그 사이트를 시험한 뒤 `sites.js`의 `active`를 켠다
- [ ] 게시자 이름 변경, 2단계 인증 (위 「배포 현황」)
- [x] 해커톤 사전 개발 허용 범위 → 신경 쓰지 않음 (D-8)
- [x] **안내 문구:** "강사님께…" → "가족이나 정부24 고객센터(1588-2188)에 물어봐 주세요". 안내 창 제목 "정부24 길잡이" → "민원 길잡이 (비공식)" (2026-10-17)
- [ ] **「말로 하기」 고지:** 크롬 음성 인식은 소리를 구글 서버로 보낸다 → 처리방침·Privacy 탭·첫 동의 화면에 적는다
- [ ] **국외 이전 고지:** 확장 → Railway(싱가포르) → TypeSafe(미국 회사). 처리방침에 이전 국가·항목·목적·보관 기간 (개인정보보호법)
- [ ] **"안내가 틀릴 수 있어요" 고지:** 안내 창과 스토어 설명
- [ ] **「작게 접기」 기억:** 지금은 페이지가 바뀌면 다시 펼쳐진다
- [ ] **확장 ID 고정:** 초안 업로드 후 대시보드의 공개 키를 로컬 `manifest.json` `key`에 넣어 로컬판도 스토어와 같은 ID로 시험 (중계 `ALLOWED_ORIGIN` 확인용)
- [ ] **배포 지역·카테고리:** 대한민국만으로 제한할지, 접근성 계열 카테고리
- [ ] **일정:** 심사는 보통 며칠, 신규 계정은 몇 주 → **10월 말까지 첫 제출**. 통과 후 30일 안에 게시해야 한다

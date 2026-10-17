# 크롬 웹스토어 제출 자료 (ldry-scrtry)

> 대시보드에 그대로 옮겨 적는 자료다. **[ ]로 표시한 곳은 사람이 정해야 하는 값**이고, 지어내지 않았다.
> **상태 (2026-10-17): 제출 완료, 1차 거절(설명의 기관 이름 나열) → 수정 후 재제출, 심사 중.** 아래 §6의 체크 상태는 현재 기준이다.
> 제출은 배포 전용 Google 계정으로 https://chrome.google.com/webstore/devconsole 에서 사람이 한다 (로그인·결제 계정이라 자동화하지 않음).

## 1. 파일

| 항목 | 위치 |
|---|---|
| 확장 zip | `npm run package` → `ldry-scrtry.zip` (`manifest.json`·`src`·`icons`만. 서버 코드·키는 안 들어감) |
| 스토어 아이콘 128×128 | `icons/icon128.png` |
| 작은 홍보 이미지 440×280 | `icons/promo-440x280.png` |
| 스크린샷 1280×800 (4장) | `store/screenshots/*.jpg` (실제 정부24 공개 화면, 개인정보 없음) |
| 개인정보 처리방침 | `store/privacy/index.html` → **공개 주소에 올려야 한다** (비공개 저장소는 GitHub Pages 불가 → Vercel 등) |

## 2. 상품 정보 (Store listing)

- **이름:** manifest의 `name`이 그대로 쓰인다 → `ldry-scrtry`. 바꾸려면 manifest를 고치고 다시 묶는다.
- **요약 (132자 이하):** 정부24에서 다음에 누를 곳을 큰 빨간 테두리로 알려 주는 비공식 길잡이예요. 정부24·행정안전부와 관계없습니다.
- **카테고리:** 접근성 (Accessibility)
- **언어:** 한국어
- **상세 설명:** (2026-10-17 1차 거절 "Spam and Placement / Yellow Argon: 설명에 기관 이름 나열(과도한 키워드)" → 기관 이름을 설명에서 모두 뺐다. 설명에 사이트·기관 이름을 나열하지 않는다)

```
※ 이 확장은 정부 기관과 관계없는 비공식 도구입니다.

정부24에서 서류를 떼려는데 어디를 눌러야 할지 모르겠을 때, 다음에 누를 곳을 큰 빨간 테두리와 쉬운 말로 알려 줍니다.

■ 이렇게 써요
1. 정부24를 열면 오른쪽 아래에 「민원 길잡이」 창이 떠요. 처음에는 어떤 내용이 어디로 가는지 알려 드리고 동의를 받아요.
2. 떼고 싶은 서류를 쉬운 말로 적거나 말해요. (예: "이사 다닌 기록이 나오는 서류")
3. 길잡이가 서류 목록에서 비슷한 것을 찾아 보여 줘요. 맞는 것을 직접 골라요.
4. 화면마다 눌러야 할 곳에 빨간 테두리가 생겨요. 누르고 적는 것은 직접 해요.

■ 이런 점이 달라요
- 큰 글씨, 큰 버튼, 「소리로 듣기」를 지원해요.
- 약관 동의 화면에서는 「필수」 항목만 표시해요.
- 로그인·인증 방법을 고르는 화면에서는 테두리를 끄고 직접 고르시게 해요.
- 대신 눌러 주거나 입력하지 않아요. 알려 주기만 해요.
- 칸에 적은 내용은 읽지도 보내지도 않아요.

■ 켜지는 곳
정부24, 그리고 서류를 받으러 정부24에서 넘어가는 일부 기관 사이트에서만 켜져요. 그 밖의 사이트에서는 아무 일도 하지 않아요.

■ 꼭 알아 두세요
- AI가 틀릴 수 있어요. 누르기 전에 눈으로 꼭 확인해 주세요.
- 화면의 버튼·칸 이름, 화면 제목, 쪽 주소(쿼리 제외), 적거나 말한 서류 이름이 서버를 거쳐 AI 서비스로 전해져요. 서버는 내용을 저장하지 않아요. 자세한 내용은 개인정보 처리방침을 봐 주세요.
```

## 3. 개인정보 탭 (Privacy practices)

- **단일 목적(Single purpose):** 정부24와 서류 발급 기관 사이트에서, 사용자가 고른 서류를 발급받기 위해 다음에 누를 버튼을 화면에 표시해 안내한다.
- **권한별 사유:**

| 권한 | 사유 |
|---|---|
| `storage` | 안내 중인 서류, 이미 누른 버튼 이름, 동의 여부, 안내 창을 접었는지를 이 컴퓨터에 저장한다 |
| 호스트 `https://relay-production-4d72.up.railway.app/*` | 화면의 버튼·칸 이름을 걸러서 이 확장 전용 서버로 보내 다음에 누를 곳을 판단받는다 |
| 콘텐츠 스크립트 호스트 16개 (정부24 2개 + 기관 사이트) | 해당 사이트 화면에서 버튼·칸의 이름과 위치를 읽어 빨간 테두리를 그리기 위해서다. 다른 사이트에서는 실행되지 않는다 (`<all_urls>` 없음) |

- **원격 코드:** 사용하지 않음. 모든 코드가 패키지 안에 있다. AI 서비스의 답은 코드가 아니라 선택한 항목 이름(데이터)이다.
- **수집하는 사용자 데이터 (대시보드 체크 권장안 — 사람이 확인):**

| 분류 | 체크 | 이유 |
|---|---|---|
| 웹사이트 콘텐츠 | 예 | 화면의 버튼·칸 이름, 화면 제목, (정부24에서만) 제목 글·창 안내 글 |
| 웹 기록 | 예 | 쪽 주소(호스트+경로, 쿼리·세션 값 제거) |
| 사용자 활동 | 예 | 앞서 누른 버튼 이름 8개까지, 사용자가 적은 서류 이름 |
| 개인 식별 정보 | 아니오 | 칸에 적은 값은 읽지 않고, 숫자 6개 이상·이메일·"○○님"·주소 모양 글자는 버린다. **다만 이름만 있는 글자는 걸러내지 못할 수 있다 → 이 항목은 정직하게 "예"로 하는 편이 안전한지 판단 필요** |
| 건강·금융·인증 정보 | 아니오 | 건강보험·홈택스 화면에서도 버튼·칸 **이름**만 보내고, 화면 속 글(제목 글·창 안내 글)은 보내지 않는다 |


### 3-1. 대시보드에 입력하는 영어 문구 (심사자용, 각 1,000자 이하)

**single_purpose** (357자)
```
Help people use the Korean government portal Gov24 (gov.kr) and a small set of government document-issuing sites to get a document issued, by showing a large red outline around the next button the user should press for the document they chose. The extension only points. It never clicks, types or submits anything for the user, and it does not handle login.
```

**storage** (259자)
```
Stores, on the user's device only: which document the user is being guided to get, the names of the buttons already pressed (up to 8), whether the user accepted the in-extension consent notice, and whether the guide panel is collapsed. Nothing else is stored.
```

**host** (692자)
```
1) https://relay-production-4d72.up.railway.app (our own server): after the user consents, the extension sends button/field names, the page title and the URL path (no query string) so the server can choose which button to highlight. Typed values are never read or sent.
2) Content script on gov.kr and plus.gov.kr (Gov24) and on the document-issuing sites Gov24 hands users over to: efamily.scourt.go.kr, car365.go.kr, eais.go.kr, nip.kdca.go.kr, hometax.go.kr, efine.go.kr, nhis.or.kr, wetax.go.kr, pmp.mpva.go.kr, realtyprice.kr, e-health.go.kr, 4insure.or.kr. It reads the names and positions of buttons, links and fields to draw the outline. It does not run anywhere else (no <all_urls>).
```

- **Remote code:** "No, I am not using remote code" (모든 코드가 패키지 안에 있음. AI 서비스의 답은 코드가 아니라 선택한 항목 이름)

- **인증:** 사용자 데이터를 판매하지 않음 / 단일 목적과 관계없는 용도로 쓰지 않음 / 신용·대출 판단에 쓰지 않음 — 모두 해당 (체크)
- **개인정보 처리방침 URL:** https://ldry-scrtry-privacy.vercel.app/

## 4. 배포

- **공개 범위:** 공개(Public). **배포 지역:** 제출 때 입력한 값을 대시보드에서 확인 (대한민국만으로 제한해도 무방)
- **판매자 상태:** 비판매자(Non-trader) — 계정 설정에서 이미 신고
- **게시 방식:** "심사 통과 후 직접 게시"를 고르면 통과 후 30일 안에 눌러서 게시한다

## 5. 심사자에게 주는 시험 안내 (Test instructions)

```
로그인 없이 확인할 수 있어요.
1. 확장을 설치하고 https://www.gov.kr/mw/AA020InfoCappView.do?HighCtgCD=A01010001&CappBizCD=13100000015 를 엽니다.
2. 오른쪽 아래 「민원 길잡이」 창에서 「동의하고 시작하기」를 누릅니다. (동의 전에는 서버로 아무것도 보내지 않습니다)
3. 검색 칸에 "이사 다닌 기록"을 적고 「찾기」 → 「주민등록표 초본」을 고릅니다.
4. 「발급하기」 버튼에 빨간 테두리가 생깁니다. 누르면 회원/비회원 선택 창이 뜨는데, 여기서부터는 로그인에 해당하므로 **테두리를 끄고 "직접 골라 주세요"라는 안내만** 보여 줍니다. (로그인·인증 방법 선택은 사용자가 직접 합니다)
※ 정부24 로그인(간편인증 등)은 실제 본인 인증이 필요해 확인하지 못해도 됩니다. 확장은 직접 클릭·입력하지 않고, 로그인 화면에서는 서버에도 아무것도 보내지 않습니다.
※ 서버는 무료 요금제라 잠들어 있으면 첫 요청이 몇 초 걸리거나 한 번 실패할 수 있어요. 한 번 더 누르면 됩니다.
```

### 5-1. 실제 대시보드 입력 (영어, 500자 이하)

- Username / Password: **비워 둔다** (로그인이 필요 없는 확장, 개인 계정 정보를 넣지 않는다)
- Additional instructions (486자):
```
No login needed.
1) Install, open https://www.gov.kr/mw/AA020InfoCappView.do?HighCtgCD=A01010001&CappBizCD=13100000015
2) In the bottom-right panel press "동의하고 시작하기" (consent). Nothing is sent to our server before that.
3) Type "이사 다닌 기록", press "찾기", pick the first result.
4) "발급하기" gets a red outline. After it is pressed a member/non-member dialog opens; the guide stops highlighting there on purpose (login is done by the user).
The first request after idle can take a few seconds.
```

## 6. 제출 전 확인

- [x] 개인정보 처리방침 공개: https://ldry-scrtry-privacy.vercel.app/ (운영자 "ldry-scrtry 개발팀" 임시, 문의 dorazeeing@gmail.com)
- [ ] 게시자 이름을 팀 이름으로 바꾼다 (정부 기관처럼 보이는 이름 금지), 2단계 인증 확인
- [x] 초안 업로드로 **확장 ID를 받음** (`poicbfndbnffkpkmmkmhmnehpbmemnif`) → Railway `ALLOWED_ORIGIN`에 추가 완료
- [ ] 승인 뒤 위 시험 안내 1~4를 스토어판으로 직접 해 본다
- [ ] 기관 사이트 12곳은 **자동 시험을 못 했다** (robots·로그인). 실제 크롬으로 서류마다 따라가 보고, 안 되는 곳은 `src/lib/sites.js`에서 `active`를 끄고 `manifest.json`을 맞춘 뒤 새 버전으로 올린다 (심사 중에는 고치지 않는다)

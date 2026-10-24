# TypeSafe Jev 정리 (사용법 · 사례 · 우리 적용 후보)

> 조사일: 2026-10-17. 공식 문서(docs.typesafe.ai)를 1순위로 삼고, 기사·블로그는 보조로만 썼다. 문서에서 확인하지 못한 것은 "문서에서 확인 못 함"으로 적었다. 속도·비용 수치는 대부분 **벤더 주장**이다.
> 설계·구현할 때는 TypeSafe 스킬(`typesafe@typesafe-ai`)을 따르고, 최신 계약은 항상 공식 문서를 다시 확인한다.
> 2026-10-24: 해커톤 폴더 `docs/jev.md`를 복사해 왔다 (해커톤 쪽 원본은 그대로 둠). 본문의 「우리 프로젝트」, `AGENTS.md` §1·§3, `docs/ideas.md`는 해커톤 기준이다. 이 확장이 Jev를 쓰는 방식은 `docs/usageJev.md`와 루트 `AGENTS.md` 「중계 서버」에 있다.

---

## 1. 한 줄 요약과 우리 프로젝트에서의 위치

**Jev는 글을 쓰지 않고 "판단"만 하는 AI 모델이다.** 상태(텍스트·JSON)와 타입이 정해진 질문을 받아 선택지·점수·예/아니오 확률을 돌려준다. TypeSafe는 이런 모델을 "System One" 모델이라 부르고, Jev가 첫 모델이다.

| | Claude (생성 모델) | Jev (System One 판단 모델) |
|---|---|---|
| 출력 | 자유 문장, JSON 생성 | 고정된 타입의 답 + 확률 (Choice / Score / Noul) |
| 잘하는 것 | 설명, 요약, 쉬운 말 변환, 사진 이해, 대화 | 분류, 라우팅, 순위, 검증, 가드레일 같은 짧은 판단 |
| 못하는 것 | 매번 확률 보정된 숫자를 주지는 않음 | 글 생성, 계산·개수 세기, 이미지 입력 |
| 비용 구조 | 입력 + 출력 토큰 과금 | 입력 토큰만 과금, 출력 무료 |

**우리 프로젝트에서의 위치** (`AGENTS.md` §1 결정 대기)
- 도입 여부는 아직 **미정**이다. early access 승인과 한국어 정확도 확인이 먼저다.
- 미도입 시 같은 판단을 `claude-haiku-5-5` + structured outputs로 처리한다.
- 어느 쪽이든 판단 호출은 `backend/src/client/`의 **한 인터페이스 뒤**에 두어 Jev ↔ Haiku를 바꿔 끼울 수 있게 한다.
- 역할 분담 원칙: **판단은 Jev, 글·설명·사진 이해는 Claude, 계산·규칙·정확한 조회는 코드.**

---

## 2. 작동 방식

### 입력과 출력
- **입력:** `state`(판단 대상: 문자열·객체·배열) + `questions`(질문 ID → 질문 정의) + `model`
- **질문 정의:** `instructions`(무엇을 판단할지) + `criteria`(가능한 답의 정의)
- **출력:** 질문 ID별 답 + `usage`(입력·출력 토큰)
- 같은 요청 안의 질문들은 **병렬로 평가**되고 서로의 답을 보지 못한다. 앞 답에 따라 다음 질문이 바뀌면 요청을 나눠야 한다.
- 질문 ID는 코드용이라 모델에 전달되지 않는다. 질문 의미는 `instructions`에 완전히 담아야 한다.

### 질문 타입 (Primitives)

| 타입 | 쓰는 경우 | 답 | 제약 |
|---|---|---|---|
| **Choice** | 정해진 선택지 중 하나 | `choice`, `probabilities`, `confidence` | 선택지 최대 255개 |
| **Score** | 순서 있는 단계 중 어느 정도인가 | `score`, `legend`, `probabilities`, `confidence` | 단계 2~10개 |
| **Noul** | 조건이 성립하는가 (예/아니오) | `noul` (예일 확률 0~1) | `confidence` 없음. 0.5 근처 = 반반이라는 뜻 |
| Box | 이미지 영역 관련 질문 (문서 색인에 있음) | 문서에서 세부 확인 안 함 | 현재 공개 모델(Jev 1.13/1.14)은 텍스트 입력만 지원 |

### 확률과 confidence 쓰는 법 (공식 권고)
- 임계값은 하나로 통일하지 말고 **행동의 위험도에 따라** 다르게 둔다. 되돌리기 어려운 행동일수록 높게.
- 공식 예시: confidence 0.5 미만이면 사람에게, 파괴적 작업은 0.9 초과일 때만 확인 없이 진행.
- confidence가 높다는 건 분포가 한쪽에 몰렸다는 뜻이지, 결과가 맞다는 보장이 아니다. **우리 데이터로 직접 검증**해야 한다.

### 모델, 가격, 한도 (공식 문서 `models`)

| 항목 | 내용 |
|---|---|
| 모델 | `jev-1.13.0`, `jev-1.14.0` (1.14는 2026-10-14부터) |
| 별칭 | `jev-latest` → 1.13.0 (안정), `jev-preview` → 1.14.0 |
| 컨텍스트 | 요청당 64k, 질문당 32k 토큰 (특수 헤더로 262k까지 가능하나 속도·정확도 저하) |
| 가격 | 입력 토큰 100만 개당 **$0.042**, 출력 무료 |
| 입력 형식 | **텍스트만** (이미지·오디오·영상 불가) |
| 언어 | 영어가 주 학습 언어로 가장 정확. 다른 언어(CJK 포함)도 처리하지만 **영어만큼 정확하지 않다**고 명시. 한국어는 따로 언급 없음 |
| 지연시간 | 모델 문서에는 없음. 사용 사례 문서는 실시간 앱 용도로 "약 150ms", 기사들은 "70~500ms"(벤더 수치) |
| 레이트 리밋 | 구체 수치는 문서에서 확인 못 함. 429(한도 초과)·529(일시 과부하)는 지수 백오프로 재시도, 공식 SDK가 기본 재시도 |

---

## 3. 사용 방법

### 가입과 API 키
- 공식 퀵스타트는 TypeSafe 콘솔(`https://console.typesafe.ai/keys`)에서 키를 발급받으라고 안내한다. 회원가입 절차나 대기자 명단 언급은 **문서에 없다**.
- 반면 여러 외부 기사(2026-09 기준)는 **early access 대기자 명단 승인 후** 키를 받는다고 쓴다. 지금도 그런지는 확인하지 못했다 → 직접 가입해 확인해야 한다.
- 대안 경로: **Vercel AI Gateway**로도 Jev를 호출할 수 있다 (2026-09-21 Vercel 변경 기록).
  - TypeSafe 클라이언트의 기본 URL을 `https://ai-gateway.vercel.sh/typesafe`로 바꾸고, 키로 `AI_GATEWAY_API_KEY`를 쓴다.
  - 새 연동의 모델 이름은 `typesafe-ai/jev`이고, 요금은 AI Gateway 쪽으로 청구된다.
  - 우리는 프론트를 Vercel에 배포하므로, TypeSafe 승인이 늦으면 이 경로가 현실적인 대안이다.
- 키는 환경변수 `TYPESAFE_API_KEY`로 읽는다. **Railway(백엔드) 환경변수에만 둔다.** 프론트에서 직접 호출하지 않는다 (`AGENTS.md` §3 비밀값 규칙).
- **이용 조건** (TypeSafe Master Customer Agreement, 2026-10-17 요약 발췌 — 결정 전 [원문](https://typesafe.ai/legal/mca) 확인):
  - §2.2 우리가 만들어 운영하는 소프트웨어에 API를 넣는 것은 허용된다.
  - §2.3(a) 서비스를 남에게 재판매·배포·제공하는 것은 금지 → 아무 요청이나 대신 보내는 범용 중계는 안 된다. 질문을 서버가 고정한 **우리 기능 전용 엔드포인트**만 연다.
  - §2.4 키는 비밀로 두고 공유하지 않는다 → **키를 프론트·크롬 확장에 넣어 배포하면 위반**이다.
  - [개인정보 처리방침](https://www.typesafe.ai/privacy-policy): 입력을 모델 학습·미세조정에 쓰지 않는다. 보관 기간은 명시돼 있지 않다 (보관 안 함 옵션은 기업 고객용).

### 설치 (공식 SDK)

| 언어 | 패키지 | 설치 | 요구 버전 |
|---|---|---|---|
| JavaScript/TypeScript | `@typesafe-ai/sdk` | `npm install @typesafe-ai/sdk` | SDK 문서는 Node.js 22 이상, 퀵스타트는 20 이상 → **22 이상으로 맞춘다** |
| Python | `typesafe-sdk` | `pip install typesafe-sdk` 또는 `uv add typesafe-sdk` | Python 3.10 이상 |
| HTTP | — | `POST https://api.typesafe.ai/v1/systemone`, 헤더 `Authorization: Bearer <키>` | — |
| Java(Spring) | 공식 SDK 없음 | 위 HTTP API를 직접 호출 | — |

### 최소 호출 예시 (공식 문서 원문 그대로)

JavaScript ([출처](https://docs.typesafe.ai/sdk/javascript.md)):

```ts
import { choice, TypeSafeClient } from "@typesafe-ai/sdk";

const client = new TypeSafeClient();
const response = await client.systemOne({
  state: { document: "I was charged twice. Please fix this ASAP." },
  questions: {
    category: choice("What is this ticket about?", {
      billing: null,
      technical: null,
      other: null,
    }),
  },
});

console.log(response.answers.category.choice);
```

Python 동기 클라이언트 ([출처](https://docs.typesafe.ai/sdk/python.md)):

```python
from typesafe_sdk import Choice, Noul, Score, TypeSafeClient

with TypeSafeClient() as client:
    response = client.system_one(
        state={"document": "I was charged twice. Please fix this ASAP."},
        questions={
            "billing": Noul(instructions="Is this ticket about billing?"),
            "tone": Choice(
                instructions="What is the customer's tone?",
                criteria={"calm": None, "frustrated": None, "angry": None},
            ),
            "urgency": Score(
                instructions="How urgent is this ticket?",
                criteria=["can wait", "this week", "today"],
            ),
        },
    )

print(response.nouls["billing"].noul)
print(response.choices["tone"].choice)
print(response.scores["urgency"].score)
```

HTTP 요청 본문의 필드는 `state`, `model`(예: `"jev-latest"`), `questions`이고, 질문마다 `type`(`"noul"` / `"choice"` / `"score"`), `instructions`, `criteria`를 넣는다. 전체 예시는 [HTTP API 문서](https://docs.typesafe.ai/api.md)에 있다.

### 에러 처리 (HTTP API 문서)

| 코드 | 의미 | 우리 대응 |
|---|---|---|
| 400 | 요청 규칙 위반 (`max_tokens_exceeded` = 컨텍스트 초과) | `state`를 줄인다 (필요한 필드만) |
| 401 | 키 없음·잘못됨 | Railway 환경변수 확인 |
| 413 | 본문 32 MiB 초과 | — |
| 422 | 필드 검증 실패 | 질문 정의 확인 (Score 단계 2~10개 등) |
| 429 / 529 | 한도 초과 / 일시 과부하 | SDK 기본 재시도 + **실패 시 Haiku 대체 경로** |

JS SDK에는 `AuthenticationError`, `RateLimitError`, `APITimeoutError`, `APIConnectionError` 같은 예외 클래스가 있다 ([JS API 레퍼런스](https://docs.typesafe.ai/sdk/javascript/api.md)).

### 질문 잘 쓰는 법 (공식 가이드·스킬 요약)
- **한 질문 = 좁고 일관된 판단 하나.** 여러 판단을 섞지 않는다.
- 판단에 필요한 정보만 `state`에 넣는다. 관련 없는 내용이 많을수록 정확도가 떨어진다 ("context rot").
- 이중 부정, 복잡한 간접 표현을 피하고 `instructions`와 `criteria`를 **같은 언어**로 맞춘다.
- "해당 없음" 선택지를 넣는다. 후보에 없는 답은 고를 수 없다.
- 계산·개수 세기·날짜 비교는 **코드로** 한다 ("Jev is not a calculator").
- 첫 번째 선택지를 선호하는 경향이 있으니 순서를 바꿔 일관성을 확인한다.
- 입력 내용이 모델을 조종하려 들면 답이 바뀔 수 있다 (적대적 입력 주의).

---

## 4. 활용 패턴 (공식 문서·쿡북)

| 패턴 | 공식 설명 한 줄 | 출처 |
|---|---|---|
| 라우팅·인자 채우기 | 요청 하나로 처리할 핸들러와 그 인자를 함께 고른다 | [Function calling](https://docs.typesafe.ai/cookbooks/function_calling.md), [Intent routing](https://docs.typesafe.ai/patterns/intent-routing.md) |
| 투기적 동시 질문 | 나중에 필요할 수 있는 질문까지 한 요청에 묶어 병렬로 묻고, 코드가 필요한 답만 쓴다 | [Speculative fan-out](https://docs.typesafe.ai/patterns/fan-out.md) |
| 확신도 기반 라우팅 | 낮은 confidence는 공통 하한선(예: 0.6)으로 사람에게, 그 위에서는 위험도별로 임계값을 다르게 | [Confidence-gated routing](https://docs.typesafe.ai/patterns/confidence-routing.md) |
| 생성 대신 선택 | 후보 값·문장은 코드가 찾고, Jev는 그중 맞는 것을 고른다 | [Pre-parsed value extraction](https://docs.typesafe.ai/cookbooks/pre_parsed_value_extraction_cookbook.md) |
| 근거 찾기·재정렬 | 후보 문서를 질의와의 관련도로 점수 매겨 고른다 | [Re-ranking](https://docs.typesafe.ai/cookbooks/rerank_typesafe.md), [Hierarchical classification](https://docs.typesafe.ai/cookbooks/hierarchical_classification.md) |
| 복합 점수 | 여러 차원을 한 번 점수 매기고, 가중치·필터는 코드에서 바꾼다 (재추론 불필요) | [Composite scoring](https://docs.typesafe.ai/patterns/composite-scoring.md) |
| 검증·에스컬레이션 | 특정 주장·필드를 근거와 대조하고, 불확실하거나 실패하면 사람이나 다른 시스템으로 넘긴다 | [Citation check](https://docs.typesafe.ai/cookbooks/citation_check.md), [SDE cascade](https://docs.typesafe.ai/cookbooks/sde_cascade.md) |
| LLM 가드레일 | 입력·출력마다 Noul 여러 개(탈옥, 해로운 요청, 의료 조언, 자해)와 해악 Score를 한 요청으로 묻고, 코드의 임계값 정책으로 통과·검토·차단·지원을 정한다 | [Guardrails for LLMs](https://docs.typesafe.ai/cookbooks/llm_guardrails.md) |

공식 사용 사례 지도는 고객 지원 분류, 채용(이력서·지원서를 직무 기준으로 평가하고 불확실하면 사람에게), 금융 범죄, 보험 청구 사기 징후, 모더레이션, 모델 라우팅 등 19개 분야를 든다 ([Use-case map](https://docs.typesafe.ai/concepts/use-case-map.md)).

---

## 5. 실제 사용 사례 (확인된 것만)

| 사례 | 무엇에 썼나 | 검증 수준 | 출처 |
|---|---|---|---|
| Classmethod (일본) — NeMo Switchyard 라우터 | Slack 에이전트 요청을 경량/고성능 모델로 나누는 판단 모델을 Jev로 교체. 판단 시간 중앙값 1.55초 → 0.27~0.42초, 39건 중 39건 정답, 호출당 약 $0.000023. 라우팅 기준을 **일본어로 작성** | 제3자 실측 (단, 13개 시나리오의 좁은 테스트이고 일본어만 따로 떼어 낸 정확도 측정은 없음) | [Classmethod](https://dev.classmethod.jp/en/articles/reona-dgx-spark-switchyard-jev-classifier/) |
| Vercel 엔지니어 — 명령어 안전 검토 | AI 코딩 에이전트가 실행하려는 셸 명령이 안전한지 판단 | 언론 보도된 개별 사례 (넓은 운영 근거는 아님) | [RuntimeWire](https://runtimewire.com/article/typesafe-investors-discuss-a-higher-valuation-after-jev-reaches-nearly-13-of-one) |
| Vercel Academy 강의 — 문의 라우팅 | 문의 폼 메시지를 읽고 담당 팀 ID를 고르는 예제 | 교육용 예제 | [Vercel Academy](https://vercel.com/academy/make-decisions-with-jev) |
| Vercel AI Gateway 도입 | 출시 24시간 안에 유료 팀의 약 13%가 사용 | Vercel 발표 수치. "시험 사용"이지 유료 수요 증명은 아니라는 지적 있음 | [RuntimeWire](https://runtimewire.com/article/typesafe-investors-discuss-a-higher-valuation-after-jev-reaches-nearly-13-of-one) |
| LiteLLM Jev Auto Router | Choice 질문 하나로 여러 모델 등급 중 하나를 골라 요청을 보냄 | 통합 기능 문서 | [LiteLLM](https://docs.litellm.ai/docs/pass_through/typesafe.md) |
| LangChain 연동 | TypeSafe 프로바이더 통합 | 통합 기능 문서 | [LangChain](https://docs.langchain.com/oss/integrations/providers/typesafe) |
| 공식 쿡북 | 가드레일(jev-1.12로 샘플 15개 실행 예시), Twitch 채팅 필터, 인용 검증, 날짜 추출 등 | 벤더 예제 (정확도 수치 대부분 없음) | [Cookbooks](https://docs.typesafe.ai/cookbooks.md) |

**정리:** 실제로 확인된 사례는 7건이고, 대부분 **라우팅·분류·안전 판단**이다. 독립적인 대규모 정확도 평가는 찾지 못했다.

---

## 6. 우리 아이디어에 적용하면

> 아래 "질문 예시"는 **우리 기능을 자연어로 설명한 것**이지 SDK 코드가 아니다. 실제 구현은 §3의 공식 형식을 따른다.
> 원칙: Jev는 **판단**만 맡는다. 문장 생성·사진 판독·숫자 계산은 Claude나 코드가 맡는다.

| 아이디어 (`docs/ideas.md`) | Jev가 맡을 판단 | 질문 예시 (자연어) | 타입 | Jev 대신 Haiku로 할 때와의 차이 |
|---|---|---|---|---|
| **G2 사칭 노쇼 방패** (§8) | 문자·통화 내용의 사칭 사기 신호 | "대리 구매·대리 결제를 요구하는가?", "공문·신분증을 근거로 신뢰를 요구하는가?", "선입금을 요구하는가?" + 위험도 4단계 | Noul 여러 개 + Score | 신호별 확률이 나와 위험 정책을 코드에서 조정 가능. Haiku는 등급만 주고 확률 보정이 없다 |
| **J2 공고 거품 측정기** (§7) | 공고 조건 하나하나가 실제 필수인지 | (코드로 조건 문장을 나눈 뒤) "이 조건은 이 직무 신입에게 필수 / 우대 / 형식적 문구 중 무엇인가?" | Choice (조건마다) | 조건 수십 개를 한 요청에 병렬로 물을 수 있어 빠르고 싸다. 조건 분리는 코드가 해야 한다 |
| **J5 편의 제공 공고** (§7) | 직무 과업이 특정 편의로 가능한지 | "이 과업을 화면낭독기 사용자가 수행할 수 있는가?" (과업 × 편의 조합마다) | Noul | 조합이 많을수록 비용 차이가 커진다. 판단이 틀리면 상처가 되므로 "참고용" 표시 유지 |
| **K1 불합격 노트** (§7) | 탈락한 지원마다 부족했던 역량 유형 | "이 공고 요구와 이 이력서를 비교할 때 가장 큰 차이는? (기술 / 경력 / 자격증 / 해당 없음)" | Choice (지원마다) | 패턴 집계("7건 중 5건이 SQL")는 **코드가** 센다. Jev는 개수 세기를 못 한다 |
| **E1 모두의 재난문자** (§9-3·9-4) | 문자가 이 사람에게 해당하는지, 어떤 행동이 필요한지 | "이 재난문자가 ○○동 거주 휠체어 사용자에게 해당하는가?", "필요한 행동은 대피 / 실내 대기 / 주의 / 해당 없음 중 무엇인가?" | Noul + Choice | 판단은 빠르게 Jev, 쉬운 말·그림 설명 생성은 Claude. 두 모델 역할이 깔끔히 나뉜다 |
| **D1 위험 신호 레이더** (§9-4) | 시민 신고 문장이 같은 위험을 가리키는지, 심각도 | "이 신고는 침수 위험에 관한 것인가?", "심각도는 4단계 중 어디인가?" | Noul + Score | 수위·강수량 같은 숫자 기준은 코드로. Jev는 신고 문장의 의미만 판단 |
| **D2 위험 신고·처리 추적** (§9-4) | 신고 시설 유형, 규칙표 후보 중 관할 선택 | "이 신고는 도로 파임 / 맨홀 / 전신주 / 보도 / 기타 중 무엇인가?" | Choice | Jev는 **이미지를 못 받는다.** 사진 판독(맨홀 표시 글자)은 Claude가 하고, 그 텍스트로 Jev가 판단 |
| **G4 상가 임대차 지킴이** (§8) | 계약 조항이 점검 대상 유형인지 | "이 조항은 권리금 회수를 막는 특약인가?" (조항마다) | Noul | 법률 판단이라 확률이 높아도 "상담 연결"을 항상 붙인다. 인상률 계산은 코드 |
| **G1 말로 쓰는 장부** (§8) | 말한 내용이 매출 / 매입 / 기타 중 무엇인지 | "이 말은 판매 기록 / 구입 기록 / 기록 아님 중 무엇인가?" | Choice | 품목·금액 **추출은 Jev가 못 한다** (생성·숫자). 추출은 Haiku나 정규식, 분류만 Jev |
| **공통: Claude 호출 줄이기** | 이 요청에 비싼 생성 모델이 필요한지 | "이 요청은 짧은 정해진 답으로 충분한가, 긴 설명이 필요한가?" | Choice | Classmethod 사례와 같은 모델 라우팅. $100 크레딧을 아끼는 용도 |

**적용 후보는 10개**다. 이 중 Jev의 강점(빠르고 싼 다중 판단 + 확률)이 가장 잘 드러나는 곳은 **G2(사기 신호 여러 개)**, **J2(조건 수십 개 병렬)**, **E1(판단은 Jev, 설명은 Claude)**이다.

---

## 7. 한계와 리스크

| 리스크 | 내용 | 대응 |
|---|---|---|
| 접근 권한 | 해소 (2026-10-17 키 발급·호출 확인) | 키 문제가 생기면 Vercel AI Gateway 경로 |
| **한국어** | 공식 문서: 영어가 가장 정확하고 CJK는 "영어만큼 정확하지 않다". 한국어 단독 검증 자료는 없음 (Classmethod는 일본어 기준을 썼지만 언어별 정확도 측정은 없음) | 한국어 실제 데이터 20~30건으로 직접 테스트. 필요하면 `instructions`·`criteria`를 영어로 쓰고 `state`만 한국어로 넣는 방식도 비교 |
| 벤더 수치 | "LLM보다 수백 배 빠르고 싸다", "70~500ms"는 TypeSafe 자체 평가 | 데모 시나리오로 우리 환경에서 지연·비용을 직접 측정 |
| 데이터 외부 전송 | `state`가 TypeSafe(또는 Vercel) 서버로 전송됨. TypeSafe는 학습에 쓰지 않는다고 명시, 보관 기간은 미명시 | 주민번호·전화번호·실명 등 개인정보는 넣지 않는다. 데모는 가상 데이터만 (`AGENTS.md` §3) |
| 이미지 불가 | 공개 모델은 텍스트만 | 사진은 Claude가 먼저 텍스트로 바꾼다 |
| 계산·추출 불가 | 개수·날짜·금액 계산과 값 생성에 약함 | 코드·정규식·Haiku로 처리하고 Jev는 선택만 |
| 가격 정보 불일치 | 공식 모델 문서는 $0.042/100만 입력 토큰. Vercel 경로는 Gateway 요금표 따름. 무료 등급은 확인 못 함 | 사용 전 콘솔·Gateway 요금 페이지에서 재확인 |
| 데모 당일 장애 | 429·529, 네트워크 문제 | `backend/src/client/` 인터페이스에서 실패 시 `claude-haiku-5-5` + structured outputs로 자동 전환 |

---

## 8. 도입 체크리스트

- [x] TypeSafe 콘솔 가입·API 키 발급 — 2026-10-17 발급 완료. 실험용 확장(`reference/slop-detector/`)에서 HTTP 직접 호출로 X 게시물 판정 동작 확인 (정확도는 미측정, `reference/slop-detector/usePlan.md`)
- [ ] Playground에서 고른 아이디어의 질문 2~3개를 한국어로 시험
- [ ] **한국어 정확도 테스트 20~30건**: 정답을 미리 붙인 실제 형태의 데이터로 Jev와 Haiku를 나란히 비교 (정확도, 지연, 건당 비용)
- [ ] `instructions`를 한국어로 쓸 때와 영어로 쓸 때의 차이 비교
- [ ] 레이트 리밋 확인 (문서에 수치 없음 → 데모 시나리오를 연속 실행해 429가 나는지 확인)
- [ ] 비용 계산: 데모 하루 예상 호출 수 × 평균 입력 토큰 × $0.042/100만
- [ ] 대체 경로 구현: 판단 인터페이스 하나 + Jev 구현체 + Haiku 구현체, 실패 시 자동 전환
- [ ] 키는 Railway 환경변수(`TYPESAFE_API_KEY` 또는 Gateway 사용 시 `AI_GATEWAY_API_KEY`)에만
- [ ] 결과를 보고 `AGENTS.md` §1 "판단 모델" 항목을 확정으로 옮기기

---

## 9. 출처

**공식 문서 (TypeSafe)**
- 문서 색인: https://docs.typesafe.ai/llms.txt
- 퀵스타트: https://docs.typesafe.ai/introduction/quickstart.md
- HTTP API: https://docs.typesafe.ai/api.md
- JavaScript SDK: https://docs.typesafe.ai/sdk/javascript.md
- Python SDK: https://docs.typesafe.ai/sdk/python.md
- 모델: https://docs.typesafe.ai/models.md
- Jev 1.13 약점: https://docs.typesafe.ai/model-jaggedness/jev-1.13.md
- 사용 사례 지도: https://docs.typesafe.ai/concepts/use-case-map.md
- Confidence: https://docs.typesafe.ai/confidence.md
- Confidence-gated routing: https://docs.typesafe.ai/patterns/confidence-routing.md
- Guardrails 쿡북: https://docs.typesafe.ai/cookbooks/llm_guardrails.md
- TypeSafe 스킬 원문: https://github.com/typesafe-ai/skills/blob/main/skills/typesafe-ai/SKILL.md

**연동·사례**
- Vercel AI Gateway 변경 기록 (2026-09-21): https://vercel.com/changelog/ai-gateway-now-supports-typesafe-clients-and-an-http-api-for-jev
- Vercel Academy: https://vercel.com/academy/make-decisions-with-jev
- Classmethod 실측: https://dev.classmethod.jp/en/articles/reona-dgx-spark-switchyard-jev-classifier/
- LiteLLM: https://docs.litellm.ai/docs/pass_through/typesafe.md
- LangChain: https://docs.langchain.com/oss/integrations/providers/typesafe
- RuntimeWire: https://runtimewire.com/article/typesafe-investors-discuss-a-higher-valuation-after-jev-reaches-nearly-13-of-one

**보조 (기사·리뷰, 수치는 벤더 주장 포함)**
- Let's Data Science: https://letsdatascience.com/news/typesafe-ai-launches-jev-decision-model-889a38c0
- Create With: https://createwith.com/tool/vercel/updates/vercel-adds-jev-from-typesafe-ai-to-ai-gateway
- eesel 가격 정리: https://www.eesel.ai/blog/typesafe-jev-pricing
- Tech Jack Solutions (early access 언급): https://techjacksolutions.com/ai-tools/typesafe/what-is-jev-typesafe-ai/

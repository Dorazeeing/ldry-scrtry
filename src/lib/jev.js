// Jev(TypeSafe System One) 호출과 답 해석. 형식은 공식 문서 https://docs.typesafe.ai/api.md, /primitives/choice.md 기준.
// 코드가 후보(버튼·링크·칸 이름)를 모으고, Jev는 그중 하나를 고르기만 한다 ("생성 대신 선택").

import { STAGES } from './goals.js';
import { NONE_OPTION } from './sanitize.js';

export const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const MODEL = 'jev-latest';
// 질문 문구·형식을 바꾸면 올린다 (캐시 무효화)
export const RUBRIC_VERSION = 8;
// 고른 후보의 확률이 이 값보다 낮으면 강조하지 않는다.
// confidence(분포가 한 곳에 몰린 정도)가 아니라 확률을 쓰는 이유: "회원 신청하기"(0.41)·"비회원 신청하기"(0.30)처럼
// 맞는 길이 둘이면 confidence가 0.2대로 떨어진다. 2026-10-17 시험 24건에서 0.35는 맞은 것을 모두 보여 주고 틀린 것을 모두 걸렀다 (README).
export const MIN_PROBABILITY = 0.35;
// 중계 서버 안에서 Jev를 기다리는 총 시간(5초 × 2번 + 쉼 ≤ 1초)이 확장의 기다림(relay.js TIMEOUT_MS 12초)보다 짧아야 한다.
// 길면 확장이 먼저 포기하고, 서버는 아무도 안 받을 답을 계속 기다린다. Jev는 보통 0.2~0.6초 (README 시험 기록).
export const TIMEOUT_MS = 5000;
export const MAX_RETRIES = 1;

const KIND_TEXT = {
  button: 'button',
  link: 'link',
  option: 'radio button or checkbox option',
  input: 'text field to type into',
  select: 'drop-down list',
};

const AREA_TEXT = {
  popup: 'pop-up window open on top of the page',
  main: 'main content of this page',
  menu: 'site-wide header, footer or menu',
};

function describe(c) {
  const d = { kind: KIND_TEXT[c.kind], area: AREA_TEXT[c.area] ?? AREA_TEXT.main };
  if (c.kind === 'option') d.state = c.selected ? 'already selected' : 'not selected';
  if (c.kind === 'input' || c.kind === 'select') d.state = c.filled ? 'already filled in' : 'empty';
  if (c.detail) d.detail = c.detail;
  return d;
}

export function buildRequest({ goal, page, candidates, pressed, site = '정부24' }) {
  const options = {};
  // 선택지 이름은 겹치면 안 된다 (겹치면 앞의 것이 덮여 사라진다). 겹치면 처음 것만 쓴다 (guide.js joinShortDetail이 먼저 가리지만 한 번 더 지킨다)
  for (const c of candidates) if (!(c.label in options)) options[c.label] = describe(c);
  options[NONE_OPTION] = 'None of the listed controls moves the user closer to the goal right now.';

  return {
    model: MODEL,
    state: {
      site: site === '정부24' ? '정부24 (Korean government services portal)' : `${site} (a Korean government institution site that 정부24 links to)`,
      goal: goal.goal,
      userSituation: goal.userSituation,
      page: {
        title: page.title,
        address: page.path,
        headings: page.headings,
        ...(page.popupText ? { popupText: page.popupText } : {}),
      },
      alreadyPressed: pressed,
    },
    questions: {
      nextControl: {
        type: 'choice',
        instructions: {
          question:
            'Which one of the on-screen controls should the user use next to make progress toward `goal`?',
          rules: [
            'Consider `userSituation`, the current `page`, and `alreadyPressed` (controls the user used earlier, oldest first).',
            'If a pop-up window is open on top of the page (its text is `page.popupText`), pick the control in it that continues toward the goal.',
            'Prefer controls in the main content of this page over site-wide header, footer or menu links, unless the goal can only be reached through the menu.',
            'The user handles login, sign-up, member or non-member choices and identity authentication on their own, so such controls are not listed. First reach the page of the service in `goal`: use a link to it, or the site search field (to be filled with the service name); start an application only from that service page.',
            'If `alreadyPressed` includes an authentication method (such as 간편인증 or 공동인증서) and this page is not a login page, the user has already logged in: continue on this page. Never pick a menu or side link that opens the service in `goal` again, because that starts over and cancels the login.',
            'Options on a form that depend on the user (such as who the document is for, or how detailed it is) are chosen by the user and are not listed. The only options listed are the document type in `goal` and consents.',
            'On a form, fields already filled in and options already selected are done. Pick an empty field only if this user must fill it; skip optional settings (such as a security-keyboard option) and fields meant for other kinds of users (such as foreigner ID fields for a Korean citizen). Once the needed fields are done, pick the control that submits or continues.',
            'Links that only scroll within the current page (section tabs or table-of-contents entries such as 서비스 개요, 구비 서류, 신청 방법 및 절차, 부가 정보, 정보 변경 내역) never move the user closer to `goal`: do not pick them.',
            'If `goal` says the document is issued on another site and this page is the 정부24 information page of that document, the next step is the button or link that goes to that site (for example 사이트가기 or 바로가기).',
            'Do not pick controls that log out, cancel, go back, close the page, or start a different service.',
            'On a terms or consent page, agree only to required (필수) items; never pick optional (선택) consents or "agree to all".',
          ],
        },
        criteria: options,
      },
      pageStage: {
        type: 'choice',
        instructions: 'Which step of reaching `goal` does the current `page` show?',
        criteria: STAGES,
      },
    },
  };
}

export class JevError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export function errorCodeForStatus(status) {
  if (status === 401 || status === 403) return 'auth';
  if (status === 402) return 'credit';
  if (status === 429) return 'rate';
  if (status === 529 || status === 503) return 'overloaded';
  if (status === 400 || status === 413 || status === 415 || status === 422) return 'bad_request';
  return 'server';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function callJev(apiKey, body, { fetchImpl = fetch, wait = sleep, timeoutMs = TIMEOUT_MS } = {}) {
  if (!apiKey) throw new JevError('no_key');
  for (let attempt = 0; ; attempt += 1) {
    let res;
    try {
      res = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      throw new JevError(timedOut ? 'timeout' : 'network');
    }
    if (res.ok) return res.json();
    const code = errorCodeForStatus(res.status);
    if ((code === 'rate' || code === 'overloaded') && attempt < MAX_RETRIES) {
      await wait(800 * 2 ** attempt + Math.floor(Math.random() * 200));
      continue;
    }
    throw new JevError(code, res.status);
  }
}

// 정책은 여기 한 곳에서 정한다. 원래 답(probabilities 등)은 raw로 함께 돌려 기록에 쓴다.
export function decide(response, candidates) {
  const next = response?.answers?.nextControl;
  const stageAnswer = response?.answers?.pageStage;
  const stage = stageAnswer?.type === 'choice' && stageAnswer.choice in STAGES ? stageAnswer.choice : null;
  if (next?.type !== 'choice' || typeof next.choice !== 'string') {
    return { kind: 'error', code: 'bad_answer', stage };
  }
  const probability = Number(next.probabilities?.[next.choice] ?? 0);
  const raw = {
    choice: next.choice,
    probability,
    confidence: next.confidence ?? null,
    stage,
    stageConfidence: stageAnswer?.confidence ?? null,
  };
  if (next.choice === NONE_OPTION) return { kind: 'unsure', reason: 'none', stage, raw };
  if (probability < MIN_PROBABILITY) return { kind: 'unsure', reason: 'low_probability', stage, raw };
  const pick = candidates.find((c) => c.label === next.choice);
  if (!pick) return { kind: 'unsure', reason: 'unknown_option', stage, raw };
  return { kind: 'point', id: pick.id, label: pick.label, targetKind: pick.kind, stage, raw };
}

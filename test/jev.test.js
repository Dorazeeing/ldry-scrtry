import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { goalFor } from '../src/lib/catalog.js';
import { prepareGuide } from '../src/lib/guide.js';
import { STAGES } from '../src/lib/goals.js';
import { ENDPOINT, JevError, MAX_RETRIES, MIN_PROBABILITY, MODEL, TIMEOUT_MS, buildRequest, callJev, decide, errorCodeForStatus } from '../src/lib/jev.js';
import { NONE_OPTION } from '../src/lib/sanitize.js';

const candidates = [
  { id: 0, label: '발급하기', detail: '', kind: 'link', area: 'main', selected: false, filled: false },
  { id: 1, label: '초본', detail: '', kind: 'option', area: 'main', selected: false, filled: false },
  { id: 2, label: '로그인', detail: '', kind: 'link', area: 'menu', selected: false, filled: false },
];
const page = { title: '주민등록표 등본(초본) 발급 | 민원안내 및 신청 | 정부24', path: 'www.gov.kr/mw/AA020InfoCappView.do', headings: ['민원안내'] };

test('요청: 공식 형식(model·state·questions)과 Choice 두 개', () => {
  const body = buildRequest({ goal: goalFor('resident_abstract'), page, candidates, pressed: ['주민등록등본(초본)'] });
  assert.equal(body.model, MODEL);
  assert.deepEqual(Object.keys(body.questions), ['nextControl', 'pageStage']);
  assert.equal(body.questions.nextControl.type, 'choice');
  assert.deepEqual(Object.keys(body.questions.nextControl.criteria), ['발급하기', '초본', '로그인', NONE_OPTION]);
  assert.equal(body.questions.nextControl.criteria.초본.state, 'not selected');
  assert.match(body.questions.nextControl.criteria.로그인.area, /menu/);
  assert.deepEqual(body.questions.pageStage.criteria, STAGES);
  assert.deepEqual(body.state.alreadyPressed, ['주민등록등본(초본)']);
  assert.deepEqual(body.state.page, { title: page.title, address: page.path, headings: page.headings });
});

test('요청: state에는 목표·화면 제목·주소·누른 기록만 들어간다', () => {
  const body = buildRequest({ goal: goalFor('resident_abstract'), page, candidates, pressed: [] });
  assert.deepEqual(Object.keys(body.state).sort(), ['alreadyPressed', 'goal', 'page', 'site', 'userSituation']);
});

const answer = (choice, confidence, stage = '민원 안내') => ({
  model: 'jev-1.13.0',
  answers: {
    nextControl: { type: 'choice', choice, confidence, probabilities: { [choice]: confidence } },
    pageStage: { type: 'choice', choice: stage, confidence: 0.9, probabilities: { [stage]: 0.9 } },
  },
  usage: { input_tokens: 500, output_tokens: 40 },
});

test('판단: 확신이 충분하면 그 후보를 가리킨다', () => {
  const d = decide(answer('발급하기', 0.8), candidates);
  assert.equal(d.kind, 'point');
  assert.equal(d.id, 0);
  assert.equal(d.targetKind, 'link');
  assert.equal(d.stage, '민원 안내');
  assert.equal(d.raw.probability, 0.8);
});

test('판단: 해당 없음·낮은 확신·모르는 선택지는 가리키지 않는다', () => {
  assert.equal(decide(answer(NONE_OPTION, 0.9), candidates).reason, 'none');
  assert.equal(decide(answer('발급하기', MIN_PROBABILITY - 0.01), candidates).reason, 'low_probability');
  assert.equal(decide(answer('없는 버튼', 0.9), candidates).reason, 'unknown_option');
  assert.equal(decide({ answers: {} }, candidates).kind, 'error');
});

test('판단: 알 수 없는 단계 이름은 null로 둔다', () => {
  assert.equal(decide(answer('발급하기', 0.8, '이상한 단계'), candidates).stage, null);
});

test('오류 코드 대응', () => {
  assert.equal(errorCodeForStatus(401), 'auth');
  assert.equal(errorCodeForStatus(402), 'credit');
  assert.equal(errorCodeForStatus(422), 'bad_request');
  assert.equal(errorCodeForStatus(429), 'rate');
  assert.equal(errorCodeForStatus(529), 'overloaded');
  assert.equal(errorCodeForStatus(500), 'server');
});

const ok = (data) => ({ ok: true, status: 200, json: async () => data });
const fail = (status) => ({ ok: false, status, json: async () => ({}) });

test('호출: 키 없이 부르면 no_key', async () => {
  await assert.rejects(callJev('', {}), (e) => e instanceof JevError && e.code === 'no_key');
});

test('호출: 주소·헤더·본문을 공식 형식으로 보낸다', async () => {
  let seen;
  const res = await callJev('ts_test', { a: 1 }, {
    fetchImpl: async (url, init) => {
      seen = { url, init };
      return ok({ answers: {} });
    },
  });
  assert.deepEqual(res, { answers: {} });
  assert.equal(seen.url, ENDPOINT);
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers.Authorization, 'Bearer ts_test');
  assert.equal(seen.init.body, '{"a":1}');
});

test('호출: 429·529는 한 번 물러났다가 다시 시도한다 (서버 시간 예산이 확장의 기다림 12초보다 짧아야 한다)', async () => {
  for (const status of [429, 529]) {
    const replies = [fail(status), ok({ answers: { x: 1 } })];
    const waits = [];
    const res = await callJev('k', {}, { fetchImpl: async () => replies.shift(), wait: async (ms) => waits.push(ms) });
    assert.deepEqual(res, { answers: { x: 1 } });
    assert.equal(waits.length, 1);
  }
  assert.ok(TIMEOUT_MS * (MAX_RETRIES + 1) + 1000 < 12000, '재시도까지 합친 최대 기다림이 확장의 시간 제한보다 짧다');
});

test('호출: 재시도 한도를 넘으면 오류', async () => {
  await assert.rejects(
    callJev('k', {}, { fetchImpl: async () => fail(429), wait: async () => {} }),
    (e) => e.code === 'rate' && e.status === 429,
  );
});

test('호출: 401은 바로 auth 오류, 네트워크·시간 초과 구분', async () => {
  await assert.rejects(callJev('k', {}, { fetchImpl: async () => fail(401) }), (e) => e.code === 'auth');
  await assert.rejects(
    callJev('k', {}, {
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch');
      },
      wait: async () => {},
    }),
    (e) => e.code === 'network',
  );
  await assert.rejects(
    callJev('k', {}, {
      fetchImpl: async () => {
        throw new DOMException('timed out', 'TimeoutError');
      },
    }),
    (e) => e.code === 'timeout',
  );
});

test('호출: 연결 실패는 한 번 물러났다가 다시 보내고, 시간 초과는 다시 보내지 않는다', async () => {
  let calls = 0;
  const waits = [];
  const res = await callJev('k', {}, {
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('Failed to fetch');
      return ok({ answers: { x: 1 } });
    },
    wait: async (ms) => waits.push(ms),
  });
  assert.deepEqual(res, { answers: { x: 1 } });
  assert.equal(calls, 2);
  assert.equal(waits.length, 1);
  assert.ok(waits[0] <= 1000, '물러나는 시간은 1초 이하 (시간 예산)');

  let timeoutCalls = 0;
  await assert.rejects(
    callJev('k', {}, {
      fetchImpl: async () => {
        timeoutCalls += 1;
        throw new DOMException('timed out', 'TimeoutError');
      },
      wait: async () => {},
    }),
    (e) => e.code === 'timeout',
  );
  assert.equal(timeoutCalls, 1);

  let networkCalls = 0;
  await assert.rejects(
    callJev('k', {}, {
      fetchImpl: async () => {
        networkCalls += 1;
        throw new TypeError('Failed to fetch');
      },
      wait: async () => {},
    }),
    (e) => e.code === 'network',
  );
  assert.equal(networkCalls, MAX_RETRIES + 1, '연결 실패도 한 번만 다시 보낸다');
});

test('판단: 스스로 어긋난 답(보내지 않은 이름, 고른 것보다 높은 확률)은 쓰지 않는다', () => {
  const res = (choice, probabilities) => ({ answers: { nextControl: { type: 'choice', choice, confidence: 0.5, probabilities } } });
  // 보내지 않은 이름이 확률에 있다
  assert.equal(decide(res('발급하기', { 발급하기: 0.7, 지어낸버튼: 0.3 }), candidates).reason, 'inconsistent_answer');
  // 고른 것보다 확률이 높은 선택지가 있다
  assert.equal(decide(res('발급하기', { 발급하기: 0.4, 초본: 0.6 }), candidates).reason, 'inconsistent_answer');
  // 확률이 없거나 숫자가 아니다
  assert.equal(decide(res('발급하기', undefined), candidates).reason, 'inconsistent_answer');
  assert.equal(decide(res('발급하기', { 발급하기: 'high' }), candidates).reason, 'inconsistent_answer');
  // 소수 둘째 자리 반올림 차이(0.01)는 어긋난 것으로 보지 않는다
  const rounded = decide(res('발급하기', { 발급하기: 0.49, 초본: 0.5, [NONE_OPTION]: 0.01 }), candidates);
  assert.equal(rounded.kind, 'point');
  // 해당 없음을 골랐는데 다른 것이 더 높으면 어긋난 답
  assert.equal(decide(res(NONE_OPTION, { [NONE_OPTION]: 0.2, 발급하기: 0.8 }), candidates).reason, 'inconsistent_answer');
  // 어긋나도 원래 답은 기록용으로 남긴다
  assert.equal(decide(res('발급하기', { 발급하기: 0.4, 초본: 0.6 }), candidates).raw.choice, '발급하기');
});

test('판단: 검색 단추를 골랐는데 검색 칸이 비어 있으면 칸을 가리킨다 (2026-10-25 홈택스 메인, 사업자등록증 재발급)', () => {
  const hometax = (filled) => [
    { id: 0, label: '검색어를 입력하세요!', detail: '', kind: 'input', area: 'main', selected: false, filled },
    { id: 1, label: '검색', detail: '', kind: 'button', area: 'main', selected: false, filled: false },
    { id: 2, label: '국세증명·사업자등록 세금관련 신청/신고', detail: '', kind: 'link', area: 'menu', selected: false, filled: false },
  ];
  const pickSearch = answer('검색', 0.6, '민원 찾기');
  const moved = decide(pickSearch, hometax(false));
  assert.equal(moved.kind, 'point');
  assert.equal(moved.id, 0);
  assert.equal(moved.label, '검색어를 입력하세요!');
  assert.equal(moved.targetKind, 'input');
  assert.equal(moved.stage, '민원 찾기');
  assert.equal(moved.raw.choice, '검색', '원래 고른 것은 기록에 남는다');
  // 칸이 채워져 있으면 검색 단추가 맞다
  const kept = decide(pickSearch, hometax(true));
  assert.equal(kept.label, '검색');
  assert.equal(kept.targetKind, 'button');
  // 검색 단추가 아닌 것은 빈 검색 칸이 있어도 그대로
  assert.equal(decide(answer('국세증명·사업자등록 세금관련 신청/신고', 0.6), hometax(false)).label, '국세증명·사업자등록 세금관련 신청/신고');
  // 「통합검색」·「검색하기」·「찾기」도 검색 단추로 본다
  for (const label of ['통합검색', '검색하기', '찾기', '검색 버튼']) {
    const list = [hometax(false)[0], { id: 1, label, detail: '', kind: 'button', area: 'main', selected: false, filled: false }];
    assert.equal(decide(answer(label, 0.6), list).targetKind, 'input', label);
  }
});

test('판단: 정부24 메인(혼인관계증명서)은 검색 단추를 골라도 정답 칸·단추 중 하나를 가리킨다 (시험 화면)', () => {
  const pages = JSON.parse(readFileSync(new URL('./fixtures/pages.json', import.meta.url), 'utf8'));
  const p = pages.find((x) => x.name === '메인(혼인관계증명서)');
  const prep = prepareGuide({ goalId: p.goalId, page: p.page, candidates: p.candidates.map((c, id) => ({ ...c, id })), pressed: p.pressed });
  for (const choice of p.expected) {
    const d = decide(answer(choice, 0.7, '민원 찾기'), prep.candidates);
    assert.equal(d.kind, 'point', choice);
    assert.ok(p.expected.includes(d.label), `${choice} → ${d.label}`);
  }
});

test('판단: 맞는 길이 둘이라 confidence가 낮아도 확률이 충분하면 가리킨다 (2026-10-17 시험의 회원·비회원 창)', () => {
  const popup = [
    { id: 0, label: '회원 신청하기', kind: 'link', area: 'popup' },
    { id: 1, label: '비회원 신청하기', kind: 'link', area: 'popup' },
  ];
  const res = {
    answers: {
      nextControl: { type: 'choice', choice: '회원 신청하기', confidence: 0.2, probabilities: { '회원 신청하기': 0.4, '비회원 신청하기': 0.29, [NONE_OPTION]: 0.13 } },
    },
  };
  assert.equal(decide(res, popup).kind, 'point');
});

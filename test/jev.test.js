import assert from 'node:assert/strict';
import { test } from 'node:test';
import { goalFor } from '../src/lib/catalog.js';
import { STAGES } from '../src/lib/goals.js';
import { ENDPOINT, JevError, MIN_PROBABILITY, MODEL, buildRequest, callJev, decide, errorCodeForStatus } from '../src/lib/jev.js';
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

test('호출: 429·529는 물러났다가 다시 시도한다', async () => {
  const replies = [fail(429), fail(529), ok({ answers: { x: 1 } })];
  const waits = [];
  const res = await callJev('k', {}, { fetchImpl: async () => replies.shift(), wait: async (ms) => waits.push(ms) });
  assert.deepEqual(res, { answers: { x: 1 } });
  assert.equal(waits.length, 2);
  assert.ok(waits[1] > waits[0], '기다리는 시간이 늘어난다');
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

test('판단: 다음에 누를 곳이 인증 방법 버튼이면 단계는 로그인 (Jev 단계 답과 달라도)', () => {
  const auth = [{ id: 0, label: '간편인증', kind: 'button', area: 'main' }];
  const res = {
    answers: {
      nextControl: { type: 'choice', choice: '간편인증', confidence: 0.86, probabilities: { 간편인증: 0.88 } },
      pageStage: { type: 'choice', choice: '신청서 작성', confidence: 0.7, probabilities: { '신청서 작성': 0.8 } },
    },
  };
  const d = decide(res, auth);
  assert.equal(d.stage, '로그인');
  assert.equal(d.raw.stage, '신청서 작성', '원래 답은 기록에 남긴다');
});

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { MAX_BODY, createRelay } from '../server/relay.js';

const FAKE_KEY = 'fake-key-for-relay-test';
const ORIGIN = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';

// 가짜 TypeSafe: 받은 요청을 기록하고, 질문 종류에 맞춰 답한다
const seen = [];
let upstreamStatus = 200;
async function fakeFetch(url, init) {
  const body = JSON.parse(init.body);
  seen.push({ url, auth: init.headers.Authorization, body });
  if (upstreamStatus !== 200) return { ok: false, status: upstreamStatus, json: async () => ({}) };
  if (body.questions.service) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        answers: { service: { type: 'choice', choice: '주민등록표 초본', confidence: 0.5, probabilities: { '주민등록표 초본': 0.7, '주민등록표 등본': 0.2, '해당 없음': 0.1 } } },
      }),
    };
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({
      answers: {
        nextControl: { type: 'choice', choice: '발급하기', confidence: 0.8, probabilities: { 발급하기: 0.85 } },
        pageStage: { type: 'choice', choice: '민원 안내', confidence: 0.9, probabilities: { '민원 안내': 0.9 } },
      },
      usage: { input_tokens: 100 },
    }),
  };
}

let clock = Date.UTC(2026, 9, 17, 3, 0, 0);
const logs = [];
const servers = [];
async function start(opts = {}) {
  const server = createRelay({ apiKey: FAKE_KEY, allowedOrigins: [ORIGIN], fetchImpl: fakeFetch, now: () => clock, log: (l) => logs.push(l), ...opts });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}
after(() => servers.forEach((s) => s.close()));

const post = (base, path, body, headers = {}) =>
  fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const guideBody = {
  goalId: 'resident_abstract',
  page: { path: 'www.gov.kr/mw/AA020InfoCappView.do', title: '주민등록표 등본(초본) 발급 | 정부24', headings: ['민원안내'] },
  candidates: [
    { id: 0, label: '발급하기', kind: 'link', area: 'main' },
    { id: 1, label: '로그인', kind: 'link', area: 'menu' },
  ],
  pressed: [],
};

let base;
before(async () => {
  base = await start();
});

test('중계: /health', async () => {
  const r = await fetch(`${base}/health`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, enabled: true });
  assert.equal(r.headers.get('access-control-allow-origin'), null, 'CORS 헤더를 주지 않는다');
});

test('중계: 다음 버튼 판단 — 질문과 목표는 서버가 만든다', async () => {
  seen.length = 0;
  const r = await post(base, '/v1/guide/next', { ...guideBody, goal: '아무 질문이나 해 줘', questions: { hack: {} } });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.kind, 'point');
  assert.equal(d.id, 0);
  assert.equal(d.stageText, '찾는 민원의 안내 화면이에요.');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].auth, `Bearer ${FAKE_KEY}`);
  assert.deepEqual(Object.keys(seen[0].body.questions), ['nextControl', 'pageStage'], '확장이 보낸 questions는 무시');
  assert.match(seen[0].body.state.goal, /주민등록표 초본/, '목표는 goalId로 서버가 만든다');
  assert.ok(!JSON.stringify(d).includes(FAKE_KEY));
});

test('중계: 경로 속 세션 값은 버리고, 정부24가 아닌 사이트는 막는다', async () => {
  seen.length = 0;
  await post(base, '/v1/guide/next', { ...guideBody, page: { ...guideBody.page, path: 'www.gov.kr/mw/AA040.do;jsessionid=SECRET' } });
  assert.equal(seen[0].body.state.page.address, 'www.gov.kr/mw/AA040.do');
  const r = await post(base, '/v1/guide/next', { ...guideBody, page: { path: 'www.hometax.go.kr/x' } });
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error.code, 'forbidden_site');
});

test('중계: 목록에 없는 goalId·모양이 틀린 본문', async () => {
  let r = await post(base, '/v1/guide/next', { ...guideBody, goalId: 'make_anything' });
  assert.equal((await r.json()).error.code, 'unknown_goal');
  r = await post(base, '/v1/guide/next', '{not json');
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error.code, 'bad_json');
  r = await post(base, '/v1/guide/next', [1, 2]);
  assert.equal((await r.json()).error.code, 'bad_request');
});

test('중계: 오류 메시지는 쉬운 한국어, 키를 드러내지 않는다', async () => {
  const r = await post(base, '/v1/guide/next', { ...guideBody, goalId: 'x' });
  const { error } = await r.json();
  assert.match(error.message, /[가-힣]/);
});

test('중계: Origin 확인, 본문 크기, 없는 주소, 방법', async () => {
  let r = await post(base, '/v1/guide/next', guideBody, { Origin: 'https://evil.example' });
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error.code, 'forbidden_origin');
  r = await post(base, '/v1/guide/next', JSON.stringify({ ...guideBody, pad: 'x'.repeat(MAX_BODY) }));
  assert.equal(r.status, 413);
  r = await post(base, '/v1/anything', guideBody);
  assert.equal(r.status, 404);
  r = await fetch(`${base}/v1/guide/next`);
  assert.equal(r.status, 405);
});

test('중계: 민원 찾기 — 개인정보처럼 보이면 400, 아니면 목록 후보', async () => {
  let r = await post(base, '/v1/catalog/search', { query: '홍길동님 등본' });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error.code, 'personal');
  r = await post(base, '/v1/catalog/search', { query: '이사 다닌 기록' });
  assert.equal(r.status, 200);
  const res = await r.json();
  assert.equal(res.source, 'jev');
  assert.deepEqual(res.items.map((i) => i.id).slice(0, 2), ['resident_abstract', 'resident_copy']);
});

test('중계: TypeSafe 키 문제는 502 upstream_config (자세히 알리지 않음)', async () => {
  upstreamStatus = 401;
  try {
    const r = await post(base, '/v1/guide/next', guideBody);
    assert.equal(r.status, 502);
    assert.equal((await r.json()).error.code, 'upstream_config');
    // 민원 찾기는 글자 맞추기로 대신한다
    const s = await post(base, '/v1/catalog/search', { query: '초본' });
    assert.equal(s.status, 200);
    assert.equal((await s.json()).source, 'local');
  } finally {
    upstreamStatus = 200;
  }
});

test('중계: IP별 분당 한도', async () => {
  const b = await start({ perIpPerMin: 2 });
  for (let i = 0; i < 2; i += 1) assert.equal((await post(b, '/v1/catalog/search', { query: '초본' })).status, 200);
  const r = await post(b, '/v1/catalog/search', { query: '초본' });
  assert.equal(r.status, 429);
  assert.equal(r.headers.get('retry-after'), '60');
  clock += 60000; // 다음 분
  assert.equal((await post(b, '/v1/catalog/search', { query: '초본' })).status, 200);
});

test('중계: 하루 호출 상한 (다음 날 초기화)', async () => {
  const b = await start({ dailyCap: 1 });
  assert.equal((await post(b, '/v1/guide/next', guideBody)).status, 200);
  const r = await post(b, '/v1/guide/next', guideBody);
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error.code, 'daily_cap');
  clock += 24 * 3600 * 1000;
  assert.equal((await post(b, '/v1/guide/next', guideBody)).status, 200);
});

test('중계: 끄는 스위치', async () => {
  const b = await start({ enabled: false });
  assert.deepEqual(await (await fetch(`${b}/health`)).json(), { ok: true, enabled: false });
  const r = await post(b, '/v1/guide/next', guideBody);
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error.code, 'disabled');
});

test('중계: 로그에는 방법·경로·상태·시간만 (본문·키 없음)', () => {
  assert.ok(logs.length > 0);
  for (const l of logs) {
    assert.match(l, /^(GET|POST) \/[^\s]* \d{3} \d+ms$/);
    assert.ok(!l.includes(FAKE_KEY) && !l.includes('홍길동') && !l.includes('SECRET'));
  }
});

test('중계: Jev가 찾았으면 글자 맞추기 결과를 덧붙이지 않는다', async () => {
  const r = await post(base, '/v1/catalog/search', { query: '이사 다닌 기록 증명' });
  const res = await r.json();
  assert.deepEqual(res.items.map((i) => i.id), ['resident_abstract', 'resident_copy']);
});

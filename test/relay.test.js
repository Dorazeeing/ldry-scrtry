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
  const r = await post(base, '/v1/guide/next', { ...guideBody, page: { path: 'evil.example/x' } });
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error.code, 'forbidden_site');
  // 기관 사이트(D-9)는 받는다. 정부24 밖이라 화면 속 글(제목 글·창 안내 글)은 서버가 버린다
  // (그 사이트가 주는 서류여야 한다 — 아니면 wrong_site로 Jev에 묻지 않는다, 2026-10-25)
  seen.length = 0;
  const ok2 = await post(base, '/v1/guide/next', {
    ...guideBody,
    goalId: 'family_relation',
    page: { path: 'efamily.scourt.go.kr/pt/PtFrrpApplrInfoInqW.do', title: '신청인 정보 조회', headings: ['증명서 발급'], popupText: '확인하세요' },
  });
  assert.equal(ok2.status, 200);
  assert.equal(seen[0].body.state.page.address, 'efamily.scourt.go.kr/pt/PtFrrpApplrInfoInqW.do');
  assert.deepEqual(seen[0].body.state.page.headings, []);
  assert.equal(seen[0].body.state.page.popupText, undefined);
  assert.match(seen[0].body.state.site, /대법원 전자가족관계등록시스템/);
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

test('중계: 로그인 방법을 고르는 화면은 Jev에 묻지 않고 넘긴다 (직접 고르게)', async () => {
  seen.length = 0;
  const res = await post(base, '/v1/guide/next', {
    ...guideBody,
    page: { path: 'plus.gov.kr/login/', title: '로그인' },
    candidates: [
      { id: 0, label: '간편인증', kind: 'button', area: 'main' },
      { id: 1, label: '공동인증서', kind: 'button', area: 'main' },
      { id: 2, label: '금융인증서', kind: 'button', area: 'main' },
    ],
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).kind, 'handoff');
  assert.equal(seen.length, 0, 'Jev를 부르지 않는다');
});

test('중계: 로그인·회원가입 버튼은 Jev 후보에서 뺀다', async () => {
  seen.length = 0;
  await post(base, '/v1/guide/next', guideBody);
  const options = Object.keys(seen[0].body.questions.nextControl.criteria);
  assert.ok(options.includes('발급하기'));
  assert.ok(!options.includes('로그인'), '로그인은 후보에 없다');
  assert.match(JSON.stringify(seen[0].body.questions.nextControl.instructions), /handles login/);
});

test('중계: 전체 민원 목록 POST /v1/catalog (0.1.3) — Jev를 부르지 않고, Origin·분당 한도·스위치는 같다', async () => {
  const { CATALOG } = await import('../src/lib/catalog.js');
  seen.length = 0;
  const r = await post(base, '/v1/catalog', {});
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), null, 'CORS 헤더를 주지 않는다');
  const res = await r.json();
  assert.equal(res.kind, 'results');
  assert.equal(res.source, 'list');
  assert.deepEqual(res.items.map((i) => i.id), CATALOG.map((c) => c.id));
  assert.ok(res.items.every((i) => i.name && typeof i.plain === 'string'));
  assert.equal(seen.length, 0, 'Jev를 부르지 않는다');
  // 다른 Origin은 403, GET은 405 (확장의 GET에는 Origin이 안 붙으므로 받지 않는다)
  assert.equal((await post(base, '/v1/catalog', {}, { Origin: 'https://evil.example' })).status, 403);
  const g = await fetch(`${base}/v1/catalog`, { headers: { Origin: ORIGIN } });
  assert.equal(g.status, 405);
  assert.equal(g.headers.get('allow'), 'POST');
  // 분당 한도·끄는 스위치
  const limited = await start({ perIpPerMin: 1 });
  assert.equal((await post(limited, '/v1/catalog', {})).status, 200);
  assert.equal((await post(limited, '/v1/catalog', {})).status, 429);
  const off = await start({ enabled: false });
  assert.equal((await post(off, '/v1/catalog', {})).status, 503);
  // 하루 상한은 세지 않는다 (Jev를 부르지 않으므로)
  const capped = await start({ dailyCap: 1 });
  for (let i = 0; i < 3; i += 1) assert.equal((await post(capped, '/v1/catalog', {})).status, 200);
  assert.equal((await post(capped, '/v1/guide/next', guideBody)).status, 200, '목록을 여러 번 받아도 판단 요청은 그대로 된다');
});

test('중계: 확장 버전은 X-Ldry-Version 헤더로 읽고, 없으면 0.1.2 이하로 본다', async () => {
  const { clientVersion } = await import('../server/relay.js');
  const { atLeast } = await import('../src/lib/guide.js');
  const req = (v) => ({ headers: v === undefined ? {} : { 'x-ldry-version': v } });
  assert.equal(clientVersion(req('0.1.3')), '0.1.3');
  assert.equal(clientVersion(req(' 0.1.10 ')), '0.1.10');
  for (const bad of [undefined, '', 'abc', '0.1.3; drop', '1', '0.1.3.4.5']) assert.equal(clientVersion(req(bad)), '', String(bad));
  assert.equal(atLeast('', '0.1.3'), false, '헤더 없음 = 0.1.2 이하');
  assert.equal(atLeast('0.1.2', '0.1.3'), false);
  assert.equal(atLeast('0.1.3', '0.1.3'), true);
  assert.equal(atLeast('0.1.10', '0.1.3'), true, '숫자로 견준다');
  assert.equal(atLeast('0.2', '0.1.3'), true);
  // 헤더가 있어도 없어도 지금 응답은 같다 (0.1.2와 맞는다)
  const withHeader = await post(base, '/v1/guide/next', guideBody, { 'X-Ldry-Version': '0.1.3' });
  const without = await post(base, '/v1/guide/next', guideBody);
  assert.deepEqual(await withHeader.json(), await without.json());
});

test('중계: 찾는 단계 지킴 — 서류를 주지 않는 사이트에서 시작하면 wrong_site, 검색만 되풀이하면 search_exhausted (Jev를 안 부름)', async () => {
  seen.length = 0;
  const wrong = await post(base, '/v1/guide/next', { ...guideBody, page: { path: 'www.car365.go.kr/home', title: '자동차365' }, pressed: [] });
  assert.equal(wrong.status, 200);
  const w = await wrong.json();
  assert.equal(w.kind, 'unsure');
  assert.equal(w.reason, 'wrong_site');
  assert.match(w.stageText, /정부24로 가서 다시 시작/);
  // 「사이트가기」로 넘어왔으면 그대로 묻는다
  const hopped = await post(base, '/v1/guide/next', { ...guideBody, page: { path: 'www.car365.go.kr/home', title: '자동차365' }, pressed: ['사이트가기'] });
  assert.equal((await hopped.json()).kind, 'point');
  assert.equal(seen.length, 1, 'wrong_site에서는 Jev를 부르지 않았다');
  seen.length = 0;
  const exhausted = await post(base, '/v1/guide/next', {
    ...guideBody,
    candidates: [
      { id: 0, label: '검색어를 입력하세요', kind: 'input', area: 'main' },
      { id: 1, label: '검색', kind: 'button', area: 'main' },
    ],
    pressed: ['검색', '검색어를 입력하세요', '검색'],
  });
  const e = await exhausted.json();
  assert.equal(e.reason, 'search_exhausted');
  assert.equal(e.stageText, '검색으로 두 번 찾아봤는데 못 찾았어요.');
  assert.equal(seen.length, 0);
});

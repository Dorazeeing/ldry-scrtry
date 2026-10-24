import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RELAY_URL, RETRY_WAIT_MS, RelayError, callRelay } from '../src/lib/relay.js';

const ok = (data) => ({ ok: true, status: 200, json: async () => data });
const fail = (status, error) => ({ ok: false, status, json: async () => (error ? { error } : Promise.reject(new Error('no body'))) });

test('중계 호출: 주소·방법·본문, 키 헤더는 없다', async () => {
  let seen;
  const res = await callRelay('/v1/catalog/search', { query: '초본' }, {
    fetchImpl: async (url, init) => {
      seen = { url, init };
      return ok({ kind: 'results' });
    },
  });
  assert.deepEqual(res, { kind: 'results' });
  assert.equal(seen.url, `${RELAY_URL}/v1/catalog/search`);
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.body, '{"query":"초본"}');
  assert.deepEqual(Object.keys(seen.init.headers), ['Content-Type'], 'Authorization 같은 헤더가 없다');
});

test('중계 호출: 확장 버전을 X-Ldry-Version 헤더로 보낸다 (0.1.3부터, 크롬 밖에서는 없음)', async () => {
  let seen;
  await callRelay('/v1/guide/next', {}, { version: '0.1.3', fetchImpl: async (url, init) => ((seen = init), ok({})) });
  assert.deepEqual(seen.headers, { 'Content-Type': 'application/json', 'X-Ldry-Version': '0.1.3' });
  await callRelay('/health', undefined, { version: '0.1.3', fetchImpl: async (url, init) => ((seen = init), ok({})) });
  assert.deepEqual(seen.headers, { 'X-Ldry-Version': '0.1.3' });
});

test('중계 호출: 본문이 없으면 GET (/health)', async () => {
  let seen;
  await callRelay('/health', undefined, { fetchImpl: async (url, init) => ((seen = init), ok({ ok: true })) });
  assert.equal(seen.method, 'GET');
});

test('중계 호출: 잠든 서버가 깨어나는 502는 한 번만 다시 보낸다', async () => {
  const replies = [fail(502), ok({ kind: 'point' })];
  const waits = [];
  const res = await callRelay('/v1/guide/next', {}, { fetchImpl: async () => replies.shift(), wait: async (ms) => waits.push(ms) });
  assert.deepEqual(res, { kind: 'point' });
  assert.deepEqual(waits, [RETRY_WAIT_MS]);
});

test('중계 호출: 502가 두 번이면 오류 (무한 재시도 없음)', async () => {
  let calls = 0;
  await assert.rejects(
    callRelay('/v1/guide/next', {}, { fetchImpl: async () => (calls += 1, fail(502, { code: 'upstream_error', message: '서버에 문제가 생겼어요.' })), wait: async () => {} }),
    (e) => e instanceof RelayError && e.code === 'upstream_error' && e.status === 502,
  );
  assert.equal(calls, 2);
});

test('중계 호출: 연결 실패·시간 초과도 한 번 다시 보낸 뒤 구분해서 오류', async () => {
  let calls = 0;
  const boom = (err) => async () => ((calls += 1), Promise.reject(err));
  await assert.rejects(callRelay('/x', {}, { fetchImpl: boom(new TypeError('Failed to fetch')), wait: async () => {} }), (e) => e.code === 'network');
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(callRelay('/x', {}, { fetchImpl: boom(new DOMException('t', 'TimeoutError')), wait: async () => {} }), (e) => e.code === 'timeout');
});

test('중계 호출: 400·403·429·503은 다시 보내지 않고, 서버의 쉬운 한국어 안내를 그대로 전한다', async () => {
  for (const [status, code, message] of [
    [400, 'personal', '개인정보는 적지 말아 주세요.'],
    [403, 'forbidden_site', '정부24 화면에서만 쓸 수 있어요.'],
    [429, 'rate_limited', '요청이 너무 잦아요.'],
    [503, 'disabled', '길잡이를 잠시 멈췄어요.'],
  ]) {
    let calls = 0;
    await assert.rejects(
      callRelay('/x', {}, { fetchImpl: async () => (calls += 1, fail(status, { code, message })), wait: async () => {} }),
      (e) => e.code === code && e.userMessage === message && e.status === status,
    );
    assert.equal(calls, 1, `${status}는 한 번만`);
  }
});

test('중계 호출: 본문이 JSON이 아닌 오류 응답은 server 코드', async () => {
  await assert.rejects(callRelay('/x', {}, { fetchImpl: async () => fail(500), wait: async () => {} }), (e) => e.code === 'server' && e.userMessage === undefined);
});

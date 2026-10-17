// ldry-scrtry 중계: 확장 대신 TypeSafe Jev를 부르는 이 확장 전용 서버. 계약은 server/openapi.yaml.
// - 질문·목표 문장은 서버가 만든다 (src/lib/guide.js, 확장과 같은 코드). 아무 Jev 요청이나 대신 보내지 않는다 (MCA §2.3(a)).
// - 키는 환경변수 TYPESAFE_API_KEY에만. 응답·로그에 키와 요청 본문을 남기지 않는다 (경로·상태·시간만).
// - CORS 헤더를 주지 않는다 → 웹 페이지는 응답을 못 읽고, host_permissions가 있는 확장 service worker만 읽는다.
// - 도용 막기는 메모리 기반(서버 1대, 재시작하면 초기화): IP별 분당 한도, 하루 호출 상한, 끄는 스위치, Origin 확인(흉내 가능 → 보조 수단).
// 의존성 없음 (Node 22+ 내장 http·fetch). 시작: node server/relay.js

import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { guideNext, searchCatalog } from '../src/lib/guide.js';
import { JevError, callJev } from '../src/lib/jev.js';

export const MAX_BODY = 64 * 1024;

const HELP = '잠시 뒤 다시 해 보세요. 계속 안 되면 가족이나 정부24 고객센터(1588-2188)에 물어봐 주세요.';
const ERRORS = {
  bad_json: [400, '요청 모양이 맞지 않아요.'],
  bad_request: [400, '요청 모양이 맞지 않아요.'],
  unknown_goal: [400, '목록에 있는 것만 고를 수 있어요. 다시 찾아 주세요.'],
  empty: [400, '찾을 말을 먼저 적어 주세요.'],
  personal: [400, '이름이나 번호 같은 개인정보는 적지 말아 주세요. 서류 이름이나 하고 싶은 일만 적어 주세요.'],
  forbidden_origin: [403, '이 길잡이에서만 쓸 수 있어요.'],
  forbidden_site: [403, '길잡이가 지원하는 사이트에서만 쓸 수 있어요.'],
  not_found: [404, '없는 주소예요.'],
  method_not_allowed: [405, '요청 방법이 맞지 않아요.'],
  too_large: [413, '보낼 내용이 너무 많아요.'],
  rate_limited: [429, `요청이 너무 잦아요. ${HELP}`],
  disabled: [503, `길잡이를 잠시 멈췄어요. ${HELP}`],
  daily_cap: [503, `오늘 쓸 수 있는 양을 다 썼어요. 내일 다시 해 보세요.`],
  busy: [503, `지금 길잡이를 쓰는 사람이 많아요. ${HELP}`],
  upstream_config: [502, `길잡이 서버 설정에 문제가 있어요. ${HELP}`],
  upstream_error: [502, `길잡이 서버에 문제가 생겼어요. ${HELP}`],
  timeout: [504, `대답이 늦어지고 있어요. ${HELP}`],
};

// JevError 코드 → 중계 오류 코드. 키·크레딧 문제는 밖에 자세히 알리지 않는다.
const UPSTREAM = {
  no_key: 'upstream_config',
  auth: 'upstream_config',
  credit: 'upstream_config',
  rate: 'busy',
  overloaded: 'busy',
  timeout: 'timeout',
  network: 'upstream_error',
  bad_request: 'upstream_error',
  server: 'upstream_error',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

function fail(res, code, headers) {
  const [status, message] = ERRORS[code] ?? ERRORS.upstream_error;
  send(res, status, { error: { code, message } }, headers);
  return status;
}

function clientIp(req) {
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string' && real) return real.trim();
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
}

// 한도를 넘으면 더 쌓지 않고 끝까지 흘려보낸 뒤 413으로 답한다 (중간에 끊으면 확장이 오류 문구를 못 받음)
function readBody(req) {
  return new Promise((resolve, reject) => {
    const tooLarge = () => Object.assign(new Error('too_large'), { code: 'too_large' });
    if (Number(req.headers['content-length'] ?? 0) > MAX_BODY) {
      req.resume();
      req.on('end', () => reject(tooLarge()));
      return;
    }
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size <= MAX_BODY) chunks.push(c);
    });
    req.on('end', () => (size > MAX_BODY ? reject(tooLarge()) : resolve(Buffer.concat(chunks).toString('utf8'))));
    req.on('error', reject);
  });
}

const dayOf = (ms) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10); // 한국 날짜 기준

export function createRelay({
  apiKey,
  allowedOrigins = [],
  dailyCap = 5000,
  perIpPerMin = 30,
  enabled = true,
  fetchImpl = fetch,
  now = Date.now,
  log = (line) => console.log(line),
} = {}) {
  const perIp = new Map(); // ip → { minute, count }
  let day = dayOf(now());
  let dayCount = 0;
  const call = (body) => callJev(apiKey, body, { fetchImpl });

  function overIpLimit(ip) {
    const minute = Math.floor(now() / 60000);
    const e = perIp.get(ip);
    if (!e || e.minute !== minute) {
      perIp.set(ip, { minute, count: 1 });
      if (perIp.size > 10000) perIp.clear(); // 메모리 보호
      return false;
    }
    e.count += 1;
    return e.count > perIpPerMin;
  }

  // Jev를 부르기 직전에만 센다 (거른 뒤 물을 필요가 없는 요청은 세지 않음)
  function takeDaily() {
    const today = dayOf(now());
    if (today !== day) {
      day = today;
      dayCount = 0;
    }
    if (dayCount >= dailyCap) return false;
    dayCount += 1;
    return true;
  }
  const capped = (body) => {
    if (!takeDaily()) throw Object.assign(new Error('daily_cap'), { relayCode: 'daily_cap' });
    return call(body);
  };

  async function route(req, res, url) {
    if (url.pathname === '/health') {
      if (req.method !== 'GET') return fail(res, 'method_not_allowed', { Allow: 'GET' });
      send(res, 200, { ok: true, enabled });
      return 200;
    }
    const routes = ['/v1/guide/next', '/v1/catalog/search'];
    if (!routes.includes(url.pathname)) return fail(res, 'not_found');
    if (req.method !== 'POST') return fail(res, 'method_not_allowed', { Allow: 'POST' });
    if (!enabled) return fail(res, 'disabled');
    if (allowedOrigins.length && !allowedOrigins.includes(req.headers.origin)) return fail(res, 'forbidden_origin');
    if (overIpLimit(clientIp(req))) return fail(res, 'rate_limited', { 'Retry-After': '60' });

    let input;
    try {
      const text = await readBody(req);
      input = JSON.parse(text);
    } catch (err) {
      return fail(res, err?.code === 'too_large' ? 'too_large' : 'bad_json');
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return fail(res, 'bad_request');

    try {
      if (url.pathname === '/v1/guide/next') {
        if (typeof input.goalId !== 'string' || !input.page || typeof input.page !== 'object') return fail(res, 'bad_request');
        const out = await guideNext(input, capped);
        if (out.error) return fail(res, out.error);
        send(res, 200, out.result);
        return 200;
      }
      // /v1/catalog/search — Jev가 안 되면 글자 맞추기로 찾으므로 200으로 답한다 (상한 도달 포함)
      if (typeof input.query !== 'string') return fail(res, 'bad_request');
      const out = await searchCatalog(input.query, capped);
      if (out.error) return fail(res, out.error);
      send(res, 200, out.result);
      return 200;
    } catch (err) {
      if (err?.relayCode) return fail(res, err.relayCode);
      return fail(res, err instanceof JevError ? (UPSTREAM[err.code] ?? 'upstream_error') : 'upstream_error');
    }
  }

  return http.createServer(async (req, res) => {
    const started = now();
    let status = 500;
    const url = new URL(req.url ?? '/', 'http://relay');
    try {
      status = await route(req, res, url);
    } catch {
      if (!res.headersSent) status = fail(res, 'upstream_error');
    }
    // 경로·상태·시간만 남긴다 (요청 본문·IP·키는 남기지 않음)
    log(`${req.method} ${url.pathname} ${status} ${now() - started}ms`);
  });
}

// 직접 실행할 때만 서버를 띄운다 (시험에서는 createRelay만 불러 쓴다)
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const env = process.env;
  if (!env.TYPESAFE_API_KEY) {
    console.error('TYPESAFE_API_KEY 환경변수가 없어요. Railway Variables에 넣어 주세요.');
    process.exit(1);
  }
  const server = createRelay({
    apiKey: env.TYPESAFE_API_KEY,
    allowedOrigins: (env.ALLOWED_ORIGIN ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    dailyCap: Number(env.DAILY_CAP ?? 5000),
    perIpPerMin: Number(env.PER_IP_PER_MIN ?? 30),
    enabled: env.RELAY_ENABLED !== 'false',
  });
  const port = Number(env.PORT ?? 8787);
  server.listen(port, '0.0.0.0', () => {
    const origins = env.ALLOWED_ORIGIN ? '확인함' : '확인 안 함 (ALLOWED_ORIGIN 없음)';
    console.log(`ldry-scrtry 중계: ${port}번 포트, 켜짐=${env.RELAY_ENABLED !== 'false'}, 하루 상한=${env.DAILY_CAP ?? 5000}, Origin ${origins}`);
  });
}

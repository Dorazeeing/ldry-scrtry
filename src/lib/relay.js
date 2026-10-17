// 확장 → 중계 서버 호출. 키는 확장에 없다 (서버가 가지고 있다). 계약은 server/openapi.yaml.
// Railway Free 요금제는 서버를 재워 둬서, 깨어나는 첫 요청이 502·시간 초과로 실패할 수 있다 → 한 번만 다시 보낸다.

// 중계 주소는 여기 한 곳. manifest.json host_permissions와 같아야 한다 (npm run check가 검사).
export const RELAY_URL = 'https://relay-production-4d72.up.railway.app';
// 동의 문구(src/content.js)를 바꾸면 올린다 → 다시 동의를 받는다
export const CONSENT_VERSION = 2; // 2: 기관 사이트에서도 켜진다는 안내 추가
export const TIMEOUT_MS = 12000;
export const RETRY_WAIT_MS = 1500;

export class RelayError extends Error {
  constructor(code, message, status) {
    super(code);
    this.code = code;
    this.userMessage = message;
    this.status = status;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 502·504는 서버가 깨어나는 중일 수 있어 한 번 더 시도한다. 400·403·429·503(꺼짐·상한)은 다시 보내도 소용없다.
const RETRY_STATUS = new Set([502, 504]);

export async function callRelay(path, body, { fetchImpl = fetch, wait = sleep, timeoutMs = TIMEOUT_MS, base = RELAY_URL } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    let res;
    try {
      res = await fetchImpl(base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
        cache: 'no-store',
      });
    } catch (err) {
      const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      if (attempt === 0) {
        await wait(RETRY_WAIT_MS);
        continue;
      }
      throw new RelayError(timedOut ? 'timeout' : 'network', undefined, 0);
    }
    if (res.ok) return res.json();
    if (RETRY_STATUS.has(res.status) && attempt === 0) {
      await wait(RETRY_WAIT_MS);
      continue;
    }
    // 서버가 보낸 쉬운 한국어 안내를 그대로 쓴다 (본문이 JSON이 아니면 코드만)
    let error = null;
    try {
      error = (await res.json())?.error;
    } catch {
      /* 본문 없음 */
    }
    throw new RelayError(error?.code ?? 'server', error?.message, res.status);
  }
}

// 신뢰 영역. TypeSafe 키 보관, 안내 상태 보관, Jev 호출을 모두 여기서만 한다.
// 페이지 쪽(content.js)은 키를 볼 수 없다: storage 접근을 TRUSTED_CONTEXTS로 막는다.

import { CATALOG, DEFAULT_GOAL_ID, findService, goalFor, publicItem } from './lib/catalog.js';
import { finishGuide, prepareGuide, searchCatalog } from './lib/guide.js';
import { JevError, RUBRIC_VERSION, callJev, decide } from './lib/jev.js';
import { MAX_LABEL, MAX_PRESSED, cleanPath, cleanText } from './lib/sanitize.js';
import { ALLOWED_HOSTS } from './lib/sites.js';

const CACHE_MAX = 200;
const CACHE_TTL_MS = 30 * 60 * 1000;
const LOG_MAX = 20;

const cache = new Map(); // 해시 → { at, decision }

let ready;
function ensureReady() {
  ready ??= Promise.all([
    chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
    chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
  ]).catch(() => {});
  return ready;
}
ensureReady();

async function getGuide() {
  const { guide } = await chrome.storage.local.get('guide');
  return { active: false, goalId: DEFAULT_GOAL_ID, pressed: [], ...guide };
}

async function setGuide(patch) {
  const next = { ...(await getGuide()), ...patch };
  await chrome.storage.local.set({ guide: next });
  return next;
}

async function getKey() {
  const { apiKey } = await chrome.storage.local.get('apiKey');
  return typeof apiKey === 'string' ? apiKey : '';
}

async function log(entry) {
  const { decisions = [] } = await chrome.storage.session.get('decisions');
  decisions.push({ at: Date.now(), ...entry });
  await chrome.storage.session.set({ decisions: decisions.slice(-LOG_MAX) });
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromAllowedPage(sender) {
  if (sender.id !== chrome.runtime.id || !sender.tab || sender.frameId !== 0) return false;
  try {
    const u = new URL(sender.url);
    return u.protocol === 'https:' && ALLOWED_HOSTS.has(u.host);
  } catch {
    return false;
  }
}

// 확장 자체 페이지(설정 창). 설정 창을 탭으로 열어도 되도록 sender.tab은 보지 않는다
function fromPopup(sender) {
  return sender.id === chrome.runtime.id && String(sender.url).startsWith(chrome.runtime.getURL(''));
}

async function publicState() {
  const guide = await getGuide();
  return {
    active: guide.active,
    goalId: guide.goalId,
    goalTitle: goalFor(guide.goalId).title,
    hasKey: Boolean(await getKey()),
  };
}

async function ask(msg, sender) {
  const guide = await getGuide();
  if (!guide.active) return { kind: 'inactive' };
  // 주소는 페이지가 보낸 값이 아니라 크롬이 알려 준 sender.url을 쓴다
  const prep = prepareGuide({
    goalId: guide.goalId,
    page: { ...msg.page, path: cleanPath(sender.url) },
    candidates: msg.candidates,
    pressed: guide.pressed,
  });
  if (prep.error) return { kind: 'error', code: prep.error };
  if (prep.result) return prep.result;
  const { body, candidates } = prep;
  const hash = await sha256(JSON.stringify({ v: RUBRIC_VERSION, goalId: guide.goalId, body }));
  const hit = cache.get(hash);
  let decision;
  let latencyMs = 0;
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    decision = hit.decision;
  } else {
    const started = Date.now();
    try {
      const response = await callJev(await getKey(), body);
      decision = decide(response, candidates);
      latencyMs = Date.now() - started;
      cache.set(hash, { at: Date.now(), decision });
      if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
      await log({ path: body.state.page.address, candidates: candidates.length, latencyMs, usage: response?.usage, ...decision.raw });
    } catch (err) {
      const code = err instanceof JevError ? err.code : 'server';
      await log({ path: body.state.page.address, error: code, status: err?.status });
      return { kind: 'error', code };
    }
  }
  return { ...finishGuide(decision, candidates), latencyMs };
}

// 어르신이 적은 말 → 목록에서 고를 후보 몇 개. Jev가 안 되면 글자 맞추기로 찾는다.
async function search(text) {
  const key = await getKey();
  const started = Date.now();
  const out = await searchCatalog(text, key ? (body) => callJev(key, body) : null);
  if (out.error) return { kind: 'error', code: out.error };
  const { meta, result } = out;
  await log(
    meta.error
      ? { path: 'search', error: meta.error }
      : { path: 'search', choice: meta.choice, results: result.items.length, latencyMs: Date.now() - started, usage: meta.usage },
  );
  return result;
}

async function testKey(key) {
  const body = {
    model: 'jev-latest',
    state: '연결 확인',
    questions: { ping: { type: 'noul', instructions: 'Is this text written in Korean?' } },
  };
  try {
    const res = await callJev(key, body);
    return { ok: res?.answers?.ping?.type === 'noul' };
  } catch (err) {
    return { ok: false, code: err instanceof JevError ? err.code : 'server' };
  }
}

async function handle(msg, sender) {
  await ensureReady();
  const page = fromAllowedPage(sender);
  const popup = fromPopup(sender);
  if (!page && !popup) return { kind: 'error', code: 'forbidden' };

  switch (msg?.type) {
    case 'guide/state':
      return publicState();
    case 'catalog/search':
      if (!page) break;
      return search(msg.query);
    case 'catalog/list':
      return { kind: 'results', items: CATALOG.map(publicItem), source: 'list' };
    case 'guide/start': {
      // 목록에 있는 id만 받는다 (어르신이 적은 말은 목표가 되지 않는다)
      if (!findService(msg.goalId)) return { kind: 'error', code: 'unknown_goal' };
      const goalId = msg.goalId;
      await setGuide({ active: true, goalId, pressed: [] });
      return publicState();
    }
    case 'guide/stop':
      await setGuide({ active: false, pressed: [] });
      return publicState();
    case 'guide/pressed': {
      if (!page) break;
      const label = cleanText(msg.label, MAX_LABEL);
      const guide = await getGuide();
      if (label && guide.active && guide.pressed.at(-1) !== label) {
        await setGuide({ pressed: [...guide.pressed, label].slice(-MAX_PRESSED) });
      }
      return { ok: true };
    }
    case 'guide/ask':
      if (!page) break;
      return ask(msg, sender);
    case 'popup/state': {
      if (!popup) break;
      const { decisions = [] } = await chrome.storage.session.get('decisions');
      const guide = await getGuide();
      return { ...(await publicState()), pressed: guide.pressed, decisions };
    }
    case 'key/save':
      if (!popup) break;
      await chrome.storage.local.set({ apiKey: String(msg.key ?? '').trim() });
      cache.clear();
      return publicState();
    case 'key/clear':
      if (!popup) break;
      await chrome.storage.local.remove('apiKey');
      return publicState();
    case 'key/test':
      if (!popup) break;
      return testKey(await getKey());
    case 'log/clear':
      if (!popup) break;
      cache.clear();
      await chrome.storage.session.remove('decisions');
      return { ok: true };
  }
  return { kind: 'error', code: 'unknown_message' };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handle(msg, sender).then(sendResponse, () => sendResponse({ kind: 'error', code: 'server' }));
  return true;
});

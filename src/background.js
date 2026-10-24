// 신뢰 영역. 안내 상태·동의 보관, 중계 서버 호출을 여기서만 한다. 확장에는 TypeSafe 키가 없다 (키는 중계 서버에만).
// 페이지 쪽(content.js)은 storage를 못 본다: storage 접근을 TRUSTED_CONTEXTS로 막는다.
// 동의하기 전에는 아무것도 밖으로 보내지 않는다 (웹스토어 Disclosure 정책).

import { DEFAULT_GOAL_ID, cleanPublicItems, cleanQuery, findService, goalFor, publicItem } from './lib/catalog.js';
import { listCatalog, searchCatalog } from './lib/guide.js';
import { HANDOFF_RESULT, detectHandoff, withoutLoginControls } from './lib/handoff.js';
import { RUBRIC_VERSION } from './lib/jev.js';
import { CONSENT_VERSION, RelayError, callRelay } from './lib/relay.js';
import { MAX_LABEL, MAX_PRESSED, cleanGuidePayload, cleanPath, cleanText } from './lib/sanitize.js';
import { ALLOWED_HOSTS } from './lib/sites.js';

const CACHE_MAX = 200;
const CACHE_TTL_MS = 30 * 60 * 1000;
const LOG_MAX = 20;
const KNOWN_MAX = 300;

const cache = new Map(); // 해시 → { at, result }  (service worker가 꺼지면 사라짐)

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

async function hasConsent() {
  const { consent } = await chrome.storage.local.get('consent');
  return consent?.version === CONSENT_VERSION;
}

// 0.1.3부터 서버 목록을 믿는다: 서버가 검색·목록 결과로 알려 준 항목(걸러진 id·이름·설명)을 기억해 두면,
// 서버에만 새로 넣은 서류도 고를 수 있다 (목록을 늘릴 때 서버만 올리면 된다). 브라우저를 닫으면 지워지는 곳(session)에 둔다.
// 서버는 /v1/guide/next마다 goalId를 다시 확인하므로(prepareGuide → unknown_goal) 지키는 힘은 그대로다.
async function rememberItems(list) {
  const items = cleanPublicItems(list);
  if (!items.length) return items;
  const { knownItems = [] } = await chrome.storage.session.get('knownItems');
  const ids = new Set(items.map((it) => it.id));
  const next = [...knownItems.filter((it) => !ids.has(it.id)), ...items].slice(-KNOWN_MAX);
  await chrome.storage.session.set({ knownItems: next });
  return items;
}

async function knownItem(id) {
  const { knownItems = [] } = await chrome.storage.session.get('knownItems');
  return knownItems.find((it) => it.id === id) ?? null;
}

async function forgetItem(id) {
  const { knownItems = [] } = await chrome.storage.session.get('knownItems');
  await chrome.storage.session.set({ knownItems: knownItems.filter((it) => it.id !== id) });
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
    // 고를 때 저장한 이름 (서버에만 있는 서류도 이름이 맞게). 0.1.2 때 저장된 안내 상태에는 없으므로 이 확장의 목록으로 채운다
    goalTitle: guide.goalName || goalFor(guide.goalId).title,
    consented: await hasConsent(),
    collapsed: guide.collapsed === true,
  };
}

const NO_CONSENT = { kind: 'error', code: 'no_consent' };

function relayFailure(err) {
  if (err instanceof RelayError) return { kind: 'error', code: err.code, message: err.userMessage };
  return { kind: 'error', code: 'server' };
}

async function ask(msg, sender) {
  if (!(await hasConsent())) return NO_CONSENT;
  const guide = await getGuide();
  if (!guide.active) return { kind: 'inactive' };
  // 주소는 페이지가 보낸 값이 아니라 크롬이 알려 준 sender.url을 쓴다
  const clean = cleanGuidePayload({
    page: { ...msg.page, path: cleanPath(sender.url) },
    candidates: msg.candidates,
    pressed: guide.pressed,
  });
  // 로그인 방법을 고르는 화면은 사용자가 직접 한다: 서버에 묻지 않는다 (서버도 같은 규칙으로 한 번 더 한다)
  if (detectHandoff(clean.candidates)) return { ...HANDOFF_RESULT };
  clean.candidates = withoutLoginControls(clean.candidates); // 로그인·회원가입·인증 버튼은 보내지 않는다
  if (clean.candidates.length === 0) return { kind: 'unsure', reason: 'no_candidates', stage: null, stageText: '' };

  const payload = { goalId: guide.goalId, ...clean };
  // 질문 문구를 바꾸면(RUBRIC_VERSION) 예전 답을 쓰지 않는다. 「다시 찾기」(manual)는 저장된 답을 건너뛴다 (Jev 답은 매번 조금 다를 수 있다)
  const hash = await sha256(JSON.stringify({ rubric: RUBRIC_VERSION, ...payload }));
  const hit = msg.manual ? null : cache.get(hash);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { ...hit.result, latencyMs: 0 };

  // 마지막으로 서버에 보낸 화면 정보(걸러진 것 그대로)를 브라우저를 닫으면 지워지는 곳(session)에 하나만 둔다.
  // 설정 창의 「마지막 화면 정보 복사하기」로 시험 자료(test/fixtures/pages.json)를 만들 때 쓴다 (참고: chy4pro/jev-for-chrome의 Copy trace, MIT)
  await chrome.storage.session.set({ lastPayload: { at: Date.now(), ...payload } });
  const started = Date.now();
  try {
    const result = await callRelay('/v1/guide/next', payload);
    const latencyMs = Date.now() - started;
    // 오류(예: Jev 답 모양이 틀림)는 저장하지 않는다 → 30분 동안 같은 오류가 반복되지 않게
    if (result?.kind !== 'error') cache.set(hash, { at: Date.now(), result });
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    await log({ path: clean.page.path, candidates: clean.candidates.length, latencyMs, kind: result.kind, label: result.label, stage: result.stage });
    return { ...result, latencyMs };
  } catch (err) {
    await log({ path: clean.page.path, error: err?.code ?? 'server', status: err?.status });
    // 고른 서류가 서버 목록에서 빠졌다 (서버 목록을 믿으므로 생길 수 있다): 안내를 끝내고 다시 고르게 한다
    if (err instanceof RelayError && err.code === 'unknown_goal') {
      await setGuide({ active: false, pressed: [] });
      await forgetItem(guide.goalId);
      return { kind: 'error', code: 'unknown_goal' };
    }
    return relayFailure(err);
  }
}

// 「목록에서 직접 고르기」: 동의했으면 서버 목록(서버에만 새로 넣은 서류 포함)을 받아 기억한다.
// 동의 전이거나 서버가 안 되면 이 확장에 든 목록을 보여 준다 (동의 전에는 아무것도 보내지 않는다).
async function listItems() {
  if (await hasConsent()) {
    try {
      // 본문 {}로 POST한다: GET에는 Origin 헤더가 안 붙어 서버의 Origin 확인을 못 지난다
      const items = await rememberItems((await callRelay('/v1/catalog', {}))?.items);
      if (items.length) return { kind: 'results', items, source: 'list' };
    } catch {
      /* 아래 목록으로 */
    }
  }
  return listCatalog();
}

// 어르신이 적은 말 → 목록에서 고를 후보. 중계가 안 되면 이 컴퓨터에서 글자 맞추기로 찾는다 (밖으로 아무것도 안 나감).
async function search(text) {
  if (!(await hasConsent())) return NO_CONSENT;
  const { query, error } = cleanQuery(text);
  if (error) return { kind: 'error', code: error };
  const started = Date.now();
  try {
    const result = await callRelay('/v1/catalog/search', { query });
    // 서버가 알려 준 항목은 걸러서 기억한다 → 서버에만 있는 서류를 골라도 안내를 시작할 수 있다
    const items = await rememberItems(result?.items);
    await log({ path: 'search', choice: items[0]?.name, results: items.length, latencyMs: Date.now() - started, source: result.source });
    return { ...result, items };
  } catch (err) {
    if (err instanceof RelayError && ['personal', 'empty', 'bad_request'].includes(err.code)) return relayFailure(err);
    await log({ path: 'search', error: err?.code ?? 'server', status: err?.status });
    return (await searchCatalog(query, null)).result;
  }
}

async function checkRelay() {
  try {
    const res = await callRelay('/health');
    return { ok: res?.ok === true, enabled: res?.enabled !== false };
  } catch (err) {
    return { ok: false, code: err?.code ?? 'server' };
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
    case 'consent/accept':
      if (!page) break;
      await chrome.storage.local.set({ consent: { version: CONSENT_VERSION, at: Date.now() } });
      return publicState();
    case 'consent/revoke':
      if (!popup) break;
      await chrome.storage.local.remove('consent');
      await setGuide({ active: false, pressed: [] });
      cache.clear();
      await chrome.storage.session.remove(['decisions', 'lastPayload', 'knownItems']);
      return publicState();
    case 'catalog/search':
      if (!page) break;
      return search(msg.query);
    case 'catalog/list':
      return listItems();
    case 'guide/start': {
      // 목록에 있는 id만 받는다: 서버가 알려 준 항목(기억해 둔 것) 또는 이 확장에 든 목록 (어르신이 적은 말은 목표가 되지 않는다).
      // 이름은 서버가 알려 준 것을 먼저 쓴다 (서버에서 이름을 바로잡았을 수 있다)
      const id = typeof msg.goalId === 'string' ? msg.goalId : '';
      const bundled = findService(id);
      const item = (await knownItem(id)) ?? (bundled ? publicItem(bundled) : null);
      if (!item) return { kind: 'error', code: 'unknown_goal' };
      if (!(await hasConsent())) return NO_CONSENT;
      await setGuide({ active: true, goalId: id, goalName: item.name, pressed: [] });
      return publicState();
    }
    case 'ui/collapsed':
      if (!page) break;
      await setGuide({ collapsed: msg.value === true });
      return { ok: true };
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
    case 'relay/test':
      if (!popup) break;
      return checkRelay();
    case 'popup/lastPayload': {
      if (!popup) break;
      const { lastPayload = null } = await chrome.storage.session.get('lastPayload');
      return { payload: lastPayload };
    }
    case 'log/clear':
      if (!popup) break;
      cache.clear();
      await chrome.storage.session.remove(['decisions', 'lastPayload']);
      return { ok: true };
  }
  return { kind: 'error', code: 'unknown_message' };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handle(msg, sender).then(sendResponse, () => sendResponse({ kind: 'error', code: 'server' }));
  return true;
});

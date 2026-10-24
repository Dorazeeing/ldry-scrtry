// 찾는 단계(서류 화면까지 가는 길)를 믿을 만하게 (2026-10-25 큐 3). 확장 background와 중계가 같이 쓴다 (크롬 API 없음).
// ① 같은 사이트에서 검색만 되풀이하지 않게: 검색 단추를 두 번 누른 뒤에는 검색 칸·단추를 후보에서 빼고, 갈 곳이 없으면 "검색으로 두 번 찾아봤는데…"
// ② 서류를 주지 않는 사이트에서 시작하지 않게: 정부24도, 그 서류를 주는 기관 사이트도 아니고 다른 사이트로 넘어온 기록도 없으면 정부24로 가라고 한다
// 결과 모양은 0.1.2와 같고 reason만 새로 있다 (0.1.2 확장도 stageText 줄은 그대로 보여 준다).

import { findService } from './catalog.js';
import { SEARCH_FIELD, SEARCH_LIMIT, SEARCH_SUBMIT } from './jev.js';
import { MAX_PRESSED } from './sanitize.js';
import { siteFor } from './sites.js';

// 다른 사이트로 넘어가는 단추: 정부24 「사이트가기」, 「바로가기」, 「홈페이지 바로가기」, 「사이트로 이동」 등.
// 이 단추를 누른 뒤에는 검색 횟수를 처음부터 세고, 넘어온 사람은 정부24로 돌려보내지 않는다
export const SITE_TRANSITION = /(사이트|홈페이지)\s*(바로\s*)?(가기|이동)|바로\s*가기|사이트로\s*이동/;

export const SEARCH_EXHAUSTED_TEXT = '검색으로 두 번 찾아봤는데 못 찾았어요.';
export const WRONG_SITE_TEXT = '길잡이는 정부24에서 시작하도록 만들어졌어요. 정부24로 가서 다시 시작해 주세요.';
export const SEARCH_EXHAUSTED_RESULT = Object.freeze({ kind: 'unsure', reason: 'search_exhausted', stage: null, stageText: SEARCH_EXHAUSTED_TEXT });
export const WRONG_SITE_RESULT = Object.freeze({ kind: 'unsure', reason: 'wrong_site', stage: null, stageText: WRONG_SITE_TEXT });

const compact = (s) => String(s ?? '').replace(/\s+/g, '');
export const isSearchSubmit = (label) => SEARCH_SUBMIT.test(compact(label));
export const isSiteTransition = (label) => SITE_TRANSITION.test(String(label ?? ''));
// 검색 칸(검색어를 적는 칸)이나 검색 단추
export const isSearchControl = (c) =>
  (c.kind === 'input' && SEARCH_FIELD.test(c.label)) || ((c.kind === 'button' || c.kind === 'link') && isSearchSubmit(c.label));

// 마지막으로 다른 사이트로 넘어간 뒤 검색 단추를 누른 횟수.
// 검색 칸을 누른 것은 세지 않는다 (한 번 검색할 때 칸과 단추를 다 누르므로 두 번으로 세면 한 번 만에 막힌다).
// 알려진 빈틈: Enter로 검색한 것은 누른 기록에 남지 않아 세지 못한다.
export function searchPresses(pressed) {
  let n = 0;
  for (const label of pressed ?? []) {
    if (isSiteTransition(label)) n = 0;
    else if (isSearchSubmit(label)) n += 1;
  }
  return n;
}

// 검색을 두 번 넘게 했으면 검색 칸·단추를 후보에서 뺀다. on이면 Jev가 못 고를 때 search_exhausted로 바꾼다 (guide.js).
// 빼고 나서 남는 것이 없으면 list가 비고, 부르는 쪽이 Jev에 묻지 않고 search_exhausted로 답한다.
export function searchGuard(candidates, pressed) {
  if (searchPresses(pressed) < SEARCH_LIMIT) return { list: candidates, on: false };
  return { list: (candidates ?? []).filter((c) => !isSearchControl(c)), on: true };
}

const GOV24 = siteFor('www.gov.kr');

// 서류를 주지 않는 사이트에서 안내를 시작했는지. 사이트는 호스트가 아니라 sites.js 항목으로 견준다 (www가 붙은 곳·안 붙은 곳이 같은 사이트).
// 이럴 때만 true: 정부24가 아니고, 그 서류를 주는 사이트(catalog.js site)도 아니고, 다른 사이트로 넘어가는 단추를 누른 기록이 없고,
// 누른 기록이 다 차지 않았다 (8개가 차면 앞의 「사이트가기」가 잘렸을 수 있다 → 돌려보내지 않는다).
// 다른 사이트로 넘어온 사람을 정부24로 돌려보내면 두 사이트 사이를 오가게 된다 — 애매하면 false.
export function wrongSite({ host, goalId, pressed }) {
  const here = siteFor(host);
  if (!here || here === GOV24) return false;
  const goalSite = findService(goalId)?.site;
  if (goalSite && siteFor(goalSite) === here) return false;
  const list = pressed ?? [];
  if (list.some(isSiteTransition)) return false;
  return list.length < MAX_PRESSED;
}

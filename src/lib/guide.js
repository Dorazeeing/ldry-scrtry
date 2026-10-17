// 판단 흐름 (거르기 → 질문 만들기 → Jev 호출 → 정책). 확장 background와 중계 서버(server/relay.js)가 같이 쓴다.
// 크롬 API를 쓰지 않는다. Jev 호출은 밖에서 넘겨받는다 (call(body) → 응답). 키는 이 파일에 없다.
// 중계는 확장이 보낸 값을 믿지 않으므로, 확장에서 이미 거른 값도 여기서 다시 거른다.

import { findService, goalFor, buildSearchRequest, cleanQuery, localSearch, namedButMissing, pickServices, publicItem, MAX_RESULTS } from './catalog.js';
import { STAGE_TEXT } from './goals.js';
import { buildRequest, decide } from './jev.js';
import { cleanGuidePayload } from './sanitize.js';
import { ALLOWED_HOSTS, siteFor } from './sites.js';

// "www.gov.kr/mw/AA020InfoCappView.do" 모양만 받는다 (쿼리·조각 없음). 호스트는 길잡이가 뜨는 사이트여야 한다.
const PATH_SHAPE = /^([a-z0-9.-]+)(\/[^\s?#]*)?$/;

export function hostOf(path) {
  const m = PATH_SHAPE.exec(String(path ?? ''));
  return m ? m[1] : '';
}

// 요청 → Jev 요청 본문. 문제가 있으면 { error }, Jev에 물을 필요가 없으면 { result }.
export function prepareGuide({ goalId, page, candidates, pressed }) {
  if (!findService(goalId)) return { error: 'unknown_goal' };
  const clean = cleanGuidePayload({ page, candidates, pressed });
  const host = hostOf(clean.page.path);
  if (!ALLOWED_HOSTS.has(host)) return { error: 'forbidden_site' };
  if (clean.candidates.length === 0) return { result: { kind: 'unsure', reason: 'no_candidates', stage: null, stageText: '' } };
  const body = buildRequest({
    goal: goalFor(goalId),
    page: clean.page,
    candidates: clean.candidates,
    pressed: clean.pressed,
    site: siteFor(host)?.name ?? '정부24',
  });
  return { body, candidates: clean.candidates };
}

// 판단 결과를 화면에 쓸 모양으로. 캐시된 판단이면 이번 후보 목록의 id로 다시 잇는다.
export function finishGuide(decision, candidates) {
  let d = decision;
  if (d.kind === 'point') {
    const pick = candidates.find((c) => c.label === d.label);
    if (!pick) return { kind: 'unsure', reason: 'unknown_option', stage: d.stage, stageText: '' };
    d = { ...d, id: pick.id };
  }
  const { raw, ...rest } = d;
  return { ...rest, stageText: STAGE_TEXT[d.stage] ?? '' };
}

// 한 번에: 준비 → Jev → 정책 → 화면 모양. 오류는 던진다 (JevError).
export async function guideNext(input, call) {
  const prep = prepareGuide(input);
  if (prep.error) return { error: prep.error };
  if (prep.result) return { result: prep.result };
  const response = await call(prep.body);
  const decision = decide(response, prep.candidates);
  return { result: finishGuide(decision, prep.candidates), decision, usage: response?.usage };
}

// 어르신이 적은 말 → 목록에서 고를 후보. call이 없거나 실패하면 글자 맞추기로 찾는다.
// meta: 기록용 (source, choice, usage, error)
export async function searchCatalog(text, call) {
  const { query, error } = cleanQuery(text);
  if (error) return { error };
  let items = [];
  const meta = { source: 'jev' };
  try {
    if (!call) throw Object.assign(new Error('no_key'), { code: 'no_key' });
    const response = await call(buildSearchRequest(query));
    items = pickServices(response);
    meta.choice = response?.answers?.service?.choice;
    meta.usage = response?.usage;
  } catch (err) {
    meta.source = 'local';
    meta.error = err?.code ?? 'server';
  }
  // Jev가 못 찾았거나 실패했을 때만 글자 맞추기로 채운다.
  // 2026-10-17: Jev 결과 뒤에 늘 붙였더니 "결혼한 거 증명"에 「소득금액 증명」·「운전경력 증명」이 "증명" 낱말로 따라붙었다.
  if (items.length === 0) for (const c of localSearch(query)) if (items.length < MAX_RESULTS) items.push(c);
  if (items.length === 0 && meta.source === 'local') meta.source = 'none';
  // 서류 이름을 적었는데 목록에 없으면 알린다 (비슷한 것을 맞는 것처럼 보여 주지 않게)
  return {
    result: { kind: 'results', items: items.map(publicItem), source: meta.source, missing: namedButMissing(query), query },
    meta,
  };
}

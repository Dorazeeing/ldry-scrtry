// 판단 흐름 (거르기 → 질문 만들기 → Jev 호출 → 정책). 확장 background와 중계 서버(server/relay.js)가 같이 쓴다.
// 크롬 API를 쓰지 않는다. Jev 호출은 밖에서 넘겨받는다 (call(body) → 응답). 키는 이 파일에 없다.
// 중계는 확장이 보낸 값을 믿지 않으므로, 확장에서 이미 거른 값도 여기서 다시 거른다.

import { CATALOG, docNames, findService, formPicks, goalFor, buildSearchRequest, cleanQuery, localSearch, namedButMissing, pickServices, publicItem, MAX_RESULTS } from './catalog.js';
import { STAGE_TEXT } from './goals.js';
import { buildRequest, decide } from './jev.js';
import { SEARCH_EXHAUSTED_RESULT, SEARCH_EXHAUSTED_TEXT, WRONG_SITE_RESULT, searchGuard, wrongSite } from './finding.js';
import { HANDOFF_RESULT, choiceNote, detectHandoff, splitChoices, withoutLoginControls, withoutSelfLinks } from './handoff.js';
import { MAX_LABEL, NONE_OPTION, cleanGuidePayload, cleanText } from './sanitize.js';
import { ALLOWED_HOSTS, siteFor } from './sites.js';

// "www.gov.kr/mw/AA020InfoCappView.do" 모양만 받는다 (쿼리·조각 없음). 호스트는 길잡이가 뜨는 사이트여야 한다.
const PATH_SHAPE = /^([a-z0-9.-]+)(\/[^\s?#]*)?$/;

export function hostOf(path) {
  const m = PATH_SHAPE.exec(String(path ?? ''));
  return m ? m[1] : '';
}

// 카드처럼 이름이 두 줄로 나뉜 링크·버튼은 첫 줄만 이름(label)이 되고 둘째 줄은 detail로 따로 온다.
// 「가족관계 / 증명서」「기본 / 증명서」가 AI에게 「가족관계」「기본」과 「증명서」로 따로 보이면 못 고른다
// (2026-10-19 전자가족관계 첫 화면: 합치기 전 「해당 없음」 0.45·「가족관계」 0.07 → 합친 뒤 「가족관계 증명서」 0.66).
// 짧은 둘째 줄(12자 이하, 날짜 아님)만 이름에 합친다. 긴 설명 글은 detail로 둔다. 서버만 고치면 되는 규칙이라 확장 심사가 필요 없다.
const MAX_JOIN = 12;
const DATE_LIKE = /^\d{4}[-./]\d{1,2}/;
export function joinShortDetail(list) {
  const seen = new Set([NONE_OPTION]);
  const out = [];
  for (const c of list) {
    const d = String(c.detail ?? '').trim();
    const join = (c.kind === 'link' || c.kind === 'button') && d && d.length <= MAX_JOIN && !DATE_LIKE.test(d);
    const label = join ? cleanText(`${c.label} ${d}`, MAX_LABEL) : c.label;
    if (seen.has(label)) continue; // 합친 이름이 겹치면 처음 것만 (Choice 선택지 이름은 겹치면 안 된다)
    seen.add(label);
    out.push(join ? { ...c, label, detail: '' } : c);
  }
  return out;
}

// 확장 버전이 min 이상인지 (중계가 X-Ldry-Version 헤더로 받아 input.clientVersion으로 넘긴다. ''이면 0.1.2 이하).
// 0.1.2가 헷갈릴 새 동작은 atLeast(clientVersion, '0.1.3')로 가른다. 2026-10-25 지금 가르는 곳은 없다.
export function atLeast(version, min) {
  if (!version) return false;
  const a = version.split('.').map(Number);
  const b = min.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return true;
}

// 요청 → Jev 요청 본문. 문제가 있으면 { error }, Jev에 물을 필요가 없으면 { result }.
export function prepareGuide({ goalId, page, candidates, pressed }) {
  if (!findService(goalId)) return { error: 'unknown_goal' };
  const clean = cleanGuidePayload({ page, candidates, pressed });
  const host = hostOf(clean.page.path);
  if (!ALLOWED_HOSTS.has(host)) return { error: 'forbidden_site' };
  // 서류를 주지 않는 사이트에서 시작했으면 Jev에 묻지 않고 정부24로 가라고 한다 (다른 사이트로 넘어온 사람은 돌려보내지 않는다, finding.js)
  if (wrongSite({ host, goalId, pressed: clean.pressed })) return { result: { ...WRONG_SITE_RESULT } };
  // 로그인 방법을 고르는 화면은 사용자가 직접 한다: 서버에 묻지 않고 넘긴다
  if (detectHandoff(clean.candidates)) return { result: { ...HANDOFF_RESULT } };
  // 로그인·회원가입·인증 버튼은 후보에서 뺀다 (AI가 "로그인부터"를 고르지 못하게)
  // 신청서의 고르는 칸(본인·가족 등)도 사용자가 직접 고르므로 뺀다. 서류 종류 칸만 남긴다 (D-11)
  const { list: kept, personal } = splitChoices(joinShortDetail(withoutLoginControls(clean.candidates)), formPicks(goalId));
  // 이미 그 서류 화면이면 같은 이름의 메뉴 링크는 뺀다 (다시 누르면 처음으로 돌아가고 본인 확인이 풀린다)
  const reachable = withoutSelfLinks(kept, { names: docNames(goalId), title: clean.page.title, pressed: clean.pressed });
  // 검색을 두 번 했으면 검색 칸·단추는 뺀다 (검색만 되풀이하지 않게). 그러면 jev.js의 「빈 검색 칸으로 옮기기」도 일어나지 않는다
  const guard = searchGuard(reachable, clean.pressed);
  const list = guard.list;
  const note = choiceNote(personal, clean.pressed);
  if (list.length === 0) return { result: guard.on ? { ...SEARCH_EXHAUSTED_RESULT } : { kind: 'unsure', reason: 'no_candidates', stage: null, stageText: '' } };
  const body = buildRequest({
    goal: goalFor(goalId),
    page: clean.page,
    candidates: list,
    pressed: clean.pressed,
    site: siteFor(host)?.name ?? '정부24',
  });
  return { body, candidates: list, note, searchGuard: guard.on };
}

// 검색을 두 번 한 뒤에도 Jev가 갈 곳을 못 고르면(해당 없음·낮은 확률) "검색으로 두 번 찾아봤는데 못 찾았어요"로 바꾼다
export function afterSearchGuard(decision, searchGuardOn) {
  if (!searchGuardOn || decision.kind !== 'unsure' || !['none', 'low_probability'].includes(decision.reason)) return decision;
  return { ...decision, reason: 'search_exhausted' };
}

const FORM_STAGE = '신청서 작성';

// 판단 결과를 화면에 쓸 모양으로. 캐시된 판단이면 이번 후보 목록의 id로 다시 잇는다.
// note(직접 고를 칸 안내)는 신청서 화면일 때만 단계 설명 대신 위쪽 줄에 쓴다
// (정부24 민원안내 화면의 만족도 설문도 고르는 칸이라, 거기서 "직접 골라 주세요"가 뜨면 헷갈린다).
export function finishGuide(decision, candidates, note = '') {
  let d = decision;
  if (d.kind === 'point') {
    const pick = candidates.find((c) => c.label === d.label);
    if (!pick) return { kind: 'unsure', reason: 'unknown_option', stage: d.stage, stageText: '' };
    d = { ...d, id: pick.id };
  }
  const { raw, ...rest } = d;
  if (d.reason === 'search_exhausted') return { ...rest, stageText: SEARCH_EXHAUSTED_TEXT };
  const formNote = note && d.stage === FORM_STAGE ? note : '';
  return { ...rest, stageText: formNote || (STAGE_TEXT[d.stage] ?? '') };
}

// 한 번에: 준비 → Jev → 정책 → 화면 모양. 오류는 던진다 (JevError).
export async function guideNext(input, call) {
  const prep = prepareGuide(input);
  if (prep.error) return { error: prep.error };
  if (prep.result) return { result: prep.result };
  const response = await call(prep.body);
  const decision = afterSearchGuard(decide(response, prep.candidates), prep.searchGuard);
  return { result: finishGuide(decision, prep.candidates, prep.note), decision, usage: response?.usage };
}

// 「목록에서 직접 고르기」에 보여 줄 전체 목록. 중계(POST /v1/catalog)와, 중계가 안 될 때의 확장이 같은 모양으로 쓴다.
export function listCatalog() {
  return { kind: 'results', items: CATALOG.map(publicItem), source: 'list' };
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

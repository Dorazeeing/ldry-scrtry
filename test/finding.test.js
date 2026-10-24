import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CATALOG, cleanPublicItems, publicItem, safeGuideUrl } from '../src/lib/catalog.js';
import { SEARCH_EXHAUSTED_TEXT, WRONG_SITE_TEXT, searchGuard, searchPresses, wrongSite } from '../src/lib/finding.js';
import { guideNext, prepareGuide } from '../src/lib/guide.js';
import { NONE_OPTION } from '../src/lib/sanitize.js';

const c = (id, label, kind = 'link', extra = {}) => ({ id, label, kind, area: 'main', detail: '', selected: false, filled: false, ...extra });
const searchPage = [c(0, '검색어를 입력하세요', 'input'), c(1, '검색', 'button'), c(2, '공지사항'), c(3, '자주 묻는 질문')];
const page = (path) => ({ title: '시험 화면', path, headings: [] });
const answer = (choice, p = 0.8) => ({
  answers: {
    nextControl: { type: 'choice', choice, confidence: p, probabilities: { [choice]: p } },
    pageStage: { type: 'choice', choice: '민원 찾기', confidence: 0.9, probabilities: { '민원 찾기': 0.9 } },
  },
});

test('검색 횟수: 검색 단추만 세고, 다른 사이트로 넘어가면 처음부터 센다', () => {
  assert.equal(searchPresses(['검색어를 입력하세요', '검색', '검색어를 입력하세요', '검색']), 2, '칸 누른 것은 세지 않는다');
  assert.equal(searchPresses(['통합검색', '검색하기', '찾기']), 3);
  assert.equal(searchPresses(['검색', '검색', '사이트가기', '검색']), 1, '「사이트가기」 뒤로만 센다');
  assert.equal(searchPresses(['검색', '홈페이지 바로가기']), 0);
  assert.equal(searchPresses(['발급하기', '다음']), 0);
});

test('검색 지킴: 두 번 넘게 검색했으면 검색 칸·단추를 빼고, 남는 것이 없으면 빈 목록', () => {
  assert.deepEqual(searchGuard(searchPage, ['검색']).list, searchPage);
  assert.equal(searchGuard(searchPage, ['검색']).on, false);
  const g = searchGuard(searchPage, ['검색', '검색어를 입력하세요', '검색']);
  assert.equal(g.on, true);
  assert.deepEqual(g.list.map((x) => x.label), ['공지사항', '자주 묻는 질문']);
  assert.deepEqual(searchGuard(searchPage.slice(0, 2), ['검색', '공지사항', '검색']).list, []);
});

test('검색 지킴 (서버 흐름): 검색 칸·단추를 Jev에 안 보내고, 갈 곳이 없으면 search_exhausted', async () => {
  const pressed = ['검색', '검색어를 입력하세요', '검색'];
  const prep = prepareGuide({ goalId: 'resident_abstract', page: page('www.gov.kr/search'), candidates: searchPage, pressed });
  assert.equal(prep.searchGuard, true);
  assert.deepEqual(Object.keys(prep.body.questions.nextControl.criteria), ['공지사항', '자주 묻는 질문', NONE_OPTION]);
  // 검색 칸·단추만 있는 화면: Jev에 묻지 않는다
  const only = prepareGuide({ goalId: 'resident_abstract', page: page('www.gov.kr/search'), candidates: searchPage.slice(0, 2), pressed });
  assert.equal(only.body, undefined);
  assert.deepEqual(only.result, { kind: 'unsure', reason: 'search_exhausted', stage: null, stageText: SEARCH_EXHAUSTED_TEXT });
  // Jev가 해당 없음·낮은 확률이면 search_exhausted로, 갈 곳을 고르면 그대로 가리킨다
  const input = { goalId: 'resident_abstract', page: page('www.gov.kr/search'), candidates: searchPage, pressed };
  const none = await guideNext(input, async () => answer(NONE_OPTION, 0.9));
  assert.equal(none.result.reason, 'search_exhausted');
  assert.equal(none.result.stageText, SEARCH_EXHAUSTED_TEXT);
  assert.equal((await guideNext(input, async () => answer('공지사항', 0.2))).result.reason, 'search_exhausted');
  const go = await guideNext(input, async () => answer('공지사항', 0.8));
  assert.equal(go.result.kind, 'point');
  assert.equal(go.result.label, '공지사항');
  // 검색을 한 번만 했으면 지금까지와 같다 (해당 없음은 none, 빈 검색 칸으로 옮기기도 그대로)
  const once = { ...input, pressed: ['검색'] };
  assert.equal((await guideNext(once, async () => answer(NONE_OPTION, 0.9))).result.reason, 'none');
  assert.equal((await guideNext(once, async () => answer('검색', 0.8))).result.label, '검색어를 입력하세요');
});

test('다른 사이트 지킴: 정부24는 절대 걸리지 않는다', () => {
  for (const host of ['www.gov.kr', 'plus.gov.kr']) {
    for (const goalId of ['resident_abstract', 'family_relation', 'national_tax_cert']) {
      assert.equal(wrongSite({ host, goalId, pressed: [] }), false, `${host} ${goalId}`);
    }
  }
});

test('다른 사이트 지킴: 그 서류를 주는 기관 사이트는 걸리지 않는다 (www가 있든 없든)', () => {
  assert.equal(wrongSite({ host: 'efamily.scourt.go.kr', goalId: 'family_relation', pressed: [] }), false);
  assert.equal(wrongSite({ host: 'www.hometax.go.kr', goalId: 'national_tax_cert', pressed: [] }), false);
  assert.equal(wrongSite({ host: 'hometax.go.kr', goalId: 'national_tax_cert', pressed: [] }), false, '같은 사이트의 다른 호스트');
  assert.equal(wrongSite({ host: 'realtyprice.kr', goalId: 'apartment_price', pressed: [] }), false);
});

test('다른 사이트 지킴: 「사이트가기」로 넘어왔으면 돌려보내지 않고, 기록이 잘렸으면 묻지 않는다', () => {
  // 서류를 주지 않는 기관 사이트에서 바로 시작했다 → 걸린다
  assert.equal(wrongSite({ host: 'www.car365.go.kr', goalId: 'resident_abstract', pressed: [] }), true);
  assert.equal(wrongSite({ host: 'www.hometax.go.kr', goalId: 'business_reissue', pressed: ['공지사항'] }), true);
  // 넘어가는 단추를 누른 기록이 있으면 걸리지 않는다
  for (const hop of ['사이트가기', '바로가기', '홈페이지 바로가기', '사이트 바로가기', '발급 사이트로 이동']) {
    assert.equal(wrongSite({ host: 'www.hometax.go.kr', goalId: 'business_reissue', pressed: ['사업자등록증 재발급', hop, '로그인'] }), false, hop);
  }
  // 누른 기록이 8개로 다 찼으면 앞의 「사이트가기」가 잘렸을 수 있다 → 걸지 않는다
  const full = ['가', '나', '다', '라', '마', '바', '사', '아'];
  assert.equal(wrongSite({ host: 'www.hometax.go.kr', goalId: 'business_reissue', pressed: full }), false);
});

test('다른 사이트 지킴 (서버 흐름): Jev에 묻지 않고 wrong_site와 쉬운 안내', async () => {
  let called = 0;
  const out = await guideNext(
    { goalId: 'resident_abstract', page: page('www.car365.go.kr/home'), candidates: [c(0, '자동차 등록원부'), c(1, '공지사항')], pressed: [] },
    async () => {
      called += 1;
      return answer('공지사항');
    },
  );
  assert.equal(called, 0);
  assert.deepEqual(out.result, { kind: 'unsure', reason: 'wrong_site', stage: null, stageText: WRONG_SITE_TEXT });
  // 「사이트가기」로 넘어온 사람은 그대로 안내한다
  const hopped = await guideNext(
    { goalId: 'resident_abstract', page: page('www.car365.go.kr/home'), candidates: [c(0, '자동차 등록원부'), c(1, '공지사항')], pressed: ['사이트가기'] },
    async () => answer('공지사항'),
  );
  assert.equal(hopped.result.kind, 'point');
});

test('바로 가기 주소: https·길잡이가 뜨는 사이트만, 목록에는 사람이 확인한 주소만 (지금은 비어 있음)', () => {
  assert.equal(safeGuideUrl('https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=13100000015'), 'https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=13100000015');
  for (const bad of ['http://www.gov.kr/x', 'https://evil.example/x', 'https://user:pw@www.gov.kr/x', 'javascript:alert(1)', 'www.gov.kr/x', '', undefined, 7]) {
    assert.equal(safeGuideUrl(bad), '', String(bad));
  }
  // 목록의 주소는 모두 비어 있거나 검사를 통과해야 한다 (확인 안 된 주소를 넣지 않는다)
  assert.ok(CATALOG.every((x) => !x.url || safeGuideUrl(x.url) === x.url));
  assert.ok(CATALOG.every((x) => !('url' in publicItem(x))), '2026-10-25 지금은 주소가 있는 항목이 없다');
  // 있을 때만 결과에 실린다
  assert.equal(publicItem({ id: 'x', name: '시험', plain: '', url: 'https://www.gov.kr/a' }).url, 'https://www.gov.kr/a');
  assert.equal('url' in publicItem({ id: 'x', name: '시험', plain: '', url: 'https://evil.example/a' }), false);
  // 서버가 준 주소도 확장이 다시 본다
  const [ok, bad] = cleanPublicItems([
    { id: 'a', name: '가', plain: '', url: 'https://plus.gov.kr/x' },
    { id: 'b', name: '나', plain: '', url: 'http://plus.gov.kr/x' },
  ]);
  assert.equal(ok.url, 'https://plus.gov.kr/x');
  assert.equal('url' in bad, false);
});

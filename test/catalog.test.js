import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CATALOG,
  MAX_RESULTS,
  buildSearchRequest,
  cleanQuery,
  findService,
  goalFor,
  localSearch,
  namedButMissing,
  pickServices,
} from '../src/lib/catalog.js';
import { NONE_OPTION } from '../src/lib/sanitize.js';

test('목록: id·이름이 겹치지 않고, 쉬운 설명이 있다', () => {
  assert.equal(new Set(CATALOG.map((c) => c.id)).size, CATALOG.length);
  assert.equal(new Set(CATALOG.map((c) => c.name)).size, CATALOG.length);
  assert.ok(CATALOG.every((c) => c.plain && c.service));
});

test('목표: 목록에 있는 글만으로 만든다', () => {
  const g = goalFor('resident_abstract');
  assert.equal(g.title, '주민등록표 초본');
  assert.match(g.goal, /주민등록표 초본/);
  assert.match(g.goal, /choose 초본, not 등본/);
  assert.equal(findService('없는 것'), null);
  assert.equal(goalFor('없는 것').id, 'resident_abstract', '모르는 id는 기본값');
});

test('검색어: 비었거나 개인정보로 보이면 보내지 않는다', () => {
  assert.deepEqual(cleanQuery('   '), { error: 'empty' });
  assert.deepEqual(cleanQuery('홍길동님 등본'), { error: 'personal' });
  assert.deepEqual(cleanQuery('010-1234-5678'), { error: 'personal' });
  assert.deepEqual(cleanQuery(' 이사 다닌   기록 '), { query: '이사 다닌 기록' });
});

test('글자 맞추기 검색 (키가 없을 때)', () => {
  assert.equal(localSearch('초본')[0].id, 'resident_abstract');
  assert.equal(localSearch('땅 서류')[0].id, 'land_register');
  assert.equal(localSearch('군대')[0].id, 'military_record');
  assert.deepEqual(localSearch('전혀 상관없는 말'), []);
  assert.ok(localSearch('주민등록').length <= MAX_RESULTS);
});

test('검색 요청: 목록 전체 + 해당 없음을 선택지로', () => {
  const body = buildSearchRequest('이사 다닌 기록');
  assert.equal(body.state.request, '이사 다닌 기록');
  const options = Object.keys(body.questions.service.criteria);
  assert.equal(options.length, CATALOG.length + 1);
  assert.ok(options.includes(NONE_OPTION));
});

test('검색 결과: 확률 순, 해당 없음·낮은 확률 제외, 목록 밖 이름 제외', () => {
  const res = {
    answers: {
      service: {
        type: 'choice',
        choice: '주민등록표 초본',
        probabilities: { '주민등록표 초본': 0.6, '주민등록표 등본': 0.25, [NONE_OPTION]: 0.1, 가족관계증명서: 0.03, 지어낸서류: 0.5 },
      },
    },
  };
  assert.deepEqual(pickServices(res).map((c) => c.id), ['resident_abstract', 'resident_copy']);
  assert.deepEqual(pickServices({}), []);
});

test('서류 이름을 적었는데 목록에 없으면 알아챈다 (2026-10-17 "혼인관계증명서"가 목록에 없어 가족관계증명서로 잘못 안내됨 → 지금은 목록에 추가)', () => {
  const cases = {
    제적등본: true,
    '출입국사실증명서': true,
    전입신고: true,
    가족관계증명서: false,
    초본: false,
    '주민등록 초본': false,
    토지대장: false,
    '이사 다닌 기록이 나오는 서류': false,
    // 쉬운 말이 「증명」으로 끝나는 경우: 맞는 서류를 찾고도 "목록에 없어요"가 뜨면 안 된다 (2026-10-18)
    '결혼한 거 증명': false,
    '이사한 증명': false,
    '소득이 없다는 증명': false,
    '제적 등본': true,
    '출입국 사실 증명서': true,
  };
  for (const [q, want] of Object.entries(cases)) assert.equal(namedButMissing(q), want, q);
});

test('기관 사이트에서 발급하는 서류: 사이트 목록에 있고 켜져 있어(D-9) 넘어가도 안내가 이어진다고 목표에 적는다', async () => {
  const { siteFor, MATCHES, ALLOWED_HOSTS } = await import('../src/lib/sites.js');
  for (const c of CATALOG.filter((x) => x.site)) {
    assert.ok(siteFor(c.site), `${c.name}: ${c.site}가 sites.js에 없다`);
    assert.ok(ALLOWED_HOSTS.has(c.site), `${c.name}: ${c.site}가 켜져 있지 않다`);
  }
  assert.equal(MATCHES.length, 16);
  assert.ok(MATCHES.includes('https://efamily.scourt.go.kr/*') && MATCHES.includes('https://www.gov.kr/*'));
  assert.ok(MATCHES.every((m) => m.startsWith('https://')), 'https만');
  const { publicItem, findService } = await import('../src/lib/catalog.js');
  assert.equal(publicItem(findService('marriage_cert')).offsiteName, undefined, '모두 켜져 있어 "길잡이가 안 떠요" 안내는 없다');
  assert.match(goalFor('marriage_cert').goal, /efamily\.scourt\.go\.kr/);
  assert.match(goalFor('marriage_cert').goal, /guidance continues/);
  assert.doesNotMatch(goalFor('resident_abstract').goal, /issued on/);
  assert.equal(namedButMissing('혼인관계증명서'), false, '이제 목록에 있다');
});

test('글자 맞추기: "증명"·"서류" 같은 흔한 낱말로는 찾지 않는다', () => {
  assert.deepEqual(localSearch('그냥 증명 서류'), []);
  assert.equal(localSearch('결혼 증명')[0].id, 'marriage_cert');
});

test('사업자등록증명 ↔ 사업자등록증 재발급은 다른 항목이고 서로 구별된다 (2026-10-19 사용자 신고: 재발급을 찾아도 증명만 나왔다)', () => {
  const proof = findService('business_register');
  const reissue = findService('business_reissue');
  assert.equal(proof.name, '사업자등록증명');
  assert.equal(reissue.name, '사업자등록증 재발급');
  assert.notEqual(proof.plain, reissue.plain);
  assert.match(reissue.plain, /잃어버렸|헐어/);
  // 글자 맞추기(중계가 안 될 때): 쓴 말에 맞는 쪽이 1순위, 「사업자등록증」만 적으면 둘 다 보인다
  for (const q of ['사업자 등록 재발급', '사업자등록증 재발급', '사업자등록증 잃어버렸어요']) assert.equal(localSearch(q)[0].id, 'business_reissue', q);
  assert.equal(localSearch('사업자등록 증명 필요해요')[0].id, 'business_register');
  const both = localSearch('사업자등록증').map((c) => c.id);
  assert.ok(both.includes('business_reissue') && both.includes('business_register'));
  // 목표 문장도 서로 다르다 (안내가 엉뚱한 메뉴로 가지 않게)
  assert.match(goalFor('business_reissue').goal, /사업자등록증 재발급/);
  assert.match(goalFor('business_register').goal, /사업자등록증명 발급/);
  // 「사업자등록 증명」으로 적어도 같은 서류로 안다 (예전 이름)
  assert.equal(namedButMissing('사업자등록 증명'), false);
});

test('정부24 공지에 이름이 있던 서류가 목록에 있다 (자동차등록증 재발급·건설기계 등록원부·난임부부 시술비 지원 신청)', () => {
  assert.equal(localSearch('자동차등록증 재발급')[0].id, 'car_license_reissue');
  assert.equal(localSearch('굴착기 등록 서류')[0].id, 'construction_machine_register');
  assert.equal(localSearch('난임 시술비')[0].id, 'infertility_support');
  assert.equal(localSearch('여권 재발급')[0].id, 'passport_reissue', '「재발급」 낱말만으로 다른 재발급이 1순위가 되면 안 된다');
  assert.equal(CATALOG.length, 31);
});

test('Jev 검색 질문에 「증명」과 「재발급」을 구별하라는 설명이 있다', () => {
  const note = buildSearchRequest('사업자등록증').questions.service.instructions.note;
  assert.match(note, /증명/);
  assert.match(note, /재발급/);
});

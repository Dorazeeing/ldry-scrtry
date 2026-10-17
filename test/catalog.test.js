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

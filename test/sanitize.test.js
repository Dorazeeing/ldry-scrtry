import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_CANDIDATES,
  NONE_OPTION,
  cleanCandidates,
  cleanHeadings,
  cleanPath,
  cleanText,
  focusPopup,
  cleanGuidePayload,
  looksPersonal,
} from '../src/lib/sanitize.js';

test('개인정보로 보이는 글자를 걸러 낸다', () => {
  assert.equal(looksPersonal('900101-1234567'), true);
  assert.equal(looksPersonal('010-1234-5678'), true);
  assert.equal(looksPersonal('hong@example.com'), true);
  assert.equal(looksPersonal('홍길동님 환영합니다'), true);
  assert.equal(looksPersonal('홍길동 님'), true);
  assert.equal(looksPersonal('발급하기'), false);
  assert.equal(looksPersonal('2주민등록등본(초본)'), false);
  assert.equal(looksPersonal('최근 5년'), false);
});

test('글자를 정리하고 길이를 자른다', () => {
  assert.equal(cleanText('  발급\n 하기 ', 40), '발급 하기');
  assert.equal(cleanText('가'.repeat(50), 10), `${'가'.repeat(9)}…`);
  assert.equal(cleanText('홍길동님', 40), '');
});

test('주소는 호스트와 경로만 남긴다 (쿼리 제거)', () => {
  assert.equal(
    cleanPath('https://www.gov.kr/mw/AA020InfoCappView.do?HighCtgCD=A01010001&CappBizCD=13100000015'),
    'www.gov.kr/mw/AA020InfoCappView.do',
  );
  assert.equal(cleanPath('not a url'), '');
});

test('후보: 개인정보·잘못된 종류는 버리고, 같은 이름은 처음 것만 남긴다', () => {
  const { candidates, dropped } = cleanCandidates([
    { id: 0, label: '발급하기', kind: 'link', area: 'main' },
    { id: 1, label: '발급하기', kind: 'button', area: 'menu' },
    { id: 2, label: '홍길동님', kind: 'link', area: 'menu' },
    { id: 3, label: '초본', kind: 'option', area: 'main', selected: true },
    { id: 4, label: '이름', kind: 'input', area: 'main', filled: true, detail: '010-1234-5678' },
    { id: 5, label: '이상한 것', kind: 'script', area: 'main' },
    { id: 6, label: NONE_OPTION, kind: 'button', area: 'main' },
    { id: 'x', label: '아이디 없음', kind: 'button', area: 'main' },
  ]);
  assert.deepEqual(
    candidates.map((c) => [c.id, c.label, c.kind]),
    [
      [0, '발급하기', 'link'],
      [3, '초본', 'option'],
      [4, '이름', 'input'],
    ],
  );
  assert.equal(candidates[1].selected, true);
  assert.equal(candidates[2].filled, true);
  assert.equal(candidates[2].detail, '', '개인정보가 있는 설명은 비운다');
  assert.equal(dropped, 3);
});

test('떠 있는 창이 있으면 창 안 후보만 남긴다', () => {
  const list = [
    { id: 0, label: '발급하기', area: 'main' },
    { id: 1, label: '회원 신청하기', area: 'popup' },
    { id: 2, label: '로그인', area: 'menu' },
  ];
  assert.deepEqual(focusPopup(list).map((c) => c.id), [1]);
  assert.equal(focusPopup(list.filter((c) => c.area !== 'popup')).length, 2);
});

test('후보 수 상한을 지킨다', () => {
  const raw = Array.from({ length: MAX_CANDIDATES + 30 }, (_, i) => ({ id: i, label: `버튼 ${String.fromCharCode(0xac00 + i)}`, kind: 'button' }));
  assert.equal(cleanCandidates(raw).candidates.length, MAX_CANDIDATES);
});

test('제목: 중복·개인정보 제거, 5개까지', () => {
  assert.deepEqual(cleanHeadings(['민원안내', '민원안내', '홍길동님의 신청내역', '가', '나', '다', '라', '마']), [
    '민원안내',
    '가',
    '나',
    '다',
    '라',
  ]);
});

test('주소: 경로 속 세션 값(;jsessionid=…)을 버린다', () => {
  assert.equal(cleanPath('https://www.gov.kr/mw/AA040OfferMainFrm.do;jsessionid=ABC123?x=1'), 'www.gov.kr/mw/AA040OfferMainFrm.do');
});

test('주소 모양 글자를 개인정보로 거른다 (이름·번호 없이도 새는 틈)', () => {
  for (const s of ['서울특별시 성동구 왕십리로 12', '경기도 성남시 분당구', '왕십리로 12-3', '행당동 123번지']) assert.equal(looksPersonal(s), true, s);
  for (const s of ['시군구 및 읍면동 출장소', '주민등록법 시행규칙 (제13조 ,제15조)', '발급하기', '다음 목록', '로그인']) assert.equal(looksPersonal(s), false, s);
});

test('정부24 밖 사이트는 제목 글·창 안내 글을 보내지 않고, 정부24는 보낸다', () => {
  const page = { title: '신청인 정보 조회', headings: ['증명서 발급'], popupText: '확인하세요' };
  const a = cleanGuidePayload({ page: { ...page, path: 'www.hometax.go.kr/x' }, candidates: [], pressed: [] });
  assert.deepEqual(a.page.headings, []);
  assert.equal(a.page.popupText, '');
  assert.equal(a.page.title, '신청인 정보 조회', '화면 제목은 보낸다');
  const b = cleanGuidePayload({ page: { ...page, path: 'www.gov.kr/mw/x' }, candidates: [], pressed: [] });
  assert.deepEqual(b.page.headings, ['증명서 발급']);
  assert.equal(b.page.popupText, '확인하세요');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HANDOFF_RESULT, detectHandoff, isLoginControl, withoutLoginControls } from '../src/lib/handoff.js';

const c = (...labels) => labels.map((label) => ({ label }));

test('로그인 방법이 둘 이상 보이면 직접 고르게 넘긴다', () => {
  assert.equal(detectHandoff(c('개인', '법인', '간편인증', '공동인증서', '금융인증서', '모바일 신분증', '아이디 로그인')), true);
  assert.equal(detectHandoff(c('회원 신청하기', '비회원 신청하기', '공동인증서 등록 레이어 닫기')), true);
  assert.equal(detectHandoff(c('간편인증', '공동인증서')), true);
});

test('공지 제목처럼 긴 글은 로그인 방법 버튼으로 세지 않는다 (정부24 메인 공지사항)', () => {
  assert.equal(
    detectHandoff(c('비회원 로그인(개인) 사용자정보 직접 입력 서비스 중단 안내', '간편인증(하나인증서, NICE, 카카오뱅크) 시스템 작업 안내', '주민등록등본(초본)')),
    false,
  );
});

test('어느 사이트에서든 같다: 기관 사이트 로그인 화면의 버튼 이름도 넘긴다', () => {
  // 홈택스·건강보험·경찰 민원포털·전자가족관계 등에서 흔한 이름들
  assert.equal(detectHandoff(c('공동인증서 로그인', '간편인증 로그인', '아이디 로그인')), true);
  assert.equal(detectHandoff(c('민간인증서', '금융인증서', '공동인증서')), true);
  assert.equal(detectHandoff(c('간편인증', '공동인증서', '금융인증서', '신청')), true);
});

test('정부24 머리글의 「로그인」·「회원가입」, 방법이 하나뿐인 화면은 넘기지 않는다', () => {
  assert.equal(detectHandoff(c('발급하기', '로그인', '회원가입', '민원서비스')), false);
  assert.equal(detectHandoff(c('간편인증')), false);
  assert.equal(detectHandoff(c('주민등록등본(초본)', '여권 재발급')), false);
  assert.equal(detectHandoff([]), false);
});

test('로그인·회원가입·인증 버튼은 후보에서 뺀다', () => {
  for (const l of ['로그인', '로그아웃', '회원가입', '아이디 로그인', '간편인증', '공동인증서', '금융인증서', '모바일 신분증', '회원 신청하기', '비회원 신청하기', '비회원 로그인(개인)']) {
    assert.equal(isLoginControl(l), true, l);
  }
  for (const l of ['인증서 선택하기', '발급하기', '민원서비스', '통합검색', '안녕하세요. 무엇을 알고 싶으세요?', '신청 방법 및 절차', '전자증명서안내', '나의 신청내역']) {
    assert.equal(isLoginControl(l), false, l);
  }
  assert.deepEqual(withoutLoginControls(c('발급하기', '로그인', '회원가입', '통합검색')).map((x) => x.label), ['발급하기', '통합검색']);
});

test('넘김 결과 모양', () => {
  assert.equal(HANDOFF_RESULT.kind, 'handoff');
  assert.equal(HANDOFF_RESULT.stage, '로그인');
  assert.match(HANDOFF_RESULT.stageText, /로그인 방법/);
});

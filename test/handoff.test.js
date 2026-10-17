import assert from 'node:assert/strict';
import { test } from 'node:test';
import { docNames, formPicks } from '../src/lib/catalog.js';
import { finishGuide, prepareGuide } from '../src/lib/guide.js';
import { HANDOFF_RESULT, authDone, choiceNote, detectHandoff, isLoginControl, splitChoices, withoutLoginControls, withoutSelfLinks } from '../src/lib/handoff.js';

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

// ---------- 신청서의 고르는 칸도 사용자가 직접 (D-11) ----------
const opt = (label, selected = false) => ({ label, kind: 'option', selected });
const link = (label) => ({ label, kind: 'link' });

test('고르는 칸: 서류 종류와 약관 동의만 남기고, 본인·가족·일반·상세·보안 키보드는 뺀다', () => {
  const { list, personal } = splitChoices(
    [opt('본인', true), opt('가족'), opt('혼인관계증명서', true), opt('기본증명서'), opt('일반증명서', true), opt('키보드보안프로그램적용'), opt('위 이용약관에 동의합니다.'), link('다음')],
    formPicks('marriage_cert'),
  );
  assert.deepEqual(list.map((c) => c.label), ['혼인관계증명서', '위 이용약관에 동의합니다.', '다음']);
  assert.deepEqual(personal.map((c) => c.label), ['본인', '가족', '기본증명서', '일반증명서', '키보드보안프로그램적용']);
  // 초본: 짧은 이름 「초본」 칸도 서류 종류로 본다
  assert.deepEqual(splitChoices([opt('초본'), opt('등본'), opt('전체 포함')], formPicks('resident_abstract')).list.map((c) => c.label), ['초본']);
});

test('본인 확인을 했는지: 실제 로그인 방법을 누른 기록이 있을 때만', () => {
  assert.equal(authDone(['혼인관계증명서', '발급하기', '간편인증']), true);
  assert.equal(authDone(['발급하기', '비회원 신청하기']), false);
  assert.equal(authDone(['발급하기', '회원 신청하기']), false);
  assert.equal(authDone([]), false);
});

test('이미 그 서류 화면이면 같은 이름의 메뉴 링크를 뺀다 (본인 확인 뒤, 또는 그 링크로 온 뒤)', () => {
  const title = '증명서발급 | 가족관계등록부 | 혼인관계증명서';
  const names = docNames('marriage_cert');
  const list = [link('• 혼인관계증명서'), link('기본증명서'), { label: '다음', kind: 'button' }];
  const kept = (pressed) => withoutSelfLinks(list, { names, title, pressed }).map((c) => c.label);
  assert.deepEqual(kept(['혼인관계증명서', '발급하기', '간편인증']), ['기본증명서', '다음']);
  assert.deepEqual(kept(['혼인관계증명서']), ['기본증명서', '다음']);
  // 처음 오는 길이면 그 링크가 맞는 길일 수 있다
  assert.deepEqual(kept([]), ['• 혼인관계증명서', '기본증명서', '다음']);
  // 제목에 서류 이름이 없으면 손대지 않는다
  assert.equal(withoutSelfLinks(list, { names, title: '메인 | 전자가족관계등록시스템', pressed: ['간편인증'] }).length, 3);
});

test('직접 고를 칸 안내 문구', () => {
  assert.equal(choiceNote([], ['간편인증']), '');
  assert.equal(choiceNote([opt('본인'), opt('가족'), opt('일반증명서')], ['간편인증']), '본인 확인이 끝났어요. 「본인」·「가족」 같은 고르는 칸은 직접 골라 주세요.');
  assert.equal(choiceNote([opt('개인 인적사항 변경 내용 포함')], []), '고르는 칸은 직접 골라 주세요.');
  // 다른 서류를 고르는 칸은 예로 들지 않는다 (「등본」을 고르라는 말로 들리면 안 된다)
  assert.equal(choiceNote([opt('등본'), opt('기본증명서'), opt('본인')], []), '「본인」 같은 고르는 칸은 직접 골라 주세요.');
});

test('2026-10-18 전자가족관계 신청서 (사용자 스크린샷): 옆 메뉴 「혼인관계증명서」를 보내지 않고, 고르는 칸은 직접 고르라고 알린다', () => {
  // 고치기 전 확장판이 보낸 모양: 신청서의 「혼인관계증명서」(골라짐)는 옆 메뉴 링크와 이름이 같아 빠졌다
  const candidates = [
    '증명서발급', '인터넷신고', '민원안내', '고객센터', '가족관계등록부', '기본증명서', '혼인관계증명서', '입양관계증명서', '친양자입양관계증명서', '영문증명서', '제적부', '나의 발급 이력',
  ].map((label, id) => ({ id, label, kind: 'link', area: id < 4 ? 'menu' : 'main' }));
  candidates.push(
    ...[['본인', true], ['가족'], ['가족관계증명서'], ['일반증명서', true], ['상세증명서'], ['특정증명서']].map(([label, selected], i) => ({ id: 20 + i, label, kind: 'option', area: 'main', selected: Boolean(selected) })),
    { id: 30, label: '다음', kind: 'button', area: 'main' },
  );
  const prep = prepareGuide({
    goalId: 'marriage_cert',
    page: { title: '증명서발급 | 가족관계등록부 | 혼인관계증명서', path: 'efamily.scourt.go.kr/pt/PtFrrpReadIssTrgtInfoW.do', headings: [] },
    candidates,
    pressed: ['혼인관계증명서', '발급하기', '간편인증'],
  });
  const options = Object.keys(prep.body.questions.nextControl.criteria);
  assert.ok(!options.includes('혼인관계증명서'), '옆 메뉴 링크는 빠진다');
  assert.ok(options.includes('다음') && options.includes('기본증명서'));
  assert.ok(!['본인', '가족', '일반증명서', '상세증명서', '특정증명서', '가족관계증명서'].some((o) => options.includes(o)));
  assert.equal(prep.note, '본인 확인이 끝났어요. 「본인」·「가족」 같은 고르는 칸은 직접 골라 주세요.');
  // 화면 위쪽 줄에 그대로 쓰인다 (예전 확장판도 이 줄을 보여 준다)
  const done = finishGuide({ kind: 'point', id: 30, label: '다음', targetKind: 'button', stage: '신청서 작성' }, prep.candidates, prep.note);
  assert.equal(done.stageText, prep.note);
  assert.equal(finishGuide({ kind: 'point', id: 30, label: '다음', targetKind: 'button', stage: '신청서 작성' }, prep.candidates).stageText, '신청서를 고르는 화면이에요.');
  // 신청서 화면이 아니면(민원안내 화면의 만족도 설문 등) 안내 문구를 쓰지 않는다
  assert.equal(finishGuide({ kind: 'point', id: 30, label: '다음', targetKind: 'button', stage: '민원 안내' }, prep.candidates, prep.note).stageText, '찾는 민원의 안내 화면이에요.');
});

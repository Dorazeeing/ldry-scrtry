// 로그인·회원/비회원·본인 인증 방법 고르기는 사용자가 직접 한다 (사용자 결정 2026-10-17, requirementSpec D-10).
// 그런 화면에서는 테두리를 끄고 직접 고르라는 안내만 보여 준다 (서버에 묻지 않는다).
// 그리고 이런 버튼은 후보에서 아예 뺀다 → AI가 "로그인부터 하세요"를 고를 수 없다 (정부24 메인에 "로그인"이 늘 있다).
// 확장 background와 중계 서버가 같이 쓴다 (크롬 API 없음).

// 로그인 방법을 고르는 버튼들. 이 중 둘 이상 보이면 "로그인 방법을 고르는 화면"이다.
const AUTH_METHOD = /(공동|금융|모바일|민간)\s*인증서|간편\s*인증|모바일\s*신분증|아이디\s*로그인|비회원\s*(로그인|신청)|^회원\s*신청하기|QR\s*코드\s*로그인/;

// 로그인 방법 버튼은 이름이 짧다(「간편인증」「공동인증서」「비회원 로그인(개인)」). 공지 제목은 문장이라 길다
// (정부24 메인의 「간편인증(하나인증서, NICE, 카카오뱅크) 시스템 작업 안내」 같은 공지가 방법 버튼으로 세어지면 안 된다).
const MAX_METHOD_LABEL = 16;

// 후보에서 빼는 버튼: 로그인·로그아웃·회원가입·인증 방법·회원/비회원 선택
// ('인증서' 낱말만으로는 빼지 않는다: 「인증서 선택하기」 같은 창 안 버튼이 사라지면 안 된다)
const LOGIN_CONTROL = /로그인|로그아웃|회원\s*가입|(공동|금융|모바일|민간)\s*인증서|간편\s*인증|모바일\s*신분증|(비)?회원\s*신청/;

export const HANDOFF_RESULT = Object.freeze({
  kind: 'handoff',
  stage: '로그인',
  stageText: '로그인 방법을 고르는 화면이에요.',
});

export const isLoginControl = (label) => LOGIN_CONTROL.test(String(label ?? ''));

// candidates: 걸러진 후보 [{ label, ... }]
export function detectHandoff(candidates) {
  const methods = new Set();
  for (const c of candidates ?? []) {
    const label = String(c?.label ?? '');
    if (label.length <= MAX_METHOD_LABEL && AUTH_METHOD.test(label)) methods.add(label);
  }
  return methods.size >= 2;
}

export const withoutLoginControls = (candidates) => (candidates ?? []).filter((c) => !isLoginControl(c.label));

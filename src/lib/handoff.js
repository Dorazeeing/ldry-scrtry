// 로그인·회원/비회원·본인 인증 방법 고르기, 신청서의 고르는 칸은 사용자가 직접 한다 (사용자 결정 2026-10-17 D-10, 2026-10-18 D-11).
// 그런 화면에서는 테두리를 끄고 직접 고르라는 안내만 보여 준다 (서버에 묻지 않는다).
// 그리고 이런 버튼은 후보에서 아예 뺀다 → AI가 "로그인부터 하세요"를 고를 수 없다 (정부24 메인에 "로그인"이 늘 있다).
// 확장 background와 중계 서버가 같이 쓴다 (크롬 API 없음).

import { isDocumentName } from './catalog.js';

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

// ---------- 신청서의 고르는 칸도 사용자가 직접 (사용자 결정 2026-10-18, D-11) ----------
// 「본인·가족」「일반·상세·특정 증명서」「보안 키보드 적용」처럼 사람마다 답이 다른 칸은 가리키지 않는다.
// 남기는 고르는 칸: 서류 종류(목록에서 고른 서류로 정해짐, catalog.js formPicks)와 약관 동의(필수만, content.js가 먼저 처리).
const CONSENT_OPTION = /동의/;
// 로그인을 실제로 하는 방법 (누른 기록에 있으면 본인 확인을 한 것). 「회원 신청하기」「비회원 신청」은 로그인 전 단계라 뺀다
const AUTH_DONE = /(공동|금융|모바일|민간)\s*인증서|간편\s*인증|모바일\s*신분증|아이디\s*로그인|QR\s*코드\s*로그인/;
const MAX_EXAMPLE = 10;

// 앞의 「•」 같은 꾸밈과 띄어쓰기를 빼고 견준다
export const compact = (s) => String(s ?? '').replace(/^[^\p{L}\p{N}]+/u, '').replace(/\s+/g, '');

export function splitChoices(candidates, picks) {
  const want = new Set((picks ?? []).map(compact));
  const list = [];
  const personal = [];
  for (const c of candidates ?? []) {
    if (c.kind === 'option' && !want.has(compact(c.label)) && !CONSENT_OPTION.test(c.label)) personal.push(c);
    else list.push(c);
  }
  return { list, personal };
}

export const authDone = (pressed) => (pressed ?? []).some((l) => String(l).length <= MAX_METHOD_LABEL && AUTH_DONE.test(l));

// 이미 그 서류 화면인데(쪽 제목에 서류 이름) 같은 이름의 메뉴 링크를 또 누르면 처음으로 돌아가고 본인 확인이 풀린다.
// 2026-10-18 전자가족관계: 간편인증 뒤 신청서에서 옆 메뉴 「혼인관계증명서」를 가리켰고, 누르자 본인 확인이 풀렸다.
// 그 링크를 이미 눌러서 왔거나 본인 확인을 한 뒤일 때만 뺀다 (처음 오는 길이면 그 링크가 맞는 길일 수 있다).
export function withoutSelfLinks(candidates, { names, title, pressed }) {
  const t = compact(title);
  const here = (names ?? []).map(compact).filter((n) => n && t.includes(n));
  if (here.length === 0) return candidates ?? [];
  const been = new Set((pressed ?? []).map(compact));
  const authed = authDone(pressed);
  return (candidates ?? []).filter((c) => {
    const name = compact(c.label);
    const nav = c.kind === 'link' || c.kind === 'button';
    return !(nav && here.includes(name) && (authed || been.has(name)));
  });
}

// 뺀 고르는 칸이 있으면 화면 위쪽 줄(stageText)에 직접 고르라고 쓴다. 예전 확장판도 이 줄을 그대로 보여 준다.
export function choiceNote(personal, pressed) {
  if (!personal?.length) return '';
  const names = [...new Set(personal.map((c) => c.label))].filter((l) => l.length <= MAX_EXAMPLE && !isDocumentName(l)).slice(0, 2);
  const what = names.length ? `${names.map((l) => `「${l}」`).join('·')} 같은 고르는 칸은` : '고르는 칸은';
  return `${authDone(pressed) ? '본인 확인이 끝났어요. ' : ''}${what} 직접 골라 주세요.`;
}

import { siteFor } from './sites.js';

// 페이지에서 모은 글자를 TypeSafe로 보내기 전에 거르는 곳.
// 원칙: 버튼·링크·칸 이름과 화면 제목만 보낸다. 개인정보로 보이는 글자는 통째로 버린다 (AGENTS.md §3 개인정보).

export const NONE_OPTION = '해당 없음';
export const MAX_CANDIDATES = 150; // Choice 선택지 상한은 255개
export const MAX_LABEL = 40;
export const MAX_DETAIL = 80;
export const MAX_HEADINGS = 5;
export const MAX_PRESSED = 8;
export const MAX_POPUP_TEXT = 160;

const KINDS = new Set(['button', 'link', 'option', 'input', 'select']);
const AREAS = new Set(['popup', 'main', 'menu']);

function squash(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

// 주민번호·전화번호·날짜(숫자 6개 이상), 이메일, "○○○님" 같은 호칭이 있으면 개인정보로 본다.
export function looksPersonal(text) {
  const s = String(text ?? '');
  const digits = s.replace(/\D/g, '').length;
  if (digits >= 6) return true;
  if (s.includes('@')) return true;
  // "홍길동님", "홍길동 님의 신청내역" 등. "고객님"처럼 이름이 아닌 것도 버려지지만 안내에는 필요 없다
  if (/[가-힣]\s?님/.test(s)) return true;
  // 주소: "서울특별시 성동구", "…로 12", "…길 3-4", "○○동 123번지"
  if (/[가-힣]+(시|도)\s*[가-힣]+(구|군)(\s|$)/.test(s)) return true;
  if (/[가-힣0-9]+(로|길)\s?\d+(-\d+)?(\s|$|번)/.test(s)) return true;
  if (/[가-힣]+동\s?\d+(-\d+)?\s?번지?/.test(s)) return true;
  return false;
}

export function cleanText(text, max) {
  const s = squash(text);
  if (!s || looksPersonal(s)) return '';
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// 호스트+경로만. 쿼리·조각은 버리고, 경로 속 ";jsessionid=…" 같은 세션 값도 버린다 (로그인 세션이 새면 안 됨)
export function stripSession(path) {
  return String(path ?? '').replace(/;[^/]*/g, '');
}

export function cleanPath(url) {
  try {
    const u = new URL(url);
    return stripSession(`${u.host}${u.pathname}`);
  } catch {
    return '';
  }
}

export function cleanHeadings(list) {
  const out = [];
  for (const h of Array.isArray(list) ? list : []) {
    const s = cleanText(h, 60);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= MAX_HEADINGS) break;
  }
  return out;
}

export function cleanPressed(list) {
  return (Array.isArray(list) ? list : [])
    .map((s) => cleanText(s, MAX_LABEL))
    .filter(Boolean)
    .slice(-MAX_PRESSED);
}

// 떠 있는 창이 열려 있으면 그 창 안의 후보만 남긴다 (먼저 그 창을 처리해야 다음으로 갈 수 있다).
// 2026-10-17 시험: 본문 후보를 함께 보내면 창 안의 "회원 신청하기"를 3번 모두 놓쳤다.
export function focusPopup(candidates) {
  const popup = candidates.filter((c) => c.area === 'popup');
  return popup.length ? popup : candidates;
}

// 같은 후보(이름과 둘째 줄이 모두 같은 것)는 처음 것만 남긴다 (content가 본문 영역을 앞에 두고 보낸다).
// 이름만 보고 합치면 「가족관계 / 증명서」와 「가족관계 / 등록부정정」이 하나가 된다. 둘째 줄을 막기(safeDetail)·이름에 합치기
// (guide.js joinShortDetail) 전에 여기서 가려야 한다. 그러고도 이름이 겹치면 joinShortDetail이 처음 것만 남긴다.
export function cleanCandidates(raw) {
  const seen = new Set();
  const out = [];
  let dropped = 0;
  for (const c of Array.isArray(raw) ? raw : []) {
    const label = cleanText(c?.label, MAX_LABEL);
    if (!label || !KINDS.has(c?.kind) || !Number.isInteger(c?.id)) {
      dropped += 1;
      continue;
    }
    const detail = cleanText(c.detail, MAX_DETAIL);
    const key = `${label}\u0000${detail}`;
    if (label === NONE_OPTION || seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: c.id,
      label,
      detail,
      kind: c.kind,
      area: AREAS.has(c.area) ? c.area : 'main',
      selected: c.selected === true,
      filled: c.filled === true,
    });
    if (out.length >= MAX_CANDIDATES) break;
  }
  return { candidates: out, dropped };
}

export const MAX_PATH = 200;

// 정부24 밖 사이트에서도 보내도 되는 버튼 둘째 줄: 이름의 일부인 짧은 서류·동작 낱말 (「가족관계 / 증명서」「제적 / 등본」「처리내역 / 확인」).
// "홍길동 (개인)"·"가나다상사"처럼 사람·회사 이름은 이 낱말로 끝나지 않아 계속 막힌다.
// (2026-10-19: 둘째 줄을 통째로 막았더니 전자가족관계 첫 화면의 카드 이름이 「가족관계」「기본」…과 「증명서」로 갈라져 AI가 못 골랐다)
// 「○○서비스」「○○센터」처럼 회사·기관 이름일 수 있는 낱말은 넣지 않는다.
const SAFE_DETAIL = /(증명서?|등본|초본|원부|대장|확인서?|확인|신청|발급|조회|안내|정정|창설|변경|신고|다운로드|전체보기|이전|다음|하기|가기|열람|인쇄|출력|방법|절차|내역|현황|목록)$/;
const SAFE_DETAIL_MAX = 12;
const safeDetail = (d) => (d && d.length <= SAFE_DETAIL_MAX && SAFE_DETAIL.test(d) ? d : '');

// 화면 정보를 밖으로 보내기 전에 거른다. 확장은 서버로 보내기 전에, 중계 서버는 받은 뒤에 같은 규칙으로 다시 한다.
// 주소가 "호스트+경로"이고 정부24인지는 호출하는 쪽(guide.js)이 확인한다.
export function cleanGuidePayload({ page, candidates, pressed }) {
  const path = stripSession(page?.path).slice(0, MAX_PATH);
  // 정부24 밖 사이트는 화면 속 글(제목 글·창 안내 글, 버튼 둘째 줄 글)을 보내지 않는다 (sites.js pageText).
  // detail(버튼·링크의 둘째 줄)에는 "홍길동 (개인)"처럼 "님" 없는 이름이 들어갈 수 있다
  const sendText = siteFor(path.split('/')[0])?.pageText !== false;
  const list = focusPopup(cleanCandidates(Array.isArray(candidates) ? candidates.slice(0, 400) : []).candidates);
  return {
    page: {
      title: cleanText(page?.title, 80),
      path,
      headings: sendText ? cleanHeadings(page?.headings) : [],
      popupText: sendText ? cleanText(page?.popupText, MAX_POPUP_TEXT) : '',
    },
    candidates: sendText ? list : list.map((c) => ({ ...c, detail: safeDetail(c.detail) })),
    pressed: cleanPressed(pressed),
  };
}

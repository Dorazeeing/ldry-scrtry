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

// 같은 이름은 처음 것만 남긴다 (content가 본문 영역을 앞에 두고 보낸다).
export function cleanCandidates(raw) {
  const seen = new Set([NONE_OPTION]);
  const out = [];
  let dropped = 0;
  for (const c of Array.isArray(raw) ? raw : []) {
    const label = cleanText(c?.label, MAX_LABEL);
    if (!label || !KINDS.has(c?.kind) || !Number.isInteger(c?.id)) {
      dropped += 1;
      continue;
    }
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({
      id: c.id,
      label,
      detail: cleanText(c.detail, MAX_DETAIL),
      kind: c.kind,
      area: AREAS.has(c.area) ? c.area : 'main',
      selected: c.selected === true,
      filled: c.filled === true,
    });
    if (out.length >= MAX_CANDIDATES) break;
  }
  return { candidates: out, dropped };
}

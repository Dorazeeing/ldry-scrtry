// 고를 수 있는 민원 목록. 어르신이 적은 말을 그대로 목표로 쓰지 않고, 이 목록에서 고른 항목만 목표가 된다.
// 출처: ① 정부24 메인(plus.gov.kr) "자주 찾는 서비스" 17개 (2026-10-17 화면에서 수집).
//          주민등록표 등본·초본은 같은 민원이지만 어르신에게는 다른 서류라 둘로 나눴다.
//       ② 정부24 공지 「정부24 서비스 대체시스템 안내」(sites.js)에 나온 서류 + 가족관계등록법 제15조의 증명서 5종.
// site: 정부24 밖 기관 사이트에서 발급하는 서류 (sites.js의 주소). 길잡이는 그 사이트에서도 뜬다.
// plain(쉬운 설명)에는 서류에 무엇이 나오는지만 쓴다. 인터넷 발급 가능 여부처럼 확인하지 않은 내용은 쓰지 않는다.
// formNote: 신청서에서 꼭 골라야 하는 것 (Jev 목표 문장에 붙음)
// names: 같은 서류의 다른 공식 표기 (목록에 있는지 확인할 때, 이미 그 서류 화면인지 볼 때 씀)
// picks: 신청서에서 서류 종류를 고르는 칸의 짧은 이름. 서류 이름·names와 같은 이름의 고르는 칸만 길잡이가 가리킨다 (handoff.js, D-11)

import { NONE_OPTION, cleanText, looksPersonal } from './sanitize.js';
import { ALLOWED_HOSTS, siteFor } from './sites.js';

export const CATALOG = [
  {
    id: 'resident_abstract',
    name: '주민등록표 초본',
    service: '주민등록표 등본(초본) 발급',
    plain: '내 주소가 바뀌어 온 기록(이사 다닌 기록)이 나오는 서류',
    names: ['주민등록초본', '주민등록등본(초본)'],
    aliases: ['초본', '주소 이력', '이사 기록', '주소 변동', '주민등록'],
    picks: ['초본'],
    formNote: 'On the application form, choose 초본, not 등본.',
  },
  {
    id: 'resident_copy',
    name: '주민등록표 등본',
    service: '주민등록표 등본(초본) 발급',
    plain: '지금 주소와 우리 집에 함께 등록된 가족이 나오는 서류',
    names: ['주민등록등본', '주민등록등본(초본)'],
    aliases: ['등본', '세대', '같이 사는 가족', '주민등록'],
    picks: ['등본'],
    formNote: 'On the application form, choose 등본, not 초본.',
  },
  { id: 'family_relation', name: '가족관계증명서', service: '가족관계증명서', plain: '부모, 배우자, 자녀 같은 가족 관계가 나오는 서류', aliases: ['가족관계', '가족 증명', '자녀', '부모'], site: 'efamily.scourt.go.kr' },
  { id: 'basic_cert', name: '기본증명서', service: '기본증명서', plain: '나의 출생, 이름 바꾼 기록 같은 기본 신분 사항이 나오는 증명서', aliases: ['기본증명', '출생', '개명'], site: 'efamily.scourt.go.kr' },
  { id: 'marriage_cert', name: '혼인관계증명서', service: '혼인관계증명서', plain: '결혼(혼인)과 이혼 기록, 배우자가 나오는 증명서', aliases: ['혼인', '결혼', '이혼', '배우자'], site: 'efamily.scourt.go.kr' },
  { id: 'adoption_cert', name: '입양관계증명서', service: '입양관계증명서', plain: '입양한 기록과 양부모·양자녀가 나오는 증명서', aliases: ['입양', '양자', '양부모'], site: 'efamily.scourt.go.kr' },
  { id: 'full_adoption_cert', name: '친양자입양관계증명서', service: '친양자입양관계증명서', plain: '친양자로 입양한 기록이 나오는 증명서', aliases: ['친양자'], site: 'efamily.scourt.go.kr' },
  { id: 'land_register', name: '토지(임야)대장', service: '토지(임야)대장', plain: '땅(산)의 위치, 넓이, 주인이 나오는 서류', aliases: ['토지', '임야', '땅', '산'] },
  { id: 'cadastral_map', name: '지적도(임야도)', service: '지적도(임야도)', plain: '땅(산)의 경계와 모양을 그린 지도', aliases: ['지적도', '임야도', '땅 지도', '경계'] },
  { id: 'building_register', name: '건축물대장', service: '건축물대장', plain: '건물(집)의 위치, 넓이, 쓰임새, 주인이 나오는 서류', aliases: ['건물', '집', '건축물', '주택'], site: 'www.eais.go.kr' },
  { id: 'car_register', name: '자동차등록원부', service: '자동차등록원부', plain: '자동차의 주인과 등록 내용이 나오는 서류', aliases: ['자동차', '차', '차량'], site: 'www.car365.go.kr' },
  { id: 'car_license_reissue', name: '자동차등록증 재발급', service: '자동차등록증 재발급', plain: '잃어버렸거나 헐어서 못 쓰는 자동차등록증(차 서류)을 다시 받는 일 (자동차등록원부를 떼는 것이 아님)', aliases: ['자동차등록증', '차량등록증', '차등록증'], site: 'www.car365.go.kr' },
  { id: 'construction_machine_register', name: '건설기계 등록원부', service: '건설기계 등록원부', plain: '굴착기, 지게차 같은 건설기계의 주인과 등록 내용이 나오는 서류', aliases: ['건설기계', '굴착기', '지게차', '중장비', '포클레인'], site: 'www.car365.go.kr' },
  { id: 'infertility_support', name: '난임부부 시술비 지원 신청', service: '난임부부 시술비 지원 신청', plain: '아이를 갖기 어려운 부부가 시술비를 지원받으려고 신청하는 일', aliases: ['난임', '시술비', '인공수정', '시험관', '아기 갖기'], site: 'www.e-health.go.kr' },
  { id: 'passport_reissue', name: '여권 재발급', service: '여권 재발급', plain: '여권을 다시 만드는 신청', aliases: ['여권', '해외', '외국'] },
  { id: 'local_tax_cert', name: '지방세 납세증명', service: '지방세 납세증명', plain: '지방세(재산세, 자동차세 등)를 밀리지 않고 냈다는 증명', aliases: ['지방세', '재산세', '자동차세', '세금'], site: 'www.wetax.go.kr' },
  { id: 'local_tax_items', name: '지방세 세목별 과세증명', service: '지방세 세목별 과세증명', plain: '재산세, 자동차세 같은 지방세가 종류별로 얼마 매겨졌는지 나오는 증명', aliases: ['과세증명', '세목별', '재산세'], site: 'www.wetax.go.kr' },
  { id: 'national_tax_cert', name: '납세증명', service: '납세증명', plain: '나라에 내는 세금(국세)을 밀리지 않고 냈다는 증명', aliases: ['납세', '국세', '세금'], site: 'www.hometax.go.kr' },
  { id: 'seal_cert', name: '인감증명서', service: '인감증명서', plain: '인감 도장이 본인 것이라는 증명', aliases: ['인감', '도장'] },
  { id: 'income_cert', name: '소득금액 증명', service: '소득금액 증명', plain: '일해서 번 돈(소득)이 얼마인지 나오는 증명', aliases: ['소득', '수입', '번 돈', '연봉'], site: 'www.hometax.go.kr' },
  { id: 'health_insurance', name: '건강보험 자격득실 확인', service: '건강보험 자격득실 확인', plain: '건강보험에 언제 가입되고 언제 잃었는지(다닌 직장 등) 나오는 서류', aliases: ['건강보험', '의료보험', '자격득실', '직장'], site: 'www.nhis.or.kr' },
  { id: 'farm_business', name: '농업경영체 등록 확인서 교부', service: '농업경영체 등록 확인서 교부', plain: '농사짓는 사람(농업경영체)으로 등록됐다는 확인서', aliases: ['농업', '농사', '농민', '농업경영체'] },
  { id: 'driving_record', name: '운전경력 증명', service: '운전경력 증명', plain: '운전면허를 가진 기간과 교통 위반·사고 기록이 나오는 증명', aliases: ['운전', '면허', '운전경력'], site: 'www.efine.go.kr' },
  // 사업자등록 두 메뉴는 전혀 다른 일이다 (2026-10-19 사용자 신고: 「재발급」을 찾아도 「증명」만 나왔다).
  // 증명 = 은행·계약 등에 내는 증명서를 떼는 일, 재발급 = 잃어버렸거나 헐어서 사업자등록증 종이를 다시 받는 일.
  { id: 'business_register', name: '사업자등록증명', service: '사업자등록증명 발급', plain: '가게나 회사를 사업자로 등록했다는 사실을 확인해 주는 증명서 (사업자등록증을 다시 받는 것이 아님)', names: ['사업자등록 증명', '사업자등록증명 발급'], aliases: ['사업자등록 증명', '사업자 증명', '사업자등록증명', '사업자', '가게 증명', '장사', '회사'] },
  { id: 'business_reissue', name: '사업자등록증 재발급', service: '사업자등록증 재발급', plain: '잃어버렸거나 헐어서 못 쓰게 된 사업자등록증(종이)을 다시 받는 일 (증명서를 떼는 것이 아님)', aliases: ['사업자등록증', '사업자 등록증', '사업자등록 재발급', '사업자 재발급', '사업자등록증 분실', '가게 등록증'] },
  { id: 'graduation_cert', name: '대학교 졸업(예정) 증명', service: '대학교 졸업(예정) 증명', plain: '대학교를 졸업했거나 졸업할 예정이라는 증명', aliases: ['졸업', '대학교', '학교'] },
  { id: 'vaccination_cert', name: '예방접종증명서', service: '예방접종증명', plain: '예방주사를 맞은 기록이 나오는 증명서', aliases: ['예방접종', '예방주사', '백신', '주사'], site: 'nip.kdca.go.kr' },
  { id: 'national_merit', name: '국가유공자 확인', service: '국가유공자 확인', plain: '국가유공자(또는 그 가족)인 것을 확인하는 서류', aliases: ['국가유공자', '보훈', '유공자'], site: 'pmp.mpva.go.kr' },
  { id: 'apartment_price', name: '공동주택 가격 확인', service: '공동주택 가격 확인', plain: '아파트 같은 공동주택에 나라가 매긴 가격(공시가격)을 확인', aliases: ['공시가격', '아파트 가격', '집값', '공동주택'], site: 'www.realtyprice.kr' },
  { id: 'social_insurance', name: '4대사회보험 가입자 내역 확인', service: '4대사회보험가입자 내역 확인', plain: '국민연금, 건강보험, 고용보험, 산재보험에 가입된 내역 확인', aliases: ['4대보험', '사대보험', '국민연금', '고용보험'], site: 'www.4insure.or.kr' },
  { id: 'military_record', name: '병적증명', service: '병적증명', plain: '군대에 다녀온 기록(병역)이 나오는 증명', aliases: ['군대', '병역', '군 복무', '제대'] },
];

const BY_ID = new Map(CATALOG.map((c) => [c.id, c]));
const BY_NAME = new Map(CATALOG.map((c) => [c.name, c]));

export const DEFAULT_GOAL_ID = 'resident_abstract';
export const MAX_QUERY = 60;
export const MAX_RESULTS = 4;
export const MIN_RESULT_PROBABILITY = 0.08;

export function findService(id) {
  return BY_ID.get(id) ?? null;
}

// 서류의 공식 이름들 (화면 제목에 이 이름이 있으면 그 서류 화면에 와 있는 것)
export function docNames(id) {
  const c = BY_ID.get(id);
  return c ? [c.name, ...(c.names ?? [])] : [];
}

// 목록에 있는 어떤 서류의 이름인지 (「등본」「기본증명서」처럼 다른 서류를 고르는 칸을 "직접 골라 주세요" 예로 들지 않으려고)
const ALL_PICKS = new Set(CATALOG.flatMap((c) => [c.name, ...(c.names ?? []), ...(c.picks ?? [])]).map((s) => s.replace(/\s+/g, '')));
export const isDocumentName = (label) => ALL_PICKS.has(String(label ?? '').replace(/\s+/g, ''));

// 신청서에서 길잡이가 가리켜도 되는 고르는 칸 이름 (서류 종류)
export function formPicks(id) {
  return [...docNames(id), ...(BY_ID.get(id)?.picks ?? [])];
}

// 길잡이가 안 뜨는 기관 사이트에서 발급하는 서류인지
function offsite(c) {
  return Boolean(c.site && !ALLOWED_HOSTS.has(c.site));
}

export function publicItem(c) {
  const item = { id: c.id, name: c.name, plain: c.plain };
  if (offsite(c)) item.offsiteName = siteFor(c.site)?.name ?? c.site;
  return item;
}

// Jev에 들어가는 목표. 목록에 있는 글만으로 만든다 (어르신이 적은 말은 들어가지 않는다).
export function goalFor(id) {
  const c = BY_ID.get(id) ?? BY_ID.get(DEFAULT_GOAL_ID);
  return {
    id: c.id,
    title: c.name,
    goal: `Use 정부24 to get "${c.name}" (${c.plain}) through the 정부24 service "${c.service}", and if it issues a document, print it on this computer.${c.formNote ? ` ${c.formNote}` : ''}${siteNote(c)}`,
    userSituation:
      'An older Korean citizen who is not used to computers. The guide never handles login or identity verification: the user does those on their own.',
  };
}

// 정부24 밖 기관 사이트에서 발급하는 서류는 그 사이트로 넘어가도 목표가 이어진다고 알려 준다
function siteNote(c) {
  const site = c.site ? siteFor(c.site) : null;
  if (!site) return '';
  return offsite(c)
    ? ` This document is issued on ${site.name} (${c.site}); 정부24 may send the user there.`
    : ` This document is issued on ${site.name} (${c.site}); 정부24 may send the user there, and the guidance continues on that site.`;
}

// 어르신이 적은 말 정리. 이름·번호처럼 보이면 보내지 않는다.
export function cleanQuery(text) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return { error: 'empty' };
  if (looksPersonal(s)) return { error: 'personal' };
  return { query: cleanText(s, MAX_QUERY) };
}

// 키가 없거나 Jev가 실패했을 때 쓰는 글자 맞추기 검색
// 거의 모든 서류 이름에 들어 있어 맞춰 봐야 소용없는 낱말
const COMMON_WORDS = new Set(['증명', '증명서', '서류', '확인', '확인서', '발급', '재발급', '신청', '등록', '교부', '대장']);

export function localSearch(query) {
  const q = query.replace(/\s+/g, '');
  const scored = [];
  for (const c of CATALOG) {
    const name = c.name.replace(/\s+/g, '');
    // 별칭은 한 글자("땅", "차")도 그대로 쓰고, 띄어 쓴 말은 두 글자 이상 낱말로도 나눠 쓴다
    const tokens = new Set([
      ...c.aliases.map((a) => a.replace(/\s+/g, '')),
      ...[c.name, ...c.aliases].flatMap((w) => w.split(' ')).filter((t) => t.length >= 2),
    ].filter((t) => !COMMON_WORDS.has(t)));
    let score = q.includes(name) ? 10 : name.includes(q) ? q.length : 0;
    for (const t of tokens) if (q.includes(t)) score += t.length;
    if (score > 0) scored.push([score, c]);
  }
  return scored
    .sort((a, b) => b[0] - a[0])
    .slice(0, MAX_RESULTS)
    .map(([, c]) => c);
}

export function buildSearchRequest(query) {
  const criteria = {};
  for (const c of CATALOG) criteria[c.name] = c.plain;
  criteria[NONE_OPTION] = 'None of the listed services matches what the user asked for.';
  return {
    model: 'jev-latest',
    state: { request: query },
    questions: {
      service: {
        type: 'choice',
        instructions: {
          question: 'Which 정부24 service is the user asking for in `request`?',
          note: 'The user is an older adult who may not know the official document name and may describe it in everyday words or by what the document shows. Some services look alike but are different: a "증명" is a certificate you ask for to show to someone else, while "재발급" means getting a lost or damaged original (such as the 사업자등록증, 자동차등록증 or 여권) issued again. Choose by what the user wants to happen, and when the request could mean two services (for example just "사업자등록증"), give both a real share of the probability.',
        },
        criteria,
      },
    },
  };
}

// 서류 이름처럼 적었는데(…증명서, …등본, …대장 등) 목록에 같은 이름이 없는지.
// 2026-10-17: "혼인관계증명서"가 목록에 없어 Jev가 가장 가까운 「가족관계증명서」(0.83)를 골랐다 → 다른 서류를 맞는 것처럼 보여 주면 안 된다.
const DOC_NAME = /(증명서?|등본|초본|대장|확인서?|원부|교부|신고|재발급|도)$/;
// 쉬운 말은 앞 낱말이 조사·말끝으로 끝난다 (「결혼한 거 증명」「소득이 없다는 증명」). 정식 서류 이름은 그렇지 않다 (「제적 등본」「주민등록 초본」)
const CASUAL_WORD = /(은|는|이|가|을|를|한|던|거)$/;

export function namedButMissing(query) {
  const q = query.replace(/\s+/g, '');
  if (!DOC_NAME.test(q) || q.length < 4) return false;
  // 2026-10-18: 「결혼한 거 증명」처럼 쉬운 말이 「증명」으로 끝난다고 "목록에 없어요"를 띄우면, 맞는 서류를 찾고도 어르신이 헷갈린다
  if (query.trim().split(/\s+/).slice(0, -1).some((w) => CASUAL_WORD.test(w))) return false;
  return !CATALOG.some((c) =>
    nameVariants(c).some((v) => v.length >= 2 && (q.includes(v) || v.includes(q))),
  );
}

// "토지(임야)대장" → 토지(임야)대장, 토지대장, 임야대장. 별칭은 쓰지 않는다 ("제적등본"이 별칭 "등본"에 걸리면 안 됨)
function nameVariants(c) {
  return [c.name, ...(c.names ?? [])].flatMap((n) => {
    const name = n.replace(/\s+/g, '');
    return [name, name.replace(/\([^)]*\)/g, ''), name.replace(/[^()]*\(([^)]*)\)/, '$1')];
  });
}

// 확률 순으로 여러 개를 돌려준다 (어르신이 그중에서 고른다). "해당 없음"은 빼고, 너무 낮은 것도 뺀다.
export function pickServices(response) {
  const probs = response?.answers?.service?.probabilities ?? {};
  return Object.entries(probs)
    .filter(([name, p]) => name !== NONE_OPTION && p >= MIN_RESULT_PROBABILITY && BY_NAME.has(name))
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_RESULTS)
    .map(([name]) => BY_NAME.get(name));
}

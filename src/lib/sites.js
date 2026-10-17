// 사이트 목록. active: true인 곳에서만 길잡이가 뜬다 (manifest.json matches).
// 2026-10-17 사용자 결정(D-9, D-8을 바꿈): 공개판은 정부24와 아래 기관 사이트 12곳 전부.
// pageText: false인 곳은 화면 속 글(제목 글·창 안내 글)을 서버로 보내지 않는다 — 버튼·칸 이름과 화면 제목, 주소만 보낸다.
//   (홈택스·건강보험처럼 로그인 뒤 개인 정보가 화면에 나오는 사이트라서. 정부24는 시험으로 확인한 만큼만 보낸다.)
// 출처: 정부24 공지 「정부24 서비스 대체시스템 안내」(2023.11.18, https://www.gov.kr/portal/ntcItm/98507)
//       "아래 증명서의 경우 정부24외 개별시스템을 이용하여 발급 가능합니다" 목록 (2026-10-17 확인).
// 이 공지는 "정부24가 안 될 때 쓰는 대체 사이트"를 알려 준다. 정부24 신청 중에 실제로 그 사이트로 넘어가는지는 서류마다 사람이 확인해야 한다.
// 공지의 "대학 재학·졸업·성적 증명서: 각 대학교 웹사이트"는 주소를 정할 수 없어 넣지 않았다.
// manifest.json의 content_scripts.matches는 이 목록과 같아야 한다 (npm run check가 검사).

export const SITES = [
  { hosts: ['www.gov.kr', 'plus.gov.kr'], name: '정부24', documents: ['(모든 정부24 민원)'], active: true },
  {
    hosts: ['efamily.scourt.go.kr'],
    name: '대법원 전자가족관계등록시스템',
    documents: ['가족관계증명서', '기본증명서', '혼인관계증명서', '입양관계증명서', '친양자입양관계증명서'],
    active: true,
    pageText: false,
    note: '공지 원문: "주민등록번호 확인이 필요한 증명서는 가족관계증명서로 대체 가능". 서류 5종은 가족관계의 등록 등에 관한 법률 제15조의 증명서 종류',
  },
  { hosts: ['www.car365.go.kr'], name: '자동차365', documents: ['자동차등록원부', '건설기계 등록원부', '자동차등록증 재발급'], active: true, pageText: false },
  { hosts: ['www.eais.go.kr'], name: '세움터', documents: ['건축물대장'], active: true, pageText: false },
  { hosts: ['nip.kdca.go.kr'], name: '예방접종도우미(질병보건통합)', documents: ['예방접종증명서'], active: true, pageText: false },
  { hosts: ['www.hometax.go.kr', 'hometax.go.kr'], name: '국세청 홈택스', documents: ['납세증명', '소득금액증명', '부가가치세 과세표준증명 등'], active: true, pageText: false },
  { hosts: ['www.efine.go.kr'], name: '경찰 민원포털', documents: ['운전경력증명서 등'], active: true, pageText: false },
  { hosts: ['www.nhis.or.kr'], name: '국민건강보험공단', documents: ['건강보험 자격득실 확인서 등'], active: true, pageText: false },
  { hosts: ['www.wetax.go.kr'], name: '위택스', documents: ['지방세 납세증명', '지방세 세목별 과세증명 등'], active: true, pageText: false },
  { hosts: ['pmp.mpva.go.kr'], name: '나만의 예우(국가보훈부)', documents: ['국가유공자 확인'], active: true, pageText: false },
  { hosts: ['www.realtyprice.kr', 'realtyprice.kr'], name: '부동산공시가격알리미', documents: ['공동주택 가격 확인'], active: true, pageText: false },
  { hosts: ['www.e-health.go.kr'], name: 'e보건소', documents: ['난임부부 시술비 지원 신청'], active: true, pageText: false },
  { hosts: ['www.4insure.or.kr'], name: '4대사회보험정보연계센터', documents: ['4대사회보험 가입자 내역 확인'], active: true, pageText: false },
];

const ACTIVE = SITES.filter((s) => s.active);
export const ALLOWED_HOSTS = new Set(ACTIVE.flatMap((s) => s.hosts));

export function siteFor(host) {
  return SITES.find((s) => s.hosts.includes(host)) ?? null;
}

// manifest.json content_scripts.matches 와 같은 모양
export const MATCHES = ACTIVE.flatMap((s) => s.hosts.map((h) => `https://${h}/*`));

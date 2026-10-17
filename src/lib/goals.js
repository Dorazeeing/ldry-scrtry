// 화면 단계. 목표(무엇을 떼는지)는 catalog.js의 goalFor()가 만든다.
// state 문장은 Jev에 그대로 들어가므로 개인정보를 넣지 않는다.

// pageStage 질문의 선택지. 키는 화면에 그대로 보여 줄 단계 이름이다.
export const STAGES = {
  '민원 찾기': 'A home, search or list page where the user still has to find the service in `goal`.',
  '민원 안내': 'The information page of the service in `goal`, which has the button that starts an application.',
  로그인: 'A page or window for choosing a login or authentication method (such as 공동인증서, 금융인증서, 간편인증) or otherwise proving identity, even if it also has name or ID-number fields.',
  '약관 동의': 'A page asking the user to agree to terms or to the use of personal information.',
  '신청서 작성': 'An application form for choosing what the document includes and how it is received. Not a page whose main step is proving identity with an authentication method.',
  '신청 완료·인쇄': 'A page after applying, where the user opens, views or prints the issued document.',
  '프로그램 설치': 'A page asking the user to install a security or printing program.',
  '관련 없는 화면': 'A page unrelated to the service in `goal`.',
};

// 단계별로 어르신에게 보여 줄 한 줄 설명
export const STAGE_TEXT = {
  '민원 찾기': '지금은 민원을 찾는 화면이에요.',
  '민원 안내': '찾는 민원의 안내 화면이에요.',
  로그인: '본인 확인(로그인)을 하는 화면이에요.',
  '약관 동의': '약관에 동의하는 화면이에요.',
  '신청서 작성': '신청서를 고르는 화면이에요.',
  '신청 완료·인쇄': '신청이 끝났어요. 이제 문서를 열어 인쇄하면 돼요.',
  '프로그램 설치': '인쇄에 필요한 프로그램을 설치하라는 화면이에요.',
  '관련 없는 화면': '찾는 민원과 상관없는 화면 같아요.',
};

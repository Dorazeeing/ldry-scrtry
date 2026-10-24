// 페이지 쪽 (격리된 공간에서 실행, 페이지와 DOM만 공유). 키는 여기 없다.
// 하는 일: 보이는 버튼·링크·칸 이름 모으기 → background에 "다음에 누를 곳" 묻기 → 빨간 테두리와 안내 창 그리기.
// 직접 누르거나 입력하지 않는다. 입력 칸의 값은 읽지 않고 "채워졌는지"만 본다.

(() => {
  if (window.top !== window || window.__gvrnmnt24Guide) return;
  window.__gvrnmnt24Guide = true;

  const CONTROL_SELECTOR = [
    'a[href]',
    'button',
    '[role="button"]',
    '[role="tab"]',
    '[role="link"]',
    '[role="menuitem"]',
    // 그림으로 꾸민 체크칸·고르는 칸(진짜 input 없이 aria-checked로 표시). 약관 동의에 쓰는 사이트가 있다 (참고: chy4pro/jev-for-chrome, MIT)
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="switch"]',
    'summary',
    'input[type="button"]',
    'input[type="submit"]',
    'input[type="radio"]',
    'input[type="checkbox"]',
    'input[type="text"]',
    'input[type="tel"]',
    'input[type="number"]',
    'input[type="search"]',
    'input[type="password"]',
    'input:not([type])',
    'select',
    'textarea',
  ].join(',');
  const MENU_AREA =
    'header, footer, nav, [role="banner"], [role="contentinfo"], [role="navigation"], #header, #footer, .header, .footer, #gnb, .gnb';
  const DIALOG = '[role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog[open]';
  const LAYER_HINT = '[id*="popup" i], [id*="layer" i], [class*="pop" i], [class*="layer" i], [class*="modal" i]';
  const MAX_SEND = 150;
  const SETTLE_MS = 700;
  const AFTER_CLICK_MS = 900;
  const MUTATION_GAP_MS = 5000; // 가리킬 곳이 없을 때 배너 회전 등으로 너무 자주 묻지 않게
  const MAX_DEFER_MS = 3000;
  const RANK = { mutation: 0, load: 1, navigation: 1, click: 1, change: 1, manual: 2 };

  let state = null;
  let elements = new Map(); // id → 테두리로 감쌀 요소들 (선택지는 체크박스+이름)
  const labelOf = new WeakMap(); // 요소 → 후보 이름 (누른 기록용)
  let lastSignature = '';
  let lastResult = null;
  let lastFailed = false; // 마지막 물음이 오류였는지 (오류 뒤에는 배너 회전 같은 변화로 다시 묻지 않는다)
  let lastUrl = location.href;
  let lastDialog = false;
  let targets = []; // [{ els, tag, side, ring, tagEl }] — 약관 화면에서는 여러 곳을 한 번에 표시
  let asking = false;
  let lastAskAt = 0;
  let queued = null;
  let timer = 0;
  let pendingReason = null;
  let pendingSince = 0;
  let collapsed = false;
  let spoken = '';
  // 가리킨 곳(버튼·링크)을 누른 직후의 화면. 다음에 볼 때 그대로인지 견준다 (참고: chy4pro/jev-for-chrome, MIT)
  let clickWatch = null; // { label, signature, url, dialog, left }
  const NOT_STUCK = { label: '', signature: '', count: 0 };
  let stuck = NOT_STUCK; // 같은 곳을 눌렀는데 같은 화면 그대로였던 횟수 (연달아)

  // ---------- 화면 (Shadow DOM, 페이지 CSS와 격리) ----------

  const host = document.createElement('gvrnmnt24-guide');
  host.style.cssText = 'all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;';
  // open: 안내 문구에 비밀이 없고, 자동 시험(scripts/smoke.mjs)이 안을 들여다볼 수 있어야 한다
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      .ring { position: fixed; display: none; border: 6px solid #b00000; border-radius: 10px;
        box-shadow: 0 0 0 4px #ffffff, 0 0 0 12px rgba(176, 0, 0, 0.35); pointer-events: none; }
      .tag { position: fixed; display: none; background: #b00000; color: #ffffff; pointer-events: none;
        font: 700 22px/1.3 -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif;
        padding: 8px 14px; border-radius: 10px; white-space: nowrap; }
      .panel, .pill { pointer-events: auto;
        font: 400 22px/1.5 -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif;
        color: #111111; word-break: keep-all; }
      .panel { position: fixed; right: 16px; bottom: 16px; width: 440px; max-height: calc(100vh - 32px); overflow: auto;
        background: #ffffff; border: 3px solid #1d3faf; border-radius: 16px; padding: 20px;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25); display: flex; flex-direction: column; gap: 16px; }
      .panel.left { right: auto; left: 16px; }
      .head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
      .head strong { font-size: 24px; color: #1d3faf; }
      p { margin: 0; }
      .stage { font-weight: 700; }
      .stage:empty { display: none; }
      .msg { font-size: 24px; font-weight: 700; }
      .note { font-size: 20px; color: #333333; }
      .goals, .actions { display: flex; flex-direction: column; gap: 16px; }
      .goals:empty { display: none; }
      .row { display: flex; gap: 16px; }
      .row button { flex: 1 1 0; }
      button { font: inherit; font-weight: 700; min-height: 56px; padding: 8px 18px; border-radius: 12px; cursor: pointer;
        border: 3px solid #1d3faf; background: #ffffff; color: #1d3faf; }
      button.primary { background: #1d3faf; color: #ffffff; }
      button:focus-visible { outline: 4px solid #111111; outline-offset: 3px; }
      button[hidden] { display: none; }
      .pill { position: fixed; right: 16px; bottom: 16px; display: none; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25); }
      .collapsed .panel { display: none; }
      .collapsed .pill { display: block; }
      .consent { display: flex; flex-direction: column; gap: 12px; }
      .consent[hidden] { display: none; }
      .consent ul { margin: 0; padding-left: 24px; font-size: 20px; }
      .consent li { margin-bottom: 8px; }
      .copy-note { font-size: 20px; font-weight: 700; color: #0b5e2a; }
      .copy-note:empty { display: none; }
      .goal-line { font-size: 20px; color: #1d3faf; font-weight: 700; }
      .goal-line:empty { display: none; }
      .find { display: flex; flex-direction: column; gap: 12px; }
      .find[hidden] { display: none; }
      .find label { font-size: 20px; }
      .find input { font: inherit; width: 100%; min-height: 56px; padding: 0 14px; color: #111111;
        border: 3px solid #5a6270; border-radius: 12px; background: #ffffff; }
      .find input:focus-visible { outline: 4px solid #111111; outline-offset: 2px; }
      button.choice { text-align: left; display: flex; flex-direction: column; gap: 4px; }
      button.choice span { font-weight: 400; font-size: 20px; color: #333333; }
      @media (max-width: 600px) { .panel { left: 16px; right: 16px; width: auto; } }
    </style>
    <div class="wrap">
      <div class="marks"></div>
      <section class="panel" role="region" aria-label="민원 길잡이 (비공식)">
        <div class="head"><strong>민원 길잡이 (비공식)</strong><button type="button" data-act="collapse">작게 접기</button></div>
        <p class="goal-line"></p>
        <p class="stage"></p>
        <p class="msg" aria-live="polite"></p>
        <button type="button" class="primary" data-act="copy" hidden></button>
        <p class="copy-note" aria-live="polite"></p>
        <button type="button" data-act="goto" hidden></button>
        <div class="consent" hidden>
          <ul>
            <li>길잡이는 <b>정부24</b>와 서류를 내려받는 <b>기관 사이트</b>(국세청 홈택스, 건강보험, 가족관계등록시스템 등)에서 켜져요.</li>
            <li>길잡이는 지금 보시는 화면의 <b>버튼과 칸 이름, 쪽 주소</b>를 서버(싱가포르)로 보내요.</li>
            <li>서버는 이것을 AI 서비스(TypeSafe, 서버가 미국에 있어요)에게 물어서 다음에 누를 곳을 알려 드려요. TypeSafe는 보낸 내용으로 AI를 학습시키지 않는다고 밝히고 있어요.</li>
            <li>칸에 <b>적은 내용</b>(이름·주민번호 등)은 읽지도 보내지도 않아요. 개인정보로 보이는 글자는 빼고 보내요.</li>
            <li>찾는 서류를 <b>적거나 말하면</b> 그 말도 서버로 가요. 「말로 하기」는 소리를 크롬(구글)이 글자로 바꿔 줘요.</li>
            <li>서버는 보낸 내용을 저장하지 않아요. 서버 운영 회사(Railway)에는 접속 기록(주소·IP 등)이 일정 기간 남아요.</li>
            <li>AI가 틀릴 수 있어요. 누르기 전에 꼭 눈으로 확인해 주세요.</li>
          </ul>
          <button type="button" class="primary" data-act="consent">동의하고 시작하기</button>
          <button type="button" data-act="decline">동의하지 않아요</button>
        </div>
        <div class="find" hidden>
          <label for="gvrnmnt24-query">떼고 싶은 서류나 하고 싶은 일을 쉬운 말로 적어 주세요.</label>
          <input id="gvrnmnt24-query" type="text" autocomplete="off" placeholder="예) 이사 다닌 기록이 나오는 서류">
          <div class="row">
            <button type="button" data-act="listen">말로 하기</button>
            <button type="button" class="primary" data-act="search">찾기</button>
          </div>
        </div>
        <div class="goals"></div>
        <button type="button" data-act="list" hidden>목록에서 직접 고르기</button>
        <div class="actions">
          <div class="row">
            <button type="button" data-act="speak">소리로 듣기</button>
            <button type="button" data-act="rescan">다시 찾기</button>
          </div>
          <button type="button" data-act="stop">안내 끝내기</button>
        </div>
        <p class="note">길잡이는 알려 주기만 해요. 누르고 적는 것은 직접 해 주세요. AI가 틀릴 수 있으니 눈으로 꼭 확인해 주세요.</p>
      </section>
      <button type="button" class="pill primary" data-act="expand">민원 길잡이 열기</button>
    </div>`;
  const ui = {
    wrap: root.querySelector('.wrap'),
    marks: root.querySelector('.marks'),
    panel: root.querySelector('.panel'),
    goalLine: root.querySelector('.goal-line'),
    consent: root.querySelector('.consent'),
    find: root.querySelector('.find'),
    query: root.querySelector('#gvrnmnt24-query'),
    listen: root.querySelector('[data-act="listen"]'),
    list: root.querySelector('[data-act="list"]'),
    stage: root.querySelector('.stage'),
    msg: root.querySelector('.msg'),
    copy: root.querySelector('[data-act="copy"]'),
    copyNote: root.querySelector('.copy-note'),
    goto: root.querySelector('[data-act="goto"]'),
    goals: root.querySelector('.goals'),
    rescan: root.querySelector('[data-act="rescan"]'),
    stop: root.querySelector('[data-act="stop"]'),
  };
  document.documentElement.appendChild(host);

  const ERROR_TEXT = {
    timeout: '대답이 늦어지고 있어요. 「다시 찾기」를 눌러 주세요.',
    network: '인터넷 연결을 확인한 뒤 「다시 찾기」를 눌러 주세요.',
    extension: '길잡이가 새로 설치됐어요. 화면을 새로고침해 주세요.',
    empty: '찾을 말을 먼저 적어 주세요.',
    personal: '이름이나 번호 같은 개인정보는 적지 말아 주세요. 서류 이름이나 하고 싶은 일만 적어 주세요.',
    unknown_goal: '고르신 서류가 지금은 길잡이 목록에 없어요. 안내를 끝냈어요. 다시 찾아서 골라 주세요.',
  };
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  // 인증 창처럼 떠 있는 iframe 안은 읽을 수 없다. 창 안에서 흔히 하는 순서를 고정 문구로 알려 준다 (서버로 보내지 않는다).
  const FRAME_HELP =
    '창이 열렸어요. 창 안은 길잡이가 볼 수 없어요. 창에 적힌 대로 직접 해 주세요. 보통은 ① 쓰는 인증 앱 고르기 ② 이름·생년월일·휴대폰 번호 적기 ③ 「필수」 동의에 체크 ④ 「인증 요청」 누르기예요.';
  // 로그인·회원/비회원·인증 방법 고르기는 사용자가 직접 한다 (테두리를 끄고 안내만, D-10)
  const HANDOFF_TEXT =
    '여기서부터는 직접 골라 주세요. 회원·비회원, 간편인증, 인증서 중에서 편한 방법을 고르시면 돼요. 로그인이 끝나면 길잡이가 다시 이어서 알려 드려요.';
  const ACTION_TEXT = {
    button: (l) => `「${l}」 버튼을 누르세요.`,
    link: (l) => `「${l}」 글자를 누르세요.`,
    option: (l) => `「${l}」 항목을 고르세요.`,
    input: (l) => `「${l}」 칸에 알맞게 적어 주세요.`,
    select: (l) => `「${l}」 목록에서 알맞은 것을 골라 주세요.`,
  };
  // 가리킨 버튼을 두 번 눌러도 화면이 그대로일 때 (새 창이 막혔거나 화면이 늦게 바뀜). 「팝업」은 크롬 화면에 보이는 말 그대로 쓴다
  const NO_CHANGE_TEXT = (l) =>
    `「${l}」을(를) 눌렀는데 화면이 그대로예요. 새 창이 막혔을 수 있어요. 주소창 오른쪽 끝에 창이 막혔다는 표시(팝업 차단)가 보이면 눌러서 「항상 허용」을 고른 뒤 다시 눌러 주세요. 잠시 기다려도 그대로면 가족이나 정부24 고객센터(1588-2188)에 물어봐 주세요.`;

  // copy: 검색 칸에 넣을 글자. 있으면 「… 글자 복사하기」 단추를 보여 준다 (사용자가 직접 붙여 넣는다)
  function show({ stage = '', msg = '', guiding = true, copy = '' }) {
    ui.stage.textContent = stage;
    ui.msg.textContent = msg;
    ui.copy.hidden = !copy;
    ui.copy.dataset.text = copy;
    ui.copy.textContent = copy ? `「${copy}」 글자 복사하기` : '';
    ui.copyNote.textContent = '';
    ui.goto.hidden = true; // 「바로 가기」는 찾는 단계에서만 다시 띄운다 (offerGoto)
    ui.rescan.hidden = !guiding;
    ui.stop.hidden = !guiding;
    ui.goalLine.textContent = state?.active && state.goalTitle ? `찾는 것: ${state.goalTitle}` : '';
    spoken = [stage, msg].filter(Boolean).join(' ');
  }

  // 시작 화면: 쉬운 말로 적기(또는 말하기) → 목록에서 찾기 → 고르기. 적은 말은 목표가 되지 않는다.
  function renderStart() {
    clearTarget();
    ui.goals.replaceChildren();
    ui.list.hidden = true;
    // 동의하기 전에는 아무것도 서버로 보내지 않는다
    if (!state?.consented) {
      ui.find.hidden = true;
      ui.consent.hidden = false;
      show({ msg: '처음 쓰시기 전에 알려 드려요.', guiding: false });
      // 「소리로 듣기」가 동의 문구 전체를 읽도록 한다
      spoken = [ui.msg.textContent, ...[...ui.consent.querySelectorAll('li')].map((li) => li.textContent)].join(' ');
      return;
    }
    ui.consent.hidden = true;
    ui.find.hidden = false;
    ui.listen.hidden = !SpeechRec;
    show({ msg: '무엇을 하러 오셨어요?', guiding: false });
  }

  function renderChoices(items, msg) {
    ui.goals.replaceChildren();
    for (const it of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'choice';
      const name = document.createElement('strong');
      name.textContent = it.name;
      const plain = document.createElement('span');
      plain.textContent = it.offsiteName
        ? `${it.plain} — 도중에 ${it.offsiteName} 사이트로 넘어가요. 그 사이트에서는 길잡이가 뜨지 않아요.`
        : it.plain;
      b.append(name, plain);
      b.addEventListener('click', () => start(it.id));
      ui.goals.append(b);
    }
    show({ msg, guiding: false });
    spoken = [msg, ...items.map((it) => it.name)].join(' ');
  }

  function needConsent() {
    state = { ...state, consented: false, active: false };
    renderStart();
  }

  // 고른 서류가 길잡이 목록에 없다 (서버 목록에서 빠졌거나 처음부터 모르는 id). background가 안내를 껐으므로
  // 처음 화면(찾기)으로 돌아가 다시 고르게 한다
  function goalGone() {
    state = { ...state, active: false };
    lastSignature = '';
    lastResult = null;
    renderStart();
    show({ msg: ERROR_TEXT.unknown_goal, guiding: false });
  }

  async function acceptConsent() {
    const next = await send({ type: 'consent/accept' });
    if (next?.kind === 'error') return apply(next);
    state = next;
    renderStart();
  }

  function declineConsent() {
    ui.consent.hidden = true;
    ui.goals.replaceChildren();
    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'primary';
    again.textContent = '동의 내용 다시 보기';
    again.addEventListener('click', renderStart);
    ui.goals.append(again);
    show({ msg: '동의하지 않으셨어서 길잡이를 켜지 않았어요. 마음이 바뀌시면 아래 버튼을 눌러 주세요.', guiding: false });
  }

  async function search() {
    ui.goals.replaceChildren();
    show({ msg: '목록에서 찾고 있어요…', guiding: false });
    const res = await send({ type: 'catalog/search', query: ui.query.value });
    ui.list.hidden = false;
    if (res?.kind === 'error' && res.code === 'no_consent') return needConsent();
    if (res?.kind !== 'results') {
      show({ msg: res?.message ?? ERROR_TEXT[res?.code] ?? '잠깐 문제가 생겼어요. 다시 찾아 주세요.', guiding: false });
      return;
    }
    if (res.missing) {
      renderChoices(
        res.items,
        `「${res.query}」은(는) 아직 길잡이 목록에 없어요.${res.items.length ? ' 비슷한 것은 아래에 있어요. 찾는 서류가 맞는지 꼭 확인해 주세요.' : ''} 맞는 것이 없으면 가족이나 정부24 고객센터(1588-2188)에 물어봐 주세요.`,
      );
      return;
    }
    renderChoices(
      res.items,
      res.items.length ? '이 중에서 골라 주세요.' : '맞는 것을 못 찾았어요. 다르게 적어 보거나 목록에서 직접 골라 주세요.',
    );
  }

  async function showList() {
    const res = await send({ type: 'catalog/list' });
    if (res?.kind === 'results') renderChoices(res.items, '목록에서 골라 주세요.');
    ui.list.hidden = true;
  }

  // 크롬 음성 인식 (말소리는 크롬이 처리한다). 안 되면 글자로 적으면 된다.
  function listen() {
    if (!SpeechRec) return;
    const rec = new SpeechRec();
    rec.lang = 'ko-KR';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    ui.listen.textContent = '듣고 있어요… 말씀하세요';
    rec.onresult = (e) => {
      ui.query.value = e.results[0][0].transcript;
      search();
    };
    rec.onerror = () => show({ msg: '잘 못 들었어요. 다시 「말로 하기」를 누르거나 글자로 적어 주세요.', guiding: false });
    rec.onend = () => {
      ui.listen.textContent = '말로 하기';
    };
    try {
      rec.start();
    } catch {
      rec.onend();
    }
  }

  function speak() {
    if (!spoken || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(spoken);
    u.lang = 'ko-KR';
    u.rate = 0.9;
    speechSynthesis.speak(u);
  }

  // ---------- 테두리 ----------

  // ---------- 글자 복사 (검색 칸에 붙여 넣을 서류 이름) ----------
  // 길잡이는 칸에 대신 적지 않는다. 사용자가 단추를 눌러 복사하고, 직접 칸에 붙여 넣는다.
  // userAgentData.platform은 "macOS", navigator.platform은 "MacIntel" → 대소문자를 가리지 않는다
  const PASTE_KEYS = /mac|iphone|ipad/i.test(navigator.userAgentData?.platform || navigator.platform || '') ? '⌘(커맨드)+V' : 'Ctrl+V';
  async function copyText(text) {
    if (!text) return;
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      // 클립보드 권한이 막힌 화면: 잠깐 만든 칸을 골라서 복사한다 (누른 직후라 허용된다)
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.cssText = 'position: fixed; left: -9999px; top: 0; opacity: 0;';
      document.body.appendChild(area);
      area.select();
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      area.remove();
    }
    ui.copyNote.textContent = ok
      ? `복사했어요. 빨간 테두리 검색 칸을 한 번 누르고 ${PASTE_KEYS}를 누르세요. (마우스 오른쪽 단추 → 「붙여넣기」도 돼요)`
      : `복사가 안 됐어요. 검색 칸에 「${text}」를 직접 적어 주세요.`;
    spoken = ui.copyNote.textContent;
  }

  function clearTarget() {
    targets = [];
    ui.marks.replaceChildren();
  }

  // 안내 창 자리: 기본은 오른쪽 아래. 지금 자리에서 표시할 곳(테두리·글)을 가릴 때만 반대쪽으로 옮기고, 그 밖에는 움직이지 않는다.
  // 반대쪽도 가리면 그대로 둔다. 좁은 화면(600px 이하)에서는 창이 화면 폭을 다 쓰므로 옮기지 않는다.
  function avoidCovering(rects) {
    if (innerWidth <= 600 || !rects.length) return;
    const covers = (p) => rects.some((r) => !(r.right < p.left || r.left > p.right || r.bottom < p.top || r.top > p.bottom));
    if (!covers(ui.panel.getBoundingClientRect())) return;
    const wasLeft = ui.panel.classList.contains('left');
    ui.panel.classList.toggle('left', !wasLeft);
    if (covers(ui.panel.getBoundingClientRect())) ui.panel.classList.toggle('left', wasLeft);
  }

  const shown = (els) => els.some((e) => e.isConnected && isClickable(e));
  const targetsShown = () => targets.length > 0 && targets.every((t) => shown(t.els));

  // 여러 요소(체크박스와 그 이름)를 감싸는 사각형. 너무 떨어져 있으면 마지막 것(이름)만 쓴다
  // DOMRect는 펼치면({...r}) 값이 사라진다(속성이 객체 자체에 없음) → 숫자만 꺼내 쓴다.
  // 2026-10-17: 이걸 놓쳐 테두리가 화면 왼쪽 위 구석에 그려지고, 안내 창이 가리키는 버튼을 덮었다.
  function boxOf(els) {
    const rects = els
      .filter((e) => e.isConnected && isVisible(e))
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
      });
    const u = rects.reduce((a, r) => ({
      left: Math.min(a.left, r.left),
      top: Math.min(a.top, r.top),
      right: Math.max(a.right, r.right),
      bottom: Math.max(a.bottom, r.bottom),
    }));
    const tallest = Math.max(...rects.map((r) => r.height));
    if (u.bottom - u.top > tallest * 3) return rects.at(-1);
    return { ...u, width: u.right - u.left, height: u.bottom - u.top };
  }

  function place() {
    if (!targets.length) return;
    if (!targetsShown()) {
      clearTarget();
      show({ msg: '화면이 바뀌었어요. 다음에 누를 곳을 다시 찾고 있어요…' });
      schedule('navigation');
      return;
    }
    const pad = 8;
    const marks = [];
    for (const t of targets) {
      const r = boxOf(t.els);
      Object.assign(t.ring.style, {
        display: 'block',
        left: `${r.left - pad}px`,
        top: `${r.top - pad}px`,
        width: `${r.width + pad * 2}px`,
        height: `${r.height + pad * 2}px`,
      });
      t.tagEl.style.display = 'block';
      const tagH = t.tagEl.offsetHeight || 44;
      if (t.side === 'right') {
        // 세로로 붙어 있는 여러 칸: 글을 오른쪽에 붙여 서로 겹치지 않게
        t.tagEl.textContent = `◀ ${t.tag}`;
        t.tagEl.style.left = `${Math.min(r.right + pad + 12, innerWidth - t.tagEl.offsetWidth - 8)}px`;
        t.tagEl.style.top = `${r.top + r.height / 2 - tagH / 2}px`;
      } else {
        const above = r.top - pad - tagH - 12 > 0;
        t.tagEl.textContent = above ? `${t.tag} ▼` : `▲ ${t.tag}`;
        t.tagEl.style.left = `${Math.max(8, Math.min(r.left - pad, innerWidth - t.tagEl.offsetWidth - 8))}px`;
        t.tagEl.style.top = above ? `${r.top - pad - tagH - 12}px` : `${r.bottom + pad + 12}px`;
      }
      const glow = pad + 12; // 테두리 바깥 그림자까지
      marks.push({ left: r.left - glow, top: r.top - glow, right: r.right + glow, bottom: r.bottom + glow });
      marks.push(t.tagEl.getBoundingClientRect());
    }
    avoidCovering(marks);
  }

  // list: [{ els, tag, side }] — tag는 테두리에 붙는 글 ("여기를 누르세요", "필수"), side: 'right'면 오른쪽에
  function pointTo(list) {
    clearTarget();
    targets = list.map(({ els, tag, side }) => {
      const ring = document.createElement('div');
      ring.className = 'ring';
      const tagEl = document.createElement('div');
      tagEl.className = 'tag';
      ui.marks.append(ring, tagEl);
      return { els, tag, side, ring, tagEl };
    });
    const r = boxOf(targets[0].els);
    if (r.top < 0 || r.bottom > innerHeight) {
      const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
      targets[0].els.find((e) => isVisible(e))?.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
    }
    place();
  }

  // ---------- 후보 모으기 ----------

  function isVisible(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    return !clippedOut(el, r);
  }

  // ---------- 가려진 것은 누를 수 없다 ----------
  // 인증 창·어두운 막이 뜨면 뒤의 버튼은 눈에는 보여도 눌리지 않는다. 그걸 가리키면 안 된다.
  // (2026-10-17 정부24 로그인: 「간편인증」을 누르자 인증 창이 떴는데, 가려진 카드에 테두리가 그대로 남았다)
  // 길잡이 창(host)은 건너뛴다 — 우리 창 밑에 있는 버튼까지 "가려졌다"고 하면 안 된다.
  function topAt(x, y) {
    return document.elementsFromPoint(x, y).find((e) => e !== host && !host.contains(e)) ?? null;
  }

  // 두 줄로 감긴 링크는 전체 상자의 가운데 줄이 줄 사이(옆 글)에 걸려 "가려졌다"고 잘못 본다
  // (2026-10-24 재현: 옆 글에 바탕색·여백이 있으면 줄 높이·폭 50가지 중 11가지). 화면 안에 보이는 첫 조각으로 본다 (참고: chy4pro/jev-for-chrome, MIT)
  function isCovered(el) {
    const parts = [...el.getClientRects()].filter((p) => p.width >= 2 && p.height >= 2);
    const r = parts.find((p) => p.bottom > 0 && p.top < innerHeight) ?? parts[0] ?? el.getBoundingClientRect();
    const left = Math.max(r.left, 0);
    const right = Math.min(r.right, innerWidth);
    const top = Math.max(r.top, 0);
    const bottom = Math.min(r.bottom, innerHeight);
    if (right - left < 2 || bottom - top < 2) return false; // 화면 밖: 스크롤하면 보인다
    const y = (top + bottom) / 2;
    let covered = 0;
    for (const x of [(left + right) / 2, left + (right - left) * 0.2, left + (right - left) * 0.8]) {
      const t = topAt(x, y);
      // 맨 위가 나 자신, 내 안쪽, 내 바깥쪽(감싸는 칸)이면 가려진 게 아니다
      if (t && !(t === el || el.contains(t) || t.contains(el))) covered += 1;
    }
    return covered >= 2; // 세 점 중 둘 이상 (고정 머리글이 살짝 걸친 정도는 봐준다)
  }

  const isClickable = (el) => isVisible(el) && !isCovered(el);

  // 인증 창처럼 화면 위에 떠서 가운데를 덮은 iframe. 안은 길잡이가 읽을 수 없다.
  function coveringFrame() {
    for (const [fx, fy] of [[0.5, 0.5], [0.35, 0.5], [0.65, 0.5], [0.5, 0.4], [0.5, 0.65]]) {
      const t = topAt(innerWidth * fx, innerHeight * fy);
      if (t?.tagName !== 'IFRAME') continue;
      const r = t.getBoundingClientRect();
      if (r.width * r.height < innerWidth * innerHeight * 0.15) continue; // 작은 광고 틀 같은 것은 무시
      for (let a = t, i = 0; a && a !== document.body && i < 5; a = a.parentElement, i += 1) {
        const pos = getComputedStyle(a).position;
        if (pos === 'fixed' || pos === 'absolute') return true; // 떠 있는 창
      }
    }
    return false;
  }

  // 옆으로 넘기는 목록의 안 보이는 장, 높이 0으로 접힌 메뉴처럼 조상이 overflow:hidden으로 잘라 낸 요소는 안 보이는 것으로 친다.
  // checkVisibility는 이걸 못 잡는다 (2026-10-17 정부24 메인: 안 보이는 「가족관계증명서」를 가리켜 테두리가 화면 구석에 그려짐).
  // 스크롤되는 상자(auto·scroll)는 스크롤하면 보이므로 자른 것으로 보지 않는다.
  function clippedOut(el, r) {
    for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      const cuts = /hidden|clip/.test(`${cs.overflowX} ${cs.overflowY}`) || cs.clip !== 'auto';
      if (!cuts) continue;
      const ar = a.getBoundingClientRect();
      const w = Math.min(r.right, ar.right) - Math.max(r.left, ar.left);
      const h = Math.min(r.bottom, ar.bottom) - Math.max(r.top, ar.top);
      if (w < r.width / 2 || h < r.height / 2) return true;
    }
    return false;
  }

  function lines(text) {
    return String(text ?? '')
      .split('\n')
      .map((s) => s.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  }

  // aria-labelledby가 가리키는 요소들 (이름을 다른 곳의 글로 붙인 칸·단추)
  function labelledBy(el) {
    return (el.getAttribute('aria-labelledby') || '')
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => document.getElementById(id))
      .filter(Boolean);
  }

  const textOf = (els) => els.map((e) => lines(e.innerText).join(' ')).join(' ').trim();

  // 이름: 보이는 글 → aria-labelledby → aria-label → title → 그림 설명 → 값 (보이는 글이 있으면 지금까지와 같다)
  function nameParts(el) {
    const own = lines(el.innerText);
    if (own.length) return { label: own[0], detail: own.slice(1).join(' ') };
    const alt = el.querySelector?.('img[alt]')?.getAttribute('alt');
    const label = textOf(labelledBy(el)) || el.getAttribute('aria-label') || el.getAttribute('title') || alt || el.value || '';
    return { label: lines(label)[0] ?? '', detail: '' };
  }

  function fieldLabel(el) {
    const fromLabel = el.labels?.[0] ? lines(el.labels[0].innerText)[0] : '';
    return fromLabel || textOf(labelledBy(el)) || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title') || '';
  }

  const ARIA_OPTION = new Set(['checkbox', 'radio', 'switch']);

  function describe(el) {
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return null;
    // 진짜 input 없이 aria-checked로 표시하는 체크칸·고르는 칸. 이름은 보이는 글, 없으면 aria-labelledby·aria-label
    if (tag !== 'input' && ARIA_OPTION.has(el.getAttribute('role'))) {
      if (!isClickable(el)) return null;
      const named = labelledBy(el);
      const parts = lines(el.innerText).length ? lines(el.innerText) : lines(textOf(named));
      const label = parts[0] || el.getAttribute('aria-label') || el.getAttribute('title') || '';
      return {
        el,
        box: [el, ...named.filter(isClickable)],
        kind: 'option',
        label,
        detail: parts.slice(1).join(' '),
        selected: el.getAttribute('aria-checked') === 'true',
        consent: consentKind(el, parts.join(' ') || label),
      };
    }
    if (tag === 'input' && (type === 'radio' || type === 'checkbox')) {
      const lab = el.labels?.[0];
      // 꾸민 선택지는 진짜 input을 숨기고 label만 보여 준다
      const visibleEl = isClickable(el) ? el : lab && isClickable(lab) ? lab : null;
      if (!visibleEl) return null;
      const parts = lab ? lines(lab.innerText) : [];
      const label = parts[0] || el.getAttribute('aria-label') || el.getAttribute('title') || '';
      return {
        el: visibleEl,
        box: [el, lab].filter((e) => e && isClickable(e)),
        kind: 'option',
        label,
        detail: parts.slice(1).join(' '),
        selected: el.checked,
        consent: consentKind(el, parts.join(' ') || label),
      };
    }
    if (!isClickable(el)) return null;
    if (tag === 'select') return { el, kind: 'select', label: fieldLabel(el), detail: '', filled: el.value !== '' };
    if (tag === 'textarea' || tag === 'input') {
      if (type === 'button' || type === 'submit') return { el, kind: 'button', label: el.value || el.getAttribute('aria-label') || '', detail: '' };
      return { el, kind: 'input', label: fieldLabel(el), detail: '', filled: el.value !== '' };
    }
    const kind = tag === 'a' || el.getAttribute('role') === 'link' ? 'link' : 'button';
    return { el, kind, ...nameParts(el) };
  }

  // ---------- 약관 동의: 필수만 ----------
  // 규칙이 분명한 일이라 Jev에 묻지 않고 코드가 정한다.
  // 「선택」 동의·「전체 동의」(선택까지 동의됨)·「동의하지 않음」은 후보에서 아예 뺀다 → Jev도 고를 수 없다.
  const AGREE_ALL = /(전체|모두|일괄)\s*(동의|선택)|약관\s*전체/;
  const REQUIRED_MARK = /[\[(（【<]\s*필수\s*(사항)?\s*[\])）】>]|필수\s*(동의|항목|사항)|^\s*필수\s/;
  const OPTIONAL_MARK = /[\[(（【<]\s*선택\s*(사항)?\s*[\])）】>]|선택\s*(동의|항목|사항)|^\s*선택\s/;
  const DISAGREE = /동의\s*(하지\s*않|안\s*함|안함|거부)|미동의|비동의|거부/;
  const CONSENT_WORDS = /동의|약관|개인정보|고유식별/;

  // 'required' | 'optional' | 'all' | 'disagree' | 'unknown' | null(약관 아님)
  function consentKind(input, label) {
    let ctx = '';
    if (!REQUIRED_MARK.test(label) && !OPTIONAL_MARK.test(label)) {
      // "동의함" 같은 단추는 이름에 필수/선택 표시가 없다 → 가까운 줄(최대 6단계 위, 400자 이하)에서 찾는다
      let node = (input.labels?.[0] ?? input).parentElement;
      for (let i = 0; node && i < 6; i += 1, node = node.parentElement) {
        const t = node.innerText ?? '';
        if (t.length > 400) break;
        if (REQUIRED_MARK.test(t) || OPTIONAL_MARK.test(t)) {
          ctx = t;
          break;
        }
      }
    }
    const all = `${label} ${ctx}`;
    if (!CONSENT_WORDS.test(all)) return null;
    if (AGREE_ALL.test(label)) return 'all';
    if ((input.type === 'radio' || input.getAttribute('role') === 'radio') && DISAGREE.test(label)) return 'disagree';
    const req = REQUIRED_MARK.test(all);
    const opt = OPTIONAL_MARK.test(all);
    if (opt && !req) return 'optional';
    if (req && !opt) return 'required';
    return 'unknown';
  }

  function activeDialog() {
    const open = [...document.querySelectorAll(DIALOG)].filter((d) => {
      const r = d.getBoundingClientRect();
      return r.width > 100 && r.height > 50 && isVisible(d);
    });
    return open.at(-1) ?? null;
  }

  // 정부24의 안내 창(예: 발급하기 → "회원/비회원 신청하기")은 role="dialog"가 없다.
  // 이름에 pop·layer·modal이 들어가고, 화면 위에 떠 있고, 누를 것이 있는 큰 덩어리를 "떠 있는 창"으로 본다.
  // 잘못 잡아도 후보를 지우지 않고 앞에 세우기만 한다.
  function openLayer() {
    let found = null;
    for (const el of document.querySelectorAll(LAYER_HINT)) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 200 || r.height < 100 || !isVisible(el) || el.closest(MENU_AREA)) continue;
      if (!el.querySelector('a[href], button, input')) continue;
      if (found?.contains(el)) continue; // 바깥 덩어리를 쓴다
      found = el;
    }
    return found;
  }

  function headings(scope) {
    return [...scope.querySelectorAll('h1, h2, h3, [role="heading"]')]
      .filter(isVisible)
      .map((h) => lines(h.innerText)[0])
      .filter(Boolean)
      .slice(0, 8);
  }

  function collect() {
    const dialog = activeDialog();
    const scope = dialog ?? document;
    const layer = dialog ? null : openLayer();
    const groups = { popup: [], main: [], menu: [] };
    const consent = { todo: [], hasOptional: false };
    for (const el of scope.querySelectorAll(CONTROL_SELECTOR)) {
      const d = describe(el);
      if (!d?.label) continue;
      if (d.consent === 'optional' || d.consent === 'all' || d.consent === 'disagree') {
        if (d.consent === 'optional') consent.hasOptional = true;
        continue;
      }
      if (d.consent === 'required' && !d.selected) consent.todo.push(d);
      d.area = dialog || layer?.contains(el) ? 'popup' : el.closest(MENU_AREA) ? 'menu' : 'main';
      groups[d.area].push(d);
    }
    const map = new Map();
    const candidates = [];
    // 같은 후보는 이름(첫 줄)과 둘째 줄이 모두 같을 때만 하나로 합친다.
    // 첫 줄만 보면 「가족관계 / 증명서」와 「가족관계 / 등록부정정」, 「제적 / 등본」과 「제적 / 초본」이 하나로 합쳐져
    // 화면에서 먼저 나온 것만 서버로 갔다 (정답 카드가 뒤에 있으면 사라질 수 있었다, 2026-10-19 검수).
    const seen = new Map(); // 이름+둘째 줄 → 후보 번호
    for (const d of [...groups.popup, ...groups.main, ...groups.menu]) {
      const label = d.label.replace(/\s+/g, ' ').trim();
      const box = d.box ?? [d.el];
      const key = `${label}\u0000${String(d.detail ?? '').replace(/\s+/g, ' ').trim()}`;
      const at = seen.get(key);
      if (at !== undefined) {
        // 같은 이름이면 고르는 칸을 남긴다. 2026-10-18 전자가족관계: 신청서의 「혼인관계증명서」(골라짐)가 옆 메뉴의
        // 같은 이름 링크에 밀려 빠지자, AI가 서류를 아직 안 골랐다고 보고 링크를 가리켰다 (누르자 본인 확인이 풀림)
        if (d.kind === 'option' && candidates[at].kind !== 'option') {
          map.set(at, box);
          for (const e of box) labelOf.set(e, label);
          candidates[at] = { id: at, label, detail: d.detail, kind: d.kind, area: d.area, selected: d.selected === true, filled: false };
        }
        continue;
      }
      const id = candidates.length;
      seen.set(key, id);
      map.set(id, box);
      for (const e of box) labelOf.set(e, label);
      candidates.push({ id, label, detail: d.detail, kind: d.kind, area: d.area, selected: d.selected === true, filled: d.filled === true });
      if (candidates.length >= MAX_SEND) break;
    }
    // 떠 있는 창의 안내 글 (버튼 이름은 빼고). 예: "회원/비회원 신청가능 서비스입니다."
    const box = dialog ?? layer;
    let popupText = box ? lines(box.innerText).join(' ') : '';
    for (const l of candidates.map((c) => c.label).sort((a, b) => b.length - a.length)) if (l.length > 1) popupText = popupText.split(l).join(' ');
    popupText = popupText.replace(/\s+/g, ' ').trim().slice(0, 300);
    const page = { title: document.title, headings: headings(dialog ?? document), popupText };
    return { candidates, map, page, dialog: Boolean(box), consent };
  }

  // 이런 화면에서는 묻지 않는다: 접속 대기(사람이 몰릴 때), 접속 차단(정부24가 이 기기를 막음)
  const HOLD_TEXT = {
    wait: '지금은 사람이 많아 순서를 기다리는 화면이에요. 화면이 바뀔 때까지 그대로 기다려 주세요.',
    blocked: '정부24가 이 컴퓨터의 접속을 막았어요. 가족이나 정부24 고객센터(1588-2188)에 물어봐 주세요.',
  };
  function holdScreen() {
    const counter = document.getElementById('waitCnt');
    if (counter && isVisible(counter)) return 'wait';
    const text = document.body?.innerText ?? '';
    if (text.includes('접속 대기 중')) return 'wait';
    if (text.includes('서비스 접속이 차단')) return 'blocked';
    return null;
  }

  // ---------- 묻고 그리기 ----------

  // 확장을 새로 불러오면 이 페이지의 연결이 끊긴다 → 'extension' 오류로 바꾼다
  async function send(msg) {
    try {
      return await chrome.runtime.sendMessage(msg);
    } catch {
      return { kind: 'error', code: 'extension' };
    }
  }

  // ---------- 찾는 단계에서 막혔을 때 (0.1.3): 바로 가기·목록에서 다시 고르기·계속 찾아보기 ----------
  // 「바로 가기」 주소는 background가 이미 걸렀지만 여기서도 https이고 길잡이가 뜨는 사이트(매니페스트 matches)인지 다시 본다
  const GUIDE_HOSTS = new Set(
    (chrome.runtime.getManifest().content_scripts ?? [])
      .flatMap((c) => c.matches ?? [])
      .map((m) => m.replace(/^https:\/\//, '').replace(/\/\*$/, '')),
  );
  function safeUrl(url) {
    try {
      const u = new URL(String(url ?? ''));
      return u.protocol === 'https:' && !u.username && !u.password && GUIDE_HOSTS.has(u.host) ? u.href : '';
    } catch {
      return '';
    }
  }
  const GOV24_HOME = 'https://www.gov.kr/';
  const HELP_LINE = '어려우면 가족이나 정부24 고객센터(1588-2188)에 물어봐 주세요.';
  const gotoText = () => `정부24의 ${state?.goalTitle || '서류'} 안내 화면으로 바로 가기`;

  // 같은 탭에서 연다. 「민원 찾기」 횟수는 처음부터 센다 (가서 또 막히면 그때 다시 센다)
  async function goTo(url) {
    const safe = safeUrl(url);
    if (!safe) return;
    await send({ type: 'guide/continue' });
    location.assign(safe);
  }

  async function relist() {
    await stop();
    showList();
  }

  async function keepLooking() {
    await send({ type: 'guide/continue' });
    scan('manual');
  }

  // 사람이 누른 것만 받는다 (페이지 스크립트가 .click()으로 대신 누르지 못하게). 한 화면에 주 단추(primary)는 하나만
  function actionButton(text, primary, run) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    if (primary) b.className = 'primary';
    b.addEventListener('click', (e) => e.isTrusted && run());
    return b;
  }

  function helpLine() {
    const p = document.createElement('p');
    p.className = 'note';
    p.textContent = HELP_LINE;
    return p;
  }

  // 찾는 단계(「민원 찾기」)에서는 「바로 가기」를 덜 눈에 띄는 단추로 함께 보여 준다 (주소가 있을 때만)
  function offerGoto() {
    const url = safeUrl(state?.goalUrl);
    if (!url) return;
    ui.goto.textContent = gotoText();
    ui.goto.dataset.url = url;
    ui.goto.hidden = false;
  }

  // 「민원 찾기」만 연달아 나와 멈췄다 (background FIND_LIMIT): 서버에 더 묻지 않고 다른 길을 보여 준다
  function renderStopped() {
    const url = safeUrl(state?.goalUrl);
    show({ msg: '여기서는 찾는 서류를 못 찾고 있어요.', guiding: false });
    const buttons = [];
    if (url) buttons.push(actionButton(gotoText(), true, () => goTo(url)));
    buttons.push(actionButton('목록에서 다시 고르기', !url, relist));
    buttons.push(actionButton('계속 찾아보기', false, keepLooking));
    ui.goals.replaceChildren(...buttons, helpLine());
    spoken = [ui.msg.textContent, ...buttons.map((b) => b.textContent), HELP_LINE].join(' ');
  }

  // 서류를 주지 않는 사이트에서 시작했다 (서버 wrong_site): 정부24로 가는 주 단추 하나. 테두리 없음
  function renderWrongSite(res) {
    const url = safeUrl(state?.goalUrl);
    const go = actionButton(url ? gotoText() : '정부24로 가기', true, () => goTo(url || GOV24_HOME));
    show({ stage: res.stageText, msg: '아래 단추를 누르면 정부24로 가요.' });
    ui.goals.replaceChildren(go);
    spoken = [res.stageText, ui.msg.textContent, go.textContent].join(' ');
  }

  // 검색을 두 번 해도 못 찾았다 (서버 search_exhausted): 바로 가기·목록에서 다시 고르기
  function renderExhausted(res) {
    const url = safeUrl(state?.goalUrl);
    show({ stage: res.stageText, msg: '검색 말고 다른 길로 가 볼게요. 아래에서 골라 주세요.' });
    const buttons = [];
    if (url) buttons.push(actionButton(gotoText(), true, () => goTo(url)));
    buttons.push(actionButton('목록에서 다시 고르기', !url, relist));
    ui.goals.replaceChildren(...buttons, helpLine());
    spoken = [res.stageText, ui.msg.textContent, ...buttons.map((b) => b.textContent), HELP_LINE].join(' ');
  }

  function apply(res) {
    if (!res || res.kind === 'inactive') {
      state = { ...state, active: false };
      renderStart();
      return;
    }
    ui.goals.replaceChildren(); // 멈춤·정부24로 가기 같은 지난 화면의 단추를 지운다
    if (res.kind === 'stopped') {
      clearTarget();
      renderStopped();
      return;
    }
    if (res.kind === 'handoff') {
      clearTarget();
      show({ stage: res.stageText, msg: HANDOFF_TEXT });
      return;
    }
    if (res.kind === 'point') {
      const els = elements.get(res.id);
      if (els && shown(els)) {
        // 사이트 검색 칸이면 무엇을 적을지 알려 준다 (먼저 찾는 서류 페이지로 가야 하므로)
        const searchBox = res.targetKind === 'input' && /검색|무엇을|알고 싶|찾/.test(res.label) && state?.goalTitle;
        const what = searchBox
          ? `검색 칸에 「${state.goalTitle}」라고 적고 검색해 주세요. 적기 어려우면 아래 단추로 복사해서 붙여 넣으세요.`
          : ACTION_TEXT[res.targetKind](res.label);
        // 같은 곳을 두 번 눌러도 같은 화면이면 테두리는 그대로 두고 막힌 까닭을 알려 준다
        const stuckHere = stuck.count >= 2 && stuck.label === res.label;
        show({
          stage: res.stageText,
          msg: stuckHere ? NO_CHANGE_TEXT(res.label) : `${what} 빨간 테두리로 표시했어요.`,
          copy: searchBox ? state.goalTitle : '',
        });
        if (res.stage === '민원 찾기') offerGoto();
        pointTo([{ els, tag: '여기를 누르세요' }]);
        return;
      }
    }
    clearTarget();
    if (res.kind === 'error') {
      if (res.code === 'no_consent') return needConsent();
      if (res.code === 'unknown_goal') return goalGone();
      show({ msg: res.message ?? ERROR_TEXT[res.code] ?? '잠깐 문제가 생겼어요. 「다시 찾기」를 눌러 주세요.' });
      return;
    }
    if (res.reason === 'wrong_site') return renderWrongSite(res);
    if (res.reason === 'search_exhausted') return renderExhausted(res);
    show({ stage: res.stageText, msg: '어디를 눌러야 할지 잘 모르겠어요. 가족이나 정부24 고객센터(1588-2188)에 물어봐 주세요.' });
    if (res.stage === '민원 찾기') offerGoto();
  }

  // reason: load·click·change·manual·navigation은 화면이 바뀌었으면 다시 묻는다.
  // mutation(배너 회전 등)은 지금 가리키는 곳이 사라졌거나 대화창이 열리고 닫혔을 때만 다시 묻는다.
  async function scan(reason) {
    if (!state?.active) return;
    if (asking) {
      // 묻는 중에 들어온 이유 중 강한 것을 남긴다 (「다시 찾기」·체크가 배너 회전에 묻히지 않게)
      if (!queued || RANK[reason] > RANK[queued]) queued = reason;
      return;
    }
    const hold = holdScreen();
    if (hold) {
      clearTarget();
      lastSignature = '';
      clickWatch = null;
      stuck = NOT_STUCK;
      show({ msg: HOLD_TEXT[hold] });
      return;
    }
    // 떠 있는 iframe(인증 창)이 화면을 덮고 있으면 서버에 묻지 않는다 — 뒤의 가려진 버튼을 가리키게 되므로
    if (coveringFrame()) {
      clearTarget();
      lastSignature = '';
      lastResult = null;
      clickWatch = null;
      stuck = NOT_STUCK;
      show({ stage: '창이 열려 있어요.', msg: FRAME_HELP });
      return;
    }
    // 배너 회전 같은 변화(mutation)는 대부분 아무것도 안 바꾼다: 창이 그대로고 가리킬 곳이 아직 보이면(또는 직전이 오류면)
    // 후보를 전부 모으기 전에 끝낸다 (화면이 바뀔 때마다 수백 개를 훑지 않게)
    if (reason === 'mutation' && Boolean(activeDialog() || openLayer()) === lastDialog && (targetsShown() || lastFailed)) return;
    const { candidates, map, page, dialog, consent } = collect();
    const signature = JSON.stringify([page, candidates.map(({ id, ...c }) => c)]);
    const dialogChanged = dialog !== lastDialog;
    lastDialog = dialog;
    // 가리킨 버튼·링크를 누른 뒤 처음 보는 화면: 주소·창·후보가 모두 그대로이고 다른 창으로 넘어가지도 않았으면 "그대로"로 센다.
    // 같은 곳·같은 화면에서 연달아 세고, 화면이 조금이라도 바뀌면 처음부터 센다.
    if (clickWatch) {
      const same = !clickWatch.left && clickWatch.url === location.href && clickWatch.dialog === dialog && clickWatch.signature === signature;
      const again = same && stuck.label === clickWatch.label && stuck.signature === signature;
      stuck = same ? { label: clickWatch.label, signature, count: again ? stuck.count + 1 : 1 } : NOT_STUCK;
      clickWatch = null;
    } else if (stuck.count && stuck.signature !== signature) {
      stuck = NOT_STUCK;
    }
    if (reason === 'mutation' && !dialogChanged) {
      // 서버가 꺼졌거나 상한에 닿았을 때 5초마다 계속 묻지 않는다 → 「다시 찾기」·누르기·쪽 이동 때 다시 묻는다
      if (targetsShown() || lastFailed) return;
      const wait = MUTATION_GAP_MS - (Date.now() - lastAskAt);
      if (wait > 0) {
        schedule('mutation', wait);
        return;
      }
    }

    // 약관 화면: 체크 안 된 「필수」 칸을 모두 표시한다. 다 체크하면 Jev에 다음 버튼을 묻는다.
    if (consent.todo.length) {
      lastSignature = '';
      lastResult = null;
      const n = consent.todo.length;
      show({
        stage: '약관에 동의하는 화면이에요.',
        // 한 번에 8곳까지 표시한다. 더 있으면 체크한 뒤 나머지를 이어서 표시한다고 알린다
        msg: `「필수」 동의 ${n}곳에 체크해 주세요. ${n > 8 ? '먼저 8곳을 빨간 테두리로 표시했어요. 체크하면 나머지를 이어서 표시해요.' : '빨간 테두리로 표시했어요.'}${consent.hasOptional ? ' 「선택」 동의는 체크하지 않아도 돼요.' : ''}`,
      });
      pointTo(consent.todo.slice(0, 8).map((d) => ({ els: d.box ?? [d.el], tag: '필수', side: 'right' })));
      return;
    }

    elements = map;
    if (signature === lastSignature && lastResult && reason !== 'manual') {
      apply(lastResult);
      return;
    }
    lastSignature = signature;
    lastAskAt = Date.now();
    asking = true;
    clearTarget();
    show({ msg: '다음에 누를 곳을 찾고 있어요…' });
    let res;
    try {
      res = await send({ type: 'guide/ask', page, candidates, manual: reason === 'manual' });
    } catch {
      res = { kind: 'error', code: 'extension' };
    } finally {
      asking = false;
    }
    lastFailed = res?.kind === 'error';
    lastResult = lastFailed ? null : res;
    if (signature === lastSignature) apply(res);
    if (queued) {
      const next = queued;
      queued = null;
      schedule(next);
    }
  }

  // 화면이 잠잠해질 때까지(SETTLE_MS) 기다렸다가 묻는다. 계속 바뀌는 화면(배너 회전)이라도 MAX_DEFER_MS 안에는 묻는다.
  // 기다리는 동안 들어온 이유 중 가장 강한 것을 쓴다 (늦게 그려지는 로그인 화면에서 'load'가 'mutation'에 묻히지 않게).
  function schedule(reason, ms = SETTLE_MS) {
    const now = Date.now();
    if (!pendingReason) {
      pendingReason = reason;
      pendingSince = now;
    } else if (RANK[reason] > RANK[pendingReason]) {
      pendingReason = reason;
    }
    clearTimeout(timer);
    const delay = Math.max(0, Math.min(ms, MAX_DEFER_MS - (now - pendingSince)));
    timer = setTimeout(() => {
      const r = pendingReason;
      pendingReason = null;
      scan(r);
    }, delay);
  }

  async function start(goalId) {
    const next = await send({ type: 'guide/start', goalId });
    if (next?.kind === 'error') return apply(next);
    state = next;
    ui.goals.replaceChildren();
    ui.find.hidden = true;
    ui.list.hidden = true;
    lastSignature = '';
    scan('load');
  }

  async function stop() {
    const next = await send({ type: 'guide/stop' });
    if (next?.kind === 'error') return apply(next);
    state = next;
    lastSignature = '';
    lastResult = null;
    renderStart();
  }

  // ---------- 이벤트 ----------

  // 사람이 누른 것만 받는다: 페이지 스크립트가 .click()으로 「동의하고 시작하기」를 대신 누르지 못하게
  root.addEventListener('click', (e) => {
    if (!e.isTrusted) return;
    const act = e.target.closest?.('[data-act]')?.dataset.act;
    if (act === 'speak') speak();
    if (act === 'copy') copyText(ui.copy.dataset.text);
    if (act === 'goto') goTo(ui.goto.dataset.url);
    if (act === 'rescan') scan('manual');
    if (act === 'stop') stop();
    if (act === 'search') search();
    if (act === 'consent') acceptConsent();
    if (act === 'decline') declineConsent();
    if (act === 'listen') listen();
    if (act === 'list') showList();
    if (act === 'collapse' || act === 'expand') {
      collapsed = act === 'collapse';
      ui.wrap.classList.toggle('collapsed', collapsed);
      send({ type: 'ui/collapsed', value: collapsed }); // 다른 쪽(주소)으로 가도 접은 상태를 기억한다
    }
  });

  // 검색 칸의 글자 입력이 정부24 화면의 단축키로 새지 않게 막는다
  for (const type of ['keydown', 'keyup', 'keypress']) ui.find.addEventListener(type, (e) => e.stopPropagation());
  ui.query.addEventListener('keydown', (e) => {
    if (e.isTrusted && e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      search();
    }
  });

  document.addEventListener(
    'click',
    (e) => {
      if (!state?.active || e.composedPath().includes(host)) return;
      // 가리킨 곳을 눌렀으면 그 판단은 끝난 것: 같은 화면이어도 이전 판단을 다시 쓰지 않는다
      if (targets.some((t) => t.els.some((x) => x === e.target || x.contains(e.target)))) {
        // 버튼·링크를 눌렀으면 다음에 볼 때 화면이 바뀌었는지 견준다 (칸·고르는 칸은 눌러도 화면이 그대로인 게 정상이라 보지 않는다)
        if (lastResult?.kind === 'point' && (lastResult.targetKind === 'button' || lastResult.targetKind === 'link')) {
          clickWatch = { label: lastResult.label, signature: lastSignature, url: location.href, dialog: lastDialog, left: false };
        }
        lastSignature = '';
        lastResult = null;
        clearTarget();
        show({ msg: '다음에 누를 곳을 다시 찾고 있어요…' });
      }
      let el = e.target;
      for (let i = 0; el && i < 6; i += 1, el = el.parentElement) {
        const label = labelOf.get(el);
        if (label) {
          send({ type: 'guide/pressed', label });
          break;
        }
      }
      schedule('click', AFTER_CLICK_MS);
    },
    true,
  );

  document.addEventListener('change', () => state?.active && schedule('change'), true);

  // 누른 뒤 새 창·새 탭·인쇄 창으로 넘어갔으면 이 화면이 그대로여도 "막힌" 것이 아니다
  const leftPage = () => {
    if (clickWatch) clickWatch.left = true;
  };
  addEventListener('blur', leftPage);
  addEventListener('beforeprint', leftPage);
  document.addEventListener('visibilitychange', () => document.hidden && leftPage());

  new MutationObserver((records) => {
    if (!state?.active) return;
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      schedule('navigation');
    } else if (records.some((r) => r.attributeName === 'aria-checked')) {
      schedule('change'); // 그림으로 꾸민 체크칸이 바뀌면 체크가 바뀐 것과 같다
    } else {
      schedule('mutation');
    }
  }).observe(document.body ?? document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'open', 'aria-expanded', 'disabled', 'aria-checked'],
  });

  let frame = 0;
  const follow = () => {
    if (frame || !targets.length) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      place();
    });
  };
  addEventListener('scroll', follow, { passive: true, capture: true });
  addEventListener('resize', follow, { passive: true });
  setInterval(follow, 500); // 펼침·배너 등으로 위치가 바뀌는 경우

  (async () => {
    state = await send({ type: 'guide/state' });
    if (!state || state.kind === 'error') {
      state = null;
      show({ msg: ERROR_TEXT.extension, guiding: false });
      return;
    }
    collapsed = state.collapsed === true;
    ui.wrap.classList.toggle('collapsed', collapsed);
    if (state.active) {
      show({ msg: '다음에 누를 곳을 찾고 있어요…' });
      schedule('load');
    } else {
      renderStart();
    }
  })();
})();

// 연기 시험: 실제 정부24 공개 페이지에서 확장을 띄워 "후보 수집 → 질문 → 테두리"가 이어지는지 본다.
// TypeSafe는 가짜 응답으로 바꾼다 (키·비용 없음). 정확도 시험은 scripts/trial.mjs.
// Playwright는 새로 설치하지 않고 reference/slop-detector/node_modules 것을 빌려 쓴다 (PLAYWRIGHT_FROM으로 바꿀 수 있음).
// 결과: smoke-out/ 에 단계별 화면 사진, 보낸 요청(fixture), 요약 summary.json

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { findBrowser } from './browser.mjs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { RELAY_URL } from '../src/lib/relay.js';
import { NONE_OPTION, looksPersonal } from '../src/lib/sanitize.js';
import { createRelay } from '../server/relay.js';

process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1'; // service worker의 fetch도 가로채기
const root = new URL('..', import.meta.url).pathname;
const { chromium } = createRequire(process.env.PLAYWRIGHT_FROM ?? join(root, 'reference/slop-detector/package.json'))('playwright');
const OUT = process.env.SMOKE_OUT ? join(root, process.env.SMOKE_OUT) : join(root, 'smoke-out');
mkdirSync(OUT, { recursive: true });

// 가짜 Jev: 아는 이름이 후보에 있으면 고르고, 없으면 "해당 없음"
const PICK_ORDER = ['주민등록등본(초본)', '주민등록표 등본(초본)', '발급하기', '다음', '시험 검색 칸'];
function mockAnswer(body) {
  if (body.questions.ping) return { model: 'mock', answers: { ping: { type: 'noul', noul: 0.99 } }, usage: {} };
  if (body.questions.service) {
    // 민원 찾기: "주소"·"이사"가 들어가면 초본 1순위, 등본 2순위
    const hit = /주소|이사/.test(body.state.request);
    const probabilities = hit ? { '주민등록표 초본': 0.62, '주민등록표 등본': 0.28, [NONE_OPTION]: 0.1 } : { [NONE_OPTION]: 1 };
    const choice = hit ? '주민등록표 초본' : NONE_OPTION;
    return { model: 'mock', answers: { service: { type: 'choice', choice, confidence: 0.5, probabilities } }, usage: {} };
  }
  const keys = Object.keys(body.questions.nextControl.criteria);
  const choice = PICK_ORDER.map((p) => keys.find((k) => k === p || k.startsWith(p))).find(Boolean) ?? NONE_OPTION;
  const path = body.state.page.address;
  const stage = path.includes('login') ? '로그인' : path.includes('AA020') ? '민원 안내' : path.includes('form-') ? '신청서 작성' : '민원 찾기';
  return {
    model: 'mock',
    answers: {
      nextControl: { type: 'choice', choice, confidence: 0.9, probabilities: { [choice]: 0.9 } },
      pageStage: { type: 'choice', choice: stage, confidence: 0.9, probabilities: { [stage]: 0.9 } },
    },
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}

const requests = [];
const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'gvrnmnt24-')), {
  channel: 'chromium',
  executablePath: findBrowser(chromium),
  headless: process.env.HEADED !== '1',
  locale: 'ko-KR',
  // 스토어 스크린샷은 1280×800: VIEWPORT=1280x800 SMOKE_OUT=store/raw npm run smoke
  viewport: (([w, h]) => ({ width: Number(w), height: Number(h) }))((process.env.VIEWPORT ?? '1400x900').split('x')),
  args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
});
// 실제 중계 서버 코드(server/relay.js)를 이 시험 안에서 띄우고, 가짜 TypeSafe(mockAnswer)를 붙인다.
// 확장의 요청은 운영 중계 주소로 나가지만 여기서 가로채 로컬 중계로 보낸다 → 운영 서버·Jev를 부르지 않는다.
const relayRequests = []; // 확장이 중계로 보낸 본문
let relayHits = 0;
const typesafeCalls = []; // 브라우저에서 TypeSafe로 직접 나간 요청 (0이어야 한다)
const allowedOrigins = []; // 확장 ID를 안 뒤에 채운다
const relay = createRelay({
  apiKey: 'smoke-fake-key',
  allowedOrigins,
  fetchImpl: async (url, init) => {
    const body = JSON.parse(init.body);
    requests.push(body); // Jev로 가는 본문 (서버가 만든 것)
    return { ok: true, status: 200, json: async () => mockAnswer(body) };
  },
  log: () => {},
});
await new Promise((r) => relay.listen(0, '127.0.0.1', r));
const relayPort = relay.address().port;
context.on('request', (r) => {
  if (r.url().includes('typesafe.ai')) typesafeCalls.push(r.url());
});
await context.route(`${RELAY_URL}/**`, async (route) => {
  const req = route.request();
  relayHits += 1;
  if (req.method() === 'POST') relayRequests.push(req.postDataJSON());
  const headers = { ...req.headers() };
  delete headers.host;
  const upstream = await fetch(`http://127.0.0.1:${relayPort}${new URL(req.url()).pathname}`, {
    method: req.method(),
    headers,
    body: req.method() === 'POST' ? req.postData() : undefined,
  });
  await route.fulfill({ status: upstream.status, contentType: 'application/json', body: await upstream.text() });
});

const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
const extId = new URL(sw.url()).host;
allowedOrigins.push(`chrome-extension://${extId}`);
const summary = { steps: [], checks: [] };
const check = (name, ok, detail = '') => summary.checks.push({ name, ok: Boolean(ok), detail });

// 1. 설정 창: 키 입력 칸이 없고, 서버 연결 확인이 되고, 처음에는 동의 전
const popup = await context.newPage();
await popup.goto(`chrome-extension://${extId}/src/popup.html`);
check('설정 창: 키 입력 칸 없음', (await popup.locator('input').count()) === 0);
await popup.click('#test');
await popup.waitForSelector('#relayState.ok', { timeout: 10000 }).catch(() => {});
check('설정 창: 서버 연결 확인', (await popup.textContent('#relayState')) === '연결됐어요.', await popup.textContent('#relayState'));
check('설정 창: 처음에는 동의 전', (await popup.textContent('#consentState')).includes('동의하지 않았어요'));
await popup.screenshot({ path: join(OUT, '0-popup.png'), fullPage: true });

const page = await context.newPage();
const shadow = (sel) => page.locator('gvrnmnt24-guide').locator(sel);

// since: 이 시점 이후의 요청만 본다. until: 이런 요청이 올 때까지 기다린다 (늦게 그려지는 화면용)
async function settle(name, { since = requests.length, until = () => true, maxWaitMs = 30000 } = {}) {
  const before = since;
  for (let t = 0; t < maxWaitMs / 500 && !requests.slice(before).some((b) => b.questions?.nextControl && until(b)); t += 1) {
    await page.waitForTimeout(500);
  }
  await page
    .waitForFunction(
      () => {
        const r = document.querySelector('gvrnmnt24-guide')?.shadowRoot;
        const msg = r?.querySelector('.msg')?.textContent ?? '';
        return r && !msg.includes('찾고 있어요') && (r.querySelector('.ring') || /모르겠|기다려|문제/.test(msg));
      },
      null,
      { timeout: 25000 },
    )
    .catch(() => {});
  await page.waitForTimeout(400);
  const step = {
    name,
    url: page.url(),
    stage: await shadow('.stage').textContent(),
    msg: await shadow('.msg').textContent(),
    ringShown: (await shadow('.ring').count()) > 0,
    requestsSent: requests.length - before,
  };
  const body = requests.slice(before).filter((b) => b.questions?.nextControl).at(-1);
  if (body?.questions?.nextControl) {
    step.candidates = Object.keys(body.questions.nextControl.criteria).length - 1;
    step.alreadyPressed = body.state.alreadyPressed;
    writeFileSync(join(OUT, `${name}.request.json`), JSON.stringify(body, null, 2));
  }
  summary.steps.push(step);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  return step;
}

// plus.gov.kr(메인·로그인)은 자동화 브라우저를 "서비스 접속이 차단되었습니다"로 막는다 (2026-10-17 확인).
// 차단을 우회하지 않는다. 자동 시험은 www.gov.kr 구간만 하고, 메인·로그인은 사람이 실제 크롬에서 확인한다 (README).
const INFO = 'https://www.gov.kr/mw/AA020InfoCappView.do?HighCtgCD=A01010001&CappBizCD=13100000015';

// 2. 시작 화면: 쉬운 말로 적기 → 목록에서 찾기 → 고르기
await page.goto(INFO, { waitUntil: 'domcontentloaded' });
// 동의 화면: 동의하기 전에는 중계로 아무것도 보내지 않는다
await shadow('[data-act="consent"]').waitFor({ timeout: 20000 });
await page.waitForTimeout(1500);
const hitsBefore = relayHits;
check('동의 전: 서버로 아무것도 안 보냄 (연결 확인 제외)', requests.length === 0 && relayRequests.length === 0, `Jev ${requests.length}건, 중계 본문 ${relayRequests.length}건`);
check('동의 화면에 서버·AI·말하기·틀릴 수 있음 안내', await shadow('.consent').evaluate((e) => ['서버(싱가포르)', 'TypeSafe', '말로 하기', '틀릴 수 있어요'].every((w) => e.innerText.includes(w))));
await page.screenshot({ path: join(OUT, '1-consent.png') });
await shadow('[data-act="decline"]').click();
const declined = await shadow('.msg').textContent();
check('동의하지 않으면 켜지지 않음', declined.includes('동의하지 않으셨어서') && (await shadow('#gvrnmnt24-query').isHidden()), declined);
await shadow('.goals button').first().click();
await shadow('[data-act="consent"]').waitFor({ timeout: 5000 });
await shadow('[data-act="consent"]').click();
await shadow('#gvrnmnt24-query').waitFor({ timeout: 20000 });
check('동의 뒤에야 검색 칸이 나옴', true);
await page.screenshot({ path: join(OUT, '1-start.png') });

// 2-1. 개인정보처럼 보이는 말은 보내지 않는다
let since = requests.length;
await shadow('#gvrnmnt24-query').fill('홍길동님 등본');
await shadow('[data-act="search"]').click();
await page.waitForTimeout(800);
check(
  '검색: 개인정보처럼 보이면 보내지 않음',
  requests.slice(since).every((b) => !b.questions?.service) && (await shadow('.msg').textContent()).includes('개인정보'),
  await shadow('.msg').textContent(),
);

// 2-1b. 서류 이름을 적었는데 목록에 없으면 솔직하게 알린다
await shadow('#gvrnmnt24-query').fill('제적등본');
await shadow('[data-act="search"]').click();
await page.waitForFunction(() => !document.querySelector('gvrnmnt24-guide').shadowRoot.querySelector('.msg').textContent.includes('찾고 있어요'), null, { timeout: 10000 });
const missingMsg = await shadow('.msg').textContent();
check('검색: 목록에 없는 서류 이름은 "목록에 없어요"', missingMsg.includes('목록에 없어요'), missingMsg);

// 2-2. 쉬운 말 → 목록 후보 → 고르기
since = requests.length;
await shadow('#gvrnmnt24-query').fill('이사 다닌 기록 나오는 서류');
await shadow('#gvrnmnt24-query').press('Enter');
await shadow('button.choice').first().waitFor({ timeout: 10000 });
const choices = await shadow('button.choice strong').allTextContents();
await page.screenshot({ path: join(OUT, '1-search.png') });
check('검색: 목록 후보를 확률 순으로 보여 줌', choices[0] === '주민등록표 초본' && choices.includes('주민등록표 등본'), choices.join(', '));
const searchBody = requests.slice(since).find((b) => b.questions?.service);
check('검색: 적은 말은 검색에만 쓰임', searchBody?.state?.request === '이사 다닌 기록 나오는 서류');
since = requests.length;
await shadow('button.choice').first().click();
const info = await settle('2-info', { since });
const firstAsk = requests.slice(since).find((b) => b.questions?.nextControl);
check(
  '목표는 고른 목록 항목으로 만듦 (적은 말이 들어가지 않음)',
  firstAsk?.state.goal.includes('주민등록표 초본') && !JSON.stringify(firstAsk.state).includes('이사 다닌 기록 나오는'),
);
check('민원안내: 발급하기를 가리킴', info.ringShown && info.msg.includes('발급하기'), info.msg);
const infoKeys = Object.keys(requests.slice(since).find((b) => b.questions?.nextControl)?.questions.nextControl.criteria ?? {});
check('로그인·회원가입 버튼은 후보에서 빠짐 (서류를 먼저 찾아가게)', infoKeys.length > 0 && !infoKeys.some((k) => /로그인|회원가입/.test(k)), infoKeys.filter((k) => /로그인|회원가입/.test(k)).join(', '));
// 안내 창 자리: 가릴 때만 옮긴다. 「발급하기」는 오른쪽 아래(기본 자리)에 있어 창이 왼쪽으로 가야 하고, 옮긴 뒤에는 가리지 않아야 한다
const cover = () =>
  page.evaluate(() => {
    const r = document.querySelector('gvrnmnt24-guide').shadowRoot;
    const p = r.querySelector('.panel');
    const pr = p.getBoundingClientRect();
    const hit = [...r.querySelectorAll('.ring')].some((g) => {
      const b = g.getBoundingClientRect();
      return !(b.right < pr.left || b.left > pr.right || b.bottom < pr.top || b.top > pr.bottom);
    });
    return { left: p.classList.contains('left'), hit };
  });
// 테두리가 실제로 「발급하기」 위에 있어야 한다 (그려졌는지만 보면 구석에 그려진 버그를 놓친다)
const onTarget = await page.evaluate(() => {
  const ring = document.querySelector('gvrnmnt24-guide').shadowRoot.querySelector('.ring')?.getBoundingClientRect();
  const link = [...document.querySelectorAll('a')].find((a) => a.innerText.trim() === '발급하기')?.getBoundingClientRect();
  return Boolean(ring && link && ring.left <= link.left && ring.right >= link.right && ring.top <= link.top && ring.bottom >= link.bottom);
});
check('테두리가 가리키는 버튼을 감쌈 (위치)', onTarget);
const infoPanel = await cover();
check('안내 창: 가리는 경우에만 옮김 (민원안내 → 왼쪽, 가리지 않음)', infoPanel.left && !infoPanel.hit, JSON.stringify(infoPanel));

// 3. 가리킨 곳을 실제로 누른다 → 회원/비회원 창이 뜨면 테두리를 끄고 직접 고르게 안내해야 하고, 누른 기록은 남아야 한다 (D-10)
since = requests.length;
await page.getByRole('link', { name: '발급하기', exact: true }).first().click();
const after = await settle('3-popup', { since });
check(
  '회원/비회원 창: 테두리 없이 직접 고르게 안내, 서버에 안 물음',
  !after.ringShown && after.msg.includes('직접 골라 주세요') && after.requestsSent === 0,
  `테두리 ${after.ringShown ? '있음' : '없음'}, 요청 ${after.requestsSent}건: ${after.msg}`,
);

// 4. 같은 화면·같은 기록이면 캐시로 답한다: 한 번 다시 열어 묻게 한 뒤, 또 열면 새 요청이 없어야 한다
since = requests.length;
await page.goto(INFO, { waitUntil: 'domcontentloaded' });
const reopen = await settle('4-reopen', { since });
check('누른 기록이 다음 질문에 들어감 (회원/비회원 창 단계는 서버에 안 물으므로 다음 요청에서 확인)', (reopen.alreadyPressed ?? []).includes('발급하기'), JSON.stringify(reopen.alreadyPressed));
since = requests.length;
await page.goto(INFO, { waitUntil: 'domcontentloaded' });
const again = await settle('5-cache', { since, until: () => false, maxWaitMs: 5000 });
check('같은 화면은 다시 묻지 않음 (캐시)', again.requestsSent === 0 && again.ringShown, `요청 ${again.requestsSent}건`);

// 5-1. 안 보이는 버튼 (가짜 화면): 넘기는 목록의 다른 장, 높이 0으로 접힌 메뉴 안의 버튼은 후보에 들어가면 안 된다
const HIDDEN = 'https://www.gov.kr/__gvrnmnt24_test__/hidden.html';
await context.route(HIDDEN, (route) =>
  route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: readFileSync(join(root, 'test/fixtures/hidden.html'), 'utf8') }),
);
since = requests.length;
await page.goto(HIDDEN, { waitUntil: 'domcontentloaded' });
await settle('5-hidden', { since });
const hiddenAsk = requests.slice(since).find((b) => b.questions?.nextControl);
const hiddenKeys = Object.keys(hiddenAsk?.questions.nextControl.criteria ?? {});
check(
  '안 보이는 버튼은 후보에서 빠짐 (넘기는 목록·접힌 메뉴)',
  ['자동차등록원부', '건축물대장', '자주 찾는 서비스 다음 목록'].every((k) => hiddenKeys.includes(k)) &&
    !hiddenKeys.some((k) => /가족관계증명서|토지|병적증명|접힌 메뉴/.test(k)),
  hiddenKeys.join(', '),
);

// 5-2. 창이 화면을 덮을 때 (2026-10-17 정부24 로그인: 인증 창이 떴는데 가려진 「간편인증」 카드에 테두리가 남았다)
async function fake(name, file, host = 'www.gov.kr') {
  const url = `https://${host}/__gvrnmnt24_test__/${file}`;
  await context.route(url, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: readFileSync(join(root, 'test/fixtures', file), 'utf8') }),
  );
  const before = requests.length;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  return {
    before,
    asks: requests.slice(before).filter((b) => b.questions?.nextControl),
    msg: await shadow('.msg').textContent(),
    stage: await shadow('.stage').textContent(),
    rings: await shadow('.ring').count(),
  };
}
// 5-1b. 어느 사이트에서든 같다: 기관 사이트(홈택스 주소)의 로그인 방법 고르기도 직접 고르게 넘긴다
const loginFake = await fake('login', 'login-methods.html', 'www.hometax.go.kr');
check(
  '기관 사이트(홈택스)에서도 로그인 방법 화면은 직접 고르게 안내, 테두리·서버 요청 없음',
  loginFake.rings === 0 && loginFake.asks.length === 0 && loginFake.msg.includes('직접 골라 주세요'),
  `테두리 ${loginFake.rings}개, 요청 ${loginFake.asks.length}건: ${loginFake.msg}`,
);
await page.screenshot({ path: join(OUT, '5-login-fake.png') });
const domOverlay = await fake('dom', 'overlay-dom.html');
const domKeys = Object.keys(domOverlay.asks.at(-1)?.questions.nextControl.criteria ?? {});
check('창(DOM)이 덮으면 뒤의 버튼은 후보에서 빠지고 창 안 버튼만 남음', domKeys.includes('인증서 선택하기') && !domKeys.some((k) => /뒤$/.test(k)), domKeys.join(', '));
await page.screenshot({ path: join(OUT, '5-overlay-dom.png') });
const frameOverlay = await fake('iframe', 'overlay-iframe.html');
check('떠 있는 iframe 창이 덮으면 서버에 묻지 않고 도움말만', frameOverlay.asks.length === 0 && frameOverlay.rings === 0 && frameOverlay.msg.includes('창 안은 길잡이가 볼 수 없어요'), `${frameOverlay.asks.length}건, 테두리 ${frameOverlay.rings}개`);
await page.screenshot({ path: join(OUT, '5-overlay-iframe.png') });
// 5-2b. 신청서의 고르는 칸은 사용자가 직접 (D-11). 옆 메뉴 링크와 같은 이름(「초본」)이어도 신청서의 고르는 칸이 남는다
// (2026-10-18 전자가족관계: 링크에 밀려 빠지자 AI가 옆 메뉴 「혼인관계증명서」를 가리켰고, 누르자 본인 확인이 풀렸다)
const formFake = await fake('choices', 'form-choices.html');
const choiceCriteria = formFake.asks.at(-1)?.questions.nextControl.criteria ?? {};
const choiceKeys = Object.keys(choiceCriteria);
check(
  '신청서: 서류 종류 칸(「초본」, 골라짐)은 남고 본인·가족 같은 고르는 칸은 빠짐',
  choiceCriteria.초본?.state === 'already selected' && !['본인', '가족', '등본', '전체 포함', '최근 5년'].some((k) => choiceKeys.includes(k)),
  choiceKeys.join(', '),
);
check(
  '신청서: 「다음」을 가리키고 위쪽 줄에 "직접 골라 주세요"',
  formFake.rings === 1 && formFake.msg.includes('「다음」') && formFake.stage.includes('「본인」·「가족」') && formFake.stage.includes('직접 골라 주세요'),
  `테두리 ${formFake.rings}개 · ${formFake.stage} · ${formFake.msg}`,
);
await page.screenshot({ path: join(OUT, '5-form-choices.png') });
// 5-2c. 검색 칸을 가리키면 서류 이름 「… 글자 복사하기」 단추가 뜨고, 누르면 복사된다 (칸에 대신 적지는 않는다)
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://www.gov.kr' });
const searchFake = await fake('search', 'search-box.html');
const copyLabel = (await shadow('[data-act="copy"]').isVisible()) ? await shadow('[data-act="copy"]').textContent() : '';
await shadow('[data-act="copy"]').click();
await page.waitForTimeout(200);
const copyNote = await shadow('.copy-note').textContent();
const clip = await page.evaluate(() => navigator.clipboard.readText()).catch((e) => `읽기 실패: ${e.message}`);
const typed = await page.locator('input[type="search"]').inputValue();
check(
  '검색 칸: 서류 이름 복사 단추 → 누르면 복사되고 붙여 넣는 법 안내, 칸에는 대신 적지 않음',
  searchFake.rings === 1 && copyLabel.includes('「주민등록표 초본」') && copyNote.includes('복사했어요') && clip === '주민등록표 초본' && typed === '',
  `${copyLabel} · ${copyNote} · 클립보드=${clip} · 칸=${typed}`,
);
await page.screenshot({ path: join(OUT, '5-search-copy.png') });
// 5-2d. 두 줄 카드 중 첫 줄이 같은 것(「가족관계」 ×3, 「제적」 ×2)이 하나로 합쳐지지 않고 모두 서버로 간다 (0.1.2)
const cardsFake = await fake('cards', 'cards.html', 'efamily.scourt.go.kr');
const cardKeys = Object.keys(cardsFake.asks.at(-1)?.questions.nextControl.criteria ?? {});
const wantCards = ['가족관계 등록부정정', '제적 등본', '제적 초본', '가족관계 등록창설', '가족관계 증명서', '출생'];
check(
  '두 줄 카드: 첫 줄이 같아도 모두 남고, 이름은 첫 줄+둘째 줄로 합쳐 서버에 감 (정답 카드가 뒤에 있어도 사라지지 않음)',
  wantCards.every((k) => cardKeys.includes(k)) && new Set(cardKeys).size === cardKeys.length,
  cardKeys.join(', '),
);

// 5-3. 가리킨 곳을 누르면 그 판단은 버려진다 (민원안내 페이지에서 「발급하기」를 누른 직후 테두리가 사라지고 다시 찾는다)
since = requests.length;
await page.goto(INFO, { waitUntil: 'domcontentloaded' });
await settle('5-follow-0', { since });
await page.getByRole('link', { name: '발급하기', exact: true }).first().click();
await page.waitForTimeout(150);
check('가리킨 곳을 누르면 바로 테두리가 사라짐', (await shadow('.ring').count()) === 0, `테두리 ${await shadow('.ring').count()}개`);

// 6. 약관 화면 (가짜 화면, www.gov.kr 주소로 띄움 — 요청은 정부24로 가지 않는다)
const CONSENT = 'https://www.gov.kr/__gvrnmnt24_test__/consent.html';
await context.route(CONSENT, (route) =>
  route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: readFileSync(join(root, 'test/fixtures/consent.html'), 'utf8') }),
);
since = requests.length;
await page.goto(CONSENT, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('gvrnmnt24-guide')?.shadowRoot.querySelectorAll('.ring').length > 0, null, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(400);
const consentRings = await shadow('.ring').count();
const consentMsg = await shadow('.msg').textContent();
await page.screenshot({ path: join(OUT, '6-consent.png') });
// 테두리가 감싼 요소의 id를 모은다
const ringed = await page.evaluate(() => {
  const r = document.querySelector('gvrnmnt24-guide').shadowRoot;
  return [...r.querySelectorAll('.ring')].map((ring) => {
    const b = ring.getBoundingClientRect();
    const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return el?.id || el?.getAttribute('for') || el?.tagName;
  });
});
check('약관: 필수 3곳만 표시 (선택·전체 동의·동의하지 않음 제외)', consentRings === 3 && ['t1', 't2', 'u1'].every((id) => ringed.includes(id)), `${consentRings}곳: ${ringed.join(', ')}`);
check('약관: Jev에 묻지 않음 (코드가 처리)', requests.slice(since).every((b) => !b.questions?.nextControl));
check('약관: 선택은 안 해도 된다고 안내', consentMsg.includes('「선택」'), consentMsg);
const consentPanel = await cover();
check('안내 창: 가리지 않으면 기본 자리(오른쪽) 그대로', !consentPanel.left && !consentPanel.hit, JSON.stringify(consentPanel));

// 필수를 다 체크하면 Jev에 다음 버튼을 묻는다. 이때 선택·전체 동의·동의하지 않음은 후보에 없어야 한다
since = requests.length;
for (const id of ['t1', 't2', 'u1']) await page.check(`#${id}`);
const consentNext = await settle('7-consent-next', { since });
const consentAsk = requests.slice(since).find((b) => b.questions?.nextControl);
const consentKeys = Object.keys(consentAsk?.questions.nextControl.criteria ?? {});
check(
  '약관: 다 체크하면 다음 버튼을 물음, 선택 항목은 후보에서 빠짐',
  consentNext.msg.includes('다음') && !consentKeys.some((k) => /선택\]|전체 동의|동의하지 않음/.test(k)),
  consentKeys.join(', '),
);

// 개인정보·형식 점검 (보낸 모든 요청)
const asks = requests.filter((b) => b.questions?.nextControl);
check(
  '요청 state 필드가 정해진 것뿐',
  asks.every((b) => JSON.stringify(Object.keys(b.state).sort()) === '["alreadyPressed","goal","page","site","userSituation"]'),
);
check(
  '후보 이름에 개인정보 패턴 없음',
  asks.every((b) => Object.keys(b.questions.nextControl.criteria).every((k) => !looksPersonal(k))),
);
check('주소에 쿼리 없음', asks.every((b) => !b.state.page.address.includes('?')));

// 중계로 가는 본문은 정해진 필드뿐이어야 한다. 확장은 TypeSafe를 직접 부르지 않는다.
const guideBodies = relayRequests.filter((b) => b.goalId);
check(
  '중계로 보낸 본문 필드가 정해진 것뿐',
  guideBodies.length > 0 &&
    guideBodies.every((b) => JSON.stringify(Object.keys(b).sort()) === '["candidates","goalId","page","pressed"]') &&
    relayRequests.filter((b) => b.query !== undefined).every((b) => JSON.stringify(Object.keys(b)) === '["query"]'),
  JSON.stringify([...new Set(relayRequests.map((b) => Object.keys(b).sort().join('+')))]),
);
check('확장이 TypeSafe를 직접 부르지 않음 (키는 서버에만)', typesafeCalls.length === 0, typesafeCalls.join(', '));
check('중계 요청에 쿼리·세션 값 없는 주소', guideBodies.every((b) => !b.page.path.includes('?') && !b.page.path.includes(';')));

relay.close();
await context.close();
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.checks.every((c) => c.ok) ? 0 : 1);

// 설정 창 (신뢰 영역). 서버 연결 확인·동의 취소·안내 끝내기·최근 판단 보기.

const $ = (id) => document.getElementById(id);

const RELAY_ERROR = {
  timeout: '서버가 늦게 대답해요. 서버가 잠들어 있다가 깨어나는 중일 수 있으니 한 번 더 눌러 보세요.',
  network: '인터넷 연결을 확인해 주세요.',
  server: '서버에 문제가 있어요.',
};

function setText(el, text, tone) {
  el.textContent = text;
  el.className = tone ?? '';
}

function time(at) {
  return new Date(at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function describe(d) {
  if (d.error) return `오류 ${d.error}${d.status ? ` (${d.status})` : ''}`;
  if (d.path === 'search') return `민원 찾기 → 1순위 「${d.choice ?? '없음'}」 · 보여 준 후보 ${d.results}개 · ${d.latencyMs}ms`;
  const pick = d.kind === 'point' ? `「${d.label}」을 가리킴` : '잘 모르겠다고 답함';
  return `${d.stage ?? '단계 모름'} → ${pick} · 후보 ${d.candidates}개 · ${d.latencyMs}ms`;
}

function render(s) {
  setText($('consentState'), s.consented ? '동의했어요.' : '아직 동의하지 않았어요. 정부24 화면의 길잡이 창에서 동의할 수 있어요.', s.consented ? 'ok' : 'bad');
  $('revoke').hidden = !s.consented;
  // stopped: 「민원 찾기」만 연달아 나와 서버에 묻지 않고 멈춘 상태 (안내 창에서 「계속 찾아보기」로 풀린다)
  const guideText = s.active ? `안내 중: ${s.goalTitle}${s.stopped ? ' (찾는 서류를 못 찾아 멈춤)' : ''}` : '안내하고 있지 않아요.';
  setText($('guideState'), guideText);
  $('pressed').textContent = s.pressed?.length ? `지금까지 누른 곳: ${s.pressed.join(' → ')}` : '';
  $('stop').hidden = !s.active;
  const log = $('log');
  log.replaceChildren();
  for (const d of [...(s.decisions ?? [])].reverse()) {
    const li = document.createElement('li');
    li.textContent = `${time(d.at)} ${d.path} — ${describe(d)}`;
    log.append(li);
  }
  if (!log.children.length) {
    const li = document.createElement('li');
    li.textContent = '아직 기록이 없어요.';
    log.append(li);
  }
}

async function refresh() {
  render(await chrome.runtime.sendMessage({ type: 'popup/state' }));
}

$('test').addEventListener('click', async () => {
  setText($('relayState'), '연결 확인 중…');
  const res = await chrome.runtime.sendMessage({ type: 'relay/test' });
  if (res.ok && res.enabled) setText($('relayState'), '연결됐어요.', 'ok');
  else if (res.ok) setText($('relayState'), '서버가 잠시 멈춰 있어요.', 'bad');
  else setText($('relayState'), `연결 실패: ${RELAY_ERROR[res.code] ?? res.code}`, 'bad');
});

$('revoke').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'consent/revoke' });
  refresh();
});

$('stop').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'guide/stop' });
  refresh();
});

$('logClear').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'log/clear' });
  refresh();
});

// 마지막으로 서버에 보낸 화면 정보(걸러진 것)를 시험 자료(test/fixtures/pages.json) 한 칸 모양으로 복사한다.
// 정답(expected·expectedStage)은 비워 두고, 사람이 화면을 보고 채운다.
function fixtureEntry({ at, goalId, page, candidates, pressed }) {
  return {
    name: page.title || page.path,
    source: `설정 창에서 복사 (${new Date(at).toISOString().slice(0, 10)})`,
    goalId,
    expected: [],
    expectedStage: '',
    page,
    pressed,
    candidates: candidates.map(({ id, ...c }) => c),
  };
}

$('copyLast').addEventListener('click', async () => {
  const { payload } = await chrome.runtime.sendMessage({ type: 'popup/lastPayload' });
  if (!payload) {
    setText($('copyState'), '아직 서버로 보낸 화면이 없어요. 안내를 받은 뒤 다시 눌러 주세요.', 'bad');
    return;
  }
  try {
    await navigator.clipboard.writeText(JSON.stringify(fixtureEntry(payload), null, 2));
    setText($('copyState'), `복사했어요: ${payload.page.title || payload.page.path} (후보 ${payload.candidates.length}개)`, 'ok');
  } catch {
    setText($('copyState'), '복사가 안 됐어요. 설정 창을 한 번 누른 뒤 다시 해 주세요.', 'bad');
  }
});

refresh();

// 설정 창 (신뢰 영역). 키 저장·연결 확인·안내 끝내기·최근 판단 보기.

const $ = (id) => document.getElementById(id);

const KEY_ERROR = {
  no_key: '키가 없어요.',
  auth: '키가 맞지 않아요. 다시 확인해 주세요.',
  credit: 'TypeSafe 크레딧이 부족해요.',
  rate: '요청이 너무 많아요. 잠시 뒤 다시 해 주세요.',
  overloaded: 'TypeSafe가 바빠요. 잠시 뒤 다시 해 주세요.',
  timeout: '응답이 늦어요. 다시 해 주세요.',
  network: '인터넷 연결을 확인해 주세요.',
};

function setText(el, text, tone) {
  el.textContent = text;
  el.className = tone ?? '';
}

function time(at) {
  return new Date(at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function render(s) {
  setText($('keyState'), s.hasKey ? '키가 저장돼 있어요.' : '키가 없어요. 아래에 넣어 주세요.', s.hasKey ? 'ok' : 'bad');
  setText($('guideState'), s.active ? `안내 중: ${s.goalTitle}` : '안내하고 있지 않아요.');
  $('pressed').textContent = s.pressed?.length ? `지금까지 누른 곳: ${s.pressed.join(' → ')}` : '';
  $('stop').hidden = !s.active;
  const log = $('log');
  log.replaceChildren();
  for (const d of [...(s.decisions ?? [])].reverse()) {
    const li = document.createElement('li');
    const what = d.error
      ? `오류 ${d.error}${d.status ? ` (${d.status})` : ''}`
      : d.path === 'search'
        ? `민원 찾기 → 1순위 「${d.choice}」 · 보여 준 후보 ${d.results}개 · ${d.latencyMs}ms`
        : `${d.stage ?? '단계 모름'} → 「${d.choice}」 확률 ${Number(d.probability).toFixed(2)} · 후보 ${d.candidates}개 · ${d.latencyMs}ms`;
    li.textContent = `${time(d.at)} ${d.path} — ${what}`;
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

$('save').addEventListener('click', async () => {
  const key = $('key').value.trim();
  if (!key) {
    setText($('keyState'), '키를 먼저 넣어 주세요.', 'bad');
    return;
  }
  await chrome.runtime.sendMessage({ type: 'key/save', key });
  $('key').value = '';
  setText($('keyState'), '연결 확인 중…');
  const res = await chrome.runtime.sendMessage({ type: 'key/test' });
  await refresh();
  setText($('keyState'), res.ok ? '연결됐어요.' : `연결 실패: ${KEY_ERROR[res.code] ?? res.code}`, res.ok ? 'ok' : 'bad');
});

$('clear').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'key/clear' });
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

refresh();

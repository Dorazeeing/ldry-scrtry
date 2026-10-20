// Jev 시험 (실제 호출, 비용 발생): 정부24 화면 후보 목록(test/fixtures/pages.json)으로 "다음에 누를 곳" 정답률을 잰다.
// 후보 순서를 바꿔 여러 번 보낸다 (Choice가 앞쪽 선택지를 선호하는지 확인).
// 키는 환경변수로만 받는다:  TYPESAFE_API_KEY=... npm run trial   (선택: ROUNDS=3)
// 결과: trial-out/trial-<시각>.json + 화면 표

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSearchRequest, pickServices } from '../src/lib/catalog.js';
import { MIN_PROBABILITY, callJev, decide } from '../src/lib/jev.js';
import { prepareGuide } from '../src/lib/guide.js';

const key = process.env.TYPESAFE_API_KEY;
if (!key) {
  console.error('TYPESAFE_API_KEY 환경변수가 없어요. 예: TYPESAFE_API_KEY=... npm run trial');
  process.exit(1);
}
const ROUNDS = Number(process.env.ROUNDS ?? 3);
const MODE = process.env.MODE ?? 'all'; // all | pages | search
const root = new URL('..', import.meta.url).pathname;
const pages = JSON.parse(readFileSync(join(root, 'test/fixtures/pages.json'), 'utf8'));

// 0회차: 원래 순서, 1회차: 거꾸로, 2회차 이후: 섞기 (시드 고정)
function order(list, round) {
  if (round === 0) return list;
  if (round === 1) return [...list].reverse();
  let seed = round * 7919;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  return [...list].sort(() => rand() - 0.5);
}

// 민원 찾기 시험: 쉬운 말 → 목록 후보 (1순위가 맞는지, 보여 주는 후보 안에 있는지)
const searches = JSON.parse(readFileSync(join(root, 'test/fixtures/search.json'), 'utf8'));
const searchRows = [];
if (MODE !== 'pages') {
  for (const s of searches) {
    const started = performance.now();
    try {
      const res = await callJev(key, buildSearchRequest(s.query));
      const ms = Math.round(performance.now() - started);
      const shown = pickServices(res).map((c) => c.id);
      const top = Object.entries(res.answers.service.probabilities).sort((a, b) => b[1] - a[1]).slice(0, 3);
      searchRows.push({
        query: s.query,
        first: shown[0] ?? '(없음)',
        firstCorrect: s.expected.includes(shown[0]),
        inShown: shown.some((id) => s.expected.includes(id)),
        // expectAll: 둘 이상이 모두 보여야 하는 말 (예: 「사업자등록증」은 증명과 재발급 둘 다)
        allShown: s.expectAll ? s.expected.every((id) => shown.includes(id)) : true,
        shown,
        top3: top.map(([k, v]) => `${k} ${v.toFixed(2)}`),
        ms,
        inputTokens: res.usage?.input_tokens,
      });
    } catch (e) {
      searchRows.push({ query: s.query, error: e.code ?? String(e) });
    }
  }
}

const rows = [];
for (const p of MODE === 'search' ? [] : pages) {
  for (let round = 0; round < ROUNDS; round += 1) {
    // 운영과 같은 경로(중계 서버의 prepareGuide)로 거른다: 로그인 방법을 고르는 화면은 넘기고, 로그인 버튼은 후보에서 뺀다
    const prep = prepareGuide({
      goalId: p.goalId ?? 'resident_abstract',
      page: p.page,
      candidates: order(p.candidates, round).map((c, id) => ({ ...c, id })),
      pressed: p.pressed,
    });
    if (prep.result) {
      // Jev를 부르지 않는 경우 (넘김). 정답은 expectedHandoff
      rows.push({ page: p.name, round, choice: prep.result.kind, probability: 1, confidence: 1, correct: Boolean(p.expectedHandoff) && prep.result.kind === 'handoff', shown: false, stage: prep.result.stage, stageCorrect: true, top3: [], ms: 0, inputTokens: 0, handoff: true });
      continue;
    }
    const { body, candidates } = prep;
    const started = performance.now();
    try {
      const res = await callJev(key, body);
      const ms = Math.round(performance.now() - started);
      const d = decide(res, candidates);
      const next = res.answers.nextControl;
      const top = Object.entries(next.probabilities).sort((a, b) => b[1] - a[1]).slice(0, 3);
      rows.push({
        page: p.name,
        round,
        choice: next.choice,
        probability: next.probabilities[next.choice],
        confidence: next.confidence,
        correct: p.expected.includes(next.choice),
        shown: d.kind === 'point',
        stage: d.stage,
        stageCorrect: d.stage === p.expectedStage,
        jevStage: res.answers.pageStage?.choice,
        top3: top.map(([k, v]) => `${k} ${v.toFixed(2)}`),
        ms,
        inputTokens: res.usage?.input_tokens,
      });
    } catch (e) {
      rows.push({ page: p.name, round, error: e.code ?? String(e), status: e.status });
    }
  }
}

const sOk = searchRows.filter((r) => !r.error);
const search = {
  calls: searchRows.length,
  errors: searchRows.length - sOk.length,
  firstCorrect: sOk.filter((r) => r.firstCorrect).length,
  inShown: sOk.filter((r) => r.inShown).length,
  allShown: sOk.filter((r) => r.allShown).length,
  inputTokens: sOk.reduce((s, r) => s + (r.inputTokens ?? 0), 0),
};
const ok = rows.filter((r) => !r.error);
const sorted = ok.map((r) => r.ms).sort((a, b) => a - b);
const summary = {
  at: new Date().toISOString(),
  model: 'jev-latest',
  minProbability: MIN_PROBABILITY,
  calls: rows.length,
  errors: rows.length - ok.length,
  accuracy: ok.length ? ok.filter((r) => r.correct).length / ok.length : null,
  // 화면에 테두리를 그린 것 중 틀린 것 (잘못 안내한 비율)
  wrongShown: ok.filter((r) => r.shown && !r.correct).length,
  notShown: ok.filter((r) => !r.shown).length,
  stageAccuracy: ok.length ? ok.filter((r) => r.stageCorrect).length / ok.length : null,
  latencyMs: { median: sorted[Math.floor(sorted.length / 2)] ?? null, max: sorted.at(-1) ?? null },
  inputTokens: ok.reduce((s, r) => s + (r.inputTokens ?? 0), 0),
  search,
};

mkdirSync(join(root, 'trial-out'), { recursive: true });
const file = join(root, 'trial-out', `trial-${summary.at.replace(/[:.]/g, '-')}.json`);
writeFileSync(file, JSON.stringify({ summary, rows, searchRows }, null, 2));

if (searchRows.length) {
  console.table(
    searchRows.map((r) =>
      r.error
        ? { 적은말: r.query, 결과: `오류 ${r.error}` }
        : { 적은말: r.query, 일순위: r.first, 맞음: r.firstCorrect ? 'O' : 'X', 후보안: r.inShown ? 'O' : 'X', 모두: r.allShown ? 'O' : 'X', 보여준것: r.shown.join(', '), ms: r.ms },
    ),
  );
}

if (rows.length) console.table(
  rows.map((r) =>
    r.error
      ? { 화면: r.page, 회차: r.round, 결과: `오류 ${r.error}` }
      : {
          화면: r.page,
          회차: r.round,
          고른것: r.choice,
          확률: r.probability.toFixed(2),
          확신: r.confidence.toFixed(2),
          정답: r.correct ? 'O' : 'X',
          표시: r.shown ? '테두리' : '모르겠어요',
          단계: `${r.stage}${r.stageCorrect ? '' : ' (X)'}`,
          ms: r.ms,
        },
  ),
);
console.log(summary);
console.log(`저장: ${file}`);

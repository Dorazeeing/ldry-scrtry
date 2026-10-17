import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { goalFor } from '../src/lib/catalog.js';
import { STAGES } from '../src/lib/goals.js';
import { prepareGuide } from '../src/lib/guide.js';
import { detectHandoff } from '../src/lib/handoff.js';
import { buildRequest } from '../src/lib/jev.js';
import { cleanCandidates, looksPersonal } from '../src/lib/sanitize.js';

const pages = JSON.parse(readFileSync(new URL('./fixtures/pages.json', import.meta.url), 'utf8'));

for (const p of pages) {
  const { candidates } = cleanCandidates(p.candidates.map((c, id) => ({ ...c, id })));
  if (p.expectedHandoff) {
    test(`시험 화면 "${p.name}": 로그인 방법을 고르는 화면이라 직접 고르게 넘긴다 (테두리 없음, 서버에 안 물음)`, () => {
      assert.equal(detectHandoff(candidates), true);
    });
    continue;
  }
  test(`시험 화면 "${p.name}": 넘기지 않고, 정답이 후보에 있고, 로그인 버튼은 후보에서 빠지고, 요청 형식이 맞다`, () => {
    assert.equal(detectHandoff(candidates), false, '정부24 머리글의 「로그인」·「회원가입」만으로는 넘기지 않는다');
    // 운영과 같은 길(중계 서버의 prepareGuide)로 거른다: 로그인 버튼·사용자가 직접 고르는 칸·이미 온 서류의 메뉴 링크가 빠진다
    const prep = prepareGuide({ goalId: p.goalId ?? 'resident_abstract', page: p.page, candidates, pressed: p.pressed });
    const list = prep.candidates;
    const labels = list.map((c) => c.label);
    assert.ok(p.expected.some((e) => labels.includes(e)), `정답 ${p.expected} 이(가) 후보에서 빠지면 Jev가 고를 수 없다`);
    assert.ok(!labels.some((l) => /로그인|회원가입/.test(l)), '로그인 버튼은 후보에 없다');
    for (const l of p.notSent ?? []) assert.ok(!labels.includes(l), `「${l}」은(는) 보내지 않는다`);
    assert.ok(p.expectedStage in STAGES);
    const body = buildRequest({ goal: goalFor(p.goalId ?? 'resident_abstract'), page: p.page, candidates: list, pressed: p.pressed });
    const options = Object.keys(body.questions.nextControl.criteria);
    assert.ok(options.length <= 255, 'Choice 선택지는 255개까지');
    assert.ok(options.every((o) => !looksPersonal(o)));
  });
}

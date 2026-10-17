import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { goalFor } from '../src/lib/catalog.js';
import { STAGES } from '../src/lib/goals.js';
import { buildRequest } from '../src/lib/jev.js';
import { cleanCandidates, looksPersonal } from '../src/lib/sanitize.js';

const pages = JSON.parse(readFileSync(new URL('./fixtures/pages.json', import.meta.url), 'utf8'));

for (const p of pages) {
  test(`시험 화면 "${p.name}": 정답이 후보에 있고, 요청 형식이 맞다`, () => {
    const { candidates } = cleanCandidates(p.candidates.map((c, id) => ({ ...c, id })));
    const labels = candidates.map((c) => c.label);
    assert.ok(p.expected.some((e) => labels.includes(e)), `정답 ${p.expected} 이(가) 후보에서 빠지면 Jev가 고를 수 없다`);
    assert.ok(p.expectedStage in STAGES);
    const body = buildRequest({ goal: goalFor('resident_abstract'), page: p.page, candidates, pressed: p.pressed });
    const options = Object.keys(body.questions.nextControl.criteria);
    assert.ok(options.length <= 255, 'Choice 선택지는 255개까지');
    assert.ok(options.every((o) => !looksPersonal(o)));
  });
}

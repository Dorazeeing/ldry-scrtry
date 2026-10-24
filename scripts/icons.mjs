// 아이콘(16·48·128)과 스토어 작은 홍보 이미지(440×280)를 만든다. 크롬(Playwright)으로 그려 PNG로 저장한다.
// 실행: node scripts/icons.mjs   (Playwright는 smoke.mjs처럼 reference/slop-detector 것을 빌려 쓴다)
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { findBrowser } from './browser.mjs';

const root = new URL('..', import.meta.url).pathname;
const { chromium } = createRequire(process.env.PLAYWRIGHT_FROM ?? join(root, 'reference/slop-detector/package.json'))('playwright');
mkdirSync(join(root, 'icons'), { recursive: true });

// 파란 바탕, 흰 버튼, 빨간 테두리, 위에서 가리키는 화살표 — "여기를 누르세요"를 그대로 그림
const art = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="26" fill="#1d3faf"/>
  <path d="M64 22 L84 46 L44 46 Z" fill="#ffffff"/>
  <rect x="22" y="58" width="84" height="40" rx="12" fill="#ffffff"/>
  <rect x="14" y="50" width="100" height="56" rx="18" fill="none" stroke="#e5231b" stroke-width="7"/>
</svg>`;

const browser = await chromium.launch({ channel: 'chromium', executablePath: findBrowser(chromium) });
const page = await browser.newPage();
for (const size of [16, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0;background:transparent">${art(size)}</body>`);
  await page.screenshot({ path: join(root, 'icons', `icon${size}.png`), omitBackground: true });
}
await page.setViewportSize({ width: 440, height: 280 });
await page.setContent(`<body style="margin:0;width:440px;height:280px;background:#e8eefc;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;display:flex;align-items:center;gap:24px;padding:0 32px;box-sizing:border-box">
  ${art(120)}
  <div><div style="font-size:40px;font-weight:800;color:#1d3faf;line-height:1.2">민원 길잡이</div>
  <div style="font-size:22px;color:#111;margin-top:8px;line-height:1.4">정부24에서 다음에<br>누를 곳을 알려 줘요</div>
  <div style="font-size:16px;color:#3d3d3d;margin-top:10px">비공식 · 정부24와 관계없어요</div></div></body>`);
await page.screenshot({ path: join(root, 'icons', 'promo-440x280.png') });
await browser.close();
console.log('icons/ 에 icon16·48·128, promo-440x280 저장');

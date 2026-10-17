// Playwright가 기대하는 브라우저 버전이 이 PC에 없으면, 이미 받아 둔 Chrome for Testing을 찾아 쓴다 (smoke·icons 공용).
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function findBrowser(chromium) {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const expected = chromium.executablePath();
  if (existsSync(expected)) return undefined;
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  const app = 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
  for (const dir of existsSync(cache) ? readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : []) {
    for (const arch of ['chrome-mac-arm64', 'chrome-mac-x64', 'chrome-mac']) {
      const p = join(cache, dir, arch, app);
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}


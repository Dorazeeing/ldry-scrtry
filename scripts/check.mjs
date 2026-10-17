// 패키지 검사: 문법, 매니페스트가 가리키는 파일, 권한 범위, 외부 스크립트, 키 흔적.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const problems = [];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

// src(확장)와 server(중계) 둘 다 검사한다
const srcFiles = [...walk(join(root, 'src')), ...walk(join(root, 'server'))];
for (const f of srcFiles.filter((f) => f.endsWith('.js'))) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    problems.push(`문법 오류: ${relative(root, f)}\n${e.stderr}`);
  }
}

const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const referenced = [
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  ...(manifest.content_scripts ?? []).flatMap((c) => c.js ?? []),
];
for (const f of [...referenced, ...Object.values(manifest.icons ?? {}), ...Object.values(manifest.action?.default_icon ?? {})])
  if (!existsSync(join(root, f))) problems.push(`매니페스트가 가리키는 파일 없음: ${f}`);
for (const n of ['16', '48', '128']) if (!manifest.icons?.[n]) problems.push(`manifest icons.${n} 없음 (웹스토어 필수)`);

// 사이트 권한은 src/lib/sites.js 목록(정부24 + 공지에 나온 기관 사이트)과 TypeSafe 주소뿐이어야 한다
const { MATCHES } = await import('../src/lib/sites.js');
const hosts = [...(manifest.host_permissions ?? []), ...(manifest.content_scripts ?? []).flatMap((c) => c.matches)];
const { RELAY_URL } = await import('../src/lib/relay.js');
const allowedHosts = [`${RELAY_URL}/*`, ...MATCHES];
// 확장에서 TypeSafe를 직접 부르지 않는다 (키는 중계 서버에만)
if ((manifest.host_permissions ?? []).some((h) => h.includes('typesafe.ai'))) problems.push('확장이 typesafe.ai 권한을 가지면 안 된다 (중계로만)');
if (JSON.stringify(manifest.host_permissions) !== JSON.stringify([`${RELAY_URL}/*`])) problems.push('manifest host_permissions가 src/lib/relay.js RELAY_URL과 다르다');
for (const h of hosts) if (!allowedHosts.includes(h)) problems.push(`허용 목록 밖의 사이트 권한: ${h}`);
const contentMatches = (manifest.content_scripts ?? []).flatMap((c) => c.matches);
if (JSON.stringify(contentMatches) !== JSON.stringify(MATCHES)) problems.push('manifest content_scripts.matches가 src/lib/sites.js MATCHES와 다르다');
if (JSON.stringify(manifest).includes('<all_urls>')) problems.push('<all_urls> 권한 금지');

for (const f of srcFiles) {
  const text = readFileSync(f, 'utf8');
  if (/<script[^>]+src=["']https?:/i.test(text) || /import\s*\(?\s*["']https?:/.test(text)) {
    problems.push(`외부 스크립트 불러오기 금지: ${relative(root, f)}`);
  }
  // 키 형식을 몰라도 잡히도록: 따옴표 안의 32자 이상 영문·숫자 덩어리
  if (/["'`][A-Za-z0-9_\-]{32,}["'`]/.test(text)) problems.push(`키로 보이는 문자열: ${relative(root, f)}`);
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`check 통과: src ${srcFiles.length}개 파일, 사이트 권한 ${hosts.length}개`);

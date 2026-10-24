// 스토어에 올릴 zip을 만든다: manifest.json(+ src, icons)만 묶고, 개발용 공개 키("key")는 뺀다.
// "key"는 폴더로 불러온 확장의 ID를 고정하려고 넣은 것이다 (폴더 이름이 바뀌어도 ID가 같아 서버가 받는다).
// 스토어판의 ID는 스토어가 정하므로 zip에는 넣지 않는다.
// 이름이 「.」으로 시작하는 파일·폴더(.DS_Store, 도구가 남긴 .omc 등)는 넣지 않는다 (2026-10-24: src/lib/.omc가 생겨 zip에 들어갈 뻔함).
// manifest.json과 package.json의 버전이 다르면 만들지 않는다 (참고: chy4pro/jev-for-chrome, MIT).
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const out = join(root, 'ldry-scrtry.zip');
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if (manifest.version !== pkg.version) {
  console.error(`버전이 달라요: manifest.json ${manifest.version}, package.json ${pkg.version}. 둘을 같게 맞춘 뒤 다시 하세요.`);
  process.exit(1);
}
const notHidden = (src) => !basename(src).startsWith('.');
const stage = mkdtempSync(join(tmpdir(), 'ldry-scrtry-pack-'));
try {
  delete manifest.key;
  writeFileSync(join(stage, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  cpSync(join(root, 'src'), join(stage, 'src'), { recursive: true, filter: notHidden });
  cpSync(join(root, 'icons'), join(stage, 'icons'), { recursive: true, filter: notHidden });
  rmSync(out, { force: true });
  execFileSync('zip', ['-r', '-q', '-X', out, 'manifest.json', 'src', 'icons', '-x', '*.DS_Store'], { cwd: stage });
  console.log(`만들었어요: ${out} (버전 ${manifest.version}, 개발용 key 뺌)`);
} finally {
  rmSync(stage, { recursive: true, force: true });
}

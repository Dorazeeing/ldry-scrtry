// 스토어에 올릴 zip을 만든다: manifest.json(+ src, icons)만 묶고, 개발용 공개 키("key")는 뺀다.
// "key"는 폴더로 불러온 확장의 ID를 고정하려고 넣은 것이다 (폴더 이름이 바뀌어도 ID가 같아 서버가 받는다).
// 스토어판의 ID는 스토어가 정하므로 zip에는 넣지 않는다.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const out = join(root, 'ldry-scrtry.zip');
const stage = mkdtempSync(join(tmpdir(), 'ldry-scrtry-pack-'));
try {
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  delete manifest.key;
  writeFileSync(join(stage, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  cpSync(join(root, 'src'), join(stage, 'src'), { recursive: true });
  cpSync(join(root, 'icons'), join(stage, 'icons'), { recursive: true });
  rmSync(out, { force: true });
  execFileSync('zip', ['-r', '-q', '-X', out, 'manifest.json', 'src', 'icons', '-x', '*.DS_Store'], { cwd: stage });
  console.log(`만들었어요: ${out} (버전 ${manifest.version}, 개발용 key 뺌)`);
} finally {
  rmSync(stage, { recursive: true, force: true });
}

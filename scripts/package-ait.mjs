/**
 * `ait build`가 만든 번들을 **버전이 붙은 이름으로 복사**해요.
 *
 * 왜 필요하냐면, `ait build`는 항상 `<appName>.ait` 하나만 만들어서
 * 새로 빌드할 때마다 직전 번들을 덮어써요. 콘솔에 이미 올린 제출본과
 * 다음 버전을 같이 들고 있어야 하는데(심사 중 롤백·비교), 그게 안 돼요.
 *
 * 그래서 빌드가 끝나면 이 스크립트가 `orbit-jump_2.0v.ait` 처럼
 * package.json의 version을 붙인 사본을 남겨요. 원본(`orbit-jump.ait`)은
 * 그대로 두니 `ait deploy`는 평소처럼 쓰면 됩니다.
 *
 *   1.1.0 → orbit-jump_1.1v.ait
 *   2.0.0 → orbit-jump_2.0v.ait
 */
import { copyFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

// appName은 apps-in-toss.config.ts에 있어요. TS 파일을 실행하지 않고 값만 뽑아 써요.
const configSrc = readFileSync(resolve(root, 'apps-in-toss.config.ts'), 'utf8');
const appName = configSrc.match(/appName:\s*['"]([^'"]+)['"]/)?.[1];

if (!appName) {
  console.error('[package-ait] apps-in-toss.config.ts에서 appName을 찾지 못했어요.');
  process.exit(1);
}

const source = resolve(root, `${appName}.ait`);
if (!existsSync(source)) {
  console.error(`[package-ait] ${appName}.ait 가 없어요. \`ait build\`가 먼저 끝나야 해요.`);
  process.exit(1);
}

// 2.0.0 → "2.0" (앞의 두 자리만 써요. 콘솔에 올릴 때 쓰는 표기와 맞춰요)
const [major, minor] = pkg.version.split('.');
const target = resolve(root, `${appName}_${major}.${minor}v.ait`);

copyFileSync(source, target);

const kb = (statSync(target).size / 1024).toFixed(0);
console.log(`[package-ait] ${appName}_${major}.${minor}v.ait (${kb} KB) 를 만들었어요.`);

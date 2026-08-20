import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

/**
 * `src/main.js`의 `import ... from './platform.js'` 만 데스크톱 어댑터로 바꿔요.
 *
 * 게임 코드를 복사하지 않고 원본(../src)을 그대로 쓰기 위한 장치예요.
 * 토스 빌드는 이 설정을 안 타므로 아무 영향이 없어요.
 */
function useDesktopPlatform() {
  const target = resolve(here, 'src/platform.js');
  const tossPlatform = resolve(repoRoot, 'src/platform.js');

  return {
    name: 'ms-store-desktop-platform',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source !== './platform.js' || !importer) return null;
      // main.js가 부르는 것만 바꿔요. (경로를 정확히 확인해서 오작동을 막아요)
      if (resolve(dirname(importer), source) !== tossPlatform) return null;
      return target;
    },
  };
}

export default defineConfig({
  // 게임 원본을 그대로 쓰려고 저장소 루트를 root로 잡아요.
  root: repoRoot,

  /*
    Electron은 file:// 로 로드해서 절대경로(/assets/...)를 못 찾아요.
    반드시 상대경로로 뽑아야 합니다.
  */
  base: './',

  plugins: [useDesktopPlatform()],

  build: {
    // Electron이 쓰는 Chromium은 최신이라 다운레벨링이 필요 없어요.
    target: 'chrome120',
    outDir: resolve(here, 'dist'),
    emptyOutDir: true,
    assetsInlineLimit: 8192,
    rollupOptions: {
      // 게임 본편만 담아요. 홍보용 introduce.html은 스토어 앱에 필요 없어요.
      input: { main: resolve(repoRoot, 'index.html') },
    },
  },

  server: {
    port: 5273,
    // root 바깥(msbuild/src)의 어댑터를 dev에서도 읽을 수 있게 허용해요.
    fs: { allow: [repoRoot] },
  },
});

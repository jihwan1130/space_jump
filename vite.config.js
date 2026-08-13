import { defineConfig } from 'vite';

export default defineConfig({
  // 번들이 서브 경로에서 서빙되어도 자산을 찾을 수 있게 상대 경로로 뽑아요.
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 8192,
  },
  server: {
    port: 5173,
    host: true,
  },
});

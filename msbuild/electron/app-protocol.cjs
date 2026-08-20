/**
 * app:// 커스텀 프로토콜.
 *
 * file:// 로 열면 Vite가 뽑는 <script type="module">이 CORS로 차단돼요.
 * 진짜 origin을 만들어 주면 모듈이 정상 로드되고, localStorage도 origin 단위로
 * 안정적으로 유지됩니다. (세이브·보석이 업데이트 후에도 남아요)
 *
 * main.cjs와 스모크 테스트가 **같은 구현**을 쓰도록 여기로 뺐어요.
 */

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { protocol, net } = require('electron');

const RENDERER_DIR = path.join(__dirname, '..', 'dist');

/**
 * 콘텐츠 보안 정책.
 *
 * index.html은 토스 빌드와 공유하는 파일이라 meta 태그를 넣을 수 없어요.
 * (넣으면 토스 빌드까지 영향을 받아요) 그래서 응답 헤더로 붙입니다.
 *
 * 게임이 실제로 필요한 것만 열어 뒀어요.
 *  - 스크립트·스타일·이미지: 번들 안(self)
 *  - connect: Supabase 랭킹 서버만
 *  - object/frame: 전부 차단
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // 게임이 CSS 변수(--sa-top 등)를 JS로 세팅해요.
  "style-src 'self' 'unsafe-inline'",
  // 보석 아이콘이 data: URI SVG예요.
  "img-src 'self' data:",
  "font-src 'self'",
  // 랭킹·기록 저장 (Supabase)
  "connect-src 'self' https://*.supabase.co",
  "media-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

/** app 스킴을 특권 스킴으로 등록해요. app.whenReady() **이전에** 불러야 해요. */
function registerScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app',
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
    },
  ]);
}

/** 실제 파일을 서빙해요. app.whenReady() **이후에** 불러야 해요. */
function handle() {
  protocol.handle('app', async (request) => {
    const { pathname } = new URL(request.url);
    const rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
    const file = path.join(RENDERER_DIR, rel);

    // 번들 폴더 밖으로 새어 나가지 못하게 막아요.
    if (!file.startsWith(RENDERER_DIR)) {
      return new Response('Not found', { status: 404 });
    }

    const res = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(res.headers);
    headers.set('Content-Security-Policy', CSP);
    return new Response(res.body, { status: res.status, headers });
  });
}

module.exports = { registerScheme, handle, RENDERER_DIR, CSP };

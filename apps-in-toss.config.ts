import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  // 앱인토스 콘솔에 등록한 appName과 반드시 같아야 해요.
  // 딥링크도 intoss://orbit-jump 형태로 이 값을 씁니다.
  appName: 'orbit-jump',

  brand: {
    primaryColor: '#5FD0FF',
  },

  // 이 게임은 어떤 기기 권한도 쓰지 않아요.
  permissions: [],

  navigationBar: {
    // 좌측 "< 궤도탈출"(뒤로가기 + 앱 이름)을 숨겨요.
    // 단일 화면 게임이라 뒤로 갈 곳이 없는데 제목 줄이 게임 상단을 덮어요.
    // 우측 ··· · X 는 프레임워크 고정이라 끌 수 없고, 종료 경로는 그대로 남아요
    // (X + 안드로이드 뒤로가기 → backEvent → 종료 확인 모달).
    withBackButton: false,
    withTitle: false,
    // 게임 화면 위에 내비게이션 바가 얹히도록 투명 처리 (풀스크린 몰입)
    transparentBackground: true,
    // 배경이 어두우므로 밝은 아이콘이 나오는 dark 테마
    theme: 'dark',
  },

  webView: {
    // 캔버스 게임이라 스크롤/바운스/당겨서 새로고침이 모두 방해가 돼요.
    bounces: false,
    pullToRefreshEnabled: false,
    overScrollMode: 'never',
    // 운영체제 뒤로가기(스와이프) 제스처 비활성화 — 게임 출시 가이드 필수 항목
    allowsBackForwardNavigationGestures: false,
    // 효과음/BGM을 인라인으로 재생하고, 최초 사용자 입력 없이도 재개할 수 있게
    allowsInlineMediaPlayback: true,
    mediaPlaybackRequiresUserAction: false,
  },

  webBundleDir: 'dist',
});

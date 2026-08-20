/**
 * 데스크톱(MS Store) 플랫폼 어댑터.
 *
 * 토스 빌드의 `src/platform.js`와 **완전히 같은 이름·시그니처**를 내보내요.
 * 빌드할 때 vite.config.js가 `src/main.js`의 `./platform.js` import를 이 파일로
 * 바꿔치기하기 때문에, 게임 코드(main·game·skins·audio·cloud)는 한 줄도 안 고쳐도 돼요.
 *
 * 여기서는 `@apps-in-toss/web-framework`를 아예 import하지 않아요.
 * 그래서 MS Store 번들에는 토스 SDK가 한 바이트도 안 들어갑니다.
 *
 * 토스 전용 기능은 이렇게 처리했어요.
 *  - 리워드 광고 : `available: false` → 게임오버의 "광고보고 부활하기" 버튼이 항상 숨겨져요
 *  - 게임센터 랭킹 : `available: false` → "토스 게임센터 랭킹" 버튼이 항상 숨겨져요
 *  - 햅틱 : 데스크톱에는 진동 장치가 없어 조용히 무시해요
 *  - 안전영역 : 노치가 없으니 전부 0
 *  (Supabase 랭킹·보석·기록은 cloud.js가 따로 처리해서 그대로 동작해요)
 */

import { SAVE_KEY } from '../../src/config.js';

/** 토스 앱이 아니에요. 게임 코드가 이 값으로 분기하는 곳이 있어요. */
export const isInToss = false;

/** preload.cjs가 심어준 데스크톱 브리지 (브라우저에서 열면 없어요) */
const desktop = typeof window !== 'undefined' ? window.desktop : undefined;

/* ────────────────────────────── 사용자 식별 */

/**
 * 데스크톱에는 플랫폼이 주는 계정 식별키가 없어요.
 * null을 돌려주면 게임 코드가 알아서 getDeviceKey()로 넘어가요.
 */
export async function getUserKey() {
  return null;
}

/**
 * 기기 단위 식별자. 한 번 만들면 localStorage에 남아 같은 PC는 같은 사람으로 취급돼요.
 * 이게 없으면 랭킹·보석이 서버에 저장되지 않아요.
 * 토스 해시와 구분하려고 `dev-` 접두사를 그대로 씁니다. (랭킹 테이블이 같아요)
 */
export function getDeviceKey() {
  const KEY = 'spacejump.device';
  try {
    let id = window.localStorage.getItem(KEY);
    if (!id) {
      const rand =
        window.crypto?.randomUUID?.() ??
        `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      id = `dev-${rand}`;
      window.localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

/* ────────────────────────────── 저장소 */

/**
 * 세이브 데이터. Electron의 localStorage는 사용자 프로필 폴더에 남아서
 * 앱을 껐다 켜도, 업데이트해도 유지돼요.
 */
export function createStore(userKey) {
  const key = userKey ? `${SAVE_KEY}.${userKey.slice(0, 16)}` : SAVE_KEY;

  return {
    async load() {
      try {
        const raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    async save(data) {
      try {
        window.localStorage.setItem(key, JSON.stringify(data));
      } catch {
        /* 저장 실패는 무시 — 게임 진행에는 영향이 없어요 */
      }
    },
  };
}

/* ────────────────────────────── 화면 */

/** 세로 고정·화면 꺼짐 방지는 Electron 창 설정(main.cjs)에서 처리해요. */
export async function lockScreen() {}

export async function unlockScreen() {}

/** 앱 종료 — 종료 확인 모달에서 "종료하기"를 눌렀을 때 */
export async function closeApp() {
  try {
    await desktop?.close();
  } catch {
    /* 브리지가 없으면(브라우저에서 연 경우) 아무것도 안 해요 */
  }
}

/**
 * 안전영역(노치·홈 인디케이터)은 데스크톱에 없어요.
 * 그래도 CSS 변수는 세팅해야 레이아웃이 0을 읽어요.
 */
export function watchSafeArea(onChange) {
  const zero = { top: 0, bottom: 0, left: 0, right: 0 };
  const root = document.documentElement.style;
  root.setProperty('--sa-top', '0px');
  root.setProperty('--sa-bottom', '0px');
  root.setProperty('--sa-left', '0px');
  root.setProperty('--sa-right', '0px');
  onChange?.(zero);
  return () => {};
}

/* ────────────────────────────── 햅틱 */

let hapticOn = true;

/** 설정의 진동 토글이 부르지만, 데스크톱에서는 실제 효과가 없어요. */
export function setHapticEnabled(v) {
  hapticOn = v;
}

export function haptic() {
  if (!hapticOn) return;
  /* 데스크톱에는 진동 장치가 없어요. 호출만 받고 넘어가요. */
}

/* ────────────────────────────── 시스템 이벤트 */

/**
 * "뒤로가기" — 데스크톱에서는 Esc 키로 매핑해요.
 * 게임 코드는 이 콜백에서 시트를 닫거나 종료 확인 모달을 띄워요.
 */
export function onBack(handler) {
  const onKey = (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    handler();
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}

/** 데스크톱에는 홈 버튼이 없어요. */
export function onHome() {
  return () => {};
}

/**
 * 창이 가려지거나 최소화되면 소리를 멈추고 게임을 일시정지해요.
 * 데스크톱에서는 창을 다른 창 뒤로 보내도 visibilitychange가 안 오는 경우가 있어서,
 * Electron 쪽 blur/focus 신호(preload가 전달)도 함께 봐요.
 */
export function onVisibility(onHide, onShow) {
  const handler = () => (document.hidden ? onHide() : onShow());
  document.addEventListener('visibilitychange', handler);
  window.addEventListener('pagehide', onHide);
  const offBlur = desktop?.onWindowBlur?.(onHide) ?? (() => {});
  const offFocus = desktop?.onWindowFocus?.(onShow) ?? (() => {});

  return () => {
    document.removeEventListener('visibilitychange', handler);
    window.removeEventListener('pagehide', onHide);
    offBlur();
    offFocus();
  };
}

/* ────────────────────────────── 리워드 광고 (없음) */

/**
 * MS Store 빌드에는 광고가 없어요.
 * `available`이 false면 게임 코드가 "광고보고 부활하기" 버튼을 계속 숨겨둡니다.
 * (버튼 요소 자체는 DOM에 남아 있어요 — main.js가 el.btnRevive를 참조하기 때문에
 *  요소를 지우면 널 참조로 터져요. 화면에는 절대 나타나지 않습니다.)
 */
function noAd() {
  return {
    loaded: false,
    loading: false,
    available: false,
    preload() {},
    waitLoad() {
      return Promise.resolve(false);
    },
    show({ onClose } = {}) {
      // 여기까지 올 일이 없지만, 혹시 불려도 게임이 멈추지 않게 바로 닫아줘요.
      onClose?.(false);
    },
    dispose() {},
  };
}

/** 부활용 (보상형) — 버튼이 항상 숨겨져요. */
export const rewardAd = noAd();

/**
 * 게임오버 전환용 (전면) — 토스 빌드에서는 일정 스테이지 이상 도달 시
 * "재도전 · 홈으로"에서 광고가 나오지만, 스토어 빌드에서는 바로 넘어가요.
 */
export const interstitialAd = noAd();

/* ────────────────────────────── 게임센터 랭킹 (없음) */

/**
 * 토스 게임센터는 MS Store 빌드에 없어요.
 * "토스 게임센터 랭킹" 버튼이 항상 숨겨집니다.
 * 자체 랭킹(Supabase)은 cloud.js가 따로 처리해서 그대로 동작해요.
 */
export const leaderboard = {
  available: false,
  async submit() {},
  async open() {},
};

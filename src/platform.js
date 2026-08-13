/**
 * 앱인토스 SDK 어댑터.
 *
 * 게임 코드는 SDK를 직접 부르지 않고 전부 이 파일을 거쳐요. 그래서
 *  - 토스 앱 안에서는 네이티브 기능(식별키 · 저장소 · 햅틱 · 광고 · 화면 제어)을 쓰고
 *  - 일반 브라우저(로컬 개발)에서는 자동으로 대체 구현으로 떨어져서
 * 같은 코드가 양쪽에서 다 돌아가요.
 *
 * SDK 호출은 전부 실패해도 게임이 멈추지 않도록 감싸 두었어요.
 */
import {
  Device,
  Game,
  Screen,
  Storage,
  SafeAreaInsets,
  getAppsInTossGlobals,
  getUserKeyForGame,
  graniteEvent,
  loadFullScreenAd,
  showFullScreenAd,
} from '@apps-in-toss/web-framework';

import { REWARD_AD_GROUP_ID, SAVE_KEY } from './config.js';

/* ────────────────────────────── 환경 판별 */

let inToss = false;
try {
  inToss = Boolean(getAppsInTossGlobals());
} catch {
  inToss = false;
}

export const isInToss = inToss;

/** 실패해도 조용히 넘어가는 SDK 호출 래퍼 */
function safe(fn, fallback) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') return r.catch(() => fallback);
    return Promise.resolve(r);
  } catch {
    return Promise.resolve(fallback);
  }
}

function supported(api) {
  try {
    return typeof api?.isSupported === 'function' ? api.isSupported() : true;
  } catch {
    return false;
  }
}

/* ────────────────────────────── 사용자 식별키 */

/**
 * 게임 미니앱 사용자 식별키를 가져와요.
 * 실패하면 null을 돌려주고, 저장은 기기 단위로만 이뤄져요.
 */
export async function getUserKey() {
  if (!isInToss) return null;
  try {
    const result = await getUserKeyForGame();
    if (result && typeof result === 'object' && result.type === 'HASH') {
      return result.hash;
    }
    if (result === 'INVALID_CATEGORY') {
      console.warn('[space-jump] 게임 카테고리 미니앱이 아니에요. 식별키 없이 진행해요.');
    } else if (result === 'ERROR') {
      console.warn('[space-jump] 사용자 식별키 조회에 실패했어요.');
    } else if (result === undefined) {
      console.warn('[space-jump] 토스 앱 버전이 낮아 식별키를 쓸 수 없어요.');
    }
  } catch (e) {
    console.warn('[space-jump] 사용자 식별키 조회 중 오류', e);
  }
  return null;
}

/* ────────────────────────────── 저장소 */

/**
 * 사용자별 세이브 데이터. 토스 앱에서는 네이티브 저장소를,
 * 브라우저에서는 localStorage를 써요. 둘 다 앱을 껐다 켜도 유지돼요.
 */
export function createStore(userKey) {
  const key = userKey ? `${SAVE_KEY}.${userKey.slice(0, 16)}` : SAVE_KEY;

  const local = {
    get() {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(v) {
      try {
        window.localStorage.setItem(key, v);
      } catch {
        /* 저장 실패는 무시 — 게임 진행에는 영향이 없어요 */
      }
    },
  };

  return {
    async load() {
      let raw = null;
      if (isInToss) raw = await safe(() => Storage.getItem(key), null);
      if (raw == null) raw = local.get();
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    async save(data) {
      const raw = JSON.stringify(data);
      local.set(raw); // 항상 로컬에도 복제해 둬요
      if (isInToss) await safe(() => Storage.setItem(key, raw), undefined);
    },
  };
}

/* ────────────────────────────── 화면 */

/** 세로 모드 고정 + iOS 스와이프 뒤로가기 차단 */
export async function lockScreen() {
  if (!isInToss) return;
  if (supported(Screen.setOrientation)) {
    await safe(() => Screen.setOrientation({ type: 'portrait' }), undefined);
  }
  await safe(() => Screen.setIosSwipeBack({ isEnabled: false }), undefined);
  // 게임 중 화면이 꺼지지 않도록
  await safe(() => Screen.setAwakeMode({ enabled: true }), undefined);
}

/** 앱을 벗어날 때 화면 설정을 되돌려요. */
export async function unlockScreen() {
  if (!isInToss) return;
  await safe(() => Screen.setAwakeMode({ enabled: false }), undefined);
}

/** 미니앱 종료 */
export async function closeApp() {
  if (!isInToss) {
    console.info('[space-jump] 브라우저에서는 종료할 수 없어요.');
    return;
  }
  await unlockScreen();
  await safe(() => Screen.close(), undefined);
}

/** 안전 영역(노치 · 홈 인디케이터) 값을 CSS 변수로 반영하고 변경을 구독해요. */
export function watchSafeArea(onChange) {
  const apply = (insets) => {
    const v = {
      top: Number(insets?.top) || 0,
      bottom: Number(insets?.bottom) || 0,
      left: Number(insets?.left) || 0,
      right: Number(insets?.right) || 0,
    };
    const root = document.documentElement.style;
    root.setProperty('--sa-top', `${v.top}px`);
    root.setProperty('--sa-bottom', `${v.bottom}px`);
    root.setProperty('--sa-left', `${v.left}px`);
    root.setProperty('--sa-right', `${v.right}px`);
    onChange?.(v);
  };

  let current = { top: 0, bottom: 0, left: 0, right: 0 };
  if (isInToss) {
    try {
      current = SafeAreaInsets.get() || current;
    } catch {
      /* 기본값 유지 */
    }
  }
  apply(current);

  if (!isInToss) return () => {};
  try {
    return SafeAreaInsets.subscribe({ onEvent: apply }) || (() => {});
  } catch {
    return () => {};
  }
}

/* ────────────────────────────── 햅틱 */

let hapticOn = true;
export function setHapticEnabled(v) {
  hapticOn = v;
}

/** type: 'tickWeak' | 'tap' | 'tickMedium' | 'softMedium' | 'basicWeak' | 'basicMedium' | 'success' | 'error' | 'wiggle' | 'confetti' */
export function haptic(type = 'tap') {
  if (!hapticOn) return;
  if (!isInToss) return;
  safe(() => Device.triggerHaptic({ type }), undefined);
}

/* ────────────────────────────── 시스템 이벤트 */

/**
 * 뒤로가기(안드로이드 물리 버튼 / 시스템 제스처)를 가로채요.
 * 콜백 안에서 종료 확인 모달을 띄우기 때문에 그냥 화면이 닫히지 않아요.
 */
export function onBack(handler) {
  if (!isInToss) return () => {};
  try {
    return graniteEvent.addEventListener('backEvent', {
      onEvent: handler,
      onError: (e) => console.warn('[space-jump] backEvent 오류', e),
    });
  } catch {
    return () => {};
  }
}

/** 홈 버튼으로 미니앱을 벗어날 때 */
export function onHome(handler) {
  if (!isInToss) return () => {};
  try {
    return graniteEvent.addEventListener('homeEvent', {
      onEvent: handler,
      onError: (e) => console.warn('[space-jump] homeEvent 오류', e),
    });
  } catch {
    return () => {};
  }
}

/**
 * 앱이 백그라운드로 갔다가 돌아오는 것을 감지해요.
 * 광고 · 리더보드 웹뷰가 열릴 때도 같은 이벤트가 발생해요.
 */
export function onVisibility(onHide, onShow) {
  // window의 blur는 웹뷰 안에서 오탐이 잦아 쓰지 않아요.
  // 실제 백그라운드 전환은 visibilitychange · pagehide · homeEvent로 판단해요.
  const handler = () => (document.hidden ? onHide() : onShow());
  document.addEventListener('visibilitychange', handler);
  window.addEventListener('pagehide', onHide);
  const removeHome = onHome(onHide);
  return () => {
    document.removeEventListener('visibilitychange', handler);
    window.removeEventListener('pagehide', onHide);
    removeHome();
  };
}

/* ────────────────────────────── 리워드 광고 */

/**
 * 리워드 광고 관리자.
 *
 * 정책상 광고는 반드시 **미리 로드**해 두고, 사용자가 직접 누른 순간에만 보여줘야 해요.
 * 보상은 `userEarnedReward` 이벤트에서만 지급해요.
 */
/**
 * 로컬 개발(브라우저)에서는 SDK가 없어 광고를 띄울 수 없어요.
 * 그래서 개발 빌드에 한해 가짜 광고로 대체해 이어하기 흐름을 그대로 눌러볼 수 있게 해요.
 * 프로덕션 번들에서는 항상 false라 실제 SDK만 타요.
 */
const MOCK_AD = !isInToss && Boolean(import.meta.env?.DEV);

export const rewardAd = {
  loaded: false,
  loading: false,
  _unload: null,
  _waiters: [],

  get available() {
    if (MOCK_AD) return true;
    if (!isInToss) return false;
    return supported(loadFullScreenAd) && supported(showFullScreenAd);
  },

  /** 로드가 끝났다고 알려요. 기다리던 쪽(waitLoad)을 전부 깨워요. */
  _settle(ok) {
    this.loaded = ok;
    this.loading = false;
    const waiters = this._waiters;
    this._waiters = [];
    for (const w of waiters) w(ok);
  },

  /** 광고를 미리 불러와 둬요. (게임 시작 시 · 광고를 닫은 직후 호출) */
  preload() {
    if (!this.available || this.loaded || this.loading) return;
    this.loading = true;

    if (MOCK_AD) {
      setTimeout(() => this._settle(true), 300);
      return;
    }

    try {
      this._unload?.();
      this._unload = loadFullScreenAd({
        options: { adGroupId: REWARD_AD_GROUP_ID },
        onEvent: (event) => {
          if (event?.type === 'loaded') this._settle(true);
        },
        onError: (error) => {
          console.warn('[space-jump] 광고 로드 실패', error);
          this._settle(false);
        },
      });
    } catch (e) {
      console.warn('[space-jump] 광고 로드 호출 실패', e);
      this._settle(false);
    }
  },

  /**
   * 진행 중인 로드가 끝날 때까지 최대 `ms`만큼 기다려요.
   * 게임 오버 화면에서 사용자가 이어하기를 눌렀는데 아직 로드가 안 끝났을 때만 써요.
   * @returns {Promise<boolean>} 광고를 띄울 수 있는 상태인지
   */
  waitLoad(ms = 4000) {
    if (this.loaded) return Promise.resolve(true);
    if (!this.available) return Promise.resolve(false);
    this.preload();
    if (!this.loading) return Promise.resolve(this.loaded);

    return new Promise((resolve) => {
      let done = false;
      const settle = (ok) => {
        if (done) return;
        done = true;
        resolve(ok);
      };
      this._waiters.push(settle);
      setTimeout(() => settle(this.loaded), ms);
    });
  },

  /**
   * 로드된 광고를 보여줘요.
   * @param {{ onOpen?: () => void, onReward?: () => void, onClose?: (rewarded: boolean) => void }} handlers
   */
  show({ onOpen, onReward, onClose } = {}) {
    if (!this.loaded) {
      onClose?.(false);
      return;
    }

    if (MOCK_AD) {
      this.loaded = false;
      onOpen?.();
      setTimeout(() => {
        onReward?.();
        onClose?.(true);
        setTimeout(() => this.preload(), 400);
      }, 900);
      return;
    }

    let rewarded = false;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      this.loaded = false;
      onClose?.(rewarded);
      // 다음 광고를 미리 받아둬요. (load → show → load 패턴)
      setTimeout(() => this.preload(), 400);
    };

    try {
      showFullScreenAd({
        options: { adGroupId: REWARD_AD_GROUP_ID },
        onEvent: (event) => {
          switch (event?.type) {
            case 'show':
              onOpen?.();
              break;
            case 'userEarnedReward':
              rewarded = true;
              onReward?.();
              break;
            case 'dismissed':
            case 'failedToShow':
              finish();
              break;
            default:
              break;
          }
        },
        onError: (error) => {
          console.warn('[space-jump] 광고 표시 실패', error);
          finish();
        },
      });
    } catch (e) {
      console.warn('[space-jump] 광고 표시 호출 실패', e);
      finish();
    }

    // 일부 안드로이드 버전에서 dismissed가 오지 않는 이슈가 있어요.
    // 앱이 포그라운드로 돌아오면 광고가 끝난 것으로 보고 정리해요.
    const onVisible = () => {
      if (document.hidden) return;
      document.removeEventListener('visibilitychange', onVisible);
      setTimeout(finish, 300);
    };
    setTimeout(() => document.addEventListener('visibilitychange', onVisible), 1200);
  },
};

/* ────────────────────────────── 게임센터 리더보드 */

export const leaderboard = {
  get available() {
    return isInToss && supported(Game.openLeaderboard) && supported(Game.setLeaderboardScore);
  },

  /** 한 판이 끝난 뒤에만 호출해요. (진입 직후 호출 금지) */
  async submit(score) {
    if (!this.available || !(score > 0)) return;
    await safe(() => Game.setLeaderboardScore({ score: String(score) }), undefined);
  },

  async open() {
    if (!this.available) return;
    await safe(() => Game.openLeaderboard(), undefined);
  },
};

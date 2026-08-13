/**
 * 부트스트랩 — 앱인토스 미니앱 수명주기와 게임을 연결해요.
 *
 * 출시 가이드 대응 지점
 *  - 사용자 식별키(getUserKeyForGame)로 기록을 계정 단위로 저장/복원
 *  - Safe Area 반영, 세로 모드 고정, iOS 스와이프 뒤로가기 차단
 *  - 뒤로가기를 가로채 종료 확인 모달 노출 → Screen.close()
 *  - 백그라운드 전환 시 사운드 즉시 정지 + 게임 일시정지, 복귀 시 재개
 *  - 리워드 광고는 미리 로드해 두고, 사용자가 직접 누른 순간에만 재생
 */
import { createGame } from './game.js';
import { audio } from './audio.js';
import { MAX_REVIVES, IS_TEST_AD } from './config.js';
import {
  isInToss,
  getUserKey,
  createStore,
  lockScreen,
  closeApp,
  watchSafeArea,
  haptic,
  setHapticEnabled,
  onBack,
  onVisibility,
  rewardAd,
  leaderboard,
} from './platform.js';

/* ────────────────────────────── DOM */

const $ = (id) => document.getElementById(id);

const el = {
  canvas: $('game'),
  screenTitle: $('screen-title'),
  screenOver: $('screen-over'),
  screenPause: $('screen-pause'),
  screenExit: $('screen-exit'),
  toast: $('toast'),

  titleBest: $('title-best'),
  titleBestCombo: $('title-best-combo'),
  btnStart: $('btn-start'),
  btnRankTitle: $('btn-rank-title'),

  overReason: $('over-reason'),
  overScore: $('over-score'),
  overDetail: $('over-detail'),
  overBest: $('over-best'),
  btnRevive: $('btn-revive'),
  reviveCount: $('revive-count'),
  btnRetry: $('btn-retry'),
  btnRankOver: $('btn-rank-over'),
  btnQuit: $('btn-quit'),

  btnResume: $('btn-resume'),
  btnExitCancel: $('btn-exit-cancel'),
  btnExitConfirm: $('btn-exit-confirm'),

  btnSound: $('btn-sound'),
  icoSound: $('ico-sound'),
};

const show = (node) => node.classList.remove('is-hidden');
const hide = (node) => node.classList.add('is-hidden');

let toastTimer = 0;
function toast(message, ms = 2000) {
  el.toast.textContent = message;
  show(el.toast);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => hide(el.toast), ms);
}

/* ────────────────────────────── 상태 */

let store = null;
let settings = { sound: true };
let records = { best: 0, bestCombo: 0, plays: 0 };
let lastResult = null;
let adInProgress = false;

/* ────────────────────────────── 게임 */

const game = createGame({
  canvas: el.canvas,
  haptic,
  onGameOver: (result) => {
    lastResult = result;
    showGameOver(result);
  },
});

const removeSafeArea = watchSafeArea((insets) => game.setInsets(insets));

/* ────────────────────────────── 세이브 */

async function persist() {
  const r = game.getRecords();
  records = {
    best: Math.max(records.best, r.best),
    bestCombo: Math.max(records.bestCombo, r.bestCombo),
    plays: records.plays,
  };
  await store?.save({ ...records, settings });
}

/* ────────────────────────────── 화면 전환 */

function renderTitle() {
  el.titleBest.textContent = String(records.best);
  el.titleBestCombo.textContent = `x${records.bestCombo}`;
  el.btnRankTitle.classList.toggle('is-hidden', !leaderboard.available);
  show(el.screenTitle);
}

function showGameOver(result) {
  el.overReason.textContent = result.reason;
  el.overScore.textContent = String(result.score);
  el.overDetail.textContent = `도달: ${result.stageName} · STAGE ${result.stage} · 행성 ${result.landed}개 · 최고 콤보 x${result.bestCombo}`;

  // persist()는 아래에서 부르므로 여기서는 아직 직전 판까지의 기록이에요.
  const isNewRecord = result.score > records.best && result.score > 0;
  el.overBest.textContent = isNewRecord
    ? '🎉 새로운 최고 기록이에요!'
    : `최고 기록 ${Math.max(records.best, result.score)}`;

  // 이어하기: 광고가 미리 로드돼 있고, 이번 판에서 아직 안 썼을 때만
  const canRevive = rewardAd.loaded && result.revives < MAX_REVIVES;
  el.btnRevive.classList.toggle('is-hidden', !canRevive);
  el.reviveCount.textContent = `(${MAX_REVIVES - result.revives}회 남음)`;
  el.btnRevive.disabled = false;

  el.btnRankOver.classList.toggle('is-hidden', !leaderboard.available);
  show(el.screenOver);

  // 기록 저장 + 리더보드 제출은 판이 끝난 뒤에만
  persist();
  leaderboard.submit(result.score);
}

function startGame() {
  audio.init();
  audio.setEnabled(settings.sound);
  hide(el.screenTitle);
  hide(el.screenOver);
  hide(el.screenPause);
  records.plays += 1;
  game.setRecords(records);
  game.start();
  rewardAd.preload();
}

/* ────────────────────────────── 버튼 */

el.btnStart.addEventListener('click', () => {
  haptic('tap');
  startGame();
});

el.btnRetry.addEventListener('click', () => {
  haptic('tap');
  startGame();
});

el.btnRevive.addEventListener('click', () => {
  if (!rewardAd.loaded || adInProgress) return;
  haptic('tap');
  el.btnRevive.disabled = true;
  adInProgress = true;

  // 광고가 뜨는 동안 게임과 소리를 완전히 멈춰요.
  game.pause();
  audio.suspend();

  let rewarded = false;
  rewardAd.show({
    onReward: () => {
      rewarded = true;
    },
    onClose: () => {
      adInProgress = false;
      audio.resume();
      if (rewarded) {
        hide(el.screenOver);
        hide(el.screenPause);
        game.resume();
        game.revive();
      } else {
        game.resume();
        el.btnRevive.disabled = false;
        toast('광고를 끝까지 봐야 이어할 수 있어요.');
      }
    },
  });
});

el.btnRankTitle.addEventListener('click', () => {
  haptic('tap');
  leaderboard.open();
});

el.btnRankOver.addEventListener('click', () => {
  haptic('tap');
  leaderboard.open();
});

/* ── 종료 확인 모달 (뒤에 깔린 화면은 잠시 감췄다가 되돌려요) */

let exitReturnScreen = null;

function openExitModal() {
  if (!el.screenExit.classList.contains('is-hidden')) return;
  exitReturnScreen =
    [el.screenOver, el.screenTitle, el.screenPause].find(
      (s) => !s.classList.contains('is-hidden')
    ) || null;
  if (exitReturnScreen) hide(exitReturnScreen);
  if (game.isPlaying && !game.state.paused) game.pause();
  show(el.screenExit);
}

function closeExitModal() {
  hide(el.screenExit);
  if (exitReturnScreen) {
    show(exitReturnScreen);
    exitReturnScreen = null;
  } else if (game.isPlaying && game.state.paused) {
    // 게임 중이었다면 곧바로 재개하지 않고 일시정지 화면을 거쳐요.
    show(el.screenPause);
  }
}

el.btnQuit.addEventListener('click', () => {
  haptic('tap');
  openExitModal();
});

el.btnResume.addEventListener('click', () => {
  haptic('tap');
  hide(el.screenPause);
  audio.init();
  game.resume();
});

el.btnExitCancel.addEventListener('click', () => {
  haptic('tap');
  closeExitModal();
});

el.btnExitConfirm.addEventListener('click', async () => {
  haptic('tap');
  await persist();
  await closeApp();
});

el.btnSound.addEventListener('click', () => {
  settings.sound = !settings.sound;
  audio.init();
  audio.setEnabled(settings.sound);
  setHapticEnabled(settings.sound);
  el.btnSound.classList.toggle('is-off', !settings.sound);
  el.icoSound.textContent = settings.sound ? '🔊' : '🔇';
  el.btnSound.setAttribute('aria-label', settings.sound ? '소리 끄기' : '소리 켜기');
  if (settings.sound) haptic('tap');
  persist();
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') el.btnSound.click();
});

/* ────────────────────────────── 시스템 이벤트 */

// 뒤로가기(안드로이드 물리 버튼 / 시스템 제스처) → 바로 닫지 않고 확인 모달
onBack(() => {
  if (!el.screenExit.classList.contains('is-hidden')) {
    // 이미 모달이 떠 있으면 닫기만 해요.
    closeExitModal();
    return;
  }
  openExitModal();
});

// 백그라운드 전환 — 소리를 즉시 끄고 게임을 멈춰요.
onVisibility(
  () => {
    audio.suspend();
    if (game.isPlaying && !game.state.paused) {
      game.pause();
      if (!adInProgress) show(el.screenPause);
    }
  },
  () => {
    // 광고 중이라면 광고 종료 처리에서 되살려요.
    if (adInProgress) return;
    // 게임 중이었다면 사용자가 직접 "이어서 하기"를 누를 때 재개해요.
    audio.resume();
  }
);

window.addEventListener('pagehide', () => {
  persist();
  removeSafeArea();
});

/* ────────────────────────────── 부팅 */

async function boot() {
  if (IS_TEST_AD && isInToss) {
    console.warn(
      '[space-jump] 테스트용 광고 ID를 쓰고 있어요. 출시 번들에는 콘솔에서 발급받은 ID를 넣어주세요.'
    );
  }

  // 화면 설정은 진입 즉시 (게임 출시 가이드: 세로 고정 · 뒤로가기 제스처 차단)
  lockScreen();

  // 사용자 식별키 → 계정별 세이브
  const userKey = await getUserKey();
  store = createStore(userKey);

  const saved = await store.load();
  if (saved) {
    records = {
      best: Number(saved.best) || 0,
      bestCombo: Number(saved.bestCombo) || 0,
      plays: Number(saved.plays) || 0,
    };
    if (saved.settings && typeof saved.settings.sound === 'boolean') {
      settings.sound = saved.settings.sound;
    }
  }

  audio.enabled = settings.sound;
  setHapticEnabled(settings.sound);
  el.btnSound.classList.toggle('is-off', !settings.sound);
  el.icoSound.textContent = settings.sound ? '🔊' : '🔇';

  game.setRecords(records);
  renderTitle();

  // 광고는 미리 받아둬요. (보여줄 때 로딩하지 않기 — 정책 필수)
  rewardAd.preload();
}

boot();

// 개발용 핸들 (밸런스 조정 / 봇 시뮬레이션 / UI 확인). 프로덕션 번들에서는 빠져요.
if (import.meta.env.DEV) {
  window.__spacejump = { game, audio, showGameOver, startGame, records: () => records };
}

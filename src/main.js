/**
 * 부트스트랩 — 앱인토스 미니앱 수명주기와 게임을 연결해요.
 *
 * 출시 가이드 대응 지점
 *  - 사용자 식별키(getUserKeyForGame)로 기록을 계정 단위로 저장/복원
 *  - Safe Area 반영, 세로 모드 고정, iOS 스와이프 뒤로가기 차단
 *  - 뒤로가기를 가로채 종료 확인 모달 노출 → Screen.close()
 *  - 백그라운드 전환 시 사운드 즉시 정지 + 게임 일시정지, 복귀 시 재개
 *  - 리워드 광고는 미리 로드해 두고, 사용자가 직접 누른 순간에만 재생
 *
 * 저장 구조
 *  - 로컬(localStorage · 토스 Storage)이 **항상 먼저**예요. 서버가 죽어도 게임은 돌아가요.
 *  - Supabase는 백업 + 랭킹용이에요. (src/cloud.js)
 */
import { createGame } from './game.js';
import { createStory } from './story.js';
import { audio } from './audio.js';
import {
  MAX_REVIVES,
  IS_TEST_AD,
  SKIN_PRICE,
  AD_FROM_STAGE,
  AD_COOLDOWN_MS,
  STORY_LOCKED,
  TOTAL_PLANETS,
  TUTORIAL_VERSION,
  BANNER_AD_H,
} from './config.js';
import { SKINS, DEFAULT_SKIN, getSkin, drawSkinPreview } from './skins.js';
import { ACHIEVEMENTS, SECRET_HINT, checkAchievements } from './achievements.js';
import { cloud } from './cloud.js';
import { validateNickname, defaultNickname, nicknameCandidate } from './nickname.js';
import {
  isInToss,
  getUserKey,
  getDeviceKey,
  createStore,
  lockScreen,
  closeApp,
  watchSafeArea,
  haptic,
  setHapticEnabled,
  onBack,
  onVisibility,
  rewardAd,
  interstitialAd,
  bannerAd,
  leaderboard,
} from './platform.js';

/* ────────────────────────────── DOM */

const $ = (id) => document.getElementById(id);

const el = {
  canvas: $('game'),
  storyCanvas: $('story'),
  home: $('home'),
  screenOver: $('screen-over'),
  screenPause: $('screen-pause'),
  screenExit: $('screen-exit'),
  screenShop: $('screen-shop'),
  screenRank: $('screen-rank'),
  screenSettings: $('screen-settings'),
  screenStoryClear: $('screen-story-clear'),
  screenStoryFail: $('screen-story-fail'),
  screenFinalClear: $('screen-final-clear'),
  screenFinalFail: $('screen-final-fail'),
  toast: $('toast'),

  finalScore: $('final-score'),
  finalDetail: $('final-detail'),
  finalGems: $('final-gems'),
  finalFailScore: $('final-fail-score'),
  finalFailDetail: $('final-fail-detail'),
  btnFinalHome: $('btn-final-home'),
  btnFinalAgain: $('btn-final-again'),
  btnFinalRetry: $('btn-final-retry'),
  btnFinalGiveup: $('btn-final-giveup'),

  homeStory: $('home-story'),
  storyScore: $('story-score'),
  storyFailScore: $('story-fail-score'),
  btnStoryAgain: $('btn-story-again'),
  btnStoryHome: $('btn-story-home'),
  btnStoryRetry: $('btn-story-retry'),
  btnStoryFailHome: $('btn-story-fail-home'),

  homeBest: $('home-best'),
  homeCombo: $('home-combo'),
  homeNick: $('home-nick'),
  homeWallet: $('home-wallet'),
  btnPause: $('btn-pause'),
  btnShop: $('btn-shop'),
  btnRank: $('btn-rank'),

  overReason: $('over-reason'),
  overScore: $('over-score'),
  overDetail: $('over-detail'),
  overGems: $('over-gems'),
  overBest: $('over-best'),
  btnRevive: $('btn-revive'),
  btnRetry: $('btn-retry'),
  btnHomeOver: $('btn-home-over'),

  shopWallet: $('shop-wallet'),
  shopList: $('shop-list'),
  btnShopClose: $('btn-shop-close'),

  rankList: $('rank-list'),
  rankMine: $('rank-mine'),
  btnRankToss: $('btn-rank-toss'),
  btnRankClose: $('btn-rank-close'),
  tabRank: $('tab-rank'),
  tabAchv: $('tab-achv'),
  paneRank: $('pane-rank'),
  paneAchv: $('pane-achv'),
  achvList: $('achv-list'),
  achvCount: $('achv-count'),
  achvGuide: $('achv-guide'),
  achvToast: $('achv-toast'),
  achvToastIcon: $('achv-toast-icon'),
  achvToastName: $('achv-toast-name'),
  achvToastReward: $('achv-toast-reward'),

  inputNick: $('input-nick'),
  btnNickSave: $('btn-nick-save'),
  nickMsg: $('nick-msg'),
  swSfx: $('sw-sfx'),
  swBgm: $('sw-bgm'),
  swHaptic: $('sw-haptic'),
  rangeVol: $('range-vol'),
  volValue: $('vol-value'),
  syncMsg: $('sync-msg'),
  btnTutorialReplay: $('btn-tutorial-replay'),
  btnSettingsClose: $('btn-settings-close'),

  btnWipe: $('btn-wipe'),
  screenWipe: $('screen-wipe'),
  wipeMsg: $('wipe-msg'),
  btnWipeCancel: $('btn-wipe-cancel'),
  btnWipeConfirm: $('btn-wipe-confirm'),

  btnResume: $('btn-resume'),
  btnHomePause: $('btn-home-pause'),
  btnExitCancel: $('btn-exit-cancel'),
  btnExitConfirm: $('btn-exit-confirm'),

  btnSettings: $('btn-settings'),

  // 튜토리얼
  screenTutorial: $('screen-tutorial'),
  screenTutorialClear: $('screen-tutorial-clear'),
  tutorialClearDesc: $('tutorial-clear-desc'),
  tipCard: document.querySelector('#screen-tutorial .tip-card'),
  tipStep: $('tip-step'),
  tipTitle: $('tip-title'),
  tipBody: $('tip-body'),
  btnTipNext: $('btn-tip-next'),
  btnTipSkip: $('btn-tip-skip'),
  tutorialHint: $('tutorial-hint'),
  btnTutorialGo: $('btn-tutorial-go'),
  btnTutorialHome: $('btn-tutorial-home'),


  // 하단 배너 광고
  adBanner: $('ad-banner'),
  adBannerSlot: $('ad-banner-slot'),

  // 첫 진입 화면 (MS Store 빌드에도 같은 마크업을 써요)
  btnPlay: $('btn-play'),
  btnStory: $('btn-story'),
  loadingNote: $('loading-note'),
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
let userKey = null;

/** 소리 · 진동 설정 */
let settings = { sfx: true, bgm: true, haptic: true, volume: 0.8 };

/** 기록 · 지갑 · 보유 스킨 */
let records = {
  best: 0,
  bestCombo: 0,
  plays: 0,
  gems: 0,
  nickname: '',
  ownedSkins: [DEFAULT_SKIN],
  equippedSkin: DEFAULT_SKIN,
  /** 스토리 모드 STAGE 1을 깼는지 (이 기기에만 저장돼요) */
  storyCleared: false,
  /** 스토리 모드 최고 점수 (본편 랭킹과는 별개예요) */
  storyBest: 0,
  /** 본편 100행성 + 최종 보스를 깬 적이 있는지 */
  cleared: false,
  /** 클리어 횟수 */
  clearCount: 0,
  /** 지금까지 가장 멀리 간 행성 번호 (1 ~ TOTAL_PLANETS) */
  bestReached: 0,
  /**
   * 끝까지 본 튜토리얼 대본의 버전. 0이면 아직 안 봤다는 뜻이에요.
   * TUTORIAL_VERSION보다 낮으면 개편된 튜토리얼을 한 번 더 보여줘요.
   */
  tutorialVersion: 0,
  /** 얻은 업적 id 목록 (src/achievements.js의 ACHIEVEMENTS[].id) */
  achievements: [],
  /**
   * 보상을 **직접 눌러서 받은** 업적 id 목록.
   *
   * 서버(achievements.claimed_at)에도 같이 남아요. 기기에만 두면 앱을 지웠다
   * 깔 때마다 모든 업적의 보석을 다시 받을 수 있거든요.
   */
  claimedRewards: [],
  /** 아직 서버에 못 올린 변화가 있는지 (보석·스킨 보호용) */
  dirty: false,
};

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
  // 100번째 행성 도착 — 본편은 여기서 끝나고 최종 보스전으로 이어져요.
  onFinalPlanet: (result) => {
    lastResult = result;
    startFinalBoss(result);
  },
  onTutorialTip: (tip) => showTutorialTip(tip),
  onTutorialHint: ({ text }) => showTutorialHint(text),
  onTutorialClear: (res) => finishTutorial(res),
});

/* ────────────────────────────── 스토리 모드 (2.0)
   본편과 완전히 분리된 엔진이에요. 자기 캔버스에 자기 루프로 돌아요.
   여기서는 "언제 켜고 끄는지"와 "끝났을 때 무엇을 보여줄지"만 다뤄요. */

const story = createStory({
  canvas: el.storyCanvas,
  haptic,
  onClear: (result) => showStoryClear(result),
  onFail: (result) => showStoryFail(result),
  // 최종 보스전(본편 엔딩)도 같은 엔진이 돌려요.
  onFinalClear: (result) => showFinalClear(result),
  onFinalFail: (result) => showFinalFail(result),
});

/**
 * 하단 배너가 붙어 있으면 캔버스는 배너 위에서 끝나요. 그러면 캔버스 아래쪽은
 * 이미 홈 인디케이터 밖이라, 캔버스 안에서 또 안전 영역을 비우면 여백이 두 번 들어가요.
 * (CSS의 --sa-bottom-ui와 같은 이야기예요)
 */
let bannerOn = false;
let lastInsets = { top: 0, bottom: 0, left: 0, right: 0 };

function pushInsets() {
  /*
    배너는 화면 맨 아래에 딱 붙어서 BANNER_AD_H 만큼만 써요. (CSS의 --banner-h와 같은 값)
    홈 인디케이터는 배너 **안쪽**이라 따로 더하지 않아요. 더하면 광고 밑에 빈 띠가
    하나 더 생겨서 게임 화면만 손해예요.
  */
  const reserve = bannerOn ? BANNER_AD_H : 0;
  game.setBottomReserve(reserve);
  story.setBottomReserve(reserve);

  // 캔버스가 배너 위에서 끝나니, 캔버스 안에서 아래쪽 안전 영역을 또 비울 필요가 없어요.
  const v = { ...lastInsets, bottom: bannerOn ? 0 : lastInsets.bottom };
  game.setInsets(v);
  story.setInsets(v);
}

const removeSafeArea = watchSafeArea((insets) => {
  lastInsets = insets;
  pushInsets();
});

/* ────────────────────────────── 세이브 */

function applyAudioSettings() {
  audio.setSfx(settings.sfx);
  audio.setBgm(settings.bgm);
  audio.setVolume(settings.volume);
  // 둘 다 꺼져 있으면 컨텍스트째로 조용히 만들어요.
  audio.setEnabled(settings.sfx || settings.bgm);
  setHapticEnabled(settings.haptic);
}

function localSnapshot() {
  return { ...records, settings };
}

/**
 * 계정 초기화가 시작되면 켜져요. 켜져 있는 동안에는 **어떤 저장도 나가면 안 돼요.**
 *
 * 지우는 순간과 화면이 새로 뜨는 순간 사이에는 메모리에 옛 기록이 그대로 남아 있어요.
 * 그 틈에 저장이 한 번이라도 나가면 방금 지운 게 통째로 되살아나요.
 * (실제로 pagehide → persist() 경로가 이걸 하고 있었어요)
 */
let wiping = false;

async function persist() {
  if (wiping) return;
  const r = game.getRecords();
  records.best = Math.max(records.best, r.best);
  records.bestCombo = Math.max(records.bestCombo, r.bestCombo);
  await store?.save(localSnapshot());
}

/**
 * 서버에도 올려요. 실패해도 조용히 넘어가요.
 *
 * 성공하면 `dirty`를 내려요. 이 값이 켜져 있으면 "아직 서버가 모르는 변화가 로컬에 있다"는
 * 뜻이라, 다음에 켤 때 서버 값으로 덮어쓰지 않아요. (보석을 잃어버리지 않게)
 */
async function pushCloud() {
  if (wiping || !userKey) return;
  const saved = await cloud.saveProfile({
    user_key: userKey,
    nickname: records.nickname || null,
    gems: records.gems,
    best_score: records.best,
    best_combo: records.bestCombo,
    plays: records.plays,
    owned_skins: records.ownedSkins,
    equipped_skin: records.equippedSkin,
  });
  if (saved) {
    records.dirty = false;
    await store?.save(localSnapshot());
  }
}

/** 보석·스킨처럼 서버와 어긋나면 안 되는 값이 바뀌었을 때 불러요. */
function markDirty() {
  records.dirty = true;
}

/* ────────────────────────────── 화면 전환 */

function renderWallet() {
  const text = String(records.gems);
  el.homeWallet.textContent = text;
  el.shopWallet.textContent = text;
}

/** 홈 화면 값 갱신. 게임 화면 위에 그대로 얹히는 레이어예요. */
function renderHome() {
  el.homeBest.textContent = String(records.best);
  el.homeCombo.textContent = `x${records.bestCombo}`;
  el.homeNick.textContent = records.nickname || defaultNickname(userKey);

  renderWallet();

  // 이미 게임이 돌고 있으면 홈 레이어를 다시 덮지 않아요.
  // 첫 화면에서 "게임하기"로 바로 시작했는데, 뒤늦게 서버 응답이 와서
  // renderHome()이 한 번 더 불리면 진행 중인 게임이 가려져요.
  // 스토리 모드도 같은 이유로 지켜줘야 해요. (인트로 대사 위로 홈이 덮이면 안 돼요)
  if (game.isPlaying || story.isActive) return;

  show(el.home);
  hide(el.btnPause);
}

/**
 * 홈으로 돌아가요. 게임을 접고 배경을 처음 상태로 되돌려요.
 * (일시정지 화면 · 게임 오버 화면 어디서든 부를 수 있어요)
 */
function goHome() {
  hide(el.screenOver);
  hide(el.screenPause);
  hide(el.screenExit);
  hide(el.screenTutorial);
  hide(el.screenTutorialClear);
  hideTutorialHint();
  // 다시보기 도중에 나가도 여기서 끝나요. (일시정지 → 홈, 연습 보스전 중단 모두 이 길)
  tutorialReplay = false;
  game.home();
  renderHome();
}

/* ────────────────────────────── 튜토리얼

   처음 온 사람은 「게임하기」를 누르면 본편이 아니라 연습 코스부터 돌아요.
   조작(탭 = 발사)조차 모르는 상태에서 소행성·붕괴·블랙홀이 순서대로 나오면
   첫 판이 그냥 사고사로 끝나거든요.

   클리어 여부는 로컬 세이브(records.tutorialVersion)가 먼저고, 서버는 백업이에요.
   서버가 죽어 있어도 같은 기기에서는 두 번 보지 않아요. */

/** 지금 돌고 있는 보스전이 튜토리얼의 연습판인지 (기록을 남기면 안 돼요) */
let tutorialBoss = false;
/**
 * 설정의 「튜토리얼 다시보기」로 들어온 판인지.
 *
 * 처음 겪는 사람과 흐름이 달라요. 끝나도 「연습 비행 완료」 안내나 첫 보상 안내를
 * 다시 띄우지 않고 그냥 홈으로 돌아와요. 이미 다 받은 사람이니까요.
 */
let tutorialReplay = false;
/** 연습 코스에서 몇 번 되돌아갔는지 — 보스전이 끝난 뒤에 같이 저장해요 */
let tutorialRetries = 0;

/**
 * 연습 비행을 막 끝내고 **업적 화면 안내를 받는 중**인지.
 *
 * 튜토리얼의 마지막 한 걸음이에요. 여기서 첫 보상을 직접 받아보고,
 * 시트를 닫으면 홈에서 배웅 인사를 받으며 진짜 여정이 시작돼요.
 * 이 판이 끝나면(닫으면) 다시는 안 켜져요.
 */
let achvOnboarding = false;

/** 아직 튜토리얼을 안 본 사람인지. (대본이 개편되면 버전이 올라가 다시 true가 돼요) */
function needsTutorial() {
  return records.tutorialVersion < TUTORIAL_VERSION;
}

function startTutorial() {
  audio.init();
  applyAudioSettings();
  hide(el.home);
  hide(el.screenOver);
  hide(el.screenPause);
  hide(el.screenTutorialClear);
  show(el.btnPause);
  game.setSkin(records.equippedSkin);
  game.startTutorial();
}

/**
 * 안내 카드를 띄워요. 게임 시간은 game.js 쪽에서 이미 멈춰 있어요.
 *
 * 진행 표시는 행성 번호가 아니라 **레슨 번호**예요. (`레슨 3 / 7 · 소행성`)
 * 분모가 21이던 시절엔 시작하자마자 질리게 만들었거든요.
 */
function showTutorialTip(tip) {
  hideTutorialHint(); // 카드가 뜨면 배너는 자리를 비켜요
  // 강조 대상이 화면 아래쪽이면 카드가 위로 올라가요. (game.js의 isLowFocus)
  el.screenTutorial.classList.toggle('is-low', tip.low === true);
  el.tipCard.classList.toggle('is-retry', tip.retry === true);
  el.tipStep.textContent = tip.retry
    ? '다시 시도'
    : `레슨 ${tip.lesson} / ${tip.lessonTotal}${tip.lessonName ? ` · ${tip.lessonName}` : ''}`;
  el.tipTitle.textContent = tip.title;
  el.tipBody.textContent = tip.body;
  el.btnTipNext.textContent = tip.retry ? '계속하기' : '알겠어요';
  show(el.screenTutorial);
}

/* ── 코칭 힌트 배너 ───────────────────────────
   레슨 안의 자잘한 안내는 모달로 막지 않아요. 위에 잠깐 떴다 스스로 사라져요.
   탭이 21번 필요하던 튜토리얼이 7번으로 줄어든 게 대부분 이것 덕분이에요. */

/** 힌트가 화면에 머무는 시간(ms). 한 줄을 읽고도 남게 잡았어요. */
const TUTORIAL_HINT_MS = 3400;
let tutorialHintTimer = 0;

function showTutorialHint(text) {
  if (!text) return;
  clearTimeout(tutorialHintTimer);
  el.tutorialHint.textContent = text;
  show(el.tutorialHint);
  // 같은 요소를 다시 쓰니까 애니메이션을 손으로 되감아요. (업적 토스트와 같은 이유)
  el.tutorialHint.style.animation = 'none';
  void el.tutorialHint.offsetWidth;
  el.tutorialHint.style.animation = '';
  tutorialHintTimer = setTimeout(hideTutorialHint, TUTORIAL_HINT_MS);
}

function hideTutorialHint() {
  clearTimeout(tutorialHintTimer);
  tutorialHintTimer = 0;
  hide(el.tutorialHint);
}

/** 튜토리얼을 끝냈어요. (또는 건너뛰었어요) */
async function markTutorialDone({ retries = 0, skipped = false } = {}) {
  records.tutorialVersion = TUTORIAL_VERSION;
  await store?.save(localSnapshot());
  // 서버는 실패해도 그만이에요. 로컬에 이미 남아 있어요.
  cloud.saveTutorial(userKey, {
    cleared: true,
    version: TUTORIAL_VERSION,
    retries,
    skipped,
  });
}

/**
 * 연습 코스의 마지막 행성까지 왔어요. 이제 **연습 보스전**으로 이어져요.
 *
 * 본편에서 100번째 행성에 닿으면 최종 보스전이 열리는 것과 같은 흐름이에요.
 * 튜토리얼도 그 구조를 그대로 겪어봐야 "끝까지 해봤다"가 되니까요.
 * 다만 기록·업적·랭킹에는 아무것도 남기지 않아요. (tutorialBoss 플래그)
 */
function finishTutorial(res = {}) {
  tutorialRetries = res.retries || 0;
  tutorialBoss = true;

  hide(el.screenTutorial);
  hideTutorialHint();
  hide(el.screenOver);
  hide(el.screenFinalClear);
  hide(el.screenFinalFail);
  show(el.btnPause);
  show(el.storyCanvas);

  game.setRenderEnabled(false);
  story.setSkin(records.equippedSkin);
  story.startPracticeBoss();
}

/** 연습 보스전이 끝났어요. (이겼든 졌든 튜토리얼은 여기서 끝나요) */
function endTutorialBoss(won) {
  tutorialBoss = false;
  story.stop();
  hide(el.storyCanvas);
  hide(el.btnPause);
  hide(el.screenFinalClear);
  hide(el.screenFinalFail);
  game.setRenderEnabled(true);
  game.home();

  // 다시보기로 들어온 판은 여기서 조용히 끝나요. 완료 안내도, 보상 안내도 없어요.
  if (tutorialReplay) {
    goHome();
    return;
  }

  markTutorialDone({ retries: tutorialRetries });
  el.tutorialClearDesc.textContent = won
    ? '관문지기까지 넘으셨어요. 첫 업적과 보상이 도착했어요.'
    : '여기까지가 이 게임의 전부예요. 첫 업적과 보상이 도착했어요.';
  show(el.screenTutorialClear);
  haptic('confetti');
  // 「연습생이지만 괜찮아」가 여기서 열려요. 완료 화면이 먼저 뜨고 알림이 그 위로 와요.
  setTimeout(() => grantAchievements(), 700);
}

/** 건너뛰기 — 이미 아는 사람에게 열 번 탭을 강요하지 않아요. */
function skipTutorial() {
  hide(el.screenTutorial);
  hideTutorialHint();

  // 다시보기 중이라면 "그만 볼래요"라는 뜻이에요. 본편을 억지로 시작하지 않고 홈으로.
  if (tutorialReplay) {
    game.quitTutorial();
    goHome();
    return;
  }

  markTutorialDone({ skipped: true });
  game.quitTutorial();
  startGame();
  /*
    건너뛴 사람도 업적은 받아요. 다만 업적 화면으로 끌고 가지는 않아요 —
    안 보겠다고 한 사람을 또 다른 안내로 붙잡으면 그게 더 나빠요.
    알림에 "업적에서 받아가세요"가 뜨니까 필요하면 직접 열어봅니다.
  */
  setTimeout(() => grantAchievements(), 900);
}

el.btnTipNext.addEventListener('click', (e) => {
  e.stopPropagation();
  haptic('tap');
  hide(el.screenTutorial);
  game.tutorialContinue();
});

el.btnTipSkip.addEventListener('click', (e) => {
  e.stopPropagation();
  haptic('tap');
  skipTutorial();
});

/*
  튜토리얼의 마지막 한 걸음 — 업적 화면으로 데려가요.

  첫 보상을 자동으로 넣어주지 않고 여기까지 끌고 오는 이유는 하나예요.
  이 게임에 업적 화면이 있고, 거기서 보석이 들어온다는 걸 **한 번 직접 해봐야**
  다음부터 스스로 열어봐요. 설명으로 대신하면 아무도 안 열어요.
*/
el.btnTutorialGo.addEventListener('click', () => {
  haptic('tap');
  hide(el.screenTutorialClear);
  achvOnboarding = true;
  openSheet(el.screenRank, () => showRankTab('achv'));
});

el.btnTutorialHome.addEventListener('click', () => {
  haptic('tap');
  goHome();
});


function showGameOver(result) {
  el.overReason.textContent = result.reason;
  el.overScore.textContent = String(result.score);
  el.overDetail.textContent = `${result.stageName} · 행성 ${result.reached}/${TOTAL_PLANETS} · 최고 콤보 x${result.bestCombo}`;
  records.bestReached = Math.max(records.bestReached, result.reached || 0);

  // 이번 판에서 주운 보석을 지갑으로 옮겨요.
  if (result.gems > 0) {
    records.gems += result.gems;
    markDirty();
    el.overGems.querySelector('b').textContent = String(result.gems);
    show(el.overGems);
  } else {
    hide(el.overGems);
  }
  renderWallet();

  // persist()는 아래에서 부르므로 여기서는 아직 직전 판까지의 기록이에요.
  const isNewRecord = result.score > records.best && result.score > 0;
  el.overBest.classList.toggle('is-new', isNewRecord);
  el.overBest.textContent = isNewRecord
    ? '새로운 최고 기록이에요!'
    : `최고 기록 ${Math.max(records.best, result.score)}`;

  // 이어하기 — 한 판에 MAX_REVIVES회.
  // 로드가 아직 안 끝났어도 버튼은 보여주고, 누른 뒤에 잠깐 기다려요.
  // (로드 완료만 조건으로 걸면 네트워크가 느릴 때 기회가 조용히 사라져요.)
  const canRevive = rewardAd.available && result.revives < MAX_REVIVES;
  el.btnRevive.classList.toggle('is-hidden', !canRevive);
  el.btnRevive.disabled = false;
  if (canRevive) rewardAd.preload();

  // 이번 판이 광고 조건(AD_FROM_STAGE 이상)에 걸리는지 기억해 두고, 걸리면 미리 받아둬요.
  // 버튼을 누른 뒤에 로드를 시작하면 그만큼 기다리게 되니까요.
  lastStage = result.stage;
  if (wantsInterstitial()) interstitialAd.preload();

  hide(el.btnPause);
  show(el.screenOver);

  // 기록 저장 + 제출은 판이 끝난 뒤에만
  persist();
  pushCloud();
  cloud.addRun(userKey, result);
  leaderboard.submit(result.score);
}

function startGame() {
  // 아직 튜토리얼을 안 본 사람은 연습 코스부터. (끝나면 여기로 다시 돌아와요)
  if (needsTutorial()) {
    startTutorial();
    return;
  }
  audio.init();
  applyAudioSettings();
  hide(el.home);
  hide(el.screenOver);
  hide(el.screenPause);
  hide(el.screenTutorialClear);
  show(el.btnPause);
  records.plays += 1;
  game.setRecords(records);
  game.setSkin(records.equippedSkin);
  game.start();
  rewardAd.preload();
}

/* ────────────────────────────── 스토리 모드 */

/**
 * 스토리 모드로 들어가요.
 *
 * 본편은 멈추는 게 아니라 **그리기만** 꺼요. (캔버스를 display:none으로 감추면
 * 크기가 0으로 측정돼서 돌아왔을 때 한동안 뭉개져 보여요 — game.js의 백버퍼 주석 참고)
 *
 * @param {boolean} [skipIntro] 인트로 대사를 건너뛰고 비행부터 시작할지
 */
function openStory(skipIntro = false) {
  // 2.1 출시본에서는 아직 잠겨 있어요. (config.js STORY_LOCKED)
  if (STORY_LOCKED) {
    toast('스토리 모드는 추후 업데이트 예정입니다.', 2600);
    haptic('error');
    return;
  }

  audio.init();
  applyAudioSettings();

  // 첫 진입 화면이 아직 떠 있으면 같이 걷어요. (z-index 100이라 스토리 캔버스를 덮어요)
  closeLoading();

  // 홈 배경에서 본편이 돌고 있었다면 접어요.
  game.home();
  game.setRenderEnabled(false);

  hide(el.home);
  hide(el.screenOver);
  hide(el.screenPause);
  hide(el.screenStoryClear);
  hide(el.screenStoryFail);
  show(el.btnPause);
  show(el.storyCanvas);

  story.setSkin(records.equippedSkin);
  if (skipIntro) story.skipToFlight();
  else story.start();
}

/** 스토리 캔버스(스토리 모드 · 최종 보스전)를 접고 홈으로 돌아가요. */
function exitStory() {
  story.stop();
  hide(el.storyCanvas);
  hide(el.screenStoryClear);
  hide(el.screenStoryFail);
  hide(el.screenFinalClear);
  hide(el.screenFinalFail);
  hide(el.screenPause);
  hide(el.btnPause);
  finalRun = null;
  // 연습 보스전 도중에 홈으로 나갔다면 튜토리얼은 아직 안 깬 거예요.
  tutorialBoss = false;
  game.setRenderEnabled(true);
  goHome();
}

function showStoryClear(result) {
  hide(el.btnPause);
  el.storyScore.textContent = String(result.score);
  show(el.screenStoryClear);

  // 스토리 진행 상황은 이 기기에만 저장해요. (랭킹·보석과 무관한 값이라 서버에 올리지 않아요)
  records.storyCleared = true;
  records.storyBest = Math.max(records.storyBest || 0, result.score);
  persist();
  haptic('confetti');
}

function showStoryFail(result) {
  hide(el.btnPause);
  el.storyFailScore.textContent = String(result.score);
  show(el.screenStoryFail);
  records.storyBest = Math.max(records.storyBest || 0, result.score);
  persist();
}

/** 결과 화면에서 다시 — 대사는 이미 봤으니 비행부터 시작해요. */
function restartStory() {
  hide(el.screenStoryClear);
  hide(el.screenStoryFail);
  show(el.btnPause);
  story.retry();
}

/* ────────────────────────────── 최종 보스전 (엔딩)

   본편에서 100번째 행성 「관문」에 닿으면 여기로 넘어와요.
   화면은 스토리 모드와 같은 캔버스·엔진을 쓰고(story.startFinalBoss),
   본편 점수를 들고 들어가 보스전 점수를 더한 값이 이 판의 총점이 돼요. */

/** 보스전에 들고 들어간 본편 결과. 재도전할 때 그대로 다시 써요. */
let finalRun = null;

function startFinalBoss(result) {
  finalRun = { ...result };

  hide(el.home);
  hide(el.screenOver);
  hide(el.screenPause);
  hide(el.screenFinalClear);
  hide(el.screenFinalFail);
  show(el.btnPause);
  show(el.storyCanvas);

  // 본편 캔버스는 가려지니 그리기만 꺼요. (game.js 백버퍼 주석 참고)
  game.setRenderEnabled(false);
  story.setSkin(records.equippedSkin);
  story.startFinalBoss({ carryScore: finalRun.score });
}

/**
 * 이번 판을 기록으로 남겨요. (클리어든 실패든 한 판은 한 판이에요)
 *
 * 총점은 **본편 점수 + 보스전 점수**라 game.getRecords()가 모르는 값이에요.
 * 그래서 records.best를 여기서 직접 올리고 게임 HUD에도 다시 넣어줘요.
 */
function commitFinalRun(total, cleared) {
  const result = {
    score: total,
    stage: finalRun.stage,
    stageName: finalRun.stageName,
    landed: finalRun.landed,
    reached: TOTAL_PLANETS,
    bestCombo: finalRun.bestCombo,
    revives: finalRun.revives,
    gems: finalRun.gems,
    reason: cleared ? '최종 관문 돌파' : '최종 관문 실패',
    cleared,
    /** 최종 보스전까지 갔던 판이라는 표시. 「거의다왔는데..」가 이걸 봐요. */
    finalBattle: true,
  };

  // 이번 판 보석은 한 번만 지갑에 넣어요. (보스 재도전으로 두 번 들어가지 않게)
  if (finalRun.gems > 0) {
    records.gems += finalRun.gems;
    finalRun.gems = 0;
    markDirty();
    renderWallet();
  }

  records.best = Math.max(records.best, total);
  records.bestCombo = Math.max(records.bestCombo, finalRun.bestCombo);
  records.bestReached = TOTAL_PLANETS;
  if (cleared) {
    records.cleared = true;
    records.clearCount += 1;
  }
  game.setRecords(records);

  // 업적 판정은 records를 다 올린 **뒤에** 해야 해요. (clearCount가 반영돼 있어야 하니까)
  grantAchievements(result);

  persist();
  pushCloud();
  cloud.addRun(userKey, result);
  leaderboard.submit(total);
  return result;
}

function showFinalClear(res) {
  // 연습 보스전은 기록·업적·랭킹 어디에도 남기지 않아요.
  if (tutorialBoss) {
    endTutorialBoss(true);
    return;
  }
  hide(el.btnPause);
  const gems = finalRun?.gems || 0;
  const bestCombo = finalRun?.bestCombo || 0;
  commitFinalRun(res.score, true);

  el.finalScore.textContent = String(res.score);
  el.finalDetail.textContent =
    `행성 ${TOTAL_PLANETS}/${TOTAL_PLANETS} 통과 · 최고 콤보 x${bestCombo} · 보스 +${res.bossScore}`;
  if (gems > 0) {
    el.finalGems.querySelector('b').textContent = String(gems);
    show(el.finalGems);
  } else {
    hide(el.finalGems);
  }

  show(el.screenFinalClear);
  haptic('confetti');
}

function showFinalFail(res) {
  if (tutorialBoss) {
    endTutorialBoss(false);
    return;
  }
  hide(el.btnPause);
  commitFinalRun(res.score, false);

  el.finalFailScore.textContent = String(res.score);
  el.finalFailDetail.textContent =
    `행성 ${TOTAL_PLANETS}/${TOTAL_PLANETS}까지 왔어요. 관문만 남았습니다.`;
  show(el.screenFinalFail);
}

/** 보스만 다시 — 본편 점수는 그대로 들고 다시 붙어요. */
function retryFinalBoss() {
  if (!finalRun) {
    exitStory();
    return;
  }
  hide(el.screenFinalFail);
  show(el.btnPause);
  story.startFinalBoss({ carryScore: finalRun.score });
}

el.btnFinalAgain.addEventListener('click', () => {
  haptic('tap');
  // 처음부터 다시 — 스토리 캔버스를 접고 본편을 새로 시작해요.
  story.stop();
  hide(el.storyCanvas);
  hide(el.screenFinalClear);
  finalRun = null;
  game.setRenderEnabled(true);
  withInterstitial(startGame);
});

el.btnFinalHome.addEventListener('click', () => {
  haptic('tap');
  exitStory();
});

el.btnFinalRetry.addEventListener('click', () => {
  haptic('tap');
  retryFinalBoss();
});

el.btnFinalGiveup.addEventListener('click', () => {
  haptic('tap');
  exitStory();
});

el.homeStory.addEventListener('click', (e) => {
  e.stopPropagation();
  haptic('tap');
  // 한 번 깬 사람에게는 인트로를 건너뛸지 물어보지 않고 처음부터 보여줘요.
  // (스토리 모드는 이야기를 보러 오는 곳이라 기본은 언제나 1장부터)
  openStory(false);
});

el.btnStoryAgain.addEventListener('click', () => {
  haptic('tap');
  restartStory();
});

el.btnStoryRetry.addEventListener('click', () => {
  haptic('tap');
  restartStory();
});

el.btnStoryHome.addEventListener('click', () => {
  haptic('tap');
  exitStory();
});

el.btnStoryFailHome.addEventListener('click', () => {
  haptic('tap');
  exitStory();
});

/* ────────────────────────────── 상점 */

/** 미리보기 캔버스들을 한 루프에서 같이 돌려요. */
const previews = [];
let previewRaf = 0;

function runPreviews() {
  cancelAnimationFrame(previewRaf);
  if (!previews.length) return;
  const tick = () => {
    const t = performance.now() / 1000;
    for (const p of previews) drawSkinPreview(p.ctx, p.skin, p.w, p.h, t);
    previewRaf = requestAnimationFrame(tick);
  };
  previewRaf = requestAnimationFrame(tick);
}

function stopPreviews() {
  cancelAnimationFrame(previewRaf);
  previewRaf = 0;
  previews.length = 0;
}

function renderShop() {
  stopPreviews();
  el.shopList.textContent = '';
  renderWallet();

  // 게임 캔버스와 같은 기준. 2로 묶으면 3x 화면에서 미리보기만 흐려져요.
  const dpr = Math.min(window.devicePixelRatio || 1, 3);

  for (const skin of SKINS) {
    const owned = records.ownedSkins.includes(skin.id);
    const equipped = records.equippedSkin === skin.id;

    const item = document.createElement('div');
    item.className = `shop-item${equipped ? ' is-equipped' : ''}`;

    const canvas = document.createElement('canvas');
    canvas.width = 54 * dpr;
    canvas.height = 54 * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    previews.push({ ctx, skin, w: 54, h: 54 });
    item.appendChild(canvas);

    const info = document.createElement('div');
    info.className = 'shop-info';
    const name = document.createElement('div');
    name.className = 'shop-name';
    name.textContent = skin.name;
    const desc = document.createElement('div');
    desc.className = 'shop-desc';
    desc.textContent = skin.desc;
    info.append(name, desc);
    item.appendChild(info);

    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'shop-action';
    if (equipped) {
      action.classList.add('is-on');
      action.textContent = '장착 중';
      action.disabled = true;
    } else if (owned) {
      action.classList.add('is-owned');
      action.textContent = '장착';
      action.addEventListener('click', () => equipSkin(skin.id));
    } else {
      const cost = document.createElement('span');
      cost.className = 'cost';
      cost.textContent = String(skin.price);
      action.appendChild(cost);
      action.disabled = records.gems < skin.price;
      action.addEventListener('click', () => buySkin(skin));
    }
    item.appendChild(action);

    el.shopList.appendChild(item);
  }

  runPreviews();
}

function equipSkin(id) {
  haptic('tap');
  records.equippedSkin = id;
  markDirty();
  game.setSkin(id);
  story.setSkin(id);
  persist();
  pushCloud();
  renderShop();
}

function buySkin(skin) {
  if (records.ownedSkins.includes(skin.id)) return;
  if (records.gems < skin.price) {
    toast(`보석이 ${skin.price - records.gems}개 더 필요해요.`);
    haptic('error');
    return;
  }
  records.gems -= skin.price;
  records.ownedSkins = [...records.ownedSkins, skin.id];
  records.equippedSkin = skin.id;
  markDirty();
  game.setSkin(skin.id);
  story.setSkin(skin.id);
  audio.init();
  audio.reward();
  haptic('confetti');
  toast(`${skin.name} 구매 완료! 바로 장착했어요.`);
  persist();
  pushCloud();
  renderShop();
  // 마지막 한 대를 샀다면 「올스킨유저」가 열려요. 구매 토스트 뒤에 뜨게 살짝 미뤄요.
  setTimeout(() => grantAchievements(), 1200);
}

/* ────────────────────────────── 하단 배너 광고

   화면 맨 아래에 계속 붙어 있는 띠예요. 켜는 순간 body에 .has-banner가 붙고,
   그때부터 캔버스(#game · #story)와 오버레이 UI(.ui)가 배너 높이만큼 위에서 끝나요.
   캔버스가 줄면 game.js의 ResizeObserver가 논리 높이·배율을 다시 잡아서
   행성 크기나 조작감은 그대로고, 세로로 보이는 범위만 조금 줄어들어요.

   자리를 언제 잡고 언제 접는지
     - 붙이는 순간 바로 자리를 잡아요. 컨테이너에 높이가 있어야 SDK가 광고를 제대로 그려요.
     - **첫 시도가 실패**하면(광고 없음 · 렌더 실패) 자리를 접어서 화면을 돌려줘요.
       광고가 안 나오는데 빈 검은 띠만 남는 게 제일 손해예요.
     - 한 번이라도 광고가 뜬 뒤에는 다시 접지 않아요. 게임 도중에 자리가 접혔다 펴지면
       화면이 위아래로 밀려서 조준이 망가지거든요. 배너는 주기적으로 다시 채워져요.

   붙이는 시점이 홈 화면(로딩 직후)이라, 첫 성공/실패 판정도 거기서 끝나요.
   게임이 시작된 뒤에 화면 높이가 바뀌는 일은 없습니다. */

function showBanner() {
  if (bannerOn) return;
  bannerOn = true;
  document.body.classList.add('has-banner');
  show(el.adBanner);
  // 캔버스가 줄어든 만큼 안전 영역 계산도 다시 넘겨줘요.
  pushInsets();
}

function hideBanner() {
  if (!bannerOn) return;
  bannerOn = false;
  document.body.classList.remove('has-banner');
  hide(el.adBanner);
  pushInsets();
}

function mountBanner() {
  if (bannerAd.available) {
    showBanner();

    // 첫 결과가 나올 때까지만 자리를 지켜봐요. 한 번 뜬 뒤에는 건드리지 않아요.
    let settled = false;
    bannerAd.attach(el.adBannerSlot, {
      onShown: () => {
        settled = true;
      },
      onFail: (reason) => {
        console.warn('[space-jump] 배너 광고를 못 띄웠어요:', reason);
        if (settled) return;
        settled = true;
        hideBanner();
      },
    });
    return;
  }

  /*
    토스 앱 밖(로컬 개발 · 웹 배포)에서는 실제 광고를 요청하지 않아요.
    실서비스 광고 ID라 브라우저에서 부르면 지표가 오염되고 정책에도 어긋나요.
    대신 개발 빌드에서만 같은 크기의 자리 표시를 깔아서 레이아웃을 눌러볼 수 있게 해요.
  */
  if (import.meta.env.DEV) {
    showBanner();
    el.adBanner.classList.add('is-placeholder');
    el.adBannerSlot.textContent = '배너 광고 영역 (개발용 표시)';
  }
}

/* ────────────────────────────── 업적(칭호)

   판정은 src/achievements.js가 하고, 여기서는 **언제 물어보는지**와
   얻었을 때 무엇을 주는지만 다뤄요.

   물어보는 시점
     - 판이 끝날 때 (게임오버 · 최종 보스 클리어 · 최종 보스 패배)
     - 스킨을 샀을 때 (올스킨유저)
     - 닉네임을 바꿨을 때 (나는야 프로그래머)
     - 부팅 직후 (예전 세이브에 조건이 이미 차 있던 사람 구제)

   튜토리얼 · 연습 보스전에서는 부르지 않아요. 연습은 기록이 아니니까요. */

/**
 * 업적 아이콘 — 직접 그린 선 아이콘이에요. 이모지를 쓰지 않아요.
 *
 * 이모지는 기기·OS마다 모양도 색도 굵기도 제각각이라, 한 화면에 여러 개를 놓으면
 * 우리가 그린 나머지 UI(모양 버튼 · 지갑 보석 · 인게임 경고 표지)와 절대 안 어울려요.
 * game.js에서 경고 표지를 캔버스로 직접 그리는 것과 같은 이유입니다.
 *
 * 값은 24×24 좌표계의 path 데이터 배열이고, 선 색은 CSS의 currentColor를 따라가요.
 * 그래서 획득/미획득에 따라 색만 바꾸면 아이콘 전체가 같이 따라옵니다.
 */
const ACHV_ICON = {
  // 깃발 — 관문을 넘고 꽂은 깃발.
  // (랭킹 버튼이 이미 트로피라서, 클리어 표시는 다른 걸 써야 안 헷갈려요.
  //  메달도 그려봤는데 20px에서는 원판 안 무늬가 뭉개져서 깃발로 갔어요)
  medal: [
    'M7.2 3.2V20.8',
    'M7.2 4.6C10.7 2.9 13.9 6.4 17.6 4.8V11.7C13.9 13.3 10.7 9.8 7.2 11.5Z',
  ],
  /*
    콤보 없음 — 콤보가 쌓일 때 뜨는 겹화살표를 그대로 쓰되, 아래쪽 화살표를
    가운데가 끊긴 채로 그려요. 사선(🚫 같은 금지 표시)을 얹어봤더니 화살표와
    각도가 겹쳐서 그냥 빗금 하나로 보였어요. "끊겼다"를 직접 보여주는 게 나아요.
  */
  'combo-off': ['M7.6 12.2 12 7.8 16.4 12.2', 'M7.6 18.2 10.1 15.7', 'M13.9 15.7 16.4 18.2'],
  // 불꽃 — 한 번도 안 끊긴 연속. 바깥 불꽃 안에 심지가 하나 더 있어요.
  flame: [
    'M12 2.6C15.4 6 17.4 8.9 17.4 12.3A5.4 5.4 0 0 1 6.6 12.3C6.6 9.6 8 7.5 9.6 5.9 9.8 7.4 10.3 8.4 11.2 9 11.5 6.8 11.8 4.5 12 2.6Z',
    'M12 19.9A2.5 2.5 0 0 1 9.9 16.1C10.6 16.7 11.3 16.8 11.8 16.4 11.6 15 12.1 13.9 13 13.1 13.5 14.4 14.5 15.2 14.5 16.9A2.5 2.5 0 0 1 12 19.9Z',
  ],
  // 온전한 하트 — 여분 목숨을 한 번도 안 썼다는 뜻.
  heart: ['M12 20.4C12 20.4 4 15.2 4 9.8A4.2 4.2 0 0 1 12 7.7A4.2 4.2 0 0 1 20 9.8C20 15.2 12 20.4 12 20.4Z'],
  // 금 간 하트 — 같은 하트에 지그재그 균열만 얹었어요. 짝이라는 게 보이게.
  'heart-crack': [
    'M12 20.4C12 20.4 4 15.2 4 9.8A4.2 4.2 0 0 1 12 7.7A4.2 4.2 0 0 1 20 9.8C20 15.2 12 20.4 12 20.4Z',
    'M12 7.9 10.1 11.5 13.3 13.3 11.3 17.2',
  ],
  // 우주선 — 게임 안 우주선과 같은 실루엣(뾰족한 콧날 + 양 날개 + 분사).
  rocket: [
    'M12 2.6C14.6 5.3 16 8.7 16 12.5V15.4H8V12.5C8 8.7 9.4 5.3 12 2.6Z',
    'M8 12.7 5.2 16.1V18.7L8 16.9',
    'M16 12.7 18.8 16.1V18.7L16 16.9',
    'M12 8.4A1.7 1.7 0 1 0 12 11.8A1.7 1.7 0 1 0 12 8.4',
    'M10.2 17.3 12 21.4 13.8 17.3',
  ],
  // 꺾쇠와 슬래시 — 코드.
  code: ['M8.6 8.4 4.6 12 8.6 15.6', 'M15.4 8.4 19.4 12 15.4 15.6', 'M13.6 5.4 10.4 18.6'],
  // 아직 못 얻은 숨은 업적 — 자물쇠.
  lock: [
    'M8.4 10.4V7.9A3.6 3.6 0 0 1 15.6 7.9V10.4',
    'M5.9 10.4H18.1A1.4 1.4 0 0 1 19.5 11.8V18.6A1.4 1.4 0 0 1 18.1 20H5.9A1.4 1.4 0 0 1 4.5 18.6V11.8A1.4 1.4 0 0 1 5.9 10.4Z',
    'M12 13.9V16.6',
  ],
  // 나침반 — 연습을 마치고 이제 항로를 잡는다는 뜻. 원 + 바늘 두 개면 20px에서도 읽혀요.
  compass: [
    'M12 3.4A8.6 8.6 0 1 0 12 20.6A8.6 8.6 0 1 0 12 3.4',
    'M15.4 8.6 13.5 13.5 8.6 15.4 10.5 10.5Z',
  ],
  // icon 이름을 잘못 적었을 때 대신 나오는 별.
  star: ['M12 3.3 14.5 9.1 20.8 9.7 16 13.9 17.4 20.1 12 16.8 6.6 20.1 8 13.9 3.2 9.7 9.5 9.1Z'],
};

/**
 * path 데이터 배열 → 화면에 붙일 수 있는 <svg> 요소.
 *
 * innerHTML을 쓰지 않고 createElementNS로 쌓아요. 값이 전부 우리 소스에 박힌
 * 상수라 지금은 안전하지만, 나중에 누가 여기에 서버 값을 물리면 그대로 구멍이 되거든요.
 */
function makeIcon(name) {
  const paths = ACHV_ICON[name] || ACHV_ICON.star;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const d of paths) {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

/**
 * 지금 조건이 찬 업적이 있으면 지급해요.
 *
 * @param {object} [run] 방금 끝난 판. 없으면 누적 기록만 보고 판정해요.
 * @returns {object[]} 이번에 새로 얻은 업적
 */
function grantAchievements(run) {
  const gained = checkAchievements(records.achievements, {
    records,
    run,
    skinCount: SKINS.length,
    totalPlanets: TOTAL_PLANETS,
  });
  if (!gained.length) return [];

  records.achievements = [...records.achievements, ...gained.map((a) => a.id)];

  /*
    여기서는 보석을 **안 줘요.** 업적 목록에서 「받기」를 눌러야 들어와요.
    (achievements.js의 claim — 자동 지급은 언제 줬는지가 클라이언트 안에서만
     흐르고 지나가서, 앱을 지웠다 깔면 같은 보석을 또 받을 수 있어요)
  */
  persist();
  cloud.addAchievements(userKey, gained.map((a) => a.id));

  for (const a of gained) queueAchievementToast(a);
  return gained;
}

/* ── 달성 알림
   한 번에 여러 개가 열릴 수 있어요. (클리어하면 first-clear + no-revive + … )
   겹쳐 띄우면 마지막 것만 보이니까 줄을 세워 하나씩 보여줘요. */

const achvQueue = [];
let achvTimer = 0;

/** 알림 한 장이 화면에 머무는 시간(ms). CSS의 achv-drop 길이와 맞춰요. */
const ACHV_TOAST_MS = 2900;

function queueAchievementToast(a) {
  achvQueue.push(a);
  if (!achvTimer) playAchievementToast();
}

function playAchievementToast() {
  const a = achvQueue.shift();
  if (!a) {
    achvTimer = 0;
    return;
  }

  el.achvToastIcon.textContent = '';
  el.achvToastIcon.appendChild(makeIcon(a.icon));
  el.achvToastName.textContent = a.name;

  if (a.reward) {
    // 아직 지갑에 안 들어왔어요. "획득"이라고 하면 지갑을 보고 갸웃해요.
    el.achvToastReward.textContent = `업적에서 보석 ${a.reward}개를 받아가세요`;
    show(el.achvToastReward);
  } else {
    hide(el.achvToastReward);
  }

  /*
    같은 요소를 다시 쓰니까 CSS 애니메이션을 손으로 되감아야 해요.

    animation-fill-mode가 forwards라, 그냥 다시 보여주면 지난번 끝 상태
    (투명도 0)에 그대로 멈춰 있어서 **두 번째 알림부터 안 보여요.**
    display:none으로 숨겼다 보여주는 것만으로는 부족해요 — 브라우저가 두 변경을
    한 번에 처리하면 요소가 실제로 사라진 적이 없어서 애니메이션이 안 끊겨요.

    그래서 순서가 중요해요. 먼저 보이게 만들고(레이아웃이 살아난 뒤),
    애니메이션을 껐다가, 강제로 레이아웃을 한 번 계산시키고, 다시 켜요.
  */
  show(el.achvToast);
  el.achvToast.style.animation = 'none';
  void el.achvToast.offsetWidth;
  el.achvToast.style.animation = '';

  audio.reward();
  haptic('success');

  achvTimer = setTimeout(() => {
    hide(el.achvToast);
    achvTimer = 0;
    // 다음 장이 있으면 살짝 쉬었다 이어서
    if (achvQueue.length) achvTimer = setTimeout(playAchievementToast, 260);
  }, ACHV_TOAST_MS);
}

/** 이 업적의 보상을 아직 안 받았는지 (받을 수 있는 상태인지) */
function canClaim(a) {
  return (
    a.claim === true &&
    records.achievements.includes(a.id) &&
    !records.claimedRewards.includes(a.id)
  );
}

/** 「받기」 버튼을 눌렀어요. 보석을 지갑에 넣고 다시 그려요. */
function claimReward(a) {
  if (!canClaim(a)) return;
  records.claimedRewards = [...records.claimedRewards, a.id];
  records.gems += a.reward || 0;
  markDirty();
  renderWallet();
  persist();
  pushCloud();

  /*
    받았다는 사실을 서버에도 남겨요. 안 그러면 앱을 지웠다 깔 때 또 받을 수 있어요.
    업적을 얻은 그 줄에 그대로 표시돼요. (achievements.claimed_at)
  */
  cloud.claimAchievementReward(userKey, a.id, a.reward || 0);

  audio.init();
  audio.reward();
  haptic('confetti');
  toast(`보석 ${a.reward}개를 받았어요!`);

  renderAchievements();
  renderAchvGuide();
}

function renderAchievements() {
  const have = new Set(records.achievements);
  el.achvCount.textContent = `${have.size} / ${ACHIEVEMENTS.length} 달성`;
  el.achvList.textContent = '';

  for (const a of ACHIEVEMENTS) {
    const on = have.has(a.id);
    // 숨은 업적은 못 얻은 동안 아이콘·이름·조건을 **전부** 가려요.
    // 이름만 ???로 두고 조건을 적어두면 가린 의미가 없거든요.
    const hidden = a.secret && !on;

    const row = document.createElement('div');
    row.className = `achv-row${on ? ' is-on' : ''}`;

    const icon = document.createElement('span');
    icon.className = 'achv-icon';
    icon.appendChild(makeIcon(hidden ? 'lock' : a.icon));

    const text = document.createElement('div');
    text.className = 'achv-text';

    const name = document.createElement('p');
    name.className = 'achv-name';
    name.textContent = hidden ? '???' : a.name;

    const desc = document.createElement('p');
    desc.className = 'achv-desc';
    desc.textContent = on ? a.desc : hidden ? SECRET_HINT : a.hint;

    text.append(name, desc);

    const mark = document.createElement('span');
    mark.className = 'achv-mark';
    mark.textContent = on ? '달성' : '미달성';

    row.append(icon, text, mark);

    /*
      「달성」 옆에 받기 버튼.

      아직 안 받은 보상만 버튼으로 나와요. 받고 나면 「받음」 표시로 바뀌어서
      "여기서 받았다"는 흔적이 남아요. 아예 지워버리면 방금 뭘 했는지 안 보여요.
    */
    if (a.claim && on) {
      if (canClaim(a)) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'achv-claim';
        /*
          보석 그림 + 숫자, 이게 전부예요.

          「보석」은 앞의 아이콘이 대신하고(style.css의 .achv-claim::before),
          「받기」는 버튼 생김새가 대신해요. 줄 하나에 이름 · 설명 · 달성 · 버튼이
          다 들어가야 해서, 글자를 줄인 만큼 업적 이름이 안 잘려요.
          화면에 안 보이는 설명은 aria-label로 남겨둡니다.
        */
        btn.textContent = String(a.reward);
        btn.setAttribute('aria-label', `${a.name} 보상 보석 ${a.reward}개 받기`);
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          haptic('tap');
          claimReward(a);
        });
        row.appendChild(btn);
        row.classList.add('has-claim');
      } else {
        const done = document.createElement('span');
        done.className = 'achv-claimed';
        done.textContent = '받음';
        row.appendChild(done);
      }
    }

    el.achvList.appendChild(row);
  }
}

/**
 * 업적 탭 위쪽 안내.
 *
 * 튜토리얼을 막 끝낸 사람에게 "여기서 보석을 받아가세요"를 알려주고,
 * 받고 나면 "다른 업적도 있어요"로 바뀌어요. 둘 다 볼 일 없어지면 사라집니다.
 */
function renderAchvGuide() {
  if (!achvOnboarding) {
    hide(el.achvGuide);
    return;
  }
  const tut = ACHIEVEMENTS.find((a) => a.id === 'tutorial-clear');
  const waiting = tut && canClaim(tut);
  el.achvGuide.textContent = waiting
    ? `「${tut.name}」 업적을 달성했어요. 아래에서 보석 ${tut.reward}개를 받아가세요!`
    : '다른 업적들도 클리어해보아요. 보석이 더 기다리고 있어요!';
  el.achvGuide.classList.toggle('is-done', !waiting);
  show(el.achvGuide);
}

/** 시트 안 탭 전환 */
function showRankTab(which) {
  const rank = which === 'rank';
  el.tabRank.classList.toggle('is-on', rank);
  el.tabAchv.classList.toggle('is-on', !rank);
  el.paneRank.classList.toggle('is-hidden', !rank);
  el.paneAchv.classList.toggle('is-hidden', rank);
  if (rank) {
    renderRank();
    hide(el.achvGuide);
  } else {
    renderAchievements();
    renderAchvGuide();
  }
}

el.tabRank.addEventListener('click', (e) => {
  e.stopPropagation();
  haptic('tap');
  showRankTab('rank');
});

el.tabAchv.addEventListener('click', (e) => {
  e.stopPropagation();
  haptic('tap');
  showRankTab('achv');
});

/* ────────────────────────────── 랭킹 */

async function renderRank() {
  el.rankList.textContent = '';
  el.rankMine.textContent = '';

  const loading = document.createElement('p');
  loading.className = 'rank-empty';
  loading.textContent = '불러오는 중…';
  el.rankList.appendChild(loading);

  el.btnRankToss.classList.toggle('is-hidden', !leaderboard.available);

  const rows = await cloud.leaderboard();
  el.rankList.textContent = '';

  if (!rows) {
    const p = document.createElement('p');
    p.className = 'rank-empty';
    p.textContent =
      cloud.status === 'no-table'
        ? '랭킹 서버가 아직 준비되지 않았어요.\n(supabase/schema.sql을 실행해 주세요)'
        : '지금은 랭킹을 불러올 수 없어요.\n잠시 뒤에 다시 열어봐 주세요.';
    el.rankList.appendChild(p);
    return;
  }

  if (!rows.length) {
    const p = document.createElement('p');
    p.className = 'rank-empty';
    p.textContent = '아직 아무도 기록을 올리지 않았어요.\n첫 번째가 되어보세요!';
    el.rankList.appendChild(p);
    return;
  }

  rows.forEach((row, i) => {
    const isMe = row.user_key === userKey;
    const div = document.createElement('div');
    div.className = `rank-row top-${i + 1}${isMe ? ' is-me' : ''}`;

    const no = document.createElement('span');
    no.className = 'rank-no';
    no.textContent = String(i + 1);

    const name = document.createElement('span');
    name.className = 'rank-name';
    name.textContent = row.nickname || '우주미아';

    const score = document.createElement('span');
    score.className = 'rank-score';
    score.textContent = Number(row.best_score).toLocaleString('ko-KR');

    div.append(no, name, score);
    el.rankList.appendChild(div);
  });

  // 상위 목록에 내가 없으면 순위를 따로 물어봐요.
  const myRow = rows.findIndex((r) => r.user_key === userKey);
  if (myRow >= 0) {
    el.rankMine.textContent = `내 순위 ${myRow + 1}위`;
  } else if (records.best > 0) {
    const rank = await cloud.myRank(records.best);
    el.rankMine.textContent = rank ? `내 순위 ${rank}위` : '';
  }
}

/* ────────────────────────────── 설정 */

function renderSettings() {
  el.inputNick.value = records.nickname || '';
  el.inputNick.placeholder = defaultNickname(userKey);
  el.swSfx.checked = settings.sfx;
  el.swBgm.checked = settings.bgm;
  el.swHaptic.checked = settings.haptic;
  el.rangeVol.value = String(Math.round(settings.volume * 100));
  el.volValue.textContent = `${Math.round(settings.volume * 100)}%`;
  setNickMsg('한글·영문·숫자 2~12글자. 랭킹에 이 이름으로 올라가요.', '');

  el.syncMsg.textContent =
    cloud.status === 'no-table'
      ? '랭킹 서버가 아직 준비되지 않았어요. 기록은 이 기기에 저장돼요.'
      : cloud.status === 'offline'
        ? '서버에 연결하지 못했어요. 기록은 이 기기에 저장돼요.'
        : '';
}

function setNickMsg(text, kind) {
  el.nickMsg.textContent = text;
  el.nickMsg.classList.toggle('is-error', kind === 'error');
  el.nickMsg.classList.toggle('is-ok', kind === 'ok');
}

async function saveNickname() {
  const check = validateNickname(el.inputNick.value);
  if (!check.ok) {
    setNickMsg(check.reason, 'error');
    haptic('error');
    return;
  }

  const next = check.value;
  if (next === records.nickname) {
    setNickMsg('이미 쓰고 있는 닉네임이에요.', '');
    return;
  }

  el.btnNickSave.disabled = true;
  setNickMsg('확인하는 중…', '');

  // 서버가 없으면 로컬에만 저장해요. (중복 검사는 못 하지만 게임은 계속돼요)
  if (!cloud.enabled || !userKey) {
    records.nickname = next;
    await persist();
    el.btnNickSave.disabled = false;
    el.homeNick.textContent = next;
    setNickMsg('저장했어요. (이 기기에만 저장돼요)', 'ok');
    grantAchievements();
    return;
  }

  const taken = await cloud.isNicknameTaken(next, userKey);
  if (taken === true) {
    el.btnNickSave.disabled = false;
    setNickMsg('이미 누군가 쓰고 있는 닉네임이에요.', 'error');
    haptic('error');
    return;
  }

  // 프로필 행이 없을 수도 있으니 먼저 만들어 두고 이름을 바꿔요.
  await pushCloud();
  const result = await cloud.setNickname(userKey, next);

  el.btnNickSave.disabled = false;
  if (result === 'taken') {
    // 확인과 저장 사이에 남이 먼저 가져간 경우
    setNickMsg('방금 다른 분이 먼저 가져갔어요. 다른 이름을 써주세요.', 'error');
    haptic('error');
    return;
  }

  records.nickname = next;
  await persist();
  el.homeNick.textContent = next;
  setNickMsg(
    result === 'ok' ? '저장했어요.' : '저장했어요. (서버 반영은 나중에 다시 시도해요)',
    'ok'
  );
  haptic('success');
  // 「나는야 프로그래머」 — 새 이름이 규칙에 맞으면 여기서 열려요.
  grantAchievements();
}

/* ────────────────────────────── 시트 열기/닫기 */

/** 시트를 열 때 뒤에 있던 화면을 기억했다가 닫을 때 되돌려요. */
let sheetReturn = null;

function openSheet(node, onOpen) {
  sheetReturn =
    [el.screenOver, el.home, el.screenPause].find((s) => !s.classList.contains('is-hidden')) ||
    null;
  if (sheetReturn) hide(sheetReturn);
  onOpen?.();
  show(node);
}

function closeSheet(node) {
  hide(node);
  if (node === el.screenShop) stopPreviews();
  if (sheetReturn) {
    show(sheetReturn);
    sheetReturn = null;
  }
}

function anySheetOpen() {
  return [el.screenShop, el.screenRank, el.screenSettings].find(
    (s) => !s.classList.contains('is-hidden')
  );
}

/* ────────────────────────────── 버튼 */

/**
 * 홈 아무 데나 탭하면 시작해요.
 * 우측 모양 버튼은 자기 핸들러에서 stopPropagation 해서 여기까지 안 와요.
 */
el.home.addEventListener('click', () => {
  haptic('tap');
  startGame();
});

/* ── 게임오버 전환 광고 ─────────────────────────
   일정 스테이지 이상 간 판이 끝났을 때만, "재도전 · 홈으로"를 누르는 순간 띄워요.
   초반에 금방 죽는 사람에게는 안 띄워서 이탈을 막습니다. */

/** 직전 판에서 도달한 스테이지 (게임오버 화면이 떠 있는 동안만 의미 있어요) */
let lastStage = 0;

/** 마지막으로 전면 광고를 보여준 시각 — 광고가 연달아 나오는 걸 막아요. */
let lastAdAt = 0;

function wantsInterstitial() {
  if (!interstitialAd.available) return false;
  if (lastStage < AD_FROM_STAGE) return false;
  return Date.now() - lastAdAt >= AD_COOLDOWN_MS;
}

/**
 * 조건이 맞으면 전면 광고를 보여주고, 끝난 뒤에 `next()`를 실행해요.
 * 조건이 안 맞거나 광고가 준비 안 됐으면 **기다리지 않고 바로** 넘어가요.
 * (광고 때문에 버튼이 먹통처럼 보이면 안 돼요)
 */
function withInterstitial(next) {
  if (!wantsInterstitial() || !interstitialAd.loaded) {
    // 준비가 안 됐으면 이번엔 건너뛰고, 다음 판을 위해 미리 받아둬요.
    if (interstitialAd.available) interstitialAd.preload();
    next();
    return;
  }

  lastAdAt = Date.now();
  adInProgress = true;
  audio.suspend();

  interstitialAd.show({
    onClose: () => {
      adInProgress = false;
      audio.resume();
      next();
    },
  });
}

el.btnRetry.addEventListener('click', () => {
  haptic('tap');
  withInterstitial(startGame);
});

/* 홈 상단 칩 — 홈 레이어의 "탭하면 시작"으로 새지 않게 stopPropagation 해요. */

el.homeWallet.addEventListener('click', (e) => {
  e.stopPropagation();
  haptic('tap');
  audio.init();
  openSheet(el.screenShop, renderShop);
});

el.homeNick.addEventListener('click', (e) => {
  e.stopPropagation();
  haptic('tap');
  audio.init();
  openSheet(el.screenSettings, renderSettings);
  // 이름을 바꾸려고 누른 거니까 입력칸에 바로 커서를 둬요.
  el.inputNick.focus();
  el.inputNick.select();
});

el.btnShop.addEventListener('click', (e) => {
  e.stopPropagation();
  haptic('tap');
  audio.init();
  openSheet(el.screenShop, renderShop);
});

el.btnShopClose.addEventListener('click', () => {
  haptic('tap');
  closeSheet(el.screenShop);
});

el.btnRank.addEventListener('click', (e) => {
  e.stopPropagation();
  haptic('tap');
  // 열 때는 언제나 순위 탭부터. (지난번에 업적을 봤다고 거기서 열리면 헷갈려요)
  openSheet(el.screenRank, () => showRankTab('rank'));
});

el.btnHomeOver.addEventListener('click', () => {
  haptic('tap');
  withInterstitial(goHome);
});

el.btnHomePause.addEventListener('click', () => {
  haptic('tap');
  if (story.isActive) exitStory();
  else goHome();
});

/** 게임 중 일시정지 (스토리 모드에서도 같은 버튼을 써요) */
el.btnPause.addEventListener('click', (e) => {
  e.stopPropagation();
  if (story.isActive) {
    if (story.isPaused) return;
    haptic('tap');
    story.pause();
    show(el.screenPause);
    return;
  }
  if (!game.isPlaying || game.state.paused) return;
  haptic('tap');
  game.pause();
  show(el.screenPause);
});

el.btnRankClose.addEventListener('click', () => {
  haptic('tap');
  /*
    튜토리얼 안내로 들어온 시트였다면, 닫는 순간이 튜토리얼의 진짜 끝이에요.
    (시트를 열기 전 화면이 「연습 비행 완료」였으니 그리로 되돌리면 안 돼요)
    홈으로 배웅하면서 한마디 남기고, 안내는 여기서 영영 꺼집니다.
  */
  if (achvOnboarding) {
    achvOnboarding = false;
    sheetReturn = null;
    hide(el.screenRank);
    hide(el.achvGuide);
    goHome();
    toast('이제 여정을 떠나보아요!');
    return;
  }
  closeSheet(el.screenRank);
});

el.btnRankToss.addEventListener('click', () => {
  haptic('tap');
  leaderboard.open();
});

el.btnSettings.addEventListener('click', (e) => {
  e.stopPropagation();
  haptic('tap');
  audio.init();
  const open = anySheetOpen();
  if (open === el.screenSettings) {
    closeSheet(el.screenSettings);
    return;
  }
  if (open) closeSheet(open);
  openSheet(el.screenSettings, renderSettings);
});

el.btnSettingsClose.addEventListener('click', () => {
  haptic('tap');
  closeSheet(el.screenSettings);
});

/*
  튜토리얼 다시보기 — 연습 코스를 처음부터 한 번 더 돌아요.

  조작을 잊었거나 새 대본이 궁금할 때 쓰는 문이에요. 기록·보석·업적은 건드리지
  않고, 끝나면 완료 안내 없이 홈으로 돌아옵니다. (tutorialReplay 플래그)
*/
el.btnTutorialReplay.addEventListener('click', () => {
  haptic('tap');
  closeSheet(el.screenSettings);
  tutorialReplay = true;
  startTutorial();
});

/* ── 계정 초기화 ─────────────────────────────
   보석 · 스킨 · 기록 · 업적 · 튜토리얼 진행을 서버와 기기 양쪽에서 지워요.

   식별키(user_key)는 기기·계정에서 나오는 값이라 그대로 남아요. 그래서 "탈퇴"가
   아니라 "초기화"예요. 지운 다음 게임을 켜면 같은 사람으로 빈 기록이 새로 만들어져요. */

function setWipeMsg(text = '', kind = '') {
  el.wipeMsg.textContent = text;
  el.wipeMsg.className = `field-msg${kind ? ` is-${kind}` : ''}`;
}

el.btnWipe.addEventListener('click', () => {
  haptic('tap');
  setWipeMsg();
  el.btnWipeConfirm.disabled = false;
  show(el.screenWipe);
});

el.btnWipeCancel.addEventListener('click', () => {
  haptic('tap');
  hide(el.screenWipe);
});

el.btnWipeConfirm.addEventListener('click', async () => {
  haptic('tap');
  el.btnWipeConfirm.disabled = true;
  setWipeMsg('지우는 중이에요…');

  /*
    서버부터 지우고, 성공했을 때만 기기를 지워요. 순서가 중요해요.

    반대로 하면 — 기기를 먼저 비웠는데 서버 삭제가 실패하면, 다음에 켤 때
    서버에 남아 있던 업적·튜토리얼 기록이 도로 내려와서 "안 지워졌다"가 돼요.
    더 나쁜 경우도 있어요. 기기에만 남은 업적이 서버로 **다시 올라가서**
    지운 기록이 되살아나기도 해요. (boot의 onlyLocal 업로드)

    그래서 서버가 실패하면 여기서 멈추고 다시 시도하게 둡니다.
    (연동 자체를 안 쓰는 환경에서는 서버에 사본이 없으니 기기만 지우면 끝이에요)
  */
  /*
    여기서부터는 저장을 전부 막아요.

    막지 않으면 이렇게 됩니다 — location.reload()가 pagehide를 일으키고,
    거기 걸린 persist()가 **메모리에 남아 있는 옛 기록을** 저장소에 다시 써요.
    새로 뜬 화면이 그걸 읽고, 서버에는 프로필이 없으니 "이 기기에만 있는 기록"으로
    보고 통째로 다시 올려요. 지운 게 몇 초 만에 원래대로 돌아옵니다.
  */
  wiping = true;

  if (cloud.enabled && userKey) {
    const done = await cloud.deleteAccount(userKey);
    if (!done) {
      wiping = false;
      setWipeMsg('서버와 연결하지 못했어요. 잠시 뒤에 다시 눌러주세요.', 'error');
      el.btnWipeConfirm.disabled = false;
      haptic('error');
      return;
    }
  }

  // 빈 객체를 저장하면 applySaved가 전부 기본값으로 되돌려요.
  await store?.save({});
  location.reload();
});

el.btnNickSave.addEventListener('click', () => {
  haptic('tap');
  saveNickname();
});

el.inputNick.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    saveNickname();
  }
});

el.swSfx.addEventListener('change', () => {
  settings.sfx = el.swSfx.checked;
  audio.init();
  applyAudioSettings();
  if (settings.sfx) {
    audio.land(3, false);
    haptic('tap');
  }
  persist();
});

el.swBgm.addEventListener('change', () => {
  settings.bgm = el.swBgm.checked;
  audio.init();
  applyAudioSettings();
  haptic('tap');
  persist();
});

el.swHaptic.addEventListener('change', () => {
  settings.haptic = el.swHaptic.checked;
  setHapticEnabled(settings.haptic);
  if (settings.haptic) haptic('tap');
  persist();
});

el.rangeVol.addEventListener('input', () => {
  settings.volume = Number(el.rangeVol.value) / 100;
  el.volValue.textContent = `${el.rangeVol.value}%`;
  audio.init();
  audio.setVolume(settings.volume);
});

el.rangeVol.addEventListener('change', () => {
  if (settings.sfx) audio.play(880, 0.12, 'sine', 0.1);
  persist();
});

el.btnRevive.addEventListener('click', async () => {
  if (adInProgress) return;
  haptic('tap');
  el.btnRevive.disabled = true;
  adInProgress = true;

  // 아직 로드 중이면 잠깐만 기다려요. (누른 뒤에 불러오는 게 아니라, 이미 시작된 로드를 기다리는 거예요)
  if (!rewardAd.loaded) {
    toast('광고를 준비하고 있어요…', 3000);
    const ok = await rewardAd.waitLoad(4000);
    if (!ok) {
      adInProgress = false;
      el.btnRevive.disabled = false;
      toast('지금은 광고를 불러올 수 없어요. 잠시 뒤에 다시 시도해 주세요.');
      return;
    }
    hide(el.toast);
  }

  // 광고가 뜨는 동안 게임과 소리를 완전히 멈춰요.
  game.pause();
  audio.suspend();

  let rewarded = false;
  // 부활 광고도 "마지막 광고" 시각에 반영해요.
  // 안 그러면 부활 광고 직후 죽었을 때 재도전에서 광고가 연달아 나와요.
  lastAdAt = Date.now();

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
        // 이어하기로 되살아나면 이번 판 보석도 계속 이어서 모아요.
        // (이미 지갑에 넣었으니 판이 끝날 때 중복으로 더하지 않도록 초기화해요)
        game.state.gems = 0;
        hide(el.overGems);
        show(el.btnPause);
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

/* ── 종료 확인 모달 (뒤에 깔린 화면은 잠시 감췄다가 되돌려요) */

let exitReturnScreen = null;

function openExitModal() {
  if (!el.screenExit.classList.contains('is-hidden')) return;
  exitReturnScreen =
    [el.screenOver, el.home, el.screenPause].find(
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

el.btnResume.addEventListener('click', () => {
  haptic('tap');
  hide(el.screenPause);
  audio.init();
  if (story.isActive) {
    show(el.btnPause);
    story.resume();
    return;
  }
  if (game.isPlaying) show(el.btnPause);
  game.resume();
});

el.btnExitCancel.addEventListener('click', () => {
  haptic('tap');
  closeExitModal();
});

el.btnExitConfirm.addEventListener('click', async () => {
  haptic('tap');
  await persist();
  await pushCloud();
  await closeApp();
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    const open = anySheetOpen();
    if (open) closeSheet(open);
  }
});

/* ────────────────────────────── 시스템 이벤트 */

// 뒤로가기(안드로이드 물리 버튼 / 시스템 제스처) → 바로 닫지 않고 확인 모달
onBack(() => {
  // 계정 초기화 확인이 떠 있으면 그것부터 닫아요. (설정 시트 위에 얹혀 있어요)
  if (!el.screenWipe.classList.contains('is-hidden')) {
    hide(el.screenWipe);
    return;
  }
  // 시트가 열려 있으면 그것부터 닫아요.
  const open = anySheetOpen();
  if (open) {
    closeSheet(open);
    return;
  }
  if (!el.screenExit.classList.contains('is-hidden')) {
    closeExitModal();
    return;
  }
  /*
    스토리 모드에서는 앱을 끄기 전에 한 단계 위로 올라가요.
    (진행 중 → 일시정지, 일시정지·결과 화면 → 홈)
    홈까지 올라온 뒤에 다시 누르면 그때 종료 확인 모달이 떠요.
  */
  if (story.isActive) {
    const resultOpen =
      !el.screenStoryClear.classList.contains('is-hidden') ||
      !el.screenStoryFail.classList.contains('is-hidden') ||
      !el.screenFinalClear.classList.contains('is-hidden') ||
      !el.screenFinalFail.classList.contains('is-hidden');
    if (resultOpen || story.isPaused) {
      exitStory();
    } else {
      story.pause();
      show(el.screenPause);
    }
    return;
  }
  openExitModal();
});

// 백그라운드 전환 — 소리를 즉시 끄고 게임을 멈춰요.
onVisibility(
  () => {
    audio.suspend();
    // 스토리 모드도 똑같이 멈춰요. 사이렌이 백그라운드에서 계속 울면 안 되니까요.
    if (story.isActive && !story.isPaused) {
      story.pause();
      if (!adInProgress) show(el.screenPause);
    }
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

/* ────────────────────────────── 첫 진입 화면 */

/** 진행 막대가 너무 빨리 사라지면 깜빡인 것처럼 보여요. */
const LOADING_MIN_MS = 700;
/** 세이브·네트워크가 늦어져도 여기서는 무조건 메뉴를 띄워요. */
const LOADING_MAX_MS = 2500;

const loadingStartedAt = performance.now();
let loadingReady = false;

/** 준비 완료 — 진행 막대를 "게임하기 · 스토리 모드" 메뉴로 바꿔요. */
function showLoadingMenu() {
  if (loadingReady) return;
  loadingReady = true;

  const wait = Math.max(0, LOADING_MIN_MS - (performance.now() - loadingStartedAt));
  setTimeout(() => {
    const progress = document.getElementById('loading-progress');
    const menu = document.getElementById('loading-menu');
    if (!progress || !menu) return;
    hide(progress);
    show(menu);
  }, wait);
}

/** 첫 화면을 걷어내요. "게임하기"를 눌렀을 때만 불려요. */
function closeLoading() {
  const node = document.getElementById('loading');
  if (!node) return;
  node.classList.add('is-done');
  // 페이드가 끝나면 DOM에서 빼요. 남겨두면 캔버스 위에 레이어가 계속 얹혀 있어요.
  setTimeout(() => node.remove(), 500);

  /*
    배너는 첫 화면이 걷힌 뒤에 붙여요.
    로딩 화면(z-index 100)이 배너를 덮고 있는 동안 광고가 렌더되면 노출로 잡히는데,
    사용자는 본 적이 없어요. 지표를 속이는 셈이라 화면이 열린 뒤에 붙입니다.
  */
  mountBanner();
}

// 부팅이 아무리 늦어도 2.5초 뒤에는 메뉴를 보여줘요.
setTimeout(showLoadingMenu, LOADING_MAX_MS);

el.btnPlay?.addEventListener('click', () => {
  haptic('tap');
  // 바로 게임을 시작하지 않고 메인(홈) 화면으로 가요.
  // 홈에는 최고 기록·보석과 설정·상점·랭킹이 있고, 거기서 탭하면 시작돼요.
  closeLoading();
});

el.btnStory?.addEventListener('click', () => {
  haptic('tap');
  openStory(false); // 첫 화면은 openStory 안에서 같이 닫혀요
});

/**
 * 잠긴 스토리 모드 버튼을 "준비 중"으로 보이게 해요.
 * 눌러도 안내(토스트)만 뜨지만, 누르기 전에 이미 읽히는 게 더 친절해요.
 */
function markStoryLocked() {
  if (!STORY_LOCKED) return;
  for (const btn of [el.homeStory, el.btnStory]) {
    if (!btn) continue;
    btn.classList.add('is-locked');
    btn.setAttribute('aria-label', '스토리 모드 (추후 업데이트 예정)');
  }
  const label = el.homeStory?.querySelector('.shape-label');
  if (label) label.textContent = '준비중';
  if (el.btnStory) el.btnStory.textContent = '스토리 모드 (준비 중)';
}
markStoryLocked();

/* ────────────────────────────── 부팅 */

/** 로컬 세이브를 records/settings에 반영해요. */
function applySaved(saved) {
  if (!saved) return;
  records.best = Number(saved.best) || 0;
  records.bestCombo = Number(saved.bestCombo) || 0;
  records.plays = Number(saved.plays) || 0;
  records.gems = Math.max(0, Number(saved.gems) || 0);
  records.nickname = typeof saved.nickname === 'string' ? saved.nickname : '';
  records.ownedSkins = Array.isArray(saved.ownedSkins) && saved.ownedSkins.length
    ? [...new Set([DEFAULT_SKIN, ...saved.ownedSkins])]
    : [DEFAULT_SKIN];
  records.equippedSkin = records.ownedSkins.includes(saved.equippedSkin)
    ? saved.equippedSkin
    : DEFAULT_SKIN;
  records.storyCleared = saved.storyCleared === true;
  records.storyBest = Math.max(0, Number(saved.storyBest) || 0);
  records.cleared = saved.cleared === true;
  records.clearCount = Math.max(0, Number(saved.clearCount) || 0);
  records.bestReached = Math.max(0, Number(saved.bestReached) || 0);
  records.tutorialVersion = Math.max(0, Number(saved.tutorialVersion) || 0);
  records.achievements = Array.isArray(saved.achievements) ? [...saved.achievements] : [];
  records.claimedRewards = Array.isArray(saved.claimedRewards) ? [...saved.claimedRewards] : [];
  records.dirty = saved.dirty === true;

  const s = saved.settings || {};
  if (typeof s.sfx === 'boolean') settings.sfx = s.sfx;
  if (typeof s.bgm === 'boolean') settings.bgm = s.bgm;
  if (typeof s.haptic === 'boolean') settings.haptic = s.haptic;
  if (typeof s.volume === 'number') settings.volume = Math.min(1, Math.max(0, s.volume));
  // 예전 세이브(sound 하나로 관리하던 시절)와 호환
  if (typeof s.sound === 'boolean' && typeof s.sfx !== 'boolean') {
    settings.sfx = s.sound;
    settings.bgm = s.sound;
    settings.haptic = s.sound;
  }
}

/**
 * 서버 프로필을 로컬에 합쳐요.
 *
 * 최고 기록은 큰 쪽을 남기면 되지만, **보석은 쓰는 재화라 max를 쓰면 안 돼요.**
 * (max로 합치면 기기 두 대를 번갈아 쓰며 같은 보석을 무한히 쓸 수 있어요.)
 * 그래서 기본은 서버 값을 따르되, 아직 서버에 못 올린 변화가 로컬에 있으면(dirty)
 * 로컬을 지키고 이쪽을 올려보내요.
 */
function mergeCloud(profile) {
  if (!profile) return;
  records.best = Math.max(records.best, Number(profile.best_score) || 0);
  records.bestCombo = Math.max(records.bestCombo, Number(profile.best_combo) || 0);
  records.plays = Math.max(records.plays, Number(profile.plays) || 0);
  if (profile.nickname) records.nickname = profile.nickname;

  // 보유 스킨은 합집합 — 어느 쪽에서 샀든 잃지 않아요.
  if (Array.isArray(profile.owned_skins)) {
    records.ownedSkins = [...new Set([DEFAULT_SKIN, ...records.ownedSkins, ...profile.owned_skins])];
  }

  if (!records.dirty) {
    records.gems = Math.max(0, Number(profile.gems) || 0);
    if (profile.equipped_skin && records.ownedSkins.includes(profile.equipped_skin)) {
      records.equippedSkin = profile.equipped_skin;
    }
  }
}

/**
 * 닉네임이 없는 사람에게 "우주미아1234"를 만들어 주고, 겹치면 번호를 바꿔가며 다시 시도해요.
 */
async function ensureNickname() {
  if (records.nickname) return;

  let candidate = defaultNickname(userKey);
  if (cloud.enabled && userKey) {
    for (let i = 0; i < 5; i++) {
      const taken = await cloud.isNicknameTaken(candidate, userKey);
      if (taken !== true) break; // 사용 가능하거나 확인 실패(그냥 진행)
      candidate = nicknameCandidate(candidate);
    }
  }
  records.nickname = candidate;
  await store?.save(localSnapshot());
}

async function boot() {
  if (IS_TEST_AD && isInToss) {
    console.warn(
      '[space-jump] 테스트용 광고 ID를 쓰고 있어요. 출시 번들에는 콘솔에서 발급받은 ID를 넣어주세요.'
    );
  }

  // 화면 설정은 진입 즉시 (게임 출시 가이드: 세로 고정 · 뒤로가기 제스처 차단)
  lockScreen();

  // 사용자 식별키 → 계정별 세이브
  // 로컬 세이브는 예전처럼 토스 식별키로만 구분해요. (기존 저장이 그대로 열리게)
  const tossKey = await getUserKey();
  store = createStore(tossKey);
  applySaved(await store.load());

  // 서버 저장·랭킹에 쓸 신원. 토스 식별키가 없으면 기기 단위 ID로 떨어져요.
  // 이게 없으면 브라우저에서는 랭킹에 아무것도 안 올라가요.
  userKey = tossKey || getDeviceKey();

  // 로컬 값으로 먼저 화면을 그려요. 서버는 늦게 와도 괜찮아요.
  audio.enabled = settings.sfx || settings.bgm;
  audio.sfxOn = settings.sfx;
  audio.bgmOn = settings.bgm;
  audio.volume = settings.volume;
  setHapticEnabled(settings.haptic);

  game.setRecords(records);
  game.setSkin(records.equippedSkin);
  story.setSkin(records.equippedSkin);
  renderHome();

  // 여기까지 오면 게임을 시작할 수 있어요. 아래 네트워크는 늦어도 상관없어요.
  showLoadingMenu();

  // 광고는 미리 받아둬요. (보여줄 때 로딩하지 않기 — 정책 필수)
  rewardAd.preload();

  // ── 여기부터는 네트워크. 실패해도 위에서 이미 게임은 준비돼 있어요.
  if (userKey) {
    mergeCloud(await cloud.getProfile(userKey));
    await ensureNickname();
    game.setRecords(records);
    game.setSkin(records.equippedSkin);
    renderHome();
    await store.save(localSnapshot());
    pushCloud();

    /*
      튜토리얼 클리어 여부는 기기가 아니라 **사람**에 붙는 값이에요.
      기기를 바꿔도 이미 깬 사람에게 다시 보여주면 안 되니 서버에서 한 번 확인해요.
      반대로 로컬이 이미 깬 상태면 서버 값이 뭐든 건드리지 않아요. (내려가지 않게)

      테이블이 아직 없거나 네트워크가 죽었으면 null이 와요. 그때는 로컬 값 그대로예요.
      (보상 수령 여부는 여기가 아니라 바로 아래 업적 동기화에서 봐요)
    */
    if (needsTutorial()) {
      const t = await cloud.getTutorial(userKey);
      if (t?.cleared && t.version >= TUTORIAL_VERSION) {
        records.tutorialVersion = t.version;
        await store.save(localSnapshot());
      }
    }

    /*
      업적과 **보상 수령 여부**를 서버와 맞춰요.

      업적 목록은 합집합이에요. 기기를 바꿔도 칭호를 잃지 않고, 이 기기에만 있던 것도
      서버로 올라가요. (한 번 얻으면 안 잃는 값이라 합집합이 안전해요 — 보석과 달라요)

      수령 여부는 **한쪽으로만** 움직여요. 서버가 "받았다"면 따라가고, "아직"이라고
      해도 로컬을 되돌리지 않아요. 되돌리는 순간 같은 보석이 한 번 더 나가거든요.
      이게 앱을 지웠다 깐 사람이 보상을 다시 받지 못하게 막는 자리예요.
    */
    const remote = await cloud.getAchievements(userKey);
    if (remote) {
      const remoteIds = remote.map((r) => r.code);
      const merged = [...new Set([...records.achievements, ...remoteIds])];
      const onlyLocal = records.achievements.filter((id) => !remoteIds.includes(id));
      records.achievements = merged;
      if (onlyLocal.length) cloud.addAchievements(userKey, onlyLocal);

      const claimedRemote = remote.filter((r) => r.claimed).map((r) => r.code);
      records.claimedRewards = [...new Set([...records.claimedRewards, ...claimedRemote])];

      await store.save(localSnapshot());
      // 업적 화면을 이미 열어둔 채로 응답이 늦게 왔을 수 있어요. 그러면 다시 그려요.
      if (!el.paneAchv.classList.contains('is-hidden')) {
        renderAchievements();
        renderAchvGuide();
      }
    }

    // 예전 세이브에 이미 조건이 차 있던 사람 구제 (업적을 나중에 추가했으니까)
    grantAchievements();
  } else {
    await ensureNickname();
    renderHome();
  }
}

boot();

// 개발용 핸들 (밸런스 조정 / 봇 시뮬레이션 / UI 확인). 프로덕션 번들에서는 빠져요.
if (import.meta.env.DEV) {
  window.__spacejump = {
    game,
    story,
    openStory,
    exitStory,
    audio,
    cloud,
    showGameOver,
    startGame,
    goHome,
    startFinalBoss,
    /** 최종 보스전을 바로 열어봐요. (본편 100행성을 다 돌지 않고 확인할 때) */
    finalBoss: (score = 12_340) =>
      startFinalBoss({
        score,
        stage: 10,
        stageName: '관문',
        landed: 99,
        reached: TOTAL_PLANETS,
        bestCombo: 9,
        revives: 0,
        gems: 3,
      }),
    renderShop,
    renderRank,
    renderAchievements,
    grantAchievements,
    achievements: ACHIEVEMENTS,
    records: () => records,
    settings: () => settings,
    skins: SKINS,
    getSkin,
    price: SKIN_PRICE,
  };
}

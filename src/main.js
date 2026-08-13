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
import { audio } from './audio.js';
import { MAX_REVIVES, IS_TEST_AD, SKIN_PRICE } from './config.js';
import { SKINS, DEFAULT_SKIN, getSkin, drawSkinPreview } from './skins.js';
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
  leaderboard,
} from './platform.js';

/* ────────────────────────────── DOM */

const $ = (id) => document.getElementById(id);

const el = {
  canvas: $('game'),
  home: $('home'),
  screenOver: $('screen-over'),
  screenPause: $('screen-pause'),
  screenExit: $('screen-exit'),
  screenShop: $('screen-shop'),
  screenRank: $('screen-rank'),
  screenSettings: $('screen-settings'),
  toast: $('toast'),

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

  inputNick: $('input-nick'),
  btnNickSave: $('btn-nick-save'),
  nickMsg: $('nick-msg'),
  swSfx: $('sw-sfx'),
  swBgm: $('sw-bgm'),
  swHaptic: $('sw-haptic'),
  rangeVol: $('range-vol'),
  volValue: $('vol-value'),
  syncMsg: $('sync-msg'),
  btnSettingsClose: $('btn-settings-close'),

  btnResume: $('btn-resume'),
  btnHomePause: $('btn-home-pause'),
  btnExitCancel: $('btn-exit-cancel'),
  btnExitConfirm: $('btn-exit-confirm'),

  btnSettings: $('btn-settings'),
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
});

const removeSafeArea = watchSafeArea((insets) => game.setInsets(insets));

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

async function persist() {
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
  if (!userKey) return;
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
  game.home();
  renderHome();
}

function showGameOver(result) {
  el.overReason.textContent = result.reason;
  el.overScore.textContent = String(result.score);
  el.overDetail.textContent = `도달: ${result.stageName} · STAGE ${result.stage} · 행성 ${result.landed}개 · 최고 콤보 x${result.bestCombo}`;

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

  hide(el.btnPause);
  show(el.screenOver);

  // 기록 저장 + 제출은 판이 끝난 뒤에만
  persist();
  pushCloud();
  cloud.addRun(userKey, result);
  leaderboard.submit(result.score);
}

function startGame() {
  audio.init();
  applyAudioSettings();
  hide(el.home);
  hide(el.screenOver);
  hide(el.screenPause);
  show(el.btnPause);
  records.plays += 1;
  game.setRecords(records);
  game.setSkin(records.equippedSkin);
  game.start();
  rewardAd.preload();
}

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

  const dpr = Math.min(window.devicePixelRatio || 1, 2);

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
    if (skin.kind !== 'basic') {
      const tag = document.createElement('span');
      tag.className = `shop-kind ${skin.kind}`;
      tag.textContent = skin.kind === 'cool' ? '멋짐' : '웃김';
      name.appendChild(tag);
    }
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
  audio.init();
  audio.reward();
  haptic('confetti');
  toast(`${skin.name} 구매 완료! 바로 장착했어요.`);
  persist();
  pushCloud();
  renderShop();
}

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

el.btnRetry.addEventListener('click', () => {
  haptic('tap');
  startGame();
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
  openSheet(el.screenRank, renderRank);
});

el.btnHomeOver.addEventListener('click', () => {
  haptic('tap');
  goHome();
});

el.btnHomePause.addEventListener('click', () => {
  haptic('tap');
  goHome();
});

/** 게임 중 일시정지 */
el.btnPause.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!game.isPlaying || game.state.paused) return;
  haptic('tap');
  game.pause();
  show(el.screenPause);
});

el.btnRankClose.addEventListener('click', () => {
  haptic('tap');
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
  if (game.isPlaying) show(el.btnPause);
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
  renderHome();

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
    audio,
    cloud,
    showGameOver,
    startGame,
    goHome,
    renderShop,
    renderRank,
    records: () => records,
    settings: () => settings,
    skins: SKINS,
    getSkin,
    price: SKIN_PRICE,
  };
}

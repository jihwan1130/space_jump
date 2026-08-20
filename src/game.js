/**
 * 궤도탈출 — 게임 본체.
 *
 * 행성의 점선 궤도를 따라 공전하다가, 탭하면 우주선이 향한 직선 방향으로 발사돼요.
 * 다음 행성의 궤도 안에 들어가면 착지, 빗나가면 그대로 우주 밖으로 날아가요.
 *
 * 진행 (2.1부터)
 *  - 무한이 아니라 **끝이 있는 게임**이에요. 행성 100개(TOTAL_PLANETS)가 전부예요.
 *  - 행성 10개(PLANETS_PER_STAGE)마다 천체가 바뀌어요. 지구 → … → 관문, 총 10스테이지.
 *  - 100번째 행성에 닿으면 본편은 끝나고 onFinalPlanet으로 최종 보스전을 넘겨줘요.
 *
 * 화면 구성
 *  - 논리 가로폭은 480으로 고정하고, 세로 길이(H)는 기기 화면 비율을 따라가요.
 *    그래서 어떤 기기에서도 위아래 여백 없이 풀스크린으로 꽉 차요.
 *  - HUD는 안전 영역(노치 · 홈 인디케이터) 안쪽에만 그리고,
 *    우측 상단은 프레임워크의 X · 더보기 버튼 자리라 비워둬요.
 */
import { audio } from './audio.js';
import { getSkin, DEFAULT_SKIN } from './skins.js';
import { GEM_CHANCE, PLANETS_PER_STAGE, TOTAL_PLANETS } from './config.js';
import {
  TUTORIAL_COURSE,
  TUTORIAL_LESSON_COUNT,
  TUTORIAL_BOSS_TIP,
} from './tutorial-script.js';

/* ────────────────────────────── 상수 */

const W = 480; // 논리 가로 해상도 (고정)
const H_MIN = 720;
const H_MAX = 1120;

const PLAYER_R = 11;
const FLIGHT_TIMEOUT = 2.6;
const CAM_ANCHOR = 0.78;
const CAM_FLY = 0.62;
const HAZARD_STAGE = 4; // 목성부터 화면이 스스로 올라와요
const ORBIT_SPIN = 2.0;
const MIN_FLIGHT = 40; // 앞 궤도에서 다음 궤도까지 최소한 이만큼은 빈 우주여야 해요
const COMBO_WINDOW = 3.4;
const REVIVE_GRACE = 2.2; // 이어하기 직후 무적 시간(초)
const FINAL_HOLD = 2.6; // "마지막 행성에 도달했습니다" 연출 길이(초)

/* ── 관문지기 접근 연출
   마지막 행성에서 탭하면 바로 보스 화면으로 튀지 않아요.
   궤도를 벗어나 관문지기 앞까지 날아가서 기수를 세우는 걸 보여주고 넘어가요.
   "화면이 바뀌었다"가 아니라 "내가 저기까지 갔다"가 되게. */

/** 접근 연출 길이(초) */
const APPROACH_TIME = 3.3;
/** 도착 직후 이만큼은 탭을 안 받아요. 배너를 읽기도 전에 넘어가지 않게. */
const FINAL_TAP_DELAY = 1.2;
/** 접근하는 동안 카메라가 위로 밀리는 속도 (논리 px/s) */
const APPROACH_CAM = 48;
const GEM_R = 10; // 보석 크기(반경)
const GEM_PICKUP = 26; // 이 거리 안에 들어오면 먹어요 (넉넉하게 — 놓치면 아까우니까)

/** 우측 상단 내비게이션 버튼이 차지하는 영역 (논리 px) */
const NAV_RESERVE_W = 116;

/**
 * 진행 막대의 최대 폭 (논리 px, 전체 폭 480 기준).
 * 오른쪽 끝이 프레임워크 UI 근처까지 가지 않도록 화면 절반 언저리에서 끊어요.
 */
const PROGRESS_BAR_W = 221;

/* ────────────────────────────── 블랙홀 (명왕성부터)

   8스테이지 「명왕성」부터 행성 사이에 블랙홀이 떠 있어요.
   멀리서 보면 행성처럼 동그래서 조준을 헷갈리게 하고,
   사건의 지평선(HOLE_R) 안으로 들어가면 그대로 끝이에요.

   그 바깥 견인 반경(HOLE_PULL) 안에서는 궤적이 휘어요. 그래서 "빗나갔는데
   빨려 들어가는" 순간이 생기고, 반대로 잘 쓰면 살짝 휘어 도는 지름길이 돼요.

   ⚠️ 궤도를 돌고 있는 동안에는 안전해요. 행성 중력에 붙잡혀 있는 상태라고 보는 거예요.
      발사해서 날아가는 중(mode === 'fly')에만 끌려 들어갑니다.
      이게 없으면 착지하자마자 손쓸 새 없이 죽는 자리가 생겨요. */

/* ────────────────────────────── 튜토리얼

   본편과 같은 엔진·같은 조작으로 도는 **연습 코스**예요.
   난이도 곡선(diff)을 쓰지 않고 아래 고정값만 써서, 누가 해도 똑같이 쉬워요.
   코스 순서와 안내 문구는 src/tutorial-script.js에 있어요. */

/** 튜토리얼 전용 난이도 — 본편 1스테이지보다도 한참 느슨해요. */
const TUTORIAL_DIFF = {
  r: 44, // 행성이 크고
  ring: 108, // 궤도도 넓어서 웬만하면 들어가요
  spin: 0.8, // 아주 천천히 돌아요 — 조준할 시간이 충분해요
  gap: 262, // 다음 행성까지 가깝고
  /**
   * 블랙홀이 놓이는 구간만 쓰는 간격.
   * 견인 반경(112)이 궤도(108)보다 커서, 보통 간격으로는 후광과 궤도가 겹쳐요.
   * 위아래로 벌려놔야 옆으로 비켜놓은 블랙홀이 궤도에서 떨어져 보여요.
   */
  holeGap: 420,
  spread: 62, // 좌우로 크게 흔들리지 않아요
  speed: 470,
  scroll: 15, // 화면 상승 체험 구간 (본편 목성의 1/3 속도)
  decayTime: 5.2, // 붕괴도 넉넉하게
};

/* ── 코칭 표시
   글로만 설명하면 "그게 화면 어디인데?"가 남아요. 그래서 카드가 떠 있는 동안
   화면을 어둡히고 대상만 뚫어 보여주고(스포트라이트), 조준선과 유령 시범 비행으로
   "언제 · 어디로 누르면 되는지"를 눈으로 보여줍니다. 대본은 tutorial-script.js. */

/** 스포트라이트가 화면을 덮는 정도. 너무 짙으면 뒤 무대가 안 보여요. */
const COACH_MASK = 'rgba(4, 6, 16, 0.66)';
/** focus 종류별 기본 이름 (대본의 focusLabel이 있으면 그게 이겨요) */
const COACH_LABEL = {
  self: '내 우주선',
  target: '다음 목표',
  obstacle: '소행성',
  gem: '보석',
  hole: '블랙홀',
};
/** 유령 시범 비행 한 바퀴 길이(초) — 대기 → 비행 → 착지 → 페이드 후 반복 */
const DEMO_LOOP = 2.6;

/** 블랙홀이 처음 나오는 스테이지 (8 = 명왕성) */
const HOLE_STAGE = 8;
/**
 * 사건의 지평선 — 이 안에 닿으면 사망.
 * 그 구간(명왕성~관문) 행성 반지름이 27~32라, 일부러 행성과 **비슷한 크기**로 잡았어요.
 * 멀리서 보면 착지할 행성처럼 보여야 조준을 헷갈리게 만드는 기믹이 되거든요.
 */
const HOLE_R = 30;
/** 견인 반경 — 이 안에서는 궤적이 휘어요 */
const HOLE_PULL = 112;
/** 견인 가속도 (논리 px/s²). 견인 반경 가장자리는 0, 중심에 가까울수록 세져요. */
const HOLE_FORCE = 1750;

const TAU = Math.PI * 2;

const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ────────────────────────────── 행성 테마 */

/**
 * 스테이지 = 천체 하나. 행성 10개(PLANETS_PER_STAGE)를 지나면 다음 천체로 넘어가요.
 * 10개 스테이지 × 10행성 = 100행성이 이 게임의 끝이에요. (TOTAL_PLANETS)
 * 마지막 「관문」은 태양계 밖으로 나가는 문이고, 여기 도착하면 최종 보스전이 열려요.
 */
const STAGES = [
  { name: '지구', sub: 'EARTH', c1: '#6fd7ff', c2: '#1a5fae', ac: '#7dffb0', type: 'terra' },
  { name: '달', sub: 'MOON', c1: '#ececf4', c2: '#7d7d8c', ac: '#cfd3e0', type: 'rock' },
  { name: '화성', sub: 'MARS', c1: '#ffa268', c2: '#9c331a', ac: '#ffcf9e', type: 'rock' },
  { name: '목성', sub: 'JUPITER', c1: '#f7dcae', c2: '#a06a35', ac: '#ffe9c4', type: 'gas' },
  { name: '토성', sub: 'SATURN', c1: '#ffe7ac', c2: '#b0802f', ac: '#ffd98a', type: 'ringed' },
  { name: '천왕성', sub: 'URANUS', c1: '#bdf7f2', c2: '#2f9d97', ac: '#d8fffb', type: 'gas' },
  { name: '해왕성', sub: 'NEPTUNE', c1: '#8fb4ff', c2: '#1d3a99', ac: '#b9cbff', type: 'gas' },
  { name: '명왕성', sub: 'PLUTO', c1: '#f3e9dc', c2: '#7f6f60', ac: '#fff6e8', type: 'rock' },
  { name: '외계행성', sub: 'EXOPLANET', c1: '#e6b3ff', c2: '#5f18ad', ac: '#f3d6ff', type: 'gas' },
  { name: '관문', sub: 'THE GATE', c1: '#ffd98f', c2: '#4b2a86', ac: '#fff0c9', type: 'ringed' },
];

function parseColor(str) {
  if (str[0] === '#') {
    const n = parseInt(str.slice(1), 16);
    const r = ((n >> 16) & 255) / 255;
    const g = ((n >> 8) & 255) / 255;
    const b = (n & 255) / 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (mx + mn) / 2;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h, s: s * 100, l: l * 100 };
  }
  const m = str.match(/hsla?\(([-\d.]+)[,\s]+([\d.]+)%[,\s]+([\d.]+)%/);
  return m ? { h: +m[1], s: +m[2], l: +m[3] } : { h: 0, s: 0, l: 60 };
}

const hsl = (c) => `hsl(${((c.h % 360) + 360) % 360},${clamp(c.s, 0, 100)}%,${clamp(c.l, 0, 100)}%)`;

function varyPalette(info, hueShift, lightShift) {
  const f = (str) => {
    const c = parseColor(str);
    return hsl({ h: c.h + hueShift, s: c.s, l: c.l + lightShift });
  };
  return { c1: f(info.c1), c2: f(info.c2), ac: f(info.ac) };
}

function hexA(hex, a) {
  if (hex.startsWith('hsl')) return hex.replace('hsl(', 'hsla(').replace(')', `,${a})`);
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function stageInfo(stage) {
  if (stage <= STAGES.length) return STAGES[stage - 1];
  const h = (stage * 47) % 360;
  return {
    name: `심우주 ${stage - STAGES.length}`,
    sub: 'DEEP SPACE',
    c1: `hsl(${h},85%,72%)`,
    c2: `hsl(${(h + 30) % 360},70%,32%)`,
    ac: `hsl(${h},100%,85%)`,
    type: ['gas', 'rock', 'ringed', 'terra'][stage % 4],
  };
}

/**
 * 초반 완화 곡선.
 *
 * 지구·달은 "처음 잡은 사람도 넘어가는" 구간이라 아래 기본 곡선보다 훨씬 느슨하게 굴려요.
 * 완화량(0~1)은 **행성 한 개 단위로** 줄어들어서, 화성 3번째 행성(index 22)에서 0이 돼요.
 * 그 뒤부터는 기본 곡선 그대로 — 지금까지의 난이도와 완전히 같아요.
 *
 * 스테이지 단위로 뚝 떨어뜨리면 달 → 화성이 절벽처럼 느껴져서, 화성 1~2번째 행성에
 * 완화의 꼬리를 조금 남겨 상승 곡선을 부드럽게 만들었어요.
 */
const EASE_CURVE = [
  [0, 1], // 지구 첫 행성 — 완화 최대
  [9, 0.9], // 지구 마지막
  [19, 0.55], // 달 마지막
  [22, 0], // 화성 3번째 — 여기부터 기존 난이도
];

/** 완화가 최대일 때 기본 곡선에 곱해지는 값 */
const EASY = {
  spin: 0.5, // 공전(=조준) 속도를 절반으로 — 타이밍 잡을 시간이 두 배
  gap: 0.82, // 행성 간격을 좁혀서 다음 궤도가 각도상 더 크게 보이게
  spread: 0.9,
  speed: 0.92,
};

function easeAmount(index) {
  if (index <= 0) return 1;
  for (let i = 1; i < EASE_CURVE.length; i++) {
    const [i0, e0] = EASE_CURVE[i - 1];
    const [i1, e1] = EASE_CURVE[i];
    if (index <= i1) return lerp(e0, e1, (index - i0) / (i1 - i0));
  }
  return 0;
}

/**
 * 난이도 곡선 — 밸런스는 전부 여기서 조정해요.
 * @param {number} index 행성 번호(0부터). 스테이지가 아니라 행성 단위로 받아야 초반 완화가 매끄러워요.
 */
function diff(index) {
  const stage = Math.floor(index / PLANETS_PER_STAGE) + 1;
  // 1스테이지 0 → 마지막(10) 스테이지 1. 마지막 관문이 곡선의 정점이에요.
  const t = clamp((stage - 1) / 9, 0, 1);

  const e = easeAmount(index);
  const soft = (v, k) => v * (1 + (k - 1) * e); // e=0이면 원래 값 그대로
  const rare = (v) => v * (1 - e); // 방해 요소는 완화 구간에서 확률을 낮춰요

  return {
    r: lerp(49, 27, t),
    ring: lerp(94, 61, t),
    spin: soft(lerp(1.5, 2.7, t), EASY.spin),
    gap: soft(lerp(315, 395, t), EASY.gap),
    spread: soft(lerp(75, 165, t), EASY.spread),
    speed: soft(lerp(450, 560, t), EASY.speed),
    scroll: lerp(22, 50, clamp((stage - HAZARD_STAGE) / 8, 0, 1)),
    obstacleChance: stage >= 2 ? rare(Math.min(0.6, (stage - 1) * 0.13)) : 0,
    moveChance: stage >= 3 ? rare(Math.min(0.55, (stage - 2) * 0.13)) : 0,
    decayChance: stage >= 5 ? Math.min(0.45, (stage - 4) * 0.14) : 0,
    decayTime: lerp(3.4, 2.0, t),
    // 명왕성(8) 0.34 → 외계행성(9) 0.48 → 관문(10) 0.62
    holeChance: stage >= HOLE_STAGE ? Math.min(0.75, 0.34 + (stage - HOLE_STAGE) * 0.14) : 0,
  };
}

/**
 * 스테이지에 처음 들어갈 때 띄우는 경고 배너.
 * 새 기믹이 나오는 라운드는 죽고 나서 알게 하면 안 되니까 미리 알려줘요.
 */
const STAGE_WARN = {
  [HAZARD_STAGE]: '화면이 계속 올라온다 — 밀려나면 끝',
  [HOLE_STAGE]: '블랙홀 — 스치면 빨려 들어간다',
};

/* ────────────────────────────── 게임 생성 */

/**
 * @param {object} opts
 * @param {HTMLCanvasElement} opts.canvas
 * @param {(result: {score:number,stage:number,landed:number,bestCombo:number,reason:string}) => void} opts.onGameOver
 * @param {(result: object) => void} [opts.onFinalPlanet] 마지막(100번째) 행성에 닿았을 때 — 최종 보스전으로 넘겨요
 * @param {(type: string) => void} [opts.haptic]
 */
export function createGame({
  canvas,
  onGameOver,
  onFinalPlanet = () => {},
  haptic = () => {},
  /** 튜토리얼 안내 카드를 띄워 달라는 신호. 카드가 닫힐 때까지 게임은 멈춰 있어요. */
  onTutorialTip = () => {},
  /** 탭이 필요 없는 힌트 배너. 게임은 계속 돌아가고 스스로 사라져요. */
  onTutorialHint = () => {},
  /** 튜토리얼 코스를 끝까지 돌았어요. */
  onTutorialClear = () => {},
}) {
  const ctx = canvas.getContext('2d');

  /* ── 화면 좌표계 */
  let H = 854;
  let scale = 1;
  let ox = 0;
  let oy = 0;
  let dpr = 1;
  let insets = { top: 0, bottom: 0, left: 0, right: 0 };
  /** 화면 아래쪽에서 게임이 쓰지 못하는 높이(CSS px). 하단 배너 광고가 차지해요. */
  let bottomReserve = 0;
  // 화면(CSS px) 크기 — resize()에서만 갱신하고 나머지는 이 값을 봐요.
  // 여기저기서 window.innerWidth를 다시 읽으면 리사이즈 도중 값이 어긋나요.
  let vw = 1;
  let vh = 1;

  /*
    캔버스가 화면에서 실제로 차지하는 '기기 픽셀' 수.
    ResizeObserver의 device-pixel-content-box가 알려주는 값이라 추정이 아니라 실측이에요.
    (지원하지 않으면 null로 두고 devicePixelRatio로 추정해요)
  */
  let measured = null;

  /** 캔버스가 실제로 화면에서 차지하는 CSS 크기 (resize()에서만 갱신) */
  let cssW = 1;
  let cssH = 1;
  /** 우리가 style에 지정한 크기. 실측(cssW/cssH)과 다르면 그게 뭉개짐의 원인이에요. */
  let askedW = 1;
  let askedH = 1;

  /**
   * 화면의 픽셀 밀도를 알아내요.
   *
   * `window.devicePixelRatio` 하나만 믿으면 안 돼요. 웹뷰에서는
   *  ─ 뷰포트 설정이 끝나기 전에 읽으면 잠깐 1을 돌려주고,
   *  ─ 아예 끝까지 1로 보고하는 구현도 있어요.
   * 실제로 토스 웹뷰에서 캔버스가 화면의 1/3 해상도로 그려졌는데,
   * 스크린샷 픽셀을 분석해 보니 3픽셀 주기의 선형 보간 신호가 나왔어요.
   * (= dpr이 1로 평가됐다는 뜻)
   *
   * 그래서 CSS 해상도 질의(min-resolution)를 두 번째 근거로 함께 봐요.
   * 두 값은 서로 다른 경로라 한쪽만 틀리게 보고되는 경우를 걸러낼 수 있어요.
   */
  function probeDpr() {
    const reported = window.devicePixelRatio || 1;

    let queried = 0;
    if (typeof window.matchMedia === 'function') {
      // 이분 탐색으로 실제 dppx를 좁혀요.
      let lo = 0.5;
      let hi = 4;
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2;
        if (window.matchMedia(`(min-resolution: ${mid.toFixed(4)}dppx)`).matches) lo = mid;
        else hi = mid;
      }
      queried = (lo + hi) / 2;
      // 3.001 같은 값이 나오면 3으로 맞춰줘요.
      if (Math.abs(queried - Math.round(queried)) < 0.02) queried = Math.round(queried);
    }

    // 둘 중 큰 쪽 — 한쪽이 1로 주저앉아도 나머지가 건져줘요.
    let d = Math.max(reported, queried);

    /*
      마지막 방어선.
      여기까지 와서 1배가 나왔다면 웹뷰가 값을 잘못 주고 있을 가능성이 아주 높아요.
      요즘 휴대폰 중에 1배 화면은 없거든요. (실제로 토스 웹뷰에서 이 값이 1로 나와
      캔버스가 화면의 1/3 해상도로 그려졌어요 — 스크린샷 픽셀 분석으로 확인)

      화면이 좁으면(=휴대폰) 3배를 기본값으로 깔아요.
      진짜 2배 기기라면 3배로 그린 뒤 컴포지터가 줄이는 셈이라 조금 더 그릴 뿐
      화질에는 손해가 없어요. 반대로 이걸 안 깔면 1/3 해상도로 떨어져요.
    */
    if (d <= 1.01 && Math.min(vw, vh) <= 820) d = 3;

    return clamp(d, 1, 3);
  }

  /** 지금 캔버스가 가져야 할 백버퍼 크기(기기 픽셀). */
  function wantedBacking() {
    /*
      백버퍼 크기가 선명도를 결정하는 유일한 지점이에요.
      캔버스는 전부 벡터로 그리므로, 백버퍼가 화면이 쓰는 기기 픽셀 수보다
      작으면 브라우저가 늘려서 채우고 그만큼 뭉개져요.

      1순위 실측(ResizeObserver) → 2순위 추정(probeDpr).
    */
    if (measured) return { w: measured.w, h: measured.h };
    const d = probeDpr();
    /*
      우리가 style에 지정한 vw/vh가 아니라, 캔버스가 **실제로 화면에서 차지하는**
      크기(cssW/cssH)를 곱해요. 레이아웃 결과가 가정과 어긋나도 백버퍼는 항상
      표시 크기와 1:1이 됩니다.
      (cssW/cssH는 resize()에서만 재요. 매 프레임 재면 강제 레이아웃이 걸려요.)
    */
    return { w: Math.round(cssW * d), h: Math.round(cssH * d) };
  }

  /**
   * 백버퍼가 있어야 할 크기와 어긋나 있으면 다시 맞춰요.
   * 매 프레임 도는 검사지만 정수 비교 두 번이라 비용이 없어요.
   * 웹뷰가 로딩이 끝난 뒤에 뒤늦게 배율을 바꿔도 스스로 따라잡습니다.
   */
  /** 브라우저가 끝내 받아주지 않은 크기 — 매 프레임 헛되이 다시 시도하지 않으려고 기억해요. */
  let backingRefused = null;

  function ensureBackingStore() {
    const want = wantedBacking();
    if (canvas.width === want.w && canvas.height === want.h) return;
    if (backingRefused && backingRefused.w === want.w && backingRefused.h === want.h) return;

    resize();

    if (canvas.width !== want.w || canvas.height !== want.h) {
      // 캔버스 최대 크기 제한 같은 이유로 거부당했어요. 지금 잡힌 크기로 만족하고 넘어가요.
      backingRefused = want;
    }
  }

  function resize() {
    // visualViewport가 있으면 그걸 먼저 봐요.
    // 모바일 브라우저는 주소창이 접히면 innerHeight가 실제 보이는 높이와 어긋나는데,
    // 그대로 쓰면 캔버스가 화면보다 커져서 아래쪽 UI가 잘려요.
    const vv = window.visualViewport;
    askedW = Math.max(1, Math.round(vv?.width || window.innerWidth));
    /*
      화면 높이에서 우리가 못 쓰는 아래쪽(하단 배너 광고)을 빼요.

      CSS로 #game에 `bottom: var(--banner-h)`를 걸어놨지만, 바로 아래에서 인라인
      style.height를 직접 먹이기 때문에 그 값이 CSS를 이겨요. 그래서 여기서도
      같은 만큼 빼줘야 캔버스가 배너를 덮지 않아요. (안 빼면 광고 위에 게임이 얹혀요)
    */
    askedH = Math.max(1, Math.round((vv?.height || window.innerHeight) - bottomReserve));

    canvas.style.width = `${askedW}px`;
    canvas.style.height = `${askedH}px`;

    /*
      여기가 핵심이에요.
      지금까지는 "우리가 지정한 크기(askedW/H)대로 캔버스가 그려질 것"이라고 가정하고
      좌표계와 백버퍼를 전부 그 위에 세웠어요. 그런데 모바일에서는 이 가정이 깨져요.
      (레이아웃 뷰포트와 비주얼 뷰포트가 다르거나, 페이지가 확대돼 있거나 하면)
      가정이 깨지면 백버퍼가 표시 크기와 어긋나 브라우저가 늘려 채우고 뭉개집니다.

      그래서 style을 먹인 뒤 **실제로 몇 CSS px을 차지하는지 되재서**,
      이후 계산(논리 높이·배율·여백·백버퍼)을 전부 그 실측값 위에서 해요.
    */
    const rect = canvas.getBoundingClientRect();
    cssW = Math.max(1, Math.round(rect.width) || askedW);
    cssH = Math.max(1, Math.round(rect.height) || askedH);

    // 이후 로직은 전부 실측 크기를 봐요. (HUD 여백·터치 좌표 변환도 같이 따라와요)
    vw = cssW;
    vh = cssH;

    // 기기 비율을 그대로 논리 높이로 받아 풀스크린을 만들어요.
    H = clamp((W * vh) / vw, H_MIN, H_MAX);
    scale = Math.min(vw / W, vh / H);
    ox = (vw - W * scale) / 2;
    oy = (vh - H * scale) / 2;

    const { w: bw, h: bh } = wantedBacking();

    // 같은 값을 다시 대입하면 캔버스가 통째로 지워져요. 달라졌을 때만 건드려요.
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;

    // 논리 좌표 → 기기 픽셀 배율. 실제 표시 크기 기준이라 setTransform이 화면과 딱 맞아요.
    dpr = canvas.width / cssW;
  }

  /*
    실제 기기 픽셀 수를 관측해요. canvas.width를 바꿔도 CSS 크기는 그대로라
    되먹임 루프가 생기지 않아요.
  */
  let ro = null;
  try {
    ro = new ResizeObserver((entries) => {
      const box = entries[0]?.devicePixelContentBoxSize?.[0];
      if (!box) return;
      const w = box.inlineSize;
      const h = box.blockSize;
      if (measured && measured.w === w && measured.h === h) return;
      measured = { w, h };
      backingRefused = null;
      resize();
    });
    ro.observe(canvas, { box: 'device-pixel-content-box' });
  } catch {
    // 미지원 브라우저 — devicePixelRatio 추정으로 그대로 돌아가요.
    ro = null;
  }

  /** 화면 px → 논리 px */
  const toLogicalX = (px) => (px - ox) / scale;
  const toLogicalY = (py) => (py - oy) / scale;

  /** HUD를 그릴 수 있는 안쪽 여백(논리 px) */
  function hudBox() {
    return {
      top: clamp(toLogicalY(insets.top), 0, H) + 10,
      left: clamp(toLogicalX(insets.left), 0, W) + 18,
      right: clamp(toLogicalX(vw - insets.right), 0, W) - 18,
      bottom: clamp(toLogicalY(vh - insets.bottom), 0, H) - 10,
    };
  }

  // 리사이즈는 한 프레임에 한 번만 반영해요. (연속 이벤트로 캔버스를 계속 다시 만들지 않게)
  let resizeRaf = 0;
  const queueResize = () => {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      // 화면 크기가 바뀌었으니 거부 기록은 무효예요. 새 크기는 받아줄 수도 있어요.
      backingRefused = null;
      resize();
    });
  };
  window.addEventListener('resize', queueResize);
  window.addEventListener('orientationchange', queueResize);
  // 모바일 주소창이 접히고 펴질 때는 resize가 안 오는 기기가 있어요.
  window.visualViewport?.addEventListener('resize', queueResize);
  resize();

  /* ── 상태 */
  const state = {
    // title | play | over(격추) | final(마지막 행성 도착 연출) | done(보스전으로 넘어감)
    mode: 'title',
    paused: false,
    planets: [],
    player: null,
    camY: 0,
    camTarget: 0,
    score: 0,
    best: 0,
    bestComboEver: 0,
    stage: 1,
    scrolling: false,
    danger: 0,
    warnT: 0,
    banner: null,
    particles: [],
    pops: [],
    rings: [],
    combo: 0,
    comboT: 0,
    bestCombo: 0,
    scorePop: 0,
    pulse: null,
    landed: 0,
    stars: [],
    shake: 0,
    overT: 0,
    deathMsg: '',
    flash: 0,
    invuln: 0,
    revives: 0,
    gemItems: [], // 화면에 떠 있는 보석들
    gems: 0, // 이번 판에서 주운 개수
    holes: [], // 블랙홀 (8스테이지 명왕성부터)
    /** 지금 몇 번째 행성에 있는지 (1 ~ TOTAL_PLANETS). 진행 막대가 이 값을 봐요. */
    reached: 1,
    /**
     * 진행 막대가 실제로 그리는 값(0~1). reached를 뒤늦게 따라가요.
     * 숫자 없이 "차오르는 길이"만으로 읽히는 막대라, 착지할 때마다 툭 끊겨 뛰면
     * 눈에 안 들어와요. 그래서 목표치까지 부드럽게 밀어 올려요.
     */
    progressK: 0,
    /** 마지막 행성 도착 연출에 쓰는 타이머 — 이만큼 지나면 탭을 받아요. */
    finalT: 0,
    /** 관문지기 접근 연출 상태. { t, done } — 평소에는 null이에요. */
    approach: null,
    /**
     * 튜토리얼 진행 상태. 평소에는 null이고, 연습 코스를 도는 동안에만 켜져요.
     * { lastIndex: 마지막으로 밟은 행성, shown: 이미 띄운 카드 번호들, scrolling: 화면 상승 시작 여부 }
     */
    tutorial: null,
  };

  let planetSeq = 0;
  let skin = getSkin(DEFAULT_SKIN);

  function makeStars() {
    state.stars = [];
    for (let i = 0; i < 220; i++) {
      state.stars.push({
        x: rand(0, W),
        y: rand(0, H_MAX * 2),
        z: rand(0.15, 1),
        s: rand(0.5, 1.7),
        tw: rand(0, TAU),
      });
    }
  }
  makeStars();

  /* ── 행성 생성 */

  /**
   * 소행성 한 덩이의 생김새를 미리 정해둬요.
   * 울퉁불퉁한 실루엣 · 크레이터 · 암석 색을 개체마다 다르게 뽑아서
   * 같은 화면에 여러 개가 떠 있어도 복제품처럼 보이지 않아요.
   *
   * 실루엣 반지름은 1.0을 넘지 않게 잡아요. 그려진 바위가 판정 반경보다
   * 커지면 "안 닿았는데 죽었다"처럼 보이거든요.
   */
  function makeAsteroidLook() {
    const n = 13;
    const base = [];
    for (let i = 0; i < n; i++) base.push(rand(0.66, 1.0));
    // 이웃한 굴곡을 조금만 섞어요. 너무 많이 섞으면 그냥 동그란 공이 돼요.
    const shape = base.map((v, i) => v * 0.74 + base[(i + 1) % n] * 0.13 + base[(i + n - 1) % n] * 0.13);

    // 크레이터는 서로 겹치지 않게 놓아요. 겹치면 구덩이가 아니라 얼룩처럼 보여요.
    const craters = [];
    const count = 3 + Math.floor(Math.random() * 3);
    for (let attempt = 0; attempt < 40 && craters.length < count; attempt++) {
      const a = rand(0, TAU);
      const dist = rand(0.05, 0.46);
      const c = { x: Math.cos(a) * dist, y: Math.sin(a) * dist, r: rand(0.11, 0.24) };
      if (craters.every((o) => Math.hypot(o.x - c.x, o.y - c.y) > (o.r + c.r) * 1.15)) {
        craters.push(c);
      }
    }

    // 잔 알갱이 — 표면이 매끈해 보이지 않게 뿌려요.
    const grit = [];
    for (let i = 0; i < 7; i++) {
      const a = rand(0, TAU);
      const dist = rand(0.1, 0.7);
      grit.push({ x: Math.cos(a) * dist, y: Math.sin(a) * dist, r: rand(0.03, 0.07) });
    }

    const hue = rand(12, 34);
    return {
      shape,
      craters,
      grit,
      squash: rand(0.72, 0.92), // 감자처럼 한쪽으로 눌린 형태
      tilt: rand(0, TAU),
      rot: rand(0, TAU),
      spin: rand(0.4, 1.1) * (Math.random() < 0.5 ? -1 : 1),
      col: {
        hi: `hsl(${hue},16%,${rand(58, 68)}%)`,
        mid: `hsl(${hue},15%,${rand(30, 38)}%)`,
        low: `hsl(${hue},22%,11%)`,
      },
    };
  }

  function createPlanet(index, x, y) {
    const stage = Math.floor(index / PLANETS_PER_STAGE) + 1;
    const d = diff(index);
    const info = stageInfo(stage);
    const isCheckpoint = index % PLANETS_PER_STAGE === 0;

    const r = isCheckpoint ? d.r * 1.35 : d.r * rand(0.85, 1.15);
    const ring = isCheckpoint ? d.ring * 1.22 : d.ring * rand(0.92, 1.08);

    const p = {
      id: planetSeq++,
      index,
      stage,
      info,
      isCheckpoint,
      col: isCheckpoint ? varyPalette(info, 0, 0) : varyPalette(info, rand(-16, 16), rand(-7, 7)),
      x,
      y,
      baseX: x,
      r,
      ring,
      spin: rand(d.spin * 0.8, d.spin * 1.2) * (Math.random() < 0.5 ? -1 : 1),
      rot: rand(0, TAU),
      move:
        index > 0 && Math.random() < d.moveChance
          ? { amp: rand(35, 70), sp: rand(0.5, 1.1), ph: rand(0, TAU) }
          : null,
      obstacle:
        index > 0 && Math.random() < d.obstacleChance
          ? {
              a: rand(0, TAU),
              sp: rand(1.6, 3.0) * (Math.random() < 0.5 ? -1 : 1),
              d: ring + rand(28, 42),
              r: 13,
              look: makeAsteroidLook(),
            }
          : null,
      decay: 0,
      timer: 0,
      landed: false,
      dying: false,
      alpha: 1,
    };
    if (index > 0 && !isCheckpoint && !p.obstacle && Math.random() < d.decayChance) {
      p.decay = d.decayTime;
    }
    return p;
  }

  /** 블랙홀 하나 만들기 — 생김새 값은 개체마다 조금씩 달라요. */
  function makeHole(x, y) {
    /*
      나선을 그리며 안으로 떨어지는 알갱이들.
      t0는 출발 시점(0~1)이라 개체마다 알갱이가 흩어져서 떨어져요.
      다 같은 시점에 출발하면 동심원 파도처럼 보여서 흡입감이 안 나요.
    */
    const swirl = [];
    for (let i = 0; i < 16; i++) {
      swirl.push({ a: rand(0, TAU), t0: Math.random(), sp: rand(0.3, 0.55) });
    }
    return {
      x,
      y,
      r: HOLE_R,
      pull: HOLE_PULL,
      rot: rand(0, TAU),
      spin: rand(0.5, 0.85) * (Math.random() < 0.5 ? -1 : 1),
      swirl,
    };
  }

  /**
   * 앞 행성 → 방금 만든 행성 **사이**에 블랙홀을 놓아요.
   *
   * 비행 경로 정면이 아니라 옆으로 비켜서 놓아요. 정면에 두면 피할 각이 없어서
   * 실력이 아니라 운으로 죽거든요. 조준을 대충 하면 견인 반경에 걸리고,
   * 제대로 잡으면 옆을 스쳐 지나가는 자리가 목표예요.
   *
   * 자리를 몇 번 뽑아보고 조건에 맞는 게 없으면 그냥 안 놓아요.
   * 억지로 끼워 넣는 것보다 이번 구간을 비우는 편이 나아요.
   */
  function maybeSpawnHole(prev, p, d) {
    if (!(Math.random() < d.holeChance)) return;

    const mx = lerp(prev.x, p.x, 0.5);
    const my = lerp(prev.y, p.y, 0.5);
    const vx = p.x - prev.x;
    const vy = p.y - prev.y;
    const len = Math.hypot(vx, vy) || 1;
    // 비행 경로에 수직인 방향
    const nx = -vy / len;
    const ny = vx / len;

    for (let attempt = 0; attempt < 8; attempt++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const off = rand(HOLE_PULL * 0.7, HOLE_PULL * 1.05);
      const x = mx + nx * off * side + rand(-16, 16);
      const y = my + ny * off * side + rand(-16, 16);

      if (x < HOLE_R + 12 || x > W - HOLE_R - 12) continue;

      // 궤도 위에 겹치면 공전만 해도 죽어요. 사건의 지평선은 무조건 궤도 밖에.
      const tooClose = state.planets.some(
        (q) => Math.hypot(x - q.x, y - q.y) < q.ring + HOLE_R + 18
      );
      if (tooClose) continue;

      // 블랙홀끼리 겹치면 통과 불가능한 벽이 돼요.
      if (state.holes.some((h) => Math.hypot(x - h.x, y - h.y) < HOLE_PULL * 1.5)) continue;

      state.holes.push(makeHole(x, y));
      return;
    }
  }

  function spawnAhead() {
    /*
      튜토리얼은 대본대로 세운 **닫힌 코스**예요. 여기서 무작위 생성이 돌면
      마지막 연습 행성 너머로 진짜 행성이 이어 붙어서, 코스가 안 끝나요.
    */
    if (state.tutorial) return;

    while (
      state.planets.length < 2 ||
      state.planets[state.planets.length - 1].y > state.camY - H * 1.2
    ) {
      const prev = state.planets[state.planets.length - 1];
      // 마지막 행성까지 다 만들었으면 그 앞은 빈 우주예요. (여기서 게임이 끝나요)
      if (prev && prev.index >= TOTAL_PLANETS - 1) break;
      const index = prev ? prev.index + 1 : 0;
      const d = diff(index);
      let x;
      let y;
      if (!prev) {
        x = W / 2;
        y = H - 190;
      } else {
        const margin = 96;
        const dx = rand(50, d.spread) * (Math.random() < 0.5 ? -1 : 1);
        x = clamp(prev.x + dx, margin, W - margin);
        if (Math.abs(x - prev.x) < 42) x = prev.x + (x >= prev.x ? 42 : -42);
        x = clamp(x, margin, W - margin);
        y = prev.y - rand(d.gap * 0.8, d.gap * 1.1);
      }
      const p = createPlanet(index, x, y);

      /*
        두 궤도가 겹치면 발사하는 순간 이미 다음 궤도 안이라 아무 데나 쏴도 착지해요.
        (= 조준이 사라져요) 간격을 좁힌 지구·달 구간에서 특히 생기기 쉬워서,
        궤도 반지름 합 + 최소 비행거리만큼은 무조건 떨어뜨려요.
      */
      if (prev) {
        const need = prev.ring + p.ring + MIN_FLIGHT;
        const sideways = Math.abs(p.x - prev.x);
        const minDy = Math.sqrt(Math.max(0, need * need - sideways * sideways));
        if (prev.y - p.y < minDy) p.y = prev.y - minDy;
      }

      state.planets.push(p);

      // 블랙홀 — 명왕성(8스테이지)부터. 보석보다 먼저 놓아야 보석이 블랙홀 속에
      // 들어가는 걸 막을 수 있어요. (아래에서 겹치면 보석을 안 놓아요)
      if (prev && index > 0) maybeSpawnHole(prev, p, d);

      // 보석은 방금 만든 행성과 그 앞 행성 **사이**에 놓아요.
      // 비행 경로 위에 있어야 "일부러 주우러 가는" 선택이 생겨요.
      if (prev && index > 1 && Math.random() < GEM_CHANCE) {
        const k = rand(0.4, 0.62); // 앞 행성에서 얼마나 왔는지
        const gx = clamp(lerp(prev.x, p.x, k) + rand(-34, 34), 34, W - 34);
        const gy = lerp(prev.y, p.y, k);
        // 블랙홀 견인 반경 안에 놓인 보석은 "먹으면 죽는 미끼"라 너무 가혹해요.
        const inHole = state.holes.some((h) => Math.hypot(gx - h.x, gy - h.y) < h.pull);
        if (!inHole) {
          state.gemItems.push({
            x: gx,
            y: gy,
            taken: false,
            rot: rand(0, TAU),
            bob: rand(0, TAU),
            pop: 0,
          });
        }
      }
    }
    while (
      state.planets.length > 24 &&
      (!state.player || state.planets[0].id !== state.player.planetId)
    ) {
      state.planets.shift();
    }
    // 화면 아래로 한참 지나간 보석은 정리해요.
    if (state.gemItems.length > 40) {
      state.gemItems = state.gemItems.filter((g) => g.y < state.camY + H * 2.2);
    }
    if (state.holes.length > 14) {
      state.holes = state.holes.filter((h) => h.y < state.camY + H * 2.2);
    }
  }

  /* ── 이펙트 */

  function burst(x, y, n, color, speed = 140, life = 0.6, size = 3) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const s = rand(speed * 0.3, speed);
      state.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life,
        max: life,
        color,
        size: rand(size * 0.5, size),
      });
    }
  }

  function addPop(x, y, text, color, size = 22, life = 1.1) {
    state.pops.push({ x, y, text, color, size, t: life, max: life, vy: 46 });
  }

  function addRing(x, y, r0, r1, color, life = 0.55, w = 3) {
    state.rings.push({ x, y, r0, r1, color, t: life, max: life, w });
  }

  function dangerLevel() {
    if (!state.player) return 0;
    const sy = state.player.y - state.camY;
    return clamp(1 - (H - sy) / 300, 0, 1);
  }

  function planetById(id) {
    for (let i = 0; i < state.planets.length; i++) {
      if (state.planets[i].id === id) return state.planets[i];
    }
    return null;
  }

  function syncOrbitPos() {
    const pl = state.player;
    const p = planetById(pl.planetId);
    if (!p) return;
    pl.x = p.x + Math.cos(pl.angle) * p.ring;
    pl.y = p.y + Math.sin(pl.angle) * p.ring;
  }

  /* ── 튜토리얼 코스 */

  /**
   * 우주선을 이 행성 궤도에 올려놓고 카메라를 맞춰요.
   * (판을 새로 세울 때 · 튜토리얼에서 다시 시작할 때 · QA 워프에서 같이 써요)
   */
  function placeOn(p) {
    state.player = {
      mode: 'orbit',
      planetId: p.id,
      angle: -Math.PI / 2,
      dir: 1,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      ignore: -1,
      flyT: 0,
      trail: [],
    };
    p.landed = true;
    if (p.decay) p.timer = p.decay;
    syncOrbitPos();
    state.camY = p.y - H * CAM_ANCHOR;
    state.camTarget = state.camY;
  }

  /**
   * 튜토리얼 코스를 통째로 세워요.
   *
   * spawnAhead()는 난이도 곡선으로 무작위 생성을 하는 함수라 여기서는 안 써요.
   * 대본(TUTORIAL_COURSE)에 적힌 대로 행성을 하나씩 놓고, 기믹도 지정된 것만 붙여요.
   * 되돌리기(죽었을 때 다시 시작)도 이 함수를 다시 부르는 걸로 처리해요 —
   * 무작위가 하나도 없어서 몇 번을 다시 세워도 완전히 같은 코스가 나와요.
   */
  function buildTutorial() {
    state.planets = [];
    state.gemItems = [];
    state.holes = [];
    state.particles = [];
    state.pops = [];
    state.rings = [];
    planetSeq = 0;

    /*
      행성 자리를 먼저 다 잡아요.

      블랙홀 구간만 규칙이 달라요. 견인 반경(112)이 행성 궤도(108)보다 커서,
      보통 간격(262)의 한가운데에 놓으면 후광이 궤도 안까지 파고들어요.
      "행성에 딱 붙은 검은 원"으로 보여서 뭘 피하라는 건지 안 읽혀요.

      그래서 두 가지를 같이 해요.
        1) 두 행성을 화면 가운데 세로로 세워요 — 옆으로 비켜놓을 가로 여유가 생겨요.
        2) 간격을 넓혀요 — 위아래로도 멀어져야 후광이 궤도에 안 닿아요.
    */
    const pos = [];
    TUTORIAL_COURSE.forEach((step, i) => {
      if (!i) {
        pos.push({ x: W / 2, y: H - 190 });
        return;
      }
      // 이 칸이나 다음 칸에 블랙홀이 있으면 이 행성은 가운데에 세워요.
      const straight = step.hole || TUTORIAL_COURSE[i + 1]?.hole;
      pos.push({
        x: straight
          ? W / 2
          : clamp(W / 2 + (i % 2 ? 1 : -1) * TUTORIAL_DIFF.spread, 96, W - 96),
        y: pos[i - 1].y - (step.hole ? TUTORIAL_DIFF.holeGap : TUTORIAL_DIFF.gap),
      });
    });

    let prev = null;
    let holeSeq = 0; // 블랙홀을 좌우 번갈아 놓으려고 세요
    TUTORIAL_COURSE.forEach((step, i) => {
      const { x, y } = pos[i];

      // createPlanet은 난이도 곡선을 보니까, 만든 뒤 튜토리얼 값으로 덮어써요.
      const p = createPlanet(i, x, y);
      p.r = TUTORIAL_DIFF.r;
      p.ring = TUTORIAL_DIFF.ring;
      p.spin = TUTORIAL_DIFF.spin * (i % 2 ? -1 : 1);
      p.isCheckpoint = false;
      p.obstacle = null;
      p.move = null;
      p.decay = 0;
      p.timer = 0;

      if (step.stage) {
        p.stage = step.stage;
        p.info = stageInfo(step.stage);
        p.col = varyPalette(p.info, 0, 0);
        // 천체가 바뀌는 첫 행성은 본편처럼 조금 크게 — "여기서 넘어왔다"가 보이게
        if (TUTORIAL_COURSE[i - 1]?.stage !== step.stage) {
          p.isCheckpoint = true;
          p.r = TUTORIAL_DIFF.r * 1.2;
        }
      }
      if (step.move) p.move = { amp: 46, sp: 0.6, ph: 0 };
      if (step.obstacle) {
        p.obstacle = { a: 0, sp: 1.5, d: p.ring + 34, r: 13, look: makeAsteroidLook() };
      }
      if (step.decay) p.decay = TUTORIAL_DIFF.decayTime;

      state.planets.push(p);

      // 앞 행성과 이 행성 사이에 놓이는 것들
      if (prev && step.gem) {
        state.gemItems.push({
          x: lerp(prev.x, p.x, 0.5),
          y: lerp(prev.y, p.y, 0.5),
          taken: false,
          rot: 0,
          bob: 0,
          pop: 0,
        });
      }
      if (prev && step.hole) {
        /*
          두 행성 사이 높이의 한가운데, 거기서 옆으로 비켜 놓아요.
          얼마나 비켜야 하는지는 재서 정해요 — 눈대중으로 두면 간격이 또 어긋나요.

          half : 행성에서 블랙홀까지의 세로 거리
          side : 가로로 밀어낼 거리. 아래 둘 중 큰 쪽이에요.
                 ① 후광이 **행성 궤도**에 안 닿을 만큼   (피타고라스로 역산)
                 ② 후광이 **똑바로 올라가는 길**을 안 막을 만큼

          좌우는 번갈아 놓아요. 같은 쪽에 두 번 나오면 두 번째 칸이 첫 칸의
          반복이 돼서, 상황을 다시 읽지 않고 아까 한 대로 눌러버려요.
        */
        const half = Math.abs(p.y - prev.y) / 2;
        const clear = TUTORIAL_DIFF.ring + HOLE_PULL + 22;
        const side = Math.max(
          Math.sqrt(Math.max(0, clear * clear - half * half)),
          HOLE_PULL + 28
        );
        const hx =
          holeSeq++ % 2
            ? clamp(Math.min(prev.x, p.x) - side, HOLE_R + 12, W - HOLE_R - 12)
            : clamp(Math.max(prev.x, p.x) + side, HOLE_R + 12, W - HOLE_R - 12);
        state.holes.push(makeHole(hx, lerp(prev.y, p.y, 0.5)));
      }

      prev = p;
    });
  }

  /**
   * 튜토리얼을 (다시) 시작해요.
   * @param {number} index 이 행성부터 시작. 죽었을 때 마지막으로 밟은 행성으로 돌아와요.
   */
  function tutorialStartAt(index) {
    const at = clamp(index, 0, TUTORIAL_COURSE.length - 1);
    buildTutorial();
    placeOn(state.planets[at]);

    const p = state.planets[at];
    state.stage = p.stage;
    state.mode = 'play';
    state.paused = false;
    state.combo = 0;
    state.comboT = 0;
    state.danger = 0;
    state.shake = 0;
    state.flash = 0;
    state.invuln = REVIVE_GRACE;
    state.tutorial.lastIndex = at;
    /*
      화면 상승 여부를 대본대로 다시 잡아요.
      `at + 2`인 이유: 상승은 "다음 칸이 scroll이면" 켜지니까, 지금 칸(at)에 서 있을 때는
      이미 at+1까지 반영된 상태예요. slice의 끝은 열린 구간이라 +2가 됩니다.
    */
    state.tutorial.scrolling = TUTORIAL_COURSE.slice(0, at + 2).some((s) => s.scroll);
    state.scrolling = state.tutorial.scrolling;
    tutorialCoachTo(at + 1);
    audio.setStage(p.stage);
  }

  /**
   * 안내 카드를 띄우고 시간을 멈춰요.
   *
   * 멈추는 데 state.paused를 쓰지 않아요. 그건 일시정지 화면 · 광고 재생이 쓰는
   * 스위치라 서로 껐다 켜다 엉켜요. 카드 전용으로 waiting을 따로 둡니다.
   */
  function showTutorialCard(tip, extra = {}) {
    /*
      카드를 띄우기 전에 카메라를 목표 지점으로 **딱 붙여요.**

      착지 직후에는 카메라가 아직 따라오는 중(camY → camTarget 이징)이에요.
      그 상태로 시간을 멈추면 매번 다른 높이에서 얼어붙어서, 스포트라이트로
      비춘 것이 카드에 가리기도 하고 안 가리기도 해요. 붙여놓고 멈추면
      "행성은 78% · 다음 행성은 42% · 그 사이 보석은 60%"로 항상 같은 그림이 나와요.
    */
    state.camY = state.camTarget;
    state.tutorial.waiting = true;
    onTutorialTip({ ...tip, lessonTotal: TUTORIAL_LESSON_COUNT, ...extra });
  }

  /**
   * 이 칸의 강조 대상이 **화면 아래쪽**에 있는지.
   *
   * 카메라가 우주선을 화면 78% 지점에 두기 때문에, 우주선·보석·블랙홀을 비추면
   * 화면 아래쪽에서 벌어져요. 안내 카드는 기본이 하단 고정이라 그대로 두면
   * 애써 뚫어놓은 스포트라이트를 카드가 덮어버려요. 그래서 이럴 땐 카드를 위로 붙여요.
   * (다음 행성·소행성은 한 칸 위라 카드에 안 가려요)
   */
  function isLowFocus(step) {
    return Boolean(step.demo) || ['self', 'gem', 'hole'].includes(step.focus);
  }

  /**
   * 코칭 표시를 **다음 칸 기준**으로 다시 맞춰요.
   *
   * 조준선도 스포트라이트도 전부 "이제 갈 곳"을 가리켜야 해요. 그래서 기준이
   * 서 있는 칸(lastIndex)이 아니라 그다음 칸(to)입니다.
   * focus·demo는 카드가 떠 있는 동안에만 그려요. (그리기 쪽에서 waiting을 봐요)
   */
  function tutorialCoachTo(index) {
    const step = TUTORIAL_COURSE[index];
    /*
      가리킬 행성은 **지금 서 있는 칸의 다음**이에요.

      보통은 index와 같아요. 칸 i의 안내는 행성 i-1에 서 있을 때 뜨니까요.
      딱 하나 0번 칸만 예외예요 — 그 행성 위에서 시작하거든요. 그대로 두면
      시범 비행이 발밑을 겨눠서 우주선이 옆으로 날아가 버려요.
    */
    const to = Math.max(index, state.tutorial.lastIndex + 1);
    state.tutorial.coach = {
      to,
      aim: Boolean(step?.aim),
      focus: step?.focus || null,
      focusLabel: step?.focusLabel || null,
      demo: Boolean(step?.demo),
    };
  }

  /**
   * 지금 자리에서 **아직 안 알린 칸**의 안내를 내보내요.
   *
   * 규칙은 하나예요 — 행성 i에 서 있다면 0번부터 i+1번까지의 안내를 다 봤어야 해요.
   * (i+1까지인 이유: 다음 칸으로 넘어가기 전에 그 칸 설명을 읽어야 하니까요)
   *
   * 칸마다 둘 중 하나가 나가요.
   *   card : 레슨의 첫 칸. 모달이라 게임 시간이 멈춰요 → **여기서 끊고** 나갑니다.
   *          카드를 닫으면 tutorialContinue가 다시 불러서 나머지가 이어져요.
   *   hint : 탭이 필요 없는 배너. 안 멈추니까 그대로 다음 칸까지 계속 훑어요.
   *
   * @returns {boolean} 모달 카드를 띄웠는지 (= 게임이 멈췄는지)
   */
  function tutorialBrief() {
    const t = state.tutorial;
    for (let i = 0; i <= t.lastIndex + 1; i++) {
      const step = TUTORIAL_COURSE[i];
      if (!step || t.shown.has(i)) continue;
      t.shown.add(i);
      tutorialCoachTo(i);
      if (step.card) {
        showTutorialCard(step.card, {
          index: i,
          lesson: step.lesson + 1,
          lessonName: step.lessonName,
          low: isLowFocus(step),
        });
        return true;
      }
      if (step.hint) onTutorialHint({ text: step.hint });
    }
    // 알릴 게 없어도 조준선 기준은 다음 칸으로 옮겨둬야 해요.
    tutorialCoachTo(t.lastIndex + 1);
    return false;
  }

  /** 튜토리얼 코스를 끝냈어요. */
  function tutorialFinish() {
    const t = state.tutorial;
    if (!t) return;
    state.tutorial = null;
    state.approach = null;
    state.mode = 'done';
    state.scrolling = false;
    audio.stopBgm();
    onTutorialClear({ retries: t.retries });
  }

  /**
   * 안내 카드를 닫았어요. 마지막 카드였으면 여기서 튜토리얼이 끝나요.
   * (main.js의 "확인" 버튼이 이걸 불러요)
   */
  function tutorialContinue() {
    const t = state.tutorial;
    if (!t) return;
    t.waiting = false;
    if (t.done) {
      // 마지막 카드였어요. 본편과 똑같이 관문지기 앞까지 날아가는 걸 보여주고 넘겨요.
      startBossApproach();
      return;
    }
    // 아직 못 본 안내가 남아 있으면 이어서 한 장 더. (시작 직후 두 장이 이어지는 자리)
    tutorialBrief();
  }

  /**
   * 튜토리얼에서는 죽지 않아요.
   *
   * 조작을 배우는 중인데 게임오버 화면으로 튕겨 나가면 배우던 흐름이 끊겨요.
   * 마지막으로 밟았던 행성에서 조용히 다시 시작하고, 왜 죽었는지만 알려줘요.
   */
  function tutorialRetry(msg) {
    const at = state.tutorial.lastIndex;
    state.tutorial.retries++;
    state.flash = 0.45;
    audio.die();
    haptic('error');
    tutorialStartAt(at);
    state.shake = 12;
    const step = TUTORIAL_COURSE[at];
    showTutorialCard(
      {
        title: '괜찮아요, 다시 해봐요',
        body: `${msg}\n방금 있던 행성에서 그대로 이어서 갈게요.`,
      },
      { retry: true, lesson: (step?.lesson ?? 0) + 1, lessonName: step?.lessonName || '' }
    );
  }

  /* ── 리셋 */

  function reset() {
    state.planets = [];
    planetSeq = 0;
    state.score = 0;
    state.stage = 1;
    state.particles = [];
    state.pops = [];
    state.rings = [];
    state.banner = null;
    state.shake = 0;
    state.flash = 0;
    state.deathMsg = '';
    state.scrolling = false;
    state.danger = 0;
    state.warnT = 0;
    state.combo = 0;
    state.comboT = 0;
    state.bestCombo = 0;
    state.scorePop = 0;
    state.pulse = null;
    state.landed = 0;
    state.player = null;
    state.invuln = 0;
    state.revives = 0;
    state.overT = 0;
    state.gemItems = [];
    state.gems = 0;
    state.holes = [];
    state.tutorial = null;
    state.reached = 1;
    state.progressK = 1 / TOTAL_PLANETS;
    state.finalT = 0;
    state.approach = null;

    state.camY = H - 190 - H * CAM_ANCHOR;
    state.camTarget = state.camY;
    spawnAhead();

    const p0 = state.planets[0];
    state.player = {
      mode: 'orbit',
      planetId: p0.id,
      angle: -Math.PI / 2,
      dir: 1,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      ignore: -1,
      flyT: 0,
      trail: [],
    };
    p0.landed = true;
    state.camY = p0.y - H * CAM_ANCHOR;
    state.camTarget = state.camY;
    syncOrbitPos();
    spawnAhead();
    audio.setStage(1);
  }

  /* ── 입력 */

  function jump() {
    const pl = state.player;
    if (!pl || pl.mode !== 'orbit') return;
    const p = planetById(pl.planetId);
    if (!p) return;
    const d = diff(p.index);
    const tx = Math.cos(pl.angle);
    const ty = Math.sin(pl.angle);
    pl.vx = tx * d.speed;
    pl.vy = ty * d.speed;
    pl.mode = 'fly';
    pl.ignore = p.id;
    pl.flyT = 0;
    pl.trail.length = 0;
    p.landed = false;
    if (p.decay) p.dying = true;
    burst(pl.x, pl.y, 10, p.col.ac, 120, 0.4, 2.5);
    audio.jump();
    haptic('tickWeak');
  }

  /**
   * 블랙홀에 삼켜졌어요.
   *
   * 일반 사망은 그 자리에서 터지는 연출인데, 여기서는 **안으로 빨려 들어가야** 해요.
   * 그래서 우주선을 사건의 지평선 중심으로 옮겨 놓고 죽여요. 터지는 파편이
   * 블랙홀 한가운데서 나오니까 "삼켜졌다"로 읽혀요.
   * 조여드는 고리(r0 > r1)를 하나 더 얹어서 방향까지 보여줍니다.
   */
  function swallow(h) {
    const pl = state.player;
    pl.x = h.x;
    pl.y = h.y;
    pl.vx = 0;
    pl.vy = 0;
    pl.trail.length = 0;
    addRing(h.x, h.y, h.pull, h.r * 0.2, '#c88bff', 0.75, 4);
    addRing(h.x, h.y, h.pull * 0.62, h.r * 0.2, '#ffd27a', 0.55, 2.5);
    die('블랙홀에 빨려 들어감');
  }

  function die(msg) {
    if (state.mode !== 'play') return;
    // 튜토리얼에는 게임오버가 없어요. 조용히 되돌리고 왜 죽었는지만 알려줘요.
    if (state.tutorial) {
      tutorialRetry(msg);
      return;
    }
    state.mode = 'over';
    state.overT = 0;
    state.deathMsg = msg;
    state.shake = 14;
    state.flash = 0.5;
    burst(state.player.x, state.player.y, 34, '#ff6b6b', 260, 0.9, 4);
    burst(state.player.x, state.player.y, 20, '#ffd166', 180, 0.7, 3);
    audio.die();
    audio.stopBgm();
    haptic('error');

    if (state.score > state.best) state.best = state.score;
    if (state.bestCombo > state.bestComboEver) state.bestComboEver = state.bestCombo;

    onGameOver?.({
      score: state.score,
      stage: state.stage,
      stageName: stageInfo(state.stage).name,
      landed: state.landed,
      reached: state.reached,
      bestCombo: state.bestCombo,
      reason: msg,
      revives: state.revives,
      gems: state.gems,
    });
  }

  /** 지금 탭이 「관문지기에게 간다」로 읽히는 상황인지 */
  function wantsApproach() {
    return (
      state.mode === 'final' &&
      !state.paused &&
      !state.tutorial?.waiting &&
      state.finalT >= FINAL_TAP_DELAY
    );
  }

  function onPointerDown(e) {
    if (wantsApproach()) {
      e.preventDefault();
      startBossApproach();
      return;
    }
    if (state.mode !== 'play' || state.paused || state.tutorial?.waiting) return;
    e.preventDefault();
    jump();
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'Enter') {
      e.preventDefault();
      if (wantsApproach()) {
        startBossApproach();
        return;
      }
      if (state.mode === 'play' && !state.paused && !state.tutorial?.waiting) jump();
    }
  });

  /* ── 업데이트 */

  function update(dt) {
    const pl = state.player;

    for (const p of state.planets) {
      p.rot += p.spin * dt;
      if (p.move) p.x = p.baseX + Math.sin((performance.now() / 1000) * p.move.sp + p.move.ph) * p.move.amp;
      if (p.obstacle) {
        p.obstacle.a += p.obstacle.sp * dt;
        // 공전과 별개로 바위 자체도 천천히 자전해요.
        p.obstacle.look.rot += p.obstacle.look.spin * dt;
      }
      if (p.dying) p.alpha -= dt * 1.6;
    }

    for (const h of state.holes) h.rot += h.spin * dt;

    if (state.invuln > 0) state.invuln = Math.max(0, state.invuln - dt);

    // 보석 — 천천히 돌면서 위아래로 떠다니다가, 가까이 가면 빨려들어와요.
    for (const g of state.gemItems) {
      if (g.taken) {
        g.pop = Math.max(0, g.pop - dt * 2.4);
        continue;
      }
      g.rot += dt * 1.3;
      g.bob += dt * 2.1;
      if (state.mode === 'play' && pl) {
        const d = Math.hypot(pl.x - g.x, pl.y - g.y);
        if (d < GEM_PICKUP) collectGem(g);
        else if (d < GEM_PICKUP * 2.6) {
          // 자석처럼 살짝 끌려와요 — 아슬아슬하게 스치는 맛
          const k = (1 - d / (GEM_PICKUP * 2.6)) * dt * 5.5;
          g.x += (pl.x - g.x) * k;
          g.y += (pl.y - g.y) * k;
        }
      }
    }

    // 홈 화면·마지막 행성 연출에서도 우주선은 계속 공전해요. 정지 화면처럼 보이지 않게요.
    // (죽음 판정 · 화면 상승은 아래 play 블록에서만 돌아가요)
    if ((state.mode === 'title' || state.mode === 'final') && pl && pl.mode === 'orbit') {
      const p = planetById(pl.planetId);
      if (p) {
        pl.angle += Math.abs(p.spin) * ORBIT_SPIN * dt * pl.dir;
        syncOrbitPos();
      }
    }

    /*
      마지막 행성 도착 — 여기서는 **기다려요.**

      예전에는 배너를 보여주다 시간이 되면 알아서 보스 화면으로 넘어갔어요.
      화면이 저 혼자 바뀌니까 "내가 관문까지 갔다"는 느낌이 안 났어요.
      지금은 조종사가 직접 눌러야 기수를 올려요. (onPointerDown → startBossApproach)
    */
    if (state.mode === 'final') state.finalT += dt;

    if (state.mode === 'approach') updateApproach(dt);

    // 접근 연출이 끝났어요 — 이제 보스 화면으로 넘겨요.
    if (state.mode === 'approach' && state.approach.t >= APPROACH_TIME) {
      state.approach = null;
      if (state.tutorial) {
        // 연습 비행은 기록을 남기지 않아요. 바깥에서 연습 보스로 이어줘요.
        tutorialFinish();
      } else {
        // 죽은 게 아니라 넘긴 거예요. 'over'가 아니라서 광고 부활 대상도 아니에요.
        state.mode = 'done';
        onFinalPlanet?.({
          score: state.score,
          stage: state.stage,
          stageName: stageInfo(state.stage).name,
          landed: state.landed,
          reached: state.reached,
          bestCombo: state.bestCombo,
          revives: state.revives,
          gems: state.gems,
        });
      }
    }

    if (state.mode === 'play') {
      if (pl.mode === 'orbit') {
        const p = planetById(pl.planetId);
        if (p) {
          pl.angle += Math.abs(p.spin) * ORBIT_SPIN * dt * pl.dir;
          syncOrbitPos();
          if (p.decay && state.invuln <= 0) {
            p.timer -= dt;
            if (p.timer <= 0) {
              p.dying = true;
              die('행성 붕괴');
            }
          }
          if (p.obstacle && state.invuln <= 0) {
            const ox2 = p.x + Math.cos(p.obstacle.a) * p.obstacle.d;
            const oy2 = p.y + Math.sin(p.obstacle.a) * p.obstacle.d;
            if (Math.hypot(ox2 - pl.x, oy2 - pl.y) < p.obstacle.r + PLAYER_R) die('소행성 충돌');
          }
        }
      } else {
        /*
          블랙홀 — 위치를 옮기기 **전에** 속도부터 휘어요.
          궤도에 붙어 있는 동안에는 아무 일도 없고, 날아가는 중에만 잡혀요.
          (파일 위쪽 「블랙홀」 주석 참고)
        */
        if (state.invuln <= 0) {
          for (const h of state.holes) {
            const hx = h.x - pl.x;
            const hy = h.y - pl.y;
            const dist = Math.hypot(hx, hy);
            if (dist > h.pull) continue;
            if (dist < h.r) {
              swallow(h);
              break;
            }
            // 가장자리 0 → 중심 최대. 거리 제곱 반비례 대신 부드러운 곡선을 써야
            // 가까이 갈수록 무한히 세지지 않고 조작감이 예측돼요.
            const k = 1 - dist / h.pull;
            const a = (HOLE_FORCE * k * k * dt) / dist;
            pl.vx += hx * a;
            pl.vy += hy * a;
          }
        }
        // 빨려 들어갔으면 여기서 끝. (튜토리얼은 죽는 대신 우주선을 새로 놓아서
        // mode는 그대로 'play'예요. 그래서 객체가 바뀌었는지도 같이 봐요)
        if (state.mode !== 'play' || state.player !== pl) return;

        pl.flyT += dt;
        pl.x += pl.vx * dt;
        pl.y += pl.vy * dt;
        pl.trail.push({ x: pl.x, y: pl.y });
        if (pl.trail.length > 18) pl.trail.shift();

        for (const p of state.planets) {
          if (p.dying || p.alpha <= 0) continue;
          const dx = pl.x - p.x;
          const dy = pl.y - p.y;
          const dist = Math.hypot(dx, dy);
          if (p.id === pl.ignore) {
            if (dist > p.ring * 1.2) pl.ignore = -1;
            continue;
          }
          if (dist <= p.ring) {
            land(p, dx, dy, dist);
            break;
          }
        }

        if (pl.mode === 'fly' && state.invuln <= 0) {
          for (const p of state.planets) {
            if (!p.obstacle || p.dying) continue;
            const ox2 = p.x + Math.cos(p.obstacle.a) * p.obstacle.d;
            const oy2 = p.y + Math.sin(p.obstacle.a) * p.obstacle.d;
            if (Math.hypot(ox2 - pl.x, oy2 - pl.y) < p.obstacle.r + PLAYER_R) {
              die('소행성 충돌');
              break;
            }
          }
        }

        if (pl.mode === 'fly') {
          if (pl.x < -40 || pl.x > W + 40) die('궤도 이탈');
          else if (pl.flyT > FLIGHT_TIMEOUT) die('우주 미아');
        }
      }

      // 튜토리얼에서 되돌아갔으면(=우주선을 새로 놓았으면) 이번 프레임은 여기서 끝.
      // 아래 계산이 사라진 우주선 좌표를 보고 또 죽음 판정을 내리면 안 돼요.
      if (state.player !== pl) return;

      // 목성 라운드부터 화면이 스스로 계속 위로 올라와요.
      if (state.tutorial) {
        // 튜토리얼은 대본이 시키는 구간에서만, 그것도 아주 천천히 올라와요.
        state.scrolling = state.tutorial.scrolling;
        if (state.scrolling) state.camTarget -= TUTORIAL_DIFF.scroll * dt;
      } else if (state.mode === 'play' && state.stage >= HAZARD_STAGE) {
        state.scrolling = true;
        state.camTarget -= diff((state.stage - 1) * PLANETS_PER_STAGE).scroll * dt;
      }
    }

    if (state.mode === 'play') {
      state.danger = dangerLevel();
      const sy = pl.y - state.camY;
      if (sy > H - PLAYER_R * 0.4 && state.invuln <= 0) {
        state.shake = 16;
        die(pl.mode === 'fly' && pl.vy > 60 ? '추락' : '화면 밖으로 밀려남');
      } else if (state.scrolling && state.danger > 0.55) {
        state.warnT -= dt;
        if (state.warnT <= 0) {
          state.warnT = lerp(0.5, 0.13, (state.danger - 0.55) / 0.45);
          audio.warn();
        }
      }
    }

    let target = state.camTarget;
    if (pl && pl.mode === 'fly') target = Math.min(target, pl.y - H * CAM_FLY);
    if (target < state.camY) state.camY += (target - state.camY) * Math.min(1, dt * 5);

    spawnAhead();

    for (let i = state.particles.length - 1; i >= 0; i--) {
      const q = state.particles[i];
      q.life -= dt;
      if (q.life <= 0) {
        state.particles.splice(i, 1);
        continue;
      }
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vx *= 0.94;
      q.vy *= 0.94;
    }

    for (let i = state.pops.length - 1; i >= 0; i--) {
      const q = state.pops[i];
      q.t -= dt;
      if (q.t <= 0) {
        state.pops.splice(i, 1);
        continue;
      }
      q.y -= q.vy * dt;
      q.vy *= Math.pow(0.25, dt);
    }

    for (let i = state.rings.length - 1; i >= 0; i--) {
      const q = state.rings[i];
      q.t -= dt;
      if (q.t <= 0) state.rings.splice(i, 1);
    }

    if (state.comboT > 0) {
      state.comboT -= dt;
      if (state.comboT <= 0) state.combo = 0;
    }
    state.scorePop = Math.max(0, state.scorePop - dt * 2.6);

    // 진행 막대 — 목표치까지 지수적으로 따라붙어요. (0.3초쯤이면 거의 다 차요)
    // 프레임레이트가 달라도 같은 속도로 차오르게 dt 지수로 계산해요.
    const pk = clamp(state.reached / TOTAL_PLANETS, 0, 1);
    state.progressK += (pk - state.progressK) * (1 - Math.pow(0.0015, dt));
    if (Math.abs(pk - state.progressK) < 0.0004) state.progressK = pk;
    if (state.pulse) {
      state.pulse.a -= dt * 1.8;
      if (state.pulse.a <= 0) state.pulse = null;
    }
    if (state.banner) {
      state.banner.t -= dt;
      if (state.banner.t <= 0) state.banner = null;
    }
    state.shake *= Math.pow(0.001, dt);
    state.flash = Math.max(0, state.flash - dt * 1.6);
    if (state.mode === 'over') state.overT += dt;
  }

  /** 보석 획득 — 개수는 판이 끝날 때 지갑으로 옮겨요. */
  function collectGem(g) {
    if (g.taken) return;
    g.taken = true;
    g.pop = 1;
    state.gems++;
    burst(g.x, g.y, 14, '#8ff3ff', 170, 0.55, 2.6);
    addRing(g.x, g.y, GEM_R * 0.4, GEM_R * 3.2, '#a8f7ff', 0.5, 2);
    addPop(g.x, g.y - 18, '+1', '#8ff3ff', 19, 0.9);
    audio.gem();
    haptic('tickMedium');
  }

  function land(p, dx, dy, dist) {
    const pl = state.player;
    pl.mode = 'orbit';
    pl.planetId = p.id;
    pl.angle = Math.atan2(dy, dx);
    const cross = dx * pl.vy - dy * pl.vx;
    pl.dir = cross >= 0 ? 1 : -1;
    pl.trail.length = 0;
    p.landed = true;
    if (p.decay) p.timer = p.decay;
    syncOrbitPos();
    state.camTarget = Math.min(state.camTarget, p.y - H * CAM_ANCHOR);

    state.landed++;
    state.combo = state.comboT > 0 ? state.combo + 1 : 1;
    state.comboT = COMBO_WINDOW;
    if (state.combo > state.bestCombo) state.bestCombo = state.combo;

    const mult = Math.min(9, state.combo);
    const perfect = dist < p.ring * 0.58;
    const gain = 10 * mult + (perfect ? 15 : 0) + (p.isCheckpoint ? 30 : 0);
    state.score += gain;
    state.scorePop = 1;

    state.shake = perfect ? 7 : 5;
    state.pulse = {
      a: perfect ? 0.6 : 0.34,
      max: perfect ? 0.6 : 0.34,
      color: perfect ? '#ffd166' : p.col.c1,
    };
    burst(pl.x, pl.y, perfect ? 22 : 14, p.col.ac, perfect ? 210 : 150, 0.5, 3);
    addRing(p.x, p.y, p.ring * 0.45, p.ring * 1.85, p.col.ac, 0.5, 3);
    if (perfect) {
      addRing(p.x, p.y, p.ring * 0.2, p.ring * 2.5, '#ffd166', 0.7, 2);
      burst(pl.x, pl.y, 12, '#fff1b8', 260, 0.7, 2.5);
    }

    addPop(pl.x, pl.y - 16, `+${gain}`, perfect ? '#ffd166' : '#ffffff', perfect ? 27 : 22);
    if (perfect) addPop(pl.x, pl.y - 44, 'PERFECT!', '#ffe28a', 17, 0.95);
    if (state.combo >= 2) addPop(p.x, p.y - p.ring - 26, `COMBO x${state.combo}`, p.col.c1, 15, 1.0);

    const PRAISE = [
      [12, 'UNSTOPPABLE!', '#ff9ec4'],
      [8, 'AMAZING!', '#c9a4ff'],
      [5, 'GREAT!', '#8fe3ff'],
      [3, 'NICE!', '#7dffb0'],
    ];
    for (const [need, word, color] of PRAISE) {
      if (state.combo === need) {
        addPop(p.x, p.y - p.ring - 52, word, color, 21, 1.2);
        audio.praise();
        haptic('success');
        break;
      }
    }

    audio.land(state.combo, perfect);
    haptic(perfect ? 'tickMedium' : 'tickWeak');

    // 튜토리얼은 100행성 진행도 · 최종 보스 분기와 무관한 별도 코스예요.
    if (state.tutorial) {
      state.tutorial.lastIndex = p.index;

      // 천체가 바뀌면 본편과 똑같이 배너를 띄워요. (지구 → 달 → 화성 …)
      if (p.stage !== state.stage) {
        state.stage = p.stage;
        audio.setStage(p.stage);
        state.banner = {
          text: `${p.info.name} 궤도 진입`,
          sub: `STAGE ${p.stage} · ${p.info.sub}`,
          warn: null,
          t: 1.8,
        };
        burst(p.x, p.y, 22, p.col.c1, 180, 0.8, 3);
        audio.stage();
        haptic('basicMedium');
      }

      // 마지막 행성 — 이제 연습 보스전으로 넘어가요.
      if (p.index >= TUTORIAL_COURSE.length - 1) {
        state.tutorial.done = true;
        state.tutorial.coach = null;
        showTutorialCard(TUTORIAL_BOSS_TIP, {
          boss: true,
          lesson: TUTORIAL_LESSON_COUNT,
          lessonName: TUTORIAL_COURSE[p.index]?.lessonName || '',
        });
        return;
      }

      /*
        **다음 칸**의 안내를 띄워요. 지금 칸이 아니라 한 칸 앞이에요.
        그래야 "설명을 읽고 → 그 기믹을 겪는" 순서가 돼요.
      */
      // 다음 칸부터 화면이 올라오는 구간이면 여기서 미리 켜둬요.
      if (TUTORIAL_COURSE[p.index + 1]?.scroll) state.tutorial.scrolling = true;
      tutorialBrief();
      return;
    }

    // 진행도 — 지금 몇 번째 행성인지. (index 0이 1번째 행성)
    state.reached = Math.max(state.reached, p.index + 1);

    if (p.stage !== state.stage) {
      state.stage = p.stage;
      audio.setStage(p.stage);
      const warn = STAGE_WARN[p.stage] || null;
      state.banner = {
        text: `${p.info.name} 궤도 진입`,
        sub: `STAGE ${p.stage} · ${p.info.sub}`,
        warn,
        t: warn ? 2.8 : 2.0,
      };
      burst(p.x, p.y, 26, p.col.c1, 200, 0.9, 3.5);
      addRing(p.x, p.y, p.ring * 0.3, p.ring * 3.4, p.col.c1, 1.0, 2.5);
      audio.stage();
      haptic('basicMedium');
    }

    // 마지막(100번째) 행성 — 여기서 본편은 끝나고 최종 보스전으로 넘어가요.
    if (p.index === TOTAL_PLANETS - 1) reachFinalPlanet(p);
  }

  /**
   * 마지막 행성 도착.
   *
   * 죽음 판정과 화면 상승을 멈추고 도착 연출만 보여주다가(FINAL_HOLD초),
   * 끝나면 바깥(main.js)에 넘겨요. 그쪽에서 보스전 캔버스를 띄웁니다.
   */
  function reachFinalPlanet(p) {
    if (state.mode !== 'play') return;
    state.mode = 'final';
    state.finalT = 0;
    state.scrolling = false;
    state.combo = 0;
    state.comboT = 0;
    state.banner = {
      text: '마지막 행성에 도달했습니다',
      sub: `${state.reached} / ${TOTAL_PLANETS} · ${p.info.sub}`,
      warn: null,
      t: FINAL_HOLD,
      full: FINAL_HOLD,
    };
    addRing(p.x, p.y, p.ring * 0.3, p.ring * 4.2, p.col.c1, 1.4, 3);
    burst(p.x, p.y, 40, p.col.ac, 240, 1.2, 4);
    audio.stage();
    audio.stopBgm();
    haptic('confetti');
  }

  /**
   * 관문지기에게 다가가요. 마지막 행성에서 탭하면 시작돼요.
   *
   * 어느 방향으로 눌렀든 상관없어요. 조준하는 구간이 아니라 **넘어가는 연출**이라,
   * 궤도를 벗어난 뒤로는 물리를 끄고 정해진 자리로 데려갑니다.
   * (여기서 빗나가서 죽으면 100행성을 돌아온 사람에게 너무 가혹해요)
   */
  function startBossApproach() {
    // 본편은 'final'(마지막 행성 도착)에서, 연습 비행은 마지막 카드를 닫은 순간에 시작해요.
    if (state.mode !== 'final' && !state.tutorial?.done) return;
    if (state.mode === 'approach') return;
    const pl = state.player;
    const p = pl && planetById(pl.planetId);
    if (!pl) return;

    state.mode = 'approach';
    state.approach = { t: 0 };
    state.banner = null;
    pl.mode = 'approach';
    pl.trail.length = 0;
    if (p) {
      p.landed = false;
      burst(pl.x, pl.y, 16, p.col.ac, 150, 0.5, 3);
    }
    audio.jump();
    haptic('tickMedium');
  }

  function updateApproach(dt) {
    const a = state.approach;
    const pl = state.player;
    a.t += dt;

    // 카메라가 천천히 위로 — 시선이 관문지기 쪽으로 끌려가요
    state.camY -= APPROACH_CAM * dt;
    state.camTarget = state.camY;

    /*
      전투 위치로 감속하며 이동해요.

      목표를 화면 비율(72%)로 잡아서 매 프레임 다시 구해요. 카메라가 계속
      올라가니까 월드 좌표로 한 번 정해두면 화면에서 자꾸 어긋나거든요.
      비율로 쫓아가면 카메라가 어떻게 움직이든 화면 안에서는 늘 같은 자리예요.
    */
    const k = Math.min(1, dt * 2.4);
    pl.x += (W / 2 - pl.x) * k;
    pl.y += (state.camY + H * 0.72 - pl.y) * k;

    // 기수를 위로 (짧은 쪽으로 돌아요)
    let d = (((-Math.PI / 2 - pl.angle + Math.PI) % TAU) + TAU) % TAU - Math.PI;
    pl.angle += d * Math.min(1, dt * 3.2);

    pl.trail.push({ x: pl.x, y: pl.y });
    if (pl.trail.length > 14) pl.trail.shift();

    // 마지막에 엔진을 올리면서 화면이 떨려요 — 곧 붙는다는 신호
    if (a.t > APPROACH_TIME - 0.9) state.shake = Math.max(state.shake, 3.4);
  }

  /* ── 렌더 */

  function drawStars() {
    const t = performance.now() / 1000;
    const span = H * 2;
    for (const s of state.stars) {
      let y = (s.y - state.camY * s.z) % span;
      if (y < 0) y += span;
      y -= H * 0.5;
      if (y < -20 || y > H + 20) continue;
      const tw = 0.55 + 0.45 * Math.sin(t * 2 + s.tw);
      ctx.globalAlpha = s.z * tw;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(s.x, y, s.s, s.s);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * 블랙홀 — 완전한 **원형**이에요.
   *
   * 행성이 다 동그란 화면에서 혼자 기울어진 원반을 두르면 이물감이 커서,
   * 크기도 생김새도 행성과 같은 계열로 맞췄어요. 대신 색과 방향으로 구분해요.
   * 행성은 밖으로 빛나고, 블랙홀은 **안으로 빨아들여요.**
   *
   * 바깥에서 안으로
   *   1) 옅은 보라 후광 = 견인 반경. 여기 들어오면 궤적이 휘어요.
   *   2) 안으로 감겨 떨어지는 알갱이 = 흡입 방향
   *   3) 서로 반대로 도는 점선 고리 두 개 = 소용돌이
   *   4) 밝은 광자 고리 + 새까만 원 = 사건의 지평선. 닿으면 끝.
   *
   * 검은 원(h.r)이 곧 판정 반경이에요. 그보다 **크게 그리지 않아요.**
   * 그린 게 판정보다 크면 "안 닿았는데 죽었다"처럼 보이거든요.
   */
  function drawBlackHole(h) {
    const y = h.y - state.camY;
    if (y < -h.pull - 40 || y > H + h.pull + 40) return;
    const t = performance.now() / 1000;

    ctx.save();
    ctx.translate(h.x, y);

    // 1) 견인 반경 — 경계가 어렴풋이 보일 정도로만
    const halo = ctx.createRadialGradient(0, 0, h.r * 0.85, 0, 0, h.pull);
    halo.addColorStop(0, 'rgba(158,96,246,.32)');
    halo.addColorStop(0.45, 'rgba(102,46,178,.13)');
    halo.addColorStop(1, 'rgba(70,26,132,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, h.pull, 0, TAU);
    ctx.fill();

    ctx.globalCompositeOperation = 'lighter';

    /*
      2) 나선을 그리며 떨어지는 알갱이.
      바깥(2.4r)에서 지평선(1.02r)까지 한 바퀴 반을 감으며 들어와요.
      들어올 때 옅게 나타났다가 삼켜지기 직전에 다시 사라지게 해서,
      "빨려 들어가는 흐름"만 남고 점이 툭 끊기는 게 안 보이게 했어요.
    */
    for (const s of h.swirl) {
      const k = (t * s.sp + s.t0) % 1; // 0 = 바깥, 1 = 지평선
      const d = h.r * lerp(2.4, 1.02, k * k); // 안쪽에서 급격히 빨라져요
      const a = s.a + k * 5.4 * (h.spin > 0 ? 1 : -1);
      // 양 끝에서 부드럽게 사라지는 사다리꼴 알파
      ctx.globalAlpha = 0.75 * Math.min(1, k / 0.18) * Math.min(1, (1 - k) / 0.22);
      ctx.fillStyle = k > 0.6 ? '#ffd8a8' : '#c9a4ff';
      ctx.beginPath();
      ctx.arc(Math.cos(a) * d, Math.sin(a) * d, 1.7 * (1 - k * 0.45), 0, TAU);
      ctx.fill();
    }

    // 3) 반대로 도는 점선 고리 두 개 — 소용돌이가 돌고 있다는 신호
    for (let i = 0; i < 2; i++) {
      const rr = h.r * (i === 0 ? 1.5 : 1.95);
      ctx.save();
      ctx.rotate(h.rot * (i === 0 ? 1 : -0.65));
      ctx.globalAlpha = i === 0 ? 0.34 : 0.2;
      ctx.strokeStyle = i === 0 ? '#d8b4ff' : '#9a6cf0';
      ctx.lineWidth = i === 0 ? 1.6 : 1.2;
      ctx.setLineDash(i === 0 ? [7, 9] : [4, 11]);
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // 4) 사건의 지평선 — 배경까지 지워버리는 완전한 검정
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(0, 0, h.r, 0, TAU);
    ctx.fill();

    // 안쪽으로 갈수록 더 캄캄해지는 테두리 — 평평한 원반이 아니라 구멍으로 보이게
    const inner = ctx.createRadialGradient(0, 0, h.r * 0.35, 0, 0, h.r);
    inner.addColorStop(0, 'rgba(0,0,0,0)');
    inner.addColorStop(1, 'rgba(126,72,214,.4)');
    ctx.fillStyle = inner;
    ctx.beginPath();
    ctx.arc(0, 0, h.r, 0, TAU);
    ctx.fill();

    // 5) 광자 고리 — 빛이 구멍 둘레를 돌아 나오는 테두리. 이게 있어야 "구멍"으로 읽혀요.
    ctx.globalAlpha = 0.82 + 0.18 * Math.sin(t * 2.6 + h.x);
    ctx.strokeStyle = '#f0dcff';
    ctx.shadowColor = '#b07bff';
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, 0, h.r - 0.6, 0, TAU);
    ctx.stroke();

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawPlanet(p) {
    const y = p.y - state.camY;
    if (y < -220 || y > H + 220) return;
    const info = p.info;
    const col = p.col;
    ctx.save();
    ctx.globalAlpha = clamp(p.alpha, 0, 1);

    const decayRatio = p.decay && p.landed ? clamp(p.timer / p.decay, 0, 1) : 1;
    ctx.save();
    ctx.translate(p.x, y);
    ctx.rotate(p.rot * 0.5);
    ctx.setLineDash([6, 8]);
    ctx.lineWidth = p.isCheckpoint ? 2 : 1.2;
    ctx.strokeStyle =
      p.decay && p.landed
        ? `rgba(255,${Math.round(90 + 120 * decayRatio)},90,${0.5 + 0.4 * (1 - decayRatio)})`
        : `rgba(255,255,255,${p.isCheckpoint ? 0.35 : 0.2})`;
    ctx.beginPath();
    ctx.arc(0, 0, p.ring, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    const glow = ctx.createRadialGradient(p.x, y, p.r * 0.6, p.x, y, p.r * 2.1);
    glow.addColorStop(0, hexA(col.c1, 0.28));
    glow.addColorStop(1, hexA(col.c1, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, y, p.r * 2.1, 0, TAU);
    ctx.fill();

    if (info.type === 'ringed') {
      ctx.save();
      ctx.translate(p.x, y);
      ctx.rotate(-0.35);
      ctx.strokeStyle = hexA(col.ac, 0.55);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.r * 1.9, p.r * 0.55, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    const g = ctx.createRadialGradient(p.x - p.r * 0.35, y - p.r * 0.4, p.r * 0.1, p.x, y, p.r);
    g.addColorStop(0, col.c1);
    g.addColorStop(1, col.c2);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, y, p.r, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, y, p.r, 0, TAU);
    ctx.clip();
    ctx.translate(p.x, y);
    ctx.rotate(p.rot);
    if (info.type === 'gas' || info.type === 'ringed') {
      ctx.globalAlpha = 0.25 * clamp(p.alpha, 0, 1);
      ctx.fillStyle = col.ac;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.ellipse(0, i * p.r * 0.32, p.r * 1.2, p.r * 0.1, 0, 0, TAU);
        ctx.fill();
      }
    } else if (info.type === 'terra') {
      ctx.globalAlpha = 0.75 * clamp(p.alpha, 0, 1);
      ctx.fillStyle = col.ac;
      ctx.beginPath();
      ctx.ellipse(-p.r * 0.3, -p.r * 0.2, p.r * 0.45, p.r * 0.3, 0.4, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(p.r * 0.35, p.r * 0.3, p.r * 0.35, p.r * 0.22, -0.3, 0, TAU);
      ctx.fill();
    } else {
      ctx.globalAlpha = 0.2 * clamp(p.alpha, 0, 1);
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(-p.r * 0.3, -p.r * 0.25, p.r * 0.22, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.r * 0.35, p.r * 0.1, p.r * 0.16, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, p.r * 0.45, p.r * 0.12, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    ctx.globalAlpha = 0.5 * clamp(p.alpha, 0, 1);
    ctx.fillStyle = '#fff';
    const aa = p.rot;
    ctx.beginPath();
    ctx.arc(p.x + Math.cos(aa) * (p.r + 7), y + Math.sin(aa) * (p.r + 7), 1.8, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = clamp(p.alpha, 0, 1);

    if (p.isCheckpoint) {
      ctx.globalAlpha = 0.8 * clamp(p.alpha, 0, 1);
      ctx.fillStyle = col.c1;
      ctx.font = 'bold 12px -apple-system, "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(info.name, p.x, y + p.ring + 20);
      ctx.globalAlpha = 0.35;
      ctx.font = '9px monospace';
      ctx.fillText(`STAGE ${p.stage}`, p.x, y + p.ring + 33);
    }

    if (p.obstacle) {
      const ox2 = p.x + Math.cos(p.obstacle.a) * p.obstacle.d;
      const oy2 = y + Math.sin(p.obstacle.a) * p.obstacle.d;
      drawAsteroid(ox2, oy2, p.obstacle, clamp(p.alpha, 0, 1));
    }

    ctx.restore();
  }

  /**
   * 소행성 — 진짜 운석처럼 보이도록 그려요.
   *
   *  1) 옅은 붉은 헤일로로 "닿으면 죽는다"를 먼저 읽히게 하고
   *  2) 한쪽으로 눌린 울퉁불퉁한 실루엣에 좌상단 광원 기준 명암을 넣고
   *  3) 크레이터는 그늘 + 광원 반대쪽 안벽의 반사광으로 파인 느낌을 만들어요.
   *
   * 바위는 통째로 회전(look.tilt + look.rot)하지만 빛과 그림자는 항상 화면
   * 좌상단에서 들어와요. 그래야 굴러가는 동안 입체감이 유지돼요.
   */
  function drawAsteroid(cx, cy, ob, alpha) {
    const { r, look } = ob;
    const { shape, craters, grit, col, squash } = look;
    const n = shape.length;
    const ang = look.tilt + look.rot;
    const cs = Math.cos(ang);
    const sn = Math.sin(ang);

    /** 바위 기준 좌표 → 화면 좌표 */
    const toWorld = (lx, ly) => ({ x: cx + lx * cs - ly * sn, y: cy + lx * sn + ly * cs });

    ctx.save();
    ctx.globalAlpha = alpha;

    // 1) 위험 헤일로 — 바위 자체는 회색이라, 붉은 빛이 유일한 위험 신호예요
    const halo = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 2.2);
    halo.addColorStop(0, 'rgba(255,110,80,.32)');
    halo.addColorStop(0.5, 'rgba(255,88,78,.12)');
    halo.addColorStop(1, 'rgba(255,88,78,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 2.2, 0, TAU);
    ctx.fill();

    // 실루엣 — 꼭짓점 사이를 중점 기준 2차 곡선으로 이어 모서리만 다듬어요
    const px = (i) => {
      const k = ((i % n) + n) % n;
      const a = (k / n) * TAU;
      const rr = r * shape[k];
      return toWorld(Math.cos(a) * rr, Math.sin(a) * rr * squash);
    };
    const body = () => {
      const first = px(0);
      const last = px(n - 1);
      ctx.beginPath();
      ctx.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
      for (let i = 0; i < n; i++) {
        const cur = px(i);
        const nxt = px(i + 1);
        ctx.quadraticCurveTo(cur.x, cur.y, (cur.x + nxt.x) / 2, (cur.y + nxt.y) / 2);
      }
      ctx.closePath();
    };

    // 2) 암석 본체 — 좌상단이 밝고 우하단으로 갈수록 어두워요
    const rock = ctx.createRadialGradient(
      cx - r * 0.4, cy - r * 0.44, r * 0.08,
      cx + r * 0.14, cy + r * 0.16, r * 1.1
    );
    rock.addColorStop(0, col.hi);
    rock.addColorStop(0.42, col.mid);
    rock.addColorStop(1, col.low);
    ctx.fillStyle = rock;
    body();
    ctx.fill();

    // 3) 표면 디테일은 실루엣 안쪽에만
    ctx.save();
    body();
    ctx.clip();

    for (const cr of craters) {
      const c = toWorld(cr.x * r, cr.y * r * squash);
      const kr = cr.r * r;

      // 구덩이 그늘
      ctx.fillStyle = 'rgba(0,0,0,.4)';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, kr, kr * 0.86, ang, 0, TAU);
      ctx.fill();

      // 빛이 닿는 안벽은 우하단 — 각도는 회전과 무관하게 고정이에요
      ctx.strokeStyle = 'rgba(255,236,214,.3)';
      ctx.lineWidth = Math.max(0.55, kr * 0.26);
      ctx.beginPath();
      ctx.arc(c.x, c.y, kr * 0.76, -Math.PI * 0.12, Math.PI * 0.72);
      ctx.stroke();

      // 광원 쪽 테두리는 살짝 도드라져요
      ctx.strokeStyle = 'rgba(255,255,255,.13)';
      ctx.lineWidth = Math.max(0.5, kr * 0.16);
      ctx.beginPath();
      ctx.arc(c.x, c.y, kr * 1.02, Math.PI * 0.95, Math.PI * 1.75);
      ctx.stroke();
    }

    // 잔 알갱이
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    for (const s of grit) {
      const g = toWorld(s.x * r, s.y * r * squash);
      ctx.beginPath();
      ctx.arc(g.x, g.y, Math.max(0.4, s.r * r), 0, TAU);
      ctx.fill();
    }

    // 광원 쪽 면 하이라이트 + 반대쪽 그림자
    const lit = ctx.createLinearGradient(cx - r, cy - r, cx + r * 0.4, cy + r * 0.55);
    lit.addColorStop(0, 'rgba(255,246,236,.22)');
    lit.addColorStop(0.5, 'rgba(255,246,236,0)');
    ctx.fillStyle = lit;
    ctx.fillRect(cx - r * 1.2, cy - r * 1.2, r * 2.4, r * 2.4);

    const dark = ctx.createLinearGradient(cx, cy, cx + r * 0.9, cy + r * 0.9);
    dark.addColorStop(0, 'rgba(0,0,0,0)');
    dark.addColorStop(1, 'rgba(0,0,0,.5)');
    ctx.fillStyle = dark;
    ctx.fillRect(cx - r * 1.2, cy - r * 1.2, r * 2.4, r * 2.4);

    ctx.restore();

    // 4) 가장자리 — 실루엣 안쪽으로만 칠해서 테두리선처럼 보이지 않게 해요.
    ctx.save();
    body();
    ctx.clip();

    // 배경과 분리해 주는 어두운 외곽
    ctx.strokeStyle = 'rgba(0,0,0,.5)';
    ctx.lineWidth = Math.max(0.8, r * 0.1);
    body();
    ctx.stroke();

    // 빛을 받는 좌상단 모서리만 밝게 — 반대쪽으로 갈수록 사라져요
    const rim = ctx.createLinearGradient(cx - r * 0.9, cy - r * 0.9, cx + r * 0.6, cy + r * 0.6);
    rim.addColorStop(0, 'rgba(255,231,205,.5)');
    rim.addColorStop(0.5, 'rgba(255,231,205,.06)');
    rim.addColorStop(1, 'rgba(255,150,110,.16)');
    ctx.strokeStyle = rim;
    ctx.lineWidth = Math.max(0.7, r * 0.11);
    body();
    ctx.stroke();
    ctx.restore();

    ctx.restore(); // globalAlpha도 여기서 원래대로 돌아와요
  }

  /**
   * 보석 — 각진 크리스털.
   * 위쪽 관(crown)과 아래쪽 뿔(pavilion)을 나눠 칠하고 면마다 밝기를 달리해서
   * 이미지 없이도 깎인 보석처럼 보이게 해요.
   */
  function drawGem(g) {
    const y = g.y - state.camY + Math.sin(g.bob) * 3;
    if (y < -60 || y > H + 60) return;
    if (g.taken && g.pop <= 0) return;

    ctx.save();
    // 먹은 직후에는 커지면서 사라져요
    const k = g.taken ? g.pop : 1;
    const scale = g.taken ? 1 + (1 - g.pop) * 1.6 : 1;
    ctx.globalAlpha = k;
    ctx.translate(g.x, y);
    ctx.scale(scale, scale);

    const r = GEM_R;
    const pulse = 0.75 + 0.25 * Math.sin(g.bob * 1.6);

    // 후광
    const glow = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 2.6);
    glow.addColorStop(0, `rgba(140,240,255,${0.34 * pulse})`);
    glow.addColorStop(1, 'rgba(140,240,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.6, 0, TAU);
    ctx.fill();

    // 살짝 좌우로만 돌려서 두께감을 줘요 (완전히 돌리면 납작해 보여요)
    const w = r * (0.62 + 0.38 * Math.abs(Math.cos(g.rot)));

    const top = -r * 0.72;
    const mid = -r * 0.2;
    const bot = r * 1.05;

    // 아래 뿔
    ctx.fillStyle = '#1b7fa8';
    ctx.beginPath();
    ctx.moveTo(-w, mid);
    ctx.lineTo(0, bot);
    ctx.lineTo(w, mid);
    ctx.closePath();
    ctx.fill();
    // 뿔 왼쪽 면 (밝게)
    ctx.fillStyle = '#3fb6dd';
    ctx.beginPath();
    ctx.moveTo(-w, mid);
    ctx.lineTo(0, bot);
    ctx.lineTo(0, mid);
    ctx.closePath();
    ctx.fill();

    // 위 관
    ctx.fillStyle = '#7fe6ff';
    ctx.beginPath();
    ctx.moveTo(-w, mid);
    ctx.lineTo(-w * 0.55, top);
    ctx.lineTo(w * 0.55, top);
    ctx.lineTo(w, mid);
    ctx.closePath();
    ctx.fill();
    // 관 왼쪽 면 (가장 밝게 — 빛 받는 쪽)
    ctx.fillStyle = '#d5fbff';
    ctx.beginPath();
    ctx.moveTo(-w, mid);
    ctx.lineTo(-w * 0.55, top);
    ctx.lineTo(0, top);
    ctx.lineTo(0, mid);
    ctx.closePath();
    ctx.fill();
    // 테이블(윗면)
    ctx.fillStyle = '#eefeff';
    ctx.beginPath();
    ctx.moveTo(-w * 0.55, top);
    ctx.lineTo(w * 0.55, top);
    ctx.lineTo(w * 0.34, top + r * 0.2);
    ctx.lineTo(-w * 0.34, top + r * 0.2);
    ctx.closePath();
    ctx.fill();

    // 면 경계선
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(-w, mid);
    ctx.lineTo(w, mid);
    ctx.moveTo(0, mid);
    ctx.lineTo(0, bot);
    ctx.stroke();

    // 반짝임
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = k * pulse;
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.lineWidth = 1.1;
    const sp = r * 0.5 * pulse;
    ctx.beginPath();
    ctx.moveTo(-w * 0.42 - sp, top + r * 0.25);
    ctx.lineTo(-w * 0.42 + sp, top + r * 0.25);
    ctx.moveTo(-w * 0.42, top + r * 0.25 - sp);
    ctx.lineTo(-w * 0.42, top + r * 0.25 + sp);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawScrollEdge() {
    if (!state.scrolling) return;
    const t = performance.now() / 1000;
    const k = clamp(state.danger, 0, 1);

    ctx.save();
    const h = 150 + 90 * k;
    const g = ctx.createLinearGradient(0, H - h, 0, H);
    g.addColorStop(0, 'rgba(255,45,105,0)');
    g.addColorStop(1, `rgba(255,45,105,${0.1 + 0.34 * k})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, H - h, W, h);

    ctx.globalAlpha = 0.35 + 0.45 * k;
    ctx.strokeStyle = '#ff5c8a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, H - 2);
    ctx.lineTo(W, H - 2);
    ctx.stroke();

    ctx.strokeStyle = '#ff9ec4';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 7; i++) {
      const x = (((i * 97 + Math.sin(i * 2.3) * 30) % W) + W) % W;
      const prog = (t * (0.55 + i * 0.07) + i * 0.37) % 1;
      const y = H - prog * (110 + 60 * k);
      ctx.globalAlpha = (0.3 + 0.45 * k) * (1 - prog);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 12);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    if (k > 0.45) {
      const p = (k - 0.45) / 0.55;
      ctx.save();
      const a = 0.3 * p * (0.55 + 0.45 * Math.sin(t * 14));
      const v = ctx.createRadialGradient(W / 2, H * 0.62, H * 0.3, W / 2, H * 0.62, H * 0.72);
      v.addColorStop(0, 'rgba(255,47,109,0)');
      v.addColorStop(0.6, `rgba(255,47,109,${a * 0.3})`);
      v.addColorStop(1, `rgba(255,47,109,${a})`);
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  /**
   * 조준선.
   *
   * 발사는 **궤도 위 현재 위치의 바깥 방향으로 등속 직진**이에요. (jump() 참고)
   * 곡선이 아니라서 지금 누르면 어디로 갈지를 정확히 그릴 수 있어요.
   *
   * 본편에서는 1스테이지에서만 흐릿한 점선을 깔아주고,
   * 튜토리얼에서는 대본이 aim을 켠 칸에서 **들어가는지까지 판정**해서 색으로 알려줘요.
   */
  function drawAimGuide() {
    const pl = state.player;
    if (!pl || pl.mode !== 'orbit') return;
    const p = planetById(pl.planetId);
    if (!p) return;

    const t = state.tutorial;
    const coaching = Boolean(t && !t.waiting && t.coach?.aim);
    if (!coaching && p.stage > 1) return; // 본편 조준선은 지구에서만

    const dx = Math.cos(pl.angle);
    const dy = Math.sin(pl.angle);
    const y = pl.y - state.camY;

    /*
      들어가는가 판정 — 광선과 목표 원의 교차예요.
      proj  : 목표가 광선 앞쪽에 있는지 (뒤로 쏘면 음수)
      perp  : 광선이 목표 중심에서 얼마나 비켜 가는지 (외적의 절댓값)
      링 안쪽으로 조금 여유(0.88)를 둬서, 초록불일 때는 확실히 잡히게 했어요.
    */
    const target = coaching ? state.planets[t.coach.to] : null;
    let hit = false;
    let reach = 400;
    if (target) {
      const vx = target.x - pl.x;
      const vy = target.y - pl.y;
      const proj = vx * dx + vy * dy;
      const perp = Math.abs(vx * dy - vy * dx);
      hit = proj > 0 && perp < target.ring * 0.88;
      if (proj > 0) reach = Math.min(reach, proj);
    }

    ctx.save();
    const N = 16;
    const gap = Math.max(18, reach / N);
    for (let i = 1; i <= N; i++) {
      const d = i * gap;
      ctx.globalAlpha = (hit ? 0.85 : 0.55) * (1 - i / (N + 2));
      ctx.fillStyle = hit ? '#7dffb0' : '#ffffff';
      ctx.beginPath();
      ctx.arc(pl.x + dx * d, y + dy * d, 3.2 * (1 - i / (N + 6)), 0, TAU);
      ctx.fill();
    }

    // 들어가는 각도일 때는 목표 링도 같이 빛나요. "저기로 들어간다"가 한눈에 보이게.
    if (hit && target) {
      const pulse = 0.45 + 0.35 * Math.abs(Math.sin(performance.now() / 220));
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = '#7dffb0';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(target.x, target.y - state.camY, target.ring, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /* ── 코칭 표시 (튜토리얼 전용) ───────────────────
     여기 있는 것들은 전부 **카드가 떠 있는 동안**(waiting) 그려요.
     시간이 멈춰 있어서, 설명을 읽으면서 화면을 천천히 뜯어볼 수 있는 순간이거든요. */

  /** 대본의 focus를 실제 화면 좌표로 풀어요. 대상이 없으면 null. */
  function coachFocusPoint() {
    const c = state.tutorial?.coach;
    if (!c?.focus) return null;
    const label = c.focusLabel || COACH_LABEL[c.focus] || '';
    const target = state.planets[c.to];
    const prev = state.planets[c.to - 1];

    switch (c.focus) {
      case 'self': {
        const pl = state.player;
        const p = pl && planetById(pl.planetId);
        return p ? { x: p.x, y: p.y, r: p.ring + 40, label } : null;
      }
      case 'target':
        return target ? { x: target.x, y: target.y, r: target.ring + 28, label } : null;
      case 'obstacle': {
        if (!target?.obstacle) return null;
        const ob = target.obstacle;
        return {
          x: target.x + Math.cos(ob.a) * ob.d,
          y: target.y + Math.sin(ob.a) * ob.d,
          r: ob.r + 44,
          label,
        };
      }
      // 보석·블랙홀은 앞 행성과 목표 행성 **사이**에 놓여요. 그 중점에서 제일 가까운 걸 찾아요.
      case 'gem':
      case 'hole': {
        if (!target || !prev) return null;
        const mx = lerp(prev.x, target.x, 0.5);
        const my = lerp(prev.y, target.y, 0.5);
        const list = c.focus === 'gem' ? state.gemItems : state.holes;
        let best = null;
        let bestD = Infinity;
        for (const it of list) {
          const d = Math.hypot(it.x - mx, it.y - my);
          if (d < bestD) {
            bestD = d;
            best = it;
          }
        }
        if (!best || bestD > TUTORIAL_DIFF.gap) return null;
        return { x: best.x, y: best.y, r: (best.pull || 34) + 26, label };
      }
      default:
        return null;
    }
  }

  /**
   * 스포트라이트 — 화면을 덮고 대상 하나만 뚫어요.
   *
   * 사각형(시계 방향) + 원(반시계 방향)을 **하나의 path**로 채우면 원이 구멍이 돼요.
   * (캔버스 기본 채우기 규칙이 nonzero라 감는 방향이 반대면 서로 상쇄돼요)
   * 오프스크린 캔버스나 합성 모드 없이 되니까 제일 싸게 먹혀요.
   */
  function drawCoachSpotlight() {
    const t = state.tutorial;
    if (!t?.waiting) return;
    const f = coachFocusPoint();
    if (!f) return;

    const now = performance.now() / 1000;
    const y = f.y - state.camY;
    const r = f.r * (1 + Math.sin(now * 2.4) * 0.03);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.arc(f.x, y, r, 0, TAU, true);
    ctx.fillStyle = COACH_MASK;
    ctx.fill();

    // 구멍 테두리 + 바깥으로 퍼지는 고리
    ctx.strokeStyle = 'rgba(125, 255, 176, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(f.x, y, r, 0, TAU);
    ctx.stroke();

    const spread = (now % 1.4) / 1.4;
    ctx.globalAlpha = (1 - spread) * 0.5;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(f.x, y, r + spread * 26, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (f.label) {
      const ly = clamp(y - r - 18, 34, H - 30);
      ctx.font = 'bold 12px -apple-system, "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const w = ctx.measureText(f.label).width + 22;
      ctx.fillStyle = 'rgba(8, 14, 24, 0.92)';
      ctx.beginPath();
      ctx.roundRect(f.x - w / 2, ly - 11, w, 22, 11);
      ctx.fill();
      ctx.strokeStyle = 'rgba(125, 255, 176, 0.55)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#bfffd8';
      ctx.fillText(f.label, f.x, ly);
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }

  /**
   * 유령 시범 비행 — 첫 점프에서만.
   *
   * 카드를 읽는 동안 뒤에서 반투명 우주선이 **실제로 한 번 날아가 착지해요.**
   * 글로 "탭하면 날아가요"라고 쓰는 것보다 한 번 보여주는 게 빨라요.
   *
   * 경로는 지금 서 있는 행성에서 다음 행성 쪽을 정확히 겨눈 광선이에요.
   * (발사가 바깥 방향 직진이라, 목표를 향한 각도로 서면 반드시 들어가요)
   */
  function drawCoachDemo() {
    const t = state.tutorial;
    if (!t?.waiting || !t.coach?.demo) return;
    const pl = state.player;
    const p = pl && planetById(pl.planetId);
    const target = state.planets[t.coach.to];
    if (!p || !target) return;

    const ang = Math.atan2(target.y - p.y, target.x - p.x);
    const sx = p.x + Math.cos(ang) * p.ring;
    const sy = p.y + Math.sin(ang) * p.ring;
    const dist = Math.max(40, Math.hypot(target.x - sx, target.y - sy) - target.ring);

    const now = performance.now() / 1000;
    const loop = now % DEMO_LOOP;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);

    ctx.save();

    // 경로 미리보기 — 한 바퀴 내내 깔려 있어요
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#7dffb0';
    for (let d = 26; d < dist; d += 26) {
      ctx.beginPath();
      ctx.arc(sx + cos * d, sy + sin * d - state.camY, 2.4, 0, TAU);
      ctx.fill();
    }

    if (loop < 0.5) {
      // 1) 출발 전 — 여기를 누르라는 물결
      const k = loop / 0.5;
      ctx.globalAlpha = (1 - k) * 0.85;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy - state.camY, 14 + k * 30, 0, TAU);
      ctx.stroke();
      drawGhost(sx, sy, ang, 0.5, now, false);
    } else if (loop < 1.6) {
      // 2) 비행 — 살짝 가속하듯 ease-out
      const k = (loop - 0.5) / 1.1;
      const e = 1 - Math.pow(1 - k, 2);
      drawGhost(sx + cos * dist * e, sy + sin * dist * e, ang, 0.55, now, true);
    } else if (loop < 2.1) {
      // 3) 착지 — 목표 링이 한 번 조여들어요
      const k = (loop - 1.6) / 0.5;
      drawGhost(sx + cos * dist, sy + sin * dist, ang, 0.55 * (1 - k), now, false);
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.strokeStyle = '#7dffb0';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(target.x, target.y - state.camY, lerp(target.ring + 30, target.ring, k), 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /* ── 관문지기 접근 연출 ─────────────────────── */

  /**
   * 마지막 행성에서 "눌러서 출발하세요" 안내.
   * 배너가 지나간 뒤에만 떠요. (탭을 받기 시작하는 시점과 같아요)
   */
  function drawFinalPrompt() {
    // 도착 배너가 지나간 뒤에 떠요. (탭 자체는 FINAL_TAP_DELAY부터 받아요 —
    //  배너를 다 안 보고 넘기고 싶은 사람을 막을 이유는 없어요)
    if (state.mode !== 'final' || state.finalT < FINAL_HOLD) return;
    const pulse = 0.55 + 0.45 * Math.abs(Math.sin(performance.now() / 420));
    const y = H * 0.42;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#ffd98f';
    ctx.font = 'bold 15px -apple-system, "Noto Sans KR", sans-serif';
    ctx.fillText('화면을 눌러 관문지기에게', W / 2, y);
    ctx.globalAlpha = pulse * 0.62;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11.5px -apple-system, "Noto Sans KR", sans-serif';
    ctx.fillText('방향은 상관없어요', W / 2, y + 20);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /**
   * 접근하는 동안 위쪽에서 서서히 드러나는 관문지기.
   *
   * 스토리 엔진(story.js)의 보스와 **같은 실루엣**이에요 — 육각 본체 · 공전 링 두 겹 ·
   * 가운데 눈. 여기서 본 것이 다음 화면에서 그대로 나와야 "저놈이랑 붙는구나"가 돼요.
   * 형태만 맞추면 되니 손상 연출·레이저 같은 전투용 디테일은 뺐어요.
   */
  function drawBossApproach() {
    const a = state.approach;
    if (!a) return;
    const appear = clamp((a.t - 0.3) / 1.3, 0, 1);
    if (appear <= 0) return;

    const e = 1 - Math.pow(1 - appear, 3);
    const now = performance.now() / 1000;
    const cx = W / 2;
    const cy = H * 0.25;
    const s = 0.62 + e * 0.4;
    // 마지막 구간에서 눈이 붉게 달아올라요 — 깨어났다는 신호
    const wake = clamp((a.t - 2.1) / 1.0, 0, 1);
    const accent = wake > 0.5 ? '#ff5c6e' : '#ffd166';

    ctx.save();
    ctx.globalAlpha = e;
    ctx.translate(cx, cy);
    ctx.scale(s, s);

    // 공전 링 두 겹
    for (let i = 0; i < 2; i++) {
      ctx.save();
      ctx.rotate(now * 0.5 * (i ? -0.7 : 1));
      ctx.beginPath();
      ctx.ellipse(0, 0, 96 - i * 16, 30 - i * 6, 0, 0, TAU);
      ctx.strokeStyle = i ? 'rgba(150,180,230,0.35)' : 'rgba(255,255,255,0.28)';
      ctx.lineWidth = i ? 3 : 5;
      ctx.stroke();
      ctx.restore();
    }

    // 측면 포드
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * 74, 6);
      ctx.beginPath();
      ctx.moveTo(-14, -20);
      ctx.lineTo(14, -20);
      ctx.lineTo(10, 24);
      ctx.lineTo(-10, 24);
      ctx.closePath();
      ctx.fillStyle = '#2a3150';
      ctx.fill();
      ctx.strokeStyle = 'rgba(160,200,255,0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 22, 4, 0, TAU);
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.restore();
    }

    // 육각 본체
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * TAU + Math.PI / 6;
      const px = Math.cos(ang) * 62;
      const py = Math.sin(ang) * 62;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    const body = ctx.createLinearGradient(-60, -60, 60, 60);
    body.addColorStop(0, '#454f77');
    body.addColorStop(0.55, '#242b45');
    body.addColorStop(1, '#0f1424');
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = 'rgba(180,215,255,0.5)';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // 가운데 눈 — 깨어날수록 크고 붉게 뛰어요
    const beat = 1 + Math.sin(now * (3 + wake * 9)) * 0.1;
    const r = (16 + wake * 12) * beat;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    const eye = ctx.createRadialGradient(0, 0, 2, 0, 0, r);
    eye.addColorStop(0, '#ffffff');
    eye.addColorStop(0.4, accent);
    eye.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = eye;
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;

    // 스캔 파동 — 보스가 이쪽을 훑어보는 붉은 고리
    if (wake > 0) {
      const spread = (a.t % 0.9) / 0.9;
      ctx.save();
      ctx.globalAlpha = (1 - spread) * wake * 0.5;
      ctx.strokeStyle = '#ff5c6e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 96 * s + spread * 220, 0, TAU);
      ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // 「전투 준비」 — 눈이 깨어난 뒤에만
    if (wake > 0.35) {
      const k = clamp((wake - 0.35) / 0.4, 0, 1);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.globalAlpha = k;
      ctx.fillStyle = '#ff8a9b';
      ctx.font = 'bold 12px -apple-system, "Noto Sans KR", sans-serif';
      // 연습 비행에서는 같은 기체지만 훈련용이라고 밝혀줘요.
      ctx.fillText(
        state.tutorial ? '가디언-00 오버시어 · 훈련 모드' : '가디언-00 오버시어',
        W / 2,
        H * 0.5
      );
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px -apple-system, "Noto Sans KR", sans-serif';
      ctx.fillText('전투 준비', W / 2, H * 0.5 + 26);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  /** 시범용 반투명 우주선. 기체는 진짜와 같은 스킨으로 그려요. */
  function drawGhost(x, y, ang, alpha, now, flying) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y - state.camY);
    ctx.rotate(ang);
    skin.draw(ctx, now, flying);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawPlayer() {
    const pl = state.player;
    if (!pl) return;
    const y = pl.y - state.camY;
    const t = performance.now() / 1000;

    if (pl.trail.length > 1) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.globalCompositeOperation = 'lighter';
      for (const [wMul, color, aMul] of [
        [1, '#4a6cff', 0.32],
        [0.45, '#bff0ff', 0.6],
      ]) {
        for (let i = 1; i < pl.trail.length; i++) {
          const a = i / pl.trail.length;
          ctx.globalAlpha = a * aMul;
          ctx.strokeStyle = color;
          ctx.lineWidth = a * 11 * wMul;
          ctx.beginPath();
          ctx.moveTo(pl.trail[i - 1].x, pl.trail[i - 1].y - state.camY);
          ctx.lineTo(pl.trail[i].x, pl.trail[i].y - state.camY);
          ctx.stroke();
        }
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    if (state.mode === 'over') return;

    const ang = pl.mode === 'fly' ? Math.atan2(pl.vy, pl.vx) : pl.angle;
    const flying = pl.mode === 'fly';

    ctx.save();
    ctx.translate(pl.x, y);

    // 이어하기 직후 무적 — 기체가 깜빡여요
    if (state.invuln > 0) ctx.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(t * 12));

    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 40);
    g.addColorStop(0, 'rgba(120,200,255,.5)');
    g.addColorStop(0.45, 'rgba(90,130,255,.22)');
    g.addColorStop(1, 'rgba(90,130,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 40, 0, TAU);
    ctx.fill();

    ctx.rotate(ang);

    const fl = flying
      ? 30 + Math.sin(t * 70) * 6 + Math.random() * 9
      : 10 + Math.sin(t * 22) * 2 + Math.random() * 3;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // 불꽃 색은 스킨이 정해요. (공룡이 파란 제트를 뿜으면 어색하니까)
    const fg = ctx.createLinearGradient(-12, 0, -13 - fl, 0);
    fg.addColorStop(0, skin.flame.core);
    fg.addColorStop(0.3, skin.flame.mid);
    fg.addColorStop(0.7, skin.flame.tail);
    fg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(-11, 5.2);
    ctx.quadraticCurveTo(-13 - fl * 0.5, 2.6, -13 - fl, 0);
    ctx.quadraticCurveTo(-13 - fl * 0.5, -2.6, -11, -5.2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.beginPath();
    ctx.moveTo(-11, 2.4);
    ctx.quadraticCurveTo(-13 - fl * 0.22, 1.1, -12 - fl * 0.42, 0);
    ctx.quadraticCurveTo(-13 - fl * 0.22, -1.1, -11, -2.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 기체는 선택한 스킨이 그려요. (src/skins.js)
    skin.draw(ctx, t, flying);

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawParticles() {
    for (const q of state.particles) {
      const a = q.life / q.max;
      ctx.globalAlpha = a;
      ctx.fillStyle = q.color;
      ctx.beginPath();
      ctx.arc(q.x, q.y - state.camY, q.size * a, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawRings() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const q of state.rings) {
      const k = 1 - q.t / q.max;
      const e = 1 - Math.pow(1 - k, 3);
      ctx.globalAlpha = (1 - k) * 0.85;
      ctx.strokeStyle = q.color;
      ctx.lineWidth = q.w * (1 - k * 0.7);
      ctx.beginPath();
      ctx.arc(q.x, q.y - state.camY, lerp(q.r0, q.r1, e), 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawPops() {
    ctx.save();
    ctx.textAlign = 'center';
    for (const q of state.pops) {
      const k = q.t / q.max;
      const pop = k > 0.82 ? 1 + (k - 0.82) * 3.2 : 1;
      ctx.globalAlpha = Math.min(1, k * 2.6);
      ctx.save();
      ctx.translate(q.x, q.y - state.camY);
      ctx.scale(pop, pop);
      ctx.font = `bold ${q.size}px -apple-system, "Noto Sans KR", sans-serif`;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(0,0,0,.55)';
      ctx.strokeText(q.text, 0, 0);
      ctx.fillStyle = q.color;
      ctx.fillText(q.text, 0, 0);
      ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawPulse() {
    if (!state.pulse) return;
    const k = clamp(state.pulse.a / state.pulse.max, 0, 1);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(W / 2, H * 0.6, H * 0.18, W / 2, H * 0.6, H * 0.72);
    g.addColorStop(0, hexA(state.pulse.color, 0));
    g.addColorStop(1, hexA(state.pulse.color, 0.42 * k));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  /** ctx.roundRect는 구형 웹뷰에 없을 수 있어서 arcTo로 직접 그려요. */
  function roundRectPath(bx, by, bw, bh, br) {
    const r = Math.min(br, bw / 2, bh / 2);
    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
    ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
    ctx.arcTo(bx, by + bh, bx, by, r);
    ctx.arcTo(bx, by, bx + bw, by, r);
    ctx.closePath();
  }

  /**
   * 진행 막대 — 100개 행성 중 어디까지 왔는지.
   *
   * 숫자(「행성 32 / 100」)는 안 써요. 길이만으로 읽히게 하고,
   * 대신 state.progressK가 목표까지 부드럽게 차올라서 눈이 변화를 따라가요.
   *
   * 눈금은 스테이지 경계(10행성마다)예요. 지나온 눈금은 채움 위에 어둡게 찍혀서
   * "천체를 몇 개 지났는지"가 숫자를 안 읽어도 보여요.
   *
   * 폭(w)은 부르는 쪽에서 짧게 잘라 넘겨요. 인앱 웹뷰(토스)의 우측 상단
   * X · 더보기 버튼 근처까지 늘리면 끝이 잘려 보이거든요.
   */
  function drawProgressBar(x, y, w, info) {
    const k = clamp(state.progressK, 0, 1);
    const h = 7;
    const r = h / 2;
    const now = performance.now() / 1000;

    ctx.save();

    // 어두운 우주 위에서도 막대가 떠 보이게 트랙 밑에 옅은 그림자를 깔아요.
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    roundRectPath(x - 1, y - 1, w + 2, h + 2, r + 1);
    ctx.fill();

    // 트랙
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,.16)';
    roundRectPath(x, y, w, h, r);
    ctx.fill();

    // 채워진 부분 — 스테이지 색으로 왼쪽(연함) → 오른쪽(밝음)
    const fw = Math.max(h, w * k);
    const g = ctx.createLinearGradient(x, 0, x + fw, 0);
    g.addColorStop(0, hexA(info.c2, 0.85));
    g.addColorStop(1, info.c1);

    ctx.save();
    roundRectPath(x, y, fw, h, r);
    ctx.clip();
    ctx.fillStyle = g;
    ctx.fillRect(x, y, fw, h);

    // 위쪽 절반만 살짝 밝게 — 납작한 막대에 두께감이 생겨요.
    const gloss = ctx.createLinearGradient(0, y, 0, y + h);
    gloss.addColorStop(0, 'rgba(255,255,255,.32)');
    gloss.addColorStop(0.5, 'rgba(255,255,255,.04)');
    gloss.addColorStop(1, 'rgba(0,0,0,.14)');
    ctx.fillStyle = gloss;
    ctx.fillRect(x, y, fw, h);

    // 채워진 구간을 천천히 훑고 지나가는 빛 — 살아 있는 느낌만 주는 정도로.
    const sweep = ((now * 0.34) % 1.9) / 1.9;
    const sx = x - 26 + (fw + 52) * sweep;
    const sg = ctx.createLinearGradient(sx - 26, 0, sx + 26, 0);
    sg.addColorStop(0, 'rgba(255,255,255,0)');
    sg.addColorStop(0.5, 'rgba(255,255,255,.28)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(x, y, fw, h);
    ctx.restore();

    // 스테이지 눈금 (10행성마다)
    const steps = Math.round(TOTAL_PLANETS / PLANETS_PER_STAGE);
    for (let i = 1; i < steps; i++) {
      const tx = x + (w * i) / steps;
      const passed = tx <= x + fw;
      ctx.globalAlpha = passed ? 0.5 : 0.3;
      ctx.fillStyle = passed ? '#04050d' : '#ffffff';
      ctx.fillRect(tx - 0.8, y + 1, 1.6, h - 2);
    }
    ctx.globalAlpha = 1;

    // 진행 지점 — 숨 쉬듯 아주 옅게 커졌다 작아져요. 눈이 여기부터 읽게.
    // 100%에서 점이 막대 밖으로 빠져나가 보이지 않게 둥근 끝 안쪽까지만 가요.
    const hx = x + Math.min(fw, w - r);
    const hy = y + r;
    const pulse = 1 + Math.sin(now * 2.2) * 0.08;

    ctx.globalAlpha = 0.35;
    ctx.fillStyle = info.c1;
    ctx.beginPath();
    ctx.arc(hx, hy, 7.5 * pulse, 0, TAU);
    ctx.fill();

    ctx.globalAlpha = 0.95;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = info.c1;
    ctx.shadowBlur = 9;
    ctx.beginPath();
    ctx.arc(hx, hy, 3.6, 0, TAU);
    ctx.fill();

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /**
   * HUD — 안전 영역 안쪽 왼쪽 열에만 그려요.
   * 우측 상단(NAV_RESERVE_W)은 프레임워크 X · 더보기 버튼 자리라 절대 침범하지 않아요.
   *
   * 위쪽은 스테이지 이름과 진행 막대예요.
   * 그 아래로 점수 · 보석 · 콤보가 왼쪽 열에 쌓여요.
   */
  function drawHUD() {
    if (state.mode === 'title') return;
    const box = hudBox();
    const info = stageInfo(state.stage);
    const x = box.left;
    /*
      진행 막대 폭.

      예전엔 쓸 수 있는 폭을 끝까지 다 썼는데, 인앱 웹뷰(토스)에서는 화면 오른쪽
      위를 프레임워크 UI가 덮어서 막대 오른쪽 끝(=지금 진행 지점)이 잘려 보였어요.
      진행 지점이 안 보이면 막대를 둘 이유가 없으니, 아예 화면 절반쯤에서 끊어요.
      숫자를 뺀 대신 폭을 줄여도 길이 변화는 그대로 읽혀요.
    */
    const right = Math.min(box.right, W - NAV_RESERVE_W);
    const barW = clamp(right - x, 120, PROGRESS_BAR_W);
    let y = box.top;

    ctx.textAlign = 'left';
    if (state.tutorial) {
      /*
        튜토리얼에는 100행성 진행 막대가 의미 없어요.
        대신 천체 이름(본편과 같은 순서로 바뀌어요)과 지금 레슨을 보여줘요.

        행성 번호(`8 / 15`)가 아니라 레슨 번호를 세는 이유는 하나예요 —
        분모가 크면 시작하자마자 질려요. 배우는 덩어리 단위로 세면 7까지만 갑니다.
      */
      const cur = TUTORIAL_COURSE[state.tutorial.lastIndex];
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = info.c1;
      ctx.font = 'bold 13px -apple-system, "Noto Sans KR", sans-serif';
      ctx.fillText(`${info.name}  ·  연습 비행`, x, y + 11);

      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px -apple-system, "Noto Sans KR", sans-serif';
      ctx.fillText(
        `레슨 ${(cur?.lesson ?? 0) + 1} / ${TUTORIAL_LESSON_COUNT}  ·  ${cur?.lessonName || ''}`,
        x,
        y + 27
      );
      ctx.globalAlpha = 1;
      y += 38;
    } else {
      // 스테이지 이름 — 진행 숫자(「행성 32 / 100」)는 안 띄워요. 막대가 대신해요.
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = info.c1;
      ctx.font = 'bold 13px -apple-system, "Noto Sans KR", sans-serif';
      ctx.fillText(`${info.name}  ·  STAGE ${state.stage}`, x, y + 11);
      ctx.globalAlpha = 1;
      y += 19;

      drawProgressBar(x, y, barW, info);
      y += 21;
    }

    // 붕괴 타이머 — 진행 막대 바로 아래 같은 폭으로. (대시보드의 두 번째 줄)
    const plNow = state.player;
    if (state.mode === 'play' && plNow && plNow.mode === 'orbit') {
      const p = planetById(plNow.planetId);
      if (p && p.decay && p.timer > 0) {
        const ratio = clamp(p.timer / p.decay, 0, 1);
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = 'rgba(255,255,255,.13)';
        ctx.fillRect(x, y, barW, 4);
        ctx.fillStyle = ratio > 0.35 ? '#ffd166' : '#ff6b6b';
        ctx.fillRect(x, y, barW * ratio, 4);
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = ratio > 0.35 ? '#ffd166' : '#ff6b6b';
        ctx.font = '10px -apple-system, "Noto Sans KR", sans-serif';
        ctx.fillText('불안정한 행성 — 빨리 점프!', x, y + 17);
        ctx.restore();
        ctx.globalAlpha = 1;
        y += 22;
      }
    }
    y += 6;

    // 점수 (착지할 때마다 튀어요)
    const sp = 1 + state.scorePop * 0.28;
    ctx.save();
    ctx.translate(x, y + 32);
    ctx.scale(sp, sp);
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = state.scorePop > 0.4 ? '#ffe9a8' : '#ffffff';
    ctx.font = 'bold 40px -apple-system, "Noto Sans KR", sans-serif';
    ctx.fillText(String(state.score), 0, 0);
    ctx.restore();
    y += 42;

    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#ffffff';
    ctx.font = '11px monospace';
    ctx.fillText(`BEST ${state.best}`, x + 2, y + 10);
    y += 22;
    ctx.globalAlpha = 1;

    // 이번 판에서 주운 보석
    if (state.gems > 0) {
      // HUD용 미니 보석 — 화면에 떠 있는 보석(drawGem)과 같은 비율이에요.
      // 관(위)은 짧고 뿔(아래)이 길어야 깎인 보석처럼 보여요.
      ctx.save();
      ctx.translate(x + 7, y + 3);
      const gw = 7.2; // 반폭
      const gTop = -5.4;
      const gMid = -1.4;
      const gBot = 8.4;

      ctx.fillStyle = '#2f9fc8';
      ctx.beginPath();
      ctx.moveTo(-gw, gMid);
      ctx.lineTo(gw, gMid);
      ctx.lineTo(0, gBot);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#7fe6ff';
      ctx.beginPath();
      ctx.moveTo(-gw, gMid);
      ctx.lineTo(-gw * 0.55, gTop);
      ctx.lineTo(gw * 0.55, gTop);
      ctx.lineTo(gw, gMid);
      ctx.closePath();
      ctx.fill();

      // 빛 받는 왼쪽 면
      ctx.fillStyle = '#dbfcff';
      ctx.beginPath();
      ctx.moveTo(-gw, gMid);
      ctx.lineTo(-gw * 0.55, gTop);
      ctx.lineTo(0, gTop);
      ctx.lineTo(0, gMid);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#59c8ec';
      ctx.beginPath();
      ctx.moveTo(-gw, gMid);
      ctx.lineTo(0, gMid);
      ctx.lineTo(0, gBot);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#c9f6ff';
      ctx.font = 'bold 14px -apple-system, "Noto Sans KR", sans-serif';
      ctx.fillText(`${state.gems}`, x + 18, y + 9);
      ctx.globalAlpha = 1;
      y += 24;
    }

    // 콤보 게이지
    if (state.mode === 'play' && state.combo >= 2) {
      const k = clamp(state.comboT / COMBO_WINDOW, 0, 1);
      const hue = clamp(180 + state.combo * 14, 0, 320);
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = `hsl(${hue},100%,72%)`;
      ctx.font = 'bold 19px -apple-system, "Noto Sans KR", sans-serif';
      ctx.fillText(`x${state.combo}`, x + 2, y + 12);
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + 2, y + 20, 84, 4);
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = `hsl(${hue},100%,68%)`;
      ctx.fillRect(x + 2, y + 20, 84 * k, 4);
      ctx.restore();
      y += 34;
    }

    // 화면 상승 압박 미터
    if (state.scrolling) {
      const k = clamp(state.danger, 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#fff';
      ctx.font = '9px monospace';
      ctx.fillText('SCREEN RISING', x + 2, y + 8);
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + 2, y + 14, 70, 4);
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = k > 0.6 ? '#ff2f6d' : '#ff9ec4';
      ctx.fillRect(x + 2, y + 14, 70 * k, 4);
      ctx.restore();
      ctx.globalAlpha = 1;
    }

  }

  /** 삼각형 경고 표지 — 반지름 r만큼의 크기로 (cx, cy)에 그려요. */
  function drawWarnSign(cx, cy, r, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = r * 0.34;

    ctx.beginPath();
    ctx.moveTo(0, -r * 0.95);
    ctx.lineTo(r * 0.95, r * 0.75);
    ctx.lineTo(-r * 0.95, r * 0.75);
    ctx.closePath();
    ctx.stroke();

    ctx.lineWidth = r * 0.3;
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.28);
    ctx.lineTo(0, r * 0.14);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, r * 0.44, r * 0.16, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawBanner() {
    if (!state.banner) return;
    const b = state.banner;
    const full = b.full || (b.warn ? 2.8 : 2.0);
    const t = clamp(b.t / full, 0, 1);
    const a = t > 0.8 ? (1 - t) / 0.2 : Math.min(1, t / 0.3);
    const h = b.warn ? 104 : 78;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,.4)';
    ctx.fillRect(0, H * 0.34, W, h);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 26px -apple-system, "Noto Sans KR", sans-serif';
    ctx.fillText(b.text, W / 2, H * 0.34 + 36);
    ctx.globalAlpha = a * 0.6;
    ctx.font = '12px monospace';
    ctx.fillText(b.sub, W / 2, H * 0.34 + 58);
    if (b.warn) {
      ctx.globalAlpha = a * (0.65 + 0.35 * Math.sin((performance.now() / 1000) * 9));
      ctx.fillStyle = '#ff6b9d';
      ctx.font = 'bold 14px -apple-system, "Noto Sans KR", sans-serif';

      // 경고 아이콘도 직접 그려요. (이모지 ⚠는 기기마다 모양·색이 달라요)
      const wy = H * 0.34 + 86;
      const iw = 15;
      const gap = 6;
      const tw = ctx.measureText(b.warn).width;
      const left = W / 2 - (tw + iw + gap) / 2;
      ctx.textAlign = 'left';
      ctx.fillText(b.warn, left + iw + gap, wy);
      drawWarnSign(left + iw / 2, wy - 5, iw / 2, '#ff6b9d');
      ctx.textAlign = 'center';
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function draw() {
    // 0) 백버퍼 배율이 어긋났으면 먼저 바로잡아요.
    //    (웹뷰가 로드 직후엔 dpr을 1로 보고했다가 나중에 제값을 주는 경우 대응)
    ensureBackingStore();

    // 1) 기기 화면 전체를 배경으로 채워요 (레터박스가 생겨도 빈 곳이 없게)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const info = stageInfo(state.stage);
    const bg = ctx.createLinearGradient(0, 0, 0, vh);
    bg.addColorStop(0, '#04050d');
    bg.addColorStop(0.55, '#05060f');
    bg.addColorStop(1, hexA(info.c2, 0.16));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, vw, vh);

    // 2) 논리 좌표계로 전환
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, ox * dpr, oy * dpr);

    ctx.save();
    if (state.shake > 0.2) {
      ctx.translate(rand(-state.shake, state.shake), rand(-state.shake, state.shake));
    }
    drawStars();
    // 블랙홀은 행성보다 먼저 — 겹칠 일은 없지만, 후광이 행성 위를 덮으면
    // 착지 지점이 흐려져서 조준이 어려워져요.
    for (const h of state.holes) drawBlackHole(h);
    for (const p of state.planets) drawPlanet(p);
    for (const g of state.gemItems) drawGem(g);
    drawAimGuide();
    drawRings();
    drawPlayer();
    drawParticles();
    drawPops();
    ctx.restore();

    /*
      코칭 표시는 무대 위 · HUD 아래예요.
      스포트라이트가 화면을 덮은 **다음에** 시범 비행을 그려야 유령이 안 어두워져요.
      좌표계는 무대와 같아요 (흔들림 보정만 빠져 있는데, 카드가 떠 있는 동안은
      흔들림이 없으니 어긋날 일이 없어요).
    */
    drawCoachSpotlight();
    drawCoachDemo();
    drawBossApproach();
    drawFinalPrompt();

    drawPulse();
    drawScrollEdge();

    if (state.flash > 0) {
      ctx.globalAlpha = state.flash;
      ctx.fillStyle = '#ff5252';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    drawHUD();
    drawBanner();
  }

  /* ── 루프 */

  let last = performance.now();
  let raf = 0;

  /*
    스토리 모드(2.0)가 이 캔버스를 통째로 덮는 동안에는 그릴 이유가 없어요.
    캔버스를 숨기는 대신 그리기만 멈춰요. display:none으로 감추면 크기가 0으로
    측정돼서 백버퍼가 무너지고, 돌아왔을 때 한동안 뭉개져 보이거든요.
  */
  let renderOn = true;

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    // 튜토리얼 안내 카드가 떠 있는 동안(waiting)에도 시간이 멈춰요.
    if (!state.paused && !state.tutorial?.waiting) update(dt);
    if (renderOn) draw();
  }

  reset();
  raf = requestAnimationFrame(loop);

  /* ── 이어하기 */

  /**
   * 광고 시청 보상 — 마지막으로 착지했던 행성에서 다시 시작해요.
   * 점수와 스테이지는 유지하고, 잠깐 무적 상태를 줘요.
   */
  function revive() {
    if (state.mode !== 'over') return false;
    const pl = state.player;
    let p = planetById(pl.planetId);

    // 밟고 있던 행성이 사라졌으면 화면 안의 아무 행성이나 잡아요.
    if (!p) p = state.planets.find((q) => !q.dying) || state.planets[0];
    if (!p) return false;

    // 그 행성과 근처 행성의 위험 요소를 걷어내요.
    p.dying = false;
    p.alpha = 1;
    p.decay = 0;
    p.timer = 0;
    p.obstacle = null;
    for (const q of state.planets) {
      if (Math.abs(q.y - p.y) < H * 0.6) q.obstacle = null;
    }
    // 블랙홀에 삼켜져서 이어하는 경우 — 되살아난 자리 바로 옆에 그 블랙홀이 그대로
    // 있으면 발사하자마자 또 빨려 들어가요. 부활 지점 주변은 걷어내요.
    state.holes = state.holes.filter((h) => Math.hypot(h.x - p.x, h.y - p.y) > p.ring + h.pull);

    pl.mode = 'orbit';
    pl.planetId = p.id;
    pl.angle = -Math.PI / 2;
    pl.dir = 1;
    pl.vx = 0;
    pl.vy = 0;
    pl.flyT = 0;
    pl.ignore = -1;
    pl.trail.length = 0;
    p.landed = true;
    syncOrbitPos();

    // 카메라를 다시 아래쪽으로 내려 여유를 만들어요.
    state.camY = p.y - H * CAM_ANCHOR;
    state.camTarget = state.camY;

    state.mode = 'play';
    state.paused = false;
    state.invuln = REVIVE_GRACE;
    state.revives++;
    state.combo = 0;
    state.comboT = 0;
    state.danger = 0;
    state.shake = 0;
    state.flash = 0;
    state.deathMsg = '';
    state.banner = { text: '이어하기', sub: 'CONTINUE', warn: null, t: 1.6 };

    addRing(p.x, p.y, p.ring * 0.2, p.ring * 3.2, '#7dffb0', 0.9, 3);
    burst(pl.x, pl.y, 24, '#7dffb0', 200, 0.8, 3);
    audio.reward();
    audio.startBgm();
    haptic('confetti');
    return true;
  }

  /* ── 외부 API */

  return {
    state,
    W,
    get H() {
      return H;
    },

    /** SafeArea 값이 바뀔 때 호출해요. */
    setInsets(v) {
      insets = v;
      resize();
    },

    /**
     * 화면 아래쪽에서 게임이 쓰지 못하는 높이(CSS px)를 알려줘요.
     * 지금은 하단 배너 광고가 유일한 손님이에요.
     */
    setBottomReserve(px) {
      const v = Math.max(0, Math.round(px) || 0);
      if (v === bottomReserve) return;
      bottomReserve = v;
      backingRefused = null;
      resize();
    },

    /** 최고 기록을 세이브에서 불러와 HUD에 반영해요. */
    setRecords({ best = 0, bestCombo = 0 } = {}) {
      state.best = best;
      state.bestComboEver = bestCombo;
    },

    /** 장착한 우주선 스킨을 바꿔요. 다음 프레임부터 바로 보여요. */
    setSkin(id) {
      skin = getSkin(id);
    },

    /**
     * 화면에 그릴지 말지. 스토리 모드가 위를 덮고 있는 동안 꺼둬요.
     * 다시 켜면 백버퍼를 한 번 맞춰보고 이어서 그려요.
     */
    setRenderEnabled(on) {
      renderOn = on;
      if (on) {
        backingRefused = null;
        resize();
      }
    },

    getRecords() {
      return { best: state.best, bestCombo: state.bestComboEver };
    },

    start() {
      reset();
      state.mode = 'play';
      state.paused = false;
      audio.startBgm();
    },

    /** 홈으로 — 판을 접고 배경을 처음 상태로 되돌려요. */
    home() {
      reset();
      state.mode = 'title';
      state.paused = false;
      audio.stopBgm();
    },

    /* ── 튜토리얼 */

    /**
     * 연습 코스를 처음부터 시작해요.
     * 첫 안내 카드는 바로 뜨고, 탭해서 닫으면 그때부터 움직일 수 있어요.
     */
    startTutorial() {
      reset();
      state.tutorial = {
        lastIndex: 0,
        shown: new Set(),
        scrolling: false,
        waiting: false,
        done: false,
        retries: 0,
        /** 지금 그려줄 코칭 표시 (조준선 · 스포트라이트 · 시범 비행) */
        coach: null,
      };
      tutorialStartAt(0);
      audio.startBgm();
      tutorialBrief();
    },

    /** 안내 카드를 닫았을 때. 마지막 카드였으면 튜토리얼이 끝나요. */
    tutorialContinue,

    /** 튜토리얼을 도중에 그만둬요. (홈으로 나갈 때) */
    quitTutorial() {
      if (!state.tutorial) return;
      state.tutorial = null;
      state.approach = null;
      reset();
      state.mode = 'title';
      audio.stopBgm();
    },

    get isTutorial() {
      return Boolean(state.tutorial);
    },

    revive,

    /**
     * 렌더링과 무관하게 한 프레임만 진행해요.
     * 봇을 붙여 스테이지별 난이도를 수치로 검증할 때 써요.
     */
    step(dt = 1 / 60) {
      update(dt);
    },

    /** 봇 시뮬레이션용 발사 */
    jump,

    /** 백그라운드 전환 · 광고 재생 중 — 게임 시간을 완전히 멈춰요. */
    pause() {
      if (state.paused) return;
      state.paused = true;
      audio.suspend();
    },

    resume() {
      if (!state.paused) return;
      state.paused = false;
      last = performance.now();
      audio.resume();
    },

    get isPlaying() {
      return state.mode === 'play';
    },

    destroy() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', queueResize);
      window.removeEventListener('orientationchange', queueResize);
      window.visualViewport?.removeEventListener('resize', queueResize);
      ro?.disconnect();
    },

    /**
     * 렌더링 상태 진단값. 지금은 아무도 안 부르지만 남겨둬요.
     *
     * 캔버스가 화면 해상도의 1/N로 그려지는 문제는 웹뷰·OS 버전이 바뀌면 재발할 수 있고,
     * 실기기에는 개발자도구를 붙이기 어려워요. 재발하면 설정 화면 같은 데에
     * 이 값을 그대로 찍어보면 어디가 어긋났는지 바로 보여요.
     * (actualRatio가 기기 배율과 같아야 정상. css와 askedCss가 다르면 레이아웃이 어긋난 거예요)
     */
    renderInfo() {
      const vv = window.visualViewport;
      return {
        // 캔버스가 실제로 화면에서 차지하는 CSS 크기 (지정값 vw/vh와 다르면 그게 문제예요)
        css: `${Math.round(cssW)}×${Math.round(cssH)}`,
        askedCss: `${askedW}×${askedH}`,
        // 실제 그려지는 픽셀 수
        backing: `${canvas.width}×${canvas.height}`,
        // 배율 1.0이면 기기 해상도의 1/3만 쓰고 있다는 뜻 (3x 기기 기준)
        actualRatio: canvas.width / vw,
        reportedDpr: window.devicePixelRatio || 1,
        // CSS 해상도 질의 + devicePixelRatio를 합친 최종 추정 배율
        probedDpr: probeDpr(),
        // 지금 배율이 어느 경로에서 나왔는지
        source: measured ? '실측(RO)' : '추정(dpr/질의)',
        // ResizeObserver 실측이 들어왔는지 (안 들어오면 probeDpr 추정)
        measured: measured ? `${measured.w}×${measured.h}` : null,
        // 이 둘이 다르면 웹뷰가 페이지를 확대/축소해서 띄우고 있다는 신호예요
        inner: `${window.innerWidth}×${window.innerHeight}`,
        visual: vv ? `${Math.round(vv.width)}×${Math.round(vv.height)}` : '없음',
        vvScale: vv?.scale ?? 1,
        // 화면 자체가 보고하는 크기 (CSS px)
        screen: `${window.screen.width}×${window.screen.height}`,
      };
    },
  };
}

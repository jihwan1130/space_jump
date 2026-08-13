/**
 * SPACE JUMP — 게임 본체.
 *
 * 행성의 점선 궤도를 따라 공전하다가, 탭하면 우주선이 향한 직선 방향으로 발사돼요.
 * 다음 행성의 궤도 안에 들어가면 착지, 빗나가면 그대로 우주 밖으로 날아가요.
 *
 * 화면 구성
 *  - 논리 가로폭은 480으로 고정하고, 세로 길이(H)는 기기 화면 비율을 따라가요.
 *    그래서 어떤 기기에서도 위아래 여백 없이 풀스크린으로 꽉 차요.
 *  - HUD는 안전 영역(노치 · 홈 인디케이터) 안쪽에만 그리고,
 *    우측 상단은 프레임워크의 X · 더보기 버튼 자리라 비워둬요.
 */
import { audio } from './audio.js';
import { getSkin, DEFAULT_SKIN } from './skins.js';
import { GEM_CHANCE } from './config.js';

/* ────────────────────────────── 상수 */

const W = 480; // 논리 가로 해상도 (고정)
const H_MIN = 720;
const H_MAX = 1120;

const PLANETS_PER_STAGE = 10;
const PLAYER_R = 11;
const FLIGHT_TIMEOUT = 2.6;
const CAM_ANCHOR = 0.78;
const CAM_FLY = 0.62;
const HAZARD_STAGE = 4; // 목성부터 화면이 스스로 올라와요
const ORBIT_SPIN = 2.0;
const COMBO_WINDOW = 3.4;
const REVIVE_GRACE = 2.2; // 이어하기 직후 무적 시간(초)
const GEM_R = 10; // 보석 크기(반경)
const GEM_PICKUP = 26; // 이 거리 안에 들어오면 먹어요 (넉넉하게 — 놓치면 아까우니까)

/** 우측 상단 내비게이션 버튼이 차지하는 영역 (논리 px) */
const NAV_RESERVE_W = 116;

const TAU = Math.PI * 2;

const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ────────────────────────────── 행성 테마 */

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

/** 스테이지별 난이도 곡선 — 밸런스는 전부 여기서 조정해요. */
function diff(stage) {
  const t = clamp((stage - 1) / 9, 0, 1);
  const t2 = clamp((stage - 10) / 15, 0, 1);
  return {
    r: lerp(49, 27, t) - t2 * 3,
    ring: lerp(94, 61, t) - t2 * 5,
    spin: lerp(1.5, 2.7, t) + t2 * 0.8,
    gap: lerp(315, 395, t) + t2 * 30,
    spread: lerp(75, 165, t),
    speed: lerp(450, 560, t) + t2 * 40,
    scroll: lerp(22, 50, clamp((stage - HAZARD_STAGE) / 8, 0, 1)) + t2 * 10,
    obstacleChance: stage >= 2 ? Math.min(0.6, (stage - 1) * 0.13) : 0,
    moveChance: stage >= 3 ? Math.min(0.55, (stage - 2) * 0.13) : 0,
    decayChance: stage >= 5 ? Math.min(0.45, (stage - 4) * 0.14) : 0,
    decayTime: lerp(3.4, 2.0, t),
  };
}

/* ────────────────────────────── 게임 생성 */

/**
 * @param {object} opts
 * @param {HTMLCanvasElement} opts.canvas
 * @param {(result: {score:number,stage:number,landed:number,bestCombo:number,reason:string}) => void} opts.onGameOver
 * @param {(type: string) => void} [opts.haptic]
 */
export function createGame({ canvas, onGameOver, haptic = () => {} }) {
  const ctx = canvas.getContext('2d');

  /* ── 화면 좌표계 */
  let H = 854;
  let scale = 1;
  let ox = 0;
  let oy = 0;
  let dpr = 1;
  let insets = { top: 0, bottom: 0, left: 0, right: 0 };

  function resize() {
    const vw = Math.max(1, window.innerWidth);
    const vh = Math.max(1, window.innerHeight);
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    // 기기 비율을 그대로 논리 높이로 받아 풀스크린을 만들어요.
    H = clamp((W * vh) / vw, H_MIN, H_MAX);
    scale = Math.min(vw / W, vh / H);
    ox = (vw - W * scale) / 2;
    oy = (vh - H * scale) / 2;

    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    canvas.style.width = `${vw}px`;
    canvas.style.height = `${vh}px`;
  }

  /** 화면 px → 논리 px */
  const toLogicalX = (px) => (px - ox) / scale;
  const toLogicalY = (py) => (py - oy) / scale;

  /** HUD를 그릴 수 있는 안쪽 여백(논리 px) */
  function hudBox() {
    return {
      top: clamp(toLogicalY(insets.top), 0, H) + 10,
      left: clamp(toLogicalX(insets.left), 0, W) + 18,
      right: clamp(toLogicalX(window.innerWidth - insets.right), 0, W) - 18,
      bottom: clamp(toLogicalY(window.innerHeight - insets.bottom), 0, H) - 10,
    };
  }

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  resize();

  /* ── 상태 */
  const state = {
    mode: 'title', // title | play | over
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
    const d = diff(stage);
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

  function spawnAhead() {
    while (
      state.planets.length < 2 ||
      state.planets[state.planets.length - 1].y > state.camY - H * 1.2
    ) {
      const prev = state.planets[state.planets.length - 1];
      const index = prev ? prev.index + 1 : 0;
      const d = diff(Math.floor(index / PLANETS_PER_STAGE) + 1);
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
      state.planets.push(createPlanet(index, x, y));

      // 보석은 방금 만든 행성과 그 앞 행성 **사이**에 놓아요.
      // 비행 경로 위에 있어야 "일부러 주우러 가는" 선택이 생겨요.
      if (prev && index > 1 && Math.random() < GEM_CHANCE) {
        const k = rand(0.4, 0.62); // 앞 행성에서 얼마나 왔는지
        state.gemItems.push({
          x: clamp(lerp(prev.x, x, k) + rand(-34, 34), 34, W - 34),
          y: lerp(prev.y, y, k),
          taken: false,
          rot: rand(0, TAU),
          bob: rand(0, TAU),
          pop: 0,
        });
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
    const d = diff(p.stage);
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

  function die(msg) {
    if (state.mode !== 'play') return;
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
      bestCombo: state.bestCombo,
      reason: msg,
      revives: state.revives,
      gems: state.gems,
    });
  }

  function onPointerDown(e) {
    if (state.mode !== 'play' || state.paused) return;
    e.preventDefault();
    jump();
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'Enter') {
      e.preventDefault();
      if (state.mode === 'play' && !state.paused) jump();
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

      // 목성 라운드부터 화면이 스스로 계속 위로 올라와요.
      if (state.mode === 'play' && state.stage >= HAZARD_STAGE) {
        state.scrolling = true;
        state.camTarget -= diff(state.stage).scroll * dt;
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

    if (p.stage !== state.stage) {
      state.stage = p.stage;
      audio.setStage(p.stage);
      state.banner = {
        text: `${p.info.name} 궤도 진입`,
        sub: `STAGE ${p.stage} · ${p.info.sub}`,
        warn: p.stage === HAZARD_STAGE ? '화면이 계속 올라온다 — 밀려나면 끝' : null,
        t: p.stage === HAZARD_STAGE ? 2.8 : 2.0,
      };
      burst(p.x, p.y, 26, p.col.c1, 200, 0.9, 3.5);
      addRing(p.x, p.y, p.ring * 0.3, p.ring * 3.4, p.col.c1, 1.0, 2.5);
      audio.stage();
      haptic('basicMedium');
    }
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

  function drawAimGuide() {
    const pl = state.player;
    if (!pl || pl.mode !== 'orbit') return;
    const p = planetById(pl.planetId);
    if (!p || p.stage > 1) return; // 조준선은 튜토리얼 구간(지구)에서만
    const tx = Math.cos(pl.angle);
    const ty = Math.sin(pl.angle);
    const y = pl.y - state.camY;
    ctx.save();
    const N = 16;
    for (let i = 1; i <= N; i++) {
      const d = i * 25;
      ctx.globalAlpha = 0.6 * (1 - i / (N + 2));
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(pl.x + tx * d, y + ty * d, 3.2 * (1 - i / (N + 6)), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
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

  /**
   * HUD — 안전 영역 안쪽 왼쪽 열에만 그려요.
   * 우측 상단(NAV_RESERVE_W)은 프레임워크 X · 더보기 버튼 자리라 절대 침범하지 않아요.
   */
  function drawHUD() {
    if (state.mode === 'title') return;
    const box = hudBox();
    const info = stageInfo(state.stage);
    const x = box.left;
    let y = box.top;

    // 스테이지
    ctx.textAlign = 'left';
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = info.c1;
    ctx.font = 'bold 13px -apple-system, "Noto Sans KR", sans-serif';
    ctx.fillText(`${info.name}  ·  STAGE ${state.stage}`, x, y + 12);
    y += 24;

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
      ctx.save();
      ctx.translate(x + 7, y + 4);
      ctx.scale(0.62, 0.62);
      // HUD용 미니 보석 (drawGem과 같은 실루엣)
      ctx.fillStyle = '#7fe6ff';
      ctx.beginPath();
      ctx.moveTo(-9, -2);
      ctx.lineTo(-5, -9);
      ctx.lineTo(5, -9);
      ctx.lineTo(9, -2);
      ctx.lineTo(0, 10);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#d5fbff';
      ctx.beginPath();
      ctx.moveTo(-9, -2);
      ctx.lineTo(-5, -9);
      ctx.lineTo(0, -9);
      ctx.lineTo(0, -2);
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

    // 붕괴 타이머는 화면 가운데 위쪽 (내비게이션 버튼과 겹치지 않는 폭)
    const pl = state.player;
    if (state.mode === 'play' && pl && pl.mode === 'orbit') {
      const p = planetById(pl.planetId);
      if (p && p.decay && p.timer > 0) {
        const ratio = clamp(p.timer / p.decay, 0, 1);
        const bw = 150;
        const cx = (box.left + Math.min(box.right, W - NAV_RESERVE_W)) / 2;
        const by = box.top + 4;
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = 'rgba(255,255,255,.15)';
        ctx.fillRect(cx - bw / 2, by, bw, 5);
        ctx.fillStyle = ratio > 0.35 ? '#ffd166' : '#ff6b6b';
        ctx.fillRect(cx - bw / 2, by, bw * ratio, 5);
        ctx.globalAlpha = 0.6;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.font = '10px -apple-system, "Noto Sans KR", sans-serif';
        ctx.fillText('불안정한 행성 — 빨리 점프!', cx, by + 20);
        ctx.globalAlpha = 1;
        ctx.textAlign = 'left';
      }
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
    const full = b.warn ? 2.8 : 2.0;
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
    // 1) 기기 화면 전체를 배경으로 채워요 (레터박스가 생겨도 빈 곳이 없게)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const info = stageInfo(state.stage);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
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
    for (const p of state.planets) drawPlanet(p);
    for (const g of state.gemItems) drawGem(g);
    drawAimGuide();
    drawRings();
    drawPlayer();
    drawParticles();
    drawPops();
    ctx.restore();

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

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (!state.paused) update(dt);
    draw();
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

    /** 최고 기록을 세이브에서 불러와 HUD에 반영해요. */
    setRecords({ best = 0, bestCombo = 0 } = {}) {
      state.best = best;
      state.bestComboEver = bestCombo;
    },

    /** 장착한 우주선 스킨을 바꿔요. 다음 프레임부터 바로 보여요. */
    setSkin(id) {
      skin = getSkin(id);
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
      window.removeEventListener('resize', resize);
    },
  };
}

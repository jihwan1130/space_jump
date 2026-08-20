/**
 * 스토리 모드 — STAGE 1 「지구 → 달」 (2.0)
 *
 * 본편(game.js)과 완전히 분리된 별도 엔진이에요. 캔버스도 루프도 따로 씁니다.
 * 출시된 본편 코드를 건드리지 않으려는 의도적인 선택이라, 두 모드는 서로를 모릅니다.
 * (공유하는 건 소리(audio.js) · 우주선 스킨(skins.js) · 좌표계(viewport.js)뿐)
 *
 * 진행
 *   1) 인트로 — 지구가 무너지는 날. 사이렌이 울리고 두 사람이 달로 향하기로 해요. (비주얼 노벨)
 *   2) 비행  — 세로 스크롤 슈팅. 지구를 등지고 달까지 올라가며 잔해·요격기를 뚫어요.
 *   3) 보스  — 달 궤도 방어 위성 「가디언-01」. 격파해야 착륙할 수 있어요.
 *   4) 착륙  — 달에 내려앉는 마무리 장면.
 *
 * 2.1부터 이 엔진은 **본편의 최종 보스전**도 같이 돌려요. (startFinalBoss)
 * 본편에서 100번째 행성에 닿으면 비행 구간 없이 보스부터 시작하고,
 * 결과는 착륙 장면 대신 본편 결과 화면으로 돌아가요. 차이는 RUNS 하나에 모아뒀어요.
 */

import { audio } from './audio.js';
import { getSkin, DEFAULT_SKIN } from './skins.js';
import { createViewport } from './viewport.js';
import { drawCharacter, drawOrbitAI, CAST, ORBIT } from './story-cast.js';
import { INTRO, BOSS_BARKS, LANDING, BANNERS, FINAL_BARKS } from './story-script.js';
import { FINAL_BOSS_HP, TOTAL_PLANETS } from './config.js';

/* ────────────────────────────── 상수 */

const W = 480;
const TAU = Math.PI * 2;

const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** 프레임 독립 감쇠 — dt가 흔들려도 따라가는 속도가 같아요. */
const approach = (cur, target, speed, dt) => cur + (target - cur) * (1 - Math.exp(-speed * dt));

/** 대사가 한 글자씩 나오는 속도(초당 글자) */
const TYPE_SPEED = 30;

/** 플레이어 */
const PLAYER_R = 12;
const PLAYER_HP = 5;
const FIRE_INTERVAL = 0.13;
const HIT_GRACE = 1.5;

/** 보스가 등장하는 시각(초). 배경의 지구→달 진행도도 이 값을 기준으로 계산해요. */
const FLIGHT_LEN = 55.5;

const BOSS_HP = 340;

/**
 * 비행 구간 타임라인.
 * `t`(초)가 되면 순서대로 하나씩 실행돼요. 난이도를 만지려면 여기 숫자만 보면 됩니다.
 */
const SCHEDULE = [
  { t: 0.4, banner: 'exit' },
  { t: 3.0, spawn: 'debris', n: 2 },
  { t: 5.5, spawn: 'debris', n: 3 },
  { t: 8.5, spawn: 'debris', n: 3 },
  { t: 11.5, banner: 'debris' },
  { t: 12.5, spawn: 'mine', n: 2 },
  { t: 15.0, spawn: 'debris', n: 4 },
  { t: 18.0, spawn: 'drone', n: 3 },
  { t: 21.5, spawn: 'debris', n: 4 },
  { t: 24.0, spawn: 'mine', n: 3 },
  { t: 26.5, banner: 'patrol' },
  { t: 27.5, spawn: 'inter', n: 5 },
  { t: 31.0, spawn: 'drone', n: 4 },
  { t: 34.5, spawn: 'inter', n: 5 },
  { t: 37.5, spawn: 'debris', n: 5 },
  { t: 40.0, spawn: 'drone', n: 3 },
  { t: 42.5, spawn: 'mine', n: 3 },
  { t: 45.0, spawn: 'inter', n: 6 },
  { t: 48.5, spawn: 'drone', n: 4 },
  { t: 52.0, banner: 'boss' },
  { t: FLIGHT_LEN, boss: true },
];

const SCORE = { debris: 10, mine: 20, inter: 25, drone: 40, boss: 1500 };

/**
 * 이 엔진이 지금 무엇을 돌리고 있는지.
 *
 *  - `story` : 스토리 모드 STAGE 1 (인트로 → 비행 → 가디언-01 → 착륙)
 *  - `final` : **본편 100행성을 통과한 사람만 오는 최종 보스전.**
 *              비행 구간 없이 보스부터 시작하고, 끝나면 본편 결과 화면으로 돌아가요.
 */
const RUNS = {
  story: {
    mode: 'story',
    bg: 'space',
    bossName: '가디언-01',
    bossHp: BOSS_HP,
    barks: BOSS_BARKS,
    banner: 'boss',
    bossOnly: false,
  },
  final: {
    mode: 'final',
    bg: 'deep',
    bossName: '가디언-00 · 오버시어',
    bossHp: FINAL_BOSS_HP,
    barks: FINAL_BARKS,
    banner: 'final',
    bossOnly: true,
  },
  /*
    튜토리얼 연습 보스.

    결과가 돌아가는 길(onFinalClear / onFinalFail)은 본편 최종 보스전과 같아요.
    받는 쪽(main.js)이 "연습이었는지"를 알아야 기록을 남기지 않으니 practice로 표시해요.

    쉽게 만드는 방법은 셋 — 체력을 3분의 1로, 방패를 두 배 가까이,
    그리고 적탄 속도를 늦춰요(easy). 패턴 자체는 그대로라 진짜 보스전과 같은 걸 배워요.
  */
  practice: {
    mode: 'final',
    bg: 'deep',
    bossName: '가디언-00 · 오버시어 (연습)',
    bossHp: Math.round(FINAL_BOSS_HP * 0.34),
    playerHp: 9,
    barks: FINAL_BARKS,
    banner: 'final',
    bossOnly: true,
    easy: true,
    practice: true,
  },
};

/* ────────────────────────────── 생성 */

/**
 * @param {object} opts
 * @param {HTMLCanvasElement} opts.canvas 본편 캔버스 위에 얹히는 전용 캔버스
 * @param {(type: string) => void} [opts.haptic]
 * @param {(result: object) => void} [opts.onClear] 스테이지를 깼을 때
 * @param {(result: object) => void} [opts.onFail] 격추당했을 때
 */
export function createStory({
  canvas,
  haptic = () => {},
  onClear = () => {},
  onFail = () => {},
  onFinalClear = () => {},
  onFinalFail = () => {},
}) {
  const ctx = canvas.getContext('2d');
  const view = createViewport(canvas);
  const H = () => view.H;

  let skin = getSkin(DEFAULT_SKIN);

  const state = {
    active: false,
    paused: false,
    /** idle | vn | flight | landing */
    phase: 'idle',
    /** 지금 돌리는 판의 성격 (RUNS 참고) */
    run: RUNS.story,
    /** 최종 보스전에서 넘겨받은 본편 점수. 화면에는 이 값을 더해서 보여줘요. */
    carry: 0,
    /** 지금 화면에 깔린 배경 */
    bg: 'earth',
    score: 0,
    /** 사이렌 연출 세기 0~1 (붉은 경광등 + 소리) */
    siren: 0,
    sirenOn: false,
    shake: 0,
    flash: 0,
    /** 화면 전체를 덮는 암전 — 장면 전환에 써요 */
    fade: 0,
    t: 0,
    stars: [],
    vn: null,
    fl: null,
    /** 착륙 장면 진행 시간 */
    landT: 0,
  };

  makeStars();

  function makeStars() {
    state.stars = [];
    for (let i = 0; i < 200; i++) {
      state.stars.push({
        x: rand(0, W),
        y: rand(0, 1200),
        z: rand(0.15, 1),
        s: rand(0.5, 1.8),
        tw: rand(0, TAU),
      });
    }
  }

  /* ────────────────────────────── 비주얼 노벨 */

  function startVN(lines, onDone) {
    state.phase = 'vn';
    state.vn = {
      lines,
      i: -1,
      shown: 0,
      hold: 0,
      /** 초상화가 옆에서 미끄러져 들어오는 연출용 */
      enter: 0,
      who: null,
      mood: 'calm',
      onDone,
    };
    nextLine();
  }

  function nextLine() {
    const vn = state.vn;
    if (!vn) return;

    // 아직 다 안 나왔으면 먼저 전부 보여줘요. (한 번 더 탭하면 다음 줄)
    const cur = vn.lines[vn.i];
    if (cur && vn.shown < cur.text.length) {
      vn.shown = cur.text.length;
      return;
    }

    vn.i++;
    if (vn.i >= vn.lines.length) {
      const done = vn.onDone;
      state.vn = null;
      done?.();
      return;
    }

    const line = vn.lines[vn.i];
    vn.shown = 0;
    vn.hold = 0;
    if (line.who !== vn.who) vn.enter = 0;
    vn.who = line.who || null;
    vn.mood = line.mood || 'calm';

    if (line.bg) {
      state.bg = line.bg;
      state.fade = 1; // 배경이 바뀔 때만 한 번 암전
    }

    switch (line.fx) {
      case 'siren-on':
        setSiren(true);
        break;
      case 'siren-off':
        setSiren(false);
        break;
      case 'shake':
        state.shake = 9;
        haptic('error');
        break;
      case 'flash':
        state.flash = 0.8;
        break;
      case 'title':
        audio.stage();
        break;
      default:
        break;
    }
  }

  function setSiren(on) {
    state.sirenOn = on;
    if (on) audio.sirenStart();
    else audio.sirenStop();
  }

  function updateVN(dt) {
    const vn = state.vn;
    if (!vn) return;
    const line = vn.lines[vn.i];
    if (!line) return;

    vn.enter = Math.min(1, vn.enter + dt * 3.6);

    if (vn.shown < line.text.length) {
      const before = Math.floor(vn.shown);
      vn.shown = Math.min(line.text.length, vn.shown + dt * TYPE_SPEED);
      // 글자가 넘어갈 때마다 아주 작게 톡. 공백에서는 소리 내지 않아요.
      if (Math.floor(vn.shown) > before && line.text[before] !== ' ') audio.blip();
    } else if (line.hold) {
      vn.hold += dt;
      if (vn.hold >= line.hold) nextLine();
    }
  }

  /* ────────────────────────────── 비행 */

  function startFlight() {
    const run = state.run;
    state.phase = 'flight';
    state.bg = run.bg;
    state.fade = 0.9;
    state.fl = {
      t: 0,
      // 보스전만 하는 판은 스폰 타임라인을 통째로 건너뛰어요.
      cue: run.bossOnly ? SCHEDULE.length : 0,
      player: {
        x: W / 2,
        y: H() * 0.76,
        tx: W / 2,
        ty: H() * 0.76,
        hp: run.playerHp || PLAYER_HP,
        inv: 1.2,
        fireT: 0,
        dead: false,
        deadT: 0,
      },
      bullets: [],
      enemies: [],
      ebullets: [],
      parts: [],
      pops: [],
      boss: null,
      bossT: 0,
      barkI: 0,
      bark: null,
      banner: null,
      drag: null,
      keys: new Set(),
    };
    audio.startBgm();

    if (run.bossOnly) {
      audio.setStage(9);
      spawnBoss();
    } else {
      showBanner('stage');
    }
  }

  function showBanner(key) {
    const b = BANNERS[key];
    if (!b || !state.fl) return;
    state.fl.banner = { ...b, t: 2.2 };
    if (b.warn) {
      audio.alert();
      haptic('error');
    } else {
      audio.stage();
    }
  }

  /* ── 적 생성 */

  function makeRock(r) {
    // 울퉁불퉁한 실루엣 — 같은 화면에 여럿 떠 있어도 복제품처럼 안 보이게
    const n = 11;
    const shape = [];
    for (let i = 0; i < n; i++) shape.push(rand(0.7, 1));
    return { shape, hue: rand(14, 36), spin: rand(-1.6, 1.6), r };
  }

  function spawn(kind, n) {
    const fl = state.fl;
    if (!fl) return;

    for (let i = 0; i < n; i++) {
      if (kind === 'debris') {
        const r = rand(17, 27);
        fl.enemies.push({
          kind,
          x: rand(40, W - 40),
          y: -40 - i * rand(60, 110),
          vx: rand(-32, 32),
          vy: rand(115, 175),
          hp: 3,
          r,
          rot: rand(0, TAU),
          look: makeRock(r),
          hurt: 0,
        });
      } else if (kind === 'mine') {
        fl.enemies.push({
          kind,
          x: rand(60, W - 60),
          y: -50 - i * 110,
          vx: 0,
          vy: rand(55, 80),
          hp: 3,
          r: 16,
          t: rand(0, TAU),
          hurt: 0,
        });
      } else if (kind === 'drone') {
        const homeY = rand(130, 260);
        fl.enemies.push({
          kind,
          x: rand(70, W - 70),
          y: -40 - i * 60,
          baseX: 0,
          vx: 0,
          vy: 130,
          homeY,
          hp: 5,
          r: 16,
          t: rand(0, TAU),
          shootT: 1.1 + i * 0.35,
          hurt: 0,
        });
      } else if (kind === 'inter') {
        // 대각선 편대로 쏟아져 내려와요. 쏘지는 않지만 빠르고 몸통으로 부딪쳐요.
        const fromLeft = Math.random() < 0.5;
        fl.enemies.push({
          kind,
          x: fromLeft ? 60 + i * 42 : W - 60 - i * 42,
          y: -40 - i * 46,
          vx: 0,
          vy: 300,
          swing: fromLeft ? 1 : -1,
          hp: 3,
          r: 14,
          t: 0,
          hurt: 0,
        });
      }
    }
  }

  function spawnBoss() {
    const fl = state.fl;
    if (!fl) return;
    const hp = state.run.bossHp;
    fl.boss = {
      x: W / 2,
      y: -190,
      hp,
      max: hp,
      t: 0,
      phase: 1,
      entering: true,
      spin: 0,
      patT: 0,
      spiralT: -1,
      spiralA: 0,
      summonT: 8,
      laser: null,
      /** 특수 패턴 사이에 끼워 넣는 부채꼴 발사 남은 횟수 */
      volley: 0,
      hurt: 0,
      dead: false,
      deadT: 0,
      r: 66,
    };
    fl.bossT = 0;
    fl.barkI = 0;
    showBanner(state.run.banner);
    audio.setStage(state.run.bossOnly ? 9 : 6);
  }

  /* ── 총알 · 파편 */

  function fire(x, y, vy, dmg = 1) {
    state.fl.bullets.push({ x, y, vy, dmg, r: 4 });
  }

  function eshot(x, y, ang, sp, r = 5.5) {
    // 연습 보스전(easy)에서는 탄이 느리게 날아와요. 패턴은 같으니 눈에 익히기 좋아요.
    if (state.run.easy) sp *= 0.6;
    state.fl.ebullets.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r });
  }

  function burst(x, y, n, color, speed = 160, life = 0.6, size = 3) {
    const fl = state.fl;
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const s = rand(speed * 0.35, speed);
      fl.parts.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life,
        max: life,
        color,
        size: rand(size * 0.55, size),
      });
    }
  }

  function pop(x, y, text, color, size = 18) {
    state.fl.pops.push({ x, y, text, color, size, life: 0.9, max: 0.9 });
  }

  /* ── 업데이트 */

  function updateFlight(dt) {
    const fl = state.fl;
    if (!fl) return;
    const p = fl.player;

    fl.t += dt;

    // 타임라인 소화 (보스가 나온 뒤에는 더 안 봐요)
    while (fl.cue < SCHEDULE.length && fl.t >= SCHEDULE[fl.cue].t) {
      const cue = SCHEDULE[fl.cue++];
      if (cue.banner) showBanner(cue.banner);
      if (cue.spawn) spawn(cue.spawn, cue.n);
      if (cue.boss) spawnBoss();
    }

    /* 플레이어 */
    if (!p.dead) {
      // 키보드(PC 확인용) — 손가락 드래그와 같이 목표점을 밀어요
      if (fl.keys.size) {
        const sp = 460 * dt;
        if (fl.keys.has('left')) p.tx -= sp;
        if (fl.keys.has('right')) p.tx += sp;
        if (fl.keys.has('up')) p.ty -= sp;
        if (fl.keys.has('down')) p.ty += sp;
      }
      p.tx = clamp(p.tx, 22, W - 22);
      p.ty = clamp(p.ty, 90, H() - 40);
      p.x = approach(p.x, p.tx, 18, dt);
      p.y = approach(p.y, p.ty, 18, dt);

      if (p.inv > 0) p.inv -= dt;

      p.fireT -= dt;
      if (p.fireT <= 0) {
        p.fireT = FIRE_INTERVAL;
        fire(p.x - 7, p.y - 14, -760);
        fire(p.x + 7, p.y - 14, -760);
        audio.laser();
      }
    } else {
      p.deadT += dt;
      if (p.deadT > 1.6) {
        finishFlight(false);
        return;
      }
    }

    /* 아군 총알 */
    for (const b of fl.bullets) {
      b.y += b.vy * dt;
    }
    fl.bullets = fl.bullets.filter((b) => b.y > -30);

    /* 적 */
    for (const e of fl.enemies) {
      e.hurt = Math.max(0, e.hurt - dt * 5);
      if (e.kind === 'debris') {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.rot += e.look.spin * dt;
        if (e.x < e.r || e.x > W - e.r) e.vx *= -1;
      } else if (e.kind === 'mine') {
        e.t += dt;
        e.y += e.vy * dt;
        e.x += Math.sin(e.t * 1.1) * 22 * dt;
      } else if (e.kind === 'drone') {
        e.t += dt;
        if (e.y < e.homeY) {
          e.y += e.vy * dt;
          e.baseX = e.x;
        } else {
          e.x = e.baseX + Math.sin(e.t * 1.3) * 95;
          e.y = e.homeY + Math.sin(e.t * 0.8) * 16;
          e.shootT -= dt;
          if (e.shootT <= 0) {
            e.shootT = rand(1.7, 2.6);
            const a = Math.atan2(p.y - e.y, p.x - e.x);
            eshot(e.x, e.y + 12, a, 235);
            audio.play(320, 0.09, 'square', 0.03, -120, 0.1, 0);
          }
        }
        e.x = clamp(e.x, 30, W - 30);
      } else if (e.kind === 'inter') {
        e.t += dt;
        e.x += Math.sin(e.t * 3.4) * 150 * dt * e.swing;
        e.y += e.vy * dt;
        e.x = clamp(e.x, 20, W - 20);
      }
    }

    /* 보스 */
    if (fl.boss) updateBoss(dt);

    /* 적 총알 */
    for (const b of fl.ebullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    fl.ebullets = fl.ebullets.filter(
      (b) => b.y > -40 && b.y < H() + 40 && b.x > -40 && b.x < W + 40
    );

    /* 충돌 — 아군 총알 → 적 */
    for (const b of fl.bullets) {
      if (b.dead) continue;
      for (const e of fl.enemies) {
        if (e.dead) continue;
        if (Math.hypot(b.x - e.x, b.y - e.y) > e.r + b.r) continue;
        b.dead = true;
        e.hp -= b.dmg;
        e.hurt = 1;
        audio.ping();
        burst(b.x, b.y, 3, '#bfe9ff', 90, 0.25, 2);
        if (e.hp <= 0) killEnemy(e);
        break;
      }
      if (b.dead) continue;

      const boss = fl.boss;
      if (boss && !boss.dead && !boss.entering) {
        if (Math.hypot(b.x - boss.x, b.y - boss.y) < boss.r) {
          b.dead = true;
          boss.hp -= b.dmg;
          boss.hurt = 1;
          audio.ping();
          burst(b.x, b.y, 3, '#ffd7a0', 100, 0.25, 2);
          if (boss.hp <= 0) killBoss();
        }
      }
    }
    fl.bullets = fl.bullets.filter((b) => !b.dead);

    /* 충돌 — 적 · 적 총알 → 플레이어 */
    if (!p.dead && p.inv <= 0) {
      for (const e of fl.enemies) {
        if (e.dead) continue;
        if (Math.hypot(p.x - e.x, p.y - e.y) < e.r + PLAYER_R) {
          hitPlayer();
          killEnemy(e, false);
          break;
        }
      }
    }
    if (!p.dead && p.inv <= 0) {
      for (const b of fl.ebullets) {
        if (Math.hypot(p.x - b.x, p.y - b.y) < b.r + PLAYER_R) {
          b.dead = true;
          hitPlayer();
          break;
        }
      }
      fl.ebullets = fl.ebullets.filter((b) => !b.dead);
    }
    // 부딪쳐 사라진 적을 여기서 걷어내요. (충돌 판정이 끝난 뒤라 한 프레임 더 살아 있지 않아요)
    fl.enemies = fl.enemies.filter((e) => !e.dead && e.y < H() + 80);

    // 보스 레이저는 세로 기둥이라 따로 봐요
    const laser = fl.boss?.laser;
    if (!p.dead && p.inv <= 0 && laser && laser.state === 'fire') {
      if (Math.abs(p.x - laser.x) < 26 + PLAYER_R && p.y > fl.boss.y) hitPlayer();
    }

    /* 파편 · 점수 표시 */
    for (const q of fl.parts) {
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vx *= 1 - dt * 1.6;
      q.vy *= 1 - dt * 1.6;
      q.life -= dt;
    }
    fl.parts = fl.parts.filter((q) => q.life > 0);

    for (const q of fl.pops) {
      q.y -= 34 * dt;
      q.life -= dt;
    }
    fl.pops = fl.pops.filter((q) => q.life > 0);

    if (fl.banner) {
      fl.banner.t -= dt;
      if (fl.banner.t <= 0) fl.banner = null;
    }
    if (fl.bark) {
      fl.bark.t -= dt;
      if (fl.bark.t <= 0) fl.bark = null;
    }
  }

  function killEnemy(e, credit = true) {
    if (e.dead) return;
    e.dead = true;

    const color = e.kind === 'debris' ? '#c79a6a' : e.kind === 'mine' ? '#ff9f6b' : '#8fd6ff';
    burst(e.x, e.y, e.kind === 'debris' ? 14 : 12, color, 190, 0.6, 3.4);
    audio.boom(e.kind === 'debris' ? 0.7 : 0.85);
    haptic('tap');

    // 기뢰는 터지면서 사방으로 파편탄을 뿌려요. (그냥 부수면 손해)
    if (e.kind === 'mine') {
      for (let i = 0; i < 8; i++) eshot(e.x, e.y, (i / 8) * TAU + rand(-0.1, 0.1), 175, 5);
    }

    if (credit) {
      const gain = SCORE[e.kind] || 10;
      state.score += gain;
      pop(e.x, e.y, `+${gain}`, '#ffd166', 16);
    }
  }

  function hitPlayer() {
    const fl = state.fl;
    const p = fl.player;
    if (p.dead || p.inv > 0) return;

    p.hp--;
    p.inv = HIT_GRACE;
    state.shake = 14;
    state.flash = 0.55;
    audio.hurt();
    haptic('error');
    burst(p.x, p.y, 16, '#ff7a8a', 200, 0.55, 3.2);

    // 맞은 순간 주변 탄을 걷어내요. 연달아 맞아서 순식간에 끝나는 걸 막아요.
    fl.ebullets = fl.ebullets.filter((b) => Math.hypot(b.x - p.x, b.y - p.y) > 150);

    if (p.hp <= 0) {
      p.dead = true;
      p.deadT = 0;
      state.shake = 22;
      audio.boom(1.5);
      audio.die();
      burst(p.x, p.y, 40, '#ffb36b', 300, 1.1, 4.4);
      haptic('error');
    }
  }

  /* ── 보스 */

  function updateBoss(dt) {
    const fl = state.fl;
    const b = fl.boss;
    const p = fl.player;

    b.t += dt;
    b.spin += dt * 0.55;
    b.hurt = Math.max(0, b.hurt - dt * 4);
    fl.bossT += dt;

    if (b.dead) {
      b.deadT += dt;
      // 2.6초 동안 여기저기 터지다가 마지막에 크게 한 번
      if (Math.random() < dt * 9) {
        const a = rand(0, TAU);
        const d = rand(0, b.r);
        burst(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d, 8, '#ffd08a', 200, 0.6, 4);
        audio.boom(1);
        state.shake = Math.max(state.shake, 8);
      }
      if (b.deadT > 2.6) finishFlight(true);
      return;
    }

    // 등장 — 위에서 내려와 자리를 잡아요
    if (b.entering) {
      b.y = approach(b.y, 200, 2.2, dt);
      if (b.y > 194) {
        b.entering = false;
        b.patT = 1.2;
      }
    } else {
      // 좌우로 천천히 왕복. 체력이 깎일수록 빨라져요.
      const speed = 0.5 + (1 - b.hp / b.max) * 0.55;
      b.x = W / 2 + Math.sin(b.t * speed) * 128;
      b.y = 200 + Math.sin(b.t * 0.8) * 16;
    }

    // 대사 — 싸움을 멈추지 않고 화면 위에 잠깐 떠요
    const barks = state.run.barks;
    while (fl.barkI < barks.length && fl.bossT >= barks[fl.barkI].at) {
      const line = barks[fl.barkI++];
      fl.bark = { ...line, t: 3.0 };
    }

    if (b.entering) return;

    const ratio = b.hp / b.max;
    const nextPhase = ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
    if (nextPhase !== b.phase) {
      b.phase = nextPhase;
      b.patT = 0.9;
      b.spiralT = 0;
      b.volley = 0;
      b.laser = null;
      state.flash = 0.35;
      audio.alert();
      haptic('error');
      burst(b.x, b.y, 26, '#ff8f6b', 240, 0.8, 4);
    }

    b.patT -= dt;

    if (b.phase === 1) {
      // 부채꼴 산탄
      if (b.patT <= 0) {
        b.patT = 1.7;
        spread(b, 7, 0.62, 215);
      }
    } else if (b.phase === 2) {
      /*
        나선탄(3초) → 부채꼴 2번 → 다시 나선. 그 사이 요격기를 계속 불러요.
        `spiralT`가 남아 있으면 나선 중, 아니면 `volley`가 남은 만큼 부채꼴을 쏴요.
      */
      if (b.spiralT > 0) {
        b.spiralT -= dt;
        if (b.patT <= 0) {
          b.patT = 0.11;
          b.spiralA += 0.42;
          for (let arm = 0; arm < 2; arm++) {
            eshot(b.x, b.y + 20, b.spiralA + arm * Math.PI, 175);
          }
        }
        if (b.spiralT <= 0) b.patT = 1.6; // 나선이 끝나면 한 박자 쉬어요
      } else if (b.patT <= 0) {
        if (b.volley > 0) {
          b.volley--;
          b.patT = 1.5;
          spread(b, 5, 0.5, 205);
        } else {
          b.volley = 2;
          b.spiralT = 3.0;
          b.spiralA = rand(0, TAU);
          b.patT = 0;
        }
      }
      b.summonT -= dt;
      if (b.summonT <= 0) {
        b.summonT = 7.5;
        spawn('inter', 3);
      }
    } else {
      // 조준 레이저 ↔ 촘촘한 부채꼴 2번을 번갈아 써요
      if (b.laser) {
        b.laser.t -= dt;
        if (b.laser.t <= 0) {
          if (b.laser.state === 'aim') {
            // 예고선이 있던 자리에 그대로 쏴요. 예고 뒤에 피할 시간을 주는 게 핵심이에요.
            b.laser = { state: 'fire', t: 0.85, x: b.laser.x };
            audio.boom(1.2);
            state.shake = 12;
          } else {
            b.laser = null;
            b.patT = 1.1;
          }
        }
      } else if (b.patT <= 0) {
        if (b.volley > 0) {
          b.volley--;
          b.patT = 1.3;
          spread(b, 9, 0.75, 225);
        } else {
          b.volley = 2;
          b.laser = { state: 'aim', t: 1.05, x: p.x };
          audio.charge(1.05);
          haptic('tap');
        }
      }
      b.summonT -= dt;
      if (b.summonT <= 0) {
        b.summonT = 9;
        spawn('drone', 2);
      }
    }
  }

  /** 플레이어 쪽을 향한 부채꼴 산탄 */
  function spread(b, n, arc, sp) {
    const p = state.fl.player;
    const base = Math.atan2(p.y - b.y, p.x - b.x);
    for (let i = 0; i < n; i++) {
      const a = base + (i / (n - 1) - 0.5) * arc;
      eshot(b.x, b.y + 26, a, sp);
    }
    audio.play(180, 0.12, 'square', 0.04, -60, 0.2, 0);
  }

  function killBoss() {
    const b = state.fl.boss;
    if (b.dead) return;
    b.dead = true;
    b.deadT = 0;
    b.hp = 0;
    state.score += SCORE.boss;
    state.shake = 24;
    state.flash = 0.7;
    state.fl.ebullets.length = 0;
    audio.boom(1.7);
    haptic('confetti');
    burst(b.x, b.y, 48, '#fff0c0', 300, 1.2, 5);
    pop(b.x, b.y - 30, `+${SCORE.boss}`, '#ffd166', 24);
  }

  /* ── 비행 종료 */

  function finishFlight(cleared) {
    if (state.phase !== 'flight') return;
    audio.stopBgm();

    // 최종 보스전 — 착륙 장면 없이 본편 결과 화면으로 바로 돌아가요.
    if (state.run.mode === 'final') {
      state.phase = 'idle';
      const result = {
        cleared,
        /** 보스전에서 번 점수 */
        bossScore: state.score,
        /** 본편 + 보스전 = 이 판의 총점 */
        score: state.carry + state.score,
      };
      state.fl = null;
      if (cleared) audio.reward();
      (cleared ? onFinalClear : onFinalFail)(result);
      return;
    }

    if (!cleared) {
      state.phase = 'idle';
      const result = { score: state.score, cleared: false };
      state.fl = null;
      onFail(result);
      return;
    }

    // 격파 → 착륙 장면으로. 착륙선이 내려오는 연출은 landT가 굴려요.
    state.landT = 0;
    state.bg = 'moon';
    state.fade = 1;
    state.fl = null;
    startVN(LANDING, () => {
      state.phase = 'idle';
      audio.reward();
      onClear({ score: state.score, cleared: true });
    });
  }

  /* ────────────────────────────── 그리기 — 배경 */

  function drawStars(dt, speed) {
    const h = H();
    ctx.save();
    for (const s of state.stars) {
      s.y += speed * s.z * dt;
      if (s.y > h + 20) {
        s.y = -20;
        s.x = rand(0, W);
      }
      const tw = 0.55 + Math.sin(state.t * 2.2 + s.tw) * 0.32;
      ctx.globalAlpha = tw * (0.35 + s.z * 0.65);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(s.x, s.y, s.s, s.s + (speed > 60 ? s.z * 3 : 0));
    }
    ctx.restore();
  }

  /** 지구 — 진행도가 오를수록 작아지며 화면 아래로 멀어져요. */
  function drawEarth(ctx2, cx, cy, r, burning) {
    ctx2.save();

    // 대기 산란
    const glow = ctx2.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.28);
    glow.addColorStop(0, burning ? 'rgba(255,140,90,0.42)' : 'rgba(95,175,255,0.32)');
    glow.addColorStop(1, 'rgba(95,175,255,0)');
    ctx2.fillStyle = glow;
    ctx2.beginPath();
    ctx2.arc(cx, cy, r * 1.28, 0, TAU);
    ctx2.fill();

    // 바다
    ctx2.beginPath();
    ctx2.arc(cx, cy, r, 0, TAU);
    const sea = ctx2.createLinearGradient(cx - r, cy - r, cx + r * 0.6, cy + r);
    sea.addColorStop(0, '#2e6fb8');
    sea.addColorStop(0.55, '#14406f');
    sea.addColorStop(1, '#05132a');
    ctx2.fillStyle = sea;
    ctx2.fill();

    // 대륙 — 정해진 덩어리라 매번 같은 지구처럼 보여요
    ctx2.save();
    ctx2.clip();
    ctx2.fillStyle = burning ? '#5c6b3a' : '#2f7a4a';
    const lands = [
      [-0.42, -0.34, 0.3, 0.19],
      [-0.1, -0.05, 0.36, 0.27],
      [0.3, -0.45, 0.26, 0.16],
      [0.12, 0.42, 0.3, 0.2],
      [-0.5, 0.34, 0.22, 0.15],
    ];
    for (const [lx, ly, lw, lh] of lands) {
      ctx2.beginPath();
      ctx2.ellipse(cx + lx * r, cy + ly * r, lw * r, lh * r, lx * 1.4, 0, TAU);
      ctx2.fill();
    }

    // 타들어 가는 대기 — 스토리의 "지구가 끝나는 중"을 배경으로 말해줘요
    if (burning) {
      const fire = ctx2.createLinearGradient(cx, cy - r, cx, cy + r);
      fire.addColorStop(0, 'rgba(255,90,40,0.34)');
      fire.addColorStop(0.5, 'rgba(255,150,60,0.1)');
      fire.addColorStop(1, 'rgba(255,60,30,0.3)');
      ctx2.fillStyle = fire;
      ctx2.fillRect(cx - r, cy - r, r * 2, r * 2);
    }

    // 밤 쪽 그림자
    const night = ctx2.createLinearGradient(cx - r * 0.2, cy - r, cx + r, cy + r * 0.6);
    night.addColorStop(0, 'rgba(0,0,0,0)');
    night.addColorStop(0.55, 'rgba(2,4,12,0.55)');
    night.addColorStop(1, 'rgba(2,4,12,0.92)');
    ctx2.fillStyle = night;
    ctx2.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx2.restore();

    // 가장자리 빛
    ctx2.beginPath();
    ctx2.arc(cx, cy, r, 0, TAU);
    ctx2.strokeStyle = burning ? 'rgba(255,170,120,0.75)' : 'rgba(150,215,255,0.6)';
    ctx2.lineWidth = Math.max(1.2, r * 0.012);
    ctx2.stroke();

    ctx2.restore();
  }

  /** 달 — 진행도가 오를수록 위에서 커져요. */
  function drawMoon(ctx2, cx, cy, r) {
    ctx2.save();
    const glow = ctx2.createRadialGradient(cx, cy, r * 0.92, cx, cy, r * 1.2);
    glow.addColorStop(0, 'rgba(220,225,240,0.18)');
    glow.addColorStop(1, 'rgba(220,225,240,0)');
    ctx2.fillStyle = glow;
    ctx2.beginPath();
    ctx2.arc(cx, cy, r * 1.2, 0, TAU);
    ctx2.fill();

    ctx2.beginPath();
    ctx2.arc(cx, cy, r, 0, TAU);
    const g = ctx2.createLinearGradient(cx - r * 0.6, cy - r, cx + r * 0.7, cy + r);
    g.addColorStop(0, '#e7e9f0');
    g.addColorStop(0.6, '#a9adbd');
    g.addColorStop(1, '#4b4f61');
    ctx2.fillStyle = g;
    ctx2.fill();

    ctx2.save();
    ctx2.clip();
    // 크레이터 — 위치를 고정값으로 둬서 프레임마다 흔들리지 않아요
    const craters = [
      [-0.36, -0.3, 0.16],
      [0.18, -0.44, 0.1],
      [0.34, 0.06, 0.19],
      [-0.14, 0.24, 0.13],
      [-0.5, 0.2, 0.08],
      [0.06, -0.08, 0.07],
      [0.44, 0.42, 0.11],
      [-0.24, 0.52, 0.09],
    ];
    for (const [lx, ly, lr] of craters) {
      const x = cx + lx * r;
      const y = cy + ly * r;
      ctx2.beginPath();
      ctx2.arc(x, y, lr * r, 0, TAU);
      ctx2.fillStyle = 'rgba(70,74,92,0.5)';
      ctx2.fill();
      ctx2.beginPath();
      ctx2.arc(x - lr * r * 0.18, y - lr * r * 0.18, lr * r * 0.82, 0, TAU);
      ctx2.fillStyle = 'rgba(215,220,235,0.22)';
      ctx2.fill();
    }
    const night = ctx2.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    night.addColorStop(0, 'rgba(0,0,0,0)');
    night.addColorStop(0.7, 'rgba(4,6,16,0.5)');
    night.addColorStop(1, 'rgba(4,6,16,0.9)');
    ctx2.fillStyle = night;
    ctx2.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx2.restore();
    ctx2.restore();
  }

  /**
   * 장면 배경.
   * - 'earth'   : 지구가 화면을 채우는 인트로
   * - 'cockpit' : 조종석 안. 창밖으로 지구가 보여요
   * - 'space'   : 비행 구간 (진행도에 따라 지구 ↘ 달 ↗)
   * - 'moon'    : 달 표면 착륙
   */
  function drawBackground(dt) {
    const h = H();

    // 우주 바탕
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#04050d');
    sky.addColorStop(0.6, '#060917');
    sky.addColorStop(1, state.bg === 'moon' ? '#0b0d18' : '#0a0f22');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, h);

    if (state.bg === 'earth') {
      drawStars(dt, 6);
      drawEarth(ctx, W / 2, h * 0.72, h * 0.52, true);
    } else if (state.bg === 'cockpit') {
      drawStars(dt, 8);
      drawEarth(ctx, W * 0.72, h * 0.3, h * 0.24, true);
      drawCockpit(h);
    } else if (state.bg === 'space') {
      const prog = clamp((state.fl?.t ?? 0) / FLIGHT_LEN, 0, 1);
      drawStars(dt, 90 + prog * 60);

      // 지구는 뒤로 멀어져요
      const e = Math.pow(prog, 0.55);
      const er = lerp(620, 34, e);
      const ey = lerp(h + 250, h - 46, e);
      if (er > 8) drawEarth(ctx, W / 2, ey, er, prog < 0.5);

      // 달은 0.42부터 위에서 커져요
      if (prog > 0.42) {
        const m = (prog - 0.42) / 0.58;
        drawMoon(ctx, W / 2, lerp(-170, -105, m), lerp(28, 330, Math.pow(m, 0.8)));
      }
    } else if (state.bg === 'deep') {
      // 최종 보스전 — 태양계 끝, 「관문」 앞
      drawStars(dt, 170);
      drawGate(h);
    } else if (state.bg === 'moon') {
      drawStars(dt, 4);
      drawMoonSurface(h);
    }
  }

  /**
   * 「관문」 — 본편 100번째 행성. 화면 위쪽에 거대하게 걸려 있어요.
   *
   * 본편(game.js)의 마지막 스테이지 색(금빛 고리 + 보랏빛 본체)을 그대로 가져와서,
   * 방금까지 궤도를 돌던 그 행성 앞에서 싸운다는 게 읽히게 했어요.
   */
  function drawGate(h) {
    const cx = W / 2;
    const cy = -h * 0.2;
    const r = h * 0.42;
    const t = state.t;

    ctx.save();

    // 헤일로
    const halo = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 2.1);
    halo.addColorStop(0, 'rgba(255,217,143,.16)');
    halo.addColorStop(1, 'rgba(255,217,143,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 2.1, 0, TAU);
    ctx.fill();

    // 본체
    const body = ctx.createRadialGradient(cx - r * 0.3, cy + r * 0.1, r * 0.1, cx, cy, r);
    // HUD(점수 · 보스 체력)가 이 위에 얹히니 너무 밝으면 안 돼요.
    body.addColorStop(0, '#553087');
    body.addColorStop(0.6, '#2c1750');
    body.addColorStop(1, '#100a20');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();

    // 고리 — 아주 천천히 기울어지며 돌아요
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.28 + Math.sin(t * 0.14) * 0.03);
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(255,${222 - i * 18},${160 - i * 30},${0.5 - i * 0.13})`;
      ctx.lineWidth = 3 - i * 0.7;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * (1.55 + i * 0.12), r * (0.4 + i * 0.03), 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();

    // 관문의 빛 — 아래쪽 가장자리가 숨 쉬듯 밝아져요
    ctx.globalAlpha = 0.5 + Math.sin(t * 1.1) * 0.16;
    ctx.strokeStyle = '#ffe6a8';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.995, 0.18 * Math.PI, 0.82 * Math.PI);
    ctx.stroke();

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** 조종석 — 창틀과 계기 불빛만으로 "안에 있다"를 만들어요. */
  function drawCockpit(h) {
    ctx.save();

    // 창 바깥 어둠 (창틀)
    ctx.fillStyle = '#0a0c16';
    ctx.beginPath();
    ctx.rect(0, 0, W, h);
    ctx.moveTo(46, h * 0.1);
    ctx.lineTo(W - 46, h * 0.1);
    ctx.quadraticCurveTo(W - 22, h * 0.34, W - 46, h * 0.58);
    ctx.lineTo(46, h * 0.58);
    ctx.quadraticCurveTo(22, h * 0.34, 46, h * 0.1);
    ctx.closePath();
    ctx.fill('evenodd');

    // 창틀 테두리
    ctx.beginPath();
    ctx.moveTo(46, h * 0.1);
    ctx.lineTo(W - 46, h * 0.1);
    ctx.quadraticCurveTo(W - 22, h * 0.34, W - 46, h * 0.58);
    ctx.lineTo(46, h * 0.58);
    ctx.quadraticCurveTo(22, h * 0.34, 46, h * 0.1);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(120,160,220,0.35)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // 계기판 — 아래쪽에서 올라오는 불빛
    const panel = ctx.createLinearGradient(0, h * 0.58, 0, h);
    panel.addColorStop(0, '#141a2c');
    panel.addColorStop(1, '#070a14');
    ctx.fillStyle = panel;
    ctx.fillRect(0, h * 0.58, W, h * 0.42);

    for (let i = 0; i < 14; i++) {
      const x = 34 + (i % 7) * 66;
      const y = h * 0.63 + Math.floor(i / 7) * 26;
      const on = Math.sin(state.t * 2.6 + i * 1.3) > (state.sirenOn ? -0.2 : 0.4);
      ctx.fillStyle = on
        ? state.sirenOn
          ? 'rgba(255,90,90,0.85)'
          : 'rgba(95,208,255,0.7)'
        : 'rgba(255,255,255,0.12)';
      ctx.fillRect(x, y, 26, 5);
    }
    ctx.restore();
  }

  /** 달 표면 — 착륙 장면. 착륙선이 내려와 먼지를 일으켜요. */
  function drawMoonSurface(h) {
    const groundY = h * 0.72;

    // 지평선 뒤로 지구가 떠 있어요 (달에서 본 지구)
    drawEarth(ctx, W * 0.76, groundY - 190, 62, true);

    ctx.save();
    // 지면
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, groundY + 26);
    for (let x = 0; x <= W; x += 24) {
      ctx.lineTo(x, groundY + Math.sin(x * 0.021) * 13 + Math.sin(x * 0.007) * 9);
    }
    ctx.lineTo(W, h);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, groundY - 30, 0, h);
    g.addColorStop(0, '#9ba0b2');
    g.addColorStop(0.35, '#5e6376');
    g.addColorStop(1, '#1a1d2b');
    ctx.fillStyle = g;
    ctx.fill();

    // 크레이터 그림자
    ctx.fillStyle = 'rgba(20,22,34,0.4)';
    for (const [x, y, r] of [
      [88, groundY + 70, 44],
      [318, groundY + 46, 30],
      [232, groundY + 128, 58],
      [408, groundY + 108, 36],
    ]) {
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.36, 0, 0, TAU);
      ctx.fill();
    }

    // 착륙선 — 3초에 걸쳐 내려와요
    const land = clamp(state.landT / 3.2, 0, 1);
    const shipY = lerp(groundY - 330, groundY - 26, Math.pow(land, 0.7));
    ctx.save();
    ctx.translate(W * 0.34, shipY);
    ctx.scale(1.5, 1.5);
    ctx.rotate(-Math.PI / 2);
    if (land < 1) {
      // 역추진 불꽃
      const fl = 12 + Math.sin(state.t * 22) * 4;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const fg = ctx.createLinearGradient(-12, 0, -13 - fl, 0);
      fg.addColorStop(0, skin.flame.core);
      fg.addColorStop(0.35, skin.flame.mid);
      fg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(-11, 4.6);
      ctx.quadraticCurveTo(-13 - fl * 0.5, 2.3, -13 - fl, 0);
      ctx.quadraticCurveTo(-13 - fl * 0.5, -2.3, -11, -4.6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    skin.draw(ctx, state.t, land < 1);
    ctx.restore();

    // 착륙하면서 일어나는 먼지
    if (land > 0.55) {
      const d = (land - 0.55) / 0.45;
      ctx.globalAlpha = 0.4 * (1 - Math.max(0, land - 0.95) * 20);
      ctx.fillStyle = '#c9cddb';
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI + Math.PI;
        ctx.beginPath();
        ctx.ellipse(
          W * 0.34 + Math.cos(a) * 70 * d,
          groundY - 4 + Math.sin(a) * 8,
          22 * d,
          9 * d,
          0,
          0,
          TAU
        );
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  /* ────────────────────────────── 그리기 — 비행 */

  function drawShip(p) {
    ctx.save();
    ctx.translate(p.x, p.y);

    // 피격 무적 — 깜빡이고 보호막 링이 돌아요
    if (p.inv > 0) {
      ctx.globalAlpha = 0.4 + Math.abs(Math.sin(p.inv * 22)) * 0.6;
      ctx.save();
      ctx.rotate(state.t * 2.4);
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, TAU);
      ctx.strokeStyle = 'rgba(125,255,176,0.7)';
      ctx.lineWidth = 2;
      ctx.setLineDash([9, 7]);
      ctx.stroke();
      ctx.restore();
    }

    ctx.rotate(-Math.PI / 2); // 기수를 위로

    // 엔진 불꽃
    const fl = 13 + Math.sin(state.t * 26) * 3.5;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const fg = ctx.createLinearGradient(-12, 0, -13 - fl, 0);
    fg.addColorStop(0, skin.flame.core);
    fg.addColorStop(0.35, skin.flame.mid);
    fg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(-11, 4.6);
    ctx.quadraticCurveTo(-13 - fl * 0.5, 2.3, -13 - fl, 0);
    ctx.quadraticCurveTo(-13 - fl * 0.5, -2.3, -11, -4.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    skin.draw(ctx, state.t, true);
    ctx.restore();
  }

  function drawEnemy(e) {
    ctx.save();
    ctx.translate(e.x, e.y);

    if (e.kind === 'debris') {
      ctx.rotate(e.rot);
      const n = e.look.shape.length;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const r = e.r * e.look.shape[i];
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      const g = ctx.createLinearGradient(-e.r, -e.r, e.r, e.r);
      g.addColorStop(0, `hsl(${e.look.hue},22%,44%)`);
      g.addColorStop(1, `hsl(${e.look.hue},26%,17%)`);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (e.kind === 'mine') {
      // 기뢰 — 가시가 돋은 구체. 붉게 맥동해서 "건드리면 터진다"를 알려요
      const pulse = 0.6 + Math.abs(Math.sin(e.t * 3.4)) * 0.4;
      ctx.rotate(e.t * 0.7);
      ctx.strokeStyle = `rgba(255,140,90,${pulse})`;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 10, Math.sin(a) * 10);
        ctx.lineTo(Math.cos(a) * 20, Math.sin(a) * 20);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, TAU);
      ctx.fillStyle = '#3a2230';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, TAU);
      ctx.fillStyle = `rgba(255,110,80,${pulse})`;
      ctx.shadowColor = '#ff6e50';
      ctx.shadowBlur = 14;
      ctx.fill();
    } else if (e.kind === 'drone') {
      // 무인 정찰기 — 아래를 보는 눈 하나
      ctx.beginPath();
      ctx.moveTo(0, 16);
      ctx.lineTo(-17, -4);
      ctx.lineTo(-8, -13);
      ctx.lineTo(8, -13);
      ctx.lineTo(17, -4);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, -13, 0, 16);
      g.addColorStop(0, '#3b4a6b');
      g.addColorStop(1, '#141a2b');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(150,200,255,0.45)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 2, 5.5, 0, TAU);
      ctx.fillStyle = '#ff5c7a';
      ctx.shadowColor = '#ff5c7a';
      ctx.shadowBlur = 12;
      ctx.fill();
    } else if (e.kind === 'inter') {
      // 요격기 — 화살촉
      ctx.beginPath();
      ctx.moveTo(0, 15);
      ctx.lineTo(-13, -9);
      ctx.lineTo(0, -3);
      ctx.lineTo(13, -9);
      ctx.closePath();
      ctx.fillStyle = '#d94f6a';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,190,200,0.6)';
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -6, 3, 0, TAU);
      ctx.fillStyle = '#ffe08a';
      ctx.fill();
    }

    // 맞은 순간 하얗게
    if (e.hurt > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = e.hurt * 0.55;
      ctx.beginPath();
      ctx.arc(0, 0, e.r, 0, TAU);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBoss(b) {
    ctx.save();
    ctx.translate(b.x, b.y);

    const ratio = b.hp / b.max;
    const accent = b.phase === 3 ? '#ff5c6e' : b.phase === 2 ? '#ff9f5c' : '#ffd166';

    // 조준 레이저 예고선 / 발사
    if (b.laser) {
      const lx = b.laser.x - b.x;
      ctx.save();
      if (b.laser.state === 'aim') {
        ctx.globalAlpha = 0.35 + Math.abs(Math.sin(state.t * 20)) * 0.4;
        ctx.strokeStyle = '#ff5c6e';
        ctx.lineWidth = 3;
        ctx.setLineDash([12, 10]);
        ctx.beginPath();
        ctx.moveTo(lx, 0);
        ctx.lineTo(lx, H());
        ctx.stroke();
      } else {
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createLinearGradient(lx - 30, 0, lx + 30, 0);
        g.addColorStop(0, 'rgba(255,60,90,0)');
        g.addColorStop(0.5, 'rgba(255,150,180,0.95)');
        g.addColorStop(1, 'rgba(255,60,90,0)');
        ctx.fillStyle = g;
        ctx.fillRect(lx - 30, 0, 60, H());
      }
      ctx.restore();
    }

    // 회전 링 두 겹
    for (let i = 0; i < 2; i++) {
      ctx.save();
      ctx.rotate(b.spin * (i ? -0.7 : 1));
      ctx.beginPath();
      ctx.ellipse(0, 0, 96 - i * 16, 30 - i * 6, 0, 0, TAU);
      ctx.strokeStyle = i ? 'rgba(150,180,230,0.35)' : `rgba(255,255,255,0.28)`;
      ctx.lineWidth = i ? 3 : 5;
      ctx.stroke();
      ctx.restore();
    }

    // 측면 포드
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(s * 74, 6);
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
      ctx.shadowColor = accent;
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.restore();
    }

    // 육각 본체
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + Math.PI / 6;
      const x = Math.cos(a) * 62;
      const y = Math.sin(a) * 62;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
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

    // 장갑 판 이음선
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 58, Math.sin(a) * 58);
      ctx.lineTo(-Math.cos(a) * 58, -Math.sin(a) * 58);
      ctx.stroke();
    }

    // 중앙 눈 — 체력이 깎일수록 붉고 빠르게 뛰어요
    const beat = 1 + Math.sin(state.t * (4 + (1 - ratio) * 8)) * 0.1;
    ctx.beginPath();
    ctx.arc(0, 0, 26 * beat, 0, TAU);
    const eye = ctx.createRadialGradient(0, 0, 2, 0, 0, 26 * beat);
    eye.addColorStop(0, '#ffffff');
    eye.addColorStop(0.4, accent);
    eye.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = eye;
    ctx.fill();

    // 손상 — 체력이 낮으면 불꽃이 튀어요
    if (ratio < 0.4 && Math.random() < 0.3) {
      const a = rand(0, TAU);
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 50, Math.sin(a) * 50, rand(2, 5), 0, TAU);
      ctx.fillStyle = '#ffcf7a';
      ctx.fill();
    }

    if (b.hurt > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = b.hurt * 0.4;
      ctx.beginPath();
      ctx.arc(0, 0, 66, 0, TAU);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }

    ctx.restore();
  }

  function drawFlight() {
    const fl = state.fl;
    if (!fl) return;
    const h = H();

    for (const e of fl.enemies) drawEnemy(e);
    if (fl.boss) drawBoss(fl.boss);

    // 아군 총알
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of fl.bullets) {
      const g = ctx.createLinearGradient(b.x, b.y - 12, b.x, b.y + 8);
      g.addColorStop(0, 'rgba(150,240,255,0)');
      g.addColorStop(0.5, '#9fe8ff');
      g.addColorStop(1, 'rgba(150,240,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(b.x - 2, b.y - 12, 4, 20);
    }
    ctx.restore();

    // 적 총알
    for (const b of fl.ebullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      const g = ctx.createRadialGradient(b.x, b.y, 1, b.x, b.y, b.r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.45, '#ff7aa0');
      g.addColorStop(1, 'rgba(255,60,110,0.15)');
      ctx.fillStyle = g;
      ctx.fill();
    }

    if (!fl.player.dead) drawShip(fl.player);

    // 파편
    for (const q of fl.parts) {
      ctx.globalAlpha = clamp(q.life / q.max, 0, 1);
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
    ctx.globalAlpha = 1;

    // 점수 표시
    for (const q of fl.pops) {
      const k = clamp(q.life / q.max, 0, 1);
      ctx.globalAlpha = k;
      ctx.font = `700 ${q.size}px -apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = q.color;
      ctx.fillText(q.text, q.x, q.y);
    }
    ctx.globalAlpha = 1;

    drawFlightHUD(h);
  }

  /* ────────────────────────────── 그리기 — HUD */

  function drawFlightHUD(h) {
    const fl = state.fl;
    const box = view.hudBox();

    ctx.save();
    ctx.textBaseline = 'middle';

    // 방패 (남은 기회) — 연습 보스전은 개수가 더 많아서 간격을 좁혀요.
    const hpMax = state.run.playerHp || PLAYER_HP;
    const gap = hpMax > 6 ? 17 : 24;
    for (let i = 0; i < hpMax; i++) {
      const x = box.left + 11 + i * gap;
      const y = box.top + 14;
      const on = i < fl.player.hp;
      ctx.beginPath();
      ctx.moveTo(x, y - 10);
      ctx.lineTo(x + 9, y - 5);
      ctx.lineTo(x + 9, y + 3);
      ctx.quadraticCurveTo(x + 9, y + 9, x, y + 12);
      ctx.quadraticCurveTo(x - 9, y + 9, x - 9, y + 3);
      ctx.lineTo(x - 9, y - 5);
      ctx.closePath();
      ctx.fillStyle = on ? 'rgba(95,208,255,0.9)' : 'rgba(255,255,255,0.12)';
      ctx.fill();
      if (on) {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // 점수 — 최종 보스전에서는 본편에서 들고 온 점수까지 합쳐서 보여줘요.
    ctx.textAlign = 'right';
    ctx.font = '700 22px -apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillText(String(state.carry + state.score), box.right, box.top + 14);

    if (state.run.mode === 'final') {
      ctx.font = '600 10px -apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillText(`행성 ${TOTAL_PLANETS} / ${TOTAL_PLANETS} · 최종 관문`, box.right, box.top + 31);
    }

    // 지구 → 달 진행 막대 (오른쪽 가장자리, 세로)
    if (!fl.boss) {
      const prog = clamp(fl.t / FLIGHT_LEN, 0, 1);
      const x = box.right - 4;
      const y0 = box.top + 48;
      const y1 = Math.min(box.bottom - 120, y0 + 210);
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.stroke();

      // 위=달, 아래=지구
      ctx.beginPath();
      ctx.arc(x, y0, 5, 0, TAU);
      ctx.fillStyle = 'rgba(230,232,242,0.85)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y1, 5, 0, TAU);
      ctx.fillStyle = 'rgba(95,175,255,0.85)';
      ctx.fill();

      // 지금 위치
      const my = lerp(y1, y0, prog);
      ctx.beginPath();
      ctx.moveTo(x - 9, my + 5);
      ctx.lineTo(x, my - 6);
      ctx.lineTo(x + 9, my + 5);
      ctx.closePath();
      ctx.fillStyle = '#5FD0FF';
      ctx.shadowColor = '#5FD0FF';
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // 보스 체력 막대
    const b = fl.boss;
    if (b && !b.entering) {
      const y = box.top + (state.run.mode === 'final' ? 56 : 44);
      const x0 = box.left;
      const w = box.right - box.left;
      ctx.font = '700 12px -apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(state.run.bossName, x0, y - 10);
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillText(`PHASE ${b.phase}`, box.right, y - 10);

      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x0, y, w, 7);
      const ratio = clamp(b.hp / b.max, 0, 1);
      const g = ctx.createLinearGradient(x0, 0, x0 + w, 0);
      g.addColorStop(0, '#ff5c6e');
      g.addColorStop(1, '#ffd166');
      ctx.fillStyle = g;
      ctx.fillRect(x0, y, w * ratio, 7);
    }

    ctx.restore();

    // 표지 · 대사
    if (fl.banner) drawBanner(fl.banner, h);
    if (fl.bark) drawBark(fl.bark, h, box);
  }

  function drawBanner(banner, h) {
    const k = clamp(banner.t / 2.2, 0, 1);
    // 들어올 때 0.15초, 나갈 때 0.4초 동안 페이드
    const alpha = Math.min(1, (1 - k) * 6, k * 2.6);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';

    const y = h * 0.36;
    ctx.fillStyle = 'rgba(4,6,14,0.55)';
    ctx.fillRect(0, y - 46, W, 96);

    ctx.font = '800 34px -apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif';
    ctx.fillStyle = banner.warn ? '#ff6b7f' : '#ffffff';
    if (banner.warn) {
      ctx.shadowColor = '#ff2d4d';
      ctx.shadowBlur = 18;
    }
    ctx.fillText(banner.text, W / 2, y);
    ctx.shadowBlur = 0;

    ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(banner.sub, W / 2, y + 28);
    ctx.restore();
  }

  /** 전투 중 짧은 대사 — 화면 아래에 반투명 띠로 잠깐 떠요. */
  function drawBark(bark, h, box) {
    const k = clamp(bark.t / 3.0, 0, 1);
    const alpha = Math.min(1, k * 5, (1 - k) * 6 + 0.2);
    const who = bark.who === 'orbit' ? ORBIT : CAST[bark.who];
    const accent = who?.accent || '#ffffff';

    const font = '500 14px -apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif';
    const lines = wrap(bark.text, box.right - box.left - 20, font).slice(0, 2);
    const h2 = 30 + lines.length * 19;

    ctx.save();
    ctx.globalAlpha = alpha;
    const y = box.bottom - 30 - h2;
    ctx.fillStyle = 'rgba(6,9,18,0.82)';
    ctx.fillRect(box.left - 8, y, box.right - box.left + 16, h2);
    ctx.fillStyle = accent;
    ctx.fillRect(box.left - 8, y, 3, h2);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '700 12px -apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif';
    ctx.fillStyle = accent;
    ctx.fillText(who?.name || '', box.left + 6, y + 13);

    ctx.font = font;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    lines.forEach((t, i) => ctx.fillText(t, box.left + 6, y + 33 + i * 19));
    ctx.restore();
  }

  /* ────────────────────────────── 그리기 — 대사창 */

  /** 글자 단위로 줄을 나눠요. 한글은 어디서 끊어도 되지만 영단어는 살려요. */
  function wrap(text, maxW, font) {
    ctx.save();
    ctx.font = font;
    const lines = [];
    let line = '';
    let lastSpace = -1;
    for (const ch of text) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxW && line) {
        if (lastSpace > 0 && /[A-Za-z0-9]/.test(ch)) {
          lines.push(line.slice(0, lastSpace));
          line = line.slice(lastSpace + 1) + ch;
        } else {
          lines.push(line);
          line = ch;
        }
        lastSpace = -1;
      } else {
        line = test;
        if (ch === ' ') lastSpace = line.length - 1;
      }
    }
    if (line) lines.push(line);
    ctx.restore();
    return lines;
  }

  function drawVN() {
    const vn = state.vn;
    if (!vn) return;
    const line = vn.lines[vn.i];
    if (!line) return;
    const h = H();
    const box = view.hudBox();

    const boxH = 172;
    const boxY = box.bottom - boxH;
    const boxX = 20;
    const boxW = W - 40;

    const who = line.who === 'orbit' ? ORBIT : CAST[line.who];
    const accent = who?.accent || '#8ea3c8';
    const talking = vn.shown < line.text.length ? 1 : 0;

    /*
      초상화.

      인물은 y ∈ [-140, 168] (총 308단위) 안에서 그려져요.
      가슴 아래는 대사창 뒤로 넘어가게 두고, 머리 위로만 여백을 남기면
      세로 화면에서도 인물이 화면을 채워요. (레퍼런스처럼 인물이 주인공인 구도)
    */
    if (line.who === 'orbit') {
      // AI는 사람이 아니니 어깨선을 맞출 게 없어요. 빈 공간 한가운데에 띄워요.
      const scale = clamp((boxY - box.top) / 420, 0.7, 1.5);
      ctx.save();
      ctx.globalAlpha = vn.enter;
      ctx.translate(W / 2, (box.top + boxY) / 2);
      ctx.scale(scale, scale);
      drawOrbitAI(ctx, state.t, talking);
      ctx.restore();
    } else if (line.who) {
      const slide = (1 - vn.enter) * 40;
      const scale = clamp((boxY - box.top - 200) / 308, 0.9, 1.9);
      // 어깨 끝(+168)이 대사창 위에 살짝 걸치도록 원점을 잡아요.
      const originY = boxY + 42 - 168 * scale;

      // 인물 뒤를 살짝 눌러요. 배경이 밝은 장면(지구·달)에서 얼굴이 묻히지 않게.
      ctx.save();
      ctx.globalAlpha = vn.enter * 0.55;
      const vig = ctx.createRadialGradient(
        W * 0.42, originY - 70 * scale, 20,
        W * 0.42, originY - 70 * scale, 250 * scale
      );
      vig.addColorStop(0, 'rgba(4,6,14,0.75)');
      vig.addColorStop(1, 'rgba(4,6,14,0)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, boxY + 20);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = vn.enter;
      ctx.translate(W * 0.42 - slide, originY);
      ctx.scale(scale, scale);
      drawCharacter(ctx, line.who, state.t, { mood: vn.mood, talk: talking, look: 0.2 });
      ctx.restore();
    }

    /* 대사창 */
    ctx.save();
    ctx.beginPath();
    const r = 16;
    ctx.moveTo(boxX + r, boxY);
    ctx.arcTo(boxX + boxW, boxY, boxX + boxW, boxY + boxH, r);
    ctx.arcTo(boxX + boxW, boxY + boxH, boxX, boxY + boxH, r);
    ctx.arcTo(boxX, boxY + boxH, boxX, boxY, r);
    ctx.arcTo(boxX, boxY, boxX + boxW, boxY, r);
    ctx.closePath();
    ctx.fillStyle = 'rgba(6,8,18,0.9)';
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.6;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.restore();

    /* 이름표 */
    if (who) {
      ctx.save();
      ctx.font = '700 13px -apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif';
      const nameW = ctx.measureText(who.name).width + 26;
      const tagY = boxY - 15;
      ctx.beginPath();
      ctx.moveTo(boxX + 14, tagY);
      ctx.arcTo(boxX + 14 + nameW, tagY, boxX + 14 + nameW, tagY + 30, 8);
      ctx.arcTo(boxX + 14 + nameW, tagY + 30, boxX + 14, tagY + 30, 8);
      ctx.arcTo(boxX + 14, tagY + 30, boxX + 14, tagY, 8);
      ctx.arcTo(boxX + 14, tagY, boxX + 14 + nameW, tagY, 8);
      ctx.closePath();
      ctx.fillStyle = accent;
      ctx.shadowColor = accent;
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#070a14';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(who.name, boxX + 14 + nameW / 2, tagY + 15);
      ctx.restore();
    }

    /* 본문 */
    const font = `${line.who ? '500' : '400'} 17px -apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif`;
    const shown = line.text.slice(0, Math.floor(vn.shown));
    const lines = wrap(shown, boxW - 56, font);

    ctx.save();
    ctx.font = font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = line.who ? 'rgba(255,255,255,0.94)' : 'rgba(210,222,245,0.86)';
    lines.slice(0, 4).forEach((t, i) => {
      ctx.fillText(t, boxX + 28, boxY + 36 + i * 28);
    });
    ctx.restore();

    /* 다음으로 넘어가라는 표시 */
    if (!talking && !line.hold) {
      const bob = Math.sin(state.t * 5) * 3;
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(state.t * 5) * 0.3;
      ctx.beginPath();
      ctx.moveTo(boxX + boxW - 34, boxY + boxH - 26 + bob);
      ctx.lineTo(boxX + boxW - 22, boxY + boxH - 26 + bob);
      ctx.lineTo(boxX + boxW - 28, boxY + boxH - 18 + bob);
      ctx.closePath();
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.restore();
    }

    /* 건너뛰기 안내 */
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.font = '500 11px -apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('탭하여 다음', box.right, boxY - 18);
    ctx.restore();
  }

  /* ────────────────────────────── 그리기 — 연출 */

  /** 붉은 경광등 — 사이렌이 울리는 동안 화면 가장자리가 맥동해요. */
  function drawSirenOverlay(h) {
    if (state.siren <= 0.01) return;
    const pulse = (0.35 + Math.abs(Math.sin(state.t * 3.3)) * 0.65) * state.siren;
    ctx.save();
    const g = ctx.createRadialGradient(W / 2, h / 2, h * 0.2, W / 2, h / 2, h * 0.72);
    g.addColorStop(0, 'rgba(255,0,40,0)');
    g.addColorStop(1, `rgba(255,20,50,${0.42 * pulse})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, h);

    // 위아래 경고 띠
    ctx.globalAlpha = 0.5 * pulse;
    ctx.fillStyle = '#ff2d4d';
    ctx.fillRect(0, 0, W, 4);
    ctx.fillRect(0, h - 4, W, 4);
    ctx.restore();
  }

  /* ────────────────────────────── 루프 */

  function update(dt) {
    state.t += dt;
    state.siren = approach(state.siren, state.sirenOn ? 1 : 0, 3, dt);
    state.shake = Math.max(0, state.shake - dt * 26);
    state.flash = Math.max(0, state.flash - dt * 2.2);
    state.fade = Math.max(0, state.fade - dt * 1.6);

    if (state.phase === 'vn') {
      state.landT += dt;
      updateVN(dt);
    } else if (state.phase === 'flight') {
      updateFlight(dt);
    }
  }

  function draw(dt) {
    view.ensure();
    const h = H();

    // 화면 전체(레터박스 포함) 배경
    view.device(ctx);
    ctx.fillStyle = '#04050d';
    ctx.fillRect(0, 0, view.vw, view.vh);

    view.logical(ctx);
    ctx.save();
    if (state.shake > 0.3) {
      ctx.translate(rand(-state.shake, state.shake), rand(-state.shake, state.shake));
    }

    drawBackground(dt);
    if (state.phase === 'flight') drawFlight();
    ctx.restore();

    drawSirenOverlay(h);

    if (state.flash > 0) {
      ctx.globalAlpha = Math.min(1, state.flash);
      ctx.fillStyle = '#ff5252';
      ctx.fillRect(0, 0, W, h);
      ctx.globalAlpha = 1;
    }

    if (state.phase === 'vn') drawVN();

    if (state.fade > 0) {
      ctx.globalAlpha = Math.min(1, state.fade);
      ctx.fillStyle = '#04050d';
      ctx.fillRect(0, 0, W, h);
      ctx.globalAlpha = 1;
    }
  }

  let raf = 0;
  let last = 0;

  function loop(now) {
    if (!state.active) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (!state.paused) update(dt);
    draw(state.paused ? 0 : dt);
  }

  /* ────────────────────────────── 입력 */

  function onDown(e) {
    if (!state.active || state.paused) return;
    const lx = view.toLogicalX(e.clientX);
    const ly = view.toLogicalY(e.clientY);

    if (state.phase === 'vn') {
      haptic('tap');
      nextLine();
      return;
    }
    if (state.phase === 'flight' && state.fl && !state.fl.player.dead) {
      // 손가락이 우주선을 가리지 않게, 잡은 순간의 간격을 그대로 유지해요.
      const p = state.fl.player;
      state.fl.drag = { dx: p.tx - lx, dy: p.ty - ly, id: e.pointerId };
      canvas.setPointerCapture?.(e.pointerId);
    }
  }

  function onMove(e) {
    const fl = state.fl;
    if (!state.active || state.paused || state.phase !== 'flight' || !fl?.drag) return;
    if (fl.drag.id !== e.pointerId) return;
    const p = fl.player;
    p.tx = view.toLogicalX(e.clientX) + fl.drag.dx;
    p.ty = view.toLogicalY(e.clientY) + fl.drag.dy;
  }

  function onUp(e) {
    const fl = state.fl;
    if (fl?.drag && fl.drag.id === e.pointerId) fl.drag = null;
  }

  const KEYMAP = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down',
    KeyA: 'left',
    KeyD: 'right',
    KeyW: 'up',
    KeyS: 'down',
  };

  function onKeyDown(e) {
    if (!state.active || state.paused) return;
    if (state.phase === 'vn' && (e.code === 'Space' || e.code === 'Enter')) {
      e.preventDefault();
      nextLine();
      return;
    }
    const k = KEYMAP[e.code];
    if (k && state.fl) {
      e.preventDefault();
      state.fl.keys.add(k);
    }
  }

  function onKeyUp(e) {
    const k = KEYMAP[e.code];
    if (k && state.fl) state.fl.keys.delete(k);
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  /* ────────────────────────────── 외부 API */

  function begin(phase, run = RUNS.story, carry = 0) {
    // 캔버스가 방금 display:none에서 풀렸을 수 있어요. 크기부터 다시 재요.
    view.refresh();

    state.run = run;
    state.carry = carry;
    state.active = true;
    state.paused = false;
    state.score = 0;
    state.shake = 0;
    state.flash = 0;
    state.fade = 1;
    state.t = 0;
    state.landT = 0;
    audio.init();
    audio.setStage(1);

    if (phase === 'flight') {
      state.vn = null;
      startFlight();
    } else {
      state.fl = null;
      state.bg = 'earth';
      startVN(INTRO, startFlight);
    }

    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  }

  return {
    state,

    /** 처음부터 — 인트로 대사를 거쳐 비행으로 이어져요. */
    start() {
      begin('intro');
    },

    /** 격추당한 뒤 다시 — 대사는 건너뛰고 비행부터 시작해요. */
    retry() {
      begin('flight');
    },

    /** 인트로를 건너뛰고 바로 비행으로. (이미 한 번 본 사람용) */
    skipToFlight() {
      begin('flight');
    },

    /**
     * 최종 보스전 — 본편에서 100번째 행성에 닿았을 때 열려요.
     *
     * 비행 구간 없이 「가디언-00」부터 시작해요. 결과는 onFinalClear / onFinalFail로 가고,
     * 점수는 본편에서 들고 온 carryScore에 보스전 점수를 더해서 돌려줘요.
     *
     * @param {{carryScore?: number}} [opts]
     */
    startFinalBoss({ carryScore = 0 } = {}) {
      begin('flight', RUNS.final, carryScore);
    },

    /**
     * 튜토리얼 연습 보스전.
     *
     * 같은 보스, 같은 패턴인데 체력·탄속만 낮춰 놓은 판이에요.
     * 결과는 최종 보스전과 같은 콜백(onFinalClear / onFinalFail)으로 나가고,
     * `practice: true`가 붙어 있어서 받는 쪽이 기록을 남기지 않아요.
     */
    startPracticeBoss() {
      begin('flight', RUNS.practice, 0);
    },

    /** 지금 돌고 있는 게 연습 보스전인지 */
    get isPracticeBoss() {
      return state.active && state.run.practice === true;
    },

    /** 지금 돌고 있는 게 최종 보스전인지 */
    get isFinalBoss() {
      return state.active && state.run.mode === 'final';
    },

    /**
     * 렌더링과 무관하게 한 프레임만 진행해요.
     * 스폰 타임라인·보스 페이즈 전환처럼 눈으로 확인하기 어려운 걸
     * 콘솔에서 빠르게 돌려볼 때 써요. (game.js의 step과 같은 목적)
     */
    step(dt = 1 / 60) {
      update(dt);
    },

    /** 스토리 모드를 완전히 끝내요. 사이렌·배경음·루프를 모두 정리해요. */
    stop() {
      state.active = false;
      state.paused = false;
      state.phase = 'idle';
      state.vn = null;
      state.fl = null;
      cancelAnimationFrame(raf);
      raf = 0;
      setSiren(false);
      audio.stopBgm();
    },

    pause() {
      if (!state.active || state.paused) return;
      state.paused = true;
      audio.suspend();
    },

    resume() {
      if (!state.active || !state.paused) return;
      state.paused = false;
      last = performance.now();
      audio.resume();
    },

    /** 화면 아래쪽에서 못 쓰는 높이(CSS px) — 하단 배너 광고 자리 */
    setBottomReserve(px) {
      view.setBottomReserve(px);
    },

    setInsets(v) {
      view.setInsets(v);
    },

    setSkin(id) {
      skin = getSkin(id);
    },

    get isActive() {
      return state.active;
    },

    get isPaused() {
      return state.paused;
    },

    destroy() {
      this.stop();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      view.destroy();
    },
  };
}

/**
 * 우주선 스킨 — 전부 캔버스에 직접 그려요. 이미지 파일도, 이모지도 쓰지 않아요.
 *
 * 좌표 약속
 *  - 원점이 우주선 중심, **+x 방향이 기수(앞)** 예요. 회전은 호출하는 쪽에서 이미 걸어둬요.
 *  - 대략 x는 -14~+20, y는 -16~+16 안에서 그려요. 이 범위를 벗어나면 궤도에 붙었을 때 튀어 보여요.
 *  - 화염(엔진 불꽃)과 바깥 글로우는 game.js가 공통으로 그려요. 여기서는 몸통만 그려요.
 *
 * 각 스킨은 `flame`으로 자기 불꽃 색을 정해요. 공룡이 파란 제트를 뿜으면 어색하니까요.
 */

const TAU = Math.PI * 2;

/**
 * 좌우 대칭으로 같은 그림을 두 번 그려요. (날개 · 귀 · 다리)
 *
 * ⚠️ 그라데이션은 **반드시 이 콜백 안에서** 만들어야 해요.
 * 밖에서 만들면 좌표계가 뒤집힌 쪽에만 원래 방향으로 적용돼서 한쪽 날개만 밝아져요.
 */
function mirror(ctx, draw) {
  for (const s of [1, -1]) {
    ctx.save();
    ctx.scale(1, s);
    draw(ctx, s);
    ctx.restore();
  }
}

function fillPath(ctx, style, path) {
  ctx.fillStyle = style;
  ctx.beginPath();
  path(ctx);
  ctx.closePath();
  ctx.fill();
}

/** 눈 — 흰자 + 눈동자 + 하이라이트. 웃긴 스킨들이 공유해요. */
function eye(ctx, x, y, r, look = 0.3) {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#15151f';
  ctx.beginPath();
  ctx.arc(x + r * look, y, r * 0.52, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.beginPath();
  ctx.arc(x + r * look - r * 0.22, y - r * 0.26, r * 0.2, 0, TAU);
  ctx.fill();
}

/* ══════════════════════════ 기본 ══════════════════════════ */

/** 처음부터 갖고 시작하는 은빛 셔틀. (원래 우주선) */
function drawClassic(ctx, t, flying) {
  mirror(ctx, () => {
    const wing = ctx.createLinearGradient(0, 0, -14, 16);
    wing.addColorStop(0, '#5f7cc4');
    wing.addColorStop(1, '#1b2547');
    fillPath(ctx, wing, (c) => {
      c.moveTo(3, 2.6);
      c.lineTo(-8.5, 15.5);
      c.lineTo(-13.5, 15.0);
      c.lineTo(-9, 3.2);
    });
    ctx.strokeStyle = 'rgba(90,230,255,.85)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(3, 2.6);
    ctx.lineTo(-8.5, 15.5);
    ctx.stroke();
  });

  const blink = 0.45 + 0.55 * Math.abs(Math.sin(t * 4.5));
  const base = ctx.globalAlpha;
  for (const [ly, lc] of [[15.4, '#ff4d78'], [-15.4, '#4dffc3']]) {
    ctx.globalAlpha = base * blink;
    const lg = ctx.createRadialGradient(-11, ly, 0.4, -11, ly, 6);
    lg.addColorStop(0, lc);
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.arc(-11, ly, 6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-11, ly, 1.3, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = base;

  const hull = (c) => {
    c.moveTo(20, 0);
    c.bezierCurveTo(13, 3.0, 5, 5.0, -5, 6.1);
    c.lineTo(-11.5, 5.0);
    c.lineTo(-11.5, -5.0);
    c.lineTo(-5, -6.1);
    c.bezierCurveTo(5, -3.0, 13, -3.0, 20, 0);
  };
  const hg = ctx.createLinearGradient(0, -7, 0, 7);
  hg.addColorStop(0, '#ffffff');
  hg.addColorStop(0.34, '#d5e2fb');
  hg.addColorStop(0.62, '#8496bf');
  hg.addColorStop(1, '#38446a');
  fillPath(ctx, hg, hull);
  ctx.strokeStyle = 'rgba(255,255,255,.55)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  hull(ctx);
  ctx.closePath();
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  hull(ctx);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.fillRect(-12, 1.4, 34, 6);
  ctx.fillStyle = 'rgba(60,220,255,.9)';
  ctx.fillRect(-9, -0.7, 22, 1.4);
  ctx.fillStyle = 'rgba(255,120,60,.75)';
  ctx.fillRect(-9, 2.8, 9, 1.1);
  ctx.restore();

  const cg = ctx.createLinearGradient(2, -3.4, 11, 3.4);
  cg.addColorStop(0, '#07142e');
  cg.addColorStop(0.45, '#2aa7ff');
  cg.addColorStop(1, '#d8fbff');
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.ellipse(6.4, 0, 6.2, 3.5, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.7)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.ellipse(6.4, 0, 6.2, 3.5, 0, 0, TAU);
  ctx.stroke();

  ctx.fillStyle = '#20263f';
  ctx.fillRect(-13.2, -4.6, 3.2, 3.2);
  ctx.fillRect(-13.2, 1.4, 3.2, 3.2);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(120,225,255,${flying ? 0.95 : 0.6})`;
  ctx.fillRect(-13.0, -4.0, 2.2, 2.0);
  ctx.fillRect(-13.0, 2.0, 2.2, 2.0);
  ctx.restore();
}

/* ══════════════════════════ 멋있는 것들 ══════════════════════════ */

/** 각진 스텔스 인터셉터. 검은 기체에 청록 발광선. */
function drawFalcon(ctx, t, flying) {
  mirror(ctx, () => {
    // 어두운 기체라 배경에 묻히기 쉬워요. 날개 안쪽을 충분히 밝혀서 실루엣을 살려요.
    const wg = ctx.createLinearGradient(0, 0, -16, 17);
    wg.addColorStop(0, '#6a7699');
    wg.addColorStop(0.45, '#2f3852');
    wg.addColorStop(1, '#141a2b');
    fillPath(ctx, wg, (c) => {
      c.moveTo(8, 1.6);
      c.lineTo(-6, 16.5);
      c.lineTo(-14, 13.5);
      c.lineTo(-12, 2.4);
    });
    ctx.strokeStyle = `rgba(60,255,225,${flying ? 0.95 : 0.7})`;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(6, 2.2);
    ctx.lineTo(-6.5, 15.4);
    ctx.stroke();
    // 날개 끝 캐논
    ctx.fillStyle = '#252c42';
    ctx.fillRect(-9, 12.4, 9, 2.4);
    ctx.fillStyle = 'rgba(60,255,225,.9)';
    ctx.fillRect(-1.4, 12.9, 1.6, 1.4);
  });

  const hull = (c) => {
    c.moveTo(21, 0);
    c.lineTo(6, 4.2);
    c.lineTo(-8, 5.6);
    c.lineTo(-13, 3.6);
    c.lineTo(-13, -3.6);
    c.lineTo(-8, -5.6);
    c.lineTo(6, -4.2);
  };
  const hg = ctx.createLinearGradient(0, -6, 0, 6);
  hg.addColorStop(0, '#8d9ac0');
  hg.addColorStop(0.42, '#39435f');
  hg.addColorStop(1, '#131829');
  fillPath(ctx, hg, hull);
  ctx.strokeStyle = 'rgba(60,255,225,.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  hull(ctx);
  ctx.closePath();
  ctx.stroke();

  // 기수 발광 스트라이프
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgba(60,255,225,${0.55 + 0.35 * Math.abs(Math.sin(t * 3))})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(17, 0);
  ctx.lineTo(-6, 0);
  ctx.stroke();
  ctx.restore();

  const cg = ctx.createLinearGradient(3, -3, 10, 3);
  cg.addColorStop(0, '#02131a');
  cg.addColorStop(0.6, '#0ee6c8');
  cg.addColorStop(1, '#c8fff5');
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.moveTo(11.5, 0);
  ctx.lineTo(4.5, 2.6);
  ctx.lineTo(2.5, 0);
  ctx.lineTo(4.5, -2.6);
  ctx.closePath();
  ctx.fill();
}

/** 오로라를 두른 유선형 크루저. 보라 → 분홍 그라데이션. */
function drawAurora(ctx, t, flying) {
  // 뒤로 흐르는 오로라 리본
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const ph = t * 2.4 + i * 1.1;
    ctx.strokeStyle = `rgba(${180 - i * 30},${110 + i * 40},255,${0.3 - i * 0.07})`;
    ctx.lineWidth = 2.6 - i * 0.6;
    ctx.beginPath();
    for (let x = -4; x >= -20; x -= 2) {
      const y = Math.sin(ph + x * 0.35) * (2 + (-x) * 0.28);
      if (x === -4) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();

  mirror(ctx, () => {
    const wg = ctx.createLinearGradient(0, 0, -12, 15);
    wg.addColorStop(0, '#e6a8ff');
    wg.addColorStop(1, '#4b1e8c');
    fillPath(ctx, wg, (c) => {
      c.moveTo(4, 2.2);
      c.quadraticCurveTo(-2, 9, -9, 14.6);
      c.quadraticCurveTo(-12, 10, -10.5, 2.8);
    });
  });

  const hull = (c) => {
    c.moveTo(20, 0);
    c.bezierCurveTo(12, 3.4, 3, 5.6, -6, 5.8);
    c.quadraticCurveTo(-12, 4.6, -12.5, 0);
    c.quadraticCurveTo(-12, -4.6, -6, -5.8);
    c.bezierCurveTo(3, -5.6, 12, -3.4, 20, 0);
  };
  const hg = ctx.createLinearGradient(0, -6, 0, 6);
  hg.addColorStop(0, '#fff1ff');
  hg.addColorStop(0.35, '#d8b6ff');
  hg.addColorStop(0.7, '#8a5cd6');
  hg.addColorStop(1, '#3a1a6b');
  fillPath(ctx, hg, hull);

  ctx.save();
  ctx.beginPath();
  hull(ctx);
  ctx.closePath();
  ctx.clip();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const shim = ctx.createLinearGradient(-12, 0, 20, 0);
  const k = (Math.sin(t * 1.6) + 1) / 2;
  shim.addColorStop(Math.max(0, k - 0.25), 'rgba(255,180,255,0)');
  shim.addColorStop(k, 'rgba(255,220,255,.55)');
  shim.addColorStop(Math.min(1, k + 0.25), 'rgba(255,180,255,0)');
  ctx.fillStyle = shim;
  ctx.fillRect(-13, -7, 34, 14);
  ctx.restore();
  ctx.restore();

  const cg = ctx.createLinearGradient(2, -3, 11, 3);
  cg.addColorStop(0, '#1b0836');
  cg.addColorStop(0.5, '#ff8ae0');
  cg.addColorStop(1, '#fff0ff');
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.ellipse(7, 0, 5.6, 3.1, 0, 0, TAU);
  ctx.fill();
}

/** 중장갑 견인선. 두툼한 오렌지 함체에 경고 스트라이프. */
function drawTitan(ctx, t, flying) {
  mirror(ctx, () => {
    // 옆구리 부스터 포드
    const pg = ctx.createLinearGradient(0, 6, 0, 14);
    pg.addColorStop(0, '#c9702a');
    pg.addColorStop(1, '#5d2f10');
    fillPath(ctx, pg, (c) => {
      c.moveTo(6, 6.4);
      c.lineTo(6, 12.6);
      c.lineTo(-11, 12.6);
      c.lineTo(-12.5, 6.4);
    });
    ctx.fillStyle = '#20140c';
    ctx.fillRect(-12.6, 7.6, 3, 4);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,170,70,${flying ? 0.95 : 0.5})`;
    ctx.fillRect(-12.2, 8.2, 2, 2.8);
    ctx.restore();
  });

  const hull = (c) => {
    c.moveTo(19, 0);
    c.lineTo(13, 5.2);
    c.lineTo(-7, 6.6);
    c.lineTo(-12.5, 4.4);
    c.lineTo(-12.5, -4.4);
    c.lineTo(-7, -6.6);
    c.lineTo(13, -5.2);
  };
  const hg = ctx.createLinearGradient(0, -7, 0, 7);
  hg.addColorStop(0, '#ffd9a8');
  hg.addColorStop(0.35, '#f0973c');
  hg.addColorStop(0.75, '#a1521a');
  hg.addColorStop(1, '#4a220b');
  fillPath(ctx, hg, hull);

  ctx.save();
  ctx.beginPath();
  hull(ctx);
  ctx.closePath();
  ctx.clip();
  // 경고 빗금
  ctx.fillStyle = 'rgba(30,20,12,.85)';
  for (let i = -14; i < 20; i += 5) {
    ctx.beginPath();
    ctx.moveTo(i, -7);
    ctx.lineTo(i + 2.2, -7);
    ctx.lineTo(i - 1.4, 7);
    ctx.lineTo(i - 3.6, 7);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,.14)';
  ctx.fillRect(-13, -7, 34, 3);
  ctx.restore();

  ctx.strokeStyle = 'rgba(255,226,190,.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  hull(ctx);
  ctx.closePath();
  ctx.stroke();

  const cg = ctx.createLinearGradient(4, -3, 12, 3);
  cg.addColorStop(0, '#221000');
  cg.addColorStop(0.5, '#ffc046');
  cg.addColorStop(1, '#fff4d4');
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.moveTo(13.4, 0);
  ctx.lineTo(6.5, 3.2);
  ctx.lineTo(4.6, 0);
  ctx.lineTo(6.5, -3.2);
  ctx.closePath();
  ctx.fill();
}

/* ══════════════════════════ 웃긴 것들 ══════════════════════════ */

/** 우주복도 안 입고 날아다니는 초록 공룡. 등지느러미가 곧 날개. */
function drawDino(ctx, t, flying) {
  // 꼬리 — 살랑살랑
  const sway = Math.sin(t * (flying ? 9 : 4)) * 2.2;
  const tg = ctx.createLinearGradient(-6, 0, -18, 0);
  tg.addColorStop(0, '#57bf46');
  tg.addColorStop(1, '#2c7a2a');
  fillPath(ctx, tg, (c) => {
    c.moveTo(-6, 4.2);
    c.quadraticCurveTo(-13, 4.6 + sway, -18.5, 1.4 + sway);
    c.quadraticCurveTo(-13, 1.2 + sway, -6, -3.4);
  });

  // 다리 (아래쪽만 보이게)
  mirror(ctx, (c, s) => {
    if (s < 0) return;
    fillPath(ctx, '#3f9a34', (p) => {
      p.moveTo(-1, 4.6);
      p.lineTo(1.6, 10.4);
      p.lineTo(-2.4, 10.8);
      p.lineTo(-4, 5);
    });
    fillPath(ctx, '#ffe08a', (p) => {
      p.moveTo(1.9, 9.6);
      p.lineTo(4.4, 11.2);
      p.lineTo(-2.6, 11.4);
      p.lineTo(-2.4, 9.8);
    });
  });

  // 등지느러미 (날개 대용)
  mirror(ctx, () => {
    fillPath(ctx, '#ffd23f', (c) => {
      c.moveTo(2, 1);
      c.lineTo(-2, 12.5);
      c.lineTo(-7.5, 11.5);
      c.lineTo(-6, 1.4);
    });
    ctx.strokeStyle = 'rgba(120,70,0,.35)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-1, 3);
    ctx.lineTo(-3.4, 10.4);
    ctx.stroke();
  });

  // 몸통
  const bg = ctx.createLinearGradient(0, -7, 0, 7);
  bg.addColorStop(0, '#8fe36a');
  bg.addColorStop(0.5, '#4faf3d');
  bg.addColorStop(1, '#256b22');
  fillPath(ctx, bg, (c) => {
    c.moveTo(9, -1.2);
    c.quadraticCurveTo(12, 3, 6, 5.6);
    c.quadraticCurveTo(-2, 7.4, -7, 4.4);
    c.quadraticCurveTo(-9.6, 0, -7, -4.2);
    c.quadraticCurveTo(-1, -7, 5, -5);
  });
  // 배
  fillPath(ctx, 'rgba(240,240,180,.75)', (c) => {
    c.moveTo(6, 5);
    c.quadraticCurveTo(-1, 7, -6.5, 4);
    c.quadraticCurveTo(-2, 3.2, 5.4, 2.4);
  });

  // 머리
  fillPath(ctx, '#63c94e', (c) => {
    c.moveTo(16.5, 0.6);
    c.quadraticCurveTo(15, 4.4, 9.4, 4.6);
    c.quadraticCurveTo(5.4, 2.2, 6.6, -2.6);
    c.quadraticCurveTo(11, -5.2, 15, -2.4);
  });
  // 콧구멍 · 입
  ctx.strokeStyle = 'rgba(20,60,15,.7)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(16, 1.4);
  ctx.lineTo(10.6, 2.6);
  ctx.stroke();
  ctx.fillStyle = '#2b6b22';
  ctx.beginPath();
  ctx.arc(15.4, -0.9, 0.7, 0, TAU);
  ctx.fill();
  // 이빨
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(14.6, 1.6);
  ctx.lineTo(13.6, 3.4);
  ctx.lineTo(13, 1.8);
  ctx.closePath();
  ctx.fill();

  eye(ctx, 11.6, -1.6, 2.1, 0.35);
}

/** 우주 유영 중인 양. 털이 곧 추진체. */
function drawSheep(ctx, t, flying) {
  const puff = flying ? 1.08 : 1;

  // 털뭉치 — 원을 여러 개 겹쳐서
  const wool = ctx.createRadialGradient(-3, -3, 1, -2, 0, 12);
  wool.addColorStop(0, '#ffffff');
  wool.addColorStop(0.6, '#f2f2f7');
  wool.addColorStop(1, '#c9c9d6');
  ctx.fillStyle = wool;
  const puffs = [
    [-9, 0, 5.2], [-5, -4.4, 5], [-4.6, 4.4, 4.8],
    [0.5, -3.6, 5.2], [1, 3.8, 5], [4.5, 0.2, 4.6], [-2, 0, 6],
  ];
  for (const [px, py, pr] of puffs) {
    ctx.beginPath();
    ctx.arc(px, py, pr * puff, 0, TAU);
    ctx.fill();
  }
  // 털 그림자
  ctx.fillStyle = 'rgba(120,120,150,.2)';
  for (const [px, py, pr] of puffs.slice(0, 3)) {
    ctx.beginPath();
    ctx.arc(px, py + pr * 0.4, pr * 0.62 * puff, 0, TAU);
    ctx.fill();
  }

  // 다리
  mirror(ctx, (c, s) => {
    ctx.strokeStyle = '#3a3a4a';
    ctx.lineWidth = 1.7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-1, 4.4);
    ctx.lineTo(-2.4 + Math.sin(t * 6 + s) * 0.8, 9.6);
    ctx.stroke();
  });

  // 얼굴
  const fg = ctx.createLinearGradient(6, -4, 12, 4);
  fg.addColorStop(0, '#4a4a5e');
  fg.addColorStop(1, '#22222f');
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.ellipse(9.6, 0.4, 5.4, 4.4, -0.12, 0, TAU);
  ctx.fill();

  // 귀
  mirror(ctx, () => {
    fillPath(ctx, '#33333f', (c) => {
      c.moveTo(7.4, 3);
      c.quadraticCurveTo(4.6, 6.6, 6.4, 7.4);
      c.quadraticCurveTo(8.4, 6, 9, 3.6);
    });
  });

  // 앞머리 털
  ctx.fillStyle = '#fbfbff';
  ctx.beginPath();
  ctx.arc(6.6, -2.8, 2.6, 0, TAU);
  ctx.arc(8.8, -4.2, 2.1, 0, TAU);
  ctx.fill();

  eye(ctx, 11.4, -0.6, 1.7, 0.3);

  // 코
  ctx.fillStyle = '#0f0f16';
  ctx.beginPath();
  ctx.ellipse(14.2, 1.4, 1.5, 1.1, 0, 0, TAU);
  ctx.fill();
}

/** 날개를 펼친 우주 독수리. 부리와 눈썹이 항상 화가 나 있어요. */
function drawEagle(ctx, t, flying) {
  const flap = Math.sin(t * (flying ? 11 : 5)) * (flying ? 3.4 : 1.6);

  mirror(ctx, () => {
    const wg = ctx.createLinearGradient(0, 2, -6, 16);
    wg.addColorStop(0, '#8b6234');
    wg.addColorStop(0.6, '#5e3f1f');
    wg.addColorStop(1, '#33210f');
    fillPath(ctx, wg, (c) => {
      c.moveTo(5, 2);
      c.quadraticCurveTo(0, 9 + flap, -8, 15 + flap);
      c.quadraticCurveTo(-11, 9 + flap * 0.6, -9, 2.6);
    });
    // 깃털 결
    ctx.strokeStyle = 'rgba(20,12,4,.45)';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(1.6 - i * 2.4, 3.4);
      ctx.lineTo(-5.4 - i * 1.2, 13.2 + flap * 0.9);
      ctx.stroke();
    }
    // 날개 끝 흰 깃
    fillPath(ctx, 'rgba(240,236,225,.8)', (c) => {
      c.moveTo(-7.4, 13.4 + flap);
      c.lineTo(-8.2, 15.4 + flap);
      c.lineTo(-10.2, 11 + flap * 0.7);
    });
  });

  // 꼬리깃
  fillPath(ctx, '#4a3117', (c) => {
    c.moveTo(-7, 3.2);
    c.lineTo(-15.5, 1.6);
    c.lineTo(-15.5, -1.6);
    c.lineTo(-7, -3.2);
  });

  // 몸통
  const bg = ctx.createLinearGradient(0, -6, 0, 6);
  bg.addColorStop(0, '#a87b45');
  bg.addColorStop(0.55, '#6d4a24');
  bg.addColorStop(1, '#2e1e0d');
  fillPath(ctx, bg, (c) => {
    c.moveTo(8, -2);
    c.quadraticCurveTo(11, 2.4, 5, 5.4);
    c.quadraticCurveTo(-3, 6.6, -7.4, 3.4);
    c.quadraticCurveTo(-9.4, 0, -7.4, -3.6);
    c.quadraticCurveTo(-2, -6.4, 5, -5);
  });

  // 흰 머리
  const hg = ctx.createLinearGradient(6, -5, 14, 4);
  hg.addColorStop(0, '#ffffff');
  hg.addColorStop(1, '#d3d3d8');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.ellipse(10, -0.4, 5.4, 4.5, -0.1, 0, TAU);
  ctx.fill();
  // 목덜미 깃
  fillPath(ctx, 'rgba(210,205,198,.9)', (c) => {
    c.moveTo(6.4, -4.4);
    c.lineTo(4.2, -1);
    c.lineTo(6, 3.4);
    c.lineTo(7.4, -0.6);
  });

  // 부리
  fillPath(ctx, '#ffc02e', (c) => {
    c.moveTo(19.5, 1.2);
    c.quadraticCurveTo(16.4, 3.6, 13.6, 2.8);
    c.lineTo(13.8, -2);
    c.quadraticCurveTo(17.2, -1.6, 19.5, 1.2);
  });
  ctx.strokeStyle = 'rgba(120,70,0,.6)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(19.2, 1);
  ctx.lineTo(13.8, 0.4);
  ctx.stroke();

  eye(ctx, 11.4, -1.4, 1.9, 0.32);
  // 화난 눈썹
  ctx.strokeStyle = '#7a6a58';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(8.6, -4);
  ctx.lineTo(13.4, -2.6);
  ctx.stroke();
}

/* ══════════════════════════ 목록 ══════════════════════════ */

/**
 * @typedef {object} Skin
 * @property {string} id 저장에 쓰는 키 (바꾸면 기존 구매 기록이 끊겨요)
 * @property {string} name 상점에 보이는 이름
 * @property {string} desc 한 줄 설명
 * @property {'basic'|'cool'|'fun'} kind 상점 분류
 * @property {number} price 보석 가격 (0이면 기본 제공)
 * @property {{core:string, mid:string, tail:string}} flame 엔진 불꽃 색
 * @property {(ctx: CanvasRenderingContext2D, t: number, flying: boolean) => void} draw
 */

/** @type {Skin[]} */
export const SKINS = [
  {
    id: 'classic',
    name: '스타더스트',
    desc: '처음부터 함께한 은빛 셔틀',
    kind: 'basic',
    price: 0,
    flame: { core: 'rgba(210,245,255,.95)', mid: 'rgba(90,170,255,.7)', tail: 'rgba(120,70,255,.35)' },
    draw: drawClassic,
  },
  {
    id: 'falcon',
    name: '나이트팰컨',
    desc: '레이더에 안 잡히는 각진 인터셉터',
    kind: 'cool',
    price: 100,
    flame: { core: 'rgba(220,255,250,.95)', mid: 'rgba(40,255,220,.7)', tail: 'rgba(0,150,180,.3)' },
    draw: drawFalcon,
  },
  {
    id: 'aurora',
    name: '오로라',
    desc: '지나간 자리에 빛의 띠가 남아요',
    kind: 'cool',
    price: 100,
    flame: { core: 'rgba(255,240,255,.95)', mid: 'rgba(220,120,255,.7)', tail: 'rgba(120,40,220,.3)' },
    draw: drawAurora,
  },
  {
    id: 'titan',
    name: '타이탄',
    desc: '뭘 들이받아도 멀쩡할 것 같은 덩치',
    kind: 'cool',
    price: 100,
    flame: { core: 'rgba(255,240,210,.95)', mid: 'rgba(255,150,50,.7)', tail: 'rgba(200,60,0,.3)' },
    draw: drawTitan,
  },
  {
    id: 'dino',
    name: '우주공룡',
    desc: '우주복은 안 챙겼지만 자신감은 챙겼어요',
    kind: 'fun',
    price: 100,
    flame: { core: 'rgba(230,255,200,.9)', mid: 'rgba(130,230,90,.65)', tail: 'rgba(40,150,30,.3)' },
    draw: drawDino,
  },
  {
    id: 'sheep',
    name: '양 한 마리',
    desc: '세다 보면 잠들지만 일단 날아요',
    kind: 'fun',
    price: 100,
    flame: { core: 'rgba(255,255,255,.9)', mid: 'rgba(200,215,255,.6)', tail: 'rgba(140,150,220,.28)' },
    draw: drawSheep,
  },
  {
    id: 'eagle',
    name: '성난독수리',
    desc: '왜 화났는지는 아무도 몰라요',
    kind: 'fun',
    price: 100,
    flame: { core: 'rgba(255,245,215,.9)', mid: 'rgba(255,190,60,.65)', tail: 'rgba(190,90,0,.3)' },
    draw: drawEagle,
  },
];

export const DEFAULT_SKIN = 'classic';

/** id로 스킨을 찾아요. 없는 id면 기본 스킨으로 떨어져요. */
export function getSkin(id) {
  return SKINS.find((s) => s.id === id) || SKINS[0];
}

/**
 * 상점 카드용 미리보기. 기수가 위를 향하도록 세워서 그려요.
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawSkinPreview(ctx, skin, w, h, t) {
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(Math.min(w, h) / 52, Math.min(w, h) / 52);

  const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, 26);
  glow.addColorStop(0, 'rgba(120,200,255,.22)');
  glow.addColorStop(1, 'rgba(90,130,255,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, 26, 0, TAU);
  ctx.fill();

  ctx.rotate(-Math.PI / 2); // 기수가 위로

  const fl = 11 + Math.sin(t * 8) * 2.5;
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

  skin.draw(ctx, t, false);
  ctx.restore();
}

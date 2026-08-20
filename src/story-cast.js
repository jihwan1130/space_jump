/**
 * 스토리 모드 등장인물 — 전부 캔버스 벡터로 그려요.
 *
 * 이미지 파일을 안 쓰는 이유는 게임 본편과 같아요.
 *  - 번들이 커지지 않고(.ait 용량 제한), 어떤 해상도에서도 뭉개지지 않아요.
 *  - 숨쉬기·말할 때 흔들림 같은 미세한 움직임을 코드로 줄 수 있어요.
 *
 * 좌표계: 원점(0,0)이 **목 아래·가슴 위**예요. 머리는 위(-), 어깨는 아래(+).
 * 대략 x ∈ [-110, 110], y ∈ [-140, 160] 안에서 그려요.
 */

const TAU = Math.PI * 2;

/** 등장인물 색·생김새 정의 */
export const CAST = {
  doyun: {
    name: '한도윤',
    role: '조종사',
    accent: '#5FD0FF',
    skin: '#f0c9a8',
    skinShade: '#d5a480',
    hair: '#1d1f2e',
    hairLit: '#3b4361',
    suit: '#1e2740',
    suitLit: '#3c4c74',
    long: false,
  },
  seorin: {
    name: '유서린',
    role: '항법사',
    accent: '#FFB86B',
    skin: '#f6d5b6',
    skinShade: '#dcae8b',
    hair: '#2a1c24',
    hairLit: '#5a3a44',
    suit: '#281f38',
    suitLit: '#4a3a60',
    long: true,
  },
};

/** 관제 AI — 사람이 아니라 신호로 그려요. */
export const ORBIT = { name: 'ORBIT', role: '관제 AI', accent: '#7dffb0' };

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 실루엣에 테두리 빛을 입혀요. 레퍼런스의 "선이 빛나는" 느낌이 여기서 나와요. */
function rim(ctx, color, width = 2, blur = 10, alpha = 0.9) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.stroke();
  ctx.restore();
}

/* ────────────────────────────── 부위별 */

function shoulders(ctx, c) {
  // 비행복 상반신. 아래로 갈수록 넓어지는 사다리꼴을 둥글려서 잡아요.
  ctx.beginPath();
  ctx.moveTo(-112, 168);
  ctx.bezierCurveTo(-104, 62, -74, 30, -34, 14);
  ctx.lineTo(34, 14);
  ctx.bezierCurveTo(74, 30, 104, 62, 112, 168);
  ctx.closePath();

  const g = ctx.createLinearGradient(-90, 20, 90, 168);
  g.addColorStop(0, c.suitLit);
  g.addColorStop(0.5, c.suit);
  g.addColorStop(1, '#141a2c');
  ctx.fillStyle = g;
  ctx.fill();
  rim(ctx, c.accent, 2, 12, 0.75);

  // 옷깃 — 목에서 가슴으로 내려오는 V
  ctx.beginPath();
  ctx.moveTo(-40, 20);
  ctx.lineTo(0, 76);
  ctx.lineTo(40, 20);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 3;
  ctx.stroke();
  rim(ctx, c.accent, 1.2, 8, 0.5);

  // 어깨 견장 · 가슴의 상태등 (숨 쉬는 것처럼 이 점만 조금 밝아요)
  ctx.beginPath();
  ctx.moveTo(-86, 74);
  ctx.lineTo(-52, 66);
  ctx.strokeStyle = c.accent;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.beginPath();
  ctx.arc(46, 92, 4.5, 0, TAU);
  ctx.fillStyle = c.accent;
  ctx.shadowColor = c.accent;
  ctx.shadowBlur = 12;
  ctx.fill();
  ctx.shadowBlur = 0;
}

/**
 * 목. **어깨보다 먼저** 그려요.
 * 나중에 그리면 살색 기둥이 가슴 위로 올라와서 목이 길어 보여요.
 */
function neck(ctx, c) {
  ctx.beginPath();
  roundRect(ctx, -18, -44, 36, 58, 14);
  ctx.fillStyle = c.skinShade;
  ctx.fill();
  // 턱이 드리우는 그림자 — 목이 얼굴에 붙어 있는 것처럼 보이게 해줘요
  ctx.beginPath();
  ctx.ellipse(0, -34, 20, 9, 0, 0, TAU);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fill();
}

function head(ctx, c) {
  ctx.beginPath();
  ctx.ellipse(0, -78, 43, 51, 0, 0, TAU);
  const g = ctx.createLinearGradient(-40, -120, 40, -30);
  g.addColorStop(0, c.skin);
  g.addColorStop(1, c.skinShade);
  ctx.fillStyle = g;
  ctx.fill();
  rim(ctx, c.accent, 1.6, 9, 0.55);

  // 귀
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * 43, -76, 7, 12, 0, 0, TAU);
    ctx.fillStyle = c.skinShade;
    ctx.fill();
  }
}

/**
 * 눈 — `blink`은 0(뜸)~1(감음), `look`은 시선 좌우(-1~1).
 */
function eyes(ctx, c, mood, blink, look) {
  const open = 1 - blink;
  for (const s of [-1, 1]) {
    const x = s * 17;
    const y = -80;

    // 흰자
    ctx.beginPath();
    ctx.ellipse(x, y, 11, 7.5 * open + 0.4, 0, 0, TAU);
    ctx.fillStyle = '#f7f9ff';
    ctx.fill();

    if (open > 0.25) {
      // 눈동자
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(x, y, 11, 7.5 * open, 0, 0, TAU);
      ctx.clip();
      ctx.beginPath();
      ctx.arc(x + look * 3.5, y + 0.6, 5.1, 0, TAU);
      ctx.fillStyle = '#2b3550';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + look * 3.5, y + 0.6, 2.4, 0, TAU);
      ctx.fillStyle = c.accent;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + look * 3.5 - 1.8, y - 1.6, 1.5, 0, TAU);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
    }

    // 윗눈꺼풀 선
    ctx.beginPath();
    ctx.moveTo(x - 11.5, y - 5.5 * open);
    ctx.quadraticCurveTo(x, y - 11 * open - 1.5, x + 11.5, y - 5.5 * open);
    ctx.strokeStyle = c.hair;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.stroke();

    /*
      눈썹 — 감정이 여기서 제일 크게 드러나요.
      'tense'면 안쪽(코 쪽) 끝이 내려와 찡그린 모양이 돼요. 안쪽은 부호 s로 정해져요.
    */
    const inner = mood === 'tense' ? 3 : mood === 'smile' ? -1.5 : 0;
    ctx.beginPath();
    ctx.moveTo(x - 10 * s, y - 18 - inner); // 바깥쪽 끝
    ctx.quadraticCurveTo(x, y - 23, x + 10 * s, y - 18 + inner); // 안쪽 끝
    ctx.strokeStyle = c.hair;
    ctx.lineWidth = 2.9;
    ctx.stroke();
  }
}

function faceLines(ctx, c, mood, talk) {
  // 코
  ctx.beginPath();
  ctx.moveTo(-2, -70);
  ctx.quadraticCurveTo(-5, -60, 1, -57);
  ctx.strokeStyle = c.skinShade;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.stroke();

  // 입 — 말하는 동안 위아래로 열려요
  const openMouth = talk * 6;
  ctx.beginPath();
  if (openMouth > 0.6) {
    ctx.ellipse(0, -45, 8, 2 + openMouth * 0.5, 0, 0, TAU);
    ctx.fillStyle = '#5c2f33';
    ctx.fill();
  } else if (mood === 'smile') {
    ctx.moveTo(-9, -47);
    ctx.quadraticCurveTo(0, -40, 9, -47);
    ctx.strokeStyle = '#a4595a';
    ctx.lineWidth = 2.4;
    ctx.stroke();
  } else {
    ctx.moveTo(-8, -46);
    ctx.quadraticCurveTo(0, mood === 'tense' ? -48 : -44.5, 8, -46);
    ctx.strokeStyle = '#a4595a';
    ctx.lineWidth = 2.4;
    ctx.stroke();
  }
}

function hairDoyun(ctx, c) {
  // 짧고 위로 쓸어올린 머리
  ctx.beginPath();
  ctx.moveTo(-45, -84);
  ctx.bezierCurveTo(-49, -126, -18, -140, 6, -132);
  ctx.bezierCurveTo(34, -142, 50, -118, 45, -86);
  ctx.bezierCurveTo(40, -104, 28, -113, 12, -110);
  ctx.bezierCurveTo(-8, -106, -26, -100, -36, -88);
  ctx.closePath();
  const g = ctx.createLinearGradient(-40, -140, 40, -84);
  g.addColorStop(0, c.hairLit);
  g.addColorStop(1, c.hair);
  ctx.fillStyle = g;
  ctx.fill();
  rim(ctx, c.accent, 1.6, 10, 0.6);

  /*
    앞머리는 **헤어라인 위쪽에만** 얹어요.
    이마 한가운데(-100 부근)까지 내려오면 눈썹과 나란히 놓여서
    눈썹이 네 개 있는 것처럼 보여요.
  */
  ctx.beginPath();
  ctx.moveTo(-30, -118);
  ctx.quadraticCurveTo(-16, -110, -26, -101);
  ctx.moveTo(24, -122);
  ctx.quadraticCurveTo(12, -112, 22, -103);
  ctx.strokeStyle = c.hair;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.stroke();
}

function hairSeorin(ctx, c) {
  // 뒤로 흐르는 단발 — 얼굴 옆으로 두 갈래가 내려와요
  ctx.beginPath();
  ctx.moveTo(-48, -60);
  ctx.bezierCurveTo(-64, -100, -46, -140, 0, -137);
  ctx.bezierCurveTo(46, -140, 64, -100, 48, -60);
  ctx.bezierCurveTo(52, -20, 44, 6, 38, 16);
  ctx.lineTo(28, 12);
  ctx.bezierCurveTo(38, -18, 38, -60, 34, -84);
  ctx.bezierCurveTo(26, -104, 10, -112, -4, -110);
  ctx.bezierCurveTo(-22, -108, -34, -98, -36, -80);
  ctx.bezierCurveTo(-38, -56, -38, -18, -28, 12);
  ctx.lineTo(-38, 16);
  ctx.bezierCurveTo(-44, 6, -52, -20, -48, -60);
  ctx.closePath();
  const g = ctx.createLinearGradient(-50, -140, 50, 16);
  g.addColorStop(0, c.hairLit);
  g.addColorStop(0.55, c.hair);
  g.addColorStop(1, '#120c14');
  ctx.fillStyle = g;
  ctx.fill();
  rim(ctx, c.accent, 1.6, 10, 0.6);

}

/**
 * 서린의 앞머리 — **얼굴을 그린 뒤에** 얹어요.
 * 뒷머리만 그리면 정수리부터 이마까지가 전부 살색이라 대머리처럼 보여요.
 */
function hairSeorinFront(ctx, c) {
  ctx.beginPath();
  // 바깥선: 왼쪽 옆머리 → 정수리 → 오른쪽 옆머리
  ctx.moveTo(-47, -68);
  ctx.bezierCurveTo(-55, -120, -22, -143, 0, -141);
  ctx.bezierCurveTo(24, -143, 55, -120, 47, -68);
  // 안쪽선: 오른쪽에서 가르마를 지나 왼쪽으로 되돌아오며 이마를 드러내요
  ctx.lineTo(36, -72);
  ctx.bezierCurveTo(39, -96, 31, -110, 9, -117);
  ctx.lineTo(-5, -131);
  ctx.bezierCurveTo(-21, -116, -33, -104, -35, -84);
  ctx.lineTo(-36, -68);
  ctx.closePath();

  const g = ctx.createLinearGradient(-40, -142, 40, -68);
  g.addColorStop(0, c.hairLit);
  g.addColorStop(1, c.hair);
  ctx.fillStyle = g;
  ctx.fill();
  rim(ctx, c.accent, 1.5, 9, 0.55);
}

/** 헤드셋 — 둘 다 관제와 교신 중이라는 걸 한눈에 보여줘요. */
function headset(ctx, c, t) {
  ctx.beginPath();
  ctx.arc(0, -80, 52, Math.PI * 1.18, Math.PI * 1.82);
  ctx.strokeStyle = '#39415c';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.stroke();

  // 왼쪽 이어컵 + 마이크 붐
  ctx.beginPath();
  roundRect(ctx, -60, -92, 18, 30, 8);
  ctx.fillStyle = '#2b3145';
  ctx.fill();
  rim(ctx, c.accent, 1.4, 8, 0.7);

  ctx.beginPath();
  ctx.moveTo(-52, -62);
  ctx.quadraticCurveTo(-46, -40, -24, -42);
  ctx.strokeStyle = '#39415c';
  ctx.lineWidth = 3.4;
  ctx.stroke();

  // 교신 표시등 — 천천히 깜빡여요
  const blink = 0.45 + Math.abs(Math.sin(t * 2.2)) * 0.55;
  ctx.beginPath();
  ctx.arc(-22, -42, 3.4, 0, TAU);
  ctx.fillStyle = c.accent;
  ctx.globalAlpha = blink;
  ctx.shadowColor = c.accent;
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

/* ────────────────────────────── 공개 */

/**
 * 인물 상반신을 그려요. 호출한 쪽에서 translate/scale을 잡아주세요.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {'doyun'|'seorin'} id
 * @param {number} t 흐른 시간(초) — 숨쉬기·눈깜빡임에 써요
 * @param {{mood?: 'calm'|'tense'|'smile', talk?: number, look?: number}} [opts]
 *        talk: 0~1, 지금 말하는 중인지 (입이 움직여요)
 */
export function drawCharacter(ctx, id, t, { mood = 'calm', talk = 0, look = 0 } = {}) {
  const c = CAST[id];
  if (!c) return;

  // 4초에 한 번, 0.14초 동안 눈을 감아요. 규칙적이면 로봇 같아서 사람마다 위상을 달리 줘요.
  const phase = id === 'doyun' ? 0 : 1.7;
  const cyc = (t + phase) % 4;
  const blink = cyc < 0.14 ? Math.sin((cyc / 0.14) * Math.PI) : 0;

  ctx.save();
  ctx.translate(0, Math.sin(t * 1.4 + phase) * 2.4); // 숨쉬기
  ctx.lineJoin = 'round';

  if (c.long) hairSeorin(ctx, c); // 긴 머리는 어깨 뒤로 넘어가야 해서 먼저
  neck(ctx, c);
  shoulders(ctx, c); // 옷깃이 목 아래를 덮어요
  head(ctx, c);
  if (c.long) hairSeorinFront(ctx, c);
  else hairDoyun(ctx, c);
  eyes(ctx, c, mood, blink, look);
  faceLines(ctx, c, mood, talk);
  headset(ctx, c, t);

  ctx.restore();
}

/**
 * 관제 AI ORBIT — 얼굴 대신 육각 코어와 파형으로 존재를 알려요.
 */
export function drawOrbitAI(ctx, t, talk = 0) {
  const a = ORBIT.accent;
  ctx.save();
  ctx.translate(0, -40);

  // 바깥 육각 링 (천천히 회전)
  for (let ring = 0; ring < 2; ring++) {
    const r = 74 + ring * 26;
    ctx.save();
    ctx.rotate(t * (ring ? -0.24 : 0.36));
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * TAU;
      const x = Math.cos(ang) * r;
      const y = Math.sin(ang) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = a;
    ctx.globalAlpha = ring ? 0.25 : 0.5;
    ctx.lineWidth = ring ? 1.5 : 2.5;
    ctx.shadowColor = a;
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.restore();
  }

  // 코어
  const pulse = 1 + Math.sin(t * 3) * 0.06 + talk * 0.12;
  ctx.beginPath();
  ctx.arc(0, 0, 30 * pulse, 0, TAU);
  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 30 * pulse);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, a);
  g.addColorStop(1, 'rgba(125,255,176,0)');
  ctx.fillStyle = g;
  ctx.fill();

  // 음성 파형 — 말할 때만 크게 흔들려요
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const x = -60 + i * 3;
    const env = Math.sin((i / 40) * Math.PI);
    const y = 66 + Math.sin(i * 0.9 + t * 14) * 16 * env * (0.18 + talk);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = a;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 2;
  ctx.shadowColor = a;
  ctx.shadowBlur = 10;
  ctx.stroke();

  ctx.restore();
}

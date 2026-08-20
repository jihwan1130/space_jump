/**
 * 캔버스 좌표계 — 논리 해상도(480×가변)를 기기 화면에 정확히 얹어요.
 *
 * `game.js`가 겪은 문제를 그대로 겪는 자리라 로직도 그대로 가져왔어요.
 *  - 토스 웹뷰가 devicePixelRatio를 1로 보고해서 캔버스가 1/3 해상도로 그려지는 일
 *  - style로 지정한 크기와 실제로 차지하는 CSS 크기가 어긋나는 일
 * 두 가지를 모두 방어합니다. (자세한 배경은 game.js의 probeDpr 주석 참고)
 *
 * game.js는 이 모듈을 쓰지 않아요. 이미 출시된 번들의 렌더링 핵심을 건드리지 않으려고
 * 스토리 모드(2.0)만 여기를 씁니다. 한쪽을 고치면 다른 쪽도 같이 봐주세요.
 */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{logicalW?: number, minH?: number, maxH?: number}} [opts]
 */
export function createViewport(canvas, { logicalW = 480, minH = 720, maxH = 1120 } = {}) {
  const W = logicalW;

  let H = 854;
  let scale = 1;
  let ox = 0;
  let oy = 0;
  let dpr = 1;
  let vw = 1;
  let vh = 1;
  let cssW = 1;
  let cssH = 1;
  let insets = { top: 0, bottom: 0, left: 0, right: 0 };
  /** 화면 아래쪽에서 못 쓰는 높이(CSS px). 하단 배너 광고가 차지해요. */
  let bottomReserve = 0;

  /** ResizeObserver가 알려주는 실제 기기 픽셀 수 (지원 안 하면 null) */
  let measured = null;
  /** 브라우저가 끝내 받아주지 않은 백버퍼 크기 — 매 프레임 헛되이 재시도하지 않으려고 */
  let refused = null;

  function probeDpr() {
    const reported = window.devicePixelRatio || 1;

    let queried = 0;
    if (typeof window.matchMedia === 'function') {
      let lo = 0.5;
      let hi = 4;
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2;
        if (window.matchMedia(`(min-resolution: ${mid.toFixed(4)}dppx)`).matches) lo = mid;
        else hi = mid;
      }
      queried = (lo + hi) / 2;
      if (Math.abs(queried - Math.round(queried)) < 0.02) queried = Math.round(queried);
    }

    let d = Math.max(reported, queried);
    // 요즘 휴대폰에 1배 화면은 없어요. 여기까지 와서 1이면 웹뷰가 잘못 보고한 거예요.
    if (d <= 1.01 && Math.min(vw, vh) <= 820) d = 3;
    return clamp(d, 1, 3);
  }

  function wantedBacking() {
    if (measured) return { w: measured.w, h: measured.h };
    const d = probeDpr();
    return { w: Math.round(cssW * d), h: Math.round(cssH * d) };
  }

  function resize() {
    const vv = window.visualViewport;
    const askedW = Math.max(1, Math.round(vv?.width || window.innerWidth));
    // 아래쪽 배너 광고 자리는 빼고 재요. (game.js resize()의 같은 주석 참고)
    const askedH = Math.max(1, Math.round((vv?.height || window.innerHeight) - bottomReserve));

    canvas.style.width = `${askedW}px`;
    canvas.style.height = `${askedH}px`;

    // style을 먹인 뒤 **실제로** 몇 CSS px을 차지하는지 되재요.
    const rect = canvas.getBoundingClientRect();
    cssW = Math.max(1, Math.round(rect.width) || askedW);
    cssH = Math.max(1, Math.round(rect.height) || askedH);
    vw = cssW;
    vh = cssH;

    H = clamp((W * vh) / vw, minH, maxH);
    scale = Math.min(vw / W, vh / H);
    ox = (vw - W * scale) / 2;
    oy = (vh - H * scale) / 2;

    const { w: bw, h: bh } = wantedBacking();
    // 같은 값을 다시 대입하면 캔버스가 통째로 지워져요.
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;

    dpr = canvas.width / cssW;
  }

  let ro = null;
  try {
    ro = new ResizeObserver((entries) => {
      const box = entries[0]?.devicePixelContentBoxSize?.[0];
      if (!box) return;
      if (measured && measured.w === box.inlineSize && measured.h === box.blockSize) return;
      measured = { w: box.inlineSize, h: box.blockSize };
      refused = null;
      resize();
    });
    ro.observe(canvas, { box: 'device-pixel-content-box' });
  } catch {
    ro = null;
  }

  let resizeRaf = 0;
  const queueResize = () => {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      refused = null;
      resize();
    });
  };
  window.addEventListener('resize', queueResize);
  window.addEventListener('orientationchange', queueResize);
  window.visualViewport?.addEventListener('resize', queueResize);
  resize();

  return {
    W,
    get H() {
      return H;
    },
    get vw() {
      return vw;
    },
    get vh() {
      return vh;
    },
    get dpr() {
      return dpr;
    },

    /** 화면 px → 논리 px */
    toLogicalX: (px) => (px - ox) / scale,
    toLogicalY: (py) => (py - oy) / scale,

    setInsets(v) {
      insets = v;
      resize();
    },

    /** 화면 아래쪽에서 못 쓰는 높이(CSS px). 하단 배너 광고가 이걸 정해요. */
    setBottomReserve(px) {
      const v = Math.max(0, Math.round(px) || 0);
      if (v === bottomReserve) return;
      bottomReserve = v;
      refused = null;
      resize();
    },

    /** HUD를 안전하게 그릴 수 있는 안쪽 여백(논리 px) */
    hudBox() {
      return {
        top: clamp((insets.top - oy) / scale, 0, H) + 10,
        left: clamp((insets.left - ox) / scale, 0, W) + 18,
        right: clamp((vw - insets.right - ox) / scale, 0, W) - 18,
        bottom: clamp((vh - insets.bottom - oy) / scale, 0, H) - 10,
      };
    },

    /**
     * 크기를 강제로 다시 재요.
     *
     * 캔버스가 `display:none`이던 동안에는 getBoundingClientRect가 0이라
     * cssW/cssH가 1로 잡혀 있어요. 다시 보이게 만든 **직후에** 이걸 불러야
     * 백버퍼가 화면 크기에 맞춰집니다.
     *
     * ResizeObserver의 device-pixel-content-box를 지원하는 브라우저는 스스로 따라잡지만,
     * 미지원 브라우저(구형 사파리 등)에서는 `ensure()`가 "1×dpr이 맞다"고 판단해
     * 영영 작은 백버퍼로 남아요.
     */
    refresh() {
      refused = null;
      resize();
    },

    /** 매 프레임 맨 앞에서 불러요. 백버퍼가 어긋났으면 바로잡아요. */
    ensure() {
      const want = wantedBacking();
      if (canvas.width === want.w && canvas.height === want.h) return;
      if (refused && refused.w === want.w && refused.h === want.h) return;
      resize();
      if (canvas.width !== want.w || canvas.height !== want.h) refused = want;
    },

    /** 기기 픽셀 좌표계 (레터박스까지 포함한 화면 전체) */
    device(ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },

    /** 논리 좌표계 (0,0)~(W,H) */
    logical(ctx) {
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, ox * dpr, oy * dpr);
    },

    destroy() {
      cancelAnimationFrame(resizeRaf);
      window.removeEventListener('resize', queueResize);
      window.removeEventListener('orientationchange', queueResize);
      window.visualViewport?.removeEventListener('resize', queueResize);
      ro?.disconnect();
    },
  };
}

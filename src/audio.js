/**
 * 사운드 — 효과음(SFX)과 배경음(BGM)을 WebAudio 신스로 직접 만들어요.
 * 오디오 파일이 없어서 번들이 가볍고, 첫 화면이 빨리 떠요.
 *
 * 출시 가이드 대응
 *  - 사용자가 직접 켜고 끌 수 있어요. (setEnabled / 설정은 세이브에 저장)
 *  - 백그라운드로 가면 즉시 멈추고(suspend), 돌아오면 다시 재생해요(resume).
 *  - 광고가 재생되는 동안에도 같은 방식으로 멈춰요.
 */

const BGM_STEP = 0.5; // 8분음표 한 칸 길이(초)
const LOOKAHEAD = 0.25; // 이만큼 앞의 음을 미리 예약해요

export const audio = {
  ctx: null,
  master: null,
  bgmGain: null,
  enabled: true,
  suspended: false,

  _bgmOn: false,
  _timer: null,
  _next: 0,
  _step: 0,
  _root: 220,

  /** 사용자 입력 시점에 호출해요. (자동 재생 정책 회피) */
  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 1 : 0;
      this.master.connect(this.ctx.destination);
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = 0.0001;
      this.bgmGain.connect(this.master);
    } catch {
      this.ctx = null;
    }
  },

  setEnabled(on) {
    this.enabled = on;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(on ? 1 : 0, t, 0.05);
    if (on) this.resume();
  },

  /** 백그라운드 전환 · 광고 재생 중 — 소리를 즉시 끊어요. */
  suspend() {
    this.suspended = true;
    this._stopScheduler();
    if (!this.ctx) return;
    try {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.value = 0;
      this.ctx.suspend?.();
    } catch {
      /* noop */
    }
  },

  /** 포그라운드 복귀 — 원래 상태로 되돌려요. */
  resume() {
    this.suspended = false;
    if (!this.ctx) return;
    try {
      this.ctx.resume?.();
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(this.enabled ? 1 : 0, t, 0.08);
    } catch {
      /* noop */
    }
    if (this._bgmOn) this._startScheduler();
  },

  _canPlay() {
    return Boolean(this.ctx) && this.enabled && !this.suspended;
  },

  /* ───────────────── 효과음 */

  play(freq, dur, type = 'sine', vol = 0.14, slide = 0) {
    if (!this._canPlay()) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  },

  noise(dur = 0.12, vol = 0.09, lp = 1200) {
    if (!this._canPlay()) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lp;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
  },

  jump() {
    this.play(520, 0.14, 'triangle', 0.12, 260);
    this.noise(0.09, 0.05, 900);
  },

  /** 콤보가 쌓일수록 음이 올라가는 펜타토닉 사다리 */
  land(combo = 1, perfect = false) {
    const steps = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    const f = 330 * Math.pow(2, steps[Math.min(steps.length - 1, combo - 1)] / 12);
    this.play(f, 0.17, 'triangle', 0.13, f * 0.2);
    setTimeout(() => this.play(f * 1.5, 0.13, 'sine', 0.075), 55);
    if (perfect) setTimeout(() => this.play(f * 2, 0.2, 'sine', 0.085, f * 0.6), 20);
  },

  praise() {
    this.play(880, 0.1, 'square', 0.07, 300);
    setTimeout(() => this.play(1320, 0.16, 'square', 0.06, 260), 80);
  },

  stage() {
    this.play(440, 0.12, 'square', 0.1, 200);
    setTimeout(() => this.play(660, 0.22, 'square', 0.1, 160), 110);
    setTimeout(() => this.play(880, 0.3, 'square', 0.09, 200), 230);
  },

  warn() {
    this.play(150, 0.11, 'square', 0.055, -40);
  },

  die() {
    this.play(220, 0.45, 'sawtooth', 0.13, -170);
    this.noise(0.5, 0.12, 2600);
  },

  reward() {
    [0, 4, 7, 12].forEach((s, i) => {
      setTimeout(() => this.play(440 * Math.pow(2, s / 12), 0.22, 'triangle', 0.1), i * 90);
    });
  },

  /* ───────────────── 배경음 */

  /** 스테이지가 오르면 조성이 조금씩 올라가요. */
  setStage(stage) {
    const semis = [0, 2, 3, 5, 7, 8, 10, 12];
    this._root = 165 * Math.pow(2, semis[(stage - 1) % semis.length] / 12);
  },

  startBgm() {
    this._bgmOn = true;
    if (!this.ctx) return;
    this.bgmGain.gain.setTargetAtTime(0.5, this.ctx.currentTime, 0.6);
    this._startScheduler();
  },

  stopBgm() {
    this._bgmOn = false;
    this._stopScheduler();
    if (!this.ctx) return;
    this.bgmGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.3);
  },

  _startScheduler() {
    if (this._timer || !this.ctx) return;
    this._next = this.ctx.currentTime + 0.06;
    this._timer = setInterval(() => this._tick(), 90);
  },

  _stopScheduler() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  },

  _tick() {
    if (!this._canPlay() || !this._bgmOn) return;
    while (this._next < this.ctx.currentTime + LOOKAHEAD) {
      this._scheduleNote(this._next, this._step);
      this._next += BGM_STEP;
      this._step = (this._step + 1) % 16;
    }
  },

  _scheduleNote(time, step) {
    const root = this._root;
    // 4마디짜리 아르페지오 — 낮고 잔잔하게
    const pattern = [0, 7, 12, 7, 3, 10, 15, 10, 0, 7, 12, 16, 5, 12, 17, 12];
    const semi = pattern[step];
    const freq = root * Math.pow(2, semi / 12);

    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1400;
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq, time);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.055, time + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, time + BGM_STEP * 1.6);
    o.connect(f);
    f.connect(g);
    g.connect(this.bgmGain);
    o.start(time);
    o.stop(time + BGM_STEP * 1.8);

    // 마디 첫 박에는 낮은 패드를 깔아요.
    if (step % 8 === 0) {
      const p = this.ctx.createOscillator();
      const pg = this.ctx.createGain();
      p.type = 'sine';
      p.frequency.setValueAtTime(root / 2, time);
      pg.gain.setValueAtTime(0.0001, time);
      pg.gain.exponentialRampToValueAtTime(0.05, time + 0.5);
      pg.gain.exponentialRampToValueAtTime(0.0001, time + BGM_STEP * 8);
      p.connect(pg);
      pg.connect(this.bgmGain);
      p.start(time);
      p.stop(time + BGM_STEP * 8.2);
    }
  },
};

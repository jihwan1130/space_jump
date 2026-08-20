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
const BAR = 8; // 한 마디 = 8칸 (4초)
const LOOP = BAR * 4; // 4마디 한 바퀴 (16초)

/**
 * 코드 진행 — 자연 단음계의 i · ♭VI · ♭III · ♭VII.
 * 해결되지 않고 계속 떠 있는 느낌이라 "항해 중"이라는 인상을 줘요.
 * 숫자는 루트음 기준 반음 거리예요.
 */
const PROGRESSION = [
  { bass: 0, pad: [0, 7, 15], arp: [0, 7, 12, 15, 19] },
  { bass: -4, pad: [8, 12, 15], arp: [8, 12, 15, 20, 24] },
  { bass: 3, pad: [3, 10, 19], arp: [3, 10, 15, 19, 22] },
  { bass: -2, pad: [10, 14, 17], arp: [10, 14, 17, 22, 26] },
];

/** 아르페지오가 코드 안에서 오르내리는 순서 */
const ARP_PATH = [0, 2, 1, 3, 2, 4, 3, 1];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const audio = {
  ctx: null,
  master: null,
  bgmGain: null,
  sfxGain: null,

  /** 전체 켬/끔 (설정의 마스터 스위치 대신 음량 0으로도 쓸 수 있어요) */
  enabled: true,
  /** 효과음만 끄기 */
  sfxOn: true,
  /** 배경음만 끄기 */
  bgmOn: true,
  /** 마스터 볼륨 0~1 */
  volume: 0.8,

  suspended: false,

  reverb: null,
  echo: null,
  /** 배경음이 잔향·에코로 보내는 몫을 따로 끊기 위한 관문 (setBgm이 여닫아요) */
  bgmToReverb: null,
  bgmToEcho: null,

  _bgmOn: false,
  /** 울리고 있는 경보 사이렌 노드 묶음 (스토리 모드) — 없으면 null */
  _siren: null,
  _timer: null,
  _next: 0,
  _step: 0,
  _root: 220,
  _bright: 1,

  /** 사용자 입력 시점에 호출해요. (자동 재생 정책 회피) */
  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this._masterLevel();
      this.master.connect(this.ctx.destination);

      // BGM과 효과음을 따로 끌 수 있게 버스를 나눠요.
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = 0.0001;
      this.bgmGain.connect(this.master);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxOn ? 1 : 0;
      this.sfxGain.connect(this.master);
    } catch {
      this.ctx = null;
      return;
    }
    try {
      this._buildSpace();
    } catch (e) {
      // 공간계가 실패해도 마른 소리로는 계속 들려야 해요.
      console.warn('[space-jump] 잔향·에코를 만들지 못했어요', e);
      this.reverb = null;
      this.echo = null;
    }
  },

  /**
   * 공간계 이펙트 — 이 게임 소리가 "우주에 떠 있는" 것처럼 들리게 하는 핵심이에요.
   *
   *  - reverb: 잡음으로 만든 임펄스 응답을 쓰는 긴 잔향. 오디오 파일 없이 넓은 공간을 만들어요.
   *  - echo: 점8분음표 지연의 반복 에코. 음 하나가 저 멀리서 되돌아오는 느낌을 줘요.
   *
   * 두 버스 모두 여기(_buildSpace)에서 한 번만 만들고 계속 재사용해요.
   */
  _buildSpace() {
    const ctx = this.ctx;

    // ── 잔향
    const seconds = 3.2;
    const len = Math.floor(ctx.sampleRate * seconds);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const decay = Math.pow(1 - i / len, 2.6);
        // 앞머리를 살짝 눌러서 "쨍"하지 않고 서서히 번지게
        const swell = Math.min(1, i / (ctx.sampleRate * 0.03));
        data[i] = (Math.random() * 2 - 1) * decay * swell;
      }
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    const revTone = ctx.createBiquadFilter();
    revTone.type = 'lowpass';
    revTone.frequency.value = 2600;
    const revGain = ctx.createGain();
    revGain.gain.value = 0.9;
    conv.connect(revTone);
    revTone.connect(revGain);
    revGain.connect(this.master);

    this.reverb = ctx.createGain(); // 여기로 보내면 잔향이 붙어요
    this.reverb.gain.value = 1;
    this.reverb.connect(conv);

    // ── 에코 (점8분음표)
    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = BGM_STEP * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.34;
    const echoTone = ctx.createBiquadFilter();
    echoTone.type = 'lowpass';
    echoTone.frequency.value = 1800;
    const echoOut = ctx.createGain();
    echoOut.gain.value = 0.55;

    delay.connect(echoTone);
    echoTone.connect(fb);
    fb.connect(delay); // 되먹임
    echoTone.connect(echoOut);
    echoOut.connect(this.master);
    echoOut.connect(this.reverb); // 되돌아온 소리에도 잔향이 붙어요

    this.echo = ctx.createGain();
    this.echo.gain.value = 1;
    this.echo.connect(delay);

    // 배경음 전용 관문.
    // BGM을 끄면 bgmGain만 내려도 잔향·에코는 공유 버스라 5초쯤 더 울려요.
    // 그래서 배경음이 보내는 몫만 따로 끊을 수 있게 중간에 문을 하나 둬요.
    this.bgmToReverb = ctx.createGain();
    this.bgmToReverb.gain.value = this.bgmOn ? 1 : 0.0001;
    this.bgmToReverb.connect(this.reverb);
    this.bgmToEcho = ctx.createGain();
    this.bgmToEcho.gain.value = this.bgmOn ? 1 : 0.0001;
    this.bgmToEcho.connect(this.echo);
  },

  /**
   * 소리 하나를 공간계 버스로 흘려보내요.
   * @param {boolean} [viaBgm] 배경음이면 true — BGM을 끌 때 같이 닫히는 문으로 보내요.
   */
  _send(node, reverb = 0, echo = 0, viaBgm = false) {
    const rev = viaBgm ? this.bgmToReverb : this.reverb;
    const ech = viaBgm ? this.bgmToEcho : this.echo;
    if (reverb > 0 && rev) {
      const g = this.ctx.createGain();
      g.gain.value = reverb;
      node.connect(g);
      g.connect(rev);
    }
    if (echo > 0 && ech) {
      const g = this.ctx.createGain();
      g.gain.value = echo;
      node.connect(g);
      g.connect(ech);
    }
  },

  /** 마스터 게인에 실제로 넣을 값 */
  _masterLevel() {
    return this.enabled ? clamp(this.volume, 0, 1) : 0;
  },

  _applyMaster(ramp = 0.05) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(this._masterLevel(), t, ramp);
  },

  setEnabled(on) {
    this.enabled = on;
    this._applyMaster();
    if (on) this.resume();
  },

  /** 마스터 볼륨 (0~1) */
  setVolume(v) {
    this.volume = clamp(Number(v) || 0, 0, 1);
    this._applyMaster(0.03);
  },

  /** 효과음만 켜고 꺼요. */
  setSfx(on) {
    this.sfxOn = on;
    if (!this.sfxGain) return;
    const t = this.ctx.currentTime;
    this.sfxGain.gain.cancelScheduledValues(t);
    this.sfxGain.gain.setTargetAtTime(on ? 1 : 0, t, 0.04);
  },

  /** 배경음만 켜고 꺼요. 끄면 스케줄러까지 멈춰서 CPU도 아껴요. */
  setBgm(on) {
    this.bgmOn = on;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (!on) {
      this.bgmGain.gain.setTargetAtTime(0.0001, t, 0.12);
      // 잔향·에코로 가는 길도 같이 닫아요. 안 그러면 끈 뒤에도 한참 울려요.
      this.bgmToReverb?.gain.setTargetAtTime(0.0001, t, 0.12);
      this.bgmToEcho?.gain.setTargetAtTime(0.0001, t, 0.12);
      this._stopScheduler();
    } else {
      this.bgmToReverb?.gain.setTargetAtTime(1, t, 0.1);
      this.bgmToEcho?.gain.setTargetAtTime(1, t, 0.1);
      if (this._bgmOn) {
        this.bgmGain.gain.setTargetAtTime(0.5, t, 0.8);
        this._startScheduler();
      }
    }
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
      this._applyMaster(0.08);
    } catch {
      /* noop */
    }
    if (this._bgmOn && this.bgmOn) this._startScheduler();
  },

  _canPlay() {
    return Boolean(this.ctx) && this.enabled && !this.suspended;
  },

  /**
   * 효과음을 만들어도 되는지.
   *
   * 효과음은 잔향·에코 버스로도 흘러가는데 그 버스는 master에 바로 붙어 있어요.
   * 그래서 sfxGain만 0으로 내리면 잔향은 그대로 들려요. 아예 만들지 않는 게 확실해요.
   */
  _canSfx() {
    return this._canPlay() && this.sfxOn;
  },

  /* ───────────────── 효과음 */

  /**
   * @param {number} [space] 잔향에 얼마나 보낼지 (0이면 마른 소리)
   * @param {number} [echo] 에코에 얼마나 보낼지
   */
  play(freq, dur, type = 'sine', vol = 0.14, slide = 0, space = 0.22, echo = 0) {
    if (!this._canSfx()) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.sfxGain);
    this._send(g, space, echo);
    o.start(t);
    o.stop(t + dur + 0.02);
  },

  noise(dur = 0.12, vol = 0.09, lp = 1200) {
    if (!this._canSfx()) return;
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
    g.connect(this.sfxGain);
    src.start(t);
  },

  jump() {
    this.play(520, 0.14, 'triangle', 0.12, 260);
    this.noise(0.09, 0.05, 900);
  },

  /** 콤보가 쌓일수록 음이 올라가는 펜타토닉 사다리 */
  land(combo = 1, perfect = false) {
    const steps = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    const idx = clamp(Math.round(combo) - 1, 0, steps.length - 1);
    const f = 330 * Math.pow(2, steps[idx] / 12);
    this.play(f, 0.17, 'triangle', 0.13, f * 0.2, 0.3, 0.16);
    setTimeout(() => this.play(f * 1.5, 0.13, 'sine', 0.075, 0, 0.3, 0.2), 55);
    if (perfect) setTimeout(() => this.play(f * 2, 0.2, 'sine', 0.085, f * 0.6, 0.42, 0.3), 20);
  },

  praise() {
    this.play(880, 0.1, 'square', 0.07, 300, 0.35, 0.3);
    setTimeout(() => this.play(1320, 0.16, 'square', 0.06, 260, 0.4, 0.34), 80);
  },

  stage() {
    this.play(440, 0.12, 'square', 0.1, 200, 0.4, 0.2);
    setTimeout(() => this.play(660, 0.22, 'square', 0.1, 160, 0.45, 0.26), 110);
    setTimeout(() => this.play(880, 0.3, 'square', 0.09, 200, 0.55, 0.34), 230);
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
      setTimeout(() => this.play(440 * Math.pow(2, s / 12), 0.22, 'triangle', 0.1, 0, 0.5, 0.3), i * 90);
    });
  },

  /** 보석 획득 — 맑게 올라가는 두 음 + 긴 잔향 */
  gem() {
    this.play(1174, 0.1, 'sine', 0.09, 0, 0.5, 0.35);
    setTimeout(() => this.play(1568, 0.22, 'sine', 0.08, 0, 0.65, 0.45), 60);
    setTimeout(() => this.play(2349, 0.3, 'sine', 0.04, 0, 0.8, 0.5), 120);
  },

  /* ───────────────── 스토리 모드 (2.0) */

  /**
   * 경보 사이렌 — "위잉 위잉".
   *
   * 두 개의 톱니파를 LFO로 함께 흔들어서 아날로그 경보기처럼 들리게 해요.
   * 한 번 켜면 `sirenStop()`을 부를 때까지 계속 울리므로,
   * 장면을 빠져나갈 때 **반드시 꺼주세요.** (안 그러면 홈에 와서도 계속 울어요)
   */
  sirenStart(vol = 0.055) {
    if (!this._canSfx() || this._siren) return;
    const t = this.ctx.currentTime;

    const out = this.ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(vol, t + 0.5);
    out.connect(this.sfxGain);
    this._send(out, 0.5, 0.12);

    // 사이렌의 "위이잉" — 0.9초 주기로 오르내리는 느린 흔들림
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 1.1;
    const lfoAmt = this.ctx.createGain();
    lfoAmt.gain.value = 190;
    lfo.connect(lfoAmt);

    const voices = [];
    for (const [freq, type, level] of [[560, 'sawtooth', 0.5], [281, 'square', 0.28]]) {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      lfoAmt.connect(o.frequency);
      const g = this.ctx.createGain();
      g.gain.value = level;
      o.connect(g);
      g.connect(out);
      o.start(t);
      voices.push(o);
    }

    lfo.start(t);
    this._siren = { out, lfo, voices };
  },

  sirenStop() {
    const s = this._siren;
    if (!s) return;
    this._siren = null;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    s.out.gain.cancelScheduledValues(t);
    s.out.gain.setValueAtTime(Math.max(0.0001, s.out.gain.value), t);
    s.out.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    // 페이드가 끝난 뒤에 멈춰요. 바로 stop하면 "툭" 하고 끊겨요.
    for (const o of s.voices) o.stop(t + 0.4);
    s.lfo.stop(t + 0.4);
  },

  /** 아군 기총 — 짧고 건조하게. 초당 여러 발이라 잔향을 거의 안 줘요. */
  laser() {
    this.play(1250, 0.055, 'square', 0.035, -620, 0.05, 0);
  },

  /** 적에게 명중 */
  ping() {
    this.play(2100, 0.04, 'square', 0.028, -400, 0.1, 0);
  },

  /**
   * 폭발. size가 클수록 낮고 길게 울려요.
   * @param {number} [size] 0.5(잔해) ~ 1.6(보스)
   */
  boom(size = 1) {
    const s = clamp(size, 0.4, 2);
    this.noise(0.3 * s, 0.1 * s, 900 / s);
    this.play(120 / s, 0.4 * s, 'sawtooth', 0.09 * s, -70, 0.4, 0.1);
  },

  /** 피격 — 아프게 들려야 해요 */
  hurt() {
    this.play(180, 0.22, 'square', 0.11, -110, 0.2, 0);
    this.noise(0.2, 0.09, 1800);
  },

  /** 보스 등장 경고음 (삐— 삐— 삐—) */
  alert() {
    for (let i = 0; i < 3; i++) {
      setTimeout(() => this.play(880, 0.16, 'square', 0.08, 0, 0.3, 0.2), i * 260);
    }
  },

  /** 조준 레이저 예고 — 점점 조여드는 소리 */
  charge(dur = 1) {
    this.play(220, dur, 'sawtooth', 0.06, 1400, 0.3, 0.1);
  },

  /** 스토리 대사 한 글자 — 아주 작게 톡톡 */
  blip() {
    this.play(1400 + Math.random() * 260, 0.022, 'square', 0.012, 0, 0, 0);
  },

  /* ───────────────── 배경음 */

  /**
   * 스테이지가 오르면 조성과 음색이 함께 변해요.
   * 조성은 조금씩 올라가고(긴장), 필터는 서서히 닫혀(어두워져) 깊은 우주로 들어가는 느낌을 줘요.
   */
  setStage(stage) {
    const semis = [0, 2, 3, 5, 7, 8, 10, 12];
    this._root = 165 * Math.pow(2, semis[(stage - 1) % semis.length] / 12);
    this._bright = Math.max(0.55, 1 - (stage - 1) * 0.05);
  },

  startBgm() {
    this._bgmOn = true;
    if (!this.ctx || !this.bgmOn) return; // 설정에서 배경음을 껐으면 그대로 둬요
    this._step = 0;
    // 우주선이 서서히 항해를 시작하듯 길게 페이드 인
    this.bgmGain.gain.setTargetAtTime(0.5, this.ctx.currentTime, 1.1);
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
      this._scheduleStep(this._next, this._step);
      this._next += BGM_STEP;
      this._step = (this._step + 1) % LOOP;
    }
  },

  /** 반음 거리 → 주파수 */
  _freq(semi) {
    return this._root * Math.pow(2, semi / 12);
  },

  /**
   * 한 칸(8분음표)에 울릴 소리를 예약해요.
   *
   * 층은 넷이에요.
   *   패드   — 마디마다 깔리는 화음. 아주 느리게 열리고 닫혀서 숨 쉬는 것처럼 들려요.
   *   베이스 — 마디 첫 박의 낮은 사인파. 바닥을 잡아줘요.
   *   아르페지오 — 코드 음을 오르내리는 짧은 음. 에코를 크게 먹여 멀리 퍼지게 해요.
   *   별종    — 두 마디에 한 번 나오는 높은 종소리. 지나가는 별 하나 같은 역할이에요.
   */
  _scheduleStep(time, step) {
    const ctx = this.ctx;
    const bar = Math.floor(step / BAR);
    const beat = step % BAR;
    const chord = PROGRESSION[bar % PROGRESSION.length];

    /* ── 마디 머리: 패드 + 베이스 */
    if (beat === 0) {
      const barLen = BGM_STEP * BAR;

      for (const semi of chord.pad) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(420 * this._bright, time);
        // 마디 안에서 서서히 열렸다가 다시 닫혀요 — 파도처럼 밀려오는 느낌
        f.frequency.linearRampToValueAtTime(1500 * this._bright, time + barLen * 0.55);
        f.frequency.linearRampToValueAtTime(500 * this._bright, time + barLen);
        f.Q.value = 3.2;

        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, time);
        g.gain.linearRampToValueAtTime(0.03, time + barLen * 0.42);
        g.gain.linearRampToValueAtTime(0.0001, time + barLen * 1.05);

        f.connect(g);
        g.connect(this.bgmGain);
        this._send(g, 0.85, 0, true);

        // 살짝 어긋난 두 오실레이터 — 넓게 퍼지는 코러스 효과
        for (const detune of [-7, 7]) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(this._freq(semi), time);
          o.detune.setValueAtTime(detune, time);
          o.connect(f);
          o.start(time);
          o.stop(time + barLen * 1.1);
        }
      }

      const bo = ctx.createOscillator();
      const bg = ctx.createGain();
      bo.type = 'sine';
      bo.frequency.setValueAtTime(this._freq(chord.bass) / 2, time);
      bg.gain.setValueAtTime(0.0001, time);
      bg.gain.linearRampToValueAtTime(0.075, time + 0.6);
      bg.gain.exponentialRampToValueAtTime(0.0001, time + barLen);
      bo.connect(bg);
      bg.connect(this.bgmGain);
      this._send(bg, 0.3, 0, true);
      bo.start(time);
      bo.stop(time + barLen + 0.1);
    }

    /* ── 아르페지오 — 쉬는 칸을 둬서 빽빽하지 않게 */
    if (beat !== 2 && beat !== 6) {
      const semi = chord.arp[ARP_PATH[beat] % chord.arp.length] + 12;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 2400 * this._bright;
      o.type = 'triangle';
      o.frequency.setValueAtTime(this._freq(semi), time);
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(beat === 0 ? 0.05 : 0.034, time + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, time + BGM_STEP * 1.4);
      o.connect(f);
      f.connect(g);
      g.connect(this.bgmGain);
      this._send(g, 0.4, 0.5, true);
      o.start(time);
      o.stop(time + BGM_STEP * 1.6);
    }

    /* ── 별종 — 두 마디에 한 번, 높은 곳에서 한 방울 */
    if (step % (BAR * 2) === BAR + 5) {
      const semi = chord.arp[chord.arp.length - 1] + 24;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(this._freq(semi), time);
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(0.03, time + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 2.4);
      o.connect(g);
      g.connect(this.bgmGain);
      this._send(g, 0.9, 0.6, true);
      o.start(time);
      o.stop(time + 2.6);
    }
  },
};

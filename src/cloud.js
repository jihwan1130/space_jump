/**
 * Supabase 연동 — 프로필(닉네임 · 보석 · 스킨) · 기록 · 랭킹.
 *
 * SDK(@supabase/supabase-js)를 쓰지 않고 PostgREST에 직접 fetch해요.
 * 미니앱은 첫 화면이 뜨는 속도가 중요한데, 이 정도 쿼리를 위해 40KB를 더 받을 이유가 없어요.
 *
 * 설계 원칙
 *  - **서버가 없어도 게임은 돌아가요.** 모든 함수는 실패하면 null을 돌려주고 조용히 넘어가요.
 *    (테이블을 아직 안 만들었거나, 비행기 모드거나, 요청이 느릴 때)
 *  - 로컬 저장(localStorage · 토스 Storage)이 항상 먼저예요. 서버는 백업 + 랭킹용이에요.
 *  - 사용자 식별키(getUserKeyForGame 해시)를 기본키로 써요. 로그인 절차가 따로 없어요.
 */
import { SUPABASE_URL, SUPABASE_KEY, LEADERBOARD_LIMIT } from './config.js';

const REST = `${SUPABASE_URL}/rest/v1`;
const TIMEOUT = 6000;

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

/** 테이블이 없거나 네트워크가 죽었을 때 매 요청마다 재시도하지 않도록 기억해 둬요. */
let disabled = false;

export const cloud = {
  get enabled() {
    return Boolean(SUPABASE_URL && SUPABASE_KEY) && !disabled;
  },

  /** 마지막으로 확인한 연결 상태 (설정 화면에 표시해요) */
  status: 'idle', // idle | ok | offline | no-table

  async _fetch(path, options = {}) {
    if (!this.enabled) return null;

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT);
    try {
      const res = await fetch(`${REST}${path}`, {
        ...options,
        headers: { ...headers, ...(options.headers || {}) },
        signal: ac.signal,
      });

      if (!res.ok) {
        const body = await res.text();
        // 테이블이 아직 없으면 더 두드려봐야 소용없어요.
        if (res.status === 404 || body.includes('PGRST205')) {
          console.warn('[space-jump] Supabase 테이블이 없어요. supabase/schema.sql을 먼저 실행해 주세요.');
          disabled = true;
          this.status = 'no-table';
          return null;
        }
        // 중복 닉네임(unique 위반)은 호출한 쪽에서 구분해야 해요.
        if (res.status === 409 || body.includes('23505')) return { _conflict: true };
        console.warn('[space-jump] Supabase 요청 실패', res.status, body.slice(0, 200));
        this.status = 'offline';
        return null;
      }

      this.status = 'ok';
      if (res.status === 204) return [];
      const text = await res.text();
      return text ? JSON.parse(text) : [];
    } catch (e) {
      if (e.name !== 'AbortError') console.warn('[space-jump] Supabase 연결 실패', e);
      this.status = 'offline';
      return null;
    } finally {
      clearTimeout(timer);
    }
  },

  /* ────────────────────────────── 프로필 */

  /** 내 프로필을 가져와요. 없으면 null. */
  async getProfile(userKey) {
    if (!userKey) return null;
    const rows = await this._fetch(
      `/players?user_key=eq.${encodeURIComponent(userKey)}&select=*&limit=1`
    );
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  },

  /**
   * 프로필을 만들거나 덮어써요. (user_key 기준 upsert)
   * @param {object} profile { user_key, nickname, gems, best_score, best_combo, plays, owned_skins, equipped_skin }
   */
  async saveProfile(profile) {
    if (!profile?.user_key) return null;
    const send = (body) =>
      this._fetch('/players', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }),
      });

    let rows = await send(profile);

    // 닉네임이 남과 겹쳐서 거절당했다면, 이름만 빼고 다시 올려요.
    // 이름 하나 때문에 보석·기록까지 저장 못 하는 건 손해가 너무 커요.
    if (rows && rows._conflict && profile.nickname) {
      const { nickname, ...rest } = profile;
      rows = await send(rest);
    }

    if (rows && rows._conflict) return null;
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  },

  /**
   * 닉네임이 이미 쓰이고 있는지 확인해요.
   * @returns {Promise<boolean|null>} true=사용중, false=사용가능, null=확인 실패
   */
  async isNicknameTaken(nickname, myKey) {
    const rows = await this._fetch(
      `/players?nickname=eq.${encodeURIComponent(nickname)}&select=user_key&limit=1`
    );
    if (!Array.isArray(rows)) return null;
    if (!rows.length) return false;
    return rows[0].user_key !== myKey; // 내가 이미 쓰던 이름이면 중복 아님
  },

  /**
   * 닉네임만 바꿔요. DB의 unique 제약이 최종 심판이에요.
   * (확인 후 저장 사이에 다른 사람이 먼저 가져갈 수 있어서, 충돌을 따로 알려줘요.)
   * @returns {Promise<'ok'|'taken'|'failed'>}
   */
  async setNickname(userKey, nickname) {
    if (!userKey) return 'failed';
    const rows = await this._fetch(`/players?user_key=eq.${encodeURIComponent(userKey)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ nickname, updated_at: new Date().toISOString() }),
    });
    if (rows && rows._conflict) return 'taken';
    if (!Array.isArray(rows)) return 'failed';
    return rows.length ? 'ok' : 'failed';
  },

  /* ────────────────────────────── 기록 */

  /** 한 판이 끝난 뒤 기록을 남겨요. 실패해도 게임 흐름을 막지 않아요. */
  async addRun(userKey, run) {
    if (!userKey) return null;
    return this._fetch('/runs', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_key: userKey,
        score: run.score | 0,
        stage: run.stage | 0,
        landed: run.landed | 0,
        best_combo: run.bestCombo | 0,
        gems: run.gems | 0,
        revives: run.revives | 0,
        reason: String(run.reason || '').slice(0, 40),
      }),
    });
  },

  /* ────────────────────────────── 랭킹 */

  /** 최고 점수 상위 목록 */
  async leaderboard(limit = LEADERBOARD_LIMIT) {
    const rows = await this._fetch(
      `/players?select=nickname,best_score,best_combo,user_key&best_score=gt.0` +
        `&order=best_score.desc,best_combo.desc&limit=${limit}`
    );
    return Array.isArray(rows) ? rows : null;
  },

  /**
   * 내 순위 — 나보다 점수가 높은 사람 수 + 1.
   * count 헤더만 받아오면 되니 본문은 비워요.
   */
  async myRank(bestScore) {
    if (!(bestScore > 0)) return null;
    if (!this.enabled) return null;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT);
    try {
      const res = await fetch(`${REST}/players?select=user_key&best_score=gt.${bestScore | 0}`, {
        headers: { ...headers, Prefer: 'count=exact', Range: '0-0' },
        signal: ac.signal,
      });
      if (!res.ok) return null;
      const range = res.headers.get('content-range'); // "0-0/123"
      const total = range && range.split('/')[1];
      if (!total || total === '*') return null;
      return Number(total) + 1;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  },
};

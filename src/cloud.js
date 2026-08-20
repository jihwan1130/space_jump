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

  /**
   * @param {string} path PostgREST 경로
   * @param {object} options fetch 옵션 + `optional`
   *   `optional: true`면 이 테이블이 없어도 **연동 전체를 끄지 않아요.**
   *   나중에 추가한 테이블(tutorial_progress처럼)은 아직 안 만든 프로젝트가 있을 수 있는데,
   *   그것 때문에 프로필·랭킹까지 같이 죽으면 안 되니까요.
   */
  async _fetch(path, { optional = false, ...options } = {}) {
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
          if (optional) return null;
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
   * 이 계정의 서버 기록을 통째로 지워요. (설정 화면의 「계정 초기화」)
   *
   * 표를 직접 delete하지 않고 함수를 불러요. anon 키에 delete 권한을 열면
   * 그 키를 가진 누구든 표 전체를 비울 수 있거든요. 함수는 user_key 하나만 지워요.
   * (supabase/schema.sql의 delete_account)
   *
   * players 한 줄이 사라지면 runs · achievements · tutorial_progress도 따라 지워져요.
   *
   * @returns {Promise<boolean>} 지웠는지. false면 서버가 아직 그대로예요.
   */
  async deleteAccount(userKey) {
    if (!userKey) return false;
    const res = await this._fetch('/rpc/delete_account', {
      method: 'POST',
      /*
        optional을 꼭 켜둬야 해요.

        아직 schema.sql을 안 돌린 프로젝트에서는 이 함수가 없어서 404가 와요.
        optional이 없으면 _fetch가 그걸 "테이블이 통째로 없다"로 보고 **연동 전체를
        꺼버려요.** 초기화 버튼 한 번 눌렀다가 그 세션 내내 랭킹·저장이 죽는 거예요.
        여기서는 조용히 실패(null)하고, 부르는 쪽이 "못 지웠다"고 알려주면 돼요.
      */
      optional: true,
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ p_user_key: userKey }),
    });
    // 실패(null)와 성공(빈 배열)을 구분해야 해요. 실패했는데 지운 척하면 안 돼요.
    return res !== null;
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

  /* ────────────────────────────── 튜토리얼
     테이블은 supabase/tutorial.sql로 따로 만들어요. (없어도 게임은 그대로 돌아가요) */

  /**
   * 튜토리얼을 깼는지 확인해요.
   *
   * 보상(보석 100개) 수령 여부는 여기 없어요. 그건 다른 업적들과 똑같이
   * achievements 쪽에 있어요. (getAchievements)
   *
   * @returns {Promise<{cleared:boolean, version:number}|null>} null = 확인 실패
   */
  async getTutorial(userKey) {
    if (!userKey) return null;
    const rows = await this._fetch(
      `/tutorial_progress?user_key=eq.${encodeURIComponent(userKey)}&select=cleared,cleared_version&limit=1`,
      { optional: true }
    );
    if (!Array.isArray(rows)) return null;
    if (!rows.length) return { cleared: false, version: 0 };
    return {
      cleared: rows[0].cleared === true,
      version: Number(rows[0].cleared_version) || 0,
    };
  },

  /**
   * 튜토리얼 결과를 남겨요. (user_key 기준 upsert)
   *
   * 실패해도 조용히 넘어가요. 서버가 몰라도 로컬 세이브에 남아 있어서
   * 같은 기기에서는 튜토리얼이 다시 뜨지 않아요.
   */
  async saveTutorial(userKey, { cleared = true, version = 1, retries = 0, skipped = false } = {}) {
    if (!userKey) return null;
    return this._fetch('/tutorial_progress', {
      method: 'POST',
      optional: true,
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        user_key: userKey,
        cleared,
        cleared_version: cleared ? version : 0,
        retries: retries | 0,
        skipped,
        cleared_at: cleared ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }),
    });
  },

  /* ────────────────────────────── 업적(칭호)
     테이블은 supabase/achievements.sql로 따로 만들어요. (없어도 게임은 그대로 돌아가요) */

  /**
   * 내가 가진 업적과 **보상을 받았는지**.
   *
   * 둘을 같이 가져오는 게 중요해요. 얻은 것만 알고 받았는지를 모르면,
   * 앱을 지웠다 깐 사람에게 보석을 한 번 더 주게 돼요.
   *
   * @returns {Promise<{code:string, claimed:boolean}[]|null>}
   *          null = 확인 실패(서버 문제 · 테이블 없음)
   */
  async getAchievements(userKey) {
    if (!userKey) return null;
    const rows = await this._fetch(
      `/achievements?user_key=eq.${encodeURIComponent(userKey)}&select=code,claimed_at`,
      { optional: true }
    );
    if (!Array.isArray(rows)) return null;
    // claimed_at 컬럼을 아직 안 붙인 프로젝트에서는 undefined가 와요 → "안 받음"으로 봐요.
    return rows.map((r) => ({ code: r.code, claimed: Boolean(r.claimed_at) }));
  },

  /**
   * 업적 보상(보석)을 받았다고 남겨요.
   *
   * 이미 있는 줄을 고치는 거라 PATCH를 써요. upsert로 하면 업적을 아직 안 올린
   * 상태에서 "받았다"만 있는 유령 줄이 생길 수 있어요.
   * 되돌리기·남의 줄 고치기는 서버 트리거가 막아요. (supabase/achievements.sql)
   */
  async claimAchievementReward(userKey, code, gems = 0) {
    if (!userKey || !code) return null;
    return this._fetch(
      `/achievements?user_key=eq.${encodeURIComponent(userKey)}&code=eq.${encodeURIComponent(code)}`,
      {
        method: 'PATCH',
        optional: true,
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ claimed_at: new Date().toISOString(), reward_gems: gems | 0 }),
      }
    );
  },

  /**
   * 새로 얻은 업적을 올려요.
   *
   * ⚠️ `?on_conflict=user_key,code`가 **꼭 있어야** 해요.
   *
   * achievements의 기본키는 id(identity)라, 이걸 안 알려주면 PostgREST가
   * "id가 겹치는지"만 보고 넘겨요. 그러면 (user_key, code) unique 제약에 걸린 게
   * 그대로 23505로 튀어나오고, **여러 개를 한 번에 보낼 때 그중 하나만 이미 있어도
   * 배열 전체가 통째로 거절돼요.** (한 문장으로 insert 되니까요)
   * 나머지 새 업적까지 같이 날아가는 조용한 데이터 손실이에요.
   *
   * on_conflict을 붙이면 이미 있는 건 조용히 건너뛰고 새 것만 들어가요.
   * 그래서 켤 때마다 통째로 올려도 안전합니다.
   */
  async addAchievements(userKey, codes) {
    if (!userKey || !codes?.length) return null;
    return this._fetch('/achievements?on_conflict=user_key,code', {
      method: 'POST',
      optional: true,
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(codes.map((code) => ({ user_key: userKey, code }))),
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

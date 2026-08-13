/**
 * 닉네임 규칙 — 만들기 · 검사 · 정리.
 *
 * 중복 검사는 DB를 봐야 하니 여기서 하지 않고 cloud.js가 맡아요.
 * 이 파일은 네트워크 없이 판단할 수 있는 것만 다뤄요.
 */

/** 닉네임 길이 제한 (한글 기준으로 넉넉하게) */
export const NICK_MIN = 2;
export const NICK_MAX = 12;

/**
 * 금칙어.
 *
 * 완벽한 필터는 존재하지 않아요. 여기서는 "대놓고 쓴 욕"을 막는 1차 방어선만 담당하고,
 * 우회 표기(ㅅㅂ, 시1발 …)는 아래 normalize()가 자모·숫자·기호를 걷어낸 뒤 비교해서 잡아요.
 * 신고 기능이 필요해지면 그때 서버 쪽 필터를 덧붙이는 걸 권해요.
 */
const BANNED = [
  // 한국어
  '시발', '씨발', '씨빨', '시바', '씨바', '신발년', '병신', '븅신', '지랄', '좆', '족까',
  '개새끼', '새끼', '니미', '니애미', '애미', '애비', '창녀', '창놈', '보지', '자지',
  '섹스', '야동', '강간', '자살', '죽어라', '꺼져', '엠창', '느금', '노무현', '한남', '김치녀',
  '똥꼬', '항문', '고자', '장애인', '틀딱', '급식충', '한녀', '메갈', '일베',
  // 영어
  'fuck', 'fuk', 'shit', 'bitch', 'bastard', 'asshole', 'dick', 'cock', 'pussy',
  'cunt', 'slut', 'whore', 'rape', 'nigger', 'nigga', 'faggot', 'retard', 'sex', 'porn',
  // 사칭 방지
  '관리자', '운영자', '운영진', 'admin', 'administrator', 'gm', 'system', '시스템', '토스', 'toss',
];

/** 자모 분해 표기(ㅅㅂ 같은 것)까지 잡기 위한 축약형 */
const BANNED_JAMO = ['ㅅㅂ', 'ㅄ', 'ㅂㅅ', 'ㅈㄹ', 'ㄲㅈ', 'ㄷㅊ', 'ㅆㅂ', 'ㄱㅅㄲ', 'ㅈ같'];

/**
 * 비교용으로 문자열을 납작하게 만들어요.
 * 공백 · 숫자 · 기호를 걷어내고 소문자로 바꿔서, 사이에 뭘 끼워 넣어 우회하는 걸 막아요.
 * (예: "시1발", "s h i t", "f_u_c_k")
 */
function normalize(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\s\d._\-*!@#$%^&+=~`'"(),<>?/\\|[\]{}]/g, '');
}

/** 보이지 않는 문자 · 조합 문자로 장난치는 걸 막아요. */
function stripInvisible(s) {
  // 제어문자 · zero-width · 방향 제어 문자
  return String(s).replace(
    /[\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g,
    ''
  );
}

/** 앞뒤 공백을 없애고 연속 공백을 하나로 줄여요. */
export function sanitizeNickname(raw) {
  return stripInvisible(raw).replace(/\s+/g, ' ').trim();
}

/** 욕설·사칭어가 들어 있는지 */
export function hasBannedWord(nickname) {
  const flat = normalize(nickname);
  if (!flat) return false;
  if (BANNED.some((w) => flat.includes(w))) return true;
  const raw = String(nickname).toLowerCase().replace(/\s/g, '');
  return BANNED_JAMO.some((w) => raw.includes(w));
}

/**
 * 닉네임이 규칙에 맞는지 검사해요.
 * @returns {{ ok: true, value: string } | { ok: false, reason: string }}
 */
export function validateNickname(raw) {
  const value = sanitizeNickname(raw);

  if (!value) return { ok: false, reason: '닉네임을 입력해 주세요.' };
  if (value.length < NICK_MIN) return { ok: false, reason: `${NICK_MIN}글자 이상으로 지어 주세요.` };
  if (value.length > NICK_MAX) return { ok: false, reason: `${NICK_MAX}글자까지 쓸 수 있어요.` };

  // 한글 · 영문 · 숫자 · 공백만 (기호로 남을 사칭하는 걸 막아요)
  if (!/^[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9 ]+$/.test(value)) {
    return { ok: false, reason: '한글, 영문, 숫자만 쓸 수 있어요.' };
  }
  if (/^\d+$/.test(value)) return { ok: false, reason: '숫자만으로는 지을 수 없어요.' };
  if (hasBannedWord(value)) return { ok: false, reason: '쓸 수 없는 단어가 들어 있어요.' };

  return { ok: true, value };
}

/**
 * 닉네임을 정하지 않은 사람에게 주는 기본 이름. (예: 우주미아4821)
 * 사용자 식별키가 있으면 그걸로 번호를 만들어서, 같은 사람은 항상 같은 이름을 받아요.
 */
export function defaultNickname(userKey) {
  let n;
  if (userKey) {
    let h = 0;
    for (let i = 0; i < userKey.length; i++) h = (h * 31 + userKey.charCodeAt(i)) >>> 0;
    n = h % 10000;
  } else {
    n = Math.floor(Math.random() * 10000);
  }
  return `우주미아${String(n).padStart(4, '0')}`;
}

/** 중복이라 번호를 바꿔야 할 때 쓰는 다음 후보 */
export function nicknameCandidate(base) {
  const stem = base.replace(/\d+$/, '').slice(0, NICK_MAX - 4) || '우주미아';
  return `${stem}${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
}

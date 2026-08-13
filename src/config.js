/**
 * 출시 전에 반드시 확인해야 하는 값들을 한곳에 모아둔 파일이에요.
 */

/** 앱인토스 콘솔에 등록한 appName. apps-in-toss.config.ts의 appName과 같아야 해요. */
export const APP_NAME = 'space-jump';

/**
 * 리워드(보상형) 광고 그룹 ID.
 *
 * 기본값은 문서에 공개된 **테스트용 ID**예요.
 * 실제 출시 번들에는 앱인토스 콘솔 > 인앱 광고에서 발급받은 ID를 넣어야 해요.
 * (테스트 ID로 출시하면 수익이 잡히지 않고, 실제 ID로 개발 테스트를 하면 정책 위반이에요.)
 *
 * `.env.production`에 `VITE_REWARD_AD_GROUP_ID=발급받은ID` 를 넣으면 빌드 시 교체돼요.
 */
export const REWARD_AD_GROUP_ID =
  import.meta.env.VITE_REWARD_AD_GROUP_ID || 'ait-ad-test-rewarded-id';

/** 테스트용 광고 ID를 그대로 쓰고 있는지 여부 (빌드 로그 경고용) */
export const IS_TEST_AD = REWARD_AD_GROUP_ID.startsWith('ait-ad-test-');

/** 한 판에서 광고를 보고 이어할 수 있는 최대 횟수 */
export const MAX_REVIVES = 1;

/** 저장 키 (사용자 식별키가 있으면 뒤에 붙여서 계정별로 분리해요) */
export const SAVE_KEY = 'spacejump.save';

/* ────────────────────────────── 보석 · 상점 */

/**
 * 행성 하나를 지날 때 보석이 놓일 확률.
 * 0.06이면 행성 25개당 평균 1.5개 — "25개당 1~2개" 목표치예요.
 */
export const GEM_CHANCE = 0.06;

/** 우주선 스킨 한 개 가격 (보석) */
export const SKIN_PRICE = 100;

/* ────────────────────────────── Supabase */

/**
 * 기록 · 보석 · 랭킹을 저장하는 백엔드예요.
 *
 * publishable 키는 브라우저에 노출되는 것을 전제로 만들어진 공개 키라 번들에 들어가도 괜찮아요.
 * (비밀 키인 service_role 키는 **절대** 이 파일에 넣으면 안 돼요.)
 *
 * 테이블은 `supabase/schema.sql`을 Supabase SQL Editor에 붙여넣어 한 번만 만들어 주세요.
 * 연결이 안 되거나 테이블이 없으면 게임은 로컬 저장만으로 그대로 돌아가요.
 */
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://vxwbiebdxuixfmhhfxng.supabase.co';

export const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_R6muO5rIJtY5hL-4oOupkQ_uqlICiMB';

/** 랭킹 대시보드에 보여줄 인원 */
export const LEADERBOARD_LIMIT = 50;

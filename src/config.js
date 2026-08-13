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

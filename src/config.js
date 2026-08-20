/**
 * 출시 전에 반드시 확인해야 하는 값들을 한곳에 모아둔 파일이에요.
 */

/** 앱인토스 콘솔에 등록한 appName. apps-in-toss.config.ts의 appName과 같아야 해요. */
export const APP_NAME = 'orbit-jump';

/* ────────────────────────────── 인앱 광고
   세 종류를 씁니다. 앱인토스 콘솔 > 인앱 광고에서 그룹을 각각 만들고 받은 ID예요.

     보상형(리워드) — 광고를 끝까지 봐야 이어하기 1회
     전면         — 목성(AD_FROM_STAGE) 이상 간 판이 끝나고 화면을 넘길 때
     배너         — 화면 하단에 항상 붙어 있는 띠

   ⚠️ 아래 값은 전부 **실서비스(live) ID**예요.
      개발 중에는 실 ID로 광고를 요청하면 안 돼요. (정책 위반 + 지표 오염)
      그래서 platform.js가 토스 앱 밖에서는 실제 SDK를 아예 안 부르고,
      개발 빌드에서는 가짜 광고(MOCK_AD)로 흐름만 눌러볼 수 있게 해뒀어요.
      배너도 토스 앱 안에서만 붙습니다.

   .env로 덮어쓸 수 있어요. (VITE_REWARD_AD_GROUP_ID 등) */

/** 보상형 — 부활 1회 */
export const REWARD_AD_GROUP_ID =
  import.meta.env.VITE_REWARD_AD_GROUP_ID || 'ait.v2.live.10a1138626ab4e52';

/** 테스트용 광고 ID를 그대로 쓰고 있는지 여부 (빌드 로그 경고용) */
export const IS_TEST_AD = REWARD_AD_GROUP_ID.startsWith('ait-ad-test-');

/** 한 판에서 광고를 보고 이어할 수 있는 최대 횟수 */
export const MAX_REVIVES = 1;

/* ────────────────────────────── 진행 구조 (2.1)
   무한 러닝이 아니라 **끝이 있는 게임**이에요.
   행성 10개를 지나면 다음 천체(스테이지)로 넘어가고, 10스테이지 = 100행성이면 끝이에요. */

/** 스테이지 하나에 들어가는 행성 수 */
export const PLANETS_PER_STAGE = 10;

/** 완주에 필요한 총 행성 수. 마지막(100번째) 행성에 닿으면 최종 보스전이 열려요. */
export const TOTAL_PLANETS = 100;

/** 최종 보스 「가디언-00」의 체력. 스토리 모드 보스(340)보다 길게 잡았어요. */
export const FINAL_BOSS_HP = 460;

/**
 * 스토리 모드 잠금.
 *
 * 2.1 출시본에는 스토리 STAGE 1이 아직 안 들어가요. (다음 업데이트 예정)
 * 잠가두면 진입 버튼이 "준비 중"으로 바뀌고 눌러도 안내만 떠요.
 * 엔진(src/story.js) 자체는 **최종 보스전이 그대로 쓰고 있어서** 번들에 남아 있어요.
 */
export const STORY_LOCKED = true;

/**
 * 전면 광고 그룹 ID.
 *
 * 게임오버에서 "재도전 · 홈으로"를 누를 때 나오는 광고예요.
 * 목성(AD_FROM_STAGE) 이상 간 판에만 붙어요. 아래 AD_FROM_STAGE 주석을 보세요.
 */
export const INTERSTITIAL_AD_GROUP_ID =
  import.meta.env.VITE_INTERSTITIAL_AD_GROUP_ID || 'ait.v2.live.39e92b81eccc4232';

/**
 * 하단 배너 광고 그룹 ID.
 *
 * 화면 맨 아래에 계속 붙어 있는 띠 광고예요. 게임 화면(캔버스)과 오버레이 UI가
 * 이 높이(BANNER_AD_H + 홈 인디케이터)만큼 위로 줄어들어서 서로 겹치지 않아요.
 *
 * 게임 출시 가이드에 "배너 광고는 상단 또는 하단에만" 이라고 못 박혀 있어서
 * 위치는 하단 고정이에요. 중앙이나 게임 영역 위에 띄우면 심사에서 걸립니다.
 */
export const BANNER_AD_GROUP_ID =
  import.meta.env.VITE_BANNER_AD_GROUP_ID || 'ait.v2.live.89d408dc12444c8f';

/**
 * 하단 배너가 차지하는 높이(px). 화면 맨 아래에 **딱 붙어서** 이만큼만 써요.
 *
 * ── 이 숫자를 정한 방법 ──────────────────────────
 * 광고 SDK는 우리가 준 상자 안에서 광고를 **세로 가운데 정렬**해요.
 * 그래서 상자가 광고보다 크면 위아래로 빈 띠가 생기고, 광고는 그대로인데
 * 게임 화면만 깎여요. 실기기 스크린샷을 재보니
 *
 *   광고 콘텐츠(아이콘 + 문구 2줄) 자체 = 약 32px
 *   우리 상자 90px  → 위아래로 24px씩 빈 공간   ← 너무 두꺼워 보였던 이유
 *   다른 미니앱     → 약 61px (위아래 15px씩)
 *
 * 그래서 62px로 맞췄어요. 광고 위아래로 15px씩만 숨 쉬는 정도예요.
 *
 * ⚠️ 콘솔에서 광고 그룹을 「이미지 강조」(16:9 가변 높이)로 바꾸면 이 높이로는 잘려요.
 *    그때는 이 값과 style.css의 `--banner-ad-h`를 같이 올려주세요. (두 곳이에요)
 */
export const BANNER_AD_H = 62;

/**
 * 이 스테이지 이상 도달한 판에서만 전면 광고를 띄워요.
 *
 * 스테이지 순서: 1 지구 · 2 달 · 3 화성 · **4 목성** · 5 토성 · 6 천왕성 …
 * 지구~화성에서 금방 죽는 사람(대부분 첫 몇 판)에게는 광고를 안 띄워서 이탈을 막아요.
 * 목성은 화면이 스스로 올라오기 시작하는 라운드(= 본 게임의 시작)라,
 * 여기까지 갔다면 한 판 제대로 한 셈이니 광고를 붙여도 괜찮아요.
 */
export const AD_FROM_STAGE = 4;

/**
 * 전면 광고 최소 간격(ms).
 *
 * 이게 없으면 "부활 광고 보고 → 바로 죽고 → 재도전 광고"로 광고가 연달아 나와요.
 */
export const AD_COOLDOWN_MS = 45_000;

/** 저장 키 (사용자 식별키가 있으면 뒤에 붙여서 계정별로 분리해요) */
export const SAVE_KEY = 'spacejump.save';

/* ────────────────────────────── 튜토리얼 */

/**
 * 튜토리얼 대본 버전.
 *
 * 나중에 코스를 크게 바꾸면 이 숫자를 올리세요. 저장된 클리어 기록이 이 값보다
 * 낮으면 "아직 안 본 튜토리얼"로 쳐서 한 번 더 보여줍니다.
 * (기믹이 추가됐는데 예전에 클리어한 사람은 영영 못 보는 일을 막으려고요)
 *
 *   1 — 행성 21칸 · 칸마다 안내 카드 (모달 21장)
 *   2 — 레슨 7개 / 행성 15칸으로 재편. 카드는 레슨당 1장,
 *       나머지는 힌트 배너 + 스포트라이트 · 조준선 · 시범 비행으로 대체.
 */
export const TUTORIAL_VERSION = 2;

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

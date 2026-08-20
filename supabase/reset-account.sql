-- ════════════════════════════════════════════════════════════════════
-- SPACE JUMP — 계정을 갓 설치한 상태로 되돌리기 (테스트용)
--
-- ⚠️ 닉네임으로 찾지 마세요. 안 지워집니다.
--
--    QA 패널의 「초기화」를 누르면 기기의 닉네임이 비워지고, 게임이 다시 켜질 때
--    `우주미아0000` 같은 이름이 새로 만들어져서 **서버 players 행의 닉네임을
--    덮어씁니다.** (src/main.js의 ensureNickname)
--    그래서 초기화를 한 번이라도 눌렀다면 `nickname like 'a1b2%'`는 0줄이고,
--    정작 업적·튜토리얼 기록은 같은 user_key 아래 멀쩡히 살아 있어요.
--
--    사람을 가리키는 건 처음부터 끝까지 **user_key** 하나뿐이에요. 그걸로 지우세요.
--    기기에서 확인하려면 QA 패널의 「초기화」를 **한 번만** 누르세요.
--    (첫 탭은 user_key를 복사해줘요. 두 번째 탭부터 실제로 지워요)
--
-- 순서가 중요해요 — ①로 찾고 → ②로 지우고 → 그다음에 기기에서 「초기화」.
-- 반대로 하면 로컬에만 남은 업적이 서버로 **다시 올라가서** 방금 지운 게 되살아나요.
-- ════════════════════════════════════════════════════════════════════


-- ── ① 어느 계정인지 찾기 ─────────────────────────────
--
-- 최근에 논 순서예요. 방금 테스트한 계정이 맨 위에 있어요.
-- achv(업적 수) · tut(튜토리얼 클리어)까지 같이 보여줘서 눈으로 고르면 돼요.
-- 여기 나온 user_key를 그대로 복사하세요.
select p.user_key,
       p.nickname,
       p.gems,
       p.best_score,
       p.plays,
       p.updated_at,
       (select count(*) from public.achievements a where a.user_key = p.user_key) as achv,
       (select t.cleared from public.tutorial_progress t where t.user_key = p.user_key) as tut
  from public.players p
 order by p.updated_at desc
 limit 20;


-- ── ② 그 계정 지우기 ────────────────────────────────
--
-- 아래 한 줄이 전부예요. 따옴표 안의 키만 바꿔서 **이 한 줄만** 실행하세요.
-- players를 지우면 runs · achievements · tutorial_progress는 on delete cascade로
-- 따라서 지워져요. (schema.sql)
--
-- ⚠️ 되돌릴 수 없어요. 실행 전에 ①에서 본 키가 맞는지만 확인해 주세요.

delete from public.players where user_key = '여기에_붙여넣기';


-- ── ③ 확인 ─────────────────────────────────────────
--
-- 세 값 모두 0이어야 해요. 아니면 키를 잘못 넣은 거예요.

-- select
--   (select count(*) from public.players           where user_key = '여기에_붙여넣기') as players,
--   (select count(*) from public.achievements      where user_key = '여기에_붙여넣기') as achievements,
--   (select count(*) from public.tutorial_progress where user_key = '여기에_붙여넣기') as tutorial;


-- ════════════════════════════════════════════════════════════════════
-- 전부 밀어버리기 — 테스트 계정밖에 없을 때
--
-- 계정이 몇 개 안 되는 개발 단계에서는 이게 제일 확실해요.
-- user_key를 찾을 필요도, 어느 줄이 내 것인지 고를 필요도 없어요.
--
-- ⚠️ **모든 사람의 기록이 사라집니다.** 다른 분이 테스트 중이면 쓰지 마세요.
--    실수로 돌아가지 않게 주석으로 막아뒀어요. 쓸 때 `--`를 지우세요.
-- ════════════════════════════════════════════════════════════════════

-- truncate public.achievements,
--          public.tutorial_progress,
--          public.runs,
--          public.players
--   restart identity cascade;


-- ────────────────────────────── 계정은 두고 진행만 되돌리기
--
-- 닉네임·보석은 유지하면서 튜토리얼과 업적만 다시 겪어보고 싶을 때예요.
--
-- delete from public.achievements      where user_key = '여기에_붙여넣기';
-- delete from public.tutorial_progress where user_key = '여기에_붙여넣기';
-- update public.players set gems = 0   where user_key = '여기에_붙여넣기';
--
-- ⚠️ best_score · best_combo · plays는 update로 못 내려요.
--    keep_best() 트리거가 "기록은 내려가지 않는다"로 지키고 있어요. (schema.sql)
--    0으로 만들려면 위 ②처럼 계정을 통째로 지웠다 다시 만드세요.

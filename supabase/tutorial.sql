-- ════════════════════════════════════════════════════════════════════
-- SPACE JUMP — 튜토리얼 진행 테이블
--
-- 실행 방법
--   Supabase 대시보드 → SQL Editor → New query → 이 파일 전체 붙여넣기 → Run
--   schema.sql을 먼저 실행해서 public.players가 있어야 해요. (외래키로 물려 있어요)
--   여러 번 실행해도 안전합니다.
--
-- 왜 players에 컬럼을 하나 더 붙이지 않고 테이블을 따로 뒀냐면
--   1) players는 랭킹 쿼리가 계속 읽는 표예요. 게임 진행과 무관한 컬럼이 늘어나면
--      매 랭킹 조회마다 같이 실려 나가요.
--   2) 튜토리얼은 "언제 · 몇 번 만에 · 어떤 버전을 깼는지"를 남겨야 개편할 때
--      쓸모가 있어요. 컬럼 하나(boolean)로는 그게 안 담겨요.
--   3) 대본을 크게 고치면 cleared_version만 올려서 다시 보여줄 수 있어요.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.tutorial_progress (
  -- 앱인토스 getUserKeyForGame() 해시. players와 같은 사람을 가리켜요.
  user_key        text primary key
                  references public.players(user_key) on delete cascade,

  -- 끝까지 봤는지. 이 값이 false거나 행이 아예 없으면 튜토리얼부터 시작해요.
  cleared         boolean not null default false,

  -- 클리어한 대본 버전 (src/config.js의 TUTORIAL_VERSION).
  -- 대본을 개편하고 버전을 올리면, 예전 버전으로 깬 사람에게 다시 보여줄 수 있어요.
  cleared_version integer not null default 0 check (cleared_version >= 0),

  -- 코스 안에서 몇 번 되돌아갔는지. 어느 기믹이 어려운지 보는 지표예요.
  retries         integer not null default 0 check (retries >= 0),

  -- 건너뛰기로 넘어간 사람인지 (설정에서 다시 보기를 눌렀는지 구분하려고)
  skipped         boolean not null default false,

  cleared_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ⚠️ 보상(보석 100개) 수령 여부는 **여기 없어요.**
--    튜토리얼 클리어도 업적 하나(`tutorial-clear`)라서, 다른 업적들과 똑같이
--    achievements 테이블의 claimed_at에 남아요. 같은 사실을 두 곳에서 관리하면
--    반드시 어긋나요. 이 표는 "어떻게 겪었는지"(재시도 · 건너뛰기 · 대본 버전)만 봐요.
--    → supabase/achievements.sql

-- "아직 튜토리얼 안 깬 사람" 집계용
create index if not exists tutorial_progress_cleared_idx
  on public.tutorial_progress (cleared, cleared_version);

-- ────────────────────────────── 접근 권한 (GRANT)
--
-- ⚠️ RLS 정책만으로는 부족해요. PostgREST가 쓰는 `anon` 역할에 테이블 권한도 줘야 해요.
--    (schema.sql의 같은 주석 참고 — 이게 없으면 42501 permission denied가 납니다)
-- delete는 일부러 주지 않아요.
grant select, insert, update on public.tutorial_progress to anon, authenticated;

-- ────────────────────────────── 보안 정책 (RLS)
alter table public.tutorial_progress enable row level security;

drop policy if exists tutorial_read   on public.tutorial_progress;
drop policy if exists tutorial_insert on public.tutorial_progress;
drop policy if exists tutorial_update on public.tutorial_progress;

create policy tutorial_read   on public.tutorial_progress for select using (true);
create policy tutorial_insert on public.tutorial_progress for insert with check (true);
create policy tutorial_update on public.tutorial_progress for update using (true) with check (true);

-- ────────────────────────────── 클리어 상태는 내려가지 않게
--
-- 기기를 두 대 쓰면 오래된 값(cleared=false)이 뒤늦게 올라올 수 있어요.
-- 한 번 깬 사람에게 튜토리얼이 다시 뜨면 그것만큼 짜증나는 게 없어서 막아둬요.
-- 다만 대본 버전이 올라간 경우(cleared_version < 새 버전)는 다시 봐야 하니
-- 이 트리거는 "버전이 같거나 낮을 때"만 지켜줍니다.
--
create or replace function public.keep_tutorial_cleared()
returns trigger
language plpgsql
as $$
begin
  if old.cleared and new.cleared_version <= old.cleared_version then
    new.cleared         := true;
    new.cleared_version := greatest(new.cleared_version, old.cleared_version);
    new.cleared_at      := coalesce(old.cleared_at, new.cleared_at);
  end if;
  new.retries    := greatest(coalesce(new.retries, 0), coalesce(old.retries, 0));
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tutorial_keep_cleared on public.tutorial_progress;
create trigger tutorial_keep_cleared
  before update on public.tutorial_progress
  for each row execute function public.keep_tutorial_cleared();

-- ────────────────────────────── 확인용
-- select cleared, cleared_version, skipped, count(*)
--   from public.tutorial_progress
--  group by 1, 2, 3
--  order by 1, 2, 3;
--
-- 어느 기믹에서 많이 죽는지 (retries 분포)
-- select retries, count(*)
--   from public.tutorial_progress
--  group by 1 order by 1;

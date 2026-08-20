-- ════════════════════════════════════════════════════════════════════
-- SPACE JUMP — 업적(칭호) 테이블
--
-- 실행 방법
--   Supabase 대시보드 → 왼쪽 메뉴 SQL Editor → New query
--   → 이 파일 전체를 붙여넣고 Run
--
--   schema.sql을 먼저 실행해서 public.players가 있어야 해요. (외래키로 물려 있어요)
--   여러 번 실행해도 안전합니다.
--
-- 왜 「한 사람당 한 줄」이 아니라 「한 사람이 얻은 업적마다 한 줄」이냐면
--   1) 업적이 늘어날 때마다 컬럼을 추가하지 않아도 돼요. insert 한 줄이면 끝이에요.
--   2) "언제 얻었는지"가 업적마다 남아요. 어떤 업적이 언제 풀리는지 볼 수 있어요.
--   3) "이 업적을 몇 명이 가졌나" 같은 집계가 group by 한 줄로 나와요.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.achievements (
  id            bigint generated always as identity primary key,

  -- 앱인토스 getUserKeyForGame() 해시. players와 같은 사람을 가리켜요.
  user_key      text not null
                references public.players(user_key) on delete cascade,

  -- 업적 id. src/achievements.js의 ACHIEVEMENTS[].id와 **글자 그대로** 같아야 해요.
  --   first-clear · no-combo · full-combo · no-revive · so-close · all-skins · programmer
  -- ⚠️ 코드에서 id를 바꾸면 예전에 얻은 업적이 미아가 돼요. 이름만 바꾸세요.
  code          text not null,

  earned_at     timestamptz not null default now(),

  -- 같은 업적을 두 번 넣지 않아요. 클라이언트가 켤 때마다 올려도 안전하게요.
  unique (user_key, code)
);

-- ────────────────────────────── 보상 수령 (2.2에서 추가)
--
-- 업적 하나당 보석 100개인데, **자동 지급이 아니라** 목록에서 직접 눌러서 받아요.
-- 그래서 "얻었다"와 "받았다"가 다른 사건이고, 둘 다 여기 한 줄에 같이 남아요.
--
--   claimed_at IS NULL      → 아직 안 받음. 목록에 「받기」 버튼이 떠요.
--   claimed_at IS NOT NULL  → 받음. reward_gems에 실제로 나간 액수가 들어 있어요.
--
-- 액수를 상수로 안 보고 컬럼에 박아두는 이유 — 나중에 보상을 100에서 바꿔도
-- **그때 얼마를 줬는지**가 그대로 남아야 정산이 맞아요.
--
-- 이미 테이블을 만든 프로젝트에서도 이 파일을 다시 실행하면 컬럼만 붙어요.
alter table public.achievements
  add column if not exists reward_gems integer not null default 0 check (reward_gems >= 0),
  add column if not exists claimed_at  timestamptz;

-- "아직 안 받은 보상이 있는 사람" 조회용. 받은 줄은 인덱스에 안 넣어요(부분 인덱스).
create index if not exists achievements_unclaimed_idx
  on public.achievements (user_key)
  where claimed_at is null;

-- "이 업적을 몇 명이 가졌나" 집계용
create index if not exists achievements_code_idx
  on public.achievements (code);

-- 「내 업적 목록」 조회는 unique (user_key, code)가 만든 인덱스가 이미 처리해요.
-- 예전에 따로 만들어 둔 user_key 단독 인덱스는 완전히 겹치니 지웁니다.
drop index if exists public.achievements_user_idx;

-- ────────────────────────────── 접근 권한 (GRANT)
--
-- ⚠️ RLS 정책만으로는 부족해요. PostgREST가 쓰는 `anon` 역할에 테이블 권한도 줘야 해요.
--    (schema.sql의 같은 주석 참고 — 이게 없으면 42501 permission denied가 납니다)
-- delete는 일부러 주지 않아요. 업적은 쌓이기만 하면 되고, 지워질 일이 없어야 해요.
-- update는 보상 수령(claimed_at) 때문에 필요해요. 되돌리는 건 아래 트리거가 막습니다.
grant select, insert, update on public.achievements to anon, authenticated;

-- id가 identity 컬럼이라 시퀀스 사용 권한이 있어야 insert가 돼요.
grant usage, select on all sequences in schema public to anon, authenticated;

-- ────────────────────────────── 보안 정책 (RLS)
--
-- 이 게임은 로그인 절차가 없어서 publishable(anon) 키로 읽고 써요.
-- 읽기를 전부 열어두는 건 "누가 어떤 칭호를 가졌는지"를 나중에 랭킹 옆에
-- 붙여 보여줄 수 있게 하려는 거예요. 민감한 값이 아니에요.
alter table public.achievements enable row level security;

drop policy if exists achievements_read   on public.achievements;
drop policy if exists achievements_insert on public.achievements;
drop policy if exists achievements_update on public.achievements;

create policy achievements_read   on public.achievements for select using (true);
create policy achievements_insert on public.achievements for insert with check (true);
create policy achievements_update on public.achievements for update using (true) with check (true);

-- ────────────────────────────── 한 번 받은 보상은 되돌아가지 않게
--
-- 기기를 두 대 쓰면 "아직 안 받았다"는 오래된 값이 뒤늦게 올라올 수 있어요.
-- 그 순간 claimed_at이 null로 돌아가면 같은 보석을 한 번 더 받을 수 있게 됩니다.
-- code·user_key·earned_at도 여기서 못 바꾸게 묶어둬요. update 권한을 연 이상,
-- 이 줄이 "남의 업적을 내 것으로 바꾸기"를 막는 유일한 방어선이에요.
create or replace function public.keep_achievement_claim()
returns trigger
language plpgsql
as $$
begin
  new.user_key := old.user_key;
  new.code     := old.code;
  new.earned_at := old.earned_at;

  if old.claimed_at is not null then
    new.claimed_at  := old.claimed_at;
    new.reward_gems := greatest(coalesce(new.reward_gems, 0), coalesce(old.reward_gems, 0));
  end if;
  return new;
end;
$$;

drop trigger if exists achievements_keep_claim on public.achievements;
create trigger achievements_keep_claim
  before update on public.achievements
  for each row execute function public.keep_achievement_claim();

-- ════════════════════════════════════════════════════════════════════
-- 2.2 이전에 tutorial.sql을 실행했다면 — 한 번만 돌려주세요
--
-- 튜토리얼 보상 수령 여부를 잠깐 tutorial_progress에 뒀다가, 모든 업적이 보상을
-- 주게 되면서 이 표로 합쳤어요. 같은 사실을 두 곳에서 관리할 이유가 없어요.
-- 아래가 옮기고 지웁니다. 컬럼이 없으면 아무 일도 안 일어나요.
--
-- ⚠️ **tutorial.sql을 먼저 실행하세요.** 순서가 중요해요.
--    예전 tutorial.sql이 만든 트리거 함수가 reward_claimed를 읽거든요.
--    컬럼을 먼저 지워버리면 그 함수가 깨져서, 그다음부터 튜토리얼 진행 저장이
--    통째로 실패해요. 새 tutorial.sql이 그 함수를 먼저 갈아끼워야 안전합니다.
-- ════════════════════════════════════════════════════════════════════
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'tutorial_progress'
       and column_name  = 'reward_claimed'
  ) then
    -- 이미 받은 사람의 기록을 achievements 쪽으로 옮겨요.
    update public.achievements a
       set claimed_at  = coalesce(a.claimed_at, t.reward_claimed_at, t.updated_at),
           reward_gems = greatest(a.reward_gems, coalesce(t.reward_gems, 0))
      from public.tutorial_progress t
     where t.user_key = a.user_key
       and a.code = 'tutorial-clear'
       and t.reward_claimed
       and a.claimed_at is null;

    alter table public.tutorial_progress
      drop column if exists reward_claimed,
      drop column if exists reward_gems,
      drop column if exists reward_claimed_at;
  end if;
end $$;

-- ────────────────────────────── 확인용
--
-- 업적별 달성자 수 · 보상을 실제로 받아간 수
-- select code,
--        count(*)                                as holders,
--        count(*) filter (where claimed_at is not null) as claimed,
--        sum(reward_gems)                        as gems_paid
--   from public.achievements
--  group by code
--  order by holders desc;
--
-- 특정 사람이 가진 칭호
-- select code, earned_at
--   from public.achievements
--  where user_key = '여기에_user_key'
--  order by earned_at;
--
-- 랭킹 + 칭호 개수 같이 보기
-- select p.nickname, p.best_score, count(a.id) as titles
--   from public.players p
--   left join public.achievements a on a.user_key = p.user_key
--  group by p.user_key, p.nickname, p.best_score
--  order by p.best_score desc
--  limit 50;

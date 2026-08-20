-- ════════════════════════════════════════════════════════════════════
-- SPACE JUMP — 데이터베이스 스키마
--
-- 실행 방법
--   Supabase 대시보드 → 왼쪽 메뉴 SQL Editor → New query → 이 파일 전체 붙여넣기 → Run
--   한 번만 실행하면 돼요. 여러 번 실행해도 안전하도록 IF NOT EXISTS를 붙여뒀어요.
--
-- 담는 것
--   players — 유저 정보(식별키 · 닉네임) · 보석 개수 · 최고 기록 · 보유 스킨
--   runs    — 한 판이 끝날 때마다 남는 기록
-- ════════════════════════════════════════════════════════════════════

-- ────────────────────────────── 유저 프로필
create table if not exists public.players (
  -- 앱인토스 getUserKeyForGame()이 주는 해시. 로그인 없이 이걸로 사람을 구분해요.
  user_key      text primary key,

  -- 닉네임. 중복 방지는 이 unique 제약이 최종 심판이에요.
  -- (클라이언트에서 미리 확인해도, 확인과 저장 사이에 남이 가져갈 수 있어요.)
  nickname      text unique,

  gems          integer not null default 0 check (gems >= 0),
  best_score    integer not null default 0 check (best_score >= 0),
  best_combo    integer not null default 0 check (best_combo >= 0),
  plays         integer not null default 0 check (plays >= 0),

  -- 구매한 스킨 id 목록 (src/skins.js의 id와 같아요)
  owned_skins   text[]  not null default '{}',
  equipped_skin text    not null default 'classic',

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 랭킹 정렬용
create index if not exists players_best_score_idx
  on public.players (best_score desc, best_combo desc);

-- ────────────────────────────── 판별 기록
create table if not exists public.runs (
  id         bigint generated always as identity primary key,
  user_key   text not null references public.players(user_key) on delete cascade,
  score      integer not null default 0,
  stage      integer not null default 1,
  landed     integer not null default 0,
  best_combo integer not null default 0,
  gems       integer not null default 0,
  revives    integer not null default 0,
  reason     text,
  created_at timestamptz not null default now()
);

create index if not exists runs_user_idx on public.runs (user_key, created_at desc);
create index if not exists runs_score_idx on public.runs (score desc);

-- ────────────────────────────── 접근 권한 (GRANT)
--
-- ⚠️ RLS 정책만으로는 부족해요. PostgREST가 쓰는 `anon` 역할에 테이블 권한도 줘야 해요.
--    이게 없으면 아래 정책을 아무리 열어둬도 42501(permission denied)이 납니다.
--    최신 Supabase 프로젝트는 public 스키마 기본 권한이 닫혀 있어서 직접 줘야 해요.
--
-- delete는 일부러 주지 않아요. 기록이 지워질 일이 없게요.
grant usage on schema public to anon, authenticated;

grant select, insert, update on public.players to anon, authenticated;
grant select, insert          on public.runs    to anon, authenticated;

-- runs.id가 identity 컬럼이라 시퀀스 사용 권한이 있어야 insert가 돼요.
grant usage, select on all sequences in schema public to anon, authenticated;

-- 앞으로 만들 테이블에도 같은 권한이 자동으로 붙게 해둬요.
alter default privileges in schema public
  grant select, insert, update on tables to anon, authenticated;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated;

-- ────────────────────────────── 보안 정책 (RLS)
--
-- 이 게임은 로그인 절차가 없어요. 그래서 publishable(anon) 키로 읽고 쓸 수 있게 열어둬요.
-- 대신 아래 두 가지로 최소한의 방어를 해요.
--   1) delete 권한은 아무에게도 주지 않아요. (기록이 지워지지 않게)
--   2) 점수·보석에 check 제약을 걸어 음수나 말도 안 되는 값이 안 들어가게 해요.
--
-- ⚠️ 클라이언트가 값을 그대로 올리는 구조라, 마음먹고 조작하는 사람은 막지 못해요.
--    랭킹에 상금이 걸리는 등 신뢰가 중요해지면 Edge Function으로 점수 검증을 옮기세요.
alter table public.players enable row level security;
alter table public.runs    enable row level security;

drop policy if exists players_read   on public.players;
drop policy if exists players_insert on public.players;
drop policy if exists players_update on public.players;

create policy players_read   on public.players for select using (true);
create policy players_insert on public.players for insert with check (true);
create policy players_update on public.players for update using (true) with check (true);

drop policy if exists runs_read   on public.runs;
drop policy if exists runs_insert on public.runs;

create policy runs_read   on public.runs for select using (true);
create policy runs_insert on public.runs for insert with check (true);

-- ────────────────────────────── 최고 기록 자동 반영
-- 프로필을 덮어쓸 때 최고 기록이 실수로 내려가지 않게 막아요.
-- (여러 기기에서 번갈아 플레이하면 오래된 값이 올라올 수 있어요.)
create or replace function public.keep_best()
returns trigger
language plpgsql
as $$
begin
  new.best_score := greatest(coalesce(new.best_score, 0), coalesce(old.best_score, 0));
  new.best_combo := greatest(coalesce(new.best_combo, 0), coalesce(old.best_combo, 0));
  new.plays      := greatest(coalesce(new.plays, 0),      coalesce(old.plays, 0));
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists players_keep_best on public.players;
create trigger players_keep_best
  before update on public.players
  for each row execute function public.keep_best();

-- ────────────────────────────── 계정 초기화 (설정 화면의 「계정 초기화」)
--
-- 왜 `grant delete`가 아니라 함수냐면 —
--   delete 권한을 anon에게 열면 그 키를 가진 누구든 `delete from players` 한 줄로
--   **표 전체를 비울 수 있어요.** 되돌릴 방법이 없는 종류의 사고예요.
--   함수로 감싸면 anon이 할 수 있는 건 "user_key 하나짜리 삭제" 딱 그것뿐이에요.
--
-- security definer라 함수 주인(postgres) 권한으로 돌아가요. 그래서 anon에게
-- 표 자체의 delete 권한을 주지 않고도 이 함수 안에서만 지울 수 있어요.
-- search_path를 고정하는 건 security definer 함수의 기본 안전 수칙이에요.
-- (안 하면 호출하는 쪽이 search_path를 바꿔서 엉뚱한 표를 가리키게 만들 수 있어요)
--
-- ⚠️ 이 게임은 로그인이 없어서, user_key를 아는 사람은 그 계정을 지울 수 있어요.
--    지금도 프로필 update가 같은 수준으로 열려 있으니 새로 생기는 구멍은 아니에요.
--    다만 "표 전체"와 "한 계정"의 차이는 커서, 그 선만큼은 함수로 그어둡니다.
--
-- players 한 줄을 지우면 runs · achievements · tutorial_progress는
-- on delete cascade로 따라서 지워져요.
create or replace function public.delete_account(p_user_key text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.players where user_key = p_user_key;
$$;

-- 기본으로 모두에게 열려버리는 걸 막고, 필요한 역할에만 다시 줘요.
revoke all on function public.delete_account(text) from public;
grant execute on function public.delete_account(text) to anon, authenticated;

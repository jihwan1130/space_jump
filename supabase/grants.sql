-- ════════════════════════════════════════════════════════════════════
-- 권한만 다시 주는 스크립트
--
-- schema.sql을 이미 실행해서 테이블은 있는데
-- `permission denied for table players` (코드 42501)가 날 때 이 파일만 실행하세요.
--
-- 원인: RLS 정책과 별개로, PostgREST가 쓰는 `anon` 역할에는
--       테이블 권한(GRANT)이 따로 있어야 해요. 정책만 열면 안 통해요.
--
-- 실행: Supabase 대시보드 → SQL Editor → New query → 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════

grant usage on schema public to anon, authenticated;

-- delete는 일부러 빼요. 기록이 지워질 일이 없게요.
grant select, insert, update on public.players to anon, authenticated;
grant select, insert          on public.runs    to anon, authenticated;

-- runs.id가 identity 컬럼이라 시퀀스 사용 권한이 있어야 insert가 돼요.
grant usage, select on all sequences in schema public to anon, authenticated;

alter default privileges in schema public
  grant select, insert, update on tables to anon, authenticated;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated;

-- 확인용 — 아래를 함께 실행하면 부여된 권한이 보여요.
-- select grantee, table_name, privilege_type
--   from information_schema.role_table_grants
--  where table_schema = 'public' and grantee in ('anon', 'authenticated')
--  order by table_name, grantee, privilege_type;

-- NBA EPM (dunksandthrees.com) — 2026-11-26 사용자 요청: NBA 체급·결장 영향을 EPM으로.
-- 함수 collect-epm이 페이지 한 번에 전 선수 값을 받아 as_of(사이트 데이터 날짜)별로 저장 — 날짜별로 쌓아 두면 나중에 백테스트 가능.
-- 업데이트: 사이트는 미국 밤 경기 후 하루 한 번 갱신 (as_of = 미국 날짜). 사용자는 NBA를 전날 22시 KST에 걸고 예측 저장은 21:30
--  → 매일 19:13 · 21:07 KST 두 번 (첫 번째가 아직 옛 날짜면 두 번째가 잡음, 같은 날짜는 덮어씀). 크기 하루 약 540줄(약 60KB).
create table if not exists public.nba_epm (
  as_of date not null,
  player_id text not null,           -- NBA 공식 선수 id (우리 선수 기록은 ESPN id라 이름으로 맞춘다)
  season int,
  player_name text not null,
  team text,                         -- NBA 약칭 (DEN 등)
  off numeric, def numeric, tot numeric, mp48 numeric,
  fetched_at timestamptz not null default now(),
  primary key (as_of, player_id)
);
create index if not exists nba_epm_as_of on public.nba_epm (as_of desc);
alter table public.nba_epm enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'nba_epm' and policyname = 'anon_read_nba_epm') then
    create policy anon_read_nba_epm on public.nba_epm for select using (true);
  end if;
end $$;

create or replace function public.run_collect_epm() returns void
language plpgsql security definer set search_path = public, net as $$
begin
  perform net.http_post(
    url := 'https://rgxjwfsmevfwmivsziyq.supabase.co/functions/v1/collect-epm',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJneGp3ZnNtZXZmd21pdnN6aXlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzODIzOTUsImV4cCI6MjA5Njk1ODM5NX0.8eD0N5CLCBoDSrlg0nz3Q2JmOYthHepJlTptHCMYetw"}'::jsonb,
    body := '{}'::jsonb, timeout_milliseconds := 60000);
end $$;
revoke all on function public.run_collect_epm() from public, anon, authenticated;
select cron.schedule('collect-epm', '13 10 * * *', 'select public.run_collect_epm()');     -- 19:13 KST
select cron.schedule('collect-epm-2', '7 12 * * *', 'select public.run_collect_epm()');    -- 21:07 KST

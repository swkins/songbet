-- 축구 결장 선수 · 예상 선발 · 선수 평점(오버롤) — FotMob (2026-11-26 사용자 요청)
-- 함수 collect-fotmob (supabase/functions/collect-fotmob/index.ts). 공식 공개 API 아님 → 최대한 천천히, 한 번에 하나씩.
--  · 대상 = 우리가 일정을 받는 축구 리그(game_schedules sport soccer) 중 수집 시간대에 경기가 있는 것만.
--  · 시간대 (사용자 베팅 시간 기준): 그날 09:00~23:59 킥오프 경기 → 03:00~08:45 수집 (베팅 09시~)
--                                  다음 날 00:00~08:59 킥오프(새벽 경기) → 15:00~20:45 수집 (베팅 전날 21시~)
--  · 경기마다 3번: 경기 상세 1(결장·예상 선발) + 양 팀 팀 페이지 2(선수 시즌 평점·부상·몸값). 같은 팀은 하루 1번.
--  · plan(시간대 시작 때 FotMob 날짜별 경기 목록 1번)이 대기 줄 fm_queue에 시간대 전체에 고르게 흩어 넣고,
--    pg_cron fm-step(1분마다)이 시각이 된 것 하나만 처리 → 1분에 많아야 1번. 차단(403·429)이면 1시간 멈춤.
--  · 처음 채우기: 5대 리그 전 팀(약 96팀)을 seed로 한 번 (5~8분 간격, 사용자 요청 '최대한 천천히').
create table if not exists public.fm_teams (
  team_id int primary key, name text, league_id int, league_name text, fetched_at timestamptz not null default now());
create table if not exists public.fm_players (
  team_id int not null, player_id int not null, name text, pos text, rating numeric, injury jsonb, value bigint, age int,
  fetched_at timestamptz not null default now(), primary key (team_id, player_id));
create index if not exists fm_players_player on public.fm_players (player_id);
create table if not exists public.fm_matches (
  game_id text primary key, league text, fm_match_id int, start_at timestamptz, home_team_id int, away_team_id int,
  lineup_type text, home jsonb, away jsonb, fetched_at timestamptz not null default now());
create table if not exists public.fm_leagues (
  league_id int primary key, name text, team_count int, fetched_at timestamptz not null default now());
create table if not exists public.fm_queue (
  id bigserial primary key, kind text not null,          -- match | team | seed_league
  ref text not null,                                     -- FotMob 경기·팀·리그 번호
  game_id text, league text, prio int not null default 9, due_at timestamptz not null,
  status text not null default 'pending',                -- pending | done | failed | blocked | skipped
  note text, created_at timestamptz not null default now(), done_at timestamptz);
create index if not exists fm_queue_due on public.fm_queue (status, due_at);
create table if not exists public.fm_state (key text primary key, value jsonb, updated_at timestamptz default now());

alter table public.fm_teams enable row level security;
alter table public.fm_players enable row level security;
alter table public.fm_matches enable row level security;
alter table public.fm_leagues enable row level security;
alter table public.fm_queue enable row level security;
alter table public.fm_state enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'anon_read_fm_teams') then create policy anon_read_fm_teams on public.fm_teams for select using (true); end if;
  if not exists (select 1 from pg_policies where policyname = 'anon_read_fm_players') then create policy anon_read_fm_players on public.fm_players for select using (true); end if;
  if not exists (select 1 from pg_policies where policyname = 'anon_read_fm_matches') then create policy anon_read_fm_matches on public.fm_matches for select using (true); end if;
  if not exists (select 1 from pg_policies where policyname = 'anon_read_fm_leagues') then create policy anon_read_fm_leagues on public.fm_leagues for select using (true); end if;
  if not exists (select 1 from pg_policies where policyname = 'anon_read_fm_queue') then create policy anon_read_fm_queue on public.fm_queue for select using (true); end if;
end $$;

create or replace function public.run_fotmob(body jsonb) returns void
language plpgsql security definer set search_path = public, net as $$
begin
  perform net.http_post(
    url := 'https://rgxjwfsmevfwmivsziyq.supabase.co/functions/v1/collect-fotmob',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJneGp3ZnNtZXZmd21pdnN6aXlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzODIzOTUsImV4cCI6MjA5Njk1ODM5NX0.8eD0N5CLCBoDSrlg0nz3Q2JmOYthHepJlTptHCMYetw"}'::jsonb,
    body := body, timeout_milliseconds := 60000);
end $$;
revoke all on function public.run_fotmob(jsonb) from public, anon, authenticated;

-- 1분마다: 시각이 된 대기 항목이 있고 멈춤 중이 아닐 때만 함수를 부른다 (없으면 호출 0)
create or replace function public.run_fotmob_step() returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from fm_state where key = 'paused_until' and (value->>'until')::timestamptz > now()) then return; end if;
  if exists (select 1 from fm_queue where status = 'pending' and due_at <= now()) then
    perform public.run_fotmob('{"action":"step"}'::jsonb);
  end if;
end $$;
revoke all on function public.run_fotmob_step() from public, anon, authenticated;

select cron.schedule('fm-plan-day', '2 18 * * *', $$select public.run_fotmob('{"action":"plan","window":"day"}'::jsonb)$$);    -- 03:02 KST
select cron.schedule('fm-plan-dawn', '2 6 * * *', $$select public.run_fotmob('{"action":"plan","window":"dawn"}'::jsonb)$$);   -- 15:02 KST
select cron.schedule('fm-step', '* * * * *', 'select public.run_fotmob_step()');

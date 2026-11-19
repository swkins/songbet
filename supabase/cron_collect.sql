-- 자동 수집 작업 (pg_cron · pg_net) — Supabase에 적용하는 SQL. 분석 탭 '업데이트 현황'이 이 작업들을 보여준다.
-- pg_cron은 UTC. 다음 실행은 '분 시 * * *'로 정해서 한 번씩만 돌게 한다 (분만 정하면 같은 시간대에 또 돌았다).
-- 지우기(delete·drop·unschedule)가 들어가면 Supabase 연결이 확인을 묻는데 앱에 안 떠서 시간 초과 — 그래서 넣지 않았다.
-- cron.schedule은 같은 이름이면 덮어쓴다.

-- ① 경기 일정: 40~80분 뒤 랜덤 (시·분)
create or replace function public.run_update_schedule() returns void
language plpgsql security definer set search_path = public, cron, net as $$
declare
  nxt timestamptz := now() + make_interval(mins => 40 + floor(random() * 41)::int);
  u timestamp := nxt at time zone 'UTC';
begin
  perform net.http_post(
    url := 'https://rgxjwfsmevfwmivsziyq.supabase.co/functions/v1/update-schedule',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJneGp3ZnNtZXZmd21pdnN6aXlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzODIzOTUsImV4cCI6MjA5Njk1ODM5NX0.8eD0N5CLCBoDSrlg0nz3Q2JmOYthHepJlTptHCMYetw"}'::jsonb,
    body := '{}'::jsonb, timeout_milliseconds := 30000);
  perform cron.alter_job((select jobid from cron.job where jobname = 'update-schedule-random'),
    schedule := extract(minute from u)::int || ' ' || extract(hour from u)::int || ' * * *');
end $$;

-- ② 승패 배당: 리그마다 따로 30~120분 랜덤. 국내(BetExplorer)는 다른 국내 리그가 3분 안에 불렀으면 3~10분 미룸,
--    직전이 차단(429)이면 90~120분.
create table if not exists public.odds_jobs (
  league text primary key, job text not null, last_request_at timestamptz, next_at timestamptz, deferred int not null default 0
);
create table if not exists public.odds_fetch_log (
  id bigserial primary key, fetched_at timestamptz not null default now(), league text not null, status text not null, note jsonb
);
create index if not exists odds_fetch_log_idx on public.odds_fetch_log (league, fetched_at desc);
alter table public.odds_jobs enable row level security;
alter table public.odds_fetch_log enable row level security;
create policy anon_read_odds_jobs on public.odds_jobs for select using (true);
create policy anon_read_odds_log on public.odds_fetch_log for select using (true);
insert into public.odds_jobs (league, job) values
  ('NBA', 'collect-odds-nba'), ('KBL', 'collect-odds-kbl'), ('WKBL', 'collect-odds-wkbl'), ('V리그 남자', 'collect-odds-vm'), ('V리그 여자', 'collect-odds-vw')
on conflict (league) do nothing;

create or replace function public.run_collect_odds(p_league text) returns void
language plpgsql security definer set search_path = public, cron, net as $$
declare
  j public.odds_jobs; mins int; nxt timestamptz; u timestamp; busy boolean; blocked boolean;
begin
  select * into j from public.odds_jobs where league = p_league;
  busy := p_league <> 'NBA' and exists (select 1 from public.odds_jobs where league not in ('NBA', p_league) and last_request_at > now() - interval '3 minutes');
  if busy then
    mins := 3 + floor(random() * 8)::int;
    update public.odds_jobs set deferred = deferred + 1 where league = p_league;
  else
    perform net.http_post(
      url := 'https://rgxjwfsmevfwmivsziyq.supabase.co/functions/v1/collect-odds',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJneGp3ZnNtZXZmd21pdnN6aXlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzODIzOTUsImV4cCI6MjA5Njk1ODM5NX0.8eD0N5CLCBoDSrlg0nz3Q2JmOYthHepJlTptHCMYetw"}'::jsonb,
      body := jsonb_build_object('league', p_league), timeout_milliseconds := 60000);
    blocked := exists (select 1 from (select status from public.odds_fetch_log where league = p_league order by fetched_at desc limit 1) l where l.status = 'blocked');
    mins := case when blocked then 90 + floor(random() * 31)::int else 30 + floor(random() * 91)::int end;
    update public.odds_jobs set last_request_at = now(), deferred = 0 where league = p_league;
  end if;
  nxt := now() + make_interval(mins => mins); u := nxt at time zone 'UTC';
  update public.odds_jobs set next_at = nxt where league = p_league;
  perform cron.alter_job((select jobid from cron.job where jobname = j.job), schedule := extract(minute from u)::int || ' ' || extract(hour from u)::int || ' * * *');
end $$;

-- ③ 선수 경기 기록: NBA 매일 18~19시 KST(UTC 9시), 국내 매일 03~04시 KST(UTC 18시) — 분은 매일 랜덤
create or replace function public.run_collect_stats(p_group text) returns void
language plpgsql security definer set search_path = public, cron, net as $$
begin
  perform net.http_post(
    url := 'https://rgxjwfsmevfwmivsziyq.supabase.co/functions/v1/collect-stats',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJneGp3ZnNtZXZmd21pdnN6aXlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzODIzOTUsImV4cCI6MjA5Njk1ODM5NX0.8eD0N5CLCBoDSrlg0nz3Q2JmOYthHepJlTptHCMYetw"}'::jsonb,
    body := jsonb_build_object('group', p_group), timeout_milliseconds := 150000);
  perform cron.alter_job((select jobid from cron.job where jobname = 'collect-stats-' || p_group),
    schedule := floor(random() * 60)::int || case when p_group = 'nba' then ' 9 * * *' else ' 18 * * *' end);
end $$;

revoke all on function public.run_update_schedule() from public, anon, authenticated;
revoke all on function public.run_collect_odds(text) from public, anon, authenticated;
revoke all on function public.run_collect_stats(text) from public, anon, authenticated;

-- 작업 등록 (배당은 처음 시작을 리그마다 5~45분 사이로 흩어 둔다)
do $$
declare r record; u timestamp;
begin
  for r in select * from public.odds_jobs loop
    u := (now() + make_interval(mins => 5 + floor(random() * 41)::int)) at time zone 'UTC';
    perform cron.schedule(r.job, extract(minute from u)::int || ' ' || extract(hour from u)::int || ' * * *', format('select public.run_collect_odds(%L)', r.league));
    update public.odds_jobs set next_at = (u at time zone 'UTC') where league = r.league;
  end loop;
  perform cron.schedule('collect-stats-nba', floor(random() * 60)::int || ' 9 * * *', 'select public.run_collect_stats(''nba'')');
  perform cron.schedule('collect-stats-domestic', floor(random() * 60)::int || ' 18 * * *', 'select public.run_collect_stats(''domestic'')');
end $$;

-- ④ 분석 탭 '업데이트 현황'용 (cron·net 스키마는 앱에서 못 읽어서 이 함수로)
create or replace function public.analysis_update_status() returns jsonb
language sql security definer set search_path = public, cron, net as $$
  select jsonb_build_object(
    'now', now(),
    'jobs', (select coalesce(jsonb_agg(jsonb_build_object(
        'name', j.jobname, 'schedule', j.schedule, 'active', j.active,
        'runs', (select coalesce(jsonb_agg(r order by r->>'start' desc), '[]'::jsonb) from (
                   select jsonb_build_object('start', d.start_time, 'status', d.status) r
                   from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 6) x))), '[]'::jsonb)
      from cron.job j where j.jobname like 'update-schedule%' or j.jobname like 'collect-%'),
    'schedule_last', (select jsonb_build_object('at', created, 'status', status_code, 'body', case when content ~ '^\s*\[' then content::jsonb end)
      from net._http_response where content like '[{"league":"NBA","counts"%' order by created desc limit 1),
    'schedules', (select coalesce(jsonb_agg(jsonb_build_object('league', league, 'game_date', game_date, 'games', jsonb_array_length(games), 'fetched_at', fetched_at) order by league, game_date), '[]'::jsonb)
      from game_schedules where game_date >= (now() at time zone 'Asia/Seoul')::date),
    'odds_jobs', (select coalesce(jsonb_agg(jsonb_build_object('league', o.league, 'last_request_at', o.last_request_at, 'next_at', o.next_at, 'deferred', o.deferred,
        'last', (select jsonb_build_object('at', l.fetched_at, 'status', l.status, 'note', l.note) from public.odds_fetch_log l where l.league = o.league order by l.fetched_at desc limit 1),
        'snapshots', (select count(*) from public.odds_snapshots s where s.league = o.league and s.game_date >= (now() at time zone 'Asia/Seoul')::date))), '[]'::jsonb)
      from public.odds_jobs o),
    'player_stats', (select coalesce(jsonb_agg(jsonb_build_object('league', league, 'rows', n, 'games', g, 'last_game', lg, 'last_insert', li) order by league), '[]'::jsonb)
      from (select league, count(*) n, count(distinct game_id) g, max(game_date) lg, max(created_at) li from player_game_stats group by league) s),
    'kovo_snapshots', (select jsonb_build_object('players', count(*), 'last', max(snapshot_date)) from kovo_player_snapshots where snapshot_date = (select max(snapshot_date) from kovo_player_snapshots)),
    'analyses', (select coalesce(jsonb_agg(jsonb_build_object('league', league, 'count', n, 'last', l) order by league), '[]'::jsonb)
      from (select league, count(*) n, max(updated_at) l from overall_analyses group by league) a)
  )
$$;
grant execute on function public.analysis_update_status() to anon, authenticated;

-- ⑤ NBA ESPN 부상자 명단: 매일 14:33 · 17:33 · 20:33 KST (UTC 5·8·11시) — Claude 뉴스 확인(15·18·21시 KST) 직전.
--    같은 함수가 지난 출전 확률(player_status, 경기 이틀 지나면)과 뉴스 확인 기록(14일)을 정리한다.
create or replace function public.run_collect_injuries() returns void
language plpgsql security definer set search_path = public, net as $$
begin
  perform net.http_post(
    url := 'https://rgxjwfsmevfwmivsziyq.supabase.co/functions/v1/collect-injuries',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJneGp3ZnNtZXZmd21pdnN6aXlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzODIzOTUsImV4cCI6MjA5Njk1ODM5NX0.8eD0N5CLCBoDSrlg0nz3Q2JmOYthHepJlTptHCMYetw"}'::jsonb,
    body := '{}'::jsonb, timeout_milliseconds := 60000);
end $$;
revoke all on function public.run_collect_injuries() from public, anon, authenticated;
select cron.schedule('collect-injuries', '33 5,8,11 * * *', 'select public.run_collect_injuries()');

-- ⑥ 업데이트 현황에 출전 확률·체급 추가 (analysis_update_status 위에 덧붙임)
create or replace function public.analysis_update_status_v2() returns jsonb
language sql security definer set search_path = public as $$
  select public.analysis_update_status() || jsonb_build_object(
    'injuries', (select jsonb_build_object('count', count(*), 'last', max(fetched_at)) from public.nba_injuries),
    'news_checks', (select coalesce(jsonb_agg(x order by x->>'ran_at' desc), '[]'::jsonb) from (
        select jsonb_build_object('ran_at', ran_at, 'task', task, 'games', games, 'players', players, 'note', note) x
        from public.news_check_log order by ran_at desc limit 8) l),
    'player_status', (select coalesce(jsonb_agg(jsonb_build_object('league', league, 'game_date', game_date, 'n', n, 'last', l) order by game_date, league), '[]'::jsonb)
        from (select league, game_date, count(*) n, max(checked_at) l from public.player_status group by league, game_date) s),
    'player_base', (select coalesce(jsonb_agg(jsonb_build_object('league', league, 'season', season, 'n', n, 'manual', m) order by league), '[]'::jsonb)
        from (select league, season, count(*) n, count(manual_base) m from public.player_base group by league, season) b)
  )
$$;
grant execute on function public.analysis_update_status_v2() to anon, authenticated;

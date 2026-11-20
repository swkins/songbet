-- 축구 5대 리그 일정 + 승무패 배당 자동 수집 (사용자 요청 — 리그마다 나눠서 분산, 다른 작업과 안 겹치게)
-- 리그마다 pg_cron 작업 하나(collect-soccer-epl·laliga·seriea·bundesliga·ligue1)가 Supabase 함수 collect-soccer를 부른다.
--  - 다른 리그 배당·축구 작업(odds_jobs)이나 경기 일정 업데이트가 3분 안에 돌았으면 3~10분 미룸
--  - 보통 40~100분 뒤 랜덤(시·분), 오늘·내일 그 리그 경기가 없으면 150~240분, 직전이 차단이면 90~120분
-- 진행 기록은 배당과 같은 odds_jobs·odds_fetch_log (업데이트 현황에 같이 나온다).
alter table public.odds_snapshots add column if not exists draw_odds numeric;
alter table public.odds_snapshots add column if not exists open_draw numeric;

insert into public.odds_jobs (league, job) values
  ('잉글랜드 1부', 'collect-soccer-epl'), ('스페인 1부', 'collect-soccer-laliga'), ('이탈리아 1부', 'collect-soccer-seriea'),
  ('독일 1부', 'collect-soccer-bundesliga'), ('프랑스 1부', 'collect-soccer-ligue1')
on conflict (league) do nothing;

create or replace function public.run_collect_soccer(p_league text) returns void
language plpgsql security definer set search_path = public, cron, net as $$
declare
  j public.odds_jobs; mins int; nxt timestamptz; u timestamp; busy boolean; blocked boolean; has_games boolean;
begin
  -- 같은 분에 다른 작업과 겹치면 5~25초 늦게 확인해서 먼저 돈 쪽을 보고 미룬다
  perform pg_sleep(5 + random() * 20);
  select * into j from public.odds_jobs where league = p_league;
  busy := exists (select 1 from public.odds_jobs where league <> p_league and last_request_at > now() - interval '3 minutes')
       or exists (select 1 from cron.job_run_details d join cron.job c on c.jobid = d.jobid
                  where c.jobname = 'update-schedule-random' and d.start_time > now() - interval '3 minutes');
  if busy then
    mins := 3 + floor(random() * 8)::int;
    update public.odds_jobs set deferred = deferred + 1 where league = p_league;
  else
    perform net.http_post(
      url := 'https://rgxjwfsmevfwmivsziyq.supabase.co/functions/v1/collect-soccer',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJneGp3ZnNtZXZmd21pdnN6aXlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzODIzOTUsImV4cCI6MjA5Njk1ODM5NX0.8eD0N5CLCBoDSrlg0nz3Q2JmOYthHepJlTptHCMYetw"}'::jsonb,
      body := jsonb_build_object('league', p_league), timeout_milliseconds := 60000);
    blocked := exists (select 1 from (select status from public.odds_fetch_log where league = p_league order by fetched_at desc limit 1) l where l.status = 'blocked');
    has_games := exists (select 1 from public.game_schedules where league = p_league
                         and game_date between (now() at time zone 'Asia/Seoul')::date and (now() at time zone 'Asia/Seoul')::date + 1
                         and jsonb_array_length(games) > 0);
    mins := case when blocked then 90 + floor(random() * 31)::int
                 when not has_games then 150 + floor(random() * 91)::int
                 else 40 + floor(random() * 61)::int end;
    update public.odds_jobs set last_request_at = now(), deferred = 0 where league = p_league;
  end if;
  nxt := now() + make_interval(mins => mins); u := nxt at time zone 'UTC';
  update public.odds_jobs set next_at = nxt where league = p_league;
  perform cron.alter_job((select jobid from cron.job where jobname = j.job), schedule := extract(minute from u)::int || ' ' || extract(hour from u)::int || ' * * *');
end $$;
revoke all on function public.run_collect_soccer(text) from public, anon, authenticated;

-- 처음 시작: 리그마다 약 12분 간격으로 흩어 둔다 (5·17·29·41·53분 뒤 + 0~4분)
do $$
declare r record; i int := 0; u timestamp;
begin
  for r in select * from public.odds_jobs where job like 'collect-soccer-%' order by job loop
    u := (now() + make_interval(mins => 5 + i * 12 + floor(random() * 5)::int)) at time zone 'UTC';
    perform cron.schedule(r.job, extract(minute from u)::int || ' ' || extract(hour from u)::int || ' * * *', format('select public.run_collect_soccer(%L)', r.league));
    update public.odds_jobs set next_at = (u at time zone 'UTC') where league = r.league;
    i := i + 1;
  end loop;
end $$;

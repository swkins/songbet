-- 365Scores 배구 리그마다 따로 랜덤 수집 (2026-11-22 사용자 요청 — 너무 일정한 순서면 문제가 될 수 있다)
-- 작업 12개 collect-365-<코드> → public.run_collect_365(리그): 함수 collect-365에 {league} 한 리그만,
--   다음 실행 = 오늘·내일 경기 있으면 25~55분, 없으면 120~200분 뒤 랜덤(시·분), 직전 차단이면 90~150분.
--   다른 365 작업이 1분 안에 돌았으면 1~4분 미룸. 기록 = collect_365_jobs (+ 요청마다 odds_fetch_log note.src '365').
-- 예전 묶음 작업 collect-365-volley(매시 9·39분)는 active false로 꺼 둠.

create table if not exists public.collect_365_jobs (
  league text primary key, job text not null, last_request_at timestamptz, next_at timestamptz, deferred int not null default 0
);
alter table public.collect_365_jobs enable row level security;
create policy "collect_365_jobs read" on public.collect_365_jobs for select using (true);

insert into public.collect_365_jobs (league, job) values
 ('V리그 남자','collect-365-vm'), ('V리그 여자','collect-365-vw'),
 ('이탈리아 남자','collect-365-itm'), ('이탈리아 여자','collect-365-itw'),
 ('폴란드 남자','collect-365-plm'), ('폴란드 여자','collect-365-plw'),
 ('터키 남자','collect-365-trm'), ('터키 여자','collect-365-trw'),
 ('브라질 남자','collect-365-brm'), ('브라질 여자','collect-365-brw'),
 ('체코 남자','collect-365-czm'), ('벨기에 여자','collect-365-bew')
on conflict (league) do nothing;

-- run_collect_365 본문은 키를 파일에 적지 않으려고 아래 do 블록이 run_collect_odds 정의에서 키를 읽어 만든다
do $$
declare k text; f text;
begin
  k := substring(pg_get_functiondef('public.run_collect_odds(text)'::regprocedure) from 'Bearer (eyJ[A-Za-z0-9._-]+)');
  if k is null then raise exception 'key not found'; end if;
  f := $f$
create or replace function public.run_collect_365(p_league text) returns void
language plpgsql security definer set search_path to 'public', 'cron', 'net' as $body$
declare j public.collect_365_jobs; mins int; nxt timestamptz; u timestamp; busy boolean; blocked boolean; has_games boolean;
  today date := (now() at time zone 'Asia/Seoul')::date;
begin
  perform pg_sleep(3 + random() * 20);
  select * into j from public.collect_365_jobs where league = p_league;
  busy := exists (select 1 from public.collect_365_jobs where league <> p_league and last_request_at > now() - interval '1 minute');
  if busy then
    mins := 1 + floor(random() * 4)::int;
    update public.collect_365_jobs set deferred = deferred + 1 where league = p_league;
  else
    perform net.http_post(url := 'https://rgxjwfsmevfwmivsziyq.supabase.co/functions/v1/collect-365',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer KEYHOLDER'),
      body := jsonb_build_object('league', p_league), timeout_milliseconds := 60000);
    update public.collect_365_jobs set last_request_at = now(), deferred = 0 where league = p_league;
    blocked := exists (select 1 from (select status from public.odds_fetch_log where league = p_league and note->>'src' = '365' order by fetched_at desc limit 1) l where l.status = 'blocked');
    has_games := exists (select 1 from public.game_schedules where league = p_league and game_date between today and today + 1 and jsonb_array_length(games) > 0);
    mins := case when blocked then 90 + floor(random() * 61)::int
                 when has_games then 25 + floor(random() * 31)::int
                 else 120 + floor(random() * 81)::int end;
  end if;
  nxt := now() + make_interval(mins => mins); u := nxt at time zone 'UTC';
  update public.collect_365_jobs set next_at = nxt where league = p_league;
  perform cron.alter_job((select jobid from cron.job where jobname = j.job), schedule := extract(minute from u)::int || ' ' || extract(hour from u)::int || ' * * *');
end $body$;
$f$;
  execute replace(f, 'KEYHOLDER', k);
end $$;

-- 작업 12개 (처음 시각은 지금부터 2~40분 사이로 흩어 놓음)
do $$
declare r record; t timestamp;
begin
  for r in select * from public.collect_365_jobs loop
    t := (now() + make_interval(mins => 2 + floor(random() * 39)::int)) at time zone 'UTC';
    perform cron.schedule(r.job, extract(minute from t)::int || ' ' || extract(hour from t)::int || ' * * *', format('select public.run_collect_365(%L)', r.league));
  end loop;
  perform cron.alter_job((select jobid from cron.job where jobname = 'collect-365-volley'), active := false);
end $$;

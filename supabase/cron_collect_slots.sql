-- BetExplorer 요청 줄이기 (2026-11-22 사용자 요청 — 429 분산 전략)
-- 1) K리그1·K리그2·J리그2는 피나클이 메인이라 BetExplorer 묶음(3분 띄우기)에서 뺀다.
-- 2) (경기 시간 기준 시각은 사용자 요청으로 되돌림) 모든 리그 예전대로 30~120분 랜덤, 막히면 90~120분.
--    막히면 함수(collect-odds)가 다른 지역으로 바로 한 번 더 시도한다.
-- 적용: 아래 do 블록이 지금 함수 정의에서 키를 읽어 새 정의를 만든다 (키를 파일에 적지 않으려고).

do $$
declare d text; k text; nd text;
begin
  -- run_collect_soccer: BetExplorer 묶음에서 K리그·J2 빼기
  d := pg_get_functiondef('public.run_collect_soccer(text)'::regprocedure);
  d := replace(d, 'array[''KBL'',''WKBL'',''V리그 남자'',''V리그 여자'',''K리그1'',''K리그2'',''J리그2'']', 'array[''KBL'',''WKBL'',''V리그 남자'',''V리그 여자'']');
  execute d;

  d := pg_get_functiondef('public.run_collect_odds(text)'::regprocedure);
  k := substring(d from 'Bearer (eyJ[A-Za-z0-9._-]+)');
  nd := $f$
create or replace function public.run_collect_odds(p_league text) returns void
language plpgsql security definer set search_path to 'public', 'cron', 'net' as $body$
declare
  j public.odds_jobs; nxt timestamptz; u timestamp; busy boolean; blocked boolean;
  bx_set text[] := array['KBL','WKBL','V리그 남자','V리그 여자'];
begin
  select * into j from public.odds_jobs where league = p_league;
  busy := p_league <> 'NBA' and exists (select 1 from public.odds_jobs where league = any(bx_set)
                                          and league <> p_league and last_request_at > now() - interval '3 minutes');
  if busy then
    nxt := now() + make_interval(mins => 3 + floor(random() * 8)::int);
    update public.odds_jobs set deferred = deferred + 1 where league = p_league;
  else
    perform net.http_post(
      url := 'https://rgxjwfsmevfwmivsziyq.supabase.co/functions/v1/collect-odds',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer KEYHOLDER'),
      body := jsonb_build_object('league', p_league), timeout_milliseconds := 60000);
    update public.odds_jobs set last_request_at = now(), deferred = 0 where league = p_league;
    blocked := exists (select 1 from (select status from public.odds_fetch_log where league = p_league order by fetched_at desc limit 1) l where l.status = 'blocked');
    -- 2026-11-22 사용자 요청으로 경기 시간 기준 시각은 되돌림 — 예전처럼 30~120분 랜덤, 막히면 90~120분
    nxt := now() + make_interval(mins => case when blocked then 90 + floor(random() * 31)::int else 30 + floor(random() * 91)::int end);
  end if;
  u := nxt at time zone 'UTC';
  update public.odds_jobs set next_at = nxt where league = p_league;
  perform cron.alter_job((select jobid from cron.job where jobname = j.job), schedule := extract(minute from u)::int || ' ' || extract(hour from u)::int || ' * * *');
end $body$;
$f$;
  nd := replace(nd, 'KEYHOLDER', k);
  execute nd;
end $$;

-- BetExplorer 요청 줄이기 (2026-11-22 사용자 요청 — 429 분산 전략)
-- 1) K리그1·K리그2·J리그2는 피나클이 메인이라 BetExplorer 묶음(3분 띄우기)에서 뺀다.
-- 2) KBL·WKBL·V리그 남·여 승패 배당은 30~120분 랜덤 대신 경기 시간에 맞춘 시각에만 부른다:
--    경기 전날 20시(KST) · 경기 날 10시 · 시작 2시간 전 · 시작 30분 전 (+0~4분 흔들기). 다음 시각이 없으면 6시간 뒤 일정만 다시 확인.
--    직전 요청이 막혔으면(blocked) 20~30분 뒤 한 번 더 (다음 시각보다 늦지 않게). 막히면 함수(collect-odds)가 다른 지역으로 바로 한 번 더 시도한다.
--    NBA(Action Network)는 예전대로 30~120분.
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
  today date := (now() at time zone 'Asia/Seoul')::date;
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
    if p_league = 'NBA' then
      nxt := now() + make_interval(mins => case when blocked then 90 + floor(random() * 31)::int else 30 + floor(random() * 91)::int end);
    else
      -- 경기 시간에 맞춘 다음 시각
      select min(s) into nxt from (
        select st - interval '30 minutes' s from g
        union all select st - interval '2 hours' from g
        union all select ((gd::timestamp + time '10:00') at time zone 'Asia/Seoul') from g
        union all select (((gd - 1)::timestamp + time '20:00') at time zone 'Asia/Seoul') from g
      ) t where s > now() + interval '5 minutes';
      nxt := coalesce(least(nxt, now() + interval '20 hours'), now() + interval '6 hours');
      if blocked then nxt := least(nxt, now() + make_interval(mins => 20 + floor(random() * 11)::int)); end if;
      nxt := nxt + make_interval(mins => floor(random() * 5)::int);
    end if;
  end if;
  u := nxt at time zone 'UTC';
  update public.odds_jobs set next_at = nxt where league = p_league;
  perform cron.alter_job((select jobid from cron.job where jobname = j.job), schedule := extract(minute from u)::int || ' ' || extract(hour from u)::int || ' * * *');
end $body$;
$f$;
  -- g = 이 리그 앞으로의 경기 (오늘~모레)
  nd := replace(nd, 'from g', 'from (select s.game_date gd, (x->>''start'')::timestamptz st from public.game_schedules s, jsonb_array_elements(s.games) x where s.league = p_league and s.game_date between today and today + 2 and (x->>''start'')::timestamptz > now()) g');
  nd := replace(nd, 'KEYHOLDER', k);
  execute nd;
end $$;

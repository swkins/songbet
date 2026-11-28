-- 축구 5대 리그 일정 + 승무패 배당 자동 수집 (사용자 요청 — 리그마다 나눠서 분산, 다른 작업과 안 겹치게)
-- 리그마다 pg_cron 작업 하나(collect-soccer-epl·laliga·seriea·bundesliga·ligue1)가 Supabase 함수 collect-soccer를 부른다.
--  - 다른 리그 배당·축구 작업(odds_jobs)이나 경기 일정 업데이트가 3분 안에 돌았으면 3~10분 미룸
--  - 보통 40~100분 뒤 랜덤(시·분), 오늘·내일 그 리그 경기가 없으면 150~240분, 직전이 차단이면 90~120분
-- 진행 기록은 배당과 같은 odds_jobs·odds_fetch_log (업데이트 현황에 같이 나온다).
alter table public.odds_snapshots add column if not exists draw_odds numeric;
alter table public.odds_snapshots add column if not exists open_draw numeric;

insert into public.odds_jobs (league, job) values
  ('프리미어리그', 'collect-soccer-epl'), ('라리가', 'collect-soccer-laliga'), ('세리에A', 'collect-soccer-seriea'),
  ('분데스리가', 'collect-soccer-bundesliga'), ('리그1', 'collect-soccer-ligue1')
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

-- ── 2026-11-21 리그 확장 (사용자 요청: 리그 관리의 축구 리그 중 일정 받을 수 있는 리그 전부, 스위스·아일랜드·체코·핀란드는 뺌) ──
-- ESPN 25개 + K리그 1·2부(K리그 API) + J리그2(J리그 데이터 사이트). K리그·J2 배당은 BetExplorer.
-- 리그가 많아져서 "3분 안에 다른 작업이 돌았으면 미룸"을 출처별로 나눔:
--  BetExplorer 쓰는 작업(국내 농구·배구 배당 + K리그·J2)끼리만 3분, ESPN 축구끼리는 1분 (3~10분 / 1~4분 미룸).
--  주기: 5대 리그 40~100분, 나머지 60~120분, 오늘·내일 경기 없으면 150~240분 / 나머지 180~300분, 차단이면 90~120분.
insert into public.odds_jobs (league, job) values
  ('챔피언쉽','collect-soccer-eng2'),('잉글랜드 리그1','collect-soccer-eng3'),('라리가2','collect-soccer-esp2'),('세리에B','collect-soccer-ita2'),
  ('분데스리가2','collect-soccer-ger2'),('리그2','collect-soccer-fra2'),('에레디비시','collect-soccer-ned'),('프리메이라리가','collect-soccer-por'),
  ('쥬필러리그','collect-soccer-bel'),('터키','collect-soccer-tur'),('그리스','collect-soccer-gre'),('덴마크','collect-soccer-den'),('오스트리아','collect-soccer-aut'),
  ('스코틀랜드','collect-soccer-sco'),('스웨덴','collect-soccer-swe'),('미국','collect-soccer-usa'),('멕시코','collect-soccer-mex'),('브라질','collect-soccer-bra'),
  ('아르헨티나','collect-soccer-arg'),('J리그1','collect-soccer-jpn1'),('호주','collect-soccer-aus'),('중국','collect-soccer-chn'),
  ('네이션스 리그','collect-soccer-nations'),('국제 친선 경기','collect-soccer-intl'),('친선경기','collect-soccer-club'),
  ('K리그1','collect-soccer-kor1'),('K리그2','collect-soccer-kor2'),('J리그2','collect-soccer-jpn2')
on conflict (league) do nothing;

create or replace function public.run_collect_soccer(p_league text) returns void
language plpgsql security definer set search_path = public, cron, net as $$
declare
  j public.odds_jobs; mins int; nxt timestamptz; u timestamp; busy boolean; blocked boolean; has_games boolean;
  bx_set text[] := array['KBL','WKBL','V리그 남자','V리그 여자','K리그1','K리그2','J리그2'];
  top5 boolean := p_league in ('프리미어리그','라리가','세리에A','분데스리가','리그1');
  is_bx boolean := p_league = any(bx_set);
begin
  perform pg_sleep(5 + random() * 20);
  select * into j from public.odds_jobs where league = p_league;
  if is_bx then
    busy := exists (select 1 from public.odds_jobs where league = any(bx_set) and league <> p_league and last_request_at > now() - interval '3 minutes');
  else
    busy := exists (select 1 from public.odds_jobs where job like 'collect-soccer-%' and not (league = any(bx_set)) and league <> p_league and last_request_at > now() - interval '1 minute');
  end if;
  busy := busy or exists (select 1 from cron.job_run_details d join cron.job c on c.jobid = d.jobid
                  where c.jobname = 'update-schedule-random' and d.start_time > now() - interval '2 minutes');
  if busy then
    mins := case when is_bx then 3 + floor(random() * 8)::int else 1 + floor(random() * 4)::int end;
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
                 when not has_games then case when top5 then 150 + floor(random() * 91)::int else 180 + floor(random() * 121)::int end
                 when top5 then 40 + floor(random() * 61)::int
                 else 60 + floor(random() * 61)::int end;
    update public.odds_jobs set last_request_at = now(), deferred = 0 where league = p_league;
  end if;
  nxt := now() + make_interval(mins => mins); u := nxt at time zone 'UTC';
  update public.odds_jobs set next_at = nxt where league = p_league;
  perform cron.alter_job((select jobid from cron.job where jobname = j.job), schedule := extract(minute from u)::int || ' ' || extract(hour from u)::int || ' * * *');
end $$;
revoke all on function public.run_collect_soccer(text) from public, anon, authenticated;

-- 국내 농구·배구 배당(run_collect_odds)도 BetExplorer 작업끼리만 3분 (축구 리그가 늘어 전부 보면 계속 미뤄짐)
create or replace function public.run_collect_odds(p_league text) returns void
language plpgsql security definer set search_path = public, cron, net as $$
declare
  j public.odds_jobs; mins int; nxt timestamptz; u timestamp; busy boolean; blocked boolean;
begin
  select * into j from public.odds_jobs where league = p_league;
  busy := p_league <> 'NBA' and exists (select 1 from public.odds_jobs where league = any(array['KBL','WKBL','V리그 남자','V리그 여자','K리그1','K리그2','J리그2'])
                                          and league <> p_league and last_request_at > now() - interval '3 minutes');
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
revoke all on function public.run_collect_odds(text) from public, anon, authenticated;

-- 새 작업 처음 시작: 약 3~4분 간격으로 흩어 둔다 (방금 한 번씩 손으로 돌렸으니 60분 뒤부터)
do $$
declare r record; i int := 0; u timestamp;
begin
  for r in select * from public.odds_jobs where job like 'collect-soccer-%'
           and league not in ('프리미어리그','라리가','세리에A','분데스리가','리그1') order by random() loop
    u := (now() + make_interval(mins => 60 + i * 3 + floor(random() * 3)::int)) at time zone 'UTC';
    perform cron.schedule(r.job, extract(minute from u)::int || ' ' || extract(hour from u)::int || ' * * *', format('select public.run_collect_soccer(%L)', r.league));
    update public.odds_jobs set next_at = (u at time zone 'UTC') where league = r.league;
    i := i + 1;
  end loop;
end $$;

-- 2026-11-21 클럽 친선경기는 뺌 (사용자 요청 — A매치 국가대표 경기만). 타이머는 꺼 두고 저장된 일정은 비움.
select cron.alter_job((select jobid from cron.job where jobname = 'collect-soccer-club'), active := false);
update public.game_schedules set games = '[]'::jsonb where league = '친선경기';
update public.odds_jobs set next_at = null where league = '친선경기';

-- ── 2026-11-24 UEFA 클럽 대회 (사용자 요청 — 챔스가 일정에 없었다): ESPN uefa.champions·uefa.europa·uefa.europa.conf, DraftKings 승무패 같이 옴 ──
insert into soccer_leagues (name) select x from unnest(array['챔피언스리그','유로파리그','컨퍼런스리그']) x where not exists (select 1 from soccer_leagues where name = x);
insert into public.odds_jobs (league, job) values ('챔피언스리그','collect-soccer-ucl'),('유로파리그','collect-soccer-uel'),('컨퍼런스리그','collect-soccer-uecl') on conflict (league) do nothing;
select cron.schedule(j, '0 0 1 1 *', format('select public.run_collect_soccer(%L)', l)) from (values ('collect-soccer-ucl','챔피언스리그'),('collect-soccer-uel','유로파리그'),('collect-soccer-uecl','컨퍼런스리그')) v(j,l);
-- 그다음 alter_job으로 첫 실행을 45~60분 뒤로 (그 뒤는 run_collect_soccer가 60~120분 랜덤으로 다시 잡음)
-- 다른 리그 팀(챔스·유로파·컨퍼런스에만 나오는 팀) 한글 이름 37개는 soccer_team_names league '' 로 넣음

-- ── 2026-11-24 AFC 클럽 대회 (사용자 요청): ESPN afc.champions(엘리트)·afc.cup(챔피언스리그 2) ──
insert into soccer_leagues (name) select x from unnest(array['아시아 챔피언스리그','아시아 챔피언스리그2']) x where not exists (select 1 from soccer_leagues where name = x);
insert into public.odds_jobs (league, job) values ('아시아 챔피언스리그','collect-soccer-acl'),('아시아 챔피언스리그2','collect-soccer-acl2') on conflict (league) do nothing;
select cron.schedule(j, '0 0 1 1 *', format('select public.run_collect_soccer(%L)', l)) from (values ('collect-soccer-acl','아시아 챔피언스리그'),('collect-soccer-acl2','아시아 챔피언스리그2')) v(j,l);
-- 그다음 alter_job으로 첫 실행을 50분 뒤로. K리그 팀 ESPN 영어 이름(Jeonbuk Hyundai Motors 등)·중동·동남아 팀 50개는 soccer_team_names league '' 로 넣음

-- 2026-11-28: 꺼 둔 타이머(active false)도 계속 돌던 문제 — run_collect_soccer가 끝에 cron.alter_job으로 다음 시각을 다시 잡는데,
-- 그래도 꺼진 작업이 실행됐다. 함수 맨 앞에서 자기 작업이 꺼져 있으면 바로 끝내고, 꺼진 작업은 일정도 '0 0 31 2 *'(오지 않는 날)로.
-- (5대 리그만 남김 — 2026-11-27 사용자 요청. 다시 켜려면 cron.alter_job(jobid, schedule := '0 0 * * *', active := true) 뒤 한 번 돌면 랜덤 시각으로 바뀜)
create or replace function public.run_collect_soccer(p_league text)
 returns void language plpgsql security definer set search_path to 'public', 'cron', 'net'
as $function$
declare
  j public.odds_jobs; mins int; nxt timestamptz; u timestamp; busy boolean; blocked boolean; has_games boolean;
  bx_set text[] := array['KBL','WKBL','V리그 남자','V리그 여자'];
  top5 boolean := p_league in ('프리미어리그','라리가','세리에A','분데스리가','리그1');
  is_bx boolean := p_league = any(bx_set);
begin
  select * into j from public.odds_jobs where league = p_league;
  if not coalesce((select active from cron.job where jobname = j.job), false) then return; end if;
  perform pg_sleep(5 + random() * 20);
  if is_bx then
    busy := exists (select 1 from public.odds_jobs where league = any(bx_set) and league <> p_league and last_request_at > now() - interval '3 minutes');
  else
    busy := exists (select 1 from public.odds_jobs where job like 'collect-soccer-%' and not (league = any(bx_set)) and league <> p_league and last_request_at > now() - interval '1 minute');
  end if;
  busy := busy or exists (select 1 from cron.job_run_details d join cron.job c on c.jobid = d.jobid
                  where c.jobname = 'update-schedule-random' and d.start_time > now() - interval '2 minutes');
  if busy then
    mins := case when is_bx then 3 + floor(random() * 8)::int else 1 + floor(random() * 4)::int end;
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
                 when not has_games then case when top5 then 150 + floor(random() * 91)::int else 180 + floor(random() * 121)::int end
                 when top5 then 40 + floor(random() * 61)::int
                 else 60 + floor(random() * 61)::int end;
    update public.odds_jobs set last_request_at = now(), deferred = 0 where league = p_league;
  end if;
  nxt := now() + make_interval(mins => mins); u := nxt at time zone 'UTC';
  update public.odds_jobs set next_at = nxt where league = p_league;
  perform cron.alter_job((select jobid from cron.job where jobname = j.job), schedule := extract(minute from u)::int || ' ' || extract(hour from u)::int || ' * * *');
end $function$;
select cron.alter_job(jobid, schedule := '0 0 31 2 *', active := false) from cron.job where jobname like 'collect-soccer-%' and not active;

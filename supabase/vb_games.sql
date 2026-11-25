-- 배구 경기 결과 (2026-11-21 사용자 요청 — 배구도 NBA처럼 우리 모델: 팀 기록 부분)
-- KOVO /games/schedules?season=<시즌 코드>&match=001 = 시즌 전체 남녀 일정·세트 스코어 (세트별 점수는 없음). 시즌 코드 = 시작 해 − 2003 (2026-27 → 023).
-- 끝난 경기(한쪽 3세트)만 vb_games에. pg_net은 응답이 나중에 와서 두 단계: 04:21·16:21 요청 → 10분 뒤 저장.
create table if not exists public.vb_games (
  game_key text primary key, league text not null, season text, game_date date, home text, away text, home_sets int, away_sets int, updated_at timestamptz default now());
alter table public.vb_games enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'vb_games' and policyname = 'anon_read_vb_games') then
    create policy anon_read_vb_games on public.vb_games for select using (true);
  end if;
end $$;
create table if not exists public.vb_games_req (req_id bigint primary key, at timestamptz default now());
create or replace function public.vb_games_request() returns void
language plpgsql security definer set search_path = public, net as $$
declare y int := extract(year from (now() at time zone 'Asia/Seoul'))::int - case when extract(month from (now() at time zone 'Asia/Seoul')) >= 8 then 0 else 1 end;
begin
  insert into public.vb_games_req (req_id)
  select net.http_get('https://user-api.kovo.co.kr/games/schedules?season=' || lpad((y - 2003)::text, 3, '0') || '&match=001',
    headers := '{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124","Accept":"application/json","Accept-Language":"ko"}'::jsonb)
  on conflict do nothing;
end $$;
create or replace function public.vb_games_parse() returns int
language plpgsql security definer set search_path = public, net as $$
declare n int;
begin
  with ok as (
    select r.content::jsonb j from public.vb_games_req q join net._http_response r on r.id = q.req_id
    where r.status_code = 200 and left(ltrim(r.content), 1) = '{' and r.content like '%"homeTeam"%' and q.at > now() - interval '3 hours'
    order by q.at desc limit 1)
  insert into public.vb_games (game_key, league, season, game_date, home, away, home_sets, away_sets, updated_at)
  select (e->'season'->>'value') || '-' || (e->>'match') || '-' || (e->>'number') || '-' || (e->>'gender'),
    case when e->>'gender' = 'MALE' then 'VLEAGUE_M' else 'VLEAGUE_W' end,
    public.season_of((e->>'gameDate')::date), (e->>'gameDate')::date, e->'homeTeam'->>'name', e->'awayTeam'->>'name',
    (e->'homeTeam'->>'score')::int, (e->'awayTeam'->>'score')::int, now()
  from ok, jsonb_array_elements(case when jsonb_typeof(ok.j->'payload') = 'array' then ok.j->'payload' else '[]'::jsonb end) e
  where (e->'homeTeam'->>'score') ~ '^\d+$' and (e->'awayTeam'->>'score') ~ '^\d+$'
    and greatest((e->'homeTeam'->>'score')::int, (e->'awayTeam'->>'score')::int) = 3
  on conflict (game_key) do update set home_sets = excluded.home_sets, away_sets = excluded.away_sets, game_date = excluded.game_date, updated_at = now();
  get diagnostics n = row_count;
  return n;
end $$;
select cron.schedule('vb-games-request-am', '21 19 * * *', 'select public.vb_games_request()');
select cron.schedule('vb-games-parse-am', '31 19 * * *', 'select public.vb_games_parse()');
select cron.schedule('vb-games-request-pm', '21 7 * * *', 'select public.vb_games_request()');
select cron.schedule('vb-games-parse-pm', '31 7 * * *', 'select public.vb_games_parse()');
-- 배구 가중치 뜻이 바뀜: wScore = 팀 세트 득실 비중, wOv = 오버롤 비중 (예전 wScore = 시장 비중 0.7)
-- update public.model_params set value = jsonb_set(...'{"wScore":0.5,"wOv":0.5}'...) where key = 'sim';  — 2026-11-21 적용함

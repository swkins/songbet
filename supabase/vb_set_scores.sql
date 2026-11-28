-- 배구 세트별 점수 → 총득점 오버/언더 자동 판정 (2026-11-28 사용자 요청)
-- 출처: KOVO 홈페이지가 쓰는 user-api.kovo.co.kr/stat/game-schedule?gcode=001&seasonCode=<시즌>&leagueCode=201&gender=1|2
--   = 그 시즌 정규리그 끝난 경기 전부, 세트마다 점수(hs1point~hs5point · as1point~as5point), 세트 스코어(hspoint·aspoint). 남 1 · 여 2.
-- game_id = 일정(game_schedules) 경기 id와 같은 꼴 'kovo-<시즌>-<리그>-<경기 번호>-MALE|FEMALE' (update-schedule kovo()).
-- pg_net은 응답이 나중에 와서 두 단계: 요청 → 5분 뒤 저장. 14~01시 KST 매시 (경기 끝나고 1시간 안에 들어옴).
-- 지우는 SQL은 넣지 않는다.

create table if not exists public.vb_set_scores (
  game_id text primary key, league text not null, game_date date, home text, away text,
  home_sets int, away_sets int, home_pts int, away_pts int, sets jsonb, updated_at timestamptz default now());
alter table public.vb_set_scores enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'vb_set_scores' and policyname = 'anon_read_vb_set_scores') then
    create policy anon_read_vb_set_scores on public.vb_set_scores for select using (true);
  end if;
end $$;
create table if not exists public.vb_set_req (req_id bigint primary key, gender text, at timestamptz default now());

create or replace function public.vb_set_request() returns void
language plpgsql security definer set search_path = public, net as $$
declare y int := extract(year from (now() at time zone 'Asia/Seoul'))::int - case when extract(month from (now() at time zone 'Asia/Seoul')) >= 8 then 0 else 1 end;
  g text;
begin
  foreach g in array array['1', '2'] loop
    insert into public.vb_set_req (req_id, gender)
    select net.http_get('https://user-api.kovo.co.kr/stat/game-schedule?gcode=001&seasonCode=' || lpad((y - 2003)::text, 3, '0') || '&leagueCode=201&gender=' || g,
      headers := '{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124","Accept":"application/json","Accept-Language":"ko"}'::jsonb), g
    on conflict do nothing;
  end loop;
end $$;

create or replace function public.vb_set_parse() returns int
language plpgsql security definer set search_path = public, net as $$
declare n int;
begin
  with ok as (
    select distinct on (q.gender) r.content::jsonb j from public.vb_set_req q join net._http_response r on r.id = q.req_id
    where r.status_code = 200 and left(ltrim(r.content), 1) = '{' and r.content like '%"hs1point"%' and q.at > now() - interval '3 hours'
    order by q.gender, q.at desc),
  e as (
    select x from ok, jsonb_array_elements(coalesce(ok.j->'payload'->'content', '[]'::jsonb)) x
    where (x->>'hspoint') ~ '^\d+$' and (x->>'aspoint') ~ '^\d+$' and greatest((x->>'hspoint')::int, (x->>'aspoint')::int) = 3)
  insert into public.vb_set_scores (game_id, league, game_date, home, away, home_sets, away_sets, home_pts, away_pts, sets, updated_at)
  select 'kovo-' || (x->>'seasonCode') || '-' || (x->>'leagueCode') || '-' || (x->>'gnum') || '-' || case when x->>'gender' = '1' then 'MALE' else 'FEMALE' end,
    case when x->>'gender' = '1' then 'V리그 남자' else 'V리그 여자' end, (x->>'gdate')::date, x->>'hsname', x->>'asname',
    (x->>'hspoint')::int, (x->>'aspoint')::int,
    (select sum(coalesce((x->>('hs' || i || 'point'))::int, 0)) from generate_series(1, 5) i),
    (select sum(coalesce((x->>('as' || i || 'point'))::int, 0)) from generate_series(1, 5) i),
    (select jsonb_agg(jsonb_build_array((x->>('hs' || i || 'point'))::int, (x->>('as' || i || 'point'))::int) order by i)
       from generate_series(1, 5) i where coalesce((x->>('hs' || i || 'point'))::int, 0) + coalesce((x->>('as' || i || 'point'))::int, 0) > 0),
    now()
  from e
  on conflict (game_id) do update set home_sets = excluded.home_sets, away_sets = excluded.away_sets, home_pts = excluded.home_pts, away_pts = excluded.away_pts,
    sets = excluded.sets, game_date = excluded.game_date, updated_at = now()
  where (vb_set_scores.home_pts, vb_set_scores.away_pts, vb_set_scores.home_sets, vb_set_scores.away_sets) is distinct from (excluded.home_pts, excluded.away_pts, excluded.home_sets, excluded.away_sets);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.vb_set_request() from public, anon, authenticated;
revoke all on function public.vb_set_parse() from public, anon, authenticated;

-- UTC 5~16시 = 14~01시 KST
select cron.schedule('vb-set-request', '3 5-16 * * *', 'select public.vb_set_request()');
select cron.schedule('vb-set-parse', '8 5-16 * * *', 'select public.vb_set_parse()');

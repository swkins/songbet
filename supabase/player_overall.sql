-- 선수 오버롤·출전 확률 (분석 탭 오른쪽 칸 '선수 오버롤') — Supabase에 적용하는 SQL.
-- 지우기 명령은 넣지 않는다 (Supabase 연결이 확인을 묻는데 앱에 안 떠서 시간 초과). 오래된 행 정리는 함수 collect-injuries가 한다.

-- ① 지난 시즌 선수 시즌 평균 (체급용, 한 번 받아 둠) + Claude가 조사한 새 선수 체급(manual_base, 0~100)
create table if not exists public.player_base (
  league text not null, season text not null, player_id text not null, player_name text not null, team text,
  gp int, min numeric, gmsc numeric, pts numeric, reb numeric, ast numeric,
  manual_base int, note text, source text, updated_at timestamptz not null default now(),
  primary key (league, season, player_id)
);

-- ② 출전 확률 (Claude 예약 작업이 뉴스·ESPN 명단을 읽고 최종 판단) — 경기 날짜 지나면 collect-injuries가 정리
create table if not exists public.player_status (
  league text not null, game_date date not null, team text not null, player_name text not null,
  player_id text, play_prob int, status text, confirmed boolean, reason text,
  source_title text, source_url text, checked_at timestamptz not null default now(),
  primary key (league, game_date, team, player_name)
);

-- ③ NBA ESPN 부상자 명단 (매번 통째로 바꿈, 누적 안 함)
create table if not exists public.nba_injuries (
  player_id text primary key, player_name text, team text, status text, short_comment text, long_comment text,
  return_date text, reported_at timestamptz, fetched_at timestamptz not null default now()
);

-- ④ Claude 뉴스 확인 실행 기록 (업데이트 현황용)
create table if not exists public.news_check_log (
  id bigserial primary key, ran_at timestamptz not null default now(), task text not null, games int, players int, note text
);

alter table public.kovo_player_snapshots add column if not exists team_name text;

alter table public.player_base enable row level security;
alter table public.player_status enable row level security;
alter table public.nba_injuries enable row level security;
alter table public.news_check_log enable row level security;
do $$ begin
  create policy anon_read_player_base on public.player_base for select using (true);
  create policy anon_read_player_status on public.player_status for select using (true);
  create policy anon_read_nba_injuries on public.nba_injuries for select using (true);
  create policy anon_read_news_check_log on public.news_check_log for select using (true);
exception when duplicate_object then null; end $$;

-- 기여도 (농구 = 게임스코어 간이형, 배구 = 득점 + 세트·디그·리시브 가중)
create or replace function public.vb_value(e jsonb) returns numeric language sql immutable as $$
  select coalesce((e->>'attackSuccess')::numeric, 0) + coalesce((e->>'blockSuccess')::numeric, 0) + coalesce((e->>'serveSuccess')::numeric, 0)
       + 0.15 * coalesce((e->>'setSuccess')::numeric, 0) + 0.3 * coalesce((e->>'digSuccess')::numeric, 0) + 0.3 * coalesce((e->>'receiveSuccess')::numeric, 0)
       - 0.5 * coalesce((e->>'serveError')::numeric, 0) - 0.5 * coalesce((e->>'attackError')::numeric, 0)
$$;
create or replace function public.season_of(d date) returns text language sql immutable as $$
  select case when extract(month from d) >= 8 then extract(year from d)::int else extract(year from d)::int - 1 end
         || '-' || lpad(((case when extract(month from d) >= 8 then extract(year from d)::int else extract(year from d)::int - 1 end + 1) % 100)::text, 2, '0')
$$;

create or replace view public.v_player_games with (security_invoker = on) as
select league, season, game_id, game_date, team, player_id, player_name, minutes, starter,
  case when league like 'VLEAGUE%' then public.vb_value(extra)
       else coalesce(pts,0) + 0.4*coalesce(fgm,0) - 0.7*coalesce(fga,0) - 0.4*(coalesce(fta,0)-coalesce(ftm,0))
          + 0.5*coalesce(reb,0) + 0.7*coalesce(ast,0) + coalesce(stl,0) + 0.7*coalesce(blk,0) - coalesce(tov,0) end as gmsc
from public.player_game_stats;

-- 선수 시즌 평균: 농구 = 경기 기록, 배구 = KOVO 시즌 누적 최신 스냅샷
create or replace view public.v_player_season with (security_invoker = on) as
select league, season, player_id,
  (array_agg(player_name order by game_date desc))[1] as player_name,
  (array_agg(team order by game_date desc))[1] as team,
  count(*)::int as gp, round(avg(minutes), 1) as min, round(avg(gmsc), 2) as gmsc, max(game_date) as last_date
from public.v_player_games where league not like 'VLEAGUE%'
group by league, season, player_id
union all
select case when gender = 'MALE' then 'VLEAGUE_M' else 'VLEAGUE_W' end, public.season_of(snapshot_date), player_code, player_name,
  team_name, game_count, null, round(public.vb_value(stats) / nullif(game_count, 0), 2), snapshot_date
from (select distinct on (player_code) * from public.kovo_player_snapshots order by player_code, snapshot_date desc) k;

-- 최근폼: 이번 시즌 최근 5경기 (최근일수록 크게 5·4·3·2·1)
create or replace view public.v_player_recent with (security_invoker = on) as
select league, player_id, count(*)::int as n, round(sum(gmsc * (6 - rn)) / sum(6 - rn), 2) as gmsc5,
  round(avg(minutes), 1) as min5
from (select g.*, row_number() over (partition by league, player_id order by game_date desc) rn
      from public.v_player_games g where season = public.season_of((now() at time zone 'Asia/Seoul')::date)) x
where rn <= 5 group by league, player_id;

-- 배구 체급 = 포지션별 여러 능력의 균형 (2026-11-25 사용자 요청 — 하나만 잘하는 게 아니라 이것저것 고르고 범실 적어야 체급이 높다)
-- 예전: 득점 + 0.15 세트 + 0.3 디그 + 0.3 리시브 − 0.5 범실 (경기당 양) → 공격수·많이 뛴 선수 위주.
-- 지금: 같은 리그·시즌·포지션 선수들 안에서 능력마다 z점수(±3까지)를 내고 평균 — 범실(세트당)은 낮을수록 좋게, 다른 능력과 같은 무게.
--   OP: 공격성공률·세트당 득점·서브·블로킹·범실 / OH: + 리시브 효율·디그 / MB: 공격성공률·블로킹·득점·서브·범실
--   S: 세트(토스)·디그·서브·블로킹·범실 / L: 디그·리시브 효율·범실
-- 근거 (scripts/vleague_tier_backtest.py, KOVO 선수 시즌 기록 2021-22~2025-26, 지난 시즌 체급 → 다음 시즌 경기, 1,008경기 시즌 하나씩 빼고):
--   (KOVO 선수 기록에 섞인 감독·코치 — 기록 전부 0 — 를 뺀 뒤) 팀 전력만 LL 예전 0.6713 → 균형(범실 0.5배) 0.6628, 팀 레이팅과 합치면 0.6356 → 0.6344.
--   약점 감점(평균 아래 능력 추가 감점)은 0.5배 0.6654·1배 0.6659로 나빠짐, 범실 1배 0.6642·2배 0.6730·빼기 0.6638.
-- v_player_season의 배구 gmsc = 이 균형 점수(z 평균). 화면은 리그 안 백분위로 100점 (농구와 같은 눈금).
-- 지난 시즌(2025-26) 체급은 player_base에 같은 점수로 넣었다 (KOVO 선수 시즌 기록, scripts/vleague_base_insert.py) — 이번 시즌 경기가 적을 때 섞인다.

create or replace function public.vb_rates(s jsonb) returns jsonb language sql immutable as $$
  with v as (select nullif((s->>'setCount')::numeric, 0) as sets,
                    coalesce((s->>'attackSuccess')::numeric,0) as atks, coalesce((s->>'blockSuccess')::numeric,0) as blks, coalesce((s->>'serveSuccess')::numeric,0) as srvs,
                    coalesce((s->>'setSuccess')::numeric,0) as sts, coalesce((s->>'digSuccess')::numeric,0) as digs,
                    coalesce((s->>'attackError')::numeric,0) + coalesce((s->>'serveError')::numeric,0) + coalesce((s->>'blockError')::numeric,0) + coalesce((s->>'setError')::numeric,0) as errs,
                    coalesce((s->>'attackSuccessPercent')::numeric,0) as atk, coalesce((s->>'receiveSuccessPercent')::numeric,0) as rcv)
  select case when sets is null then null else jsonb_build_object('sets', sets, 'pts', (atks+blks+srvs)/sets, 'atk', atk, 'blk', blks/sets, 'srv', srvs/sets,
    'st', sts/sets, 'rcv', rcv, 'dig', digs/sets, 'err', errs/sets) end from v
$$;

create or replace view public.v_vb_tier with (security_invoker = on) as
with k as (
  select distinct on (player_code, public.vb_season(snapshot_date)) snapshot_date, gender, player_code, player_name, team_name, game_count, stats,
    public.vb_season(snapshot_date) as season, case when gender = 'MALE' then 'VLEAGUE_M' else 'VLEAGUE_W' end as lg
  from public.kovo_player_snapshots order by player_code, public.vb_season(snapshot_date), snapshot_date desc
), tg as (
  select league, season, team, count(*) n from (select league, season, home as team from public.vb_games union all select league, season, away from public.vb_games) g group by 1, 2, 3
), r as (
  select k.*, coalesce(p.position, 'OH') as pos, public.vb_rates(k.stats) as m
  from k left join tg on tg.league = k.lg and tg.season = k.season and tg.team = k.team_name
  left join public.kovo_players p on p.player_code = k.player_code
  where (tg.n is null or k.game_count <= tg.n + 1) and public.vb_rates(k.stats) is not null
    -- 감독·코치(기록 전부 0)는 뺀다
    and coalesce((k.stats->>'attackTry')::numeric,0) + coalesce((k.stats->>'serveTry')::numeric,0) + coalesce((k.stats->>'digTry')::numeric,0)
      + coalesce((k.stats->>'receiveTry')::numeric,0) + coalesce((k.stats->>'setTry')::numeric,0) + coalesce((k.stats->>'blockTry')::numeric,0) > 0
), x as (
  select r.*, (m->>'sets')::numeric as sets, sk.key, sk.dir, (m->>sk.key)::numeric as val
  from r cross join lateral (select * from (values
      ('OP','atk',1),('OP','pts',1),('OP','srv',1),('OP','blk',1),('OP','err',-1),
      ('OH','atk',1),('OH','pts',1),('OH','srv',1),('OH','blk',1),('OH','rcv',1),('OH','dig',1),('OH','err',-1),
      ('MB','atk',1),('MB','blk',1),('MB','pts',1),('MB','srv',1),('MB','err',-1),
      ('S','st',1),('S','dig',1),('S','srv',1),('S','blk',1),('S','err',-1),
      ('L','dig',1),('L','rcv',1),('L','err',-1)) t(pos, key, dir) where t.pos = (case when r.pos in ('OP','OH','MB','S','L') then r.pos else 'OH' end)) sk
), z as (
  -- 평균·표준편차는 같은 리그·시즌·포지션에서 8세트 이상 뛴 선수로
  select x.*, avg(val) filter (where sets >= 8) over w as mu, stddev_pop(val) filter (where sets >= 8) over w as sd
  from x window w as (partition by lg, season, pos, key)
)
select lg as league, season, player_code as player_id, player_name, team_name as team, game_count as gp, snapshot_date as last_date, pos,
  -- 뛴 세트가 적으면 포지션 평균(0) 쪽으로: × 세트 / (세트 + 30) (백테스트와 같은 값)
  -- 범실은 0.5배 무게 (코치 뺀 재검증: 범실 빼기 0.6638 · 0.5배 0.6628 · 1배 0.6642 · 2배 0.6730 — 주포일수록 범실이 늘어서 세게 깎으면 틀린다)
  round(sum(coalesce(greatest(-3, least(3, dir * (val - mu) / nullif(sd, 0))), 0) * case when key = 'err' then 0.5 else 1 end)
        / sum(case when key = 'err' then 0.5 else 1 end) * max(sets) / (max(sets) + 30), 3) as tier
from z group by lg, season, player_code, player_name, team_name, game_count, snapshot_date, pos;

create or replace view public.v_player_season with (security_invoker = on) as
select league, season, player_id,
  (array_agg(player_name order by game_date desc))[1] as player_name,
  (array_agg(team order by game_date desc))[1] as team,
  count(*)::int as gp, round(avg(minutes), 1) as min, round(avg(gmsc), 2) as gmsc, max(game_date) as last_date
from public.v_player_games where league not like 'VLEAGUE%'
group by league, season, player_id
union all
select league, season, player_id, player_name, team, gp, null::numeric, round(coalesce(tier, 0), 2), last_date
from public.v_vb_tier;

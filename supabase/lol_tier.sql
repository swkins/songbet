-- LoL 선수 체급 v2 (사용자 요청 — 팀이 이기는 것보다 그 라인에서 강한가 · 서폿은 서폿 역할 · 정글은 무엇이 중요한지 확인해서)
-- 1) 시즌·리그별 합성 점수 v_lol_season_comp
--    지표마다 같은 시즌·리그·포지션 주전급(리그 최다 경기 25%↑, 국제전은 4세트↑)의 평균·표준편차로 표준점수(z, ±3에서 자름)
--    → 포지션별 가중 평균. 그 리그에 없는 지표(LPL은 CSD·XPD@15·솔로킬 없음)는 빼고 나머지로 다시 나눈다.
--    가중치는 2026 7개 리그 주전의 '지표 ↔ 승률' 상관으로 확인 (킬관여·퍼블관여·피해%·골드%는 상관 ≈0 → 뺌):
--      탑   GD@15 .22 · XPD@15 .16 · CSD@15 .12 · 솔로킬 .12 · DPM .12 · 데스(−) .10 · KDA .10 · 승률 .06
--      정글 GD@15 .18 · XPD@15 .16 · CSD@15 .12 · CSM .08 · 데스(−) .12 · DPM .10 · KDA .10 · 솔로킬 .04 · 시야 .04 · 승률 .06
--           (정글은 15분 골드·경험치·CS 차 상관이 .61~.68로 모든 포지션 중 최고 — 초반 성장·동선 이득이 핵심)
--      미드 GD@15 .20 · DPM .16 · CSD@15 .12 · XPD@15 .12 · KDA .12 · 솔로킬 .10 · 데스(−) .10 · 와드제거 .02 · 승률 .06
--      원딜 GD@15 .18 · DPM .18 · CSD@15 .14 · 데스(−) .12 · KDA .12 · XPD@15 .08 · CSM .08 · 와드제거 .04 · 승률 .06
--      서폿 GD@15 .18 · 데스(−) .16 · XPD@15 .14 · 어시 .12 · KDA .10 · 시야/분 .10 · DPM .08 · 와드제거 .06 · 승률 .06
--      (서폿 = 바텀 라인전 우위 + 죽지 않고 판을 여는 것 + 시야 장악. 킬관여·시야 비중은 상관 없음)
-- 2) 리그 보정: 합성 점수 단위 기울기 Kz(리그 안 팀 평균 합성 ~ 팀 승률 logit) × Riot GPR 리그 보정(logit). GPR 없는 LCK CL은 추정(lol_league_strength source '추정').
--    국제전(INTL) 점수는 그 대회 참가 선수들의 같은 해 리그 보정 점수 평균에 맞춘다.
-- 3) 체급 v_lol_player_tier: 시즌 가중 2026 1 · 2025 0.6 · 2024 0.35, 국제전 세트는 ×1.5, 세트 수 가중 평균
--    → 세트가 적으면 그 선수 리그 평균 쪽으로 (n/(n+20)) → 100점 = 60 + 13 × 점수.
create or replace view public.v_lol_season_comp as
with base as (
  select s.*, coalesce(s.lp_link, s.player) as pkey, max(games) over (partition by season, league) as lg_max
  from public.lol_player_stats s where s.role is not null
), q as (
  select b.*, case when league = 'INTL' then games >= 4 else games >= greatest(5, lg_max * 0.25) end as regular from base b
), m as (
  select q.season, q.league, q.pkey, q.role, q.regular, t.k, t.v, t.w
  from q cross join lateral (values
    -- 탑·미드·원딜은 15분 골드·경험치 차 비중을 올림 (사용자 요청 2026-11-20 — 매일 지는 픽만 하진 않으니 라인전 우위가 실력), 정글·서폿은 로밍 손해가 있어 그대로
    ('gd15',   q.gd15,   case q.role when 'Top' then .28 when 'Jungle' then .18 when 'Mid' then .26 when 'Bot' then .26 else .18 end),
    ('xpd15',  q.xpd15,  case q.role when 'Top' then .20 when 'Jungle' then .16 when 'Mid' then .18 when 'Bot' then .16 else .14 end),
    ('csd15',  q.csd15,  case q.role when 'Top' then .10 when 'Jungle' then .12 when 'Mid' then .10 when 'Bot' then .12 else 0 end),
    ('csm',    q.csm,    case q.role when 'Jungle' then .08 when 'Bot' then .04 else 0 end),
    ('dpm',    q.dpm,    case q.role when 'Top' then .10 when 'Jungle' then .10 when 'Mid' then .14 when 'Bot' then .14 else .08 end),
    ('solo',   q.solo_kills::numeric / nullif(q.games, 0), case q.role when 'Top' then .10 when 'Jungle' then .04 when 'Mid' then .08 else 0 end),
    ('deaths', -q.deaths, case q.role when 'Top' then .08 when 'Jungle' then .12 when 'Mid' then .08 when 'Bot' then .10 else .16 end),
    ('kda',    q.kda,    case q.role when 'Top' then .08 when 'Mid' then .10 when 'Bot' then .10 else .10 end),
    ('assists', q.assists, case q.role when 'Support' then .12 else 0 end),
    ('vspm',   q.vspm,   case q.role when 'Jungle' then .04 when 'Support' then .10 else 0 end),
    ('wcpm',   q.wcpm,   case q.role when 'Bot' then .02 when 'Support' then .06 else 0 end),
    ('winrate', q.winrate, .06)
  ) t(k, v, w) where t.w > 0 and t.v is not null
), st as (
  select season, league, role, k, avg(v) mu, stddev_samp(v) sd from m where regular group by 1, 2, 3, 4
), z as (
  select m.*, greatest(-3, least(3, (m.v - st.mu) / nullif(st.sd, 0))) zv from m join st using (season, league, role, k)
), comp0 as (
  select season, league, pkey, role, bool_or(regular) regular, sum(w * zv) / nullif(sum(w), 0) c0, jsonb_object_agg(k, round(zv::numeric, 2)) zs from z where zv is not null group by 1, 2, 3, 4
), comp as (
  -- 합성 점수를 리그·포지션 주전급 안에서 한 번 더 표준화 (지표 수가 적은 리그(LPL)는 폭이 넓게 나와서 맞춘다)
  select c.season, c.league, c.pkey, (c.c0 - s2.mu) / nullif(s2.sd, 0) comp, c.zs
  from comp0 c join (select season, league, role, avg(c0) mu, stddev_samp(c0) sd from comp0 where regular group by 1, 2, 3) s2 using (season, league, role)
), team as (
  select q.season, q.league, q.team, sum(q.games) g, sum(q.winrate * q.games) / sum(q.games) / 100 wr, sum(c.comp * q.games) / sum(q.games) tc
  from q join comp c using (season, league, pkey) where q.regular and q.league <> 'INTL' and q.team is not null
  group by 1, 2, 3 having sum(q.games) >= 40
), kz as (
  select season, sum(dx * dy) / nullif(sum(dx * dx), 0) kz from (
    select season, lx - avg(lx) over (partition by season, league) dx, tc - avg(tc) over (partition by season, league) dy
    from (select *, ln(least(.85, greatest(.15, wr)) / (1 - least(.85, greatest(.15, wr)))) lx from team) t) d group by season
), dom as (
  select q.season, q.league, q.pkey, q.player, q.team, q.role, q.games, q.regular, c.comp, c.zs,
         case when q.league = 'INTL' then null else c.comp + coalesce(k.kz, .3) * s.offset_logit end as gcomp
  from q join comp c using (season, league, pkey)
  left join kz k using (season)
  left join public.lol_league_strength s on s.season = q.season and s.league = q.league
), gpr as (
  -- 팀 전력 (사용자 요청 — 하위 팀끼리만 싸운 선수가 높게 나오는 문제): Riot GPR 팀 점수, 시즌 마지막 기록
  select distinct on (season, public.lol_team_key(team)) season, public.lol_team_key(team) k, points from public.lol_team_gpr order by season, public.lol_team_key(team), snapshot desc
), tg as (
  select dt.season, dt.league, dt.team,
         (select g.points from gpr g where g.season = dt.season and public.lol_team_match(g.k, public.lol_team_key(dt.team)) order by length(g.k) desc limit 1) pts
  from (select distinct season, league, team from q where league <> 'INTL' and team is not null) dt
), tgl as (
  select season, league, avg(pts) avgpts from tg where pts is not null group by 1, 2
), dom2 as (
  -- 리그 안 팀 전력 차(GPR 점수 − 리그 팀 평균, Elo → logit) × Kz × 0.8 을 더한다 — 강팀 상대로 낸 기록일수록 높게
  select d.*, coalesce(0.8 * coalesce(k.kz, .3) * (t.pts - l.avgpts) * ln(10) / 400, 0) as tadj
  from dom d left join kz k using (season)
  left join tg t on t.season = d.season and t.league = d.league and t.team = d.team
  left join tgl l on l.season = d.season and l.league = d.league
), intl_anchor as (
  -- 국제전 참가 선수들의 같은 해 리그 보정 점수(경기 가중) 평균 − 국제전 합성 평균
  select i.season, sum((d.gcomp + d.tadj) * i.games) / sum(i.games) - sum(i.comp * i.games) / sum(i.games) a
  from dom i join dom2 d on d.season = i.season and d.pkey = i.pkey and d.league <> 'INTL' and d.gcomp is not null
  where i.league = 'INTL' group by i.season
)
select d.season, d.league, d.pkey, d.player, d.team, d.role, d.games, d.regular, round(d.comp::numeric, 3) comp, d.zs,
       round((case when d.league = 'INTL' then d.comp + a.a else d.gcomp + d.tadj end)::numeric, 3) gcomp,
       round(d.tadj::numeric, 3) tadj
from dom2 d left join intl_anchor a on a.season = d.season and d.league = 'INTL';
grant select on public.v_lol_season_comp to anon, authenticated;

create or replace view public.v_lol_player_tier as
with e as (
  select c.*, case season when '2026' then 1.0 when '2025' then 0.6 when '2024' then 0.35 else 0.2 end
                * case when league = 'INTL' then 1.5 else 1 end * games as w
  from public.v_lol_season_comp c where gcomp is not null
), latest as (
  -- 지금 소속 = 가장 최근 시즌 리그 경기 기록 (국제전 제외)
  select distinct on (pkey) pkey, season as last_season, league, team, role, player
  from public.v_lol_season_comp where league <> 'INTL' order by pkey, season desc, games desc
), agg as (
  select pkey, sum(w * gcomp) / sum(w) raw, sum(w) n,
         jsonb_agg(jsonb_build_object('season', season, 'league', league, 'games', games, 'g', gcomp, 'team', team) order by season desc, league) seasons
  from e group by pkey
), prior as (
  -- 세트가 적은 선수는 그 리그(가장 최근 시즌) 주전 평균 쪽으로
  select season, league, avg(gcomp) p from public.v_lol_season_comp where regular and league <> 'INTL' group by 1, 2
)
select l.pkey, l.player, l.team, l.league, l.role, l.last_season, round(a.n::numeric, 1) as weight_games, a.seasons,
       round(((a.raw * a.n + coalesce(p.p, 0) * 20) / (a.n + 20))::numeric, 3) as tier_z,
       round((60 + 13 * (a.raw * a.n + coalesce(p.p, 0) * 20) / (a.n + 20))::numeric) as tier,
       cur.comp as comp_now, cur.gcomp as gcomp_now, cur.games as games_now, cur.regular as regular_now, cur.zs as zs_now,
       round((60 + 13 * cur.gcomp)::numeric) as tier_now
from latest l join agg a using (pkey)
left join prior p on p.season = l.last_season and p.league = l.league
left join public.v_lol_season_comp cur on cur.pkey = l.pkey and cur.season = l.last_season and cur.league = l.league;
grant select on public.v_lol_player_tier to anon, authenticated;

-- ── 속도: 시즌별 점수는 5초 걸려서 미리 계산해 둔다 (mv_lol_season_comp), v_lol_player_tier는 그걸 읽는다 ──
-- 기록을 새로 받거나 공식을 바꾸면 select public.refresh_lol_tier(); (pg_cron 'lol-tier-refresh' 매일 05:17 KST)
create materialized view if not exists public.mv_lol_season_comp as select * from public.v_lol_season_comp;
create index if not exists mv_lol_season_comp_pkey on public.mv_lol_season_comp (pkey, season, league);
create or replace function public.refresh_lol_tier() returns void language sql security definer set search_path = public as $$
  refresh materialized view public.mv_lol_season_comp
$$;
-- (v_lol_player_tier는 위 정의에서 v_lol_season_comp 대신 mv_lol_season_comp를 읽도록 바꿔 적용함)
-- 리그 보정 추정 (GPR 없음): LCK CL 2024·2025·2026 = LCK − 2.0 logit, 2025 LCS(LTA 북부) −2.7 · CBLOL(LTA 남부) −3.8 (2025 GPR에 LTA 지역 점수 없음)

-- ── v3 (사용자 요청 2026-11-20): 팀 전력 · 최근 가중 · 적은 표본 · 눈금 ──
-- v_lol_season_comp: dom2에서 팀 전력 tadj = 0.8 × Kz × (GPR 팀 점수 − 리그 팀 평균) × ln10/400 를 gcomp에 더함 (lol_team_gpr 시즌 마지막 기록,
--   팀 이름은 public.lol_team_key(소문자·악센트·esports/gaming/team/kia 등 뗌) + public.lol_team_match(같음·앞·뒤 일치, 스폰서 이름 대비)). 결과 칸 tadj 추가.
-- v_lol_player_tier: 2026 ×1 · 2025 ×0.4 · 2024 ×0.15 (국제전 ×1.5), prior = 리그 주전 평균 − 0.3σ, 40세트만큼 당김, low_sample = 유효 세트 < 60,
--   tier = 62 + 14σ (1~99), tier_now = 2026 리그 기록만 같은 보정. (실제 적용 SQL은 마이그레이션 lol_season_comp_team_adj · lol_player_tier_v3b)

-- ── v4 (사용자 요청 2026-11-20 — 위아래 차이가 너무 크고 LCK 하위 vs 다른 리그 상위가 이상함 → 리그 점수 + 팀 파워랭킹으로 전체 재조정) ──
-- v_lol_team_power: 시즌별 팀 GPR(없으면 리그 평균 + 100×logit(팀 승률), LCK CL = LCK 평균 − 300, 아카데미는 GPR 매칭 안 함) → 주요 6개 리그 팀 평균·표준편차로 team_z
-- v_lol_player_tier: 시즌 점수 g = team_z + 0.55 × comp(리그·포지션 안 개인 z, 국제전은 국제전 안 z) → 가중 평균(2026 1 · 2025 0.4 · 2024 0.15, 국제전 ×1.5)
--   → (raw·n + (지금 team_z − 0.165)·40)/(n+40) → tier = 62 + 9.5σ (1~99). gcomp_now = 2026 g, team_z_now 칸 추가.
-- (실제 적용 SQL은 마이그레이션 lol_team_power_and_tier_v4)

-- ── v5 (사용자 요청 2026-11-20 — 같은 리그 안에서는 팀 점수 빼고 오로지 실력) ──
-- v_lol_player_tier: 시즌 점수 g = 리그 수준(lg_z = 그 시즌 그 리그 v_lol_team_power.team_z 평균) + comp(개인 z)
--   국제전 행의 리그 수준 = 그 해 그 선수 소속 리그, prior = 리그 수준 − 0.3 (40세트), tier = 62 + 13σ. 칸 이름 team_z_now = 지금 리그 수준.
-- (실제 적용 SQL은 마이그레이션 lol_player_tier_v5_skill_only)

-- ── v6 (사용자 요청 2026-11-20 — 최근이 가장 중요, 하위 리그 출신 보정) ──
-- 시즌 가중 2026 ×1 · 2025 ×0.35 · 2024 ×0.1, 지금 리그(latest) 세트 합 ≥ 80이면 리그 수준이 0.5σ 이상 낮은 리그 시즌은 ×1/3. (마이그레이션 lol_player_tier_v6_promoted)

-- ── v7 (사용자 요청 2026-11-20 — 상대 강도·적은 세트) ──
-- lol_matchups(season, league, team1, team2, games): Leaguepedia ScoreboardGames 팀 쌍별 세트 수 (public.lol_matchup_step, pg_cron lol-matchups 1분에 하나)
-- v_lol_team_sos: 팀 상대 평균 team_z − (리그 팀 team_z 합 − 자기) / (팀 수 − 1)
-- v_lol_player_tier: ind = (comp + 상대 강도 − 리그 세트 가중 평균) × games/(games+30) (국제전 +15·상대 강도 0), g = 리그 수준 + ind,
--   가중 2026 1 · 2025 0.35 · 2024 0.1 · 국제전 ×1.5 · 하위 리그 ×1/3, prior (리그 수준 − 0.3) × 80세트, low_sample n < 100, tier = 62 + 16σ.
-- (마이그레이션 lol_player_tier_v7_sos_shrink, 뷰 v_lol_team_sos는 execute_sql로 만듦)

-- 속도 (2026-11-20): v_lol_team_power(팀 이름 정규식 매칭)·v_lol_team_sos를 행마다 다시 계산해 19초 → 시간 초과로 체급이 '–'.
-- 구체화 뷰 mv_lol_team_power·mv_lol_team_sos로 두고 v_lol_player_tier가 그걸 읽음 (0.2초).
-- create materialized view if not exists public.mv_lol_team_power as select * from public.v_lol_team_power;
-- create materialized view if not exists public.mv_lol_team_sos as select * from public.v_lol_team_sos;
-- refresh_lol_tier() = mv_lol_season_comp → mv_lol_team_power → mv_lol_team_sos 순서로 새로 고침.

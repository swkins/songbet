-- LoL 선수 체급 (사용자 요청 — 선수마다, 팀은 2026 시즌 기준, 라인별 순위)
-- 자료: lol_player_stats (Supabase 함수 collect-lol — gol.gg 상세 통계 + Leaguepedia 팀·포지션)
-- 체급 = 같은 리그·같은 포지션 주전급(그 리그 최다 경기의 25% 이상 뛴 선수) 안에서 지표별 백분위를 포지션별 가중치로 섞고,
--        그 합성 점수의 순위를 100점으로 (농구와 같은 눈금: 상위 3% 90+, 15% 80+, 40% 70+, 75% 60+),
--        경기 수가 적으면 50점 쪽으로 당긴다 (n/(n+10)). 리그끼리는 비교하지 않는다 (리그 안 순위).
-- 가중치 (합 1): 승률은 팀 성적이 섞이지만 결국 이기는 선수가 체급이 높아서 넣음.
--  탑·미드: GD@15 .12 · CSD@15 .10 · XPD@15 .10 · DPM .12 · 피해 비중 .10 · KDA .14 · 킬 관여 .07 · 솔로킬/경기 .05 · 승률 .20
--  정글:    GD@15 .10 · XPD@15 .10 · 킬 관여 .15 · KDA .15 · 분당 시야 .08 · 퍼블 관여 .07 · 퍼블 당함(낮을수록) .05 · 피해 비중 .05 · 승률 .25
--  원딜:    GD@15 .12 · CSD@15 .10 · XPD@15 .08 · DPM .14 · 피해 비중 .12 · KDA .14 · 킬 관여 .05 · 승률 .25
--  서폿:    킬 관여 .18 · KDA .15 · 분당 시야 .15 · 시야 비중 .07 · GD@15 .05 · XPD@15 .10 · 퍼블 당함(낮을수록) .05 · 승률 .25
create or replace view public.v_lol_player_rating as
with base as (
  select s.*, max(games) over (partition by season, league) as lg_max,
         case when games > 0 then coalesce(solo_kills, 0)::numeric / games end as solo_pg
  from public.lol_player_stats s where role is not null
), q as (
  select b.*, games >= greatest(5, lg_max * 0.25) as regular from base b
), pct as (
  -- 지표별 백분위: 같은 리그·포지션 주전급 중 나보다 낮은 비율 (0~1)
  select q.*,
    (select avg(case when x.gd15 < q.gd15 then 1 when x.gd15 = q.gd15 then 0.5 else 0 end) from q x where x.season = q.season and x.league = q.league and x.role = q.role and x.regular) p_gd15,
    (select avg(case when x.csd15 < q.csd15 then 1 when x.csd15 = q.csd15 then 0.5 else 0 end) from q x where x.season = q.season and x.league = q.league and x.role = q.role and x.regular) p_csd15,
    (select avg(case when x.xpd15 < q.xpd15 then 1 when x.xpd15 = q.xpd15 then 0.5 else 0 end) from q x where x.season = q.season and x.league = q.league and x.role = q.role and x.regular) p_xpd15,
    (select avg(case when x.dpm < q.dpm then 1 when x.dpm = q.dpm then 0.5 else 0 end) from q x where x.season = q.season and x.league = q.league and x.role = q.role and x.regular) p_dpm,
    (select avg(case when x.dmg_pct < q.dmg_pct then 1 when x.dmg_pct = q.dmg_pct then 0.5 else 0 end) from q x where x.season = q.season and x.league = q.league and x.role = q.role and x.regular) p_dmg,
    (select avg(case when x.kda < q.kda then 1 when x.kda = q.kda then 0.5 else 0 end) from q x where x.season = q.season and x.league = q.league and x.role = q.role and x.regular) p_kda,
    (select avg(case when x.kp < q.kp then 1 when x.kp = q.kp then 0.5 else 0 end) from q x where x.season = q.season and x.league = q.league and x.role = q.role and x.regular) p_kp,
    (select avg(case when x.solo_pg < q.solo_pg then 1 when x.solo_pg = q.solo_pg then 0.5 else 0 end) from q x where x.season = q.season and x.league = q.league and x.role = q.role and x.regular) p_solo,
    (select avg(case when x.vspm < q.vspm then 1 when x.vspm = q.vspm then 0.5 else 0 end) from q x where x.season = q.season and x.league = q.league and x.role = q.role and x.regular) p_vspm,
    (select avg(case when x.vs_pct < q.vs_pct then 1 when x.vs_pct = q.vs_pct then 0.5 else 0 end) from q x where x.season = q.season and x.league = q.league and x.role = q.role and x.regular) p_vs,
    (select avg(case when x.fb < q.fb then 1 when x.fb = q.fb then 0.5 else 0 end) from q x where x.season = q.season and x.league = q.league and x.role = q.role and x.regular) p_fb,
    (select avg(case when x.fb_victim > q.fb_victim then 1 when x.fb_victim = q.fb_victim then 0.5 else 0 end) from q x where x.season = q.season and x.league = q.league and x.role = q.role and x.regular) p_fbv,
    (select avg(case when x.winrate < q.winrate then 1 when x.winrate = q.winrate then 0.5 else 0 end) from q x where x.season = q.season and x.league = q.league and x.role = q.role and x.regular) p_wr
  from q
), comp as (
  select p.*, case role
    when 'Jungle' then .10*coalesce(p_gd15,.5) + .10*coalesce(p_xpd15,.5) + .15*coalesce(p_kp,.5) + .15*coalesce(p_kda,.5) + .08*coalesce(p_vspm,.5) + .07*coalesce(p_fb,.5) + .05*coalesce(p_fbv,.5) + .05*coalesce(p_dmg,.5) + .25*coalesce(p_wr,.5)
    when 'Bot' then .12*coalesce(p_gd15,.5) + .10*coalesce(p_csd15,.5) + .08*coalesce(p_xpd15,.5) + .14*coalesce(p_dpm,.5) + .12*coalesce(p_dmg,.5) + .14*coalesce(p_kda,.5) + .05*coalesce(p_kp,.5) + .25*coalesce(p_wr,.5)
    when 'Support' then .18*coalesce(p_kp,.5) + .15*coalesce(p_kda,.5) + .15*coalesce(p_vspm,.5) + .07*coalesce(p_vs,.5) + .05*coalesce(p_gd15,.5) + .10*coalesce(p_xpd15,.5) + .05*coalesce(p_fbv,.5) + .25*coalesce(p_wr,.5)
    else .12*coalesce(p_gd15,.5) + .10*coalesce(p_csd15,.5) + .10*coalesce(p_xpd15,.5) + .12*coalesce(p_dpm,.5) + .10*coalesce(p_dmg,.5) + .14*coalesce(p_kda,.5) + .07*coalesce(p_kp,.5) + .05*coalesce(p_solo,.5) + .20*coalesce(p_wr,.5)
  end as composite from pct p
), ranked as (
    -- 포지션당 주전이 10명 안팎이라 '나보다 높은 선수 수 / (주전 수 − 1)'로 1등 = 0, 꼴등 = 1 (1등 100 → 경기 수 보정)
  select c.*, (select sum(case when x.composite > c.composite then 1 else 0 end)::numeric / nullif(count(*) - case when c.regular then 1 else 0 end, 0)
               from comp x where x.season = c.season and x.league = c.league and x.role = c.role and x.regular) as top_frac
  from comp c
)
select season, league, player, team, role, country, games, regular, winrate, kda, kills, deaths, assists, csm, gpm, kp, dmg_pct, gold_pct, vs_pct, dpm, vspm,
  wcpm, gd15, csd15, xpd15, fb, fb_victim, solo_kills, pentas, lp_link, golgg_id, tournaments, updated_at,
  round(composite::numeric, 3) as composite,
  round((50 + (case when top_frac <= .03 then 100 - top_frac / .03 * 10 when top_frac <= .15 then 90 - (top_frac - .03) / .12 * 10
         when top_frac <= .40 then 80 - (top_frac - .15) / .25 * 10 when top_frac <= .75 then 70 - (top_frac - .40) / .35 * 10
         else greatest(40, 60 - (top_frac - .75) / .25 * 20) end - 50) * games / (games + 10.0))::numeric) as base,
  rank() over (partition by season, league, role order by composite desc) as role_rank
from ranked;
grant select on public.v_lol_player_rating to anon, authenticated;

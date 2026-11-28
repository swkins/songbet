-- 2026-11-28 사용자 요청: 배당을 더 촘촘하게 — 경기 당일·직전 간격 줄임, 꺼 둔 타이머(active false)는 아무것도 안 함.
-- (축구 run_collect_soccer는 supabase/cron_soccer.sql 맨 아래와 같은 모양에 간격만: 경기 당일 20~40분, 그 외 60~120분, 차단 90~120분)
--  run_collect_odds: NBA 다음 경기 6시간 안 15~30분 · 그 외 30~60분 / KBL·WKBL 경기 당일 20~40분 · 그 외 60~120분 / V리그(BetExplorer 백업) 30~120분 / 차단 90~120분
--  run_collect_365 : 경기 당일 15~30분 · 내일 경기 25~55분 · 없으면 120~200분 / 차단 90~150분 — KBL 추가(collect_365_jobs 'KBL', cron collect-365-kbl)
-- 함수 본문은 DB에 있음 (2026-11-28 세션에서 create or replace). 맨 앞 줄:
--   select * into j from public.odds_jobs where league = p_league;
--   if not coalesce((select active from cron.job where jobname = j.job), false) then return; end if;
-- 다음 경기 시각:
--   select min((x->>'start')::timestamptz) into nxt_game from public.game_schedules s, jsonb_array_elements(s.games) x
--     where s.league = p_league and s.game_date between today and today + 1 and (x->>'start')::timestamptz > now();
insert into collect_365_jobs (league, job) values ('KBL', 'collect-365-kbl') on conflict (league) do nothing;
select cron.schedule('collect-365-kbl', '0 0 * * *', $$select public.run_collect_365('KBL')$$);

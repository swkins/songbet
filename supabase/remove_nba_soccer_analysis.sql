-- NBA·축구 분석 정리 (2026-11-28 사용자 요청 — NBA·축구는 배당 흐름만, 뉴스·예상 스코어·선수 오버롤은 지움)
-- Supabase 대시보드 SQL Editor에서 한 번 실행. 국내 리그(KBL·WKBL·V리그) 데이터는 건드리지 않는다.
-- 수집 타이머는 이미 꺼 둠(active false), 화면 코드도 이 표들을 더 읽지 않는다.

begin;

-- 1) NBA·축구만 쓰던 표 → 통째로
drop table if exists public.nba_epm;               -- NBA EPM 체급
drop table if exists public.nba_injuries;          -- ESPN 부상 명단
drop table if exists public.player_names;          -- NBA 선수 한글 이름 (NBA만 있음)
drop table if exists public.fm_queue;              -- FotMob 수집 대기열
drop table if exists public.fm_state;
drop table if exists public.fm_matches;            -- 축구 결장·예상 선발
drop table if exists public.fm_players;            -- 축구 선수 평점
drop table if exists public.fm_teams;
drop table if exists public.fm_leagues;
drop table if exists public.fm_league_ratings;
drop table if exists public.fm_hist;
drop table if exists public.soccer_player_names;   -- 축구 선수 한글 이름
drop table if exists public.soc_m_pred;            -- 축구 자체 모델 (예상 스코어)
drop table if exists public.soc_m_games;
drop table if exists public.soc_m_team;
drop table if exists public.soc_m_league;
drop table if exists public.soc_m_grid;

-- 2) 국내 리그와 같이 쓰는 표 → NBA 줄만
delete from public.player_game_stats where league = 'NBA';   -- NBA 선수 경기 기록 (오버롤·팀 레이팅용)
delete from public.player_base       where league = 'NBA';   -- NBA 지난 시즌 체급
delete from public.player_ratings    where league = 'NBA';   -- NBA 선수 체급·폼 기록
delete from public.player_status     where league = 'NBA';   -- NBA 출전 확률 판단
delete from public.game_news         where league = 'NBA';   -- NBA 경기 뉴스
delete from public.predictions       where league = 'NBA';   -- NBA 예상 스코어 기록·채점
delete from public.overall_analyses  where league = 'NBA';   -- NBA 오버롤 분석
delete from public.news_check_log    where task = 'NBA';     -- NBA 뉴스 예약 작업 기록

-- 3) 쓰지 않는 DB 함수
drop function if exists public.run_fotmob(jsonb);
drop function if exists public.run_fotmob_step();
drop function if exists public.soc_m_fetch();
drop function if exists public.soc_m_refresh();
drop function if exists public.soc_m_run;
drop function if exists public.soc_m_prob;
drop function if exists public.run_collect_epm();
drop function if exists public.run_collect_injuries();

commit;

-- 4) 꺼 둔 타이머 (실패해도 위는 이미 반영됨 — 없는 이름은 오류가 나니 하나씩)
select cron.unschedule(jobname) from cron.job where jobname in
  ('collect-epm','collect-epm-2','collect-injuries','collect-stats-nba','snapshot-pred-nba',
   'fm-plan-day','fm-plan-dawn','fm-step','fm-ratings','soc-model-fetch','soc-model-fit');

-- 남는 것 (배당 흐름에 씀): odds_lines·odds_snapshots(NBA 기준점·승패 배당), pin_matchups·pin_odds(피나클), mock_bets(NBA 모의베팅 — 모델·휴식 계열 방법은 이제 안 걸림, 라인 이동 계열만)
-- Supabase 함수(Edge Functions) collect-epm·collect-injuries·collect-base·collect-fotmob은 대시보드 Edge Functions 화면에서 지우면 된다 (타이머가 없어 그대로 둬도 안 돈다).

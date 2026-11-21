-- 해외 배구(365Scores) 지우기 — 2026-11-22 사용자 요청. Supabase 대시보드 SQL Editor에서 한 번 실행.
-- 수집은 이미 멈춤(cron active false, collect-365는 V리그만). 아래는 쌓인 데이터·작업·표를 지운다.
-- 남기는 것: V리그 365Scores 배당 수집(collect-365-vm·vw, collect_365_jobs의 V리그 두 줄),
--           리그 관리에 원래 있던 이탈리아 남자·여자·폴란드 여자·체코 남자·벨기에 여자 리그와 원래 등록 팀(2026-11-21 20:00 UTC 전에 만든 것).

begin;

-- 일정·배당·수집 기록
delete from public.game_schedules where sport = 'volleyball'
  and league in ('이탈리아 남자','이탈리아 여자','폴란드 남자','폴란드 여자','터키 남자','터키 여자','브라질 남자','브라질 여자','체코 남자','벨기에 여자');
delete from public.odds_snapshots where source = '365-bet365'
  and league in ('이탈리아 남자','이탈리아 여자','폴란드 남자','폴란드 여자','터키 남자','터키 여자','브라질 남자','브라질 여자','체코 남자','벨기에 여자');
delete from public.odds_fetch_log
  where league in ('이탈리아 남자','이탈리아 여자','폴란드 남자','폴란드 여자','터키 남자','터키 여자','브라질 남자','브라질 여자','체코 남자','벨기에 여자');

-- 리그 관리: 자동으로 추가된 팀(2026-11-21 20:00 UTC 이후)과 새로 만든 리그 5개
delete from public.volleyball_teams where created_at >= '2026-11-21 20:00:00+00'
  and league in ('이탈리아 남자','이탈리아 여자','폴란드 남자','폴란드 여자','터키 남자','터키 여자','브라질 남자','브라질 여자','체코 남자','벨기에 여자');
delete from public.volleyball_leagues where created_at >= '2026-11-21 20:00:00+00'
  and name in ('폴란드 남자','터키 남자','터키 여자','브라질 남자','브라질 여자');

-- 수집 작업 표에서 해외 리그 줄
delete from public.collect_365_jobs where league not in ('V리그 남자','V리그 여자');

-- 꺼 둔 cron 작업 11개
select cron.unschedule(jobname) from cron.job where jobname in
  ('collect-365-itm','collect-365-itw','collect-365-plm','collect-365-plw','collect-365-trm','collect-365-trw',
   'collect-365-brm','collect-365-brw','collect-365-czm','collect-365-bew','collect-365-volley');

-- 해외 배구 팀 이름표 (이 표는 해외 배구에만 썼다 — collect-365는 없어도 동작)
drop table if exists public.sports_team_names;

commit;

-- 업데이트 현황 맨 위 '데이터 출처 · 신뢰도' 그리드 (2026-11-22 사용자 요청)
-- rpc data_sources_health() → 출처마다 한 줄: 종목·데이터·출처·주소·기대 주기(분)·마지막 성공·마지막 시도·최근 24시간 성공/차단/오류/건너뜀·오늘~내일 경기 수·주석.
-- 신뢰도(높음·보통·낮음)는 화면(src/components/UpdateStatus.tsx `reliability`)이 계산: 성공률·최신성·직전 결과.

-- 수집 기록(odds_fetch_log) 요약: leagues 중, mode 'all' | '365'(note.src='365') | 'non365'
create or replace function public.ds_log(p_leagues text[], p_mode text default 'all') returns jsonb
language sql stable security definer set search_path to 'public' as $$
  with l as (
    select status, fetched_at, note from public.odds_fetch_log
    where league = any(p_leagues) and fetched_at > now() - interval '7 days'
      and (p_mode = 'all' or (p_mode = '365' and note->>'src' = '365') or (p_mode = 'non365' and coalesce(note->>'src', '') <> '365'))
  )
  select jsonb_build_object(
    'ok24', count(*) filter (where status = 'ok' and fetched_at > now() - interval '24 hours'),
    'blocked24', count(*) filter (where status = 'blocked' and fetched_at > now() - interval '24 hours'),
    'error24', count(*) filter (where status = 'error' and fetched_at > now() - interval '24 hours'),
    'skipped24', count(*) filter (where status = 'skipped' and fetched_at > now() - interval '24 hours'),
    'last_ok', max(fetched_at) filter (where status = 'ok'),
    'last_at', max(fetched_at),
    'last_status', (select status from l order by fetched_at desc limit 1),
    'unmatched', (select count(*) from l, jsonb_array_elements_text(case when jsonb_typeof(l.note->'unmatched') = 'array' then l.note->'unmatched' else '[]'::jsonb end) u
                  where l.fetched_at > now() - interval '24 hours' and u not ilike '%429%' and u not ilike 'Pinnacle%'))
  from l
$$;

create or replace function public.data_sources_health() returns jsonb
language plpgsql stable security definer set search_path to 'public', 'cron' as $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
  espn_soccer text[] := array(select league from public.odds_jobs where job like 'collect-soccer-%' and league not in ('K리그1', 'K리그2', 'J리그2'));
  rows jsonb := '[]'::jsonb;
  sched_runs jsonb;
begin
  -- 일정 함수(update-schedule) 작업 실행 기록 — 리그별 기록이 없어서 작업 단위로
  select jsonb_build_object('ok24', count(*) filter (where d.status = 'succeeded'), 'error24', count(*) filter (where d.status <> 'succeeded'))
    into sched_runs
    from cron.job_run_details d join cron.job c on c.jobid = d.jobid
   where c.jobname = 'update-schedule-random' and d.start_time > now() - interval '24 hours';

  -- r(종목, 데이터, 출처, 주소, 기대 주기 분, 마지막 성공, 기록 요약, 오늘~내일 경기 수, 주석)
  with sch as (select league, max(fetched_at) f, sum(jsonb_array_length(games)) filter (where game_date between today and today + 1) up from public.game_schedules group by league),
  defs(ord, sport, kind, source, url, every_min, last_ok, logs, upcoming, note) as (values
    -- 일정·결과
    (10, '축구', '일정·결과', 'ESPN', 'site.api.espn.com/…/soccer/{리그}/scoreboard', 120,
       (select max(f) from sch where league = any(espn_soccer)), public.ds_log(espn_soccer), (select sum(up) from sch where league = any(espn_soccer))::int,
       '28개 리그. 연기·중단·취소는 2026-11-22부터 구분(그 전엔 모두 종료로 저장돼 자동 판정 오류가 났었다).'),
    (11, '축구', '일정·결과', 'K리그 공식', 'kleague.com/getScheduleList.do', 120,
       (select max(f) from sch where league in ('K리그1','K리그2')), public.ds_log(array['K리그1','K리그2']), (select sum(up) from sch where league in ('K리그1','K리그2'))::int, null),
    (12, '축구', '일정·결과', 'J리그 데이터 사이트', 'data.j-league.or.jp/SFMS01', 120,
       (select max(f) from sch where league = 'J리그2'), public.ds_log(array['J리그2']), (select sum(up) from sch where league = 'J리그2')::int, 'HTML 표를 읽음 — 사이트 모양이 바뀌면 깨질 수 있다.'),
    (13, '농구', '일정·결과', 'ESPN', 'site.api.espn.com/…/basketball/nba/scoreboard', 90,
       (select max(f) from sch where league = 'NBA'), sched_runs, (select sum(up) from sch where league = 'NBA')::int, null),
    (14, '농구', '일정·결과', 'KBL 공식', 'api.kbl.or.kr', 90,
       (select max(f) from sch where league = 'KBL'), sched_runs, (select sum(up) from sch where league = 'KBL')::int, null),
    (15, '농구', '일정', 'WKBL 홈페이지', 'wkbl.or.kr 일정 HTML', 90,
       (select max(f) from sch where league = 'WKBL'), sched_runs, (select sum(up) from sch where league = 'WKBL')::int,
       '일정에 점수가 없다 — 최종 점수는 다음 날 새벽 선수 기록(v_team_games)에서. 365Scores에도 없어 백업 없음.'),
    (16, '배구', '일정·결과', 'KOVO 공식', 'kovo.co.kr API', 90,
       (select max(f) from sch where league in ('V리그 남자','V리그 여자')), sched_runs, (select sum(up) from sch where league in ('V리그 남자','V리그 여자'))::int, null),
    -- 배당
    (20, '축구', '승무패 배당', 'ESPN · DraftKings', 'ESPN scoreboard 안 odds', 120,
       (select max(fetched_at) from public.odds_snapshots where source = 'espn-draftkings'), public.ds_log(espn_soccer), (select sum(up) from sch where league = any(espn_soccer))::int,
       '미국 북메이커 한 곳(DraftKings) — 마진이 크다. 리그에 따라 배당이 없는 경기도 있다.'),
    (21, '축구', '핸디 배당', 'Action Network', 'api.actionnetwork.com/web/v2/scoreboard/soccer', 120,
       (select max(fetched_at) from public.soccer_lines where source = 'actionnetwork'), null, null,
       '5대 리그·MLS만. 나머지 리그 핸디는 승무패로 계산한 추정값.'),
    (22, '축구', '승무패·핸디 배당', '피나클', 'guest.api.arcadia.pinnacle.com', 120,
       (select max(fetched_at) from public.odds_snapshots where source = 'pinnacle'), public.ds_log(array['K리그1','K리그2','J리그2']), (select sum(up) from sch where league in ('K리그1','K리그2','J리그2'))::int,
       'K리그1·K리그2·J리그2. 사이트 공개 키를 쓴다 — 키가 바뀌면 끊긴다(그때 BetExplorer 백업).'),
    (23, '농구', '승패·기준점·언오버', 'Action Network', 'api.actionnetwork.com/web/v2/scoreboard/nba', 75,
       (select max(fetched_at) from public.odds_lines where league = 'NBA'), public.ds_log(array['NBA']), (select sum(up) from sch where league = 'NBA')::int,
       '북메이커 9곳 평균 + 오픈 + 대중 티켓 %.'),
    (24, '농구', '승패 배당', 'BetExplorer', 'betexplorer.com/basketball/south-korea', 75,
       null, public.ds_log(array['KBL','WKBL']), (select sum(up) from sch where league in ('KBL','WKBL'))::int,
       '서버 IP를 여럿이 같이 써서 429 차단이 잦다(막히면 다른 지역으로 한 번 더). 핸디·언오버 없음.'),
    (25, '배구', 'V리그 승패 배당', '365Scores · Bet365', 'webws.365scores.com (userCountryId=1)', 60,
       (select max(fetched_at) from public.odds_snapshots where source = '365-bet365' and league like 'V리그%'), public.ds_log(array['V리그 남자','V리그 여자'], '365'), (select sum(up) from sch where league in ('V리그 남자','V리그 여자'))::int,
       '메인. Bet365 승패만(세트 핸디·언오버 없음). 경기 당일에야 배당이 붙는 경우가 많다.'),
    (26, '배구', 'V리그 승패 배당 (백업)', 'BetExplorer', 'betexplorer.com/volleyball/south-korea', 75,
       (select max(fetched_at) from public.odds_snapshots where source = 'betexplorer' and league like 'V리그%'), public.ds_log(array['V리그 남자','V리그 여자'], 'non365'), null,
       '365Scores에 배당이 있으면 건너뜀(skipped). 429 차단이 잦다.'),
    -- 선수·부상·뉴스
    (30, '농구', 'NBA 선수 기록', 'ESPN 박스스코어', 'site.api.espn.com/…/summary', 1440,
       (select max(created_at) from public.player_game_stats where league = 'NBA'), null, null, '매일 18~19시(KST) 한 번.'),
    (31, '농구', 'KBL 선수 기록', 'KBL 공식', 'api.kbl.or.kr 박스스코어', 1440,
       (select max(created_at) from public.player_game_stats where league = 'KBL'), null, null, '매일 03~04시(KST) 한 번.'),
    (32, '농구', 'WKBL 선수 기록', 'WKBL 홈페이지', 'wkbl.or.kr 경기 기록 HTML', 1440,
       (select max(created_at) from public.player_game_stats where league = 'WKBL'), null, null, '매일 03~04시(KST) 한 번. 일정 점수도 여기서 채운다.'),
    (33, '배구', 'V리그 선수 누적·경기 결과', 'KOVO 공식', 'kovo.co.kr API', 1440,
       greatest((select max(snapshot_date)::timestamptz from public.kovo_player_snapshots), (select max(updated_at) from public.vb_games)), null, null,
       '선수는 경기별이 아니라 시즌 누적 — 경기별 세트 점수 없음.'),
    (34, '농구', 'NBA 부상 명단', 'ESPN', 'site.api.espn.com/…/injuries', 300,
       (select max(fetched_at) from public.nba_injuries), null, null, '하루 3번(14:33·17:33·20:33).'),
    (35, '공통', '출전 확률 판단', 'Claude 예약 작업 (뉴스 검색)', 'claude.ai 예약 작업', 1440,
       (select max(checked_at) from public.player_status), null, null,
       '예약 작업에 Supabase 연결이 비어 있으면 저장이 안 된다 — claude.ai 예약 작업 화면에서 연결을 붙여야 한다.'),
    (36, 'LoL', '선수 기록', 'gol.gg · Leaguepedia', 'gol.gg/players · lol.fandom.com', 100000,
       (select max(updated_at) from public.lol_player_stats), null, null, '자동 타이머 없음 — 시즌마다 손으로 다시 받는다.')
  )
  select coalesce(jsonb_agg(jsonb_build_object('sport', sport, 'kind', kind, 'source', source, 'url', url, 'every_min', every_min,
           'last_ok', last_ok, 'logs', logs, 'upcoming', upcoming, 'note', note) order by ord), '[]'::jsonb)
    into rows from defs;
  return jsonb_build_object('now', now(), 'rows', rows);
end $$;

grant execute on function public.data_sources_health() to anon, authenticated;

-- 리그 카드 (2026-11-22 사용자 요청 — 경기 일정·배당을 리그마다 네모로): rpc league_status_cards()
-- 리그마다: 종목, 어제·오늘·내일 경기 수, 일정 받은 시각, 배당 출처들(최근 3일), 마지막 배당 저장, 24시간 배당 저장 수, 마지막 수집 기록, 다음 예정
create or replace function public.league_status_cards() returns jsonb
language sql stable security definer set search_path to 'public' as $$
  with today as (select (now() at time zone 'Asia/Seoul')::date d),
  lg as (
    select league from public.game_schedules, today where game_date between today.d - 1 and today.d + 1
    union select league from public.odds_jobs union select league from public.collect_365_jobs
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'league', lg.league,
    'sport', coalesce((select sport from public.game_schedules s where s.league = lg.league order by game_date desc limit 1), (select sport from public.game_schedules s where s.league = lg.league limit 1)),
    'yday', (select sum(jsonb_array_length(games)) from public.game_schedules s, today where s.league = lg.league and game_date = today.d - 1),
    'today', (select sum(jsonb_array_length(games)) from public.game_schedules s, today where s.league = lg.league and game_date = today.d),
    'tomorrow', (select sum(jsonb_array_length(games)) from public.game_schedules s, today where s.league = lg.league and game_date = today.d + 1),
    'sched_at', (select max(fetched_at) from public.game_schedules s where s.league = lg.league),
    'odds_sources', (select jsonb_agg(distinct source) from public.odds_snapshots o where o.league = lg.league and o.fetched_at > now() - interval '3 days'),
    'odds_at', (select max(fetched_at) from public.odds_snapshots o where o.league = lg.league),
    'odds_n24', (select count(*) from public.odds_snapshots o where o.league = lg.league and o.fetched_at > now() - interval '24 hours'),
    'logs', (select jsonb_agg(jsonb_build_object('at', fetched_at, 'status', status, 'note', note) order by fetched_at desc)
             from (select * from public.odds_fetch_log f where f.league = lg.league order by fetched_at desc limit 3) x),
    'next_at', least((select next_at from public.odds_jobs j where j.league = lg.league), (select next_at from public.collect_365_jobs j where j.league = lg.league))
  ) order by lg.league), '[]'::jsonb) from lg
$$;
grant execute on function public.league_status_cards() to anon, authenticated;

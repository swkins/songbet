-- 축구 자체 모델 · 피로/동기 가설 백테스트용 데이터 (2026-11-28 사용자 요청 — "시장은 피로·동기를 덜 반영한다"를 과거 배당으로 확인)
-- 1) football-data.co.uk 5대 리그 CSV (2020-21 ~ 2026-27): 팀·날짜·점수·슈팅 + 피나클 경기 2~3일 전(PSH…)·마감(PSCH…) 배당, 시장 평균 마감(AvgC…)
--    컨테이너에서는 막혀 있어 DB의 pg_net으로 받음: fd_raw(csv 원문) → fd_parse(리그, 시즌) → fd_games, fd_close_avg로 평균 마감 배당 추가
--    피나클 마감은 2025-26 중반부터 football-data에 없음 → 그 뒤는 시장 평균 마감(ach…)으로 대신
-- 2) ESPN 일정 (연도 단위 ?dates=2024&limit=1000, Accept-Encoding identity — 아니면 gzip으로 와서 JSON이 깨짐):
--    UEFA 3개 대회·자국 컵(FA·리그컵·코파 델 레이·코파 이탈리아·DFB 포칼·쿠프 드 프랑스)·5대 리그 2020~2026 → espn_fetch(대회, 연도)·espn_extract() → espn_fx
-- 3) fd_team_map: football-data 팀 이름 ↔ ESPN 팀 id (같은 날짜 ±1일·같은 점수 경기로 자동 — 145팀 전부, 중복 0)
-- 4) soc_feat_tmp: 경기마다 양 팀 직전·다음 경기(모든 대회) 시각·대회, 최근 14일 경기 수 / 뷰 soc_side: 팀 기준 두 줄(공정 마감 확률·결과)
create table if not exists public.fd_raw (league text, season text, req bigint, csv text, fetched_at timestamptz default now(), primary key (league, season));
create table if not exists public.fd_games (
  league text, season text, d date, t text, home text, away text,
  hg int, ag int, hs int, as_ int, hst int, ast int, hc int, ac int,
  ph numeric, pd numeric, pa numeric, pch numeric, pcd numeric, pca numeric,
  po25 numeric, pu25 numeric, pco25 numeric, pcu25 numeric,
  ahh numeric, pahh numeric, paha numeric, ahch numeric, pcahh numeric, pcaha numeric,
  ach numeric, acd numeric, aca numeric, aco25 numeric, acu25 numeric,
  primary key (league, season, home, away)
);
create table if not exists public.espn_fx (comp text, event_id bigint, utc timestamptz, home_id int, home text, away_id int, away text, hs int, as_ int, primary key (comp, event_id));
create table if not exists public.espn_req (comp text, yr int, req bigint, done boolean default false, n int, primary key (comp, yr));
create table if not exists public.fd_team_map (league text, fd_name text, espn_id int, espn_name text, n int, primary key (league, fd_name));
create table if not exists public.team_ev (tid int, utc timestamptz, comp text);
-- 받기: insert into fd_raw (league, season, req) select l, s, net.http_get(format('https://www.football-data.co.uk/mmz4281/%s/%s.csv', s, l))
--        from unnest(array['E0','SP1','I1','D1','F1']) l, unnest(array['2021','2122','2223','2324','2425','2526','2627']) s;
--       몇 초 뒤 update fd_raw f set csv = r.content from net._http_response r where r.id = f.req and r.status_code = 200;
--       select sum(fd_parse(league, season)) from fd_raw;  select sum(fd_close_avg(league, season)) from fd_raw;
--       select count(espn_fetch(c, y)) from unnest(array[...]) c, generate_series(2020, 2026) y;  (몇십 초 뒤) select espn_extract();
-- 함수 본문(fd_parse·fd_close_avg·espn_fetch·espn_extract)과 soc_feat_tmp·soc_side는 DB에 있음 — 2026-11-28 세션에서 만듦.
-- 첫 결과 (2020-21~2026-27, 11,282경기, 공정 마감 확률 = 피나클 마감, 없으면 시장 평균 마감, 비례 방식 마진 제거):
--   나만 3일 휴식(상대 5.5일+) 1,340: 실제 승률 − 마감 공정 확률 +2.0%p, 마감 배당 승 ROI +0.8% / 상대만 3일 휴식 −1.3%p, ROI −9.6%
--   → 시장은 피로를 덜 반영하지 않는다. 오히려 약간 더 반영(지친 팀이 시장 예상보다 조금 더 이김). 오픈→마감도 지친 팀 쪽 확률을 0.2~0.4%p 낮춤.
--   3~4일 뒤 유로파·컨퍼런스가 있는 팀: +7.4%p(47경기)·+12.1%p(42경기) — 방향은 두 기간 같지만 표본이 작음(관찰 대상).

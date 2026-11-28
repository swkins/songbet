-- 축구 자체 모델 (2026-11-28 사용자 요청 — 배당은 모델에 안 넣고 비교·엣지 찾기에만)
-- 데이터: soc_m_games(football-data 5대 리그 2020-21~, supabase/soccer_backtest.sql) — 팀 번호 ht·at = fd_team_map 순번
-- 모델 soc_m_run(k, w, carry, rho, newp, kmu, store):
--   λ홈 = exp(μ리그 + 홈이점 + 공격홈 − 수비원정), λ원정 = exp(μ + 공격원정 − 수비홈) → 포아송 + 딕슨-콜스(rho, 0:0·1:0·0:1·1:1 보정)
--   경기 뒤 관측 = w·골 + (1−w)·유효슈팅×0.319 (리그 평균 골/유효슈팅), 오차 = 관측 − λ → 공격 += k·오차, 상대 수비 −= k·오차, μ·홈이점은 kmu 0.002로 천천히
--   새 시즌: 지난 시즌에도 있던 팀은 carry만큼 이어받고, 승격·다시 올라온 팀은 newp(공격·수비 둘 다 = 리그 평균보다 약하게), 2020-21 첫 시즌은 모두 0
--   store = true면 경기별 예측 soc_m_pred, 마지막 팀 레이팅 soc_m_team(espn_name = ESPN 표시 이름 → 일정 full과 맞춤), 리그 μ·홈이점 soc_m_league
-- 고르기(2021-22·2022-23)·확인(2023-24~2026-27): k 0.03 · w 0.5 · carry 1.0 · rho −0.1 · newp −0.3
--   log loss(1X2) 확인 시즌 모델 0.9796 · 피나클 마감 0.9623 · 오픈 0.9601(오픈 있는 경기)
--   시장 + b·(모델 − 시장): b 0 0.96226 → 0.05 0.96259 → 0.3 0.96508 (오픈도 같음) = 모델에 시장에 없는 정보가 없다
--   모델이 시장보다 3%p+ 높게 본 쪽 마감 배당 수익(피나클 마감 있는 시즌): 무 +4.2/+0.4% · 홈 정배 +5.7/−6.6% · 원정 정배 +10.3/−14.1% · 그 외 손실 (앞/뒤)
-- 갱신: pg_cron soc-model-fetch(월·목 05:10 KST, soc_m_fetch = 이번 시즌 CSV 다시 받기) → soc-model-fit(05:25, soc_m_refresh = 반영 + 경기 표 재생성 + soc_m_run store)
-- 확률 함수 soc_m_prob(lh, la, rho) → ph·pd·pa (SQL에서 비교할 때)
-- 화면: src/lib/fairOdds.ts loadModelScore → PinFairBox '우리 모델' (기대 득점·유력 스코어·승무패·2.5 오버, 피나클 공정 확률과 차이)
-- 함수 본문은 DB에 있음 (2026-11-28 세션). 테이블:
create table if not exists public.soc_m_games (
  i int primary key, league text, season text, ko timestamptz, ht int, at int, hg int, ag int, hst int, ast int,
  qh float8, qd float8, qa float8, ch float8, cd float8, ca float8, oh float8, od float8, oa float8, ph float8, pd float8, pa float8,
  h_rest float8, a_rest float8, h_next float8, a_next float8, h_prev text, a_prev text, h_nextc text, a_nextc text);
create table if not exists public.soc_m_pred (i int primary key, lh float8, la float8, mh float8, md float8, ma float8, mo25 float8);
create table if not exists public.soc_m_team (ti int primary key, league text, fd_name text, espn_name text, att float8, def float8, last_season text, updated_at timestamptz default now());
create table if not exists public.soc_m_league (league text primary key, mu float8, hfa float8, params jsonb, updated_at timestamptz default now());
create table if not exists public.soc_m_grid (k float8, w float8, carry float8, rho float8, newp float8, tr_ll float8, te_ll float8, primary key (k, w, carry, rho, newp));

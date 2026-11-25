-- NBA 핸디 기준점·언오버 기준점 (2026-11-21 사용자 요청 — 승패 적중은 의미 없다, 1.1 정배는 기준점 대비 마핸/플핸을 맞혀야 한다)
-- 기준점 = 주력 라인: 북메이커마다 양쪽 배당이 거의 같은(약 1.91) 라인. Action Network 9개 북 중 가장 많은 라인(같으면 양쪽 배당이 더 비슷한 쪽).
-- 수집: Supabase 함수 collect-odds (NBA, 승패 배당과 같은 요청) → odds_lines (바뀐 때만 한 줄 = 변경 히스토리)
-- 예측: predictions 저장 때 트리거가 그 시각 직전 기준점을 붙이고 예상 마진으로 마핸/플핸·오버/언더 + 확률(정규분포 근사),
--       채점 때(결과가 들어오면) 핸디·언오버 적중을 매긴다. 마감 기준점(경기 시작 직전)으로도 같이 채점.
create table if not exists public.odds_lines (
  id bigserial primary key,
  fetched_at timestamptz not null default now(),
  league text not null, game_date date, game_id text not null,
  market text not null,            -- 'spread' (line = 홈 기준, 예 -12.5) · 'total' (line = 총점, 예 229.5)
  line numeric not null,
  home_odds numeric, away_odds numeric,   -- spread: 홈·원정 / total: 오버·언더 (소수 배당, 그 라인 북 평균)
  open_line numeric, open_home numeric, open_away numeric,
  books int, source text
);
create index if not exists odds_lines_game on public.odds_lines (game_id, market, fetched_at);
alter table public.odds_lines enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'odds_lines' and policyname = 'anon_read_odds_lines') then
    create policy anon_read_odds_lines on public.odds_lines for select using (true);
  end if;
end $$;

alter table public.predictions add column if not exists spread_line numeric;        -- 예측 저장 시각의 홈 기준점
alter table public.predictions add column if not exists spread_home_odds numeric;
alter table public.predictions add column if not exists spread_away_odds numeric;
alter table public.predictions add column if not exists total_line numeric;
alter table public.predictions add column if not exists over_odds numeric;
alter table public.predictions add column if not exists under_odds numeric;
alter table public.predictions add column if not exists line_src text;              -- 'pred' = 예측 시각 기준점 · 'close' = 예측 때 없어서 마감 기준점
alter table public.predictions add column if not exists close_spread numeric;       -- 마감(경기 시작 직전) 기준점
alter table public.predictions add column if not exists close_total numeric;
alter table public.predictions add column if not exists ats_pick text;              -- 'home' = 홈 쪽(홈이 정배면 마핸) · 'away'
alter table public.predictions add column if not exists ats_prob numeric;           -- 고른 쪽 커버 확률 %
alter table public.predictions add column if not exists ou_pick text;               -- 'over' · 'under'
alter table public.predictions add column if not exists ou_prob numeric;
alter table public.predictions add column if not exists ats_hit boolean;            -- 기준점(spread_line) 핸디 적중, 적특이면 null + ats_push
alter table public.predictions add column if not exists ats_push boolean;
alter table public.predictions add column if not exists ats_close_hit boolean;
alter table public.predictions add column if not exists ou_hit boolean;
alter table public.predictions add column if not exists ou_close_hit boolean;

-- 정규분포 누적 근사 (로지스틱 1.702)
create or replace function public.phi_approx(x numeric) returns numeric language sql immutable as $$
  select 1 / (1 + exp(-1.702 * x))
$$;

create or replace function public.predictions_lines() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s public.odds_lines; t public.odds_lines; sd numeric; sdt numeric; l numeric; tl numeric; d numeric; act numeric; tot numeric;
begin
  if new.league <> 'NBA' then return new; end if;
  -- 예측 시각 기준점 (새 예측이거나 예측을 다시 저장했을 때)
  if tg_op = 'INSERT' or new.created_at is distinct from old.created_at or new.spread_line is null then
    select * into s from public.odds_lines where game_id = new.game_id and market = 'spread' and fetched_at <= coalesce(new.created_at, now()) order by fetched_at desc limit 1;
    select * into t from public.odds_lines where game_id = new.game_id and market = 'total' and fetched_at <= coalesce(new.created_at, now()) order by fetched_at desc limit 1;
    if s.id is not null then new.spread_line := s.line; new.spread_home_odds := s.home_odds; new.spread_away_odds := s.away_odds; new.line_src := 'pred'; end if;
    if t.id is not null then new.total_line := t.line; new.over_odds := t.home_odds; new.under_odds := t.away_odds; end if;
  end if;
  -- 마감 기준점 (경기 시작 뒤)
  if new.start_at <= now() and new.close_spread is null then
    select * into s from public.odds_lines where game_id = new.game_id and market = 'spread' and fetched_at <= new.start_at order by fetched_at desc limit 1;
    select * into t from public.odds_lines where game_id = new.game_id and market = 'total' and fetched_at <= new.start_at order by fetched_at desc limit 1;
    if s.id is not null then new.close_spread := s.line; end if;
    if t.id is not null then new.close_total := t.line; end if;
    if new.spread_line is null and s.id is not null then new.spread_line := s.line; new.spread_home_odds := s.home_odds; new.spread_away_odds := s.away_odds; new.line_src := 'close'; end if;
    if new.total_line is null and t.id is not null then new.total_line := t.line; new.over_odds := t.home_odds; new.under_odds := t.away_odds; end if;
  end if;

  sd := coalesce(nullif(new.params->>'sd', '')::numeric, 13.5);
  sdt := coalesce(nullif(new.params->>'sdT', '')::numeric, 18);
  l := new.spread_line; tl := new.total_line;
  -- 픽: 홈 커버 = 실제 마진 + 홈 기준점 > 0
  if l is not null and new.margin is not null then
    d := public.phi_approx((new.margin + l) / sd);
    new.ats_pick := case when new.margin + l >= 0 then 'home' else 'away' end;
    new.ats_prob := round(greatest(d, 1 - d) * 100, 1);
  end if;
  if tl is not null and new.total is not null then
    d := public.phi_approx((new.total - tl) / sdt);
    new.ou_pick := case when new.total >= tl then 'over' else 'under' end;
    new.ou_prob := round(greatest(d, 1 - d) * 100, 1);
  end if;
  -- 채점
  if new.result_home is not null and new.result_away is not null then
    act := new.result_home - new.result_away; tot := new.result_home + new.result_away;
    if l is not null and new.ats_pick is not null then
      new.ats_push := (act + l = 0);
      new.ats_hit := case when act + l = 0 then null else ((act + l > 0) = (new.ats_pick = 'home')) end;
    end if;
    if new.close_spread is not null and new.margin is not null then
      new.ats_close_hit := case when act + new.close_spread = 0 then null else ((act + new.close_spread > 0) = (new.margin + new.close_spread >= 0)) end;
    end if;
    if tl is not null and new.ou_pick is not null then
      new.ou_hit := case when tot = tl then null else ((tot > tl) = (new.ou_pick = 'over')) end;
    end if;
    if new.close_total is not null and new.total is not null then
      new.ou_close_hit := case when tot = new.close_total then null else ((tot > new.close_total) = (new.total >= new.close_total)) end;
    end if;
  end if;
  return new;
end $$;

create or replace trigger predictions_lines before insert or update on public.predictions
  for each row execute function public.predictions_lines();

-- 다시 채점 (2026-11-21): 채점은 '종료' 또는 시작 3시간 뒤에 하는데, 그때 일정 점수가 아직 경기 중 점수면 틀린 결과로 채점됐다
-- (11/21 DET 99-97로 채점 → 실제 102-105). 일정이 Final/종료가 되면 점수가 다른 예측을 그 점수로 다시 채점한다. 매시 40분.
create or replace function public.regrade_predictions() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with fin as (
    select g->>'id' gid, (g->'home'->>'score')::int hs, (g->'away'->>'score')::int aws
    from public.game_schedules s, jsonb_array_elements(s.games) g
    where s.game_date >= current_date - 7 and (g->>'status' ~* 'final|종료') and g->'home'->>'score' ~ '^\d+$' and g->'away'->>'score' ~ '^\d+$'
  )
  update public.predictions p set result_home = f.hs, result_away = f.aws, graded_at = now(),
    win_hit = (p.home_win > 50) = (f.hs - f.aws > 0),
    market_hit = case when p.odds_home is null or p.odds_away is null then null else sign(f.hs - f.aws) = case when p.odds_home < p.odds_away then 1 else -1 end end,
    margin_err = round((f.hs - f.aws) - p.margin, 1), total_err = round((f.hs + f.aws) - p.total, 1)
  from fin f
  where f.gid = p.game_id and p.result_home is not null and (p.result_home <> f.hs or p.result_away <> f.aws);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.regrade_predictions() from public, anon, authenticated;
select cron.schedule('regrade-predictions', '40 * * * *', 'select public.regrade_predictions()');

-- 추천 (2026-11-21 사용자 요청 — 내 모델 확률을 지금 배당과 비교해 갈 만한 것만): 추천 확률 = 시장(양쪽 배당 마진 뺀) + 0.5 × (모델 − 시장)
--  (검증 전 모델을 그대로 믿으면 다 추천돼서 반만 믿음 — src/lib/odds.ts REC_RULE.shrink와 같이 바꾼다), 기대수익 = 추천 확률 × 배당 − 1 ≥ +3% & 배당 1.30 이상 3.00 미만.
--  NBA = 핸디 픽(ats_prob, 그 쪽 기준점 배당) / 배구 = 승패(home_win vs odds_home·odds_away, 큰 쪽). 언오버는 모델 검증 전이라 추천 안 함.
--  rec_hit = 적중, rec_profit = 1단위 걸었을 때 손익(적중 배당−1 / 미적중 −1 / 적특 0).
alter table public.predictions add column if not exists rec_market text;   -- 'ats' · 'ml'
alter table public.predictions add column if not exists rec_side text;
alter table public.predictions add column if not exists rec_odds numeric;
alter table public.predictions add column if not exists rec_prob numeric;
alter table public.predictions add column if not exists rec_ev numeric;     -- %
alter table public.predictions add column if not exists rec boolean;        -- 추천 기준 통과
alter table public.predictions add column if not exists rec_hit boolean;
alter table public.predictions add column if not exists rec_profit numeric;

create or replace function public.predictions_rec() returns trigger
language plpgsql security definer set search_path = public as $$
declare p numeric; o numeric; oo numeric; q numeric; pr numeric; ph numeric; qh numeric; prh numeric; pra numeric; k numeric := 0.5;
begin
  new.rec_market := null; new.rec_side := null; new.rec_odds := null; new.rec_prob := null; new.rec_ev := null; new.rec := null;
  if new.league = 'NBA' and new.ats_pick is not null and new.ats_prob is not null and new.spread_home_odds > 1 and new.spread_away_odds > 1 then
    p := new.ats_prob / 100;
    o := case when new.ats_pick = 'home' then new.spread_home_odds else new.spread_away_odds end;
    oo := case when new.ats_pick = 'home' then new.spread_away_odds else new.spread_home_odds end;
    q := (1 / o) / (1 / o + 1 / oo); pr := q + k * (p - q);
    new.rec_market := 'ats'; new.rec_side := new.ats_pick; new.rec_odds := o; new.rec_prob := round(pr * 100, 1); new.rec_ev := round((pr * o - 1) * 100, 1);
  elsif new.league like 'VLEAGUE%' and new.home_win is not null and new.odds_home > 1 and new.odds_away > 1 then
    ph := new.home_win / 100; qh := (1 / new.odds_home) / (1 / new.odds_home + 1 / new.odds_away);
    prh := qh + k * (ph - qh); pra := 1 - prh;
    new.rec_market := 'ml';
    if prh * new.odds_home >= pra * new.odds_away then new.rec_side := 'home'; new.rec_odds := new.odds_home; new.rec_prob := round(prh * 100, 1); new.rec_ev := round((prh * new.odds_home - 1) * 100, 1);
    else new.rec_side := 'away'; new.rec_odds := new.odds_away; new.rec_prob := round(pra * 100, 1); new.rec_ev := round((pra * new.odds_away - 1) * 100, 1); end if;
  end if;
  if new.rec_market is not null then
    new.rec := new.rec_ev >= 3 and new.rec_odds >= 1.3 and new.rec_odds < 3.0;
  end if;
  new.rec_hit := null; new.rec_profit := null;
  if new.rec_market is not null and new.result_home is not null and new.result_away is not null then
    if new.rec_market = 'ats' then new.rec_hit := new.ats_hit;
    else new.rec_hit := (new.result_home > new.result_away) = (new.rec_side = 'home'); end if;
    new.rec_profit := case when new.rec_hit is null then 0 when new.rec_hit then round(new.rec_odds - 1, 2) else -1 end;
  end if;
  return new;
end $$;
-- 트리거 이름 순서: predictions_lines(핸디) → predictions_rec(추천)
create or replace trigger predictions_rec before insert or update on public.predictions
  for each row execute function public.predictions_rec();

-- NBA 모의베팅 (2026-11-21 사용자 요청 — 여러 방법으로 앞으로의 경기에 계속 모의 베팅하고 방법별 적중률을 본다, 예측 보고서에 표시)
-- 방법 = scripts/nba_backtest.py 백테스트 방법 + 사용자 예시(홈만·원정만·배당 흐름·언오버 기준점 반대·선수 폼과 배당 반반 등) + 우리 모델(선수 오버롤) 픽.
-- 시점 두 개: 'pre22' = 21:45 KST (사용자가 22시에 베팅, 예측 21:30 저장 직후) · 'close' = 경기 시작 30분 전 안 (그때까지 받은 마지막 기준점).
-- 기준점·배당 = 그 시점까지 받은 odds_lines 마지막 줄(collect-odds가 30~120분마다), 대중 % = odds_snapshots 승패 티켓 %(핸디 티켓 % 대용).
-- 채점 = game_schedules 종료 점수 (매시 45분, 점수가 바뀌면 다시 채점). 손익 = 1단위, 그 라인 북 평균 배당 (없으면 1.91).
-- 지우는 SQL은 넣지 않는다.

create table if not exists public.mock_strategies (
  key text primary key, label text not null, market text not null,   -- 'spread' · 'total'
  source text, note text, sort int
);
alter table public.mock_strategies enable row level security;

create table if not exists public.mock_bets (
  id bigserial primary key,
  league text not null default 'NBA', game_id text not null, game_date date not null, start_at timestamptz,
  home text, away text, timing text not null, strategy text not null, market text not null,
  side text not null,                 -- home · away · over · under
  line numeric not null,              -- spread = 홈 기준점(-5.5 = 홈 마핸 5.5) · total = 총점
  odds numeric, placed_at timestamptz not null default now(), ctx jsonb,
  result_home int, result_away int, hit boolean, push boolean, profit numeric, graded_at timestamptz,
  unique (game_id, timing, strategy)
);
create index if not exists mock_bets_date on public.mock_bets (game_date desc);
alter table public.mock_bets enable row level security;
do $$ begin
  create policy anon_read_mock_bets on public.mock_bets for select using (true);
  create policy anon_read_mock_strategies on public.mock_strategies for select using (true);
exception when duplicate_object then null; end $$;

insert into public.mock_strategies (key, label, market, source, note, sort) values
 ('home_all','전 경기 홈','spread','기본','',10),
 ('away_all','전 경기 원정','spread','기본','',11),
 ('fav_all','전 경기 정배','spread','기본','',12),
 ('dog_all','전 경기 역배','spread','기본','',13),
 ('big_dog10','큰 정배(10점+) 경기 역배','spread','2011-21 51.6%','',14),
 ('move_follow1','라인 이동 1점+ 따라감','spread','2025-26 52.5%','오픈 → 그 시점',20),
 ('move_follow15','라인 이동 1.5점+ 따라감','spread','2025-26 55.0%','오픈 → 그 시점',21),
 ('move_fade1','라인 이동 1점+ 반대','spread','2011-21 50.6%','',22),
 ('fixed_dog','라인 고정 → 역배','spread','기본','',23),
 ('rest2_home','휴식 차 +2 이상 → 홈','spread','2025-26 60%(55)','',30),
 ('rest2_away','휴식 차 −2 이하 → 원정','spread','2011-21 51.7%','',31),
 ('home_b2b_away','홈 백투백 → 원정','spread','기본','',32),
 ('away_b2b_home','원정 백투백 → 홈','spread','기본','',33),
 ('road4_away','원정 연전 4경기째+ → 원정','spread','2011-21 53.6% · 2025-26 51.9%','',34),
 ('away_blowout_away','원정팀 직전 20점+ 대승 → 원정','spread','2025-26 59.3%','',40),
 ('home_ats18_fade','홈팀 직전 핸디 +18↑ → 원정','spread','2011-21 55.5% · 2025-26 39.7%','직전 경기 기준점 있을 때만',41),
 ('home_ats18_follow','홈팀 직전 핸디 +18↑ → 홈','spread','2025-26 60.3%','직전 경기 기준점 있을 때만',42),
 ('pub65_fade','대중(승패 티켓) 65%+ 반대','spread','2025-26 52~59%','티켓 = 승패 티켓 %',50),
 ('pub65a_home_fixed','대중 원정 65%+ & 라인 원정 쪽 이동 없음 → 홈','spread','2025-26 63.2%(38)','',51),
 ('rlm60','대중 60%+ 반대로 라인 이동 → 이동 쪽','spread','2025-26 55.5%','',52),
 ('pub60_follow','대중 60%+ 따라감','spread','2025-26 48.6%','비교용',53),
 ('model_ats','우리 모델(선수 오버롤) 핸디 픽','spread','모델','예측 보고서 핸디 픽과 같음',60),
 ('model_ats3','모델 vs 기준점 3점+ 차 → 모델 쪽','spread','모델','',61),
 ('model_fade3','모델 3점+ 차 → 반대','spread','모델','비교용',62),
 ('model_move','모델 반 + 배당 흐름 반: 모델 쪽 & 라인도 같은 쪽 이동','spread','모델','',63),
 ('model_rest','모델 쪽 & 휴식 우위 겹침','spread','모델','',64),
 ('april_fav','4월 정배','spread','2025-26 62.5%','4월만',70),
 ('over_all','전 경기 오버','total','기본','',100),
 ('under_all','전 경기 언더','total','기본','',101),
 ('tmove_follow2','총점 이동 2점+ 따라감','total','2011-21 52.1%','',110),
 ('tmove_fade2','총점 이동 2점+ 반대 (기준점 반대로)','total','2011-21 47.9%','비교용',111),
 ('model_ou','우리 모델 언오버 픽','total','모델','예측 보고서 언오버 픽과 같음',120),
 ('model_ou5','모델 vs 총점 5점+ 차 → 모델 쪽','total','모델 (팀 폼 모델 오픈 55%)','',121),
 ('model_ou_fade5','모델 5점+ 차 → 반대','total','모델','비교용',122),
 ('model_ou_move','모델 쪽 & 총점도 같은 쪽 이동','total','모델','',123),
 ('big_spread_over','핸디 10점+ 경기 오버','total','2011-21 51.3%','',130),
 ('b2b_under','백투백 팀 있는 경기 언더','total','기본','',131),
 ('april_over','4월 오버','total','2011-21 52.6%','4월만',132)
on conflict (key) do update set label = excluded.label, market = excluded.market, source = excluded.source, note = excluded.note, sort = excluded.sort;

-- 팀 직전 경기 정보 (v_team_games, 그 경기 KST 날짜 전)
create or replace function public.mock_team_ctx(p_team text, p_date date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r record; lg text; ld date; lh boolean; ls int; lo int; road int := 0; n int := 0; sp numeric; ats numeric; started boolean := true;
begin
  for r in select game_id, game_date, is_home, team_score, opp_score from public.v_team_games
           where league = 'NBA' and team = p_team and game_date < p_date order by game_date desc limit 12 loop
    n := n + 1;
    if n = 1 then lg := r.game_id; ld := r.game_date; lh := r.is_home; ls := r.team_score; lo := r.opp_score; end if;
    if started and not r.is_home then road := road + 1; else started := false; end if;
  end loop;
  if n = 0 then return jsonb_build_object('n', 0); end if;
  select line into sp from public.odds_lines where game_id = lg and market = 'spread' order by fetched_at desc limit 1;
  if sp is null then select close_spread into sp from public.predictions where game_id = lg; end if;
  if sp is not null then ats := (ls - lo) + case when lh then sp else -sp end; end if;
  return jsonb_build_object('n', n, 'rest', least(4, p_date - ld - 1), 'road', road,
    'prev_home', lh, 'prev_margin', ls - lo, 'prev_ats', ats);
end $$;

create or replace function public.mock_add(p_gid text, p_date date, p_start timestamptz, p_home text, p_away text, p_timing text, p_strat text,
  p_market text, p_side text, p_line numeric, p_odds numeric, p_ctx jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.mock_bets (game_id, game_date, start_at, home, away, timing, strategy, market, side, line, odds, ctx)
  select p_gid, p_date, p_start, p_home, p_away, p_timing, p_strat, p_market, p_side, p_line, coalesce(nullif(p_odds, 0), 1.91), p_ctx
  where p_side is not null and p_line is not null
  on conflict (game_id, timing, strategy) do nothing
$$;

-- 한 경기 모의베팅 (p_asof = 판단 시각 — 그 전까지 받은 정보만 쓴다)
create or replace function public.mock_place_game(p_gid text, p_start timestamptz, p_home text, p_away text, p_timing text, p_asof timestamptz) returns int
language plpgsql security definer set search_path = public as $$
declare
  d date := (p_start at time zone 'Asia/Seoul')::date;
  s public.odds_lines; t public.odds_lines; pr public.predictions; tk numeric; hc jsonb; ac jsonb; ctx jsonb;
  l numeric; mvv numeric; tl numeric; tmv numeric; fav text; dog text; rd int; hr int; ar int; hb boolean; ab boolean;
  edge numeric; tedge numeric; mside text; tside text; apr boolean; n0 int; n1 int;
  ho numeric; ao numeric; oo numeric; uo numeric; cd numeric; ck numeric; fedge numeric; cavg numeric;
begin
  select count(*) into n0 from public.mock_bets where game_id = p_gid and timing = p_timing;
  select * into s from public.odds_lines where game_id = p_gid and market = 'spread' and fetched_at <= p_asof order by fetched_at desc limit 1;
  select * into t from public.odds_lines where game_id = p_gid and market = 'total' and fetched_at <= p_asof order by fetched_at desc limit 1;
  select * into pr from public.predictions where league = 'NBA' and game_id = p_gid and created_at <= p_asof;
  select home_tickets into tk from public.odds_snapshots where league = 'NBA' and game_id = p_gid and fetched_at <= p_asof and home_tickets is not null order by fetched_at desc limit 1;
  hc := public.mock_team_ctx(p_home, d); ac := public.mock_team_ctx(p_away, d);
  l := s.line; mvv := case when s.id is not null and s.open_line is not null then s.line - s.open_line end;   -- 음수 = 홈 쪽 이동
  tl := t.line; tmv := case when t.id is not null and t.open_line is not null then t.line - t.open_line end; -- 양수 = 오버 쪽 이동
  ho := s.home_odds; ao := s.away_odds; oo := t.home_odds; uo := t.away_odds;
  fav := case when l < 0 then 'home' when l > 0 then 'away' end; dog := case fav when 'home' then 'away' when 'away' then 'home' end;
  hr := (hc->>'rest')::int; ar := (ac->>'rest')::int; rd := hr - ar; hb := hr = 0; ab := ar = 0;
  -- 모델 계열은 시장을 섞기 전 순수 모델 값 (2026-11-21부터 예측 = 시장 80% + 모델 20% → raw.modelMargin·modelTotal), 없으면 예전 예측 값
  edge := case when coalesce((pr.raw->>'modelMargin')::numeric, pr.margin) is not null and l is not null then coalesce((pr.raw->>'modelMargin')::numeric, pr.margin) + l end;     -- + = 홈 쪽
  tedge := case when coalesce((pr.raw->>'modelTotal')::numeric, pr.total) is not null and tl is not null then coalesce((pr.raw->>'modelTotal')::numeric, pr.total) - tl end;   -- + = 오버 쪽
  mside := case when edge >= 0 then 'home' when edge < 0 then 'away' end;
  tside := case when tedge >= 0 then 'over' when tedge < 0 then 'under' end;
  apr := extract(month from d) = 4;
  ctx := jsonb_build_object('asof', p_asof, 'line', l, 'open', s.open_line, 'move', mvv, 'total', tl, 'open_total', t.open_line, 'tmove', tmv,
    'tickets_home', tk, 'home', hc, 'away', ac, 'model_margin', coalesce((pr.raw->>'modelMargin')::numeric, pr.margin), 'model_total', coalesce((pr.raw->>'modelTotal')::numeric, pr.total));

  -- 피로·백투백 과하게 (2026-11-21 사용자 요청): 팀 컨디션 차(홈−원정 %p) · 평균
  cd := (pr.cond->'home'->>'pct')::numeric - (pr.cond->'away'->>'pct')::numeric;
  cavg := ((pr.cond->'home'->>'pct')::numeric + (pr.cond->'away'->>'pct')::numeric) / 2;
  ck := coalesce((pr.params->>'condK')::numeric, 0.17);
  fedge := case when edge is not null and cd is not null then edge + 2 * ck * cd end;
  if l is not null then
    perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'home_all', 'spread', 'home', l, ho, ctx);
    perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'away_all', 'spread', 'away', l, ao, ctx);
    perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'fav_all', 'spread', fav, l, case fav when 'home' then ho else ao end, ctx);
    perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'dog_all', 'spread', dog, l, case dog when 'home' then ho else ao end, ctx);
    perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'big_dog10', 'spread', case when abs(l) >= 10 then dog end, l, case dog when 'home' then ho else ao end, ctx);
    if mvv is not null then
      perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'move_follow1', 'spread', case when mvv <= -1 then 'home' when mvv >= 1 then 'away' end, l, case when mvv < 0 then ho else ao end, ctx);
      perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'move_follow15', 'spread', case when mvv <= -1.5 then 'home' when mvv >= 1.5 then 'away' end, l, case when mvv < 0 then ho else ao end, ctx);
      perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'move_fade1', 'spread', case when mvv <= -1 then 'away' when mvv >= 1 then 'home' end, l, case when mvv < 0 then ao else ho end, ctx);
      perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'fixed_dog', 'spread', case when mvv = 0 then dog end, l, case dog when 'home' then ho else ao end, ctx);
    end if;
    if hr is not null and ar is not null then
      perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'rest2_home', 'spread', case when rd >= 2 then 'home' end, l, ho, ctx);
      perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'rest2_away', 'spread', case when rd <= -2 then 'away' end, l, ao, ctx);
    end if;
    perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'home_b2b_away', 'spread', case when hb then 'away' end, l, ao, ctx);
    perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'away_b2b_home', 'spread', case when ab then 'home' end, l, ho, ctx);
    perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'road4_away', 'spread', case when (ac->>'road')::int >= 3 then 'away' end, l, ao, ctx);  -- 직전까지 원정 3연속 = 이번이 4경기째
    perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'away_blowout_away', 'spread', case when (ac->>'prev_margin')::numeric >= 20 then 'away' end, l, ao, ctx);
    perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'home_ats18_fade', 'spread', case when (hc->>'prev_ats')::numeric >= 18 then 'away' end, l, ao, ctx);
    perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'home_ats18_follow', 'spread', case when (hc->>'prev_ats')::numeric >= 18 then 'home' end, l, ho, ctx);
    if tk is not null then
      perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'pub65_fade', 'spread', case when tk >= 65 then 'away' when tk <= 35 then 'home' end, l, case when tk >= 65 then ao else ho end, ctx);
      perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'pub65a_home_fixed', 'spread', case when tk <= 35 and coalesce(mvv, 0) <= 0 then 'home' end, l, ho, ctx);
      perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'rlm60', 'spread', case when tk >= 60 and mvv > 0 then 'away' when tk <= 40 and mvv < 0 then 'home' end, l, case when mvv > 0 then ao else ho end, ctx);
      perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'pub60_follow', 'spread', case when tk >= 60 then 'home' when tk <= 40 then 'away' end, l, case when tk >= 60 then ho else ao end, ctx);
    end if;
    if edge is not null then
      perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'model_ats', 'spread', mside, l, case mside when 'home' then ho else ao end, ctx);
      perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'model_ats3', 'spread', case when abs(edge) >= 3 then mside end, l, case mside when 'home' then ho else ao end, ctx);
      perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'model_fade3', 'spread', case when edge >= 3 then 'away' when edge <= -3 then 'home' end, l, case mside when 'home' then ao else ho end, ctx);
      perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'model_move', 'spread', case when mvv <> 0 and (edge > 0) = (mvv < 0) then mside end, l, case mside when 'home' then ho else ao end, ctx);
      perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'model_rest', 'spread', case when rd <> 0 and (edge > 0) = (rd > 0) then mside end, l, case mside when 'home' then ho else ao end, ctx);
    end if;
    if fedge is not null then
      perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'fat_model3', 'spread', case when fedge >= 0 then 'home' else 'away' end, l, case when fedge >= 0 then ho else ao end, ctx);
    end if;
    if cd is not null then
      perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'fat_rested8', 'spread', case when cd >= 8 then 'home' when cd <= -8 then 'away' end, l, case when cd > 0 then ho else ao end, ctx);
      perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'fat_tired8', 'spread', case when cd >= 8 then 'away' when cd <= -8 then 'home' end, l, case when cd > 0 then ao else ho end, ctx);
    end if;
    perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'april_fav', 'spread', case when apr then fav end, l, case fav when 'home' then ho else ao end, ctx);
  end if;

  if tl is not null then
    perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'over_all', 'total', 'over', tl, oo, ctx);
    perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'under_all', 'total', 'under', tl, uo, ctx);
    if tmv is not null then
      perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'tmove_follow2', 'total', case when tmv >= 2 then 'over' when tmv <= -2 then 'under' end, tl, case when tmv > 0 then oo else uo end, ctx);
      perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'tmove_fade2', 'total', case when tmv >= 2 then 'under' when tmv <= -2 then 'over' end, tl, case when tmv > 0 then uo else oo end, ctx);
    end if;
    if tedge is not null then
      perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'model_ou', 'total', tside, tl, case tside when 'over' then oo else uo end, ctx);
      perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'model_ou5', 'total', case when abs(tedge) >= 5 then tside end, tl, case tside when 'over' then oo else uo end, ctx);
      perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'model_ou_fade5', 'total', case when tedge >= 5 then 'under' when tedge <= -5 then 'over' end, tl, case tside when 'over' then uo else oo end, ctx);
      perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'model_ou_move', 'total', case when tmv <> 0 and (tedge > 0) = (tmv > 0) then tside end, tl, case tside when 'over' then oo else uo end, ctx);
    end if;
    perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'big_spread_over', 'total', case when abs(l) >= 10 then 'over' end, tl, oo, ctx);
    perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'b2b_under', 'total', case when hb or ab then 'under' end, tl, uo, ctx);
    perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'fat_under90', 'total', case when cavg < 90 then 'under' end, tl, uo, ctx);
    perform public.mock_add(p_gid, d, p_start, p_home, p_away, p_timing, 'april_over', 'total', case when apr then 'over' end, tl, oo, ctx);
  end if;
  select count(*) into n1 from public.mock_bets where game_id = p_gid and timing = p_timing;
  return n1 - n0;
end $$;

-- 'pre22': 21:45 KST에 앞으로 20시간 안 시작하는 경기 · 'close': 10분마다 30분 안에 시작하는 경기
create or replace function public.run_nba_mock_bets(p_timing text) returns int
language plpgsql security definer set search_path = public as $$
declare g record; n int := 0;
begin
  for g in
    select x->>'id' gid, (x->>'start')::timestamptz st, x->'home'->>'name' home, x->'away'->>'name' away
    from public.game_schedules s, jsonb_array_elements(s.games) x
    where s.sport = 'basketball' and s.league = 'NBA' and s.game_date between current_date - 1 and current_date + 2
      and (x->>'start')::timestamptz > now()
      and (x->>'start')::timestamptz <= now() + case when p_timing = 'pre22' then interval '20 hours' else interval '30 minutes' end
      and not exists (select 1 from public.mock_bets b where b.game_id = x->>'id' and b.timing = p_timing)
  loop
    n := n + public.mock_place_game(g.gid, g.st, g.home, g.away, p_timing, now());
  end loop;
  return n;
end $$;

-- 채점 (종료 점수, 점수가 바뀌면 다시)
create or replace function public.grade_nba_mock_bets() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with fin as (
    select distinct on (x->>'id') x->>'id' gid, (x->'home'->>'score')::int hs, (x->'away'->>'score')::int aws
    from public.game_schedules s, jsonb_array_elements(s.games) x
    where s.sport = 'basketball' and s.league = 'NBA' and s.game_date >= current_date - 7
      and (x->>'status' ~* 'final|종료') and x->'home'->>'score' ~ '^\d+$' and x->'away'->>'score' ~ '^\d+$'
  )
  update public.mock_bets b set result_home = f.hs, result_away = f.aws, graded_at = now(),
    push = case when b.market = 'spread' then (f.hs - f.aws) + b.line = 0 else f.hs + f.aws = b.line end,
    hit = case when b.market = 'spread' then case when (f.hs - f.aws) + b.line = 0 then null else ((f.hs - f.aws) + b.line > 0) = (b.side = 'home') end
               else case when f.hs + f.aws = b.line then null else (f.hs + f.aws > b.line) = (b.side = 'over') end end,
    profit = case when b.market = 'spread' then case when (f.hs - f.aws) + b.line = 0 then 0 when ((f.hs - f.aws) + b.line > 0) = (b.side = 'home') then round(b.odds - 1, 2) else -1 end
                  else case when f.hs + f.aws = b.line then 0 when (f.hs + f.aws > b.line) = (b.side = 'over') then round(b.odds - 1, 2) else -1 end end
  from fin f
  where f.gid = b.game_id and (b.graded_at is null or b.result_home <> f.hs or b.result_away <> f.aws);
  get diagnostics n = row_count;
  return n;
end $$;

-- 방법별 성적 (예측 보고서)
create or replace view public.v_mock_bet_stats with (security_invoker = false) as
select b.strategy, b.timing, b.market, s.label, s.source, s.note, s.sort,
  count(*) filter (where b.graded_at is not null and not coalesce(b.push, false)) n,
  count(*) filter (where b.hit) hits,
  count(*) filter (where b.push) pushes,
  round(sum(b.profit) filter (where b.graded_at is not null), 2) profit,
  count(*) filter (where b.graded_at is not null and not coalesce(b.push, false) and b.game_date >= current_date - 7) n7,
  count(*) filter (where b.hit and b.game_date >= current_date - 7) hits7,
  count(*) filter (where b.graded_at is null) pending,
  max(b.game_date) last_date
from public.mock_bets b left join public.mock_strategies s on s.key = b.strategy
group by b.strategy, b.timing, b.market, s.label, s.source, s.note, s.sort;
grant select on public.v_mock_bet_stats to anon, authenticated;

revoke all on function public.run_nba_mock_bets(text) from public, anon, authenticated;
revoke all on function public.grade_nba_mock_bets() from public, anon, authenticated;
revoke all on function public.mock_place_game(text, timestamptz, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.mock_add(text, date, timestamptz, text, text, text, text, text, text, numeric, numeric, jsonb) from public, anon, authenticated;

select cron.schedule('mock-nba-pre22', '45 12 * * *', 'select public.run_nba_mock_bets(''pre22'')');      -- 21:45 KST
select cron.schedule('mock-nba-close', '*/10 * * * *', 'select public.run_nba_mock_bets(''close'')');
select cron.schedule('mock-nba-grade', '45 * * * *', 'select public.grade_nba_mock_bets()');

-- 대중 % 방법 설명 (승패 티켓이라 정배 쏠림)
update public.mock_strategies set note = '대중 % = 승패 티켓 % (정배에 90%+ 쏠려 사실상 역배) — 핸디 티켓 %는 아직 안 받음' where key in ('pub65_fade','pub65a_home_fixed','rlm60','pub60_follow');

-- 사용자는 전날 21~22시 KST에 건다 (NBA는 다음 날 아침 시작) → 그 직전 기준점을 꼭 받아 둔다:
-- 21:15 KST collect-odds NBA 고정 한 번 (랜덤 타이머 collect-odds-nba와 별개) → 21:30 예측 → 21:45 모의베팅(pre22)
create or replace function public.run_collect_odds_nba_pre() returns void
language plpgsql security definer set search_path = public, net as $$
begin
  perform net.http_post(
    url := 'https://rgxjwfsmevfwmivsziyq.supabase.co/functions/v1/collect-odds',
    headers := (select jsonb_build_object('Content-Type','application/json','Authorization', substring(pg_get_functiondef('public.run_collect_odds(text)'::regprocedure) from '"Authorization":"(Bearer [^"]+)"'))),
    body := jsonb_build_object('league', 'NBA'), timeout_milliseconds := 60000);
end $$;
revoke all on function public.run_collect_odds_nba_pre() from public, anon, authenticated;
select cron.schedule('collect-odds-nba-pre', '15 12 * * *', 'select public.run_collect_odds_nba_pre()');

-- 피로·백투백 과하게 (2026-11-21 사용자 요청) — 위 mock_place_game에 같이 들어 있음
insert into public.mock_strategies (key, label, market, source, note, sort) values
 ('fat_model3','우리 모델 + 피로·백투백 3배','spread','모델 (피로 과하게)','팀 컨디션 차 × 0.17 → × 0.51',65),
 ('fat_rested8','컨디션 8%p+ 좋은 팀','spread','피로 (과하게)','백투백·이동·일정 밀도·연장 합친 팀 컨디션',66),
 ('fat_tired8','컨디션 8%p+ 나쁜 팀','spread','비교용','시장이 피로를 과하게 본다면 (2025-26 원정 백투백 −1.5점)',67),
 ('fat_under90','두 팀 컨디션 평균 90% 미만 → 언더','total','피로 (과하게)','',133)
on conflict (key) do update set label=excluded.label, market=excluded.market, source=excluded.source, note=excluded.note, sort=excluded.sort;

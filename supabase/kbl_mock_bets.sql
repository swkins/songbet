-- KBL 기준점 모의베팅 (2026-11-28 사용자 요청 — 365Scores Bet365 핸디·언오버 기준점(odds_lines source '365-bet365')으로 방법마다 모의 베팅, 적중률을 본다)
-- NBA와 같은 표 mock_bets·mock_strategies (league 'KBL', 방법 키 'kbl_'로 시작). 손익 = 1단위, 그 라인 Bet365 배당.
-- 시점: 'bet' = 사용자 베팅 시간 (평일 14:40 · 주말 09:40 KST, 그 15분 전에 365Scores를 한 번 더 받음 — 그날 경기)
--       'close' = 경기 시작 30분 안 (10분마다, 그때까지 받은 마지막 기준점) — 비교용.
-- 기준점 = 메인 라인(양쪽 배당이 가장 비슷한 라인). 오픈 = 우리가 처음 받은 기준점 (365는 진짜 오픈 라인을 안 줌), 승패 오픈은 365 originalRate.
-- 정수 기준점이 같으면 적특(push)으로 채점 — 수익 0.
-- 지우는 SQL은 넣지 않는다.

insert into public.mock_strategies (key, label, market, source, note, sort) values
 ('kbl_home_all','전 경기 홈','spread','기본','',10),
 ('kbl_away_all','전 경기 원정','spread','기본','',11),
 ('kbl_fav_all','전 경기 정배 (마핸)','spread','기본','',12),
 ('kbl_dog_all','전 경기 역배 (플핸)','spread','기본','',13),
 ('kbl_mindless','무지성: 3점+ 역배 플핸 · 2.5 이하 정배 마핸','spread','추정 기준점 백테스트 ~51%','사용자 규칙',20),
 ('kbl_homefav_dog','홈 정배 3점+ → 원정 플핸','spread','추정 기준점 50.4%','',21),
 ('kbl_awayfav_dog','원정 정배 3점+ → 홈 플핸','spread','추정 기준점 53.1%','',22),
 ('kbl_move_follow','기준점 1점+ 이동 따라감','spread','검증 전','오픈 = 처음 받은 기준점',30),
 ('kbl_move_fade','기준점 1점+ 이동 반대','spread','검증 전','비교용',31),
 ('kbl_ml_follow','승패 배당 2%p+ 이동 쪽 핸디','spread','검증 전','365 승패 오픈 → 그 시점 (마진 뺀 확률)',32),
 ('kbl_flow_agree','기준점·승패 배당 같은 쪽으로 이동 → 따라감','spread','검증 전','엇갈리면 안 건다',33),
 ('kbl_flow_or_dog','흐름 있으면 돈 쪽 · 없으면 역배 플핸','spread','검증 전','사용자 규칙 — 흐름 = 기준점 1점+ 또는 승패 2%p+ (기준점 우선)',34),
 ('kbl_over_all','전 경기 오버','total','기본','',100),
 ('kbl_under_all','전 경기 언더','total','기본','',101),
 ('kbl_tmove_follow','총점 1.5점+ 이동 따라감','total','검증 전','',110),
 ('kbl_tmove_fade','총점 1.5점+ 이동 반대','total','검증 전','비교용',111)
on conflict (key) do update set label = excluded.label, market = excluded.market, source = excluded.source, note = excluded.note, sort = excluded.sort;

-- league 칸 받는 mock_add (NBA용 mock_add는 league 기본값 'NBA' 그대로)
create or replace function public.mock_add_lg(p_league text, p_gid text, p_date date, p_start timestamptz, p_home text, p_away text, p_timing text, p_strat text,
  p_market text, p_side text, p_line numeric, p_odds numeric, p_ctx jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.mock_bets (league, game_id, game_date, start_at, home, away, timing, strategy, market, side, line, odds, ctx)
  select p_league, p_gid, p_date, p_start, p_home, p_away, p_timing, p_strat, p_market, p_side, p_line, coalesce(nullif(p_odds, 0), 1.91), p_ctx
  where p_side is not null and p_line is not null
  on conflict (game_id, timing, strategy) do nothing
$$;

create or replace function public.kbl_mock_place_game(p_gid text, p_start timestamptz, p_home text, p_away text, p_timing text, p_asof timestamptz) returns int
language plpgsql security definer set search_path = public as $$
declare
  d date := (p_start at time zone 'Asia/Seoul')::date;
  s public.odds_lines; t public.odds_lines; m public.odds_snapshots; ctx jsonb;
  l numeric; mvv numeric; tl numeric; tmv numeric; fav text; dog text; ho numeric; ao numeric; oo numeric; uo numeric;
  pnow numeric; popen numeric; dml numeric; mside text; lside text; flow text; n0 int; n1 int;
  odds_of text := null;
begin
  select count(*) into n0 from public.mock_bets where game_id = p_gid and timing = p_timing;
  select * into s from public.odds_lines where game_id = p_gid and market = 'spread' and source = '365-bet365' and fetched_at <= p_asof order by fetched_at desc limit 1;
  select * into t from public.odds_lines where game_id = p_gid and market = 'total' and source = '365-bet365' and fetched_at <= p_asof order by fetched_at desc limit 1;
  select * into m from public.odds_snapshots where game_id = p_gid and source = '365-bet365' and fetched_at <= p_asof order by fetched_at desc limit 1;
  l := s.line; mvv := case when s.id is not null then s.line - coalesce(s.open_line, s.line) end;      -- 음수 = 홈 쪽 이동 (홈 마핸 커짐)
  tl := t.line; tmv := case when t.id is not null then t.line - coalesce(t.open_line, t.line) end;     -- 양수 = 오버 쪽 이동
  ho := s.home_odds; ao := s.away_odds; oo := t.home_odds; uo := t.away_odds;
  fav := case when l < 0 then 'home' when l > 0 then 'away' end; dog := case fav when 'home' then 'away' when 'away' then 'home' end;
  -- 승패 배당 흐름: 오픈(365 originalRate) → 그 시점, 마진 뺀 홈 확률 변화 (+ = 홈 쪽으로 돈)
  if m.id is not null and m.open_home > 0 and m.open_away > 0 and m.home_odds > 0 and m.away_odds > 0 then
    pnow := (1 / m.home_odds) / (1 / m.home_odds + 1 / m.away_odds);
    popen := (1 / m.open_home) / (1 / m.open_home + 1 / m.open_away);
    dml := pnow - popen;
  end if;
  mside := case when dml >= 0.02 then 'home' when dml <= -0.02 then 'away' end;
  lside := case when mvv <= -1 then 'home' when mvv >= 1 then 'away' end;
  flow := coalesce(lside, mside);
  ctx := jsonb_build_object('asof', p_asof, 'line', l, 'open', s.open_line, 'move', mvv, 'total', tl, 'open_total', t.open_line, 'tmove', tmv,
    'ml_home', m.home_odds, 'ml_away', m.away_odds, 'ml_open_home', m.open_home, 'ml_open_away', m.open_away, 'ml_dp_home', round(dml, 4));

  if l is not null then
    perform public.mock_add_lg('KBL', p_gid, d, p_start, p_home, p_away, p_timing, 'kbl_home_all', 'spread', 'home', l, ho, ctx);
    perform public.mock_add_lg('KBL', p_gid, d, p_start, p_home, p_away, p_timing, 'kbl_away_all', 'spread', 'away', l, ao, ctx);
    perform public.mock_add_lg('KBL', p_gid, d, p_start, p_home, p_away, p_timing, 'kbl_fav_all', 'spread', fav, l, case fav when 'home' then ho else ao end, ctx);
    perform public.mock_add_lg('KBL', p_gid, d, p_start, p_home, p_away, p_timing, 'kbl_dog_all', 'spread', dog, l, case dog when 'home' then ho else ao end, ctx);
    perform public.mock_add_lg('KBL', p_gid, d, p_start, p_home, p_away, p_timing, 'kbl_mindless', 'spread', case when abs(l) >= 3 then dog else fav end, l,
      case (case when abs(l) >= 3 then dog else fav end) when 'home' then ho else ao end, ctx);
    perform public.mock_add_lg('KBL', p_gid, d, p_start, p_home, p_away, p_timing, 'kbl_homefav_dog', 'spread', case when l <= -3 then 'away' end, l, ao, ctx);
    perform public.mock_add_lg('KBL', p_gid, d, p_start, p_home, p_away, p_timing, 'kbl_awayfav_dog', 'spread', case when l >= 3 then 'home' end, l, ho, ctx);
    perform public.mock_add_lg('KBL', p_gid, d, p_start, p_home, p_away, p_timing, 'kbl_move_follow', 'spread', lside, l, case lside when 'home' then ho else ao end, ctx);
    perform public.mock_add_lg('KBL', p_gid, d, p_start, p_home, p_away, p_timing, 'kbl_move_fade', 'spread', case lside when 'home' then 'away' when 'away' then 'home' end, l, case lside when 'home' then ao else ho end, ctx);
    perform public.mock_add_lg('KBL', p_gid, d, p_start, p_home, p_away, p_timing, 'kbl_ml_follow', 'spread', mside, l, case mside when 'home' then ho else ao end, ctx);
    perform public.mock_add_lg('KBL', p_gid, d, p_start, p_home, p_away, p_timing, 'kbl_flow_agree', 'spread', case when lside is not null and lside = mside then lside end, l, case lside when 'home' then ho else ao end, ctx);
    perform public.mock_add_lg('KBL', p_gid, d, p_start, p_home, p_away, p_timing, 'kbl_flow_or_dog', 'spread', coalesce(flow, dog), l, case coalesce(flow, dog) when 'home' then ho else ao end, ctx);
  end if;
  if tl is not null then
    perform public.mock_add_lg('KBL', p_gid, d, p_start, p_home, p_away, p_timing, 'kbl_over_all', 'total', 'over', tl, oo, ctx);
    perform public.mock_add_lg('KBL', p_gid, d, p_start, p_home, p_away, p_timing, 'kbl_under_all', 'total', 'under', tl, uo, ctx);
    perform public.mock_add_lg('KBL', p_gid, d, p_start, p_home, p_away, p_timing, 'kbl_tmove_follow', 'total', case when tmv >= 1.5 then 'over' when tmv <= -1.5 then 'under' end, tl, case when tmv > 0 then oo else uo end, ctx);
    perform public.mock_add_lg('KBL', p_gid, d, p_start, p_home, p_away, p_timing, 'kbl_tmove_fade', 'total', case when tmv >= 1.5 then 'under' when tmv <= -1.5 then 'over' end, tl, case when tmv > 0 then uo else oo end, ctx);
  end if;
  select count(*) into n1 from public.mock_bets where game_id = p_gid and timing = p_timing;
  return n1 - n0;
end $$;

-- 'bet': 그날 KST 경기 중 아직 시작 안 한 것 · 'close': 30분 안에 시작하는 경기
create or replace function public.run_kbl_mock_bets(p_timing text) returns int
language plpgsql security definer set search_path = public as $$
declare g record; n int := 0;
begin
  for g in
    select x->>'id' gid, (x->>'start')::timestamptz st, x->'home'->>'name' home, x->'away'->>'name' away
    from public.game_schedules s, jsonb_array_elements(s.games) x
    where s.sport = 'basketball' and s.league = 'KBL' and s.game_date between current_date - 1 and current_date + 1
      and (x->>'start')::timestamptz > now()
      and case when p_timing = 'bet' then ((x->>'start')::timestamptz at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date
               else (x->>'start')::timestamptz <= now() + interval '30 minutes' end
      and not exists (select 1 from public.mock_bets b where b.game_id = x->>'id' and b.timing = p_timing)
      and exists (select 1 from public.odds_lines o where o.game_id = x->>'id' and o.source = '365-bet365')
  loop
    n := n + public.kbl_mock_place_game(g.gid, g.st, g.home, g.away, p_timing, now());
  end loop;
  return n;
end $$;

-- 채점: KBL 일정 '종료' 점수 (점수가 바뀌면 다시)
create or replace function public.grade_kbl_mock_bets() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with fin as (
    select distinct on (x->>'id') x->>'id' gid, (x->'home'->>'score')::int hs, (x->'away'->>'score')::int aws
    from public.game_schedules s, jsonb_array_elements(s.games) x
    where s.sport = 'basketball' and s.league = 'KBL' and s.game_date >= current_date - 7
      and (x->>'status' ~* 'final|종료') and x->'home'->>'score' ~ '^\d+$' and x->'away'->>'score' ~ '^\d+$'
  )
  update public.mock_bets b set result_home = f.hs, result_away = f.aws, graded_at = now(),
    push = case when b.market = 'spread' then (f.hs - f.aws) + b.line = 0 else f.hs + f.aws = b.line end,
    hit = case when b.market = 'spread' then case when (f.hs - f.aws) + b.line = 0 then null else ((f.hs - f.aws) + b.line > 0) = (b.side = 'home') end
               else case when f.hs + f.aws = b.line then null else (f.hs + f.aws > b.line) = (b.side = 'over') end end,
    profit = case when b.market = 'spread' then case when (f.hs - f.aws) + b.line = 0 then 0 when ((f.hs - f.aws) + b.line > 0) = (b.side = 'home') then round(b.odds - 1, 2) else -1 end
                  else case when f.hs + f.aws = b.line then 0 when (f.hs + f.aws > b.line) = (b.side = 'over') then round(b.odds - 1, 2) else -1 end end
  from fin f
  where b.league = 'KBL' and f.gid = b.game_id and (b.graded_at is null or b.result_home <> f.hs or b.result_away <> f.aws);
  get diagnostics n = row_count;
  return n;
end $$;

-- 방법별 성적 뷰에 league 칸 (맨 뒤에 추가)
create or replace view public.v_mock_bet_stats with (security_invoker = false) as
select b.strategy, b.timing, b.market, s.label, s.source, s.note, s.sort,
  count(*) filter (where b.graded_at is not null and not coalesce(b.push, false)) n,
  count(*) filter (where b.hit) hits,
  count(*) filter (where b.push) pushes,
  round(sum(b.profit) filter (where b.graded_at is not null), 2) profit,
  count(*) filter (where b.graded_at is not null and not coalesce(b.push, false) and b.game_date >= current_date - 7) n7,
  count(*) filter (where b.hit and b.game_date >= current_date - 7) hits7,
  count(*) filter (where b.graded_at is null) pending,
  max(b.game_date) last_date,
  b.league
from public.mock_bets b left join public.mock_strategies s on s.key = b.strategy
group by b.strategy, b.timing, b.market, s.label, s.source, s.note, s.sort, b.league;
grant select on public.v_mock_bet_stats to anon, authenticated;

-- 베팅 시간 15분 전에 365Scores KBL 한 번 더 (랜덤 타이머 collect-365-kbl과 별개)
create or replace function public.run_collect_365_kbl_pre() returns void
language plpgsql security definer set search_path = public, net as $$
begin
  perform net.http_post(
    url := 'https://rgxjwfsmevfwmivsziyq.supabase.co/functions/v1/collect-365',
    headers := (select jsonb_build_object('Content-Type','application/json','Authorization', substring(pg_get_functiondef('public.run_collect_odds(text)'::regprocedure) from '"Authorization":"(Bearer [^"]+)"'))),
    body := jsonb_build_object('league', 'KBL'), timeout_milliseconds := 60000);
end $$;

revoke all on function public.run_kbl_mock_bets(text) from public, anon, authenticated;
revoke all on function public.grade_kbl_mock_bets() from public, anon, authenticated;
revoke all on function public.kbl_mock_place_game(text, timestamptz, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.mock_add_lg(text, text, date, timestamptz, text, text, text, text, text, text, numeric, numeric, jsonb) from public, anon, authenticated;
revoke all on function public.run_collect_365_kbl_pre() from public, anon, authenticated;

-- UTC: 평일 14:25/14:40 KST = 05:25/05:40 월~금 · 주말 09:25/09:40 KST = 00:25/00:40 토·일
select cron.schedule('collect-365-kbl-pre-wd', '25 5 * * 1-5', 'select public.run_collect_365_kbl_pre()');
select cron.schedule('collect-365-kbl-pre-we', '25 0 * * 0,6', 'select public.run_collect_365_kbl_pre()');
select cron.schedule('mock-kbl-bet-wd', '40 5 * * 1-5', 'select public.run_kbl_mock_bets(''bet'')');
select cron.schedule('mock-kbl-bet-we', '40 0 * * 0,6', 'select public.run_kbl_mock_bets(''bet'')');
select cron.schedule('mock-kbl-close', '*/10 * * * *', 'select public.run_kbl_mock_bets(''close'')');
select cron.schedule('mock-kbl-grade', '52 * * * *', 'select public.grade_kbl_mock_bets()');

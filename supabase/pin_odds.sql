-- 피나클 5대 리그 배당 (2026-11-28 사용자 요청 — 롤링용 공정 배당 비교: 피나클 마진 뺀 확률 vs 사이트 배당, 마감 배당 기록)
-- collect-soccer가 5대 리그 타이머마다 피나클 리그 전체(보통 1주일치)를 받아:
--   pin_matchups : 피나클 경기 하나 = 한 줄 (처음 본 때 = 사실상 오픈), 우리 일정 경기를 찾으면 game_id 채움
--   pin_odds     : 시장·기준점마다 값이 바뀌었을 때만 한 줄 = 변동 기록 (첫 줄 = 오픈, 킥오프 전 마지막 줄 = 마감)
--     market 'ml' = 승무패(p1 홈·p2 무·p3 원정) · 'spread' = 핸디(line = 홈 기준, -0.5 = 홈 -0.5; p1 홈·p3 원정) · 'total' = 총골(line, p1 오버·p3 언더)
--     alt = 피나클 대안 라인 여부 (주력 라인은 false)
create table if not exists public.pin_matchups (
  matchup_id bigint primary key,
  league text not null,
  start_at timestamptz not null,
  home text not null,
  away text not null,
  game_id text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index if not exists pin_matchups_game on public.pin_matchups (game_id);
create table if not exists public.pin_odds (
  id bigserial primary key,
  matchup_id bigint not null,
  market text not null,
  line numeric,
  alt boolean not null default false,
  p1 numeric, p2 numeric, p3 numeric,
  fetched_at timestamptz not null default now()
);
create index if not exists pin_odds_mk on public.pin_odds (matchup_id, market, line, fetched_at desc);
alter table public.pin_matchups enable row level security;
alter table public.pin_odds enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'pin_matchups' and policyname = 'anon_read_pin_matchups') then
    create policy anon_read_pin_matchups on public.pin_matchups for select using (true); end if;
  if not exists (select 1 from pg_policies where tablename = 'pin_odds' and policyname = 'anon_read_pin_odds') then
    create policy anon_read_pin_odds on public.pin_odds for select using (true); end if;
end $$;

-- 축구 자체 예상 스코어 모델용 과거 경기 (2026-11-28 사용자 요청 — 배당은 모델에 안 넣고 비교·엣지 찾기에만)
-- collect-fotmob 'hist' → 리그·시즌마다 FotMob 리그 페이지 1번(hist_league) = 경기 목록·점수,
--   끝난 경기마다 경기 상세 1번(hist_match, 2~3분 간격으로 천천히) = xG·실제 선발(로테이션·라인업 분석용)
create table if not exists public.fm_hist (
  match_id bigint primary key,
  league_id int not null,
  season text not null,              -- FotMob 표기 '2025/2026'
  utc timestamptz,
  home_id int, home text, away_id int, away text,
  hg int, ag int,                    -- 골 (끝난 경기만)
  finished boolean not null default false,
  xg_h numeric, xg_a numeric,        -- 경기 상세에서
  h_starters int[], a_starters int[],
  detail_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists fm_hist_league on public.fm_hist (league_id, utc);
alter table public.fm_hist enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'fm_hist' and policyname = 'anon_read_fm_hist') then
    create policy anon_read_fm_hist on public.fm_hist for select using (true); end if;
end $$;

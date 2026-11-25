-- 시즌 중 감독 교체 (2026-11-25 사용자 요청 — 감독이 갑자기 바뀐 팀은 잘할지 못할지 모르는 위험 → 예측 확신을 줄인다)
-- change_date = 새 감독(대행 포함)이 처음 지휘하는 날. 그날부터 그 팀 5경기는 배구 홈 승률을 50% 쪽으로 30% 당긴다 (volleyPredict.ts COACH_RISK).
-- 근거: KOVO 2021-22~2025-26 감독 교체 6번(scripts/vleague_coach_backtest.py) — 교체 뒤 5경기 28경기 LL 0.7505 → 0.7172.
-- 화면·snapshot-predictions(loadGameOverall)가 읽는다. 출전확률-국내 예약 작업이 뉴스에서 교체를 보면 한 줄 넣는다.
create table if not exists public.coach_changes (
  league text not null, team text not null, change_date date not null,
  coach text, interim boolean default false, prev_coach text, reason text, source_url text, updated_at timestamptz default now(),
  primary key (league, team, change_date)
);
alter table public.coach_changes enable row level security;
do $$ begin
  if not exists (select 1 from pg_policy where polname = 'anon_read_coach_changes') then
    create policy anon_read_coach_changes on public.coach_changes for select using (true);
  end if;
end $$;

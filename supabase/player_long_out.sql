-- 장기 결장 (2026-11-22 사용자 요청 — 아라우조 무릎 수술·결별이 분석에 안 잡혔다)
-- player_status는 경기 날짜마다 판단이라 예약 작업이 안 돌면 비어 버린다 → 수술·시즌 아웃·계약 해지는 여기 한 줄 (기간 안 모든 경기에 0%)
-- 화면·snapshot-predictions(loadGameOverall)가 읽는다. 그 경기 날짜 player_status가 있으면 그게 먼저.
create table if not exists public.player_long_out (
  league text not null, team text not null, player_name text not null, player_id text,
  from_date date not null, until_date date,           -- until_date 없음 = 시즌 끝까지·복귀 미정
  play_prob int not null default 0, status text default '결장', confirmed boolean default true,
  reason text, source_title text, source_url text, updated_at timestamptz default now(),
  primary key (league, team, player_name)
);
alter table public.player_long_out enable row level security;
do $$ begin
  if not exists (select 1 from pg_policy where polname = 'anon_read_player_long_out') then
    create policy anon_read_player_long_out on public.player_long_out for select using (true);
  end if;
end $$;

insert into public.player_long_out (league, team, player_name, player_id, from_date, play_prob, status, reason, source_title, source_url) values
  ('VLEAGUE_M', '우리카드', '아라우조', '1000525', '2026-11-11', 0, '결장', '오른쪽 무릎 연골 수술(3~6개월) — 11/18 결별, 대체 외국인 물색 중',
   '개막 3연승 우리카드 날벼락! 아라우조, 수술 필요해', 'https://m.news.nate.com/view/20261115n07618')
on conflict (league, team, player_name) do update set from_date = excluded.from_date, play_prob = excluded.play_prob, status = excluded.status,
  reason = excluded.reason, source_title = excluded.source_title, source_url = excluded.source_url, updated_at = now();

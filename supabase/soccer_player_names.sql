-- 축구 선수 한글 이름 (2026-11-27 사용자 요청 — 5대 리그 선수 한글화)
-- FotMob 선수 id → 한글 이름. 화면(SoccerLineup)이 있으면 한글, 없으면 FotMob 영어 이름.
-- 새 선수는 영어로 나오니 한 줄씩 추가: insert into soccer_player_names values (id, '영어', '한글') on conflict (player_id) do update set name_ko = excluded.name_ko;
create table if not exists public.soccer_player_names (
  player_id bigint primary key,
  name_en text not null,
  name_ko text not null,
  updated_at timestamptz not null default now()
);
alter table public.soccer_player_names enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'soccer_player_names' and policyname = 'anon_read_soccer_player_names') then
    create policy anon_read_soccer_player_names on public.soccer_player_names for select using (true);
  end if;
end $$;

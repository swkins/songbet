-- 배구 선수 포지션·외국인 (2026-11-21 사용자 요청 — 포지션별 주전 슬롯으로 팀 전력, 화면에 포지션 표시)
-- KOVO 명단 API /teams/<코드>/players (position S·OH·OP·MB·L, status FOREIGNER·ASIS_QUARTER) — 부상 상태는 없다.
-- pg_net은 응답이 나중에 와서 두 단계: 04:07 KST 요청(kovo_roster_request) → 04:14 KST 저장(kovo_roster_parse). 팀 코드 남 1001~1012 · 여 2001~2012 (우리카드 1009).
create table if not exists public.kovo_players (
  player_code text primary key, name text, team_code text, gender text, position text, kind text, updated_at timestamptz default now());
alter table public.kovo_players enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'kovo_players' and policyname = 'anon_read_kovo_players') then
    create policy anon_read_kovo_players on public.kovo_players for select using (true);
  end if;
end $$;
-- KOVO API는 아시아쿼터도 status FOREIGNER로만 준다 (2026-11-24 확인 — 종휘·왕빈 등) → 손으로 넣는 덮어쓰기 표. 새 아시아쿼터가 오면 한 줄 추가.
create table if not exists public.kovo_kind_override (player_code text primary key, kind text not null, note text, updated_at timestamptz default now());
alter table public.kovo_kind_override enable row level security;
-- 2026-27: 여 메가·마미·종휘·자스티스·타나차·미와·이즈쉬에 / 남 류·왕빈·장추안·마틴·우스만·페이즈 (넣은 SQL은 이름으로 player_code를 찾아 insert)
create table if not exists public.kovo_roster_req (req_id bigint primary key, team_code text, at timestamptz default now());
create or replace function public.kovo_roster_parse() returns int
language plpgsql security definer set search_path = public, net as $$
declare n int;
begin
  with ok as (
    select q.team_code, q.at, r.content::jsonb j from public.kovo_roster_req q join net._http_response r on r.id = q.req_id
    where r.status_code = 200 and left(ltrim(r.content), 1) = '{' and r.content like '%"playerCode"%' and q.at > now() - interval '3 hours')
  insert into public.kovo_players (player_code, name, team_code, gender, position, kind, updated_at)
  select distinct on (e->>'playerCode') e->>'playerCode', e->>'name', ok.team_code, case when ok.team_code like '1%' then 'MALE' else 'FEMALE' end, e->>'position',
    coalesce((select o.kind from public.kovo_kind_override o where o.player_code = e->>'playerCode'),
      case when e->'status' ? 'FOREIGNER' then '외국인' when e->'status' ? 'ASIS_QUARTER' then '아시아쿼터' else null end), now()
  from ok, jsonb_array_elements(case when jsonb_typeof(ok.j->'payload') = 'array' then ok.j->'payload' else '[]'::jsonb end) e
  order by e->>'playerCode', ok.at desc
  on conflict (player_code) do update set name = excluded.name, team_code = excluded.team_code, gender = excluded.gender, position = excluded.position, kind = excluded.kind, updated_at = now();
  get diagnostics n = row_count;
  return n;
end $$;
create or replace function public.kovo_roster_request() returns void
language plpgsql security definer set search_path = public, net as $$
begin
  insert into public.kovo_roster_req (req_id, team_code)
  select net.http_get('https://user-api.kovo.co.kr/teams/' || c || '/players', headers := '{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124","Accept":"application/json","Accept-Language":"ko"}'::jsonb), c
  from (select (1001 + i)::text c from generate_series(0, 11) i union all select (2001 + i)::text from generate_series(0, 11) i) x
  on conflict do nothing;
end $$;
select cron.schedule('kovo-roster-request', '7 19 * * *', 'select public.kovo_roster_request()');
select cron.schedule('kovo-roster-parse', '14 19 * * *', 'select public.kovo_roster_parse()');

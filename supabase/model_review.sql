-- 예측 기록·채점·가중치·검토 보고서 (분석 탭 '예측 보고서') — Supabase에 적용하는 SQL.
-- 지우기 명령은 넣지 않는다 (Supabase 연결 확인 질문이 앱에 안 떠서 시간 초과).

-- ① 경기 전 예측 (Supabase 함수 snapshot-predictions가 저장, 경기 끝나면 같은 함수가 채점)
create table if not exists public.predictions (
  league text not null, game_id text not null, game_date date not null, start_at timestamptz,
  home text not null, away text not null,
  pred_home int, pred_away int, margin numeric, home_win numeric, total numeric, p10 numeric, p90 numeric,
  parts jsonb, raw jsonb, cond jsonb, params jsonb,
  odds_home numeric, odds_away numeric,
  created_at timestamptz not null default now(),
  result_home int, result_away int, graded_at timestamptz,
  win_hit boolean, market_hit boolean, margin_err numeric, total_err numeric,
  primary key (league, game_id)
);
create index if not exists predictions_date_idx on public.predictions (game_date desc);

-- ② 가중치 (key 'sim' = { leagues: { NBA: {sd,sdT,hca,k,avg,wScore,wOv,condK}, ... }, fatigueK })
create table if not exists public.model_params (key text primary key, value jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.model_param_history (
  id bigserial primary key, changed_at timestamptz not null default now(), key text not null, old_value jsonb, new_value jsonb, review_id bigint, note text);

-- ③ 매일 검토 보고서 (Claude Opus 예약 작업 09시 KST)
create table if not exists public.model_reviews (
  id bigserial primary key, created_at timestamptz not null default now(), review_date date not null,
  summary text, stats jsonb, games jsonb,
  proposals jsonb,   -- [{ league, param, from, to, reason, evidence }]
  status text not null default 'pending', decided_at timestamptz);

alter table public.predictions enable row level security;
alter table public.model_params enable row level security;
alter table public.model_param_history enable row level security;
alter table public.model_reviews enable row level security;
do $$ begin
  create policy anon_read_predictions on public.predictions for select using (true);
  create policy anon_read_model_params on public.model_params for select using (true);
  create policy anon_read_model_param_history on public.model_param_history for select using (true);
  create policy anon_read_model_reviews on public.model_reviews for select using (true);
exception when duplicate_object then null; end $$;

insert into public.model_params (key, value) values ('sim', '{
  "leagues": {
    "NBA":  {"sd": 13.5, "sdT": 18, "hca": 2.5, "k": 1.0, "avg": 113, "wScore": 0.5, "wOv": 0.5, "condK": 0.17},
    "KBL":  {"sd": 11,   "sdT": 14, "hca": 2,   "k": 0.8, "avg": 80,  "wScore": 0.5, "wOv": 0.5, "condK": 0.13},
    "WKBL": {"sd": 10,   "sdT": 12, "hca": 2,   "k": 0.7, "avg": 65,  "wScore": 0.5, "wOv": 0.5, "condK": 0.11}
  },
  "fatigueK": 0.35 }'::jsonb) on conflict (key) do nothing;

-- ④ 보고서에서 [적용] — 고른 제안만 가중치에 반영하고 이력을 남긴다 (앱은 로그인 없이 anon이라 security definer)
--    keys = 적용할 제안 번호(0부터). 제안 = { league: 'NBA'|'KBL'|'WKBL'|null(공통), param, to }
create or replace function public.apply_model_review(p_id bigint, p_keys int[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.model_reviews; old jsonb; cur jsonb; pr jsonb; i int; path text[];
begin
  select * into r from public.model_reviews where id = p_id;
  if r.id is null or r.status <> 'pending' then return jsonb_build_object('error', 'no pending review'); end if;
  select value into old from public.model_params where key = 'sim';
  cur := old;
  foreach i in array p_keys loop
    pr := r.proposals -> i;
    if pr is null or pr->>'param' is null or (pr->>'to') is null then continue; end if;
    if pr->>'param' not in ('sd','sdT','hca','k','avg','wScore','wOv','condK','fatigueK') then continue; end if;
    path := case when pr->>'param' = 'fatigueK' then array['fatigueK'] else array['leagues', pr->>'league', pr->>'param'] end;
    cur := jsonb_set(cur, path, to_jsonb((pr->>'to')::numeric), true);
  end loop;
  update public.model_params set value = cur, updated_at = now() where key = 'sim';
  insert into public.model_param_history (key, old_value, new_value, review_id, note) values ('sim', old, cur, p_id, 'apply ' || array_to_string(p_keys, ','));
  update public.model_reviews set status = case when cardinality(p_keys) > 0 then 'applied' else 'dismissed' end, decided_at = now() where id = p_id;
  return jsonb_build_object('ok', true, 'value', cur);
end $$;
grant execute on function public.apply_model_review(bigint, int[]) to anon, authenticated;

-- 가중치 되돌리기 (이력 한 줄 전으로)
create or replace function public.revert_model_params(p_history_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare h public.model_param_history; cur jsonb;
begin
  select * into h from public.model_param_history where id = p_history_id;
  if h.id is null then return jsonb_build_object('error', 'not found'); end if;
  select value into cur from public.model_params where key = h.key;
  update public.model_params set value = h.old_value, updated_at = now() where key = h.key;
  insert into public.model_param_history (key, old_value, new_value, note) values (h.key, cur, h.old_value, 'revert #' || h.id);
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.revert_model_params(bigint) to anon, authenticated;

-- ⑤ 자동 실행: NBA 예측 매일 21:30 KST(UTC 12:30, 사용자 22시 베팅 직전) · 국내 예측 매시 05분(시작 30~90분 전 경기) · 채점 매시 35분
create or replace function public.run_snapshot_predictions(p_mode text) returns void
language plpgsql security definer set search_path = public, net as $$
begin
  perform net.http_post(
    url := 'https://rgxjwfsmevfwmivsziyq.supabase.co/functions/v1/snapshot-predictions',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJneGp3ZnNtZXZmd21pdnN6aXlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzODIzOTUsImV4cCI6MjA5Njk1ODM5NX0.8eD0N5CLCBoDSrlg0nz3Q2JmOYthHepJlTptHCMYetw"}'::jsonb,
    body := jsonb_build_object('mode', p_mode), timeout_milliseconds := 150000);
end $$;
revoke all on function public.run_snapshot_predictions(text) from public, anon, authenticated;
select cron.schedule('snapshot-pred-nba', '30 12 * * *', 'select public.run_snapshot_predictions(''nba'')');
select cron.schedule('snapshot-pred-domestic', '5 * * * *', 'select public.run_snapshot_predictions(''domestic'')');
select cron.schedule('snapshot-pred-grade', '35 * * * *', 'select public.run_snapshot_predictions(''grade'')');

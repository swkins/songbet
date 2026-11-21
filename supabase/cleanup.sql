-- 자동 정리 (2026-11-21 사용자 요청 — 계속 돌려도 Supabase 무료 한도(DB 500MB) 안에서 버티게)
-- Supabase MCP로는 지우는 SQL을 보낼 수 없어서(확인 질문 → 시간 초과) 대시보드 SQL Editor에서 한 번 실행한다.
-- 매일 04:47 KST (UTC 19:47) public.cleanup_daily() — 쌓이기만 하는 기록만 지우고, 예측·채점·베팅·선수 기록(지난 시즌까지)은 남긴다.
create or replace function public.cleanup_daily() returns jsonb
language plpgsql security definer set search_path = public, cron as $$
declare r jsonb := '{}'; n int;
begin
  delete from cron.job_run_details where start_time < now() - interval '7 days';            get diagnostics n = row_count; r := r || jsonb_build_object('cron_runs', n);
  delete from public.odds_fetch_log where fetched_at < now() - interval '7 days';            get diagnostics n = row_count; r := r || jsonb_build_object('odds_fetch_log', n);
  delete from public.odds_snapshots where game_date < current_date - 14;                     get diagnostics n = row_count; r := r || jsonb_build_object('odds_snapshots', n);
  delete from public.odds_lines where game_date < current_date - 30;                         get diagnostics n = row_count; r := r || jsonb_build_object('odds_lines', n);
  delete from public.soccer_lines where fetched_at < now() - interval '14 days';             get diagnostics n = row_count; r := r || jsonb_build_object('soccer_lines', n);
  delete from public.game_schedules where game_date < current_date - 7;                      get diagnostics n = row_count; r := r || jsonb_build_object('game_schedules', n);
  delete from public.kovo_roster_req where at < now() - interval '3 days';                   get diagnostics n = row_count; r := r || jsonb_build_object('kovo_roster_req', n);
  delete from public.vb_games_req where at < now() - interval '3 days';                      get diagnostics n = row_count; r := r || jsonb_build_object('vb_games_req', n);
  delete from public.kovo_player_snapshots where snapshot_date < current_date - 14;          get diagnostics n = row_count; r := r || jsonb_build_object('kovo_snapshots', n);
  delete from public.news_check_log where ran_at < now() - interval '14 days';               get diagnostics n = row_count; r := r || jsonb_build_object('news_check_log', n);
  delete from public.player_status where game_date < current_date - 2;                       get diagnostics n = row_count; r := r || jsonb_build_object('player_status', n);
  delete from public.game_news where game_date < current_date - 30;                          get diagnostics n = row_count; r := r || jsonb_build_object('game_news', n);
  delete from public.player_ratings where game_date < current_date - 400;                    get diagnostics n = row_count; r := r || jsonb_build_object('player_ratings', n);
  -- 선수 경기 기록(player_game_stats)·배구 경기 결과(vb_games)·예측은 지우지 않는다 (사용자 — 배구 등 기록을 쌓고 싶다. 한 시즌 약 6~10MB)
  return r;
end $$;
revoke all on function public.cleanup_daily() from public, anon, authenticated;
select cron.schedule('cleanup-daily', '47 19 * * *', 'select public.cleanup_daily()');

-- 확인용으로 만들었던 임시 표
drop table if exists public.tmp_probe;

-- 지금 한 번 돌려 보기
select public.cleanup_daily();

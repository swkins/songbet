-- 경기 일정 자동 업데이트 (Supabase에 적용됨: migration update_schedule_random_hourly)
-- 약 1시간마다, 분은 매번 랜덤 (사용자 요청). pg_cron은 랜덤 시간을 못 정하므로,
-- 실행할 때마다 다음 실행 분을 지금부터 40~80분 뒤로 다시 정한다.
-- 받는 범위(오늘·내일)와 일주일 지난 일정 삭제는 Supabase 함수 update-schedule 안에서 한다.
create or replace function public.run_update_schedule() returns void
language plpgsql security definer set search_path = public, cron, net as $$
declare
  next_min int := ((extract(minute from now())::int + 40 + floor(random() * 41)::int) % 60);
begin
  perform net.http_post(
    url := 'https://rgxjwfsmevfwmivsziyq.supabase.co/functions/v1/update-schedule',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <anon key>"}'::jsonb,
    body := '{}'::jsonb, timeout_milliseconds := 30000);
  perform cron.alter_job((select jobid from cron.job where jobname = 'update-schedule-random'), schedule := next_min || ' * * * *');
  delete from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'update-schedule-random') and end_time < now() - interval '7 days';
end $$;
revoke all on function public.run_update_schedule() from public, anon, authenticated;

select cron.unschedule('update-schedule-am');
select cron.unschedule('update-schedule-pm');
select cron.schedule('update-schedule-random', ((extract(minute from now())::int + 7) % 60) || ' * * * *', 'select public.run_update_schedule()');

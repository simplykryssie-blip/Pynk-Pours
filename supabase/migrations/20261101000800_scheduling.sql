-- PynkPours — 0008 Scheduling.
--
-- Hold expiry is enforced lazily at read time, so availability is always
-- correct even if this job never runs. The sweep only tidies state: it marks
-- abandoned pending orders cancelled, flags holds expired, and prunes old
-- rate-limit rows.
--
-- On Supabase, pg_cron is available. In other environments (e.g. the local
-- test harness) the extension may be absent, so scheduling is conditional; the
-- app also exposes a CRON_SECRET-protected /api/cron/sweep route as a fallback.

do $$
begin
  if exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('pynkpours-sweep-expired', '*/5 * * * *', 'select public.sweep_expired();');
  else
    raise notice 'pg_cron not available; schedule public.sweep_expired() externally';
  end if;
end;
$$;

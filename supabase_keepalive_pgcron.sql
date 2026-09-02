-- ============================================================================
-- OPTIONAL — Keep Supabase alive WITHOUT GitHub (self-hosted pg_cron fallback)
-- ============================================================================
-- This makes Supabase "ping itself" through its own public REST API every
-- 3 days. Because the ping goes through the platform's API, it counts as
-- project activity and prevents the free-tier pause — even if the GitHub repo
-- has had no activity for 60+ days (GitHub then stops running scheduled jobs).
--
-- BEFORE you run this, replace the two placeholders below.
-- Both values come from:  Supabase Dashboard → Project Settings → API
--   YOUR_PROJECT_REF  → Project URL (e.g. https://abc123xyz.supabase.co)
--   YOUR_ANON_KEY     → "anon" / public key (not the service_role key!)
-- ============================================================================

-- 1) Enable the extensions used (idempotent, no-op if already enabled).
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists vault;

-- 2) Store the project URL + anon key in Supabase Vault (one time).
select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'project_url_keepalive');
select vault.create_secret('YOUR_ANON_KEY', 'anon_key_keepalive');

-- 3) Schedule the heartbeat write every 3 days.
--    Uses pg_net to POST one row to the `heartbeats` table through PostgREST.
select cron.schedule(
  'keepalive-heartbeat',
  '0 0 */3 * *',                            -- every 3 days at 00:00 UTC
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url_keepalive')
           || '/rest/v1/heartbeats',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key_keepalive'),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key_keepalive')
    ),
    body := '{"source":"pg_cron","note":"native pg_cron keepalive"}'::jsonb
  );
  $$
);

-- 4) Watch it work ------------------------------------------------------------
--   select * from cron.job_run_details order by start_time desc limit 10;
--
-- Stop it anytime:
--   select cron.unschedule('keepalive-heartbeat');
-- ============================================================================
-- ============================================================================
-- Change-detection for the egress-saving version probe (Easy Gold BTL V2)
-- ----------------------------------------------------------------------------
-- The web app checks "row count + latest updated_at" (~0.4KB) on every page
-- load / refresh instead of re-downloading the whole table (~0.5MB).
--
--   row count        → detects INSERTS and DELETES (worked without this file)
--   max(updated_at)  → detects EDITS to existing rows (needs THIS file)
--
-- Run ONCE in: Supabase Dashboard → SQL Editor → New query → paste → Run.
-- Safe to run again (idempotent). Takes effect immediately, no restart.
-- ============================================================================

-- 1) Add the updated_at column (no-op if it already exists)
alter table public.submissions
  add column if not exists updated_at timestamptz default now();

-- 2) Trigger: keep updated_at fresh on every INSERT / UPDATE automatically
create or replace function public.submissions_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists submissions_touch_updated_at on public.submissions;
create trigger submissions_touch_updated_at
  before insert or update on public.submissions
  for each row execute function public.submissions_touch_updated_at();

-- 3) One-time backfill so existing rows have a meaningful updated_at
update public.submissions
set updated_at = coalesce("timestamp", now())
where updated_at is null;

-- 4) Verify: you should see your row count and a recent last_touch timestamp
select count(*) as total_rows, max(updated_at) as last_touch
from public.submissions;

-- ============================================================================
-- Done. From now on, ANY change to submissions (add / edit / delete) makes the
-- app's next refresh download the fresh data — while unchanged refreshes cost
-- only ~0.4KB instead of ~0.5MB. Other tables (staff, users, targets, merch,
-- checkins, route_plan) are always fetched fresh anyway — nothing needed.
-- ============================================================================
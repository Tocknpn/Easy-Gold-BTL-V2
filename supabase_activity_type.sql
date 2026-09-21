-- ============================================================================
-- Activity Type (Booth / Event) for the submissions table (Easy Gold BTL V2)
-- ----------------------------------------------------------------------------
-- A second activity type was introduced: besides a "Booth", teams can now run an
-- "Event". Submit Results asks for the type next to the Activity Check-in and the
-- Dashboard can filter by it. The edit modal can change it afterwards.
--
-- Values: 'booth' | 'event'   (lowercase)
-- Default: 'booth' → every existing row stays Booth until an Admin edits it.
--
-- Run ONCE in: Supabase Dashboard → SQL Editor → New query → paste → Run.
-- Safe to run again (idempotent). Takes effect immediately, no restart.
-- ============================================================================

-- 1) Add the activity_type column (no-op if it already exists).
--    NOT NULL + DEFAULT 'booth' → all previous rows become 'booth' automatically.
alter table public.submissions
  add column if not exists activity_type text not null default 'booth';

-- 2) Safety backfill for any row that still has NULL (e.g. created during the
--    deploy window before this SQL was run).
update public.submissions
set activity_type = 'booth'
where activity_type is null;

-- 3) Keep only the two supported types in the table.
--    Remove this block if you ever add a third activity type.
alter table public.submissions drop constraint if exists submissions_activity_type_check;
alter table public.submissions add constraint submissions_activity_type_check
  check (activity_type in ('booth', 'event'));

-- 4) Verify: you should see 'booth' (all previous rows) and 'event' counts.
select activity_type, count(*) as rows
from public.submissions
group by activity_type
order by activity_type;

-- ============================================================================
-- Done. From now on Submit Results writes the selected type, the Dashboard can
-- filter by it, and the submission modal / Report / Calendar edit it.
-- The egress-saving probe (supabase_change_probe.sql) already covers this change:
-- updated_at is bumped on every edit, so the next refresh re-downloads the rows.
-- ============================================================================

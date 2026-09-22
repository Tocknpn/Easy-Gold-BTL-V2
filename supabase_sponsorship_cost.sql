-- ============================================================================
-- Sponsorship / Production Cost — third cost component (Easy Gold BTL V2)
-- ----------------------------------------------------------------------------
-- Total Cost used to be "Service Cost (team_cost) + Merch cost (merch_cost)".
-- A third component is now recorded per submission day: the Sponsorship /
-- Production Cost. It is filled in by Admin in the Cost Manager (and can be
-- corrected in the submission modal), and it is included in Total Cost — and
-- therefore in every CPA / CPO / CPAO and Total Spending figure.
--
-- The dashboard also has a "Cost Type" multi-select (Merch / Service Cost /
-- Sponsorship) that chooses which components are summed into that Total Cost.
--
-- Existing rows: NOTHING is backfilled — every row keeps 0, i.e. "not recorded
-- yet" (it shows as "—" in the modal and as an empty box in the Cost Manager,
-- ready to be filled in later).
--
-- Run ONCE in: Supabase Dashboard → SQL Editor → New query → paste → Run.
-- Safe to run again (idempotent). Takes effect immediately, no restart.
-- ============================================================================

-- 1) Add the column (no-op if it already exists).
--    NOT NULL + DEFAULT 0 → all previous rows become 0 (= blank / not recorded).
alter table public.submissions
  add column if not exists sponsorship_cost numeric not null default 0;

-- 2) Safety backfill for rows that still hold NULL (e.g. created during the
--    deploy window before this SQL was run).
update public.submissions
set sponsorship_cost = 0
where sponsorship_cost is null;

-- 3) Cost must never be negative. Drop this block if you ever need credits.
alter table public.submissions drop constraint if exists submissions_sponsorship_cost_nonneg;
alter table public.submissions add constraint submissions_sponsorship_cost_nonneg
  check (sponsorship_cost >= 0);

-- 4) Verify: total rows, how many already have a sponsorship cost recorded, and
--    the recorded sum. "filled" starts at 0 for an existing database.
select
  count(*)                                              as total_rows,
  count(*) filter (where sponsorship_cost > 0)          as filled,
  coalesce(sum(sponsorship_cost), 0)                    as total_sponsorship_cost
from public.submissions;

-- ============================================================================
-- Done. From now on the Cost Manager writes team_cost + sponsorship_cost
-- together, the submission modal can correct both, and Total Cost / CPA / CPO /
-- CPAO / Targets budget include the new component.
-- The egress-saving probe (supabase_change_probe.sql) already covers this
-- change: the updated_at trigger bumps on every edit, so the web app's next
-- refresh re-downloads the rows (no extra SQL needed for the cache).
-- ============================================================================

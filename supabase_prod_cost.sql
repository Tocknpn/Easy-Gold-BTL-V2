-- ============================================================================
-- Production Cost — the FOURTH cost component (Easy Gold BTL V2)
-- ----------------------------------------------------------------------------
-- Cost used to have three components per submission day:
--     Service Cost (team_cost) + Merch Cost (merch_cost) + Sponsorship (sponsorship_cost)
-- where sponsorship_cost held a COMBINED "Sponsorship / Production" figure.
--
-- That combined column is now split in two:
--     3. Sponsorship Cost  → sponsorship_cost   (unchanged column)
--     4. Production Cost   → prod_cost          (this file)
--
-- NOTHING is backfilled: every existing row keeps its sponsorship_cost exactly
-- as it is, and gets prod_cost = 0 (= "not recorded yet", shown as an empty box
-- in the Cost Manager, ready to be filled in later).
--
-- The dashboard's "Cost Type" multi-select now has FOUR options
-- (Merch / Service Cost / Sponsorship Cost / Production Cost) and Total Cost —
-- and therefore every CPA / CPO / CPAO and Total Spending figure — can be
-- restricted to any combination of them.
--
-- Run ONCE in: Supabase Dashboard → SQL Editor → New query → paste → Run.
-- Safe to run again (idempotent). Takes effect immediately, no restart.
-- ============================================================================

-- 1) Add the column (no-op if it already exists).
--    NOT NULL + DEFAULT 0 → all previous rows become 0 (= blank / not recorded).
alter table public.submissions
  add column if not exists prod_cost numeric not null default 0;

-- 2) Safety backfill for rows that still hold NULL (e.g. created during the
--    deploy window before this SQL was run).
update public.submissions
set prod_cost = 0
where prod_cost is null;

-- 3) Cost must never be negative. Drop this block if you ever need credits.
alter table public.submissions drop constraint if exists submissions_prod_cost_nonneg;
alter table public.submissions add constraint submissions_prod_cost_nonneg
  check (prod_cost >= 0);

-- 4) Verify: total rows, how many already have a production cost recorded, and
--    the recorded sum. "filled" starts at 0 for an existing database.
select
  count(*)                                        as total_rows,
  count(*) filter (where prod_cost > 0)           as filled,
  coalesce(sum(prod_cost), 0)                     as total_prod_cost
from public.submissions;

-- ============================================================================
-- Done. From now on the Cost Manager writes team_cost + sponsorship_cost +
-- prod_cost together, the submission modal can correct all three, and Total
-- Cost / CPA / CPO / CPAO / Targets budget include the new component.
-- The egress-saving probe (supabase_change_probe.sql) already covers this
-- change: the updated_at trigger bumps on every edit, so the web app's next
-- refresh re-downloads the rows (no extra SQL needed for the cache). Until this
-- file is run, the web app keeps saving everything else and shows an alert with
-- this exact SQL. Cached snapshots without prod_cost read as 0 automatically.
-- ============================================================================

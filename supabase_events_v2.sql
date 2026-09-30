-- Easy Gold BTL -- Event Management V2 Migration
-- Run AFTER supabase_events.sql (which already ran OK).
-- Safe to re-run: uses IF NOT EXISTS / DO NOTHING.

-- =========================================================================
-- 1. event_types table  (SKU-like master list of activity types)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.event_types (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  timestamptz DEFAULT now(),
  name        text NOT NULL UNIQUE,
  description text,
  sort_order  int NOT NULL DEFAULT 0
);

-- Seed the standard types (safe to re-run)
INSERT INTO public.event_types (name, sort_order) VALUES
  ('H2H Booth',        1),
  ('Event (indoor)',   2),
  ('Event (outdoor)',  3),
  ('Sponsorship',      4),
  ('Wealth Talk',      5),
  ('On Shop',          6)
ON CONFLICT (name) DO NOTHING;

-- =========================================================================
-- 2. Migrate event_targets: quarter (text) --> month (int 1-12)
-- =========================================================================

-- Step A: add the month column
ALTER TABLE public.event_targets
  ADD COLUMN IF NOT EXISTS month int;

-- Step B: populate month from existing quarter values
UPDATE public.event_targets
SET month = CASE quarter
  WHEN 'Q1' THEN 1
  WHEN 'Q2' THEN 4
  WHEN 'Q3' THEN 7
  WHEN 'Q4' THEN 10
  ELSE 1
END
WHERE month IS NULL;

-- Step C: make it NOT NULL + add check constraint
ALTER TABLE public.event_targets
  ALTER COLUMN month SET NOT NULL;

ALTER TABLE public.event_targets
  ADD CONSTRAINT IF NOT EXISTS event_targets_month_valid
  CHECK (month BETWEEN 1 AND 12);

-- Step D: drop old quarterly unique constraint
ALTER TABLE public.event_targets
  DROP CONSTRAINT IF EXISTS event_targets_year_quarter_team_activity_type_key;

-- Step E: add new monthly unique constraint
ALTER TABLE public.event_targets
  ADD CONSTRAINT IF NOT EXISTS event_targets_month_unique
  UNIQUE (year, month, team, activity_type);

-- Step F: drop the quarter column (no longer needed)
ALTER TABLE public.event_targets
  DROP COLUMN IF EXISTS quarter;

-- =========================================================================
-- 3. Re-seed monthly targets for Q3 2026 (July=7, Aug=8, Sep=9)
-- =========================================================================
INSERT INTO public.event_targets (year,month,team,activity_type,cpf_target,cpa_target,cpo_target,cpm_target,nc_target,ec_target,buy_value_target)
SELECT 2026, m, team, activity_type, cpf_target, cpa_target, cpo_target, cpm_target, nc_target, ec_target, buy_value_target
FROM public.event_targets
CROSS JOIN (VALUES (7),(8),(9)) AS months(m)
WHERE year = 2026 AND month = 7
ON CONFLICT (year,month,team,activity_type) DO NOTHING;

-- =========================================================================
-- Verification (uncomment to check)
-- =========================================================================
-- SELECT name FROM public.event_types ORDER BY sort_order;
-- SELECT year, month, team, activity_type, cpf_target FROM public.event_targets ORDER BY team, month, activity_type;
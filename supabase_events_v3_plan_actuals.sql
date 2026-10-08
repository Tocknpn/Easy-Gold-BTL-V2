-- Easy Gold BTL -- Event Management V3 Migration: Event Plans, Actuals & Executive Reporting
-- Run this in the Supabase SQL Editor.
-- Safe to re-run: all statements use IF NOT EXISTS / OR REPLACE / DROP CONSTRAINT IF EXISTS.

-- =========================================================================
-- 1. Extend public.events table with Event Plan & Actuals fields
-- =========================================================================

-- Event Info additions
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS location text DEFAULT '';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS start_time text DEFAULT '';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS end_time text DEFAULT '';

-- Total Budget Plan breakdown
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS budget_total numeric NOT NULL DEFAULT 0;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS budget_media numeric NOT NULL DEFAULT 0;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS budget_production numeric NOT NULL DEFAULT 0;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS budget_sponsor numeric NOT NULL DEFAULT 0;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS budget_merch numeric NOT NULL DEFAULT 0;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS budget_operation numeric NOT NULL DEFAULT 0;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS budget_other numeric NOT NULL DEFAULT 0;

-- Merch list and Media sources (stored as JSON)
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS merch_items_list jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS media_sources jsonb DEFAULT '["Facebook"]'::jsonb;

-- Target metrics field boxes
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS target_footfall numeric NOT NULL DEFAULT 0;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS target_nc_buyer int NOT NULL DEFAULT 0;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS target_download int NOT NULL DEFAULT 0;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS target_kyc int NOT NULL DEFAULT 0;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS target_cpa numeric NOT NULL DEFAULT 0;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS target_cpo numeric NOT NULL DEFAULT 0;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS target_cpm numeric NOT NULL DEFAULT 0;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS target_cpf numeric NOT NULL DEFAULT 0;

-- Actuals fields (filled when event ends)
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS actual_filled boolean NOT NULL DEFAULT false;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS actual_cost numeric NOT NULL DEFAULT 0;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS actual_media_cost numeric NOT NULL DEFAULT 0;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS actual_production_cost numeric NOT NULL DEFAULT 0;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS actual_sponsor_cost numeric NOT NULL DEFAULT 0;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS actual_merch_cost numeric NOT NULL DEFAULT 0;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS actual_operation_cost numeric NOT NULL DEFAULT 0;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS actual_other_cost numeric NOT NULL DEFAULT 0;

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS actual_footfall numeric NOT NULL DEFAULT 0;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS actual_nc int NOT NULL DEFAULT 0;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS actual_nc_buyer int NOT NULL DEFAULT 0;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS actual_ec int NOT NULL DEFAULT 0;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS actual_download int NOT NULL DEFAULT 0;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS actual_kyc int NOT NULL DEFAULT 0;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS actual_buy_value numeric NOT NULL DEFAULT 0;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS actual_impressions numeric NOT NULL DEFAULT 0;

-- Actual CP metrics (autocalculated & cached)
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS actual_cpa numeric NOT NULL DEFAULT 0;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS actual_cpo numeric NOT NULL DEFAULT 0;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS actual_cpm numeric NOT NULL DEFAULT 0;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS actual_cpf numeric NOT NULL DEFAULT 0;

-- Media Photo links (up to 4 links)
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS photo_urls jsonb DEFAULT '[]'::jsonb;

-- Status constraint update: support 'pending' (default), 'active', 'completed', 'cancelled'
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_status_check;
ALTER TABLE public.events ADD CONSTRAINT events_status_check
  CHECK (status IN ('pending', 'active', 'completed', 'cancelled'));
ALTER TABLE public.events ALTER COLUMN status SET DEFAULT 'pending';

-- =========================================================================
-- 2. Seed September 2026 Activation Events (matching the Executive Report)
-- =========================================================================

-- Event 1: LGF (LARGE — Trade Fair)
INSERT INTO public.events (
  year, quarter, team, event_name, location,
  start_date, end_date, activity_type, scale, objective, status,
  budget_total, budget_media, budget_production, budget_sponsor, budget_merch, budget_operation, budget_other,
  media_sources, total_media_impressions,
  target_nc, target_ec, target_footfall, target_buy_value,
  target_cpo, target_cpa, target_cpm, target_cpf,
  actual_filled, actual_cost, actual_nc, actual_ec, actual_footfall, actual_buy_value, actual_impressions,
  actual_cpo, actual_cpa, actual_cpm,
  photo_urls, proposal_link
) VALUES (
  2026, 'Q3', 'Agency', 'LGF', 'Lao-ITECC Exhibition Hall',
  '2026-09-10', '2026-09-14', 'Trade Fair', 'Large', 'Acquisition/Awareness', 'completed',
  279700000, 50000000, 120000000, 30000000, 40000000, 30000000, 9700000,
  '["Facebook","Tiktok","Youtube"]'::jsonb, 4370000,
  75, 195, 3000, 250000000,
  1035926, 3729333, 64, 93233,
  true, 279700000, 73, 196, 2980, 248000000, 4370312,
  1039777, 3832877, 64,
  '["https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600&auto=format&fit=crop","https://images.unsplash.com/photo-1511578314322-379afb476865?w=600&auto=format&fit=crop","https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=600&auto=format&fit=crop","https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=600&auto=format&fit=crop"]'::jsonb,
  'https://drive.google.com'
) ON CONFLICT DO NOTHING;

-- Event 2: Lao Wisdom (MEDIUM — Community/Panel)
INSERT INTO public.events (
  year, quarter, team, event_name, location,
  start_date, end_date, activity_type, scale, objective, status,
  budget_total, budget_media, budget_production, budget_sponsor, budget_merch, budget_operation, budget_other,
  media_sources, total_media_impressions,
  target_nc, target_ec, target_footfall, target_buy_value,
  target_cpo, target_cpa, target_cpm, target_cpf,
  actual_filled, actual_cost, actual_nc, actual_ec, actual_footfall, actual_buy_value, actual_impressions,
  actual_cpo, actual_cpa, actual_cpm,
  photo_urls, proposal_link
) VALUES (
  2026, 'Q3', 'KPV', 'Lao Wisdom', 'National Cultural Hall',
  '2026-09-18', '2026-09-19', 'Community/Panel', 'Medium', 'Awareness/Education', 'completed',
  51800000, 15000000, 18000000, 5000000, 8000000, 5000000, 800000,
  '["Facebook","Line"]'::jsonb, 2590000,
  70, 130, 1200, 120000000,
  259000, 740000, 20, 43166,
  true, 51800000, 88, 129, 1350, 134000000, 2590000,
  238710, 588636, 20,
  '["https://images.unsplash.com/photo-1528605248644-14dd04022da1?w=600&auto=format&fit=crop","https://images.unsplash.com/photo-1515187029135-18ee286d815b?w=600&auto=format&fit=crop","https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=600&auto=format&fit=crop","https://images.unsplash.com/photo-1531497865144-0464ef8fb9a9?w=600&auto=format&fit=crop"]'::jsonb,
  'https://drive.google.com'
) ON CONFLICT DO NOTHING;

-- Event 3: Lao Digital Award (SMALL — Sponsorship)
INSERT INTO public.events (
  year, quarter, team, event_name, location,
  start_date, end_date, activity_type, scale, objective, status,
  budget_total, budget_media, budget_production, budget_sponsor, budget_merch, budget_operation, budget_other,
  media_sources, total_media_impressions,
  target_nc, target_ec, target_footfall, target_buy_value,
  target_cpo, target_cpa, target_cpm, target_cpf,
  actual_filled, actual_cost, actual_nc, actual_ec, actual_footfall, actual_buy_value, actual_impressions,
  actual_cpo, actual_cpa, actual_cpm,
  photo_urls, proposal_link
) VALUES (
  2026, 'Q3', 'Agency', 'Lao Digital Award', 'Don Chan Palace Hotel',
  '2026-09-22', '2026-09-23', 'Sponsorship', 'Small', 'Acquisition/Awareness', 'completed',
  39687000, 10000000, 8000000, 15000000, 3000000, 3000000, 687000,
  '["Facebook","Tiktok","inApp"]'::jsonb, 3079615,
  30, 60, 600, 80000000,
  440967, 1322900, 12887, 66145,
  true, 39687000, 33, 64, 620, 85000000, 3079615,
  409145, 1072622, 12887,
  '["https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=600&auto=format&fit=crop","https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=600&auto=format&fit=crop","https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=600&auto=format&fit=crop","https://images.unsplash.com/photo-1527529482837-4698179dc6ce?w=600&auto=format&fit=crop"]'::jsonb,
  'https://drive.google.com'
) ON CONFLICT DO NOTHING;

-- Event 4: Lao E-commerce (MED/LARGE BOUNDARY)
INSERT INTO public.events (
  year, quarter, team, event_name, location,
  start_date, end_date, activity_type, scale, objective, status,
  budget_total, budget_media, budget_production, budget_sponsor, budget_merch, budget_operation, budget_other,
  media_sources, total_media_impressions,
  target_nc, target_ec, target_footfall, target_buy_value,
  target_cpo, target_cpa, target_cpm, target_cpf,
  actual_filled, actual_cost, actual_nc, actual_ec, actual_footfall, actual_buy_value, actual_impressions,
  actual_cpo, actual_cpa, actual_cpm,
  photo_urls, proposal_link
) VALUES (
  2026, 'Q3', 'KPV', 'Lao E-commerce', 'Landmark Riverside Hotel',
  '2026-09-26', '2026-09-28', 'Community/Panel', 'Med/Large Boundary', 'Acquisition', 'completed',
  72800000, 20000000, 25000000, 10000000, 8000000, 7000000, 2800000,
  '["Facebook","Tiktok","Youtube","Line"]'::jsonb, 10980392,
  32, 53, 900, 110000000,
  856471, 2275000, 663, 80888,
  true, 72800000, 29, 42, 750, 92000000, 10980392,
  1025085, 2510325, 663,
  '["https://images.unsplash.com/photo-1523580494863-6f3031224c94?w=600&auto=format&fit=crop","https://images.unsplash.com/photo-1519741497674-611481863552?w=600&auto=format&fit=crop","https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=600&auto=format&fit=crop","https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=600&auto=format&fit=crop"]'::jsonb,
  'https://drive.google.com'
) ON CONFLICT DO NOTHING;

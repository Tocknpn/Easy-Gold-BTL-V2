-- ═══════════════════════════════════════════════════════════════════════════
-- Easy Gold BTL — Event Management Migration
-- Run this once in the Supabase SQL Editor.
-- Safe to re-run: all statements use IF NOT EXISTS / OR REPLACE.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. events — master BTL event record ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.events (
  id                            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at                    timestamptz DEFAULT now(),
  updated_at                    timestamptz DEFAULT now(),
  year                          int NOT NULL,
  quarter                       text NOT NULL CHECK (quarter IN (''Q1'',''Q2'',''Q3'',''Q4'')),
  team                          text NOT NULL,
  event_name                    text NOT NULL,
  start_date                    date NOT NULL,
  end_date                      date NOT NULL,
  activity_type                 text NOT NULL DEFAULT ''Event (indoor)'',
  objective                     text NOT NULL DEFAULT ''Acquisition/Awareness'',
  scale                         text,
  description                   text,
  target_nc                     int NOT NULL DEFAULT 0,
  target_ec                     int NOT NULL DEFAULT 0,
  target_buy_value              numeric NOT NULL DEFAULT 0,
  media_cost                    numeric NOT NULL DEFAULT 0,
  media_channels                text,
  total_media_impressions       numeric NOT NULL DEFAULT 0,
  proposal_link                 text,
  photo_gallery_link            text,
  end_of_activation_report_link text,
  regional_approved             boolean NOT NULL DEFAULT false,
  approval_date                 date,
  remarks                       text,
  merch_required                boolean NOT NULL DEFAULT false,
  merch_details                 text,
  featured_cities               text,
  target_audience               text,
  status                        text NOT NULL DEFAULT ''active''
    CHECK (status IN (''active'',''completed'',''cancelled''))
);

-- ── 2. Link submissions rows to an event ────────────────────────────────────
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;

-- ── 3. event_targets — per-quarter / per-team / per-type KPI targets ────────
CREATE TABLE IF NOT EXISTS public.event_targets (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  year             int NOT NULL,
  quarter          text NOT NULL CHECK (quarter IN (''Q1'',''Q2'',''Q3'',''Q4'')),
  team             text NOT NULL,
  activity_type    text NOT NULL,
  cpf_target       numeric NOT NULL DEFAULT 0,
  cpa_target       numeric NOT NULL DEFAULT 0,
  cpo_target       numeric NOT NULL DEFAULT 0,
  cpm_target       numeric NOT NULL DEFAULT 0,
  nc_target        int NOT NULL DEFAULT 0,
  ec_target        int NOT NULL DEFAULT 0,
  buy_value_target numeric NOT NULL DEFAULT 0,
  UNIQUE (year, quarter, team, activity_type)
);

-- ── 4. updated_at trigger ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_events_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_events_updated_at ON public.events;
CREATE TRIGGER trg_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.set_events_updated_at();

-- ── 5. Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_events_team_year     ON public.events(team, year, quarter);
CREATE INDEX IF NOT EXISTS idx_events_status        ON public.events(status);
CREATE INDEX IF NOT EXISTS idx_submissions_event_id ON public.submissions(event_id);

-- ── 6. Seed Q3 2026 targets from Google Sheet Setup tab ─────────────────────
INSERT INTO public.event_targets (year,quarter,team,activity_type,cpf_target,cpa_target,cpo_target,cpm_target,nc_target,ec_target,buy_value_target) VALUES
  (2026,''Q3'',''Agency'',''H2H Booth'',        7500,150000,94000,500,30,50,50000000),
  (2026,''Q3'',''Agency'',''Event (indoor)'',    7500,150000,94000,500,30,50,50000000),
  (2026,''Q3'',''Agency'',''Event (outdoor)'',   7500,150000,94000,500,30,50,50000000),
  (2026,''Q3'',''Agency'',''Sponsorship'',       7500,150000,94000,500,30,50,50000000),
  (2026,''Q3'',''Agency'',''Wealth Talk'',       7500,150000,94000,500,30,50,50000000),
  (2026,''Q3'',''Agency'',''On Shop'',           7500,150000,94000,500,30,50,50000000),
  (2026,''Q3'',''KPV'',   ''H2H Booth'',         2000, 38000, 26000,300,15,30,15000000),
  (2026,''Q3'',''KPV'',   ''Event (indoor)'',    2000, 38000, 26000,300,15,30,15000000),
  (2026,''Q3'',''KPV'',   ''Event (outdoor)'',   2000, 38000, 26000,300,15,30,15000000),
  (2026,''Q3'',''KPV'',   ''Sponsorship'',       2000, 38000, 26000,300,15,30,15000000),
  (2026,''Q3'',''KPV'',   ''Wealth Talk'',       2000, 38000, 26000,300,15,30,15000000),
  (2026,''Q3'',''KPV'',   ''On Shop'',           2000, 38000, 26000,300,15,30,15000000)
ON CONFLICT (year,quarter,team,activity_type) DO NOTHING;

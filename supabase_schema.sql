-- Supabase SQL Schema for Easy Gold BTL Tracker
-- Execute this in the Supabase SQL Editor

-- 1. users table
CREATE TABLE users (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  username text UNIQUE NOT NULL,
  password text NOT NULL, -- User requested to keep password here
  name text NOT NULL,
  role text CHECK (role IN ('admin', 'manager', 'team_member')) NOT NULL,
  team text NOT NULL,
  token text,
  is_active boolean DEFAULT true
);

-- 2. submissions table
CREATE TABLE submissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  timestamp timestamptz DEFAULT now(),
  date date NOT NULL,
  team text NOT NULL,
  branch text NOT NULL,
  new_register int DEFAULT 0,
  new_reg_purchased int DEFAULT 0,
  buy_value_new numeric DEFAULT 0,
  existing_users int DEFAULT 0,
  buy_value_existing numeric DEFAULT 0,
  footfall int DEFAULT 0,
  step_in int DEFAULT 0,
  team_cost numeric DEFAULT 0,
  merch_cost numeric DEFAULT 0,
  merch_items jsonb DEFAULT '[]'::jsonb,
  lat numeric,
  lng numeric,
  status text DEFAULT 'active',
  staff_in_charge jsonb DEFAULT '[]'::jsonb
);

-- 3. checkins table
CREATE TABLE checkins (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  timestamp timestamptz DEFAULT now(),
  date date NOT NULL,
  team text NOT NULL,
  lat numeric NOT NULL,
  lng numeric NOT NULL,
  note text
);

-- 4. targets table
CREATE TABLE targets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  month date NOT NULL,
  team text NOT NULL,
  new_reg_target int DEFAULT 0,
  buy_value_target numeric DEFAULT 0,
  footfall_target int DEFAULT 0,
  cost_budget numeric DEFAULT 0,
  cpo_target numeric DEFAULT 0,
  cpa_target numeric DEFAULT 0,
  cpao_target numeric DEFAULT 0
);

-- 5. route_plan table
CREATE TABLE route_plan (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date date NOT NULL,
  team text NOT NULL,
  location_name text NOT NULL,
  lat numeric,
  lng numeric
);

-- 6. merch table
CREATE TABLE merch (
  itemName text PRIMARY KEY,
  cpu numeric DEFAULT 0
);

-- 7. staff table
CREATE TABLE staff (
  id text PRIMARY KEY,
  name text NOT NULL,
  team text NOT NULL
);

-- 8. audit_log table
CREATE TABLE audit_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  timestamp timestamptz DEFAULT now(),
  action text NOT NULL,
  user_name text NOT NULL,
  team text NOT NULL,
  payload jsonb,
  status text
);

-- Initial Data
INSERT INTO users (username, password, name, role, team, is_active) VALUES
('admin@easygold.la', 'admin123', 'Admin', 'admin', 'Admin Team', true),
('manager@easygold.la', 'manager123', 'Souphaxay K.', 'manager', 'Manager Team', true);

-- Migration for databases created before is_active was added (safe to re-run):
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Note: the web app writes to audit_log (Upload & Settings → Audit Log) for
-- user / staff / target / route / merch actions. The anon key needs INSERT +
-- SELECT on audit_log, and full CRUD on users, staff, merch, targets,
-- route_plan to manage the system from the UI.

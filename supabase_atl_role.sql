-- ============================================================================
-- Easy Gold BTL Tracker — Migration: Support ATL Role in Users Table
-- ============================================================================
-- Run this in your Supabase SQL Editor:
-- 1. Updates users_role_check constraint to include 'atl'
-- 2. Inserts or updates the default ATL account (atl@easygold.la)
-- ============================================================================

-- 1. Drop existing role constraint if present and recreate with 'atl'
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'manager', 'atl', 'team_member'));

-- 2. Insert or update default ATL user account
INSERT INTO users (username, password, name, role, team, is_active)
VALUES ('atl@easygold.la', 'atl1234', 'ATL Area Lead', 'atl', 'ATL', true)
ON CONFLICT (username) DO UPDATE
SET role = 'atl', is_active = true;

-- Verification query:
SELECT id, username, name, role, team, is_active
FROM users
WHERE role = 'atl' OR username = 'atl@easygold.la';

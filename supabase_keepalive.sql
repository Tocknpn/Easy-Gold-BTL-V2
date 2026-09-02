-- ============================================================================
-- Easy Gold BTL — Supabase Keepalive (prevents free-tier project pause)
-- ============================================================================
-- Free-tier Supabase projects are paused after 7 days with no API activity.
-- These statements create a tiny `heartbeats` table that keep-alive jobs
-- (GitHub Actions + the app itself) write ONE row into every ~3 days.
--
-- Run this ONCE:
--   Supabase Dashboard → SQL Editor → New query → paste me → Run
--
-- Optional second line of defence (fully inside Supabase, no GitHub needed):
--   → supabase_keepalive_pgcron.sql
-- ============================================================================

-- 1) Heartbeat table ----------------------------------------------------------
create table if not exists public.heartbeats (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source     text not null default 'unknown',   -- github-actions | pg_cron | app-launch
  note       text
);

-- Make "latest heartbeat" queries fast.
create index if not exists heartbeats_created_at_idx
  on public.heartbeats (created_at desc);

-- 2) Row-level security -------------------------------------------------------
-- Safe to leave RLS OFF here: a heartbeat row is ~60 bytes of public metadata,
-- and disabling RLS guarantees inserts from the anon/public key always succeed.
alter table public.heartbeats disable row level security;

-- (When you want to turn RLS on later, run this instead of the line above:)
-- alter table public.heartbeats enable row level security;
-- create policy "anon can insert heartbeats"
--   on public.heartbeats for insert to anon, authenticated
--   with check (true);
-- create policy "anyone can read heartbeats"
--   on public.heartbeats for select to anon, authenticated
--   using (true);

-- 3) How to verify ------------------------------------------------------------
--   select created_at, source, note
--   from heartbeats
--   order by created_at desc
--   limit 10;
-- You should see a new row roughly every 3 days.
-- ============================================================================
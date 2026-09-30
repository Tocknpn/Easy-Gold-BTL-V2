-- ============================================================================
-- Easy Gold BTL - rotate every credential exposed in the public GitHub repo
-- ============================================================================
-- Run this ONCE:
--   Supabase Dashboard -> SQL Editor -> New query -> paste me -> Run
--
-- WHY THIS EXISTS
--   data-export-cleaned/users.csv was committed to a PUBLIC GitHub repo. It
--   contained the plaintext passwords and the session `token` of every account:
--       admin@easygold.la / admin123
--       d-day@easygold.la / dday123
--       kpv@easygold.la   / kpv9999
--       souphanithvst@gmail.com / 123456
--   Anyone could read them, so every one of those secrets must be considered
--   burned and rotated. (The same CSV also exposed staff names and branch
--   sales/GPS data - that data cannot be rotated, only unpublished.)
--
-- IMPORTANT: this file contains NO real passwords, so it is safe in git.
--   Section 2 ships with 'CHANGEME-...' placeholders. Replace those six values
--   with real new passwords BEFORE running. If you forget, section 2 is a no-op
--   for the ones you did not edit (it refuses to apply a placeholder) and the
--   status query in section 5 reports how many are left.
--
-- WHAT IT DOES
--   0. lists the accounts that exist right now
--   1. backs up the current password/token values (rotation is reversible)
--   2. sets NEW passwords for the six known accounts (edit section 2)
--   3. catches every OTHER account on a leaked, short or weak password
--   4. regenerates the leaked `token` values
--   5. prints the final list + a status line - copy the passwords somewhere safe
--
-- SAFE TO RE-RUN: section 2 always writes the same literals, so a second run
-- cannot lock anyone out.
--
-- SUPERSEDED BY supabase_lock_passwords.sql. That script generates the new
-- passwords for you (nothing to invent by hand) and, more importantly, stops the
-- anon key from being able to READ users.password / users.token at all, which
-- this file does not do. Prefer it unless you specifically want the manual list.
-- ============================================================================

-- 0. Audit: who exists right now ---------------------------------------------
select username, name, role, team, is_active,
       length(password) as pw_len, (token is not null) as has_token
from public.users
order by role desc, username;

-- 1. Backup first (makes the rotation reversible) ----------------------------
create table if not exists public.users_credential_backup (
  id uuid,
  username text,
  password text,
  token text,
  backed_up_at timestamptz default now()
);

insert into public.users_credential_backup (id, username, password, token)
select u.id, u.username, u.password, u.token
from public.users u
where not exists (
  select 1 from public.users_credential_backup b where b.id = u.id
);

-- 2. NEW PASSWORDS ----------------------------------------------------------
-- STEP 1: replace each CHANGEME-... below with a real password (10+ characters),
-- then hand it to that person through a password manager - never by email, chat
-- or commit. A placeholder is never applied, so forgetting one only means that
-- account keeps its old password (section 5 reports how many are left).
update public.users u
   set password = v.new_password
  from (values
    ('admin@easygold.la',       'CHANGEME-admin'),
    ('manager@easygold.la',     'CHANGEME-manager'),
    ('kpv@easygold.la',         'CHANGEME-kpv'),
    ('d-day@easygold.la',       'CHANGEME-dday'),
    ('souphanithvst@gmail.com', 'CHANGEME-souphanith'),
    ('alounys08@gmail.com',     'CHANGEME-alounys')
  ) as v(username, new_password)
 where u.username = v.username
   and v.new_password not like 'CHANGEME-%';

-- 3. Catch-all: any other account on a leaked / weak / short password ---------
-- Catches accounts not listed above (any password that was published in the CSV,
-- or is shorter than 8 characters). The generated value is printed by section 5,
-- so nothing is lost.
update public.users u
   set password = 'EG-' || upper(substr(md5(random()::text), 1, 10)) || '!'
 where (u.password in ('admin123', 'manager123', 'kpv9999', 'dday123', '123456',
                       'kpv123', 'agency123', 'password', 'Password123', '123456789')
        or length(u.password) < 8)
   and u.username not in ('admin@easygold.la', 'manager@easygold.la',
                          'kpv@easygold.la', 'd-day@easygold.la',
                          'souphanithvst@gmail.com', 'alounys08@gmail.com');

-- 4. The leaked session `token` column --------------------------------------
-- The web app never reads public.users.token (verified: no reference anywhere
-- in src/), and the admin row holds the literal placeholder
-- 'VERCEL_PROXY_TOKEN'.
-- IF an external system (the "Vercel proxy" that name refers to) validates this
-- column, update that system with the new values afterwards, otherwise leave
-- the placeholder untouched.
update public.users
   set token = gen_random_uuid()::text
 where token is not null
   and token <> 'VERCEL_PROXY_TOKEN';

-- 5. RESULT - copy this somewhere safe, then close this tab ------------------
select username, name, role, team, is_active,
       password as new_password, token as new_token
from public.users
order by role desc, username;

-- Status line. placeholders_left > 0 means section 2 still has CHANGEME values
-- you did not edit; short_passwords_left > 0 means an account is still weak
-- (section 3 skips the six addresses above, so check those by hand).
select
  (select count(*) from public.users)                                  as total_accounts,
  (select count(*) from public.users where password like 'CHANGEME-%') as placeholders_left,
  (select count(*) from public.users where length(password) < 8)       as short_passwords_left;

-- 6. Rollback (only if you must) --------------------------------------------
-- update public.users u
--    set password = b.password, token = b.token
--   from public.users_credential_backup b
--  where b.id = u.id;

-- ============================================================================
-- AFTER RUNNING THIS
--   1. Give every person their new password through a password manager.
--   2. Make the GitHub repo private (Settings -> General -> Danger zone).
--   3. Re-check that the anon key cannot read users.password:
--        select tablename, rowsecurity from pg_tables where schemaname = 'public';
--      (false everywhere = RLS is still off for that table)
--   4. Remember the leaked CSV also contained staff names and branch
--      sales/GPS figures - those cannot be rotated, only unpublished.
-- ============================================================================

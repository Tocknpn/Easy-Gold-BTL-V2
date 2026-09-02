# Keeping your Supabase project alive (free plan)

## The problem

Supabase's free tier pauses a project after **7 days of no API activity**.
"Activity" means requests to its API services (REST, Auth, Storage, Realtime,
Edge Functions). Opening the app once a week is borderline — if the gap ever
stretches past 7 days, the project gets paused and all data stops flowing.

## The fix — write one heartbeat row every ~3 days

This repo now has a keep-alive system with **three layers**:

| # | Layer | What it does | Where it runs | Default |
|---|-------|--------------|---------------|---------|
| 1 | **GitHub Actions** | Inserts one row into `heartbeats` every 3 days via the REST API | GitHub (free) | ✅ on |
| 2 | **App heartbeat** | Opens the app in a browser → inserts one heartbeat row | Browser | ✅ on |
| 3 | **pg_cron (optional)** | Supabase pings its own REST API every 3 days, no GitHub needed | Inside Supabase | ⬜ opt-in |

Any single one of these is enough. Layer 1 + 2 are enabled by default.
Layer 3 is a fallback for the rare case that the GitHub repo goes quiet for
60+ days (GitHub disables scheduled workflows after 60 days of repo inactivity).

> Note: the "row" doesn't need to be real business data. A write to the tiny
> `heartbeats` table is enough — the important thing is that the request runs
> through Supabase's API, which is what resets the 7-day inactivity clock.

---

## Setup

### Step 1 — Create the heartbeat table (once, ~1 minute)

1. Supabase Dashboard → **SQL Editor** → **New query**.
2. Paste the whole `supabase_keepalive.sql` → **Run**.
3. This creates the `heartbeats` table. Every 3 days a new row will appear.

### Step 2 — Connect GitHub Actions (once, ~2 minutes)

1. Supabase Dashboard → **Project Settings → API**.
2. Copy the **Project URL** (e.g. `https://abc123.supabase.co`) and the **anon / public** key.
3. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:
   - `SUPABASE_URL` = Project URL
   - `SUPABASE_ANON_KEY` = anon key
   - (Safe: the anon key is already visible in your public frontend bundle and is
     restricted by RLS — it is *not* the `service_role` key.)
4. Commit and push this repo. The workflow lives at
   `.github/workflows/keepalive.yml` and runs every 3 days at 00:00 UTC.

**Test it immediately:** GitHub → **Actions → "Supabase Keepalive" → Run workflow**
(manual trigger, no code changes needed). It should turn green and add one row.

---

## Verify it works

Supabase Dashboard → **SQL Editor**:

```sql
select created_at, source, note
from heartbeats
order by created_at desc
limit 10;
```

You should see rows spaced by ~3 days, with `source` = `github-actions`.

---

## Optional — Layer 3: pg_cron fallback (self-hosted, no GitHub)

See `supabase_keepalive_pgcron.sql`. After replacing the two placeholders
(project URL + anon key) and running it, Supabase will keep itself alive every
3 days **even if the GitHub repo is completely untouched**. Watch it with:

```sql
select * from cron.job_run_details order by start_time desc limit 10;
```

Stop it anytime:

```sql
select cron.unschedule('keepalive-heartbeat');
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Workflow run is red | Secrets not set, or have trailing spaces. Re-add them in Settings → Secrets, then re-run. |
| HTTP 401 / 403 from the workflow | `heartbeats` table SQL wasn't run yet, or RLS is enabled without the anon insert policy. |
| Row still older than 7 days | All layers missed. Check Actions run history first; if the repo has been quiet 60+ days, GitHub stopped the schedule — enable Layer 3 (pg_cron) so Supabase protects itself. |
| Project already paused | Restore from the Supabase dashboard (pause banner → restore), then finish the setup so the *next* 7-day window never starts. |
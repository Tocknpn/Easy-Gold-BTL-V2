# Easy Gold BTL — Event Field-Management Web App

A single-page web app for managing **below-the-line (BTL) sales activities** at
Easy Gold outlets across Vientiane, Laos: monthly route planning, staff GPS
check-ins, daily result submission, cost management, and staff/KPI reports.

Built with **React 19 + TypeScript + Vite**, backed by **Supabase (PostgreSQL)**
when connected, with a full **demo data mode** that works offline via `localStorage`.

## Roles
- **Admin** — full access to every menu (Dashboard, History, Reports, Route Map,
  Cost Manager, Plan Setting, Settings).
- **Staff — KPV / Agency** — field workflow only: Calendar & Route → Check‑In →
  Submit Results (KPV also records Staff‑In‑Charge).

## Demo logins
Shown on the login screen only when the build has **no** Supabase credentials
(offline / demo mode). These are deliberately throwaway values — real logins are
checked against the `users` table in Supabase, and real credentials must never be
hard-coded here (this file is public).

| Role | Email | Password |
|---|---|---|
| Admin | `demo-admin@example.com` | `demo-admin-8f3a` |
| KPV Staff | `demo-kpv@example.com` | `demo-kpv-2c17` |
| Agency Staff | `demo-agency@example.com` | `demo-agency-5b9d` |

## Local development
```bash
npm install
npm run dev        # start dev server
npm run build      # production build → dist/
npm run lint       # oxlint
npm run preview    # serve the production build
```

Environment variables (optional, to connect Supabase): copy `.env.example` → `.env`
and set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.

## Deploying to production
See **[DEPLOYMENT.md](DEPLOYMENT.md)** for the full walkthrough: GitHub →
Supabase (schema + Excel data import) → Cloudflare Pages.

## Keeping Supabase alive (free plan)
The free tier pauses a project after 7 days without API activity. To prevent
that, this repo writes a heartbeat row every ~3 days — see
**[KEEPALIVE.md](KEEPALIVE.md)** for the 5-minute setup (GitHub Actions +
`heartbeats` table + optional pg_cron fallback).
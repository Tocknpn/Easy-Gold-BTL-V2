# Easy Gold BTL — Go-Live Walkthrough (GitHub → Cloudflare Pages + Supabase)

This app is **browser-first** (works fully with demo data on `localStorage`) but is
designed to persist real data in **Supabase (PostgreSQL)** and be served by
**Cloudflare Pages**.

> Everything currently works because of graceful fallback: when Supabase is not
> connected, every menu uses demo/localStorage data. Once you connect a real
> project, real rows load and demo/localStorage rows still merge in.

---

## PART 0 — What the project is made of

| Piece | Where / file |
|---|---|
| Frontend | React 19 + Vite + TypeScript (`src/`) |
| Styling | `src/index.css` (CSS variables) |
| Router | `react-router-dom` **BrowserRouter** |
| DB client | `@supabase/supabase-js` — created in `src/lib/supabase.ts` |
| DB schema | `supabase_schema.sql` (run once in Supabase SQL Editor) |
| KPI logic | CPO/CPA/CPAO computed from `team_cost + merch_cost` |

### Environment variables (used at build time)
Read in `src/lib/supabase.ts`:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Copy `.env.example` → `.env` locally and fill them in. **Never** commit `.env`
(already gitignored).

---

## PART 1 — Push the code to GitHub

### 1. Create the repository (Private!)
1. Go to https://github.com/new
2. Name it e.g. `easygold-btl`, keep it **Private** (business data) → **Create repository**.
3. Do **not** tick "Add a README" (you already have one) — avoids a merge conflict.

### 2. Init git, connect, push
Open a terminal in `c:\Users\advice\Easy Gold BTL project V2`:

```powershell
git init -b main
git add -A
git commit -m "Easy Gold BTL web app - initial commit"
git remote add origin https://github.com/<your-user>/easygold-btl.git
git branch -M main
git push -u origin main
```

> VS Code's Source Control panel can do the same steps. Keep the repo **Private**
> to protect staff/personnel data.

### 3. Secrets check
The following are **excluded** by `.gitignore` and must NOT be in GitHub:
`.env`, `*.xlsx`, `*.pdf`, `demo.html`, `node_modules/`, `dist/`. The source
spreadsheet + staff PDFs stay on your machine only.

---

## PART 2 — Set up Supabase (the database)

### 1. Create the project
1. https://supabase.com → **New project**.
2. Region near Laos (Singapore `ap-southeast-1`), strong DB password.
3. Copy **Project URL** and the **anon / public** key from
   **Project Settings → API**.

### 2. Create the schema (once)
1. Supabase → **SQL Editor** → **New query**.
2. Paste the whole `supabase_schema.sql` → **Run**.
3. This creates: `users`, `audit_log`, `submissions`, `staff`, `merch`,
   `checkins`, `targets`, `route_plan`.

### 3. Local env
```
VITE_SUPABASE_URL=https://YOURPROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR ANON KEY
```
---

## PART 3 — What data to save into Supabase (from your Excel)

Your `EasyGold BTL.xlsx` has **9 sheets** that map 1-to-1 to the schema.
Import the **8 data sheets** (skip the 9th, "Staff Report Template" — that is a report layout, not data).

### Column mapping summary

| Excel sheet | Supabase table | Notes |
|---|---|---|
| `users` | **users** | username, password, name, role, team, token |
| `staff` | **staff** | id, name, team — HR roster for dropdowns / Staff Report |
| `merch` | **merch** | itemName (PK), cpu |
| `targets` | **targets** | month, team, per-target KPIs |
| `route_plan` | **route_plan** | date, team, location_name, lat, lng |
| `checkin` | **checkins** | date, team, lat, lng, note |
| `submissions` | **submissions** | the large activity table |
| `audit_log` | **audit_log** | optional history |

### How to import
1. Export each data sheet from Excel to CSV (File → Export → Change File Type → CSV).
2. In Supabase open the table → **Insert → Import data from CSV** (or run SQL `INSERT`s).
3. Leave `id` / `timestamp` blank and let Supabase generate them.

### Two normalizations to do in Excel before importing
1. **Team values** — Excel stores `"KPV Team"` / `"Agency Team"`; the app expects
   `"KPV"` / `"Agency"`. Find-replace everywhere there is a `team` column.
2. **`merch_items` shape** — Excel rows store JSON `{"itemName","qty","qtyNr","qtyEu"}`;
   the app reads `{"name","qty","cpu"}`. Recommended: transform each object to
   `{ "name": <itemName>, "qty": <qty>, "cpu": <cpu from merch> }` before import.
   Otherwise the modal still shows totals via `merch_cost`, but row-level item
   detail may be incomplete.

### Seed demo users so login works with real data
```sql
INSERT INTO users (username, password, name, role, team) VALUES
('admin@easygold.la', 'admin123', 'Admin', 'admin', 'Admin Team'),
('manager@easygold.la', 'manager123', 'Manager', 'manager', 'Manager Team');
```

### RLS (row-level security) note
The anon key only reads/writes what RLS allows. The app *inserts* `submissions`
and `checkins` and *updates* `submissions` (Cost Manager). Either leave RLS off
for now, or add policies for your auth user, otherwise you'll see "DB write failed".

---

## PART 4 — Connect Cloudflare Pages

Easiest: **git integration** so every `git push` auto-deploys.

1. Free Cloudflare account: https://dash.cloudflare.com
2. **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
3. Grant access to the `easygold-btl` repo.
4. Framework preset **Vite**:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
5. **Environment variables** (empty = sample data forever, so add both):
   - `VITE_SUPABASE_URL=...`
   - `VITE_SUPABASE_ANON_KEY=...`
6. **Save and Deploy.** You'll get a URL like `https://easygold-btl.pages.dev`.

### Verify
- Login works; Dashboard pulls from Supabase.
- Refresh at `/report`, `/calendar` — must **not** 404 (the `public/_redirects`
  SPA fallback handles routing).
- Optional: attach your own domain in **Pages → Custom domains**.

---

## PART 5 — Day-to-day workflow

```bash
npm run build          # must succeed
git add -A
git commit -m "describe change"
git push               # Cloudflare auto-deploys
```

---

## FAQ / Gotchas
- **404 on refresh** → ensure `public/_redirects` exists and re-deployed.
- **"Showing sample data" forever** → missing `VITE_SUPABASE_URL`/key at build time;
  set them in the Pages dashboard, then **re-deploy**.
- **Login falls back to demo** → `users` table empty; seed it (see Part 3).
- **`team_cost` writes fail** → RLS blocks UPDATE on `submissions`.
- **Big Vite chunk warning** is cosmetic only (pre-existing).
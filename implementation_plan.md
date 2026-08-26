# Implementation Plan

## Overview

Fix the **Calendar & Route** page (`/calendar`) in the React app so it replicates the target demo (`demo.html`) and reference screenshots: a styled month grid with colored, icon-branded Plan / Check-In / Submitted tickets, a full dense month of March 2025 sample data, the info banner, the "today" (day 26) highlight, and matching header/legend styling — eliminating the current "flat" appearance caused by missing CSS and sparse data.

**Root causes identified:**
1. `.cal-ticket` / `.cal-cell` CSS classes exist **only in `demo.html`**, not in `src/index.css` → tickets render as plain unstyled text (flat look).
2. `CalendarRoute.tsx` has **no info banner** (every other page has one).
3. **Sparse mock data** — only days 24–28 have data vs. the demo's days 3,4,10,11,17,18,24,25,31.
4. **Ticket content differs** — `P: / C: / S:` text prefixes instead of FontAwesome icons + "Checked in"/"Submitted" labels.
5. **"Today" highlight uses the real current date** — when viewing March 2025 nothing highlights; target shows day 26 outlined.
6. Cell styling is inline (no `.cal-cell` class), missing pointer cursor/hover and matching min-height/padding.

## Types

No public/domain types change. In `src/pages/CalendarRoute.tsx`, add explicit interfaces for the two currently-untyped mock arrays so TS stays clean:

```ts
interface CheckIn {
  date: string;    // YYYY-MM-DD
  team: string;
  branch: string;
  time: string;
}

interface RoutePlan {
  date: string;    // YYYY-MM-DD
  team: string;
  location_name: string;
}
```

Existing `Submission` and `ModalState` interfaces are unchanged.

## Files

**1. `src/index.css` — ADD calendar CSS block** (insert directly after the existing `.demo-banner` rule, ~line 150):

```css
/* Calendar */
.cal-cell { background: var(--surface); min-height: 90px; padding: 8px; cursor: pointer; transition: background 0.15s; }
.cal-cell:hover { background: var(--nav-hover); }
.cal-cell.today { outline: 2px solid var(--blue); }
.cal-cell.cal-empty { background: rgba(0,0,0,0.2); cursor: default; }
.cal-ticket { font-size: 10px; font-weight: 700; padding: 3px 7px; border-radius: 5px; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cal-ticket.plan { background: rgba(77,158,255,0.12); color: var(--blue); border: 1px solid rgba(77,158,255,0.25); }
.cal-ticket.actual { background: rgba(46,194,122,0.12); color: var(--green); border: 1px solid rgba(46,194,122,0.25); }
.cal-ticket.sub { background: rgba(212,168,67,0.12); color: var(--gold); border: 1px solid rgba(212,168,67,0.25); cursor: pointer; }
```

**2. `src/pages/CalendarRoute.tsx` — MODIFY** with the changes detailed under Functions below.

**3. No files deleted or moved.** This document is saved at the workspace root as `implementation_plan.md`.

## Functions

In **`src/pages/CalendarRoute.tsx`**:

**Modified — `CalendarRoute()` component render/grid logic:**

1. **Add demo banner** as the first child of the returned `<div>`:
   ```tsx
   <div className="demo-banner"><i className="fa-solid fa-circle-info"></i> Calendar shows planned routes (blue) and actual check-ins (green) for March 2025.</div>
   ```

2. **"Today" highlight** — replace `const today = new Date();` with a demo reference date so day 26 is outlined when viewing March 2025 (matches the screenshot):
   ```ts
   const highlightDate = '2025-03-26';
   ```
   and in the cell map: `const isToday = isValid && dateStr === highlightDate;`

3. **Grid cell markup** (cell render block rewritten):
   - Valid day cell: `className={'cal-cell' + (isToday ? ' today' : '')}` — remove inline `background/minHeight/padding/opacity/outline` (now handled by CSS).
   - Day number (matches demo): `fontSize: 12`, `fontWeight: 700`, color `var(--blue)` when today else `var(--txt-sub)`, `marginBottom: 4`.
   - Invalid/blank cell: `className="cal-cell cal-empty"` with no inner content (replaces the `opacity: 0.3` trick).
   - **Plan ticket:** `<div className="cal-ticket plan"><i className="fa-solid fa-route" style={{ fontSize: 8 }}></i> {r.location_name}</div>` (drop `P:` prefix, drop inline `marginBottom`).
   - **Check-in ticket:** `<div className="cal-ticket actual"><i className="fa-solid fa-location-dot" style={{ fontSize: 8 }}></i> Checked in</div>` (drop `C: branch (time)` text).
   - **Submission ticket:** keep `className="cal-ticket sub"`, `onClick={() => openModal(s)}` and `title` (existing modal feature preserved), body becomes `<i className="fa-solid fa-file-circle-check" style={{ fontSize: 8 }}></i> Submitted`.

4. **Header alignment with demo:** outer header `marginBottom: '14px'` (was 20px); month title `minWidth: '140px'` (was 180px). Legend unchanged.

**Modified — mock data constants** (top of file, expanded to match the demo month exactly):

- `mockRoutePlan` (9 entries): days **3** That Luang (KPV), **4** NUOL Campus (Agency), **10** Talat Sao (KPV), **11** Sikhottabong (KPV), **17** Wattay Airport (Agency), **18** Parkson Mall (KPV), **24** Patuxay (KPV), **25** Evening Market (Agency), **31** That Luang (KPV).
- `mockCheckins` (8 entries): one per route day **3, 4, 10, 11, 17, 18, 24, 25** with matching `branch` and plausible `time`.
- `mockSubmissions` (8 entries, ids `'1'`–`'8'`): one per check-in day **3, 4, 10, 11, 17, 18, 24, 25** with matching `team`/`branch` and realistic figures so the submission modal still has meaningful data on every Submitted ticket.

**Type annotations:** `mockCheckins` → `CheckIn[]`, `mockRoutePlan` → `RoutePlan[]`.

**Unchanged:** `prevMonth`, `nextMonth`, `openModal`, `closeModal`, `handleDelete`, `handleSave`, `fmtLAK`, the month grid math, day headers, and the edit/view modal.
**Removed:** the unused `today` variable; the `P: / C: / S:` prefixes.

## Classes

**New CSS classes** (in `src/index.css`): `.cal-cell`, `.cal-cell:hover`, `.cal-cell.today`, `.cal-cell.cal-empty`, `.cal-ticket`, `.cal-ticket.plan`, `.cal-ticket.actual`, `.cal-ticket.sub` — copied 1:1 from `demo.html`, plus `cal-empty` and a pointer cursor on `.cal-ticket.sub`.
**No React class/component changes** — `CalendarRoute` stays a default-exported function component; no new inheritance.

## Dependencies

**None.** FontAwesome 6.4.0 (supports `fa-route`, `fa-location-dot`, `fa-file-circle-check`, `fa-circle-info`) and all CSS variables are already loaded in `src/index.css`. No `package.json` changes.

## Testing

1. **Type check:** `npx tsc --noEmit -p tsconfig.app.json` — must pass.
2. **Build:** `npm run build` (`tsc -b && vite build`) — must succeed.
3. **Lint:** `npm run lint` (`oxlint`) — must pass.
4. **Manual verification** (`npm run dev`, log in, open `/calendar`): compare against `demo.html` and the target screenshot:
   - Banner present with the "planned routes (blue) / check-ins (green)" text.
   - Default view = **March 2025**, day 26 outlined blue ("today").
   - Blue plan tickets (icon + location) on 3, 4, 10, 11, 17, 18, 24, 25, 31.
   - Green "Checked in" tickets on 3, 4, 10, 11, 17, 18, 24, 25.
   - Gold "Submitted" tickets on 3, 4, 10, 11, 17, 18, 24, 25 — clicking opens the existing submission modal (view/edit/delete still work).
   - Cells have hover + pointer cursor; blank cells are the muted `cal-empty` style; Prev/Next navigation and legend unchanged; tickets are ellipsized colored pills (no "flat" text).

## Implementation Order

1. Add the calendar CSS block to `src/index.css`.
2. In `src/pages/CalendarRoute.tsx`: replace the three mock-data arrays with the expanded demo-aligned data (add `CheckIn`/`RoutePlan` interfaces).
3. Replace the `today` logic with the `highlightDate = '2025-03-26'` reference.
4. Rewrite the grid cell render block: `cal-cell`/`cal-empty` classes + icon-based tickets + `onClick` on Submitted; then add the demo banner and align header paddings/min-widths.
5. Run `npx tsc --noEmit`, `npm run build`, and `npm run lint`.
6. Manual browser comparison against `demo.html` and screenshots to confirm visual parity.
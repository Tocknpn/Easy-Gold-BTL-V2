import { supabase } from './supabase';

// ── Types ────────────────────────────────────────────────────────────────
export interface MerchItem {
  name: string;
  qty: number;
  cpu: number;
}

export interface Submission {
  id: string;
  date: string;
  team: string;
  branch: string;
  /** How the activity was run: 'booth' | 'event'. Legacy/unknown rows = 'booth'. */
  activity_type: string;
  new_register: number;
  new_reg_purchased: number;
  buy_value_new: number;
  existing_users: number;
  buy_value_existing: number;
  /** Service Cost — team operating cost for the day (filled in by Admin later). */
  team_cost: number;
  /** Merchandise cost — derived from merch_items × catalog cost per unit. */
  merch_cost: number;
  /** Sponsorship / Production Cost — third cost component (filled in by Admin in
   *  the Cost Manager). 0 = not recorded yet (every pre-existing row starts as 0). */
  sponsorship_cost: number;
  merch_items: MerchItem[];
  staff_in_charge: string[];
  footfall: number;
  step_in: number;
  status: string;
  /** true when this row came from the lightweight summary fetch (no merch/staff
   *  JSON). Hydrate with fetchSubmissionById() before offering Edit — saving a
   *  light row as-is would overwrite merch_items / staff_in_charge with empty. */
  light?: boolean;
}

export interface ModalState {
  open: boolean;
  submission: Submission | null;
  isEditing: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────
export const fmtLAK = (n: number) => `₭${n.toLocaleString('en-US')}`;
export const fmtLAKShort = (n: number) => {
  if (n >= 1_000_000) return `₭${(n / 1_000_000).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
  if (n >= 1_000) return `₭${(n / 1_000).toLocaleString('en-US', { maximumFractionDigits: 0 })}K`;
  return `₭${n.toLocaleString('en-US')}`;
};

export const getCurrentDateHelpers = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const startOfMonth = `${y}-${m}-01`;
  const endOfMonth = `${y}-${m}-${new Date(y, d.getMonth() + 1, 0).getDate()}`;
  const currentMonthStr = `${y}-${m}`;
  const today = `${y}-${m}-${String(d.getDate()).padStart(2, '0')}`;
  return { startOfMonth, endOfMonth, currentMonthStr, today, y, monthIndex: d.getMonth() };
};


export const labelDate = (s: string) => {
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

// ── Locations (a submission's `branch`) ───────────────────────────────────
// The place a team visited is stored in submissions.branch — the forms label it
// "Branch / Location". Rows without a place are mapped to NO_LOCATION so they
// stay reachable from the Dashboard's Location filter instead of disappearing.
export const NO_LOCATION = '—';

/** Any stored/typed branch → a comparable, trimmed location value. */
export const normalizeLocation = (v?: string): string =>
  String(v ?? '').trim() || NO_LOCATION;

/** Human label for a location value ('—' → "(No location recorded)"). */
export const locationLabel = (v: string): string =>
  normalizeLocation(v) === NO_LOCATION ? '(No location recorded)' : String(v).trim();

/** Alphabetical, locale-aware, case-insensitive ordering (mixes EN + Lao names). */
export const compareLocations = (a: string, b: string): number =>
  locationLabel(a).localeCompare(locationLabel(b), undefined, { numeric: true, sensitivity: 'base' });

/** Location predicate used by the Dashboard: an EMPTY selection = "All Locations". */
export const inLocationFilter = (branch: string, selected: string[]): boolean =>
  selected.length === 0 || selected.includes(normalizeLocation(branch));

// ── Teams ────────────────────────────────────────────────────────────────
// `submissions.team` is written verbatim from the logged-in user's team, so
// rows exist as both 'KPV'/'Agency' and 'KPV Team'/'Agency Team' (the user
// admin screen offers all four). Normalise before grouping, otherwise the
// KPV/Agency splits and team doughnuts read ₭0 for the '… Team' rows.
export const normalizeTeam = (t?: string): string => {
  const s = String(t ?? '').trim();
  if (/KPV/i.test(s)) return 'KPV';
  if (/Agency/i.test(s)) return 'Agency';
  return s;
};

export const parseMerch = (v: any): MerchItem[] => {
  try {
    const a = typeof v === 'string' ? JSON.parse(v) : v;
    return Array.isArray(a) ? a.map((i: any) => ({ name: i.name || '', qty: Number(i.qty || 0), cpu: Number(i.cpu || 0) })) : [];
  } catch {
    return [];
  }
};
export const parseStaff = (v: any): string[] => {
  try {
    const a = typeof v === 'string' ? JSON.parse(v) : v;
    return Array.isArray(a) ? a.map(String) : [];
  } catch {
    return [];
  }
};

// ── Activity type: Booth / Event ─────────────────────────────────────────
// Stored lowercase in submissions.activity_type (default 'booth'). Anything
// missing or unexpected (legacy rows, old cached snapshots) is treated as Booth.
export const ACTIVITY_TYPES = ['booth', 'event'] as const;
export const DEFAULT_ACTIVITY_TYPE = 'booth';

/** Normalise any stored/typed value to 'booth' | 'event'. */
export const normalizeActivityType = (v: any): string => {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'event' ? 'event' : DEFAULT_ACTIVITY_TYPE;
};

/** Display label for a stored value: 'booth' → "Booth", 'event' → "Event". */
export const activityLabel = (v?: string): string =>
  normalizeActivityType(v) === 'event' ? 'Event' : 'Booth';

/** Detect PostgREST errors caused by the activity_type column not existing yet
 *  (same rule used for users.is_active in workflow.ts). */
export const isMissingColumnError = (err: any, column: string): boolean => {
  if (!err) return false;
  const msg = `${err.message || ''} ${err.hint || ''}`;
  return msg.includes(`'${column}'`) && (msg.includes('schema cache') || msg.includes('column'));
};

export const MISSING_ACTIVITY_COLUMN_HINT =
  "Your Supabase 'submissions' table doesn't have the 'activity_type' column yet, so the Activity Type was not saved. " +
  'Run this once in the Supabase SQL Editor (file: supabase_activity_type.sql): ' +
  "ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS activity_type text NOT NULL DEFAULT 'booth';";

export const MISSING_SPONSORSHIP_COLUMN_HINT =
  "Your Supabase 'submissions' table doesn't have the 'sponsorship_cost' column yet, so the Sponsorship / Production Cost was not saved. " +
  'Run this once in the Supabase SQL Editor (file: supabase_sponsorship_cost.sql): ' +
  'ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS sponsorship_cost numeric NOT NULL DEFAULT 0;';

// ── Cost components: Merch / Service / Sponsorship-Production ──────────────
// Total Cost = the sum of the cost components currently selected. The
// Dashboard's "Cost Type" multi-select decides which components are summed, and
// every CPA / CPO / CPAO / Total Spending figure is derived from that Total
// Cost. A component amount of 0 simply means "not recorded yet".
export const COST_TYPES = [
  { key: 'merch', label: 'Merch', shortLabel: 'Merch' },
  { key: 'service', label: 'Service Cost', shortLabel: 'Svc' },
  { key: 'sponsorship', label: 'Sponsorship / Production Cost', shortLabel: 'Spon' },
] as const;

export type CostTypeKey = 'merch' | 'service' | 'sponsorship';

export const ALL_COST_TYPES: CostTypeKey[] = COST_TYPES.map(c => c.key);

/** Amount one cost component contributes to a submission. */
export const costOfType = (
  s: Pick<Submission, 'team_cost' | 'merch_cost' | 'sponsorship_cost'>,
  key: CostTypeKey
): number => {
  switch (key) {
    case 'merch': return Number(s.merch_cost) || 0;
    case 'service': return Number(s.team_cost) || 0;
    case 'sponsorship': return Number(s.sponsorship_cost) || 0;
    default: return 0;
  }
};

/** Keep only known cost-type keys; an empty / invalid selection falls back to
 *  ALL types so cost metrics can never silently collapse to ₭0. */
export const normalizeCostTypes = (v: any): CostTypeKey[] => {
  const arr = Array.isArray(v) ? v.map(String) : [];
  const picked = ALL_COST_TYPES.filter(k => arr.includes(k));
  return picked.length > 0 ? picked : [...ALL_COST_TYPES];
};

/** Total Cost of one submission using every cost component (app-wide default). */
export const totalCostOf = (
  s: Pick<Submission, 'team_cost' | 'merch_cost' | 'sponsorship_cost'>
): number => ALL_COST_TYPES.reduce((a, key) => a + costOfType(s, key), 0);

/** Total Cost of one submission restricted to the selected cost types. */
export const costForTypes = (
  s: Pick<Submission, 'team_cost' | 'merch_cost' | 'sponsorship_cost'>,
  types: CostTypeKey[]
): number => normalizeCostTypes(types).reduce((a, key) => a + costOfType(s, key), 0);

// ── Mock data generator (March 2025 sample set) ──────────────────────────
const rand = (seed: number) => {
  const x = Math.sin(seed * 999 + 7) * 10000;
  return x - Math.floor(x);
};

const BRANCHES: { branch: string; team: string }[] = [
  { branch: 'That Luang', team: 'KPV' },
  { branch: 'NUOL Campus', team: 'Agency' },
  { branch: 'Talat Sao', team: 'KPV' },
  { branch: 'Sikhottabong', team: 'KPV' },
  { branch: 'Wattay Airport', team: 'Agency' },
  { branch: 'Parkson Mall', team: 'KPV' },
  { branch: 'Patuxay', team: 'KPV' },
  { branch: 'Evening Market', team: 'Agency' },
];

export const MERCH_CATALOG: MerchItem[] = [
  { name: 'Sport Wristbands', qty: 0, cpu: 16500 },
  { name: 'Phone stand', qty: 0, cpu: 52000 },
  { name: 'Charger', qty: 0, cpu: 105000 },
  { name: 'Gym bag', qty: 0, cpu: 95000 },
  { name: 'Gold Flyer', qty: 0, cpu: 3500 },
  { name: 'Tote Bag', qty: 0, cpu: 28000 },
];

// 60s in-memory cache — the submission modal re-mounts fire this on every row
// open; the catalog rarely changes, so skip the repeat request (free-plan egress).
let merchCache: { data: MerchItem[]; ts: number } | null = null;
const MERCH_TTL_MS = 60_000;

export async function fetchMerchCatalog(): Promise<MerchItem[]> {
  if (merchCache && Date.now() - merchCache.ts < MERCH_TTL_MS) return merchCache.data;
  try {
    const { data, error } = await supabase.from('merch').select('*').order('itemname');
    if (error || !data || data.length === 0) return merchCache?.data ?? MERCH_CATALOG;
    const mapped = data.map((row: any) => ({
      name: row.itemname,
      qty: 0,
      cpu: Number(row.cpu) || 0
    }));
    merchCache = { data: mapped, ts: Date.now() };
    return mapped;
  } catch {
    return merchCache?.data ?? MERCH_CATALOG;
  }
}

export const STAFF_NAMES = [
  'ສົມສະໜຸກ ພົມມະຈັນ',
  'ບຸນມີທິບ ວົງພັດທະນະ',
  'ກັນຍາ ສີວົງໄຊ',
  'ທິດາ ພົນສະຫວັນ',
  'ນະພາ ແກ້ວມະນີ',
];

export function genMockSubmissions(): Submission[] {
  const out: Submission[] = [];
  let id = 1;
  for (let d = 3; d <= 30; d++) {
    if (d % 7 === 0) continue; // rest day → ~25 active days
    const { branch, team } = BRANCHES[d % BRANCHES.length];
    const nc = 38 + Math.round(rand(d) * 30);
    const ec = 12 + Math.round(rand(d + 50) * 20);
    const nrp = Math.round(nc * (0.55 + rand(d + 1) * 0.25));
    // Merchandise items (deterministic per date)
    const merchItems: MerchItem[] = [];
    for (let m = 0; m < 4; m++) {
      if (rand(d + 20 + m) > 0.3) {
        const def = MERCH_CATALOG[m % MERCH_CATALOG.length];
        merchItems.push({ name: def.name, qty: 3 + Math.round(rand(d + 30 + m) * 12), cpu: def.cpu });
      }
    }
    const merchCost = merchItems.reduce((a, i) => a + i.qty * i.cpu, 0);
    const staff: string[] = [];
    for (let sp = 0; sp < 2 + Math.round(rand(d + 40) * 2); sp++) {
      staff.push(STAFF_NAMES[(d + sp) % STAFF_NAMES.length]);
    }
    out.push({
      id: `mock-${id++}`,
      date: `2025-03-${String(d).padStart(2, '0')}`,
      team,
      branch,
      activity_type: normalizeActivityType(d % 4 === 0 ? 'event' : 'booth'), // deterministic demo mix
      new_register: nc,
      new_reg_purchased: nrp,
      buy_value_new: Math.round(nc * 65000),
      existing_users: ec,
      buy_value_existing: Math.round(ec * 52000),
      team_cost: d >= 29 ? 0 : 700000 + Math.round(rand(d + 2) * 400000),
      merch_cost: merchCost,
      // Sponsorship / Production cost — every 3rd day has none yet (blank = 0)
      sponsorship_cost: d % 3 === 0 ? 0 : 250000 + Math.round(rand(d + 7) * 600000),
      merch_items: merchItems,
      staff_in_charge: staff,
      footfall: nc * 6 + Math.round(rand(d + 4) * 300),
      step_in: nc + ec + Math.round(rand(d + 5) * 40),
      status: 'active',
    });
  }
  return out;
}

// ── Locally submitted records (appear instantly even without a DB) ───────
const LOCAL_SUBS_KEY = 'easygold_submissions';
const CACHE_KEY = 'easygold_cache';             // last downloaded snapshot
const CACHE_TS_KEY = 'easygold_cache_ts';       // when it was downloaded
const CACHE_FULL_KEY = 'easygold_cache_full';   // '1' = snapshot rows include merch/staff JSON
const CACHE_PROBE_KEY = 'easygold_cache_probe'; // server-state the snapshot was verified at

// ── Freshness protocol (keeps 5GB egress safe) ───────────────────────────
// Every page load / refresh asks the server one tiny question (~0.4KB):
// "row count + newest updated_at". If the answer matches the snapshot we
// already hold (in memory, or the last session's copy in localStorage —
// it SURVIVES F5 / app restarts), we reuse it. The server is always
// consulted, so data is NEVER shown stale; only the big re-download is
// skipped. Any add / edit / delete changes the answer → full fresh download.
// Manual Refresh buttons (force=true) skip the probe and always download.
let memoCache: { data: Submission[]; full: boolean; probeKey: string | null } = { data: [], full: false, probeKey: null };
let memoInFlight: Promise<FetchResult> | null = null;

/** Race-free snapshot key: computed FROM the rows we actually received
 *  (row count + newest updated_at) — never from a separate later request. */
function keyFromRows(rows: any[]): string {
  let maxTouch = '';
  for (const r of rows) {
    const t = String(r?.updated_at ?? '');
    if (t > maxTouch) maxTouch = t;
  }
  return `${rows.length}|${maxTouch}`;
}

/** Tiny server check (~0.4KB total): row count + latest updated_at timestamp.
 *  - row count        → detects INSERTS and DELETES
 *  - max(updated_at)  → detects EDITS to existing rows (bumped by the DB
 *    trigger from supabase_change_probe.sql; if that SQL hasn't been run yet
 *    this part quietly falls back to count-only detection). */
async function probeSubmissionsKey(): Promise<string> {
  let count = '-1';
  let lastTouch = '';
  try {
    const { count: c, error } = await supabase
      .from('submissions')
      .select('id', { count: 'exact', head: true });
    if (!error) count = String(c ?? '-1');
  } catch { /* network down → keep count '-1' */ }
  try {
    const { data, error } = await supabase
      .from('submissions')
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1);
    if (!error && data && data.length > 0) lastTouch = String(data[0]?.updated_at ?? '');
  } catch { /* updated_at column not added yet → count-only probe */ }
  return `${count}|${lastTouch}`;
}

/** Snapshot reuse: memory first, then the last session's localStorage copy —
 *  but ONLY when the live probe key proves the server state is unchanged. */
function takeSnapshot(full: boolean, key: string): { data: Submission[]; cachedAt: string | null } | null {
  // 1) in-memory snapshot (from earlier page views in this session)
  if (memoCache.data.length > 0 && memoCache.probeKey === key && (memoCache.full || !full)) {
    return { data: normalizeCostFields(memoCache.data), cachedAt: null };
  }
  // 2) localStorage snapshot (survives F5 / closing the browser)
  try {
    const storedKey = localStorage.getItem(CACHE_PROBE_KEY);
    const storedFull = localStorage.getItem(CACHE_FULL_KEY) === '1';
    if (storedKey !== null && storedKey === key && (storedFull || !full)) {
      const cached = getCachedSubmissions();
      if (cached.data.length > 0) {
        memoCache = { data: cached.data, full: storedFull, probeKey: key };
        return { data: cached.data, cachedAt: cached.cachedAt };
      }
    }
  } catch { /* ignore */ }
  return null;
}

/** Merge the device's own locally-saved rows (offline submissions) on top. */
function mergeLocal(rows: Submission[]): Submission[] {
  const local = getLocalSubmissions();
  if (local.length === 0) return rows;
  return [...local, ...rows]
    .filter((v, i, a) => a.findIndex(x => x.id === v.id) === i)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Force-clear every cache layer (call after writes and on manual Refresh). */
export function clearSubmissionsCache(): void {
  memoCache = { data: [], full: false, probeKey: null };
  memoInFlight = null;
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(CACHE_TS_KEY);
    localStorage.removeItem(CACHE_FULL_KEY);
    localStorage.removeItem(CACHE_PROBE_KEY);
  } catch { /* ignore */ }
}

/** Local / cached rows written BEFORE sponsorship_cost existed carry no value
 *  for it. Adding a column does not bump updated_at, so such a snapshot can
 *  still pass the freshness probe — coerce the cost fields on every read so the
 *  cost maths never sees undefined / NaN. */
function normalizeCostFields(rows: Submission[]): Submission[] {
  return rows.map(r => ({
    ...r,
    team_cost: Number(r.team_cost) || 0,
    merch_cost: Number(r.merch_cost) || 0,
    sponsorship_cost: Number((r as any).sponsorship_cost) || 0,
  }));
}

export function getLocalSubmissions(): Submission[] {
  try {
    const arr = JSON.parse(localStorage.getItem(LOCAL_SUBS_KEY) || '[]');
    return Array.isArray(arr) ? normalizeCostFields(arr) : [];
  } catch {
    return [];
  }
}

export function saveLocalSubmission(s: Submission): void {
  const all = getLocalSubmissions();
  all.unshift(s);
  localStorage.setItem(LOCAL_SUBS_KEY, JSON.stringify(all));
}

function getCachedSubmissions(): { data: Submission[]; cachedAt: string | null } {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const ts = localStorage.getItem(CACHE_TS_KEY);
    if (!raw) return { data: [], cachedAt: null };
    const arr = JSON.parse(raw);
    return { data: Array.isArray(arr) ? normalizeCostFields(arr) : [], cachedAt: ts };
  } catch {
    return { data: [], cachedAt: null };
  }
}

function setCachedSubmissions(data: Submission[], full: boolean, probeKey: string) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(CACHE_TS_KEY, new Date().toISOString());
    localStorage.setItem(CACHE_FULL_KEY, full ? '1' : '0');
    localStorage.setItem(CACHE_PROBE_KEY, probeKey);
  } catch { /* storage full — ignore */ }
}

// ── Return type for fetchSubmissions ──────────────────────────────────────
export interface FetchResult {
  data: Submission[];
  error: any;
  /** true = Supabase timed out / errored → data is from local cache */
  stale: boolean;
  /** ISO timestamp of when the cache was last saved */
  cachedAt: string | null;
}

/** One DB row → typed Submission (shared by full / by-id fetches). */
function mapSubmissionRow(r: any, i: number): Submission {
  return {
    id: String(r.id ?? `sb-${i}`),
    date: r.date || '',
    team: r.team || 'KPV',
    branch: r.branch || '—',
    activity_type: normalizeActivityType(r.activity_type),
    new_register: Number(r.new_register) || 0,
    new_reg_purchased: Number(r.new_reg_purchased) || 0,
    buy_value_new: Number(r.buy_value_new) || 0,
    existing_users: Number(r.existing_users) || 0,
    buy_value_existing: Number(r.buy_value_existing) || 0,
    team_cost: Number(r.team_cost) || 0,
    merch_cost: Number(r.merch_cost) || 0,
    sponsorship_cost: Number(r.sponsorship_cost) || 0,
    merch_items: parseMerch(r.merch_items),
    staff_in_charge: parseStaff(r.staff_in_charge),
    footfall: Number(r.footfall) || 0,
    step_in: Number(r.step_in) || 0,
    status: r.status || 'active',
  };
}

// ── Supabase fetch: timeout → real cached data, NOT mock/demo data ─────────
export async function fetchSubmissions(force = false): Promise<FetchResult> {
  // Freshness protocol: every load asks the server a ~0.4KB question. If the
  // answer matches the snapshot we already hold (this session or the last one
  // — it survives reloads), we reuse it: server-verified fresh, ~0.1% of the
  // egress. force=true (manual Refresh buttons) skips the probe → guaranteed
  // full download.
  if (!force) {
    const key = await probeSubmissionsKey();
    const snap = takeSnapshot(true, key);
    if (snap) {
      return { data: mergeLocal(snap.data), error: null, stale: false, cachedAt: snap.cachedAt };
    }
  }

  // Deduplicate concurrent in-flight requests
  if (memoInFlight) return memoInFlight;

  memoInFlight = (async (): Promise<FetchResult> => {
    try {
      // Paginated download — the platform caps each query at 1000 rows, so
      // loop pages until the table is exhausted (keeps working as data grows).
      const raw: any[] = [];
      let from = 0;
      for (;;) {
        const { data, error } = await Promise.race([
          supabase
            .from('submissions')
            .select('*')
            .order('date', { ascending: false })
            .range(from, from + 999),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('__timeout__')), 10000)
          ),
        ]);

        if (error) {
          // Supabase replied with an error — serve cache if available
          const cached = getCachedSubmissions();
          const local = getLocalSubmissions();
          const combined = [...local, ...cached.data].filter(
            (v, i, a) => a.findIndex(x => x.id === v.id) === i
          ).sort((a, b) => b.date.localeCompare(a.date));
          return { data: combined, error, stale: true, cachedAt: cached.cachedAt };
        }

        raw.push(...(data || []));
        if (!data || data.length < 1000) break;
        from += 1000;
        if (from >= 20000) break; // hard safety cap
      }

      // Snapshot key computed FROM the received rows (race-free):
      // row count + newest updated_at.
      const probeKey = keyFromRows(raw);
      const mapped: Submission[] = raw.map(mapSubmissionRow);

    // Clean up ghost local records (duplicate rows) that successfully made it to Supabase
    // Since IDs won't match (local is 'sub-123', DB is UUID), we match by signature
    const seenSignatures = new Set(mapped.map(m => `${m.date}|${m.team}|${m.branch}`));
    const rawLocal = getLocalSubmissions();
    const local = rawLocal.filter(l => !seenSignatures.has(`${l.date}|${l.team}|${l.branch}`));
    
    // If we removed duplicates, permanently wipe them from the local cache
    if (local.length !== rawLocal.length) {
      localStorage.setItem(LOCAL_SUBS_KEY, JSON.stringify(local));
    }
    const merged = [...local, ...mapped].sort((a, b) => b.date.localeCompare(a.date));

    // Save snapshot (offline fallback + cross-reload reuse) + in-session memo
    setCachedSubmissions(mapped, true, probeKey);
    memoCache = { data: merged, full: true, probeKey };

    return { data: merged, error: null, stale: false, cachedAt: null };

  } catch (err: any) {
    // Timed out or network error — return whatever real data we have cached
    const cached = getCachedSubmissions();
    const local = getLocalSubmissions();
    const combined = [...local, ...cached.data].filter(
      (v, i, a) => a.findIndex(x => x.id === v.id) === i
    ).sort((a, b) => b.date.localeCompare(a.date));
    return { data: combined, error: err, stale: true, cachedAt: cached.cachedAt };
  } finally {
    memoInFlight = null;
  }
})();

  return memoInFlight;
}

/**
 * Lightweight fetch that excludes the heavy JSON columns (merch_items, staff_in_charge).
 * Use this for pages that only need scalar KPIs (Dashboard, Targets) — reduces
 * payload size by ~60-80% compared to select('*'). Falls back to the full
 * in-memory cache, otherwise fetches only the needed columns. Rows come back
 * flagged `light: true` — hydrate a row with
 * fetchSubmissionById() before letting the edit modal save it.
 */
export async function fetchSubmissionsSummary(force = false): Promise<FetchResult> {
  // Same freshness protocol as fetchSubmissions (~0.4KB live probe; snapshot
  // reuse only when the server confirms nothing changed).
  if (!force) {
    const key = await probeSubmissionsKey();
    const snap = takeSnapshot(false, key);
    if (snap) {
      const light = snap.data.map(s => ({ ...s, merch_items: [] as MerchItem[], staff_in_charge: [] as string[], light: true }));
      return { data: mergeLocal(light), error: null, stale: false, cachedAt: snap.cachedAt };
    }
  }

  // Column list for the light summary fetch. The optional columns are included
  // when available; a database that predates their migration (sponsorship_cost
  // from supabase_sponsorship_cost.sql, activity_type from
  // supabase_activity_type.sql) drops just the missing column below and retries
  // the SAME page — rows then default to 0 / Booth instead of falling back to a
  // stale cache.
  const BASE_SUMMARY_COLS =
    'id,date,team,branch,new_register,new_reg_purchased,buy_value_new,existing_users,buy_value_existing,team_cost,merch_cost,footfall,step_in,status,updated_at';
  // Optional columns — checked / dropped one at a time on a schema error.
  const OPTIONAL_SUMMARY_COLS = ['sponsorship_cost', 'activity_type'] as const;
  let optionalCols: string[] = [...OPTIONAL_SUMMARY_COLS];
  let summaryCols = [BASE_SUMMARY_COLS, ...optionalCols].join(',');

  try {
    // Paginated download (the platform caps each query at 1000 rows).
    // updated_at is included so the snapshot key can detect edits too.
    const raw: any[] = [];
    let from = 0;
    for (;;) {
      const { data, error } = await Promise.race([
        supabase
          .from('submissions')
          .select(summaryCols)
          .order('date', { ascending: false })
          .range(from, from + 999),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('__timeout__')), 10000)
        ),
      ]);
      if (error) {
        // Pre-migration DB (column not added yet) → drop just that column and
        // retry the SAME page; the rows are mapped to its default (0 / Booth).
        const missing = optionalCols.find(col => isMissingColumnError(error, col));
        if (missing) {
          optionalCols = optionalCols.filter(c => c !== missing);
          summaryCols = [BASE_SUMMARY_COLS, ...optionalCols].join(',');
          continue;
        }
        const cached = getCachedSubmissions();
        const local = getLocalSubmissions();
        const combined = [...local, ...cached.data].filter(
          (v, i, a) => a.findIndex(x => x.id === v.id) === i
        ).sort((a, b) => b.date.localeCompare(a.date));
        return { data: combined, error, stale: true, cachedAt: cached.cachedAt };
      }
      raw.push(...(data || []));
      if (!data || data.length < 1000) break;
      from += 1000;
      if (from >= 20000) break; // hard safety cap
    }
    const probeKey = keyFromRows(raw);

    const mapped: Submission[] = raw.map((r: any, i: number) => ({
      id: String(r.id ?? `sb-${i}`),
      date: r.date || '',
      team: r.team || 'KPV',
      branch: r.branch || '—',
      activity_type: normalizeActivityType(r.activity_type),
      new_register: Number(r.new_register) || 0,
      new_reg_purchased: Number(r.new_reg_purchased) || 0,
      buy_value_new: Number(r.buy_value_new) || 0,
      existing_users: Number(r.existing_users) || 0,
      buy_value_existing: Number(r.buy_value_existing) || 0,
      team_cost: Number(r.team_cost) || 0,
      merch_cost: Number(r.merch_cost) || 0,
      sponsorship_cost: Number(r.sponsorship_cost) || 0,
      merch_items: [],
      staff_in_charge: [],
      footfall: Number(r.footfall) || 0,
      step_in: Number(r.step_in) || 0,
      status: r.status || 'active',
      light: true,
    }));

    // Save snapshot (offline fallback + cross-reload reuse) + in-session memo
    // (light rows — a later full fetch, e.g. CopyPaste, still downloads rows).
    setCachedSubmissions(mapped, false, probeKey);
    memoCache = { data: mapped, full: false, probeKey };

    return { data: mapped, error: null, stale: false, cachedAt: null };
  } catch (err: any) {
    const cached = getCachedSubmissions();
    return { data: cached.data, error: err, stale: true, cachedAt: cached.cachedAt };
  }
}

/**
 * Fetch ONE full submission row by id (~0.5KB of egress). Used to hydrate a
 * light summary row before the view/edit modal opens, so the modal shows real
 * merch/staff data and saving never wipes merch_items / staff_in_charge.
 */
export async function fetchSubmissionById(id: string): Promise<Submission | null> {
  try {
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    return mapSubmissionRow(data, 0);
  } catch {
    return null;
  }
}

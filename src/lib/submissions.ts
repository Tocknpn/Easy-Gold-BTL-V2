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
  new_register: number;
  new_reg_purchased: number;
  buy_value_new: number;
  existing_users: number;
  buy_value_existing: number;
  team_cost: number;
  merch_cost: number;
  merch_items: MerchItem[];
  staff_in_charge: string[];
  footfall: number;
  step_in: number;
  status: string;
}

export interface ModalState {
  open: boolean;
  submission: Submission | null;
  isEditing: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────
export const fmtLAK = (n: number) => `₭${n.toLocaleString('en-US')}`;
export const fmtLAKShort = (n: number) => {
  if (n >= 1_000_000) return `₭${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₭${(n / 1_000).toFixed(0)}K`;
  return `₭${n}`;
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

export async function fetchMerchCatalog(): Promise<MerchItem[]> {
  try {
    const { data, error } = await supabase.from('merch').select('*').order('itemname');
    if (error || !data || data.length === 0) return MERCH_CATALOG;
    return data.map((row: any) => ({
      name: row.itemname,
      qty: 0,
      cpu: Number(row.cpu) || 0
    }));
  } catch {
    return MERCH_CATALOG;
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
      new_register: nc,
      new_reg_purchased: nrp,
      buy_value_new: Math.round(nc * 65000),
      existing_users: ec,
      buy_value_existing: Math.round(ec * 52000),
            team_cost: d >= 29 ? 0 : 700000 + Math.round(rand(d + 2) * 400000),
      merch_cost: merchCost,
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
const CACHE_KEY = 'easygold_cache';          // last successful full fetch
const CACHE_TS_KEY = 'easygold_cache_ts';    // when it was cached

export function getLocalSubmissions(): Submission[] {
  try {
    const arr = JSON.parse(localStorage.getItem(LOCAL_SUBS_KEY) || '[]');
    return Array.isArray(arr) ? arr : [];
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
    return { data: Array.isArray(arr) ? arr : [], cachedAt: ts };
  } catch {
    return { data: [], cachedAt: null };
  }
}

function setCachedSubmissions(data: Submission[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(CACHE_TS_KEY, new Date().toISOString());
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

// ── Supabase fetch: timeout → real cached data, NOT mock/demo data ─────────
export async function fetchSubmissions(): Promise<FetchResult> {
  try {
    // 10-second timeout — if Supabase is slow, return cached real data
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('__timeout__')), 10000)
    );
    const query = supabase
      .from('submissions')
      .select('*')
      .order('date', { ascending: false });

    const { data, error } = await Promise.race([query, timeoutPromise]);

    if (error) {
      // Supabase replied with an error — serve cache if available
      const cached = getCachedSubmissions();
      const local = getLocalSubmissions();
      const combined = [...local, ...cached.data].filter(
        (v, i, a) => a.findIndex(x => x.id === v.id) === i
      ).sort((a, b) => b.date.localeCompare(a.date));
      return { data: combined, error, stale: true, cachedAt: cached.cachedAt };
    }

    const mapped: Submission[] = (data || []).map((r: any, i: number) => ({
      id: String(r.id ?? `sb-${i}`),
      date: r.date || '',
      team: r.team || 'KPV',
      branch: r.branch || '—',
      new_register: Number(r.new_register) || 0,
      new_reg_purchased: Number(r.new_reg_purchased) || 0,
      buy_value_new: Number(r.buy_value_new) || 0,
      existing_users: Number(r.existing_users) || 0,
      buy_value_existing: Number(r.buy_value_existing) || 0,
      team_cost: Number(r.team_cost) || 0,
      merch_cost: Number(r.merch_cost) || 0,
      merch_items: parseMerch(r.merch_items),
      staff_in_charge: parseStaff(r.staff_in_charge),
      footfall: Number(r.footfall) || 0,
      step_in: Number(r.step_in) || 0,
      status: r.status || 'active',
    }));

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

    // Save to cache so next timeout can use this real data
    setCachedSubmissions(merged);

    return { data: merged, error: null, stale: false, cachedAt: null };

  } catch (err: any) {
    // Timed out or network error — return whatever real data we have cached
    const cached = getCachedSubmissions();
    const local = getLocalSubmissions();
    const combined = [...local, ...cached.data].filter(
      (v, i, a) => a.findIndex(x => x.id === v.id) === i
    ).sort((a, b) => b.date.localeCompare(a.date));
    return { data: combined, error: err, stale: true, cachedAt: cached.cachedAt };
  }
}

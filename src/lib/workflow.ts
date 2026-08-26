// ── Workflow state shared across menus (localStorage-backed demo store) ──

export interface AppUser {
  username: string;
  name: string;
  role: 'admin' | 'staff' | 'manager';
  team?: string; // 'KPV' | 'Agency' — meaningful for staff accounts
}

export function getCurrentUser(): AppUser | null {
  try {
    const raw = localStorage.getItem('easygold_user');
    return raw ? (JSON.parse(raw) as AppUser) : null;
  } catch {
    return null;
  }
}

// ── GPS check-ins captured from the Check-In menu ────────────────────────
export interface CheckInRecord {
  id: string;
  date: string;
  time: string; // HH:MM
  location: string;
  team: string;
  user: string; // staff member who captured
  lat: number;
  lng: number;
}

const CK_KEY = 'easygold_checkins';

export function getCheckIns(): CheckInRecord[] {
  try {
    return JSON.parse(localStorage.getItem(CK_KEY) || '[]');
  } catch {
    return [];
  }
}

export function addCheckIn(rec: CheckInRecord): void {
  const all = getCheckIns();
  all.unshift(rec);
  localStorage.setItem(CK_KEY, JSON.stringify(all));
}

// ── Staff directory (managed by Admin in Upload & Settings) ──────────────
export interface StaffMember {
  id: string;
  staffId?: string; // HR-facing code, e.g. KPV-10023
  name: string;
  team: 'KPV' | 'Agency';
}

const STAFF_KEY = 'easygold_staff';

export const DEFAULT_STAFF: StaffMember[] = [
  { id: 'stf-1', staffId: 'KPV-10001', name: 'ສົມສະໜຸກ ພົມມະຈັນ', team: 'KPV' },
  { id: 'stf-2', staffId: 'KPV-10002', name: 'ບຸນມີທິບ ວົງພັດທະນະ', team: 'KPV' },
  { id: 'stf-3', staffId: 'KPV-10003', name: 'ກັນຍາ ສີວົງໄຊ', team: 'KPV' },
  { id: 'stf-4', staffId: 'KPV-10004', name: 'ທິດາ ພົນສະຫວັນ', team: 'KPV' },
  { id: 'stf-5', staffId: 'KPV-10005', name: 'ນະພາ ແກ້ວມະນີ', team: 'KPV' },
  { id: 'stf-6', staffId: 'AG-10001', name: 'Alita Souvannary', team: 'Agency' },
  { id: 'stf-7', staffId: 'AG-10002', name: 'Bounmy Keophilavanh', team: 'Agency' },
];

// Suggest the next free HR code for a team (e.g. KPV-10006)
export function suggestStaffId(list: StaffMember[], team: 'KPV' | 'Agency'): string {
  const prefix = team === 'KPV' ? 'KPV-' : 'AG-';
  let max = 10000;
  for (const s of list) {
    if (!s.staffId || !s.staffId.startsWith(prefix)) continue;
    const n = parseInt(s.staffId.slice(prefix.length), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return `${prefix}${max + 1}`;
}

export function getStaff(): StaffMember[] {
  try {
    const raw = localStorage.getItem(STAFF_KEY);
    if (!raw) return DEFAULT_STAFF;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length >= 0 ? parsed : DEFAULT_STAFF;
  } catch {
    return DEFAULT_STAFF;
  }
}

export function saveStaff(list: StaffMember[]): void {
  localStorage.setItem(STAFF_KEY, JSON.stringify(list));
}

// ── Monthly route plans (managed by Admin in Monthly Plan Setting) ───────
export interface RoutePlanEntry {
  id: string;
  date: string;          // YYYY-MM-DD
  team: string;          // 'KPV' | 'Agency'
  location_name: string; // one place, or several separated by commas
}

const RP_KEY = 'easygold_routeplans';

export const DEFAULT_ROUTE_PLANS: RoutePlanEntry[] = [
  { id: 'rp-1', date: '2025-03-03', team: 'KPV', location_name: 'That Luang' },
  { id: 'rp-2', date: '2025-03-04', team: 'Agency', location_name: 'NUOL Campus' },
  { id: 'rp-3', date: '2025-03-10', team: 'KPV', location_name: 'Talat Sao' },
  { id: 'rp-4', date: '2025-03-11', team: 'KPV', location_name: 'Sikhottabong' },
  { id: 'rp-5', date: '2025-03-17', team: 'Agency', location_name: 'Wattay Airport' },
  { id: 'rp-6', date: '2025-03-18', team: 'KPV', location_name: 'Parkson Mall' },
  { id: 'rp-7', date: '2025-03-24', team: 'KPV', location_name: 'Patuxay' },
  { id: 'rp-8', date: '2025-03-25', team: 'Agency', location_name: 'Evening Market' },
  { id: 'rp-9', date: '2025-03-31', team: 'KPV', location_name: 'That Luang' },
  // Same-day multi-location demos so the calendar's box/scroll behavior is testable
  { id: 'rp-10', date: '2025-03-29', team: 'KPV', location_name: 'Talat Sao, Parkson Mall, Changan Circle' },
  { id: 'rp-11', date: '2025-04-03', team: 'KPV', location_name: 'Talat Sao, Parkson Mall' },
];

export function getRoutePlans(): RoutePlanEntry[] {
  try {
    const raw = localStorage.getItem(RP_KEY);
    const stored = raw ? JSON.parse(raw) : [];
    const base = Array.isArray(stored) ? stored : [];
    // Merge seeded demo plans so multi-location test data always appears,
    // while preserving any admin-created/edited plans from storage.
    const byKey = new Set(base.map((p: RoutePlanEntry) => `${p.date}|${p.team}|${p.location_name}`));
    const merged = [...base];
    for (const d of DEFAULT_ROUTE_PLANS) {
      const key = `${d.date}|${d.team}|${d.location_name}`;
      if (!byKey.has(key)) { merged.push(d); byKey.add(key); }
    }
    return merged;
  } catch {
    return DEFAULT_ROUTE_PLANS;
  }
}

export function saveRoutePlans(list: RoutePlanEntry[]): void {
  localStorage.setItem(RP_KEY, JSON.stringify(list));
}

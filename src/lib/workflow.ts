// ── Workflow state shared across menus ──
import { supabase } from './supabase';

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

const LOCAL_CHECKINS_KEY = 'easygold_checkins';

export function getLocalCheckIns(): CheckInRecord[] {
  try {
    const arr = JSON.parse(localStorage.getItem(LOCAL_CHECKINS_KEY) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveLocalCheckIn(rec: CheckInRecord): void {
  const all = getLocalCheckIns();
  all.unshift(rec);
  localStorage.setItem(LOCAL_CHECKINS_KEY, JSON.stringify(all));
}

export async function fetchCheckIns(): Promise<CheckInRecord[]> {
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('__timeout__')), 5000)
    );
    const query = supabase
      .from('checkins')
      .select('*')
      .order('timestamp', { ascending: false });
    
    const { data, error } = await Promise.race([query, timeoutPromise]);
    
    let remote: CheckInRecord[] = [];
    if (error) {
      console.error('Error fetching checkins:', error);
    } else {
      remote = (data || []).map((r: any) => ({
        id: r.id,
        date: r.date,
        time: r.timestamp ? new Date(r.timestamp).toTimeString().slice(0, 5) : '',
        location: r.note || '',
        team: r.team,
        user: '', // Supabase table doesn't have user_name currently
        lat: Number(r.lat) || 0,
        lng: Number(r.lng) || 0,
      }));
    }

    const local = getLocalCheckIns();
    const seenSignatures = new Set(remote.map(m => `${m.date}|${m.team}|${m.location}`));
    const localFiltered = local.filter(l => !seenSignatures.has(`${l.date}|${l.team}|${l.location}`));
    
    if (localFiltered.length !== local.length) {
      localStorage.setItem(LOCAL_CHECKINS_KEY, JSON.stringify(localFiltered));
    }
    
    return [...localFiltered, ...remote].sort((a, b) => b.date.localeCompare(a.date));
  } catch (err) {
    console.error('fetchCheckIns offline fallback:', err);
    return getLocalCheckIns();
  }
}

export async function addCheckIn(rec: CheckInRecord): Promise<void> {
  try {
    const { error } = await supabase.from('checkins').insert([{
      date: rec.date,
      team: rec.team,
      lat: rec.lat,
      lng: rec.lng,
      note: rec.location
    }]);
    if (error) {
      console.error('Error adding checkin:', error);
      saveLocalCheckIn(rec);
    }
  } catch (err) {
    console.error('Network error adding checkin:', err);
    saveLocalCheckIn(rec);
  }
}

// ── Staff directory (managed by Admin in Upload & Settings) ──────────────
export interface StaffMember {
  id: string;
  staffId?: string; // HR-facing code, e.g. KPV-10023
  name: string;
  team: 'KPV' | 'Agency';
}


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

export async function fetchStaff(): Promise<StaffMember[]> {
  try {
    const { data, error } = await supabase.from('staff').select('*').order('name');
    if (error) {
      console.error('Error fetching staff:', error);
      return DEFAULT_STAFF;
    }
    return (data || []).map((s: any) => ({
      id: s.id,
      staffId: s.id,
      name: s.name,
      team: s.team,
    }));
  } catch (err) {
    console.error('Error in fetchStaff:', err);
    return DEFAULT_STAFF;
  }
}

export async function addStaffRecord(staff: StaffMember): Promise<void> {
  const { error } = await supabase.from('staff').insert({
    id: staff.staffId || staff.id,
    name: staff.name,
    team: staff.team,
  });
  if (error) console.error('Error adding staff:', error);
}

export async function updateStaffRecord(staff: StaffMember): Promise<void> {
  const { error } = await supabase.from('staff').update({
    name: staff.name,
    team: staff.team,
  }).eq('id', staff.staffId || staff.id);
  if (error) console.error('Error updating staff:', error);
}

export async function deleteStaffRecord(id: string): Promise<void> {
  const { error } = await supabase.from('staff').delete().eq('id', id);
  if (error) console.error('Error deleting staff:', error);
}

// ── Monthly route plans (managed by Admin in Monthly Plan Setting) ───────
export interface RoutePlanEntry {
  id: string;
  date: string;          // YYYY-MM-DD
  team: string;          // 'KPV' | 'Agency'
  location_name: string; // one place, or several separated by commas
}

export async function fetchRoutePlans(): Promise<RoutePlanEntry[]> {
  try {
    const { data, error } = await supabase
      .from('route_plan')
      .select('*')
      .order('date', { ascending: false });

    if (error) {
      console.error('Error fetching route plans:', error);
      return [];
    }

    return (data || []).map((r: any) => ({
      id: r.id,
      date: r.date,
      team: r.team,
      location_name: r.location_name,
    }));
  } catch (err) {
    console.error(err);
    return [];
  }
}

export async function updateRoutePlan(date: string, team: string, location_name: string): Promise<void> {
  // Delete existing plan for this date and team
  await supabase.from('route_plan').delete().match({ date, team });
  // Insert new one if not empty
  if (location_name) {
    await supabase.from('route_plan').insert([{ date, team, location_name }]);
  }
}

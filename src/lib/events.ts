import { supabase } from './supabase';
import { totalCostOf } from './submissions';

// ── Types ──────────────────────────────────────────────────────────────────

export interface EventType {
  id: string;
  created_at: string;
  name: string;
  description: string;
  sort_order: number;
}

export interface Event {
  id: string;
  created_at: string;
  updated_at: string;
  year: number;
  quarter: string;           // derived display only ('Q1'–'Q4')
  team: string;
  event_name: string;
  start_date: string;
  end_date: string;
  activity_type: string;
  objective: string;
  scale: string;
  description: string;
  target_nc: number;
  target_ec: number;
  target_buy_value: number;
  media_cost: number;
  media_channels: string;
  total_media_impressions: number;
  proposal_link: string;
  photo_gallery_link: string;
  end_of_activation_report_link: string;
  regional_approved: boolean;
  approval_date: string;
  remarks: string;
  merch_required: boolean;
  merch_details: string;
  featured_cities: string;
  target_audience: string;
  status: string;
}

/** Monthly KPI targets — one row per (year, month, team, activity_type) */
export interface EventTarget {
  id: string;
  year: number;
  month: number;   // 1–12
  team: string;
  activity_type: string;
  cpf_target: number;
  cpa_target: number;
  cpo_target: number;
  cpm_target: number;
  nc_target: number;
  ec_target: number;
  buy_value_target: number;
}

export interface EventKPIs {
  total_cost_from_subs: number;
  total_cost: number;
  total_nc: number;
  total_ec: number;
  total_buyers: number;
  total_buy_value: number;
  total_footfall: number;
  cpa: number;
  cpo: number;
  cpm: number;
  cpf: number;
  pct_nc: number;
  pct_ec: number;
  pct_buy_value: number;
  linked_count: number;
}

export interface LinkedSubmission {
  id: string;
  date: string;
  team: string;
  branch: string;
  activity_type: string;
  new_register: number;
  new_reg_purchased: number;
  existing_users: number;
  buy_value_new: number;
  buy_value_existing: number;
  team_cost: number;
  merch_cost: number;
  sponsorship_cost: number;
  prod_cost: number;
  footfall: number;
  step_in: number;
  event_id: string | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

export const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
] as const;
export const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export const currentMonth = (): number => new Date().getMonth() + 1; // 1–12
export const currentQuarter = (): string => {
  const m = new Date().getMonth();
  if (m < 3) return 'Q1';
  if (m < 6) return 'Q2';
  if (m < 9) return 'Q3';
  return 'Q4';
};
export const monthToQuarter = (m: number): string =>
  m <= 3 ? 'Q1' : m <= 6 ? 'Q2' : m <= 9 ? 'Q3' : 'Q4';

export const EVENT_OBJECTIVES = [
  'Acquisition/Awareness',
  'Awareness/Education',
  'Acquisition',
] as const;
export const EVENT_SCALES = ['Small', 'Medium', 'Large', 'National'] as const;
export const EVENT_TEAMS = ['KPV', 'Agency', 'ESG'] as const;
export const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'] as const;
export const EVENT_STATUSES = ['active', 'completed', 'cancelled'] as const;

// ── Row mappers ──────────────────────────────────────────────────────────────

function mapEventRow(r: any): Event {
  const sd = r.start_date || '';
  // Derive quarter from start_date month
  const month = sd ? new Date(sd + 'T00:00:00').getMonth() + 1 : 0;
  const quarter = monthToQuarter(month || 7);
  return {
    id: String(r.id ?? ''),
    created_at: r.created_at || '',
    updated_at: r.updated_at || '',
    year: Number(r.year) || new Date().getFullYear(),
    quarter,
    team: r.team || 'KPV',
    event_name: r.event_name || '',
    start_date: sd,
    end_date: r.end_date || '',
    activity_type: r.activity_type || '',
    objective: r.objective || 'Acquisition/Awareness',
    scale: r.scale || '',
    description: r.description || '',
    target_nc: Number(r.target_nc) || 0,
    target_ec: Number(r.target_ec) || 0,
    target_buy_value: Number(r.target_buy_value) || 0,
    media_cost: Number(r.media_cost) || 0,
    media_channels: r.media_channels || '',
    total_media_impressions: Number(r.total_media_impressions) || 0,
    proposal_link: r.proposal_link || '',
    photo_gallery_link: r.photo_gallery_link || '',
    end_of_activation_report_link: r.end_of_activation_report_link || '',
    regional_approved: Boolean(r.regional_approved),
    approval_date: r.approval_date || '',
    remarks: r.remarks || '',
    merch_required: Boolean(r.merch_required),
    merch_details: r.merch_details || '',
    featured_cities: r.featured_cities || '',
    target_audience: r.target_audience || '',
    status: r.status || 'active',
  };
}

function mapLinkedSub(r: any): LinkedSubmission {
  return {
    id: String(r.id ?? ''),
    date: r.date || '',
    team: r.team || '',
    branch: r.branch || '',
    activity_type: r.activity_type || 'event',
    new_register: Number(r.new_register) || 0,
    new_reg_purchased: Number(r.new_reg_purchased) || 0,
    existing_users: Number(r.existing_users) || 0,
    buy_value_new: Number(r.buy_value_new) || 0,
    buy_value_existing: Number(r.buy_value_existing) || 0,
    team_cost: Number(r.team_cost) || 0,
    merch_cost: Number(r.merch_cost) || 0,
    sponsorship_cost: Number(r.sponsorship_cost) || 0,
    prod_cost: Number(r.prod_cost) || 0,
    footfall: Number(r.footfall) || 0,
    step_in: Number(r.step_in) || 0,
    event_id: r.event_id || null,
  };
}

// ── Event Types (SKU) ────────────────────────────────────────────────────────

export async function fetchEventTypes(): Promise<EventType[]> {
  try {
    const { data, error } = await supabase
      .from('event_types')
      .select('*')
      .order('sort_order')
      .order('name');
    if (error || !data) return [];
    return data.map((r: any) => ({
      id: r.id,
      created_at: r.created_at || '',
      name: r.name || '',
      description: r.description || '',
      sort_order: Number(r.sort_order) || 0,
    }));
  } catch {
    return [];
  }
}

export async function createEventType(payload: {
  name: string;
  description?: string;
  sort_order?: number;
}): Promise<{ data: EventType | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('event_types')
      .insert([{ name: payload.name.trim(), description: payload.description || '', sort_order: payload.sort_order ?? 0 }])
      .select()
      .single();
    if (error) return { data: null, error };
    return {
      data: { id: data.id, created_at: data.created_at, name: data.name, description: data.description || '', sort_order: data.sort_order },
      error: null,
    };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Update an event type name — cascades the rename to all events and event_targets rows
 * that reference the old name.
 */
export async function updateEventType(
  id: string,
  oldName: string,
  updates: { name: string; description?: string; sort_order?: number }
): Promise<{ error: any }> {
  try {
    const newName = updates.name.trim();
    // 1. Update the master type record
    const { error: typeErr } = await supabase
      .from('event_types')
      .update({ name: newName, description: updates.description ?? '', sort_order: updates.sort_order ?? 0 })
      .eq('id', id);
    if (typeErr) return { error: typeErr };

    // 2. Cascade rename to events table
    if (newName !== oldName) {
      await supabase.from('events').update({ activity_type: newName }).eq('activity_type', oldName);
      // 3. Cascade rename to event_targets table
      await supabase.from('event_targets').update({ activity_type: newName }).eq('activity_type', oldName);
    }
    return { error: null };
  } catch (err) {
    return { error: err };
  }
}

export async function deleteEventType(id: string): Promise<{ error: any }> {
  try {
    const { error } = await supabase.from('event_types').delete().eq('id', id);
    return { error };
  } catch (err) {
    return { error: err };
  }
}

// ── Events CRUD ──────────────────────────────────────────────────────────────

export async function fetchEvents(filters?: {
  year?: number;
  quarter?: string;
  team?: string;
  status?: string;
}): Promise<{ data: Event[]; error: any }> {
  try {
    let q = supabase.from('events').select('*').order('start_date', { ascending: false });
    if (filters?.year) q = q.eq('year', filters.year);
    if (filters?.team) q = q.eq('team', filters.team);
    if (filters?.status) q = q.eq('status', filters.status);
    // Quarter filter: derive month range from quarter string
    if (filters?.quarter) {
      const qMap: Record<string, [string, string]> = {
        Q1: ['01', '03'], Q2: ['04', '06'], Q3: ['07', '09'], Q4: ['10', '12'],
      };
      const [mFrom, mTo] = qMap[filters.quarter] || ['01', '12'];
      const y = filters.year || new Date().getFullYear();
      q = q.gte('start_date', `${y}-${mFrom}-01`).lte('start_date', `${y}-${mTo}-31`);
    }
    const { data, error } = await Promise.race([
      q,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('__timeout__')), 10000)),
    ]);
    if (error) return { data: [], error };
    return { data: (data || []).map(mapEventRow), error: null };
  } catch (err) {
    return { data: [], error: err };
  }
}

export async function fetchEventById(id: string): Promise<Event | null> {
  try {
    const { data, error } = await supabase.from('events').select('*').eq('id', id).maybeSingle();
    if (error || !data) return null;
    return mapEventRow(data);
  } catch {
    return null;
  }
}

export async function createEvent(
  payload: Omit<Event, 'id' | 'created_at' | 'updated_at' | 'quarter'>
): Promise<{ data: Event | null; error: any }> {
  try {
    const { data, error } = await supabase.from('events').insert([payload]).select().single();
    if (error) return { data: null, error };
    return { data: mapEventRow(data), error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

export async function updateEvent(
  id: string,
  payload: Partial<Omit<Event, 'id' | 'created_at' | 'updated_at' | 'quarter'>>
): Promise<{ data: Event | null; error: any }> {
  try {
    const { data, error } = await supabase.from('events').update(payload).eq('id', id).select().single();
    if (error) return { data: null, error };
    return { data: mapEventRow(data), error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

export async function deleteEvent(id: string): Promise<{ error: any }> {
  try {
    const { error } = await supabase.from('events').delete().eq('id', id);
    return { error };
  } catch (err) {
    return { error: err };
  }
}

// ── Linked Submissions ───────────────────────────────────────────────────────

export async function fetchLinkedSubmissions(eventId: string): Promise<LinkedSubmission[]> {
  try {
    const { data, error } = await supabase
      .from('submissions')
      .select('id,date,team,branch,activity_type,new_register,new_reg_purchased,existing_users,buy_value_new,buy_value_existing,team_cost,merch_cost,sponsorship_cost,prod_cost,footfall,step_in,event_id')
      .eq('event_id', eventId)
      .order('date', { ascending: true });
    if (error || !data) return [];
    return data.map(mapLinkedSub);
  } catch {
    return [];
  }
}

export async function fetchUnlinkedEventSubmissions(): Promise<LinkedSubmission[]> {
  try {
    const { data, error } = await supabase
      .from('submissions')
      .select('id,date,team,branch,activity_type,new_register,new_reg_purchased,existing_users,buy_value_new,buy_value_existing,team_cost,merch_cost,sponsorship_cost,prod_cost,footfall,step_in,event_id')
      .eq('activity_type', 'event')
      .is('event_id', null)
      .order('date', { ascending: false })
      .limit(200);
    if (error || !data) return [];
    return data.map(mapLinkedSub);
  } catch {
    return [];
  }
}

export async function linkSubmissionToEvent(submissionId: string, eventId: string | null): Promise<{ error: any }> {
  try {
    const { error } = await supabase.from('submissions').update({ event_id: eventId }).eq('id', submissionId);
    return { error };
  } catch (err) {
    return { error: err };
  }
}

// ── KPI computation ──────────────────────────────────────────────────────────

export function computeEventKPIs(event: Event, subs: LinkedSubmission[]): EventKPIs {
  let total_cost_from_subs = 0, total_nc = 0, total_ec = 0, total_buyers = 0, total_buy_value = 0, total_footfall = 0;
  for (const s of subs) {
    total_cost_from_subs += totalCostOf(s as any);
    total_nc += s.new_register;
    total_ec += s.existing_users;
    total_buyers += s.new_reg_purchased + s.existing_users;
    total_buy_value += (s.buy_value_new || 0) + (s.buy_value_existing || 0);
    total_footfall += s.footfall || 0;
  }
  const total_cost = total_cost_from_subs + (event.media_cost || 0);
  const impressions = event.total_media_impressions || 0;
  return {
    total_cost_from_subs,
    total_cost,
    total_nc,
    total_ec,
    total_buyers,
    total_buy_value,
    total_footfall,
    cpa: total_nc > 0 ? total_cost / total_nc : 0,
    cpo: total_buyers > 0 ? total_cost / total_buyers : 0,
    cpm: impressions > 0 ? (total_cost / impressions) * 1000 : 0,
    cpf: total_footfall > 0 ? total_cost / total_footfall : 0,
    pct_nc: event.target_nc > 0 ? (total_nc / event.target_nc) * 100 : 0,
    pct_ec: event.target_ec > 0 ? (total_ec / event.target_ec) * 100 : 0,
    pct_buy_value: event.target_buy_value > 0 ? (total_buy_value / event.target_buy_value) * 100 : 0,
    linked_count: subs.length,
  };
}

// ── Event Targets (monthly) ──────────────────────────────────────────────────

export async function fetchEventTargets(
  year?: number,
  month?: number,
  team?: string
): Promise<EventTarget[]> {
  try {
    let q = supabase.from('event_targets').select('*').order('month').order('team').order('activity_type');
    if (year) q = q.eq('year', year);
    if (month) q = q.eq('month', month);
    if (team) q = q.eq('team', team);
    const { data, error } = await q;
    if (error || !data) return [];
    return data.map((r: any) => ({
      id: r.id,
      year: Number(r.year),
      month: Number(r.month),
      team: r.team,
      activity_type: r.activity_type,
      cpf_target: Number(r.cpf_target) || 0,
      cpa_target: Number(r.cpa_target) || 0,
      cpo_target: Number(r.cpo_target) || 0,
      cpm_target: Number(r.cpm_target) || 0,
      nc_target: Number(r.nc_target) || 0,
      ec_target: Number(r.ec_target) || 0,
      buy_value_target: Number(r.buy_value_target) || 0,
    }));
  } catch {
    return [];
  }
}

export async function upsertEventTarget(target: Omit<EventTarget, 'id'>): Promise<{ error: any }> {
  try {
    const { error } = await supabase
      .from('event_targets')
      .upsert([target], { onConflict: 'year,month,team,activity_type' });
    return { error };
  } catch (err) {
    return { error: err };
  }
}

export async function deleteEventTarget(id: string): Promise<{ error: any }> {
  try {
    const { error } = await supabase.from('event_targets').delete().eq('id', id);
    return { error };
  } catch (err) {
    return { error: err };
  }
}

// ── Format helpers ────────────────────────────────────────────────────────────

export const fmtLAK = (n: number) => `₭${n.toLocaleString('en-US')}`;
export const fmtLAKShort = (n: number): string => {
  if (n >= 1_000_000) return `₭${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₭${Math.round(n / 1_000)}K`;
  return `₭${n.toLocaleString('en-US')}`;
};
export const fmtPct = (n: number): string => `${Math.round(n)}%`;
export const statusColor = (s: string) => s === 'completed' ? 'var(--green)' : s === 'cancelled' ? 'var(--red)' : 'var(--blue)';
export const statusLabel = (s: string) => s === 'completed' ? 'Completed' : s === 'cancelled' ? 'Cancelled' : 'Active';

import { supabase } from './supabase';
import { totalCostOf } from './submissions';

// ── Types ──────────────────────────────────────────────────────────────────

export interface Event {
  id: string;
  created_at: string;
  updated_at: string;
  year: number;
  quarter: string;           // 'Q1' | 'Q2' | 'Q3' | 'Q4'
  team: string;              // 'KPV' | 'Agency' | 'ESG'
  event_name: string;
  start_date: string;        // ISO date
  end_date: string;          // ISO date
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

export interface EventTarget {
  id: string;
  year: number;
  quarter: string;
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
  total_cost_from_subs: number;  // sum of linked submission costs
  total_cost: number;            // total_cost_from_subs + media_cost
  total_nc: number;
  total_ec: number;
  total_buyers: number;          // nc_purchased + ec
  total_buy_value: number;
  total_footfall: number;
  cpa: number;                   // total_cost / total_nc
  cpo: number;                   // total_cost / total_buyers
  cpm: number;                   // (total_cost / impressions) * 1000
  cpf: number;                   // total_cost / footfall
  pct_nc: number;                // total_nc / target_nc * 100
  pct_ec: number;
  pct_buy_value: number;
  linked_count: number;          // number of linked submissions
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

// ── Lookup tables ───────────────────────────────────────────────────────────

export const ACTIVITY_TYPES_EVENT = [
  'H2H Booth',
  'Event (indoor)',
  'Event (outdoor)',
  'Sponsorship',
  'Wealth Talk',
  'On Shop',
] as const;

export const EVENT_OBJECTIVES = [
  'Acquisition/Awareness',
  'Awareness/Education',
  'Acquisition',
] as const;

export const EVENT_SCALES = ['Small', 'Medium', 'Large', 'National'] as const;
export const EVENT_TEAMS = ['KPV', 'Agency', 'ESG'] as const;
export const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'] as const;
export const EVENT_STATUSES = ['active', 'completed', 'cancelled'] as const;

export const currentQuarter = (): string => {
  const m = new Date().getMonth();
  if (m < 3) return 'Q1';
  if (m < 6) return 'Q2';
  if (m < 9) return 'Q3';
  return 'Q4';
};

// ── Row mapper ──────────────────────────────────────────────────────────────

function mapEventRow(r: any): Event {
  return {
    id: String(r.id ?? ''),
    created_at: r.created_at || '',
    updated_at: r.updated_at || '',
    year: Number(r.year) || new Date().getFullYear(),
    quarter: r.quarter || 'Q3',
    team: r.team || 'KPV',
    event_name: r.event_name || '',
    start_date: r.start_date || '',
    end_date: r.end_date || '',
    activity_type: r.activity_type || 'Event (indoor)',
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

// ── Fetch events (list view) ────────────────────────────────────────────────

export async function fetchEvents(filters?: {
  year?: number;
  quarter?: string;
  team?: string;
  status?: string;
}): Promise<{ data: Event[]; error: any }> {
  try {
    let q = supabase
      .from('events')
      .select('*')
      .order('start_date', { ascending: false });

    if (filters?.year) q = q.eq('year', filters.year);
    if (filters?.quarter) q = q.eq('quarter', filters.quarter);
    if (filters?.team) q = q.eq('team', filters.team);
    if (filters?.status) q = q.eq('status', filters.status);

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

// ── Fetch single event ──────────────────────────────────────────────────────

export async function fetchEventById(id: string): Promise<Event | null> {
  try {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    return mapEventRow(data);
  } catch {
    return null;
  }
}

// ── Create event ────────────────────────────────────────────────────────────

export async function createEvent(
  payload: Omit<Event, 'id' | 'created_at' | 'updated_at'>
): Promise<{ data: Event | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('events')
      .insert([payload])
      .select()
      .single();
    if (error) return { data: null, error };
    return { data: mapEventRow(data), error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

// ── Update event ────────────────────────────────────────────────────────────

export async function updateEvent(
  id: string,
  payload: Partial<Omit<Event, 'id' | 'created_at' | 'updated_at'>>
): Promise<{ data: Event | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('events')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) return { data: null, error };
    return { data: mapEventRow(data), error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

// ── Delete event ────────────────────────────────────────────────────────────

export async function deleteEvent(id: string): Promise<{ error: any }> {
  try {
    const { error } = await supabase.from('events').delete().eq('id', id);
    return { error };
  } catch (err) {
    return { error: err };
  }
}

// ── Fetch linked submissions for an event ───────────────────────────────────

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

// ── Fetch unlinked event-type submissions (for linking picker) ──────────────

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

// ── Link / unlink submission ────────────────────────────────────────────────

export async function linkSubmissionToEvent(
  submissionId: string,
  eventId: string | null
): Promise<{ error: any }> {
  try {
    const { error } = await supabase
      .from('submissions')
      .update({ event_id: eventId })
      .eq('id', submissionId);
    return { error };
  } catch (err) {
    return { error: err };
  }
}

// ── Compute event KPIs from linked submissions ──────────────────────────────

export function computeEventKPIs(
  event: Event,
  subs: LinkedSubmission[]
): EventKPIs {
  let total_cost_from_subs = 0;
  let total_nc = 0;
  let total_ec = 0;
  let total_buyers = 0;
  let total_buy_value = 0;
  let total_footfall = 0;

  for (const s of subs) {
    const cost = totalCostOf(s as any);
    total_cost_from_subs += cost;
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

// ── Fetch event targets ─────────────────────────────────────────────────────

export async function fetchEventTargets(
  year?: number,
  quarter?: string,
  team?: string
): Promise<EventTarget[]> {
  try {
    let q = supabase.from('event_targets').select('*').order('team').order('activity_type');
    if (year) q = q.eq('year', year);
    if (quarter) q = q.eq('quarter', quarter);
    if (team) q = q.eq('team', team);
    const { data, error } = await q;
    if (error || !data) return [];
    return data.map((r: any) => ({
      id: r.id,
      year: Number(r.year),
      quarter: r.quarter,
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

export async function upsertEventTarget(
  target: Omit<EventTarget, 'id'>
): Promise<{ error: any }> {
  try {
    const { error } = await supabase
      .from('event_targets')
      .upsert([target], { onConflict: 'year,quarter,team,activity_type' });
    return { error };
  } catch (err) {
    return { error: err };
  }
}

// ── Format helpers ──────────────────────────────────────────────────────────

export const fmtLAK = (n: number) => `₭${n.toLocaleString('en-US')}`;
export const fmtLAKShort = (n: number): string => {
  if (n >= 1_000_000) return `₭${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₭${Math.round(n / 1_000)}K`;
  return `₭${n.toLocaleString('en-US')}`;
};
export const fmtPct = (n: number): string => `${Math.round(n)}%`;

export const statusColor = (s: string) => {
  if (s === 'completed') return 'var(--green)';
  if (s === 'cancelled') return 'var(--red)';
  return 'var(--blue)';
};
export const statusLabel = (s: string) =>
  s === 'completed' ? 'Completed' : s === 'cancelled' ? 'Cancelled' : 'Active';

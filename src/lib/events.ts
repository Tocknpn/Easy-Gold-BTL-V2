import { supabase } from './supabase';
import { totalCostOf } from './submissions';
import { writeAuditLog } from './workflow';

// ── Types ──────────────────────────────────────────────────────────────────

export interface EventType {
  id: string;
  created_at: string;
  name: string;
  description: string;
  sort_order: number;
}

export interface EventMerchItem {
  name: string;
  qty: number;
  cpu?: number;
  total?: number;
}

export interface Event {
  id: string;
  created_at: string;
  updated_at: string;
  year: number;
  quarter: string;           // derived display only ('Q1'–'Q4')
  team: string;              // 'KPV' | 'Agency' | 'ESG'
  event_name: string;
  location: string;
  start_date: string;
  end_date: string;
  start_time?: string;
  end_time?: string;
  activity_type: string;
  objective: string;
  scale: string;             // 'Small' | 'Medium' | 'Large' | 'Med/Large Boundary' | 'National'
  description: string;
  status: 'pending' | 'active' | 'completed' | 'cancelled'; // Default is 'pending'

  // Total Budget Plan breakdown
  budget_total: number;
  budget_media: number;
  budget_production: number;
  budget_sponsor: number;
  budget_merch: number;
  budget_operation: number;
  budget_other: number;

  // Merch items list
  merch_items_list: EventMerchItem[];

  // Media channels & impressions
  media_sources: string[];    // ['Facebook', 'Tiktok', 'Line', 'Youtube', 'inApp', 'Other']
  media_channels: string;    // legacy or comma string
  media_cost: number;        // alias for budget_media
  total_media_impressions: number; // Target media total impressions

  // Target metrics field boxes
  target_buy_value: number;
  target_footfall: number;
  target_nc: number;
  target_nc_buyer?: number;
  target_ec: number;
  target_download?: number;
  target_kyc?: number;
  target_cpa: number;
  target_cpo: number;
  target_cpm: number;
  target_cpf: number;

  // Links & docs
  proposal_link: string;     // Google Drive link
  photo_gallery_link: string;
  end_of_activation_report_link: string;
  regional_approved: boolean;
  approval_date: string;
  remarks: string;
  merch_required: boolean;
  merch_details: string;
  featured_cities: string;
  target_audience: string;

  // Actual Fields (filled when event ends)
  actual_filled: boolean;
  actual_cost?: number;
  actual_media_cost?: number;
  actual_production_cost?: number;
  actual_sponsor_cost?: number;
  actual_merch_cost?: number;
  actual_operation_cost?: number;
  actual_other_cost?: number;

  actual_footfall?: number;
  actual_nc?: number;
  actual_nc_buyer?: number;
  actual_ec?: number;
  actual_download?: number;
  actual_kyc?: number;
  actual_buy_value?: number;
  actual_impressions?: number;

  // Actual CP metrics (autocalculated)
  actual_cpa?: number;
  actual_cpo?: number;
  actual_cpm?: number;
  actual_cpf?: number;

  // Up to 4 Media Photo links
  photo_urls: string[];
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
export const EVENT_SCALES = ['Small', 'Medium', 'Large', 'Med/Large Boundary', 'National'] as const;
export const EVENT_TEAMS = ['KPV', 'Agency', 'ESG'] as const;
export const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'] as const;
export const EVENT_STATUSES = ['pending', 'active', 'completed', 'cancelled'] as const;
export const MEDIA_SOURCES = ['Facebook', 'Tiktok', 'Line', 'Youtube', 'inApp', 'Other'] as const;

export interface CustomListOptions {
  scales: string[];
  objectives: string[];
  teams: string[];
  mediaSources: string[];
}

export const DEFAULT_LIST_OPTIONS: CustomListOptions = {
  scales: [...EVENT_SCALES],
  objectives: [...EVENT_OBJECTIVES],
  teams: [...EVENT_TEAMS],
  mediaSources: [...MEDIA_SOURCES],
};

const LIST_OPTIONS_STORAGE_KEY = 'easygold_list_options_v1';

export function getCustomListOptions(): CustomListOptions {
  try {
    const raw = localStorage.getItem(LIST_OPTIONS_STORAGE_KEY);
    if (!raw) return DEFAULT_LIST_OPTIONS;
    const parsed = JSON.parse(raw);
    return {
      scales: Array.isArray(parsed.scales) && parsed.scales.length ? parsed.scales : DEFAULT_LIST_OPTIONS.scales,
      objectives: Array.isArray(parsed.objectives) && parsed.objectives.length ? parsed.objectives : DEFAULT_LIST_OPTIONS.objectives,
      teams: Array.isArray(parsed.teams) && parsed.teams.length ? parsed.teams : DEFAULT_LIST_OPTIONS.teams,
      mediaSources: Array.isArray(parsed.mediaSources) && parsed.mediaSources.length ? parsed.mediaSources : DEFAULT_LIST_OPTIONS.mediaSources,
    };
  } catch {
    return DEFAULT_LIST_OPTIONS;
  }
}

export function saveCustomListOptions(opts: CustomListOptions): void {
  try {
    localStorage.setItem(LIST_OPTIONS_STORAGE_KEY, JSON.stringify(opts));
  } catch (err) {
    console.error('Failed to save custom list options:', err);
  }
}

export const THIS_YEAR = new Date().getFullYear();

export const blankEvent = (firstTypeName: string): Omit<Event, 'id' | 'created_at' | 'updated_at' | 'quarter'> => ({
  year: THIS_YEAR,
  team: 'KPV',
  event_name: '',
  location: '',
  start_date: '',
  end_date: '',
  start_time: '',
  end_time: '',
  activity_type: firstTypeName || '',
  objective: 'Acquisition/Awareness',
  scale: 'Medium',
  description: '',
  status: 'pending', // Default is Pending per requirements

  // Total Budget Plan breakdown
  budget_total: 0,
  budget_media: 0,
  budget_production: 0,
  budget_sponsor: 0,
  budget_merch: 0,
  budget_operation: 0,
  budget_other: 0,

  merch_items_list: [],

  media_sources: ['Facebook'],
  media_channels: 'Facebook',
  media_cost: 0,
  total_media_impressions: 0,

  // Target metrics field boxes
  target_buy_value: 0,
  target_footfall: 0,
  target_nc: 0,
  target_nc_buyer: 0,
  target_ec: 0,
  target_download: 0,
  target_kyc: 0,
  target_cpa: 0,
  target_cpo: 0,
  target_cpm: 0,
  target_cpf: 0,

  proposal_link: '',
  photo_gallery_link: '',
  end_of_activation_report_link: '',
  regional_approved: false,
  approval_date: '',
  remarks: '',
  merch_required: false,
  merch_details: '',
  featured_cities: '',
  target_audience: '',

  // Actual Fields
  actual_filled: false,
  actual_cost: 0,
  actual_media_cost: 0,
  actual_production_cost: 0,
  actual_sponsor_cost: 0,
  actual_merch_cost: 0,
  actual_operation_cost: 0,
  actual_other_cost: 0,
  actual_footfall: 0,
  actual_nc: 0,
  actual_nc_buyer: 0,
  actual_ec: 0,
  actual_download: 0,
  actual_kyc: 0,
  actual_buy_value: 0,
  actual_impressions: 0,
  actual_cpa: 0,
  actual_cpo: 0,
  actual_cpm: 0,
  actual_cpf: 0,
  photo_urls: ['', '', '', ''],
});

// ── Sample Demonstration Events (matching attachment) ──────────────────────
const DEMO_EVENTS: Event[] = [
  {
    id: 'demo-lgf-2026',
    created_at: '2026-09-01T08:00:00Z',
    updated_at: '2026-09-15T12:00:00Z',
    year: 2026,
    quarter: 'Q3',
    team: 'Agency',
    event_name: 'LGF',
    location: 'Lao-ITECC Exhibition Hall',
    start_date: '2026-09-10',
    end_date: '2026-09-14',
    activity_type: 'Trade Fair',
    objective: 'Acquisition/Awareness',
    scale: 'Large',
    description: 'Lao Green Fashion annual exhibition booth & trade fair activation.',
    status: 'completed',
    budget_total: 279700000,
    budget_media: 50000000,
    budget_production: 120000000,
    budget_sponsor: 30000000,
    budget_merch: 40000000,
    budget_operation: 30000000,
    budget_other: 9700000,
    merch_items_list: [
      { name: 'Canvas Bag Easy Gold', qty: 300, cpu: 50000, total: 15000000 },
      { name: 'Premium Umbrella', qty: 200, cpu: 125000, total: 25000000 }
    ],
    media_sources: ['Facebook', 'Tiktok', 'Youtube'],
    media_channels: 'Facebook, Tiktok, Youtube',
    media_cost: 50000000,
    total_media_impressions: 4370000,
    target_buy_value: 250000000,
    target_footfall: 3000,
    target_nc: 75,
    target_nc_buyer: 60,
    target_ec: 195,
    target_cpa: 3729333,
    target_cpo: 1035926,
    target_cpm: 64,
    target_cpf: 93233,
    proposal_link: 'https://drive.google.com',
    photo_gallery_link: 'https://photos.google.com',
    end_of_activation_report_link: '',
    regional_approved: true,
    approval_date: '2026-09-02',
    remarks: 'Strong customer turnout and high brand engagement.',
    merch_required: true,
    merch_details: 'Canvas bags and VIP umbrellas',
    featured_cities: 'Vientiane',
    target_audience: 'Trade Fair Attendees',
    actual_filled: true,
    actual_cost: 279700000,
    actual_nc: 73,
    actual_ec: 196,
    actual_footfall: 2980,
    actual_buy_value: 248000000,
    actual_impressions: 4370312,
    actual_cpo: 1039777,
    actual_cpa: 3832877,
    actual_cpm: 64,
    photo_urls: [
      'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1511578314322-379afb476865?w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=600&auto=format&fit=crop',
    ],
  },
  {
    id: 'demo-laowisdom-2026',
    created_at: '2026-09-05T08:00:00Z',
    updated_at: '2026-09-20T12:00:00Z',
    year: 2026,
    quarter: 'Q3',
    team: 'KPV',
    event_name: 'Lao Wisdom',
    location: 'National Cultural Hall',
    start_date: '2026-09-18',
    end_date: '2026-09-19',
    activity_type: 'Community/Panel',
    objective: 'Awareness/Education',
    scale: 'Medium',
    description: 'Community panel discussion and financial literacy symposium.',
    status: 'completed',
    budget_total: 51800000,
    budget_media: 15000000,
    budget_production: 18000000,
    budget_sponsor: 5000000,
    budget_merch: 8000000,
    budget_operation: 5000000,
    budget_other: 800000,
    merch_items_list: [
      { name: 'Easy Gold Notebook', qty: 200, cpu: 40000, total: 8000000 }
    ],
    media_sources: ['Facebook', 'Line'],
    media_channels: 'Facebook, Line',
    media_cost: 15000000,
    total_media_impressions: 2590000,
    target_buy_value: 120000000,
    target_footfall: 1200,
    target_nc: 70,
    target_nc_buyer: 50,
    target_ec: 130,
    target_cpa: 740000,
    target_cpo: 259000,
    target_cpm: 20,
    target_cpf: 43166,
    proposal_link: 'https://drive.google.com',
    photo_gallery_link: 'https://photos.google.com',
    end_of_activation_report_link: '',
    regional_approved: true,
    approval_date: '2026-09-10',
    remarks: 'Exceeded customer acquisition targets significantly.',
    merch_required: true,
    merch_details: 'Notebooks',
    featured_cities: 'Vientiane',
    target_audience: 'Youth & Young Professionals',
    actual_filled: true,
    actual_cost: 51800000,
    actual_nc: 88,
    actual_ec: 129,
    actual_footfall: 1350,
    actual_buy_value: 134000000,
    actual_impressions: 2590000,
    actual_cpo: 238710,
    actual_cpa: 588636,
    actual_cpm: 20,
    photo_urls: [
      'https://images.unsplash.com/photo-1528605248644-14dd04022da1?w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1515187029135-18ee286d815b?w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1531497865144-0464ef8fb9a9?w=600&auto=format&fit=crop',
    ],
  },
  {
    id: 'demo-digitalaward-2026',
    created_at: '2026-09-10T08:00:00Z',
    updated_at: '2026-09-24T12:00:00Z',
    year: 2026,
    quarter: 'Q3',
    team: 'Agency',
    event_name: 'Lao Digital Award',
    location: 'Don Chan Palace Hotel',
    start_date: '2026-09-22',
    end_date: '2026-09-23',
    activity_type: 'Sponsorship',
    scale: 'Small',
    objective: 'Acquisition/Awareness',
    description: 'Gold sponsor for national digital awards ceremony.',
    status: 'completed',
    budget_total: 39687000,
    budget_media: 10000000,
    budget_production: 8000000,
    budget_sponsor: 15000000,
    budget_merch: 3000000,
    budget_operation: 3000000,
    budget_other: 687000,
    merch_items_list: [],
    media_sources: ['Facebook', 'Tiktok', 'inApp'],
    media_channels: 'Facebook, Tiktok, inApp',
    media_cost: 10000000,
    total_media_impressions: 3079615,
    target_buy_value: 80000000,
    target_footfall: 600,
    target_nc: 30,
    target_nc_buyer: 25,
    target_ec: 60,
    target_cpa: 1322900,
    target_cpo: 440967,
    target_cpm: 12887,
    target_cpf: 66145,
    proposal_link: 'https://drive.google.com',
    photo_gallery_link: 'https://photos.google.com',
    end_of_activation_report_link: '',
    regional_approved: true,
    approval_date: '2026-09-15',
    remarks: 'Tech VIP networking and direct brand exposure.',
    merch_required: false,
    merch_details: '',
    featured_cities: 'Vientiane',
    target_audience: 'Tech Entrepreneurs',
    actual_filled: true,
    actual_cost: 39687000,
    actual_nc: 33,
    actual_ec: 64,
    actual_footfall: 620,
    actual_buy_value: 85000000,
    actual_impressions: 3079615,
    actual_cpo: 409145,
    actual_cpa: 1072622,
    actual_cpm: 12887,
    photo_urls: [
      'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1527529482837-4698179dc6ce?w=600&auto=format&fit=crop',
    ],
  },
  {
    id: 'demo-ecommerce-2026',
    created_at: '2026-09-15T08:00:00Z',
    updated_at: '2026-09-29T12:00:00Z',
    year: 2026,
    quarter: 'Q3',
    team: 'KPV',
    event_name: 'Lao E-commerce',
    location: 'Landmark Riverside Hotel',
    start_date: '2026-09-26',
    end_date: '2026-09-28',
    activity_type: 'Community/Panel',
    scale: 'Med/Large Boundary',
    objective: 'Acquisition',
    description: 'National E-commerce & fintech expo with workshop activation.',
    status: 'completed',
    budget_total: 72800000,
    budget_media: 20000000,
    budget_production: 25000000,
    budget_sponsor: 10000000,
    budget_merch: 8000000,
    budget_operation: 7000000,
    budget_other: 2800000,
    merch_items_list: [],
    media_sources: ['Facebook', 'Tiktok', 'Youtube', 'Line'],
    media_channels: 'Facebook, Tiktok, Youtube, Line',
    media_cost: 20000000,
    total_media_impressions: 10980392,
    target_buy_value: 110000000,
    target_footfall: 900,
    target_nc: 32,
    target_nc_buyer: 28,
    target_ec: 53,
    target_cpa: 2275000,
    target_cpo: 856471,
    target_cpm: 663,
    target_cpf: 80888,
    proposal_link: 'https://drive.google.com',
    photo_gallery_link: 'https://photos.google.com',
    end_of_activation_report_link: '',
    regional_approved: true,
    approval_date: '2026-09-18',
    remarks: 'High digital engagement and app install rates.',
    merch_required: false,
    merch_details: '',
    featured_cities: 'Vientiane',
    target_audience: 'Online Merchants',
    actual_filled: true,
    actual_cost: 72800000,
    actual_nc: 29,
    actual_ec: 42,
    actual_footfall: 750,
    actual_buy_value: 92000000,
    actual_impressions: 10980392,
    actual_cpo: 1025085,
    actual_cpa: 2510325,
    actual_cpm: 663,
    photo_urls: [
      'https://images.unsplash.com/photo-1523580494863-6f3031224c94?w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1519741497674-611481863552?w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=600&auto=format&fit=crop',
    ],
  },
];

// ── Local Storage Helpers ──────────────────────────────────────────────────
const LOCAL_EVENTS_KEY = 'easygold_events_v3';

export function getLocalEvents(): Event[] {
  try {
    const raw = localStorage.getItem(LOCAL_EVENTS_KEY);
    if (!raw) {
      // Seed default demo events into storage
      localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(DEMO_EVENTS));
      return DEMO_EVENTS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEMO_EVENTS;
  } catch {
    return DEMO_EVENTS;
  }
}

export function saveLocalEvents(events: Event[]): void {
  try {
    localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(events));
  } catch (err) {
    console.error('Failed to save events locally:', err);
  }
}

// ── Row mappers ────────────────────────────────────────────────────────────

function parseJsonArray<T>(val: any, fallback: T[] = []): T[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const p = JSON.parse(val);
      if (Array.isArray(p)) return p;
    } catch {
      // split by comma if simple string
      return val.split(',').map(s => s.trim()).filter(Boolean) as unknown as T[];
    }
  }
  return fallback;
}

function mapEventRow(r: any): Event {
  const sd = r.start_date || '';
  const month = sd ? new Date(sd + 'T00:00:00').getMonth() + 1 : 0;
  const quarter = monthToQuarter(month || 7);

  const budgetMedia = Number(r.budget_media ?? r.media_cost ?? 0);
  const budgetProd = Number(r.budget_production ?? 0);
  const budgetSponsor = Number(r.budget_sponsor ?? 0);
  const budgetMerch = Number(r.budget_merch ?? 0);
  const budgetOp = Number(r.budget_operation ?? 0);
  const budgetOther = Number(r.budget_other ?? 0);
  const budgetTotal = Number(r.budget_total ?? (budgetMedia + budgetProd + budgetSponsor + budgetMerch + budgetOp + budgetOther));

  const merchList = parseJsonArray<EventMerchItem>(r.merch_items_list, []);
  const mediaSources = parseJsonArray<string>(r.media_sources, ['Facebook']);
  const photoUrls = parseJsonArray<string>(r.photo_urls, ['', '', '', '']);

  // Ensure 4 photo slots
  while (photoUrls.length < 4) photoUrls.push('');

  return {
    id: String(r.id ?? ''),
    created_at: r.created_at || '',
    updated_at: r.updated_at || '',
    year: Number(r.year) || new Date().getFullYear(),
    quarter,
    team: r.team || 'KPV',
    event_name: r.event_name || '',
    location: r.location || '',
    start_date: sd,
    end_date: r.end_date || '',
    start_time: r.start_time || '',
    end_time: r.end_time || '',
    activity_type: r.activity_type || '',
    objective: r.objective || 'Acquisition/Awareness',
    scale: r.scale || 'Medium',
    description: r.description || '',
    status: (r.status || 'pending') as any,

    budget_total: budgetTotal,
    budget_media: budgetMedia,
    budget_production: budgetProd,
    budget_sponsor: budgetSponsor,
    budget_merch: budgetMerch,
    budget_operation: budgetOp,
    budget_other: budgetOther,

    merch_items_list: merchList,
    media_sources: mediaSources,
    media_channels: r.media_channels || mediaSources.join(', '),
    media_cost: budgetMedia,
    total_media_impressions: Number(r.total_media_impressions ?? 0),

    target_buy_value: Number(r.target_buy_value ?? 0),
    target_footfall: Number(r.target_footfall ?? 0),
    target_nc: Number(r.target_nc ?? 0),
    target_nc_buyer: Number(r.target_nc_buyer ?? 0),
    target_ec: Number(r.target_ec ?? 0),
    target_download: Number(r.target_download ?? 0),
    target_kyc: Number(r.target_kyc ?? 0),
    target_cpa: Number(r.target_cpa ?? 0),
    target_cpo: Number(r.target_cpo ?? 0),
    target_cpm: Number(r.target_cpm ?? 0),
    target_cpf: Number(r.target_cpf ?? 0),

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

    actual_filled: Boolean(r.actual_filled),
    actual_cost: Number(r.actual_cost ?? 0),
    actual_media_cost: Number(r.actual_media_cost ?? 0),
    actual_production_cost: Number(r.actual_production_cost ?? 0),
    actual_sponsor_cost: Number(r.actual_sponsor_cost ?? 0),
    actual_merch_cost: Number(r.actual_merch_cost ?? 0),
    actual_operation_cost: Number(r.actual_operation_cost ?? 0),
    actual_other_cost: Number(r.actual_other_cost ?? 0),

    actual_footfall: Number(r.actual_footfall ?? 0),
    actual_nc: Number(r.actual_nc ?? 0),
    actual_nc_buyer: Number(r.actual_nc_buyer ?? 0),
    actual_ec: Number(r.actual_ec ?? 0),
    actual_download: Number(r.actual_download ?? 0),
    actual_kyc: Number(r.actual_kyc ?? 0),
    actual_buy_value: Number(r.actual_buy_value ?? 0),
    actual_impressions: Number(r.actual_impressions ?? 0),

    actual_cpa: Number(r.actual_cpa ?? 0),
    actual_cpo: Number(r.actual_cpo ?? 0),
    actual_cpm: Number(r.actual_cpm ?? 0),
    actual_cpf: Number(r.actual_cpf ?? 0),

    photo_urls: photoUrls,
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

// ── Auto-calculation Helpers ───────────────────────────────────────────────

/**
 * Autocalculate Cost-Per metrics from total cost and outcome volumes.
 */
export function computeCPMetrics(
  totalCost: number,
  nc: number,
  ec: number,
  ncBuyer: number,
  impressions: number,
  footfall: number,
  targetCpm?: number
) {
  const buyers = (ncBuyer > 0 ? ncBuyer : nc) + ec;
  const customers = nc + ec;

  // In Lao executive reporting, CPO measures cost per activated customer (NC + EC).
  const cpoBase = customers > 0 ? customers : (buyers > 0 ? buyers : 0);

  // CPM: In Lao BTL reporting, CPM is sometimes entered as cost per single impression
  // (e.g. 64 or 20 LAK) and sometimes as international Cost Per Mille (x1000).
  // If targetCpm is specified and < 500 LAK, preserve cost-per-impression scaling;
  // otherwise default to standard Cost Per Mille (per 1,000 impressions).
  let cpm = 0;
  if (impressions > 0) {
    const rawPerImpression = totalCost / impressions;
    if (targetCpm && targetCpm > 0 && targetCpm < 500) {
      cpm = Math.round(rawPerImpression);
    } else if (rawPerImpression >= 1000) {
      cpm = Math.round(rawPerImpression);
    } else {
      cpm = Math.round(rawPerImpression * 1000);
    }
  }

  return {
    cpa: nc > 0 ? Math.round(totalCost / nc) : 0,
    cpo: cpoBase > 0 ? Math.round(totalCost / cpoBase) : 0,
    cpm,
    cpf: footfall > 0 ? Math.round(totalCost / footfall) : 0,
  };
}

/**
 * Per requirement: "if user not fill that mean the plan is 100% execute".
 * Returns effective actual numbers: if actuals are recorded, returns them;
 * otherwise defaults to 100% execution of plan targets!
 */
export function getEffectiveActuals(event: Event) {
  if (event.actual_filled) {
    const cost = event.actual_cost && event.actual_cost > 0
      ? event.actual_cost
      : (event.budget_total || event.media_cost || 0);

    const nc = event.actual_nc ?? 0;
    const ec = event.actual_ec ?? 0;
    const buyers = (event.actual_nc_buyer && event.actual_nc_buyer > 0 ? event.actual_nc_buyer : nc) + ec;
    const footfall = event.actual_footfall ?? 0;
    const impressions = event.actual_impressions ?? event.total_media_impressions ?? 0;
    const buyVal = event.actual_buy_value ?? 0;

    const calc = computeCPMetrics(cost, nc, ec, event.actual_nc_buyer ?? 0, impressions, footfall, event.target_cpm);

    return {
      is100PctDefault: false,
      cost,
      nc,
      ec,
      customers: nc + ec,
      buyers,
      footfall,
      download: event.actual_download ?? 0,
      kyc: event.actual_kyc ?? 0,
      buy_value: buyVal,
      impressions,
      cpa: event.actual_cpa || calc.cpa,
      cpo: event.actual_cpo || calc.cpo,
      cpm: event.actual_cpm || calc.cpm,
      cpf: event.actual_cpf || calc.cpf,
      photos: event.photo_urls.filter(Boolean),
    };
  }

  // Not filled yet -> 100% Plan Execution default!
  const cost = event.budget_total > 0 ? event.budget_total : (event.media_cost || 0);
  const nc = event.target_nc || 0;
  const ec = event.target_ec || 0;
  const buyers = (event.target_nc_buyer && event.target_nc_buyer > 0 ? event.target_nc_buyer : nc) + ec;
  const footfall = event.target_footfall || 0;
  const impressions = event.total_media_impressions || 0;
  const buyVal = event.target_buy_value || 0;

  const calc = computeCPMetrics(cost, nc, ec, event.target_nc_buyer ?? 0, impressions, footfall, event.target_cpm);

  return {
    is100PctDefault: true,
    cost,
    nc,
    ec,
    customers: nc + ec,
    buyers,
    footfall,
    download: event.target_download ?? 0,
    kyc: event.target_kyc ?? 0,
    buy_value: buyVal,
    impressions,
    cpa: event.target_cpa || calc.cpa,
    cpo: event.target_cpo || calc.cpo,
    cpm: event.target_cpm || calc.cpm,
    cpf: event.target_cpf || calc.cpf,
    photos: event.photo_urls.filter(Boolean),
  };
}

/**
 * Compare actuals vs targets and return hit status + percentage over/under.
 */
export function computeEventHitSummary(event: Event) {
  const actual = getEffectiveActuals(event);

  const targetCustomers = (event.target_nc || 0) + (event.target_ec || 0);
  const custPct = targetCustomers > 0 ? (actual.customers / targetCustomers) * 100 : 100;
  const custBeat = custPct >= 100;

  const ncPct = event.target_nc > 0 ? (actual.nc / event.target_nc) * 100 : 100;
  const ncBeat = ncPct >= 100;

  // For costs and CP metrics: under target is positive (beat target)
  const cpoDiffPct = event.target_cpo > 0
    ? ((actual.cpo - event.target_cpo) / event.target_cpo) * 100
    : 0;
  const cpoBeat = cpoDiffPct <= 0;

  const cpaDiffPct = event.target_cpa > 0
    ? ((actual.cpa - event.target_cpa) / event.target_cpa) * 100
    : 0;
  const cpaBeat = cpaDiffPct <= 0;

  const buyValPct = event.target_buy_value > 0 ? (actual.buy_value / event.target_buy_value) * 100 : 100;
  const buyValBeat = buyValPct >= 100;

  let hitCount = 0;
  let totalTracked = 0;

  if (targetCustomers > 0) { totalTracked++; if (custBeat) hitCount++; }
  if (event.target_nc > 0) { totalTracked++; if (ncBeat) hitCount++; }
  if (event.target_cpo > 0) { totalTracked++; if (cpoBeat) hitCount++; }
  if (event.target_cpa > 0) { totalTracked++; if (cpaBeat) hitCount++; }
  if (event.target_buy_value > 0) { totalTracked++; if (buyValBeat) hitCount++; }

  return {
    actual,
    targetCustomers,
    custPct,
    custBeat,
    ncPct,
    ncBeat,
    cpoDiffPct,
    cpoBeat,
    cpaDiffPct,
    cpaBeat,
    buyValPct,
    buyValBeat,
    hitCount,
    totalTracked: totalTracked || 1,
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
    if (error || !data) {
      return [
        { id: '1', created_at: '', name: 'Trade Fair', description: 'Large booth or hall fair', sort_order: 1 },
        { id: '2', created_at: '', name: 'Community/Panel', description: 'Symposium or panel event', sort_order: 2 },
        { id: '3', created_at: '', name: 'Sponsorship', description: 'Sponsored event booth', sort_order: 3 },
        { id: '4', created_at: '', name: 'H2H Booth', description: 'Street or mall booth', sort_order: 4 },
        { id: '5', created_at: '', name: 'Event (indoor)', description: 'Indoor gathering', sort_order: 5 },
        { id: '6', created_at: '', name: 'Event (outdoor)', description: 'Outdoor gathering', sort_order: 6 },
        { id: '7', created_at: '', name: 'Wealth Talk', description: 'VIP investor seminar', sort_order: 7 },
        { id: '8', created_at: '', name: 'On Shop', description: 'In-store activation', sort_order: 8 },
      ];
    }
    return data.map((r: any) => ({
      id: r.id,
      created_at: r.created_at || '',
      name: r.name || '',
      description: r.description || '',
      sort_order: Number(r.sort_order) || 0,
    }));
  } catch {
    return [
      { id: '1', created_at: '', name: 'Trade Fair', description: 'Large booth or hall fair', sort_order: 1 },
      { id: '2', created_at: '', name: 'Community/Panel', description: 'Symposium or panel event', sort_order: 2 },
      { id: '3', created_at: '', name: 'Sponsorship', description: 'Sponsored event booth', sort_order: 3 },
      { id: '4', created_at: '', name: 'H2H Booth', description: 'Street or mall booth', sort_order: 4 },
      { id: '5', created_at: '', name: 'Event (indoor)', description: 'Indoor gathering', sort_order: 5 },
      { id: '6', created_at: '', name: 'Event (outdoor)', description: 'Outdoor gathering', sort_order: 6 },
      { id: '7', created_at: '', name: 'Wealth Talk', description: 'VIP investor seminar', sort_order: 7 },
      { id: '8', created_at: '', name: 'On Shop', description: 'In-store activation', sort_order: 8 },
    ];
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
    void writeAuditLog('event_type.create', { name: data.name, description: data.description, sort_order: data.sort_order }, 'success');
    return {
      data: { id: data.id, created_at: data.created_at, name: data.name, description: data.description || '', sort_order: data.sort_order },
      error: null,
    };
  } catch (err) {
    return { data: null, error: err };
  }
}

export async function updateEventType(
  id: string,
  oldName: string,
  updates: { name: string; description?: string; sort_order?: number }
): Promise<{ error: any }> {
  try {
    const newName = updates.name.trim();
    const { error: typeErr } = await supabase
      .from('event_types')
      .update({ name: newName, description: updates.description ?? '', sort_order: updates.sort_order ?? 0 })
      .eq('id', id);
    if (typeErr) return { error: typeErr };

    if (newName !== oldName) {
      await supabase.from('events').update({ activity_type: newName }).eq('activity_type', oldName);
      await supabase.from('event_targets').update({ activity_type: newName }).eq('activity_type', oldName);
    }
    void writeAuditLog('event_type.update', { id, oldName, newName }, 'success');
    return { error: null };
  } catch (err) {
    return { error: err };
  }
}

export async function deleteEventType(id: string): Promise<{ error: any }> {
  try {
    const { error } = await supabase.from('event_types').delete().eq('id', id);
    void writeAuditLog('event_type.delete', { id }, error ? 'error' : 'success');
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
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('__timeout__')), 6000)),
    ]);

    if (!error && data && data.length > 0) {
      const mapped = data.map(mapEventRow);
      // Merge with local storage cache to keep photo URLs or offline edits, and preserve local-only events
      const local = getLocalEvents();
      const remoteIds = new Set(mapped.map(m => m.id));
      const localOnly = local.filter(l => !remoteIds.has(l.id));
      const merged = [
        ...mapped.map(remoteEv => {
          const match = local.find(l => l.id === remoteEv.id);
          if (match) {
            return {
              ...remoteEv,
              photo_urls: (remoteEv.photo_urls && remoteEv.photo_urls.some(Boolean)) ? remoteEv.photo_urls : match.photo_urls,
              merch_items_list: remoteEv.merch_items_list.length > 0 ? remoteEv.merch_items_list : match.merch_items_list,
            };
          }
          return remoteEv;
        }),
        ...localOnly
      ];
      saveLocalEvents(merged);

      let filtered = [...merged];
      if (filters?.year) filtered = filtered.filter(e => e.year === filters.year);
      if (filters?.quarter) filtered = filtered.filter(e => e.quarter === filters.quarter);
      if (filters?.team) filtered = filtered.filter(e => e.team === filters.team);
      if (filters?.status) filtered = filtered.filter(e => e.status === filters.status);
      return { data: filtered, error: null };
    }

    // Fallback to local storage
    const local = getLocalEvents();
    let filtered = [...local];
    if (filters?.year) filtered = filtered.filter(e => e.year === filters.year);
    if (filters?.quarter) filtered = filtered.filter(e => e.quarter === filters.quarter);
    if (filters?.team) filtered = filtered.filter(e => e.team === filters.team);
    if (filters?.status) filtered = filtered.filter(e => e.status === filters.status);
    return { data: filtered, error: null };
  } catch {
    const local = getLocalEvents();
    let filtered = [...local];
    if (filters?.year) filtered = filtered.filter(e => e.year === filters.year);
    if (filters?.quarter) filtered = filtered.filter(e => e.quarter === filters.quarter);
    if (filters?.team) filtered = filtered.filter(e => e.team === filters.team);
    if (filters?.status) filtered = filtered.filter(e => e.status === filters.status);
    return { data: filtered, error: null };
  }
}

export async function fetchEventById(id: string): Promise<Event | null> {
  try {
    const { data, error } = await supabase.from('events').select('*').eq('id', id).maybeSingle();
    if (!error && data) return mapEventRow(data);
    const local = getLocalEvents();
    return local.find(e => e.id === id) || null;
  } catch {
    const local = getLocalEvents();
    return local.find(e => e.id === id) || null;
  }
}

export async function createEvent(
  payload: Omit<Event, 'id' | 'created_at' | 'updated_at' | 'quarter'>
): Promise<{ data: Event | null; error: any }> {
  const newId = `ev-${Date.now()}`;
  const now = new Date().toISOString();
  const quarter = monthToQuarter(payload.start_date ? new Date(payload.start_date).getMonth() + 1 : 7);
  const year = payload.start_date ? new Date(payload.start_date).getFullYear() : (payload.year || THIS_YEAR);

  const localEvent: Event = {
    ...payload,
    id: newId,
    year,
    quarter,
    end_date: payload.end_date || payload.start_date,
    created_at: now,
    updated_at: now,
  };

  // 1. Save to local storage first for immediate instant responsiveness
  const currentLocal = getLocalEvents();
  saveLocalEvents([localEvent, ...currentLocal.filter(e => e.id !== newId)]);
  void writeAuditLog('event.create', {
    id: localEvent.id,
    event_name: localEvent.event_name,
    activity_type: localEvent.activity_type,
    team: localEvent.team,
    start_date: localEvent.start_date,
    end_date: localEvent.end_date,
    budget_total: localEvent.budget_total,
    status: localEvent.status,
  }, 'success', localEvent.team);

  // 2. Best-effort DB insert
  try {
    const dbPayload: any = {
      ...payload,
      year,
      quarter,
      end_date: payload.end_date || payload.start_date,
      approval_date: payload.approval_date || null,
      start_time: payload.start_time || '',
      end_time: payload.end_time || '',
      media_sources: JSON.stringify(payload.media_sources || []),
      merch_items_list: JSON.stringify(payload.merch_items_list || []),
      photo_urls: JSON.stringify(payload.photo_urls || []),
    };

    let { data, error } = await supabase.from('events').insert([dbPayload]).select().single();

    // If check constraint fails on status 'pending', retry with 'active' (in case migration v3 has not been run yet)
    if (error && error.message && error.message.includes('events_status_check')) {
      console.warn('Retrying insert with status="active" for older schema compatibility...');
      dbPayload.status = 'active';
      const retry = await supabase.from('events').insert([dbPayload]).select().single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('Supabase createEvent error:', error);
      // Return localEvent so the UI never breaks, but log error
      return { data: localEvent, error };
    }

    if (data) {
      const mapped = mapEventRow(data);
      // Update local storage with real DB id
      saveLocalEvents([mapped, ...currentLocal.filter(e => e.id !== newId)]);
      return { data: mapped, error: null };
    }
  } catch (err: any) {
    console.error('DB createEvent exception:', err);
    return { data: localEvent, error: err };
  }

  return { data: localEvent, error: null };
}

export async function updateEvent(
  id: string,
  payload: Partial<Omit<Event, 'id' | 'created_at' | 'updated_at' | 'quarter'>>
): Promise<{ data: Event | null; error: any }> {
  const now = new Date().toISOString();
  // 1. Update in local storage
  const currentLocal = getLocalEvents();
  let updatedLocal: Event | null = null;
  const nextList = currentLocal.map(ev => {
    if (ev.id === id) {
      const start_date = payload.start_date || ev.start_date;
      const quarter = start_date ? monthToQuarter(new Date(start_date).getMonth() + 1) : ev.quarter;
      const year = start_date ? new Date(start_date).getFullYear() : (payload.year || ev.year);
      updatedLocal = {
        ...ev,
        ...payload,
        year,
        quarter,
        updated_at: now,
      };
      return updatedLocal;
    }
    return ev;
  });
  saveLocalEvents(nextList);
  const existing = currentLocal.find(e => e.id === id);
  const targetTeam = payload.team || existing?.team || '';
  const targetName = payload.event_name || existing?.event_name || '';
  void writeAuditLog('event.update', {
    id,
    event_name: targetName,
    team: targetTeam,
    actual_filled: payload.actual_filled ?? existing?.actual_filled,
    budget_total: payload.budget_total ?? existing?.budget_total,
    actual_cost: payload.actual_cost ?? existing?.actual_cost,
    status: payload.status ?? existing?.status,
    fields: Object.keys(payload),
  }, 'success', targetTeam);

  // 2. Best-effort DB update
  try {
    const dbPayload: any = { ...payload };
    if (payload.start_date) {
      dbPayload.quarter = monthToQuarter(new Date(payload.start_date).getMonth() + 1);
      dbPayload.year = new Date(payload.start_date).getFullYear();
    }
    if (payload.approval_date === '') dbPayload.approval_date = null;
    if (payload.media_sources) dbPayload.media_sources = JSON.stringify(payload.media_sources);
    if (payload.merch_items_list) dbPayload.merch_items_list = JSON.stringify(payload.merch_items_list);
    if (payload.photo_urls) dbPayload.photo_urls = JSON.stringify(payload.photo_urls);

    let { data, error } = await supabase.from('events').update(dbPayload).eq('id', id).select().single();
    if (error && error.message && error.message.includes('events_status_check') && dbPayload.status === 'pending') {
      dbPayload.status = 'active';
      const retry = await supabase.from('events').update(dbPayload).eq('id', id).select().single();
      data = retry.data;
      error = retry.error;
    }

    if (!error && data) {
      const mapped = mapEventRow(data);
      saveLocalEvents(nextList.map(e => e.id === id ? mapped : e));
      return { data: mapped, error: null };
    }
    if (error) {
      console.error('Supabase updateEvent error:', error);
      return { data: updatedLocal, error };
    }
  } catch (err: any) {
    console.error('DB updateEvent fallback:', err);
    return { data: updatedLocal, error: err };
  }

  return { data: updatedLocal, error: null };
}

export async function deleteEvent(id: string): Promise<{ error: any }> {
  // 1. Remove from local storage
  const currentLocal = getLocalEvents();
  const toDelete = currentLocal.find(e => e.id === id);
  saveLocalEvents(currentLocal.filter(e => e.id !== id));
  void writeAuditLog('event.delete', {
    id,
    event_name: toDelete?.event_name || '',
    team: toDelete?.team || '',
  }, 'success', toDelete?.team || '');

  // 2. Best-effort DB delete
  try {
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (error) console.warn('DB deleteEvent:', error);
    return { error: null };
  } catch {
    return { error: null };
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

  // If actuals were directly recorded on the event, give priority to those
  if (event.actual_filled) {
    const cost = event.actual_cost && event.actual_cost > 0
      ? event.actual_cost
      : (total_cost_from_subs + (event.budget_total || event.media_cost || 0));
    const nc = event.actual_nc || total_nc;
    const ec = event.actual_ec || total_ec;
    const buyers = (event.actual_nc_buyer ? event.actual_nc_buyer : nc) + ec;
    const bv = event.actual_buy_value || total_buy_value;
    const ff = event.actual_footfall || total_footfall;
    const imp = event.actual_impressions || event.total_media_impressions || 0;

    return {
      total_cost_from_subs,
      total_cost: cost,
      total_nc: nc,
      total_ec: ec,
      total_buyers: buyers,
      total_buy_value: bv,
      total_footfall: ff,
      cpa: event.actual_cpa || (nc > 0 ? cost / nc : 0),
      cpo: event.actual_cpo || (buyers > 0 ? cost / buyers : 0),
      cpm: event.actual_cpm || (imp > 0 ? (cost / imp) * 1000 : 0),
      cpf: event.actual_cpf || (ff > 0 ? cost / ff : 0),
      pct_nc: event.target_nc > 0 ? (nc / event.target_nc) * 100 : 0,
      pct_ec: event.target_ec > 0 ? (ec / event.target_ec) * 100 : 0,
      pct_buy_value: event.target_buy_value > 0 ? (bv / event.target_buy_value) * 100 : 0,
      linked_count: subs.length,
    };
  }

  const total_cost = total_cost_from_subs + (event.budget_total || event.media_cost || 0);
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

export const fmtLAK = (n: number) => `₭${Math.round(n).toLocaleString('en-US')}`;
export const fmtLAKShort = (n: number): string => {
  if (n >= 1_000_000_000) return `K${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `K${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `K${Math.round(n / 1_000)}K`;
  return `K${Math.round(n).toLocaleString('en-US')}`;
};
export const fmtPct = (n: number): string => `${Math.round(n)}%`;

export const statusColor = (s: string) =>
  s === 'completed' ? 'var(--green)' :
  s === 'cancelled' ? 'var(--red)' :
  s === 'active' ? 'var(--blue)' :
  'var(--gold)'; // pending

export const statusLabel = (s: string) =>
  s === 'completed' ? 'Completed' :
  s === 'cancelled' ? 'Cancelled' :
  s === 'active' ? 'Active' :
  'Pending';

export const scaleColor = (s: string) => {
  const norm = (s || '').toLowerCase();
  if (norm.includes('large') && !norm.includes('med')) return '#b83a38'; // red
  if (norm.includes('boundary') || norm.includes('med/large')) return '#6d297a'; // purple
  if (norm.includes('medium')) return '#b8770a'; // amber/gold
  if (norm.includes('small')) return '#197a48'; // green
  return 'var(--blue)';
};

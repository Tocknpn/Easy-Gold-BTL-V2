import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Event, EventType, EventMerchItem, CustomListOptions } from '../lib/events';
import {
  fetchEvents, createEvent, updateEvent, deleteEvent,
  fetchEventTypes, createEventType, deleteEventType,
  computeEventHitSummary, computeCPMetrics,
  getCustomListOptions, saveCustomListOptions, DEFAULT_LIST_OPTIONS,
  EVENT_STATUSES,
  fmtLAK, fmtLAKShort, fmtPct, statusColor, statusLabel, scaleColor, blankEvent,
} from '../lib/events';
import { fetchMerchCatalog } from '../lib/submissions';
import type { MerchItem } from '../lib/submissions';

const THIS_YEAR = new Date().getFullYear();
const DRAFT_KEY = 'easygold_event_plan_draft_v2';

const labelDate = (s: string) => {
  if (!s) return '—';
  const parts = s.split('T')[0].split('-');
  if (parts.length === 3) {
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
    }
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
  }
  return s;
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function FormattedNumberInput({
  value,
  onChange,
  placeholder,
  readOnly = false,
  style = {},
}: {
  value: number;
  onChange?: (val: number) => void;
  placeholder?: string;
  readOnly?: boolean;
  style?: React.CSSProperties;
}) {
  const [localStr, setLocalStr] = useState(() => (value === 0 ? '' : value.toLocaleString('en-US')));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setLocalStr(value === 0 ? '' : value.toLocaleString('en-US'));
    }
  }, [value, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnly || !onChange) return;
    const raw = e.target.value.replace(/,/g, '').trim();
    if (raw === '') {
      setLocalStr('');
      onChange(0);
      return;
    }
    if (/^\d+$/.test(raw)) {
      const num = Number(raw);
      setLocalStr(num.toLocaleString('en-US'));
      onChange(num);
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      readOnly={readOnly}
      placeholder={placeholder || '0'}
      value={isFocused && localStr === '' ? '' : (value === 0 && !isFocused ? '0' : localStr)}
      onFocus={() => {
        setIsFocused(true);
        if (value === 0) setLocalStr('');
      }}
      onBlur={() => {
        setIsFocused(false);
        setLocalStr(value === 0 ? '' : value.toLocaleString('en-US'));
      }}
      onChange={handleChange}
      style={{
        fontSize: '13px',
        padding: '8px 10px',
        fontFamily: 'var(--font-mono)',
        width: '100%',
        background: readOnly ? 'var(--ink)' : 'var(--surface)',
        cursor: readOnly ? 'not-allowed' : 'text',
        color: readOnly ? 'var(--txt-sub)' : 'var(--txt-main)',
        opacity: readOnly ? 0.9 : 1,
        ...style,
      }}
    />
  );
}

function KpiChip({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: 'var(--ink)', borderRadius: '10px', padding: '10px 14px', minWidth: 0, border: '1px solid var(--border)' }}>
      <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '3px' }}>{label}</div>
      <div style={{ fontSize: '18px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: color || 'var(--txt-main)' }}>{value}</div>
      {sub && <div style={{ fontSize: '10px', color: 'var(--txt-sub)', marginTop: '2px' }}>{sub}</div>}
    </div>
  );
}

function SectionTitle({ icon, title, badge }: { icon: string; title: string; badge?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '22px 0 14px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <i className={`fa-solid ${icon}`} style={{ color: 'var(--accent)', fontSize: '14px' }}></i>
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</span>
      </div>
      {badge && <span className="pill" style={{ fontSize: '10px', background: 'var(--ink)' }}>{badge}</span>}
    </div>
  );
}

function FF({ label, children, note }: { label: string; children: React.ReactNode; note?: string; preview?: string }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px', minHeight: '18px' }}>
        <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</label>
        {note && <span style={{ fontSize: '10px', color: 'var(--txt-sub)' }}>{note}</span>}
      </div>
      {children}
    </div>
  );
}

export default function EventManagement() {
  // ── Event list state ──
  const [events, setEvents] = useState<Event[]>([]);
  const [filterYear, setFilterYear] = useState<number>(THIS_YEAR);
  const [filterQuarter, setFilterQuarter] = useState<string>('');
  const [filterTeam, setFilterTeam] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // ── Dynamic Dropdown Lists Setup ──
  const [listOptions, setListOptions] = useState<CustomListOptions>(getCustomListOptions);
  const [showListSetup, setShowListSetup] = useState(false);
  const [listTab, setListTab] = useState<'types' | 'scales' | 'objectives' | 'teams' | 'media'>('types');
  const [newOptionVal, setNewOptionVal] = useState('');
  const [newOptionDesc, setNewOptionDesc] = useState('');

  // ── Event types master ──
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);

  // ── Merch catalog ──
  const [catalog, setCatalog] = useState<MerchItem[]>([]);

  // ── Detail / Plan Form ──
  const [selected, setSelected] = useState<Event | null>(null);
  const [viewingEvent, setViewingEvent] = useState<Event | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Omit<Event, 'id' | 'created_at' | 'updated_at' | 'quarter'>>(blankEvent(''));
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [draftSavedAt, setDraftSavedAt] = useState<string>('');
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);

  // ── Actuals Modal ──
  const [actualEvent, setActualEvent] = useState<Event | null>(null);
  const [actualData, setActualData] = useState<{
    actual_cost: number;
    actual_media_cost: number;
    actual_production_cost: number;
    actual_sponsor_cost: number;
    actual_merch_cost: number;
    actual_operation_cost: number;
    actual_other_cost: number;
    actual_footfall: number;
    actual_nc: number;
    actual_nc_buyer: number;
    actual_ec: number;
    actual_download: number;
    actual_kyc: number;
    actual_buy_value: number;
    actual_impressions: number;
    actual_status: 'pending' | 'active' | 'completed' | 'cancelled';
    photo_urls: string[];
  }>({
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
    actual_status: 'completed',
    photo_urls: ['', '', '', ''],
  });
  const [savingActuals, setSavingActuals] = useState(false);

  // ── Data Loaders ──
  const loadEvents = useCallback(async () => {
    const { data } = await fetchEvents({
      year: filterYear || undefined,
      quarter: filterQuarter || undefined,
      team: filterTeam || undefined,
      status: filterStatus || undefined,
    });
    setEvents(data);
  }, [filterYear, filterQuarter, filterTeam, filterStatus]);

  const loadTypes = useCallback(async () => {
    const types = await fetchEventTypes();
    setEventTypes(types);
    return types;
  }, []);

  useEffect(() => {
    loadEvents();
    loadTypes();
    fetchMerchCatalog().then(setCatalog);
  }, [loadEvents, loadTypes]);

  // ── Auto-save Draft to LocalStorage ──
  useEffect(() => {
    if (!isCreating) return;
    // Only auto-save if user entered at least something meaningful
    if (formData.event_name || formData.location || formData.budget_total > 0 || formData.target_nc > 0) {
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ data: formData, time: now }));
        setDraftSavedAt(now);
      } catch {
        // ignore
      }
    }
  }, [formData, isCreating]);

  // ── Form helpers ──
  const setField = <K extends keyof typeof formData>(k: K, v: typeof formData[K]) => {
    setFormData(prev => {
      const next = { ...prev, [k]: v };
      // Auto-sum budget total when any breakdown cost changes
      if (k.startsWith('budget_') && k !== 'budget_total') {
        const total =
          (Number(k === 'budget_media' ? v : next.budget_media) || 0) +
          (Number(k === 'budget_production' ? v : next.budget_production) || 0) +
          (Number(k === 'budget_sponsor' ? v : next.budget_sponsor) || 0) +
          (Number(k === 'budget_merch' ? v : next.budget_merch) || 0) +
          (Number(k === 'budget_operation' ? v : next.budget_operation) || 0) +
          (Number(k === 'budget_other' ? v : next.budget_other) || 0);
        next.budget_total = total;
        next.media_cost = Number(next.budget_media) || 0;
      }
      return next;
    });
  };

  // Toggle media sources
  const toggleMediaSource = (src: string) => {
    setFormData(prev => {
      const exists = prev.media_sources.includes(src);
      const nextSources = exists
        ? prev.media_sources.filter(s => s !== src)
        : [...prev.media_sources, src];
      return {
        ...prev,
        media_sources: nextSources,
        media_channels: nextSources.join(', '),
      };
    });
  };

  // Merch items helpers — auto-recalculate Merch Cost and Budget Total
  const recalculateMerchCost = (items: EventMerchItem[]) => {
    return items.reduce((acc, m) => acc + ((Number(m.qty) || 0) * (Number(m.cpu) || 0)), 0);
  };

  const addMerchRow = (defaultName = '') => {
    const catItem = catalog.find(c => c.name === defaultName);
    const cpu = catItem?.cpu || 0;
    const newItem: EventMerchItem = {
      name: defaultName || (catalog[0]?.name || 'Merch Item'),
      qty: 0, // Defaults to 0 and ready to change
      cpu: cpu,
      total: 0,
    };
    setFormData(prev => {
      const nextList = [...prev.merch_items_list, newItem];
      const merchCost = recalculateMerchCost(nextList);
      const totalBudget =
        (Number(prev.budget_media) || 0) +
        (Number(prev.budget_production) || 0) +
        (Number(prev.budget_sponsor) || 0) +
        merchCost +
        (Number(prev.budget_operation) || 0) +
        (Number(prev.budget_other) || 0);
      return {
        ...prev,
        merch_items_list: nextList,
        merch_required: true,
        budget_merch: merchCost,
        budget_total: totalBudget,
      };
    });
  };

  const updateMerchRow = (idx: number, patch: Partial<EventMerchItem>) => {
    setFormData(prev => {
      const updated = prev.merch_items_list.map((item, i) => {
        if (i !== idx) return item;
        const merged = { ...item, ...patch };
        if (patch.name && patch.cpu === undefined) {
          const match = catalog.find(c => c.name === patch.name);
          if (match) merged.cpu = match.cpu || 0;
        }
        merged.total = (Number(merged.qty) || 0) * (Number(merged.cpu) || 0);
        return merged;
      });
      const merchCost = recalculateMerchCost(updated);
      const totalBudget =
        (Number(prev.budget_media) || 0) +
        (Number(prev.budget_production) || 0) +
        (Number(prev.budget_sponsor) || 0) +
        merchCost +
        (Number(prev.budget_operation) || 0) +
        (Number(prev.budget_other) || 0);
      return {
        ...prev,
        merch_items_list: updated,
        budget_merch: merchCost,
        budget_total: totalBudget,
      };
    });
  };

  const removeMerchRow = (idx: number) => {
    setFormData(prev => {
      const updated = prev.merch_items_list.filter((_, i) => i !== idx);
      const merchCost = recalculateMerchCost(updated);
      const totalBudget =
        (Number(prev.budget_media) || 0) +
        (Number(prev.budget_production) || 0) +
        (Number(prev.budget_sponsor) || 0) +
        merchCost +
        (Number(prev.budget_operation) || 0) +
        (Number(prev.budget_other) || 0);
      return {
        ...prev,
        merch_items_list: updated,
        budget_merch: merchCost,
        budget_total: totalBudget,
      };
    });
  };

  const syncMerchToBudget = () => {
    const total = recalculateMerchCost(formData.merch_items_list);
    setField('budget_merch', total);
  };

  // ── Plan CRUD handlers ──
  const openCreate = async () => {
    const types = eventTypes.length > 0 ? eventTypes : await loadTypes();
    const blank = blankEvent(types[0]?.name || 'H2H Booth');

    // Check for existing draft
    try {
      const rawDraft = localStorage.getItem(DRAFT_KEY);
      if (rawDraft) {
        const parsed = JSON.parse(rawDraft);
        if (parsed?.data?.event_name || parsed?.data?.location) {
          setFormData({ ...blank, ...parsed.data });
          setDraftSavedAt(parsed.time || 'earlier');
          setHasRestoredDraft(true);
          setIsCreating(true);
          setIsEditing(false);
          setSelected(null);
          return;
        }
      }
    } catch {
      // ignore
    }

    setFormData(blank);
    setHasRestoredDraft(false);
    setDraftSavedAt('');
    setIsCreating(true);
    setIsEditing(false);
    setSelected(null);
  };

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    const types = eventTypes.length > 0 ? eventTypes : [];
    setFormData(blankEvent(types[0]?.name || 'H2H Booth'));
    setHasRestoredDraft(false);
    setDraftSavedAt('');
  };

  const startEdit = (ev: Event) => {
    setSelected(ev);
    const { id: _id, created_at: _ca, updated_at: _ua, quarter: _q, ...rest } = ev;
    setFormData(rest);
    setIsEditing(true);
    setIsCreating(false);
  };

  const handleSavePlan = async () => {
    if (!formData.event_name.trim()) { setSaveMsg('Event name is required.'); return; }
    if (!formData.start_date) { setSaveMsg('Start date is required.'); return; }
    setSaving(true); setSaveMsg('');

    const startYear = new Date(formData.start_date).getFullYear();
    const payloadWithDates = {
      ...formData,
      year: startYear || formData.year,
      end_date: formData.end_date || formData.start_date,
    };

    if (isCreating) {
      const { data, error } = await createEvent(payloadWithDates);
      if (data) {
        setEvents(prev => [data, ...prev.filter(e => e.id !== data.id)]);
        setSelected(data);
        if (data.year && filterYear !== data.year) {
          setFilterYear(data.year);
        }
        setIsCreating(false);
        localStorage.removeItem(DRAFT_KEY);
        setHasRestoredDraft(false);
      }
      if (error) {
        console.warn('DB createEvent note:', error);
      }
    } else if (isEditing && selected) {
      const { data, error } = await updateEvent(selected.id, payloadWithDates);
      if (data) {
        setEvents(prev => prev.map(e => e.id === data.id ? data : e));
        setSelected(data);
        if (viewingEvent?.id === data.id) setViewingEvent(data);
        setIsEditing(false);
      }
      if (error) {
        console.warn('DB updateEvent note:', error);
      }
    }
    setSaving(false);
  };

  const handleDelete = async (ev: Event) => {
    if (!window.confirm(`Delete "${ev.event_name}"? This cannot be undone.`)) return;
    const { error } = await deleteEvent(ev.id);
    if (error) { alert(`Delete failed: ${error.message}`); return; }
    setEvents(prev => prev.filter(e => e.id !== ev.id));
    if (selected?.id === ev.id) setSelected(null);
    if (viewingEvent?.id === ev.id) setViewingEvent(null);
  };

  // ── Actuals Recording Handlers ──
  const openActualsModal = (ev: Event) => {
    setActualEvent(ev);
    const photos = [...ev.photo_urls];
    while (photos.length < 4) photos.push('');

    setActualData({
      actual_cost: ev.actual_filled ? (ev.actual_cost || 0) : (ev.budget_total || ev.media_cost || 0),
      actual_media_cost: ev.actual_media_cost || ev.budget_media || 0,
      actual_production_cost: ev.actual_production_cost || ev.budget_production || 0,
      actual_sponsor_cost: ev.actual_sponsor_cost || ev.budget_sponsor || 0,
      actual_merch_cost: ev.actual_merch_cost || ev.budget_merch || 0,
      actual_operation_cost: ev.actual_operation_cost || ev.budget_operation || 0,
      actual_other_cost: ev.actual_other_cost || ev.budget_other || 0,
      actual_footfall: ev.actual_filled ? (ev.actual_footfall || 0) : (ev.target_footfall || 0),
      actual_nc: ev.actual_filled ? (ev.actual_nc || 0) : (ev.target_nc || 0),
      actual_nc_buyer: ev.actual_filled ? (ev.actual_nc_buyer || 0) : (ev.target_nc_buyer || 0),
      actual_ec: ev.actual_filled ? (ev.actual_ec || 0) : (ev.target_ec || 0),
      actual_download: ev.actual_filled ? (ev.actual_download || 0) : (ev.target_download || 0),
      actual_kyc: ev.actual_filled ? (ev.actual_kyc || 0) : (ev.target_kyc || 0),
      actual_buy_value: ev.actual_filled ? (ev.actual_buy_value || 0) : (ev.target_buy_value || 0),
      actual_impressions: ev.actual_filled ? (ev.actual_impressions || 0) : (ev.total_media_impressions || 0),
      actual_status: (ev.status === 'pending' ? 'completed' : ev.status) as any,
      photo_urls: photos,
    });
  };

  const copy100PctFromPlan = () => {
    if (!actualEvent) return;
    setActualData(prev => ({
      ...prev,
      actual_cost: actualEvent.budget_total || actualEvent.media_cost || 0,
      actual_media_cost: actualEvent.budget_media || 0,
      actual_production_cost: actualEvent.budget_production || 0,
      actual_sponsor_cost: actualEvent.budget_sponsor || 0,
      actual_merch_cost: actualEvent.budget_merch || 0,
      actual_operation_cost: actualEvent.budget_operation || 0,
      actual_other_cost: actualEvent.budget_other || 0,
      actual_footfall: actualEvent.target_footfall || 0,
      actual_nc: actualEvent.target_nc || 0,
      actual_nc_buyer: actualEvent.target_nc_buyer || 0,
      actual_ec: actualEvent.target_ec || 0,
      actual_download: actualEvent.target_download || 0,
      actual_kyc: actualEvent.target_kyc || 0,
      actual_buy_value: actualEvent.target_buy_value || 0,
      actual_impressions: actualEvent.total_media_impressions || 0,
      actual_status: 'completed',
    }));
  };

  const handleSaveActuals = async () => {
    if (!actualEvent) return;
    setSavingActuals(true);

    const cp = computeCPMetrics(
      actualData.actual_cost,
      actualData.actual_nc,
      actualData.actual_ec,
      actualData.actual_nc_buyer,
      actualData.actual_impressions,
      actualData.actual_footfall
    );

    const payload: Partial<Event> = {
      actual_filled: true,
      actual_cost: actualData.actual_cost,
      actual_media_cost: actualData.actual_media_cost,
      actual_production_cost: actualData.actual_production_cost,
      actual_sponsor_cost: actualData.actual_sponsor_cost,
      actual_merch_cost: actualData.actual_merch_cost,
      actual_operation_cost: actualData.actual_operation_cost,
      actual_other_cost: actualData.actual_other_cost,
      actual_footfall: actualData.actual_footfall,
      actual_nc: actualData.actual_nc,
      actual_nc_buyer: actualData.actual_nc_buyer,
      actual_ec: actualData.actual_ec,
      actual_download: actualData.actual_download,
      actual_kyc: actualData.actual_kyc,
      actual_buy_value: actualData.actual_buy_value,
      actual_impressions: actualData.actual_impressions,
      actual_cpa: cp.cpa,
      actual_cpo: cp.cpo,
      actual_cpm: cp.cpm,
      actual_cpf: cp.cpf,
      photo_urls: actualData.photo_urls,
      status: actualData.actual_status,
    };

    const { data, error } = await updateEvent(actualEvent.id, payload);
    if (!error && data) {
      setEvents(prev => prev.map(e => e.id === data.id ? data : e));
      if (selected?.id === data.id) setSelected(data);
      if (viewingEvent?.id === data.id) setViewingEvent(data);
    }
    setSavingActuals(false);
    setActualEvent(null);
  };

  // Live auto-calculated CP metrics inside Actuals modal
  const liveCP = useMemo(() => {
    return computeCPMetrics(
      actualData.actual_cost,
      actualData.actual_nc,
      actualData.actual_ec,
      actualData.actual_nc_buyer,
      actualData.actual_impressions,
      actualData.actual_footfall
    );
  }, [actualData]);

  // ── Custom Dropdown List Management Handlers ──
  const handleAddOption = async () => {
    if (!newOptionVal.trim()) return;
    const val = newOptionVal.trim();

    if (listTab === 'types') {
      await createEventType({ name: val, description: newOptionDesc.trim(), sort_order: eventTypes.length });
      setNewOptionVal('');
      setNewOptionDesc('');
      await loadTypes();
      return;
    }

    const next = { ...listOptions };
    if (listTab === 'scales' && !next.scales.includes(val)) {
      next.scales = [...next.scales, val];
    } else if (listTab === 'objectives' && !next.objectives.includes(val)) {
      next.objectives = [...next.objectives, val];
    } else if (listTab === 'teams' && !next.teams.includes(val)) {
      next.teams = [...next.teams, val];
    } else if (listTab === 'media' && !next.mediaSources.includes(val)) {
      next.mediaSources = [...next.mediaSources, val];
    }
    setListOptions(next);
    saveCustomListOptions(next);
    setNewOptionVal('');
    setNewOptionDesc('');
  };

  const handleDeleteOption = async (item: string) => {
    if (!window.confirm(`Remove "${item}" from this list?`)) return;

    if (listTab === 'types') {
      const match = eventTypes.find(t => t.name === item);
      if (match) {
        await deleteEventType(match.id);
        await loadTypes();
      }
      return;
    }

    const next = { ...listOptions };
    if (listTab === 'scales') {
      next.scales = next.scales.filter(s => s !== item);
    } else if (listTab === 'objectives') {
      next.objectives = next.objectives.filter(s => s !== item);
    } else if (listTab === 'teams') {
      next.teams = next.teams.filter(s => s !== item);
    } else if (listTab === 'media') {
      next.mediaSources = next.mediaSources.filter(s => s !== item);
    }
    setListOptions(next);
    saveCustomListOptions(next);
  };

  const handleResetDefaults = () => {
    if (!window.confirm('Reset this list to system default options?')) return;
    const next = { ...listOptions };
    if (listTab === 'scales') next.scales = [...DEFAULT_LIST_OPTIONS.scales];
    if (listTab === 'objectives') next.objectives = [...DEFAULT_LIST_OPTIONS.objectives];
    if (listTab === 'teams') next.teams = [...DEFAULT_LIST_OPTIONS.teams];
    if (listTab === 'media') next.mediaSources = [...DEFAULT_LIST_OPTIONS.mediaSources];
    setListOptions(next);
    saveCustomListOptions(next);
  };

  const showForm = isCreating || isEditing;

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', paddingBottom: '60px' }}>
      {/* ── Top Bar / Action Controls ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>🎪 Event Management & Activation Plans</span>
            <span className="pill pill-gold" style={{ fontSize: '11px' }}>{events.length} Plans</span>
          </h2>
          <div style={{ fontSize: '12px', color: 'var(--txt-sub)' }}>
            Set up Event Plans, configure breakdown budgets & merch, track targets, and record actual event executions.
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            className={`btn ${viewMode === 'cards' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '12px', padding: '6px 12px' }}
            onClick={() => setViewMode('cards')}
            title="Card Grid View"
          >
            <i className="fa-solid fa-grid-2"></i> Cards
          </button>
          <button
            className={`btn ${viewMode === 'table' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '12px', padding: '6px 12px' }}
            onClick={() => setViewMode('table')}
            title="Table View"
          >
            <i className="fa-solid fa-list"></i> Table
          </button>

          {/* List Options Setup Modal Button (Replaces Event Types & removed unused KPI Targets button) */}
          <button
            className="btn btn-ghost"
            style={{ fontSize: '12px', padding: '6px 12px', border: '1px solid var(--border)', background: 'var(--surface)' }}
            onClick={() => setShowListSetup(true)}
            title="Configure Dropdown Lists (Activity Types, Scales, Objectives, Teams, Media)"
          >
            <i className="fa-solid fa-sliders" style={{ color: 'var(--accent)' }}></i> List Setup
          </button>

          <button
            className="btn btn-primary"
            style={{ fontSize: '12px', padding: '7px 18px', background: 'linear-gradient(135deg, var(--accent), #2563eb)' }}
            onClick={openCreate}
          >
            <i className="fa-solid fa-plus"></i> Set Up Event Plan
          </button>
        </div>
      </div>

      {/* ── Filters bar ── */}
      <div className="card" style={{ marginBottom: '18px', padding: '12px 18px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))} style={{ fontSize: '12px', padding: '6px 10px', width: 'auto' }}>
          {[2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={filterQuarter} onChange={e => setFilterQuarter(e.target.value)} style={{ fontSize: '12px', padding: '6px 10px', width: 'auto' }}>
          <option value="">All Quarters</option>
          {['Q1', 'Q2', 'Q3', 'Q4'].map(q => <option key={q} value={q}>{q}</option>)}
        </select>
        <select value={filterTeam} onChange={e => setFilterTeam(e.target.value)} style={{ fontSize: '12px', padding: '6px 10px', width: 'auto' }}>
          <option value="">All Teams</option>
          {listOptions.teams.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ fontSize: '12px', padding: '6px 10px', width: 'auto' }}>
          <option value="">All Statuses</option>
          {EVENT_STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </select>
        <button className="btn btn-ghost" onClick={loadEvents} style={{ fontSize: '12px', padding: '6px 12px', marginLeft: 'auto' }}>
          <i className="fa-solid fa-rotate-right"></i> Refresh
        </button>
      </div>

      {/* ══ DYNAMIC DROPDOWN LIST OPTIONS SETUP MODAL ══ */}
      {showListSetup && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,15,30,0.8)', zIndex: 1250, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={e => { if (e.target === e.currentTarget) setShowListSetup(false); }}
        >
          <div style={{ background: 'var(--surface)', borderRadius: '14px', width: '100%', maxWidth: '780px', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow)', border: '1px solid var(--border)' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fa-solid fa-sliders" style={{ color: 'var(--accent)' }}></i>
                  Dropdown Lists Configuration
                </h3>
                <div style={{ fontSize: '12px', color: 'var(--txt-sub)', marginTop: '2px' }}>
                  Manage choices and options for all dropdown fields used across Event Management.
                </div>
              </div>
              <button onClick={() => setShowListSetup(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: 'var(--txt-sub)' }}>×</button>
            </div>

            {/* List Selector Tabs */}
            <div style={{ display: 'flex', gap: '6px', padding: '12px 22px', background: 'var(--ink)', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
              <button
                className={`btn ${listTab === 'types' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: '12px', padding: '6px 12px' }}
                onClick={() => setListTab('types')}
              >
                Activity Types ({eventTypes.length})
              </button>
              <button
                className={`btn ${listTab === 'scales' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: '12px', padding: '6px 12px' }}
                onClick={() => setListTab('scales')}
              >
                Scales ({listOptions.scales.length})
              </button>
              <button
                className={`btn ${listTab === 'objectives' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: '12px', padding: '6px 12px' }}
                onClick={() => setListTab('objectives')}
              >
                Objectives ({listOptions.objectives.length})
              </button>
              <button
                className={`btn ${listTab === 'teams' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: '12px', padding: '6px 12px' }}
                onClick={() => setListTab('teams')}
              >
                Teams ({listOptions.teams.length})
              </button>
              <button
                className={`btn ${listTab === 'media' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: '12px', padding: '6px 12px' }}
                onClick={() => setListTab('media')}
              >
                Media Channels ({listOptions.mediaSources.length})
              </button>
            </div>

            <div style={{ padding: '20px 22px' }}>
              {/* Add item bar */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
                <input
                  value={newOptionVal}
                  onChange={e => setNewOptionVal(e.target.value)}
                  placeholder={`Add new ${listTab === 'types' ? 'Activity Type' : listTab === 'scales' ? 'Scale' : listTab === 'objectives' ? 'Objective' : listTab === 'teams' ? 'Team' : 'Media Channel'}…`}
                  style={{ fontSize: '12px', padding: '8px 12px', flex: 1 }}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddOption(); }}
                />
                {listTab === 'types' && (
                  <input
                    value={newOptionDesc}
                    onChange={e => setNewOptionDesc(e.target.value)}
                    placeholder="Description (optional)"
                    style={{ fontSize: '12px', padding: '8px 12px', flex: 1 }}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddOption(); }}
                  />
                )}
                <button className="btn btn-primary" onClick={handleAddOption} style={{ fontSize: '12px', padding: '8px 16px', whiteSpace: 'nowrap' }}>
                  <i className="fa-solid fa-plus"></i> Add
                </button>
              </div>

              {/* Items List Chips */}
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', marginBottom: '10px' }}>
                Active Options:
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '22px' }}>
                {listTab === 'types' ? (
                  eventTypes.map(t => (
                    <span key={t.id} className="pill pill-blue" style={{ fontSize: '12px', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      <strong>{t.name}</strong>
                      {t.description && <span style={{ opacity: 0.7, fontSize: '10px' }}>({t.description})</span>}
                      <button onClick={() => handleDeleteOption(t.name)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 0, fontSize: '14px' }} title="Delete type">×</button>
                    </span>
                  ))
                ) : (
                  (listTab === 'scales' ? listOptions.scales :
                   listTab === 'objectives' ? listOptions.objectives :
                   listTab === 'teams' ? listOptions.teams :
                   listOptions.mediaSources).map(item => (
                    <span key={item} className="pill pill-gold" style={{ fontSize: '12px', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      <strong>{item}</strong>
                      <button onClick={() => handleDeleteOption(item)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 0, fontSize: '14px' }} title="Delete option">×</button>
                    </span>
                  ))
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
                {listTab !== 'types' ? (
                  <button type="button" className="btn btn-ghost" onClick={handleResetDefaults} style={{ fontSize: '11px', color: 'var(--txt-sub)' }}>
                    <i className="fa-solid fa-rotate-left"></i> Reset to defaults
                  </button>
                ) : <span />}
                <button className="btn btn-primary" onClick={() => setShowListSetup(false)} style={{ fontSize: '12px', padding: '6px 18px' }}>
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ EVENT PLAN POPUP MODAL (CREATE / EDIT) WITH DRAFT AUTO-SAVE ══ */}
      {showForm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(10, 15, 30, 0.82)',
            zIndex: 1200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={e => {
            // Prevent accidental closure when clicking backdrop
            if (e.target === e.currentTarget) {
              if (window.confirm('Close Event Plan setup? Your draft is safely auto-saved.')) {
                setIsCreating(false);
                setIsEditing(false);
              }
            }
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '1060px',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.5)',
              border: '1px solid var(--border)',
              overflow: 'hidden',
            }}
          >
            {/* Modal Header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg, var(--ink), var(--surface))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className={`fa-solid ${isCreating ? 'fa-plus-circle' : 'fa-pen'}`} style={{ color: 'var(--accent)' }}></i>
                    {isCreating ? 'Set Up New Event Plan' : `Edit Event Plan — ${formData.event_name}`}
                  </h3>
                  {isCreating && (
                    <span style={{ fontSize: '11px', color: 'var(--green)', background: 'rgba(34,197,94,0.12)', padding: '2px 8px', borderRadius: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <i className="fa-solid fa-cloud-arrow-up"></i>
                      {draftSavedAt ? `Auto-saved at ${draftSavedAt}` : 'Auto-saving draft'}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--txt-sub)', marginTop: '2px' }}>
                  Configure event details, breakdown budgets, merch list, media channels, and target metrics.
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {saveMsg && <span style={{ fontSize: '12px', color: 'var(--red)', marginRight: '6px' }}>{saveMsg}</span>}
                {isCreating && hasRestoredDraft && (
                  <button type="button" className="btn btn-ghost" onClick={clearDraft} style={{ fontSize: '11px', padding: '6px 10px', color: 'var(--txt-sub)' }} title="Clear restored draft and start fresh">
                    <i className="fa-solid fa-trash-can"></i> Clear Draft
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => { setIsCreating(false); setIsEditing(false); }}
                  style={{ fontSize: '12px', padding: '6px 14px' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSavePlan}
                  disabled={saving}
                  style={{ fontSize: '12px', padding: '7px 20px', background: 'linear-gradient(135deg, var(--accent), #2563eb)' }}
                >
                  {saving ? <><i className="fa-solid fa-spinner fa-spin"></i> Saving…</> : <><i className="fa-solid fa-floppy-disk"></i> Save Event Plan</>}
                </button>
              </div>
            </div>

            {/* Scrollable Content Body with smooth scroll */}
            <div style={{ padding: '22px 24px', overflowY: 'auto', flex: 1, scrollBehavior: 'smooth' }}>
              {/* 1. Event Info & Schedule */}
              <SectionTitle icon="fa-circle-info" title="1. Event Info & Schedule" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '14px' }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <FF label="Event Name *">
                    <input value={formData.event_name} onChange={e => setField('event_name', e.target.value)} placeholder="e.g. LGF 2026, Lao Wisdom, Trade Fair" style={{ fontSize: '13px', padding: '8px 12px' }} />
                  </FF>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <FF label="Location / Venue">
                    <input value={formData.location} onChange={e => setField('location', e.target.value)} placeholder="e.g. Lao-ITECC Exhibition Hall, Landmark Hotel" style={{ fontSize: '13px', padding: '8px 12px' }} />
                  </FF>
                </div>

                <FF label="Start Date *">
                  <input type="date" value={formData.start_date} onChange={e => setField('start_date', e.target.value)} style={{ fontSize: '13px', padding: '8px 12px' }} />
                </FF>
                <FF label="End Date">
                  <input type="date" value={formData.end_date} onChange={e => setField('end_date', e.target.value)} style={{ fontSize: '13px', padding: '8px 12px' }} />
                </FF>
                <FF label="Start Time (Optional)">
                  <input type="time" value={formData.start_time || ''} onChange={e => setField('start_time', e.target.value)} style={{ fontSize: '13px', padding: '8px 12px' }} />
                </FF>
                <FF label="End Time (Optional)">
                  <input type="time" value={formData.end_time || ''} onChange={e => setField('end_time', e.target.value)} style={{ fontSize: '13px', padding: '8px 12px' }} />
                </FF>

                <FF label="Team">
                  <select value={formData.team} onChange={e => setField('team', e.target.value)} style={{ fontSize: '13px', padding: '8px 12px' }}>
                    {listOptions.teams.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </FF>
                <FF label="Activity Type">
                  <select value={formData.activity_type} onChange={e => setField('activity_type', e.target.value)} style={{ fontSize: '13px', padding: '8px 12px' }}>
                    {eventTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                  </select>
                </FF>
                <FF label="Scale">
                  <select value={formData.scale} onChange={e => setField('scale', e.target.value)} style={{ fontSize: '13px', padding: '8px 12px' }}>
                    {listOptions.scales.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </FF>
                <FF label="Status (Defaults to Pending)">
                  <select value={formData.status} onChange={e => setField('status', e.target.value as any)} style={{ fontSize: '13px', padding: '8px 12px', fontWeight: 700, color: statusColor(formData.status) }}>
                    {EVENT_STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
                  </select>
                </FF>

                <div style={{ gridColumn: 'span 2' }}>
                  <FF label="Objective">
                    <select value={formData.objective} onChange={e => setField('objective', e.target.value)} style={{ fontSize: '13px', padding: '8px 12px' }}>
                      {listOptions.objectives.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </FF>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <FF label="Description / Objective Narrative">
                    <input value={formData.description} onChange={e => setField('description', e.target.value)} placeholder="Short pitch or narrative" style={{ fontSize: '13px', padding: '8px 12px' }} />
                  </FF>
                </div>
              </div>

              {/* 2. Total Budget Plan & Breakdown */}
              <SectionTitle
                icon="fa-coins"
                title="2. Total Budget Plan & Breakdown"
                badge={`Total: ${fmtLAK(formData.budget_total)}`}
              />
              <div style={{ background: 'var(--ink)', borderRadius: '12px', padding: '16px', border: '1px solid var(--border)', marginBottom: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px', marginBottom: '14px' }}>
                  <FF label="Media Cost (₭)">
                    <FormattedNumberInput value={formData.budget_media} onChange={v => setField('budget_media', v)} />
                  </FF>
                  <FF label="Prod. Cost (₭)">
                    <FormattedNumberInput value={formData.budget_production} onChange={v => setField('budget_production', v)} />
                  </FF>
                  <FF label="Sponsor Cost (₭)">
                    <FormattedNumberInput value={formData.budget_sponsor} onChange={v => setField('budget_sponsor', v)} />
                  </FF>
                  <FF label="Merch Cost (₭)" note="Linked below">
                    <FormattedNumberInput value={formData.budget_merch} readOnly={true} />
                  </FF>
                  <FF label="Op. Cost (₭)">
                    <FormattedNumberInput value={formData.budget_operation} onChange={v => setField('budget_operation', v)} />
                  </FF>
                  <FF label="Other Cost (₭)">
                    <FormattedNumberInput value={formData.budget_other} onChange={v => setField('budget_other', v)} />
                  </FF>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border)', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase' }}>Total Budget Plan Sum: </span>
                    <strong style={{ fontSize: '18px', color: 'var(--accent)', marginLeft: '8px' }}>{fmtLAK(formData.budget_total)}</strong>
                    <span style={{ fontSize: '12px', color: 'var(--txt-sub)', marginLeft: '8px' }}>({fmtLAKShort(formData.budget_total)})</span>
                  </div>
                  <span className="pill pill-gold" style={{ fontSize: '11px', padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <i className="fa-solid fa-link" style={{ color: 'var(--accent)' }}></i> Merch Cost Auto-linked from List
                  </span>
                </div>
              </div>

              {/* 3. Merch list and Items */}
              <SectionTitle
                icon="fa-box-archive"
                title="3. Merch List & Items for the Event"
                badge={`${formData.merch_items_list.length} item types`}
              />
              <div style={{ background: 'var(--surface)', borderRadius: '10px', padding: '14px', border: '1px solid var(--border)', marginBottom: '16px' }}>
                {formData.merch_items_list.length === 0 ? (
                  <div style={{ padding: '16px', textAlign: 'center', color: 'var(--txt-dim)', fontSize: '12px' }}>
                    No merch items added yet. Click "+ Add from Catalog…" or "+ Add Merch Item" to specify merchandise for this event.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto', marginBottom: '12px' }}>
                    <table className="data-table compact" style={{ marginTop: 0 }}>
                      <thead>
                        <tr><th>Item Name</th><th style={{ width: '130px' }}>Qty</th><th style={{ width: '150px' }}>Cost per Unit (₭)</th><th style={{ width: '160px' }}>Total (₭)</th><th></th></tr>
                      </thead>
                      <tbody>
                        {formData.merch_items_list.map((item, idx) => (
                          <tr key={idx}>
                            <td>
                              <input
                                list={`catalog-list-${idx}`}
                                value={item.name}
                                onChange={e => updateMerchRow(idx, { name: e.target.value })}
                                placeholder="Select or enter item"
                                style={{ fontSize: '12px', padding: '5px 8px', width: '100%' }}
                              />
                              <datalist id={`catalog-list-${idx}`}>
                                {catalog.map(c => <option key={c.name} value={c.name}>{c.name} ({fmtLAKShort(c.cpu || 0)})</option>)}
                              </datalist>
                            </td>
                            <td>
                              <FormattedNumberInput
                                value={item.qty}
                                onChange={val => updateMerchRow(idx, { qty: val })}
                                placeholder="0"
                                style={{ fontSize: '12px', padding: '5px 8px' }}
                              />
                            </td>
                            <td>
                              <div style={{
                                background: 'var(--ink)',
                                border: '1px solid var(--border)',
                                borderRadius: '6px',
                                padding: '5px 8px',
                                fontFamily: 'var(--font-mono)',
                                fontSize: '12px',
                                color: 'var(--txt-sub)',
                                cursor: 'not-allowed',
                                userSelect: 'none',
                                whiteSpace: 'nowrap'
                              }}>
                                {fmtLAK(item.cpu || 0)}
                              </div>
                            </td>
                            <td>
                              <strong style={{ fontSize: '12px', fontFamily: 'var(--font-mono)' }}>{fmtLAK((item.qty || 0) * (item.cpu || 0))}</strong>
                            </td>
                            <td>
                              <button type="button" className="btn btn-ghost" onClick={() => removeMerchRow(idx)} style={{ color: 'var(--red)', padding: '4px 8px', fontSize: '11px' }}>
                                <i className="fa-solid fa-trash"></i>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {catalog.length > 0 && (
                    <select
                      onChange={e => { if (e.target.value) { addMerchRow(e.target.value); e.target.value = ''; } }}
                      style={{ fontSize: '12px', padding: '6px 12px', width: 'auto', background: 'var(--surface)', border: '1px solid var(--accent)', color: 'var(--accent)', fontWeight: 600, borderRadius: '6px' }}
                      defaultValue=""
                    >
                      <option value="" disabled>+ Add from Catalog…</option>
                      {catalog.map(c => <option key={c.name} value={c.name}>{c.name} ({fmtLAKShort(c.cpu || 0)})</option>)}
                    </select>
                  )}
                  <button type="button" className="btn btn-ghost" onClick={() => addMerchRow()} style={{ fontSize: '12px', padding: '6px 12px', border: '1px solid var(--border)' }}>
                    <i className="fa-solid fa-plus"></i> Add Merch Item
                  </button>
                </div>
              </div>

              {/* 4. Media Sources & Target Impressions */}
              <SectionTitle icon="fa-bullhorn" title="4. Media Sources & Total Impression Target" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '14px', marginBottom: '16px' }}>
                <div style={{ gridColumn: 'span 3' }}>
                  <FF label="Media Sources (Multi-select)">
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {listOptions.mediaSources.map(src => {
                        const active = formData.media_sources.includes(src);
                        return (
                          <button
                            key={src}
                            type="button"
                            onClick={() => toggleMediaSource(src)}
                            style={{
                              padding: '6px 14px',
                              borderRadius: '20px',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                              background: active ? 'var(--accent-dim)' : 'var(--surface)',
                              color: active ? 'var(--accent)' : 'var(--txt-sub)',
                            }}
                          >
                            {active && <i className="fa-solid fa-check" style={{ marginRight: '6px' }}></i>}
                            {src}
                          </button>
                        );
                      })}
                    </div>
                  </FF>
                </div>
                <FF label="Target Media Impressions">
                  <FormattedNumberInput value={formData.total_media_impressions} onChange={v => setField('total_media_impressions', v)} placeholder="e.g. 1,000,000" />
                </FF>
              </div>

              {/* 5. Target Metrics (Field Boxes) */}
              <SectionTitle
                icon="fa-crosshairs"
                title="5. Target Metrics (Target NC, EC, Buy Value, CPA, CPO, CPM, CPF)"
                badge="Manual Benchmarks"
              />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
                <FF label="Target Buy Value (₭)">
                  <FormattedNumberInput value={formData.target_buy_value} onChange={v => setField('target_buy_value', v)} />
                </FF>
                <FF label="Target Footfall">
                  <FormattedNumberInput value={formData.target_footfall} onChange={v => setField('target_footfall', v)} />
                </FF>
                <FF label="Target NC (New Customers)">
                  <FormattedNumberInput value={formData.target_nc} onChange={v => setField('target_nc', v)} />
                </FF>
                <FF label="Target NC Buyer (Optional)">
                  <FormattedNumberInput value={formData.target_nc_buyer || 0} onChange={v => setField('target_nc_buyer', v)} />
                </FF>

                <FF label="Target EC (Existing Cust.)">
                  <FormattedNumberInput value={formData.target_ec} onChange={v => setField('target_ec', v)} />
                </FF>
                <FF label="Target Download">
                  <FormattedNumberInput value={formData.target_download || 0} onChange={v => setField('target_download', v)} />
                </FF>
                <FF label="Target KYC">
                  <FormattedNumberInput value={formData.target_kyc || 0} onChange={v => setField('target_kyc', v)} />
                </FF>
                <FF label="Target CPA (₭ / NC)">
                  <FormattedNumberInput value={formData.target_cpa} onChange={v => setField('target_cpa', v)} placeholder="e.g. 740,000" />
                </FF>

                <FF label="Target CPO (₭ / Order)">
                  <FormattedNumberInput value={formData.target_cpo} onChange={v => setField('target_cpo', v)} placeholder="e.g. 259,000" />
                </FF>
                <FF label="Target CPM (₭ / 1k Imp)">
                  <FormattedNumberInput value={formData.target_cpm} onChange={v => setField('target_cpm', v)} placeholder="e.g. 64" />
                </FF>
                <FF label="Target CPF (₭ / Footfall)">
                  <FormattedNumberInput value={formData.target_cpf} onChange={v => setField('target_cpf', v)} placeholder="e.g. 43,000" />
                </FF>
                <FF label="Proposal Google Drive Link">
                  <input value={formData.proposal_link} onChange={e => setField('proposal_link', e.target.value)} placeholder="https://drive.google.com/..." style={{ fontSize: '13px', padding: '8px 10px' }} />
                </FF>
              </div>
            </div>

            {/* Modal Sticky Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button className="btn btn-ghost" onClick={() => { setIsCreating(false); setIsEditing(false); }} style={{ fontSize: '13px', padding: '8px 16px' }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSavePlan} disabled={saving} style={{ fontSize: '13px', padding: '8px 24px', background: 'linear-gradient(135deg, var(--accent), #2563eb)' }}>
                <i className="fa-solid fa-floppy-disk"></i> Save Event Plan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ CARDS VIEW OF EVENT PLANS ══ */}
      {viewMode === 'cards' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '18px' }}>
          {events.map(ev => {
            const summary = computeEventHitSummary(ev);
            const actual = summary.actual;
            const teamColor = ev.team === 'Agency' ? 'var(--blue)' : ev.team === 'ESG' ? 'var(--green)' : 'var(--accent)';
            const scaleBg = scaleColor(ev.scale);

            return (
              <div
                key={ev.id}
                className="card"
                style={{
                  padding: 0,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  borderTop: `4px solid ${scaleBg}`,
                  transition: 'transform 0.18s ease, box-shadow 0.18s ease',
                }}
              >
                {/* Card Header */}
                <div style={{ padding: '16px 18px 12px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span className="pill" style={{ background: scaleBg, color: '#fff', fontSize: '10px', fontWeight: 800 }}>
                        {ev.scale.toUpperCase()} — {ev.activity_type}
                      </span>
                      <span className="pill" style={{ background: `${teamColor}22`, color: teamColor, fontSize: '10px' }}>
                        {ev.team}
                      </span>
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '99px', background: `${statusColor(ev.status)}22`, color: statusColor(ev.status), border: `1px solid ${statusColor(ev.status)}44` }}>
                      {statusLabel(ev.status)}
                    </span>
                  </div>

                  <h3 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: 800 }}>{ev.event_name}</h3>
                  <div style={{ fontSize: '12px', color: 'var(--txt-sub)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <span><i className="fa-regular fa-calendar" style={{ marginRight: '4px' }}></i>{labelDate(ev.start_date)} → {labelDate(ev.end_date)}</span>
                    {ev.location && <span><i className="fa-solid fa-location-dot" style={{ marginRight: '4px' }}></i>{ev.location}</span>}
                  </div>
                </div>

                {/* Key Metrics Snapshot */}
                <div style={{ padding: '14px 18px', flex: 1 }}>
                  {/* Budget & Spend */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px', paddingBottom: '8px', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase' }}>Total Spending Cost</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--txt-main)' }}>
                        {fmtLAKShort(actual.cost)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase' }}>Plan Budget</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--txt-sub)' }}>
                        {fmtLAKShort(ev.budget_total || ev.media_cost || 0)}
                      </div>
                    </div>
                  </div>

                  {/* Comparisons Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '10px', marginBottom: '12px' }}>
                    <div style={{ background: 'var(--ink)', padding: '8px 10px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '9px', color: 'var(--txt-dim)', fontWeight: 700 }}>CUSTOMERS (ACT/TGT)</div>
                      <div style={{ fontSize: '14px', fontWeight: 800 }}>
                        {actual.customers} / {summary.targetCustomers}
                      </div>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: summary.custBeat ? 'var(--green)' : 'var(--orange)' }}>
                        {fmtPct(summary.custPct)} {summary.custBeat ? '— beat target' : 'of target'}
                      </div>
                    </div>

                    <div style={{ background: 'var(--ink)', padding: '8px 10px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '9px', color: 'var(--txt-dim)', fontWeight: 700 }}>NEW CUST. (ACT/TGT)</div>
                      <div style={{ fontSize: '14px', fontWeight: 800 }}>
                        {actual.nc} / {ev.target_nc}
                      </div>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: summary.ncBeat ? 'var(--green)' : 'var(--orange)' }}>
                        {fmtPct(summary.ncPct)} {summary.ncBeat ? '— beat target' : 'of target'}
                      </div>
                    </div>

                    <div style={{ background: 'var(--ink)', padding: '8px 10px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '9px', color: 'var(--txt-dim)', fontWeight: 700 }}>CPO (ACT/TGT)</div>
                      <div style={{ fontSize: '12px', fontWeight: 800 }}>
                        {fmtLAKShort(actual.cpo)} / {fmtLAKShort(ev.target_cpo)}
                      </div>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: summary.cpoBeat ? 'var(--green)' : 'var(--orange)' }}>
                        {summary.cpoDiffPct > 0 ? `+${summary.cpoDiffPct.toFixed(1)}% over` : `${summary.cpoDiffPct.toFixed(1)}% under`} target
                      </div>
                    </div>

                    <div style={{ background: 'var(--ink)', padding: '8px 10px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '9px', color: 'var(--txt-dim)', fontWeight: 700 }}>CPA (ACT/TGT)</div>
                      <div style={{ fontSize: '12px', fontWeight: 800 }}>
                        {fmtLAKShort(actual.cpa)} / {fmtLAKShort(ev.target_cpa)}
                      </div>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: summary.cpaBeat ? 'var(--green)' : 'var(--orange)' }}>
                        {summary.cpaDiffPct > 0 ? `+${summary.cpaDiffPct.toFixed(1)}% over` : `${summary.cpaDiffPct.toFixed(1)}% under`} target
                      </div>
                    </div>
                  </div>

                  {/* Execution Status indicator */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--txt-sub)', marginBottom: '8px' }}>
                    <span>
                      {ev.actual_filled ? (
                        <span style={{ color: 'var(--green)', fontWeight: 700 }}>
                          <i className="fa-solid fa-circle-check" style={{ marginRight: '4px' }}></i>Actuals Recorded ({summary.hitCount}/{summary.totalTracked} Targets Hit)
                        </span>
                      ) : (
                        <span style={{ color: 'var(--gold)', fontWeight: 600 }}>
                          <i className="fa-solid fa-clock" style={{ marginRight: '4px' }}></i>100% Plan Execution (Auto-Default)
                        </span>
                      )}
                    </span>
                    {(ev.actual_cpm ?? 0) > 0 && <span style={{ fontWeight: 700 }}>CPM: {fmtLAKShort(actual.cpm)}</span>}
                  </div>

                  {/* 2x2 Photo Preview if available */}
                  {actual.photos.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', marginTop: '6px' }}>
                      {actual.photos.slice(0, 4).map((p, i) => (
                        <img
                          key={i}
                          src={p}
                          alt={`thumb-${i}`}
                          style={{ width: '100%', height: '50px', objectFit: 'cover', borderRadius: '4px' }}
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Card Actions (Fixed bottom-left buttons: View Details + Record/Edit Actuals with clear contrast) */}
                <div style={{ padding: '10px 14px', background: 'var(--ink)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {/* View Details / Full Info Button */}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setViewingEvent(ev)}
                      style={{
                        fontSize: '11px',
                        padding: '6px 11px',
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                        color: 'var(--txt-main)',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                      title="View Full Event Info & Metrics"
                    >
                      <i className="fa-solid fa-file-lines" style={{ color: 'var(--accent)' }}></i>
                      <span>Details</span>
                    </button>

                    {/* Record / Edit Actuals Button with crystal clear contrast */}
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => openActualsModal(ev)}
                      style={{
                        fontSize: '11px',
                        padding: '6px 11px',
                        background: ev.actual_filled ? '#0284c7' : 'linear-gradient(135deg, var(--accent), #2563eb)',
                        color: '#ffffff',
                        border: 'none',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                      title={ev.actual_filled ? 'Edit Recorded Actuals' : 'Record Actual Results'}
                    >
                      <i className={`fa-solid ${ev.actual_filled ? 'fa-pen-to-square' : 'fa-bolt'}`}></i>
                      <span>{ev.actual_filled ? 'Actuals' : 'Record'}</span>
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    {ev.proposal_link && (
                      <a href={ev.proposal_link} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ fontSize: '11px', padding: '5px 8px' }} title="Proposal Link">
                        <i className="fa-solid fa-file-pdf"></i>
                      </a>
                    )}
                    <button className="btn btn-ghost" onClick={() => startEdit(ev)} style={{ fontSize: '11px', padding: '5px 8px' }} title="Edit Plan">
                      <i className="fa-solid fa-pen"></i>
                    </button>
                    <button className="btn btn-ghost" onClick={() => handleDelete(ev)} style={{ fontSize: '11px', padding: '5px 8px', color: 'var(--red)' }} title="Delete Event">
                      <i className="fa-solid fa-trash"></i>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ══ TABLE VIEW OF EVENT PLANS ══ */}
      {viewMode === 'table' && (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="data-table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th>Event</th>
                <th>Dates</th>
                <th>Team</th>
                <th>Type & Scale</th>
                <th>Status</th>
                <th>Plan Budget</th>
                <th>Actual Spend</th>
                <th>NC (Act/Tgt)</th>
                <th>Customers</th>
                <th>CPA (Act/Tgt)</th>
                <th>CPO (Act/Tgt)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map(ev => {
                const s = computeEventHitSummary(ev);
                return (
                  <tr key={ev.id}>
                    <td>
                      <strong>{ev.event_name}</strong>
                      {ev.location && <div style={{ fontSize: '10px', color: 'var(--txt-sub)' }}>{ev.location}</div>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '11px' }}>
                      {labelDate(ev.start_date)} → {labelDate(ev.end_date)}
                    </td>
                    <td><span className="pill pill-gold">{ev.team}</span></td>
                    <td>
                      <span className="pill" style={{ background: scaleColor(ev.scale), color: '#fff', fontSize: '10px' }}>
                        {ev.scale} · {ev.activity_type}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: statusColor(ev.status) }}>
                        {statusLabel(ev.status)}
                      </span>
                    </td>
                    <td>{fmtLAKShort(ev.budget_total || ev.media_cost || 0)}</td>
                    <td><strong>{fmtLAKShort(s.actual.cost)}</strong></td>
                    <td>
                      <span style={{ color: s.ncBeat ? 'var(--green)' : 'var(--txt-main)', fontWeight: 700 }}>
                        {s.actual.nc} / {ev.target_nc}
                      </span>
                    </td>
                    <td>{s.actual.customers} / {s.targetCustomers}</td>
                    <td>{fmtLAKShort(s.actual.cpa)} / {fmtLAKShort(ev.target_cpa)}</td>
                    <td>{fmtLAKShort(s.actual.cpo)} / {fmtLAKShort(ev.target_cpo)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button className="btn btn-ghost" onClick={() => setViewingEvent(ev)} style={{ padding: '3px 8px', fontSize: '10px' }}>Details</button>
                        <button className="btn btn-ghost" onClick={() => openActualsModal(ev)} style={{ padding: '3px 8px', fontSize: '10px', color: 'var(--accent)' }}>Actuals</button>
                        <button className="btn btn-ghost" onClick={() => startEdit(ev)} style={{ padding: '3px 8px', fontSize: '10px' }}>Edit</button>
                        <button className="btn btn-ghost" onClick={() => handleDelete(ev)} style={{ padding: '3px 6px', fontSize: '10px', color: 'var(--red)' }}><i className="fa-solid fa-trash"></i></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ══ EXECUTIVE VIEW MODAL (EVENT DETAILS / FULL INFO) ══ */}
      {viewingEvent && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,15,30,0.82)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={e => { if (e.target === e.currentTarget) setViewingEvent(null); }}
        >
          <div style={{ background: 'var(--surface)', borderRadius: '16px', width: '100%', maxWidth: '960px', maxHeight: '92vh', overflowY: 'auto', boxShadow: 'var(--shadow)', border: '1px solid var(--border)' }}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg, var(--ink), var(--surface))', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="pill" style={{ background: scaleColor(viewingEvent.scale), color: '#fff', fontSize: '10px', fontWeight: 800 }}>
                    {viewingEvent.scale.toUpperCase()} — {viewingEvent.activity_type}
                  </span>
                  <span className="pill pill-gold">{viewingEvent.team}</span>
                  <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '99px', background: `${statusColor(viewingEvent.status)}22`, color: statusColor(viewingEvent.status) }}>
                    {statusLabel(viewingEvent.status)}
                  </span>
                </div>
                <h2 style={{ margin: '0 0 6px', fontSize: '22px', fontWeight: 800 }}>{viewingEvent.event_name}</h2>
                <div style={{ fontSize: '12px', color: 'var(--txt-sub)', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <span><i className="fa-regular fa-calendar" style={{ marginRight: '5px' }}></i>{labelDate(viewingEvent.start_date)} → {labelDate(viewingEvent.end_date)}</span>
                  {viewingEvent.location && <span><i className="fa-solid fa-location-dot" style={{ marginRight: '5px' }}></i>{viewingEvent.location}</span>}
                  {viewingEvent.objective && <span><i className="fa-solid fa-bullseye" style={{ marginRight: '5px' }}></i>{viewingEvent.objective}</span>}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {viewingEvent.proposal_link && (
                  <a href={viewingEvent.proposal_link} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ fontSize: '12px', padding: '6px 12px' }}>
                    <i className="fa-solid fa-arrow-up-right-from-square"></i> Proposal Link
                  </a>
                )}
                <button
                  className="btn btn-primary"
                  onClick={() => { const ev = viewingEvent; setViewingEvent(null); openActualsModal(ev); }}
                  style={{ fontSize: '12px', padding: '6px 14px', background: viewingEvent.actual_filled ? '#0284c7' : 'linear-gradient(135deg, var(--accent), #2563eb)' }}
                >
                  <i className="fa-solid fa-bolt"></i> {viewingEvent.actual_filled ? 'Edit Actuals' : 'Record Actuals'}
                </button>
                <button onClick={() => setViewingEvent(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', color: 'var(--txt-sub)', padding: '4px' }}>×</button>
              </div>
            </div>

            {/* Content */}
            <div style={{ padding: '22px 24px' }}>
              {/* Executive KPI Scorecard */}
              {(() => {
                const s = computeEventHitSummary(viewingEvent);
                const actual = s.actual;
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '22px' }}>
                    <KpiChip
                      label="Total Spend / Budget"
                      value={fmtLAKShort(actual.cost)}
                      sub={`Plan: ${fmtLAKShort(viewingEvent.budget_total || viewingEvent.media_cost || 0)}`}
                      color={actual.cost <= (viewingEvent.budget_total || viewingEvent.media_cost || 0) ? 'var(--green)' : 'var(--orange)'}
                    />
                    <KpiChip
                      label="New Customers (NC)"
                      value={`${actual.nc} / ${viewingEvent.target_nc}`}
                      sub={`${fmtPct(s.ncPct)} ${s.ncBeat ? '— beat target' : 'of target'}`}
                      color={s.ncBeat ? 'var(--green)' : 'var(--orange)'}
                    />
                    <KpiChip
                      label="Actual CPA (per NC)"
                      value={fmtLAKShort(actual.cpa)}
                      sub={`Target: ${fmtLAKShort(viewingEvent.target_cpa)}`}
                      color={s.cpaBeat ? 'var(--green)' : 'var(--orange)'}
                    />
                    <KpiChip
                      label="Actual CPO (per Buyer)"
                      value={fmtLAKShort(actual.cpo)}
                      sub={`Target: ${fmtLAKShort(viewingEvent.target_cpo)}`}
                      color={s.cpoBeat ? 'var(--green)' : 'var(--blue)'}
                    />
                  </div>
                );
              })()}

              {/* 2-Column Section: Budget Breakdown & Target vs Actual */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '20px', marginBottom: '22px' }}>
                {/* Left: Plan Budget Breakdown */}
                <div style={{ background: 'var(--ink)', borderRadius: '12px', padding: '16px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
                    <span><i className="fa-solid fa-coins" style={{ color: 'var(--accent)', marginRight: '6px' }}></i>Budget Plan Breakdown</span>
                    <strong style={{ color: 'var(--txt-main)' }}>{fmtLAK(viewingEvent.budget_total)}</strong>
                  </div>
                  <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px 0', color: 'var(--txt-sub)' }}>Media Cost</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtLAK(viewingEvent.budget_media)}</td></tr>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px 0', color: 'var(--txt-sub)' }}>Production Cost</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtLAK(viewingEvent.budget_production)}</td></tr>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px 0', color: 'var(--txt-sub)' }}>Sponsor Cost</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtLAK(viewingEvent.budget_sponsor)}</td></tr>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px 0', color: 'var(--txt-sub)' }}>Merch Cost</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtLAK(viewingEvent.budget_merch)}</td></tr>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px 0', color: 'var(--txt-sub)' }}>Operation Cost</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtLAK(viewingEvent.budget_operation)}</td></tr>
                      <tr><td style={{ padding: '6px 0', color: 'var(--txt-sub)' }}>Other Cost</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtLAK(viewingEvent.budget_other)}</td></tr>
                    </tbody>
                  </table>
                </div>

                {/* Right: Targets vs Actual Outcomes */}
                <div style={{ background: 'var(--ink)', borderRadius: '12px', padding: '16px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
                    <span><i className="fa-solid fa-chart-line" style={{ color: 'var(--accent)', marginRight: '6px' }}></i>Performance Targets</span>
                    <span style={{ fontSize: '11px', color: viewingEvent.actual_filled ? 'var(--green)' : 'var(--gold)' }}>
                      {viewingEvent.actual_filled ? 'Actuals Verified' : '100% Plan Default'}
                    </span>
                  </div>
                  <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 0', color: 'var(--txt-sub)' }}>Buy Value</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtLAKShort(viewingEvent.actual_filled ? (viewingEvent.actual_buy_value || 0) : viewingEvent.target_buy_value)} <span style={{ color: 'var(--txt-dim)', fontSize: '10px' }}>(Tgt: {fmtLAKShort(viewingEvent.target_buy_value)})</span></td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 0', color: 'var(--txt-sub)' }}>Footfall</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{viewingEvent.actual_filled ? (viewingEvent.actual_footfall || 0) : (viewingEvent.target_footfall || 0)} <span style={{ color: 'var(--txt-dim)', fontSize: '10px' }}>(Tgt: {viewingEvent.target_footfall || '—'})</span></td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 0', color: 'var(--txt-sub)' }}>Media Impressions</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtLAKShort(viewingEvent.actual_filled ? (viewingEvent.actual_impressions || 0) : viewingEvent.total_media_impressions)}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 0', color: 'var(--txt-sub)' }}>Existing Cust. (EC)</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{viewingEvent.actual_filled ? (viewingEvent.actual_ec || 0) : viewingEvent.target_ec}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '6px 0', color: 'var(--txt-sub)' }}>Media Channels</td>
                        <td style={{ textAlign: 'right' }}>
                          {(viewingEvent.media_sources || []).map(m => <span key={m} className="pill pill-blue" style={{ fontSize: '10px', marginLeft: '4px' }}>{m}</span>)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Photos Gallery */}
              {viewingEvent.photo_urls && viewingEvent.photo_urls.filter(Boolean).length > 0 && (
                <div style={{ marginBottom: '18px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', marginBottom: '10px' }}>
                    <i className="fa-solid fa-images" style={{ color: 'var(--accent)', marginRight: '6px' }}></i>
                    Event Media Photos ({viewingEvent.photo_urls.filter(Boolean).length})
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                    {viewingEvent.photo_urls.filter(Boolean).map((p, i) => (
                      <a key={i} href={p} target="_blank" rel="noopener noreferrer" style={{ display: 'block', borderRadius: '8px', overflow: 'hidden', height: '140px', background: '#000', border: '1px solid var(--border)' }}>
                        <img src={p} alt={`event-photo-${i}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Merch List Preview if present */}
              {viewingEvent.merch_items_list && viewingEvent.merch_items_list.length > 0 && (
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', marginBottom: '10px' }}>
                    <i className="fa-solid fa-box-archive" style={{ color: 'var(--accent)', marginRight: '6px' }}></i>
                    Merch Items Allocated ({viewingEvent.merch_items_list.length})
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {viewingEvent.merch_items_list.map((m, i) => (
                      <span key={i} className="pill" style={{ background: 'var(--ink)', border: '1px solid var(--border)', fontSize: '11px', padding: '6px 12px' }}>
                        <strong>{m.name}</strong>: {m.qty} pcs ({fmtLAK(m.total || (m.qty * (m.cpu || 0)))})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button className="btn btn-ghost" onClick={() => setViewingEvent(null)} style={{ fontSize: '13px', padding: '7px 18px' }}>Close</button>
              <button
                className="btn btn-ghost"
                onClick={() => { const ev = viewingEvent; setViewingEvent(null); startEdit(ev); }}
                style={{ fontSize: '13px', padding: '7px 18px', border: '1px solid var(--border)' }}
              >
                <i className="fa-solid fa-pen"></i> Edit Plan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ ACTUALS RECORDING MODAL (CLEANED UP & EXECUTIVE-READY) ══ */}
      {actualEvent && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,15,30,0.82)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={e => { if (e.target === e.currentTarget) setActualEvent(null); }}
        >
          <div style={{ background: 'var(--surface)', borderRadius: '16px', width: '100%', maxWidth: '920px', maxHeight: '92vh', overflowY: 'auto', boxShadow: 'var(--shadow)', border: '1px solid var(--border)' }}>
            {/* Modal Header with clean Pre-fill button (no verbose text) */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg, var(--ink), var(--surface))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px' }}>
                  <span className="pill pill-gold">{actualEvent.team}</span>
                  <span className="pill" style={{ background: scaleColor(actualEvent.scale), color: '#fff', fontSize: '10px' }}>{actualEvent.scale} — {actualEvent.activity_type}</span>
                </div>
                <h2 style={{ margin: '0 0 2px', fontSize: '19px', fontWeight: 800 }}>Record Actual Results — {actualEvent.event_name}</h2>
                <div style={{ fontSize: '12px', color: 'var(--txt-sub)' }}>
                  Record actual spending and results. Cost-per metrics are calculated live.
                </div>
              </div>

              {/* Clean Pre-fill button without clutter */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={copy100PctFromPlan}
                  style={{ fontSize: '12px', padding: '7px 14px', background: 'linear-gradient(135deg, var(--accent), #2563eb)' }}
                  title="Populate all fields with 100% of planned targets"
                >
                  <i className="fa-solid fa-bolt"></i> Pre-fill from Plan
                </button>
                <button onClick={() => setActualEvent(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-sub)', fontSize: '22px', padding: '4px' }}>×</button>
              </div>
            </div>

            <div style={{ padding: '20px 24px' }}>
              {/* Actual Spending Cost */}
              <div style={{ marginBottom: '18px' }}>
                <SectionTitle icon="fa-coins" title="Actual Spending Cost" badge={`Plan Budget: ${fmtLAK(actualEvent.budget_total || actualEvent.media_cost || 0)}`} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px' }}>
                  <div style={{ gridColumn: 'span 2' }}>
                    <FF label="Total Actual Spending Cost (₭) *" preview={actualData.actual_cost ? fmtLAKShort(actualData.actual_cost) : undefined} note="Main figure for executive slides">
                      <input
                        type="number"
                        min={0}
                        value={actualData.actual_cost}
                        onChange={e => setActualData(d => ({ ...d, actual_cost: Number(e.target.value) }))}
                        style={{ fontSize: '14px', fontWeight: 800, padding: '8px 12px', border: '2px solid var(--accent)' }}
                      />
                    </FF>
                  </div>
                  <FF label="Actual Media Cost (₭)" preview={actualData.actual_media_cost ? fmtLAKShort(actualData.actual_media_cost) : undefined}>
                    <input type="number" min={0} value={actualData.actual_media_cost} onChange={e => setActualData(d => ({ ...d, actual_media_cost: Number(e.target.value) }))} style={{ fontSize: '13px', padding: '8px 10px' }} />
                  </FF>
                  <FF label="Actual Prod. Cost (₭)" preview={actualData.actual_production_cost ? fmtLAKShort(actualData.actual_production_cost) : undefined}>
                    <input type="number" min={0} value={actualData.actual_production_cost} onChange={e => setActualData(d => ({ ...d, actual_production_cost: Number(e.target.value) }))} style={{ fontSize: '13px', padding: '8px 10px' }} />
                  </FF>
                </div>
              </div>

              {/* Actual Outcome Numbers */}
              <div style={{ marginBottom: '18px' }}>
                <SectionTitle icon="fa-chart-pie" title="Actual Customer & Engagement Outcomes" />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px' }}>
                  <FF label="Actual NC (New Cust.)" note={`Target: ${actualEvent.target_nc}`}>
                    <input type="number" min={0} value={actualData.actual_nc} onChange={e => setActualData(d => ({ ...d, actual_nc: Number(e.target.value) }))} style={{ fontSize: '13px', padding: '8px 10px' }} />
                  </FF>
                  <FF label="Actual EC (Existing)" note={`Target: ${actualEvent.target_ec}`}>
                    <input type="number" min={0} value={actualData.actual_ec} onChange={e => setActualData(d => ({ ...d, actual_ec: Number(e.target.value) }))} style={{ fontSize: '13px', padding: '8px 10px' }} />
                  </FF>
                  <FF label="Actual NC Buyer (Optional)" note={`Target: ${actualEvent.target_nc_buyer || '—'}`}>
                    <input type="number" min={0} value={actualData.actual_nc_buyer} onChange={e => setActualData(d => ({ ...d, actual_nc_buyer: Number(e.target.value) }))} style={{ fontSize: '13px', padding: '8px 10px' }} />
                  </FF>
                  <FF label="Actual Footfall" note={`Target: ${actualEvent.target_footfall || '—'}`}>
                    <input type="number" min={0} value={actualData.actual_footfall} onChange={e => setActualData(d => ({ ...d, actual_footfall: Number(e.target.value) }))} style={{ fontSize: '13px', padding: '8px 10px' }} />
                  </FF>

                  <FF label="Actual Buy Value (₭)" preview={actualData.actual_buy_value ? fmtLAKShort(actualData.actual_buy_value) : undefined} note={`Target: ${fmtLAKShort(actualEvent.target_buy_value)}`}>
                    <input type="number" min={0} value={actualData.actual_buy_value} onChange={e => setActualData(d => ({ ...d, actual_buy_value: Number(e.target.value) }))} style={{ fontSize: '13px', padding: '8px 10px' }} />
                  </FF>
                  <FF label="Actual Impressions" preview={actualData.actual_impressions ? fmtLAKShort(actualData.actual_impressions) : undefined} note={`Target: ${fmtLAKShort(actualEvent.total_media_impressions || 0)}`}>
                    <input type="number" min={0} value={actualData.actual_impressions} onChange={e => setActualData(d => ({ ...d, actual_impressions: Number(e.target.value) }))} style={{ fontSize: '13px', padding: '8px 10px' }} />
                  </FF>
                  <FF label="Actual Downloads">
                    <input type="number" min={0} value={actualData.actual_download} onChange={e => setActualData(d => ({ ...d, actual_download: Number(e.target.value) }))} style={{ fontSize: '13px', padding: '8px 10px' }} />
                  </FF>
                  <FF label="Actual KYC">
                    <input type="number" min={0} value={actualData.actual_kyc} onChange={e => setActualData(d => ({ ...d, actual_kyc: Number(e.target.value) }))} style={{ fontSize: '13px', padding: '8px 10px' }} />
                  </FF>
                </div>
              </div>

              {/* Live Autocalculated CP Metrics */}
              <div style={{ background: 'var(--ink)', borderRadius: '12px', padding: '16px', border: '1px solid var(--border)', marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', marginBottom: '10px' }}>
                  <i className="fa-solid fa-calculator" style={{ marginRight: '6px', color: 'var(--accent)' }}></i>
                  Autocalculated Cost-Per Metrics (Derived Live from Actual Spending)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px' }}>
                  <KpiChip label="Actual CPA (per NC)" value={fmtLAK(liveCP.cpa)} sub={actualEvent.target_cpa ? `Target: ${fmtLAK(actualEvent.target_cpa)}` : undefined} color={liveCP.cpa <= actualEvent.target_cpa ? 'var(--green)' : 'var(--orange)'} />
                  <KpiChip label="Actual CPO (per Buyer)" value={fmtLAK(liveCP.cpo)} sub={actualEvent.target_cpo ? `Target: ${fmtLAK(actualEvent.target_cpo)}` : undefined} color={liveCP.cpo <= actualEvent.target_cpo ? 'var(--green)' : 'var(--blue)'} />
                  <KpiChip label="Actual CPM (per 1K Imp)" value={fmtLAK(liveCP.cpm)} sub={actualEvent.target_cpm ? `Target: ${fmtLAK(actualEvent.target_cpm)}` : undefined} />
                  <KpiChip label="Actual CPF (per Footfall)" value={fmtLAK(liveCP.cpf)} sub={actualEvent.target_cpf ? `Target: ${fmtLAK(actualEvent.target_cpf)}` : undefined} />
                </div>
              </div>

              {/* Up to 4 Media Photo Links */}
              <SectionTitle icon="fa-images" title="Event Media Photos (Up to 4 Links for Slide Collage)" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '12px', marginBottom: '14px' }}>
                {[0, 1, 2, 3].map(slot => (
                  <div key={slot} style={{ background: 'var(--surface)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <FF label={`Photo URL ${slot + 1}`}>
                      <input
                        value={actualData.photo_urls[slot] || ''}
                        onChange={e => {
                          const val = e.target.value;
                          setActualData(d => {
                            const next = [...d.photo_urls];
                            next[slot] = val;
                            return { ...d, photo_urls: next };
                          });
                        }}
                        placeholder="https://... image link"
                        style={{ fontSize: '12px', padding: '6px 10px' }}
                      />
                    </FF>
                    {actualData.photo_urls[slot] && (
                      <div style={{ height: '90px', borderRadius: '6px', overflow: 'hidden', background: '#000', marginTop: '6px' }}>
                        <img
                          src={actualData.photo_urls[slot]}
                          alt={`preview-${slot}`}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={e => { (e.currentTarget as HTMLImageElement).alt = 'Image failed to load'; }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Status Update */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '12px', padding: '12px 16px', background: 'var(--ink)', borderRadius: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700 }}>Event Status after Recording:</span>
                <select
                  value={actualData.actual_status}
                  onChange={e => setActualData(d => ({ ...d, actual_status: e.target.value as any }))}
                  style={{ fontSize: '12px', padding: '6px 12px', width: 'auto', fontWeight: 700, color: statusColor(actualData.actual_status) }}
                >
                  {EVENT_STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
                </select>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button className="btn btn-ghost" onClick={() => setActualEvent(null)} style={{ fontSize: '13px', padding: '8px 16px' }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveActuals} disabled={savingActuals} style={{ fontSize: '13px', padding: '8px 24px', background: 'linear-gradient(135deg, var(--accent), #2563eb)' }}>
                {savingActuals ? <><i className="fa-solid fa-spinner fa-spin"></i> Saving…</> : <><i className="fa-solid fa-check"></i> Save & Confirm Actuals</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

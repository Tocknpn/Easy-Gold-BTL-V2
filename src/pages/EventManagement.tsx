import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Event, EventKPIs, EventTarget, EventType, LinkedSubmission } from '../lib/events';
import {
  fetchEvents, createEvent, updateEvent, deleteEvent,
  fetchLinkedSubmissions, fetchUnlinkedEventSubmissions, linkSubmissionToEvent,
  computeEventKPIs, fetchEventTargets, upsertEventTarget, deleteEventTarget,
  fetchEventTypes, createEventType, updateEventType, deleteEventType,
  EVENT_OBJECTIVES, EVENT_SCALES, EVENT_TEAMS, QUARTERS, EVENT_STATUSES,
  MONTHS, MONTHS_SHORT, currentMonth,
  fmtLAK, fmtLAKShort, fmtPct, statusColor, statusLabel,
} from '../lib/events';

// ── Helpers ────────────────────────────────────────────────────────────────────

const THIS_YEAR = new Date().getFullYear();
const labelDate = (s: string) => {
  if (!s) return '—';
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
};
const blankEvent = (firstTypeName: string): Omit<Event, 'id' | 'created_at' | 'updated_at' | 'quarter'> => ({
  year: THIS_YEAR,
  team: 'KPV',
  event_name: '',
  start_date: '',
  end_date: '',
  activity_type: firstTypeName || '',
  objective: 'Acquisition/Awareness',
  scale: '',
  description: '',
  target_nc: 0,
  target_ec: 0,
  target_buy_value: 0,
  media_cost: 0,
  media_channels: '',
  total_media_impressions: 0,
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
  status: 'active',
});

// ── Sub-components ─────────────────────────────────────────────────────────────

function KpiChip({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: 'var(--ink)', borderRadius: '10px', padding: '10px 14px', minWidth: 0 }}>
      <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '3px' }}>{label}</div>
      <div style={{ fontSize: '18px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: color || 'var(--txt-main)' }}>{value}</div>
      {sub && <div style={{ fontSize: '10px', color: 'var(--txt-sub)', marginTop: '2px' }}>{sub}</div>}
    </div>
  );
}
function SectionTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '20px 0 12px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
      <i className={`fa-solid ${icon}`} style={{ color: 'var(--accent)', fontSize: '13px' }}></i>
      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</span>
    </div>
  );
}
function FF({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '5px' }}>{label}</label>
      {children}
    </div>
  );
}
function ProgressBar({ pct, color }: { pct: number; color: string }) {
  const c = Math.min(100, pct);
  return (
    <div style={{ height: '5px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden', marginTop: '4px' }}>
      <div style={{ height: '100%', width: `${c}%`, background: color, borderRadius: '3px', transition: 'width 0.6s ease' }} />
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function EventManagement() {
  // ── Event list state ──
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterYear, setFilterYear] = useState<number>(THIS_YEAR);
  const [filterQuarter, setFilterQuarter] = useState<string>('');
  const [filterTeam, setFilterTeam] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  // ── Event types ──
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [showTypes, setShowTypes] = useState(false);
  const [editingType, setEditingType] = useState<EventType | null>(null);
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeDesc, setNewTypeDesc] = useState('');
  const [typeMsg, setTypeMsg] = useState('');

  // ── Detail / form ──
  const [selected, setSelected] = useState<Event | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Omit<Event, 'id' | 'created_at' | 'updated_at' | 'quarter'>>(blankEvent(''));
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // ── Linked submissions ──
  const [linkedSubs, setLinkedSubs] = useState<LinkedSubmission[]>([]);
  const [unlinkedSubs, setUnlinkedSubs] = useState<LinkedSubmission[]>([]);
  const [showLinker, setShowLinker] = useState(false);
  const [subsLoading, setSubsLoading] = useState(false);

  // ── Monthly Targets ──
  const [targets, setTargets] = useState<EventTarget[]>([]);
  const [showTargets, setShowTargets] = useState(false);
  const [tgtYear, setTgtYear] = useState<number>(THIS_YEAR);
  const [tgtMonth, setTgtMonth] = useState<number>(currentMonth());
  const [tgtTeam, setTgtTeam] = useState<string>('');
  const [editTgt, setEditTgt] = useState<Partial<EventTarget> | null>(null);

  // ── Load event types ──
  const loadTypes = useCallback(async () => {
    const types = await fetchEventTypes();
    setEventTypes(types);
    return types;
  }, []);

  useEffect(() => { loadTypes(); }, [loadTypes]);

  // ── Load events ──
  const loadEvents = useCallback(async () => {
    setLoading(true);
    const { data, error } = await fetchEvents({
      year: filterYear || undefined,
      quarter: filterQuarter || undefined,
      team: filterTeam || undefined,
      status: filterStatus || undefined,
    });
    if (!error) setEvents(data);
    setLoading(false);
  }, [filterYear, filterQuarter, filterTeam, filterStatus]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  // ── Load linked subs ──
  const loadLinkedSubs = useCallback(async (ev: Event) => {
    setSubsLoading(true);
    setLinkedSubs(await fetchLinkedSubmissions(ev.id));
    setSubsLoading(false);
  }, []);

  useEffect(() => {
    if (selected) loadLinkedSubs(selected);
    else setLinkedSubs([]);
  }, [selected, loadLinkedSubs]);

  // ── Load monthly targets ──
  const loadTargets = useCallback(() => {
    fetchEventTargets(tgtYear, tgtMonth || undefined, tgtTeam || undefined).then(setTargets);
  }, [tgtYear, tgtMonth, tgtTeam]);

  useEffect(() => { if (showTargets) loadTargets(); }, [showTargets, loadTargets]);

  // ── KPIs ──
  const kpis: EventKPIs | null = useMemo(() =>
    selected ? computeEventKPIs(selected, linkedSubs) : null,
    [selected, linkedSubs]
  );

  const setField = <K extends keyof typeof formData>(k: K, v: typeof formData[K]) =>
    setFormData(prev => ({ ...prev, [k]: v }));

  // ── Event CRUD ──
  const openCreate = async () => {
    const types = eventTypes.length > 0 ? eventTypes : await loadTypes();
    setFormData(blankEvent(types[0]?.name || ''));
    setIsCreating(true);
    setIsEditing(false);
    setSelected(null);
  };
  const openDetail = (ev: Event) => { setSelected(ev); setIsCreating(false); setIsEditing(false); setShowLinker(false); };
  const startEdit = () => {
    if (!selected) return;
    const { id: _id, created_at: _ca, updated_at: _ua, quarter: _q, ...rest } = selected;
    setFormData(rest);
    setIsEditing(true);
  };
  const handleSave = async () => {
    if (!formData.event_name.trim()) { setSaveMsg('Event name is required.'); return; }
    if (!formData.start_date) { setSaveMsg('Start date is required.'); return; }
    setSaving(true); setSaveMsg('');
    if (isCreating) {
      const { data, error } = await createEvent(formData);
      if (error) { setSaveMsg(`Error: ${error.message || String(error)}`); setSaving(false); return; }
      if (data) { setEvents(prev => [data, ...prev]); setSelected(data); setIsCreating(false); }
    } else if (isEditing && selected) {
      const { data, error } = await updateEvent(selected.id, formData);
      if (error) { setSaveMsg(`Error: ${error.message || String(error)}`); setSaving(false); return; }
      if (data) { setEvents(prev => prev.map(e => e.id === data.id ? data : e)); setSelected(data); setIsEditing(false); }
    }
    setSaving(false);
  };
  const handleDelete = async () => {
    if (!selected || !window.confirm(`Delete "${selected.event_name}"? This cannot be undone.`)) return;
    const { error } = await deleteEvent(selected.id);
    if (error) { alert(`Delete failed: ${error.message}`); return; }
    setEvents(prev => prev.filter(e => e.id !== selected.id));
    setSelected(null);
  };

  // ── Link subs ──
  const openLinker = async () => { setShowLinker(true); setUnlinkedSubs(await fetchUnlinkedEventSubmissions()); };
  const handleLink = async (subId: string) => {
    if (!selected) return;
    await linkSubmissionToEvent(subId, selected.id);
    setUnlinkedSubs(prev => prev.filter(s => s.id !== subId));
    setLinkedSubs(await fetchLinkedSubmissions(selected.id));
  };
  const handleUnlink = async (subId: string) => {
    await linkSubmissionToEvent(subId, null);
    setLinkedSubs(prev => prev.filter(s => s.id !== subId));
  };

  // ── Event Types CRUD ──
  const handleAddType = async () => {
    if (!newTypeName.trim()) { setTypeMsg('Name is required.'); return; }
    setTypeMsg('');
    const { error } = await createEventType({ name: newTypeName.trim(), description: newTypeDesc.trim(), sort_order: eventTypes.length });
    if (error) { setTypeMsg(`Error: ${error.message || String(error)}`); return; }
    setNewTypeName(''); setNewTypeDesc('');
    await loadTypes();
  };
  const handleSaveType = async () => {
    if (!editingType || !editingType.name.trim()) { setTypeMsg('Name is required.'); return; }
    setTypeMsg('');
    const { error } = await updateEventType(editingType.id, eventTypes.find(t => t.id === editingType.id)?.name || editingType.name, {
      name: editingType.name.trim(),
      description: editingType.description,
      sort_order: editingType.sort_order,
    });
    if (error) { setTypeMsg(`Error: ${error.message || String(error)}`); return; }
    setEditingType(null);
    await loadTypes();
    // Reload events so updated activity_type names show correctly
    loadEvents();
  };
  const handleDeleteType = async (type: EventType) => {
    if (!window.confirm(`Delete event type "${type.name}"? Existing records will keep the name.`)) return;
    setTypeMsg('');
    const { error } = await deleteEventType(type.id);
    if (error) { setTypeMsg(`Error: ${error.message || String(error)}`); return; }
    await loadTypes();
  };

  // ── Monthly Targets ──
  const saveTgt = async () => {
    if (!editTgt) return;
    await upsertEventTarget({
      year: editTgt.year ?? tgtYear,
      month: editTgt.month ?? tgtMonth,
      team: editTgt.team ?? '',
      activity_type: editTgt.activity_type ?? '',
      cpf_target: editTgt.cpf_target ?? 0,
      cpa_target: editTgt.cpa_target ?? 0,
      cpo_target: editTgt.cpo_target ?? 0,
      cpm_target: editTgt.cpm_target ?? 0,
      nc_target: editTgt.nc_target ?? 0,
      ec_target: editTgt.ec_target ?? 0,
      buy_value_target: editTgt.buy_value_target ?? 0,
    });
    setEditTgt(null);
    loadTargets();
  };
  const handleDeleteTgt = async (id: string) => {
    if (!window.confirm('Delete this target row?')) return;
    await deleteEventTarget(id);
    loadTargets();
  };

  const showForm = isCreating || isEditing;

  return (
    <div style={{ display: 'flex', gap: '20px', height: '100%', minHeight: 0 }}>

      {/* ── LEFT: Event List ── */}
      <div style={{ width: '380px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>

        {/* Filters + New */}
        <div className="card" style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700 }}>Events</span>
            <button className="btn btn-primary" onClick={openCreate} style={{ padding: '6px 14px', fontSize: '12px' }}>
              <i className="fa-solid fa-plus"></i> New Event
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
            <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))} style={{ fontSize: '12px', padding: '6px 8px' }}>
              {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={filterQuarter} onChange={e => setFilterQuarter(e.target.value)} style={{ fontSize: '12px', padding: '6px 8px' }}>
              <option value="">All Quarters</option>
              {QUARTERS.map(q => <option key={q} value={q}>{q}</option>)}
            </select>
            <select value={filterTeam} onChange={e => setFilterTeam(e.target.value)} style={{ fontSize: '12px', padding: '6px 8px' }}>
              <option value="">All Teams</option>
              {EVENT_TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ fontSize: '12px', padding: '6px 8px' }}>
              <option value="">All Status</option>
              {EVENT_STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </select>
          </div>
          <button className="btn btn-ghost" onClick={loadEvents} style={{ width: '100%', fontSize: '11px', padding: '5px' }}>
            <i className="fa-solid fa-rotate-right"></i> Refresh
          </button>
        </div>

        {/* Event list */}
        <div className="card" style={{ padding: 0, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {loading ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--txt-dim)' }}><i className="fa-solid fa-spinner fa-spin"></i></div>
          ) : events.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--txt-dim)' }}>
              <i className="fa-solid fa-calendar-star" style={{ fontSize: '28px', display: 'block', marginBottom: '12px', opacity: 0.25 }}></i>
              No events found.<br /><span style={{ fontSize: '11px' }}>Create one or adjust filters.</span>
            </div>
          ) : (
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {events.map(ev => (
                <div
                  key={ev.id}
                  onClick={() => openDetail(ev)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter') openDetail(ev); }}
                  style={{
                    padding: '12px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                    background: selected?.id === ev.id ? 'var(--accent-dim)' : 'transparent',
                    borderLeft: selected?.id === ev.id ? '3px solid var(--accent)' : '3px solid transparent',
                    transition: 'background 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, flex: 1, paddingRight: '8px' }}>{ev.event_name}</div>
                    <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '99px', background: `${statusColor(ev.status)}22`, color: statusColor(ev.status), border: `1px solid ${statusColor(ev.status)}44`, whiteSpace: 'nowrap' }}>{statusLabel(ev.status)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '4px' }}>
                    <span className="pill pill-gold" style={{ fontSize: '9px' }}>{ev.team}</span>
                    <span className="pill pill-blue" style={{ fontSize: '9px' }}>{ev.activity_type}</span>
                    <span className="pill" style={{ fontSize: '9px', background: 'var(--border)', color: 'var(--txt-dim)' }}>{ev.quarter} {ev.year}</span>
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--txt-sub)' }}>{labelDate(ev.start_date)} → {labelDate(ev.end_date)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-ghost" onClick={() => { setShowTypes(v => !v); setShowTargets(false); }} style={{ flex: 1, fontSize: '11px', padding: '8px' }}>
            <i className="fa-solid fa-tags"></i> Event Types
          </button>
          <button className="btn btn-ghost" onClick={() => { setShowTargets(v => !v); setShowTypes(false); }} style={{ flex: 1, fontSize: '11px', padding: '8px' }}>
            <i className="fa-solid fa-bullseye"></i> Monthly Targets
          </button>
        </div>
      </div>

      {/* ── RIGHT: Detail / Form / Panels ── */}
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>

        {/* ══ EVENT TYPES PANEL ══ */}
        {showTypes && (
          <div className="card" style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '15px' }}>
                <i className="fa-solid fa-tags" style={{ marginRight: '8px', color: 'var(--accent)' }}></i>
                Event Types
              </h3>
              {typeMsg && <span style={{ fontSize: '11px', color: 'var(--red)' }}>{typeMsg}</span>}
            </div>

            {/* Add new type */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', padding: '12px', background: 'var(--ink)', borderRadius: '10px', border: '1px solid var(--border)' }}>
              <input
                value={newTypeName}
                onChange={e => setNewTypeName(e.target.value)}
                placeholder="New event type name (e.g. Road Show)"
                style={{ flex: 2, fontSize: '12px', padding: '8px 12px' }}
                onKeyDown={e => { if (e.key === 'Enter') handleAddType(); }}
              />
              <input
                value={newTypeDesc}
                onChange={e => setNewTypeDesc(e.target.value)}
                placeholder="Description (optional)"
                style={{ flex: 2, fontSize: '12px', padding: '8px 12px' }}
              />
              <button className="btn btn-primary" onClick={handleAddType} style={{ fontSize: '12px', padding: '8px 16px', flexShrink: 0 }}>
                <i className="fa-solid fa-plus"></i> Add
              </button>
            </div>

            {/* Types list */}
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table compact" style={{ marginTop: 0 }}>
                <thead><tr><th>#</th><th>Name</th><th>Description</th><th style={{ width: '110px' }}></th></tr></thead>
                <tbody>
                  {eventTypes.length === 0 && (
                    <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--txt-dim)', padding: '16px' }}>No types yet. Add one above or run supabase_events.sql seed.</td></tr>
                  )}
                  {eventTypes.map((t, i) => (
                    <tr key={t.id}>
                      {editingType?.id === t.id ? (
                        <>
                          <td style={{ color: 'var(--txt-dim)' }}>{i + 1}</td>
                          <td>
                            <input value={editingType.name} onChange={e => setEditingType(et => et ? { ...et, name: e.target.value } : et)}
                              style={{ fontSize: '12px', padding: '5px 8px', width: '100%' }} autoFocus />
                          </td>
                          <td>
                            <input value={editingType.description} onChange={e => setEditingType(et => et ? { ...et, description: e.target.value } : et)}
                              style={{ fontSize: '12px', padding: '5px 8px', width: '100%' }} />
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button className="btn btn-primary" onClick={handleSaveType} style={{ fontSize: '10px', padding: '3px 10px' }}>Save</button>
                              <button className="btn btn-ghost" onClick={() => setEditingType(null)} style={{ fontSize: '10px', padding: '3px 8px' }}>✕</button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={{ color: 'var(--txt-dim)' }}>{i + 1}</td>
                          <td><strong>{t.name}</strong></td>
                          <td style={{ color: 'var(--txt-sub)', fontSize: '11px' }}>{t.description || '—'}</td>
                          <td>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button className="btn btn-ghost" onClick={() => setEditingType({ ...t })} style={{ fontSize: '10px', padding: '3px 10px' }}>
                                <i className="fa-solid fa-pen"></i> Edit
                              </button>
                              <button className="btn btn-ghost" onClick={() => handleDeleteType(t)} style={{ fontSize: '10px', padding: '3px 8px', color: 'var(--red)' }}>
                                <i className="fa-solid fa-trash"></i>
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: '10px', fontSize: '10px', color: 'var(--txt-dim)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="fa-solid fa-circle-info" style={{ color: 'var(--accent)' }}></i>
              Renaming a type will update <strong>all existing events and targets</strong> that use the old name automatically.
            </div>
          </div>
        )}

        {/* ══ MONTHLY TARGETS PANEL ══ */}
        {showTargets && (
          <div className="card" style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '15px' }}>
                <i className="fa-solid fa-bullseye" style={{ marginRight: '8px', color: 'var(--accent)' }}></i>
                Monthly KPI Targets
              </h3>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={tgtYear} onChange={e => setTgtYear(Number(e.target.value))} style={{ fontSize: '12px', padding: '6px 8px' }}>
                  {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <select value={tgtMonth} onChange={e => setTgtMonth(Number(e.target.value))} style={{ fontSize: '12px', padding: '6px 8px' }}>
                  <option value={0}>All Months</option>
                  {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                </select>
                <select value={tgtTeam} onChange={e => setTgtTeam(e.target.value)} style={{ fontSize: '12px', padding: '6px 8px' }}>
                  <option value="">All Teams</option>
                  {EVENT_TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <button
                  className="btn btn-primary"
                  style={{ fontSize: '11px', padding: '6px 12px' }}
                  onClick={() => setEditTgt({
                    year: tgtYear,
                    month: tgtMonth || currentMonth(),
                    team: tgtTeam || 'KPV',
                    activity_type: eventTypes[0]?.name || '',
                  })}
                >
                  <i className="fa-solid fa-plus"></i> Add Target
                </button>
              </div>
            </div>

            {/* Add / edit target row form */}
            {editTgt && (
              <div style={{ background: 'var(--ink)', borderRadius: '10px', padding: '14px', marginBottom: '14px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', marginBottom: '8px' }}>
                  <div>
                    <div style={{ fontSize: '9px', color: 'var(--txt-dim)', textTransform: 'uppercase', marginBottom: '3px' }}>Year</div>
                    <select value={editTgt.year ?? tgtYear} onChange={e => setEditTgt(r => ({ ...r, year: Number(e.target.value) }))} style={{ fontSize: '12px', padding: '6px', width: '100%' }}>
                      {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: '9px', color: 'var(--txt-dim)', textTransform: 'uppercase', marginBottom: '3px' }}>Month</div>
                    <select value={editTgt.month ?? currentMonth()} onChange={e => setEditTgt(r => ({ ...r, month: Number(e.target.value) }))} style={{ fontSize: '12px', padding: '6px', width: '100%' }}>
                      {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: '9px', color: 'var(--txt-dim)', textTransform: 'uppercase', marginBottom: '3px' }}>Team</div>
                    <select value={editTgt.team ?? 'KPV'} onChange={e => setEditTgt(r => ({ ...r, team: e.target.value }))} style={{ fontSize: '12px', padding: '6px', width: '100%' }}>
                      {EVENT_TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: '9px', color: 'var(--txt-dim)', textTransform: 'uppercase', marginBottom: '3px' }}>Activity Type</div>
                    <select value={editTgt.activity_type ?? ''} onChange={e => setEditTgt(r => ({ ...r, activity_type: e.target.value }))} style={{ fontSize: '12px', padding: '6px', width: '100%' }}>
                      {eventTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', marginBottom: '10px' }}>
                  {(['nc_target','ec_target','cpf_target','cpa_target','cpo_target','cpm_target','buy_value_target'] as const).map(k => (
                    <div key={k}>
                      <div style={{ fontSize: '9px', color: 'var(--txt-dim)', textTransform: 'uppercase', marginBottom: '3px' }}>{k.replace('_target','').toUpperCase()}</div>
                      <input type="number" value={(editTgt as any)[k] ?? 0} onChange={e => setEditTgt(r => ({ ...r, [k]: Number(e.target.value) }))}
                        style={{ fontSize: '12px', padding: '5px 8px', width: '100%' }} min={0} />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-primary" onClick={saveTgt} style={{ fontSize: '12px', padding: '7px 16px' }}>
                    <i className="fa-solid fa-floppy-disk"></i> Save Target
                  </button>
                  <button className="btn btn-ghost" onClick={() => setEditTgt(null)} style={{ fontSize: '12px', padding: '7px 12px' }}>Cancel</button>
                </div>
              </div>
            )}

            <div style={{ overflowX: 'auto' }}>
              <table className="data-table compact" style={{ marginTop: 0 }}>
                <thead><tr>
                  <th>Year</th><th>Month</th><th>Team</th><th>Type</th>
                  <th>NC</th><th>EC</th><th>CPF</th><th>CPA</th><th>CPO</th><th>CPM</th><th>Buy Val</th>
                  <th></th>
                </tr></thead>
                <tbody>
                  {targets.length === 0 && <tr><td colSpan={12} style={{ textAlign: 'center', color: 'var(--txt-dim)', padding: '16px' }}>No targets. Run the SQL migration seed or add one above.</td></tr>}
                  {targets.map(t => (
                    <tr key={t.id}>
                      <td>{t.year}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{MONTHS_SHORT[t.month - 1]}</td>
                      <td><span className="pill pill-gold" style={{ fontSize: '9px' }}>{t.team}</span></td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '11px' }}>{t.activity_type}</td>
                      <td>{t.nc_target.toLocaleString()}</td>
                      <td>{t.ec_target.toLocaleString()}</td>
                      <td>{fmtLAKShort(t.cpf_target)}</td>
                      <td>{fmtLAKShort(t.cpa_target)}</td>
                      <td>{fmtLAKShort(t.cpo_target)}</td>
                      <td>{fmtLAKShort(t.cpm_target)}</td>
                      <td>{fmtLAKShort(t.buy_value_target)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button className="btn btn-ghost" onClick={() => setEditTgt(t)} style={{ padding: '3px 8px', fontSize: '10px' }}>Edit</button>
                          <button className="btn btn-ghost" onClick={() => handleDeleteTgt(t.id)} style={{ padding: '3px 6px', fontSize: '10px', color: 'var(--red)' }}>
                            <i className="fa-solid fa-trash"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Empty state ── */}
        {!selected && !showForm && !showTypes && !showTargets && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--txt-dim)', textAlign: 'center' }}>
            <i className="fa-solid fa-calendar-star" style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.2 }}></i>
            <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>Select an event</div>
            <div style={{ fontSize: '12px' }}>or click <strong>New Event</strong> · <strong>Event Types</strong> · <strong>Monthly Targets</strong></div>
          </div>
        )}

        {/* ══ CREATE / EDIT FORM ══ */}
        {showForm && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>
                <i className={`fa-solid ${isCreating ? 'fa-plus-circle' : 'fa-pen'}`} style={{ marginRight: '8px', color: 'var(--accent)' }}></i>
                {isCreating ? 'New Event' : `Edit — ${selected?.event_name}`}
              </h3>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {saveMsg && <span style={{ fontSize: '11px', color: 'var(--red)' }}>{saveMsg}</span>}
                <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ fontSize: '12px', padding: '7px 18px' }}>
                  {saving ? <><i className="fa-solid fa-spinner fa-spin"></i> Saving…</> : <><i className="fa-solid fa-floppy-disk"></i> Save</>}
                </button>
                <button className="btn btn-ghost" onClick={() => { setIsCreating(false); setIsEditing(false); }} style={{ fontSize: '12px', padding: '7px 12px' }}>Cancel</button>
              </div>
            </div>

            <SectionTitle icon="fa-circle-info" title="Campaign Details" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <FF label="Event Name">
                  <input value={formData.event_name} onChange={e => setField('event_name', e.target.value)} placeholder="e.g. Lao Green Fashion 2026" style={{ fontSize: '13px', padding: '8px 12px' }} />
                </FF>
              </div>
              <FF label="Year">
                <select value={formData.year} onChange={e => setField('year', Number(e.target.value))} style={{ fontSize: '13px', padding: '8px 12px' }}>
                  {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </FF>
              <FF label="Team">
                <select value={formData.team} onChange={e => setField('team', e.target.value)} style={{ fontSize: '13px', padding: '8px 12px' }}>
                  {EVENT_TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </FF>
              <FF label="Activity Type">
                <select value={formData.activity_type} onChange={e => setField('activity_type', e.target.value)} style={{ fontSize: '13px', padding: '8px 12px' }}>
                  {eventTypes.length === 0 && <option value="">— Add types first —</option>}
                  {eventTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
              </FF>
              <FF label="Start Date">
                <input type="date" value={formData.start_date} onChange={e => setField('start_date', e.target.value)} style={{ fontSize: '13px', padding: '8px 12px' }} />
              </FF>
              <FF label="End Date">
                <input type="date" value={formData.end_date} onChange={e => setField('end_date', e.target.value)} style={{ fontSize: '13px', padding: '8px 12px' }} />
              </FF>
              <FF label="Scale">
                <select value={formData.scale} onChange={e => setField('scale', e.target.value)} style={{ fontSize: '13px', padding: '8px 12px' }}>
                  <option value="">— Select —</option>
                  {EVENT_SCALES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </FF>
              <FF label="Objective">
                <select value={formData.objective} onChange={e => setField('objective', e.target.value)} style={{ fontSize: '13px', padding: '8px 12px' }}>
                  {EVENT_OBJECTIVES.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </FF>
              <FF label="Status">
                <select value={formData.status} onChange={e => setField('status', e.target.value)} style={{ fontSize: '13px', padding: '8px 12px' }}>
                  {EVENT_STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
                </select>
              </FF>
            </div>

            <SectionTitle icon="fa-align-left" title="Description & Notes" />
            <FF label="Event Description / Objective Narrative">
              <textarea value={formData.description} onChange={e => setField('description', e.target.value)} rows={3}
                style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--txt-main)', padding: '10px 14px', borderRadius: '8px', fontFamily: 'var(--font-sans)', fontSize: '13px', resize: 'vertical' }}
                placeholder="Describe the event purpose, audience, mechanic…" />
            </FF>
            <FF label="Remarks">
              <input value={formData.remarks} onChange={e => setField('remarks', e.target.value)} placeholder="Additional notes" style={{ fontSize: '13px', padding: '8px 12px' }} />
            </FF>

            <SectionTitle icon="fa-bullseye" title="Targets" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px' }}>
              <FF label="Target NC"><input type="number" value={formData.target_nc} onChange={e => setField('target_nc', Number(e.target.value))} style={{ fontSize: '13px', padding: '8px 12px' }} min={0} /></FF>
              <FF label="Target EC"><input type="number" value={formData.target_ec} onChange={e => setField('target_ec', Number(e.target.value))} style={{ fontSize: '13px', padding: '8px 12px' }} min={0} /></FF>
              <FF label="Target Buy Value (₭)"><input type="number" value={formData.target_buy_value} onChange={e => setField('target_buy_value', Number(e.target.value))} style={{ fontSize: '13px', padding: '8px 12px' }} min={0} /></FF>
            </div>

            <SectionTitle icon="fa-photo-film" title="Media" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <FF label="Media Cost (₭)"><input type="number" value={formData.media_cost} onChange={e => setField('media_cost', Number(e.target.value))} style={{ fontSize: '13px', padding: '8px 12px' }} min={0} /></FF>
              <FF label="Total Media Impressions"><input type="number" value={formData.total_media_impressions} onChange={e => setField('total_media_impressions', Number(e.target.value))} style={{ fontSize: '13px', padding: '8px 12px' }} min={0} /></FF>
              <FF label="Media Channels (comma separated)"><input value={formData.media_channels} onChange={e => setField('media_channels', e.target.value)} placeholder="e.g. Facebook, TikTok, LINE, OOH" style={{ fontSize: '13px', padding: '8px 12px' }} /></FF>
              <FF label="Target Audience"><input value={formData.target_audience} onChange={e => setField('target_audience', e.target.value)} placeholder="e.g. NC + EC" style={{ fontSize: '13px', padding: '8px 12px' }} /></FF>
              <FF label="Featured Cities"><input value={formData.featured_cities} onChange={e => setField('featured_cities', e.target.value)} placeholder="e.g. Vientiane Capital" style={{ fontSize: '13px', padding: '8px 12px' }} /></FF>
            </div>

            <SectionTitle icon="fa-link" title="Documents & Gallery" />
            <FF label="Proposal / Pitch Deck Link"><input value={formData.proposal_link} onChange={e => setField('proposal_link', e.target.value)} placeholder="https://drive.google.com/..." style={{ fontSize: '13px', padding: '8px 12px' }} /></FF>
            <FF label="End-of-Activation Report Link"><input value={formData.end_of_activation_report_link} onChange={e => setField('end_of_activation_report_link', e.target.value)} placeholder="https://docs.google.com/..." style={{ fontSize: '13px', padding: '8px 12px' }} /></FF>
            <FF label="Photo Gallery Link (Google Photos)"><input value={formData.photo_gallery_link} onChange={e => setField('photo_gallery_link', e.target.value)} placeholder="https://photos.google.com/..." style={{ fontSize: '13px', padding: '8px 12px' }} /></FF>

            <SectionTitle icon="fa-check-circle" title="Approval & Merch" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <FF label="Regional Approved?">
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', paddingTop: '8px' }}>
                  <input type="checkbox" checked={formData.regional_approved} onChange={e => setField('regional_approved', e.target.checked)} style={{ width: '16px', height: '16px' }} />
                  <span style={{ fontSize: '13px' }}>{formData.regional_approved ? 'Yes — Approved' : 'Not yet approved'}</span>
                </label>
              </FF>
              {formData.regional_approved && (
                <FF label="Approval Date"><input type="date" value={formData.approval_date} onChange={e => setField('approval_date', e.target.value)} style={{ fontSize: '13px', padding: '8px 12px' }} /></FF>
              )}
              <FF label="Merch Required?">
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', paddingTop: '8px' }}>
                  <input type="checkbox" checked={formData.merch_required} onChange={e => setField('merch_required', e.target.checked)} style={{ width: '16px', height: '16px' }} />
                  <span style={{ fontSize: '13px' }}>{formData.merch_required ? 'Yes' : 'No'}</span>
                </label>
              </FF>
              {formData.merch_required && (
                <FF label="Merch Details"><input value={formData.merch_details} onChange={e => setField('merch_details', e.target.value)} placeholder="What merch + mechanics" style={{ fontSize: '13px', padding: '8px 12px' }} /></FF>
              )}
            </div>
          </div>
        )}

        {/* ══ DETAIL VIEW ══ */}
        {selected && !showForm && (
          <div>
            {/* Header */}
            <div className="card" style={{ marginBottom: '16px', padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                    <span className="pill pill-gold" style={{ fontSize: '10px' }}>{selected.team}</span>
                    <span className="pill pill-blue" style={{ fontSize: '10px' }}>{selected.activity_type}</span>
                    <span className="pill" style={{ fontSize: '10px', background: 'var(--border)', color: 'var(--txt-dim)' }}>{selected.quarter} {selected.year}</span>
                    {selected.scale && <span className="pill" style={{ fontSize: '10px', background: 'var(--orange-dim)', color: 'var(--orange)' }}>{selected.scale}</span>}
                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '99px', background: `${statusColor(selected.status)}22`, color: statusColor(selected.status), border: `1px solid ${statusColor(selected.status)}44` }}>{statusLabel(selected.status)}</span>
                  </div>
                  <h2 style={{ margin: '0 0 4px', fontSize: '22px', fontWeight: 800 }}>{selected.event_name}</h2>
                  <div style={{ fontSize: '12px', color: 'var(--txt-sub)' }}>
                    <i className="fa-regular fa-calendar" style={{ marginRight: '6px' }}></i>
                    {labelDate(selected.start_date)} → {labelDate(selected.end_date)}
                    {selected.regional_approved && <span style={{ marginLeft: '12px', color: 'var(--green)', fontWeight: 700 }}><i className="fa-solid fa-circle-check" style={{ marginRight: '4px' }}></i>Approved {selected.approval_date ? labelDate(selected.approval_date) : ''}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-ghost" onClick={startEdit} style={{ fontSize: '12px', padding: '7px 14px' }}><i className="fa-solid fa-pen"></i> Edit</button>
                  <button className="btn btn-ghost" onClick={handleDelete} style={{ fontSize: '12px', padding: '7px 14px', color: 'var(--red)' }}><i className="fa-solid fa-trash"></i></button>
                </div>
              </div>
              {selected.description && (
                <div style={{ marginTop: '14px', fontSize: '13px', color: 'var(--txt-sub)', lineHeight: 1.6, background: 'var(--ink)', borderRadius: '8px', padding: '12px 16px' }}>{selected.description}</div>
              )}
            </div>

            {/* KPI Summary */}
            {kpis && (
              <div className="card" style={{ marginBottom: '16px', padding: '16px 20px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
                  <i className="fa-solid fa-chart-mixed" style={{ marginRight: '6px', color: 'var(--accent)' }}></i>
                  Live KPI — {kpis.linked_count} linked submission{kpis.linked_count !== 1 ? 's' : ''}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '12px' }}>
                  <KpiChip label="Total Cost" value={fmtLAKShort(kpis.total_cost)} sub={`Subs ${fmtLAKShort(kpis.total_cost_from_subs)} + Media ${fmtLAKShort(selected.media_cost)}`} color="var(--accent)" />
                  <KpiChip label="CPA" value={kpis.cpa > 0 ? fmtLAK(Math.round(kpis.cpa)) : '—'} color="var(--orange)" />
                  <KpiChip label="CPO" value={kpis.cpo > 0 ? fmtLAK(Math.round(kpis.cpo)) : '—'} color="var(--blue)" />
                  <KpiChip label="CPF" value={kpis.cpf > 0 ? fmtLAK(Math.round(kpis.cpf)) : '—'} color="var(--green)" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '12px' }}>
                  <KpiChip label="NC" value={kpis.total_nc.toLocaleString()} sub={selected.target_nc > 0 ? `Tgt: ${selected.target_nc.toLocaleString()} (${fmtPct(kpis.pct_nc)})` : undefined} color={kpis.pct_nc >= 100 ? 'var(--green)' : 'var(--txt-main)'} />
                  <KpiChip label="EC" value={kpis.total_ec.toLocaleString()} sub={selected.target_ec > 0 ? `Tgt: ${selected.target_ec.toLocaleString()} (${fmtPct(kpis.pct_ec)})` : undefined} />
                  <KpiChip label="Buy Value" value={fmtLAKShort(kpis.total_buy_value)} sub={selected.target_buy_value > 0 ? `Tgt: ${fmtLAKShort(selected.target_buy_value)} (${fmtPct(kpis.pct_buy_value)})` : undefined} color={kpis.pct_buy_value >= 100 ? 'var(--green)' : 'var(--txt-main)'} />
                  <KpiChip label="Footfall" value={kpis.total_footfall.toLocaleString()} />
                </div>
                {selected.target_nc > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px' }}>
                    {[['% NC Hit', kpis.pct_nc, 'var(--accent)'], ['% EC Hit', kpis.pct_ec, 'var(--blue)'], ['% Buy Value Hit', kpis.pct_buy_value, 'var(--green)']].map(([l, p, c]) => (
                      <div key={l as string}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--txt-sub)', marginBottom: '2px' }}>
                          <span>{l as string}</span>
                          <span style={{ fontWeight: 700, color: (p as number) >= 100 ? 'var(--green)' : 'var(--txt-main)' }}>{fmtPct(p as number)}</span>
                        </div>
                        <ProgressBar pct={p as number} color={(p as number) >= 100 ? 'var(--green)' : c as string} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Details + Documents */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div className="card" style={{ padding: '16px 20px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>Media & Objective</div>
                {[
                  { label: 'Objective', val: selected.objective },
                  { label: 'Media Channels', val: selected.media_channels || '—' },
                  { label: 'Media Cost', val: fmtLAK(selected.media_cost) },
                  { label: 'Impressions', val: selected.total_media_impressions > 0 ? selected.total_media_impressions.toLocaleString() : '—' },
                  { label: 'Target Audience', val: selected.target_audience || '—' },
                  { label: 'Featured Cities', val: selected.featured_cities || '—' },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: '12px' }}>
                    <span style={{ color: 'var(--txt-sub)' }}>{r.label}</span>
                    <span style={{ fontWeight: 600 }}>{r.val}</span>
                  </div>
                ))}
              </div>
              <div className="card" style={{ padding: '16px 20px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>Documents & Gallery</div>
                {[
                  { label: '📄 Proposal / Pitch Deck', url: selected.proposal_link },
                  { label: '📊 End-of-Activation Report', url: selected.end_of_activation_report_link },
                  { label: '📸 Photo Gallery', url: selected.photo_gallery_link },
                ].map(r => (
                  <div key={r.label} style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '10px', color: 'var(--txt-dim)', marginBottom: '3px' }}>{r.label}</div>
                    {r.url
                      ? <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: 'var(--accent)', wordBreak: 'break-all' }}><i className="fa-solid fa-arrow-up-right-from-square" style={{ marginRight: '5px', fontSize: '10px' }}></i>{r.url.length > 55 ? r.url.slice(0, 55) + '…' : r.url}</a>
                      : <span style={{ fontSize: '12px', color: 'var(--txt-dim)' }}>—</span>}
                  </div>
                ))}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px', marginTop: '6px', fontSize: '12px' }}>
                  <span className={selected.merch_required ? 'pill pill-green' : 'pill'} style={!selected.merch_required ? { background: 'var(--border)', color: 'var(--txt-dim)' } : {}}>
                    {selected.merch_required ? 'Merch Required' : 'No Merch'}
                  </span>
                  {selected.merch_required && selected.merch_details && <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--txt-sub)' }}>{selected.merch_details}</div>}
                </div>
                {selected.remarks && <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--txt-sub)', borderTop: '1px solid var(--border)', paddingTop: '8px' }}><strong>Remarks:</strong> {selected.remarks}</div>}
              </div>
            </div>

            {/* Linked Submissions */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  <i className="fa-solid fa-file-invoice" style={{ marginRight: '6px', color: 'var(--accent)' }}></i>
                  Linked Submissions ({linkedSubs.length})
                </div>
                <button className="btn btn-ghost" onClick={openLinker} style={{ fontSize: '11px', padding: '5px 12px' }}><i className="fa-solid fa-link"></i> Link</button>
              </div>
              {showLinker && (
                <div style={{ background: 'var(--ink)', borderRadius: '10px', padding: '12px', marginBottom: '12px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--txt-dim)', marginBottom: '8px' }}>Unlinked event-type submissions — click to link</div>
                  {unlinkedSubs.length === 0
                    ? <div style={{ fontSize: '12px', color: 'var(--txt-dim)' }}>None found. Submit with Activity Type = "Event" first.</div>
                    : (
                      <table className="data-table compact" style={{ marginTop: 0 }}>
                        <thead><tr><th>Date</th><th>Team</th><th>Branch</th><th>NC</th><th>Cost</th><th></th></tr></thead>
                        <tbody>
                          {unlinkedSubs.map(s => (
                            <tr key={s.id}>
                              <td>{labelDate(s.date)}</td>
                              <td><span className="pill pill-gold" style={{ fontSize: '9px' }}>{s.team}</span></td>
                              <td>{s.branch}</td>
                              <td>{s.new_register}</td>
                              <td>{fmtLAKShort((s.team_cost||0)+(s.merch_cost||0)+(s.sponsorship_cost||0)+(s.prod_cost||0))}</td>
                              <td><button className="btn btn-primary" onClick={() => handleLink(s.id)} style={{ fontSize: '10px', padding: '3px 10px' }}>Link</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  <button className="btn btn-ghost" onClick={() => setShowLinker(false)} style={{ fontSize: '11px', padding: '5px 12px', marginTop: '8px' }}>Close</button>
                </div>
              )}
              {subsLoading
                ? <div style={{ padding: '16px', textAlign: 'center', color: 'var(--txt-dim)' }}><i className="fa-solid fa-spinner fa-spin"></i></div>
                : linkedSubs.length === 0
                ? <div style={{ padding: '16px', textAlign: 'center', color: 'var(--txt-dim)', fontSize: '12px' }}>No linked submissions yet.</div>
                : (
                  <table className="data-table compact">
                    <thead><tr><th>Date</th><th>Team</th><th>Branch</th><th>NC</th><th>EC</th><th>Footfall</th><th>Total Cost</th><th></th></tr></thead>
                    <tbody>
                      {linkedSubs.map(s => {
                        const cost = (s.team_cost||0)+(s.merch_cost||0)+(s.sponsorship_cost||0)+(s.prod_cost||0);
                        return (
                          <tr key={s.id}>
                            <td>{labelDate(s.date)}</td>
                            <td><span className="pill pill-gold" style={{ fontSize: '9px' }}>{s.team}</span></td>
                            <td>{s.branch}</td>
                            <td><strong>{s.new_register}</strong></td>
                            <td>{s.existing_users}</td>
                            <td>{(s.footfall||0).toLocaleString()}</td>
                            <td style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{fmtLAKShort(cost)}</td>
                            <td><button className="btn btn-ghost" onClick={() => handleUnlink(s.id)} style={{ padding: '2px 8px', fontSize: '10px', color: 'var(--red)' }}><i className="fa-solid fa-link-slash"></i></button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {kpis && linkedSubs.length > 0 && (
                      <tfoot>
                        <tr style={{ fontWeight: 700 }}>
                          <td colSpan={3}>Totals</td>
                          <td style={{ color: 'var(--accent)' }}>{kpis.total_nc}</td>
                          <td>{kpis.total_ec}</td>
                          <td>{kpis.total_footfall.toLocaleString()}</td>
                          <td style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{fmtLAKShort(kpis.total_cost_from_subs)}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

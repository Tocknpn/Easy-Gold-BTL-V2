import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Event, EventKPIs, EventTarget, LinkedSubmission } from '../lib/events';
import {
  fetchEvents, createEvent, updateEvent, deleteEvent,
  fetchLinkedSubmissions, fetchUnlinkedEventSubmissions, linkSubmissionToEvent,
  computeEventKPIs, fetchEventTargets, upsertEventTarget,
  ACTIVITY_TYPES_EVENT, EVENT_OBJECTIVES, EVENT_SCALES, EVENT_TEAMS, QUARTERS, EVENT_STATUSES,
  currentQuarter, fmtLAK, fmtLAKShort, fmtPct, statusColor, statusLabel,
} from '../lib/events';

// ── Local helpers ─────────────────────────────────────────────────────────────

const THIS_YEAR = new Date().getFullYear();
const labelDate = (s: string) => {
  if (!s) return '—';
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
};

const blankEvent = (): Omit<Event, 'id' | 'created_at' | 'updated_at'> => ({
  year: THIS_YEAR,
  quarter: currentQuarter(),
  team: 'KPV',
  event_name: '',
  start_date: '',
  end_date: '',
  activity_type: 'Event (indoor)',
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

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="form-field" style={{ marginBottom: '14px' }}>
      <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '5px' }}>{label}</label>
      {children}
    </div>
  );
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  const clamped = Math.min(100, pct);
  return (
    <div style={{ height: '5px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden', marginTop: '4px' }}>
      <div style={{ height: '100%', width: `${clamped}%`, background: color, borderRadius: '3px', transition: 'width 0.6s ease' }} />
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────────

export default function EventManagement() {
  // ── List state ──
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterYear, setFilterYear] = useState<number>(THIS_YEAR);
  const [filterQuarter, setFilterQuarter] = useState<string>('');
  const [filterTeam, setFilterTeam] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  // ── Detail / form state ──
  const [selected, setSelected] = useState<Event | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Omit<Event, 'id' | 'created_at' | 'updated_at'>>(blankEvent());
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // ── Linked submissions ──
  const [linkedSubs, setLinkedSubs] = useState<LinkedSubmission[]>([]);
  const [unlinkedSubs, setUnlinkedSubs] = useState<LinkedSubmission[]>([]);
  const [showLinker, setShowLinker] = useState(false);
  const [subsLoading, setSubsLoading] = useState(false);

  // ── Targets ──
  const [targets, setTargets] = useState<EventTarget[]>([]);
  const [showTargets, setShowTargets] = useState(false);
  const [editTargetRow, setEditTargetRow] = useState<Partial<EventTarget> | null>(null);

  // ── Fetch events list ──
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

  // ── Load linked subs when event selected ──
  const loadLinkedSubs = useCallback(async (ev: Event) => {
    setSubsLoading(true);
    const subs = await fetchLinkedSubmissions(ev.id);
    setLinkedSubs(subs);
    setSubsLoading(false);
  }, []);

  useEffect(() => {
    if (selected) loadLinkedSubs(selected);
    else setLinkedSubs([]);
  }, [selected, loadLinkedSubs]);

  // ── Load targets ──
  useEffect(() => {
    if (!showTargets) return;
    fetchEventTargets(filterYear || undefined, filterQuarter || undefined, filterTeam || undefined)
      .then(setTargets);
  }, [showTargets, filterYear, filterQuarter, filterTeam]);

  // ── KPIs computed live ──
  const kpis: EventKPIs | null = useMemo(() => {
    if (!selected) return null;
    return computeEventKPIs(selected, linkedSubs);
  }, [selected, linkedSubs]);

  // ── Form field helper ──
  const setField = <K extends keyof typeof formData>(key: K, val: typeof formData[K]) =>
    setFormData(prev => ({ ...prev, [key]: val }));

  // ── Open for creating ──
  const openCreate = () => {
    setFormData(blankEvent());
    setIsCreating(true);
    setIsEditing(false);
    setSelected(null);
  };

  // ── Open an event for viewing ──
  const openDetail = (ev: Event) => {
    setSelected(ev);
    setIsCreating(false);
    setIsEditing(false);
    setShowLinker(false);
  };

  // ── Enter edit mode ──
  const startEdit = () => {
    if (!selected) return;
    const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = selected;
    setFormData(rest);
    setIsEditing(true);
  };

  // ── Save (create or update) ──
  const handleSave = async () => {
    if (!formData.event_name.trim()) { setSaveMsg('Event name is required.'); return; }
    if (!formData.start_date) { setSaveMsg('Start date is required.'); return; }
    setSaving(true);
    setSaveMsg('');
    if (isCreating) {
      const { data, error } = await createEvent(formData);
      if (error) { setSaveMsg(`Error: ${error.message || String(error)}`); setSaving(false); return; }
      if (data) { setEvents(prev => [data, ...prev]); setSelected(data); setIsCreating(false); }
    } else if (isEditing && selected) {
      const { data, error } = await updateEvent(selected.id, formData);
      if (error) { setSaveMsg(`Error: ${error.message || String(error)}`); setSaving(false); return; }
      if (data) {
        setEvents(prev => prev.map(e => e.id === data.id ? data : e));
        setSelected(data);
        setIsEditing(false);
      }
    }
    setSaving(false);
  };

  // ── Delete event ──
  const handleDelete = async () => {
    if (!selected) return;
    if (!window.confirm(`Delete "${selected.event_name}"? This cannot be undone.`)) return;
    const { error } = await deleteEvent(selected.id);
    if (error) { alert(`Delete failed: ${error.message}`); return; }
    setEvents(prev => prev.filter(e => e.id !== selected.id));
    setSelected(null);
  };

  // ── Link submission ──
  const openLinker = async () => {
    setShowLinker(true);
    const subs = await fetchUnlinkedEventSubmissions();
    setUnlinkedSubs(subs);
  };
  const handleLink = async (subId: string) => {
    if (!selected) return;
    await linkSubmissionToEvent(subId, selected.id);
    setUnlinkedSubs(prev => prev.filter(s => s.id !== subId));
    const fresh = await fetchLinkedSubmissions(selected.id);
    setLinkedSubs(fresh);
  };
  const handleUnlink = async (subId: string) => {
    await linkSubmissionToEvent(subId, null);
    setLinkedSubs(prev => prev.filter(s => s.id !== subId));
  };

  // ── Targets upsert ──
  const saveTarget = async () => {
    if (!editTargetRow) return;
    const full: Omit<EventTarget, 'id'> = {
      year: editTargetRow.year ?? filterYear ?? THIS_YEAR,
      quarter: editTargetRow.quarter ?? filterQuarter ?? 'Q3',
      team: editTargetRow.team ?? '',
      activity_type: editTargetRow.activity_type ?? '',
      cpf_target: editTargetRow.cpf_target ?? 0,
      cpa_target: editTargetRow.cpa_target ?? 0,
      cpo_target: editTargetRow.cpo_target ?? 0,
      cpm_target: editTargetRow.cpm_target ?? 0,
      nc_target: editTargetRow.nc_target ?? 0,
      ec_target: editTargetRow.ec_target ?? 0,
      buy_value_target: editTargetRow.buy_value_target ?? 0,
    };
    await upsertEventTarget(full);
    setEditTargetRow(null);
    fetchEventTargets(filterYear || undefined, filterQuarter || undefined, filterTeam || undefined).then(setTargets);
  };

  const showForm = isCreating || isEditing;
  const formEvent = formData;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', gap: '20px', height: '100%', minHeight: 0 }}>

      {/* ── LEFT PANEL: Event List ── */}
      <div style={{ width: '380px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>

        {/* Filters */}
        <div className="card" style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700 }}>Events</span>
            <button className="btn btn-primary" onClick={openCreate} style={{ padding: '6px 14px', fontSize: '12px' }}>
              <i className="fa-solid fa-plus"></i> New Event
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
            <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))} style={{ fontSize: '12px', padding: '6px 8px' }}>
              {[2026, 2027, 2025].map(y => <option key={y} value={y}>{y}</option>)}
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
              {EVENT_STATUSES.map(s => <option key={s} value={s} style={{ textTransform: 'capitalize' }}>{statusLabel(s)}</option>)}
            </select>
          </div>
          <button className="btn btn-ghost" onClick={loadEvents} style={{ width: '100%', fontSize: '11px', padding: '5px' }}>
            <i className="fa-solid fa-rotate-right"></i> Refresh
          </button>
        </div>

        {/* Event list */}
        <div className="card" style={{ padding: '0', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {loading ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--txt-dim)' }}>
              <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '8px' }}></i>Loading…
            </div>
          ) : events.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--txt-dim)' }}>
              <i className="fa-solid fa-calendar-star" style={{ fontSize: '28px', marginBottom: '12px', display: 'block', opacity: 0.3 }}></i>
              No events found.<br />
              <span style={{ fontSize: '11px' }}>Create your first event or adjust filters.</span>
            </div>
          ) : (
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {events.map(ev => (
                <div
                  key={ev.id}
                  onClick={() => openDetail(ev)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(ev); }}}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                    background: selected?.id === ev.id ? 'var(--accent-dim)' : 'transparent',
                    borderLeft: selected?.id === ev.id ? '3px solid var(--accent)' : '3px solid transparent',
                  }}
                  onMouseEnter={e => { if (selected?.id !== ev.id) (e.currentTarget as HTMLDivElement).style.background = 'var(--ink)'; }}
                  onMouseLeave={e => { if (selected?.id !== ev.id) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--txt-main)', flex: 1, paddingRight: '8px' }}>{ev.event_name}</div>
                    <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '99px', background: `${statusColor(ev.status)}22`, color: statusColor(ev.status), border: `1px solid ${statusColor(ev.status)}44`, whiteSpace: 'nowrap', flexShrink: 0 }}>{statusLabel(ev.status)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                    <span className="pill pill-gold" style={{ fontSize: '9px' }}>{ev.team}</span>
                    <span className="pill pill-blue" style={{ fontSize: '9px' }}>{ev.activity_type}</span>
                    <span className="pill" style={{ fontSize: '9px', background: 'var(--border)', color: 'var(--txt-dim)' }}>{ev.quarter} {ev.year}</span>
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--txt-sub)' }}>
                    {labelDate(ev.start_date)} → {labelDate(ev.end_date)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Targets Button */}
        <button className="btn btn-ghost" onClick={() => setShowTargets(v => !v)} style={{ fontSize: '12px', padding: '8px' }}>
          <i className="fa-solid fa-bullseye"></i> {showTargets ? 'Hide' : 'Manage'} KPI Targets
        </button>
      </div>

      {/* ── RIGHT PANEL: Detail / Form / Targets ── */}
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>

        {/* Targets Panel */}
        {showTargets && (
          <div className="card" style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '15px' }}>
                <i className="fa-solid fa-bullseye" style={{ marginRight: '8px', color: 'var(--accent)' }}></i>
                KPI Targets by Quarter / Team / Type
              </h3>
              <button className="btn btn-primary" style={{ fontSize: '11px', padding: '6px 12px' }} onClick={() => setEditTargetRow({ year: filterYear || THIS_YEAR, quarter: filterQuarter || 'Q3', team: 'KPV', activity_type: 'Event (indoor)' })}>
                <i className="fa-solid fa-plus"></i> Add Target
              </button>
            </div>
            {editTargetRow && (
              <div style={{ background: 'var(--ink)', borderRadius: '10px', padding: '14px', marginBottom: '14px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', marginBottom: '8px' }}>
                  <select value={editTargetRow.year ?? THIS_YEAR} onChange={e => setEditTargetRow(r => ({ ...r, year: Number(e.target.value) }))} style={{ fontSize: '12px', padding: '6px' }}>
                    {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <select value={editTargetRow.quarter ?? 'Q3'} onChange={e => setEditTargetRow(r => ({ ...r, quarter: e.target.value }))} style={{ fontSize: '12px', padding: '6px' }}>
                    {QUARTERS.map(q => <option key={q} value={q}>{q}</option>)}
                  </select>
                  <select value={editTargetRow.team ?? 'KPV'} onChange={e => setEditTargetRow(r => ({ ...r, team: e.target.value }))} style={{ fontSize: '12px', padding: '6px' }}>
                    {EVENT_TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select value={editTargetRow.activity_type ?? 'Event (indoor)'} onChange={e => setEditTargetRow(r => ({ ...r, activity_type: e.target.value }))} style={{ fontSize: '12px', padding: '6px' }}>
                    {ACTIVITY_TYPES_EVENT.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', marginBottom: '10px' }}>
                  {(['nc_target','ec_target','cpf_target','cpa_target','cpo_target','cpm_target','buy_value_target'] as const).map(k => (
                    <div key={k}>
                      <div style={{ fontSize: '9px', color: 'var(--txt-dim)', textTransform: 'uppercase', marginBottom: '3px' }}>{k.replace('_target','').toUpperCase()}</div>
                      <input type="number" value={(editTargetRow as any)[k] ?? 0} onChange={e => setEditTargetRow(r => ({ ...r, [k]: Number(e.target.value) }))} style={{ fontSize: '12px', padding: '5px 8px' }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-primary" onClick={saveTarget} style={{ fontSize: '12px', padding: '7px 16px' }}>Save Target</button>
                  <button className="btn btn-ghost" onClick={() => setEditTargetRow(null)} style={{ fontSize: '12px', padding: '7px 12px' }}>Cancel</button>
                </div>
              </div>
            )}
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table compact" style={{ marginTop: 0 }}>
                <thead><tr>
                  <th>Year</th><th>Q</th><th>Team</th><th>Type</th>
                  <th>NC Tgt</th><th>EC Tgt</th><th>CPF Tgt</th><th>CPA Tgt</th><th>CPO Tgt</th><th>CPM Tgt</th><th>Buy Val Tgt</th>
                  <th></th>
                </tr></thead>
                <tbody>
                  {targets.length === 0 && <tr><td colSpan={12} style={{ textAlign: 'center', color: 'var(--txt-dim)', padding: '16px' }}>No targets found. Add one above or run the SQL seed.</td></tr>}
                  {targets.map(t => (
                    <tr key={t.id}>
                      <td>{t.year}</td><td>{t.quarter}</td><td><span className="pill pill-gold" style={{ fontSize: '9px' }}>{t.team}</span></td>
                      <td style={{ whiteSpace: 'nowrap' }}>{t.activity_type}</td>
                      <td>{t.nc_target.toLocaleString()}</td><td>{t.ec_target.toLocaleString()}</td>
                      <td>{fmtLAKShort(t.cpf_target)}</td><td>{fmtLAKShort(t.cpa_target)}</td>
                      <td>{fmtLAKShort(t.cpo_target)}</td><td>{fmtLAKShort(t.cpm_target)}</td>
                      <td>{fmtLAKShort(t.buy_value_target)}</td>
                      <td>
                        <button className="btn btn-ghost" onClick={() => setEditTargetRow(t)} style={{ padding: '3px 8px', fontSize: '10px' }}>Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!selected && !showForm && !showTargets && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--txt-dim)', textAlign: 'center' }}>
            <i className="fa-solid fa-calendar-star" style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.2 }}></i>
            <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>Select an event to view details</div>
            <div style={{ fontSize: '12px' }}>or click <strong>New Event</strong> to create one</div>
          </div>
        )}

        {/* ── CREATE / EDIT FORM ── */}
        {showForm && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>
                <i className={`fa-solid ${isCreating ? 'fa-plus-circle' : 'fa-pen'}`} style={{ marginRight: '8px', color: 'var(--accent)' }}></i>
                {isCreating ? 'New Event' : `Edit — ${selected?.event_name}`}
              </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                {saveMsg && <span style={{ fontSize: '11px', color: 'var(--red)', alignSelf: 'center' }}>{saveMsg}</span>}
                <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ fontSize: '12px', padding: '7px 18px' }}>
                  {saving ? <><i className="fa-solid fa-spinner fa-spin"></i> Saving…</> : <><i className="fa-solid fa-floppy-disk"></i> Save</>}
                </button>
                <button className="btn btn-ghost" onClick={() => { setIsCreating(false); setIsEditing(false); }} style={{ fontSize: '12px', padding: '7px 12px' }}>Cancel</button>
              </div>
            </div>

            <SectionTitle icon="fa-circle-info" title="Campaign Details" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px' }}>
              <FormField label="Event Name">
                <input value={formEvent.event_name} onChange={e => setField('event_name', e.target.value)} placeholder="e.g. LGF 2026" style={{ fontSize: '13px', padding: '8px 12px' }} />
              </FormField>
              <FormField label="Year">
                <select value={formEvent.year} onChange={e => setField('year', Number(e.target.value))} style={{ fontSize: '13px', padding: '8px 12px' }}>
                  {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </FormField>
              <FormField label="Quarter">
                <select value={formEvent.quarter} onChange={e => setField('quarter', e.target.value)} style={{ fontSize: '13px', padding: '8px 12px' }}>
                  {QUARTERS.map(q => <option key={q} value={q}>{q}</option>)}
                </select>
              </FormField>
              <FormField label="Team">
                <select value={formEvent.team} onChange={e => setField('team', e.target.value)} style={{ fontSize: '13px', padding: '8px 12px' }}>
                  {EVENT_TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </FormField>
              <FormField label="Activity Type">
                <select value={formEvent.activity_type} onChange={e => setField('activity_type', e.target.value)} style={{ fontSize: '13px', padding: '8px 12px' }}>
                  {ACTIVITY_TYPES_EVENT.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </FormField>
              <FormField label="Objective">
                <select value={formEvent.objective} onChange={e => setField('objective', e.target.value)} style={{ fontSize: '13px', padding: '8px 12px' }}>
                  {EVENT_OBJECTIVES.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </FormField>
              <FormField label="Start Date">
                <input type="date" value={formEvent.start_date} onChange={e => setField('start_date', e.target.value)} style={{ fontSize: '13px', padding: '8px 12px' }} />
              </FormField>
              <FormField label="End Date">
                <input type="date" value={formEvent.end_date} onChange={e => setField('end_date', e.target.value)} style={{ fontSize: '13px', padding: '8px 12px' }} />
              </FormField>
              <FormField label="Scale">
                <select value={formEvent.scale} onChange={e => setField('scale', e.target.value)} style={{ fontSize: '13px', padding: '8px 12px' }}>
                  <option value="">— Select —</option>
                  {EVENT_SCALES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </FormField>
              <FormField label="Status">
                <select value={formEvent.status} onChange={e => setField('status', e.target.value)} style={{ fontSize: '13px', padding: '8px 12px' }}>
                  {EVENT_STATUSES.map(s => <option key={s} value={s} style={{ textTransform: 'capitalize' }}>{statusLabel(s)}</option>)}
                </select>
              </FormField>
            </div>

            <SectionTitle icon="fa-align-left" title="Description & Notes" />
            <FormField label="Event Description / Objective Narrative">
              <textarea value={formEvent.description} onChange={e => setField('description', e.target.value)} rows={3} style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--txt-main)', padding: '10px 14px', borderRadius: '8px', fontFamily: 'var(--font-sans)', fontSize: '13px', resize: 'vertical' }} placeholder="Describe the event purpose, audience, mechanic…" />
            </FormField>
            <FormField label="Remarks">
              <input value={formEvent.remarks} onChange={e => setField('remarks', e.target.value)} placeholder="Any additional notes or comments" style={{ fontSize: '13px', padding: '8px 12px' }} />
            </FormField>

            <SectionTitle icon="fa-bullseye" title="Targets" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px' }}>
              <FormField label="Target NC (New Customers)">
                <input type="number" value={formEvent.target_nc} onChange={e => setField('target_nc', Number(e.target.value))} style={{ fontSize: '13px', padding: '8px 12px' }} min={0} />
              </FormField>
              <FormField label="Target EC (Existing Customers)">
                <input type="number" value={formEvent.target_ec} onChange={e => setField('target_ec', Number(e.target.value))} style={{ fontSize: '13px', padding: '8px 12px' }} min={0} />
              </FormField>
              <FormField label="Target Buy Value (₭)">
                <input type="number" value={formEvent.target_buy_value} onChange={e => setField('target_buy_value', Number(e.target.value))} style={{ fontSize: '13px', padding: '8px 12px' }} min={0} />
              </FormField>
            </div>

            <SectionTitle icon="fa-photo-film" title="Media" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <FormField label="Media Cost (₭)">
                <input type="number" value={formEvent.media_cost} onChange={e => setField('media_cost', Number(e.target.value))} style={{ fontSize: '13px', padding: '8px 12px' }} min={0} />
              </FormField>
              <FormField label="Total Media Impressions">
                <input type="number" value={formEvent.total_media_impressions} onChange={e => setField('total_media_impressions', Number(e.target.value))} style={{ fontSize: '13px', padding: '8px 12px' }} min={0} />
              </FormField>
              <FormField label="Media Channels (comma separated)">
                <input value={formEvent.media_channels} onChange={e => setField('media_channels', e.target.value)} placeholder="e.g. Facebook, TikTok, LINE, OOH" style={{ fontSize: '13px', padding: '8px 12px' }} />
              </FormField>
              <FormField label="Target Audience">
                <input value={formEvent.target_audience} onChange={e => setField('target_audience', e.target.value)} placeholder="e.g. NC + EC" style={{ fontSize: '13px', padding: '8px 12px' }} />
              </FormField>
              <FormField label="Featured Cities">
                <input value={formEvent.featured_cities} onChange={e => setField('featured_cities', e.target.value)} placeholder="e.g. Vientiane Capital" style={{ fontSize: '13px', padding: '8px 12px' }} />
              </FormField>
            </div>

            <SectionTitle icon="fa-link" title="Documents & Gallery" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
              <FormField label="Proposal / Pitch Deck Link">
                <input value={formEvent.proposal_link} onChange={e => setField('proposal_link', e.target.value)} placeholder="https://drive.google.com/..." style={{ fontSize: '13px', padding: '8px 12px' }} />
              </FormField>
              <FormField label="End-of-Activation Report Link">
                <input value={formEvent.end_of_activation_report_link} onChange={e => setField('end_of_activation_report_link', e.target.value)} placeholder="https://docs.google.com/..." style={{ fontSize: '13px', padding: '8px 12px' }} />
              </FormField>
              <FormField label="Photo Gallery Link (Google Photos)">
                <input value={formEvent.photo_gallery_link} onChange={e => setField('photo_gallery_link', e.target.value)} placeholder="https://photos.google.com/..." style={{ fontSize: '13px', padding: '8px 12px' }} />
              </FormField>
            </div>

            <SectionTitle icon="fa-check-circle" title="Regional Approval" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <FormField label="Regional Approved?">
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', paddingTop: '8px' }}>
                  <input type="checkbox" checked={formEvent.regional_approved} onChange={e => setField('regional_approved', e.target.checked)} style={{ width: '16px', height: '16px' }} />
                  <span style={{ fontSize: '13px' }}>{formEvent.regional_approved ? 'Yes — Approved' : 'Not yet approved'}</span>
                </label>
              </FormField>
              {formEvent.regional_approved && (
                <FormField label="Approval Date">
                  <input type="date" value={formEvent.approval_date} onChange={e => setField('approval_date', e.target.value)} style={{ fontSize: '13px', padding: '8px 12px' }} />
                </FormField>
              )}
            </div>

            <SectionTitle icon="fa-gift" title="Merch" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <FormField label="Merch Required?">
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', paddingTop: '8px' }}>
                  <input type="checkbox" checked={formEvent.merch_required} onChange={e => setField('merch_required', e.target.checked)} style={{ width: '16px', height: '16px' }} />
                  <span style={{ fontSize: '13px' }}>{formEvent.merch_required ? 'Yes' : 'No'}</span>
                </label>
              </FormField>
              {formEvent.merch_required && (
                <FormField label="Merch Details (What / Mechanics)">
                  <input value={formEvent.merch_details} onChange={e => setField('merch_details', e.target.value)} placeholder="What merch + mechanics" style={{ fontSize: '13px', padding: '8px 12px' }} />
                </FormField>
              )}
            </div>
          </div>
        )}

        {/* ── DETAIL VIEW ── */}
        {selected && !showForm && (
          <div>
            {/* Header */}
            <div className="card" style={{ marginBottom: '16px', padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
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
                    {selected.regional_approved && (
                      <span style={{ marginLeft: '12px', color: 'var(--green)', fontWeight: 700 }}>
                        <i className="fa-solid fa-circle-check" style={{ marginRight: '4px' }}></i>Regional Approved {selected.approval_date ? labelDate(selected.approval_date) : ''}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-ghost" onClick={startEdit} style={{ fontSize: '12px', padding: '7px 14px' }}>
                    <i className="fa-solid fa-pen"></i> Edit
                  </button>
                  <button className="btn btn-ghost" onClick={handleDelete} style={{ fontSize: '12px', padding: '7px 14px', color: 'var(--red)', borderColor: 'var(--red-dim)' }}>
                    <i className="fa-solid fa-trash"></i>
                  </button>
                </div>
              </div>

              {selected.description && (
                <div style={{ marginTop: '14px', fontSize: '13px', color: 'var(--txt-sub)', lineHeight: 1.6, background: 'var(--ink)', borderRadius: '8px', padding: '12px 16px' }}>
                  {selected.description}
                </div>
              )}
            </div>

            {/* KPI Summary Row */}
            {kpis && (
              <div className="card" style={{ marginBottom: '16px', padding: '16px 20px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
                  <i className="fa-solid fa-chart-mixed" style={{ marginRight: '6px', color: 'var(--accent)' }}></i>
                  Live KPI Summary — {kpis.linked_count} linked submission{kpis.linked_count !== 1 ? 's' : ''}
                </div>

                {/* Cost row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '12px' }}>
                  <KpiChip label="Total Cost" value={fmtLAKShort(kpis.total_cost)} sub={`Subs: ${fmtLAKShort(kpis.total_cost_from_subs)} + Media: ${fmtLAKShort(selected.media_cost)}`} color="var(--accent)" />
                  <KpiChip label="CPA (per NC)" value={kpis.cpa > 0 ? fmtLAK(Math.round(kpis.cpa)) : '—'} color="var(--orange)" />
                  <KpiChip label="CPO (per Order)" value={kpis.cpo > 0 ? fmtLAK(Math.round(kpis.cpo)) : '—'} color="var(--blue)" />
                  <KpiChip label="CPF (per Footfall)" value={kpis.cpf > 0 ? fmtLAK(Math.round(kpis.cpf)) : '—'} color="var(--green)" />
                </div>
                {/* Volume row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '12px' }}>
                  <KpiChip label="New Customers (NC)" value={kpis.total_nc.toLocaleString()} sub={selected.target_nc > 0 ? `Target: ${selected.target_nc.toLocaleString()} (${fmtPct(kpis.pct_nc)})` : undefined} color={kpis.pct_nc >= 100 ? 'var(--green)' : kpis.pct_nc >= 70 ? 'var(--orange)' : 'var(--txt-main)'} />
                  <KpiChip label="Existing Cust (EC)" value={kpis.total_ec.toLocaleString()} sub={selected.target_ec > 0 ? `Target: ${selected.target_ec.toLocaleString()} (${fmtPct(kpis.pct_ec)})` : undefined} />
                  <KpiChip label="Buy Value" value={fmtLAKShort(kpis.total_buy_value)} sub={selected.target_buy_value > 0 ? `Target: ${fmtLAKShort(selected.target_buy_value)} (${fmtPct(kpis.pct_buy_value)})` : undefined} color={kpis.pct_buy_value >= 100 ? 'var(--green)' : 'var(--txt-main)'} />
                  <KpiChip label="Footfall" value={kpis.total_footfall.toLocaleString()} />
                </div>
                {/* Progress bars */}
                {selected.target_nc > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px' }}>
                    {[
                      { label: '% NC Target Hit', pct: kpis.pct_nc, color: 'var(--accent)' },
                      { label: '% EC Target Hit', pct: kpis.pct_ec, color: 'var(--blue)' },
                      { label: '% Buy Value Hit', pct: kpis.pct_buy_value, color: 'var(--green)' },
                    ].map(row => (
                      <div key={row.label}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--txt-sub)', marginBottom: '2px' }}>
                          <span>{row.label}</span>
                          <span style={{ fontWeight: 700, color: row.pct >= 100 ? 'var(--green)' : 'var(--txt-main)' }}>{fmtPct(row.pct)}</span>
                        </div>
                        <ProgressBar pct={row.pct} color={row.pct >= 100 ? 'var(--green)' : row.color} />
                      </div>
                    ))}
                  </div>
                )}
                {kpis.total_footfall > 0 && (selected?.total_media_impressions ?? 0) > 0 && (
                  <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--txt-dim)' }}>
                    CPM: <strong style={{ color: 'var(--txt-main)' }}>{fmtLAK(Math.round(kpis.cpm))}</strong> · Impressions: {selected?.total_media_impressions?.toLocaleString()}
                  </div>
                )}
              </div>
            )}

            {/* Details grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              {/* Media & Objectives */}
              <div className="card" style={{ padding: '16px 20px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
                  <i className="fa-solid fa-photo-film" style={{ marginRight: '6px', color: 'var(--accent)' }}></i>Media & Objective
                </div>
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
                    <span style={{ fontWeight: 600, textAlign: 'right', maxWidth: '60%' }}>{r.val}</span>
                  </div>
                ))}
              </div>

              {/* Documents & Merch */}
              <div className="card" style={{ padding: '16px 20px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
                  <i className="fa-solid fa-link" style={{ marginRight: '6px', color: 'var(--accent)' }}></i>Documents & Gallery
                </div>
                {[
                  { label: '📄 Proposal / Pitch Deck', url: selected.proposal_link },
                  { label: '📊 End-of-Activation Report', url: selected.end_of_activation_report_link },
                  { label: '📸 Photo Gallery', url: selected.photo_gallery_link },
                ].map(r => (
                  <div key={r.label} style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '10px', color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>{r.label}</div>
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: 'var(--accent)', wordBreak: 'break-all' }}>
                        <i className="fa-solid fa-arrow-up-right-from-square" style={{ marginRight: '5px', fontSize: '10px' }}></i>
                        {r.url.length > 55 ? r.url.slice(0, 55) + '…' : r.url}
                      </a>
                    ) : <span style={{ fontSize: '12px', color: 'var(--txt-dim)' }}>—</span>}
                  </div>
                ))}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px', marginTop: '6px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Merch</div>
                  <div style={{ fontSize: '12px' }}>
                    <span className={`pill ${selected.merch_required ? 'pill-green' : ''}`} style={!selected.merch_required ? { background: 'var(--border)', color: 'var(--txt-dim)' } : {}}>
                      {selected.merch_required ? 'Required' : 'Not Required'}
                    </span>
                    {selected.merch_required && selected.merch_details && (
                      <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--txt-sub)' }}>{selected.merch_details}</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Linked Submissions */}
            <div className="card" style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  <i className="fa-solid fa-file-invoice" style={{ marginRight: '6px', color: 'var(--accent)' }}></i>
                  Linked Submissions ({linkedSubs.length})
                </div>
                <button className="btn btn-ghost" onClick={openLinker} style={{ fontSize: '11px', padding: '5px 12px' }}>
                  <i className="fa-solid fa-link"></i> Link Submission
                </button>
              </div>

              {/* Link picker */}
              {showLinker && (
                <div style={{ background: 'var(--ink)', borderRadius: '10px', padding: '12px', marginBottom: '12px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--txt-dim)', marginBottom: '8px' }}>
                    Unlinked Event-type Submissions — click to link to this event
                  </div>
                  {unlinkedSubs.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--txt-dim)' }}>
                      No unlinked event submissions found. Submit results with Activity Type = "Event" first.
                    </div>
                  ) : (
                    <table className="data-table compact" style={{ marginTop: 0 }}>
                      <thead><tr><th>Date</th><th>Team</th><th>Branch</th><th>NC</th><th>Cost</th><th></th></tr></thead>
                      <tbody>
                        {unlinkedSubs.map(s => (
                          <tr key={s.id}>
                            <td>{labelDate(s.date)}</td>
                            <td><span className="pill pill-gold" style={{ fontSize: '9px' }}>{s.team}</span></td>
                            <td>{s.branch}</td>
                            <td>{s.new_register.toLocaleString()}</td>
                            <td>{fmtLAKShort((s.team_cost || 0) + (s.merch_cost || 0) + (s.sponsorship_cost || 0) + (s.prod_cost || 0))}</td>
                            <td>
                              <button className="btn btn-primary" onClick={() => handleLink(s.id)} style={{ fontSize: '10px', padding: '3px 10px' }}>
                                <i className="fa-solid fa-link"></i> Link
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <button className="btn btn-ghost" onClick={() => setShowLinker(false)} style={{ fontSize: '11px', padding: '5px 12px', marginTop: '8px' }}>Close</button>
                </div>
              )}

              {subsLoading ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--txt-dim)' }}><i className="fa-solid fa-spinner fa-spin"></i></div>
              ) : linkedSubs.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--txt-dim)', fontSize: '12px' }}>
                  No linked submissions yet. Use the "Link Submission" button above.
                </div>
              ) : (
                <table className="data-table compact">
                  <thead>
                    <tr>
                      <th>Date</th><th>Team</th><th>Branch</th>
                      <th>NC</th><th>EC</th><th>Footfall</th><th>Total Cost</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {linkedSubs.map(s => {
                      const cost = (s.team_cost || 0) + (s.merch_cost || 0) + (s.sponsorship_cost || 0) + (s.prod_cost || 0);
                      return (
                        <tr key={s.id}>
                          <td>{labelDate(s.date)}</td>
                          <td><span className="pill pill-gold" style={{ fontSize: '9px' }}>{s.team}</span></td>
                          <td>{s.branch}</td>
                          <td><strong>{s.new_register.toLocaleString()}</strong></td>
                          <td>{s.existing_users.toLocaleString()}</td>
                          <td>{(s.footfall || 0).toLocaleString()}</td>
                          <td style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{fmtLAKShort(cost)}</td>
                          <td>
                            <button className="btn btn-ghost" onClick={() => handleUnlink(s.id)} title="Unlink this submission" style={{ padding: '2px 8px', fontSize: '10px', color: 'var(--red)' }}>
                              <i className="fa-solid fa-link-slash"></i>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {linkedSubs.length > 0 && kpis && (
                    <tfoot>
                      <tr style={{ fontWeight: 700 }}>
                        <td colSpan={3}>Total from Submissions</td>
                        <td style={{ color: 'var(--accent)' }}>{kpis.total_nc.toLocaleString()}</td>
                        <td>{kpis.total_ec.toLocaleString()}</td>
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

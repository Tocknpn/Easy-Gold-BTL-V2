import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Event, EventKPIs, EventTarget, LinkedSubmission } from '../lib/events';
import {
  fetchEvents, fetchLinkedSubmissions, computeEventKPIs, fetchEventTargets,
  ACTIVITY_TYPES_EVENT, EVENT_TEAMS, QUARTERS,
  currentQuarter, fmtLAK, fmtLAKShort, fmtPct, statusColor, statusLabel,
} from '../lib/events';

// ── Helpers ────────────────────────────────────────────────────────────────

const THIS_YEAR = new Date().getFullYear();
const labelDate = (s: string) => {
  if (!s) return '—';
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
};

// ── Sub-components ─────────────────────────────────────────────────────────

function MetricBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  const c = Math.min(100, pct);
  return (
    <div style={{ marginBottom: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--txt-sub)', marginBottom: '2px' }}>
        <span>{label}</span>
        <span style={{ fontWeight: 700, color: pct >= 100 ? 'var(--green)' : 'var(--txt-main)' }}>{fmtPct(pct)}</span>
      </div>
      <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${c}%`, background: pct >= 100 ? 'var(--green)' : color, borderRadius: '2px', transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

function KpiPill({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '8px 4px' }}>
      <div style={{ fontSize: '8px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '14px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: color || 'var(--txt-main)' }}>{value}</div>
    </div>
  );
}

// ── Event Card ─────────────────────────────────────────────────────────────

interface EventCardProps {
  event: Event;
  kpis: EventKPIs | null;
  targets: EventTarget[];
  onClick: () => void;
}

function EventCard({ event, kpis, targets, onClick }: EventCardProps) {
  const target = targets.find(t =>
    t.team === event.team &&
    t.activity_type === event.activity_type &&
    t.quarter === event.quarter &&
    t.year === event.year
  );

  const teamColor = event.team === 'Agency' ? 'var(--blue)' : event.team === 'ESG' ? 'var(--green)' : 'var(--accent)';
  const teamPillClass = event.team === 'Agency' ? 'pill-blue' : event.team === 'ESG' ? 'pill-green' : 'pill-gold';

  return (
    <div
      className="card"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }}}
      style={{
        cursor: 'pointer',
        padding: 0,
        overflow: 'hidden',
        transition: 'transform 0.18s ease, box-shadow 0.18s ease',
        display: 'flex',
        flexDirection: 'column',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-sm)';
      }}
    >
      {/* Card header — coloured by team */}
      <div style={{
        background: `linear-gradient(135deg, ${teamColor}22, ${teamColor}08)`,
        borderBottom: `2px solid ${teamColor}44`,
        padding: '16px 18px 12px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            <span className={`pill ${teamPillClass}`} style={{ fontSize: '9px' }}>{event.team}</span>
            <span className="pill" style={{ fontSize: '9px', background: 'var(--border)', color: 'var(--txt-dim)' }}>{event.quarter} {event.year}</span>
          </div>
          <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '99px', background: `${statusColor(event.status)}22`, color: statusColor(event.status), border: `1px solid ${statusColor(event.status)}44`, flexShrink: 0 }}>
            {statusLabel(event.status)}
          </span>
        </div>

        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--txt-main)', marginBottom: '3px', lineHeight: 1.3 }}>
          {event.event_name}
        </div>
        <div style={{ fontSize: '10px', color: 'var(--txt-sub)' }}>
          <i className="fa-solid fa-tag" style={{ marginRight: '4px', fontSize: '9px' }}></i>{event.activity_type}
          &nbsp;·&nbsp;
          <i className="fa-regular fa-calendar" style={{ marginRight: '4px', fontSize: '9px' }}></i>
          {labelDate(event.start_date)} → {labelDate(event.end_date)}
        </div>
      </div>

      {/* KPI metrics grid */}
      <div style={{ padding: '12px 18px', flex: 1 }}>
        {kpis ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderBottom: '1px solid var(--border)', marginBottom: '10px' }}>
              <KpiPill label="NC" value={kpis.total_nc.toLocaleString()} color="var(--accent)" />
              <KpiPill label="Cost" value={fmtLAKShort(kpis.total_cost)} color="var(--orange)" />
              <KpiPill label="CPA" value={kpis.cpa > 0 ? fmtLAKShort(Math.round(kpis.cpa)) : '—'} color="var(--blue)" />
              <KpiPill label="CPF" value={kpis.cpf > 0 ? fmtLAKShort(Math.round(kpis.cpf)) : '—'} color="var(--green)" />
            </div>

            {/* Progress bars (only if targets set) */}
            {event.target_nc > 0 && (
              <>
                <MetricBar label="NC Target" pct={kpis.pct_nc} color="var(--accent)" />
                {event.target_buy_value > 0 && <MetricBar label="Buy Value Target" pct={kpis.pct_buy_value} color="var(--green)" />}
              </>
            )}
            {event.target_nc === 0 && (
              <div style={{ fontSize: '11px', color: 'var(--txt-dim)', textAlign: 'center', padding: '6px 0' }}>
                {kpis.linked_count} submission{kpis.linked_count !== 1 ? 's' : ''} linked · No targets set
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: '11px', color: 'var(--txt-dim)', textAlign: 'center', padding: '12px 0' }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '6px' }}></i>Computing KPIs…
          </div>
        )}
      </div>

      {/* Footer links */}
      {(event.photo_gallery_link || event.proposal_link || event.regional_approved) && (
        <div style={{ padding: '8px 18px', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px', alignItems: 'center' }}>
          {event.regional_approved && (
            <span style={{ fontSize: '10px', color: 'var(--green)', fontWeight: 700 }}>
              <i className="fa-solid fa-circle-check" style={{ marginRight: '3px' }}></i>Approved
            </span>
          )}
          {event.photo_gallery_link && (
            <a href={event.photo_gallery_link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: '10px', color: 'var(--txt-sub)', textDecoration: 'none' }}>
              <i className="fa-solid fa-images" style={{ marginRight: '3px' }}></i>Gallery
            </a>
          )}
          {event.proposal_link && (
            <a href={event.proposal_link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: '10px', color: 'var(--txt-sub)', textDecoration: 'none' }}>
              <i className="fa-solid fa-file-pdf" style={{ marginRight: '3px' }}></i>Proposal
            </a>
          )}
          {target && (
            <span style={{ marginLeft: 'auto', fontSize: '9px', color: 'var(--txt-dim)' }}>
              CPF Tgt: {fmtLAKShort(target.cpf_target)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Detail Modal ───────────────────────────────────────────────────────────

interface ModalProps {
  event: Event | null;
  kpis: EventKPIs | null;
  subs: LinkedSubmission[];
  targets: EventTarget[];
  onClose: () => void;
}

function EventDetailModal({ event, kpis, subs, targets, onClose }: ModalProps) {
  if (!event) return null;

  const target = targets.find(t =>
    t.team === event.team &&
    t.activity_type === event.activity_type &&
    t.quarter === event.quarter &&
    t.year === event.year
  );

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(10,15,30,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`Event profile: ${event.event_name}`}
    >
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', width: '100%', maxWidth: '860px', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column' }}>

        {/* Modal Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg, var(--accent-dim), transparent)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
                <span className={`pill ${event.team === 'Agency' ? 'pill-blue' : 'pill-gold'}`}>{event.team}</span>
                <span className="pill pill-blue" style={{ fontSize: '9px' }}>{event.activity_type}</span>
                <span className="pill" style={{ fontSize: '9px', background: 'var(--border)', color: 'var(--txt-dim)' }}>{event.quarter} {event.year}</span>
                {event.scale && <span className="pill" style={{ fontSize: '9px', background: 'var(--orange-dim)', color: 'var(--orange)' }}>{event.scale}</span>}
                <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '99px', background: `${statusColor(event.status)}22`, color: statusColor(event.status), border: `1px solid ${statusColor(event.status)}44` }}>{statusLabel(event.status)}</span>
              </div>
              <h2 style={{ margin: '0 0 4px', fontSize: '22px', fontWeight: 800 }}>{event.event_name}</h2>
              <div style={{ fontSize: '12px', color: 'var(--txt-sub)' }}>
                {labelDate(event.start_date)} → {labelDate(event.end_date)}
                {event.regional_approved && <span style={{ marginLeft: '12px', color: 'var(--green)', fontWeight: 700 }}><i className="fa-solid fa-circle-check" style={{ marginRight: '4px' }}></i>Approved {event.approval_date ? labelDate(event.approval_date) : ''}</span>}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-sub)', fontSize: '20px', padding: '4px 8px', lineHeight: 1 }} aria-label="Close modal">×</button>
          </div>
          {event.description && (
            <div style={{ marginTop: '12px', fontSize: '13px', color: 'var(--txt-sub)', lineHeight: 1.6, background: 'var(--ink)', borderRadius: '8px', padding: '10px 14px' }}>
              {event.description}
            </div>
          )}
        </div>

        {/* KPI Dashboard */}
        {kpis && (
          <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'var(--ink)' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
              <i className="fa-solid fa-chart-mixed" style={{ marginRight: '6px', color: 'var(--accent)' }}></i>
              Performance KPIs — {kpis.linked_count} Submission{kpis.linked_count !== 1 ? 's' : ''} Linked
            </div>

            {/* Main KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '12px' }}>
              {[
                { label: 'TOTAL COST', val: fmtLAKShort(kpis.total_cost), sub: `Subs ₭${(kpis.total_cost_from_subs / 1e6).toFixed(1)}M + Media ₭${(event.media_cost / 1e6).toFixed(1)}M`, color: 'var(--accent)' },
                { label: 'CPA (per NC)', val: kpis.cpa > 0 ? fmtLAK(Math.round(kpis.cpa)) : '—', sub: target ? `Target: ${fmtLAK(target.cpa_target)}` : undefined, color: kpis.cpa > 0 && target && kpis.cpa <= target.cpa_target ? 'var(--green)' : 'var(--orange)' },
                { label: 'CPO (per Order)', val: kpis.cpo > 0 ? fmtLAK(Math.round(kpis.cpo)) : '—', sub: target ? `Target: ${fmtLAK(target.cpo_target)}` : undefined, color: 'var(--blue)' },
                { label: 'CPM (per 1K imp)', val: kpis.cpm > 0 ? fmtLAK(Math.round(kpis.cpm)) : '—', sub: target ? `Target: ${fmtLAK(target.cpm_target)}` : undefined, color: 'var(--txt-main)' },
              ].map(m => (
                <div key={m.label} style={{ background: 'var(--surface)', borderRadius: '10px', padding: '12px 14px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '3px' }}>{m.label}</div>
                  <div style={{ fontSize: '20px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: m.color }}>{m.val}</div>
                  {m.sub && <div style={{ fontSize: '10px', color: 'var(--txt-sub)', marginTop: '2px' }}>{m.sub}</div>}
                </div>
              ))}
            </div>

            {/* Volume row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '12px' }}>
              {[
                { label: 'NC Achieved', val: kpis.total_nc.toLocaleString(), sub: `Target: ${event.target_nc.toLocaleString()}`, pct: kpis.pct_nc, color: 'var(--accent)' },
                { label: 'EC Achieved', val: kpis.total_ec.toLocaleString(), sub: `Target: ${event.target_ec.toLocaleString()}`, pct: kpis.pct_ec, color: 'var(--blue)' },
                { label: 'Buy Value', val: fmtLAKShort(kpis.total_buy_value), sub: `Target: ${fmtLAKShort(event.target_buy_value)}`, pct: kpis.pct_buy_value, color: 'var(--green)' },
                { label: 'Footfall', val: kpis.total_footfall.toLocaleString(), sub: `CPF: ${kpis.cpf > 0 ? fmtLAK(Math.round(kpis.cpf)) : '—'}${target ? ` (Tgt: ${fmtLAK(target.cpf_target)})` : ''}`, pct: null as null, color: 'var(--txt-main)' },
              ].map(m => (
                <div key={m.label} style={{ background: 'var(--surface)', borderRadius: '10px', padding: '12px 14px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '3px' }}>{m.label}</div>
                  <div style={{ fontSize: '20px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: m.pct !== null && m.pct >= 100 ? 'var(--green)' : m.color }}>{m.val}</div>
                  {m.sub && event.target_nc > 0 && <div style={{ fontSize: '10px', color: 'var(--txt-sub)', marginTop: '2px' }}>{m.sub}</div>}
                  {m.pct !== null && event.target_nc > 0 && (
                    <div style={{ height: '3px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden', marginTop: '5px' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, m.pct)}%`, background: m.pct >= 100 ? 'var(--green)' : m.color, borderRadius: '2px' }} />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* % targets summary */}
            {event.target_nc > 0 && (
              <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px' }}>%NC Hit: <strong style={{ color: kpis.pct_nc >= 100 ? 'var(--green)' : kpis.pct_nc >= 70 ? 'var(--orange)' : 'var(--red)' }}>{fmtPct(kpis.pct_nc)}</strong></span>
                <span style={{ fontSize: '12px' }}>%EC Hit: <strong style={{ color: kpis.pct_ec >= 100 ? 'var(--green)' : 'var(--txt-main)' }}>{fmtPct(kpis.pct_ec)}</strong></span>
                <span style={{ fontSize: '12px' }}>%Buy Value Hit: <strong style={{ color: kpis.pct_buy_value >= 100 ? 'var(--green)' : 'var(--txt-main)' }}>{fmtPct(kpis.pct_buy_value)}</strong></span>
              </div>
            )}
          </div>
        )}

        {/* Info sections */}
        <div style={{ padding: '16px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {/* Media & Objective */}
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Media & Objective</div>
            {[
              { label: 'Objective', val: event.objective },
              { label: 'Media Channels', val: event.media_channels || '—' },
              { label: 'Media Cost', val: fmtLAK(event.media_cost) },
              { label: 'Impressions', val: event.total_media_impressions > 0 ? event.total_media_impressions.toLocaleString() : '—' },
              { label: 'Target Audience', val: event.target_audience || '—' },
              { label: 'Featured Cities', val: event.featured_cities || '—' },
            ].map(r => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '12px' }}>
                <span style={{ color: 'var(--txt-sub)' }}>{r.label}</span>
                <span style={{ fontWeight: 600 }}>{r.val}</span>
              </div>
            ))}
          </div>

          {/* Documents */}
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Documents & Gallery</div>
            {[
              { label: '📄 Proposal / Pitch Deck', url: event.proposal_link },
              { label: '📊 End-of-Activation Report', url: event.end_of_activation_report_link },
              { label: '📸 Photo Gallery (Google Photos)', url: event.photo_gallery_link },
            ].map(r => (
              <div key={r.label} style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '10px', color: 'var(--txt-dim)', marginBottom: '3px' }}>{r.label}</div>
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: '11px', display: 'inline-flex', gap: '6px' }}>
                    <i className="fa-solid fa-arrow-up-right-from-square"></i> Open Link
                  </a>
                ) : <span style={{ fontSize: '11px', color: 'var(--txt-dim)' }}>No link provided</span>}
              </div>
            ))}
            {event.remarks && (
              <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--txt-sub)', background: 'var(--ink)', borderRadius: '8px', padding: '10px 12px' }}>
                <strong>Remarks:</strong> {event.remarks}
              </div>
            )}
          </div>
        </div>

        {/* Linked Submissions table */}
        {subs.length > 0 && (
          <div style={{ padding: '0 24px 20px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
              Linked Submissions ({subs.length})
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table compact" style={{ marginTop: 0 }}>
                <thead><tr><th>Date</th><th>Team</th><th>Branch</th><th>NC</th><th>EC</th><th>Footfall</th><th>Buy Value</th><th>Total Cost</th></tr></thead>
                <tbody>
                  {subs.map(s => {
                    const cost = (s.team_cost||0)+(s.merch_cost||0)+(s.sponsorship_cost||0)+(s.prod_cost||0);
                    const bv = (s.buy_value_new||0)+(s.buy_value_existing||0);
                    return (
                      <tr key={s.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{labelDate(s.date)}</td>
                        <td><span className="pill pill-gold" style={{ fontSize: '9px' }}>{s.team}</span></td>
                        <td>{s.branch}</td>
                        <td><strong>{s.new_register.toLocaleString()}</strong></td>
                        <td>{s.existing_users.toLocaleString()}</td>
                        <td>{(s.footfall||0).toLocaleString()}</td>
                        <td>{fmtLAKShort(bv)}</td>
                        <td style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{fmtLAKShort(cost)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <button onClick={onClose} className="btn btn-ghost" style={{ fontSize: '13px' }}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function EventReport() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [allKpis, setAllKpis] = useState<Record<string, EventKPIs>>({});
  const [allSubs, setAllSubs] = useState<Record<string, LinkedSubmission[]>>({});
  const [targets, setTargets] = useState<EventTarget[]>([]);

  // Filters
  const [filterYear, setFilterYear] = useState<number>(THIS_YEAR);
  const [filterQuarter, setFilterQuarter] = useState<string>(currentQuarter());
  const [filterTeam, setFilterTeam] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('active');

  // Modal
  const [modalEvent, setModalEvent] = useState<Event | null>(null);

  // ── Load events ──
  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: evs }, tgts] = await Promise.all([
      fetchEvents({
        year: filterYear || undefined,
        quarter: filterQuarter || undefined,
        team: filterTeam || undefined,
        status: filterStatus || undefined,
      }),
      fetchEventTargets(filterYear || undefined, filterQuarter || undefined),
    ]);
    setEvents(evs);
    setTargets(tgts);
    setLoading(false);

    // Load KPIs for all events concurrently
    const kpiMap: Record<string, EventKPIs> = {};
    const subsMap: Record<string, LinkedSubmission[]> = {};
    await Promise.all(evs.map(async ev => {
      const subs = await fetchLinkedSubmissions(ev.id);
      subsMap[ev.id] = subs;
      kpiMap[ev.id] = computeEventKPIs(ev, subs);
    }));
    setAllKpis(kpiMap);
    setAllSubs(subsMap);
  }, [filterYear, filterQuarter, filterTeam, filterStatus]);

  useEffect(() => { loadData(); }, [loadData]);

  // Filter by type client-side
  const displayed = useMemo(() =>
    filterType ? events.filter(e => e.activity_type === filterType) : events,
    [events, filterType]
  );

  // ── Aggregate KPIs for summary row ──
  const totalKpis = useMemo(() => {
    let total_cost = 0, total_nc = 0, total_ec = 0, total_buy_value = 0, total_footfall = 0;
    for (const ev of displayed) {
      const k = allKpis[ev.id];
      if (k) { total_cost += k.total_cost; total_nc += k.total_nc; total_ec += k.total_ec; total_buy_value += k.total_buy_value; total_footfall += k.total_footfall; }
    }
    return { total_cost, total_nc, total_ec, total_buy_value, total_footfall };
  }, [displayed, allKpis]);

  return (
    <div>
      {/* Filter bar */}
      <div className="card" style={{ marginBottom: '20px', padding: '14px 20px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))} style={{ fontSize: '12px', padding: '7px 10px', width: 'auto' }}>
          {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={filterQuarter} onChange={e => setFilterQuarter(e.target.value)} style={{ fontSize: '12px', padding: '7px 10px', width: 'auto' }}>
          <option value="">All Quarters</option>
          {QUARTERS.map(q => <option key={q} value={q}>{q}</option>)}
        </select>
        <select value={filterTeam} onChange={e => setFilterTeam(e.target.value)} style={{ fontSize: '12px', padding: '7px 10px', width: 'auto' }}>
          <option value="">All Teams</option>
          {EVENT_TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ fontSize: '12px', padding: '7px 10px', width: 'auto' }}>
          <option value="">All Types</option>
          {ACTIVITY_TYPES_EVENT.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ fontSize: '12px', padding: '7px 10px', width: 'auto' }}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button className="btn btn-ghost" onClick={loadData} style={{ fontSize: '12px', padding: '7px 14px', marginLeft: 'auto' }}>
          <i className="fa-solid fa-rotate-right"></i> Refresh
        </button>
      </div>

      {/* Summary banner */}
      {displayed.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '12px', marginBottom: '20px' }}>
          {[
            { label: 'Events', val: displayed.length.toString(), icon: 'fa-calendar-star', color: 'var(--accent)' },
            { label: 'Total NC', val: totalKpis.total_nc.toLocaleString(), icon: 'fa-user-plus', color: 'var(--accent)' },
            { label: 'Total EC', val: totalKpis.total_ec.toLocaleString(), icon: 'fa-users', color: 'var(--blue)' },
            { label: 'Total Buy Value', val: fmtLAKShort(totalKpis.total_buy_value), icon: 'fa-sack-dollar', color: 'var(--green)' },
            { label: 'Total Cost', val: fmtLAKShort(totalKpis.total_cost), icon: 'fa-coins', color: 'var(--orange)' },
          ].map(m => (
            <div key={m.label} className="card kpi-card" style={{ padding: '14px 18px', borderTopColor: m.color }}>
              <div className="kpi-icon"><i className={`fa-solid ${m.icon}`} style={{ color: m.color }}></i></div>
              <div className="kpi-label" style={{ color: m.color }}>{m.label}</div>
              <div className="kpi-val" style={{ fontSize: '20px' }}>{m.val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Cards grid */}
      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--txt-dim)' }}>
          <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '28px', marginBottom: '12px', display: 'block' }}></i>
          Loading events…
        </div>
      ) : displayed.length === 0 ? (
        <div style={{ padding: '64px', textAlign: 'center', color: 'var(--txt-dim)' }}>
          <i className="fa-solid fa-calendar-star" style={{ fontSize: '48px', marginBottom: '16px', display: 'block', opacity: 0.2 }}></i>
          <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px' }}>No events found</div>
          <div style={{ fontSize: '12px' }}>Adjust the filters or create events in Event Management.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {displayed.map(ev => (
            <EventCard
              key={ev.id}
              event={ev}
              kpis={allKpis[ev.id] ?? null}
              targets={targets}
              onClick={() => setModalEvent(ev)}
            />
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {modalEvent && (
        <EventDetailModal
          event={modalEvent}
          kpis={allKpis[modalEvent.id] ?? null}
          subs={allSubs[modalEvent.id] ?? []}
          targets={targets}
          onClose={() => setModalEvent(null)}
        />
      )}
    </div>
  );
}

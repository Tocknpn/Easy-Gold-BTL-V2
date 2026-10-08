import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Event } from '../lib/events';
import {
  fetchEvents, fetchEventTypes,
  computeEventHitSummary,
  EVENT_TEAMS, MONTHS,
  fmtLAK, fmtLAKShort, fmtPct, statusColor, statusLabel, scaleColor,
} from '../lib/events';

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

// ── Main Page ──────────────────────────────────────────────────────────────

export default function EventReport() {
  const [events, setEvents] = useState<Event[]>([]);
  const [eventTypeNames, setEventTypeNames] = useState<string[]>([]);

  // Filters
  const [filterYear, setFilterYear] = useState<number>(THIS_YEAR);
  const [filterMonth, setFilterMonth] = useState<number>(9); // Default September as in executive report
  const [filterTeam, setFilterTeam] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  // View mode: 'slide' (matches user attachment) vs 'detail' (analytics drilldown)
  const [viewMode, setViewMode] = useState<'slide' | 'detail'>('slide');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Modals
  const [modalEvent, setModalEvent] = useState<Event | null>(null);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  // ── Load events ──
  const loadData = useCallback(async () => {
    const [{ data: evs }, types] = await Promise.all([
      fetchEvents({
        year: filterYear || undefined,
        team: filterTeam || undefined,
        status: filterStatus || undefined,
      }),
      fetchEventTypes(),
    ]);
    setEvents(evs);
    setEventTypeNames(types.map(t => t.name));
  }, [filterYear, filterTeam, filterStatus]);

  useEffect(() => { loadData(); }, [loadData]);

  // Filter events client-side
  const displayed = useMemo(() => {
    let evs = filterType ? events.filter(e => e.activity_type === filterType) : events;
    if (filterMonth && filterMonth > 0) {
      evs = evs.filter(e => {
        const m = e.start_date ? new Date(e.start_date + 'T00:00:00').getMonth() + 1 : 0;
        return m === filterMonth;
      });
    }
    return evs;
  }, [events, filterType, filterMonth]);

  // Total summary figures
  const totalKpis = useMemo(() => {
    let total_cost = 0, total_nc = 0, total_ec = 0, total_buy_value = 0, total_footfall = 0;
    for (const ev of displayed) {
      const summary = computeEventHitSummary(ev);
      total_cost += summary.actual.cost;
      total_nc += summary.actual.nc;
      total_ec += summary.actual.ec;
      total_buy_value += summary.actual.buy_value;
      total_footfall += summary.actual.footfall;
    }
    return { total_cost, total_nc, total_ec, total_buy_value, total_footfall };
  }, [displayed]);

  const activeMonthName = filterMonth > 0 ? MONTHS[filterMonth - 1] : 'All Months';

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', paddingBottom: '60px' }}>
      {/* ── Top Control & Filter Bar ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>📊 Activation Events Reporting & Summary</span>
            <span className="pill pill-blue" style={{ fontSize: '11px' }}>{activeMonthName} {filterYear}</span>
          </h2>
          <div style={{ fontSize: '12px', color: 'var(--txt-sub)' }}>
            Compare planned targets vs actual executions, hit measurement benchmarks, and review event photo galleries.
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* View switcher */}
          <div style={{ background: 'var(--ink)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex' }}>
            <button
              className={`btn ${viewMode === 'slide' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: '12px', padding: '6px 14px' }}
              onClick={() => setViewMode('slide')}
            >
              <i className="fa-solid fa-presentation-screen" style={{ marginRight: '6px' }}></i> Executive Slide View
            </button>
            <button
              className={`btn ${viewMode === 'detail' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: '12px', padding: '6px 14px' }}
              onClick={() => setViewMode('detail')}
            >
              <i className="fa-solid fa-chart-mixed" style={{ marginRight: '6px' }}></i> Analytics & Drilldown
            </button>
          </div>

          {viewMode === 'slide' && (
            <button
              className="btn btn-ghost"
              onClick={() => setIsFullscreen(f => !f)}
              style={{ fontSize: '12px', padding: '6px 12px' }}
              title="Toggle Fullscreen Slide"
            >
              <i className={`fa-solid ${isFullscreen ? 'fa-compress' : 'fa-expand'}`}></i> {isFullscreen ? 'Exit Fullscreen' : 'Present Slide'}
            </button>
          )}

          <button
            className="btn btn-ghost"
            onClick={() => window.print()}
            style={{ fontSize: '12px', padding: '6px 12px' }}
            title="Print or Export PDF"
          >
            <i className="fa-solid fa-print"></i> Export / Print
          </button>
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <div className="card" style={{ marginBottom: '18px', padding: '12px 18px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))} style={{ fontSize: '12px', padding: '6px 10px', width: 'auto' }}>
          {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))} style={{ fontSize: '12px', padding: '6px 10px', width: 'auto', fontWeight: 700 }}>
          <option value={0}>All Months</option>
          {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
        </select>
        <select value={filterTeam} onChange={e => setFilterTeam(e.target.value)} style={{ fontSize: '12px', padding: '6px 10px', width: 'auto' }}>
          <option value="">All Teams</option>
          {EVENT_TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ fontSize: '12px', padding: '6px 10px', width: 'auto' }}>
          <option value="">All Types</option>
          {eventTypeNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ fontSize: '12px', padding: '6px 10px', width: 'auto' }}>
          <option value="">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
        </select>
        <button className="btn btn-ghost" onClick={loadData} style={{ fontSize: '12px', padding: '6px 12px', marginLeft: 'auto' }}>
          <i className="fa-solid fa-rotate-right"></i> Refresh
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          VIEW 1: EXECUTIVE SLIDE VIEW (EXACT ATTACHMENT SLIDE PRESENTATION)
         ══════════════════════════════════════════════════════════════════════════ */}
      {viewMode === 'slide' && (
        <div
          style={{
            position: isFullscreen ? 'fixed' : 'relative',
            inset: isFullscreen ? 0 : 'auto',
            zIndex: isFullscreen ? 9999 : 1,
            background: isFullscreen ? '#0b132b' : 'transparent',
            padding: isFullscreen ? '24px' : '0',
            overflow: 'auto',
          }}
        >
          {/* Slide Container Canvas */}
          <div
            style={{
              background: '#ffffff',
              color: '#0f172a',
              borderRadius: '12px',
              boxShadow: '0 12px 36px rgba(0,0,0,0.25)',
              overflow: 'hidden',
              display: 'flex',
              minHeight: '620px',
              fontFamily: "'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
            }}
          >
            {/* Left Corporate Stripe: "Easy Gold" */}
            <div
              style={{
                width: '74px',
                background: '#0d4085',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: '#ffffff',
                userSelect: 'none',
              }}
            >
              <div
                style={{
                  writingMode: 'vertical-rl',
                  transform: 'rotate(180deg)',
                  fontSize: '24px',
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  textTransform: 'none',
                }}
              >
                Easy Gold
              </div>
            </div>

            {/* Slide Right Main Body */}
            <div style={{ flex: 1, padding: '24px 32px 32px', display: 'flex', flexDirection: 'column' }}>
              {/* Slide Top Header Bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '2px solid #e2e8f0', paddingBottom: '16px' }}>
                <div>
                  <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 800, color: '#0d4085', letterSpacing: '-0.02em' }}>
                    {activeMonthName} {filterYear} Activation Events
                  </h1>
                </div>

                {/* Corporate Logo: EASY GOLD by KHAMPHOUVONG */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '20px', fontWeight: 900, color: '#0d4085', lineHeight: 1, letterSpacing: '-0.01em' }}>
                    EASY GOLD
                  </div>
                  <div style={{ fontSize: '9px', fontWeight: 600, color: '#64748b', letterSpacing: '0.04em', marginTop: '2px' }}>
                    by KHAMPHOUVONG
                  </div>
                </div>
              </div>

              {/* Slide Content: Event Columns Grid */}
              {displayed.length === 0 ? (
                <div style={{ padding: '64px', textAlign: 'center', color: '#94a3b8' }}>
                  <i className="fa-solid fa-calendar-xmark" style={{ fontSize: '42px', marginBottom: '12px', display: 'block', opacity: 0.3 }}></i>
                  <div style={{ fontSize: '16px', fontWeight: 700 }}>No activation events recorded for {activeMonthName} {filterYear}</div>
                  <div style={{ fontSize: '13px', marginTop: '4px' }}>Create an event plan in Event Management or select another month.</div>
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${Math.min(displayed.length, 4)}, 1fr)`,
                    gap: '16px',
                    flex: 1,
                  }}
                >
                  {displayed.map(ev => {
                    const s = computeEventHitSummary(ev);
                    const actual = s.actual;
                    const scaleBg = scaleColor(ev.scale);

                    return (
                      <div
                        key={ev.id}
                        style={{
                          background: '#f8fafc',
                          borderRadius: '8px',
                          border: '1px solid #e2e8f0',
                          display: 'flex',
                          flexDirection: 'column',
                          overflow: 'hidden',
                        }}
                      >
                        {/* Event Column Header */}
                        <div style={{ background: '#0f172a', color: '#ffffff', padding: '10px 14px' }}>
                          <div style={{ fontSize: '15px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                            {ev.event_name}
                          </div>
                        </div>

                        {/* Scale — Activity Type Banner */}
                        <div
                          style={{
                            background: scaleBg,
                            color: '#ffffff',
                            padding: '4px 12px',
                            fontSize: '10.5px',
                            fontWeight: 800,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                          }}
                        >
                          {ev.scale.toUpperCase()} — {ev.activity_type.toUpperCase()}
                        </div>

                        {/* Event Metrics Table Area */}
                        <div style={{ padding: '14px', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {/* 1. Total Spending Cost */}
                          <div>
                            <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>Total spending cost</div>
                            <div style={{ fontSize: '18px', fontWeight: 900, color: '#0f172a', fontFamily: 'monospace' }}>
                              {fmtLAKShort(actual.cost)}
                            </div>
                          </div>

                          {/* 2. Customers (actual/target) */}
                          <div>
                            <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>Customers (actual/target)</div>
                            <div style={{ fontSize: '15px', fontWeight: 900, color: '#0f172a' }}>
                              {actual.customers.toLocaleString()} / {s.targetCustomers.toLocaleString()}
                            </div>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: s.custBeat ? '#16a34a' : '#d97706' }}>
                              {s.custPct.toFixed(1)}% {s.custBeat ? '— beat target' : 'of target'}
                            </div>
                          </div>

                          {/* 3. New cust. (actual/target) */}
                          <div>
                            <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>New cust. (actual/target)</div>
                            <div style={{ fontSize: '15px', fontWeight: 900, color: '#0f172a' }}>
                              {actual.nc.toLocaleString()} / {ev.target_nc.toLocaleString()}
                            </div>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: s.ncBeat ? '#16a34a' : '#d97706' }}>
                              {s.ncPct.toFixed(1)}% {s.ncBeat ? '— beat target' : 'of target'}
                            </div>
                          </div>

                          {/* 4. CPO (actual/target) */}
                          <div>
                            <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>CPO (actual/target)</div>
                            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', fontFamily: 'monospace' }}>
                              {fmtLAK(actual.cpo)} / {fmtLAK(ev.target_cpo)}
                            </div>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: s.cpoBeat ? '#16a34a' : '#ea580c' }}>
                              {s.cpoDiffPct > 0 ? `+${s.cpoDiffPct.toFixed(1)}% over target` : `${s.cpoDiffPct.toFixed(1)}% under target`}
                            </div>
                          </div>

                          {/* 5. CPA (actual/target) */}
                          <div>
                            <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>CPA (actual/target)</div>
                            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', fontFamily: 'monospace' }}>
                              {fmtLAK(actual.cpa)} / {fmtLAK(ev.target_cpa)}
                            </div>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: s.cpaBeat ? '#16a34a' : '#ea580c' }}>
                              {s.cpaDiffPct > 0 ? `+${s.cpaDiffPct.toFixed(1)}% over target` : `${s.cpaDiffPct.toFixed(1)}% under target`}
                            </div>
                          </div>

                          {/* 6. CPM */}
                          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '6px' }}>
                            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                              CPM {fmtLAK(actual.cpm)}
                            </div>
                          </div>
                        </div>

                        {/* 7. 2x2 Photos Collage (Up to 4 Media Links) */}
                        <div style={{ padding: '8px', background: '#f1f5f9', borderTop: '1px solid #e2e8f0' }}>
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(2, 1fr)',
                              gap: '4px',
                            }}
                          >
                            {(actual.photos.length > 0 ? actual.photos.slice(0, 4) : [
                              'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400&fit=crop',
                              'https://images.unsplash.com/photo-1511578314322-379afb476865?w=400&fit=crop',
                              'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=400&fit=crop',
                              'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=400&fit=crop',
                            ]).map((imgUrl, imgIdx) => (
                              <div
                                key={imgIdx}
                                onClick={() => setLightboxImg(imgUrl)}
                                style={{
                                  height: '84px',
                                  borderRadius: '3px',
                                  overflow: 'hidden',
                                  cursor: 'pointer',
                                  background: '#000',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                                }}
                                title="Click to view full photo"
                              >
                                <img
                                  src={imgUrl}
                                  alt={`event-pic-${imgIdx}`}
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    transition: 'transform 0.2s ease',
                                  }}
                                  onMouseEnter={e => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1.05)'; }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1)'; }}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          VIEW 2: ANALYTICS & DRILLDOWN VIEW
         ══════════════════════════════════════════════════════════════════════════ */}
      {viewMode === 'detail' && (
        <>
          {/* Summary Banner Row */}
          {displayed.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '12px', marginBottom: '20px' }}>
              {[
                { label: 'Events', val: displayed.length.toString(), icon: 'fa-calendar-star', color: 'var(--accent)' },
                { label: 'Total NC', val: totalKpis.total_nc.toLocaleString(), icon: 'fa-user-plus', color: 'var(--accent)' },
                { label: 'Total EC', val: totalKpis.total_ec.toLocaleString(), icon: 'fa-users', color: 'var(--blue)' },
                { label: 'Total Buy Value', val: fmtLAKShort(totalKpis.total_buy_value), icon: 'fa-sack-dollar', color: 'var(--green)' },
                { label: 'Total Spending Cost', val: fmtLAKShort(totalKpis.total_cost), icon: 'fa-coins', color: 'var(--orange)' },
              ].map(m => (
                <div key={m.label} className="card kpi-card" style={{ padding: '14px 18px', borderTopColor: m.color }}>
                  <div className="kpi-icon"><i className={`fa-solid ${m.icon}`} style={{ color: m.color }}></i></div>
                  <div className="kpi-label" style={{ color: m.color }}>{m.label}</div>
                  <div className="kpi-val" style={{ fontSize: '20px' }}>{m.val}</div>
                </div>
              ))}
            </div>
          )}

          {/* Detailed Cards Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
            {displayed.map(ev => {
              const s = computeEventHitSummary(ev);
              const actual = s.actual;
              const scaleBg = scaleColor(ev.scale);

              return (
                <div
                  key={ev.id}
                  className="card"
                  onClick={() => setModalEvent(ev)}
                  role="button"
                  tabIndex={0}
                  style={{
                    cursor: 'pointer',
                    padding: 0,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    borderTop: `4px solid ${scaleBg}`,
                  }}
                >
                  <div style={{ padding: '16px 18px 12px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                      <span className="pill" style={{ background: scaleBg, color: '#fff', fontSize: '10px' }}>
                        {ev.scale} — {ev.activity_type}
                      </span>
                      <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '99px', background: `${statusColor(ev.status)}22`, color: statusColor(ev.status) }}>
                        {statusLabel(ev.status)}
                      </span>
                    </div>
                    <h3 style={{ margin: '0 0 2px', fontSize: '16px', fontWeight: 800 }}>{ev.event_name}</h3>
                    <div style={{ fontSize: '11px', color: 'var(--txt-sub)' }}>{labelDate(ev.start_date)} → {labelDate(ev.end_date)}</div>
                  </div>

                  <div style={{ padding: '12px 18px', flex: 1 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderBottom: '1px solid var(--border)', marginBottom: '10px' }}>
                      <KpiPill label="NC" value={actual.nc.toLocaleString()} color="var(--accent)" />
                      <KpiPill label="Cost" value={fmtLAKShort(actual.cost)} color="var(--orange)" />
                      <KpiPill label="CPA" value={fmtLAKShort(actual.cpa)} color="var(--blue)" />
                      <KpiPill label="CPO" value={fmtLAKShort(actual.cpo)} color="var(--green)" />
                    </div>

                    <MetricBar label="NC Target Achievement" pct={s.ncPct} color="var(--accent)" />
                    <MetricBar label="Customers Achievement" pct={s.custPct} color="var(--blue)" />
                    <MetricBar label="Buy Value Achievement" pct={s.buyValPct} color="var(--green)" />
                  </div>

                  {/* 4 photo preview row */}
                  {actual.photos.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', padding: '6px 18px', borderTop: '1px solid var(--border)' }}>
                      {actual.photos.slice(0, 4).map((p, idx) => (
                        <img key={idx} src={p} alt="thumb" style={{ width: '100%', height: '42px', objectFit: 'cover', borderRadius: '4px' }} />
                      ))}
                    </div>
                  )}

                  <div style={{ padding: '8px 18px', background: 'var(--ink)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--txt-dim)' }}>
                    <span>Hit: {s.hitCount} of {s.totalTracked} Targets</span>
                    <span style={{ color: 'var(--accent)' }}>View details →</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Lightbox Modal for Photo Enlarge ── */}
      {lightboxImg && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={() => setLightboxImg(null)}
        >
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <img src={lightboxImg} alt="enlarged-event" style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: '8px', objectFit: 'contain' }} />
            <button onClick={() => setLightboxImg(null)} style={{ position: 'absolute', top: '-14px', right: '-14px', background: '#ffffff', color: '#000', border: 'none', borderRadius: '50%', width: '32px', height: '32px', fontSize: '18px', fontWeight: 800, cursor: 'pointer' }}>×</button>
          </div>
        </div>
      )}

      {/* ── Detail Modal for An Event ── */}
      {modalEvent && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,15,30,0.75)', zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={e => { if (e.target === e.currentTarget) setModalEvent(null); }}
        >
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', width: '100%', maxWidth: '860px', maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <span className="pill pill-gold">{modalEvent.team}</span>
                <span className="pill" style={{ background: scaleColor(modalEvent.scale), color: '#fff', fontSize: '10px', marginLeft: '6px' }}>{modalEvent.scale} — {modalEvent.activity_type}</span>
                <h2 style={{ margin: '6px 0 2px', fontSize: '20px', fontWeight: 800 }}>{modalEvent.event_name}</h2>
                <div style={{ fontSize: '12px', color: 'var(--txt-sub)' }}>{labelDate(modalEvent.start_date)} → {labelDate(modalEvent.end_date)} {modalEvent.location && `· 📍 ${modalEvent.location}`}</div>
              </div>
              <button onClick={() => setModalEvent(null)} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: 'var(--txt-sub)' }}>×</button>
            </div>

            <div style={{ padding: '20px 24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '16px' }}>
                <KpiPill label="Total Spend" value={fmtLAKShort(computeEventHitSummary(modalEvent).actual.cost)} color="var(--orange)" />
                <KpiPill label="Total NC" value={computeEventHitSummary(modalEvent).actual.nc.toLocaleString()} color="var(--accent)" />
                <KpiPill label="Actual CPA" value={fmtLAK(computeEventHitSummary(modalEvent).actual.cpa)} color="var(--blue)" />
                <KpiPill label="Actual CPO" value={fmtLAK(computeEventHitSummary(modalEvent).actual.cpo)} color="var(--green)" />
              </div>

              {/* 4 Photos Grid */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', marginBottom: '8px' }}>Event Photos</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px' }}>
                  {(modalEvent.photo_urls && modalEvent.photo_urls.filter(Boolean).length > 0 ? modalEvent.photo_urls.filter(Boolean) : [
                    'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400&fit=crop',
                    'https://images.unsplash.com/photo-1511578314322-379afb476865?w=400&fit=crop',
                    'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=400&fit=crop',
                    'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=400&fit=crop',
                  ]).slice(0, 4).map((url, idx) => (
                    <img key={idx} src={url} alt="event-pic" onClick={() => setLightboxImg(url)} style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '6px', cursor: 'pointer' }} />
                  ))}
                </div>
              </div>

              {modalEvent.proposal_link && (
                <div style={{ marginBottom: '12px' }}>
                  <a href={modalEvent.proposal_link} target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ fontSize: '12px', padding: '6px 14px' }}>
                    <i className="fa-solid fa-arrow-up-right-from-square"></i> Open Google Drive Proposal Link
                  </a>
                </div>
              )}
            </div>

            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setModalEvent(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

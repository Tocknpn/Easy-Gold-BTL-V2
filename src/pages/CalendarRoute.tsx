import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, fetchRoutePlans, fetchCheckIns } from '../lib/workflow';
import type { RoutePlanEntry, CheckInRecord } from '../lib/workflow';
import type { Submission } from '../lib/submissions';
import { fetchSubmissions, getCurrentDateHelpers } from '../lib/submissions';
import type { Event } from '../lib/events';
import { fetchEvents, statusColor, statusLabel, scaleColor, fmtLAKShort, fmtLAK } from '../lib/events';
import SubmissionModal from '../components/SubmissionModal';

// Summed "big picture" numbers for a day's submissions
const totalAcq = (subs: Submission[]) =>
  subs.reduce((a, s) => a + (s.new_register || 0) + (s.existing_users || 0), 0);
const totalBuy = (subs: Submission[]) =>
  subs.reduce((a, s) => a + (s.buy_value_new || 0) + (s.buy_value_existing || 0), 0);
const staffOf = (subs: Submission[]): string[] => {
  const names = new Set<string>();
  subs.forEach(s => (s.staff_in_charge || []).forEach(n => names.add(n)));
  return [...names];
};

export default function CalendarRoute() {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const { y, monthIndex, today } = getCurrentDateHelpers();
  const highlightDate = today;
  const [currentYear, setCurrentYear] = useState(y);
  const [currentMonth, setCurrentMonth] = useState(monthIndex); // 0-based
  const [modalSub, setModalSub] = useState<Submission | null>(null);

  // Day summary modal — big picture of all submissions on one date
  const [dayModal, setDayModal] = useState<{ date: string; subs: Submission[] } | null>(null);
  // Event Plan Quick View modal
  const [eventModal, setEventModal] = useState<Event | null>(null);

  const [teamFilter, setTeamFilter] = useState<'All' | 'KPV' | 'Agency'>('All');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [routePlans, setRoutePlans] = useState<RoutePlanEntry[]>([]);
  const [checkins, setCheckins] = useState<CheckInRecord[]>([]);
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
    const load = async () => {
      const [{ data: subs }, rPlans, cIns, { data: evs }] = await Promise.all([
        fetchSubmissions(),
        fetchRoutePlans(),
        fetchCheckIns(),
        fetchEvents(),
      ]);
      if (subs) setSubmissions(subs);
      if (rPlans) setRoutePlans(rPlans);
      if (cIns) setCheckins(cIns);
      if (evs) setEvents(evs);
    };
    load();
  }, []);

  // Escape closes modals
  useEffect(() => {
    if (!dayModal && !eventModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDayModal(null);
        setEventModal(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dayModal, eventModal]);

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
    else setCurrentMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
    else setCurrentMonth(m => m + 1);
  };

  // Build the days grid — Monday-first
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
  const startOffset = (firstDayOfMonth.getDay() + 6) % 7; // Mon-first
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  const currentMonthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

  const subsForMonth = submissions.filter(s =>
    s.date.startsWith(currentMonthStr) &&
    (!user || user.role === 'admin' || user.role === 'manager' || !user.team || (s.team || 'KPV').toUpperCase() === user.team.toUpperCase()) &&
    (teamFilter === 'All' || (s.team || 'KPV').toUpperCase().includes(teamFilter.toUpperCase()))
  );

  const checkinsForMonth = checkins.filter(c =>
    c.date.startsWith(currentMonthStr) &&
    (!user || user.role === 'admin' || user.role === 'manager' || !user.team || (c.team || 'KPV').toUpperCase() === user.team.toUpperCase()) &&
    (teamFilter === 'All' || (c.team || 'KPV').toUpperCase().includes(teamFilter.toUpperCase()))
  );

  const routesForMonth = routePlans.filter(r =>
    r.date.startsWith(currentMonthStr) &&
    (!user || user.role === 'admin' || user.role === 'manager' || !user.team || (r.team || 'KPV').toUpperCase() === user.team.toUpperCase()) &&
    (teamFilter === 'All' || (r.team || 'KPV').toUpperCase().includes(teamFilter.toUpperCase()))
  );

  const eventsForMonth = events.filter(e => {
    const isTeamMatch = (!user || user.role === 'admin' || user.role === 'manager' || !user.team || (e.team || 'KPV').toUpperCase() === user.team.toUpperCase()) &&
      (teamFilter === 'All' || (e.team || 'KPV').toUpperCase().includes(teamFilter.toUpperCase()));
    return isTeamMatch;
  });

  const openModal = (sub: Submission) => setModalSub(sub);
  const closeModal = () => setModalSub(null);

  const handleDelete = (id: string) => {
    setSubmissions(prev => prev.filter(s => s.id !== id));
    closeModal();
  };

  const handleSave = (saved: Submission) => {
    setSubmissions(prev => prev.map(s => (s.id === saved.id ? saved : s)));
    setModalSub(saved);
  };

  return (
    <div>
      {/* Header / Nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={prevMonth} style={{ padding: '6px 14px' }}>← Prev</button>
          <h2 style={{ fontSize: '18px', minWidth: '140px', textAlign: 'center' }}>
            {monthNames[currentMonth]} {currentYear}
          </h2>
          <button className="btn btn-ghost" onClick={nextMonth} style={{ padding: '6px 14px' }}>Next →</button>
          <select value={currentMonth} onChange={e => setCurrentMonth(Number(e.target.value))} style={{ padding: '7px', fontSize: '12px', width: 'auto' }} title="Jump to month">
            {monthNames.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select value={currentYear} onChange={e => setCurrentYear(Number(e.target.value))} style={{ padding: '7px', fontSize: '12px', width: 'auto' }} title="Jump to year">
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '12px', fontSize: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          {(!user || user.role === 'admin' || user.role === 'manager') && (
            <select value={teamFilter} onChange={e => setTeamFilter(e.target.value as any)} style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--txt-main)' }}>
              <option value="All">All Teams</option>
              <option value="KPV">KPV</option>
              <option value="Agency">Agency</option>
            </select>
          )}
          {/* Legend items */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'rgba(77,158,255,0.7)', display: 'inline-block', flexShrink: 0 }}></span> Plan to go
          </div>
          {/* Distinct Special Event Plan Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', display: 'inline-block', flexShrink: 0 }}></span>
            <strong style={{ color: '#a78bfa' }}>🎪 Event Plan</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'rgba(46,194,122,0.7)', display: 'inline-block', flexShrink: 0 }}></span> Results
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'var(--gold)', display: 'inline-block', flexShrink: 0 }}></span> Staff in charge
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', background: 'var(--border)', gap: '1px' }}>
          {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(day => (
            <div key={day} style={{ padding: '10px 4px', textAlign: 'center', fontSize: '11px', fontWeight: 700, color: 'var(--txt-sub)', background: 'var(--surface)' }}>{day}</div>
          ))}
        </div>
        {/* Day cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', background: 'var(--border)', gap: '1px' }}>
          {Array.from({ length: totalCells }).map((_, idx) => {
            const dayNum = idx - startOffset + 1;
            const isValid = dayNum >= 1 && dayNum <= daysInMonth;
            const dateStr = isValid ? `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}` : '';
            const isToday = isValid && dateStr === highlightDate;

            const daySubs = isValid ? subsForMonth.filter(s => s.date === dateStr) : [];
            const dayRoutes = isValid ? routesForMonth.filter(r => r.date === dateStr) : [];
            const dayEvents = isValid ? eventsForMonth.filter(e => {
              if (!e.start_date) return false;
              const end = e.end_date || e.start_date;
              return dateStr >= e.start_date && dateStr <= end;
            }) : [];

            return (
              <div
                key={idx}
                className={`cal-cell${isToday ? ' today' : ''}${isValid ? '' : ' cal-empty'}`}
                style={{ minHeight: '115px' }}
              >
                {isValid && (
                  <>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: isToday ? 'var(--blue)' : 'var(--txt-sub)', marginBottom: '4px' }}>{dayNum}</div>

                    {/* ★ SPECIAL EVENT PLAN BADGE (Different & Standout from regular route tickets) ★ */}
                    {dayEvents.map(ev => (
                      <div
                        key={`ev-${ev.id}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => setEventModal(ev)}
                        title={`Event Plan: ${ev.event_name} (${ev.scale} · ${ev.activity_type})`}
                        style={{
                          background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                          color: '#ffffff',
                          border: '1px solid #c084fc',
                          boxShadow: '0 2px 5px rgba(124,58,237,0.3)',
                          borderRadius: '5px',
                          padding: '3px 6px',
                          marginBottom: '4px',
                          cursor: 'pointer',
                          fontWeight: 700,
                          fontSize: '10.5px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '4px',
                          transition: 'transform 0.15s ease',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.02)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)'; }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          🎪 {ev.event_name}
                        </span>
                        <span style={{ fontSize: '8.5px', background: 'rgba(255,255,255,0.25)', padding: '1px 4px', borderRadius: '3px', flexShrink: 0 }}>
                          {ev.scale || 'EVENT'}
                        </span>
                      </div>
                    ))}

                    {/* ① PLAN TO GO — standard route */}
                    {dayRoutes.map((r, i) =>
                      (r.location_name || '')
                        .split(',')
                        .map(loc => loc.trim())
                        .filter(Boolean)
                        .map((loc, j) => {
                          const checkedIn = checkinsForMonth.some(c => c.date === r.date && c.team === r.team && c.location.trim() === loc);
                          return (
                            <div
                              key={`p${i}-${j}`}
                              className="cal-ticket plan"
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                if (checkedIn) {
                                  if (daySubs.length === 1) openModal(daySubs[0]);
                                  else if (daySubs.length > 1) setDayModal({ date: r.date, subs: daySubs });
                                  else alert('No submission recorded yet for this location.');
                                } else {
                                  navigate(`/checkin?date=${r.date}&location=${encodeURIComponent(loc)}&team=${encodeURIComponent(r.team)}`);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  if (checkedIn) {
                                    if (daySubs.length === 1) openModal(daySubs[0]);
                                    else if (daySubs.length > 1) setDayModal({ date: r.date, subs: daySubs });
                                    else alert('No submission recorded yet for this location.');
                                  } else {
                                    navigate(`/checkin?date=${r.date}&location=${encodeURIComponent(loc)}&team=${encodeURIComponent(r.team)}`);
                                  }
                                }
                              }}
                              title={checkedIn ? `✓ Checked-in: ${loc}` : `Planned: ${loc}`}
                            >
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {checkedIn ? '✓ ' : ''}{loc}
                              </span>
                            </div>
                          );
                        })
                    )}

                    {/* ② SUBMISSIONS RESULTS */}
                    {daySubs.map(s => (
                      <div
                        key={s.id}
                        className="cal-ticket result"
                        role="button"
                        tabIndex={0}
                        onClick={() => openModal(s)}
                        title={`${s.branch} — NC: ${s.new_register}, EC: ${s.existing_users}`}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          ✓ {s.branch}: {totalAcq([s])} acq · {fmtLAKShort(totalBuy([s]))}
                        </span>
                      </div>
                    ))}

                    {/* ③ STAFF IN CHARGE */}
                    {(() => {
                      const names = staffOf(daySubs);
                      if (!names.length) return null;
                      return (
                        <div className="cal-ticket staff-line" title={`Staff in charge (${names.length}): ${names.join(', ')}`}>
                          <i className="fa-solid fa-users" style={{ fontSize: 8 }}></i> {names.join(', ')}
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Event Plan Quick View Modal */}
      {eventModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget) setEventModal(null); }}
        >
          <div className="card" style={{ width: '100%', maxWidth: '580px', maxHeight: '90vh', overflow: 'auto', padding: '24px', border: '2px solid #7c3aed' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '14px' }}>
              <div>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                  <span className="pill pill-gold">{eventModal.team}</span>
                  <span className="pill" style={{ background: scaleColor(eventModal.scale), color: '#fff', fontSize: '10px' }}>{eventModal.scale} — {eventModal.activity_type}</span>
                  <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px', background: `${statusColor(eventModal.status)}22`, color: statusColor(eventModal.status) }}>
                    {statusLabel(eventModal.status)}
                  </span>
                </div>
                <h2 style={{ fontSize: '18px', margin: 0, fontWeight: 800 }}>🎪 {eventModal.event_name}</h2>
                <div style={{ fontSize: '12px', color: 'var(--txt-sub)', marginTop: '4px' }}>
                  {new Date(eventModal.start_date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} → {new Date(eventModal.end_date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  {eventModal.location && ` · 📍 ${eventModal.location}`}
                </div>
              </div>
              <button onClick={() => setEventModal(null)} className="btn btn-ghost" style={{ padding: '6px', borderRadius: '50%' }}>✕</button>
            </div>

            {/* Plan Targets Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
              <div style={{ background: 'var(--ink)', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '9px', color: 'var(--txt-dim)', textTransform: 'uppercase' }}>Plan Budget</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--accent)' }}>{fmtLAKShort(eventModal.budget_total || eventModal.media_cost || 0)}</div>
              </div>
              <div style={{ background: 'var(--ink)', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '9px', color: 'var(--txt-dim)', textTransform: 'uppercase' }}>Target NC</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--blue)' }}>{eventModal.target_nc}</div>
              </div>
              <div style={{ background: 'var(--ink)', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '9px', color: 'var(--txt-dim)', textTransform: 'uppercase' }}>Target Buy Val</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--green)' }}>{fmtLAKShort(eventModal.target_buy_value)}</div>
              </div>
            </div>

            {eventModal.description && (
              <div style={{ fontSize: '12px', color: 'var(--txt-sub)', background: 'var(--ink)', padding: '10px 12px', borderRadius: '6px', marginBottom: '16px' }}>
                {eventModal.description}
              </div>
            )}

            {/* Actuals status badge */}
            <div style={{ padding: '10px 14px', borderRadius: '8px', background: eventModal.actual_filled ? 'rgba(46,194,122,0.1)' : 'rgba(212,168,67,0.1)', border: '1px solid var(--border)', marginBottom: '16px', fontSize: '12px' }}>
              {eventModal.actual_filled ? (
                <span style={{ color: 'var(--green)', fontWeight: 700 }}>
                  <i className="fa-solid fa-circle-check"></i> Actual results recorded! Spend: {fmtLAKShort(eventModal.actual_cost || 0)}
                </span>
              ) : (
                <span style={{ color: 'var(--gold)', fontWeight: 600 }}>
                  <i className="fa-solid fa-clock"></i> Actual results not recorded yet (system assumes 100% plan execution).
                </span>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                className="btn btn-primary"
                onClick={() => { setEventModal(null); navigate('/event-management'); }}
                style={{ fontSize: '12px', padding: '7px 16px' }}
              >
                Go to Event Management / Fill Actuals <i className="fa-solid fa-arrow-right"></i>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Day Summary modal */}
      {dayModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={(e) => { if (e.target === e.currentTarget) setDayModal(null); }}
        >
          <div className="card" style={{ width: '100%', maxWidth: '540px', maxHeight: '90vh', overflow: 'auto', padding: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '16px', margin: 0, fontWeight: 700 }}>Submissions — {new Date(dayModal.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</h2>
                <div style={{ fontSize: '12px', color: 'var(--txt-sub)', marginTop: '4px' }}>
                  {dayModal.subs.length} record{dayModal.subs.length > 1 ? 's' : ''} · select one to view details
                </div>
              </div>
              <button onClick={() => setDayModal(null)} className="btn btn-ghost" style={{ padding: '6px', borderRadius: '50%', width: '32px', height: '32px' }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '18px' }}>
              <div style={{ background: 'var(--gold-dim)', borderRadius: '8px', padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: '10px', color: 'var(--txt-sub)', textTransform: 'uppercase' }}>Total Acquisition</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--gold)' }}>{totalAcq(dayModal.subs)}</div>
              </div>
              <div style={{ background: 'rgba(46,194,122,0.12)', borderRadius: '8px', padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: '10px', color: 'var(--txt-sub)', textTransform: 'uppercase' }}>Buy Value</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--green)' }}>{fmtLAK(totalBuy(dayModal.subs))}</div>
              </div>
              <div style={{ background: 'rgba(77,158,255,0.12)', borderRadius: '8px', padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: '10px', color: 'var(--txt-sub)', textTransform: 'uppercase' }}>Records</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--blue)' }}>{dayModal.subs.length}</div>
              </div>
            </div>

            {dayModal.subs.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px', marginBottom: '10px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '13px' }}>{s.branch}</strong>
                    <span className={`pill ${s.team === 'KPV' ? 'pill-gold' : 'pill-blue'}`}>{s.team}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--txt-sub)', marginTop: '3px' }}>
                    {totalAcq([s])} acquisition · Buy {fmtLAK(totalBuy([s]))}
                  </div>
                </div>
                <button className="btn btn-ghost" onClick={() => { const sub = s; setDayModal(null); openModal(sub); }} style={{ padding: '5px 12px', fontSize: '11px' }}>
                  View Details <i className="fa-solid fa-arrow-right"></i>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Submission Modal */}
      <SubmissionModal
        open={!!modalSub}
        submission={modalSub}
        onClose={() => setModalSub(null)}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
}
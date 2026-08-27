import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, fetchRoutePlans, fetchCheckIns } from '../lib/workflow';
import type { RoutePlanEntry, CheckInRecord } from '../lib/workflow';
import type { Submission } from '../lib/submissions';
import { fetchSubmissions, getCurrentDateHelpers } from '../lib/submissions';
import SubmissionModal from '../components/SubmissionModal';

// Sample mock data for submissions and check-ins (March 2025 demo set)


function fmtLAK(n: number) {
  if (n >= 1_000_000) return `₭${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₭${(n / 1_000).toFixed(0)}K`;
  return `₭${n}`;
}

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
  // Day summary modal — big picture of all submissions on one date
  const [dayModal, setDayModal] = useState<{ date: string; subs: Submission[] } | null>(null);
  const [teamFilter, setTeamFilter] = useState<'All' | 'KPV' | 'Agency'>('All');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [routePlans, setRoutePlans] = useState<RoutePlanEntry[]>([]);
  const [checkins, setCheckins] = useState<CheckInRecord[]>([]);
  
  useEffect(() => {
    const load = async () => {
      const [{ data }, rPlans, cIns] = await Promise.all([
        fetchSubmissions(),
        fetchRoutePlans(),
        fetchCheckIns()
      ]);
      if (data) setSubmissions(data);
      if (rPlans) setRoutePlans(rPlans);
      if (cIns) setCheckins(cIns);
    };
    load();
  }, []);

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
  // getDay() returns 0=Sun, 1=Mon,... We want Mon=0 offset
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
    (teamFilter === 'All' || (c.team || 'KPV').toUpperCase().includes(teamFilter.toUpperCase()))
  );
  
  const routesForMonth = routePlans.filter(r =>
    r.date.startsWith(currentMonthStr) &&
    (!user || user.role === 'admin' || user.role === 'manager' || !user.team || (r.team || 'KPV').toUpperCase() === user.team.toUpperCase()) &&
    (teamFilter === 'All' || (r.team || 'KPV').toUpperCase().includes(teamFilter.toUpperCase()))
  );

    const openModal = (sub: Submission) => setModalSub(sub);

  const closeModal = () => setModalSub(null);

  const handleDelete = (id: string) => {
    if (!window.confirm('Delete this submission?')) return;
    setSubmissions(prev => prev.filter(s => s.id !== id));
    closeModal();
  };

  const handleSave = (saved: Submission) => {
    setSubmissions(prev => prev.map(s => (s.id === saved.id ? saved : s)));
    setModalSub(saved);
  };

  return (
    <div>
            <div className="demo-banner"><i className="fa-solid fa-circle-info"></i> Each day shows: <b>Plan to go</b> (✓ = checked in) · summed <b>Results</b> — click results to open submissions · <b>Staff in charge</b>. Click a plan to start Check-In.</div>

      {/* Header / Nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={prevMonth} style={{ padding: '6px 14px' }}>← Prev</button>
          <h2 style={{ fontSize: '18px', minWidth: '140px', textAlign: 'center' }}>
            {monthNames[currentMonth]} {currentYear}
          </h2>
          <button className="btn btn-ghost" onClick={nextMonth} style={{ padding: '6px 14px' }}>Next →</button>
          {/* Jump across months directly */}
          <select value={currentMonth} onChange={e => setCurrentMonth(Number(e.target.value))} style={{ padding: '7px', fontSize: '12px', width: 'auto' }} title="Jump to month">
            {monthNames.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select value={currentYear} onChange={e => setCurrentYear(Number(e.target.value))} style={{ padding: '7px', fontSize: '12px', width: 'auto' }} title="Jump to year">
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '12px', fontSize: '12px', alignItems: 'center' }}>
          {(!user || user.role === 'admin' || user.role === 'manager') && (
            <select value={teamFilter} onChange={e => setTeamFilter(e.target.value as any)} style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--txt-main)' }}>
              <option value="All">All Teams</option>
              <option value="KPV">KPV</option>
              <option value="Agency">Agency</option>
            </select>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'rgba(77,158,255,0.7)', display: 'inline-block' }}></span> Plan to go
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'rgba(46,194,122,0.7)', display: 'inline-block' }}></span> Results
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'var(--gold)', display: 'inline-block' }}></span> Staff in charge
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

            return (
              <div
                key={idx}
                className={`cal-cell${isToday ? ' today' : ''}${isValid ? '' : ' cal-empty'}`}
              >
                {isValid && (
                  <>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: isToday ? 'var(--blue)' : 'var(--txt-sub)', marginBottom: '4px' }}>{dayNum}</div>

                    {/* ① PLAN TO GO — green ✓ when checked in; click jumps to Check-In */}
                    {dayRoutes.map((r, i) =>
                      (r.location_name || '')
                        .split(',')
                        .map(loc => loc.trim())
                        .filter(Boolean)
                        .map((loc, j) => {
                          const checkedIn = checkinsForMonth.some(c => c.date === r.date && c.team === r.team);
                          return (
                            <div
                              key={`p${i}-${j}`}
                              className="cal-ticket plan"
                              onClick={() => {
                                if (checkedIn) {
                                  if (daySubs.length === 1) openModal(daySubs[0]);
                                  else if (daySubs.length > 1) setDayModal({ date: r.date, subs: daySubs });
                                  else alert('No submission recorded yet for this location.');
                                } else {
                                  navigate(`/checkin?date=${r.date}&location=${encodeURIComponent(loc)}`);
                                }
                              }}
                              title={checkedIn ? `Checked in at ${loc} — click to view submission` : `Click to Check-In at ${loc} on ${r.date}`}
                              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                              <i className="fa-solid fa-route" style={{ fontSize: 8 }}></i>
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{loc}</span>
                              {checkedIn && <span className="plan-check" title="Checked in by staff">✓</span>}
                            </div>
                          );
                        })
                    )}

                                        {/* ② RESULTS — summed acquisition of ALL submissions that day.
                        Single place/day → open the submission modal directly;
                        multiple places → big-picture picker first. */}
                    {daySubs.length > 0 && (
                      <div
                        className="cal-ticket result"
                        onClick={() => {
                          if (daySubs.length === 1) openModal(daySubs[0]);
                          else setDayModal({ date: dateStr, subs: daySubs });
                        }}
                        title={daySubs.length === 1
                          ? `${totalAcq(daySubs)} Acquisition ✓ · ${daySubs[0].branch} · Buy ${fmtLAK(totalBuy(daySubs))} — click to view details`
                          : `${totalAcq(daySubs)} Acquisitions total (sum of ${daySubs.length} records) · Buy ${fmtLAK(totalBuy(daySubs))} — click to choose a record`}
                      >
                        <i className="fa-solid fa-circle-check" style={{ fontSize: 8 }}></i> {totalAcq(daySubs)} Acquisition{totalAcq(daySubs) !== 1 ? 's' : ''}
                      </div>
                    )}

                    {/* ③ STAFF IN CHARGE that day */}
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

            {/* Day Summary modal — big picture first, then pick a record for details */}
      {dayModal && (
        <div
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
              <button onClick={() => setDayModal(null)} className="btn btn-ghost" style={{ padding: '6px', borderRadius: '50%', width: '32px', height: '32px', lineHeight: 1 }}>✕</button>
            </div>

            {/* Big picture */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '18px' }}>
              <div style={{ background: 'var(--gold-dim)', border: '1px solid rgba(167,123,39,0.25)', borderRadius: '8px', padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: '10px', color: 'var(--txt-sub)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Acquisition</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--gold)' }}>{totalAcq(dayModal.subs)}</div>
              </div>
              <div style={{ background: 'rgba(46,194,122,0.12)', border: '1px solid rgba(46,194,122,0.3)', borderRadius: '8px', padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: '10px', color: 'var(--txt-sub)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Buy Value</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>{fmtLAK(totalBuy(dayModal.subs))}</div>
              </div>
              <div style={{ background: 'rgba(77,158,255,0.12)', border: '1px solid rgba(77,158,255,0.3)', borderRadius: '8px', padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: '10px', color: 'var(--txt-sub)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Records</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--blue)' }}>{dayModal.subs.length}</div>
              </div>
            </div>

            {/* Record list */}
            {dayModal.subs.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px', marginBottom: '10px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '13px' }}>{s.branch}</strong>
                    <span className={`pill ${s.team === 'KPV' ? 'pill-gold' : 'pill-blue'}`}>{s.team}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--txt-sub)', marginTop: '3px' }}>
                    {totalAcq([s])} acquisition · Buy {fmtLAK(totalBuy([s]))} · {(s.staff_in_charge || []).length} in charge
                  </div>
                </div>
                <button className="btn btn-ghost" onClick={() => { const sub = s; setDayModal(null); openModal(sub); }} style={{ padding: '5px 12px', fontSize: '11px', whiteSpace: 'nowrap' }}>
                  View Details <i className="fa-solid fa-arrow-right"></i>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Shared submission detail/edit modal — same as Dashboard (merch + staff editing) */}
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
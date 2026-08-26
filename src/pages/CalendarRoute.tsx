import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, getRoutePlans } from '../lib/workflow';
import type { Submission } from '../lib/submissions';
import SubmissionModal from '../components/SubmissionModal';

// Sample mock data for submissions and check-ins (March 2025 demo set)
interface CheckIn {
  date: string;
  team: string;
  branch: string;
  time: string;
}

const mockSubmissions: Submission[] = [
  { id: '1', date: '2025-03-03', team: 'KPV', branch: 'That Luang', new_register: 61, new_reg_purchased: 40, buy_value_new: 5200000, team_cost: 980000, merch_cost: 40000, existing_users: 15, buy_value_existing: 1800000, staff_in_charge: ['ສົມສະໜຸກ ພົມມະຈັນ', 'ບຸນມີທິບ ວົງພັດທະນະ'], footfall: 420, step_in: 95, status: 'active', merch_items: [] },
  { id: '2', date: '2025-03-04', team: 'Agency', branch: 'NUOL Campus', new_register: 47, new_reg_purchased: 31, buy_value_new: 3900000, team_cost: 860000, merch_cost: 20000, existing_users: 10, buy_value_existing: 950000, staff_in_charge: ['Alita Souvannary'], footfall: 380, step_in: 70, status: 'active', merch_items: [] },
  { id: '3', date: '2025-03-10', team: 'KPV', branch: 'Talat Sao', new_register: 56, new_reg_purchased: 36, buy_value_new: 4700000, team_cost: 910000, merch_cost: 0, existing_users: 13, buy_value_existing: 1200000, staff_in_charge: ['ກັນຍາ ສີວົງໄຊ', 'ທິດາ ພົນສະຫວັນ'], footfall: 405, step_in: 88, status: 'active', merch_items: [] },
  { id: '4', date: '2025-03-11', team: 'KPV', branch: 'Sikhottabong', new_register: 52, new_reg_purchased: 34, buy_value_new: 4400000, team_cost: 890000, merch_cost: 35000, existing_users: 12, buy_value_existing: 1100000, staff_in_charge: ['ນະພາ ແກ້ວມະນີ'], footfall: 390, step_in: 76, status: 'active', merch_items: [] },
  { id: '5', date: '2025-03-17', team: 'Agency', branch: 'Wattay Airport', new_register: 49, new_reg_purchased: 32, buy_value_new: 4100000, team_cost: 840000, merch_cost: 0, existing_users: 9, buy_value_existing: 900000, staff_in_charge: ['Bounmy Keophilavanh'], footfall: 350, step_in: 64, status: 'active', merch_items: [] },
  { id: '6', date: '2025-03-18', team: 'KPV', branch: 'Parkson Mall', new_register: 63, new_reg_purchased: 41, buy_value_new: 5500000, team_cost: 1020000, merch_cost: 50000, existing_users: 17, buy_value_existing: 2100000, staff_in_charge: ['ສົມສະໜຸກ ພົມມະຈັນ', 'ກັນຍາ ສີວົງໄຊ', 'ທິດາ ພົນສະຫວັນ'], footfall: 460, step_in: 105, status: 'active', merch_items: [] },
  // Same-day multi-record example: admin assigned 2 locations → 2 submissions
  { id: '9', date: '2025-03-18', team: 'KPV', branch: 'Talat Sao', new_register: 34, new_reg_purchased: 22, buy_value_new: 2800000, team_cost: 480000, merch_cost: 20000, existing_users: 8, buy_value_existing: 900000, staff_in_charge: ['ບຸນມີທິບ ວົງພັດທະນະ', 'ນະພາ ແກ້ວມະນີ'], footfall: 300, step_in: 55, status: 'active', merch_items: [] },
  { id: '7', date: '2025-03-24', team: 'KPV', branch: 'Patuxay', new_register: 58, new_reg_purchased: 38, buy_value_new: 4900000, team_cost: 930000, merch_cost: 15000, existing_users: 14, buy_value_existing: 1300000, staff_in_charge: ['ທິດາ ພົນສະຫວັນ'], footfall: 430, step_in: 92, status: 'active', merch_items: [] },
  { id: '8', date: '2025-03-25', team: 'Agency', branch: 'Evening Market', new_register: 66, new_reg_purchased: 43, buy_value_new: 5800000, team_cost: 1050000, merch_cost: 25000, existing_users: 19, buy_value_existing: 2400000, staff_in_charge: ['Alita Souvannary', 'Bounmy Keophilavanh'], footfall: 510, step_in: 120, status: 'active', merch_items: [] },
  // ── Same-day multi-location demos (29 Mar = 3 places, 03 Apr = 2 places) ──
  { id: '10', date: '2025-03-29', team: 'KPV', branch: 'Talat Sao', new_register: 58, new_reg_purchased: 38, buy_value_new: 4800000, team_cost: 0, merch_cost: 20000, existing_users: 14, buy_value_existing: 1500000, staff_in_charge: ['ສົມສະໜຸກ ພົມມະຈັນ', 'ກັນຍາ ສີວົງໄຊ'], footfall: 440, step_in: 96, status: 'active', merch_items: [] },
  { id: '11', date: '2025-03-29', team: 'KPV', branch: 'Parkson Mall', new_register: 52, new_reg_purchased: 35, buy_value_new: 4300000, team_cost: 0, merch_cost: 18000, existing_users: 11, buy_value_existing: 1000000, staff_in_charge: ['ບຸນມີທິບ ວົງພັດທະນະ', 'ນະພາ ແກ້ວມະນີ'], footfall: 390, step_in: 82, status: 'active', merch_items: [] },
  { id: '12', date: '2025-03-29', team: 'KPV', branch: 'Changan Circle', new_register: 44, new_reg_purchased: 30, buy_value_new: 3600000, team_cost: 0, merch_cost: 12000, existing_users: 9, buy_value_existing: 700000, staff_in_charge: ['ທິດາ ພົນສະຫວັນ'], footfall: 320, step_in: 70, status: 'active', merch_items: [] },
  { id: '13', date: '2025-04-03', team: 'KPV', branch: 'Talat Sao', new_register: 46, new_reg_purchased: 31, buy_value_new: 3900000, team_cost: 0, merch_cost: 15000, existing_users: 9, buy_value_existing: 800000, staff_in_charge: ['ສົມສະໜຸກ ພົມມະຈັນ'], footfall: 350, step_in: 74, status: 'active', merch_items: [] },
  { id: '14', date: '2025-04-03', team: 'KPV', branch: 'Parkson Mall', new_register: 51, new_reg_purchased: 33, buy_value_new: 3900000, team_cost: 0, merch_cost: 22000, existing_users: 9, buy_value_existing: 980000, staff_in_charge: ['ບຸນມີທິບ ວົງພັດທະນະ', 'ກັນຍາ ສີວົງໄຊ'], footfall: 380, step_in: 80, status: 'active', merch_items: [] },
];

const mockCheckins: CheckIn[] = [
  { date: '2025-03-03', team: 'KPV', branch: 'That Luang', time: '08:32' },
  { date: '2025-03-04', team: 'Agency', branch: 'NUOL Campus', time: '08:41' },
  { date: '2025-03-10', team: 'KPV', branch: 'Talat Sao', time: '08:47' },
  { date: '2025-03-11', team: 'KPV', branch: 'Sikhottabong', time: '08:55' },
  { date: '2025-03-17', team: 'Agency', branch: 'Wattay Airport', time: '08:38' },
  { date: '2025-03-18', team: 'KPV', branch: 'Parkson Mall', time: '09:02' },
  { date: '2025-03-24', team: 'KPV', branch: 'Patuxay', time: '08:29' },
  { date: '2025-03-25', team: 'Agency', branch: 'Evening Market', time: '17:18' },
];

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
  // Demo reference "today" — matches the target screenshot (day 26 of March 2025)
  const highlightDate = '2025-03-26';
  const [currentYear, setCurrentYear] = useState(2025);
  const [currentMonth, setCurrentMonth] = useState(2); // 0-based: 2 = March
        const [modalSub, setModalSub] = useState<Submission | null>(null);
  // Day summary modal — big picture of all submissions on one date
    const [dayModal, setDayModal] = useState<{ date: string; subs: Submission[] } | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>(mockSubmissions);

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

  const subsForMonth = submissions.filter(s => s.date.startsWith(currentMonthStr));
  const checkinsForMonth = mockCheckins.filter(c => c.date.startsWith(currentMonthStr));
      const routesForMonth = getRoutePlans().filter(r =>
    r.date.startsWith(currentMonthStr) &&
    // Staff only see the plans assigned to their own team
    (!user || user.role === 'admin' || user.role === 'manager' || !user.team || r.team === user.team)
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
                      r.location_name
                        .split(',')
                        .map(loc => loc.trim())
                        .filter(Boolean)
                        .map((loc, j) => {
                          const checkedIn = checkinsForMonth.some(c => c.date === r.date && c.team === r.team);
                          return (
                            <div
                              key={`p${i}-${j}`}
                              className="cal-ticket plan"
                              onClick={() => navigate(`/checkin?date=${r.date}&location=${encodeURIComponent(loc)}`)}
                              title={checkedIn ? `Checked in at ${loc} — click to re-open Check-In` : `Click to Check-In at ${loc} on ${r.date}`}
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
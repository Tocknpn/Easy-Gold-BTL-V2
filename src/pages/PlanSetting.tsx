import { useEffect, useMemo, useState } from 'react';
import type { Submission } from '../lib/submissions';
import { fetchSubmissions, genMockSubmissions } from '../lib/submissions';
import { getCheckIns, getRoutePlans, saveRoutePlans } from '../lib/workflow';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const YEARS = [2024, 2025, 2026, 2027];

// Normalise a multi-location string: "a , b" → "a, b"
const normLoc = (v: string) => v.split(',').map(x => x.trim()).filter(Boolean).join(', ');

export default function PlanSetting() {
  const [year, setYear] = useState(2025);
  const [month, setMonth] = useState(2); // 0-based → March
  const [team, setTeam] = useState<'KPV' | 'Agency'>('KPV');
  const [submissions, setSubmissions] = useState<Submission[]>(genMockSubmissions);
  const [loading, setLoading] = useState(true);
  // Pending edits keyed by date (admin can fill many boxes then save once)
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [blocked, setBlocked] = useState('');
  const [flash, setFlash] = useState('');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await fetchSubmissions();
    if (error) console.error('Error fetching submissions:', error);
    if (data && data.length > 0) setSubmissions(data);
    setLoading(false);
  };

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(''), 3000);
    return () => clearTimeout(t);
  }, [flash]);

  // Reset drafts when switching month / team
  useEffect(() => { setDrafts({}); setBlocked(''); }, [year, month, team]);

  // ── Dates where results were already recorded → plan is locked ────────
  const submittedDates = useMemo(() => {
    const set = new Set<string>();
    for (const s of submissions) if ((s.team || '') === team) set.add(s.date);
    return set;
  }, [submissions, team]);

  const checkedInDates = useMemo(() => {
    const set = new Set<string>();
    for (const c of getCheckIns()) if (c.team === team) set.add(c.date);
    return set;
  }, [team]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // ── One row per calendar day ───────────────────────────────────────────
  const rows = useMemo(() => {
    const plans = getRoutePlans();
    const out: { date: string; dayNum: number; weekday: string; saved: string }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const saved = plans
        .filter(p => p.date === date && p.team === team)
        .map(p => p.location_name)
        .join(', ');
      const weekday = new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short' });
      out.push({ date, dayNum: d, weekday, saved });
    }
    return out;
  }, [year, month, team, daysInMonth]);

  const getValue = (row: { date: string; saved: string }) =>
    drafts[row.date] !== undefined ? drafts[row.date] : row.saved;

  const isModified = (row: { date: string; saved: string }) =>
    drafts[row.date] !== undefined && normLoc(drafts[row.date]) !== normLoc(row.saved);

  const pendingCount = rows.filter(isModified).length;

  const handleChange = (row: { date: string; dayNum: number; saved: string }, value: string) => {
    // 🔒 Plans with recorded results cannot be edited
    if (submittedDates.has(row.date)) {
      setBlocked(`⛔ ${row.dayNum} ${MONTHS[month]} ${year} — Data already filled in for ${team} on this date (check-in + submission exist). Delete the record first to edit this plan.`);
      return;
    }
    setBlocked('');
    setDrafts(d => ({ ...d, [row.date]: value }));
  };

  const handleSaveAll = () => {
    let plans = getRoutePlans();
    let changes = 0;
    for (const row of rows) {
      if (!isModified(row)) continue;
      const next = normLoc(getValue(row));
      const others = plans.filter(p => !(p.date === row.date && p.team === team));
      plans = next
        ? [...others, { id: `rp-${Date.now()}-${row.dayNum}`, date: row.date, team, location_name: next }]
        : others; // empty box = remove the plan for that day
      changes++;
    }
    saveRoutePlans(plans);
    setDrafts({});
        setFlash(`✓ Saved ${changes} day${changes !== 1 ? 's' : ''} — ${team} · ${MONTHS[month]} ${year}`);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '12px' }}>
        <h2 style={{ fontSize: '18px', margin: 0 }}>Monthly Route Plan Setting</h2>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {flash && (
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--green)' }}>
              <i className="fa-solid fa-circle-check"></i> {flash}
            </span>
          )}
          <button className="btn btn-ghost" onClick={() => setDrafts({})} disabled={pendingCount === 0} style={{ opacity: pendingCount === 0 ? 0.45 : 1 }}>
            Discard
          </button>
          <button className="btn btn-primary" onClick={handleSaveAll} disabled={pendingCount === 0} style={{ opacity: pendingCount === 0 ? 0.5 : 1 }}>
            <i className="fa-solid fa-floppy-disk"></i> Save Changes{pendingCount > 0 ? ` (${pendingCount})` : ''}
          </button>
        </div>
      </div>

      <div className="demo-banner">
        <i className="fa-solid fa-circle-info"></i> {loading
          ? 'Loading records…'
          : `Every day of ${MONTHS[month]} ${year} is listed — type the location plan for each day. Multiple places allowed, separated by commas (e.g. "Talat Sao, Parkson Mall"). Days with submitted data are locked.`}
      </div>

      {/* Blocked-edit warning */}
      {blocked && (
        <div className="alert" style={{ background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid rgba(232,84,84,0.3)', marginBottom: '16px', justifyContent: 'space-between' }}>
          <span><i className="fa-solid fa-lock"></i> {blocked}</span>
          <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={() => setBlocked('')}>Dismiss</button>
        </div>
      )}

      {/* Filters */}
      <div className="card" style={{ marginBottom: '20px', padding: '14px 20px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={month} onChange={e => setMonth(Number(e.target.value))} style={{ padding: '7px', fontSize: '12px', width: 'auto' }}>
            {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ padding: '7px', fontSize: '12px', width: 'auto' }}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={team} onChange={e => setTeam(e.target.value as 'KPV' | 'Agency')} style={{ padding: '7px', fontSize: '12px', width: 'auto' }}>
            <option value="KPV">KPV Team</option>
            <option value="Agency">Agency Team</option>
          </select>
                    <span style={{ fontSize: '11px', color: 'var(--txt-dim)', marginLeft: 'auto' }}>
            {rows.filter(r => r.saved).length}/{daysInMonth} days planned · {submittedDates.size} locked
          </span>
        </div>
      </div>

      {/* Month grid */}
      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '140px' }}>Date</th>
              <th>Location Plan <span style={{ color: 'var(--gold)' }}>(editable)</span></th>
              <th style={{ width: '170px' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const locked = submittedDates.has(row.date);
              const modified = isModified(row);
              const checkedIn = checkedInDates.has(row.date);
              return (
                <tr key={row.date} style={modified ? { background: 'var(--gold-dim)' } : undefined}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <strong>{String(row.dayNum).padStart(2, '0')} {MONTHS[month].slice(0, 3)}</strong>
                    <span style={{ color: 'var(--txt-dim)', fontSize: '11px', marginLeft: '6px' }}>{row.weekday}</span>
                  </td>
                  <td>
                    <input
                      type="text"
                      value={getValue(row)}
                      onChange={e => handleChange(row, e.target.value)}
                      placeholder={locked ? '— locked —' : 'e.g. Talat Sao, Parkson Mall'}
                      title={locked ? 'Data already filled in — delete the record to edit this plan' : 'One or more places, separated by commas'}
                      style={{
                        width: '100%',
                        padding: '7px 12px',
                        fontSize: '13px',
                        borderColor: modified ? 'var(--gold)' : undefined,
                        cursor: locked ? 'not-allowed' : undefined,
                        opacity: locked ? 0.75 : 1,
                      }}
                    />
                  </td>
                  <td>
                    {locked ? (
                      <span className="pill pill-red"><i className="fa-solid fa-lock"></i> Data filled</span>
                    ) : modified ? (
                      <span className="pill pill-blue">Edited</span>
                    ) : row.saved ? (
                      <span className="pill pill-gold">Planned</span>
                    ) : (
                      <span style={{ fontSize: '11px', color: 'var(--txt-dim)' }}>Not set</span>
                    )}
                    {checkedIn && !locked && (
                      <i className="fa-solid fa-location-dot" title="Staff captured a check-in on this date" style={{ marginLeft: '6px', color: 'var(--green)', fontSize: '10px' }}></i>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border)', fontSize: '11px', color: 'var(--txt-dim)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <span>
            <i className="fa-solid fa-lightbulb" style={{ color: 'var(--gold)' }}></i>
            Fill many boxes, then press <strong>Save Changes</strong> once. Clear a box and save to remove that day's plan.
          </span>
          <span>{pendingCount > 0 ? `${pendingCount} unsaved edit${pendingCount > 1 ? 's' : ''}` : 'All changes saved'}</span>
        </div>
      </div>
    </div>
  );
}

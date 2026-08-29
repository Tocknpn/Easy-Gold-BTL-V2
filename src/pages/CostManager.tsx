import { useState, useEffect, useMemo } from 'react';
import type { Submission } from '../lib/submissions';
import { fetchSubmissions, genMockSubmissions, fmtLAK, fmtLAKShort, labelDate } from '../lib/submissions';
import { supabase } from '../lib/supabase';

// ── Sortable columns (every header is sortable) ──────────────────────────
type SortKey = 'date' | 'team' | 'branch' | 'new_register' | 'buy_total' | 'merch_cost' | 'service_cost' | 'total_cost' | 'cpa';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'date', label: 'Date' },
  { key: 'team', label: 'Team' },
  { key: 'branch', label: 'Branch' },
  { key: 'new_register', label: 'Users (NC)' },
  { key: 'buy_total', label: 'Buy Value' },
  { key: 'merch_cost', label: 'Merch Cost' },
  { key: 'service_cost', label: 'Service Cost (LAK)' },
  { key: 'total_cost', label: 'Total Cost' },
  { key: 'cpa', label: 'CPA (preview)' },
];

const CostInput = ({ value, onChange, style, title }: any) => {
  const [str, setStr] = useState(value ? Number(value).toLocaleString() : '');
  useEffect(() => {
    if (!value && str !== '') setStr('');
    else if (value && Number(str.replace(/,/g, '')) !== Number(value)) setStr(Number(value).toLocaleString());
  }, [value]);
  
  return (
    <input
      type="text"
      inputMode="numeric"
      value={str}
      title={title}
      aria-label={title}
      style={style}
      onChange={e => {
        const raw = e.target.value.replace(/,/g, '');
        if (/^\d*$/.test(raw)) {
          setStr(raw ? Number(raw).toLocaleString() : '');
          onChange(raw);
        }
      }}
    />
  );
};

export default function CostManager() {
  const [submissions, setSubmissions] = useState<Submission[]>(genMockSubmissions);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
    const [teamFilter, setTeamFilter] = useState('All Teams');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  // Pending edits: submission id → raw input string (lets admin fill many rows at once)
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await fetchSubmissions();
    if (error) console.error('Error fetching submissions:', error);
    if (data && data.length > 0) setSubmissions(data);
    setLoading(false);
  };

  // Auto-hide the saved confirmation
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(''), 3000);
    return () => clearTimeout(t);
  }, [flash]);

  const buyTotal = (s: Submission) => (s.buy_value_new || 0) + (s.buy_value_existing || 0);

  // ── Filters (date range + team) ───────────────────────────────────────
  const filtered = useMemo(() => submissions.filter(s => {
    const inRange = (!startDate || s.date >= startDate) && (!endDate || s.date <= endDate);
    const inTeam = teamFilter === 'All Teams' || s.team === teamFilter || s.team === teamFilter.replace(' Team', '');
    return inRange && inTeam;
  }), [submissions, startDate, endDate, teamFilter]);

  // ── Sorted view (uses SAVED values so rows stay put while admin types drafts) ──
  const sorted = useMemo(() => {
    const val = (s: Submission): number | string => {
      switch (sortKey) {
        case 'date': return s.date;
        case 'team': return s.team || '';
        case 'branch': return s.branch || '';
        case 'new_register': return s.new_register || 0;
        case 'buy_total': return buyTotal(s);
        case 'merch_cost': return s.merch_cost || 0;
        case 'service_cost': return s.team_cost || 0; // ₭0 = pending, filled by admin later
        case 'total_cost': return (s.merch_cost || 0) + (s.team_cost || 0);
        case 'cpa': return s.new_register > 0 ? ((s.merch_cost || 0) + (s.team_cost || 0)) / s.new_register : -Infinity;
      }
    };
    return [...filtered].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      let cmp: number;
      if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'date' || key === 'cpa' ? 'desc' : 'asc');
    }
  };

  // ── Live totals for summary cards ─────────────────────────────────────
  const totals = useMemo(() => {
    let service = 0, merch = 0;
    for (const s of filtered) {
      service += Number(drafts[s.id] !== undefined ? (Number(drafts[s.id]) || 0) : s.team_cost) || 0;
      merch += s.merch_cost || 0;
    }
    return { service, merch, combined: service + merch };
  }, [filtered, drafts]);

  // ── Draft helpers ─────────────────────────────────────────────────────
  const getDraftValue = (s: Submission) => (drafts[s.id] !== undefined ? drafts[s.id] : String(s.team_cost || 0));
  const isModified = (s: Submission) => drafts[s.id] !== undefined && (Number(drafts[s.id]) || 0) !== s.team_cost;
  const pendingCount = sorted.filter(isModified).length;

  const liveTotalCost = (s: Submission) => (s.merch_cost || 0) + (Number(getDraftValue(s)) || 0);

  const setDraft = (id: string, value: string) => setDrafts(d => ({ ...d, [id]: value }));

  // ── Batch save: persist every edited Service Cost at once ────────────
  const handleSaveAll = async () => {
    const updates = Object.entries(drafts)
      .map(([id, v]) => ({ id, team_cost: Math.max(0, Number(v) || 0) }))
      .filter(u => {
        const orig = submissions.find(s => s.id === u.id);
        return orig && orig.team_cost !== u.team_cost;
      });
    if (updates.length === 0) return;

    setSaving(true);
    let dbFailures = 0;
    const realIds = updates.filter(u => !u.id.startsWith('mock-'));
    if (supabase && realIds.length > 0) {
      for (const u of realIds) {
        const { error } = await supabase.from('submissions').update({ team_cost: u.team_cost }).eq('id', u.id);
        if (error) {
          dbFailures++;
          console.error('Cost Manager: failed to update submission', u.id, error);
        }
      }
    }

    // Optimistic local update (covers demo/mock records too)
    const costMap = new Map(updates.map(u => [u.id, u.team_cost]));
    setSubmissions(prev => prev.map(s => (costMap.has(s.id) ? { ...s, team_cost: costMap.get(s.id)! } : s)));
    setDrafts({});
    setSaving(false);

    if (dbFailures > 0 && realIds.length > 0) {
      window.alert(`Saved ${updates.length - dbFailures}/${updates.length} record(s). ${dbFailures} database update(s) failed — check your connection.`);
    } else {
      setFlash(`✓ Saved ${updates.length} record${updates.length > 1 ? 's' : ''} — CPA / CPO / CPAO updated`);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '12px' }}>
        <h2 style={{ fontSize: '18px', margin: 0 }}>Cost Manager</h2>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {flash && (
            <span role="status" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--green)' }}>
              <i className="fa-solid fa-circle-check" aria-hidden="true"></i> {flash}
            </span>
          )}
          <button
            className="btn btn-ghost"
            onClick={() => setDrafts({})}
            disabled={pendingCount === 0 || saving}
            style={{ opacity: pendingCount === 0 ? 0.45 : 1 }}
          >
            Discard
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSaveAll}
            disabled={pendingCount === 0 || saving}
            style={{ opacity: pendingCount === 0 && !saving ? 0.5 : 1 }}
          >
            <i className={`fa-solid ${saving ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`}></i>
            {saving ? 'Saving…' : pendingCount > 0 ? `Save Changes (${pendingCount})` : 'Save Changes'}
          </button>
        </div>
      </div>
      <div className="demo-banner">
                <i className="fa-solid fa-circle-info"></i> {loading
          ? 'Loading submission records…'
          : 'Admin only — new submissions arrive with Service Cost ₭0 (filled here 1–2 days after the record date). It combines with Merch Cost to drive CPA / CPO / CPAO. Edit many boxes, then press Save Changes once.'}
      </div>

      {/* Summary cards */}
      <div className="grid-3" style={{ marginBottom: '20px' }}>
        <div className="card" style={{ borderTop: '4px solid var(--red)' }}>
          <div style={{ fontSize: '12px', color: 'var(--txt-sub)', marginBottom: '6px' }}>Total Service Cost (Team)</div>
          <div style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{fmtLAKShort(totals.service)}</div>
          <div style={{ fontSize: '10px', color: 'var(--txt-dim)', marginTop: '4px' }}>{filtered.length} records in range</div>
        </div>
        <div className="card" style={{ borderTop: '4px solid var(--gold)' }}>
          <div style={{ fontSize: '12px', color: 'var(--txt-sub)', marginBottom: '6px' }}>Total Merch Cost</div>
          <div style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{fmtLAKShort(totals.merch)}</div>
          <div style={{ fontSize: '10px', color: 'var(--txt-dim)', marginTop: '4px' }}>filled by staff on submission</div>
        </div>
        <div className="card" style={{ borderTop: '4px solid var(--txt-main)' }}>
          <div style={{ fontSize: '12px', color: 'var(--txt-sub)', marginBottom: '6px' }}>Combined Operational Cost</div>
          <div style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{fmtLAKShort(totals.combined)}</div>
          <div style={{ fontSize: '10px', color: 'var(--txt-dim)', marginTop: '4px' }}>service + merch</div>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: '20px', padding: '14px 20px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="date" aria-label="Start date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ padding: '7px', fontSize: '12px', width: 'auto' }} />
          <input type="date" aria-label="End date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ padding: '7px', fontSize: '12px', width: 'auto' }} />
          <select aria-label="Filter by team" value={teamFilter} onChange={e => setTeamFilter(e.target.value)} style={{ padding: '7px', fontSize: '12px', width: 'auto' }}>
            <option>All Teams</option>
            <option>KPV Team</option>
            <option>Agency Team</option>
          </select>
          <button
            className="btn btn-ghost"
            onClick={() => { setStartDate(''); setEndDate(''); setTeamFilter('All Teams'); }}
            style={{ padding: '7px 12px', fontSize: '12px' }}
          >
                        <i className="fa-solid fa-xmark"></i> Clear
          </button>
        </div>
      </div>

      {/* Editable cost table */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
          <h3 style={{ margin: 0, fontSize: '15px' }}>Daily Team Operating Cost</h3>
          {pendingCount > 0 && (
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gold)' }}>
              <i className="fa-solid fa-pen"></i> {pendingCount} unsaved edit{pendingCount > 1 ? 's' : ''}
            </span>
          )}
        </div>

        <table className="data-table">
          <thead>
            <tr>
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSort(col.key); } }}
                  role="button"
                  tabIndex={0}
                  aria-sort={sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  title={`Sort by ${col.label}`}
                  style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', color: col.key === 'service_cost' ? 'var(--gold)' : undefined }}
                >
                  {col.label}
                  <i
                    className={`fa-solid ${sortKey === col.key ? (sortDir === 'asc' ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort'}`}
                    style={{ marginLeft: '5px', fontSize: '9px', color: sortKey === col.key ? 'var(--gold)' : 'var(--txt-dim)', opacity: sortKey === col.key ? 1 : 0.55 }}
                  ></i>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(s => {
              const modified = isModified(s);
              const total = liveTotalCost(s);
              const cpa = s.new_register > 0 ? total / s.new_register : NaN;
              return (
                <tr key={s.id} style={modified ? { background: 'var(--gold-dim)' } : undefined}>
                  <td style={{ whiteSpace: 'nowrap' }}>{labelDate(s.date)}</td>
                  <td><span className={`pill ${s.team === 'Agency' ? 'pill-blue' : 'pill-gold'}`}>{s.team || 'KPV'}</span></td>
                  <td>{s.branch}</td>
                  <td style={{ color: 'var(--gold)', fontWeight: 700 }}>{(s.new_register || 0).toLocaleString()}</td>
                  <td>{fmtLAKShort(buyTotal(s))}</td>
                  <td>{fmtLAKShort(s.merch_cost)}</td>
                  <td>
                    <CostInput
                      value={getDraftValue(s)}
                      onChange={(val: string) => setDraft(s.id, val)}
                      title="Fill the team operating cost for this day"
                      style={{
                        width: '130px',
                        padding: '6px 10px',
                        fontSize: '13px',
                        fontFamily: 'var(--font-mono)',
                        textAlign: 'right',
                        border: Number(getDraftValue(s)) > 0 ? '1px solid var(--green)' : '1px solid var(--red)',
                        background: modified ? 'var(--input-bg)' : undefined,
                      }}
                    />
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{fmtLAKShort(total)}</td>
                  <td>{Number.isFinite(cpa) ? fmtLAK(Math.round(cpa)) : '—'}</td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', color: 'var(--txt-dim)', padding: '24px' }}>
                  No submission records in this range — {loading ? 'loading…' : 'try widening the dates or clearing filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border)', fontSize: '11px', color: 'var(--txt-dim)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <span><i className="fa-solid fa-lightbulb" style={{ color: 'var(--gold)' }}></i> Tip: fill several Service Cost boxes, then press <strong>Save Changes</strong> once — everything is written together.</span>
          <span>{sorted.length} record{sorted.length !== 1 ? 's' : ''} shown</span>
        </div>
      </div>
    </div>
  );
}

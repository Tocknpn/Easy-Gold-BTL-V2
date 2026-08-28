import { useState, useEffect, useMemo } from 'react';
import type { Submission } from '../lib/submissions';
import { fetchSubmissions, genMockSubmissions, fmtLAK, fmtLAKShort, labelDate } from '../lib/submissions';
import SubmissionModal from '../components/SubmissionModal';

// ── Sortable columns (every header is sortable) ──────────────────────────
type SortKey = 'date' | 'team' | 'branch' | 'new_register' | 'new_reg_purchased' | 'existing_users' | 'cost' | 'cpa' | 'cpo';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'date', label: 'DATE' },
  { key: 'team', label: 'TEAM' },
  { key: 'branch', label: 'BRANCH' },
  { key: 'new_register', label: 'NEW REG' },
  { key: 'new_reg_purchased', label: 'PURCHASED' },
  { key: 'existing_users', label: 'EXISTING' },
  { key: 'cost', label: 'COST' },
  { key: 'cpa', label: 'CPA' },
  { key: 'cpo', label: 'CPO' },
];

interface Row {
  s: Submission;
  cost: number;
  cpa: number; // NaN when NC = 0
  cpo: number; // NaN when buyers = 0
}

export default function Report() {
  const [submissions, setSubmissions] = useState<Submission[]>(genMockSubmissions);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [teamFilter, setTeamFilter] = useState('All Teams');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [pageSize, setPageSize] = useState<number | 'all'>(10);
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<{ open: boolean; submission: Submission | null }>({ open: false, submission: null });

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

  // ── Derived rows with computed metrics ────────────────────────────────
  const rows = useMemo<Row[]>(() => submissions.map(s => {
    const cost = (s.team_cost || 0) + (s.merch_cost || 0);
    const buyers = (s.new_reg_purchased || 0) + (s.existing_users || 0);
    return {
      s,
      cost,
      cpa: s.new_register > 0 ? cost / s.new_register : NaN,
      cpo: buyers > 0 ? cost / buyers : NaN,
    };
  }), [submissions]);

  // ── Filters (date range + team) ───────────────────────────────────────
  const filtered = useMemo(() => rows.filter(r => {
    const inRange = (!startDate || r.s.date >= startDate) && (!endDate || r.s.date <= endDate);
    const inTeam = teamFilter === 'All Teams' || r.s.team === teamFilter || r.s.team === teamFilter.replace(' Team', '');
    return inRange && inTeam;
  }), [rows, startDate, endDate, teamFilter]);

  const sorted = useMemo(() => {
    const val = (r: Row): number | string => {
      switch (sortKey) {
        case 'date': return r.s.date;
        case 'team': return r.s.team;
        case 'branch': return r.s.branch;
        case 'new_register': return r.s.new_register;
        case 'new_reg_purchased': return r.s.new_reg_purchased;
        case 'existing_users': return r.s.existing_users;
        case 'cost': return r.cost;
        case 'cpa': return Number.isFinite(r.cpa) ? r.cpa : -Infinity;
        case 'cpo': return Number.isFinite(r.cpo) ? r.cpo : -Infinity;
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

  // ── Pagination (10 / 20 / 50 / All) ───────────────────────────────────
  const totalItems = sorted.length;
  const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(
    () => (pageSize === 'all' ? sorted : sorted.slice((safePage - 1) * pageSize, safePage * pageSize)),
    [sorted, pageSize, safePage]
  );

  // Reset to first page whenever filters / sort / page size change
  useEffect(() => {
    setPage(1);
  }, [startDate, endDate, teamFilter, pageSize, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'date' ? 'desc' : 'asc');
    }
  };

  // ── Row → shared submission detail modal ──────────────────────────────
  const openModal = (sub: Submission) => setModal({ open: true, submission: sub });
  const closeModal = () => setModal({ open: false, submission: null });
  const handleSave = (saved: Submission) => {
    setSubmissions(prev => prev.map(s => (s.id === saved.id ? saved : s)));
    setModal(m => ({ ...m, submission: saved }));
  };
  const handleDelete = (id: string) => {
    setSubmissions(prev => prev.filter(s => s.id !== id));
    closeModal();
  };

  // ── Export CSV (respects current date/team filters + sort order) ─────
  const exportCsv = () => {
    const esc = (v: unknown) => {
      const str = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const header = ['Date', 'Team', 'Branch', 'New Reg (NC)', 'NC Purchased', 'Existing (EC)', 'Buy Value New', 'Buy Value Existing', 'Total Buy Value', 'Footfall', 'Step-in', 'Service Cost', 'Merch Cost', 'Total Cost', 'CPA', 'CPO'];
    const lines = [header.join(',')];
    for (const r of sorted) {
      lines.push([
        r.s.date,
        r.s.team,
        r.s.branch,
        r.s.new_register,
        r.s.new_reg_purchased,
        r.s.existing_users,
        r.s.buy_value_new,
        r.s.buy_value_existing,
        (r.s.buy_value_new || 0) + (r.s.buy_value_existing || 0),
        r.s.footfall,
        r.s.step_in,
        r.s.team_cost,
        r.s.merch_cost,
        r.cost,
        Number.isFinite(r.cpa) ? Math.round(r.cpa) : '',
        Number.isFinite(r.cpo) ? Math.round(r.cpo) : '',
      ].map(esc).join(','));
    }
    // BOM so Excel opens Lao/UTF-8 characters correctly
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `submissions_${startDate || 'all'}_to_${endDate || 'all'}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const rangeStart = totalItems === 0 ? 0 : (safePage - 1) * (pageSize === 'all' ? totalItems : pageSize) + 1;
  const rangeEnd = pageSize === 'all' ? totalItems : Math.min(safePage * pageSize, totalItems);

  return (
    <div>
      <div className="demo-banner">
        <i className="fa-solid fa-circle-info"></i> {loading ? 'Loading submissions…' : 'Full submission log — click any row to view details, sort by any column, or export to CSV.'}
      </div>

      {/* Filters + Export */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ padding: '7px', fontSize: '12px', width: 'auto' }} />
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ padding: '7px', fontSize: '12px', width: 'auto' }} />
          <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} style={{ padding: '7px', fontSize: '12px', width: 'auto' }}>
            <option>All Teams</option>
            <option>KPV Team</option>
            <option>Agency Team</option>
          </select>
          <button
            className="btn btn-ghost"
            onClick={() => { setStartDate(''); setEndDate(''); setTeamFilter('All Teams'); }}
            style={{ padding: '7px 12px', fontSize: '12px', marginTop: 0 }}
          >
            <i className="fa-solid fa-xmark"></i> Clear
          </button>
        </div>
        <button className="btn btn-primary" onClick={exportCsv} disabled={totalItems === 0} style={{ padding: '8px 16px', fontSize: '12px', opacity: totalItems === 0 ? 0.5 : 1 }}>
          <i className="fa-solid fa-download"></i> Export CSV ({totalItems})
        </button>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
          <h3 style={{ margin: 0, fontSize: '15px' }}>Full Submission Log</h3>
          <span style={{ fontSize: '11px', color: 'var(--txt-dim)' }}>
            {filtered.length} of {submissions.length} records match the filters
          </span>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  title={`Sort by ${col.label.toLowerCase()}`}
                  style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
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
            {paged.map(r => (
              <tr
                key={r.s.id}
                onClick={() => openModal(r.s)}
                title="Click to view details"
                style={{ cursor: 'pointer' }}
              >
                <td>{labelDate(r.s.date)}</td>
                <td><span className={`pill ${r.s.team === 'Agency' ? 'pill-blue' : 'pill-gold'}`}>{r.s.team || 'KPV'}</span></td>
                <td>{r.s.branch}</td>
                <td>{(r.s.new_register || 0).toLocaleString()}</td>
                <td>{(r.s.new_reg_purchased || 0).toLocaleString()}</td>
                <td>{(r.s.existing_users || 0).toLocaleString()}</td>
                <td>{fmtLAKShort(r.cost)}</td>
                <td>{Number.isFinite(r.cpa) ? fmtLAK(Math.round(r.cpa)) : '—'}</td>
                <td>{Number.isFinite(r.cpo) ? fmtLAK(Math.round(r.cpo)) : '—'}</td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} style={{ textAlign: 'center', color: 'var(--txt-dim)', padding: '24px' }}>
                  No submissions in this range — {loading ? 'loading…' : 'try widening the dates or clearing filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border)', fontSize: '12px', color: 'var(--txt-sub)', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span>
              {totalItems === 0 ? 'No entries' : `Showing ${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} of ${totalItems.toLocaleString()} entries`}
            </span>
            <select
              value={String(pageSize)}
              onChange={e => setPageSize(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              style={{ padding: '4px 8px', fontSize: '11px', width: 'auto' }}
              title="Records per page"
            >
              <option value="10">10 / page</option>
              <option value="20">20 / page</option>
              <option value="50">50 / page</option>
              <option value="all">Show All</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button
              className="btn btn-ghost"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              style={{ padding: '4px 10px', fontSize: '11px', opacity: safePage <= 1 ? 0.45 : 1 }}
            >
              ← Prev
            </button>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
              Page {safePage} / {totalPages}
            </span>
            <button
              className="btn btn-ghost"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              style={{ padding: '4px 10px', fontSize: '11px', opacity: safePage >= totalPages ? 0.45 : 1 }}
            >
              Next →
            </button>
          </div>
        </div>
      </div>

      {/* Shared submission detail modal (same as Dashboard) */}
      <SubmissionModal
        open={modal.open}
        submission={modal.submission}
        onClose={closeModal}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
}

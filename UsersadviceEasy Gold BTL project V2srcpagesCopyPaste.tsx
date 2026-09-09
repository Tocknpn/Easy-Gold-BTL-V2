import { useState, useEffect, useMemo } from 'react';
import type { Submission } from '../lib/submissions';
import { fetchSubmissions, genMockSubmissions, fmtLAK, labelDate } from '../lib/submissions';

const COLUMNS = [
  { key: 'date', label: 'Date', width: '100px' },
  { key: 'team', label: 'Team', width: '80px' },
  { key: 'branch', label: 'Branch', width: '140px' },
  { key: 'new_register', label: 'New Reg', width: '90px' },
  { key: 'new_reg_purchased', label: 'Purchased', width: '90px' },
  { key: 'existing_users', label: 'Existing', width: '90px' },
  { key: 'buy_value_new', label: 'Buy Value New', width: '120px' },
  { key: 'buy_value_existing', label: 'Buy Value Exist', width: '130px' },
  { key: 'team_cost', label: 'Service Cost', width: '120px' },
  { key: 'merch_cost', label: 'Merch Cost', width: '120px' },
  { key: 'total_cost', label: 'Total Cost', width: '120px' },
  { key: 'footfall', label: 'Footfall', width: '80px' },
  { key: 'step_in', label: 'Step-in', width: '80px' },
  { key: 'status', label: 'Status', width: '80px' },
] as const;

type SortKey = typeof COLUMNS[number]['key'];

export default function CopyPaste() {
  const [submissions, setSubmissions] = useState<Submission[]>(genMockSubmissions);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [teamFilter, setTeamFilter] = useState('All Teams');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await fetchSubmissions();
    if (error) console.error('Error fetching submissions:', error);
    if (data && data.length > 0) setSubmissions(data);
    setLoading(false);
  };

  const rows = useMemo(() => {
    return submissions.map(s => ({ ...s, total_cost: (s.team_cost || 0) + (s.merch_cost || 0) }));
  }, [submissions]);

  const filtered = useMemo(() => {
    return rows.filter(s => {
      const inRange = (!startDate || s.date >= startDate) && (!endDate || s.date <= endDate);
      const inTeam = teamFilter === 'All Teams' || s.team === teamFilter || s.team === teamFilter.replace(' Team', '');
      const matchesSearch = !searchTerm || Object.values(s).some(v => String(v).toLowerCase().includes(searchTerm.toLowerCase()));
      return inRange && inTeam && matchesSearch;
    });
  }, [rows, startDate, endDate, teamFilter, searchTerm]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const va = (a as any)[sortKey];
      const vb = (b as any)[sortKey];
      let cmp: number;
      if (typeof va === 'number' && typeof vb === 'number') { cmp = va - vb; }
      else { cmp = String(va || '').localeCompare(String(vb || '')); }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }
    else { setSortKey(key); setSortDir('desc'); }
  };

  const formatValue = (key: string, value: any): string => {
    if (value === null || value === undefined || value === '') return '—';
    switch (key) {
      case 'date': return labelDate(value);
      case 'team': return value || 'KPV';
      case 'branch': return value;
      case 'new_register':
      case 'new_reg_purchased':
      case 'existing_users':
      case 'footfall':
      case 'step_in': return (Number(value) || 0).toLocaleString();
      case 'buy_value_new':
      case 'buy_value_existing':
      case 'team_cost':
      case 'merch_cost':
      case 'total_cost': return fmtLAK(Number(value) || 0);
      case 'status': return value;
      default: return String(value);
    }
  };

  const handleCopyAll = () => {
    const header = COLUMNS.map(c => c.label).join('');
    const lines = sorted.map(s => COLUMNS.map(c => {
      const val = (s as any)[c.key];
      if (val === null || val === undefined || val === '') return '';
      if (c.key === 'date') return val;
      if (['buy_value_new', 'buy_value_existing', 'team_cost', 'merch_cost', 'total_cost'].includes(c.key)) return String(Number(val) || 0);
      return String(val);
    }).join(''));
    const text = [header, ...lines].join('
');
    navigator.clipboard.writeText(text);
  };

  const numericCols = ['new_register', 'new_reg_purchased', 'existing_users', 'buy_value_new', 'buy_value_existing', 'team_cost', 'merch_cost', 'total_cost', 'footfall', 'step_in'];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '18px', margin: 0 }}>Copy &amp; Paste</h2>
          <div style={{ fontSize: '12px', color: 'var(--txt-sub)' }}>Select cells and copy with Ctrl+C</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-ghost" onClick={handleCopyAll}><i className="fa-solid fa-copy"></i> Copy All</button>
          <button className="btn btn-ghost" onClick={fetchData}><i className="fa-solid fa-rotate-right"></i> Refresh</button>
        </div>
      </div>
      <div className="card" style={{ marginBottom: '16px', padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ padding: '6px', fontSize: '12px', width: 'auto' }} />
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ padding: '6px', fontSize: '12px', width: 'auto' }} />
          <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} style={{ padding: '6px', fontSize: '12px', width: 'auto' }}>
            <option>All Teams</option><option>KPV Team</option><option>Agency Team</option>
          </select>
          <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ padding: '6px 10px', fontSize: '12px', width: '180px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--input-bg)', color: 'var(--txt-main)' }} />
          <button className="btn btn-ghost" onClick={() => { setStartDate(''); setEndDate(''); setTeamFilter('All Teams'); setSearchTerm(''); }} style={{ padding: '6px 12px', fontSize: '12px' }}><i className="fa-solid fa-xmark"></i> Clear</button>
          <span style={{ fontSize: '11px', color: 'var(--txt-dim)', marginLeft: 'auto' }}>{sorted.length} record{sorted.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
          <table className="data-table" style={{ userSelect: 'text', WebkitUserSelect: 'text', fontSize: '12px', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr>
                <th style={{ background: 'var(--surface-hover)', padding: '8px 12px', border: '1px solid var(--border)', textAlign: 'center', fontWeight: 600, color: 'var(--txt-dim)', fontSize: '10px', width: '40px' }}>#</th>
                {COLUMNS.map(col => (
                  <th key={col.key} onClick={() => toggleSort(col.key)} style={{ background: 'var(--surface-hover)', padding: '8px 12px', border: '1px solid var(--border)', textAlign: 'left', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', minWidth: col.width, color: sortKey === col.key ? 'var(--gold)' : 'var(--txt-dim)', fontSize: '11px' }}>
                    {col.label} <i className={`fa-solid ${sortKey === col.key ? (sortDir === 'asc' ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort'}`} style={{ marginLeft: '4px', fontSize: '9px', opacity: sortKey === col.key ? 1 : 0.4 }}></i>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, idx) => (
                <tr key={s.id} style={{ background: idx % 2 === 0 ? 'var(--surface)' : 'var(--surface-hover)' }}>
                  <td style={{ padding: '6px 12px', border: '1px solid var(--border)', textAlign: 'center', color: 'var(--txt-dim)', fontSize: '10px', background: 'var(--surface-hover)' }}>{idx + 1}</td>
                  {COLUMNS.map(col => (
                    <td key={col.key} style={{ padding: '6px 12px', border: '1px solid var(--border)', whiteSpace: 'nowrap', fontFamily: numericCols.includes(col.key) ? 'var(--font-mono)' : 'inherit', textAlign: numericCols.includes(col.key) ? 'right' : 'left', color: col.key === 'merch_cost' ? 'var(--gold)' : col.key === 'total_cost' ? 'var(--red)' : undefined }}>
                      {formatValue(col.key, (s as any)[col.key])}
                    </td>
                  ))}
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td colSpan={COLUMNS.length + 1} style={{ textAlign: 'center', color: 'var(--txt-dim)', padding: '40px' }}>{loading ? 'Loading...' : 'No records found'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ marginTop: '12px', fontSize: '11px', color: 'var(--txt-dim)', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
        <span><i className="fa-solid fa-mouse-pointer"></i> Click &amp; drag to select</span>
        <span><i className="fa-solid fa-keyboard"></i> Ctrl+C to copy</span>
        <span><i className="fa-solid fa-file-excel"></i> Paste to Sheets/Excel</span>
        <span><i className="fa-solid fa-arrow-down"></i> Click header to sort</span>
      </div>
    </div>
  );
}

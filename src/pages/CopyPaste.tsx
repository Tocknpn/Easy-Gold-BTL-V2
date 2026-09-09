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
  const [hoveredCell, setHoveredCell] = useState<{row: number, col: number} | null>(null);
  const [selectedRange, setSelectedRange] = useState<{start: {row: number, col: number}, end: {row: number, col: number}} | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

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
    if (value === null || value === undefined || value === '') return 'â€”';
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
    const header = COLUMNS.map(c => c.label).join('\t');
    const lines = sorted.map(s => COLUMNS.map(c => {
      const val = (s as any)[c.key];
      if (val === null || val === undefined || val === '') return '';
      if (c.key === 'date') return val;
      if (['buy_value_new', 'buy_value_existing', 'team_cost', 'merch_cost', 'total_cost'].includes(c.key)) return String(Number(val) || 0);
      return String(val);
    }).join('\t'));
    const text = [header, ...lines].join('\n');
    navigator.clipboard.writeText(text);
  };

  const handleCopySelected = () => {
    if (!selectedRange) return;
    const minRow = Math.min(selectedRange.start.row, selectedRange.end.row);
    const maxRow = Math.max(selectedRange.start.row, selectedRange.end.row);
    const minCol = Math.min(selectedRange.start.col, selectedRange.end.col);
    const maxCol = Math.max(selectedRange.start.col, selectedRange.end.col);
    const lines: string[] = [];
    for (let r = minRow; r <= maxRow; r++) {
      if (!sorted[r]) continue;
      const cells: string[] = [];
      for (let c = minCol; c <= maxCol; c++) {
        const col = COLUMNS[c];
        if (!col) continue;
        const val = (sorted[r] as any)[col.key];
        if (val === null || val === undefined || val === '') cells.push('');
        else if (col.key === 'date') cells.push(val);
        else if (['buy_value_new', 'buy_value_existing', 'team_cost', 'merch_cost', 'total_cost'].includes(col.key)) cells.push(String(Number(val) || 0));
        else cells.push(String(val));
      }
      lines.push(cells.join('\t'));
    }
    navigator.clipboard.writeText(lines.join('\n'));
  };

  const handleCellMouseDown = (rowIdx: number, colIdx: number) => {
    setIsSelecting(true);
    setSelectedRange({ start: { row: rowIdx, col: colIdx }, end: { row: rowIdx, col: colIdx } });
  };

  const handleCellMouseEnter = (rowIdx: number, colIdx: number) => {
    setHoveredCell({ row: rowIdx, col: colIdx });
    if (isSelecting && selectedRange) {
      setSelectedRange({ ...selectedRange, end: { row: rowIdx, col: colIdx } });
    }
  };

  const handleMouseUp = () => {
    setIsSelecting(false);
  };

  const isCellSelected = (rowIdx: number, colIdx: number) => {
    if (!selectedRange) return false;
    const minRow = Math.min(selectedRange.start.row, selectedRange.end.row);
    const maxRow = Math.max(selectedRange.start.row, selectedRange.end.row);
    const minCol = Math.min(selectedRange.start.col, selectedRange.end.col);
    const maxCol = Math.max(selectedRange.start.col, selectedRange.end.col);
    return rowIdx >= minRow && rowIdx <= maxRow && colIdx >= minCol && colIdx <= maxCol;
  };

  const numericCols = ['new_register', 'new_reg_purchased', 'existing_users', 'buy_value_new', 'buy_value_existing', 'team_cost', 'merch_cost', 'total_cost', 'footfall', 'step_in'];
  return (
    <div onMouseUp={handleMouseUp}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h2 style={{ fontSize: "18px", margin: 0 }}>Copy &amp; Paste</h2>
          <div style={{ fontSize: "12px", color: "var(--txt-sub)" }}>Select cells like Excel - drag to select range</div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button className="btn btn-ghost" onClick={handleCopySelected} disabled={!selectedRange}><i className="fa-solid fa-copy"></i> Copy Selected</button>
          <button className="btn btn-ghost" onClick={handleCopyAll}><i className="fa-solid fa-copy"></i> Copy All</button>
          <button className="btn btn-ghost" onClick={fetchData}><i className="fa-solid fa-rotate-right"></i> Refresh</button>
        </div>
      </div>
      <div className="card" style={{ marginBottom: "16px", padding: "12px 16px" }}>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ padding: "6px", fontSize: "12px", width: "auto" }} />
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ padding: "6px", fontSize: "12px", width: "auto" }} />
          <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} style={{ padding: "6px", fontSize: "12px", width: "auto" }}>
            <option>All Teams</option><option>KPV Team</option><option>Agency Team</option>
          </select>
          <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ padding: "6px 10px", fontSize: "12px", width: "180px", border: "1px solid var(--border)", borderRadius: "6px", background: "var(--input-bg)", color: "var(--txt-main)" }} />
          <button className="btn btn-ghost" onClick={() => { setStartDate(''); setEndDate(''); setTeamFilter('All Teams'); setSearchTerm(''); setSelectedRange(null); }} style={{ padding: "6px 12px", fontSize: "12px" }}><i className="fa-solid fa-xmark"></i> Clear</button>
          <span style={{ fontSize: "11px", color: "var(--txt-dim)", marginLeft: "auto" }}>{sorted.length} record{sorted.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto", maxHeight: "calc(100vh - 280px)", overflowY: "auto" }}>
          <table className="data-table" style={{ fontSize: "12px", borderCollapse: "collapse", minWidth: "1560px", width: "100%", tableLayout: "auto" }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
              <tr>
                <th style={{ background: "var(--surface-hover)", padding: "8px 12px", border: "1px solid var(--border)", textAlign: "center", fontWeight: 600, color: "var(--txt-dim)", fontSize: "10px", width: "40px" }}>#</th>
                {COLUMNS.map((col, _colIdx) => (
                  <th key={col.key} onClick={() => toggleSort(col.key)} style={{ background: "var(--surface-hover)", padding: "8px 12px", border: "1px solid var(--border)", textAlign: "left", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", minWidth: col.width, overflow: "hidden", textOverflow: "ellipsis", color: sortKey === col.key ? "var(--gold)" : "var(--txt-dim)", fontSize: "11px" }}>
                    {col.label} <i className={`fa-solid ${sortKey === col.key ? (sortDir === 'asc' ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort'}`} style={{ marginLeft: "4px", fontSize: "9px", opacity: sortKey === col.key ? 1 : 0.4 }}></i>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, rowIdx) => (
                <tr key={s.id} style={{ background: rowIdx % 2 === 0 ? "var(--surface)" : "var(--surface-hover)" }}>
                  <td style={{ padding: "6px 12px", border: "1px solid var(--border)", textAlign: "center", color: "var(--txt-dim)", fontSize: "10px", background: "var(--surface-hover)" }}>{rowIdx + 1}</td>
                  {COLUMNS.map((col, colIdx) => {
                    const isSelected = isCellSelected(rowIdx, colIdx);
                    const isHovered = hoveredCell?.row === rowIdx && hoveredCell?.col === colIdx;
                    return (
                      <td
                        key={col.key}
                        onMouseDown={(e) => { e.preventDefault(); handleCellMouseDown(rowIdx, colIdx); }}
                        onMouseEnter={() => handleCellMouseEnter(rowIdx, colIdx)}
                        style={{
                          padding: "6px 12px",
                          border: "1px solid var(--border)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          fontFamily: numericCols.includes(col.key) ? "var(--font-mono)" : "inherit",
                          textAlign: numericCols.includes(col.key) ? "right" : "left",
                          color: col.key === "merch_cost" ? "var(--gold)" : col.key === "total_cost" ? "var(--red)" : undefined,
                          background: isSelected ? "rgba(77, 158, 255, 0.2)" : isHovered ? "rgba(77, 158, 255, 0.08)" : undefined,
                          outline: isSelected ? "2px solid var(--blue)" : "none",
                          cursor: "cell",
                        }}
                      >
                        {formatValue(col.key, (s as any)[col.key])}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td colSpan={COLUMNS.length + 1} style={{ textAlign: "center", color: "var(--txt-dim)", padding: "40px" }}>{loading ? "Loading..." : "No records found"}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ marginTop: "12px", fontSize: "11px", color: "var(--txt-dim)", display: "flex", gap: "20px", flexWrap: "wrap" }}>
        <span><i className="fa-solid fa-mouse-pointer"></i> Click &amp; drag to select cells</span>
        <span><i className="fa-solid fa-keyboard"></i> Ctrl+C to copy selected</span>
        <span><i className="fa-solid fa-file-excel"></i> Paste to Sheets/Excel</span>
        <span><i className="fa-solid fa-arrow-down"></i> Click header to sort</span>
      </div>
    </div>
  );
}

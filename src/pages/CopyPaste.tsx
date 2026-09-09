import { useState, useEffect, useMemo, useRef } from 'react';
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
type Range = { start: { row: number; col: number }; end: { row: number; col: number } };

export default function CopyPaste() {
  const [submissions, setSubmissions] = useState<Submission[]>(genMockSubmissions);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [teamFilter, setTeamFilter] = useState('All Teams');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [searchTerm, setSearchTerm] = useState('');

  // Spreadsheet-style multi-selection state (rows are indexes into `sorted`)
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);
  const [ranges, setRanges] = useState<Range[]>([]);
  const [draftRange, setDraftRange] = useState<Range | null>(null);
  const [dragging, setDragging] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState('');
  const dragStartRef = useRef<{ row: number; col: number; ctrl: boolean } | null>(null);
  const didDragRef = useRef(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await fetchSubmissions();
    if (error) console.error('Error fetching submissions:', error);
    if (data && data.length > 0) setSubmissions(data);
    setLoading(false);
  };

  const rows = useMemo(
    () => submissions.map(s => ({ ...s, total_cost: (s.team_cost || 0) + (s.merch_cost || 0) })),
    [submissions]
  );

  const filtered = useMemo(
    () => rows.filter(s => {
      const inRange = (!startDate || s.date >= startDate) && (!endDate || s.date <= endDate);
      const inTeam = teamFilter === 'All Teams' || s.team === teamFilter || s.team === teamFilter.replace(' Team', '');
      const matchesSearch = !searchTerm || Object.values(s).some(v => String(v).toLowerCase().includes(searchTerm.toLowerCase()));
      return inRange && inTeam && matchesSearch;
    }),
    [rows, startDate, endDate, teamFilter, searchTerm]
  );

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => {
      const va = (a as any)[sortKey];
      const vb = (b as any)[sortKey];
      let cmp: number;
      if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
      else cmp = String(va || '').localeCompare(String(vb || ''));
      return sortDir === 'asc' ? cmp : -cmp;
    }),
    [filtered, sortKey, sortDir]
  );

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const formatValue = (key: string, value: any): string => {
    if (value === null || value === undefined || value === '') return '\u2014';
    switch (key) {
      case 'date': return labelDate(value);
      case 'team': return value || 'KPV';
      case 'branch': return String(value);
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
      default: return String(value);
    }
  };
// ── Spreadsheet helpers ──────────────────────────────────────────────
  const fmtRaw = (val: any, key: string): string => {
    if (val === null || val === undefined || val === '') return '';
    if (key === 'date') return String(val);
    if (['buy_value_new', 'buy_value_existing', 'team_cost', 'merch_cost', 'total_cost'].includes(key)) return String(Number(val) || 0);
    return String(val);
  };

  const cellInRange = (row: number, col: number, range: Range): boolean => {
    const r1 = Math.min(range.start.row, range.end.row), r2 = Math.max(range.start.row, range.end.row);
    const c1 = Math.min(range.start.col, range.end.col), c2 = Math.max(range.start.col, range.end.col);
    return row >= r1 && row <= r2 && col >= c1 && col <= c2;
  };

  const rowInRange = (row: number, range: Range): boolean =>
    row >= Math.min(range.start.row, range.end.row) && row <= Math.max(range.start.row, range.end.row);

  const isCellSelected = (row: number, col: number): boolean => {
    if (ranges.some(r => cellInRange(row, col, r))) return true;
    if (draftRange && cellInRange(row, col, draftRange)) return true;
    return false;
  };

  const isFullRowSelected = (row: number): boolean => COLUMNS.every((_, ci) => isCellSelected(row, ci));

  const countSelectedCells = (): number => {
    let n = 0;
    for (let rr = 0; rr < sorted.length; rr++)
      for (let cc = 0; cc < COLUMNS.length; cc++)
        if (isCellSelected(rr, cc)) n++;
    return n;
  };

  const buildCopyText = (): string => {
    const activeRanges = draftRange ? [...ranges, draftRange] : ranges;
    if (activeRanges.length === 0) return '';
    const cells = new Set<string>();
    let minRow = Infinity, maxRow = -Infinity;
    for (const r of activeRanges) {
      const r1 = Math.min(r.start.row, r.end.row), r2 = Math.max(r.start.row, r.end.row);
      const c1 = Math.min(r.start.col, r.end.col), c2 = Math.max(r.start.col, r.end.col);
      for (let rr = r1; rr <= r2; rr++) {
        for (let cc = c1; cc <= c2; cc++) {
          cells.add(`${rr},${cc}`);
          if (rr < minRow) minRow = rr;
          if (rr > maxRow) maxRow = rr;
        }
      }
    }
    // Group by row: each row outputs its selected column span (blanks in between)
    const lines: string[] = [];
    for (let rr = minRow; rr <= maxRow; rr++) {
      const colsInRow: number[] = [];
      for (let cc = 0; cc < COLUMNS.length; cc++) if (cells.has(`${rr},${cc}`)) colsInRow.push(cc);
      if (colsInRow.length === 0) continue;
      const cMin = Math.min(...colsInRow), cMax = Math.max(...colsInRow);
      const rowCells: string[] = [];
      for (let cc = cMin; cc <= cMax; cc++) {
        if (!cells.has(`${rr},${cc}`)) { rowCells.push(''); continue; }
        const col = COLUMNS[cc];
        const rowData = sorted[rr];
        rowCells.push(rowData ? fmtRaw((rowData as any)[col.key], col.key) : '');
      }
      lines.push(rowCells.join('\t'));
    }
    return lines.join('\n');
  };

  const doCopy = () => {
    const text = buildCopyText();
    if (!text) return;
    navigator.clipboard.writeText(text);
    const n = countSelectedCells();
    setCopiedMsg(`${n} cell${n !== 1 ? 's' : ''} copied — paste into Sheets/Excel`);
    setTimeout(() => setCopiedMsg(''), 2500);
  };

  const handleCopyAll = () => {
    const header = COLUMNS.map(c => c.label).join('\t');
    const lines = sorted.map(s => COLUMNS.map(c => fmtRaw((s as any)[c.key], c.key)).join('\t'));
    const text = [header, ...lines].join('\n');
    navigator.clipboard.writeText(text);
    setCopiedMsg(`${sorted.length} rows copied (with header) — paste into Sheets/Excel`);
    setTimeout(() => setCopiedMsg(''), 2500);
  };
const toggleCell = (row: number, col: number) => {
    setRanges(rs => {
      const exists = rs.some(r => cellInRange(row, col, r));
      return exists
        ? rs.filter(r => !cellInRange(row, col, r))
        : [...rs, { start: { row, col }, end: { row, col } }];
    });
  };

  const toggleRow = (row: number) => {
    const rowRange: Range = { start: { row, col: 0 }, end: { row, col: COLUMNS.length - 1 } };
    setRanges(rs => {
      const exists = rs.some(r => rowInRange(row, r));
      return exists ? rs.filter(r => !rowInRange(row, r)) : [...rs, rowRange];
    });
  };

  // ── Mouse handlers (Excel-like: drag = range, Ctrl+Click = add/toggle) ──
  const handleCellMouseDown = (rowIdx: number, colIdx: number, e: React.MouseEvent) => {
    e.preventDefault();
    const ctrl = e.ctrlKey || e.metaKey;
    dragStartRef.current = { row: rowIdx, col: colIdx, ctrl };
    didDragRef.current = false;
    setDragging(true);
    setDraftRange({ start: { row: rowIdx, col: colIdx }, end: { row: rowIdx, col: colIdx } });
    if (!ctrl) setRanges([{ start: { row: rowIdx, col: colIdx }, end: { row: rowIdx, col: colIdx } }]);
  };

  const handleCellMouseEnter = (rowIdx: number, colIdx: number) => {
    setHoveredCell({ row: rowIdx, col: colIdx });
    const ds = dragStartRef.current;
    if (!dragging || !ds || ds.col === -1) return;
    didDragRef.current = true;
    const r1 = Math.min(ds.row, rowIdx), r2 = Math.max(ds.row, rowIdx);
    const c1 = Math.min(ds.col, colIdx), c2 = Math.max(ds.col, colIdx);
    setDraftRange({ start: { row: r1, col: c1 }, end: { row: r2, col: c2 } });
  };

  const handleRowMouseDown = (rowIdx: number, e: React.MouseEvent) => {
    e.preventDefault();
    const ctrl = e.ctrlKey || e.metaKey;
    dragStartRef.current = { row: rowIdx, col: -1, ctrl };
    didDragRef.current = false;
    setDragging(true);
    const rowRange: Range = { start: { row: rowIdx, col: 0 }, end: { row: rowIdx, col: COLUMNS.length - 1 } };
    setDraftRange(rowRange);
    if (!ctrl) setRanges([rowRange]);
  };

  const handleRowMouseEnter = (rowIdx: number) => {
    const ds = dragStartRef.current;
    if (!dragging || !ds || ds.col !== -1) return;
    didDragRef.current = true;
    const r1 = Math.min(ds.row, rowIdx), r2 = Math.max(ds.row, rowIdx);
    const rowRange: Range = { start: { row: r1, col: 0 }, end: { row: r2, col: COLUMNS.length - 1 } };
    setDraftRange(rowRange);
    if (!ds.ctrl) setRanges([rowRange]);
  };

  const handleMouseUp = () => {
    if (!dragging) return;
    const ds = dragStartRef.current;
    if (ds) {
      if (!didDragRef.current) {
        // Simple click (no drag): Ctrl+Click toggles, plain click already committed on mousedown
        if (ds.ctrl) {
          if (ds.col === -1) toggleRow(ds.row);
          else toggleCell(ds.row, ds.col);
        }
      } else if (draftRange) {
        // Dragged a selection
        if (ds.ctrl) {
          setRanges(rs => {
            const dup = rs.some(r => JSON.stringify(r) === JSON.stringify(draftRange));
            return dup ? rs : [...rs, draftRange];
          });
        } else if (ds.col !== -1) {
          setRanges([draftRange]);
        }
        // Non-ctrl row drag is already applied live in handleRowMouseEnter
      }
    }
    setDragging(false);
    setDraftRange(null);
    didDragRef.current = false;
    dragStartRef.current = null;
  };

  // ── Keyboard: Ctrl+C copies custom selection, Escape clears it ─────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
        if (ranges.length > 0 || draftRange) {
          e.preventDefault();
          doCopy();
        }
        return;
      }
      if (e.key === 'Escape') {
        setRanges([]);
        setDraftRange(null);
        setCopiedMsg('');
      }
    };
    const onGlobalMouseUp = () => handleMouseUp();
    document.addEventListener('keydown', onKey);
    window.addEventListener('mouseup', onGlobalMouseUp);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('mouseup', onGlobalMouseUp);
    };
  });

  const numericCols = ['new_register', 'new_reg_purchased', 'existing_users', 'buy_value_new', 'buy_value_existing', 'team_cost', 'merch_cost', 'total_cost', 'footfall', 'step_in'];
return (
    <div onMouseUp={handleMouseUp}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '18px', margin: 0 }}>Copy &amp; Paste</h2>
          <div style={{ fontSize: '12px', color: 'var(--txt-sub)' }}>
            Select like Excel: <strong>drag</strong> = range, <strong>Ctrl+Click</strong> = multi-select, <strong>Ctrl+C</strong> = copy
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className="btn btn-ghost" onClick={doCopy} disabled={ranges.length === 0 && !draftRange} title="Ctrl+C also works">
            <i className="fa-solid fa-copy"></i> Copy Selected
          </button>
          <button className="btn btn-ghost" onClick={handleCopyAll} title="Copy all filtered rows with header">
            <i className="fa-solid fa-table"></i> Copy All
          </button>
          <button className="btn btn-ghost" onClick={fetchData}>
            <i className="fa-solid fa-rotate-right"></i> Refresh
          </button>
        </div>
      </div>

      {copiedMsg && (
        <div role="status" className="alert alert-ok" style={{ marginBottom: '12px', padding: '8px 12px', fontSize: '12px' }}>
          <i className="fa-solid fa-circle-check" aria-hidden="true"></i> {copiedMsg}
        </div>
      )}

      {/* Filters */}
      <div className="card" style={{ marginBottom: '16px', padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ padding: '6px', fontSize: '12px', width: 'auto' }} />
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ padding: '6px', fontSize: '12px', width: 'auto' }} />
          <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} style={{ padding: '6px', fontSize: '12px', width: 'auto' }}>
            <option>All Teams</option><option>KPV Team</option><option>Agency Team</option>
          </select>
          <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ padding: '6px 10px', fontSize: '12px', width: '180px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--input-bg)', color: 'var(--txt-main)' }} />
          <button className="btn btn-ghost" onClick={() => { setStartDate(''); setEndDate(''); setTeamFilter('All Teams'); setSearchTerm(''); setRanges([]); setDraftRange(null); }} style={{ padding: '6px 12px', fontSize: '12px' }}><i className="fa-solid fa-xmark"></i> Clear</button>
          <span style={{ fontSize: '11px', color: 'var(--txt-dim)', marginLeft: 'auto' }}>
            {sorted.length} record{sorted.length !== 1 ? 's' : ''} · {countSelectedCells()} selected
          </span>
        </div>
      </div>
{/* Spreadsheet-like table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' }}>
          <table className="data-table" style={{ fontSize: '12px', borderCollapse: 'collapse', minWidth: '1560px', width: '100%', tableLayout: 'auto' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr>
                <th style={{ background: 'var(--surface-hover)', padding: '8px 12px', border: '1px solid var(--border)', textAlign: 'center', fontWeight: 600, color: 'var(--txt-dim)', fontSize: '10px', width: '44px' }}>
                  #
                </th>
                {COLUMNS.map(col => (
                  <th key={col.key} onClick={() => toggleSort(col.key)} style={{ background: 'var(--surface-hover)', padding: '8px 12px', border: '1px solid var(--border)', textAlign: 'left', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', minWidth: col.width, overflow: 'hidden', textOverflow: 'ellipsis', color: sortKey === col.key ? 'var(--gold)' : 'var(--txt-dim)', fontSize: '11px' }}>
                    {col.label} <i className={`fa-solid ${sortKey === col.key ? (sortDir === 'asc' ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort'}`} style={{ marginLeft: '4px', fontSize: '9px', opacity: sortKey === col.key ? 1 : 0.4 }}></i>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, rowIdx) => {
                const rowSelected = isFullRowSelected(rowIdx);
                return (
                  <tr key={s.id} style={{ background: rowIdx % 2 === 0 ? 'var(--surface)' : 'var(--surface-hover)' }}>
                    {/* Row header (like Excel row numbers) */}
                    <td
                      onMouseDown={(e) => handleRowMouseDown(rowIdx, e)}
                      onMouseEnter={() => handleRowMouseEnter(rowIdx)}
                      style={{
                        padding: '6px 10px', border: '1px solid var(--border)', textAlign: 'center',
                        color: rowSelected ? '#fff' : 'var(--txt-dim)', fontSize: '10px',
                        background: rowSelected ? 'var(--blue)' : 'var(--surface-hover)',
                        cursor: 'pointer', userSelect: 'none', width: '44px',
                      }}
                      title="Click = select whole row · Ctrl+Click = add/remove row"
                    >
                      {rowIdx + 1}
                    </td>
                    {COLUMNS.map((col, colIdx) => {
                      const isSel = isCellSelected(rowIdx, colIdx);
                      const isHovered = hoveredCell?.row === rowIdx && hoveredCell?.col === colIdx;
                      return (
                        <td
                          key={col.key}
                          onMouseDown={(e) => handleCellMouseDown(rowIdx, colIdx, e)}
                          onMouseEnter={() => handleCellMouseEnter(rowIdx, colIdx)}
                          style={{
                            padding: '6px 12px', border: '1px solid var(--border)', whiteSpace: 'nowrap',
                            overflow: 'hidden', textOverflow: 'ellipsis',
                            fontFamily: numericCols.includes(col.key) ? 'var(--font-mono)' : 'inherit',
                            textAlign: numericCols.includes(col.key) ? 'right' : 'left',
                            color: col.key === 'merch_cost' ? 'var(--gold)' : col.key === 'total_cost' ? 'var(--red)' : undefined,
                            background: isSel ? 'rgba(77, 158, 255, 0.2)' : isHovered ? 'rgba(77, 158, 255, 0.08)' : undefined,
                            outline: isSel ? '2px solid var(--blue)' : 'none',
                            cursor: 'cell',
                          }}
                        >
                          {formatValue(col.key, (s as any)[col.key])}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr><td colSpan={COLUMNS.length + 1} style={{ textAlign: 'center', color: 'var(--txt-dim)', padding: '40px' }}>{loading ? 'Loading...' : 'No records found'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer hints */}
      <div style={{ marginTop: '12px', fontSize: '11px', color: 'var(--txt-dim)', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
        <span><i className="fa-solid fa-mouse-pointer"></i> Drag across cells to select a range</span>
        <span><i className="fa-solid fa-plus"></i> Ctrl+Click to add / remove selection</span>
        <span><i className="fa-solid fa-list-ol"></i> Click row number to select whole row</span>
        <span><i className="fa-solid fa-keyboard"></i> Ctrl+C to copy · Esc to clear</span>
        <span><i className="fa-solid fa-file-excel"></i> Paste to Sheets/Excel</span>
      </div>
    </div>
  );
}
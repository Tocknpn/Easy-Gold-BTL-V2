import { useState, useEffect, useMemo } from 'react';
import type { Submission } from '../lib/submissions';
import { fetchSubmissionsSummary, genMockSubmissions, fmtLAK, fmtLAKShort, labelDate, clearSubmissionsCache, totalCostOf, isMissingColumnError, MISSING_SPONSORSHIP_COLUMN_HINT, MISSING_PROD_COST_COLUMN_HINT } from '../lib/submissions';
import { supabase } from '../lib/supabase';

// ── Sortable columns (every header is sortable) ──────────────────────────
type SortKey = 'date' | 'team' | 'branch' | 'new_register' | 'buy_total' | 'merch_cost' | 'service_cost' | 'sponsorship_cost' | 'prod_cost' | 'total_cost' | 'cpa';

// Short header labels keep the 11-column table inside the card (the full name
// lives in `title`, used for the sort tooltip and the row-level inputs).
const COLUMNS: { key: SortKey; label: string; title: string }[] = [
  { key: 'date', label: 'Date', title: 'Date' },
  { key: 'team', label: 'Team', title: 'Team' },
  { key: 'branch', label: 'Branch', title: 'Branch / Location' },
  { key: 'new_register', label: 'Users (NC)', title: 'New Customers' },
  { key: 'buy_total', label: 'Buy Value', title: 'Buy Value (new + existing)' },
  { key: 'merch_cost', label: 'Merch (₭)', title: 'Merch Cost' },
  { key: 'service_cost', label: 'Service (₭)', title: 'Service Cost — editable, filled by Admin' },
  { key: 'sponsorship_cost', label: 'Spon (₭)', title: 'Sponsorship Cost — editable, filled by Admin' },
  { key: 'prod_cost', label: 'Prod (₭)', title: 'Production Cost — editable, filled by Admin' },
  { key: 'total_cost', label: 'Total Cost', title: 'Total Cost (service + merch + sponsorship + production)' },
  { key: 'cpa', label: 'CPA (preview)', title: 'CPA preview (Total Cost / New Customers)' },
];

// ── Export to CSV function ──────────────────────────────────────────────
const exportToCSV = (data: Submission[], filename: string) => {
  // CSV Header
  const headers = [
    'Date',
    'Team',
    'Branch',
    'New Customers',
    'Buy Value New',
    'Buy Value Existing',
    'Buy Value Total',
    'Merch Cost',
    'Service Cost',
    'Sponsorship Cost',
    'Production Cost',
    'Total Cost',
    'CPA',
    'Merch Items',
  ];

  // CSV Rows
  const rows = data.map(s => {
    const buyTotal = (s.buy_value_new || 0) + (s.buy_value_existing || 0);
    const totalCost = totalCostOf(s);
    const cpa = s.new_register > 0 ? Math.round(totalCost / s.new_register) : 0;
    
    // Parse merch items for detail
    let merchItemsDetail = '';
    try {
      const items = typeof s.merch_items === 'string' ? JSON.parse(s.merch_items) : s.merch_items;
      if (Array.isArray(items)) {
        merchItemsDetail = items.map((i: any) => `${i.name || 'Item'} x${i.qty || 0} @ ${(i.cpu || 0).toLocaleString()}LAK`).join('; ');
      }
    } catch {
      merchItemsDetail = '';
    }

    return [
      s.date,
      s.team || 'KPV',
      s.branch,
      s.new_register || 0,
      s.buy_value_new || 0,
      s.buy_value_existing || 0,
      buyTotal,
      s.merch_cost || 0,
      s.team_cost || 0,
      s.sponsorship_cost || 0,
      s.prod_cost || 0,
      totalCost,
      cpa,
      merchItemsDetail,
    ].map(v => `"${v}"`).join(',');
  });

  // Combine header and rows
  const csvContent = [headers.map(h => `"${h}"`).join(','), ...rows].join('\n');

  // Create download link
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

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
  // Pending edits: submission id → raw input string (lets admin fill many rows at once).
  // One independent draft map per editable cost column (service / sponsorship / production).
  const [serviceDrafts, setServiceDrafts] = useState<Record<string, string>>({});
  const [sponsorDrafts, setSponsorDrafts] = useState<Record<string, string>>({});
  const [prodDrafts, setProdDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    // Light scalar-only fetch — Cost Manager only reads cost/KPI columns.
    const { data, error } = await fetchSubmissionsSummary();
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
        case 'sponsorship_cost': return s.sponsorship_cost || 0; // ₭0 = not recorded yet
        case 'prod_cost': return s.prod_cost || 0; // ₭0 = not recorded yet
        case 'total_cost': return totalCostOf(s);
        case 'cpa': return s.new_register > 0 ? totalCostOf(s) / s.new_register : -Infinity;
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

  // ── Live totals for summary cards (drafts included) ───────────────────
  const totals = useMemo(() => {
    let service = 0, merch = 0, sponsorship = 0, prod = 0;
    for (const s of filtered) {
      service += Number(serviceDrafts[s.id] !== undefined ? (Number(serviceDrafts[s.id]) || 0) : s.team_cost) || 0;
      merch += s.merch_cost || 0;
      sponsorship += Number(sponsorDrafts[s.id] !== undefined ? (Number(sponsorDrafts[s.id]) || 0) : s.sponsorship_cost) || 0;
      prod += Number(prodDrafts[s.id] !== undefined ? (Number(prodDrafts[s.id]) || 0) : s.prod_cost) || 0;
    }
    return { service, merch, sponsorship, prod, combined: service + merch + sponsorship + prod };
  }, [filtered, serviceDrafts, sponsorDrafts, prodDrafts]);

  // ── Draft helpers (one pair per editable cost column) ─────────────────
  const getServiceDraftValue = (s: Submission) => (serviceDrafts[s.id] !== undefined ? serviceDrafts[s.id] : String(s.team_cost || 0));
  const getSponsorDraftValue = (s: Submission) => (sponsorDrafts[s.id] !== undefined ? sponsorDrafts[s.id] : String(s.sponsorship_cost || 0));
  const getProdDraftValue = (s: Submission) => (prodDrafts[s.id] !== undefined ? prodDrafts[s.id] : String(s.prod_cost || 0));
  const isServiceModified = (s: Submission) => serviceDrafts[s.id] !== undefined && (Number(serviceDrafts[s.id]) || 0) !== s.team_cost;
  const isSponsorModified = (s: Submission) => sponsorDrafts[s.id] !== undefined && (Number(sponsorDrafts[s.id]) || 0) !== s.sponsorship_cost;
  const isProdModified = (s: Submission) => prodDrafts[s.id] !== undefined && (Number(prodDrafts[s.id]) || 0) !== s.prod_cost;
  const isModified = (s: Submission) => isServiceModified(s) || isSponsorModified(s) || isProdModified(s);
  const pendingCount = sorted.filter(isModified).length;

  // Live Total Cost of a row — saved merchandising cost + all three draft inputs.
  const liveTotalCost = (s: Submission) =>
    totalCostOf({
      team_cost: Number(getServiceDraftValue(s)) || 0,
      merch_cost: s.merch_cost || 0,
      sponsorship_cost: Number(getSponsorDraftValue(s)) || 0,
      prod_cost: Number(getProdDraftValue(s)) || 0,
    });

  const setServiceDraft = (id: string, value: string) => setServiceDrafts(d => ({ ...d, [id]: value }));
  const setSponsorDraft = (id: string, value: string) => setSponsorDrafts(d => ({ ...d, [id]: value }));
  const setProdDraft = (id: string, value: string) => setProdDrafts(d => ({ ...d, [id]: value }));

  // ── Batch save: persist every edited Service / Sponsorship / Production cost ──
  const handleSaveAll = async () => {
    // One update per changed row — all three editable cost columns travel together.
    const updates = sorted.filter(isModified).map(s => ({
      id: s.id,
      team_cost: Math.max(0, Number(getServiceDraftValue(s)) || 0),
      sponsorship_cost: Math.max(0, Number(getSponsorDraftValue(s)) || 0),
      prod_cost: Math.max(0, Number(getProdDraftValue(s)) || 0),
    }));
    if (updates.length === 0) return;

    setSaving(true);
    let dbFailures = 0;
    let missingSponsor = false;
    let missingProd = false;
    const realIds = updates.filter(u => !u.id.startsWith('mock-'));
    if (supabase && realIds.length > 0) {
      for (const u of realIds) {
        const { error } = await supabase
          .from('submissions')
          .update({ team_cost: u.team_cost, sponsorship_cost: u.sponsorship_cost, prod_cost: u.prod_cost })
          .eq('id', u.id);
        if (error) {
          // Pre-migration database: still store the Service Cost (and whichever of
          // the two optional columns exists), then tell the admin which SQL
          // unlocks the missing cost column.
          const missing = isMissingColumnError(error, 'prod_cost') ? 'prod_cost'
            : isMissingColumnError(error, 'sponsorship_cost') ? 'sponsorship_cost'
            : null;
          if (missing === 'prod_cost') {
            missingProd = true;
            const retry = await supabase
              .from('submissions')
              .update({ team_cost: u.team_cost, sponsorship_cost: u.sponsorship_cost })
              .eq('id', u.id);
            if (retry.error) {
              dbFailures++;
              console.error('Cost Manager: failed to update submission', u.id, retry.error);
            }
          } else if (missing === 'sponsorship_cost') {
            missingSponsor = true;
            const retry = await supabase
              .from('submissions')
              .update({ team_cost: u.team_cost, prod_cost: u.prod_cost })
              .eq('id', u.id);
            if (retry.error) {
              dbFailures++;
              console.error('Cost Manager: failed to update submission', u.id, retry.error);
            }
          } else {
            dbFailures++;
            console.error('Cost Manager: failed to update submission', u.id, error);
          }
        }
      }
    }

    // Optimistic local update (covers demo/mock records too)
    const costMap = new Map(updates.map(u => [u.id, u]));
    setSubmissions(prev => prev.map(s => {
      const u = costMap.get(s.id);
      return u ? { ...s, team_cost: u.team_cost, sponsorship_cost: u.sponsorship_cost, prod_cost: u.prod_cost } : s;
    }));
    setServiceDrafts({});
    setSponsorDrafts({});
    setProdDrafts({});
    setSaving(false);
    // Drop the egress caches so every other page refetches the new costs
    // (otherwise the 5/10-minute cache would keep showing the old numbers).
    if (realIds.length > 0) clearSubmissionsCache();

    if (missingSponsor || missingProd) {
      const hints = [missingSponsor ? MISSING_SPONSORSHIP_COLUMN_HINT : '', missingProd ? MISSING_PROD_COST_COLUMN_HINT : '']
        .filter(Boolean).join('\n\n');
      const dropped = [missingSponsor ? 'Sponsorship Cost' : '', missingProd ? 'Production Cost' : ''].filter(Boolean).join(' and ');
      window.alert(`${hints}\n\nSaved ${updates.length - dbFailures}/${updates.length} record(s): Service Cost was stored, the ${dropped} was not.`);
    } else if (dbFailures > 0 && realIds.length > 0) {
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
            onClick={() => { setServiceDrafts({}); setSponsorDrafts({}); setProdDrafts({}); }}
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
      {loading && <div style={{ padding: '10px' }}>Loading submission records…</div>}

      {/* Summary cards — one per cost source (service / merch / sponsorship /
          production) + the combined Total Cost. Wraps instead of overflowing. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        <div className="card" style={{ borderTop: '4px solid var(--red)' }}>
          <div style={{ fontSize: '12px', color: 'var(--txt-sub)', marginBottom: '6px' }}>Total Service Cost (Team)</div>
          <div style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{fmtLAKShort(totals.service)}</div>
          <div style={{ fontSize: '10px', color: 'var(--txt-dim)', marginTop: '4px' }}>{filtered.length} records in range</div>
        </div>
        <div className="card" style={{ borderTop: '4px solid var(--gold)' }}>
          <div style={{ fontSize: '12px', color: 'var(--txt-sub)', marginBottom: '6px' }}>Total Merch Cost</div>
          <div style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{fmtLAKShort(totals.merch)}</div>
          <div style={{ fontSize: '10px', color: 'var(--txt-dim)', marginTop: '4px' }}>filled by staff on submission</div>
        </div>
        <div className="card" style={{ borderTop: '4px solid var(--blue)' }}>
          <div style={{ fontSize: '12px', color: 'var(--txt-sub)', marginBottom: '6px' }}>Total Sponsorship Cost</div>
          <div style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{fmtLAKShort(totals.sponsorship)}</div>
          <div style={{ fontSize: '10px', color: 'var(--txt-dim)', marginTop: '4px' }}>
            {filtered.filter(s => (Number(sponsorDrafts[s.id] !== undefined ? Number(sponsorDrafts[s.id]) || 0 : s.sponsorship_cost) || 0) > 0).length} of {filtered.length} records filled
          </div>
        </div>
        <div className="card" style={{ borderTop: '4px solid #3ECFCF' }}>
          <div style={{ fontSize: '12px', color: 'var(--txt-sub)', marginBottom: '6px' }}>Total Production Cost</div>
          <div style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{fmtLAKShort(totals.prod)}</div>
          <div style={{ fontSize: '10px', color: 'var(--txt-dim)', marginTop: '4px' }}>
            {filtered.filter(s => (Number(prodDrafts[s.id] !== undefined ? Number(prodDrafts[s.id]) || 0 : s.prod_cost) || 0) > 0).length} of {filtered.length} records filled
          </div>
        </div>
        <div className="card" style={{ borderTop: '4px solid var(--txt-main)' }}>
          <div style={{ fontSize: '12px', color: 'var(--txt-sub)', marginBottom: '6px' }}>Combined Operational Cost</div>
          <div style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{fmtLAKShort(totals.combined)}</div>
          <div style={{ fontSize: '10px', color: 'var(--txt-dim)', marginTop: '4px' }}>service + merch + sponsorship + prod</div>
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
          <button
            className="btn btn-ghost"
            onClick={() => {
              const now = new Date();
              const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
              exportToCSV(sorted, `CostManager_Export_${dateStr}.csv`);
            }}
            style={{ padding: '7px 12px', fontSize: '12px' }}
            title="Export filtered records to Excel (full numbers)"
          >
            <i className="fa-solid fa-file-excel"></i> Export Excel
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

        <div className="table-scroll">
        <table className="data-table compact">
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
                  title={`Sort by ${col.title}`}
                  style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', color: col.key === 'service_cost' || col.key === 'sponsorship_cost' || col.key === 'prod_cost' ? 'var(--gold)' : undefined }}
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
              const sponsorModified = isSponsorModified(s);
              const prodModified = isProdModified(s);
              const total = liveTotalCost(s);
              const cpa = s.new_register > 0 ? total / s.new_register : NaN;
              return (
                <tr key={s.id} style={modified ? { background: 'var(--gold-dim)' } : undefined}>
                  <td style={{ whiteSpace: 'nowrap' }}>{labelDate(s.date)}</td>
                  <td><span className={`pill ${s.team === 'Agency' ? 'pill-blue' : 'pill-gold'}`}>{s.team || 'KPV'}</span></td>
                  <td>{s.branch}</td>
                  <td style={{ color: 'var(--gold)', fontWeight: 700 }}>{(s.new_register || 0).toLocaleString()}</td>
                  <td>{fmtLAKShort(buyTotal(s))}</td>
                  <td>{fmtLAK(s.merch_cost)}</td>
                  <td>
                    <CostInput
                      value={getServiceDraftValue(s)}
                      onChange={(val: string) => setServiceDraft(s.id, val)}
                      title="Fill the team operating (service) cost for this day"
                      style={{
                        width: '104px',
                        padding: '6px 10px',
                        fontSize: '12px',
                        fontFamily: 'var(--font-mono)',
                        textAlign: 'right',
                        border: Number(getServiceDraftValue(s)) > 0 ? '1px solid var(--green)' : '1px solid var(--red)',
                        background: modified ? 'var(--input-bg)' : undefined,
                      }}
                    />
                  </td>
                  <td>
                    <CostInput
                      value={getSponsorDraftValue(s)}
                      onChange={(val: string) => setSponsorDraft(s.id, val)}
                      title="Fill the sponsorship cost for this day (blank = not recorded)"
                      style={{
                        width: '104px',
                        padding: '6px 10px',
                        fontSize: '12px',
                        fontFamily: 'var(--font-mono)',
                        textAlign: 'right',
                        border: Number(getSponsorDraftValue(s)) > 0 ? '1px solid var(--green)' : '1px dashed var(--border)',
                        background: sponsorModified ? 'var(--input-bg)' : undefined,
                      }}
                    />
                  </td>
                  <td>
                    <CostInput
                      value={getProdDraftValue(s)}
                      onChange={(val: string) => setProdDraft(s.id, val)}
                      title="Fill the production cost for this day (blank = not recorded)"
                      style={{
                        width: '104px',
                        padding: '6px 10px',
                        fontSize: '12px',
                        fontFamily: 'var(--font-mono)',
                        textAlign: 'right',
                        border: Number(getProdDraftValue(s)) > 0 ? '1px solid var(--green)' : '1px dashed var(--border)',
                        background: prodModified ? 'var(--input-bg)' : undefined,
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
                <td colSpan={COLUMNS.length} style={{ textAlign: 'center', color: 'var(--txt-dim)', padding: '24px' }}>
                  No submission records in this range — {loading ? 'loading…' : 'try widening the dates or clearing filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>

        <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border)', fontSize: '11px', color: 'var(--txt-dim)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <span><i className="fa-solid fa-lightbulb" style={{ color: 'var(--gold)' }}></i> Tip: fill several <strong>Service Cost</strong>, <strong>Sponsorship Cost</strong> and <strong>Production Cost</strong> boxes, then press <strong>Save Changes</strong> once — everything is written together and all four cost sources feed CPA / CPO / CPAO.</span>
          <span>{sorted.length} record{sorted.length !== 1 ? 's' : ''} shown</span>
        </div>
      </div>
    </div>
  );
}

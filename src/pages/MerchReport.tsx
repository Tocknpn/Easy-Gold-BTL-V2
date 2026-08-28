import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { fmtLAK, fmtLAKShort, getCurrentDateHelpers } from '../lib/submissions';

interface MerchRow {
  name: string;
  cpu: number;
  totalQty: number;
  totalCost: number;
}

export default function MerchReport() {
  const { startOfMonth, endOfMonth } = getCurrentDateHelpers();
  const [from, setFrom] = useState(startOfMonth);
  const [to, setTo] = useState(endOfMonth);
  const [teamFilter, setTeamFilter] = useState('All Teams');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<MerchRow[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from('submissions')
        .select('team, merch_items')
        .gte('date', from)
        .lte('date', to);

      if (teamFilter === 'KPV Team') q = q.eq('team', 'KPV');
      else if (teamFilter === 'Agency Team') q = q.eq('team', 'Agency');

      const { data, error } = await q;
      if (error) throw error;

      // Aggregate merch_items across all submissions
      const acc: Record<string, { cpu: number; totalQty: number; totalCost: number }> = {};

      for (const sub of data || []) {
        let items: any[] = [];
        try {
          items = typeof sub.merch_items === 'string'
            ? JSON.parse(sub.merch_items)
            : (sub.merch_items || []);
        } catch { continue; }

        for (const item of items) {
          const name = item.name || '';
          const qty = Number(item.qty) || 0;
          const cpu = Number(item.cpu) || 0;
          if (!name || qty === 0) continue;
          if (!acc[name]) acc[name] = { cpu, totalQty: 0, totalCost: 0 };
          acc[name].totalQty += qty;
          acc[name].totalCost += qty * cpu;
          if (cpu > 0) acc[name].cpu = cpu;
        }
      }

      const sorted = Object.entries(acc)
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.totalQty - a.totalQty);

      setRows(sorted);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err: any) {
      console.error('MerchReport fetch error:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [from, to, teamFilter]);

  const totalUnits = useMemo(() => rows.reduce((a, r) => a + r.totalQty, 0), [rows]);
  const totalCost = useMemo(() => rows.reduce((a, r) => a + r.totalCost, 0), [rows]);
  const topItem = rows[0]?.name ?? '—';

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ padding: '7px', fontSize: '12px', width: 'auto' }} />
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ padding: '7px', fontSize: '12px', width: 'auto' }} />
          <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} style={{ padding: '7px', fontSize: '12px', width: 'auto' }}>
            <option>All Teams</option>
            <option>KPV Team</option>
            <option>Agency Team</option>
          </select>
          <button className="btn btn-ghost" onClick={fetchData} style={{ fontSize: '12px', padding: '7px 14px' }}>
            <i className="fa-solid fa-rotate-right"></i> Refresh
          </button>
        </div>
        {lastUpdated && <span style={{ fontSize: '11px', color: 'var(--txt-dim)' }}>Last updated: {lastUpdated}</span>}
      </div>

      {/* KPI cards */}
      <div className="grid-3" style={{ marginBottom: '20px' }}>
        <div className="card">
          <div style={{ fontSize: '12px', color: 'var(--txt-sub)', marginBottom: '6px' }}>Top Merch Item</div>
          <div style={{ fontSize: '20px', color: 'var(--gold)', fontWeight: 700 }}>
            {loading ? '...' : topItem}
          </div>
        </div>
        <div className="card">
          <div style={{ fontSize: '12px', color: 'var(--txt-sub)', marginBottom: '6px' }}>Total Units Distributed</div>
          <div style={{ fontSize: '22px', fontWeight: 700 }}>
            {loading ? '...' : totalUnits.toLocaleString()}
          </div>
        </div>
        <div className="card">
          <div style={{ fontSize: '12px', color: 'var(--txt-sub)', marginBottom: '6px' }}>Total Merch Cost</div>
          <div style={{ fontSize: '22px', color: 'var(--green)', fontWeight: 700 }}>
            {loading ? '...' : fmtLAKShort(totalCost)}
          </div>
        </div>
      </div>

      {/* Breakdown table */}
      <div className="card">
        <h3 style={{ marginBottom: '16px', fontSize: '15px' }}>Merchandise Distribution Breakdown</h3>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--txt-dim)' }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '8px' }}></i>Loading…
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--txt-dim)' }}>
            No merch data found for the selected period.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>ITEM NAME</th>
                <th>TOTAL UNITS</th>
                <th>COST PER UNIT</th>
                <th>TOTAL COST</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{row.totalQty.toLocaleString()}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{fmtLAK(row.cpu)}</td>
                  <td style={{ color: 'var(--green)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{fmtLAK(row.totalCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}


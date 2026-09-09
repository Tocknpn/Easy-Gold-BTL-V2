import { useEffect, useMemo, useState } from 'react';
import { fetchAuditLogs } from '../lib/workflow';
import type { AuditLogRow } from '../lib/workflow';

const fmtTime = (t: string) => {
  if (!t) return '—';
  const d = new Date(t);
  return isNaN(d.getTime()) ? t : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const statusPill = (s: string) => {
  const v = (s || 'success').toLowerCase();
  if (v === 'error' || v === 'failed' || v === 'fail') return 'pill-red';
  if (v === 'warning' || v === 'warn' || v === 'pending') return 'pill-gold';
  return 'pill-green';
};

const actionPill = (a: string) => {
  const v = (a || '').toLowerCase();
  if (v.includes('user') || v.includes('delete')) return 'pill-red';
  if (v.includes('merch') || v.includes('staff')) return 'pill-gold';
  return 'pill-blue';
};

export default function AuditLog() {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    setLogs(await fetchAuditLogs(1000));
    setLoading(false);
  };

  const statuses = useMemo(
    () => Array.from(new Set(logs.map(l => (l.status || 'success').toLowerCase()))).sort(),
    [logs]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter(l => {
      if (statusFilter && (l.status || 'success').toLowerCase() !== statusFilter) return false;
      if (!q) return true;
      const hay = `${l.user_name} ${l.action} ${l.team} ${JSON.stringify(l.payload ?? '')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [logs, search, statusFilter]);

  const exportCSV = () => {
    if (filtered.length === 0) return;
    const header = 'timestamp,user_name,team,action,status,payload';
    const rows = filtered.map(l => {
      const payload = typeof l.payload === 'string' ? l.payload : JSON.stringify(l.payload || '');
      return [l.timestamp, l.user_name, l.team, l.action, l.status, payload]
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(',');
    });
    const blob = new Blob(['\ufeff' + header + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <span style={{ color: 'var(--gold)', fontSize: '18px' }}><i className="fa-solid fa-list-ul"></i></span>
        <h2 style={{ margin: 0, fontSize: '15px' }}>Audit Log</h2>
      </div>
      <div style={{ fontSize: '11px', color: 'var(--txt-dim)', marginBottom: '16px' }}>
        System-generated trail of sensitive actions (user management, staff, targets, routes, merch). Written to the <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }}>audit_log</span> table.
      </div>

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
        <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search action, user, team, details…" style={{ flex: 1, minWidth: '220px' }} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: '160px' }}>
          <option value="">All statuses</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="btn btn-ghost" onClick={load} style={{ padding: '10px 14px' }}>
          <i className="fa-solid fa-rotate-right"></i> Refresh
        </button>
        <button className="btn btn-ghost" onClick={exportCSV} disabled={filtered.length === 0} style={{ padding: '10px 14px', opacity: filtered.length === 0 ? 0.5 : 1 }}>
          <i className="fa-solid fa-file-csv"></i> Export CSV
        </button>
      </div>

      <table className="data-table">
        <thead>
          <tr><th>Time</th><th>User</th><th>Team</th><th>Action</th><th>Status</th><th>Details</th></tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} style={{ color: 'var(--txt-dim)', textAlign: 'center', padding: '20px' }}>
              <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '8px' }}></i>Loading audit log…
            </td></tr>
          ) : (
            filtered.map(l => (
              <tr key={l.id}>
                <td style={{ whiteSpace: 'nowrap', fontSize: '11px', color: 'var(--txt-sub)' }}>{fmtTime(l.timestamp)}</td>
                <td>{l.user_name || '—'}</td>
                <td>{l.team || '—'}</td>
                <td>
                  <span className={`pill ${actionPill(l.action)}`} style={{ fontFamily: 'var(--font-mono)' }}>{l.action || '—'}</span>
                </td>
                <td><span className={`pill ${statusPill(l.status)}`}>{l.status || 'success'}</span></td>
                <td style={{ maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--txt-sub)' }} title={JSON.stringify(l.payload ?? '')}>
                  {JSON.stringify(l.payload ?? '')}
                </td>
              </tr>
            ))
          )}
          {!loading && filtered.length === 0 && (
            <tr><td colSpan={6} style={{ color: 'var(--txt-dim)', textAlign: 'center', padding: '20px' }}>
              {logs.length === 0
                ? 'No audit logs recorded yet. Actions performed inside this page (users, staff, targets, routes, merch) will appear here.'
                : 'No entries match your search / filter.'}
            </td></tr>
          )}
        </tbody>
      </table>

      <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--txt-dim)' }}>
        Showing <strong>{filtered.length}</strong> of <strong>{logs.length}</strong> logged action(s).
      </div>
    </div>
  );
}
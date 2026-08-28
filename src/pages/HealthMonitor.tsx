import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';

// ── Stored ping record ─────────────────────────────────────────────────────
interface PingRecord {
  ts: number;          // unix ms
  ok: boolean;
  ms: number;          // response time
  error?: string;
}

const STORAGE_KEY = 'eg_health_log';
const MAX_RECORDS = 100;

function loadLog(): PingRecord[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}
function saveLog(log: PingRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(log.slice(-MAX_RECORDS)));
}

// ── Sparkline SVG ─────────────────────────────────────────────────────────
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const w = 200, h = 40, pad = 4;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - (v / max) * (h - pad * 2);
    return `${x},${y}`;
  });
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Uptime bar — coloured blocks ────────────────────────────────────────────
function UptimeBar({ log }: { log: PingRecord[] }) {
  const last40 = log.slice(-40);
  return (
    <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end', height: '28px' }}>
      {last40.map((p, i) => (
        <div
          key={i}
          title={`${new Date(p.ts).toLocaleTimeString()} — ${p.ok ? `${p.ms}ms` : `Error: ${p.error}`}`}
          style={{
            flex: 1,
            height: p.ok ? `${Math.min(100, Math.max(20, 100 - p.ms / 20))}%` : '100%',
            borderRadius: '2px',
            background: p.ok ? (p.ms < 300 ? 'var(--green)' : p.ms < 800 ? '#F59E0B' : 'var(--red)') : 'var(--red)',
            opacity: 0.85,
          }}
        />
      ))}
      {last40.length === 0 && (
        <span style={{ fontSize: '11px', color: 'var(--txt-dim)' }}>No data yet — waiting for first ping…</span>
      )}
    </div>
  );
}

export default function HealthMonitor() {
  const [log, setLog] = useState<PingRecord[]>(loadLog);
  const [pinging, setPinging] = useState(false);
  const [interval, setIntervalSec] = useState(30);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [webVitals, setWebVitals] = useState<Record<string, number | null>>({ lcp: null, fid: null, cls: null });

  // ── Collect Web Vitals via PerformanceObserver ─────────────────────────
  useEffect(() => {
    if (typeof PerformanceObserver === 'undefined') return;
    try {
      // LCP
      const lcpObs = new PerformanceObserver(list => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1] as any;
        setWebVitals(v => ({ ...v, lcp: Math.round(last.startTime) }));
      });
      lcpObs.observe({ type: 'largest-contentful-paint', buffered: true });

      // CLS
      let clsVal = 0;
      const clsObs = new PerformanceObserver(list => {
        for (const entry of list.getEntries() as any[]) {
          if (!entry.hadRecentInput) clsVal += entry.value;
        }
        setWebVitals(v => ({ ...v, cls: Math.round(clsVal * 1000) / 1000 }));
      });
      clsObs.observe({ type: 'layout-shift', buffered: true });

      return () => { lcpObs.disconnect(); clsObs.disconnect(); };
    } catch { /* not supported */ }
  }, []);

  // ── Ping Supabase ─────────────────────────────────────────────────────
  const doPing = async () => {
    setPinging(true);
    const t0 = Date.now();
    let record: PingRecord;
    try {
      const { error } = await supabase
        .from('submissions')
        .select('id')
        .limit(1)
        .single();
      // PGRST116 = "no rows" = still connected OK
      const ms = Date.now() - t0;
      record = { ts: t0, ok: !error || error.code === 'PGRST116', ms, error: error?.message };
    } catch (e: any) {
      record = { ts: t0, ok: false, ms: Date.now() - t0, error: e.message };
    }
    setLog(prev => {
      const next = [...prev, record].slice(-MAX_RECORDS);
      saveLog(next);
      return next;
    });
    setPinging(false);
  };

  // ── Auto-ping timer ──────────────────────────────────────────────────
  useEffect(() => {
    doPing(); // immediate on mount
    const schedule = () => {
      timerRef.current = setTimeout(() => { doPing(); schedule(); }, interval * 1000);
    };
    schedule();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval]);

  // ── Computed stats ─────────────────────────────────────────────────────
  const total = log.length;
  const okCount = log.filter(p => p.ok).length;
  const uptimePct = total > 0 ? ((okCount / total) * 100).toFixed(1) : '—';
  const avgMs = total > 0 ? Math.round(log.filter(p => p.ok).reduce((a, b) => a + b.ms, 0) / Math.max(okCount, 1)) : 0;
  const last = log[log.length - 1];
  const responseTimes = log.filter(p => p.ok).map(p => p.ms);
  const errors = log.filter(p => !p.ok).slice(-10).reverse();

  const statusColor = !last ? '#9CA3AF'
    : !last.ok ? 'var(--red)'
    : last.ms < 300 ? 'var(--green)'
    : last.ms < 800 ? '#F59E0B'
    : 'var(--red)';

  const statusText = !last ? 'Waiting…'
    : !last.ok ? '● Unreachable'
    : last.ms < 300 ? '● Healthy'
    : last.ms < 800 ? '● Slow'
    : '● Very Slow';

  return (
    <div>
      {/* Header status bar */}
      <div className="demo-banner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>
          <i className="fa-solid fa-heart-pulse"></i>&nbsp;
          <strong>Health Monitor</strong> — auto-pinging Supabase every {interval}s. Logs stored locally (last {MAX_RECORDS}).
        </span>
        <span style={{ fontWeight: 800, color: statusColor }}>{statusText}</span>
      </div>

      {/* KPI Row */}
      <div className="grid-4" style={{ marginBottom: '20px' }}>
        <div className="card kpi-card" style={{ borderTopColor: statusColor }}>
          <div className="kpi-label">Status</div>
          <div className="kpi-val" style={{ fontSize: '18px', color: statusColor }}>
            {!last ? '—' : last.ok ? 'Online' : 'Offline'}
          </div>
          <div className="kpi-sub">{last ? `${last.ms}ms · ${new Date(last.ts).toLocaleTimeString()}` : 'Waiting…'}</div>
        </div>

        <div className="card kpi-card green">
          <div className="kpi-label" style={{ color: 'var(--green)' }}>Uptime</div>
          <div className="kpi-val" style={{ color: 'var(--green)' }}>{uptimePct}%</div>
          <div className="kpi-sub">{okCount} / {total} pings OK</div>
        </div>

        <div className="card kpi-card blue">
          <div className="kpi-label" style={{ color: 'var(--blue)' }}>Avg Response</div>
          <div className="kpi-val" style={{ color: 'var(--blue)' }}>{avgMs}ms</div>
          <div className="kpi-sub">{responseTimes.length} successful pings</div>
        </div>

        <div className="card kpi-card red">
          <div className="kpi-label" style={{ color: 'var(--red)' }}>Errors</div>
          <div className="kpi-val" style={{ color: 'var(--red)' }}>{total - okCount}</div>
          <div className="kpi-sub">{total > 0 ? (100 - parseFloat(uptimePct)).toFixed(1) : '0'}% failure rate</div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: '20px' }}>
        {/* Uptime bar + sparkline */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '14px', margin: 0 }}>Connection History</h3>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', color: 'var(--txt-dim)' }}>Ping interval:</span>
              {[15, 30, 60].map(s => (
                <button
                  key={s}
                  className="btn btn-ghost"
                  onClick={() => setIntervalSec(s)}
                  style={{
                    padding: '2px 8px', fontSize: '10px',
                    background: interval === s ? 'var(--blue-dim)' : undefined,
                    color: interval === s ? 'var(--blue)' : undefined,
                    borderColor: interval === s ? 'var(--blue)' : undefined,
                  }}
                >{s}s</button>
              ))}
              <button
                className="btn btn-ghost"
                onClick={doPing}
                disabled={pinging}
                style={{ padding: '2px 10px', fontSize: '10px' }}
              >
                {pinging ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-rotate-right"></i>}
              </button>
            </div>
          </div>

          {/* Uptime blocks */}
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '10px', color: 'var(--txt-dim)', marginBottom: '5px' }}>
              Last 40 checks &nbsp;
              <span style={{ color: 'var(--green)' }}>■ Fast</span>&nbsp;
              <span style={{ color: '#F59E0B' }}>■ Slow</span>&nbsp;
              <span style={{ color: 'var(--red)' }}>■ Error</span>
            </div>
            <UptimeBar log={log} />
          </div>

          {/* Response time sparkline */}
          <div style={{ marginTop: '16px' }}>
            <div style={{ fontSize: '10px', color: 'var(--txt-dim)', marginBottom: '4px' }}>Response time (ms)</div>
            <Sparkline data={responseTimes.slice(-40)} color="var(--blue)" />
          </div>
        </div>

        {/* Web Vitals */}
        <div className="card">
          <h3 style={{ fontSize: '14px', marginBottom: '14px' }}>
            <i className="fa-solid fa-gauge-high" style={{ color: 'var(--accent)', marginRight: '8px' }}></i>
            Core Web Vitals
          </h3>

          {[
            {
              key: 'lcp', label: 'LCP — Largest Contentful Paint',
              val: webVitals.lcp !== null ? `${webVitals.lcp}ms` : '—',
              good: webVitals.lcp !== null && webVitals.lcp < 2500,
              warn: webVitals.lcp !== null && webVitals.lcp >= 2500 && webVitals.lcp < 4000,
              desc: 'Good < 2.5s',
            },
            {
              key: 'cls', label: 'CLS — Cumulative Layout Shift',
              val: webVitals.cls !== null ? String(webVitals.cls) : '—',
              good: webVitals.cls !== null && webVitals.cls < 0.1,
              warn: webVitals.cls !== null && webVitals.cls >= 0.1 && webVitals.cls < 0.25,
              desc: 'Good < 0.1',
            },
          ].map(({ key, label, val, good, warn, desc }) => {
            const color = val === '—' ? 'var(--txt-dim)' : good ? 'var(--green)' : warn ? '#F59E0B' : 'var(--red)';
            const badge = val === '—' ? '—' : good ? 'Good' : warn ? 'Needs Work' : 'Poor';
            return (
              <div key={key} style={{ marginBottom: '14px', padding: '12px', background: 'var(--ink)', borderRadius: '8px' }}>
                <div style={{ fontSize: '10px', color: 'var(--txt-dim)', marginBottom: '4px' }}>{label}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '22px', fontWeight: 800, fontFamily: 'var(--font-mono)', color }}>
                    {val}
                  </span>
                  <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: color + '22', color }}>
                    {badge}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--txt-dim)', marginLeft: 'auto' }}>{desc}</span>
                </div>
              </div>
            );
          })}

          <div style={{ padding: '12px', background: 'var(--ink)', borderRadius: '8px', marginBottom: '14px' }}>
            <div style={{ fontSize: '10px', color: 'var(--txt-dim)', marginBottom: '6px' }}>
              ℹ️ Full analytics available on Cloudflare Dashboard → Web Analytics
            </div>
            <a
              href="https://dash.cloudflare.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost"
              style={{ fontSize: '11px', padding: '5px 12px' }}
            >
              <i className="fa-solid fa-arrow-up-right-from-square"></i> Open Cloudflare Dashboard
            </a>
          </div>

          <div style={{ fontSize: '10px', color: 'var(--txt-dim)', fontStyle: 'italic' }}>
            CLS source: {`#sidebar>nav>div.nav-group`} (known layout shift — being fixed)
          </div>
        </div>
      </div>

      {/* Error log */}
      {errors.length > 0 && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <h3 style={{ fontSize: '14px', marginBottom: '12px', color: 'var(--red)' }}>
            <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: '8px' }}></i>
            Recent Errors
          </h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Response (ms)</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {errors.map((e, i) => (
                <tr key={i}>
                  <td>{new Date(e.ts).toLocaleString()}</td>
                  <td style={{ color: 'var(--red)' }}>{e.ms}ms</td>
                  <td style={{ color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{e.error || 'Network error'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Full ping log */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '14px', margin: 0 }}>Ping Log (last {Math.min(log.length, 20)})</h3>
          <button
            className="btn btn-ghost"
            onClick={() => { localStorage.removeItem(STORAGE_KEY); setLog([]); }}
            style={{ padding: '4px 12px', fontSize: '11px', color: 'var(--red)', borderColor: 'var(--red-dim)' }}
          >
            <i className="fa-solid fa-trash"></i> Clear log
          </button>
        </div>
        <table className="data-table">
          <thead>
            <tr><th>Time</th><th>Status</th><th>Response</th><th>Note</th></tr>
          </thead>
          <tbody>
            {[...log].reverse().slice(0, 20).map((p, i) => (
              <tr key={i}>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                  {new Date(p.ts).toLocaleString()}
                </td>
                <td>
                  <span className={`pill ${p.ok ? 'pill-green' : 'pill-red'}`}>
                    {p.ok ? '✓ OK' : '✕ FAIL'}
                  </span>
                </td>
                <td style={{
                  fontFamily: 'var(--font-mono)',
                  color: p.ms < 300 ? 'var(--green)' : p.ms < 800 ? '#F59E0B' : 'var(--red)',
                }}>
                  {p.ms}ms
                </td>
                <td style={{ fontSize: '11px', color: 'var(--txt-dim)' }}>
                  {p.error && p.error !== 'No rows found' ? p.error : '—'}
                </td>
              </tr>
            ))}
            {log.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--txt-dim)', padding: '24px' }}>
                No pings yet…
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

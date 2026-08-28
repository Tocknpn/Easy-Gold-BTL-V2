import { useState, useEffect, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';
import type { ModalState, Submission } from '../lib/submissions';
import { fetchSubmissions, genMockSubmissions, fmtLAK, fmtLAKShort, labelDate, getCurrentDateHelpers } from '../lib/submissions';
import SubmissionModal from '../components/SubmissionModal';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend);

// ── KPI targets (absolute values) ─────────────────────────────────────────
const TARGETS = {
  acq: 2500,          // Total Acquisition target
  cpa: 100_000,       // Cost per NC target (lower is better)
  cpo: 60_000,        // Cost per Buyer target
  cpao: 130_000,      // Cost per Acq. Order target
};

// ── Utility: % change helper ───────────────────────────────────────────────
const pctChange = (curr: number, prev: number): number | null => {
  if (!prev || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
};

// ── Utility: formatted % change badge ────────────────────────────────────
function DeltaBadge({ curr, prev, invertGood = false }: { curr: number; prev: number; invertGood?: boolean }) {
  const chg = pctChange(curr, prev);
  if (chg === null) return <span style={{ fontSize: '10px', color: 'var(--txt-dim)' }}>no prev data</span>;
  const delta = curr - prev;
  const isGood = invertGood ? chg < 0 : chg > 0;
  const color = isGood ? 'var(--green)' : 'var(--red)';
  const arrow = chg > 0 ? '▲' : '▼';
  const abs = Math.abs(chg).toFixed(0);
  return (
    <span style={{ fontSize: '10px', fontWeight: 700, color }}>
      {arrow} {abs}% vs prev&nbsp;
      <span style={{ opacity: 0.75 }}>
        ({delta > 0 ? '+' : ''}{Math.round(delta).toLocaleString()})
      </span>
    </span>
  );
}

// ── Utility: vs-target badge ───────────────────────────────────────────────
function TargetBadge({ curr, target, invertGood = false, label }: { curr: number; target: number; invertGood?: boolean; label?: string }) {
  const diff = curr - target;
  const pct = target > 0 ? (diff / target) * 100 : 0;
  const isOver = diff > 0;
  const isGood = invertGood ? !isOver : isOver;
  const color = isGood ? 'var(--green)' : 'var(--red)';
  const icon = isGood ? '✓' : '✕';
  return (
    <span style={{ fontSize: '10px', fontWeight: 700, color }}>
      {icon} vs target: {isOver ? '+' : ''}{Math.round(pct)}%&nbsp;
      <span style={{ opacity: 0.75 }}>({isOver ? '+' : ''}{Math.round(diff).toLocaleString()})</span>
      {label && <span style={{ color: 'var(--txt-dim)', fontWeight: 400 }}> · {label}</span>}
    </span>
  );
}

// ── Utility: split row (NC/EC or KPV/Agency) ──────────────────────────────
function SplitRow({ items }: { items: { label: string; val: string; pct: number; color: string }[] }) {
  return (
    <div style={{ fontSize: '10px', color: 'var(--txt-sub)', marginTop: '5px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
      {items.map(({ label, val, pct, color }) => (
        <span key={label}>
          <span style={{ fontWeight: 700, color }}>{label}:</span>{' '}
          {val}{' '}
          <span style={{ background: color + '22', color, borderRadius: '4px', padding: '0 4px', fontWeight: 700 }}>
            {pct}%
          </span>
        </span>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [submissions, setSubmissions] = useState<Submission[]>(genMockSubmissions);
  const [loading, setLoading] = useState(true);
  const { startOfMonth, endOfMonth } = getCurrentDateHelpers();
  const [startDate, setStartDate] = useState(startOfMonth);
  const [endDate, setEndDate] = useState(endOfMonth);
  const [teamFilter, setTeamFilter] = useState('All Teams');
  const [trendMode, setTrendMode] = useState<'D' | 'W' | 'M'>('M');
  const [modal, setModal] = useState<ModalState>({ open: false, submission: null, isEditing: false });

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

  // ── Current period filter ───────────────────────────────────────────────
  const filtered = useMemo(() => {
    return submissions.filter(s => {
      const inRange = (!startDate || s.date >= startDate) && (!endDate || s.date <= endDate);
      const inTeam = teamFilter === 'All Teams' || s.team === teamFilter || s.team === teamFilter.replace(' Team', '');
      return inRange && inTeam;
    });
  }, [submissions, startDate, endDate, teamFilter]);

  // ── Previous period filter (mirror the selected range length back in time) ──
  const prevFiltered = useMemo(() => {
    if (!startDate || !endDate) return [] as Submission[];
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    const rangeMs = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime() - 86400000); // day before start
    const prevStart = new Date(prevEnd.getTime() - rangeMs);
    const ps = prevStart.toISOString().slice(0, 10);
    const pe = prevEnd.toISOString().slice(0, 10);
    return submissions.filter(s => {
      const inRange = s.date >= ps && s.date <= pe;
      const inTeam = teamFilter === 'All Teams' || s.team === teamFilter || s.team === teamFilter.replace(' Team', '');
      return inRange && inTeam;
    });
  }, [submissions, startDate, endDate, teamFilter]);

  const hasData = filtered.length > 0;

  // ── KPI aggregator ─────────────────────────────────────────────────────
  const aggregateKPI = (rows: Submission[]) => {
    let nc = 0, ec = 0, buyNew = 0, buyExisting = 0, teamCost = 0, merchCost = 0, nrp = 0, footfall = 0, stepIn = 0;
    const days = new Set<string>();
    const byTeam: Record<string, { nc: number; cost: number }> = {};
    for (const s of rows) {
      nc += s.new_register;
      ec += s.existing_users;
      buyNew += s.buy_value_new;
      buyExisting += s.buy_value_existing;
      teamCost += s.team_cost;
      merchCost += s.merch_cost;
      nrp += s.new_reg_purchased || 0;
      footfall += s.footfall || 0;
      stepIn += s.step_in || 0;
      days.add(s.date);
      const t = s.team || 'KPV';
      if (!byTeam[t]) byTeam[t] = { nc: 0, cost: 0 };
      byTeam[t].nc += s.new_register;
      byTeam[t].cost += (s.team_cost || 0) + (s.merch_cost || 0);
    }
    const totalBuy = buyNew + buyExisting;
    const totalCost = teamCost + merchCost;
    const totalAcq = nc + ec;
    const activeDays = days.size || 1;
    return {
      nc, ec, nrp, totalAcq, totalBuy, totalCost, teamCost, merchCost,
      activeDays,
      cpa: nc > 0 ? totalCost / nc : 0,
      cpo: (nrp + ec) > 0 ? totalCost / (nrp + ec) : 0,
      cpao: totalAcq > 0 ? totalCost / totalAcq : 0,
      avgBuyPerAcq: totalAcq > 0 ? totalBuy / totalAcq : 0,
      avgAcqPerDay: totalAcq / activeDays,
      footfall, stepIn, buyNew, buyExisting,
      kpv: byTeam['KPV'] || { nc: 0, cost: 0 },
      agency: byTeam['Agency'] || { nc: 0, cost: 0 },
    };
  };

  const kpi = useMemo(() => aggregateKPI(filtered), [filtered]);
  const prevKpi = useMemo(() => aggregateKPI(prevFiltered), [prevFiltered]);

  // ── % contribution helpers ─────────────────────────────────────────────
  const pctOf = (val: number, total: number, fallback = 0) =>
    total > 0 ? Math.round((val / total) * 1000) / 10 : fallback;

  const pctNC = pctOf(kpi.nc, kpi.totalAcq, 67.5);
  const pctEC = pctOf(kpi.ec, kpi.totalAcq, 32.5);
  const pctBuyNC = pctOf(kpi.buyNew, kpi.totalBuy, 60);
  const pctBuyEC = pctOf(kpi.buyExisting, kpi.totalBuy, 40);
  const pctSpendTeam = pctOf(kpi.teamCost, kpi.totalCost, 75);
  const pctSpendMerch = pctOf(kpi.merchCost, kpi.totalCost, 25);
  const totalTeamNC = kpi.kpv.nc + kpi.agency.nc;
  const pctKPV = pctOf(kpi.kpv.nc, totalTeamNC, 58);
  const pctAgency = pctOf(kpi.agency.nc, totalTeamNC, 42);
  const totalTeamCost = kpi.kpv.cost + kpi.agency.cost;
  const spendKPV = pctOf(kpi.kpv.cost, totalTeamCost, 55);
  const spendAgency = pctOf(kpi.agency.cost, totalTeamCost, 45);

  // Target % hit
  const acqPctTarget = Math.round((kpi.totalAcq / TARGETS.acq) * 100);

  // ── Trend chart data ─────────────────────────────────────────────────────
  const trendData = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => (a.date < b.date ? -1 : 1));
    const ncByDay: Record<string, number> = {};
    const ecByDay: Record<string, number> = {};
    for (const s of sorted) {
      ncByDay[s.date] = (ncByDay[s.date] || 0) + s.new_register;
      ecByDay[s.date] = (ecByDay[s.date] || 0) + s.existing_users;
    }
    const dayKeys = Object.keys(ncByDay).sort();

    let marchNC = 0, marchEC = 0;
    dayKeys.forEach(k => { marchNC += ncByDay[k]; marchEC += ecByDay[k]; });
    const monthLabels = ['2024-10', '2024-11', '2024-12', '2025-01', '2025-02', '2025-03'];
    const monthNC = [820, 930, 1040, 980, 1120, marchNC];
    const monthEC = [410, 470, 520, 490, 540, marchEC];

    if (trendMode === 'M') {
      return {
        labels: monthLabels.map(m => new Date(m + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })),
        nc: monthNC, ec: monthEC,
      };
    }
    if (trendMode === 'W') {
      const weekLabels = ['W1', 'W2', 'W3', 'W4', 'W5'];
      const wnc = [0, 0, 0, 0, 0];
      const wec = [0, 0, 0, 0, 0];
      dayKeys.forEach(k => {
        const day = Number(k.slice(-2));
        const w = Math.min(4, Math.floor((day - 1) / 7));
        wnc[w] += ncByDay[k]; wec[w] += ecByDay[k];
      });
      return { labels: weekLabels, nc: wnc, ec: wec };
    }
    return {
      labels: dayKeys.map(labelDate),
      nc: dayKeys.map(k => ncByDay[k]),
      ec: dayKeys.map(k => ecByDay[k]),
    };
  }, [filtered, trendMode]);

  const openModal = (sub: Submission) => setModal({ open: true, submission: sub, isEditing: false });
  const closeModal = () => setModal({ open: false, submission: null, isEditing: false });
  const handleDelete = (id: string) => {
    if (!window.confirm('Delete this submission?')) return;
    setSubmissions(prev => prev.filter(s => s.id !== id));
    closeModal();
  };
  const handleSave = (saved: Submission) => {
    setSubmissions(prev => prev.map(s => (s.id === saved.id ? saved : s)));
    setModal(m => ({ ...m, isEditing: false, submission: saved }));
  };

  // ── Chart config ─────────────────────────────────────────────────────────
  const chartTheme = { grid: 'rgba(128,128,128,0.15)', tick: '#9CA3AF' };

  const lineChartData = {
    labels: trendData.labels,
    datasets: [
      {
        label: 'New Customers (NC)',
        data: trendData.nc,
        borderColor: '#1B56C8',
        backgroundColor: 'rgba(27,86,200,0.08)',
        fill: true, tension: 0.4, borderWidth: 2, pointRadius: 3,
      },
      {
        label: 'Existing (EC)',
        data: trendData.ec,
        borderColor: '#4DA6FF',
        backgroundColor: 'rgba(77,166,255,0.06)',
        fill: true, tension: 0.4, borderWidth: 2, pointRadius: 3,
      },
    ],
  };

  const lineChartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: chartTheme.tick, font: { size: 11 } } } },
    scales: {
      x: { grid: { color: chartTheme.grid }, ticks: { color: chartTheme.tick, font: { size: 10 } } },
      y: { beginAtZero: true, grid: { color: chartTheme.grid }, ticks: { color: chartTheme.tick, font: { size: 10 } } },
    },
  };

  const donutOp: any = { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false } } };
  const donutAcqData = {
    labels: ['New Customer', 'Existing'],
    datasets: [{ data: [pctNC, pctEC], backgroundColor: ['#1B56C8', '#4DA6FF'], borderWidth: 0, hoverOffset: 4 }],
  };
  const donutTeamData = {
    labels: ['KPV Team', 'Agency Team'],
    datasets: [{ data: [pctKPV, pctAgency], backgroundColor: ['#1B56C8', '#4DA6FF'], borderWidth: 0, hoverOffset: 4 }],
  };
  const donutSpendData = {
    labels: ['Team Cost', 'Merch'],
    datasets: [{ data: [spendKPV, spendAgency], backgroundColor: ['#1B56C8', '#4DA6FF'], borderWidth: 0, hoverOffset: 4 }],
  };

  // ── KPI card style helpers ────────────────────────────────────────────────
  const cardAccent = (color: string) => ({
    borderTop: `4px solid ${color}`,
    borderRadius: 'var(--radius)',
  });

  return (
    <div>
      <div className="demo-banner">
        <i className="fa-solid fa-circle-info"></i>{' '}
        {loading ? 'Loading data...' : hasData
          ? 'Showing live data with KPIs recalculated on every filter change.'
          : 'Showing Sample Data. Connect to Supabase to see real data.'}
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: '20px', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <div className="form-field" style={{ margin: 0 }}>
          <label>Start Date</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ padding: '7px 12px', fontSize: '12px', width: 'auto' }} />
        </div>
        <div className="form-field" style={{ margin: 0 }}>
          <label>End Date</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ padding: '7px 12px', fontSize: '12px', width: 'auto' }} />
        </div>
        <div className="form-field" style={{ margin: 0 }}>
          <label>Team</label>
          <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} style={{ padding: '7px 12px', fontSize: '12px', width: 'auto' }}>
            <option>All Teams</option>
            <option>KPV Team</option>
            <option>Agency Team</option>
          </select>
        </div>
        <button className="btn btn-ghost" onClick={() => { setStartDate(''); setEndDate(''); setTeamFilter('All Teams'); }} style={{ padding: '7px 14px', fontSize: '12px', marginTop: '16px' }}>
          <i className="fa-solid fa-xmark"></i> Clear
        </button>
      </div>

      {/* ── 6 KPI Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>

        {/* 1 · Acquisition */}
        <div className="card" style={{ ...cardAccent('var(--accent)'), position: 'relative' }}>
          {/* Target % hit badge */}
          <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
            <span style={{
              fontSize: '9px', fontWeight: 800, padding: '3px 8px', borderRadius: '20px',
              background: acqPctTarget >= 100 ? 'rgba(34,197,139,0.15)' : 'rgba(27,86,200,0.13)',
              color: acqPctTarget >= 100 ? 'var(--green)' : 'var(--accent)',
              border: `1px solid ${acqPctTarget >= 100 ? 'rgba(34,197,139,0.35)' : 'rgba(27,86,200,0.3)'}`,
            }}>
              🎯 {acqPctTarget}% target
            </span>
          </div>
          <div className="kpi-icon"><i className="fa-solid fa-users"></i></div>
          <div className="kpi-label">Acquisition (NC + EC)</div>
          <div className="kpi-val">{kpi.totalAcq.toLocaleString()}</div>

          {/* NC/EC split */}
          <SplitRow items={[
            { label: 'NC', val: kpi.nc.toLocaleString(), pct: pctNC, color: 'var(--accent)' },
            { label: 'EC', val: kpi.ec.toLocaleString(), pct: pctEC, color: 'var(--blue)' },
          ]} />

          {/* % change vs prev */}
          <div style={{ marginTop: '6px' }}>
            <DeltaBadge curr={kpi.totalAcq} prev={prevKpi.totalAcq} />
          </div>

          {/* Footfall */}
          <div style={{ marginTop: '4px', fontSize: '10px', color: 'var(--txt-dim)' }}>
            Footfall: <strong style={{ color: 'var(--txt-sub)' }}>{kpi.footfall.toLocaleString()}</strong>
          </div>
        </div>

        {/* 2 · Total Buy Value */}
        <div className="card" style={cardAccent('var(--green)')}>
          <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
            <span style={{ fontSize: '9px', fontWeight: 800, padding: '3px 8px', borderRadius: '20px', background: 'rgba(34,197,139,0.15)', color: 'var(--green)', border: '1px solid rgba(34,197,139,0.35)' }}>Live</span>
          </div>
          <div className="kpi-icon"><i className="fa-solid fa-sack-dollar" style={{ color: 'var(--green)' }}></i></div>
          <div className="kpi-label" style={{ color: 'var(--green)' }}>Total Buy Value</div>
          <div className="kpi-val">{fmtLAKShort(kpi.totalBuy)}</div>

          <SplitRow items={[
            { label: 'NC', val: fmtLAKShort(kpi.buyNew), pct: pctBuyNC, color: 'var(--accent)' },
            { label: 'EC', val: fmtLAKShort(kpi.buyExisting), pct: pctBuyEC, color: 'var(--blue)' },
          ]} />

          <div style={{ marginTop: '6px' }}>
            <DeltaBadge curr={kpi.totalBuy} prev={prevKpi.totalBuy} />
          </div>

          <div style={{ marginTop: '4px', fontSize: '10px', color: 'var(--txt-dim)' }}>
            Avg/Acq: <strong style={{ color: 'var(--green)' }}>{fmtLAK(Math.round(kpi.avgBuyPerAcq))}</strong>
          </div>
        </div>

        {/* 3 · Total Spending */}
        <div className="card" style={cardAccent('var(--red)')}>
          <div className="kpi-icon"><i className="fa-solid fa-money-bill-wave" style={{ color: 'var(--red)' }}></i></div>
          <div className="kpi-label" style={{ color: 'var(--red)' }}>Total Spending</div>
          <div className="kpi-val">{fmtLAKShort(kpi.totalCost)}</div>

          <SplitRow items={[
            { label: 'Merch', val: fmtLAKShort(kpi.merchCost), pct: pctSpendMerch, color: 'var(--orange)' },
            { label: 'Svc', val: fmtLAKShort(kpi.teamCost), pct: pctSpendTeam, color: 'var(--red)' },
          ]} />

          <div style={{ marginTop: '6px' }}>
            <DeltaBadge curr={kpi.totalCost} prev={prevKpi.totalCost} invertGood />
          </div>

          <div style={{ marginTop: '4px', fontSize: '10px', color: 'var(--txt-dim)' }}>
            KPV: <strong style={{ color: 'var(--txt-sub)' }}>{fmtLAKShort(kpi.kpv.cost)}</strong>
            &nbsp;·&nbsp;Agency: <strong style={{ color: 'var(--txt-sub)' }}>{fmtLAKShort(kpi.agency.cost)}</strong>
          </div>
        </div>

        {/* 4 · CPA */}
        <div className="card" style={cardAccent('#F4943A')}>
          <div className="kpi-icon"><i className="fa-solid fa-chart-line" style={{ color: '#F4943A' }}></i></div>
          <div className="kpi-label" style={{ color: '#F4943A' }}>CPA (Cost / NC)</div>
          <div className="kpi-val">{fmtLAK(Math.round(kpi.cpa))}</div>

          {/* KPV vs Agency split */}
          <SplitRow items={[
            { label: 'KPV', val: fmtLAK(kpi.kpv.nc > 0 ? Math.round(kpi.kpv.cost / kpi.kpv.nc) : 0), pct: pctKPV, color: 'var(--accent)' },
            { label: 'Agency', val: fmtLAK(kpi.agency.nc > 0 ? Math.round(kpi.agency.cost / kpi.agency.nc) : 0), pct: pctAgency, color: 'var(--blue)' },
          ]} />

          <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <DeltaBadge curr={kpi.cpa} prev={prevKpi.cpa} invertGood />
            <TargetBadge curr={kpi.cpa} target={TARGETS.cpa} invertGood label="Under" />
          </div>
        </div>

        {/* 5 · CPO */}
        <div className="card" style={cardAccent('var(--blue)')}>
          <div className="kpi-icon"><i className="fa-solid fa-cart-shopping" style={{ color: 'var(--blue)' }}></i></div>
          <div className="kpi-label" style={{ color: 'var(--blue)' }}>CPO (Cost / Buyers)</div>
          <div className="kpi-val">{fmtLAK(Math.round(kpi.cpo))}</div>

          <SplitRow items={[
            { label: 'KPV', val: fmtLAK(kpi.kpv.nc > 0 ? Math.round(kpi.kpv.cost / kpi.kpv.nc) : 0), pct: pctKPV, color: 'var(--accent)' },
            { label: 'Agency', val: fmtLAK(kpi.agency.nc > 0 ? Math.round(kpi.agency.cost / kpi.agency.nc) : 0), pct: pctAgency, color: 'var(--blue)' },
          ]} />

          <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <DeltaBadge curr={kpi.cpo} prev={prevKpi.cpo} invertGood />
            <TargetBadge curr={kpi.cpo} target={TARGETS.cpo} invertGood label="Under" />
          </div>
        </div>

        {/* 6 · CPAO */}
        <div className="card" style={cardAccent('#3ECFCF')}>
          <div className="kpi-icon"><i className="fa-solid fa-receipt" style={{ color: '#3ECFCF' }}></i></div>
          <div className="kpi-label" style={{ color: '#3ECFCF' }}>CPAO (Cost / Acq. Order)</div>
          <div className="kpi-val">{fmtLAK(Math.round(kpi.cpao))}</div>

          <SplitRow items={[
            { label: 'KPV', val: fmtLAK(kpi.kpv.nc > 0 ? Math.round(kpi.kpv.cost / kpi.kpv.nc) : 0), pct: pctKPV, color: 'var(--accent)' },
            { label: 'Agency', val: fmtLAK(kpi.agency.nc > 0 ? Math.round(kpi.agency.cost / kpi.agency.nc) : 0), pct: pctAgency, color: 'var(--blue)' },
          ]} />

          <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <DeltaBadge curr={kpi.cpao} prev={prevKpi.cpao} invertGood />
            <TargetBadge curr={kpi.cpao} target={TARGETS.cpao} invertGood label="Under" />
          </div>
        </div>
      </div>

      {/* ── Avg KPI Row ── */}
      <div className="grid-2" style={{ marginBottom: '20px' }}>
        <div className="card" style={cardAccent('var(--accent)')}>
          <div className="kpi-icon"><i className="fa-solid fa-coins" style={{ color: 'var(--accent)' }}></i></div>
          <div className="kpi-label" style={{ color: 'var(--accent)' }}>Avg. Buy Value / Acquisition</div>
          <div className="kpi-val" style={{ color: 'var(--accent)' }}>{fmtLAK(Math.round(kpi.avgBuyPerAcq))}</div>

          <SplitRow items={[
            { label: 'NC', val: fmtLAK(kpi.nc > 0 ? Math.round(kpi.buyNew / kpi.nc) : 0), pct: pctBuyNC, color: 'var(--accent)' },
            { label: 'EC', val: fmtLAK(kpi.ec > 0 ? Math.round(kpi.buyExisting / kpi.ec) : 0), pct: pctBuyEC, color: 'var(--blue)' },
          ]} />

          <div style={{ marginTop: '5px', fontSize: '10px', color: 'var(--txt-dim)' }}>Total Buy Value ÷ Total Acquisition</div>
        </div>

        <div className="card" style={cardAccent('var(--blue)')}>
          <div className="kpi-icon"><i className="fa-solid fa-calendar-day" style={{ color: 'var(--blue)' }}></i></div>
          <div className="kpi-label" style={{ color: 'var(--blue)' }}>Avg. Acquisition / Day</div>
          <div className="kpi-val" style={{ color: 'var(--blue)' }}>{kpi.avgAcqPerDay.toFixed(1)}</div>

          <SplitRow items={[
            { label: 'NC', val: (kpi.nc / kpi.activeDays).toFixed(1), pct: pctNC, color: 'var(--accent)' },
            { label: 'EC', val: (kpi.ec / kpi.activeDays).toFixed(1), pct: pctEC, color: 'var(--blue)' },
          ]} />

          <div style={{ marginTop: '5px', fontSize: '10px', color: 'var(--txt-dim)' }}>
            {kpi.totalAcq.toLocaleString()} ÷ {kpi.activeDays} active days
          </div>
        </div>
      </div>

      {/* Charts Row 1: Acquisition Trend + % Contribution */}
      <div className="grid-2" style={{ marginBottom: '20px' }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ fontSize: '14px', margin: 0 }}>Acquisition Trend</h3>
            <div style={{ display: 'flex', gap: '6px' }}>
              {(['D', 'W', 'M'] as const).map(mode => (
                <button
                  key={mode}
                  className="btn btn-ghost"
                  onClick={() => setTrendMode(mode)}
                  style={{
                    padding: '3px 10px', fontSize: '11px',
                    background: trendMode === mode ? 'var(--blue-dim)' : undefined,
                    color: trendMode === mode ? 'var(--blue)' : undefined,
                    borderColor: trendMode === mode ? 'var(--blue)' : undefined,
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
          <div style={{ height: '220px' }}>
            <Line data={lineChartData} options={lineChartOptions} />
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: '4px', fontSize: '14px' }}>Acquisition % Contribution</h3>
          <div style={{ fontSize: '10px', color: 'var(--txt-sub)', marginBottom: '12px' }}>New Customer vs Existing share of total</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', height: '160px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: '140px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '11px', height: '11px', borderRadius: '3px', background: '#1B56C8', flexShrink: 0 }}></span>
                <span style={{ fontSize: '12px' }}>New Customer</span>
                <strong style={{ color: 'var(--accent)', marginLeft: 'auto' }}>{pctNC}%</strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '11px', height: '11px', borderRadius: '3px', background: '#4DA6FF', flexShrink: 0 }}></span>
                <span style={{ fontSize: '12px' }}>Existing</span>
                <strong style={{ color: 'var(--blue)', marginLeft: 'auto' }}>{pctEC}%</strong>
              </div>
            </div>
            <div style={{ width: '150px', height: '150px', flexShrink: 0, marginLeft: 'auto' }}>
              <Doughnut data={donutAcqData} options={donutOp} />
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row 2: Team Contribution + Spending % by Team */}
      <div className="grid-2" style={{ marginBottom: '20px' }}>
        <div className="card">
          <h3 style={{ marginBottom: '4px', fontSize: '14px' }}>% Contribution by Team</h3>
          <div style={{ fontSize: '10px', color: 'var(--txt-sub)', marginBottom: '12px' }}>New Customers by team (KPV vs Agency)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', height: '160px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: '140px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '11px', height: '11px', borderRadius: '3px', background: '#1B56C8', flexShrink: 0 }}></span>
                <span style={{ fontSize: '12px' }}>KPV Team</span>
                <strong style={{ color: 'var(--accent)', marginLeft: 'auto' }}>{pctKPV}%</strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '11px', height: '11px', borderRadius: '3px', background: '#4DA6FF', flexShrink: 0 }}></span>
                <span style={{ fontSize: '12px' }}>Agency Team</span>
                <strong style={{ color: 'var(--blue)', marginLeft: 'auto' }}>{pctAgency}%</strong>
              </div>
            </div>
            <div style={{ width: '150px', height: '150px', flexShrink: 0, marginLeft: 'auto' }}>
              <Doughnut data={donutTeamData} options={donutOp} />
            </div>
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: '4px', fontSize: '14px' }}>% Spending by Team</h3>
          <div style={{ fontSize: '10px', color: 'var(--txt-sub)', marginBottom: '12px' }}>Total cost split by team (KPV vs Agency)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', height: '160px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: '140px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '11px', height: '11px', borderRadius: '3px', background: '#1B56C8', flexShrink: 0 }}></span>
                <span style={{ fontSize: '12px' }}>KPV Team</span>
                <strong style={{ color: 'var(--accent)', marginLeft: 'auto' }}>{spendKPV}%</strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '11px', height: '11px', borderRadius: '3px', background: '#4DA6FF', flexShrink: 0 }}></span>
                <span style={{ fontSize: '12px' }}>Agency Team</span>
                <strong style={{ color: 'var(--blue)', marginLeft: 'auto' }}>{spendAgency}%</strong>
              </div>
            </div>
            <div style={{ width: '150px', height: '150px', flexShrink: 0, marginLeft: 'auto' }}>
              <Doughnut data={donutSpendData} options={donutOp} />
            </div>
          </div>
        </div>
      </div>

      {/* Recent Submissions Table */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <h3 style={{ fontSize: '15px' }}>Recent Submissions</h3>
          <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: '12px' }}>View All →</button>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th><th>Team</th><th>Branch</th><th>Total Acq.</th><th>Buy Value</th><th>Cost</th><th>CPA</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {[...filtered]
              .sort((a, b) => (a.date < b.date ? 1 : -1))
              .slice(0, 8)
              .map(s => {
                const totalCost = (s.team_cost || 0) + (s.merch_cost || 0);
                const cpa = s.new_register > 0 ? totalCost / s.new_register : 0;
                return (
                  <tr key={s.id}>
                    <td>{new Date(s.date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                    <td><span className={`pill ${s.team === 'Agency' ? 'pill-blue' : 'pill-gold'}`}>{s.team || 'KPV'}</span></td>
                    <td>{s.branch}</td>
                    <td>{(s.new_register || 0) + (s.existing_users || 0)}</td>
                    <td>{fmtLAKShort((s.buy_value_new || 0) + (s.buy_value_existing || 0))}</td>
                    <td>{fmtLAKShort(totalCost)}</td>
                    <td>{fmtLAK(Math.round(cpa))}</td>
                    <td><span className="pill pill-green">{(s.status || 'active').toUpperCase()}</span></td>
                    <td>
                      <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: '11px' }} onClick={() => openModal(s)}>
                        <i className="fa-solid fa-eye"></i> View
                      </button>
                    </td>
                  </tr>
                );
              })}
            {filtered.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--txt-dim)', padding: '24px' }}>No submissions in this range — {loading ? 'loading…' : 'try clearing the filters.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Submission detail modal */}
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
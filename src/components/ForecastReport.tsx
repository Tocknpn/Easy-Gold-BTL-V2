import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import type { Submission, CostTypeKey } from '../lib/submissions';
import {
  fmtLAK,
  normalizeActivityType,
  normalizeTeam,
  COST_TYPES,
  ALL_COST_TYPES,
  costForTypes,
  costOfType,
  normalizeCostTypes,
  computePeriodTargets,
} from '../lib/submissions';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);
ChartJS.defaults.font.family = "'Montserrat', sans-serif";

// ── Formatters ─────────────────────────────────────────────────────────────
const fmtDeckLAK = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) {
    return `₭${(n / 1_000_000_000).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}B`;
  }
  if (abs >= 1_000_000) {
    return `₭${(n / 1_000_000).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
  }
  if (abs >= 1_000) {
    return `₭${(n / 1_000).toLocaleString('en-US', { maximumFractionDigits: 0 })}K`;
  }
  return `₭${Math.round(n).toLocaleString('en-US')}`;
};

const pctChange = (curr: number, prev: number | null | undefined): number | null => {
  if (prev == null || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
};

function CostTypeFilter({ selected, onChange }: { selected: CostTypeKey[]; onChange: (next: CostTypeKey[]) => void }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const allSelected = selected.length === ALL_COST_TYPES.length;
  const summary = allSelected
    ? `All (${ALL_COST_TYPES.length})`
    : COST_TYPES.filter(c => selected.includes(c.key)).map(c => c.shortLabel).join(' + ');

  const toggle = (key: CostTypeKey) => {
    if (selected.includes(key)) {
      if (selected.length === 1) return;
      onChange(selected.filter(k => k !== key));
    } else {
      onChange(normalizeCostTypes([...selected, key]));
    }
  };

  return (
    <div className="form-field" style={{ margin: 0, position: 'relative' }} ref={boxRef}>
      <label style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 800, color: '#64748B', letterSpacing: '0.05em' }}>Cost Type</label>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => setOpen(o => !o)}
        style={{ padding: '6px 11px', fontSize: '11px', width: 'auto', fontWeight: 600, height: '34px', border: '1px solid #CBD5E1', borderRadius: '8px', background: '#FFFFFF', color: '#0F172A' }}
      >
        <i className="fa-solid fa-layer-group" style={{ fontSize: '11px', opacity: 0.8 }}></i>
        <span>{summary}</span>
        <i className={`fa-solid ${open ? 'fa-chevron-up' : 'fa-chevron-down'}`} style={{ fontSize: '8px', opacity: 0.7 }}></i>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 5px)', left: 0, zIndex: 50,
            minWidth: '220px', background: '#FFFFFF', border: '1px solid #CBD5E1',
            borderRadius: '10px', boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)', padding: '8px',
          }}
        >
          {COST_TYPES.map(c => (
            <label
              key={c.key}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px',
                borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: '#0F172A',
              }}
            >
              <input
                type="checkbox"
                checked={selected.includes(c.key)}
                onChange={() => toggle(c.key)}
                style={{ width: '13px', height: '13px', accentColor: '#0b53ac' }}
              />
              {c.label}
            </label>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #E2E8F0', marginTop: '6px', paddingTop: '6px', paddingLeft: '8px' }}>
            <span style={{ fontSize: '9px', color: '#64748B' }}>Drives Total Cost</span>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onChange(normalizeCostTypes([...ALL_COST_TYPES]))}
              style={{ padding: '2px 8px', fontSize: '10px' }}
            >
              All
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface ForecastReportProps {
  submissions: Submission[];
  targetsData: any[];
}

export default function ForecastReport({ submissions, targetsData }: ForecastReportProps) {
  // Current calendar date
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthNum = now.getMonth() + 1; // 1-12
  const currentMonthStr = `${currentYear}-${String(currentMonthNum).padStart(2, '0')}`;
  const todayDayOfMonth = now.getDate();

  // Filters State
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);
  const [teamFilter, setTeamFilter] = useState<'All' | 'Agency' | 'KPV'>('All');
  const [activityFilter, setActivityFilter] = useState<'All Types' | 'booth' | 'event'>('All Types');
  const [costTypes, setCostTypes] = useState<CostTypeKey[]>(ALL_COST_TYPES);
  const [activeChartMetric, setActiveChartMetric] = useState<'nc' | 'totalAcq' | 'revenue' | 'cost'>('nc');

  // Month metadata: total days in selected month
  const { totalDaysInMonth, isCurrentCalendarMonth } = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const days = new Date(y, m, 0).getDate();
    const isCurrent = selectedMonth === currentMonthStr;
    return { totalDaysInMonth: days, isCurrentCalendarMonth: isCurrent };
  }, [selectedMonth, currentMonthStr]);

  // Cutoff / As of Day (defaults to today if current month, or all days if past month)
  const [asOfDay, setAsOfDay] = useState<number>(() => {
    return selectedMonth === currentMonthStr ? todayDayOfMonth : 31;
  });

  // Effective Cutoff Day capped to total days in selected month
  const effectiveCutoffDay = useMemo(() => {
    if (isCurrentCalendarMonth) {
      return Math.min(asOfDay, todayDayOfMonth, totalDaysInMonth);
    }
    return Math.min(asOfDay, totalDaysInMonth);
  }, [isCurrentCalendarMonth, asOfDay, todayDayOfMonth, totalDaysInMonth]);

  // When selected month changes, default cutoff sensibly
  const handleMonthChange = (newMonth: string) => {
    setSelectedMonth(newMonth);
    if (newMonth === currentMonthStr) {
      setAsOfDay(todayDayOfMonth);
    } else {
      const [y, m] = newMonth.split('-').map(Number);
      const days = new Date(y, m, 0).getDate();
      setAsOfDay(days);
    }
  };

  // Available months list derived from submissions and past/current year
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    // Add current year months up to current or next month
    for (let m = 1; m <= 12; m++) {
      set.add(`${currentYear}-${String(m).padStart(2, '0')}`);
      set.add(`${currentYear - 1}-${String(m).padStart(2, '0')}`);
    }
    for (const s of submissions) {
      if (s.date && s.date.length >= 7) {
        set.add(s.date.substring(0, 7));
      }
    }
    const arr = Array.from(set).sort().reverse();
    return arr.map(ym => {
      const [y, m] = ym.split('-').map(Number);
      const d = new Date(y, m - 1, 1);
      const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      return { key: ym, label };
    });
  }, [submissions, currentYear]);

  // Previous month calculation
  const { prevMonthStr, prevMonthTotalDays, prevMonthLabel } = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    let prevY = y;
    let prevM = m - 1;
    if (prevM < 1) {
      prevM = 12;
      prevY = y - 1;
    }
    const pmStr = `${prevY}-${String(prevM).padStart(2, '0')}`;
    const days = new Date(prevY, prevM, 0).getDate();
    const d = new Date(prevY, prevM - 1, 1);
    const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    return { prevMonthStr: pmStr, prevMonthTotalDays: days, prevMonthLabel: label };
  }, [selectedMonth]);

  // Selected Month friendly label
  const selectedMonthLabel = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [selectedMonth]);

  // Progress metrics
  const daysElapsed = Math.max(1, effectiveCutoffDay);
  const daysRemaining = Math.max(0, totalDaysInMonth - daysElapsed);
  const timeProgressPct = (daysElapsed / totalDaysInMonth) * 100;

  // ── Submissions Filtering ────────────────────────────────────────────────
  // Helper to filter by team and activity
  const filterRow = (s: Submission) => {
    if (teamFilter !== 'All' && normalizeTeam(s.team) !== teamFilter) return false;
    if (activityFilter !== 'All Types' && normalizeActivityType(s.activity_type) !== activityFilter) return false;
    return true;
  };

  // 1. Current Month MTD (Day 1 to effectiveCutoffDay)
  const currentMtdSubmissions = useMemo(() => {
    const cutoffDateStr = `${selectedMonth}-${String(effectiveCutoffDay).padStart(2, '0')}`;
    const startDateStr = `${selectedMonth}-01`;
    return submissions.filter(s => {
      if (!s.date || s.date < startDateStr || s.date > cutoffDateStr) return false;
      return filterRow(s);
    });
  }, [submissions, selectedMonth, effectiveCutoffDay, teamFilter, activityFilter]);

  // 2. Previous Month Same Period (Day 1 to effectiveCutoffDay capped by prev month days)
  const prevMonthSamePeriodSubmissions = useMemo(() => {
    const prevCutoffDay = Math.min(effectiveCutoffDay, prevMonthTotalDays);
    const cutoffDateStr = `${prevMonthStr}-${String(prevCutoffDay).padStart(2, '0')}`;
    const startDateStr = `${prevMonthStr}-01`;
    return submissions.filter(s => {
      if (!s.date || s.date < startDateStr || s.date > cutoffDateStr) return false;
      return filterRow(s);
    });
  }, [submissions, prevMonthStr, effectiveCutoffDay, prevMonthTotalDays, teamFilter, activityFilter]);

  // 3. Previous Month Full Month (Day 1 to end of prev month)
  const prevMonthFullSubmissions = useMemo(() => {
    const startDateStr = `${prevMonthStr}-01`;
    const endDateStr = `${prevMonthStr}-${String(prevMonthTotalDays).padStart(2, '0')}`;
    return submissions.filter(s => {
      if (!s.date || s.date < startDateStr || s.date > endDateStr) return false;
      return filterRow(s);
    });
  }, [submissions, prevMonthStr, prevMonthTotalDays, teamFilter, activityFilter]);

  // ── Metric Computation Helper ────────────────────────────────────────────
  const computeMetrics = (subs: Submission[]) => {
    let nc = 0;
    let ec = 0;
    let buyers = 0;
    let buyNew = 0;
    let buyExisting = 0;
    let totalCost = 0;
    let activationCost = 0;
    let merchCost = 0;

    for (const s of subs) {
      nc += Number(s.new_register) || 0;
      ec += Number(s.existing_users) || 0;
      buyers += Number(s.new_reg_purchased) || 0;
      buyNew += Number(s.buy_value_new) || 0;
      buyExisting += Number(s.buy_value_existing) || 0;
      totalCost += costForTypes(s, costTypes);
      activationCost += costOfType(s, 'service');
      merchCost += costOfType(s, 'merch');
    }

    const totalAcq = nc + ec;
    const totalBuy = buyNew + buyExisting;
    const cpa = nc > 0 ? totalCost / nc : 0;
    const cpo = buyers > 0 ? totalCost / buyers : 0;

    return {
      nc,
      ec,
      totalAcq,
      buyers,
      buyNew,
      buyExisting,
      totalBuy,
      totalCost,
      activationCost,
      merchCost,
      cpa,
      cpo,
    };
  };

  const currentMtd = useMemo(() => computeMetrics(currentMtdSubmissions), [currentMtdSubmissions, costTypes]);
  const prevSamePeriod = useMemo(() => computeMetrics(prevMonthSamePeriodSubmissions), [prevMonthSamePeriodSubmissions, costTypes]);
  const prevFullMonth = useMemo(() => computeMetrics(prevMonthFullSubmissions), [prevMonthFullSubmissions, costTypes]);

  // ── Targets for Selected Month ───────────────────────────────────────────
  const targets = useMemo(() => {
    const startStr = `${selectedMonth}-01`;
    const endStr = `${selectedMonth}-${String(totalDaysInMonth).padStart(2, '0')}`;
    const base = computePeriodTargets(targetsData, startStr, endStr, teamFilter);

    // Also look for buy_value_target & cost_budget from raw targets rows
    let revTarget: number | null = null;
    let costBudget: number | null = null;
    if (targetsData && targetsData.length > 0) {
      const filterT = normalizeTeam(teamFilter);
      const isAll = filterT === 'All' || filterT === 'All Teams' || !filterT;
      const matching = targetsData.filter(t => {
        if (!t.month || String(t.month).substring(0, 7) !== selectedMonth) return false;
        if (isAll) return true;
        return normalizeTeam(t.team) === filterT;
      });
      if (matching.length > 0) {
        let rSum = 0;
        let cSum = 0;
        let hasR = false;
        let hasC = false;
        for (const t of matching) {
          if (t.buy_value_target && Number(t.buy_value_target) > 0) {
            rSum += Number(t.buy_value_target);
            hasR = true;
          }
          if (t.cost_budget && Number(t.cost_budget) > 0) {
            cSum += Number(t.cost_budget);
            hasC = true;
          }
        }
        if (hasR) revTarget = rSum;
        if (hasC) costBudget = cSum;
      }
    }

    // Prorated targets for MTD (based on daysElapsed / totalDaysInMonth)
    const pacingFactor = daysElapsed / totalDaysInMonth;
    const proratedAcq = base.acq ? base.acq * pacingFactor : null;
    const proratedRev = revTarget ? revTarget * pacingFactor : null;
    const proratedCost = costBudget ? costBudget * pacingFactor : null;

    return {
      fullAcq: base.acq,
      fullRev: revTarget,
      fullCost: costBudget,
      targetCpa: base.cpa,
      targetCpo: base.cpo,
      proratedAcq,
      proratedRev,
      proratedCost,
      pacingFactor,
    };
  }, [targetsData, selectedMonth, totalDaysInMonth, teamFilter, daysElapsed]);

  // ── Run-Rate & Forecast Landing Calculations ─────────────────────────────
  // If the month is complete (daysRemaining === 0), forecast landing is exactly current actuals
  const forecast = useMemo(() => {
    const dailyRate = {
      nc: currentMtd.nc / daysElapsed,
      ec: currentMtd.ec / daysElapsed,
      totalAcq: currentMtd.totalAcq / daysElapsed,
      buyers: currentMtd.buyers / daysElapsed,
      totalBuy: currentMtd.totalBuy / daysElapsed,
      totalCost: currentMtd.totalCost / daysElapsed,
    };

    const landing = {
      nc: Math.round(dailyRate.nc * totalDaysInMonth),
      ec: Math.round(dailyRate.ec * totalDaysInMonth),
      totalAcq: Math.round(dailyRate.totalAcq * totalDaysInMonth),
      buyers: Math.round(dailyRate.buyers * totalDaysInMonth),
      totalBuy: Math.round(dailyRate.totalBuy * totalDaysInMonth),
      totalCost: Math.round(dailyRate.totalCost * totalDaysInMonth),
      cpa: 0,
      cpo: 0,
    };

    landing.cpa = landing.nc > 0 ? landing.totalCost / landing.nc : 0;
    landing.cpo = landing.buyers > 0 ? landing.totalCost / landing.buyers : 0;

    return {
      dailyRate,
      landing,
    };
  }, [currentMtd, daysElapsed, totalDaysInMonth]);

  // Theme styling (Montserrat font, consistent with Easy Gold palette)
  const isKPV = teamFilter === 'KPV';
  const theme = useMemo(() => {
    if (isKPV) {
      return {
        brandAccent: '#9E1B32',
        brandGradient: 'linear-gradient(135deg, #701A24 0%, #9E1B32 100%)',
        lightBg: '#FFF1F2',
        border: '#FECDD3',
        subHighlight: '#9E1B32',
        heroGradient: 'linear-gradient(135deg, #701A24 0%, #9E1B32 70%, #BE123C 100%)',
        heroBorder: '#9E1B32',
      };
    }
    return {
      brandAccent: '#0b53ac',
      brandGradient: 'linear-gradient(135deg, #073a78 0%, #0b53ac 100%)',
      lightBg: '#EFF6FF',
      border: '#D4E2F5',
      subHighlight: '#0b53ac',
      heroGradient: 'linear-gradient(135deg, #073a78 0%, #0b53ac 70%, #1664bf 100%)',
      heroBorder: '#0b53ac',
    };
  }, [isKPV]);

  // ── Delta / Comparison Badge Component ───────────────────────────────────
  const renderComparisonPill = (
    currentVal: number,
    compareVal: number | null | undefined,
    label: string,
    opts?: {
      isCostMetric?: boolean;
      isCurrency?: boolean;
      invertDirection?: boolean;
      compact?: boolean;
      isHero?: boolean;
    }
  ) => {
    const isCost = opts?.isCostMetric ?? false;
    const isCurr = opts?.isCurrency ?? false;
    const isHero = opts?.isHero ?? false;

    if (compareVal == null || compareVal <= 0) {
      return (
        <div style={{
          fontSize: opts?.compact ? '10px' : '11px',
          color: isHero ? 'rgba(255,255,255,0.6)' : '#94A3B8',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          fontWeight: 600,
        }}>
          <span>—</span>
          <span>{label}</span>
          <span style={{ fontSize: '9px', opacity: 0.8 }}>(N/A)</span>
        </div>
      );
    }

    const chg = pctChange(currentVal, compareVal);
    if (chg === null) return null;

    const delta = currentVal - compareVal;
    // For cost/CPA: decrease is good (green), increase is bad (red)
    const isGood = isCost ? chg <= 0 : chg >= 0;
    const arrow = chg >= 0 ? '▲' : '▼';
    const sign = chg >= 0 ? '+' : '';

    const badgeColor = isHero
      ? (isGood ? '#4ADE80' : '#FDA4AF')
      : (isGood ? '#059669' : '#DC2626');

    const badgeBg = isHero
      ? (isGood ? 'rgba(74, 222, 128, 0.15)' : 'rgba(253, 164, 175, 0.15)')
      : (isGood ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)');

    const formattedDelta = isCurr ? fmtDeckLAK(Math.abs(delta)) : Math.round(Math.abs(delta)).toLocaleString();

    return (
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: opts?.compact ? '10px' : '11px',
        flexWrap: 'wrap',
      }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
            padding: '2px 6px',
            borderRadius: '4px',
            fontWeight: 800,
            background: badgeBg,
            color: badgeColor,
            fontFamily: "'Montserrat', sans-serif",
            letterSpacing: '0.01em',
          }}
        >
          <span>{arrow}</span>
          <span>{sign}{chg.toFixed(1)}%</span>
        </span>
        <span style={{
          color: isHero ? 'rgba(255,255,255,0.85)' : '#64748B',
          fontWeight: 600,
        }}>
          {label}
          <span style={{
            fontSize: '10px',
            marginLeft: '4px',
            opacity: 0.8,
            color: isHero ? 'rgba(255,255,255,0.7)' : '#475569',
          }}>
            ({delta >= 0 ? '+' : '-'}{formattedDelta})
          </span>
        </span>
      </div>
    );
  };

  // ── Cumulative Timeline Data for Chart ───────────────────────────────────
  const chartData = useMemo(() => {
    const daysArray = Array.from({ length: totalDaysInMonth }, (_, i) => i + 1);
    const labels = daysArray.map(d => `Day ${d}`);

    // Map daily actuals for selected month
    const dailyActualMap = new Map<number, number>();
    for (const s of currentMtdSubmissions) {
      if (!s.date) continue;
      const dayNum = parseInt(s.date.split('-')[2], 10);
      let val = 0;
      if (activeChartMetric === 'nc') val = Number(s.new_register) || 0;
      else if (activeChartMetric === 'totalAcq') val = (Number(s.new_register) || 0) + (Number(s.existing_users) || 0);
      else if (activeChartMetric === 'revenue') val = ((Number(s.buy_value_new) || 0) + (Number(s.buy_value_existing) || 0)) / 1_000_000;
      else if (activeChartMetric === 'cost') val = costForTypes(s, costTypes) / 1_000_000;

      dailyActualMap.set(dayNum, (dailyActualMap.get(dayNum) || 0) + val);
    }

    // Map daily actuals for previous month
    const dailyPrevMap = new Map<number, number>();
    for (const s of prevMonthFullSubmissions) {
      if (!s.date) continue;
      const dayNum = parseInt(s.date.split('-')[2], 10);
      let val = 0;
      if (activeChartMetric === 'nc') val = Number(s.new_register) || 0;
      else if (activeChartMetric === 'totalAcq') val = (Number(s.new_register) || 0) + (Number(s.existing_users) || 0);
      else if (activeChartMetric === 'revenue') val = ((Number(s.buy_value_new) || 0) + (Number(s.buy_value_existing) || 0)) / 1_000_000;
      else if (activeChartMetric === 'cost') val = costForTypes(s, costTypes) / 1_000_000;

      dailyPrevMap.set(dayNum, (dailyPrevMap.get(dayNum) || 0) + val);
    }

    // Cumulative actual series (Day 1 to effectiveCutoffDay)
    let runningActual = 0;
    const actualCumulative: (number | null)[] = [];
    for (let d = 1; d <= totalDaysInMonth; d++) {
      if (d <= effectiveCutoffDay) {
        runningActual += dailyActualMap.get(d) || 0;
        actualCumulative.push(runningActual);
      } else {
        actualCumulative.push(null);
      }
    }

    // Cumulative forecast series (Day effectiveCutoffDay to totalDaysInMonth)
    const forecastCumulative: (number | null)[] = [];
    let runningForecast = runningActual;
    const dailyRunRate = runningActual / daysElapsed;

    for (let d = 1; d <= totalDaysInMonth; d++) {
      if (d < effectiveCutoffDay) {
        forecastCumulative.push(null);
      } else if (d === effectiveCutoffDay) {
        forecastCumulative.push(runningActual);
      } else {
        runningForecast += dailyRunRate;
        forecastCumulative.push(Math.round(runningForecast * 10) / 10);
      }
    }

    // Linear Target Pace line
    let metricTarget = 0;
    if (activeChartMetric === 'nc') metricTarget = targets.fullAcq || 0;
    else if (activeChartMetric === 'totalAcq') metricTarget = targets.fullAcq ? targets.fullAcq * 1.15 : 0;
    else if (activeChartMetric === 'revenue') metricTarget = targets.fullRev ? targets.fullRev / 1_000_000 : 0;
    else if (activeChartMetric === 'cost') metricTarget = targets.fullCost ? targets.fullCost / 1_000_000 : 0;

    const targetPaceSeries: (number | null)[] = [];
    if (metricTarget > 0) {
      for (let d = 1; d <= totalDaysInMonth; d++) {
        targetPaceSeries.push(Math.round((metricTarget * (d / totalDaysInMonth)) * 10) / 10);
      }
    }

    // Previous month cumulative series
    let runningPrev = 0;
    const prevCumulative: (number | null)[] = [];
    for (let d = 1; d <= totalDaysInMonth; d++) {
      if (d <= prevMonthTotalDays) {
        runningPrev += dailyPrevMap.get(d) || 0;
        prevCumulative.push(Math.round(runningPrev * 10) / 10);
      } else {
        prevCumulative.push(null);
      }
    }

    const datasets: any[] = [
      {
        label: `Actual MTD (Day 1–${effectiveCutoffDay})`,
        data: actualCumulative,
        borderColor: theme.brandAccent,
        backgroundColor: isKPV ? 'rgba(158, 27, 50, 0.08)' : 'rgba(11, 83, 172, 0.08)',
        borderWidth: 3,
        pointRadius: 4,
        pointBackgroundColor: theme.brandAccent,
        tension: 0.1,
        fill: true,
      },
      {
        label: `Projected Runway (Run-Rate)`,
        data: forecastCumulative,
        borderColor: '#F59E0B',
        borderDash: [6, 4],
        borderWidth: 2.5,
        pointRadius: 3,
        pointBackgroundColor: '#F59E0B',
        tension: 0.1,
        fill: false,
      },
    ];

    if (metricTarget > 0) {
      datasets.push({
        label: `Target Pace (Full: ${metricTarget.toLocaleString()})`,
        data: targetPaceSeries,
        borderColor: '#10B981',
        borderDash: [3, 3],
        borderWidth: 2,
        pointRadius: 0,
        tension: 0,
        fill: false,
      });
    }

    datasets.push({
      label: `Prior Month (${prevMonthLabel})`,
      data: prevCumulative,
      borderColor: '#94A3B8',
      borderDash: [2, 2],
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0.1,
      fill: false,
    });

    return { labels, datasets };
  }, [
    totalDaysInMonth,
    effectiveCutoffDay,
    currentMtdSubmissions,
    prevMonthFullSubmissions,
    activeChartMetric,
    costTypes,
    daysElapsed,
    targets,
    prevMonthTotalDays,
    prevMonthLabel,
    theme,
    isKPV,
  ]);

  const chartOptions: any = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top' as const,
        align: 'end' as const,
        labels: {
          boxWidth: 12,
          boxHeight: 12,
          font: { family: "'Montserrat', sans-serif", size: 11, weight: 'bold' },
          color: '#475569',
          padding: 12,
        },
      },
      tooltip: {
        backgroundColor: '#0F172A',
        titleFont: { family: "'Montserrat', sans-serif", size: 12, weight: 'bold' },
        bodyFont: { family: "'Montserrat', sans-serif", size: 11 },
        padding: 10,
        cornerRadius: 8,
        callbacks: {
          label: (context: any) => {
            const val = context.parsed.y;
            if (val === null || val === undefined) return '';
            const unit = (activeChartMetric === 'revenue' || activeChartMetric === 'cost') ? 'M LAK' : '';
            return ` ${context.dataset.label}: ${val.toLocaleString()} ${unit}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(226, 232, 240, 0.6)' },
        ticks: {
          font: { family: "'Montserrat', sans-serif", size: 10, weight: '600' },
          color: '#64748B',
          maxTicksLimit: 16,
        },
      },
      y: {
        grid: { color: 'rgba(226, 232, 240, 0.6)' },
        ticks: {
          font: { family: "'Montserrat', sans-serif", size: 10, weight: '600' },
          color: '#64748B',
          callback: (value: any) => {
            if (activeChartMetric === 'revenue' || activeChartMetric === 'cost') {
              return `₭${value}M`;
            }
            return Number(value).toLocaleString();
          },
        },
      },
    },
  }), [activeChartMetric]);

  // Executive Story Narrative Generator
  const narrative = useMemo(() => {
    const pacingChg = targets.proratedAcq ? pctChange(currentMtd.nc, targets.proratedAcq) : null;
    const momSameChg = pctChange(currentMtd.nc, prevSamePeriod.nc);
    const landingTargetChg = targets.fullAcq ? pctChange(forecast.landing.nc, targets.fullAcq) : null;
    const landingMomChg = pctChange(forecast.landing.nc, prevFullMonth.nc);

    const paceWord = pacingChg != null
      ? (pacingChg >= 0 ? `ahead of target pace by +${pacingChg.toFixed(1)}%` : `behind target pace by ${pacingChg.toFixed(1)}%`)
      : 'tracking with consistent momentum';

    const momWord = momSameChg != null
      ? (momSameChg >= 0 ? `up +${momSameChg.toFixed(1)}% vs the same period last month` : `down ${momSameChg.toFixed(1)}% vs last month's same period`)
      : 'in comparison to last month';

    const landingWord = landingTargetChg != null
      ? (landingTargetChg >= 0 ? `achieving +${landingTargetChg.toFixed(1)}% above the monthly target` : `falling short of target by ${landingTargetChg.toFixed(1)}%`)
      : 'on track';

    const momLandingWord = landingMomChg != null
      ? (landingMomChg >= 0 ? `+${landingMomChg.toFixed(1)}% higher than last month's full total (${prevFullMonth.nc.toLocaleString()} NC)` : `${landingMomChg.toFixed(1)}% vs last month full`)
      : '';

    return {
      paceWord,
      momWord,
      landingWord,
      momLandingWord,
    };
  }, [currentMtd, prevSamePeriod, prevFullMonth, targets, forecast]);

  return (
    <div style={{ fontFamily: "'Montserrat', sans-serif", display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ── Top Control & Filter Bar ── */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '14px',
        border: '1px solid #E2E8F0',
        padding: '14px 20px',
        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
      }}>
        {/* Left Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          {/* Team Filter Pills */}
          <div className="form-field" style={{ margin: 0 }}>
            <label style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 800, color: '#64748B', letterSpacing: '0.05em' }}>By Team</label>
            <div style={{ display: 'flex', background: '#F1F5F9', padding: '3px', borderRadius: '8px', gap: '3px' }}>
              {(['All', 'Agency', 'KPV'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTeamFilter(t)}
                  style={{
                    padding: '5px 12px',
                    fontSize: '11px',
                    fontWeight: 700,
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    background: teamFilter === t ? (t === 'KPV' ? '#9E1B32' : '#0b53ac') : 'transparent',
                    color: teamFilter === t ? '#FFFFFF' : '#64748B',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {t === 'All' ? 'All Teams' : t}
                </button>
              ))}
            </div>
          </div>

          {/* Month Selector */}
          <div className="form-field" style={{ margin: 0 }}>
            <label style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 800, color: '#64748B', letterSpacing: '0.05em' }}>Select Month</label>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <select
                value={selectedMonth}
                onChange={e => handleMonthChange(e.target.value)}
                style={{
                  padding: '7px 32px 7px 12px',
                  fontSize: '12px',
                  fontWeight: 700,
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  color: '#0F172A',
                  cursor: 'pointer',
                  appearance: 'none',
                }}
              >
                {availableMonths.map(m => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
              <i className="fa-solid fa-chevron-down" style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: '#64748B', pointerEvents: 'none' }}></i>
            </div>
          </div>

          {/* Activity Filter */}
          <div className="form-field" style={{ margin: 0 }}>
            <label style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 800, color: '#64748B', letterSpacing: '0.05em' }}>Activity</label>
            <select
              value={activityFilter}
              onChange={e => setActivityFilter(e.target.value as any)}
              style={{ padding: '7px 12px', fontSize: '12px', fontWeight: 600, borderRadius: '8px', border: '1px solid #CBD5E1' }}
            >
              <option value="All Types">All Types</option>
              <option value="booth">Booth</option>
              <option value="event">Event</option>
            </select>
          </div>

          {/* Cost Types Filter */}
          <CostTypeFilter selected={costTypes} onChange={setCostTypes} />

          {/* As Of Day Stepper */}
          <div className="form-field" style={{ margin: 0 }}>
            <label style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 800, color: '#64748B', letterSpacing: '0.05em' }}>
              As Of Day ({effectiveCutoffDay}/{totalDaysInMonth})
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="range"
                min="1"
                max={totalDaysInMonth}
                value={effectiveCutoffDay}
                onChange={e => setAsOfDay(Number(e.target.value))}
                style={{ width: '100px', accentColor: theme.brandAccent, cursor: 'pointer' }}
                title={`Drag to simulate performance at Day ${effectiveCutoffDay}`}
              />
              <span style={{
                fontSize: '11px',
                fontWeight: 800,
                padding: '3px 8px',
                borderRadius: '6px',
                background: '#F1F5F9',
                color: '#0F172A',
                minWidth: '46px',
                textAlign: 'center',
              }}>
                Day {effectiveCutoffDay}
              </span>
              {isCurrentCalendarMonth && effectiveCutoffDay !== todayDayOfMonth && (
                <button
                  type="button"
                  onClick={() => setAsOfDay(todayDayOfMonth)}
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '3px 7px',
                    borderRadius: '4px',
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    color: theme.brandAccent,
                    cursor: 'pointer',
                  }}
                  title="Reset to today"
                >
                  Today
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Info Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#0F172A' }}>
              {selectedMonthLabel}
            </div>
            <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>
              {daysElapsed} days elapsed · {daysRemaining} days remaining ({timeProgressPct.toFixed(0)}%)
            </div>
          </div>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: theme.lightBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: theme.brandAccent,
            fontSize: '16px',
          }}>
            <i className="fa-solid fa-wand-magic-sparkles"></i>
          </div>
        </div>
      </div>

      {/* ── Executive Story Banner & Progress Runway ── */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '14px',
        border: `1px solid ${theme.border}`,
        boxShadow: '0 4px 16px rgba(15, 23, 42, 0.05)',
        padding: '18px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '300px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{
                fontSize: '10px',
                fontWeight: 800,
                padding: '3px 8px',
                borderRadius: '12px',
                background: theme.lightBg,
                color: theme.brandAccent,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}>
                Performance Story & Forecast
              </span>
              <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
                Cutoff: Day {effectiveCutoffDay} of {totalDaysInMonth}
              </span>
            </div>
            <h2 style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', margin: 0, lineHeight: 1.4 }}>
              Currently <span style={{ color: theme.brandAccent }}>{narrative.paceWord}</span> with <span style={{ fontWeight: 800 }}>{currentMtd.nc.toLocaleString()} NC</span>, {narrative.momWord}.
            </h2>
            <p style={{ fontSize: '13px', color: '#475569', margin: '6px 0 0', lineHeight: 1.5 }}>
              At the current momentum of <strong style={{ color: '#0F172A' }}>{Math.round(forecast.dailyRate.nc).toLocaleString()} NC/day</strong>, {selectedMonthLabel} is projected to land at <strong style={{ color: theme.brandAccent, fontSize: '15px' }}>{forecast.landing.nc.toLocaleString()} NC</strong> ({narrative.landingWord}{narrative.momLandingWord ? `, and ${narrative.momLandingWord}` : ''}).
            </p>
          </div>

          {/* Quick Target Pace Pill */}
          <div style={{
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '12px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            minWidth: '220px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 700, color: '#64748B' }}>
              <span>Monthly Target</span>
              <span style={{ color: '#0F172A' }}>{targets.fullAcq ? `${targets.fullAcq.toLocaleString()} NC` : 'Not Set'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 700, color: '#64748B' }}>
              <span>Prorated Pace</span>
              <span style={{ color: '#0F172A' }}>{targets.proratedAcq ? `${Math.round(targets.proratedAcq).toLocaleString()} NC` : 'N/A'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 700, color: '#64748B' }}>
              <span>Projected Landing</span>
              <span style={{ color: theme.brandAccent, fontWeight: 800 }}>{forecast.landing.nc.toLocaleString()} NC</span>
            </div>
          </div>
        </div>

        {/* Visual Runway Progress Bar */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: 700, color: '#64748B', marginBottom: '4px' }}>
            <span>Month Timeline Progress: {timeProgressPct.toFixed(1)}% ({daysElapsed}/{totalDaysInMonth} Days)</span>
            <span>
              Target Achievement Progress: {targets.fullAcq ? `${((currentMtd.nc / targets.fullAcq) * 100).toFixed(1)}%` : 'N/A'}
            </span>
          </div>
          <div style={{ height: '8px', background: '#E2E8F0', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
            {/* Target expected pace marker */}
            <div
              style={{
                position: 'absolute',
                left: `${timeProgressPct}%`,
                top: 0,
                bottom: 0,
                width: '2px',
                background: '#0F172A',
                zIndex: 2,
              }}
              title={`Expected pace marker at Day ${daysElapsed}`}
            />
            {/* Actual achieved progress */}
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, targets.fullAcq ? (currentMtd.nc / targets.fullAcq) * 100 : timeProgressPct)}%`,
                background: theme.brandGradient,
                borderRadius: '4px',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Main KPI Executive Cards Grid (Card Style with % and Arrows) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>

        {/* Card 1: New Customers (NC) & Total Customers */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '14px',
          border: `1px solid ${theme.border}`,
          boxShadow: '0 4px 14px rgba(15, 23, 42, 0.04)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Section A: Current MTD Performance */}
          <div style={{ padding: '18px 20px', borderBottom: '1px solid #F1F5F9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.05em' }}>
                New Customers (NC) · MTD
              </span>
              <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '12px', background: theme.lightBg, color: theme.brandAccent }}>
                Day 1–{effectiveCutoffDay}
              </span>
            </div>

            <div style={{ fontSize: '32px', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1.1, margin: '6px 0 10px' }}>
              {currentMtd.nc.toLocaleString()}
            </div>

            {/* Comparisons to Target Pace and Last Month Same Period */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {renderComparisonPill(currentMtd.nc, targets.proratedAcq, 'vs Target Pace')}
              {renderComparisonPill(currentMtd.nc, prevSamePeriod.nc, `vs ${prevMonthLabel} Same Period`)}
            </div>
          </div>

          {/* Section B: Forecast Landing (Full Month Runway) */}
          <div style={{ padding: '16px 20px', background: '#F8FAFC', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: theme.brandAccent, letterSpacing: '0.05em' }}>
                  <i className="fa-solid fa-chart-line" style={{ marginRight: '5px' }}></i>
                  Forecast Landing
                </span>
                <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 700 }}>
                  Run Rate: {Math.round(forecast.dailyRate.nc)}/day
                </span>
              </div>

              <div style={{ fontSize: '28px', fontWeight: 900, color: theme.brandAccent, margin: '6px 0 8px', letterSpacing: '-0.02em' }}>
                {forecast.landing.nc.toLocaleString()}
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', marginLeft: '6px' }}>est. total</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {renderComparisonPill(forecast.landing.nc, targets.fullAcq, 'vs Full Target')}
                {renderComparisonPill(forecast.landing.nc, prevFullMonth.nc, `vs ${prevMonthLabel} Full Month`)}
              </div>
            </div>

            {/* Bottom Sub-strip: Total Customers (NC + EC) */}
            <div style={{
              marginTop: '12px',
              paddingTop: '10px',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '11px',
            }}>
              <span style={{ color: '#64748B', fontWeight: 600 }}>Total Customers (NC+EC):</span>
              <strong style={{ color: '#0F172A', fontWeight: 800 }}>
                {currentMtd.totalAcq.toLocaleString()} → est. {forecast.landing.totalAcq.toLocaleString()}
              </strong>
            </div>
          </div>
        </div>

        {/* Card 2: Revenue (MIL LAK) */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '14px',
          border: `1px solid ${theme.border}`,
          boxShadow: '0 4px 14px rgba(15, 23, 42, 0.04)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Section A: Current MTD Performance */}
          <div style={{ padding: '18px 20px', borderBottom: '1px solid #F1F5F9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.05em' }}>
                Revenue · MTD
              </span>
              <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '12px', background: theme.lightBg, color: theme.brandAccent }}>
                Day 1–{effectiveCutoffDay}
              </span>
            </div>

            <div style={{ fontSize: '32px', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1.1, margin: '6px 0 10px' }}>
              {fmtDeckLAK(currentMtd.totalBuy)}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {renderComparisonPill(currentMtd.totalBuy, targets.proratedRev, 'vs Target Pace', { isCurrency: true })}
              {renderComparisonPill(currentMtd.totalBuy, prevSamePeriod.totalBuy, `vs ${prevMonthLabel} Same Period`, { isCurrency: true })}
            </div>
          </div>

          {/* Section B: Forecast Landing */}
          <div style={{ padding: '16px 20px', background: '#F8FAFC', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: theme.brandAccent, letterSpacing: '0.05em' }}>
                  <i className="fa-solid fa-coins" style={{ marginRight: '5px' }}></i>
                  Forecast Landing
                </span>
                <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 700 }}>
                  Run Rate: {fmtDeckLAK(forecast.dailyRate.totalBuy)}/day
                </span>
              </div>

              <div style={{ fontSize: '28px', fontWeight: 900, color: theme.brandAccent, margin: '6px 0 8px', letterSpacing: '-0.02em' }}>
                {fmtDeckLAK(forecast.landing.totalBuy)}
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', marginLeft: '6px' }}>est. total</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {renderComparisonPill(forecast.landing.totalBuy, targets.fullRev, 'vs Full Target', { isCurrency: true })}
                {renderComparisonPill(forecast.landing.totalBuy, prevFullMonth.totalBuy, `vs ${prevMonthLabel} Full Month`, { isCurrency: true })}
              </div>
            </div>

            {/* Bottom Sub-strip: NC vs EC Revenue */}
            <div style={{
              marginTop: '12px',
              paddingTop: '10px',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '11px',
            }}>
              <span style={{ color: '#64748B' }}>NC: <strong style={{ color: theme.brandAccent }}>{fmtDeckLAK(currentMtd.buyNew)}</strong></span>
              <span style={{ color: '#64748B' }}>EC: <strong style={{ color: '#0F172A' }}>{fmtDeckLAK(currentMtd.buyExisting)}</strong></span>
            </div>
          </div>
        </div>

        {/* Card 3: Total Cost / Spending (MIL LAK) */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '14px',
          border: `1px solid ${theme.border}`,
          boxShadow: '0 4px 14px rgba(15, 23, 42, 0.04)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Section A: Current MTD Performance */}
          <div style={{ padding: '18px 20px', borderBottom: '1px solid #F1F5F9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.05em' }}>
                Total Spending · MTD
              </span>
              <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '12px', background: theme.lightBg, color: theme.brandAccent }}>
                Day 1–{effectiveCutoffDay}
              </span>
            </div>

            <div style={{ fontSize: '32px', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1.1, margin: '6px 0 10px' }}>
              {fmtDeckLAK(currentMtd.totalCost)}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {renderComparisonPill(currentMtd.totalCost, targets.proratedCost, 'vs Budget Pace', { isCostMetric: true, isCurrency: true })}
              {renderComparisonPill(currentMtd.totalCost, prevSamePeriod.totalCost, `vs ${prevMonthLabel} Same Period`, { isCostMetric: true, isCurrency: true })}
            </div>
          </div>

          {/* Section B: Forecast Landing */}
          <div style={{ padding: '16px 20px', background: '#F8FAFC', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: theme.brandAccent, letterSpacing: '0.05em' }}>
                  <i className="fa-solid fa-receipt" style={{ marginRight: '5px' }}></i>
                  Forecast Landing
                </span>
                <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 700 }}>
                  Run Rate: {fmtDeckLAK(forecast.dailyRate.totalCost)}/day
                </span>
              </div>

              <div style={{ fontSize: '28px', fontWeight: 900, color: theme.brandAccent, margin: '6px 0 8px', letterSpacing: '-0.02em' }}>
                {fmtDeckLAK(forecast.landing.totalCost)}
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', marginLeft: '6px' }}>est. budget</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {renderComparisonPill(forecast.landing.totalCost, targets.fullCost, 'vs Total Budget', { isCostMetric: true, isCurrency: true })}
                {renderComparisonPill(forecast.landing.totalCost, prevFullMonth.totalCost, `vs ${prevMonthLabel} Full Month`, { isCostMetric: true, isCurrency: true })}
              </div>
            </div>

            {/* Bottom Sub-strip: Activation vs Merch Cost */}
            <div style={{
              marginTop: '12px',
              paddingTop: '10px',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '11px',
            }}>
              <span style={{ color: '#64748B' }}>Activation: <strong style={{ color: theme.brandAccent }}>{fmtDeckLAK(currentMtd.activationCost)}</strong></span>
              <span style={{ color: '#64748B' }}>Merch: <strong style={{ color: '#0F172A' }}>{fmtDeckLAK(currentMtd.merchCost)}</strong></span>
            </div>
          </div>
        </div>

        {/* Card 4: Efficiency Hero Banner (CPA & CPO) */}
        <div style={{
          background: theme.heroGradient,
          borderRadius: '14px',
          border: `1px solid ${theme.heroBorder}`,
          boxShadow: '0 8px 24px rgba(11, 83, 172, 0.22)',
          padding: '20px',
          color: '#FFFFFF',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}>
          {/* Top Half: Average CPA */}
          <div style={{ paddingBottom: '14px', borderBottom: '1px solid rgba(255, 255, 255, 0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.95 }}>
                Average CPA (Cost / NC)
              </span>
              <span style={{ fontSize: '9px', background: 'rgba(255,255,255,0.2)', padding: '2px 7px', borderRadius: '4px', fontWeight: 700 }}>
                MTD Actual
              </span>
            </div>

            <div style={{ fontSize: '30px', fontWeight: 900, margin: '6px 0 8px', letterSpacing: '-0.02em' }}>
              {fmtLAK(Math.round(currentMtd.cpa))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {renderComparisonPill(currentMtd.cpa, targets.targetCpa, 'vs Target CPA', { isCostMetric: true, isHero: true, isCurrency: true })}
              {renderComparisonPill(currentMtd.cpa, prevSamePeriod.cpa, `vs ${prevMonthLabel} Same Period`, { isCostMetric: true, isHero: true, isCurrency: true })}
            </div>
          </div>

          {/* Bottom Half: Forecast Landing CPA & CPO */}
          <div style={{ paddingTop: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.95 }}>
                Forecast CPA Landing
              </span>
              <span style={{ fontSize: '10px', fontWeight: 800, color: '#4ADE80' }}>
                {fmtLAK(Math.round(forecast.landing.cpa))}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {renderComparisonPill(forecast.landing.cpa, targets.targetCpa, 'vs Target', { isCostMetric: true, isHero: true, isCurrency: true })}
              {renderComparisonPill(forecast.landing.cpa, prevFullMonth.cpa, `vs ${prevMonthLabel} Full Month`, { isCostMetric: true, isHero: true, isCurrency: true })}
            </div>

            {/* CPO Footer */}
            <div style={{
              marginTop: '12px',
              paddingTop: '10px',
              borderTop: '1px solid rgba(255, 255, 255, 0.15)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '11px',
            }}>
              <span style={{ opacity: 0.85 }}>Average CPO (Buyer):</span>
              <strong style={{ fontWeight: 800 }}>{fmtLAK(Math.round(currentMtd.cpo))}</strong>
            </div>
          </div>
        </div>

      </div>

      {/* ── Cumulative Trajectory & Forecast Runway Chart ── */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '14px',
        border: `1px solid ${theme.border}`,
        boxShadow: '0 4px 16px rgba(15, 23, 42, 0.05)',
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              Cumulative Pace & Forecast Trajectory
            </h3>
            <p style={{ fontSize: '11px', color: '#64748B', margin: '3px 0 0', fontWeight: 500 }}>
              Actual cumulative trajectory up to Day {effectiveCutoffDay}, projected runway to Day {totalDaysInMonth}, and benchmark pacing lines.
            </p>
          </div>

          {/* Metric Selector Buttons */}
          <div style={{ display: 'flex', background: '#F1F5F9', padding: '3px', borderRadius: '8px', gap: '3px' }}>
            {([
              { key: 'nc', label: 'New Customer (NC)' },
              { key: 'totalAcq', label: 'Total Acq (NC+EC)' },
              { key: 'revenue', label: 'Revenue (Mil)' },
              { key: 'cost', label: 'Cost (Mil)' },
            ] as const).map(m => (
              <button
                key={m.key}
                type="button"
                onClick={() => setActiveChartMetric(m.key)}
                style={{
                  padding: '6px 12px',
                  fontSize: '11px',
                  fontWeight: 700,
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  background: activeChartMetric === m.key ? theme.brandAccent : 'transparent',
                  color: activeChartMetric === m.key ? '#FFFFFF' : '#64748B',
                  transition: 'all 0.15s ease',
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Chart Canvas */}
        <div style={{ height: '340px', width: '100%', position: 'relative' }}>
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>

      {/* ── Team Performance & Split Comparison Table ── */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '14px',
        border: '1px solid #E2E8F0',
        boxShadow: '0 4px 14px rgba(15, 23, 42, 0.04)',
        padding: '20px 24px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              Team Breakdown: MTD vs Last Month vs Forecast Landing
            </h3>
            <p style={{ fontSize: '11px', color: '#64748B', margin: '2px 0 0' }}>
              Comparative execution speed and run-rate projections across Agency and KPV teams.
            </p>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', color: '#64748B', fontWeight: 800, textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.05em' }}>
                <th style={{ padding: '10px 14px' }}>Team</th>
                <th style={{ padding: '10px 14px' }}>MTD (Day 1–{effectiveCutoffDay})</th>
                <th style={{ padding: '10px 14px' }}>vs LM Same Period</th>
                <th style={{ padding: '10px 14px' }}>Daily Run Rate</th>
                <th style={{ padding: '10px 14px' }}>Forecast Landing</th>
                <th style={{ padding: '10px 14px' }}>vs Full Target</th>
                <th style={{ padding: '10px 14px' }}>vs LM Full Month</th>
                <th style={{ padding: '10px 14px' }}>MTD Revenue</th>
                <th style={{ padding: '10px 14px' }}>MTD CPA</th>
              </tr>
            </thead>
            <tbody>
              {(['Agency', 'KPV'] as const).map(teamName => {
                const teamMtd = computeMetrics(currentMtdSubmissions.filter(s => normalizeTeam(s.team) === teamName));
                const teamPrevSame = computeMetrics(prevMonthSamePeriodSubmissions.filter(s => normalizeTeam(s.team) === teamName));
                const teamPrevFull = computeMetrics(prevMonthFullSubmissions.filter(s => normalizeTeam(s.team) === teamName));

                const teamDailyNc = teamMtd.nc / daysElapsed;
                const teamForecastLandingNc = Math.round(teamDailyNc * totalDaysInMonth);

                const teamTargetStart = `${selectedMonth}-01`;
                const teamTargetEnd = `${selectedMonth}-${String(totalDaysInMonth).padStart(2, '0')}`;
                const teamTarget = computePeriodTargets(targetsData, teamTargetStart, teamTargetEnd, teamName);

                const momSameChg = pctChange(teamMtd.nc, teamPrevSame.nc);
                const targetLandingChg = teamTarget.acq ? pctChange(teamForecastLandingNc, teamTarget.acq) : null;
                const momFullChg = pctChange(teamForecastLandingNc, teamPrevFull.nc);

                return (
                  <tr key={teamName} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 800, color: teamName === 'KPV' ? '#9E1B32' : '#0b53ac' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: teamName === 'KPV' ? '#9E1B32' : '#0b53ac' }} />
                        {teamName} Team
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: 800, color: '#0F172A', fontSize: '13px' }}>
                      {teamMtd.nc.toLocaleString()} NC
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {momSameChg !== null ? (
                        <span style={{
                          color: momSameChg >= 0 ? '#059669' : '#DC2626',
                          fontWeight: 700,
                        }}>
                          {momSameChg >= 0 ? '▲ +' : '▼ '}{momSameChg.toFixed(1)}%
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: '#475569' }}>
                      {Math.round(teamDailyNc)} NC/day
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: 800, color: teamName === 'KPV' ? '#9E1B32' : '#0b53ac', fontSize: '13px' }}>
                      {teamForecastLandingNc.toLocaleString()} NC
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {targetLandingChg !== null ? (
                        <span style={{
                          color: targetLandingChg >= 0 ? '#059669' : '#DC2626',
                          fontWeight: 700,
                        }}>
                          {targetLandingChg >= 0 ? '▲ +' : '▼ '}{targetLandingChg.toFixed(1)}%
                        </span>
                      ) : <span style={{ color: '#94A3B8' }}>No target</span>}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {momFullChg !== null ? (
                        <span style={{
                          color: momFullChg >= 0 ? '#059669' : '#DC2626',
                          fontWeight: 700,
                        }}>
                          {momFullChg >= 0 ? '▲ +' : '▼ '}{momFullChg.toFixed(1)}%
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0F172A' }}>
                      {fmtDeckLAK(teamMtd.totalBuy)}
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0F172A' }}>
                      {fmtLAK(Math.round(teamMtd.cpa))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

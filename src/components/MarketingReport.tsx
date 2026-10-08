import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import type { Submission, CostTypeKey } from '../lib/submissions';
import {
  fmtLAK,
  normalizeActivityType,
  normalizeTeam,
  COST_TYPES,
  ALL_COST_TYPES,
  normalizeCostTypes,
  locationLabel,
  compareLocations,
  inLocationFilter,
  normalizeLocation,
} from '../lib/submissions';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

// ── Fallback KPI targets ──────────────────────────────────────────────────
const FALLBACK_TARGETS = {
  acq: 2500,
  cpa: 100_000,
  cpo: 60_000,
  cpao: 130_000,
};

// ── Formatters for Deck Presentation ──────────────────────────────────────
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

const pctChange = (curr: number, prev: number): number | null => {
  if (!prev || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
};

// ── Year and Week helper (Saturday to Sunday 52 weeks) ──────────────────────
interface WeekOption {
  key: string;
  label: string;
  startDate: string;
  endDate: string;
  weekNum: number;
}

const generate52Weeks = (year: number): WeekOption[] => {
  const weeks: WeekOption[] = [];
  // Find first Saturday of the year
  const d = new Date(year, 0, 1);
  while (d.getDay() !== 6) { // 6 = Saturday
    d.setDate(d.getDate() + 1);
  }

  for (let w = 1; w <= 52; w++) {
    const sDate = new Date(d);
    // End date is Sunday (the following Sunday: 8 days later, or next Sunday)
    const eDate = new Date(d);
    eDate.setDate(eDate.getDate() + 8); // Sat to next Sun inclusive (9-day roadshow window)

    const sIso = sDate.toISOString().slice(0, 10);
    const eIso = eDate.toISOString().slice(0, 10);
    const sFmt = sDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    const eFmt = eDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

    weeks.push({
      key: `W${w}`,
      label: `W${w}'${String(year).slice(2)} (${sFmt} – ${eFmt})`,
      startDate: sIso,
      endDate: eIso,
      weekNum: w,
    });

    // Advance 7 days for next week's Saturday
    d.setDate(d.getDate() + 7);
  }
  return weeks;
};

interface QuarterOption {
  key: string;
  label: string;
  startDate: string;
  endDate: string;
  months: string[];
}

const generateQuarters = (year: number): QuarterOption[] => [
  { key: `Q4'${String(year).slice(2)}`, label: `Q4'${String(year).slice(2)} (Oct – Dec)`, startDate: `${year}-10-01`, endDate: `${year}-12-31`, months: ['Oct', 'Nov', 'Dec'] },
  { key: `Q3'${String(year).slice(2)}`, label: `Q3'${String(year).slice(2)} (Jul – Sep)`, startDate: `${year}-07-01`, endDate: `${year}-09-30`, months: ['Jul', 'Aug', 'Sep'] },
  { key: `Q2'${String(year).slice(2)}`, label: `Q2'${String(year).slice(2)} (Apr – Jun)`, startDate: `${year}-04-01`, endDate: `${year}-06-30`, months: ['Apr', 'May', 'Jun'] },
  { key: `Q1'${String(year).slice(2)}`, label: `Q1'${String(year).slice(2)} (Jan – Mar)`, startDate: `${year}-01-01`, endDate: `${year}-03-31`, months: ['Jan', 'Feb', 'Mar'] },
];

interface MonthOption {
  key: string;
  label: string;
  startDate: string;
  endDate: string;
}

const generateMonths = (year: number): MonthOption[] => {
  const months: MonthOption[] = [];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  for (let m = 11; m >= 0; m--) {
    const sDate = `${year}-${String(m + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, m + 1, 0).getDate();
    const eDate = `${year}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    months.push({
      key: `${monthNames[m]}'${String(year).slice(2)}`,
      label: `${monthNames[m]}'${String(year).slice(2)}`,
      startDate: sDate,
      endDate: eDate,
    });
  }
  return months;
};

// ── Multi-select Cost Type Filter ─────────────────────────────────────────
function CostTypeFilter({ selected, onChange }: { selected: CostTypeKey[]; onChange: (next: CostTypeKey[]) => void }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
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
      onChange(ALL_COST_TYPES.filter(k => selected.includes(k) || k === key));
    }
  };

  return (
    <div className="form-field" style={{ margin: 0, position: 'relative' }} ref={boxRef}>
      <label style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--txt-dim)' }}>Cost Type</label>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => setOpen(o => !o)}
        style={{ padding: '6px 11px', fontSize: '11px', width: 'auto', fontWeight: 600, height: '34px' }}
      >
        <i className="fa-solid fa-layer-group" style={{ fontSize: '11px', opacity: 0.8 }}></i>
        <span>{summary}</span>
        <i className={`fa-solid ${open ? 'fa-chevron-up' : 'fa-chevron-down'}`} style={{ fontSize: '8px', opacity: 0.7 }}></i>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 5px)', left: 0, zIndex: 50,
            minWidth: '240px', background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '10px', boxShadow: 'var(--shadow)', padding: '8px',
          }}
        >
          {COST_TYPES.map(c => (
            <label
              key={c.key}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px',
                borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: 'var(--txt-main)',
              }}
            >
              <input
                type="checkbox"
                checked={selected.includes(c.key)}
                onChange={() => toggle(c.key)}
                style={{ width: '13px', height: '13px', accentColor: 'var(--accent)' }}
              />
              {c.label}
            </label>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', marginTop: '6px', paddingTop: '6px', paddingLeft: '8px' }}>
            <span style={{ fontSize: '9px', color: 'var(--txt-dim)' }}>Drives Total Cost</span>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onChange([...ALL_COST_TYPES])}
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

// ── Multi-select Location Filter ──────────────────────────────────────────
function LocationFilter({
  options, counts, selected, onChange,
}: {
  options: string[];
  counts: Record<string, number>;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => { if (!open) setQuery(''); }, [open]);

  const q = query.trim().toLowerCase();
  const visible = q ? options.filter(v => locationLabel(v).toLowerCase().includes(q)) : options;

  const toggle = (v: string) => {
    onChange(selected.includes(v) ? selected.filter(k => k !== v) : [...selected, v]);
  };

  const isActive = selected.length > 0;
  const summary = selected.length === 0
    ? `All Locations (${options.length})`
    : selected.length === 1
      ? locationLabel(selected[0])
      : `${selected.length} Locations`;

  return (
    <div className="form-field" style={{ margin: 0, position: 'relative' }} ref={boxRef}>
      <label style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--txt-dim)' }}>Location</label>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => setOpen(o => !o)}
        style={{
          padding: '6px 11px', fontSize: '11px', width: 'auto', fontWeight: 600,
          maxWidth: '220px', height: '34px',
          borderColor: isActive ? 'var(--accent)' : undefined,
          color: isActive ? 'var(--accent)' : undefined,
        }}
      >
        <i className="fa-solid fa-location-dot" style={{ fontSize: '11px', opacity: 0.8 }}></i>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</span>
        <i className={`fa-solid ${open ? 'fa-chevron-up' : 'fa-chevron-down'}`} style={{ fontSize: '8px', opacity: 0.7 }}></i>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 5px)', left: 0, zIndex: 50,
            width: '280px', background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '10px', boxShadow: 'var(--shadow)', padding: '8px',
          }}
        >
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search location…"
            style={{ padding: '5px 8px', fontSize: '11px', marginBottom: '6px' }}
          />
          <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
            {visible.map(v => (
              <label
                key={v}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px',
                  borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 600, color: 'var(--txt-main)',
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(v)}
                  onChange={() => toggle(v)}
                  style={{ width: '13px', height: '13px', accentColor: 'var(--accent)' }}
                />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {locationLabel(v)}
                </span>
                <span style={{ fontSize: '9px', color: 'var(--txt-dim)' }}>{counts[v] || 0}</span>
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', marginTop: '6px', paddingTop: '6px', paddingLeft: '8px' }}>
            <span style={{ fontSize: '9px', color: 'var(--txt-dim)' }}>
              {selected.length === 0 ? 'All locations' : `${selected.length} selected`}
            </span>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onChange([])}
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

// ── Main Marketing Report Component ───────────────────────────────────────
export default function MarketingReport({
  submissions,
  targetsData,
}: {
  submissions: Submission[];
  targetsData: any[];
}) {
  const currentYear = new Date().getFullYear();

  // Filters State
  const [teamFilter, setTeamFilter] = useState<'All' | 'Agency' | 'KPV'>('All');
  const [dateMode, setDateMode] = useState<'quarter' | 'month' | 'week' | 'custom'>('quarter');
  const [selectedQuarter, setSelectedQuarter] = useState<string>(`Q3'${String(currentYear).slice(2)}`);
  const [selectedMonth, setSelectedMonth] = useState<string>(`Oct'${String(currentYear).slice(2)}`);
  const [selectedWeek, setSelectedWeek] = useState<string>('W41');
  const [customStart, setCustomStart] = useState<string>(`${currentYear}-10-01`);
  const [customEnd, setCustomEnd] = useState<string>(`${currentYear}-10-31`);
  const [activityFilter, setActivityFilter] = useState<'All Types' | 'booth' | 'event'>('All Types');
  const [locationFilter, setLocationFilter] = useState<string[]>([]);
  const [costTypes, setCostTypes] = useState<CostTypeKey[]>(ALL_COST_TYPES);

  // Insights custom note state (defaults to blank as requested)
  const [insightNote, setInsightNote] = useState<string>('');
  const [isSlideFullscreen, setIsSlideFullscreen] = useState(false);

  // Pre-calculated options
  const quarters = useMemo(() => generateQuarters(currentYear), [currentYear]);
  const months = useMemo(() => generateMonths(currentYear), [currentYear]);
  const weeks52 = useMemo(() => generate52Weeks(currentYear), [currentYear]);

  // Derive Current Start & End Date based on Date Mode
  const { startDate, endDate, periodTitle, prevPeriodLabel, prevStartDate, prevEndDate } = useMemo(() => {
    let start = '';
    let end = '';
    let title = '';
    let prevLabel = 'vs prev';
    let prevStart = '';
    let prevEnd = '';

    if (dateMode === 'quarter') {
      const q = quarters.find(item => item.key === selectedQuarter) || quarters[1];
      start = q.startDate;
      end = q.endDate;
      title = selectedQuarter;

      // Determine previous quarter
      const qIndex = quarters.findIndex(item => item.key === selectedQuarter);
      if (qIndex !== -1 && qIndex + 1 < quarters.length) {
        const pq = quarters[qIndex + 1];
        prevLabel = `vs ${pq.key.slice(0, 2)}`;
        prevStart = pq.startDate;
        prevEnd = pq.endDate;
      } else {
        prevLabel = 'vs prev Q';
      }
    } else if (dateMode === 'month') {
      const m = months.find(item => item.key === selectedMonth) || months[0];
      start = m.startDate;
      end = m.endDate;
      title = selectedMonth;

      const mIndex = months.findIndex(item => item.key === selectedMonth);
      if (mIndex !== -1 && mIndex + 1 < months.length) {
        const pm = months[mIndex + 1];
        prevLabel = `vs ${pm.key.slice(0, 3)}`;
        prevStart = pm.startDate;
        prevEnd = pm.endDate;
      } else {
        prevLabel = 'vs prev M';
      }
    } else if (dateMode === 'week') {
      const w = weeks52.find(item => item.key === selectedWeek) || weeks52[40] || weeks52[0];
      start = w.startDate;
      end = w.endDate;
      title = `${selectedWeek}'${String(currentYear).slice(2)}`;

      const wNum = w.weekNum;
      if (wNum > 1) {
        const pw = weeks52.find(item => item.weekNum === wNum - 1);
        if (pw) {
          prevLabel = `vs W${wNum - 1}`;
          prevStart = pw.startDate;
          prevEnd = pw.endDate;
        }
      } else {
        prevLabel = 'vs prev W';
      }
    } else {
      // Custom
      start = customStart;
      end = customEnd;
      title = `${start.slice(5)} to ${end.slice(5)}`;
      prevLabel = 'vs prev';
      if (start && end) {
        const d1 = new Date(start + 'T00:00:00');
        const d2 = new Date(end + 'T00:00:00');
        const diffDays = Math.ceil(Math.abs(d2.getTime() - d1.getTime()) / 86400000) + 1;
        const pe = new Date(d1.getTime());
        pe.setDate(pe.getDate() - 1);
        const ps = new Date(pe.getTime());
        ps.setDate(ps.getDate() - (diffDays - 1));
        prevStart = ps.toISOString().slice(0, 10);
        prevEnd = pe.toISOString().slice(0, 10);
      }
    }

    return {
      startDate: start,
      endDate: end,
      periodTitle: title,
      prevPeriodLabel: prevLabel,
      prevStartDate: prevStart,
      prevEndDate: prevEnd,
    };
  }, [dateMode, selectedQuarter, selectedMonth, selectedWeek, customStart, customEnd, quarters, months, weeks52, currentYear]);

  // Derived Location options for dropdown
  const { locationOptions, locationCounts } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of submissions) {
      if ((startDate && s.date < startDate) || (endDate && s.date > endDate)) continue;
      const key = normalizeLocation(s.branch);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const options = [...counts.keys()].sort(compareLocations);
    return { locationOptions: options, locationCounts: Object.fromEntries(counts) };
  }, [submissions, startDate, endDate]);

  // Filtered rows for current period
  const filtered = useMemo(() => {
    return submissions.filter(s => {
      const inRange = (!startDate || s.date >= startDate) && (!endDate || s.date <= endDate);
      const sTeam = normalizeTeam(s.team);
      const inTeam = teamFilter === 'All' || sTeam === teamFilter;
      const inActivity = activityFilter === 'All Types' || normalizeActivityType(s.activity_type) === activityFilter;
      const inLocation = inLocationFilter(s.branch, locationFilter);
      return inRange && inTeam && inActivity && inLocation;
    });
  }, [submissions, startDate, endDate, teamFilter, activityFilter, locationFilter]);

  // Filtered rows for previous period
  const prevFiltered = useMemo(() => {
    if (!prevStartDate || !prevEndDate) return [] as Submission[];
    return submissions.filter(s => {
      const inRange = s.date >= prevStartDate && s.date <= prevEndDate;
      const sTeam = normalizeTeam(s.team);
      const inTeam = teamFilter === 'All' || sTeam === teamFilter;
      const inActivity = activityFilter === 'All Types' || normalizeActivityType(s.activity_type) === activityFilter;
      const inLocation = inLocationFilter(s.branch, locationFilter);
      return inRange && inTeam && inActivity && inLocation;
    });
  }, [submissions, prevStartDate, prevEndDate, teamFilter, activityFilter, locationFilter]);

  // KPI Aggregator
  const aggregate = (rows: Submission[], types: CostTypeKey[]) => {
    let nc = 0, ec = 0, buyNew = 0, buyExisting = 0;
    let teamCost = 0, merchCost = 0, sponsorCost = 0, prodCost = 0, nrp = 0;
    for (const s of rows) {
      nc += s.new_register || 0;
      ec += s.existing_users || 0;
      buyNew += s.buy_value_new || 0;
      buyExisting += s.buy_value_existing || 0;
      teamCost += Number(s.team_cost) || 0;
      merchCost += Number(s.merch_cost) || 0;
      sponsorCost += Number(s.sponsorship_cost) || 0;
      prodCost += Number(s.prod_cost) || 0;
      nrp += s.new_reg_purchased || 0;
    }
    const totalBuy = buyNew + buyExisting;
    const totalCost = (types.includes('service') ? teamCost : 0)
      + (types.includes('merch') ? merchCost : 0)
      + (types.includes('sponsorship') ? sponsorCost : 0)
      + (types.includes('prod') ? prodCost : 0);

    const totalAcq = nc + ec;
    // Activation cost = Service (team) + Production + Sponsorship
    const activationCost = (types.includes('service') ? teamCost : 0)
      + (types.includes('prod') ? prodCost : 0)
      + (types.includes('sponsorship') ? sponsorCost : 0);
    const mCost = types.includes('merch') ? merchCost : 0;

    return {
      nc,
      ec,
      totalAcq,
      buyNew,
      buyExisting,
      totalBuy,
      totalCost,
      activationCost,
      merchCost: mCost,
      nrp,
      cpa: nc > 0 ? totalCost / nc : 0,
      cpo: (nrp + ec) > 0 ? totalCost / (nrp + ec) : 0,
    };
  };

  const curr = useMemo(() => aggregate(filtered, costTypes), [filtered, costTypes]);
  const prev = useMemo(() => aggregate(prevFiltered, costTypes), [prevFiltered, costTypes]);

  // Targets calculation for this window
  const targets = useMemo(() => {
    let acq = 0;
    let cpaSum = 0, cpoSum = 0;
    let cpaCount = 0, cpoCount = 0;

    if (targetsData.length > 0 && startDate && endDate) {
      const startYM = startDate.substring(0, 7);
      const endYM = endDate.substring(0, 7);

      for (const t of targetsData) {
        if (!t.month) continue;
        const tYM = t.month.substring(0, 7);
        if (tYM >= startYM && tYM <= endYM) {
          if (teamFilter === 'All' || t.team === teamFilter || t.team === `${teamFilter} Team`) {
            acq += (t.new_reg_target || 0);
            if (t.cpa_target > 0) { cpaSum += t.cpa_target; cpaCount++; }
            if (t.cpo_target > 0) { cpoSum += t.cpo_target; cpoCount++; }
          }
        }
      }
    }
    return {
      acq: acq > 0 ? acq : FALLBACK_TARGETS.acq,
      cpa: cpaCount > 0 ? cpaSum / cpaCount : FALLBACK_TARGETS.cpa,
      cpo: cpoCount > 0 ? cpoSum / cpoCount : FALLBACK_TARGETS.cpo,
    };
  }, [targetsData, startDate, endDate, teamFilter]);

  // ── Color Mood & Tone Theme ─────────────────────────────────────────────
  // When team is KPV: Sophisticated light warm wine/rose crimson (NOT negative/danger red).
  // When All or Agency: Executive navy & royal blue.
  const isKPV = teamFilter === 'KPV';
  const theme = useMemo(() => {
    if (isKPV) {
      return {
        brandName: 'KPV',
        bannerGradient: 'linear-gradient(135deg, #701A24 0%, #881337 50%, #9E1B32 100%)',
        accentSidebar: 'linear-gradient(180deg, #701A24 0%, #9E1B32 100%)',
        headerTitleColor: '#701A24',
        subStripBg: '#FFF1F2',
        subStripBorder: '#FFE4E6',
        subStripHeaderBg: '#9E1B32',
        subStripHeaderTxt: '#FFFFFF',
        heroCardBg: 'linear-gradient(135deg, #5C131E 0%, #7E1727 50%, #9E1B32 100%)',
        heroCardBorder: '#701A24',
        chartNC: '#9E1B32',
        chartEC: '#FDA4AF',
        chartCPA: '#701A24',
        chartCPO: '#F43F5E',
        chartRevNC: '#9E1B32',
        chartRevEC: '#FDA4AF',
        chartCostAct: '#701A24',
        chartCostMerch: '#FDA4AF',
        cardBg: '#FFFFFF',
        cardBorder: '#FECDD3',
        kpiNumColor: '#0F172A',
        iconColor: '#9E1B32',
        subHighlight: '#9E1B32',
      };
    }
    return {
      brandName: teamFilter === 'Agency' ? 'Agency' : 'Overview',
      bannerGradient: 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 50%, #2563EB 100%)',
      accentSidebar: 'linear-gradient(180deg, #0F172A 0%, #1E3A8A 100%)',
      headerTitleColor: '#0F2C59',
      subStripBg: '#F0F7FF',
      subStripBorder: '#DBEAFE',
      subStripHeaderBg: '#1E3A8A',
      subStripHeaderTxt: '#FFFFFF',
      heroCardBg: 'linear-gradient(135deg, #0A1931 0%, #153462 50%, #1E3A8A 100%)',
      heroCardBorder: '#1E3A8A',
      chartNC: '#1E3A8A',
      chartEC: '#93C5FD',
      chartCPA: '#0A1931',
      chartCPO: '#3B82F6',
      chartRevNC: '#1E3A8A',
      chartRevEC: '#93C5FD',
      chartCostAct: '#0A1931',
      chartCostMerch: '#93C5FD',
      cardBg: '#FFFFFF',
      cardBorder: '#D4DDF0',
      kpiNumColor: '#0F172A',
      iconColor: '#1E3A8A',
      subHighlight: '#1E3A8A',
    };
  }, [isKPV, teamFilter]);

  // ── Delta Badge Helpers ──────────────────────────────────────────────────
  const renderDelta = (
    currentVal: number,
    compareVal: number,
    label: string,
    isCostMetric = false,
    isCurrency = false
  ) => {
    const chg = pctChange(currentVal, compareVal);
    if (chg === null) {
      return (
        <div style={{ fontSize: '11px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>—</span> {label}
        </div>
      );
    }
    const delta = currentVal - compareVal;
    // For cost metrics (CPA/CPO/Cost): lower is good (negative change = green).
    // For Customer/Revenue: higher is good (positive change = green).
    const isGood = isCostMetric ? chg <= 0 : chg >= 0;
    const arrow = chg >= 0 ? '▲' : '▼';
    const color = isGood ? '#10B981' : '#E11D48'; // vibrant emerald green vs elegant ruby red
    const absPct = Math.abs(chg).toFixed(1);
    const sign = delta > 0 ? '+' : '−';
    const gapStr = isCurrency
      ? fmtDeckLAK(Math.abs(delta))
      : Math.abs(Math.round(delta)).toLocaleString();

    return (
      <div style={{ fontSize: '11px', fontWeight: 600, color, display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span>{arrow} {absPct}% {label}</span>
        <span style={{ opacity: 0.85, fontWeight: 500 }}>({sign}{gapStr})</span>
      </div>
    );
  };

  // ── 2x2 Sub-Interval Charts Data ─────────────────────────────────────────
  const chartIntervals = useMemo(() => {
    // Generate buckets depending on dateMode
    if (dateMode === 'quarter') {
      const q = quarters.find(item => item.key === selectedQuarter) || quarters[1];
      const monthNames = q.months; // ['Jul', 'Aug', 'Sep']
      const qYear = selectedQuarter.split("'")[1] ? `20${selectedQuarter.split("'")[1]}` : `${currentYear}`;

      return monthNames.map(mName => {
        const mIdx = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(mName) + 1;
        const prefix = `${qYear}-${String(mIdx).padStart(2, '0')}`;
        const rows = filtered.filter(s => s.date.startsWith(prefix));
        const agg = aggregate(rows, costTypes);
        return { label: mName, agg };
      });
    }

    if (dateMode === 'month') {
      // 4 weekly blocks in the month
      const m = months.find(item => item.key === selectedMonth) || months[0];
      const [mPrefix] = m.startDate.split('-'); // year
      const mIdx = m.startDate.slice(5, 7);
      const blocks = [
        { label: 'W1', start: `${mPrefix}-${mIdx}-01`, end: `${mPrefix}-${mIdx}-07` },
        { label: 'W2', start: `${mPrefix}-${mIdx}-08`, end: `${mPrefix}-${mIdx}-14` },
        { label: 'W3', start: `${mPrefix}-${mIdx}-15`, end: `${mPrefix}-${mIdx}-21` },
        { label: 'W4', start: `${mPrefix}-${mIdx}-22`, end: `${mPrefix}-${mIdx}-28` },
        { label: 'W5', start: `${mPrefix}-${mIdx}-29`, end: m.endDate },
      ];
      return blocks.map(b => {
        const rows = filtered.filter(s => s.date >= b.start && s.date <= b.end);
        const agg = aggregate(rows, costTypes);
        return { label: b.label, agg };
      });
    }

    if (dateMode === 'week') {
      // 7 daily buckets (Sat to Fri/Sun)
      const sD = new Date(startDate + 'T00:00:00');
      const buckets = [];
      for (let i = 0; i < 7; i++) {
        const curD = new Date(sD);
        curD.setDate(curD.getDate() + i);
        const iso = curD.toISOString().slice(0, 10);
        const dayLabel = curD.toLocaleDateString('en-GB', { weekday: 'short' });
        const rows = filtered.filter(s => s.date === iso);
        const agg = aggregate(rows, costTypes);
        buckets.push({ label: `${dayLabel} ${curD.getDate()}`, agg });
      }
      return buckets;
    }

    // Custom fallback: split into up to 5 even slices
    return [
      { label: 'Period', agg: curr },
    ];
  }, [dateMode, selectedQuarter, selectedMonth, startDate, filtered, costTypes, quarters, months, currentYear, curr]);

  const chartLabels = chartIntervals.map(c => c.label);

  const chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        align: 'end' as const,
        labels: {
          boxWidth: 9,
          boxHeight: 9,
          font: { size: 10, weight: '600' },
          color: '#64748B',
          padding: 8,
        },
      },
      tooltip: {
        backgroundColor: '#0F172A',
        titleFont: { size: 11, weight: 'bold' },
        bodyFont: { size: 11 },
        padding: 8,
        cornerRadius: 6,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 10, weight: '600' }, color: '#64748B' },
      },
      y: {
        grid: { color: 'rgba(203, 213, 225, 0.4)' },
        ticks: {
          font: { size: 9 },
          color: '#64748B',
          callback: (val: any) => (val >= 1000 ? `${Math.round(val / 1000)}k` : val),
        },
      },
    },
  };

  // 1. Acquisition Chart
  const chartAcqData = {
    labels: chartLabels,
    datasets: [
      {
        label: 'NC',
        data: chartIntervals.map(c => c.agg.nc),
        backgroundColor: theme.chartNC,
        borderRadius: 4,
      },
      {
        label: 'EC',
        data: chartIntervals.map(c => c.agg.ec),
        backgroundColor: theme.chartEC,
        borderRadius: 4,
      },
    ],
  };

  // 2. CPA / CPO Chart
  const chartCpaCpoData = {
    labels: chartLabels,
    datasets: [
      {
        label: 'CPA',
        data: chartIntervals.map(c => Math.round(c.agg.cpa)),
        backgroundColor: theme.chartCPA,
        borderRadius: 4,
      },
      {
        label: 'CPO',
        data: chartIntervals.map(c => Math.round(c.agg.cpo)),
        backgroundColor: theme.chartCPO,
        borderRadius: 4,
      },
    ],
  };

  // 3. Revenue Chart (in Mil LAK)
  const chartRevData = {
    labels: chartLabels,
    datasets: [
      {
        label: 'NC',
        data: chartIntervals.map(c => +(c.agg.buyNew / 1_000_000).toFixed(1)),
        backgroundColor: theme.chartRevNC,
        borderRadius: 4,
      },
      {
        label: 'EC',
        data: chartIntervals.map(c => +(c.agg.buyExisting / 1_000_000).toFixed(1)),
        backgroundColor: theme.chartRevEC,
        borderRadius: 4,
      },
    ],
  };

  // 4. Cost Chart (in Mil LAK)
  const chartCostData = {
    labels: chartLabels,
    datasets: [
      {
        label: 'Activation',
        data: chartIntervals.map(c => +(c.agg.activationCost / 1_000_000).toFixed(1)),
        backgroundColor: theme.chartCostAct,
        borderRadius: 4,
      },
      {
        label: 'Merch',
        data: chartIntervals.map(c => +(c.agg.merchCost / 1_000_000).toFixed(1)),
        backgroundColor: theme.chartCostMerch,
        borderRadius: 4,
      },
    ],
  };

  // Auto-generate draft bullet points if user clicks draft button
  const handleAutoDraftInsights = () => {
    const acqDelta = pctChange(curr.totalAcq, prev.totalAcq);
    const revDelta = pctChange(curr.totalBuy, prev.totalBuy);
    const cpaDelta = pctChange(curr.cpa, prev.cpa);

    const draft = [
      `1. Total customer acquisition reached ${curr.totalAcq.toLocaleString()} (${acqDelta !== null ? `${acqDelta >= 0 ? '+' : ''}${acqDelta.toFixed(1)}% ${prevPeriodLabel}` : 'steady'}), with NC at ${curr.nc.toLocaleString()} and EC at ${curr.ec.toLocaleString()}.`,
      `2. Revenue generated was ${fmtDeckLAK(curr.totalBuy)} (${revDelta !== null ? `${revDelta >= 0 ? '+' : ''}${revDelta.toFixed(1)}% ${prevPeriodLabel}` : ''}) against total operational spending of ${fmtDeckLAK(curr.totalCost)}.`,
      `3. Efficiency metrics: Average CPA closed at ${fmtLAK(Math.round(curr.cpa))} (${cpaDelta !== null ? `${cpaDelta <= 0 ? 'favorable' : 'increased'} vs prev` : ''}) and CPO at ${fmtLAK(Math.round(curr.cpo))}.`,
    ].join('\n\n');

    setInsightNote(draft);
  };

  return (
    <div style={{ paddingBottom: '30px' }}>
      {/* ── Filter Bar ── */}
      <div
        className="card"
        style={{
          marginBottom: '20px',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          flexWrap: 'wrap',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
        }}
      >
        {/* Filter 1: Team */}
        <div className="form-field" style={{ margin: 0 }}>
          <label style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--txt-dim)' }}>By Team</label>
          <div style={{ display: 'flex', background: 'var(--input-bg)', padding: '2px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            {(['All', 'Agency', 'KPV'] as const).map(t => {
              const active = teamFilter === t;
              const isKpvTab = t === 'KPV';
              return (
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
                    background: active
                      ? (isKpvTab ? '#9E1B32' : 'var(--accent)')
                      : 'transparent',
                    color: active ? '#FFFFFF' : 'var(--txt-sub)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {t === 'All' ? 'All Teams' : t}
                </button>
              );
            })}
          </div>
        </div>

        {/* Filter 2: Date Mode & Presets */}
        <div className="form-field" style={{ margin: 0 }}>
          <label style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--txt-dim)' }}>Date View</label>
          <div style={{ display: 'flex', background: 'var(--input-bg)', padding: '2px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            {(['quarter', 'month', 'week', 'custom'] as const).map(m => {
              const active = dateMode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDateMode(m)}
                  style={{
                    padding: '5px 11px',
                    fontSize: '11px',
                    fontWeight: 700,
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    background: active ? (isKPV ? '#9E1B32' : 'var(--accent)') : 'transparent',
                    color: active ? '#FFFFFF' : 'var(--txt-sub)',
                    transition: 'all 0.15s ease',
                    textTransform: 'capitalize',
                  }}
                >
                  {m === 'custom' ? 'Date From-To' : m}
                </button>
              );
            })}
          </div>
        </div>

        {/* Date Selector depending on Mode */}
        {dateMode === 'quarter' && (
          <div className="form-field" style={{ margin: 0 }}>
            <label style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--txt-dim)' }}>Select Quarter</label>
            <select
              value={selectedQuarter}
              onChange={e => setSelectedQuarter(e.target.value)}
              style={{ padding: '6px 11px', fontSize: '12px', width: 'auto', height: '34px', fontWeight: 600 }}
            >
              {quarters.map(q => (
                <option key={q.key} value={q.key}>{q.label}</option>
              ))}
            </select>
          </div>
        )}

        {dateMode === 'month' && (
          <div className="form-field" style={{ margin: 0 }}>
            <label style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--txt-dim)' }}>Select Month (Mmm'yy)</label>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              style={{ padding: '6px 11px', fontSize: '12px', width: 'auto', height: '34px', fontWeight: 600 }}
            >
              {months.map(m => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
          </div>
        )}

        {dateMode === 'week' && (
          <div className="form-field" style={{ margin: 0 }}>
            <label style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--txt-dim)' }}>By Week (Sat–Sun 52 W)</label>
            <select
              value={selectedWeek}
              onChange={e => setSelectedWeek(e.target.value)}
              style={{ padding: '6px 11px', fontSize: '12px', width: 'auto', height: '34px', fontWeight: 600 }}
            >
              {weeks52.map(w => (
                <option key={w.key} value={w.key}>{w.label}</option>
              ))}
            </select>
          </div>
        )}

        {dateMode === 'custom' && (
          <>
            <div className="form-field" style={{ margin: 0 }}>
              <label style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--txt-dim)' }}>Date From</label>
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                style={{ padding: '6px 10px', fontSize: '12px', width: 'auto', height: '34px' }}
              />
            </div>
            <div className="form-field" style={{ margin: 0 }}>
              <label style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--txt-dim)' }}>Date To</label>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                style={{ padding: '6px 10px', fontSize: '12px', width: 'auto', height: '34px' }}
              />
            </div>
          </>
        )}

        {/* Filter 3: Activity */}
        <div className="form-field" style={{ margin: 0 }}>
          <label style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--txt-dim)' }}>Activity</label>
          <select
            value={activityFilter}
            onChange={e => setActivityFilter(e.target.value as any)}
            style={{ padding: '6px 11px', fontSize: '12px', width: 'auto', height: '34px', fontWeight: 600 }}
          >
            <option>All Types</option>
            <option value="booth">Booth</option>
            <option value="event">Event</option>
          </select>
        </div>

        {/* Filter 4: Location */}
        <LocationFilter
          options={locationOptions}
          counts={locationCounts}
          selected={locationFilter}
          onChange={setLocationFilter}
        />

        {/* Filter 5: Cost Type */}
        <CostTypeFilter
          selected={costTypes}
          onChange={next => setCostTypes(normalizeCostTypes(next))}
        />

        {/* Action Buttons */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setTeamFilter('All');
              setDateMode('quarter');
              setSelectedQuarter(`Q3'${String(currentYear).slice(2)}`);
              setActivityFilter('All Types');
              setLocationFilter([]);
              setCostTypes([...ALL_COST_TYPES]);
            }}
            style={{ padding: '6px 12px', fontSize: '11px', height: '34px' }}
            title="Reset to default filters"
          >
            <i className="fa-solid fa-rotate-left"></i> Reset
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setIsSlideFullscreen(prev => !prev)}
            style={{
              padding: '6px 14px',
              fontSize: '11px',
              height: '34px',
              borderColor: isKPV ? '#9E1B32' : 'var(--accent)',
              color: isKPV ? '#9E1B32' : 'var(--accent)',
              fontWeight: 700,
            }}
            title="Toggle presentation deck view for screenshotting"
          >
            <i className={`fa-solid ${isSlideFullscreen ? 'fa-compress' : 'fa-expand'}`}></i>
            {isSlideFullscreen ? 'Standard View' : 'Slide Deck Focus'}
          </button>
        </div>
      </div>

      {/* ── Slide Capture Notification ── */}
      <div style={{
        marginBottom: '14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 14px',
        background: isKPV ? '#FFF1F2' : '#F0F7FF',
        border: `1px solid ${isKPV ? '#FECDD3' : '#DBEAFE'}`,
        borderRadius: '8px',
        fontSize: '11px',
        color: isKPV ? '#9E1B32' : '#1E3A8A',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="fa-solid fa-camera"></i>
          <span>
            <strong>Google Slides Ready:</strong> Perfect 16:9 layout. Press <strong>Win + Shift + S</strong> on Windows to snip the frame below and paste directly into your presentation slide.
          </span>
        </div>
        <span style={{ fontSize: '10px', opacity: 0.8 }}>
          {isKPV ? '🌹 KPV Brand Tone Active (Light Red)' : '🔷 Executive Navy Theme Active'}
        </span>
      </div>

      {/* ── THE PRESENTATION SLIDE FRAME ── */}
      <div
        id="marketing-report-slide"
        style={{
          background: '#FFFFFF',
          borderRadius: '16px',
          boxShadow: '0 12px 36px rgba(15, 23, 42, 0.12), 0 2px 6px rgba(15, 23, 42, 0.04)',
          border: `1px solid ${theme.cardBorder}`,
          overflow: 'hidden',
          display: 'flex',
          position: 'relative',
          minHeight: '740px',
          maxWidth: isSlideFullscreen ? '100%' : '1400px',
          margin: '0 auto',
          transition: 'all 0.3s ease',
        }}
      >
        {/* ── Left Vertical Accent Banner ── */}
        <div
          style={{
            width: '68px',
            background: theme.accentSidebar,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '24px 0',
            color: '#FFFFFF',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '18px' }}>🏅</span>
            <div style={{
              writingMode: 'vertical-rl',
              textOrientation: 'mixed',
              transform: 'rotate(180deg)',
              letterSpacing: '0.15em',
              fontSize: '11px',
              fontWeight: 800,
              textTransform: 'uppercase',
              opacity: 0.9,
              marginTop: '10px',
            }}>
              EASY GOLD
            </div>
          </div>

          <div style={{
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
            transform: 'rotate(180deg)',
            fontSize: '9px',
            fontWeight: 700,
            letterSpacing: '0.2em',
            opacity: 0.6,
          }}>
            {teamFilter === 'KPV' ? 'KPV DIVISION' : 'BTL TRACKER'}
          </div>
        </div>

        {/* ── Slide Content Body ── */}
        <div style={{ flex: 1, padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '20px', background: '#F8FAFC' }}>
          {/* Slide Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `2px solid ${isKPV ? '#FFE4E6' : '#E2E8F0'}`, paddingBottom: '14px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h1 style={{
                  fontSize: '24px',
                  fontWeight: 800,
                  color: theme.headerTitleColor,
                  margin: 0,
                  letterSpacing: '-0.02em',
                }}>
                  {periodTitle} Activation Performance - {teamFilter === 'All' ? 'Overview' : teamFilter}
                </h1>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '3px 9px',
                  borderRadius: '14px',
                  background: isKPV ? '#FFF1F2' : '#EFF6FF',
                  color: isKPV ? '#9E1B32' : '#1D4ED8',
                  border: `1px solid ${isKPV ? '#FECDD3' : '#BFDBFE'}`,
                }}>
                  {activityFilter}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px', fontWeight: 500 }}>
                Period: <strong>{startDate}</strong> to <strong>{endDate}</strong> · Compared with: <strong>{prevPeriodLabel}</strong> ({prevStartDate || 'N/A'} to {prevEndDate || 'N/A'})
              </div>
            </div>

            {/* Easy Gold by Khamphouvong Brand Header */}
            <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 900, color: '#0F1E3C', letterSpacing: '0.05em', lineHeight: 1.1 }}>
                  EASY <span style={{ color: isKPV ? '#9E1B32' : '#1B56C8' }}>GOLD</span>
                </div>
                <div style={{ fontSize: '8px', fontWeight: 800, color: '#64748B', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                  by KHAMPHOUVONG
                </div>
              </div>
            </div>
          </div>

          {/* ── Top Row: 4 Hero Metric Cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
            {/* Card 1: Total Customer */}
            <div style={{
              background: '#FFFFFF',
              borderRadius: '12px',
              border: `1px solid ${theme.cardBorder}`,
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}>
              <div style={{ padding: '16px 18px', flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.05em' }}>
                    Total Customer
                  </span>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '8px',
                    background: isKPV ? '#FFF1F2' : '#EFF6FF',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: theme.iconColor, fontSize: '13px',
                  }}>
                    <i className="fa-solid fa-users"></i>
                  </div>
                </div>

                <div style={{ fontSize: '28px', fontWeight: 800, color: theme.kpiNumColor, margin: '6px 0 8px', letterSpacing: '-0.02em' }}>
                  {curr.totalAcq.toLocaleString()}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {renderDelta(curr.totalAcq, prev.totalAcq, prevPeriodLabel, false, false)}
                  {renderDelta(curr.totalAcq, targets.acq, 'vs Target', false, false)}
                </div>
              </div>

              {/* Bottom Strip: NC / EC */}
              <div style={{
                background: theme.subStripBg,
                borderTop: `1px solid ${theme.subStripBorder}`,
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                padding: '8px 14px',
                fontSize: '11px',
              }}>
                <div>
                  <div style={{ fontSize: '9px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>NC</div>
                  <strong style={{ color: theme.subHighlight, fontSize: '13px' }}>{curr.nc.toLocaleString()}</strong>
                  <div style={{ fontSize: '9px', color: '#64748B' }}>
                    {pctChange(curr.nc, prev.nc) !== null ? `${prevPeriodLabel} ${pctChange(curr.nc, prev.nc)! >= 0 ? '▲' : '▼'}${Math.abs(pctChange(curr.nc, prev.nc)!).toFixed(0)}%` : '—'}
                  </div>
                </div>
                <div style={{ borderLeft: `1px solid ${theme.subStripBorder}`, paddingLeft: '10px' }}>
                  <div style={{ fontSize: '9px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>EC</div>
                  <strong style={{ color: '#0F172A', fontSize: '13px' }}>{curr.ec.toLocaleString()}</strong>
                  <div style={{ fontSize: '9px', color: '#64748B' }}>
                    {pctChange(curr.ec, prev.ec) !== null ? `${prevPeriodLabel} ${pctChange(curr.ec, prev.ec)! >= 0 ? '▲' : '▼'}${Math.abs(pctChange(curr.ec, prev.ec)!).toFixed(0)}%` : '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: Revenue (mil LAK) */}
            <div style={{
              background: '#FFFFFF',
              borderRadius: '12px',
              border: `1px solid ${theme.cardBorder}`,
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}>
              <div style={{ padding: '16px 18px', flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.05em' }}>
                    Revenue (mil LAK)
                  </span>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '8px',
                    background: isKPV ? '#FFF1F2' : '#EFF6FF',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: theme.iconColor, fontSize: '13px',
                  }}>
                    <i className="fa-solid fa-sack-dollar"></i>
                  </div>
                </div>

                <div style={{ fontSize: '28px', fontWeight: 800, color: theme.kpiNumColor, margin: '6px 0 8px', letterSpacing: '-0.02em' }}>
                  {fmtDeckLAK(curr.totalBuy)}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {renderDelta(curr.totalBuy, prev.totalBuy, prevPeriodLabel, false, true)}
                  <div style={{ fontSize: '10px', color: '#64748B' }}>
                    Avg/Acq: <strong style={{ color: '#0F172A' }}>{fmtLAK(Math.round(curr.totalAcq > 0 ? curr.totalBuy / curr.totalAcq : 0))}</strong>
                  </div>
                </div>
              </div>

              {/* Bottom Strip: NC / EC Revenue */}
              <div style={{
                background: theme.subStripBg,
                borderTop: `1px solid ${theme.subStripBorder}`,
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                padding: '8px 14px',
                fontSize: '11px',
              }}>
                <div>
                  <div style={{ fontSize: '9px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>NC</div>
                  <strong style={{ color: theme.subHighlight, fontSize: '13px' }}>{fmtDeckLAK(curr.buyNew)}</strong>
                  <div style={{ fontSize: '9px', color: '#64748B' }}>
                    {pctChange(curr.buyNew, prev.buyNew) !== null ? `${prevPeriodLabel} ${pctChange(curr.buyNew, prev.buyNew)! >= 0 ? '▲' : '▼'}${Math.abs(pctChange(curr.buyNew, prev.buyNew)!).toFixed(0)}%` : '—'}
                  </div>
                </div>
                <div style={{ borderLeft: `1px solid ${theme.subStripBorder}`, paddingLeft: '10px' }}>
                  <div style={{ fontSize: '9px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>EC</div>
                  <strong style={{ color: '#0F172A', fontSize: '13px' }}>{fmtDeckLAK(curr.buyExisting)}</strong>
                  <div style={{ fontSize: '9px', color: '#64748B' }}>
                    {pctChange(curr.buyExisting, prev.buyExisting) !== null ? `${prevPeriodLabel} ${pctChange(curr.buyExisting, prev.buyExisting)! >= 0 ? '▲' : '▼'}${Math.abs(pctChange(curr.buyExisting, prev.buyExisting)!).toFixed(0)}%` : '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: Total Cost (mil LAK) */}
            <div style={{
              background: '#FFFFFF',
              borderRadius: '12px',
              border: `1px solid ${theme.cardBorder}`,
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}>
              <div style={{ padding: '16px 18px', flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.05em' }}>
                    Total Cost (mil LAK)
                  </span>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '8px',
                    background: isKPV ? '#FFF1F2' : '#EFF6FF',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: theme.iconColor, fontSize: '13px',
                  }}>
                    <i className="fa-solid fa-receipt"></i>
                  </div>
                </div>

                <div style={{ fontSize: '28px', fontWeight: 800, color: theme.kpiNumColor, margin: '6px 0 8px', letterSpacing: '-0.02em' }}>
                  {fmtDeckLAK(curr.totalCost)}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {renderDelta(curr.totalCost, prev.totalCost, prevPeriodLabel, true, true)}
                  <div style={{ fontSize: '10px', color: '#64748B' }}>
                    {costTypes.length === ALL_COST_TYPES.length ? 'All 4 cost bases' : `${costTypes.length} components`}
                  </div>
                </div>
              </div>

              {/* Bottom Strip: Activation / Merch Cost */}
              <div style={{
                background: theme.subStripBg,
                borderTop: `1px solid ${theme.subStripBorder}`,
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                padding: '8px 14px',
                fontSize: '11px',
              }}>
                <div>
                  <div style={{ fontSize: '9px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Activation</div>
                  <strong style={{ color: theme.subHighlight, fontSize: '13px' }}>{fmtDeckLAK(curr.activationCost)}</strong>
                  <div style={{ fontSize: '9px', color: '#64748B' }}>
                    {pctChange(curr.activationCost, prev.activationCost) !== null ? `${prevPeriodLabel} ${pctChange(curr.activationCost, prev.activationCost)! >= 0 ? '▲' : '▼'}${Math.abs(pctChange(curr.activationCost, prev.activationCost)!).toFixed(0)}%` : '—'}
                  </div>
                </div>
                <div style={{ borderLeft: `1px solid ${theme.subStripBorder}`, paddingLeft: '10px' }}>
                  <div style={{ fontSize: '9px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Merch</div>
                  <strong style={{ color: '#0F172A', fontSize: '13px' }}>{fmtDeckLAK(curr.merchCost)}</strong>
                  <div style={{ fontSize: '9px', color: '#64748B' }}>
                    {pctChange(curr.merchCost, prev.merchCost) !== null ? `${prevPeriodLabel} ${pctChange(curr.merchCost, prev.merchCost)! >= 0 ? '▲' : '▼'}${Math.abs(pctChange(curr.merchCost, prev.merchCost)!).toFixed(0)}%` : '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* Card 4: Average CPA & CPO Hero Banner */}
            <div style={{
              background: theme.heroCardBg,
              borderRadius: '12px',
              border: `1px solid ${theme.heroCardBorder}`,
              boxShadow: '0 8px 20px rgba(15, 23, 42, 0.15)',
              padding: '16px 18px',
              color: '#FFFFFF',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}>
              {/* Top Section: CPA */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.9 }}>
                    Average CPA
                  </span>
                  <span style={{ fontSize: '9px', background: 'rgba(255,255,255,0.15)', padding: '2px 6px', borderRadius: '4px' }}>Cost / NC</span>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 800, margin: '4px 0 6px', letterSpacing: '-0.02em' }}>
                  {fmtLAK(Math.round(curr.cpa))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '10px' }}>
                  {renderDelta(curr.cpa, prev.cpa, prevPeriodLabel, true, true)}
                  {renderDelta(curr.cpa, targets.cpa, 'vs Target', true, true)}
                </div>
              </div>

              {/* Dividing Line */}
              <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.2)', margin: '10px 0' }} />

              {/* Bottom Section: CPO */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.9 }}>
                    Average CPO
                  </span>
                  <span style={{ fontSize: '9px', background: 'rgba(255,255,255,0.15)', padding: '2px 6px', borderRadius: '4px' }}>Cost / Buyer</span>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 800, margin: '4px 0 6px', letterSpacing: '-0.02em' }}>
                  {fmtLAK(Math.round(curr.cpo))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '10px' }}>
                  {renderDelta(curr.cpo, prev.cpo, prevPeriodLabel, true, true)}
                  {renderDelta(curr.cpo, targets.cpo, 'vs Target', true, true)}
                </div>
              </div>
            </div>
          </div>

          {/* ── Middle/Lower Row: 2x2 Charts + Insights Box ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '65% 35%', gap: '16px', flex: 1 }}>
            {/* Left 2x2 Charts Container */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {/* Chart 1: Acquisition (NC vs EC) */}
              <div style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
              }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
                  {dateMode === 'quarter' ? 'MoM' : dateMode === 'month' ? 'WoW' : 'DoD'} Acquisition
                </div>
                <div style={{ height: '140px', flex: 1 }}>
                  <Bar data={chartAcqData} options={chartOptions} />
                </div>
              </div>

              {/* Chart 2: CPA / CPO */}
              <div style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
              }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
                  {dateMode === 'quarter' ? 'MoM' : dateMode === 'month' ? 'WoW' : 'DoD'} CPA / CPO
                </div>
                <div style={{ height: '140px', flex: 1 }}>
                  <Bar data={chartCpaCpoData} options={chartOptions} />
                </div>
              </div>

              {/* Chart 3: Revenue (mil LAK) */}
              <div style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
              }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
                  {dateMode === 'quarter' ? 'MoM' : dateMode === 'month' ? 'WoW' : 'DoD'} Revenue (M LAK)
                </div>
                <div style={{ height: '140px', flex: 1 }}>
                  <Bar data={chartRevData} options={chartOptions} />
                </div>
              </div>

              {/* Chart 4: Cost (mil LAK) */}
              <div style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
              }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
                  {dateMode === 'quarter' ? 'MoM' : dateMode === 'month' ? 'WoW' : 'DoD'} Cost (M LAK)
                </div>
                <div style={{ height: '140px', flex: 1 }}>
                  <Bar data={chartCostData} options={chartOptions} />
                </div>
              </div>
            </div>

            {/* Right: The Insights Box (Left Blank by default for Google Slides capture) */}
            <div style={{
              background: '#FFFFFF',
              borderRadius: '12px',
              border: `1px solid ${isKPV ? '#FECDD3' : '#E2E8F0'}`,
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <i className="fa-solid fa-lightbulb" style={{ color: isKPV ? '#9E1B32' : 'var(--accent)', fontSize: '13px' }}></i>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F1E3C', letterSpacing: '0.02em' }}>
                    Insights:
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={handleAutoDraftInsights}
                    className="btn btn-ghost"
                    style={{ padding: '3px 8px', fontSize: '10px', height: '24px' }}
                    title="Auto-fill with key findings from current figures"
                  >
                    Draft
                  </button>
                  {insightNote && (
                    <button
                      type="button"
                      onClick={() => setInsightNote('')}
                      className="btn btn-ghost"
                      style={{ padding: '3px 8px', fontSize: '10px', height: '24px' }}
                      title="Clear to blank as required for capture"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Note / Blank Workspace */}
              <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <textarea
                  value={insightNote}
                  onChange={e => setInsightNote(e.target.value)}
                  placeholder="[Blank workspace — leave clean to capture onto Google Slides, or type presentation bullet points here]"
                  style={{
                    width: '100%',
                    flex: 1,
                    minHeight: '260px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px dashed #CBD5E1',
                    background: '#F8FAFC',
                    fontFamily: 'inherit',
                    fontSize: '12px',
                    lineHeight: '1.6',
                    color: '#1E293B',
                    resize: 'none',
                    outline: 'none',
                  }}
                />

                {!insightNote && (
                  <div style={{
                    position: 'absolute',
                    top: '20px',
                    left: '16px',
                    right: '16px',
                    pointerEvents: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '24px',
                    opacity: 0.35,
                  }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                      <span style={{ fontWeight: 700, fontSize: '12px' }}>1.</span>
                      <div style={{ flex: 1, borderBottom: '1px dotted #94A3B8', height: '14px' }}></div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                      <span style={{ fontWeight: 700, fontSize: '12px' }}>2.</span>
                      <div style={{ flex: 1, borderBottom: '1px dotted #94A3B8', height: '14px' }}></div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                      <span style={{ fontWeight: 700, fontSize: '12px' }}>3.</span>
                      <div style={{ flex: 1, borderBottom: '1px dotted #94A3B8', height: '14px' }}></div>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ marginTop: '8px', fontSize: '10px', color: '#94A3B8', textAlign: 'right' }}>
                {insightNote.length > 0 ? `${insightNote.length} characters` : 'Blank for Google Slide insertion'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
ChartJS.defaults.font.family = "'Montserrat', sans-serif";

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
export interface WeekOption {
  key: string;
  label: string;
  startDate: string;
  endDate: string;
  weekNum: number;
}

export const generate52Weeks = (year: number): WeekOption[] => {
  const weeks: WeekOption[] = [];
  const d = new Date(year, 0, 1);
  while (d.getDay() !== 6) { // 6 = Saturday
    d.setDate(d.getDate() + 1);
  }

  for (let w = 1; w <= 52; w++) {
    const sDate = new Date(d);
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

    d.setDate(d.getDate() + 7);
  }
  return weeks;
};

export interface QuarterOption {
  key: string;
  label: string;
  startDate: string;
  endDate: string;
  months: string[];
}

export const generateQuarters = (year: number): QuarterOption[] => [
  { key: `Q4'${String(year).slice(2)}`, label: `Q4'${String(year).slice(2)} (Oct – Dec)`, startDate: `${year}-10-01`, endDate: `${year}-12-31`, months: ['Oct', 'Nov', 'Dec'] },
  { key: `Q3'${String(year).slice(2)}`, label: `Q3'${String(year).slice(2)} (Jul – Sep)`, startDate: `${year}-07-01`, endDate: `${year}-09-30`, months: ['Jul', 'Aug', 'Sep'] },
  { key: `Q2'${String(year).slice(2)}`, label: `Q2'${String(year).slice(2)} (Apr – Jun)`, startDate: `${year}-04-01`, endDate: `${year}-06-30`, months: ['Apr', 'May', 'Jun'] },
  { key: `Q1'${String(year).slice(2)}`, label: `Q1'${String(year).slice(2)} (Jan – Mar)`, startDate: `${year}-01-01`, endDate: `${year}-03-31`, months: ['Jan', 'Feb', 'Mar'] },
  // Trailing previous year Q4 for seamless Q1 vs prev Q comparison
  { key: `Q4'${String(year - 1).slice(2)}`, label: `Q4'${String(year - 1).slice(2)} (Oct – Dec)`, startDate: `${year - 1}-10-01`, endDate: `${year - 1}-12-31`, months: ['Oct', 'Nov', 'Dec'] },
];

export interface MonthOption {
  key: string;
  label: string;
  startDate: string;
  endDate: string;
}

export const generateMonths = (year: number): MonthOption[] => {
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
  // Trailing previous year December for seamless Jan vs prev M comparison
  months.push({
    key: `Dec'${String(year - 1).slice(2)}`,
    label: `Dec'${String(year - 1).slice(2)}`,
    startDate: `${year - 1}-12-01`,
    endDate: `${year - 1}-12-31`,
  });
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
                style={{ width: '13px', height: '13px', accentColor: '#0b53ac' }}
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
          borderColor: isActive ? '#0b53ac' : undefined,
          color: isActive ? '#0b53ac' : undefined,
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
                  style={{ width: '13px', height: '13px', accentColor: '#0b53ac' }}
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

// ── Chart.js Inline Plugin for Inside-End Data Labels ─────────────────────
const barDataLabelsPlugin = {
  id: 'barDataLabels',
  afterDatasetsDraw(chart: any) {
    const { ctx } = chart;
    const datasets = chart.data.datasets;
    if (!datasets || datasets.length === 0) return;

    datasets.forEach((dataset: any, datasetIndex: number) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (meta.hidden) return;

      meta.data.forEach((bar: any, index: number) => {
        const val = dataset.data[index];
        if (val === null || val === undefined || val === 0) return;

        let text = '';
        const chartType = chart.options?.plugins?.barDataLabels?.chartType;
        if (chartType === 'currency') {
          // CPA / CPO in LAK
          if (val >= 1_000_000) {
            text = `₭${(val / 1_000_000).toFixed(1)}M`;
          } else if (val >= 1_000) {
            text = `₭${Math.round(val / 1_000)}k`;
          } else {
            text = `₭${Math.round(val)}`;
          }
        } else if (chartType === 'revenue') {
          // Revenue in Mil LAK
          if (val >= 1_000) {
            text = `₭${(val / 1_000).toFixed(1)}B`;
          } else {
            text = `₭${Number(val).toFixed(1)}M`;
          }
        } else if (chartType === 'cost') {
          // Cost in Mil LAK
          if (val >= 1_000) {
            text = `₭${(val / 1_000).toFixed(1)}B`;
          } else {
            text = `₭${Number(val).toFixed(1)}M`;
          }
        } else {
          // Customer Acquisition (NC / EC)
          if (val >= 1_000) {
            text = `${(val / 1_000).toFixed(1)}k`;
          } else {
            text = `${Math.round(val)}`;
          }
        }

        ctx.save();
        ctx.font = '700 9px Montserrat, sans-serif';
        ctx.textAlign = 'center';

        const barHeight = Math.abs(bar.base - bar.y);
        // "inside end" positioning: inside top of bar if tall enough, otherwise just above
        if (barHeight >= 18) {
          ctx.fillStyle = '#FFFFFF';
          ctx.textBaseline = 'top';
          ctx.fillText(text, bar.x, bar.y + 4);
        } else {
          ctx.fillStyle = '#475569';
          ctx.textBaseline = 'bottom';
          ctx.fillText(text, bar.x, bar.y - 2);
        }
        ctx.restore();
      });
    });
  },
};

// ── Chart Option Generator (No gridlines, No vertical axis, Inside-end labels) ─
const createChartOptions = (chartType: 'count' | 'currency' | 'revenue' | 'cost'): any => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'top' as const,
      align: 'end' as const,
      labels: {
        boxWidth: 8,
        boxHeight: 8,
        font: { family: "'Montserrat', sans-serif", size: 9, weight: 'bold' },
        color: '#64748B',
        padding: 6,
      },
    },
    tooltip: {
      backgroundColor: '#0F172A',
      titleFont: { family: "'Montserrat', sans-serif", size: 11, weight: 'bold' },
      bodyFont: { family: "'Montserrat', sans-serif", size: 10 },
      padding: 8,
      cornerRadius: 6,
    },
    barDataLabels: {
      chartType,
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: {
        font: { family: "'Montserrat', sans-serif", size: 10, weight: 'bold' },
        color: '#64748B',
      },
      border: { display: false },
    },
    y: {
      display: false,
      grid: { display: false },
      ticks: { display: false },
      border: { display: false },
    },
  },
});

// ── Custom Chart Timeline Setting Interface ──────────────────────────────
export interface ChartCustomTimeline {
  active: boolean; // false = sync with main report date filter, true = custom range
  granularity: 'quarter' | 'month' | 'week' | 'date';
  quarterFrom: string;
  quarterTo: string;
  monthFrom: string;
  monthTo: string;
  weekFrom: number;
  weekTo: number;
  dateFrom: string;
  dateTo: string;
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

  // Insights custom note state (defaults to blank space for Google Slides)
  const [insightNote, setInsightNote] = useState<string>('');
  const [isSlideFullscreen, setIsSlideFullscreen] = useState(false);

  // ── Requirement 7: Interactive Chart Timeline Setting State ──────────────
  const [isChartModalOpen, setIsChartModalOpen] = useState(false);
  const [chartTimeline, setChartTimeline] = useState<ChartCustomTimeline>({
    active: false,
    granularity: 'month',
    quarterFrom: `Q1'${String(currentYear).slice(2)}`,
    quarterTo: `Q3'${String(currentYear).slice(2)}`,
    monthFrom: `${currentYear}-07`,
    monthTo: `${currentYear}-09`,
    weekFrom: 36,
    weekTo: 40,
    dateFrom: `${currentYear}-09-01`,
    dateTo: `${currentYear}-09-30`,
  });

  // Modal draft state
  const [modalDraft, setModalDraft] = useState<ChartCustomTimeline>({ ...chartTimeline });

  // Open modal with fresh draft
  const handleOpenChartModal = () => {
    setModalDraft({ ...chartTimeline });
    setIsChartModalOpen(true);
  };

  // Pre-calculated options
  const quarters = useMemo(() => generateQuarters(currentYear), [currentYear]);
  const months = useMemo(() => generateMonths(currentYear), [currentYear]);
  const weeks52 = useMemo(() => generate52Weeks(currentYear), [currentYear]);

  // Extended quarters list (2025 - 2026) for chart timeline selection
  const allTimelineQuarters = useMemo(() => [
    { key: "Q1'25", label: "Q1'25 (Jan – Mar 2025)", start: '2025-01-01', end: '2025-03-31' },
    { key: "Q2'25", label: "Q2'25 (Apr – Jun 2025)", start: '2025-04-01', end: '2025-06-30' },
    { key: "Q3'25", label: "Q3'25 (Jul – Sep 2025)", start: '2025-07-01', end: '2025-09-30' },
    { key: "Q4'25", label: "Q4'25 (Oct – Dec 2025)", start: '2025-10-01', end: '2025-12-31' },
    { key: "Q1'26", label: "Q1'26 (Jan – Mar 2026)", start: '2026-01-01', end: '2026-03-31' },
    { key: "Q2'26", label: "Q2'26 (Apr – Jun 2026)", start: '2026-04-01', end: '2026-06-30' },
    { key: "Q3'26", label: "Q3'26 (Jul – Sep 2026)", start: '2026-07-01', end: '2026-09-30' },
    { key: "Q4'26", label: "Q4'26 (Oct – Dec 2026)", start: '2026-10-01', end: '2026-12-31' },
  ], []);

  // Extended months list (Jan 2025 - Dec 2026)
  const allTimelineMonths = useMemo(() => {
    const list: { key: string; label: string; start: string; end: string }[] = [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (const yr of [2025, 2026]) {
      for (let m = 0; m < 12; m++) {
        const mm = String(m + 1).padStart(2, '0');
        const lastDay = new Date(yr, m + 1, 0).getDate();
        list.push({
          key: `${yr}-${mm}`,
          label: `${monthNames[m]}'${String(yr).slice(2)}`,
          start: `${yr}-${mm}-01`,
          end: `${yr}-${mm}-${String(lastDay).padStart(2, '0')}`,
        });
      }
    }
    return list;
  }, []);

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

  // ── Requirement 2: Color Mood & Tone Theme ──────────────────────────────
  // Overall and Agency mood and tone: #0b53acff (#0b53ac), especially top right card (Avg. CPA CPO)
  // KPV theme: Warm burgundy/rose wine tone
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
        activePill: '#9E1B32',
      };
    }
    // Overall & Agency Theme centered around #0b53ac
    return {
      brandName: teamFilter === 'Agency' ? 'Agency' : 'Overview',
      bannerGradient: 'linear-gradient(135deg, #073a78 0%, #0b53ac 60%, #1565c0 100%)',
      accentSidebar: 'linear-gradient(180deg, #073a78 0%, #0b53ac 100%)',
      headerTitleColor: '#0b53ac',
      subStripBg: '#F3F7FD',
      subStripBorder: '#D9E6F7',
      subStripHeaderBg: '#0b53ac',
      subStripHeaderTxt: '#FFFFFF',
      // Top Right Card (Avg. CPA CPO) Hero Mood & Tone in #0b53ac
      heroCardBg: 'linear-gradient(135deg, #073a78 0%, #0b53ac 60%, #1664bf 100%)',
      heroCardBorder: '#0b53ac',
      chartNC: '#0b53ac',
      chartEC: '#73A9EB',
      chartCPA: '#0b53ac',
      chartCPO: '#388BFD',
      chartRevNC: '#0b53ac',
      chartRevEC: '#73A9EB',
      chartCostAct: '#0b53ac',
      chartCostMerch: '#73A9EB',
      cardBg: '#FFFFFF',
      cardBorder: '#D4E2F5',
      kpiNumColor: '#0F172A',
      iconColor: '#0b53ac',
      subHighlight: '#0b53ac',
      activePill: '#0b53ac',
    };
  }, [isKPV, teamFilter]);

  // ── Delta Badge Helpers (Top KPI Metrics) ────────────────────────────────
  const renderDelta = (
    currentVal: number,
    compareVal: number,
    label: string,
    isCostMetric = false,
    isCurrency = false,
    isHeroCard = false
  ) => {
    const chg = pctChange(currentVal, compareVal);
    if (chg === null) {
      return (
        <div style={{ fontSize: '11px', color: isHeroCard ? 'rgba(255,255,255,0.8)' : '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>—</span> {label}
        </div>
      );
    }
    const delta = currentVal - compareVal;
    const isGood = isCostMetric ? chg <= 0 : chg >= 0;
    const arrow = chg >= 0 ? '▲' : '▼';
    const badgeColor = isHeroCard
      ? (isGood ? '#4ADE80' : '#FDA4AF')
      : (isGood ? '#10B981' : '#E11D48');
    const absPct = Math.abs(chg).toFixed(1);
    const sign = delta > 0 ? '+' : '−';
    const gapStr = isCurrency
      ? fmtDeckLAK(Math.abs(delta))
      : Math.abs(Math.round(delta)).toLocaleString();

    return (
      <div style={{ fontSize: isHeroCard ? '11px' : '12px', fontWeight: 700, color: badgeColor, display: 'flex', alignItems: 'center', gap: '5px' }}>
        <span>{arrow} {absPct}% {label}</span>
        <span style={{
          fontWeight: 800,
          opacity: 1,
          color: isHeroCard ? '#FFFFFF' : badgeColor,
          letterSpacing: '0.02em',
        }}>
          ({sign}{gapStr})
        </span>
      </div>
    );
  };

  // ── Requirement 3: Mini Delta for NC/EC, Activation, Merch (Show Green for Growth, Red for Decline) ─
  const renderMiniDelta = (currVal: number, prevVal: number, isCostMetric = false) => {
    const chg = pctChange(currVal, prevVal);
    if (chg === null) {
      return <span style={{ color: '#94A3B8' }}>—</span>;
    }
    const isGood = isCostMetric ? chg <= 0 : chg >= 0;
    const color = isGood ? '#10B981' : '#E11D48';
    const arrow = chg >= 0 ? '▲' : '▼';
    return (
      <span style={{ color, fontWeight: 700 }}>
        {prevPeriodLabel} {arrow}{Math.abs(chg).toFixed(0)}%
      </span>
    );
  };

  // ── Requirement 7: Calculate 2x2 Charts Timeline Data ─────────────────────
  // Can be configured dynamically via chartTimeline state or automatically sync with main filter
  const { chartIntervals, chartTitlePrefix, chartTimelineSummary } = useMemo(() => {
    const effectiveRows = submissions.filter(s => {
      const sTeam = normalizeTeam(s.team);
      const inTeam = teamFilter === 'All' || sTeam === teamFilter;
      const inActivity = activityFilter === 'All Types' || normalizeActivityType(s.activity_type) === activityFilter;
      const inLocation = inLocationFilter(s.branch, locationFilter);
      return inTeam && inActivity && inLocation;
    });

    // Case 1: Custom Chart Timeline is active
    if (chartTimeline.active) {
      const mode = chartTimeline.granularity;

      if (mode === 'quarter') {
        const fromIdx = allTimelineQuarters.findIndex(q => q.key === chartTimeline.quarterFrom);
        const toIdx = allTimelineQuarters.findIndex(q => q.key === chartTimeline.quarterTo);
        const minIdx = Math.min(fromIdx === -1 ? 0 : fromIdx, toIdx === -1 ? allTimelineQuarters.length - 1 : toIdx);
        const maxIdx = Math.max(fromIdx === -1 ? 0 : fromIdx, toIdx === -1 ? allTimelineQuarters.length - 1 : toIdx);
        const selected = allTimelineQuarters.slice(minIdx, maxIdx + 1);

        const intervals = selected.map(q => {
          const rows = effectiveRows.filter(s => s.date >= q.start && s.date <= q.end);
          const agg = aggregate(rows, costTypes);
          return { label: q.key, agg };
        });

        return {
          chartIntervals: intervals,
          chartTitlePrefix: 'QoQ',
          chartTimelineLabel: `QoQ (${selected[0]?.key || ''} – ${selected[selected.length - 1]?.key || ''})`,
          chartTimelineSummary: `Quarterly (${selected[0]?.key || ''} to ${selected[selected.length - 1]?.key || ''})`,
        };
      }

      if (mode === 'month') {
        const fromIdx = allTimelineMonths.findIndex(m => m.key === chartTimeline.monthFrom);
        const toIdx = allTimelineMonths.findIndex(m => m.key === chartTimeline.monthTo);
        const minIdx = Math.min(fromIdx === -1 ? 0 : fromIdx, toIdx === -1 ? allTimelineMonths.length - 1 : toIdx);
        const maxIdx = Math.max(fromIdx === -1 ? 0 : fromIdx, toIdx === -1 ? allTimelineMonths.length - 1 : toIdx);
        const selected = allTimelineMonths.slice(minIdx, maxIdx + 1);

        const intervals = selected.map(m => {
          const rows = effectiveRows.filter(s => s.date >= m.start && s.date <= m.end);
          const agg = aggregate(rows, costTypes);
          return { label: m.label, agg };
        });

        return {
          chartIntervals: intervals,
          chartTitlePrefix: 'MoM',
          chartTimelineLabel: `MoM (${selected[0]?.label || ''} – ${selected[selected.length - 1]?.label || ''})`,
          chartTimelineSummary: `Monthly (${selected[0]?.label || ''} to ${selected[selected.length - 1]?.label || ''})`,
        };
      }

      if (mode === 'week') {
        const minW = Math.min(chartTimeline.weekFrom, chartTimeline.weekTo);
        const maxW = Math.max(chartTimeline.weekFrom, chartTimeline.weekTo);
        const selected = weeks52.filter(w => w.weekNum >= minW && w.weekNum <= maxW);

        const intervals = selected.map(w => {
          const rows = effectiveRows.filter(s => s.date >= w.startDate && s.date <= w.endDate);
          const agg = aggregate(rows, costTypes);
          return { label: w.key, agg };
        });

        return {
          chartIntervals: intervals,
          chartTitlePrefix: 'WoW',
          chartTimelineLabel: `WoW (W${minW} – W${maxW})`,
          chartTimelineSummary: `Weekly (W${minW} to W${maxW})`,
        };
      }

      if (mode === 'date') {
        const sIso = chartTimeline.dateFrom || `${currentYear}-09-01`;
        const eIso = chartTimeline.dateTo || `${currentYear}-09-30`;
        const d1 = new Date(sIso + 'T00:00:00');
        const d2 = new Date(eIso + 'T00:00:00');
        const daysDiff = Math.min(31, Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1));

        const intervals = [];
        for (let i = 0; i < daysDiff; i++) {
          const curD = new Date(d1);
          curD.setDate(curD.getDate() + i);
          const iso = curD.toISOString().slice(0, 10);
          const dayLabel = curD.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
          const rows = effectiveRows.filter(s => s.date === iso);
          const agg = aggregate(rows, costTypes);
          intervals.push({ label: dayLabel, agg });
        }

        return {
          chartIntervals: intervals,
          chartTitlePrefix: 'DoD',
          chartTimelineLabel: `DoD (${sIso.slice(5)} – ${eIso.slice(5)})`,
          chartTimelineSummary: `Daily (${sIso} to ${eIso})`,
        };
      }
    }

    // Case 2: Auto sync with main Date Filter
    if (dateMode === 'quarter') {
      const q = quarters.find(item => item.key === selectedQuarter) || quarters[1];
      const monthNames = q.months;
      const qYear = selectedQuarter.split("'")[1] ? `20${selectedQuarter.split("'")[1]}` : `${currentYear}`;

      const intervals = monthNames.map(mName => {
        const mIdx = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(mName) + 1;
        const prefix = `${qYear}-${String(mIdx).padStart(2, '0')}`;
        const rows = filtered.filter(s => s.date.startsWith(prefix));
        const agg = aggregate(rows, costTypes);
        return { label: mName, agg };
      });

      return {
        chartIntervals: intervals,
        chartTitlePrefix: 'MoM',
        chartTimelineLabel: 'MoM (Quarterly Filter)',
        chartTimelineSummary: `Default: Months of ${selectedQuarter}`,
      };
    }

    if (dateMode === 'month') {
      const m = months.find(item => item.key === selectedMonth) || months[0];
      const [mPrefix] = m.startDate.split('-');
      const mIdx = m.startDate.slice(5, 7);
      const blocks = [
        { label: 'W1', start: `${mPrefix}-${mIdx}-01`, end: `${mPrefix}-${mIdx}-07` },
        { label: 'W2', start: `${mPrefix}-${mIdx}-08`, end: `${mPrefix}-${mIdx}-14` },
        { label: 'W3', start: `${mPrefix}-${mIdx}-15`, end: `${mPrefix}-${mIdx}-21` },
        { label: 'W4', start: `${mPrefix}-${mIdx}-22`, end: `${mPrefix}-${mIdx}-28` },
        { label: 'W5', start: `${mPrefix}-${mIdx}-29`, end: m.endDate },
      ];
      const intervals = blocks.map(b => {
        const rows = filtered.filter(s => s.date >= b.start && s.date <= b.end);
        const agg = aggregate(rows, costTypes);
        return { label: b.label, agg };
      });

      return {
        chartIntervals: intervals,
        chartTitlePrefix: 'WoW',
        chartTimelineLabel: 'WoW (Monthly Filter)',
        chartTimelineSummary: `Default: Weeks of ${selectedMonth}`,
      };
    }

    if (dateMode === 'week') {
      const sD = new Date(startDate + 'T00:00:00');
      const eD = new Date(endDate + 'T00:00:00');
      const numDays = Math.min(14, Math.max(1, Math.round((eD.getTime() - sD.getTime()) / 86400000) + 1));
      const buckets = [];
      for (let i = 0; i < numDays; i++) {
        const curD = new Date(sD);
        curD.setDate(curD.getDate() + i);
        const iso = curD.toISOString().slice(0, 10);
        const dayLabel = curD.toLocaleDateString('en-GB', { weekday: 'short' });
        const rows = filtered.filter(s => s.date === iso);
        const agg = aggregate(rows, costTypes);
        buckets.push({ label: `${dayLabel} ${curD.getDate()}`, agg });
      }

      return {
        chartIntervals: buckets,
        chartTitlePrefix: 'DoD',
        chartTimelineLabel: 'DoD (Weekly Filter)',
        chartTimelineSummary: `Default: Days of ${selectedWeek}`,
      };
    }

    return {
      chartIntervals: [{ label: 'Period', agg: curr }],
      chartTitlePrefix: 'Period',
      chartTimelineLabel: 'Custom Period',
      chartTimelineSummary: 'Default: Custom Period',
    };
  }, [
    chartTimeline,
    submissions,
    teamFilter,
    activityFilter,
    locationFilter,
    costTypes,
    dateMode,
    selectedQuarter,
    selectedMonth,
    selectedWeek,
    startDate,
    endDate,
    filtered,
    curr,
    quarters,
    months,
    weeks52,
    allTimelineQuarters,
    allTimelineMonths,
    currentYear,
  ]);

  const chartLabels = chartIntervals.map(c => c.label);

  // 1. Acquisition Chart Data
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

  // 2. CPA / CPO Chart Data
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

  // 3. Revenue Chart Data (in Mil LAK)
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

  // 4. Cost Chart Data (in Mil LAK)
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

  return (
    <div style={{ paddingBottom: '30px', fontFamily: "'Montserrat', sans-serif" }}>
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
                      ? (t === 'KPV' ? '#9E1B32' : '#0b53ac')
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
                    background: active ? (isKPV ? '#9E1B32' : '#0b53ac') : 'transparent',
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
              {quarters.slice(0, 4).map(q => (
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
              {months.slice(0, 12).map(m => (
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
              setChartTimeline(prev => ({ ...prev, active: false }));
            }}
            style={{ padding: '6px 12px', fontSize: '11px', height: '34px' }}
            title="Reset to default filters"
          >
            <i className="fa-solid fa-rotate-left"></i> Reset
          </button>
          {chartTimeline.active && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setChartTimeline(prev => ({ ...prev, active: false }))}
              style={{ padding: '6px 11px', fontSize: '11px', height: '34px', color: '#64748B' }}
              title="Reset 4 charts back to follow main report date filter"
            >
              <i className="fa-solid fa-rotate-left"></i> Sync Charts
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleOpenChartModal}
            style={{
              padding: '6px 12px',
              fontSize: '11px',
              height: '34px',
              borderColor: isKPV ? '#9E1B32' : '#0b53ac',
              color: isKPV ? '#9E1B32' : '#0b53ac',
              fontWeight: 700,
            }}
            title="Configure timeline for all 4 charts"
          >
            <i className="fa-solid fa-sliders"></i>
            {chartTimeline.active ? `Chart: ${chartTimelineSummary}` : 'Chart Timeline Setting'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setIsSlideFullscreen(prev => !prev)}
            style={{
              padding: '6px 14px',
              fontSize: '11px',
              height: '34px',
              borderColor: isKPV ? '#9E1B32' : '#0b53ac',
              color: isKPV ? '#9E1B32' : '#0b53ac',
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
        background: isKPV ? '#FFF1F2' : '#F3F7FD',
        border: `1px solid ${isKPV ? '#FECDD3' : '#D9E6F7'}`,
        borderRadius: '8px',
        fontSize: '11px',
        color: isKPV ? '#9E1B32' : '#0b53ac',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="fa-solid fa-camera"></i>
          <span>
            <strong>Google Slides Ready:</strong> Perfect 16:9 layout in <strong>Montserrat</strong> font. Press <strong>Win + Shift + S</strong> on Windows to snip the frame below and paste directly into your presentation slide.
          </span>
        </div>
        <span style={{ fontSize: '10px', fontWeight: 600, opacity: 0.9 }}>
          {isKPV ? '🌹 KPV Brand Tone Active (Rose Wine)' : '🔷 Executive Palette Active (#0b53ac)'}
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
          fontFamily: "'Montserrat', sans-serif",
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
              opacity: 0.95,
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
            opacity: 0.7,
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
                  color: isKPV ? '#9E1B32' : '#0b53ac',
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
                  EASY <span style={{ color: isKPV ? '#9E1B32' : '#0b53ac' }}>GOLD</span>
                </div>
                <div style={{ fontSize: '8px', fontWeight: 800, color: '#64748B', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                  by KHAMPHOUVONG
                </div>
              </div>
            </div>
          </div>

          {/* ── Top Row: 4 Hero Metric Cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
            {/* Card 1: Total Customer (Requirement 5: enhanced font size & spacing) */}
            <div style={{
              background: '#FFFFFF',
              borderRadius: '12px',
              border: `1px solid ${theme.cardBorder}`,
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}>
              <div style={{ padding: '18px 20px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
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

                  <div style={{ fontSize: '36px', fontWeight: 800, color: theme.kpiNumColor, margin: '8px 0 10px', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
                    {curr.totalAcq.toLocaleString()}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                  {renderDelta(curr.totalAcq, prev.totalAcq, prevPeriodLabel, false, false)}
                  {renderDelta(curr.totalAcq, targets.acq, 'vs Target', false, false)}
                </div>
              </div>

              {/* Bottom Strip: NC / EC (Requirement 3: mini delta shows green/red) */}
              <div style={{
                background: theme.subStripBg,
                borderTop: `1px solid ${theme.subStripBorder}`,
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                padding: '10px 16px',
                fontSize: '11px',
              }}>
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>NC</div>
                  <strong style={{ color: theme.subHighlight, fontSize: '15px' }}>{curr.nc.toLocaleString()}</strong>
                  <div style={{ fontSize: '9px', marginTop: '2px' }}>
                    {renderMiniDelta(curr.nc, prev.nc, false)}
                  </div>
                </div>
                <div style={{ borderLeft: `1px solid ${theme.subStripBorder}`, paddingLeft: '12px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>EC</div>
                  <strong style={{ color: '#0F172A', fontSize: '15px' }}>{curr.ec.toLocaleString()}</strong>
                  <div style={{ fontSize: '9px', marginTop: '2px' }}>
                    {renderMiniDelta(curr.ec, prev.ec, false)}
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: Revenue (mil LAK) (Requirement 5: enhanced font size & spacing) */}
            <div style={{
              background: '#FFFFFF',
              borderRadius: '12px',
              border: `1px solid ${theme.cardBorder}`,
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}>
              <div style={{ padding: '18px 20px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
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

                  <div style={{ fontSize: '36px', fontWeight: 800, color: theme.kpiNumColor, margin: '8px 0 10px', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
                    {fmtDeckLAK(curr.totalBuy)}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                  {renderDelta(curr.totalBuy, prev.totalBuy, prevPeriodLabel, false, true)}
                  <div style={{ fontSize: '11px', color: '#64748B' }}>
                    Avg/Acq: <strong style={{ color: '#0F172A' }}>{fmtLAK(Math.round(curr.totalAcq > 0 ? curr.totalBuy / curr.totalAcq : 0))}</strong>
                  </div>
                </div>
              </div>

              {/* Bottom Strip: NC / EC Revenue (Requirement 3: mini delta shows green/red) */}
              <div style={{
                background: theme.subStripBg,
                borderTop: `1px solid ${theme.subStripBorder}`,
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                padding: '10px 16px',
                fontSize: '11px',
              }}>
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>NC</div>
                  <strong style={{ color: theme.subHighlight, fontSize: '15px' }}>{fmtDeckLAK(curr.buyNew)}</strong>
                  <div style={{ fontSize: '9px', marginTop: '2px' }}>
                    {renderMiniDelta(curr.buyNew, prev.buyNew, false)}
                  </div>
                </div>
                <div style={{ borderLeft: `1px solid ${theme.subStripBorder}`, paddingLeft: '12px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>EC</div>
                  <strong style={{ color: '#0F172A', fontSize: '15px' }}>{fmtDeckLAK(curr.buyExisting)}</strong>
                  <div style={{ fontSize: '9px', marginTop: '2px' }}>
                    {renderMiniDelta(curr.buyExisting, prev.buyExisting, false)}
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: Total Cost (mil LAK) (Requirement 5: enhanced font size & spacing) */}
            <div style={{
              background: '#FFFFFF',
              borderRadius: '12px',
              border: `1px solid ${theme.cardBorder}`,
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}>
              <div style={{ padding: '18px 20px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
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

                  <div style={{ fontSize: '36px', fontWeight: 800, color: theme.kpiNumColor, margin: '8px 0 10px', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
                    {fmtDeckLAK(curr.totalCost)}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                  {renderDelta(curr.totalCost, prev.totalCost, prevPeriodLabel, true, true)}
                  <div style={{ fontSize: '11px', color: '#64748B' }}>
                    {costTypes.length === ALL_COST_TYPES.length ? 'All 4 cost bases' : `${costTypes.length} components`}
                  </div>
                </div>
              </div>

              {/* Bottom Strip: Activation / Merch Cost (Requirement 3: mini delta shows green/red) */}
              <div style={{
                background: theme.subStripBg,
                borderTop: `1px solid ${theme.subStripBorder}`,
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                padding: '10px 16px',
                fontSize: '11px',
              }}>
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Activation</div>
                  <strong style={{ color: theme.subHighlight, fontSize: '15px' }}>{fmtDeckLAK(curr.activationCost)}</strong>
                  <div style={{ fontSize: '9px', marginTop: '2px' }}>
                    {renderMiniDelta(curr.activationCost, prev.activationCost, true)}
                  </div>
                </div>
                <div style={{ borderLeft: `1px solid ${theme.subStripBorder}`, paddingLeft: '12px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Merch</div>
                  <strong style={{ color: '#0F172A', fontSize: '15px' }}>{fmtDeckLAK(curr.merchCost)}</strong>
                  <div style={{ fontSize: '9px', marginTop: '2px' }}>
                    {renderMiniDelta(curr.merchCost, prev.merchCost, true)}
                  </div>
                </div>
              </div>
            </div>

            {/* Card 4: Average CPA & CPO Hero Banner (Requirement 2: #0b53ac mood & tone) */}
            <div style={{
              background: theme.heroCardBg,
              borderRadius: '12px',
              border: `1px solid ${theme.heroCardBorder}`,
              boxShadow: '0 8px 24px rgba(11, 83, 172, 0.25)',
              padding: '18px 20px',
              color: '#FFFFFF',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}>
              {/* Top Section: CPA */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.95 }}>
                    Average CPA
                  </span>
                  <span style={{ fontSize: '9px', background: 'rgba(255,255,255,0.2)', padding: '2px 7px', borderRadius: '4px', fontWeight: 700 }}>Cost / NC</span>
                </div>
                <div style={{ fontSize: '26px', fontWeight: 800, margin: '6px 0 6px', letterSpacing: '-0.02em' }}>
                  {fmtLAK(Math.round(curr.cpa))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px' }}>
                  {renderDelta(curr.cpa, prev.cpa, prevPeriodLabel, true, true, true)}
                  {renderDelta(curr.cpa, targets.cpa, 'vs Target', true, true, true)}
                </div>
              </div>

              {/* Dividing Line */}
              <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.25)', margin: '12px 0' }} />

              {/* Bottom Section: CPO */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.95 }}>
                    Average CPO
                  </span>
                  <span style={{ fontSize: '9px', background: 'rgba(255,255,255,0.2)', padding: '2px 7px', borderRadius: '4px', fontWeight: 700 }}>Cost / Buyer</span>
                </div>
                <div style={{ fontSize: '26px', fontWeight: 800, margin: '6px 0 6px', letterSpacing: '-0.02em' }}>
                  {fmtLAK(Math.round(curr.cpo))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px' }}>
                  {renderDelta(curr.cpo, prev.cpo, prevPeriodLabel, true, true, true)}
                  {renderDelta(curr.cpo, targets.cpo, 'vs Target', true, true, true)}
                </div>
              </div>
            </div>
          </div>

          {/* ── Middle/Lower Row: 2x2 Charts + Insights Box ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '65% 35%', gap: '16px', flex: 1 }}>
            {/* Left: 2x2 Charts Container (Clicking any chart opens Chart Timeline Modal) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {/* Chart 1: Acquisition (NC vs EC) */}
              <div
                onClick={handleOpenChartModal}
                style={{
                  background: '#FFFFFF',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
                }}
                title="Click to customize timeline for all 4 charts"
              >
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#334155', marginBottom: '8px' }}>
                  {chartTitlePrefix} Acquisition
                </div>
                <div style={{ height: '160px', flex: 1 }}>
                  <Bar
                    data={chartAcqData}
                    options={createChartOptions('count')}
                    plugins={[barDataLabelsPlugin]}
                  />
                </div>
              </div>

              {/* Chart 2: CPA / CPO */}
              <div
                onClick={handleOpenChartModal}
                style={{
                  background: '#FFFFFF',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
                }}
                title="Click to customize timeline for all 4 charts"
              >
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#334155', marginBottom: '8px' }}>
                  {chartTitlePrefix} CPA / CPO
                </div>
                <div style={{ height: '160px', flex: 1 }}>
                  <Bar
                    data={chartCpaCpoData}
                    options={createChartOptions('currency')}
                    plugins={[barDataLabelsPlugin]}
                  />
                </div>
              </div>

              {/* Chart 3: Revenue (mil LAK) */}
              <div
                onClick={handleOpenChartModal}
                style={{
                  background: '#FFFFFF',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
                }}
                title="Click to customize timeline for all 4 charts"
              >
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#334155', marginBottom: '8px' }}>
                  {chartTitlePrefix} Revenue (M LAK)
                </div>
                <div style={{ height: '160px', flex: 1 }}>
                  <Bar
                    data={chartRevData}
                    options={createChartOptions('revenue')}
                    plugins={[barDataLabelsPlugin]}
                  />
                </div>
              </div>

              {/* Chart 4: Cost (mil LAK) */}
              <div
                onClick={handleOpenChartModal}
                style={{
                  background: '#FFFFFF',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
                }}
                title="Click to customize timeline for all 4 charts"
              >
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#334155', marginBottom: '8px' }}>
                  {chartTitlePrefix} Cost (M LAK)
                </div>
                <div style={{ height: '160px', flex: 1 }}>
                  <Bar
                    data={chartCostData}
                    options={createChartOptions('cost')}
                    plugins={[barDataLabelsPlugin]}
                  />
                </div>
              </div>
            </div>

            {/* Right: The Insights Box (Requirement 6: Clean blank space for Google Slides, removed draft button & placeholders) */}
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
                  <i className="fa-solid fa-lightbulb" style={{ color: isKPV ? '#9E1B32' : '#0b53ac', fontSize: '14px' }}></i>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: '#0F1E3C', letterSpacing: '0.02em' }}>
                    Insights:
                  </span>
                </div>
              </div>

              {/* Clean blank space for Google Slide user overlay */}
              <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <textarea
                  value={insightNote}
                  onChange={e => setInsightNote(e.target.value)}
                  placeholder=""
                  style={{
                    width: '100%',
                    flex: 1,
                    minHeight: '280px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'transparent',
                    fontFamily: "'Montserrat', sans-serif",
                    fontSize: '12px',
                    lineHeight: '1.6',
                    color: '#1E293B',
                    resize: 'none',
                    outline: 'none',
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Requirement 7: Modal for Chart Timeline & Granularity Settings ── */}
      {isChartModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            fontFamily: "'Montserrat', sans-serif",
          }}
          onClick={() => setIsChartModalOpen(false)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              boxShadow: '0 24px 48px rgba(0, 0, 0, 0.25)',
              border: '1px solid #D9E6F7',
              width: '100%',
              maxWidth: '560px',
              padding: '24px 28px',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#F0F7FF', color: '#0b53ac', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="fa-solid fa-sliders"></i>
                  </div>
                  <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0F1E3C', margin: 0 }}>
                    Chart Timeline Setting
                  </h2>
                </div>
                <p style={{ fontSize: '11px', color: '#64748B', margin: '4px 0 0 40px' }}>
                  Interactively customize the timeline and range across all 4 charts simultaneously.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setIsChartModalOpen(false)}
                style={{ padding: '4px 8px', fontSize: '12px' }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            {/* Step 1: Choose Granularity */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#475569', marginBottom: '8px', letterSpacing: '0.04em' }}>
                1. Show 4 Charts By Timeline Scale:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                {(['quarter', 'month', 'week', 'date'] as const).map(scale => {
                  const active = modalDraft.granularity === scale;
                  const labels = {
                    quarter: 'Quarter (QoQ)',
                    month: 'Month (MoM)',
                    week: 'Week (WoW)',
                    date: 'Date (DoD)',
                  };
                  return (
                    <button
                      key={scale}
                      type="button"
                      onClick={() => setModalDraft(prev => ({ ...prev, granularity: scale }))}
                      style={{
                        padding: '10px 8px',
                        fontSize: '11px',
                        fontWeight: 700,
                        borderRadius: '8px',
                        border: `1.5px solid ${active ? '#0b53ac' : '#E2E8F0'}`,
                        background: active ? '#0b53ac' : '#F8FAFC',
                        color: active ? '#FFFFFF' : '#334155',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        textAlign: 'center',
                      }}
                    >
                      {labels[scale]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 2: Show from where to where */}
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '16px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#475569', marginBottom: '10px', letterSpacing: '0.04em' }}>
                2. Show From Where To Where:
              </label>

              {/* By Quarter */}
              {modalDraft.granularity === 'quarter' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '10px', fontWeight: 700, color: '#64748B' }}>From Quarter (Qa)</label>
                    <select
                      value={modalDraft.quarterFrom}
                      onChange={e => setModalDraft(prev => ({ ...prev, quarterFrom: e.target.value }))}
                      style={{ padding: '8px 12px', fontSize: '12px', fontWeight: 600 }}
                    >
                      {allTimelineQuarters.map(q => (
                        <option key={q.key} value={q.key}>{q.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '10px', fontWeight: 700, color: '#64748B' }}>To Quarter (Qb)</label>
                    <select
                      value={modalDraft.quarterTo}
                      onChange={e => setModalDraft(prev => ({ ...prev, quarterTo: e.target.value }))}
                      style={{ padding: '8px 12px', fontSize: '12px', fontWeight: 600 }}
                    >
                      {allTimelineQuarters.map(q => (
                        <option key={q.key} value={q.key}>{q.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* By Month */}
              {modalDraft.granularity === 'month' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '10px', fontWeight: 700, color: '#64748B' }}>From Month</label>
                    <select
                      value={modalDraft.monthFrom}
                      onChange={e => setModalDraft(prev => ({ ...prev, monthFrom: e.target.value }))}
                      style={{ padding: '8px 12px', fontSize: '12px', fontWeight: 600 }}
                    >
                      {allTimelineMonths.map(m => (
                        <option key={m.key} value={m.key}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '10px', fontWeight: 700, color: '#64748B' }}>To Month</label>
                    <select
                      value={modalDraft.monthTo}
                      onChange={e => setModalDraft(prev => ({ ...prev, monthTo: e.target.value }))}
                      style={{ padding: '8px 12px', fontSize: '12px', fontWeight: 600 }}
                    >
                      {allTimelineMonths.map(m => (
                        <option key={m.key} value={m.key}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* By Week */}
              {modalDraft.granularity === 'week' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '10px', fontWeight: 700, color: '#64748B' }}>From Week</label>
                    <select
                      value={modalDraft.weekFrom}
                      onChange={e => setModalDraft(prev => ({ ...prev, weekFrom: Number(e.target.value) }))}
                      style={{ padding: '8px 12px', fontSize: '12px', fontWeight: 600 }}
                    >
                      {weeks52.map(w => (
                        <option key={w.weekNum} value={w.weekNum}>{w.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '10px', fontWeight: 700, color: '#64748B' }}>To Week</label>
                    <select
                      value={modalDraft.weekTo}
                      onChange={e => setModalDraft(prev => ({ ...prev, weekTo: Number(e.target.value) }))}
                      style={{ padding: '8px 12px', fontSize: '12px', fontWeight: 600 }}
                    >
                      {weeks52.map(w => (
                        <option key={w.weekNum} value={w.weekNum}>{w.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* By Date */}
              {modalDraft.granularity === 'date' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '10px', fontWeight: 700, color: '#64748B' }}>From Date</label>
                    <input
                      type="date"
                      value={modalDraft.dateFrom}
                      onChange={e => setModalDraft(prev => ({ ...prev, dateFrom: e.target.value }))}
                      style={{ padding: '8px 12px', fontSize: '12px' }}
                    />
                  </div>
                  <div className="form-field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '10px', fontWeight: 700, color: '#64748B' }}>To Date</label>
                    <input
                      type="date"
                      value={modalDraft.dateTo}
                      onChange={e => setModalDraft(prev => ({ ...prev, dateTo: e.target.value }))}
                      style={{ padding: '8px 12px', fontSize: '12px' }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #E2E8F0', paddingTop: '16px' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setChartTimeline(prev => ({ ...prev, active: false }));
                  setIsChartModalOpen(false);
                }}
                style={{ fontSize: '11px', color: '#64748B' }}
              >
                <i className="fa-solid fa-rotate-left"></i> Sync with Date Filter
              </button>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setIsChartModalOpen(false)}
                  style={{ fontSize: '11px' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChartTimeline({
                      ...modalDraft,
                      active: true,
                    });
                    setIsChartModalOpen(false);
                  }}
                  style={{
                    padding: '8px 18px',
                    fontSize: '12px',
                    fontWeight: 700,
                    borderRadius: '8px',
                    border: 'none',
                    background: '#0b53ac',
                    color: '#FFFFFF',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(11, 83, 172, 0.3)',
                  }}
                >
                  <i className="fa-solid fa-check" style={{ marginRight: '6px' }}></i> Apply to 4 Charts
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

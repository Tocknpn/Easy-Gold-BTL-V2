import { useState, useEffect, useMemo, useId } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';
import {
  fetchQRScans,
  getDeviceFingerprint,
  getTeamFromCampaign,
  parseUserAgentDevice,
} from '../lib/supabaseQR';
import type { QRScanRecord } from '../lib/supabaseQR';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler);

// Colors matching brand palette
const COLOR_TOTAL = '#3B82F6';   // Blue
const COLOR_UNIQUE = '#F59E0B';  // Gold / Amber
const COLOR_IOS = '#6366F1';     // Indigo
const COLOR_ANDROID = '#10B981'; // Emerald
const COLOR_OTHER = '#9CA3AF';   // Gray

type DateMode = 'quarter' | 'month' | 'week' | 'custom';
type TeamFilter = 'all' | 'agency' | 'kpv';

interface Props {
  initialTeam?: TeamFilter;
}

export default function QRDownloadReport({ initialTeam = 'all' }: Props) {
  const [scans, setScans] = useState<QRScanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [isAutoRefresh, setIsAutoRefresh] = useState(false);

  // Filters
  const [teamFilter, setTeamFilter] = useState<TeamFilter>(initialTeam);
  const [dateMode, setDateMode] = useState<DateMode>('custom');
  const [selectedQuarter, setSelectedQuarter] = useState<string>('2026-Q4');
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-10');
  const [customStart, setCustomStart] = useState<string>('2026-10-01');
  const [customEnd, setCustomEnd] = useState<string>(new Date().toISOString().slice(0, 10));
  const [campaignFilter, setCampaignFilter] = useState<string>('all');
  const [osFilter, setOsFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [pageSize, setPageSize] = useState<number>(20);
  const [page, setPage] = useState<number>(1);
  const [showSyncInfo, setShowSyncInfo] = useState<boolean>(false);

  // Accessible IDs for ARIA attributes
  const teamLabelId = useId();
  const dateViewLabelId = useId();
  const searchInputId = useId();

  // Load data
  const loadData = async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchQRScans();
    if (err) {
      console.error('Failed to fetch QR scans:', err);
      setError(err.message || 'Failed to load QR scans from Supabase.');
    } else {
      setScans(data || []);
      setLastRefreshed(new Date());
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Auto-refresh interval
  useEffect(() => {
    if (!isAutoRefresh) return;
    const interval = setInterval(() => {
      loadData();
    }, 30000); // 30s
    return () => clearInterval(interval);
  }, [isAutoRefresh]);

  // Derived available campaigns
  const availableCampaigns = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of scans) {
      map.set(s.campaign_id, (map.get(s.campaign_id) || 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => ({ id, count }));
  }, [scans]);

  // Determine active date range based on dateMode
  const dateRange = useMemo(() => {
    if (dateMode === 'custom') {
      return { start: customStart, end: customEnd };
    }
    if (dateMode === 'month') {
      const [year, month] = selectedMonth.split('-').map(Number);
      const start = `${selectedMonth}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const end = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;
      return { start, end };
    }
    if (dateMode === 'quarter') {
      const [yStr, qStr] = selectedQuarter.split('-');
      const year = parseInt(yStr, 10);
      const q = qStr.replace('Q', '');
      const quarterMap: Record<string, { start: string; end: string }> = {
        '1': { start: `${year}-01-01`, end: `${year}-03-31` },
        '2': { start: `${year}-04-01`, end: `${year}-06-30` },
        '3': { start: `${year}-07-01`, end: `${year}-09-30` },
        '4': { start: `${year}-10-01`, end: `${year}-12-31` },
      };
      return quarterMap[q] || { start: `${year}-10-01`, end: `${year}-12-31` };
    }
    if (dateMode === 'week') {
      const d = new Date();
      const end = d.toISOString().slice(0, 10);
      d.setDate(d.getDate() - 7);
      const start = d.toISOString().slice(0, 10);
      return { start, end };
    }
    return { start: customStart, end: customEnd };
  }, [dateMode, customStart, customEnd, selectedMonth, selectedQuarter]);

  // Filtered scans
  const filteredScans = useMemo(() => {
    return scans.filter(s => {
      // Date filter
      const scanDate = (s.created_at || '').slice(0, 10);
      if (dateRange.start && scanDate < dateRange.start) return false;
      if (dateRange.end && scanDate > dateRange.end) return false;

      // Team filter
      if (teamFilter !== 'all') {
        const team = getTeamFromCampaign(s.campaign_id);
        if (teamFilter === 'agency' && team !== 'Agency') return false;
        if (teamFilter === 'kpv' && team !== 'KPV') return false;
      }

      // Campaign filter
      if (campaignFilter !== 'all' && s.campaign_id !== campaignFilter) {
        return false;
      }

      // OS filter
      if (osFilter !== 'all') {
        const os = (s.os_type || '').toLowerCase();
        if (osFilter === 'ios' && os !== 'ios') return false;
        if (osFilter === 'android' && os !== 'android') return false;
        if (osFilter === 'other' && os !== 'other' && os !== 'windows' && os !== 'macintosh') return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const ip = (s.ip_address || '').toLowerCase();
        const ua = (s.user_agent || '').toLowerCase();
        const camp = (s.campaign_id || '').toLowerCase();
        if (!ip.includes(q) && !ua.includes(q) && !camp.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [scans, dateRange, teamFilter, campaignFilter, osFilter, searchQuery]);

  // ── Distinct Device Computation (IP + User Agent) ──────────────────────
  const metrics = useMemo(() => {
    const totalScans = filteredScans.length;

    // Unique devices set using IP + User Agent
    const uniqueDeviceSet = new Set<string>();
    // Map to identify earliest scan time for each device to detect first vs repeat scan
    const deviceFirstSeen = new Map<string, string>();
    const sortedChronological = [...scans].sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (const s of sortedChronological) {
      const key = getDeviceFingerprint(s);
      if (!deviceFirstSeen.has(key)) {
        deviceFirstSeen.set(key, s.created_at);
      }
    }

    let iosCount = 0;
    let androidCount = 0;
    let otherOsCount = 0;
    const iosDeviceSet = new Set<string>();
    const androidDeviceSet = new Set<string>();

    for (const s of filteredScans) {
      const key = getDeviceFingerprint(s);
      uniqueDeviceSet.add(key);

      const os = (s.os_type || '').toLowerCase();
      if (os === 'ios') {
        iosCount++;
        iosDeviceSet.add(key);
      } else if (os === 'android') {
        androidCount++;
        androidDeviceSet.add(key);
      } else {
        otherOsCount++;
      }
    }

    const uniqueDevices = uniqueDeviceSet.size;
    const repeatScans = Math.max(0, totalScans - uniqueDevices);
    const uniqueRate = totalScans > 0 ? ((uniqueDevices / totalScans) * 100).toFixed(1) : '0';
    const repeatRate = totalScans > 0 ? ((repeatScans / totalScans) * 100).toFixed(1) : '0';
    const avgScansPerDevice = uniqueDevices > 0 ? (totalScans / uniqueDevices).toFixed(2) : '0';

    return {
      totalScans,
      uniqueDevices,
      repeatScans,
      uniqueRate,
      repeatRate,
      avgScansPerDevice,
      iosCount,
      iosUnique: iosDeviceSet.size,
      androidCount,
      androidUnique: androidDeviceSet.size,
      otherOsCount,
      deviceFirstSeen,
    };
  }, [filteredScans, scans]);

  // ── Campaign Breakdown ──────────────────────────────────────────────────
  const campaignBreakdown = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        team: string;
        total: number;
        deviceSet: Set<string>;
        ios: number;
        android: number;
        other: number;
      }
    >();

    for (const s of filteredScans) {
      if (!map.has(s.campaign_id)) {
        map.set(s.campaign_id, {
          id: s.campaign_id,
          team: getTeamFromCampaign(s.campaign_id),
          total: 0,
          deviceSet: new Set<string>(),
          ios: 0,
          android: 0,
          other: 0,
        });
      }
      const entry = map.get(s.campaign_id)!;
      entry.total++;
      entry.deviceSet.add(getDeviceFingerprint(s));
      const os = (s.os_type || '').toLowerCase();
      if (os === 'ios') entry.ios++;
      else if (os === 'android') entry.android++;
      else entry.other++;
    }

    return Array.from(map.values())
      .map(item => ({
        id: item.id,
        team: item.team,
        total: item.total,
        unique: item.deviceSet.size,
        uniqueRate: item.total > 0 ? ((item.deviceSet.size / item.total) * 100).toFixed(1) : '0',
        ios: item.ios,
        android: item.android,
        share: metrics.totalScans > 0 ? ((item.total / metrics.totalScans) * 100).toFixed(1) : '0',
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredScans, metrics.totalScans]);

  // ── Daily Trend Data ────────────────────────────────────────────────────
  const dailyTrend = useMemo(() => {
    const dailyMap = new Map<string, { total: number; devices: Set<string> }>();

    for (const s of filteredScans) {
      const d = (s.created_at || '').slice(0, 10);
      if (!dailyMap.has(d)) {
        dailyMap.set(d, { total: 0, devices: new Set() });
      }
      const entry = dailyMap.get(d)!;
      entry.total++;
      entry.devices.add(getDeviceFingerprint(s));
    }

    const sortedDates = Array.from(dailyMap.keys()).sort();
    const labels = sortedDates.map(d => {
      try {
        const parts = d.split('-');
        return `${parts[2]}/${parts[1]}`;
      } catch {
        return d;
      }
    });

    return {
      labels,
      totalScans: sortedDates.map(d => dailyMap.get(d)!.total),
      uniqueDevices: sortedDates.map(d => dailyMap.get(d)!.devices.size),
    };
  }, [filteredScans]);

  // Line Chart Config
  const lineChartData = {
    labels: dailyTrend.labels,
    datasets: [
      {
        label: 'Total Scans',
        data: dailyTrend.totalScans,
        borderColor: COLOR_TOTAL,
        backgroundColor: 'rgba(59, 130, 246, 0.12)',
        tension: 0.35,
        fill: true,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 2,
      },
      {
        label: 'Unique Devices (Distinct IP + UA)',
        data: dailyTrend.uniqueDevices,
        borderColor: COLOR_UNIQUE,
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        tension: 0.35,
        fill: true,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 2,
      },
    ],
  };

  const lineChartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: 'var(--txt-main)',
          font: { size: 12, weight: 600 },
          boxWidth: 14,
        },
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleFont: { size: 13, weight: 700 },
        bodyFont: { size: 12 },
        padding: 10,
        boxPadding: 4,
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(150, 150, 150, 0.1)' },
        ticks: { color: 'var(--txt-sub)', font: { size: 11 } },
      },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(150, 150, 150, 0.1)' },
        ticks: { color: 'var(--txt-sub)', font: { size: 11 }, precision: 0 },
      },
    },
  };

  // OS Doughnut Config
  const osDoughnutData = {
    labels: ['iOS (Apple)', 'Android', 'Other / Web'],
    datasets: [
      {
        data: [metrics.iosCount, metrics.androidCount, metrics.otherOsCount],
        backgroundColor: [COLOR_IOS, COLOR_ANDROID, COLOR_OTHER],
        borderWidth: 0,
        hoverOffset: 6,
      },
    ],
  };

  const osDoughnutOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '72%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: 'var(--txt-main)',
          font: { size: 11, weight: 600 },
          boxWidth: 12,
          padding: 12,
        },
      },
    },
  };

  // Pagination for Scans Table
  const totalPages = Math.max(1, Math.ceil(filteredScans.length / pageSize));
  const currentScans = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredScans.slice(start, start + pageSize);
  }, [filteredScans, page, pageSize]);

  // Export CSV handler
  const handleExportCSV = () => {
    if (filteredScans.length === 0) return;
    const headers = ['Timestamp', 'Campaign', 'Team', 'OS', 'IP Address', 'User Agent', 'Device Identified', 'Device Status'];
    const rows = filteredScans.map(s => {
      const key = getDeviceFingerprint(s);
      const firstSeen = metrics.deviceFirstSeen.get(key);
      const isFirst = firstSeen === s.created_at;
      return [
        `"${s.created_at}"`,
        `"${s.campaign_id}"`,
        `"${getTeamFromCampaign(s.campaign_id)}"`,
        `"${s.os_type}"`,
        `"${s.ip_address}"`,
        `"${(s.user_agent || '').replace(/"/g, '""')}"`,
        `"${parseUserAgentDevice(s.user_agent, s.os_type)}"`,
        `"${isFirst ? 'Unique (First Seen)' : 'Repeat Scan'}"`,
      ].join(',');
    });
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `qr_download_performance_${dateRange.start}_to_${dateRange.end}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ animation: 'fadeIn 0.25s ease' }}>
      {/* ── Top Header Bar with Live Indicator & Refresh ───────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '18px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '14px',
          padding: '14px 18px',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #2563EB, #1D4ED8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              fontSize: '20px',
              boxShadow: '0 4px 10px rgba(37, 99, 235, 0.25)',
            }}
          >
            <i className="fa-solid fa-qrcode"></i>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: 'var(--txt-main)' }}>
                QR Download Performance
              </h2>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#10B981',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981', display: 'inline-block' }}></span>
                Supabase Connected
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--txt-sub)', marginTop: '2px' }}>
              Distinct device tracking (IP + User Agent) · Last synced {lastRefreshed.toLocaleTimeString()}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setShowSyncInfo(s => !s)}
            style={{ fontSize: '11px', padding: '6px 12px' }}
            title="Database sync & configuration details"
          >
            <i className="fa-solid fa-database" style={{ marginRight: '6px' }}></i>
            DB Sync Info
          </button>

          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              color: 'var(--txt-sub)',
              marginRight: '4px',
            }}
          >
            <input
              type="checkbox"
              checked={isAutoRefresh}
              onChange={e => setIsAutoRefresh(e.target.checked)}
              style={{ accentColor: 'var(--accent)' }}
            />
            Auto 30s
          </label>

          <button
            type="button"
            className="btn btn-primary"
            onClick={loadData}
            disabled={loading}
            style={{ fontSize: '12px', padding: '7px 14px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <i className={`fa-solid fa-rotate-right ${loading ? 'fa-spin' : ''}`}></i>
            <span>{loading ? 'Refreshing…' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* ── Optional DB Sync Info Drawer ─────────────────────────────────── */}
      {showSyncInfo && (
        <div
          style={{
            background: 'var(--surface-sub)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '14px 18px',
            marginBottom: '18px',
            fontSize: '12px',
            lineHeight: 1.5,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
            <strong style={{ color: 'var(--txt-main)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="fa-solid fa-circle-info" style={{ color: 'var(--accent)' }}></i>
              Supabase Multi-Database Architecture & Syncing
            </strong>
            <button
              type="button"
              onClick={() => setShowSyncInfo(false)}
              className="btn btn-ghost"
              style={{ padding: '2px 6px', fontSize: '11px' }}
            >
              ✕
            </button>
          </div>
          <p style={{ margin: '0 0 8px 0', color: 'var(--txt-sub)' }}>
            This dashboard connects <strong>directly to the QR tracking Supabase database</strong> (
            <code>https://dijswodliksqchohozkx.supabase.co</code>) in real-time. This provides instant live scan metrics with zero lag.
          </p>
          <div style={{ background: 'var(--input-bg)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 700, color: 'var(--txt-main)', marginBottom: '4px' }}>
              Want to mirror this table into your primary Supabase database?
            </div>
            <div style={{ color: 'var(--txt-sub)', fontSize: '11px' }}>
              You can run a Postgres Foreign Data Wrapper (<code>postgres_fdw</code>) in your primary Supabase SQL Editor to make
              <code> qr_scans</code> queryable directly inside your main database schema without copying records.
            </div>
          </div>
        </div>
      )}

      {/* ── Error Banner ─────────────────────────────────────────────────── */}
      {error && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '16px',
            color: '#EF4444',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <i className="fa-solid fa-triangle-exclamation"></i>
          <span>{error}</span>
        </div>
      )}

      {/* ── Filter Bar (Attachment 2 Style) ──────────────────────────────── */}
      <div
        className="filter-bar"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'flex-end',
          background: 'var(--surface)',
          padding: '14px 16px',
          borderRadius: '14px',
          border: '1px solid var(--border)',
          marginBottom: '20px',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        {/* BY TEAM Filter */}
        <div className="form-field" style={{ margin: 0 }}>
          <label id={teamLabelId} style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--txt-dim)' }}>
            By Team
          </label>
          <div
            role="group"
            aria-labelledby={teamLabelId}
            style={{
              display: 'inline-flex',
              background: 'var(--input-bg)',
              padding: '3px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
            }}
          >
            {(['all', 'agency', 'kpv'] as TeamFilter[]).map(t => {
              const active = teamFilter === t;
              const label = t === 'all' ? 'All Teams' : t === 'agency' ? 'Agency' : 'KPV';
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setTeamFilter(t); setPage(1); }}
                  style={{
                    padding: '5px 12px',
                    fontSize: '11px',
                    fontWeight: 700,
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    background: active ? 'var(--accent)' : 'transparent',
                    color: active ? '#FFFFFF' : 'var(--txt-sub)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* DATE VIEW Toggle (Quarter / Month / Week / Date From-To) */}
        <div className="form-field" style={{ margin: 0 }}>
          <label id={dateViewLabelId} style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--txt-dim)' }}>
            Date View
          </label>
          <div
            role="group"
            aria-labelledby={dateViewLabelId}
            style={{
              display: 'inline-flex',
              background: 'var(--input-bg)',
              padding: '3px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
            }}
          >
            {(['quarter', 'month', 'week', 'custom'] as DateMode[]).map(m => {
              const active = dateMode === m;
              const label = m === 'custom' ? 'Date From-To' : m.charAt(0).toUpperCase() + m.slice(1);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setDateMode(m); setPage(1); }}
                  style={{
                    padding: '5px 12px',
                    fontSize: '11px',
                    fontWeight: 700,
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    background: active ? 'var(--accent)' : 'transparent',
                    color: active ? '#FFFFFF' : 'var(--txt-sub)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Mode-Specific Selectors */}
        {dateMode === 'quarter' && (
          <div className="form-field" style={{ margin: 0 }}>
            <label style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--txt-dim)' }}>
              Select Quarter
            </label>
            <select
              value={selectedQuarter}
              onChange={e => { setSelectedQuarter(e.target.value); setPage(1); }}
              style={{ padding: '6px 11px', fontSize: '12px', height: '34px', fontWeight: 600 }}
            >
              <option value="2026-Q4">Q4'26 (Oct – Dec)</option>
              <option value="2026-Q3">Q3'26 (Jul – Sep)</option>
              <option value="2026-Q2">Q2'26 (Apr – Jun)</option>
              <option value="2026-Q1">Q1'26 (Jan – Mar)</option>
            </select>
          </div>
        )}

        {dateMode === 'month' && (
          <div className="form-field" style={{ margin: 0 }}>
            <label style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--txt-dim)' }}>
              Select Month
            </label>
            <select
              value={selectedMonth}
              onChange={e => { setSelectedMonth(e.target.value); setPage(1); }}
              style={{ padding: '6px 11px', fontSize: '12px', height: '34px', fontWeight: 600 }}
            >
              <option value="2026-10">October 2026</option>
              <option value="2026-09">September 2026</option>
              <option value="2026-08">August 2026</option>
              <option value="2026-07">July 2026</option>
            </select>
          </div>
        )}

        {dateMode === 'custom' && (
          <>
            <div className="form-field" style={{ margin: 0 }}>
              <label style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--txt-dim)' }}>
                Date From
              </label>
              <input
                type="date"
                value={customStart}
                onChange={e => { setCustomStart(e.target.value); setPage(1); }}
                style={{ padding: '6px 10px', fontSize: '12px', height: '34px', width: '135px' }}
              />
            </div>

            <div className="form-field" style={{ margin: 0 }}>
              <label style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--txt-dim)' }}>
                Date To
              </label>
              <input
                type="date"
                value={customEnd}
                onChange={e => { setCustomEnd(e.target.value); setPage(1); }}
                style={{ padding: '6px 10px', fontSize: '12px', height: '34px', width: '135px' }}
              />
            </div>

            {/* Quick date presets */}
            <div style={{ display: 'flex', gap: '4px', paddingBottom: '3px' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  const today = new Date().toISOString().slice(0, 10);
                  setCustomStart(today);
                  setCustomEnd(today);
                  setPage(1);
                }}
                style={{ fontSize: '10px', padding: '4px 8px', height: '28px' }}
              >
                Today
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  const d = new Date();
                  const end = d.toISOString().slice(0, 10);
                  d.setDate(d.getDate() - 7);
                  const start = d.toISOString().slice(0, 10);
                  setCustomStart(start);
                  setCustomEnd(end);
                  setPage(1);
                }}
                style={{ fontSize: '10px', padding: '4px 8px', height: '28px' }}
              >
                Last 7D
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setCustomStart('2026-10-01');
                  setCustomEnd(new Date().toISOString().slice(0, 10));
                  setPage(1);
                }}
                style={{ fontSize: '10px', padding: '4px 8px', height: '28px' }}
              >
                All Oct
              </button>
            </div>
          </>
        )}

        {/* CAMPAIGN Filter */}
        <div className="form-field" style={{ margin: 0 }}>
          <label style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--txt-dim)' }}>
            Campaign
          </label>
          <select
            value={campaignFilter}
            onChange={e => { setCampaignFilter(e.target.value); setPage(1); }}
            style={{ padding: '6px 11px', fontSize: '12px', height: '34px', fontWeight: 600, minWidth: '150px' }}
          >
            <option value="all">All Campaigns ({scans.length})</option>
            {availableCampaigns.map(c => (
              <option key={c.id} value={c.id}>
                {c.id} ({c.count})
              </option>
            ))}
          </select>
        </div>

        {/* OS Filter */}
        <div className="form-field" style={{ margin: 0 }}>
          <label style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--txt-dim)' }}>
            Platform / OS
          </label>
          <select
            value={osFilter}
            onChange={e => { setOsFilter(e.target.value); setPage(1); }}
            style={{ padding: '6px 11px', fontSize: '12px', height: '34px', fontWeight: 600 }}
          >
            <option value="all">All OS</option>
            <option value="ios">iOS (Apple)</option>
            <option value="android">Android</option>
            <option value="other">Desktop / Other</option>
          </select>
        </div>

        {/* Export CSV button */}
        <div style={{ marginLeft: 'auto' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleExportCSV}
            disabled={filteredScans.length === 0}
            style={{ fontSize: '11px', padding: '6px 12px', height: '34px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <i className="fa-solid fa-file-arrow-down"></i>
            <span>Export CSV ({filteredScans.length})</span>
          </button>
        </div>
      </div>

      {/* ── KPI Summary Cards ────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '14px',
          marginBottom: '20px',
        }}
      >
        {/* 1. Total Scans */}
        <div
          className="kpi-card"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderTop: `4px solid ${COLOR_TOTAL}`,
            borderRadius: '12px',
            padding: '16px 18px',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--txt-sub)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Total QR Scans
            </span>
            <i className="fa-solid fa-expand" style={{ color: COLOR_TOTAL, fontSize: '14px' }}></i>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--txt-main)', marginTop: '8px', lineHeight: 1.1 }}>
            {metrics.totalScans.toLocaleString()}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--txt-dim)', marginTop: '6px' }}>
            Raw QR scan redirects recorded
          </div>
        </div>

        {/* 2. Unique Devices (Distinct IP + User Agent) */}
        <div
          className="kpi-card"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderTop: `4px solid ${COLOR_UNIQUE}`,
            borderRadius: '12px',
            padding: '16px 18px',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--txt-sub)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Unique Devices
            </span>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 800,
                padding: '2px 6px',
                borderRadius: '6px',
                background: 'rgba(245, 158, 11, 0.15)',
                color: COLOR_UNIQUE,
              }}
            >
              Distinct IP+UA
            </span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: COLOR_UNIQUE, marginTop: '8px', lineHeight: 1.1 }}>
            {metrics.uniqueDevices.toLocaleString()}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--txt-sub)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontWeight: 700, color: 'var(--green)' }}>{metrics.uniqueRate}%</span>
            <span>of total scans are unique</span>
          </div>
        </div>

        {/* 3. iOS Scans */}
        <div
          className="kpi-card"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderTop: `4px solid ${COLOR_IOS}`,
            borderRadius: '12px',
            padding: '16px 18px',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--txt-sub)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              iOS (App Store)
            </span>
            <i className="fa-brands fa-apple" style={{ color: COLOR_IOS, fontSize: '16px' }}></i>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--txt-main)', marginTop: '8px', lineHeight: 1.1 }}>
            {metrics.iosCount.toLocaleString()}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--txt-dim)', marginTop: '6px' }}>
            <strong>{metrics.iosUnique}</strong> unique Apple devices
          </div>
        </div>

        {/* 4. Android Scans */}
        <div
          className="kpi-card"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderTop: `4px solid ${COLOR_ANDROID}`,
            borderRadius: '12px',
            padding: '16px 18px',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--txt-sub)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Android (Play Store)
            </span>
            <i className="fa-brands fa-android" style={{ color: COLOR_ANDROID, fontSize: '16px' }}></i>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--txt-main)', marginTop: '8px', lineHeight: 1.1 }}>
            {metrics.androidCount.toLocaleString()}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--txt-dim)', marginTop: '6px' }}>
            <strong>{metrics.androidUnique}</strong> unique Android devices
          </div>
        </div>

        {/* 5. Repeat / Return Ratio */}
        <div
          className="kpi-card"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderTop: '4px solid var(--border-focus, #6366F1)',
            borderRadius: '12px',
            padding: '16px 18px',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--txt-sub)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Repeat Scans
            </span>
            <i className="fa-solid fa-arrows-rotate" style={{ color: 'var(--txt-dim)', fontSize: '13px' }}></i>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--txt-main)', marginTop: '8px', lineHeight: 1.1 }}>
            {metrics.repeatScans.toLocaleString()}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--txt-sub)', marginTop: '6px' }}>
            Repeat rate: <strong>{metrics.repeatRate}%</strong> ({metrics.avgScansPerDevice} scans/device)
          </div>
        </div>
      </div>

      {/* ── Visual Charts Row ────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: '16px',
          marginBottom: '20px',
        }}
      >
        {/* Daily Scans Trend Chart */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '14px',
            padding: '18px',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--txt-main)' }}>
                Daily Scans & Device Trends
              </h3>
              <div style={{ fontSize: '11px', color: 'var(--txt-dim)' }}>
                Comparison of total scan volume vs distinct physical devices
              </div>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--txt-sub)' }}>
              Range: {dateRange.start} → {dateRange.end}
            </span>
          </div>

          <div style={{ height: '260px' }}>
            {dailyTrend.labels.length > 0 ? (
              <Line data={lineChartData} options={lineChartOptions} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--txt-dim)', fontSize: '12px' }}>
                No scan data recorded in this period.
              </div>
            )}
          </div>
        </div>

        {/* OS Platform Breakdown (Doughnut) */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '14px',
            padding: '18px',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ marginBottom: '14px' }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--txt-main)' }}>
              Platform Breakdown
            </h3>
            <div style={{ fontSize: '11px', color: 'var(--txt-dim)' }}>
              App Store redirects by operating system
            </div>
          </div>

          <div style={{ flex: 1, minHeight: '200px', position: 'relative' }}>
            {metrics.totalScans > 0 ? (
              <Doughnut data={osDoughnutData} options={osDoughnutOptions} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--txt-dim)', fontSize: '12px' }}>
                No platform data
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Campaign Performance Table ───────────────────────────────────── */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '14px',
          padding: '18px',
          marginBottom: '20px',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--txt-main)' }}>
              Campaign & Team Performance Breakdown
            </h3>
            <div style={{ fontSize: '11px', color: 'var(--txt-dim)' }}>
              Unique devices and scan conversion rate per campaign
            </div>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--txt-sub)' }}>
            {campaignBreakdown.length} Active Campaigns
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--txt-sub)' }}>
                <th style={{ padding: '8px 10px' }}>Campaign ID</th>
                <th style={{ padding: '8px 10px' }}>Assigned Team</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Total Scans</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Unique Devices (IP+UA)</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>iOS Scans</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Android Scans</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Unique Rate</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Share of Scans</th>
              </tr>
            </thead>
            <tbody>
              {campaignBreakdown.map(c => {
                const isAgency = c.team === 'Agency';
                const isKpv = c.team === 'KPV';
                const teamColor = isAgency ? '#3B82F6' : isKpv ? '#9E1B32' : 'var(--txt-sub)';

                return (
                  <tr
                    key={c.id}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-sub)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '10px', fontWeight: 700, color: 'var(--txt-main)' }}>
                      <code>{c.id}</code>
                    </td>
                    <td style={{ padding: '10px' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: `${teamColor}1A`,
                          color: teamColor,
                        }}
                      >
                        {c.team}
                      </span>
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, color: 'var(--txt-main)' }}>
                      {c.total.toLocaleString()}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 800, color: COLOR_UNIQUE }}>
                      {c.unique.toLocaleString()}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', color: 'var(--txt-sub)' }}>
                      {c.ios}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', color: 'var(--txt-sub)' }}>
                      {c.android}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>
                      <span style={{ fontWeight: 700, color: 'var(--green)' }}>{c.uniqueRate}%</span>
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', color: 'var(--txt-sub)' }}>
                      {c.share}%
                    </td>
                  </tr>
                );
              })}
              {campaignBreakdown.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: 'var(--txt-dim)' }}>
                    No campaigns found matching current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Detailed Scans Log Feed Table ────────────────────────────────── */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '14px',
          padding: '18px',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            marginBottom: '14px',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--txt-main)' }}>
              Live Scan Activity Stream
            </h3>
            <div style={{ fontSize: '11px', color: 'var(--txt-dim)' }}>
              Showing {filteredScans.length} scans · Distinct devices counted by IP address + User Agent fingerprint
            </div>
          </div>

          {/* Search box within scan table */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label htmlFor={searchInputId} className="sr-only">Search IP, User Agent, or Campaign</label>
            <input
              id={searchInputId}
              type="search"
              placeholder="Search IP, UA, Campaign…"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--input-bg)',
                color: 'var(--txt-main)',
                width: '200px',
              }}
            />
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--txt-sub)' }}>
                <th style={{ padding: '8px 10px' }}>Timestamp</th>
                <th style={{ padding: '8px 10px' }}>Campaign</th>
                <th style={{ padding: '8px 10px' }}>Platform</th>
                <th style={{ padding: '8px 10px' }}>Device & Browser</th>
                <th style={{ padding: '8px 10px' }}>IP Address</th>
                <th style={{ padding: '8px 10px' }}>Device Status</th>
              </tr>
            </thead>
            <tbody>
              {currentScans.map(s => {
                const key = getDeviceFingerprint(s);
                const firstSeenTime = metrics.deviceFirstSeen.get(key);
                const isUniqueFirst = firstSeenTime === s.created_at;

                const os = (s.os_type || '').toLowerCase();
                const isIos = os === 'ios';
                const isAndroid = os === 'android';

                const formattedTime = new Date(s.created_at).toLocaleString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                });

                return (
                  <tr
                    key={s.id}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-sub)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '10px', color: 'var(--txt-sub)', whiteSpace: 'nowrap' }}>
                      {formattedTime}
                    </td>
                    <td style={{ padding: '10px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: 'var(--input-bg)',
                          border: '1px solid var(--border)',
                          color: 'var(--txt-main)',
                        }}
                      >
                        {s.campaign_id}
                      </span>
                    </td>
                    <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          color: isIos ? COLOR_IOS : isAndroid ? COLOR_ANDROID : COLOR_OTHER,
                        }}
                      >
                        <i className={`fa-brands ${isIos ? 'fa-apple' : isAndroid ? 'fa-android' : 'fa-chrome'}`}></i>
                        {os.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '10px', color: 'var(--txt-main)' }}>
                      <div style={{ fontWeight: 600 }}>{parseUserAgentDevice(s.user_agent, s.os_type)}</div>
                      <div
                        style={{
                          fontSize: '10px',
                          color: 'var(--txt-dim)',
                          maxWidth: '320px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={s.user_agent}
                      >
                        {s.user_agent}
                      </div>
                    </td>
                    <td style={{ padding: '10px', fontFamily: 'var(--font-mono, monospace)', color: 'var(--txt-sub)' }}>
                      {s.ip_address}
                    </td>
                    <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>
                      {isUniqueFirst ? (
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: '#10B981',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <i className="fa-solid fa-check" style={{ fontSize: '9px' }}></i>
                          First Seen (Unique Device)
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: 'rgba(156, 163, 175, 0.15)',
                            color: 'var(--txt-sub)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <i className="fa-solid fa-repeat" style={{ fontSize: '9px' }}></i>
                          Repeat Scan
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {currentScans.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--txt-dim)' }}>
                    No scans match the current filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '16px',
              paddingTop: '12px',
              borderTop: '1px solid var(--border)',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', color: 'var(--txt-sub)' }}>
              <span>Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, filteredScans.length)} of {filteredScans.length} scans</span>
              <select
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                style={{ padding: '2px 6px', fontSize: '11px', height: '24px', background: 'var(--input-bg)' }}
              >
                <option value={10}>10 / page</option>
                <option value={20}>20 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                style={{ padding: '4px 8px', fontSize: '11px' }}
              >
                Previous
              </button>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--txt-main)', padding: '0 6px' }}>
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                style={{ padding: '4px 8px', fontSize: '11px' }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

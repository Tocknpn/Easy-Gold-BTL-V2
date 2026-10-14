import React, { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import { sendClientHeartbeat } from './lib/keepalive';
import './index.css';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Login = lazy(() => import('./pages/Login'));
const SubmitResults = lazy(() => import('./pages/SubmitResults'));
const CheckIn = lazy(() => import('./pages/CheckIn'));
const CalendarRoute = lazy(() => import('./pages/CalendarRoute'));
const Targets = lazy(() => import('./pages/Targets'));
const Report = lazy(() => import('./pages/Report'));
const StaffReport = lazy(() => import('./pages/StaffReport'));
const MerchReport = lazy(() => import('./pages/MerchReport'));
const RouteMap = lazy(() => import('./pages/RouteMap'));
const CostManager = lazy(() => import('./pages/CostManager'));
const PlanSetting = lazy(() => import('./pages/PlanSetting'));
const Settings = lazy(() => import('./pages/Settings'));
const Diagnostic = lazy(() => import('./pages/Diagnostic'));
const HealthMonitor = lazy(() => import('./pages/HealthMonitor'));
const CopyPaste = lazy(() => import('./pages/CopyPaste'));
const EventManagement = lazy(() => import('./pages/EventManagement'));
const EventReport = lazy(() => import('./pages/EventReport'));

// Dense admin screens and slide decks get extra canvas width (1440px)
const WIDE_PAGES = ['/', '/cost-manager', '/copy-paste', '/report', '/event-management', '/event-report'];

function Layout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(() => {
    try {
      const stored = localStorage.getItem('easygold_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem('eg_sidebar_collapsed') === '1');
  const [showCommitInfo, setShowCommitInfo] = useState<boolean>(() => localStorage.getItem('eg_show_commit_info') === '1');
  const navigate = useNavigate();
  const location = useLocation();

  const toggleCommitInfo = () => {
    setShowCommitInfo(prev => {
      const next = !prev;
      localStorage.setItem('eg_show_commit_info', next ? '1' : '0');
      return next;
    });
  };
  useEffect(() => {
    const storedUser = localStorage.getItem('easygold_user');
    if (storedUser) {
      const u = JSON.parse(storedUser);
      setUser(u);
      const ATL_ALLOWED = ['/', '/calendar', '/event-management', '/event-report'];
      if (u.role === 'atl') {
        if (!ATL_ALLOWED.includes(location.pathname)) {
          navigate('/', { replace: true });
        }
      } else {
        const ADMIN_ONLY = ['/', '/report', '/merch-report', '/route-map', '/cost-manager', '/plan-setting', '/settings', '/health', '/diagnostic', '/event-management', '/event-report'];
        const privileged = u.role === 'admin' || u.role === 'manager';
        if (!privileged && ADMIN_ONLY.includes(location.pathname)) {
          navigate('/calendar', { replace: true });
        } else if (!privileged && location.pathname === '/staff-report' && u.team !== 'KPV') {
          navigate('/calendar', { replace: true });
        }
      }
    } else {
      navigate('/login');
    }
  }, [navigate, location.pathname]);

  useEffect(() => {
    const handleWheel = () => {
      if (document.activeElement?.tagName === 'INPUT' && (document.activeElement as HTMLInputElement).type === 'number') {
        (document.activeElement as HTMLElement).blur();
      }
    };
    document.addEventListener('wheel', handleWheel);
    return () => document.removeEventListener('wheel', handleWheel);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('easygold_user');
    navigate('/login');
  };

  const handleToggleCollapse = () => {
    setCollapsed(c => {
      const next = !c;
      localStorage.setItem('eg_sidebar_collapsed', next ? '1' : '0');
      return next;
    });
  };

  const pageTitles: Record<string, { title: string; sub: string }> = {
    '/': { title: 'Dashboard', sub: 'Event Manager - Overview' },
    '/submit': { title: 'Submit Results', sub: 'Team - Daily Entry' },
    '/checkin': { title: 'Check-In', sub: 'Record My Location' },
    '/calendar': { title: 'Calendar & Route', sub: 'Planned routes and check-ins' },
    '/targets': { title: 'My Targets', sub: 'MTD performance vs monthly targets' },
    '/report': { title: 'Submission History', sub: 'Full submission log' },
    '/staff-report': { title: 'Staff Report', sub: 'Team - Member Performance' },
    '/merch-report': { title: 'Merch Report', sub: 'Manager - Distribution Analysis' },
    '/route-map': { title: 'Route Map', sub: 'Manager - Visual Routing' },
    '/cost-manager': { title: 'Cost Manager', sub: 'Admin - Financial Overview' },
    '/plan-setting': { title: 'Monthly Route Plan', sub: 'Admin - Editable Monthly Schedule' },
    '/settings': { title: 'Upload & Settings', sub: 'Admin - Config Panel' },
    '/health': { title: 'Health Monitor', sub: 'Admin - Connection & Performance' },
    '/diagnostic': { title: 'Diagnostic', sub: 'Admin - Supabase Connection Check' },
    '/copy-paste': { title: 'Copy & Paste', sub: 'Quick data copy to clipboard' },
    '/event-management': { title: 'Event Management', sub: 'Manager – Event Planning & Details' },
    '/event-report': { title: 'Event Report', sub: 'Manager – Event Profile & KPI Gallery' },
  };

  const currentPath = location.pathname;
  let headerInfo = pageTitles[currentPath] || { title: 'Easy Gold BTL', sub: '' };
  if (currentPath === '/' && (location.search.includes('tab=qr-performance') || location.search.includes('tab=qr'))) {
    headerInfo = { title: 'QR Download Performance', sub: 'Device Scan & App Download Analytics' };
  }

  if (!user) return (
    <div className="fullscreen-loader" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100vw', flex: 1, background: 'var(--ink)', flexDirection: 'column', gap: '16px' }}>
      <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '28px', color: 'var(--accent)' }}></i>
      <span style={{ color: 'var(--txt-sub)', fontSize: '13px' }}>Loading…</span>
    </div>
  );

  return (
    <>
      <a className="skip-link" href="#main">Skip to main content</a>
      <Sidebar
        user={user}
        onLogout={handleLogout}
        currentPath={currentPath}
        collapsed={collapsed}
        onToggleCollapse={handleToggleCollapse}
      />
      <main id="main">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Mini expand button in topbar when sidebar is collapsed */}
            {collapsed && (
              <button
                onClick={handleToggleCollapse}
                title="Expand sidebar"
                className="btn btn-ghost"
                style={{ padding: '5px 8px', fontSize: '12px', flexShrink: 0 }}
              >
                <i className="fa-solid fa-bars"></i>
              </button>
            )}
            <div>
              <h1 id="tb-title" className={['/event-management', '/event-report'].includes(currentPath) ? 'font-montserrat' : ''}>{headerInfo.title}</h1>
              <div className={`sub ${['/event-management', '/event-report'].includes(currentPath) ? 'font-montserrat' : ''}`} id="tb-sub">{headerInfo.sub}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {user?.role === 'admin' && (
              <>
                {showCommitInfo && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: 'var(--input-bg)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '4px 10px',
                      fontSize: '11px',
                      lineHeight: 1.3,
                      animation: 'fadeUp 0.15s ease',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        color: 'var(--accent)',
                        fontSize: '10px',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {__APP_VERSION__} ({__GIT_COMMIT_HASH__})
                    </span>
                    <span style={{ color: 'var(--border)' }}>|</span>
                    <span
                      style={{
                        color: 'var(--txt-sub)',
                        maxWidth: '220px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: '10px',
                      }}
                      title={__GIT_COMMIT_MSG__}
                    >
                      {__GIT_COMMIT_MSG__ || 'N/A'}
                    </span>
                    <span style={{ color: 'var(--border)' }}>|</span>
                    <span style={{ fontSize: '10px', color: 'var(--txt-dim)', whiteSpace: 'nowrap' }}>
                      {__BUILD_TIME__}
                    </span>
                    <span style={{ color: 'var(--green)', fontSize: '9px', fontWeight: 700 }}>
                      ● live
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={toggleCommitInfo}
                  title={showCommitInfo ? 'Hide commit info' : 'Show commit info'}
                  aria-label={showCommitInfo ? 'Hide commit info' : 'Show commit info'}
                  style={{
                    padding: '6px',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    color: showCommitInfo ? 'var(--accent)' : 'var(--txt-sub)',
                    transition: 'color 0.2s ease',
                  }}
                >
                  <i className={`fa-solid ${showCommitInfo ? 'fa-eye' : 'fa-eye-slash'}`}></i>
                </button>
              </>
            )}
            <button className="btn btn-ghost" onClick={() => window.location.reload()} style={{ padding: '6px', borderRadius: '50%', width: '32px', height: '32px' }} title="Refresh Page">
              <i className="fa-solid fa-rotate-right"></i>
            </button>
            {(user.role === 'admin' || user.role === 'manager' || user.role === 'atl') && (
              <button className={`pill ${user.role === 'atl' ? 'pill-purple' : 'pill-blue'}`} style={{ fontSize: '11px', padding: '6px 12px', cursor: 'pointer' }}>
                {user.role === 'atl' ? 'ATL' : user.role === 'manager' ? 'EVENT MANAGER' : 'MANAGEMENT'}
              </button>
            )}
          </div>
        </header>
        <div id="content">
          <div className={`page active${WIDE_PAGES.includes(location.pathname) ? ' page-wide' : ''}${['/event-management', '/event-report'].includes(location.pathname) ? ' font-montserrat' : ''}`} style={{ display: 'block' }}>
            {children}
          </div>
        </div>
      </main>
    </>
  );
}

function App() {
  useEffect(() => {
    // Fire-and-forget keepalive: counts as Supabase API activity.
    sendClientHeartbeat();
  }, []);

  return (
    <Router>
      <Suspense fallback={
        <div className="fullscreen-loader" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100vw', flex: 1, background: 'var(--ink)', flexDirection: 'column', gap: '16px' }}>
          <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '28px', color: 'var(--accent)' }}></i>
          <span style={{ color: 'var(--txt-sub)', fontSize: '13px' }}>Loading…</span>
        </div>
      }>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Layout><Dashboard /></Layout>} />
          <Route path="/forecast" element={<Navigate to="/?tab=forecast" replace />} />
          <Route path="/qr-performance" element={<Navigate to="/?tab=qr-performance" replace />} />
          <Route path="/qr-download" element={<Navigate to="/?tab=qr-performance" replace />} />
          <Route path="/submit" element={<Layout><SubmitResults /></Layout>} />
          <Route path="/checkin" element={<Layout><CheckIn /></Layout>} />
          <Route path="/calendar" element={<Layout><CalendarRoute /></Layout>} />
          <Route path="/targets" element={<Layout><Targets /></Layout>} />
          <Route path="/report" element={<Layout><Report /></Layout>} />
          <Route path="/staff-report" element={<Layout><StaffReport /></Layout>} />
          <Route path="/merch-report" element={<Layout><MerchReport /></Layout>} />
          <Route path="/route-map" element={<Layout><RouteMap /></Layout>} />
          <Route path="/cost-manager" element={<Layout><CostManager /></Layout>} />
          <Route path="/plan-setting" element={<Layout><PlanSetting /></Layout>} />
          <Route path="/settings" element={<Layout><Settings /></Layout>} />
          <Route path="/copy-paste" element={<Layout><CopyPaste /></Layout>} />
          <Route path="/health" element={<Layout><HealthMonitor /></Layout>} />
          <Route path="/diagnostic" element={<Layout><Diagnostic /></Layout>} />
          <Route path="/event-management" element={<Layout><EventManagement /></Layout>} />
          <Route path="/event-report" element={<Layout><EventReport /></Layout>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;

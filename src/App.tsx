import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import SubmitResults from './pages/SubmitResults';
import CheckIn from './pages/CheckIn';
import CalendarRoute from './pages/CalendarRoute';
import Targets from './pages/Targets';
import Report from './pages/Report';
import StaffReport from './pages/StaffReport';
import MerchReport from './pages/MerchReport';
import RouteMap from './pages/RouteMap';
import CostManager from './pages/CostManager';
import PlanSetting from './pages/PlanSetting';
import Settings from './pages/Settings';
import Diagnostic from './pages/Diagnostic';
import HealthMonitor from './pages/HealthMonitor';
import './index.css';

function Layout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem('eg_sidebar_collapsed') === '1');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const storedUser = localStorage.getItem('easygold_user');
    if (storedUser) {
      const u = JSON.parse(storedUser);
      setUser(u);
      const ADMIN_ONLY = ['/', '/report', '/staff-report', '/merch-report', '/route-map', '/cost-manager', '/plan-setting', '/settings', '/health'];
      const privileged = u.role === 'admin' || u.role === 'manager';
      if (!privileged && ADMIN_ONLY.includes(location.pathname)) {
        navigate('/calendar', { replace: true });
      }
    } else {
      navigate('/login');
    }
  }, [navigate, location.pathname]);

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
  };

  const currentPath = location.pathname;
  const headerInfo = pageTitles[currentPath] || { title: 'Easy Gold BTL', sub: '' };

  if (!user) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--ink)', flexDirection: 'column', gap: '16px' }}>
      <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '28px', color: 'var(--accent)' }}></i>
      <span style={{ color: 'var(--txt-sub)', fontSize: '13px' }}>Loading…</span>
    </div>
  );

  return (
    <>
      <Sidebar
        user={user}
        onLogout={handleLogout}
        currentPath={currentPath}
        collapsed={collapsed}
        onToggleCollapse={handleToggleCollapse}
      />
      <div id="main">
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
              <h1 id="tb-title">{headerInfo.title}</h1>
              <div className="sub" id="tb-sub">{headerInfo.sub}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div style={{ textAlign: 'right', fontSize: '10px', color: 'var(--txt-sub)', lineHeight: 1.2 }}>
              Last updated<br/>Just now
            </div>
            <button className="btn btn-ghost" style={{ padding: '6px', borderRadius: '50%', width: '32px', height: '32px' }}>
              <i className="fa-solid fa-rotate-right"></i>
            </button>
            {(user.role === 'admin' || user.role === 'manager') && (
              <button className="pill pill-blue" style={{ fontSize: '11px', padding: '6px 12px', cursor: 'pointer' }}>
                MANAGEMENT
              </button>
            )}
          </div>
        </header>
        <div id="content">
          <div className="page active" style={{ display: 'block' }}>
            {children}
          </div>
        </div>
      </div>
    </>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Layout><Dashboard /></Layout>} />
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
        <Route path="/health" element={<Layout><HealthMonitor /></Layout>} />
        <Route path="/diagnostic" element={<Diagnostic />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;

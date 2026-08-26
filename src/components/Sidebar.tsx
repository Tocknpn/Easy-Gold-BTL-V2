import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';

interface SidebarProps {
  user: any;
  onLogout: () => void;
  currentPath: string;
}

export default function Sidebar({ user, onLogout, currentPath }: SidebarProps) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (isDark) {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
  }, [isDark]);

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  const navItemClass = (path: string) => {
    return `nav-item ${currentPath === path ? 'active' : ''}`;
  };

  return (
    <aside id="sidebar">
      <div className="sb-header">
        <div className="logo-mark">🏅</div>
        <div className="logo-text">
          <strong>Easy Gold</strong>
          <span>BTL Tracker</span>
        </div>
      </div>
            <nav>
        <div className="nav-group">
          <div className="nav-label">{user.role === 'staff' ? 'My Workflow' : 'Team'}</div>
          <Link to="/calendar" className={navItemClass('/calendar')}>
            <i className="fa-regular fa-calendar-alt"></i> Calendar &amp; Route
          </Link>
          <Link to="/checkin" className={navItemClass('/checkin')}>
            <i className="fa-solid fa-location-dot"></i> Check-In
          </Link>
          <Link to="/submit" className={navItemClass('/submit')}>
            <i className="fa-solid fa-file-invoice"></i> Submit Results
          </Link>
          {user.role !== 'staff' && (
            <>
              <Link to="/targets" className={navItemClass('/targets')}>
                <i className="fa-solid fa-bullseye"></i> My Targets
              </Link>
              <Link to="/staff-report" className={navItemClass('/staff-report')}>
                <i className="fa-solid fa-users"></i> Staff Report
              </Link>
            </>
          )}
        </div>
        
        {(user.role === 'manager' || user.role === 'admin') && (
          <div className="nav-group">
            <div className="nav-label">Event Manager</div>
            <Link to="/" className={navItemClass('/')}>
              <i className="fa-solid fa-chart-line"></i> Dashboard
              <div className="pill pill-gold" style={{ marginLeft: 'auto', fontSize: '8px' }}>Live</div>
            </Link>
            <Link to="/report" className={navItemClass('/report')}>
              <i className="fa-solid fa-file-lines"></i> Submission History
            </Link>
            <Link to="/merch-report" className={navItemClass('/merch-report')}>
              <i className="fa-solid fa-box-open"></i> Merch Report
            </Link>
            <Link to="/route-map" className={navItemClass('/route-map')}>
              <i className="fa-solid fa-map-location-dot"></i> Route Map
            </Link>
          </div>
        )}

        {user.role === 'admin' && (
          <div className="nav-group">
            <div className="nav-label">Admin Panel</div>
            <Link to="/settings" className={navItemClass('/settings')}>
              <i className="fa-solid fa-upload"></i> Upload &amp; Settings
            </Link>
                        <Link to="/cost-manager" className={navItemClass('/cost-manager')}>
              <i className="fa-solid fa-sack-dollar"></i> Cost Manager
            </Link>
                        <Link to="/plan-setting" className={navItemClass('/plan-setting')}>
                            <i className="fa-solid fa-table-list"></i> Monthly Route Plan
            </Link>
          </div>
        )}

        <div className="nav-group" style={{ marginTop: '20px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px' }}>
            <span style={{ fontSize: '13px', color: 'var(--nav-txt)', fontWeight: 600 }}>
              <i className="fa-solid fa-moon" style={{ marginRight: '10px', opacity: 0.7 }}></i> Dark Mode
            </span>
            <label className="toggle-switch">
              <input type="checkbox" checked={isDark} onChange={e => setIsDark(e.target.checked)} />
              <span className="slider"></span>
            </label>
          </div>
        </div>

      </nav>
      <div className="sb-footer">
        <div className="user-ava">{getInitials(user.name)}</div>
        <div className="user-info" style={{ flex: 1 }}>
                    <strong>{user.name}</strong>
          <span>{user.role === 'admin' ? 'Administrator' : user.role === 'manager' ? 'Event Manager' : `Staff · ${user.team || 'Field'}`}</span>
        </div>
        <i 
          className="fa-solid fa-arrow-right-from-bracket" 
          style={{ color: 'var(--nav-txt)', cursor: 'pointer' }}
          onClick={onLogout}
          title="Logout"
        ></i>
      </div>
    </aside>
  );
}

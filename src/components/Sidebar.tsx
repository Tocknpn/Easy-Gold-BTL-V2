import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';

interface SidebarProps {
  user: any;
  onLogout: () => void;
  currentPath: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function Sidebar({ user, onLogout, currentPath, collapsed, onToggleCollapse }: SidebarProps) {
  const [isDark, setIsDark] = useState(() => localStorage.getItem('eg_dark') === '1');

  useEffect(() => {
    if (isDark) {
      document.body.classList.add('dark');
      localStorage.setItem('eg_dark', '1');
    } else {
      document.body.classList.remove('dark');
      localStorage.setItem('eg_dark', '0');
    }
  }, [isDark]);

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

  const navItemClass = (path: string) =>
    `nav-item ${currentPath === path ? 'active' : ''}`;

  /* ── Tooltip wrapper — shows label beside icon when sidebar is collapsed ── */
  const NavLink = ({ to, icon, label, badge }: { to: string; icon: string; label: string; badge?: React.ReactNode }) => (
    <Link
      to={to}
      className={navItemClass(to)}
      title={collapsed ? label : undefined}
      style={collapsed ? { justifyContent: 'center', padding: '10px 0' } : undefined}
    >
      <i className={icon} style={collapsed ? { margin: 0, width: 'auto' } : undefined}></i>
      {!collapsed && <span style={{ flex: 1 }}>{label}</span>}
      {!collapsed && badge}
    </Link>
  );

  return (
    <aside
      id="sidebar"
      style={{
        width: collapsed ? '56px' : '260px',
        transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div className="sb-header" style={{ padding: collapsed ? '14px 0' : undefined, justifyContent: collapsed ? 'center' : undefined }}>
        <div className="logo-mark" style={{ flexShrink: 0 }}>🏅</div>
        {!collapsed && (
          <div className="logo-text">
            <strong>Easy Gold</strong>
            <span>BTL Tracker</span>
          </div>
        )}
        {/* Collapse toggle button */}
        <button
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            marginLeft: collapsed ? 0 : 'auto',
            marginTop: collapsed ? '8px' : undefined,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '6px',
            color: 'var(--nav-txt)',
            cursor: 'pointer',
            padding: '4px 7px',
            fontSize: '11px',
            lineHeight: 1,
            display: collapsed ? 'none' : 'flex',
            alignItems: 'center',
            transition: 'all 0.2s',
          }}
        >
          <i className={`fa-solid fa-chevron-${collapsed ? 'right' : 'left'}`}></i>
        </button>
      </div>

      {/* Slim expand button — visible only when fully collapsed */}
      {collapsed && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '6px' }}>
          <button
            onClick={onToggleCollapse}
            title="Expand sidebar"
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '6px',
              color: 'var(--nav-txt)',
              cursor: 'pointer',
              padding: '5px 8px',
              fontSize: '11px',
              lineHeight: 1,
            }}
          >
            <i className="fa-solid fa-chevron-right"></i>
            <i className="fa-solid fa-chevron-right" style={{ marginLeft: '-4px' }}></i>
          </button>
        </div>
      )}

      <nav style={{ padding: collapsed ? '12px 6px' : undefined }}>
        {/* ── Team section ── */}
        <div className="nav-group">
          {!collapsed && <div className="nav-label">{user.role === 'staff' ? 'My Workflow' : 'Team'}</div>}
          <NavLink to="/calendar" icon="fa-regular fa-calendar-alt" label="Calendar & Route" />
          <NavLink to="/checkin" icon="fa-solid fa-location-dot" label="Check-In" />
          <NavLink to="/submit" icon="fa-solid fa-file-invoice" label="Submit Results" />
          {user.role !== 'staff' && (
            <>
              <NavLink to="/targets" icon="fa-solid fa-bullseye" label="My Targets" />
              <NavLink to="/staff-report" icon="fa-solid fa-users" label="Staff Report" />
            </>
          )}
        </div>

        {/* ── Event Manager section ── */}
        {(user.role === 'manager' || user.role === 'admin') && (
          <div className="nav-group">
            {!collapsed && <div className="nav-label">Event Manager</div>}
            <NavLink
              to="/"
              icon="fa-solid fa-chart-line"
              label="Dashboard"
              badge={<div className="pill pill-gold" style={{ fontSize: '8px' }}>Live</div>}
            />
            <NavLink to="/report" icon="fa-solid fa-file-lines" label="Submission History" />
            <NavLink to="/merch-report" icon="fa-solid fa-box-open" label="Merch Report" />
            <NavLink to="/route-map" icon="fa-solid fa-map-location-dot" label="Route Map" />
          </div>
        )}

        {/* ── Admin Panel section ── */}
        {user.role === 'admin' && (
          <div className="nav-group">
            {!collapsed && <div className="nav-label">Admin Panel</div>}
            <NavLink to="/settings" icon="fa-solid fa-upload" label="Upload & Settings" />
            <NavLink to="/cost-manager" icon="fa-solid fa-sack-dollar" label="Cost Manager" />
            <NavLink to="/plan-setting" icon="fa-solid fa-table-list" label="Monthly Route Plan" />
            <NavLink to="/health" icon="fa-solid fa-heart-pulse" label="Health Monitor" />
          </div>
        )}

        {/* ── Dark mode toggle ── */}
        <div className="nav-group" style={{ marginTop: '20px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '20px' }}>
          {collapsed ? (
            <button
              onClick={() => setIsDark(d => !d)}
              title={isDark ? 'Light mode' : 'Dark mode'}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: isDark ? 'var(--blue)' : 'var(--nav-txt)',
                fontSize: '15px',
                padding: '10px 0',
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              <i className={`fa-solid fa-${isDark ? 'sun' : 'moon'}`}></i>
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px' }}>
              <span style={{ fontSize: '13px', color: 'var(--nav-txt)', fontWeight: 600 }}>
                <i className="fa-solid fa-moon" style={{ marginRight: '10px', opacity: 0.7 }}></i>Dark Mode
              </span>
              <label className="toggle-switch">
                <input type="checkbox" checked={isDark} onChange={e => setIsDark(e.target.checked)} />
                <span className="slider"></span>
              </label>
            </div>
          )}
        </div>
      </nav>

      {/* Footer */}
      <div className="sb-footer" style={{ padding: collapsed ? '12px 0' : undefined, justifyContent: collapsed ? 'center' : undefined }}>
        <div className="user-ava" title={collapsed ? `${user.name} · ${user.role}` : undefined} style={{ flexShrink: 0 }}>
          {getInitials(user.name)}
        </div>
        {!collapsed && (
          <div className="user-info" style={{ flex: 1 }}>
            <strong>{user.name}</strong>
            <span>{user.role === 'admin' ? 'Administrator' : user.role === 'manager' ? 'Event Manager' : `Staff · ${user.team || 'Field'}`}</span>
          </div>
        )}
        <i
          className="fa-solid fa-arrow-right-from-bracket"
          style={{ color: 'var(--nav-txt)', cursor: 'pointer', flexShrink: 0 }}
          onClick={onLogout}
          title="Logout"
        ></i>
      </div>
    </aside>
  );
}

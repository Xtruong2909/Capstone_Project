import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  Database,
  ScrollText,
  LogOut,
  Shield,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useLanguage } from '../../hooks/useLanguage'
import LanguageSwitcher from '../../components/LanguageSwitcher'
import './AdminLayout.css'

export default function AdminLayout() {
  const { t } = useLanguage()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar_collapsed_admin') === 'true'
    } catch {
      return false
    }
  })

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('sidebar_collapsed_admin', String(next))
      } catch {
        // ignore storage error
      }
      return next
    })
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const currentMeta = ROUTE_META[location.pathname] || ROUTE_META['/admin']

  return (
    <div className="adm-shell">
      {/* Dark Obsidian Command Sidebar */}
      <aside className={`adm-sidebar ${isSidebarCollapsed ? 'adm-sidebar--collapsed' : ''}`}>
        <button
          type="button"
          className="adm-sidebar__toggle"
          onClick={toggleSidebar}
          aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isSidebarCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>

        <div className="adm-sidebar__brand">
          <div className="adm-sidebar__logo" title="Traffic Governance Control Center">
            <Shield size={21} />
          </div>
          {!isSidebarCollapsed && (
            <div className="adm-sidebar__brand-info">
              <h2 className="adm-sidebar__brand-title">TRAFFIC GOV</h2>
              <span className="adm-sidebar__brand-sub">Command & Control</span>
            </div>
          )}
        </div>

        <div className="admin-sidebar__header">
          <div className="admin-sidebar__brand">
            <div className="admin-sidebar__logo-badge" title={t('Urban Traffic - Admin Portal')}>
              <Shield size={20} />
            </div>
            {!isSidebarCollapsed && (
              <div className="admin-sidebar__brand-text">
                <h2>Urban Traffic</h2>
                <span>{t('Admin Portal')}</span>
              </div>
            )}
          </div>

        <nav className="admin-sidebar__nav">
          <NavLink
            to="/admin"
            end
            title={t('System Overview')}
            className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
          >
            <LayoutDashboard size={19} style={{ flexShrink: 0 }} />
            <span>{t('System Overview')}</span>
          </NavLink>

          <NavLink
            to="/admin/users"
            title={t('User Management')}
            className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
          >
            <Users size={19} style={{ flexShrink: 0 }} />
            <span>{t('User Management')}</span>
          </NavLink>

          <NavLink
            to="/admin/datasets"
            end
            title={t('Dataset Approvals')}
            className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
          >
            <CheckCircle size={19} style={{ flexShrink: 0 }} />
            <span>{t('Dataset Approvals')}</span>
          </NavLink>

          <NavLink
            to="/admin/datasets-available"
            title={t('Dataset Available')}
            className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
          >
            <Database size={19} style={{ flexShrink: 0 }} />
            <span>{t('Dataset Available')}</span>
          </NavLink>

          <NavLink
            to="/admin/audit-logs"
            title={t('Audit Logs')}
            className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
          >
            <ScrollText size={19} style={{ flexShrink: 0 }} />
            <span>{t('Audit Logs')}</span>
          </NavLink>
        </nav>

          <div className="adm-nav-group">
            <span className="adm-nav-group__label">Data Quality Gate</span>
            <NavLink
              to="/admin/datasets"
              end
              title="Quality Gate Queue"
              className={({ isActive }) => `adm-nav-link ${isActive ? 'active' : ''}`}
            >
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  color: '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {t('Role')}
              </span>
              <span
                className="badge badge--admin"
                style={{
                  fontSize: '0.72rem',
                  padding: '0.15rem 0.6rem',
                  fontWeight: 700,
                  borderRadius: '9999px',
                }}
              >
                {t('Administrator')}
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <span
                className="badge badge--admin"
                title={t('Role: Administrator')}
                style={{
                  fontSize: '0.65rem',
                  padding: '0.15rem 0.35rem',
                  fontWeight: 800,
                  borderRadius: '6px',
                }}
              >
                AD
              </span>
            </div>
          )}

        <div className="adm-sidebar__footer">
          <div
            className="adm-user-card"
            title={`${user?.full_name || 'Administrator'} • Admin (${user?.email || 'admin@gmail.com'})`}
          >
            <div className="adm-user-card__avatar-wrap">
              <div className="adm-user-card__avatar">
                {user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'A'}
              </div>
              <span className="adm-user-card__status-dot" title="Online" />
            </div>
            {!isSidebarCollapsed && (
              <div className="adm-user-card__meta">
                <div className="adm-user-card__name-row">
                  <span className="adm-user-card__name">
                    {user?.full_name === 'System Administrator'
                      ? 'System Admin'
                      : user?.full_name || 'Administrator'}
                  </span>
                  <span className="adm-user-card__role-pill">
                    <Shield size={10} />
                    <span>Admin</span>
                  </span>
                </div>
                <span className="adm-user-card__role">{user?.email || 'admin@gmail.com'}</span>
              </div>
            )}
          </div>

          <button
            type="button"
            className="adm-logout-btn"
            onClick={handleLogout}
            title={t('Sign Out')}
          >
            <LogOut size={16} style={{ flexShrink: 0 }} />
            {!isSidebarCollapsed && <span>{t('Sign Out')}</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="admin-main">
        <header className="admin-header">
          <div className="admin-header__title">
            <h1>{t('Administrator Dashboard')}</h1>
          </div>
          <LanguageSwitcher />
        </header>

        <main className="adm-canvas">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

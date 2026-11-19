import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  CheckCircle,
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

  return (
    <div className="admin-shell">
      {/* Collapsible Sidebar */}
      <aside
        className={`admin-sidebar ${isSidebarCollapsed ? 'admin-sidebar--collapsed' : ''}`}
      >
        {/* Single Center-Edge Proximity Hover Zone & Floating Toggle Button */}
        <div className="admin-sidebar__edge-zone">
          <button
            type="button"
            className="admin-sidebar__floating-toggle"
            onClick={toggleSidebar}
            aria-label={isSidebarCollapsed ? 'Mở rộng Sidebar' : 'Thu gọn Sidebar'}
            title={isSidebarCollapsed ? 'Mở rộng Sidebar' : 'Thu gọn Sidebar'}
          >
            {isSidebarCollapsed ? (
              <ChevronRight size={18} strokeWidth={2.6} />
            ) : (
              <ChevronLeft size={18} strokeWidth={2.6} />
            )}
          </button>
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

        <div className="admin-sidebar__footer">
          {!isSidebarCollapsed ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.1rem 0.2rem',
              }}
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

          <div
            className="admin-user-profile"
            title={`${user?.full_name || 'Administrator'} (${user?.email || 'admin@gmail.com'})`}
          >
            <div className="admin-avatar">
              {user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'A'}
            </div>
            {!isSidebarCollapsed && (
              <div className="admin-user-info">
                <span className="admin-user-name">{user?.full_name || 'Administrator'}</span>
                <span className="admin-user-email">{user?.email || 'admin@gmail.com'}</span>
              </div>
            )}
          </div>

          <button
            type="button"
            className="admin-logout-btn"
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

        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

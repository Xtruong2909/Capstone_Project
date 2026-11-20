import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Database,
  LayoutDashboard,
  FileSpreadsheet,
  Upload,
  Table2,
  Workflow,
  ClipboardList,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useLanguage } from '../../hooks/useLanguage'
import LanguageSwitcher from '../../components/LanguageSwitcher'
import '../admin/AdminLayout.css'
import '../admin/AdminData.css'
import './EngineerData.css'

export default function EngineerLayout() {
  const { t } = useLanguage()
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar_collapsed_engineer') === 'true'
    } catch {
      return false
    }
  })

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('sidebar_collapsed_engineer', String(next))
      } catch {
        // ignore storage error
      }
      return next
    })
  }

  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <div className="admin-shell">
      {/* Collapsible Sidebar */}
      <aside
        className={`admin-sidebar ${isSidebarCollapsed ? 'admin-sidebar--collapsed' : ''}`}
      >
        <div className="admin-sidebar__edge-zone">
        <button
          type="button"
          className="admin-sidebar__floating-toggle"
          onClick={toggleSidebar}
          aria-expanded={!isSidebarCollapsed}
          aria-label={isSidebarCollapsed ? 'Mở rộng Sidebar' : 'Thu gọn Sidebar'}
          title={isSidebarCollapsed ? 'Mở rộng Sidebar' : 'Thu gọn Sidebar'}
        >
          {isSidebarCollapsed ? (
            <ChevronRight size={15} strokeWidth={2.4} />
          ) : (
            <ChevronLeft size={15} strokeWidth={2.4} />
          )}
        </button>
        </div>

        <div className="admin-sidebar__header">
          <div className="admin-sidebar__brand">
            <div className="admin-sidebar__logo-badge" title={t('Urban Traffic - Data Engineer')}>
              <Database size={20} />
            </div>
            {!isSidebarCollapsed && (
              <div className="admin-sidebar__brand-text">
                <h2>Urban Traffic</h2>
                <span className="brand-role-tag--engineer">pNEUMA Pipeline</span>
              </div>
            )}
          </div>
        </div>

        <nav className="admin-sidebar__nav">
          <NavLink
            to="/engineer"
            end
            title={t('Pipeline Overview')}
            className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
          >
            <LayoutDashboard size={19} style={{ flexShrink: 0 }} />
            <span>{t('Pipeline Overview')}</span>
          </NavLink>

          <NavLink
            to="/engineer/datasets"
            title={t('Dataset Catalog')}
            className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
          >
            <FileSpreadsheet size={19} style={{ flexShrink: 0 }} />
            <span>{t('Dataset Catalog')}</span>
          </NavLink>

          <NavLink
            to="/engineer/upload"
            title={t('Upload & Versioning')}
            className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
          >
            <Upload size={19} style={{ flexShrink: 0 }} />
            <span>{t('Upload & Versioning')}</span>
          </NavLink>

          <NavLink
            to="/engineer/pipeline-studio"
            title={t('Pipeline Studio')}
            className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
          >
            <Workflow size={19} style={{ flexShrink: 0 }} />
            <span>{t('Pipeline Studio')}</span>
          </NavLink>

          <NavLink
            to="/engineer/preview"
            title={t('Schema & Data Preview')}
            className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
          >
            <Table2 size={19} style={{ flexShrink: 0 }} />
            <span>{t('Schema & Data Preview')}</span>
          </NavLink>
          <NavLink
            to="/engineer/submissions"
            title={t('Submitted Datasets & Status')}
            className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
          >
            <ClipboardList size={19} style={{ flexShrink: 0 }} />
            <span>{t('Submitted Datasets & Status')}</span>
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
                className="badge badge--engineer"
                style={{
                  fontSize: '0.72rem',
                  padding: '0.15rem 0.6rem',
                  fontWeight: 700,
                  borderRadius: '9999px',
                }}
              >
                {t('Data Engineer')}
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <span
                className="badge badge--engineer"
                title={t('Role: Data Engineer')}
                style={{
                  fontSize: '0.65rem',
                  padding: '0.15rem 0.35rem',
                  fontWeight: 800,
                  borderRadius: '6px',
                }}
              >
                DE
              </span>
            </div>
          )}

          <div
            className="admin-user-profile"
            title={`${user?.full_name || 'Data Engineer'} • Engineer (${user?.email || 'engineer@gmail.com'})`}
          >
            <div className="admin-avatar-wrap">
              <div className="admin-avatar">
                {user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'E'}
              </div>
              <span className="admin-avatar-status-dot" title="Online" />
            </div>
            {!isSidebarCollapsed && (
              <div className="admin-user-info">
                <div className="admin-user-name-row">
                  <span className="admin-user-name">{user?.full_name || 'Data Engineer'}</span>
                  <span className="admin-user-role-pill">Engineer</span>
                </div>
                <span className="admin-user-email">{user?.email || 'engineer@gmail.com'}</span>
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

      {/* Main Content */}
      <div className="admin-main">
        <header className="admin-header">
          <div className="admin-header__title">
            <h1>{t('Data Engineer Workspace (pNEUMA Pipeline)')}</h1>
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

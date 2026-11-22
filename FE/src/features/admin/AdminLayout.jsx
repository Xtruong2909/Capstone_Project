import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  Database,
  ScrollText,
  LogOut,
  Shield,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useLogout } from '../../hooks/useLogout'
import { useAdminNavigation } from '../../hooks/useAdminNavigation'
import { useLanguage } from '../../hooks/useLanguage'
import LanguageSwitcher from '../../components/LanguageSwitcher'
import './AdminPortal.css'
import './AdminData.css'

const ROUTE_META = {
  '/admin': { title: 'System Overview' },
  '/admin/users': { title: 'User & RBAC Governance' },
  '/admin/datasets': { title: 'Dataset Approval Queue' },
  '/admin/datasets-available': { title: 'Available Datasets' },
  '/admin/audit-logs': { title: 'Immutable Audit Ledger' },
}

export default function AdminLayout() {
  const { t } = useLanguage()
  const { user } = useAuth()
  const { handleLogout, isLoggingOut } = useLogout()
  const location = useLocation()
  const prefetchPage = useAdminNavigation()

  const currentMeta = ROUTE_META[location.pathname] || ROUTE_META['/admin']

  return (
    <div className="adm-shell">
      {/* Dark Obsidian Command Sidebar — Auto-expanding Rail */}
      <aside className="adm-sidebar">
        <div className="adm-sidebar__brand">
          <div className="adm-sidebar__logo" title="Traffic Governance Control Center">
            <Shield size={21} />
          </div>
          <div className="adm-sidebar__brand-info">
            <h2 className="adm-sidebar__brand-title">TRAFFIC GOV</h2>
            <span className="adm-sidebar__brand-sub">Command & Control</span>
          </div>
        </div>

        <nav className="adm-sidebar__nav" aria-label={t('Admin Navigation')}>
          <div className="adm-nav-group">
            <span className="adm-nav-group__label">{t('Command')}</span>
            <NavLink
              to="/admin" onMouseEnter={() => prefetchPage('/admin')} onFocus={() => prefetchPage('/admin')}
              end
              title={t('System Overview')}
              className={({ isActive }) => `adm-nav-link ${isActive ? 'active' : ''}`}
            >
              <LayoutDashboard size={18} style={{ flexShrink: 0 }} />
              <span className="adm-nav-link__text">{t('System Overview')}</span>
            </NavLink>
            <NavLink
              to="/admin/users" onMouseEnter={() => prefetchPage('/admin/users')} onFocus={() => prefetchPage('/admin/users')}
              title={t('User Management')}
              className={({ isActive }) => `adm-nav-link ${isActive ? 'active' : ''}`}
            >
              <Users size={18} style={{ flexShrink: 0 }} />
              <span className="adm-nav-link__text">{t('User Management')}</span>
            </NavLink>
          </div>

          <div className="adm-nav-group">
            <span className="adm-nav-group__label">{t('Data Quality Gate')}</span>
            <NavLink
              to="/admin/datasets" onMouseEnter={() => prefetchPage('/admin/datasets')} onFocus={() => prefetchPage('/admin/datasets')}
              end
              title={t('Dataset Approvals')}
              className={({ isActive }) => `adm-nav-link ${isActive ? 'active' : ''}`}
            >
              <ShieldCheck size={18} style={{ flexShrink: 0 }} />
              <span className="adm-nav-link__text">{t('Dataset Approvals')}</span>
            </NavLink>
            <NavLink
              to="/admin/datasets-available" onMouseEnter={() => prefetchPage('/admin/datasets-available')} onFocus={() => prefetchPage('/admin/datasets-available')}
              title={t('Dataset Available')}
              className={({ isActive }) => `adm-nav-link ${isActive ? 'active' : ''}`}
            >
              <Database size={18} style={{ flexShrink: 0 }} />
              <span className="adm-nav-link__text">{t('Dataset Available')}</span>
            </NavLink>
          </div>

          <div className="adm-nav-group">
            <span className="adm-nav-group__label">{t('Compliance')}</span>
            <NavLink
              to="/admin/audit-logs" onMouseEnter={() => prefetchPage('/admin/audit-logs')} onFocus={() => prefetchPage('/admin/audit-logs')}
              title={t('Audit Logs')}
              className={({ isActive }) => `adm-nav-link ${isActive ? 'active' : ''}`}
            >
              <ScrollText size={18} style={{ flexShrink: 0 }} />
              <span className="adm-nav-link__text">{t('Audit Logs')}</span>
            </NavLink>
          </div>
        </nav>

        <div className="adm-sidebar__footer">
          <div
            className="adm-user-card"
            title={`${user?.full_name || 'Administrator'} • Admin (${user?.email || 'admin@gmail.com'})`}
          >
            <div className="adm-user-card__avatar-wrap">
              <div className="adm-user-card__avatar">
                {user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'A'}
              </div>
            </div>
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
          </div>

          <button
            type="button"
            className="adm-logout-btn"
            onClick={handleLogout}
            disabled={isLoggingOut}
            aria-busy={isLoggingOut}
            title={t('Sign Out')}
          >
            <LogOut size={16} style={{ flexShrink: 0 }} />
            <span className="adm-logout-btn__text">{t(isLoggingOut ? 'Đang đăng xuất...' : 'Sign Out')}</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="adm-workspace">
        <header className="adm-topbar">
          <div className="adm-topbar__left">
            <h1 className="adm-topbar__title">{t(currentMeta.title)}</h1>
          </div>
          <div className="adm-topbar__right">
            <LanguageSwitcher />
          </div>
        </header>

        <main className="adm-canvas">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

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
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useLanguage } from '../../hooks/useLanguage'
import LanguageSwitcher from '../../components/LanguageSwitcher'
import './AdminPortal.css'

const ROUTE_META = {
  '/admin': { title: 'System Overview' },
  '/admin/users': { title: 'User & RBAC Governance' },
  '/admin/datasets': { title: 'Dataset Approval Queue' },
  '/admin/datasets-available': { title: 'Available Datasets' },
  '/admin/audit-logs': { title: 'Immutable Audit Ledger' },
}

export default function AdminLayout() {
  const { t } = useLanguage()
  const { user, logout } = useAuth()
  const navigate = useNavigate()

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

        <nav className="adm-sidebar__nav" aria-label={t('Admin Navigation')}>
          <div className="adm-nav-group">
            <span className="adm-nav-group__label">{t('Command')}</span>
            <NavLink
              to="/admin"
              end
              title={t('System Overview')}
              className={({ isActive }) => `adm-nav-link ${isActive ? 'active' : ''}`}
            >
              <LayoutDashboard size={18} style={{ flexShrink: 0 }} />
              <span className="adm-nav-link__text">{t('System Overview')}</span>
            </NavLink>
            <NavLink
              to="/admin/users"
              title={t('User Management')}
              className={({ isActive }) => `adm-nav-link ${isActive ? 'active' : ''}`}
            >
              <Users size={18} style={{ flexShrink: 0 }} />
              <span className="adm-nav-link__text">{t('User Management')}</span>
            </NavLink>
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
              <ShieldCheck size={18} style={{ flexShrink: 0 }} />
              <span className="adm-nav-link__text">{t('Dataset Approvals')}</span>
            </NavLink>
            <NavLink
              to="/admin/datasets-available"
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
              to="/admin/audit-logs"
              title={t('Audit Logs')}
              className={({ isActive }) => `adm-nav-link ${isActive ? 'active' : ''}`}
            >
              <ScrollText size={18} style={{ flexShrink: 0 }} />
              <span className="adm-nav-link__text">{t('Audit Logs')}</span>
            </NavLink>
          </div>
        </nav>

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
              <span className="adm-user-card__role">{user?.email || 'admin@gmail.com'}</span>
            </div>
          </div>

          <button
            type="button"
            className="admin-logout-btn"
            onClick={handleLogout}
            title={t('Sign Out')}
          >
            <LogOut size={16} style={{ flexShrink: 0 }} />
            <span className="adm-logout-btn__text">{t('Sign Out')}</span>
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

        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

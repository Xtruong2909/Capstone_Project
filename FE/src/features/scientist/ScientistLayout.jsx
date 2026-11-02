import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  FlaskConical,
  LayoutDashboard,
  FileSpreadsheet,
  Table2,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import '../admin/AdminLayout.css'
import './ScientistPages.css'

const STORAGE_KEY = 'sidebar_collapsed_scientist'

const NAV_ITEMS = [
  { to: '/scientist', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/scientist/datasets', label: 'Approved Datasets', icon: FileSpreadsheet },
  { to: '/scientist/preview', label: 'Dataset Detail & Preview', icon: Table2 },
]

export default function ScientistLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })

  const toggleSidebar = () => {
    setIsCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(STORAGE_KEY, String(next))
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
      <aside className={`admin-sidebar ${isCollapsed ? 'admin-sidebar--collapsed' : ''}`}>
        <div className="admin-sidebar__edge-zone">
          <button
            type="button"
            className="admin-sidebar__floating-toggle"
            onClick={toggleSidebar}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? (
              <ChevronRight size={18} strokeWidth={2.6} />
            ) : (
              <ChevronLeft size={18} strokeWidth={2.6} />
            )}
          </button>
        </div>

        <div className="admin-sidebar__header">
          <div className="admin-sidebar__brand">
            <div className="admin-sidebar__logo-badge" title="Urban Traffic - Data Scientist">
              <FlaskConical size={20} />
            </div>
            {!isCollapsed && (
              <div className="admin-sidebar__brand-text">
                <h2>Urban Traffic</h2>
                <span>Data Science Lab</span>
              </div>
            )}
          </div>
        </div>

        <nav className="admin-sidebar__nav">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={label}
              className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={19} style={{ flexShrink: 0 }} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar__footer">
          <div style={{ display: 'flex', justifyContent: isCollapsed ? 'center' : 'space-between' }}>
            {!isCollapsed && <span className="sci-role-label">Role</span>}
            <span className="badge badge--scientist sci-role-badge">
              {isCollapsed ? 'DS' : 'Data Scientist'}
            </span>
          </div>

          <div
            className="admin-user-profile"
            title={`${user?.full_name || 'Data Scientist'} (${user?.email || ''})`}
          >
            <div className="admin-avatar">
              {user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'S'}
            </div>
            {!isCollapsed && (
              <div className="admin-user-info">
                <span className="admin-user-name">{user?.full_name || 'Data Scientist'}</span>
                <span className="admin-user-email">{user?.email || ''}</span>
              </div>
            )}
          </div>

          <button type="button" className="admin-logout-btn" onClick={handleLogout} title="Sign Out">
            <LogOut size={16} style={{ flexShrink: 0 }} />
            {!isCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-header">
          <div className="admin-header__title">
            <h1>Data Scientist Workspace</h1>
          </div>
        </header>
        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

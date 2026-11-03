import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  FlaskConical,
  LayoutDashboard,
  FileSpreadsheet,
  Table2,
  LogOut,
  ChevronLeft,
  ChevronRight,
  UserCheck,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import ScientistProfileModal from './components/ScientistProfileModal'
import '../admin/AdminLayout.css'
import './ScientistPages.css'

const STORAGE_KEY = 'sidebar_collapsed_scientist'

const NAV_ITEMS = [
  { to: '/scientist', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/scientist/datasets', label: 'Approved Datasets', icon: FileSpreadsheet, end: true },
  {
    to: '/scientist/preview',
    label: 'Dataset Detail & Preview',
    icon: Table2,
    // Detail route (/scientist/datasets/:id/versions/:id) also belongs to this tab
    extraActivePattern: /^\/scientist\/datasets\/[^/]+\/versions\/[^/]+/,
  },
]

export default function ScientistLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)

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
          {NAV_ITEMS.map(({ to, label, icon: Icon, end, extraActivePattern }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={label}
              className={({ isActive }) => {
                const active = isActive || (extraActivePattern?.test(location.pathname) ?? false)
                return `admin-nav-item ${active ? 'active' : ''}`
              }}
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

          {/* User Profile Card - Click to open Profile & Password Modal */}
          <div
            className="admin-user-profile"
            onClick={() => setIsProfileModalOpen(true)}
            style={{ cursor: 'pointer', transition: 'background 0.2s', borderRadius: '10px' }}
            title="Bấm để xem thông tin tài khoản và đổi mật khẩu"
          >
            <div className="admin-avatar">
              {user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'S'}
            </div>
            {!isCollapsed && (
              <div className="admin-user-info">
                <span className="admin-user-name" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  {user?.full_name || 'Data Scientist'}
                </span>
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
        <header className="admin-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="admin-header__title">
            <h1>Data Scientist Workspace</h1>
          </div>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => setIsProfileModalOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', fontWeight: 600 }}
            title="Quản lý tài khoản và đổi mật khẩu"
          >
            <UserCheck size={15} style={{ color: '#1668e3' }} />
            <span>Tài khoản & Bảo mật</span>
          </button>
        </header>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>

      {/* Profile & Security Modal */}
      <ScientistProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
      />
    </div>
  )
}

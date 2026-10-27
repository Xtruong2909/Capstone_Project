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
import './AdminLayout.css'

export default function AdminLayout() {
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

        <div className="admin-sidebar__header" style={{ flexDirection: 'column', alignItems: isSidebarCollapsed ? 'center' : 'flex-start', gap: '0.75rem' }}>
          <div className="admin-sidebar__brand">
            <div className="admin-sidebar__logo-badge" title="Urban Traffic - Admin Portal">
              <Shield size={20} />
            </div>
            {!isSidebarCollapsed && (
              <div className="admin-sidebar__brand-text">
                <h2>Urban Traffic</h2>
                <span>Admin Portal</span>
              </div>
            )}
          </div>

          <div
            className="admin-header__badge"
            title="Role: Administrator"
            style={{
              width: isSidebarCollapsed ? 'auto' : '100%',
              textAlign: 'center',
              padding: isSidebarCollapsed ? '0.24rem 0.45rem' : '0.36rem 0.85rem',
              fontSize: isSidebarCollapsed ? '0.68rem' : '0.75rem',
            }}
          >
            <span>{isSidebarCollapsed ? 'AD' : 'Role: Administrator'}</span>
          </div>
        </div>

        <nav className="admin-sidebar__nav">
          <NavLink
            to="/admin"
            end
            title="System Overview"
            className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
          >
            <LayoutDashboard size={19} style={{ flexShrink: 0 }} />
            <span>System Overview</span>
          </NavLink>

          <NavLink
            to="/admin/users"
            title="User Management"
            className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
          >
            <Users size={19} style={{ flexShrink: 0 }} />
            <span>User Management</span>
          </NavLink>

          <NavLink
            to="/admin/datasets"
            end
            title="Dataset Approvals"
            className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
          >
            <CheckCircle size={19} style={{ flexShrink: 0 }} />
            <span>Dataset Approvals</span>
          </NavLink>

          <NavLink
            to="/admin/datasets-available"
            title="Dataset Available"
            className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
          >
            <Database size={19} style={{ flexShrink: 0 }} />
            <span>Dataset Available</span>
          </NavLink>

          <NavLink
            to="/admin/audit-logs"
            title="Audit Logs"
            className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
          >
            <ScrollText size={19} style={{ flexShrink: 0 }} />
            <span>Audit Logs</span>
          </NavLink>
        </nav>

        <div className="admin-sidebar__footer">
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
            title="Sign Out"
          >
            <LogOut size={16} style={{ flexShrink: 0 }} />
            {!isSidebarCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="admin-main">
        <header className="admin-header">
          <div className="admin-header__title">
            <h1>Administrator Dashboard</h1>
          </div>
        </header>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

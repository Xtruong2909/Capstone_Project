import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  FlaskConical,
  LayoutDashboard,
  FileSpreadsheet,
  LogOut,
  ChevronLeft,
  ChevronRight,
  UserCheck,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useLanguage } from '../../hooks/useLanguage'
import LanguageSwitcher from '../../components/LanguageSwitcher'
import ScientistProfileModal from './components/ScientistProfileModal'
import AiAssistantChatWidget from './components/AiAssistantChatWidget'
import '../admin/AdminLayout.css'
import './ScientistPages.css'

const STORAGE_KEY = 'sidebar_collapsed_scientist'

const NAV_ITEMS = [
  { to: '/scientist', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/scientist/datasets', label: 'Approved Datasets', icon: FileSpreadsheet,
    end: true,
    // Training / Prediction pages are opened from the approved dataset list
    extraActivePattern: /^\/scientist\/datasets\/[^/]+\/versions\/[^/]+\/(train|predict)\/?$|^\/scientist\/datasets\/[^/]+\/versions\/[^/]+\/?$/,
  },
  {
    to: '/scientist/experiments',
    label: 'Thí nghiệm',
    icon: FlaskConical,
  },
]

export default function ScientistLayout() {
  const { t } = useLanguage()
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
            aria-label={t(isCollapsed ? 'Expand sidebar' : 'Collapse sidebar')}
            title={t(isCollapsed ? 'Expand sidebar' : 'Collapse sidebar')}
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
            <div className="admin-sidebar__logo-badge" title={t('Urban Traffic - Data Scientist')}>
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
              title={t(label)}
              className={({ isActive }) => {
                const active = isActive || (extraActivePattern?.test(location.pathname) ?? false)
                return `admin-nav-item ${active ? 'active' : ''}`
              }}
            >
              <Icon size={19} style={{ flexShrink: 0 }} />
              <span>{t(label)}</span>
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar__footer">
          <div style={{ display: 'flex', justifyContent: isCollapsed ? 'center' : 'space-between' }}>
            {!isCollapsed && <span className="sci-role-label">{t('Role')}</span>}
            <span className="badge badge--scientist sci-role-badge">
              {isCollapsed ? 'DS' : t('Data Scientist')}
            </span>
          </div>

          {/* User Profile Card - Click to open Profile & Password Modal */}
          <div
            className="admin-user-profile"
            onClick={() => setIsProfileModalOpen(true)}
            style={{ cursor: 'pointer', transition: 'background 0.2s', borderRadius: '10px' }}
            title={t('Click to view account profile and change password')}
          >
            <div className="admin-avatar">
              {user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'S'}
            </div>
            {!isCollapsed && (
              <div className="admin-user-info">
                <span className="admin-user-name" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  {user?.full_name || t('Data Scientist')}
                </span>
                <span className="admin-user-email">{user?.email || ''}</span>
              </div>
            )}
          </div>

          <button type="button" className="admin-logout-btn" onClick={handleLogout} title={t('Sign Out')}>
            <LogOut size={16} style={{ flexShrink: 0 }} />
            {!isCollapsed && <span>{t('Sign Out')}</span>}
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="admin-header__title">
            <h1>{t('Data Scientist Workspace')}</h1>
          </div>

          <div className="admin-header__actions">
            <LanguageSwitcher />
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setIsProfileModalOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', fontWeight: 600 }}
              title={t('Manage account profile and change password')}
            >
              <UserCheck size={15} style={{ color: '#1668e3' }} />
              <span>{t('Account & Security')}</span>
            </button>
          </div>
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

      {/* Floating AI Assistant Chat Box */}
      <AiAssistantChatWidget />
    </div>
  )
}

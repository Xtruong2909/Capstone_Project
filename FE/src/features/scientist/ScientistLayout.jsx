import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  FlaskConical,
  LayoutDashboard,
  FileSpreadsheet,
  LogOut,
  Share2,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useLanguage } from '../../hooks/useLanguage'
import LanguageSwitcher from '../../components/LanguageSwitcher'
import ScientistProfileModal from './components/ScientistProfileModal'
import AiAssistantChatWidget from './components/AiAssistantChatWidget'
import '../admin/AdminLayout.css'
import './ScientistPages.css'
import '../../components/WorkspaceSidebar.css'

function profileDisplayName(fullName, fallback) {
  if (!fullName) return fallback
  return fullName.replace(/\s*\(data\s+scientist\)\s*$/i, '').trim() || fallback
}

const NAV_ITEMS = [
  { to: '/scientist', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/scientist/datasets', label: 'Approved Datasets', icon: FileSpreadsheet,
    end: true,
    // Training / Prediction pages are opened from the approved dataset list
    extraActivePattern: /^\/scientist\/datasets\//,
  },
  {
    to: '/scientist/experiments',
    label: 'Thí nghiệm',
    icon: FlaskConical,
  },
  { to: '/scientist/shares', label: 'Chia sẻ kết quả', icon: Share2 },
]

export default function ScientistLayout() {
  const { t } = useLanguage()
  const { user, logout } = useAuth()
  const displayName = profileDisplayName(user?.full_name, t('Data Scientist'))
  const navigate = useNavigate()
  const location = useLocation()
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar workspace-sidebar">
        <div className="admin-sidebar__header">
          <div className="admin-sidebar__brand">
            <div className="admin-sidebar__logo-badge" title={t('Urban Traffic - Data Scientist')}>
              <FlaskConical size={20} />
            </div>
            <div className="admin-sidebar__brand-text">
              <h2>Urban Traffic</h2>
              <span>Data Science Lab</span>
            </div>
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
          <div className="workspace-sidebar__role">
            <span className="sci-role-label">{t('Role')}</span>
            <span className="badge badge--scientist sci-role-badge">
              <span className="workspace-sidebar__role-short" aria-hidden="true">DS</span>
              <span className="workspace-sidebar__role-full">{t('Data Scientist')}</span>
            </span>
          </div>

          {/* User Profile Card - Click to open Profile & Password Modal */}
          <button
            type="button"
            className="admin-user-profile"
            onClick={() => setIsProfileModalOpen(true)}
            style={{ cursor: 'pointer', transition: 'background 0.2s', borderRadius: '10px' }}
            title={t('Click to view account profile and change password')}
          >
            <div className="admin-avatar">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="admin-user-info">
              <span className="admin-user-name" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                {displayName}
              </span>
              <span className="admin-user-email">{user?.email || ''}</span>
            </div>
          </button>

          <button type="button" className="admin-logout-btn" onClick={handleLogout} title={t('Sign Out')}>
            <LogOut size={16} style={{ flexShrink: 0 }} />
            <span>{t('Sign Out')}</span>
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

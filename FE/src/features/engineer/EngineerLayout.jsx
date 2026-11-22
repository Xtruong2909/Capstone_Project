import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  FileSpreadsheet,
  Upload,
  Table2,
  Workflow,
  Database,
  LogOut,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useLogout } from '../../hooks/useLogout'
import { useLanguage } from '../../hooks/useLanguage'
import LanguageSwitcher from '../../components/LanguageSwitcher'
import ScientistProfileModal from '../scientist/components/ScientistProfileModal'
import { useEngineerCatalog } from '../../hooks/useEngineerCatalog'
import {
  RECORD_CACHE_STORAGE_KEY,
  loadJsonStorage,
  saveJsonStorage,
} from './utils/engineerHelpers'
import '../admin/AdminPortal.css'
import '../admin/AdminData.css'
import './EngineerPortal.css'
import './EngineerData.css'

const ROUTE_META = {
  '/engineer': { title: 'Pipeline Overview' },
  '/engineer/datasets': { title: 'Dataset Catalog' },
  '/engineer/upload': { title: 'Upload & Fileing' },
  '/engineer/pipeline-studio': { title: 'Pipeline Studio' },
  '/engineer/preview': { title: 'Schema & Data Preview' },
}

export default function EngineerLayout() {
  const { t } = useLanguage()
  const { user } = useAuth()
  const { handleLogout, isLoggingOut } = useLogout()
  const navigate = useNavigate()
  const location = useLocation()
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)

  const { datasets, setDatasets, dbStatus, isLoadingCatalog, catalogError, fetchCatalogAndHealth } = useEngineerCatalog()

  const [recordCountsMap, setRecordCountsMap] = useState(() =>
    loadJsonStorage(RECORD_CACHE_STORAGE_KEY, {})
  )

  const registerRecordCount = (datasetId, rowCount) => {
    if (rowCount == null) return
    setRecordCountsMap((prev) => {
      const updated = { ...prev, [datasetId]: rowCount }
      saveJsonStorage(RECORD_CACHE_STORAGE_KEY, updated)
      return updated
    })
  }

  const prependUploadedDataset = (uploadedItem) => {
    setDatasets((prev) => [uploadedItem, ...prev])
  }

  const openPreviewForDataset = (datasetId) => {
    if (datasetId) {
      navigate(`/engineer/preview?datasetId=${encodeURIComponent(datasetId)}`)
    } else {
      navigate('/engineer/preview')
    }
  }

  const openPipelineStudioForDataset = (datasetId, step = 1) => {
    if (datasetId) {
      navigate(
        `/engineer/pipeline-studio?datasetId=${encodeURIComponent(datasetId)}&step=${step}`
      )
    } else {
      navigate('/engineer/pipeline-studio')
    }
  }

  const currentMeta = ROUTE_META[location.pathname] || ROUTE_META['/engineer']

  return (
    <div className="adm-shell">
      {/* Dark Obsidian Command Sidebar — Auto-expanding Rail */}
      <aside className="adm-sidebar">
        <div className="adm-sidebar__brand">
          <div className="adm-sidebar__logo eng-sidebar-logo" title="pNEUMA Data Pipeline">
            <Database size={21} />
          </div>
          <div className="adm-sidebar__brand-info">
            <h2 className="adm-sidebar__brand-title">pNEUMA STUDIO</h2>
            <span className="adm-sidebar__brand-sub">Data Engineering</span>
          </div>
        </div>

        <nav className="adm-sidebar__nav" aria-label={t('Data Engineer Navigation')}>
          <div className="adm-nav-group">
            <span className="adm-nav-group__label">{t('Workspace')}</span>
            <NavLink
              to="/engineer"
              end
              title={t('Pipeline Overview')}
              className={({ isActive }) => `adm-nav-link ${isActive ? 'active' : ''}`}
            >
              <LayoutDashboard size={18} style={{ flexShrink: 0 }} />
              <span className="adm-nav-link__text">{t('Pipeline Overview')}</span>
            </NavLink>
            <NavLink
              to="/engineer/datasets"
              title={t('Dataset Catalog')}
              className={({ isActive }) => `adm-nav-link ${isActive ? 'active' : ''}`}
            >
              <FileSpreadsheet size={18} style={{ flexShrink: 0 }} />
              <span className="adm-nav-link__text">{t('Dataset Catalog')}</span>
            </NavLink>
          </div>

          <div className="adm-nav-group">
            <span className="adm-nav-group__label">{t('Ingestion & QA')}</span>
            <NavLink
              to="/engineer/upload"
              title={t('Upload & Fileing')}
              className={({ isActive }) => `adm-nav-link ${isActive ? 'active' : ''}`}
            >
              <Upload size={18} style={{ flexShrink: 0 }} />
              <span className="adm-nav-link__text">{t('Upload & Fileing')}</span>
            </NavLink>
            <NavLink
              to="/engineer/pipeline-studio"
              title={t('Pipeline Studio')}
              className={({ isActive }) => `adm-nav-link ${isActive ? 'active' : ''}`}
            >
              <Workflow size={18} style={{ flexShrink: 0 }} />
              <span className="adm-nav-link__text">{t('Pipeline Studio')}</span>
            </NavLink>
          </div>

          <div className="adm-nav-group">
            <span className="adm-nav-group__label">{t('Inspection')}</span>
            <NavLink
              to="/engineer/preview"
              title={t('Schema & Data Preview')}
              className={({ isActive }) => `adm-nav-link ${isActive ? 'active' : ''}`}
            >
              <Table2 size={18} style={{ flexShrink: 0 }} />
              <span className="adm-nav-link__text">{t('Schema & Data Preview')}</span>
            </NavLink>
          </div>
        </nav>

        <div className="adm-sidebar__footer">
          <button
            type="button"
            className="adm-user-card eng-profile-trigger"
            onClick={() => setIsProfileModalOpen(true)}
            title={t('Click to view account profile and change password')}
            aria-label={t('Manage account profile and change password')}
            aria-haspopup="dialog"
            aria-expanded={isProfileModalOpen}
          >
            <div className="adm-user-card__avatar-wrap">
              <div className="adm-user-card__avatar">
                {user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'E'}
              </div>
            </div>
            <div className="adm-user-card__meta">
              <div className="adm-user-card__name-row">
                <span className="adm-user-card__name">
                  {user?.full_name || 'Data Engineer'}
                </span>
                <span className="eng-role-pill">
                  <Database size={10} />
                  <span>Engineer</span>
                </span>
              </div>
              <span className="adm-user-card__role">{user?.email || 'engineer@gmail.com'}</span>
            </div>
          </button>

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
          <Outlet
            context={{
              dbStatus,
              datasets,
              isLoadingCatalog,
              catalogError,
              recordCountsMap,
              fetchCatalogAndHealth,
              registerRecordCount,
              prependUploadedDataset,
              openPreviewForDataset,
              openPipelineStudioForDataset,
            }}
          />
        </main>
      </div>
      <ScientistProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        roleLabel="Data Engineer"
      />
    </div>
  )
}

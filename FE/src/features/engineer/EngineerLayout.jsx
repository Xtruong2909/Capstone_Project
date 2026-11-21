import { useEffect, useState, useCallback } from 'react'
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
import { useLanguage } from '../../hooks/useLanguage'
import LanguageSwitcher from '../../components/LanguageSwitcher'
import { datasetService } from '../../services/datasetService'
import apiClient from '../../services/apiClient'
import {
  LINEAGE_STORAGE_KEY,
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
  '/engineer/upload': { title: 'Upload & Versioning' },
  '/engineer/pipeline-studio': { title: 'Pipeline Studio' },
  '/engineer/preview': { title: 'Schema & Data Preview' },
}

export default function EngineerLayout() {
  const { t } = useLanguage()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [dbStatus, setDbStatus] = useState(null)
  const [datasets, setDatasets] = useState([])
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true)
  const [catalogError, setCatalogError] = useState(null)

  const [versionLineageMap, setVersionLineageMap] = useState(() =>
    loadJsonStorage(LINEAGE_STORAGE_KEY, {})
  )
  const [recordCountsMap, setRecordCountsMap] = useState(() =>
    loadJsonStorage(RECORD_CACHE_STORAGE_KEY, {})
  )

  const fetchCatalogAndHealth = useCallback(async () => {
    setIsLoadingCatalog(true)
    setCatalogError(null)
    try {
      const [listResult, healthResult] = await Promise.all([
        datasetService.listDatasets({ limit: 100 }),
        apiClient.get('/health/db').catch(() => ({ data: { status: 'disconnected' } })),
      ])
      setDatasets(listResult)
      setDbStatus(healthResult.data)
    } catch (err) {
      setCatalogError(
        err.response?.data?.detail || 'Failed to load dataset catalog from the server.'
      )
    } finally {
      setIsLoadingCatalog(false)
    }
  }, [])

  useEffect(() => {
    fetchCatalogAndHealth()
  }, [fetchCatalogAndHealth])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const registerVersionLineage = (datasetId, lineageEntry) => {
    setVersionLineageMap((prev) => {
      const updated = { ...prev, [datasetId]: lineageEntry }
      saveJsonStorage(LINEAGE_STORAGE_KEY, updated)
      return updated
    })
  }

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

  const startNewVersionIteration = (baseDataset) => {
    if (baseDataset?.dataset_id) {
      navigate(
        `/engineer/upload?mode=iteration&parentId=${encodeURIComponent(baseDataset.dataset_id)}`,
        { state: { baseDataset } }
      )
    } else {
      navigate('/engineer/upload?mode=iteration')
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
              title={t('Upload & Versioning')}
              className={({ isActive }) => `adm-nav-link ${isActive ? 'active' : ''}`}
            >
              <Upload size={18} style={{ flexShrink: 0 }} />
              <span className="adm-nav-link__text">{t('Upload & Versioning')}</span>
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
          <div
            className="adm-user-card"
            title={`${user?.full_name || 'Data Engineer'} • Engineer (${user?.email || 'engineer@gmail.com'})`}
          >
            <div className="adm-user-card__avatar-wrap">
              <div className="adm-user-card__avatar eng-avatar">
                {user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'E'}
              </div>
              <span className="adm-user-card__status-dot" title="Online" />
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
          </div>

          <button
            type="button"
            className="adm-logout-btn"
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

        <main className="adm-canvas">
          <Outlet
            context={{
              dbStatus,
              datasets,
              isLoadingCatalog,
              catalogError,
              versionLineageMap,
              recordCountsMap,
              fetchCatalogAndHealth,
              registerVersionLineage,
              registerRecordCount,
              prependUploadedDataset,
              openPreviewForDataset,
              openPipelineStudioForDataset,
              startNewVersionIteration,
            }}
          />
        </main>
      </div>
    </div>
  )
}

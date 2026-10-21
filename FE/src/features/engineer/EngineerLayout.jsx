import { useEffect, useState, useCallback } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Database,
  LayoutDashboard,
  FileSpreadsheet,
  Upload,
  Table2,
  LogOut,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { datasetService } from '../../services/datasetService'
import apiClient from '../../services/apiClient'
import {
  LINEAGE_STORAGE_KEY,
  RECORD_CACHE_STORAGE_KEY,
  loadJsonStorage,
  saveJsonStorage,
} from './utils/engineerHelpers'
import '../admin/AdminLayout.css'

export default function EngineerLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

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

  return (
    <div className="admin-shell">
      {/* Sidebar */}
      <aside className="admin-sidebar">
        <div className="admin-sidebar__header">
          <div className="admin-sidebar__brand">
            <div className="admin-sidebar__logo-badge">
              <Database size={20} />
            </div>
            <div className="admin-sidebar__brand-text">
              <h2>Urban Traffic</h2>
              <span>Data Engineer</span>
            </div>
          </div>
        </div>

        <nav className="admin-sidebar__nav">
          <NavLink
            to="/engineer"
            end
            className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
          >
            <LayoutDashboard size={18} />
            <span>Pipeline Overview</span>
          </NavLink>

          <NavLink
            to="/engineer/datasets"
            className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
          >
            <FileSpreadsheet size={18} />
            <span>Dataset Catalog</span>
          </NavLink>

          <NavLink
            to="/engineer/upload"
            className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
          >
            <Upload size={18} />
            <span>Upload & Versioning</span>
          </NavLink>

          <NavLink
            to="/engineer/preview"
            className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
          >
            <Table2 size={18} />
            <span>Schema & Data Preview</span>
          </NavLink>
        </nav>

        <div className="admin-sidebar__footer">
          <div className="admin-user-profile">
            <div className="admin-avatar">
              {user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'E'}
            </div>
            <div className="admin-user-info">
              <span className="admin-user-name">{user?.full_name || 'Data Engineer'}</span>
              <span className="admin-user-email">{user?.email || 'engineer@gmail.com'}</span>
            </div>
          </div>

          <button type="button" className="admin-logout-btn" onClick={handleLogout}>
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="admin-main">
        <header className="admin-header">
          <div className="admin-header__title">
            <h1>Data Engineer Workspace (pNEUMA Pipeline)</h1>
          </div>
          <div className="admin-header__badge">
            <span>Role: Data Engineer</span>
          </div>
        </header>

        <main className="admin-content">
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
              startNewVersionIteration,
            }}
          />
        </main>
      </div>
    </div>
  )
}

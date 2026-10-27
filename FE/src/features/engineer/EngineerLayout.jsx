import { useEffect, useState, useCallback } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Database,
  LayoutDashboard,
  FileSpreadsheet,
  Upload,
  Table2,
  Workflow,
  LogOut,
  ChevronLeft,
  ChevronRight,
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

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar_collapsed_engineer') === 'true'
    } catch {
      return false
    }
  })

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('sidebar_collapsed_engineer', String(next))
      } catch {
        // ignore storage error
      }
      return next
    })
  }

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
            <div className="admin-sidebar__logo-badge" title="Urban Traffic - Data Engineer">
              <Database size={20} />
            </div>
            {!isSidebarCollapsed && (
              <div className="admin-sidebar__brand-text">
                <h2>Urban Traffic</h2>
                <span>pNEUMA Pipeline</span>
              </div>
            )}
          </div>

          <div
            className="admin-header__badge"
            title="Role: Data Engineer"
            style={{
              width: isSidebarCollapsed ? 'auto' : '100%',
              textAlign: 'center',
              padding: isSidebarCollapsed ? '0.24rem 0.45rem' : '0.36rem 0.85rem',
              fontSize: isSidebarCollapsed ? '0.68rem' : '0.75rem',
            }}
          >
            <span>{isSidebarCollapsed ? 'DE' : 'Role: Data Engineer'}</span>
          </div>
        </div>

        <nav className="admin-sidebar__nav">
          <NavLink
            to="/engineer"
            end
            title="Pipeline Overview"
            className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
          >
            <LayoutDashboard size={19} style={{ flexShrink: 0 }} />
            <span>Pipeline Overview</span>
          </NavLink>

          <NavLink
            to="/engineer/datasets"
            title="Dataset Catalog"
            className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
          >
            <FileSpreadsheet size={19} style={{ flexShrink: 0 }} />
            <span>Dataset Catalog</span>
          </NavLink>

          <NavLink
            to="/engineer/upload"
            title="Upload & Versioning"
            className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
          >
            <Upload size={19} style={{ flexShrink: 0 }} />
            <span>Upload & Versioning</span>
          </NavLink>

          <NavLink
            to="/engineer/pipeline-studio"
            title="Pipeline Studio"
            className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
          >
            <Workflow size={19} style={{ flexShrink: 0 }} />
            <span>Pipeline Studio</span>
          </NavLink>

          <NavLink
            to="/engineer/preview"
            title="Schema & Data Preview"
            className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
          >
            <Table2 size={19} style={{ flexShrink: 0 }} />
            <span>Schema & Data Preview</span>
          </NavLink>
        </nav>

        <div className="admin-sidebar__footer">
          <div
            className="admin-user-profile"
            title={`${user?.full_name || 'Data Engineer'} (${user?.email || 'engineer@gmail.com'})`}
          >
            <div className="admin-avatar">
              {user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'E'}
            </div>
            {!isSidebarCollapsed && (
              <div className="admin-user-info">
                <span className="admin-user-name">{user?.full_name || 'Data Engineer'}</span>
                <span className="admin-user-email">{user?.email || 'engineer@gmail.com'}</span>
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

      {/* Main Content */}
      <div className="admin-main">
        <header className="admin-header">
          <div className="admin-header__title">
            <h1>Data Engineer Workspace (pNEUMA Pipeline)</h1>
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
              openPipelineStudioForDataset,
              startNewVersionIteration,
            }}
          />
        </main>
      </div>
    </div>
  )
}

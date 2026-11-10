import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  RefreshCw,
  AlertCircle,
  Database,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Layers,
  Search,
  FolderCheck,
} from 'lucide-react'
import { adminService } from '../../../services/adminService'

export default function AdminAvailableDatasetsPage() {
  const [datasets, setDatasets] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')

  const [previewState, setPreviewState] = useState({
    isOpen: false,
    item: null,
    isLoading: false,
    data: null,
    representation: 'normalized',
    page: 1,
    pageSize: 20,
    error: null,
  })

  const fetchApprovedDatasets = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await adminService.getApprovedDatasets()
      setDatasets(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load approved datasets.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchApprovedDatasets()
  }, [fetchApprovedDatasets])

  const stats = useMemo(() => {
    const approvedCount = datasets.length
    const uniqueDatasets = new Set(
      datasets.map((d) => d.dataset_id || d.dataset_name).filter(Boolean)
    ).size
    const totalRecords = datasets.reduce(
      (acc, d) => acc + (Number(d.total_records) || 0),
      0
    )
    return { approvedCount, uniqueDatasets, totalRecords }
  }, [datasets])

  const filteredDatasets = useMemo(() => {
    return datasets.filter((item) => {
      if ((item.approval_status || '').toUpperCase() !== 'APPROVED') return false
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        const matchName = (item.dataset_name || '').toLowerCase().includes(q)
        const matchTag = (item.version_tag || '').toLowerCase().includes(q)
        const matchFormat = (item.file_format || '').toLowerCase().includes(q)
        const matchNote = (item.approval_note || '').toLowerCase().includes(q)
        return matchName || matchTag || matchFormat || matchNote
      }
      return true
    })
  }, [datasets, searchQuery])

  const loadPreviewData = useCallback(
    async (datasetId, versionId, page = 1, representation = 'normalized') => {
      setPreviewState((prev) => ({
        ...prev,
        isLoading: true,
        error: null,
        page,
        representation,
      }))

      try {
        const result = await adminService.getDatasetVersionPreview(datasetId, versionId, {
          page,
          pageSize: 20,
          representation,
        })
        setPreviewState((prev) => ({
          ...prev,
          isLoading: false,
          data: result,
        }))
      } catch (err) {
        setPreviewState((prev) => ({
          ...prev,
          isLoading: false,
          error:
            err.response?.data?.detail ||
            'Could not load preview for this version. Try switching between Normalized and Raw Source.',
        }))
      }
    },
    []
  )

  const handleOpenPreview = (item) => {
    if (!item?.dataset_id || !item?.id) return
    setPreviewState({
      isOpen: true,
      item,
      isLoading: true,
      data: null,
      representation: 'normalized',
      page: 1,
      pageSize: 20,
      error: null,
    })
    loadPreviewData(item.dataset_id, item.id, 1, 'normalized')
  }

  const handleClosePreview = () => {
    setPreviewState((prev) => ({
      ...prev,
      isOpen: false,
      item: null,
      data: null,
      error: null,
    }))
  }

  const handleToggleRepresentation = (rep) => {
    if (previewState.item && rep !== previewState.representation) {
      loadPreviewData(previewState.item.dataset_id, previewState.item.id, 1, rep)
    }
  }

  const handlePageChange = (newPage) => {
    if (previewState.item && newPage >= 1) {
      loadPreviewData(
        previewState.item.dataset_id,
        previewState.item.id,
        newPage,
        previewState.representation
      )
    }
  }

  return (
    <div>
      {/* 1. 3-Column Bento KPI Strip */}
      <div className="adm-bento-grid">
        <div className="adm-panel adm-col-4">
          <div className="adm-panel__body" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div className="adm-panel__icon adm-tone--emerald">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.55rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
                {stats.approvedCount}
              </div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', marginTop: '0.2rem' }}>
                Verified Dataset Versions
              </div>
            </div>
          </div>
        </div>

        <div className="adm-panel adm-col-4">
          <div className="adm-panel__body" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div className="adm-panel__icon adm-tone--blue">
              <Database size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.55rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
                {stats.uniqueDatasets}
              </div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', marginTop: '0.2rem' }}>
                Unique UAV Corridors
              </div>
            </div>
          </div>
        </div>

        <div className="adm-panel adm-col-4">
          <div className="adm-panel__body" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div className="adm-panel__icon adm-tone--purple">
              <Layers size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.55rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
                {stats.totalRecords.toLocaleString()}
              </div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', marginTop: '0.2rem' }}>
                Approved Trajectory Rows
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Toolbar */}
      <div className="adm-toolbar">
        <div className="adm-search-box">
          <Search size={16} className="adm-search-box__icon" />
          <input
            type="text"
            placeholder="Search verified datasets by name, version, format, or note..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="adm-input adm-input--search"
          />
        </div>

        <button
          type="button"
          className="adm-btn adm-btn--primary"
          onClick={fetchApprovedDatasets}
        >
          <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          <span>Refresh Catalog</span>
        </button>
      </div>

      {/* 3. Approved Catalog Table */}
      <div className="adm-panel">
        <div className="adm-panel__header">
          <div className="adm-panel__title-group">
            <div className="adm-panel__icon adm-tone--emerald">
              <FolderCheck size={18} />
            </div>
            <div>
              <h3 className="adm-panel__title">
                Production-Ready UAV Dataset Catalog ({filteredDatasets.length})
              </h3>
              <p className="adm-panel__subtitle">
                Quality-certified pNEUMA trajectory versions authorized for ML forecasting & GIS analytics
              </p>
            </div>
          </div>
        </div>

        <div className="adm-panel__body--flush">
          {isLoading ? (
            <div className="adm-empty">
              <div className="adm-empty__icon adm-tone--blue">
                <RefreshCw size={24} className="animate-spin" />
              </div>
              <h4 className="adm-empty__title">Loading Verified Catalog...</h4>
            </div>
          ) : error ? (
            <div className="adm-empty">
              <div className="adm-empty__icon adm-tone--rose">
                <AlertCircle size={24} />
              </div>
              <h4 className="adm-empty__title">Failed to Load Catalog</h4>
              <p className="adm-empty__desc">{error}</p>
            </div>
          ) : filteredDatasets.length === 0 ? (
            <div className="adm-empty">
              <div className="adm-empty__icon adm-tone--slate">
                <Database size={24} />
              </div>
              <h4 className="adm-empty__title">No Verified Datasets Found</h4>
              <p className="adm-empty__desc">
                Approve pending dataset versions in the Quality Gate Queue to populate this catalog.
              </p>
            </div>
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Dataset Name</th>
                    <th>Version</th>
                    <th>Format</th>
                    <th>Trajectory Rows</th>
                    <th>Certification Status</th>
                    <th>Audit Note</th>
                    <th>Approved Date</th>
                    <th style={{ textAlign: 'right' }}>Inspector</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDatasets.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div style={{ fontWeight: 800, color: '#0f172a' }}>
                          {item.dataset_name}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                          ID: {String(item.dataset_id || '').slice(0, 12)}
                        </div>
                      </td>
                      <td>
                        <span className="adm-code-tag">{item.version_tag}</span>
                      </td>
                      <td>
                        <span className="adm-badge adm-badge--blue">{item.file_format}</span>
                      </td>
                      <td style={{ fontWeight: 700 }}>
                        {(item.total_records || 0).toLocaleString()}
                      </td>
                      <td>
                        <span className="adm-badge adm-badge--emerald">
                          <CheckCircle2 size={12} />
                          <span>Certified</span>
                        </span>
                      </td>
                      <td style={{ maxWidth: '280px', fontSize: '0.8rem', color: '#334155' }}>
                        {item.approval_note || 'Verified canonical pNEUMA schema.'}
                      </td>
                      <td style={{ fontSize: '0.78rem', color: '#64748b' }}>
                        {item.reviewed_at || item.created_at
                          ? new Date(item.reviewed_at || item.created_at).toLocaleDateString('en-US')
                          : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="adm-btn adm-btn--ghost adm-btn--sm"
                          onClick={() => handleOpenPreview(item)}
                        >
                          <Eye size={13} />
                          <span>Preview Records</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Preview Modal */}
      {previewState.isOpen && (
        <div
          className="adm-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClosePreview()
          }}
        >
          <div className="adm-modal adm-modal--xl">
            <div className="adm-modal__header">
              <div>
                <h3 className="adm-modal__title">
                  Verified Dataset Preview — {previewState.item?.dataset_name}
                </h3>
                <div style={{ fontSize: '0.78rem', color: '#cbd5e1', marginTop: '0.2rem' }}>
                  Version: {previewState.item?.version_tag} • Format:{' '}
                  {previewState.item?.file_format}
                </div>
              </div>
              <button type="button" className="adm-modal__close" onClick={handleClosePreview}>
                <X size={18} />
              </button>
            </div>

            <div
              style={{
                padding: '0.85rem 1.5rem',
                background: '#f8fafc',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
              }}
            >
              <div className="adm-filter-pills">
                <button
                  type="button"
                  className={`adm-filter-pill ${
                    previewState.representation === 'normalized' ? 'active' : ''
                  }`}
                  onClick={() => handleToggleRepresentation('normalized')}
                >
                  Normalized Schema (Parquet)
                </button>
                <button
                  type="button"
                  className={`adm-filter-pill ${
                    previewState.representation === 'raw' ? 'active' : ''
                  }`}
                  onClick={() => handleToggleRepresentation('raw')}
                >
                  Raw Source CSV
                </button>
              </div>
              <span className="adm-badge adm-badge--emerald">
                <CheckCircle2 size={12} />
                <span>Approved for ML & GIS</span>
              </span>
            </div>

            <div className="adm-modal__body" style={{ padding: 0 }}>
              {previewState.isLoading ? (
                <div className="adm-empty">
                  <RefreshCw size={24} className="animate-spin" style={{ color: '#2563eb' }} />
                  <h4 className="adm-empty__title">Loading Trajectory Records...</h4>
                </div>
              ) : previewState.error ? (
                <div className="adm-empty">
                  <AlertCircle size={24} style={{ color: '#e11d48' }} />
                  <h4 className="adm-empty__title">Preview Unavailable</h4>
                  <p className="adm-empty__desc">{previewState.error}</p>
                </div>
              ) : !previewState.data?.rows?.length ? (
                <div className="adm-empty">
                  <Database size={24} style={{ color: '#64748b' }} />
                  <h4 className="adm-empty__title">No Preview Rows Returned</h4>
                </div>
              ) : (
                <div className="adm-table-wrap" style={{ maxHeight: '460px' }}>
                  <table className="adm-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        {previewState.data.columns.map((col) => (
                          <th key={col.name}>{col.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewState.data.rows.map((row, idx) => (
                        <tr key={idx}>
                          <td style={{ color: '#64748b', fontWeight: 700 }}>
                            {(previewState.page - 1) * previewState.pageSize + idx + 1}
                          </td>
                          {previewState.data.columns.map((col) => (
                            <td key={col.name} style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>
                              {row[col.name] !== null && row[col.name] !== undefined
                                ? String(row[col.name])
                                : 'null'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {previewState.data && (
              <div className="adm-modal__footer" style={{ justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
                  Page {previewState.data.page} • Total Rows:{' '}
                  {(previewState.data.total_rows || 0).toLocaleString()}
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="adm-btn adm-btn--ghost adm-btn--sm"
                    disabled={previewState.page <= 1 || previewState.isLoading}
                    onClick={() => handlePageChange(previewState.page - 1)}
                  >
                    <ChevronLeft size={14} />
                    <span>Previous</span>
                  </button>
                  <button
                    type="button"
                    className="adm-btn adm-btn--ghost adm-btn--sm"
                    disabled={!previewState.data.has_more || previewState.isLoading}
                    onClick={() => handlePageChange(previewState.page + 1)}
                  >
                    <span>Next</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

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
  MessageSquare,
  FolderCheck,
} from 'lucide-react'
import { adminService } from '../../../services/adminService'

export default function AdminAvailableDatasetsPage() {
  const [datasets, setDatasets] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Preview Modal State (GET /api/v1/admin/datasets/{dataset_id}/versions/{id}/preview)
  const [previewState, setPreviewState] = useState({
    isOpen: false,
    item: null,
    isLoading: false,
    data: null,
    representation: 'normalized', // 'normalized' or 'raw'
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

  // ---- Preview Modal Handlers ----
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
      {/* 1. KPI Summary Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
          marginBottom: '1.25rem',
        }}
      >
        <div
          className="admin-card"
          style={{
            marginBottom: 0,
            padding: '1rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.9rem',
            borderLeft: '4px solid #10b981',
          }}
        >
          <div className="admin-card__icon-box admin-card__icon-box--green">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
              {stats.approvedCount}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, marginTop: '0.15rem' }}>
              Approved Dataset Versions
            </div>
          </div>
        </div>

        <div
          className="admin-card"
          style={{
            marginBottom: 0,
            padding: '1rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.9rem',
            borderLeft: '4px solid #2563eb',
          }}
        >
          <div className="admin-card__icon-box admin-card__icon-box--blue">
            <FolderCheck size={20} />
          </div>
          <div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
              {stats.uniqueDatasets}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, marginTop: '0.15rem' }}>
              Active Traffic Datasets
            </div>
          </div>
        </div>

        <div
          className="admin-card"
          style={{
            marginBottom: 0,
            padding: '1rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.9rem',
            borderLeft: '4px solid #6366f1',
          }}
        >
          <div
            className="admin-card__icon-box"
            style={{ background: '#e0e7ff', color: '#4f46e5' }}
          >
            <Database size={20} />
          </div>
          <div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
              {stats.totalRecords.toLocaleString()}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, marginTop: '0.15rem' }}>
              Approved Trajectory Records
            </div>
          </div>
        </div>
      </div>

      {/* 2. Main Approved Datasets Card */}
      <div className="admin-card">
        <div
          className="admin-card__header"
          style={{ flexWrap: 'wrap', gap: '0.85rem' }}
        >
          <div className="admin-card__header-left">
            <div className="admin-card__icon-box admin-card__icon-box--green">
              <Database size={18} />
            </div>
            <div>
              <h3 className="admin-card__title">
                Dataset Available ({filteredDatasets.length})
              </h3>
              <p
                className="admin-card__subtitle"
                style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: '#64748b' }}
              >
                Catalog of standardized dataset versions officially approved for analytics and AI/ML forecasting.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', minWidth: '240px' }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: '0.7rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#94a3b8',
                }}
              />
              <input
                type="text"
                className="admin-input"
                placeholder="Search approved dataset or version..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  padding: '0.42rem 0.75rem 0.42rem 2rem',
                  fontSize: '0.8rem',
                  borderRadius: '8px',
                  width: '100%',
                }}
              />
            </div>

            <button
              type="button"
              className="btn-action btn-action--primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              onClick={fetchApprovedDatasets}
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="empty-state">
            <RefreshCw
              size={24}
              className="animate-spin"
              style={{ margin: '0 auto 0.75rem', color: '#2563eb' }}
            />
            <p>Loading approved datasets...</p>
          </div>
        ) : error ? (
          <div className="empty-state">
            <AlertCircle size={24} style={{ margin: '0 auto 0.75rem', color: '#dc2626' }} />
            <p>{error}</p>
          </div>
        ) : filteredDatasets.length === 0 ? (
          <div className="empty-state">
            <Database size={28} style={{ margin: '0 auto 0.75rem', color: '#94a3b8' }} />
            <p>No approved datasets available yet.</p>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Datasets approved in the Dataset Approvals section will automatically appear here.
            </span>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Dataset Name</th>
                  <th>Version</th>
                  <th>Format</th>
                  <th>Total Records</th>
                  <th>Status</th>
                  <th>Review Note</th>
                  <th>Approved At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDatasets.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong style={{ color: '#0f172a', fontSize: '0.9rem' }}>
                        {item.dataset_name || 'Traffic Dataset'}
                      </strong>
                    </td>
                    <td>
                      <code
                        style={{
                          background: '#f0fdf4',
                          color: '#15803d',
                          border: '1px solid #bbf7d0',
                          padding: '0.22rem 0.5rem',
                          borderRadius: '6px',
                          fontWeight: 700,
                          fontSize: '0.8rem',
                        }}
                      >
                        {item.version_tag || 'v1.0'}
                      </code>
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: '0.76rem',
                          fontWeight: 700,
                          padding: '0.2rem 0.5rem',
                          borderRadius: '5px',
                          background:
                            item.file_format === 'PARQUET' ? '#eff6ff' : '#f8fafc',
                          color:
                            item.file_format === 'PARQUET' ? '#1d4ed8' : '#334155',
                          border:
                            item.file_format === 'PARQUET'
                              ? '1px solid #bfdbfe'
                              : '1px solid #e2e8f0',
                        }}
                      >
                        {item.file_format || 'PARQUET'}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: '#1e293b' }}>
                      {item.total_records != null
                        ? Number(item.total_records).toLocaleString()
                        : 'N/A'}
                    </td>
                    <td>
                      <span
                        className="badge badge--approved"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                      >
                        <CheckCircle2 size={12} />
                        <span>Approved</span>
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#475569', maxWidth: '280px' }}>
                      {item.approval_note ? (
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                          }}
                        >
                          <MessageSquare size={12} color="#64748b" />
                          <span>{item.approval_note}</span>
                        </div>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      )}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      {item.reviewed_at || item.created_at
                        ? new Date(item.reviewed_at || item.created_at).toLocaleString('en-US')
                        : '—'}
                    </td>
                    <td>
                      {item.dataset_id && (
                        <button
                          type="button"
                          className="btn-action"
                          style={{
                            background: '#eff6ff',
                            color: '#1d4ed8',
                            border: '1px solid #bfdbfe',
                            padding: '0.38rem 0.75rem',
                            fontSize: '0.76rem',
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.32rem',
                          }}
                          onClick={() => handleOpenPreview(item)}
                          title="Inspect approved dataset rows"
                        >
                          <Eye size={13} />
                          <span>Preview</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 3. Dataset Version Preview Modal */}
      {previewState.isOpen && previewState.item && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClosePreview()
          }}
        >
          <div className="modal-dialog" style={{ maxWidth: '1020px', width: '94%' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div className="admin-card__icon-box admin-card__icon-box--green">
                  <Layers size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
                    {previewState.item.dataset_name}{' '}
                    <span style={{ fontSize: '0.85rem', color: '#15803d', fontWeight: 600 }}>
                      ({previewState.item.version_tag})
                    </span>
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
                    Status: <strong style={{ color: '#15803d' }}>APPROVED</strong> • Format:{' '}
                    <strong>{previewState.item.file_format}</strong> • Records:{' '}
                    <strong>
                      {Number(previewState.item.total_records || 0).toLocaleString()}
                    </strong>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div
                  style={{
                    display: 'inline-flex',
                    background: '#f1f5f9',
                    padding: '0.2rem',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <button
                    type="button"
                    style={{
                      padding: '0.3rem 0.75rem',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      background:
                        previewState.representation === 'normalized' ? '#ffffff' : 'transparent',
                      color:
                        previewState.representation === 'normalized' ? '#1d4ed8' : '#64748b',
                      boxShadow:
                        previewState.representation === 'normalized'
                          ? '0 1px 3px rgba(0,0,0,0.08)'
                          : 'none',
                    }}
                    onClick={() => handleToggleRepresentation('normalized')}
                  >
                    Normalized (pNEUMA)
                  </button>
                  <button
                    type="button"
                    style={{
                      padding: '0.3rem 0.75rem',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      background:
                        previewState.representation === 'raw' ? '#ffffff' : 'transparent',
                      color: previewState.representation === 'raw' ? '#1d4ed8' : '#64748b',
                      boxShadow:
                        previewState.representation === 'raw'
                          ? '0 1px 3px rgba(0,0,0,0.08)'
                          : 'none',
                    }}
                    onClick={() => handleToggleRepresentation('raw')}
                  >
                    Raw Source
                  </button>
                </div>

                <button type="button" className="modal-close-btn" onClick={handleClosePreview}>
                  <X size={20} />
                </button>
              </div>
            </div>

            <div
              className="modal-body"
              style={{ maxHeight: '62vh', overflowY: 'auto', padding: '1.25rem' }}
            >
              {previewState.isLoading ? (
                <div className="empty-state" style={{ padding: '2.5rem 1rem' }}>
                  <RefreshCw
                    size={26}
                    className="animate-spin"
                    style={{ margin: '0 auto 0.75rem', color: '#2563eb' }}
                  />
                  <p>Loading {previewState.representation} preview data...</p>
                </div>
              ) : previewState.error ? (
                <div className="empty-state" style={{ padding: '2.5rem 1rem' }}>
                  <AlertCircle
                    size={26}
                    style={{ margin: '0 auto 0.75rem', color: '#dc2626' }}
                  />
                  <p style={{ color: '#dc2626' }}>{previewState.error}</p>
                </div>
              ) : !previewState.data ||
                !previewState.data.rows ||
                previewState.data.rows.length === 0 ? (
                <div className="empty-state" style={{ padding: '2.5rem 1rem' }}>
                  <Database
                    size={26}
                    style={{ margin: '0 auto 0.75rem', color: '#94a3b8' }}
                  />
                  <p>No preview rows available for this representation.</p>
                </div>
              ) : (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '0.75rem',
                      fontSize: '0.8rem',
                      color: '#64748b',
                    }}
                  >
                    <span>
                      Showing page <strong>{previewState.page}</strong> •{' '}
                      {previewState.data.columns?.length || 0} columns
                    </span>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={previewState.page <= 1 || previewState.isLoading}
                        style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem' }}
                        onClick={() => handlePageChange(previewState.page - 1)}
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={
                          previewState.data.rows.length < previewState.pageSize ||
                          previewState.isLoading
                        }
                        style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem' }}
                        onClick={() => handlePageChange(previewState.page + 1)}
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      overflowX: 'auto',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                    }}
                  >
                    <table
                      className="admin-table"
                      style={{ margin: 0, fontSize: '0.82rem' }}
                    >
                      <thead>
                        <tr>
                          {previewState.data.columns?.map((col) => (
                            <th key={col.name || col} style={{ whiteSpace: 'nowrap' }}>
                              {col.name || col}
                              {col.type && (
                                <span
                                  style={{
                                    display: 'block',
                                    fontSize: '0.68rem',
                                    fontWeight: 500,
                                    color: '#94a3b8',
                                  }}
                                >
                                  {col.type}
                                </span>
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewState.data.rows.map((row, rIdx) => (
                          <tr key={rIdx}>
                            {previewState.data.columns?.map((col) => {
                              const colName = col.name || col
                              const val = row[colName]
                              return (
                                <td key={colName} style={{ whiteSpace: 'nowrap' }}>
                                  {val !== null && val !== undefined ? (
                                    String(val)
                                  ) : (
                                    <em style={{ color: '#cbd5e1' }}>null</em>
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div
              className="modal-actions"
              style={{
                padding: '0.9rem 1.25rem',
                borderTop: '1px solid #e2e8f0',
                background: '#f8fafc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                className="btn-secondary"
                onClick={handleClosePreview}
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

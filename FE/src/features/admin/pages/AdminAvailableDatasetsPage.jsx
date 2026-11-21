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
  MessageSquare,
} from 'lucide-react'
import { adminService } from '../../../services/adminService'
import { useLanguage } from '../../../hooks/useLanguage'

export default function AdminAvailableDatasetsPage() {
  const { t, language } = useLanguage()
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
                {datasets.length}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, marginTop: '0.2rem' }}>
                {t('Approved Dataset Versions')}
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
                {new Set(datasets.map((d) => d.dataset_id || d.dataset_name).filter(Boolean)).size}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, marginTop: '0.2rem' }}>
                {t('Active Traffic Datasets')}
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
                {datasets.reduce((acc, d) => acc + (d.total_records || 0), 0).toLocaleString()}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, marginTop: '0.2rem' }}>
                {t('Approved Trajectory Records')}
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
            aria-label={t('Search verified datasets')}
            placeholder={t('Search verified datasets by name, version, format, or note...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="adm-input adm-input--search"
          />
        </div>

        <button
          type="button"
          className="adm-btn adm-btn--primary"
          onClick={fetchApprovedDatasets}
          disabled={isLoading}
        >
          <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          <span>{t('Refresh Catalog')}</span>
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
                {t('Dataset Available')} ({filteredDatasets.length})
              </h3>
            </div>
          </div>
        </div>

        <div className="adm-panel__body--flush">
        {isLoading ? (
          <div className="empty-state">
            <RefreshCw
              size={24}
              className="animate-spin"
              style={{ margin: '0 auto 0.75rem', color: '#2563eb' }}
            />
            <p>{t('Loading approved datasets...')}</p>
          </div>
        ) : error ? (
          <div className="empty-state">
            <AlertCircle size={24} style={{ margin: '0 auto 0.75rem', color: '#dc2626' }} />
            <p>{t(error)}</p>
          </div>
        ) : filteredDatasets.length === 0 ? (
          <div className="empty-state">
            <Database size={28} style={{ margin: '0 auto 0.75rem', color: '#94a3b8' }} />
            <p>{t('No approved datasets available yet.')}</p>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              {t('Datasets approved in the Dataset Approvals section will automatically appear here.')}
            </span>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('Dataset Name')}</th>
                  <th>{t('Version')}</th>
                  <th>{t('Format')}</th>
                  <th>{t('Total Records')}</th>
                  <th>{t('Status')}</th>
                  <th>{t('Review Note')}</th>
                  <th>{t('Approved At')}</th>
                  <th>{t('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredDatasets.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong style={{ color: '#0f172a', fontSize: '0.9rem' }}>
                        {item.dataset_name || t('Traffic Dataset')}
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
                        ? new Date(item.reviewed_at || item.created_at).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US')
                        : '—'}
                    </td>
                    <td>
                      {item.dataset_id && (
                        <button
                          type="button"
                          className="adm-btn adm-btn--ghost adm-btn--sm"
                          onClick={() => handleOpenPreview(item)}
                          title={t('Inspect approved dataset rows')}
                        >
                          <Eye size={13} />
                          <span>{t('Preview')}</span>
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
      </div>

      {/* Preview Modal */}
      {previewState.isOpen && previewState.item && (
        <div
          className="adm-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="available-preview-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClosePreview()
          }}
        >
          <div className="adm-modal adm-modal--xl">
            <div className="adm-modal__header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div className="adm-panel__icon adm-tone--emerald">
                  <Layers size={18} />
                </div>
                <div>
                  <h3 id="available-preview-modal-title" className="adm-modal__title">
                    {previewState.item.dataset_name}{' '}
                    <span style={{ fontSize: '0.85rem', color: '#059669', fontWeight: 700 }}>
                      ({previewState.item.version_tag})
                    </span>
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
                    {t('Status:')} <strong style={{ color: '#059669' }}>{t('Approved')}</strong> • {t('Format')}:{' '}
                    <strong>{previewState.item.file_format}</strong> • {t('Records')}:{' '}
                    <strong>{Number(previewState.item.total_records || 0).toLocaleString()}</strong>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="adm-modal__close"
                aria-label={t('Close modal')}
                onClick={handleClosePreview}
              >
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
                flexWrap: 'wrap',
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
                  Normalized (pNEUMA)
                </button>
                <button
                  type="button"
                  className={`adm-filter-pill ${
                    previewState.representation === 'raw' ? 'active' : ''
                  }`}
                  onClick={() => handleToggleRepresentation('raw')}
                >
                  {t('Raw Source')}
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
                  <h4 className="adm-empty__title">{t(`Loading ${previewState.representation} preview data...`)}</h4>
                </div>
              ) : previewState.error ? (
                <div className="adm-empty">
                  <AlertCircle size={24} style={{ color: '#e11d48' }} />
                  <h4 className="adm-empty__title">{t(previewState.error)}</h4>
                </div>
              ) : !previewState.data?.rows?.length ? (
                <div className="adm-empty">
                  <Database size={24} style={{ color: '#64748b' }} />
                  <h4 className="adm-empty__title">{t('No preview rows available for this representation.')}</h4>
                </div>
              ) : (
                <div className="adm-table-wrap" style={{ maxHeight: '460px' }}>
                  <table className="adm-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        {previewState.data.columns?.map((col) => (
                          <th key={col.name || col} style={{ whiteSpace: 'nowrap' }}>
                            {col.name || col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewState.data.rows.map((row, idx) => (
                        <tr key={idx}>
                          <td style={{ color: '#64748b', fontWeight: 700 }}>
                            {(previewState.page - 1) * previewState.pageSize + idx + 1}
                          </td>
                          {previewState.data.columns?.map((col) => {
                            const colKey = col.name || col
                            return (
                              <td key={colKey} style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>
                                {row[colKey] !== null && row[colKey] !== undefined
                                  ? String(row[colKey])
                                  : 'null'}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="adm-modal__footer" style={{ justifyContent: 'space-between' }}>
              {previewState.data ? (
                <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
                  {t('Showing page')} <strong>{previewState.page}</strong> • {previewState.data.columns?.length || 0} columns
                </span>
              ) : (
                <span />
              )}
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {previewState.data && (
                  <>
                    <button
                      type="button"
                      className="adm-btn adm-btn--ghost adm-btn--sm"
                      aria-label={t('Previous page')}
                      disabled={previewState.page <= 1 || previewState.isLoading}
                      onClick={() => handlePageChange(previewState.page - 1)}
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <button
                      type="button"
                      className="adm-btn adm-btn--ghost adm-btn--sm"
                      aria-label={t('Next page')}
                      disabled={
                        (previewState.data.rows?.length || 0) < previewState.pageSize ||
                        previewState.isLoading
                      }
                      onClick={() => handlePageChange(previewState.page + 1)}
                    >
                      <ChevronRight size={14} />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="adm-btn adm-btn--primary adm-btn--sm"
                  onClick={handleClosePreview}
                >
                  {t('Close Preview')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

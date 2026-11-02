import { useState, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Database,
  Layers,
  HardDrive,
  FileSpreadsheet,
  Search,
  RefreshCw,
  Info,
} from 'lucide-react'
import { useApprovedDatasets, useDatasetPreview } from '../../../hooks/useScientistData'
import { formatBytes, formatNumber } from '../utils/formatters'

export default function ScientistDatasetPreviewPage() {
  const { datasetId: paramDatasetId, versionId: paramVersionId } = useParams()
  const navigate = useNavigate()

  // 1. Fetch list of approved datasets to support quick switching / selection
  const { datasets, isLoading: isLoadingList } = useApprovedDatasets('')

  // Selected dataset_id & version_id
  const effectiveDatasetId =
    paramDatasetId || (datasets.length > 0 ? datasets[0].dataset_id : null)
  const effectiveVersionId =
    paramVersionId || (datasets.length > 0 ? datasets[0].version_id : null)

  const activeMeta = datasets.find(
    (d) => d.dataset_id === effectiveDatasetId && d.version_id === effectiveVersionId
  )

  // 2. Query parameters (matching Swagger screenshot)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [representation, setRepresentation] = useState('normalized') // 'normalized' | 'raw'
  const [columnSearch, setColumnSearch] = useState('')

  // 3. Live Preview API query (GET /datasets/{dataset_id}/versions/{version_id}/preview)
  const { preview, isLoading: isLoadingPreview, error } = useDatasetPreview(
    effectiveDatasetId,
    effectiveVersionId,
    {
      page,
      pageSize,
      representation,
    }
  )

  const pagination = preview?.pagination
  const totalRows = pagination?.total_rows ?? null
  const totalPages =
    pagination && totalRows != null ? Math.max(1, Math.ceil(totalRows / pageSize)) : null

  // Filter columns by search
  const filteredColumns = useMemo(() => {
    if (!preview?.columns) return []
    if (!columnSearch.trim()) return preview.columns
    const q = columnSearch.toLowerCase()
    return preview.columns.filter(
      (c) => c.name.toLowerCase().includes(q) || c.type.toLowerCase().includes(q)
    )
  }, [preview?.columns, columnSearch])

  const handleDatasetChange = (e) => {
    const selectedKey = e.target.value
    if (!selectedKey) return
    const [dId, vId] = selectedKey.split('::')
    setPage(1)
    navigate(`/scientist/datasets/${dId}/versions/${vId}`)
  }

  return (
    <div className="sci-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          type="button"
          className="sci-back"
          onClick={() => navigate('/scientist/datasets')}
        >
          <ArrowLeft size={16} /> Back to Approved Datasets
        </button>

        {/* Dataset Version Selector Dropdown */}
        {datasets.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569' }}>
              Select Dataset Version:
            </span>
            <select
              className="sci-dataset-select"
              value={
                effectiveDatasetId && effectiveVersionId
                  ? `${effectiveDatasetId}::${effectiveVersionId}`
                  : ''
              }
              onChange={handleDatasetChange}
            >
              {datasets.map((d) => (
                <option key={d.version_id} value={`${d.dataset_id}::${d.version_id}`}>
                  {d.dataset_name} ({d.version_tag}) — {d.dataset_code}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <section className="admin-card">
        {/* Header with Title and Status */}
        <div className="admin-card__header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
              <h2 className="admin-card__title">
                {preview?.dataset_name || activeMeta?.dataset_name || 'Dataset Detail & Preview'}
              </h2>
              {activeMeta?.version_tag && (
                <span className="sci-pill sci-pill--version">{activeMeta.version_tag}</span>
              )}
              <span className="sci-pill sci-pill--approved">APPROVED</span>
            </div>
            <p className="admin-card__subtitle">
              {activeMeta?.dataset_code && `${activeMeta.dataset_code} • `}
              {activeMeta?.location_name && `${activeMeta.location_name} • `}
              {activeMeta?.source && `Source: ${activeMeta.source} • `}
              {preview?.original_filename && `File: ${preview.original_filename}`}
            </p>
          </div>
        </div>

        {/* Parameters Bar (matching Swagger parameter controls) */}
        <div className="sci-params-bar">
          <div className="sci-params-bar__group">
            <span className="sci-params-bar__label">Representation:</span>
            <div className="sci-tabs">
              <button
                type="button"
                className={representation === 'normalized' ? 'active' : ''}
                onClick={() => {
                  setRepresentation('normalized')
                  setPage(1)
                }}
                title="Bung điểm quỹ đạo và chuẩn hóa cột"
              >
                Normalized
              </button>
              <button
                type="button"
                className={representation === 'raw' ? 'active' : ''}
                onClick={() => {
                  setRepresentation('raw')
                  setPage(1)
                }}
                title="Dữ liệu nguyên bản ban đầu"
              >
                Raw
              </button>
            </div>
          </div>

          <div className="sci-params-bar__group">
            <span className="sci-params-bar__label">Page Size:</span>
            <select
              className="sci-dataset-select"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setPage(1)
              }}
            >
              <option value={10}>10 rows / page</option>
              <option value={20}>20 rows / page (default)</option>
              <option value={50}>50 rows / page</option>
              <option value={100}>100 rows / page (max)</option>
            </select>
          </div>

          <div className="sci-params-bar__group" style={{ marginLeft: 'auto' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setPage((p) => p)}
              title="Refresh preview data"
            >
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
        </div>

        {/* Metadata KPI Summary Cards */}
        {preview && (
          <div className="stats-grid" style={{ marginBottom: '1.25rem' }}>
            <div className="stat-card stat-card--blue">
              <div className="stat-card__icon">
                <Database size={20} />
              </div>
              <div className="stat-card__info">
                <span className="stat-card__eyebrow">Total Records</span>
                <strong>
                  {totalRows != null
                    ? formatNumber(totalRows)
                    : `${formatNumber(pagination?.returned_rows ?? 0)}+ rows`}
                </strong>
              </div>
            </div>

            <div className="stat-card stat-card--purple">
              <div className="stat-card__icon">
                <HardDrive size={20} />
              </div>
              <div className="stat-card__info">
                <span className="stat-card__eyebrow">File Size</span>
                <strong>{formatBytes(preview.file_size)}</strong>
              </div>
            </div>

            <div className="stat-card stat-card--green">
              <div className="stat-card__icon">
                <FileSpreadsheet size={20} />
              </div>
              <div className="stat-card__info">
                <span className="stat-card__eyebrow">Format / Structure</span>
                <strong>
                  {preview.file_format?.toUpperCase()} ({preview.detected_structure})
                </strong>
              </div>
            </div>

            <div className="stat-card stat-card--amber">
              <div className="stat-card__icon">
                <Layers size={20} />
              </div>
              <div className="stat-card__info">
                <span className="stat-card__eyebrow">Active Representation</span>
                <strong style={{ textTransform: 'capitalize' }}>{preview.representation}</strong>
              </div>
            </div>
          </div>
        )}

        {/* Warnings from Backend Parser / Quality Checks */}
        {preview?.warnings && preview.warnings.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1.2rem' }}>
            {preview.warnings.map((w, idx) => (
              <div key={idx} className="sci-warning">
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

        {/* Schema Inspector */}
        {preview?.columns && preview.columns.length > 0 && (
          <div style={{ marginBottom: '1.25rem', background: '#f8fafc', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Info size={15} style={{ color: '#1668e3' }} />
                Schema Columns ({preview.columns.length} columns)
              </div>
              <div style={{ position: 'relative', width: '200px' }}>
                <Search size={13} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  className="admin-input"
                  style={{ padding: '0.25rem 0.6rem 0.25rem 1.8rem', fontSize: '0.78rem' }}
                  placeholder="Filter columns..."
                  value={columnSearch}
                  onChange={(e) => setColumnSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="sci-chips">
              {filteredColumns.map((c) => (
                <span key={c.name} className="sci-chip" title={`Data type: ${c.type}`}>
                  {c.name} <small>{c.type}</small>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoadingPreview && (
          <div className="sci-state">
            <div className="sci-spinner" />
            <div style={{ fontWeight: 600 }}>Loading live dataset preview from server...</div>
          </div>
        )}

        {/* Error State */}
        {!isLoadingPreview && error && (
          <div className="sci-state sci-state--error">
            <p style={{ margin: 0, fontWeight: 700 }}>{error}</p>
          </div>
        )}

        {/* Empty State */}
        {!isLoadingPreview && !error && (!preview || !preview.rows || preview.rows.length === 0) && (
          <div className="sci-state">
            {!effectiveDatasetId
              ? 'No dataset version selected. Please select one from the list above.'
              : 'No records found for this dataset version.'}
          </div>
        )}

        {/* Live Data Table */}
        {!isLoadingPreview && !error && preview && preview.rows && preview.rows.length > 0 && (
          <>
            <div className="sci-table-wrap">
              <table className="sci-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                    {preview.columns.map((c) => (
                      <th key={c.name}>
                        {c.name}
                        <small>{c.type}</small>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, i) => (
                    <tr key={i}>
                      <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.75rem' }}>
                        {(page - 1) * pageSize + i + 1}
                      </td>
                      {preview.columns.map((c) => (
                        <td key={c.name}>
                          {row[c.name] !== undefined && row[c.name] !== null ? (
                            String(row[c.name])
                          ) : (
                            <span className="sci-null-pill">null</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="sci-pager">
              <span>
                Showing{' '}
                <strong>
                  {formatNumber((page - 1) * pageSize + 1)}–
                  {formatNumber((page - 1) * pageSize + (pagination?.returned_rows ?? preview.rows.length))}
                </strong>
                {totalRows != null ? ` of ${formatNumber(totalRows)} records` : ' records'}
              </span>

              <div className="sci-pager__controls">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft size={14} /> Prev
                </button>

                <span style={{ fontWeight: 600, padding: '0 0.4rem' }}>
                  Page {page} {totalPages != null ? `/ ${formatNumber(totalPages)}` : ''}
                </span>

                <button
                  type="button"
                  className="btn-secondary"
                  disabled={pagination ? !pagination.has_more : preview.rows.length < pageSize}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import {
  Table2,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { datasetService } from '../../../services/datasetService'
import {
  formatBytes,
  formatStructureLabel,
  resolveEffectiveVersionTag,
} from '../utils/engineerHelpers'

export default function EngineerPreviewPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { datasets = [], versionLineageMap = {}, registerRecordCount } = useOutletContext()

  const uniqueDatasets = useMemo(() => {
    const seen = new Set()
    const result = []
    for (const d of datasets) {
      if (d?.dataset_id && !seen.has(d.dataset_id)) {
        seen.add(d.dataset_id)
        result.push(d)
      }
    }
    return result
  }, [datasets])

  const queryDatasetId = searchParams.get('datasetId') || ''
  const activeDatasetId = useMemo(() => {
    if (queryDatasetId && uniqueDatasets.some((d) => d.dataset_id === queryDatasetId)) {
      return queryDatasetId
    }
    return uniqueDatasets[0]?.dataset_id || ''
  }, [queryDatasetId, uniqueDatasets])

  const [previewRepresentation, setPreviewRepresentation] = useState('normalized')
  const [previewPage, setPreviewPage] = useState(1)
  const [previewPageSize, setPreviewPageSize] = useState(20)
  const [previewData, setPreviewData] = useState(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState(null)
  const [reloadNonce, setReloadNonce] = useState(0)

  useEffect(() => {
    if (!queryDatasetId && activeDatasetId) {
      setSearchParams({ datasetId: activeDatasetId }, { replace: true })
    }
  }, [queryDatasetId, activeDatasetId, setSearchParams])

  const handleSelectDataset = (nextId) => {
    if (nextId) {
      setSearchParams({ datasetId: nextId })
    } else {
      setSearchParams({})
    }
    setPreviewPage(1)
  }

  useEffect(() => {
    if (!activeDatasetId) return

    let isCancelled = false
    const loadPreview = async () => {
      setIsPreviewLoading(true)
      setPreviewError(null)
      try {
        const result = await datasetService.previewDataset(activeDatasetId, {
          page: previewPage,
          page_size: previewPageSize,
          representation: previewRepresentation,
        })
        if (isCancelled) return
        setPreviewData(result)
        if (result?.pagination?.total_rows != null) {
          registerRecordCount(activeDatasetId, result.pagination.total_rows)
        }
      } catch (err) {
        if (isCancelled) return
        setPreviewData(null)
        setPreviewError(
          err.response?.data?.detail || 'Failed to load preview for the selected dataset.'
        )
      } finally {
        if (!isCancelled) {
          setIsPreviewLoading(false)
        }
      }
    }

    loadPreview()
    return () => {
      isCancelled = true
    }
  }, [activeDatasetId, previewPage, previewPageSize, previewRepresentation, reloadNonce])

  return (
    <section className="adm-panel">
      <div className="adm-panel__header">
        <div className="adm-panel__title-group">
          <div className="adm-panel__icon adm-tone--purple">
            <Table2 size={18} />
          </div>
          <div>
            <h2 className="adm-panel__title">Schema Inspector & Trajectory Preview</h2>
          </div>
        </div>

        <button
          type="button"
          className="adm-btn adm-btn--ghost adm-btn--sm"
          disabled={!activeDatasetId || isPreviewLoading}
          onClick={() => setReloadNonce((n) => n + 1)}
          aria-label="Reload preview"
        >
          <RefreshCw size={14} className={isPreviewLoading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="adm-panel__body">
        {/* Toolbar */}
        <div className="adm-toolbar">
          <select
            className="adm-select"
            aria-label="Select dataset to preview"
            value={activeDatasetId}
            onChange={(e) => handleSelectDataset(e.target.value)}
            style={{ maxWidth: '380px', flex: '1 1 240px', fontWeight: 600 }}
          >
            {uniqueDatasets.length === 0 ? (
              <option value="">No datasets available</option>
            ) : (
              uniqueDatasets.map((d) => (
                <option key={d.dataset_id} value={d.dataset_id}>
                  {d.name} ({d.file_format || 'CSV'} •{' '}
                  {resolveEffectiveVersionTag(d, versionLineageMap)}) [{d.approval_status}]
                </option>
              ))
            )}
          </select>

          <div className="adm-filter-pills" role="group" aria-label="Data representation">
            <button
              type="button"
              className={`adm-filter-pill ${previewRepresentation === 'normalized' ? 'active' : ''}`}
              onClick={() => {
                setPreviewRepresentation('normalized')
                setPreviewPage(1)
              }}
            >
              Normalized
            </button>
            <button
              type="button"
              className={`adm-filter-pill ${previewRepresentation === 'raw' ? 'active' : ''}`}
              onClick={() => {
                setPreviewRepresentation('raw')
                setPreviewPage(1)
              }}
            >
              Raw
            </button>
          </div>

          <select
            className="adm-select"
            aria-label="Rows per page"
            value={previewPageSize}
            onChange={(e) => {
              setPreviewPageSize(Number(e.target.value))
              setPreviewPage(1)
            }}
            style={{ width: 'auto', minWidth: '120px' }}
          >
            <option value={10}>10 rows</option>
            <option value={20}>20 rows</option>
            <option value={50}>50 rows</option>
          </select>
        </div>

        {!activeDatasetId ? (
          <div className="adm-empty">
            <div className="adm-empty__icon">
              <Table2 size={24} />
            </div>
            <div className="adm-empty__title">No dataset selected</div>
            <p className="adm-empty__desc">
              Select a dataset from the toolbar above to inspect its schema and preview rows.
            </p>
          </div>
        ) : isPreviewLoading ? (
          <div style={{ display: 'grid', gap: '0.75rem', padding: '0.5rem 0' }}>
            <div className="eng-kv-grid">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="eng-skeleton" style={{ height: '64px' }} />
              ))}
            </div>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="eng-skeleton" style={{ height: '38px' }} />
            ))}
          </div>
        ) : previewError ? (
          <div className="eng-alert eng-alert--error">
            <div className="eng-alert__content">
              <AlertCircle size={17} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>{previewError}</span>
            </div>
            <div className="eng-alert__actions">
              <button
                type="button"
                className="adm-btn adm-btn--ghost adm-btn--sm"
                onClick={() => setReloadNonce((n) => n + 1)}
              >
                Retry
              </button>
            </div>
          </div>
        ) : previewData ? (
          <>
            {/* Metadata KPI Grid */}
            <div className="eng-kv-grid" style={{ marginBottom: '1.1rem' }}>
              <div className="eng-kv-item">
                <span className="eng-kv-item__label">Detected Structure</span>
                <span className="eng-kv-item__value" style={{ color: '#1d4ed8' }}>
                  {formatStructureLabel(previewData.detected_structure)}
                </span>
              </div>
              <div className="eng-kv-item">
                <span className="eng-kv-item__label">Original File & Size</span>
                <span
                  className="eng-kv-item__value eng-truncate"
                  title={`${previewData.original_filename} (${formatBytes(previewData.file_size)})`}
                >
                  {previewData.original_filename} ({formatBytes(previewData.file_size)})
                </span>
              </div>
              <div className="eng-kv-item">
                <span className="eng-kv-item__label">Schema Columns</span>
                <span className="eng-kv-item__value">
                  {previewData.columns?.length || 0} fields
                </span>
              </div>
              <div className="eng-kv-item">
                <span className="eng-kv-item__label">Total Records</span>
                <span className="eng-kv-item__value" style={{ color: '#059669' }}>
                  {previewData.pagination?.total_rows != null
                    ? previewData.pagination.total_rows.toLocaleString()
                    : `${previewData.pagination?.returned_rows || 0}+`}
                </span>
              </div>
            </div>

            {previewData.warnings && previewData.warnings.length > 0 && (
              <div className="eng-alert eng-alert--warning">
                <div className="eng-alert__content">
                  <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: '0.2rem' }}>
                      Structure Validation Warnings ({previewData.warnings.length})
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                      {previewData.warnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Paginated Data Table (column types integrated into header) */}
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th style={{ width: '56px', textAlign: 'center' }}>#</th>
                    {previewData.columns?.map((col) => (
                      <th key={col.name}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                          <span>{col.name}</span>
                          <span
                            style={{
                              fontSize: '0.66rem',
                              fontWeight: 600,
                              color: '#64748b',
                              textTransform: 'none',
                              letterSpacing: 0,
                            }}
                          >
                            {col.type}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.rows?.map((row, rowIdx) => {
                    const rowNumber =
                      (previewData.pagination.page - 1) * previewData.pagination.page_size +
                      rowIdx +
                      1

                    return (
                      <tr key={rowIdx}>
                        <td style={{ textAlign: 'center', color: '#64748b', fontWeight: 600 }}>
                          {rowNumber}
                        </td>
                        {previewData.columns?.map((col) => {
                          const cellVal = row[col.name]
                          const isNumeric = col.type === 'float' || col.type === 'integer'
                          return (
                            <td
                              key={col.name}
                              title={cellVal != null ? String(cellVal) : ''}
                              style={{
                                maxWidth: '240px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                fontFamily: isNumeric ? 'ui-monospace, monospace' : 'inherit',
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {cellVal == null || cellVal === '' ? (
                                <span style={{ color: '#94a3b8' }}>—</span>
                              ) : (
                                String(cellVal)
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {previewData.pagination && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '1rem',
                  paddingTop: '0.85rem',
                  borderTop: '1px solid #f1f5f9',
                  fontSize: '0.82rem',
                  color: '#64748b',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <span>
                  Page <strong style={{ color: '#0f172a' }}>{previewData.pagination.page}</strong> (
                  {previewData.pagination.returned_rows} rows shown
                  {previewData.pagination.total_rows != null
                    ? ` of ${previewData.pagination.total_rows.toLocaleString()}`
                    : ''}
                  )
                </span>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button
                    type="button"
                    className="adm-btn adm-btn--ghost adm-btn--sm"
                    disabled={!previewData.pagination.has_previous}
                    aria-label="Previous page"
                    onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft size={15} />
                    <span>Prev</span>
                  </button>
                  <button
                    type="button"
                    className="adm-btn adm-btn--ghost adm-btn--sm"
                    disabled={!previewData.pagination.has_next}
                    aria-label="Next page"
                    onClick={() => setPreviewPage((p) => p + 1)}
                  >
                    <span>Next</span>
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </section>
  )
}

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

  // Distinct datasets deduplicated by dataset_id so every dropdown option is unique & selectable
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

  // Keep URL in sync with valid datasetId
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
  }, [activeDatasetId, previewPage, previewPageSize, previewRepresentation])

  return (
    <div className="admin-card">
      <div className="admin-card__header">
        <div className="admin-card__header-left">
          <div className="admin-card__icon-box admin-card__icon-box--purple">
            <Table2 size={18} />
          </div>
          <h3 className="admin-card__title">
            Schema Inspector & pNEUMA Trajectory Normalization
          </h3>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'center' }}>
          {/* Dataset Selector */}
          <select
            className="admin-select"
            value={activeDatasetId}
            onChange={(e) => handleSelectDataset(e.target.value)}
            style={{ minWidth: '250px', fontWeight: 600 }}
          >
            {uniqueDatasets.length === 0 ? (
              <option value="">-- No datasets available --</option>
            ) : (
              uniqueDatasets.map((d) => (
                <option key={d.dataset_id} value={d.dataset_id}>
                  {d.name} ({d.file_format || 'CSV'} • {resolveEffectiveVersionTag(d, versionLineageMap)}) [{d.approval_status}]
                </option>
              ))
            )}
          </select>

          {/* Representation Toggle: normalized vs raw */}
          <div
            style={{
              display: 'inline-flex',
              background: '#f1f5f9',
              padding: '0.22rem',
              borderRadius: '10px',
              border: '1px solid #cbd5e1',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setPreviewRepresentation('normalized')
                setPreviewPage(1)
              }}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '8px',
                border: 'none',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
                background: previewRepresentation === 'normalized' ? '#2563eb' : 'transparent',
                color: previewRepresentation === 'normalized' ? '#ffffff' : '#475569',
              }}
            >
              pNEUMA Normalized
            </button>
            <button
              type="button"
              onClick={() => {
                setPreviewRepresentation('raw')
                setPreviewPage(1)
              }}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '8px',
                border: 'none',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
                background: previewRepresentation === 'raw' ? '#2563eb' : 'transparent',
                color: previewRepresentation === 'raw' ? '#ffffff' : '#475569',
              }}
            >
              Raw Records
            </button>
          </div>

          {/* Page Size Selector */}
          <select
            className="admin-select"
            value={previewPageSize}
            onChange={(e) => {
              setPreviewPageSize(Number(e.target.value))
              setPreviewPage(1)
            }}
          >
            <option value={10}>10 rows / page</option>
            <option value={20}>20 rows / page</option>
            <option value={50}>50 rows / page</option>
            <option value={100}>100 rows / page</option>
          </select>
        </div>
      </div>

      {!selectedDatasetId ? (
        <div className="vivid-empty-box">
          <div
            className="vivid-empty-box__icon"
            style={{
              background: 'linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%)',
              color: '#7c3aed',
              border: '1px solid #d8b4fe',
            }}
          >
            <Table2 size={26} />
          </div>
          <h4
            style={{
              margin: '0.2rem 0 0',
              fontSize: '0.96rem',
              fontWeight: 700,
              color: '#0f172a',
            }}
          >
            Select a dataset from the toolbar above to inspect its schema and preview rows
          </h4>
        </div>
      ) : isPreviewLoading ? (
        <div className="empty-state">
          <RefreshCw
            size={26}
            className="animate-spin"
            style={{ margin: '0 auto 0.75rem', color: '#2563eb' }}
          />
          <p>Reading and analyzing dataset structure...</p>
        </div>
      ) : previewError ? (
        <div className="empty-state">
          <AlertCircle size={26} style={{ margin: '0 auto 0.75rem', color: '#dc2626' }} />
          <p>{previewError}</p>
        </div>
      ) : previewData ? (
        <>
          {/* Metadata & Detected Structure KPI Ribbon */}
          <div className="exp-kpi-ribbon" style={{ marginBottom: '1.15rem' }}>
            <div className="exp-kpi-box">
              <span className="exp-kpi-box__label">Detected Structure</span>
              <div className="exp-kpi-box__val" style={{ fontSize: '1rem', color: '#1d4ed8' }}>
                {formatStructureLabel(previewData.detected_structure)}
              </div>
            </div>

            <div className="exp-kpi-box">
              <span className="exp-kpi-box__label">Original File & Size</span>
              <div className="exp-kpi-box__val" style={{ fontSize: '0.95rem' }}>
                {previewData.original_filename} ({formatBytes(previewData.file_size)})
              </div>
            </div>

            <div className="exp-kpi-box">
              <span className="exp-kpi-box__label">Schema Columns</span>
              <div className="exp-kpi-box__val" style={{ color: '#7c3aed' }}>
                {previewData.columns?.length || 0} columns ({previewData.representation})
              </div>
            </div>

            <div className="exp-kpi-box">
              <span className="exp-kpi-box__label">Total Records</span>
              <div className="exp-kpi-box__val" style={{ color: '#059669' }}>
                {previewData.pagination?.total_rows != null
                  ? previewData.pagination.total_rows.toLocaleString()
                  : `${previewData.pagination?.returned_rows || 0}+`}
              </div>
            </div>
          </div>

          {/* Warnings Banner (if any) */}
          {previewData.warnings && previewData.warnings.length > 0 && (
            <div
              style={{
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: '10px',
                padding: '0.85rem 1.1rem',
                marginBottom: '1.15rem',
                color: '#92400e',
                fontSize: '0.84rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontWeight: 700,
                  marginBottom: '0.25rem',
                }}
              >
                <AlertTriangle size={16} color="#d97706" />
                <span>Structure Validation Warnings ({previewData.warnings.length})</span>
              </div>
              <ul style={{ margin: 0, paddingLeft: '1.4rem' }}>
                {previewData.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Schema Column Pills */}
          <div style={{ marginBottom: '1.15rem' }}>
            <div
              style={{
                fontSize: '0.78rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: '#475569',
                marginBottom: '0.5rem',
              }}
            >
              Column Schema ({previewData.columns?.length || 0} fields)
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
              {previewData.columns?.map((col) => (
                <span
                  key={col.name}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.28rem 0.65rem',
                    background: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    fontSize: '0.78rem',
                  }}
                >
                  <strong style={{ color: '#0f172a' }}>{col.name}</strong>
                  <code
                    style={{
                      fontSize: '0.7rem',
                      color: '#2563eb',
                      background: '#dbeafe',
                      padding: '0.08rem 0.35rem',
                      borderRadius: '4px',
                      fontWeight: 700,
                    }}
                  >
                    {col.type}
                  </code>
                </span>
              ))}
            </div>
          </div>

          {/* Paginated Data Table */}
          <div
            style={{
              overflowX: 'auto',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              marginBottom: '1rem',
            }}
          >
            <table className="admin-table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: '56px', textAlign: 'center' }}>#</th>
                  {previewData.columns?.map((col) => (
                    <th key={col.name}>{col.name}</th>
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
                      <td
                        style={{
                          textAlign: 'center',
                          color: '#94a3b8',
                          fontWeight: 600,
                          fontSize: '0.76rem',
                        }}
                      >
                        {rowNumber}
                      </td>
                      {previewData.columns?.map((col) => {
                        const val = row[col.name]
                        const displayVal =
                          val === null || val === undefined
                            ? '—'
                            : typeof val === 'object'
                            ? JSON.stringify(val)
                            : String(val)
                        return (
                          <td
                            key={col.name}
                            style={{
                              fontFamily:
                                col.type === 'float' || col.type === 'integer'
                                  ? 'ui-monospace, SFMono-Regular, Menlo, monospace'
                                  : 'inherit',
                              fontSize: '0.82rem',
                              whiteSpace: 'nowrap',
                              maxWidth: '260px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                            title={displayVal}
                          >
                            {displayVal}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <div style={{ fontSize: '0.84rem', color: '#475569', fontWeight: 600 }}>
              Page {previewData.pagination?.page || 1} • Showing{' '}
              {previewData.pagination?.returned_rows || 0} rows
              {previewData.pagination?.total_rows != null &&
                ` / Total ${previewData.pagination.total_rows.toLocaleString()} rows`}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn-secondary"
                disabled={previewPage <= 1 || isPreviewLoading}
                onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
              >
                <ChevronLeft size={15} />
                <span>Previous</span>
              </button>

              <button
                type="button"
                className="btn-secondary"
                disabled={!previewData.pagination?.has_more || isPreviewLoading}
                onClick={() => setPreviewPage((p) => p + 1)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
              >
                <span>Next</span>
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}

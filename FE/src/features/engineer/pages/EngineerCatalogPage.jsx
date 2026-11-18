import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import {
  FileSpreadsheet,
  Search,
  GitBranch,
  Upload,
  RefreshCw,
  AlertCircle,
  Eye,
  Workflow,
  Info,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import {
  formatBytes,
  resolveEffectiveVersionTag,
  resolveEffectiveApprovalNote,
} from '../utils/engineerHelpers'
import DatasetDetailModal, { DatasetStatusBadge } from '../components/DatasetDetailModal'

const PAGE_SIZE = 8
const STATUS_OPTIONS = ['ALL', 'PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED']

export default function EngineerCatalogPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const {
    datasets,
    isLoadingCatalog,
    catalogError,
    versionLineageMap,
    recordCountsMap,
    fetchCatalogAndHealth,
    openPreviewForDataset,
    openPipelineStudioForDataset,
    startNewVersionIteration,
  } = useOutletContext()

  const initialStatus = searchParams.get('status') || 'ALL'
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState(initialStatus)
  const [currentPage, setCurrentPage] = useState(1)
  const [detailModalItem, setDetailModalItem] = useState(null)

  useEffect(() => {
    const paramStatus = searchParams.get('status')
    if (paramStatus && STATUS_OPTIONS.includes(paramStatus)) {
      setStatusFilter(paramStatus)
      setCurrentPage(1)
    }
  }, [searchParams])

  const handleStatusChange = (nextStatus) => {
    setStatusFilter(nextStatus)
    setCurrentPage(1)
    if (nextStatus === 'ALL') {
      searchParams.delete('status')
    } else {
      searchParams.set('status', nextStatus)
    }
    setSearchParams(searchParams, { replace: true })
  }

  const filteredDatasets = datasets.filter((item) => {
    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'PENDING'
        ? item.approval_status === 'PENDING' || item.approval_status === 'SUBMITTED'
        : item.approval_status === statusFilter)
    const q = searchQuery.trim().toLowerCase()
    const effectiveTag = resolveEffectiveVersionTag(item, versionLineageMap).toLowerCase()
    const matchesQuery =
      !q ||
      item.name?.toLowerCase().includes(q) ||
      item.code?.toLowerCase().includes(q) ||
      item.location_name?.toLowerCase().includes(q) ||
      item.source?.toLowerCase().includes(q) ||
      item.original_filename?.toLowerCase().includes(q) ||
      effectiveTag.includes(q)
    return matchesStatus && matchesQuery
  })

  const totalPages = Math.max(1, Math.ceil(filteredDatasets.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const paginatedDatasets = filteredDatasets.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  )

  return (
    <section className="adm-panel">
      <div className="adm-panel__header">
        <div className="adm-panel__title-group">
          <div className="adm-panel__icon adm-tone--blue">
            <FileSpreadsheet size={18} />
          </div>
          <div>
            <h2 className="adm-panel__title">Dataset Catalog & Version Governance</h2>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.55rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="adm-btn adm-btn--ghost adm-btn--sm"
            onClick={fetchCatalogAndHealth}
            disabled={isLoadingCatalog}
            aria-label="Refresh catalog"
            title="Refresh catalog"
          >
            <RefreshCw size={14} className={isLoadingCatalog ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            className="adm-btn adm-btn--ghost adm-btn--sm"
            disabled={datasets.length === 0}
            onClick={() => startNewVersionIteration(datasets[0])}
          >
            <GitBranch size={14} />
            <span>New Version</span>
          </button>
          <button
            type="button"
            className="adm-btn adm-btn--primary"
            onClick={() => navigate('/engineer/upload')}
          >
            <Upload size={15} />
            <span>Upload Dataset</span>
          </button>
        </div>
      </div>

      <div className="adm-panel__body">
        {/* Toolbar: Search + Status Pills */}
        <div className="adm-toolbar">
          <div className="adm-search-box" style={{ maxWidth: '340px' }}>
            <Search size={15} className="adm-search-box__icon" />
            <input
              type="text"
              className="adm-input adm-input--search"
              placeholder="Search name, code, corridor, or file..."
              aria-label="Search datasets"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setCurrentPage(1)
              }}
            />
          </div>

          <div className="adm-filter-pills" role="group" aria-label="Filter by approval status">
            {STATUS_OPTIONS.map((status) => (
              <button
                key={status}
                type="button"
                className={`adm-filter-pill ${statusFilter === status ? 'active' : ''}`}
                onClick={() => handleStatusChange(status)}
              >
                {status === 'ALL'
                  ? 'All'
                  : status.charAt(0) + status.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {catalogError && (
          <div className="eng-alert eng-alert--error">
            <div className="eng-alert__content">
              <AlertCircle size={17} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>{catalogError}</span>
            </div>
            <div className="eng-alert__actions">
              <button
                type="button"
                className="adm-btn adm-btn--ghost adm-btn--sm"
                onClick={fetchCatalogAndHealth}
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {isLoadingCatalog ? (
          <div style={{ display: 'grid', gap: '0.75rem', padding: '0.5rem 0' }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="eng-skeleton" style={{ height: '42px' }} />
            ))}
          </div>
        ) : filteredDatasets.length === 0 ? (
          <div className="adm-empty">
            <div className="adm-empty__icon">
              <FileSpreadsheet size={24} />
            </div>
            <div className="adm-empty__title">No matching datasets</div>
            <p className="adm-empty__desc">
              {datasets.length === 0
                ? 'Upload your first traffic trajectory dataset to populate the catalog.'
                : 'Try adjusting your search term or status filter.'}
            </p>
            {(searchQuery || statusFilter !== 'ALL') && (
              <button
                type="button"
                className="adm-btn adm-btn--ghost adm-btn--sm"
                style={{ marginTop: '0.85rem' }}
                onClick={() => {
                  setSearchQuery('')
                  handleStatusChange('ALL')
                }}
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Dataset</th>
                    <th>Source & Corridor</th>
                    <th>Version & File</th>
                    <th>Status</th>
                    <th>Captured</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedDatasets.map((item) => {
                    const effectiveVersion = resolveEffectiveVersionTag(item, versionLineageMap)
                    const reviewNote = resolveEffectiveApprovalNote(item)

                    return (
                      <tr key={item.dataset_id}>
                        <td style={{ maxWidth: '250px' }}>
                          <div
                            className="eng-truncate"
                            title={item.name}
                            style={{ fontWeight: 700, color: '#0f172a' }}
                          >
                            {item.name}
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              marginTop: '0.2rem',
                            }}
                          >
                            <span className="adm-code-tag">{item.code}</span>
                            <span
                              className="eng-truncate"
                              title={item.original_filename}
                              style={{ fontSize: '0.74rem', color: '#64748b' }}
                            >
                              {item.original_filename || '—'}
                            </span>
                          </div>
                        </td>

                        <td style={{ maxWidth: '185px' }}>
                          <div
                            className="eng-truncate"
                            title={item.source}
                            style={{ fontWeight: 600, color: '#1e293b' }}
                          >
                            {item.source || '—'}
                          </div>
                          <div
                            className="eng-truncate"
                            title={item.location_name}
                            style={{ fontSize: '0.75rem', color: '#64748b' }}
                          >
                            {item.location_name || '—'}
                          </div>
                        </td>

                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                            <span className="adm-code-tag">{effectiveVersion}</span>
                            <span style={{ fontSize: '0.76rem', color: '#475569', fontWeight: 600 }}>
                              {item.file_format || 'CSV'}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '0.2rem' }}>
                            {formatBytes(item.file_size_bytes)}
                          </div>
                        </td>

                        <td style={{ maxWidth: '210px' }}>
                          <DatasetStatusBadge status={item.approval_status} />
                          {reviewNote && (
                            <div
                              className="eng-truncate"
                              title={reviewNote}
                              style={{ fontSize: '0.73rem', color: '#64748b', marginTop: '0.25rem' }}
                            >
                              {reviewNote}
                            </div>
                          )}
                        </td>

                        <td style={{ whiteSpace: 'nowrap', color: '#475569', fontSize: '0.8rem' }}>
                          {item.capture_date || '—'}
                        </td>

                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                            <button
                              type="button"
                              className="adm-btn adm-btn--ghost adm-btn--sm"
                              title="Open in Pipeline Studio"
                              aria-label={`Open ${item.name} in Pipeline Studio`}
                              onClick={() => openPipelineStudioForDataset(item.dataset_id, 1)}
                            >
                              <Workflow size={14} />
                            </button>
                            <button
                              type="button"
                              className="adm-btn adm-btn--ghost adm-btn--sm"
                              title="Preview Data"
                              aria-label={`Preview ${item.name}`}
                              onClick={() => openPreviewForDataset(item.dataset_id)}
                            >
                              <Eye size={14} />
                            </button>
                            <button
                              type="button"
                              className="adm-btn adm-btn--ghost adm-btn--sm"
                              title="Inspect Metadata"
                              aria-label={`Inspect metadata for ${item.name}`}
                              onClick={() => setDetailModalItem(item)}
                            >
                              <Info size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
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
                }}
              >
                <span>
                  Page <strong style={{ color: '#0f172a' }}>{safePage}</strong> of{' '}
                  <strong style={{ color: '#0f172a' }}>{totalPages}</strong> ({filteredDatasets.length}{' '}
                  items)
                </span>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button
                    type="button"
                    className="adm-btn adm-btn--ghost adm-btn--sm"
                    disabled={safePage <= 1}
                    aria-label="Previous page"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft size={15} />
                    <span>Prev</span>
                  </button>
                  <button
                    type="button"
                    className="adm-btn adm-btn--ghost adm-btn--sm"
                    disabled={safePage >= totalPages}
                    aria-label="Next page"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  >
                    <span>Next</span>
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <DatasetDetailModal
        item={detailModalItem}
        versionLineageMap={versionLineageMap}
        recordCountsMap={recordCountsMap}
        onClose={() => setDetailModalItem(null)}
        onStartNewVersion={startNewVersionIteration}
        onPreviewDataset={openPreviewForDataset}
        onOpenPipelineStudio={openPipelineStudioForDataset}
        onResubmitted={fetchCatalogAndHealth}
      />
    </section>
  )
}

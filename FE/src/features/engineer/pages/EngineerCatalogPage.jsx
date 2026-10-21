import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import {
  FileSpreadsheet,
  Search,
  GitBranch,
  Upload,
  RefreshCw,
  AlertCircle,
  MessageSquareWarning,
  Eye,
  Info,
} from 'lucide-react'
import {
  formatBytes,
  resolveEffectiveVersionTag,
  resolveEffectiveRecordCount,
  resolveEffectiveApprovalNote,
} from '../utils/engineerHelpers'
import DatasetDetailModal, { DatasetStatusBadge } from '../components/DatasetDetailModal'

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
    startNewVersionIteration,
  } = useOutletContext()

  const initialStatus = searchParams.get('status') || 'ALL'
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState(initialStatus)
  const [detailModalItem, setDetailModalItem] = useState(null)

  useEffect(() => {
    const paramStatus = searchParams.get('status')
    if (paramStatus && ['ALL', 'PENDING', 'APPROVED', 'REJECTED'].includes(paramStatus)) {
      setStatusFilter(paramStatus)
    }
  }, [searchParams])

  const handleStatusChange = (nextStatus) => {
    setStatusFilter(nextStatus)
    if (nextStatus === 'ALL') {
      searchParams.delete('status')
    } else {
      searchParams.set('status', nextStatus)
    }
    setSearchParams(searchParams, { replace: true })
  }

  const rejectedCount = datasets.filter((d) => d.approval_status === 'REJECTED').length

  const filteredDatasets = datasets.filter((item) => {
    const matchesStatus = statusFilter === 'ALL' || item.approval_status === statusFilter
    const q = searchQuery.trim().toLowerCase()
    const effectiveTag = resolveEffectiveVersionTag(item, versionLineageMap).toLowerCase()
    const matchesQuery =
      !q ||
      item.name?.toLowerCase().includes(q) ||
      item.code?.toLowerCase().includes(q) ||
      item.location_name?.toLowerCase().includes(q) ||
      item.original_filename?.toLowerCase().includes(q) ||
      effectiveTag.includes(q)
    return matchesStatus && matchesQuery
  })

  return (
    <>
      {rejectedCount > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
            padding: '0.9rem 1.15rem',
            background: '#fff1f2',
            border: '1px solid #fecdd3',
            borderRadius: '12px',
            color: '#9f1239',
            marginBottom: '1.25rem',
            fontSize: '0.86rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 600 }}>
            <MessageSquareWarning size={18} color="#e11d48" />
            <span>
              {rejectedCount} dataset version(s) were rejected during Admin review. Click{' '}
              <strong>Info</strong> or <strong>New Version</strong> on the rejected item to upload a
              cleaned iteration (<code>v1.1-cleaned</code>).
            </span>
          </div>
          <button
            type="button"
            className="btn-action btn-action--danger"
            style={{ fontSize: '0.78rem', padding: '0.38rem 0.8rem' }}
            onClick={() => handleStatusChange('REJECTED')}
          >
            Filter Rejected ({rejectedCount})
          </button>
        </div>
      )}

      <div className="admin-card">
        <div className="admin-card__header">
          <div className="admin-card__header-left">
            <div className="admin-card__icon-box admin-card__icon-box--blue">
              <FileSpreadsheet size={18} />
            </div>
            <h3 className="admin-card__title">Traffic Dataset Catalog</h3>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Search
                size={15}
                style={{
                  position: 'absolute',
                  left: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#64748b',
                }}
              />
              <input
                type="text"
                className="admin-input"
                placeholder="Search name, code, version..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: '2.2rem', minWidth: '220px' }}
              />
            </div>

            <select
              className="admin-select"
              value={statusFilter}
              onChange={(e) => handleStatusChange(e.target.value)}
              style={{ minWidth: '160px' }}
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">Pending Review</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>

            <button
              type="button"
              className="btn-secondary"
              onClick={fetchCatalogAndHealth}
              title="Refresh catalog"
            >
              <RefreshCw size={15} className={isLoadingCatalog ? 'animate-spin' : ''} />
            </button>

            <button
              type="button"
              className="btn-action"
              style={{
                background: '#f3e8ff',
                color: '#7c3aed',
                border: '1px solid #d8b4fe',
                fontWeight: 700,
              }}
              onClick={() => startNewVersionIteration(datasets[0])}
            >
              <GitBranch size={15} />
              <span>New Version Iteration</span>
            </button>

            <button
              type="button"
              className="btn-action btn-action--primary"
              onClick={() => navigate('/engineer/upload')}
            >
              <Upload size={15} />
              <span>Upload New</span>
            </button>
          </div>
        </div>

        {isLoadingCatalog ? (
          <div className="empty-state">
            <RefreshCw
              size={26}
              className="animate-spin"
              style={{ margin: '0 auto 0.75rem', color: '#2563eb' }}
            />
            <p>Loading dataset catalog...</p>
          </div>
        ) : catalogError ? (
          <div className="empty-state">
            <AlertCircle size={26} style={{ margin: '0 auto 0.75rem', color: '#dc2626' }} />
            <p>{catalogError}</p>
          </div>
        ) : filteredDatasets.length === 0 ? (
          <div className="vivid-empty-box">
            <div
              className="vivid-empty-box__icon"
              style={{
                background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
                color: '#1d4ed8',
                border: '1px solid #93c5fd',
              }}
            >
              <Upload size={26} />
            </div>
            <h4
              style={{
                margin: '0.2rem 0 0',
                fontSize: '0.98rem',
                fontWeight: 700,
                color: '#0f172a',
              }}
            >
              No matching datasets found
            </h4>
            <button
              type="button"
              className="btn-action btn-action--primary"
              style={{ marginTop: '0.5rem' }}
              onClick={() => navigate('/engineer/upload')}
            >
              <Upload size={15} />
              <span>Upload Dataset</span>
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Dataset & Original File</th>
                  <th>Source & Location</th>
                  <th>Version & Lineage</th>
                  <th>Format & Records</th>
                  <th>Status & Review Feedback</th>
                  <th>Uploaded At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDatasets.map((item) => {
                  const effectiveTag = resolveEffectiveVersionTag(item, versionLineageMap)
                  const lineage = versionLineageMap[item.dataset_id]
                  const recordCount = resolveEffectiveRecordCount(item, recordCountsMap)
                  const reviewNote = resolveEffectiveApprovalNote(item)

                  return (
                    <tr key={item.version_id || item.dataset_id}>
                      <td>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{item.name}</div>
                        <div
                          style={{
                            fontSize: '0.76rem',
                            color: '#64748b',
                            marginTop: '0.15rem',
                          }}
                        >
                          <code>{item.code}</code> • {item.original_filename}
                        </div>
                      </td>
                      <td>
                        <div
                          style={{
                            fontWeight: 600,
                            color: '#1e293b',
                            fontSize: '0.84rem',
                          }}
                        >
                          {item.location_name}
                        </div>
                        <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
                          {item.source}
                          {item.capture_date ? ` • Captured: ${item.capture_date}` : ''}
                        </div>
                      </td>
                      <td>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            flexWrap: 'wrap',
                          }}
                        >
                          <code
                            style={{
                              background: lineage ? '#f3e8ff' : '#eff6ff',
                              color: lineage ? '#7c3aed' : '#1d4ed8',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '6px',
                              border: lineage ? '1px solid #d8b4fe' : '1px solid #bfdbfe',
                              fontWeight: 700,
                              fontSize: '0.78rem',
                            }}
                          >
                            {effectiveTag}
                          </code>
                          {lineage && (
                            <span
                              style={{
                                fontSize: '0.72rem',
                                color: '#6d28d9',
                                fontWeight: 600,
                              }}
                              title={`Upgraded from ${lineage.parentDatasetName}`}
                            >
                              ↑ from v1.0
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div>
                          <span style={{ fontWeight: 700, color: '#334155' }}>
                            {item.file_format}
                          </span>
                          <span
                            style={{
                              color: '#64748b',
                              fontSize: '0.8rem',
                              marginLeft: '0.35rem',
                            }}
                          >
                            ({formatBytes(item.file_size_bytes)})
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: '0.75rem',
                            color: '#059669',
                            fontWeight: 600,
                            marginTop: '0.12rem',
                          }}
                        >
                          {recordCount != null
                            ? `${Number(recordCount).toLocaleString()} records`
                            : 'Click Preview to count'}
                        </div>
                      </td>
                      <td style={{ maxWidth: '240px' }}>
                        <div>
                          <DatasetStatusBadge status={item.approval_status} />
                        </div>
                        <div
                          style={{
                            fontSize: '0.74rem',
                            color:
                              item.approval_status === 'REJECTED'
                                ? '#b91c1c'
                                : item.approval_status === 'APPROVED'
                                ? '#15803d'
                                : '#64748b',
                            marginTop: '0.25rem',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={reviewNote}
                        >
                          {reviewNote}
                        </div>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: '#475569' }}>
                        {new Date(item.created_at).toLocaleString('en-US')}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn-action btn-action--primary"
                            style={{ padding: '0.38rem 0.68rem', fontSize: '0.76rem' }}
                            onClick={() => openPreviewForDataset(item.dataset_id)}
                            title="Inspect Schema & Preview Data"
                          >
                            <Eye size={13} />
                            <span>Preview</span>
                          </button>

                          <button
                            type="button"
                            className="btn-action"
                            style={{
                              padding: '0.38rem 0.65rem',
                              fontSize: '0.76rem',
                              background: '#f3e8ff',
                              color: '#7c3aed',
                              border: '1px solid #d8b4fe',
                              fontWeight: 600,
                            }}
                            onClick={() => startNewVersionIteration(item)}
                            title="Upload a new version iteration (v1.1 / v2.0)"
                          >
                            <GitBranch size={13} />
                            <span>New Version</span>
                          </button>

                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ padding: '0.38rem 0.6rem', fontSize: '0.76rem' }}
                            onClick={() => setDetailModalItem(item)}
                            title="View Metadata & Admin Review Note"
                          >
                            <Info size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DatasetDetailModal
        item={detailModalItem}
        versionLineageMap={versionLineageMap}
        recordCountsMap={recordCountsMap}
        onClose={() => setDetailModalItem(null)}
        onStartNewVersion={startNewVersionIteration}
        onPreviewDataset={openPreviewForDataset}
      />
    </>
  )
}

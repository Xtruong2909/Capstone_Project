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
  Workflow,
  MapPin,
  Database,
  HardDrive,
  Calendar,
  MessageSquare,
  CheckCircle2,
  Compass,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import {
  formatBytes,
  resolveEffectiveVersionTag,
  resolveEffectiveApprovalNote,
} from '../utils/engineerHelpers'
import DatasetDetailModal, { DatasetStatusBadge } from '../components/DatasetDetailModal'

const PAGE_SIZE = 5

const headerCellStyle = {
  borderRight: '1px solid #cbd5e1',
  borderBottom: '2px solid #cbd5e1',
  background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
  color: '#0f172a',
  fontWeight: 800,
  fontSize: '0.73rem',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  padding: '0.75rem 0.65rem',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const bodyCellStyle = {
  borderRight: '1px solid #e2e8f0',
  borderBottom: '1px solid #e2e8f0',
  padding: '0.72rem 0.65rem',
  verticalAlign: 'middle',
  overflow: 'hidden',
}

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
  const [currentPage, setCurrentPage] = useState(1)
  const [detailModalItem, setDetailModalItem] = useState(null)

  useEffect(() => {
    const paramStatus = searchParams.get('status')
    if (paramStatus && ['ALL', 'PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED'].includes(paramStatus)) {
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

  const rejectedCount = datasets.filter((d) => d.approval_status === 'REJECTED').length

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
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      {rejectedCount > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.6rem',
            padding: '0.65rem 1rem',
            background: '#fff1f2',
            border: '1px solid #fecdd3',
            borderRadius: '12px',
            color: '#9f1239',
            marginBottom: '0.85rem',
            fontSize: '0.82rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
            <MessageSquareWarning size={16} color="#e11d48" />
            <span>
              {rejectedCount} dataset version(s) rejected. Click <strong>New Version</strong> to upload a cleaned iteration.
            </span>
          </div>
          <button
            type="button"
            className="btn-action btn-action--danger"
            style={{ fontSize: '0.76rem', padding: '0.32rem 0.75rem' }}
            onClick={() => handleStatusChange('REJECTED')}
          >
            Filter Rejected ({rejectedCount})
          </button>
        </div>
      )}

      {/* Separated, No-Scroll Full-Fit Table Container */}
      <div
        className="admin-card"
        style={{
          marginBottom: 0,
          width: '100%',
          border: '1px solid #cbd5e1',
          borderRadius: '14px',
          boxShadow: '0 8px 24px -6px rgba(15, 23, 42, 0.07), 0 2px 8px -2px rgba(15, 23, 42, 0.04)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          className="admin-card__header"
          style={{
            padding: '0.9rem 1.25rem',
            borderBottom: '1px solid #cbd5e1',
          }}
        >
          <div className="admin-card__header-left">
            <div className="admin-card__icon-box admin-card__icon-box--blue" style={{ width: '36px', height: '36px' }}>
              <FileSpreadsheet size={18} />
            </div>
            <div>
              <h3 className="admin-card__title" style={{ fontSize: '1.02rem' }}>
                Traffic Dataset Catalog ({filteredDatasets.length})
              </h3>
              <p
                style={{
                  margin: '0.1rem 0 0',
                  fontSize: '0.76rem',
                  color: '#64748b',
                }}
              >
                Manage uploaded trajectory datasets, versions, format metrics, and Administrator review status.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: '0.7rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#64748b',
                }}
              />
              <input
                type="text"
                className="admin-input"
                placeholder="Search dataset, location, version..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setCurrentPage(1)
                }}
                style={{ paddingLeft: '2.1rem', width: '215px', fontSize: '0.8rem', height: '36px' }}
              />
            </div>

            <select
              className="admin-select"
              value={statusFilter}
              onChange={(e) => handleStatusChange(e.target.value)}
              style={{ minWidth: '150px', fontSize: '0.8rem', height: '36px', padding: '0 0.65rem' }}
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">Pending / Submitted</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>

            <button
              type="button"
              className="btn-secondary"
              onClick={fetchCatalogAndHealth}
              title="Refresh catalog"
              style={{ height: '36px', padding: '0 0.7rem' }}
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
                height: '36px',
                padding: '0 0.85rem',
                fontSize: '0.78rem',
              }}
              onClick={() => startNewVersionIteration(datasets[0])}
            >
              <GitBranch size={14} />
              <span>New Version</span>
            </button>

            <button
              type="button"
              className="btn-action btn-action--primary"
              style={{ height: '36px', padding: '0 0.9rem', fontSize: '0.78rem' }}
              onClick={() => navigate('/engineer/upload')}
            >
              <Upload size={14} />
              <span>Upload New</span>
            </button>
          </div>
        </div>

        {isLoadingCatalog ? (
          <div className="empty-state" style={{ padding: '3rem 1.5rem' }}>
            <RefreshCw
              size={26}
              className="animate-spin"
              style={{ margin: '0 auto 0.6rem', color: '#2563eb' }}
            />
            <p style={{ fontSize: '0.9rem' }}>Loading dataset catalog...</p>
          </div>
        ) : catalogError ? (
          <div className="empty-state" style={{ padding: '3rem 1.5rem' }}>
            <AlertCircle size={26} style={{ margin: '0 auto 0.6rem', color: '#dc2626' }} />
            <p style={{ fontSize: '0.9rem' }}>{catalogError}</p>
          </div>
        ) : filteredDatasets.length === 0 ? (
          <div className="vivid-empty-box" style={{ padding: '2.25rem 1.5rem' }}>
            <div
              className="vivid-empty-box__icon"
              style={{
                background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
                color: '#1d4ed8',
                border: '1px solid #93c5fd',
              }}
            >
              <Upload size={24} />
            </div>
            <h4
              style={{
                margin: '0.2rem 0 0',
                fontSize: '0.96rem',
                fontWeight: 700,
                color: '#0f172a',
              }}
            >
              No matching datasets found
            </h4>
            <button
              type="button"
              className="btn-action btn-action--primary"
              style={{ marginTop: '0.4rem' }}
              onClick={() => navigate('/engineer/upload')}
            >
              <Upload size={14} />
              <span>Upload Dataset</span>
            </button>
          </div>
        ) : (
          <>
            <table
              className="admin-table"
              style={{
                tableLayout: 'fixed',
                borderCollapse: 'separate',
                borderSpacing: 0,
                width: '100%',
              }}
            >
              <colgroup>
                <col style={{ width: '15%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '17%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '14%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={headerCellStyle}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Database size={13} color="#2563eb" />
                      <span>Dataset</span>
                    </div>
                  </th>
                  <th style={headerCellStyle}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Compass size={13} color="#4f46e5" />
                      <span>Source</span>
                    </div>
                  </th>
                  <th style={headerCellStyle}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <MapPin size={13} color="#0d9488" />
                      <span>Location</span>
                    </div>
                  </th>
                  <th style={headerCellStyle}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <GitBranch size={13} color="#7c3aed" />
                      <span>Version</span>
                    </div>
                  </th>
                  <th style={headerCellStyle}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <HardDrive size={13} color="#0284c7" />
                      <span>Format & Size</span>
                    </div>
                  </th>
                  <th style={{ ...headerCellStyle, textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <CheckCircle2 size={13} color="#d97706" />
                      <span>Status</span>
                    </div>
                  </th>
                  <th style={headerCellStyle}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <MessageSquare size={13} color="#64748b" />
                      <span>Review Feedback</span>
                    </div>
                  </th>
                  <th style={headerCellStyle}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Calendar size={13} color="#475569" />
                      <span>Uploaded At</span>
                    </div>
                  </th>
                  <th style={{ ...headerCellStyle, borderRight: 'none', textAlign: 'center' }}>
                    <span>Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedDatasets.map((item) => {
                  const effectiveTag = resolveEffectiveVersionTag(item, versionLineageMap)
                  const lineage = versionLineageMap[item.dataset_id]
                  const reviewNote = resolveEffectiveApprovalNote(item)
                  const createdDate = item.created_at ? new Date(item.created_at) : null
                  const isParquet = (item.file_format || '').toUpperCase() === 'PARQUET'

                  return (
                    <tr key={item.version_id || item.dataset_id}>
                      {/* 1. Dataset Name & Original Filename */}
                      <td style={bodyCellStyle}>
                        <div
                          style={{
                            fontWeight: 800,
                            color: '#0f172a',
                            fontSize: '0.86rem',
                            lineHeight: 1.3,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={item.name}
                        >
                          {item.name}
                        </div>
                        <div
                          style={{
                            display: 'block',
                            maxWidth: '100%',
                            marginTop: '0.26rem',
                            padding: '0.14rem 0.45rem',
                            background: '#f8fafc',
                            border: '1px solid #cbd5e1',
                            borderRadius: '5px',
                            fontSize: '0.71rem',
                            color: '#475569',
                            fontFamily: 'monospace',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={item.original_filename}
                        >
                          {item.original_filename}
                        </div>
                      </td>

                      {/* 2. Source */}
                      <td style={bodyCellStyle}>
                        <span
                          style={{
                            display: 'inline-block',
                            maxWidth: '100%',
                            padding: '0.22rem 0.52rem',
                            background: '#eef2ff',
                            color: '#4338ca',
                            border: '1px solid #c7d2fe',
                            borderRadius: '6px',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={item.source}
                        >
                          {item.source || 'UAV Sensor'}
                        </span>
                        {item.capture_date && (
                          <div
                            style={{
                              fontSize: '0.7rem',
                              color: '#64748b',
                              marginTop: '0.2rem',
                              fontWeight: 500,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {item.capture_date}
                          </div>
                        )}
                      </td>

                      {/* 3. Location */}
                      <td style={bodyCellStyle}>
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            maxWidth: '100%',
                            padding: '0.24rem 0.55rem',
                            background: '#f0fdfa',
                            color: '#0f766e',
                            border: '1px solid #99f6e4',
                            borderRadius: '6px',
                            fontWeight: 700,
                            fontSize: '0.76rem',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={item.location_name}
                        >
                          <MapPin size={12} style={{ flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.location_name || '—'}
                          </span>
                        </div>
                      </td>

                      {/* 4. Version */}
                      <td style={bodyCellStyle}>
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            gap: '0.2rem',
                          }}
                        >
                          <code
                            style={{
                              background: lineage ? '#f3e8ff' : '#eff6ff',
                              color: lineage ? '#7c3aed' : '#1d4ed8',
                              padding: '0.22rem 0.52rem',
                              borderRadius: '6px',
                              border: lineage ? '1px solid #d8b4fe' : '1px solid #bfdbfe',
                              fontWeight: 800,
                              fontSize: '0.78rem',
                            }}
                          >
                            {effectiveTag}
                          </code>
                          {lineage && (
                            <span
                              style={{
                                fontSize: '0.68rem',
                                color: '#6d28d9',
                                fontWeight: 700,
                              }}
                              title={`Upgraded from ${lineage.parentDatasetName}`}
                            >
                              ↑ v1.0
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 5. Format & Size */}
                      <td style={bodyCellStyle}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.2rem' }}>
                          <span
                            style={{
                              padding: '0.18rem 0.48rem',
                              borderRadius: '5px',
                              fontSize: '0.73rem',
                              fontWeight: 800,
                              background: isParquet ? '#eff6ff' : '#f1f5f9',
                              color: isParquet ? '#1d4ed8' : '#334155',
                              border: isParquet ? '1px solid #bfdbfe' : '1px solid #cbd5e1',
                            }}
                          >
                            {item.file_format}
                          </span>
                          <span
                            style={{
                              fontSize: '0.74rem',
                              fontWeight: 600,
                              color: '#475569',
                            }}
                          >
                            {formatBytes(item.file_size_bytes)}
                          </span>
                        </div>
                      </td>

                      {/* 6. Status */}
                      <td style={{ ...bodyCellStyle, textAlign: 'center' }}>
                        <DatasetStatusBadge status={item.approval_status} />
                      </td>

                      {/* 7. Review Feedback */}
                      <td style={{ ...bodyCellStyle, verticalAlign: 'middle' }}>
                        <div
                          style={{
                            padding: '0.42rem 0.65rem',
                            borderRadius: '7px',
                            background:
                              item.approval_status === 'REJECTED'
                                ? '#fef2f2'
                                : item.approval_status === 'APPROVED'
                                ? '#f0fdf4'
                                : item.approval_status === 'SUBMITTED'
                                ? '#eff6ff'
                                : '#f8fafc',
                            borderLeft:
                              item.approval_status === 'REJECTED'
                                ? '3px solid #ef4444'
                                : item.approval_status === 'APPROVED'
                                ? '3px solid #10b981'
                                : item.approval_status === 'SUBMITTED'
                                ? '3px solid #3b82f6'
                                : '3px solid #cbd5e1',
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            color:
                              item.approval_status === 'REJECTED'
                                ? '#991b1b'
                                : item.approval_status === 'APPROVED'
                                ? '#166534'
                                : item.approval_status === 'SUBMITTED'
                                ? '#1e40af'
                                : '#475569',
                            lineHeight: 1.45,
                            wordBreak: 'break-word',
                            overflowWrap: 'break-word',
                            whiteSpace: 'normal',
                            maxHeight: '110px',
                            overflowY: 'auto',
                            scrollbarWidth: 'thin',
                            scrollbarColor: '#cbd5e1 transparent',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                          onClick={() => setDetailModalItem(item)}
                          title={`${reviewNote || 'No feedback note available'}\n(Click to inspect details)`}
                        >
                          {reviewNote || '—'}
                        </div>
                      </td>

                      {/* 8. Uploaded At */}
                      <td style={{ ...bodyCellStyle, whiteSpace: 'nowrap' }}>
                        {createdDate ? (
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.76rem', color: '#0f172a' }}>
                              {createdDate.toLocaleDateString('en-US', {
                                month: 'short',
                                day: '2-digit',
                                year: 'numeric',
                              })}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.12rem' }}>
                              {createdDate.toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>

                      {/* 9. Actions */}
                      <td style={{ ...bodyCellStyle, borderRight: 'none', padding: '0.55rem 0.65rem' }}>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                            gap: '0.35rem',
                            width: '100%',
                            maxWidth: '178px',
                            margin: '0 auto',
                          }}
                        >
                          <button
                            type="button"
                            className="btn-action"
                            style={{
                              width: '100%',
                              height: '28px',
                              padding: '0 0.4rem',
                              fontSize: '0.72rem',
                              background: '#eff6ff',
                              color: '#1d4ed8',
                              border: '1px solid #bfdbfe',
                              fontWeight: 700,
                              whiteSpace: 'nowrap',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.26rem',
                            }}
                            onClick={() =>
                              navigate(
                                `/engineer/pipeline-studio?datasetId=${encodeURIComponent(
                                  item.dataset_id
                                )}`
                              )
                            }
                            title="Open in Pipeline Studio"
                          >
                            <Workflow size={12} style={{ flexShrink: 0 }} />
                            <span>Studio</span>
                          </button>

                          <button
                            type="button"
                            className="btn-action btn-action--primary"
                            style={{
                              width: '100%',
                              height: '28px',
                              padding: '0 0.4rem',
                              fontSize: '0.72rem',
                              whiteSpace: 'nowrap',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.26rem',
                            }}
                            onClick={() => openPreviewForDataset(item.dataset_id)}
                            title="Inspect Schema & Preview Data"
                          >
                            <Eye size={12} style={{ flexShrink: 0 }} />
                            <span>Preview</span>
                          </button>

                          <button
                            type="button"
                            className="btn-action"
                            style={{
                              gridColumn: '1 / -1',
                              width: '100%',
                              height: '28px',
                              padding: '0 0.5rem',
                              fontSize: '0.72rem',
                              background: '#f3e8ff',
                              color: '#7c3aed',
                              border: '1px solid #d8b4fe',
                              fontWeight: 700,
                              whiteSpace: 'nowrap',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.3rem',
                            }}
                            onClick={() => startNewVersionIteration(item)}
                            title="Upload a new version iteration (v1.1 / v2.0)"
                          >
                            <GitBranch size={12} style={{ flexShrink: 0 }} />
                            <span>New Version</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Compact Pagination Footer when > PAGE_SIZE items */}
            {totalPages > 1 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.65rem 1.25rem',
                  background: '#f8fafc',
                  borderTop: '1px solid #e2e8f0',
                  fontSize: '0.78rem',
                  color: '#475569',
                }}
              >
                <span>
                  Showing <strong>{(safePage - 1) * PAGE_SIZE + 1}</strong>–
                  <strong>{Math.min(safePage * PAGE_SIZE, filteredDatasets.length)}</strong> of{' '}
                  <strong>{filteredDatasets.length}</strong> datasets
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={safePage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    style={{ padding: '0.28rem 0.6rem', fontSize: '0.75rem' }}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span style={{ fontWeight: 700, color: '#0f172a', padding: '0 0.35rem' }}>
                    Page {safePage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={safePage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    style={{ padding: '0.28rem 0.6rem', fontSize: '0.75rem' }}
                  >
                    <ChevronRight size={14} />
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
        onOpenPipelineStudio={(id) =>
          navigate(`/engineer/pipeline-studio?datasetId=${encodeURIComponent(id)}`)
        }
      />
    </div>
  )
}

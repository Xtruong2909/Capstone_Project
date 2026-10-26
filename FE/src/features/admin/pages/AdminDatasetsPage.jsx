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
  XCircle,
  Layers,
  Clock,
  Search,
  FileCheck,
  MessageSquare,
  Sparkles,
  Check,
  RotateCcw,
} from 'lucide-react'
import { adminService } from '../../../services/adminService'

const APPROVAL_NOTE_PRESETS = [
  'Meets pNEUMA UAV trajectory schema and data quality standards.',
  'Normalized Parquet structure verified; approved for AI/ML experiments.',
  'Data quality and coordinate bounds validated successfully.',
]

const REJECTION_NOTE_PRESETS = [
  'Contains unaddressed kinematic outliers or invalid speed/acceleration values.',
  'Column mapping to the 10 standard pNEUMA fields is incomplete or inaccurate.',
  'High missing value rate in critical trajectory columns (lat, lon, time).',
]

export default function AdminDatasetsPage() {
  const [datasets, setDatasets] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionLoading, setActionLoading] = useState(null)
  const [feedbackBanner, setFeedbackBanner] = useState(null)

  // Search State
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
    inlineNote: '',
  })

  // Dedicated Review Decision Modal State
  const [reviewModal, setReviewModal] = useState({
    isOpen: false,
    item: null,
    decision: 'APPROVED', // 'APPROVED' | 'REJECTED'
    note: APPROVAL_NOTE_PRESETS[0],
    error: null,
  })

  const fetchDatasets = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await adminService.getDatasets({ limit: 100 })
      setDatasets(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load dataset versions for review.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDatasets()
  }, [fetchDatasets])

  // Helper to check if a dataset version is awaiting review
  const isAwaitingReview = (status) => {
    const normalized = (status || '').toUpperCase()
    return normalized === 'SUBMITTED' || normalized === 'PENDING'
  }

  // Computed KPI Counts & Filtered List (only versions awaiting review)
  const reviewQueue = useMemo(() => {
    return datasets.filter((d) => isAwaitingReview(d.approval_status))
  }, [datasets])

  const stats = useMemo(() => {
    const awaiting = reviewQueue.length
    const totalRecords = reviewQueue.reduce((acc, d) => acc + (Number(d.total_records) || 0), 0)
    return { awaiting, totalRecords }
  }, [reviewQueue])

  const filteredDatasets = useMemo(() => {
    return reviewQueue.filter((item) => {
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        const matchName = (item.dataset_name || '').toLowerCase().includes(q)
        const matchTag = (item.version_tag || '').toLowerCase().includes(q)
        const matchFormat = (item.file_format || '').toLowerCase().includes(q)
        return matchName || matchTag || matchFormat
      }
      return true
    })
  }, [reviewQueue, searchQuery])

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
        console.error('Failed to load version preview:', err)
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
    setPreviewState({
      isOpen: true,
      item,
      isLoading: true,
      data: null,
      representation: 'normalized',
      page: 1,
      pageSize: 20,
      error: null,
      inlineNote: APPROVAL_NOTE_PRESETS[0],
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

  // ---- Review Modal Handlers ----
  const handleOpenReviewModal = (item, initialDecision = 'APPROVED') => {
    setReviewModal({
      isOpen: true,
      item,
      decision: initialDecision,
      note:
        initialDecision === 'APPROVED'
          ? APPROVAL_NOTE_PRESETS[0]
          : REJECTION_NOTE_PRESETS[0],
      error: null,
    })
  }

  const handleCloseReviewModal = () => {
    if (actionLoading) return
    setReviewModal((prev) => ({ ...prev, isOpen: false, item: null, error: null }))
  }

  const executeReviewDecision = async (item, status, noteText) => {
    if (!item) return
    const versionId = item.id
    const datasetId = item.dataset_id
    const finalNote =
      (noteText || '').trim() ||
      (status === 'APPROVED'
        ? APPROVAL_NOTE_PRESETS[0]
        : REJECTION_NOTE_PRESETS[0])

    setActionLoading(versionId)
    setReviewModal((prev) => ({ ...prev, error: null }))

    try {
      await adminService.reviewDataset(datasetId, versionId, {
        status,
        note: finalNote,
      })

      // Lưu trạng thái vào bộ nhớ đệm (nếu APPROVED sẽ xuất hiện bên trang Dataset Available)
      adminService.recordDatasetReviewInCache(item, status, finalNote)

      // Loại bỏ ngay khỏi bảng Dataset Versions for Review khi đã được Approve hoặc Reject
      setDatasets((prev) => prev.filter((d) => d.id !== versionId))

      // Đóng modal preview nếu đang mở phiên bản vừa duyệt
      if (previewState.isOpen && previewState.item?.id === versionId) {
        handleClosePreview()
      }

      // Close review modal & show success banner
      setReviewModal({
        isOpen: false,
        item: null,
        decision: 'APPROVED',
        note: APPROVAL_NOTE_PRESETS[0],
        error: null,
      })

      setFeedbackBanner({
        type: status === 'APPROVED' ? 'success' : 'warning',
        message: `Dataset "${item.dataset_name}" (${item.version_tag}) has been ${
          status === 'APPROVED' ? 'APPROVED' : 'REJECTED'
        } successfully.`,
      })
    } catch (err) {
      const errMsg =
        err.response?.data?.detail || 'Dataset review action failed. Please try again.'
      if (reviewModal.isOpen) {
        setReviewModal((prev) => ({ ...prev, error: errMsg }))
      } else {
        alert(errMsg)
      }
    } finally {
      setActionLoading(null)
    }
  }

  const getStatusBadge = (status) => {
    const normalized = (status || '').toUpperCase()
    switch (normalized) {
      case 'APPROVED':
        return (
          <span
            className="badge badge--approved"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <CheckCircle2 size={12} />
            <span>Approved</span>
          </span>
        )
      case 'REJECTED':
        return (
          <span
            className="badge badge--rejected"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <XCircle size={12} />
            <span>Rejected</span>
          </span>
        )
      case 'SUBMITTED':
        return (
          <span
            className="badge badge--pending"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              background: '#fef3c7',
              color: '#b45309',
              border: '1px solid #fde68a',
              fontWeight: 700,
            }}
          >
            <Clock size={12} />
            <span>Awaiting Review</span>
          </span>
        )
      case 'PENDING':
      default:
        return (
          <span
            className="badge badge--pending"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <Clock size={12} />
            <span>Pending</span>
          </span>
        )
    }
  }

  return (
    <div>
      {/* 1. KPI Summary Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
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
            borderLeft: '4px solid #f59e0b',
          }}
        >
          <div className="admin-card__icon-box admin-card__icon-box--amber">
            <Clock size={20} />
          </div>
          <div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
              {stats.awaiting}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, marginTop: '0.15rem' }}>
              Awaiting Approval
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
            <Database size={20} />
          </div>
          <div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
              {stats.totalRecords.toLocaleString()}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, marginTop: '0.15rem' }}>
              Total Trajectory Points in Queue
            </div>
          </div>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedbackBanner && (
        <div
          style={{
            marginBottom: '1.25rem',
            padding: '0.85rem 1.15rem',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            background: feedbackBanner.type === 'success' ? '#f0fdf4' : '#fffbeb',
            border:
              feedbackBanner.type === 'success'
                ? '1px solid #86efac'
                : '1px solid #fde68a',
            color: feedbackBanner.type === 'success' ? '#166534' : '#92400e',
            fontWeight: 600,
            fontSize: '0.86rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            {feedbackBanner.type === 'success' ? (
              <CheckCircle2 size={18} color="#16a34a" />
            ) : (
              <AlertCircle size={18} color="#d97706" />
            )}
            <span>{feedbackBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'inherit',
              padding: '0.2rem',
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* 2. Main Dataset Versions Review Card */}
      <div className="admin-card">
        <div
          className="admin-card__header"
          style={{ flexWrap: 'wrap', gap: '0.85rem' }}
        >
          <div className="admin-card__header-left">
            <div className="admin-card__icon-box admin-card__icon-box--blue">
              <FileCheck size={18} />
            </div>
            <div>
              <h3 className="admin-card__title">
                Dataset Versions for Review ({filteredDatasets.length})
              </h3>
              <p className="admin-card__subtitle" style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                Inspect standardized pNEUMA versions submitted by Data Engineers and approve or reject them.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
            {/* Search Input */}
            <div style={{ position: 'relative', minWidth: '220px' }}>
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
                placeholder="Search dataset or version..."
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
              onClick={fetchDatasets}
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
            <p>Loading dataset versions...</p>
          </div>
        ) : error ? (
          <div className="empty-state">
            <AlertCircle size={24} style={{ margin: '0 auto 0.75rem', color: '#dc2626' }} />
            <p>{error}</p>
          </div>
        ) : filteredDatasets.length === 0 ? (
          <div className="empty-state">
            <Database size={28} style={{ margin: '0 auto 0.75rem', color: '#94a3b8' }} />
            <p>No dataset versions match your current filter.</p>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              When a Data Engineer exports and submits a standardized version, it will appear here for approval.
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
                  <th>Submitted At</th>
                  <th>Inspection & Review</th>
                </tr>
              </thead>
              <tbody>
                {filteredDatasets.map((item) => {
                  const canReview = isAwaitingReview(item.approval_status)
                  const isRowLoading = actionLoading === item.id

                  return (
                    <tr key={item.id}>
                      <td>
                        <strong style={{ color: '#0f172a', fontSize: '0.9rem' }}>
                          {item.dataset_name}
                        </strong>
                        {item.approval_note && (
                          <div
                            style={{
                              fontSize: '0.74rem',
                              color: '#64748b',
                              marginTop: '0.2rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                            }}
                          >
                            <MessageSquare size={11} />
                            <span>{item.approval_note}</span>
                          </div>
                        )}
                      </td>
                      <td>
                        <code
                          style={{
                            background: '#f1f5f9',
                            color: '#0f172a',
                            border: '1px solid #e2e8f0',
                            padding: '0.22rem 0.5rem',
                            borderRadius: '6px',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                          }}
                        >
                          {item.version_tag}
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
                          {item.file_format}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600, color: '#1e293b' }}>
                        {item.total_records != null
                          ? Number(item.total_records).toLocaleString()
                          : 'N/A'}
                      </td>
                      <td>{getStatusBadge(item.approval_status)}</td>
                      <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                        {item.submitted_at
                          ? new Date(item.submitted_at).toLocaleString('en-US')
                          : item.created_at
                          ? new Date(item.created_at).toLocaleString('en-US')
                          : '—'}
                      </td>
                      <td>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            flexWrap: 'wrap',
                          }}
                        >
                          {/* Preview Button */}
                          <button
                            type="button"
                            className="btn-action"
                            style={{
                              background: '#eff6ff',
                              color: '#1d4ed8',
                              border: '1px solid #bfdbfe',
                              padding: '0.38rem 0.7rem',
                              fontSize: '0.76rem',
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.32rem',
                            }}
                            onClick={() => handleOpenPreview(item)}
                            title="Inspect dataset rows (Normalized or Raw)"
                          >
                            <Eye size={13} />
                            <span>Preview</span>
                          </button>

                          <button
                            type="button"
                            className="btn-action btn-action--success"
                            style={{
                              padding: '0.38rem 0.75rem',
                              fontSize: '0.76rem',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                            }}
                            disabled={isRowLoading}
                            onClick={() => handleOpenReviewModal(item, 'APPROVED')}
                          >
                            <CheckCircle2 size={13} />
                            <span>Approve</span>
                          </button>
                          <button
                            type="button"
                            className="btn-action btn-action--danger"
                            style={{
                              padding: '0.38rem 0.75rem',
                              fontSize: '0.76rem',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                            }}
                            disabled={isRowLoading}
                            onClick={() => handleOpenReviewModal(item, 'REJECTED')}
                          >
                            <XCircle size={13} />
                            <span>Reject</span>
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

      {/* =========================================================================
          3. DEDICATED REVIEW DECISION MODAL (APPROVE / REJECT WITH NOTES)
         ========================================================================= */}
      {reviewModal.isOpen && reviewModal.item && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseReviewModal()
          }}
        >
          <div className="modal-dialog" style={{ maxWidth: '560px', width: '94%' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div
                  className="admin-card__icon-box"
                  style={{
                    background:
                      reviewModal.decision === 'APPROVED' ? '#dcfce7' : '#fee2e2',
                    color:
                      reviewModal.decision === 'APPROVED' ? '#15803d' : '#dc2626',
                  }}
                >
                  {reviewModal.decision === 'APPROVED' ? (
                    <CheckCircle2 size={20} />
                  ) : (
                    <XCircle size={20} />
                  )}
                </div>
                <div>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: '1.05rem',
                      fontWeight: 700,
                      color: '#0f172a',
                    }}
                  >
                    {reviewModal.decision === 'APPROVED'
                      ? 'Approve Dataset Version'
                      : 'Reject Dataset Version'}
                  </h3>
                  <div
                    style={{
                      fontSize: '0.76rem',
                      color: '#64748b',
                      marginTop: '0.12rem',
                    }}
                  >
                    {reviewModal.item.dataset_name} ({reviewModal.item.version_tag})
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={handleCloseReviewModal}
              >
                <X size={20} />
              </button>
            </div>

            <div className="modal-body" style={{ padding: '1.25rem 1.5rem' }}>
              {reviewModal.error && (
                <div
                  style={{
                    padding: '0.75rem 1rem',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '8px',
                    color: '#dc2626',
                    fontSize: '0.82rem',
                    marginBottom: '1rem',
                  }}
                >
                  {reviewModal.error}
                </div>
              )}

              {/* Dataset Metadata Summary */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '0.75rem',
                  padding: '0.85rem 1rem',
                  background: '#f8fafc',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  marginBottom: '1.15rem',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>
                    VERSION TAG
                  </div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', marginTop: '0.15rem' }}>
                    {reviewModal.item.version_tag}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>
                    FILE FORMAT
                  </div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1d4ed8', marginTop: '0.15rem' }}>
                    {reviewModal.item.file_format}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>
                    TOTAL RECORDS
                  </div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', marginTop: '0.15rem' }}>
                    {Number(reviewModal.item.total_records || 0).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Quick Note Templates */}
              <div style={{ marginBottom: '0.9rem' }}>
                <div
                  style={{
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    color: '#475569',
                    marginBottom: '0.4rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                  }}
                >
                  <Sparkles size={13} color="#2563eb" />
                  <span>Quick Review Note Templates:</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {(reviewModal.decision === 'APPROVED'
                    ? APPROVAL_NOTE_PRESETS
                    : REJECTION_NOTE_PRESETS
                  ).map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() =>
                        setReviewModal((prev) => ({ ...prev, note: preset }))
                      }
                      style={{
                        textAlign: 'left',
                        padding: '0.42rem 0.7rem',
                        borderRadius: '6px',
                        border:
                          reviewModal.note === preset
                            ? '1.5px solid #2563eb'
                            : '1px solid #e2e8f0',
                        background:
                          reviewModal.note === preset ? '#eff6ff' : '#f8fafc',
                        color:
                          reviewModal.note === preset ? '#1d4ed8' : '#334155',
                        fontSize: '0.76rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Review Note Textarea */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    color: '#0f172a',
                    marginBottom: '0.35rem',
                  }}
                >
                  Administrator Review Note
                </label>
                <textarea
                  rows={3}
                  className="admin-input"
                  value={reviewModal.note}
                  onChange={(e) =>
                    setReviewModal((prev) => ({ ...prev, note: e.target.value }))
                  }
                  placeholder="Enter feedback or approval note for the Data Engineer..."
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '8px',
                    fontSize: '0.84rem',
                    resize: 'vertical',
                  }}
                />
              </div>
            </div>

            <div
              className="modal-actions"
              style={{
                padding: '1rem 1.5rem',
                borderTop: '1px solid #f1f5f9',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.6rem',
              }}
            >
              <button
                type="button"
                className="btn-secondary"
                onClick={handleCloseReviewModal}
                disabled={actionLoading === reviewModal.item.id}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn-action ${
                  reviewModal.decision === 'APPROVED'
                    ? 'btn-action--success'
                    : 'btn-action--danger'
                }`}
                style={{
                  padding: '0.55rem 1.25rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
                disabled={actionLoading === reviewModal.item.id}
                onClick={() =>
                  executeReviewDecision(
                    reviewModal.item,
                    reviewModal.decision,
                    reviewModal.note
                  )
                }
              >
                {actionLoading === reviewModal.item.id ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : reviewModal.decision === 'APPROVED' ? (
                  <>
                    <Check size={15} />
                    <span>Confirm Approval</span>
                  </>
                ) : (
                  <>
                    <XCircle size={15} />
                    <span>Confirm Rejection</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          4. DATASET VERSION PREVIEW & INLINE REVIEW MODAL
         ========================================================================= */}
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
                <div className="admin-card__icon-box admin-card__icon-box--blue">
                  <Layers size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
                    {previewState.item.dataset_name}{' '}
                    <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>
                      ({previewState.item.version_tag})
                    </span>
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
                    Status: <strong>{previewState.item.approval_status}</strong> • Format:{' '}
                    <strong>{previewState.item.file_format}</strong> • Records:{' '}
                    <strong>
                      {Number(previewState.item.total_records || 0).toLocaleString()}
                    </strong>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {/* Representation Switcher: raw vs normalized */}
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
              style={{ maxHeight: '60vh', overflowY: 'auto', padding: '1.25rem' }}
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

            {/* Embedded Review Action Bar inside Preview Modal */}
            <div
              className="modal-actions"
              style={{
                padding: '1rem 1.25rem',
                borderTop: '1px solid #e2e8f0',
                background: '#f8fafc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.75rem',
              }}
            >
              <button
                type="button"
                className="btn-secondary"
                onClick={handleClosePreview}
              >
                Close Preview
              </button>

              {isAwaitingReview(previewState.item.approval_status) && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    flex: '1 1 420px',
                    justifyContent: 'flex-end',
                    flexWrap: 'wrap',
                  }}
                >
                  <input
                    type="text"
                    className="admin-input"
                    value={previewState.inlineNote}
                    onChange={(e) =>
                      setPreviewState((prev) => ({
                        ...prev,
                        inlineNote: e.target.value,
                      }))
                    }
                    placeholder="Optional review note..."
                    style={{
                      flex: '1 1 220px',
                      maxWidth: '340px',
                      padding: '0.48rem 0.75rem',
                      fontSize: '0.8rem',
                      borderRadius: '8px',
                    }}
                  />
                  <button
                    type="button"
                    className="btn-action btn-action--danger"
                    style={{
                      padding: '0.5rem 0.95rem',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                    disabled={actionLoading === previewState.item.id}
                    onClick={() =>
                      executeReviewDecision(
                        previewState.item,
                        'REJECTED',
                        previewState.inlineNote || REJECTION_NOTE_PRESETS[0]
                      )
                    }
                  >
                    <XCircle size={14} />
                    <span>Reject Version</span>
                  </button>
                  <button
                    type="button"
                    className="btn-action btn-action--success"
                    style={{
                      padding: '0.5rem 0.95rem',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                    disabled={actionLoading === previewState.item.id}
                    onClick={() =>
                      executeReviewDecision(
                        previewState.item,
                        'APPROVED',
                        previewState.inlineNote || APPROVAL_NOTE_PRESETS[0]
                      )
                    }
                  >
                    <CheckCircle2 size={14} />
                    <span>Approve Version</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

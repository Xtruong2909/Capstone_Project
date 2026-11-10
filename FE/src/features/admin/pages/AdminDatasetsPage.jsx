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
  ShieldCheck,
} from 'lucide-react'
import { adminService } from '../../../services/adminService'
import { useLanguage } from '../../../hooks/useLanguage'

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
  const { t, language } = useLanguage()
  const [datasets, setDatasets] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionLoading, setActionLoading] = useState(null)
  const [feedbackBanner, setFeedbackBanner] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Preview Modal State
  const [previewState, setPreviewState] = useState({
    isOpen: false,
    item: null,
    isLoading: false,
    data: null,
    representation: 'normalized',
    page: 1,
    pageSize: 20,
    error: null,
    inlineNote: '',
  })

  // Dedicated Review Decision Modal State
  const [reviewModal, setReviewModal] = useState({
    isOpen: false,
    item: null,
    decision: 'APPROVED',
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

  const isAwaitingReview = (status) => {
    const normalized = (status || '').toUpperCase()
    return normalized === 'SUBMITTED' || normalized === 'PENDING'
  }

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

  // Preview Modal Handlers
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

  // Review Modal Handlers
  const handleOpenReviewModal = (item, initialDecision = 'APPROVED') => {
    setReviewModal({
      isOpen: true,
      item,
      decision: initialDecision,
      note:
        initialDecision === 'APPROVED' ? APPROVAL_NOTE_PRESETS[0] : REJECTION_NOTE_PRESETS[0],
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
      (status === 'APPROVED' ? APPROVAL_NOTE_PRESETS[0] : REJECTION_NOTE_PRESETS[0])

    setActionLoading(versionId)
    setReviewModal((prev) => ({ ...prev, error: null }))

    try {
      await adminService.reviewDataset(datasetId, versionId, {
        status,
        note: finalNote,
      })

      adminService.recordDatasetReviewInCache(item, status, finalNote)
      setDatasets((prev) => prev.filter((d) => d.id !== versionId))

      if (previewState.isOpen && previewState.item?.id === versionId) {
        handleClosePreview()
      }

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
          <span className="adm-badge adm-badge--emerald">
            <CheckCircle2 size={12} />
            <span>{t('Approved')}</span>
          </span>
        )
      case 'REJECTED':
        return (
          <span className="adm-badge adm-badge--rose">
            <XCircle size={12} />
            <span>{t('Rejected')}</span>
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
            <span>{t('Awaiting Review')}</span>
          </span>
        )
      case 'PENDING':
      default:
        return (
          <span className="adm-badge adm-badge--amber">
            <Clock size={12} />
            <span>{t('Pending')}</span>
          </span>
        )
    }
  }

  return (
    <div>
      {/* 1. 3-Column Bento KPI Strip */}
      <div className="adm-bento-grid">
        <div className="adm-panel adm-col-4">
          <div className="adm-panel__body" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div className="adm-panel__icon adm-tone--amber">
              <Clock size={20} />
            </div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, marginTop: '0.15rem' }}>
              {t('Awaiting Approval')}
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
                {new Set(reviewQueue.map((d) => d.dataset_id || d.dataset_name).filter(Boolean)).size}
              </div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', marginTop: '0.2rem' }}>
                Pending UAV Datasets
              </div>
            </div>
          </div>
        </div>

        <div className="adm-panel adm-col-4">
          <div className="adm-panel__body" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div className="adm-panel__icon adm-tone--purple">
              <Layers size={20} />
            </div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, marginTop: '0.15rem' }}>
              {t('Total Trajectory Points in Queue')}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Feedback Banner */}
      {feedbackBanner && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            padding: '0.9rem 1.25rem',
            marginBottom: '1.25rem',
            borderRadius: '14px',
            fontSize: '0.86rem',
            fontWeight: 700,
            background: feedbackBanner.type === 'success' ? '#ecfdf5' : '#fff1f2',
            color: feedbackBanner.type === 'success' ? '#047857' : '#be123c',
            border:
              feedbackBanner.type === 'success' ? '1px solid #a7f3d0' : '1px solid #fecdd3',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {feedbackBanner.type === 'success' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
            <span>{feedbackBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* 3. Toolbar */}
      <div className="adm-toolbar">
        <div className="adm-search-box">
          <Search size={16} className="adm-search-box__icon" />
          <input
            type="text"
            placeholder="Search dataset name, version tag (v1.0), or format..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="adm-input adm-input--search"
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <button
            type="button"
            className="adm-btn adm-btn--ghost"
            onClick={() => {
              adminService.clearReviewCache()
              setFeedbackBanner(null)
              fetchDatasets()
            }}
            title="Restore sample datasets to review queue"
          >
            <RotateCcw size={15} />
            <span>Reset Demo Queue</span>
          </button>

          <button type="button" className="adm-btn adm-btn--primary" onClick={fetchDatasets}>
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
            <span>Refresh Queue</span>
          </button>
        </div>
      </div>

      {/* 4. Quality Gate Table */}
      <div className="adm-panel">
        <div className="adm-panel__header">
          <div className="adm-panel__title-group">
            <div className="adm-panel__icon adm-tone--amber">
              <ShieldCheck size={18} />
            </div>
            <div>
              <h3 className="adm-panel__title">
                UAV Trajectory Versions Awaiting Decision ({filteredDatasets.length})
              </h3>
              <p className="adm-panel__subtitle">
                Inspect normalized 10-field pNEUMA schema records before authorizing ML training access
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
                placeholder={t('Search dataset or version...')}
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
              <span>{t('Refresh')}</span>
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
            <p>{t('Loading dataset versions...')}</p>
          </div>
        ) : error ? (
          <div className="empty-state">
            <AlertCircle size={24} style={{ margin: '0 auto 0.75rem', color: '#dc2626' }} />
            <p>{t(error)}</p>
          </div>
        ) : filteredDatasets.length === 0 ? (
          <div className="empty-state">
            <Database size={28} style={{ margin: '0 auto 0.75rem', color: '#94a3b8' }} />
            <p>{t('No dataset versions match your current filter.')}</p>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              {t('When a Data Engineer exports and submits a standardized version, it will appear here for approval.')}
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
                  <th>{t('Submitted At')}</th>
                  <th>{t('Inspection & Review')}</th>
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
                          ? new Date(item.submitted_at).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US')
                          : item.created_at
                          ? new Date(item.created_at).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US')
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
                            <span>{t('Preview')}</span>
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
                            <span>{t('Approve')}</span>
                          </button>
                          <button
                            type="button"
                            className="btn-action btn-action--danger"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.45rem',
                            }}
                          >
                            <XCircle size={13} />
                            <span>{t('Reject')}</span>
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

      {/* 5. Review Decision Modal */}
      {reviewModal.isOpen && reviewModal.item && (
        <div
          className="adm-modal-backdrop"
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
                      ? t('Approve Dataset Version')
                      : t('Reject Dataset Version')}
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
                className="adm-modal__close"
                onClick={handleCloseReviewModal}
              >
                <X size={18} />
              </button>
            </div>

            <div className="adm-modal__body">
              {reviewModal.error && (
                <div
                  style={{
                    padding: '0.75rem 1rem',
                    background: '#fff1f2',
                    border: '1px solid #fecdd3',
                    borderRadius: '10px',
                    color: '#be123c',
                    fontSize: '0.84rem',
                    marginBottom: '1rem',
                    fontWeight: 600,
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
                    {t('VERSION TAG')}
                  </div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', marginTop: '0.15rem' }}>
                    {reviewModal.item.version_tag}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>
                    {t('FILE FORMAT')}
                  </div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1d4ed8', marginTop: '0.15rem' }}>
                    {reviewModal.item.file_format}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>
                    {t('TOTAL RECORDS')}
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
                  <span>{t('Quick Review Note Templates:')}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {(reviewModal.decision === 'APPROVED'
                    ? APPROVAL_NOTE_PRESETS
                    : REJECTION_NOTE_PRESETS
                  ).map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setReviewModal((prev) => ({ ...prev, note: preset }))}
                      style={{
                        textAlign: 'left',
                        padding: '0.55rem 0.85rem',
                        borderRadius: '10px',
                        fontSize: '0.78rem',
                        border:
                          reviewModal.note === preset
                            ? '1.5px solid #2563eb'
                            : '1px solid #cbd5e1',
                        background: reviewModal.note === preset ? '#eff6ff' : '#f8fafc',
                        color: reviewModal.note === preset ? '#1d4ed8' : '#334155',
                        fontWeight: reviewModal.note === preset ? 700 : 500,
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
                  {t('Administrator Review Note')}
                </label>
                <textarea
                  rows={3}
                  value={reviewModal.note}
                  onChange={(e) =>
                    setReviewModal((prev) => ({ ...prev, note: e.target.value }))
                  }
                  placeholder={t('Enter feedback or approval note for the Data Engineer...')}
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

            <div className="adm-modal__footer">
              <button
                type="button"
                className="adm-btn adm-btn--ghost"
                onClick={handleCloseReviewModal}
              >
                {t('Cancel')}
              </button>
              <button
                type="button"
                disabled={actionLoading === reviewModal.item.id}
                className={`adm-btn ${
                  reviewModal.decision === 'APPROVED' ? 'adm-btn--emerald' : 'adm-btn--danger'
                }`}
                onClick={() =>
                  executeReviewDecision(reviewModal.item, reviewModal.decision, reviewModal.note)
                }
              >
                {actionLoading === reviewModal.item.id ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>{t('Processing...')}</span>
                  </>
                ) : reviewModal.decision === 'APPROVED' ? (
                  <>
                    <Check size={15} />
                    <span>{t('Confirm Approval')}</span>
                  </>
                ) : (
                  <>
                    <XCircle size={15} />
                    <span>{t('Confirm Rejection')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Dataset Preview Modal */}
      {previewState.isOpen && (
        <div
          className="adm-modal-backdrop"
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
                    {t('Status:')} <strong>{t(previewState.item.approval_status)}</strong> • {t('Format')}:{' '}
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
                    {t('Normalized (pNEUMA)')}
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
                    {t('Raw Source')}
                  </button>
                </div>
              </div>
              <button type="button" className="adm-modal__close" onClick={handleClosePreview}>
                <X size={18} />
              </button>
            </div>

            {/* Representation Toggle & Quick Decision Bar */}
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
                  <p>{t(`Loading ${previewState.representation} preview data...`)}</p>
                </div>
              ) : previewState.error ? (
                <div className="empty-state" style={{ padding: '2.5rem 1rem' }}>
                  <AlertCircle
                    size={26}
                    style={{ margin: '0 auto 0.75rem', color: '#dc2626' }}
                  />
                  <p style={{ color: '#dc2626' }}>{t(previewState.error)}</p>
                </div>
              ) : !previewState.data ||
                !previewState.data.rows ||
                previewState.data.rows.length === 0 ? (
                <div className="empty-state" style={{ padding: '2.5rem 1rem' }}>
                  <Database
                    size={26}
                    style={{ margin: '0 auto 0.75rem', color: '#94a3b8' }}
                  />
                  <p>{t('No preview rows available for this representation.')}</p>
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
                      {t('Showing page')} <strong>{previewState.page}</strong> •{' '}
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
              <button
                type="button"
                className="btn-secondary"
                onClick={handleClosePreview}
              >
                {t('Close Preview')}
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

              {previewState.item && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, maxWidth: '560px' }}>
                  <MessageSquare size={15} style={{ color: '#64748b', flexShrink: 0 }} />
                  <input
                    type="text"
                    value={previewState.inlineNote}
                    onChange={(e) =>
                      setPreviewState((prev) => ({ ...prev, inlineNote: e.target.value }))
                    }
                    placeholder="Audit note..."
                    className="adm-input"
                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem' }}
                  />
                  <button
                    type="button"
                    disabled={actionLoading === previewState.item.id}
                    className="adm-btn adm-btn--emerald adm-btn--sm"
                    onClick={() =>
                      executeReviewDecision(
                        previewState.item,
                        'APPROVED',
                        previewState.inlineNote || APPROVAL_NOTE_PRESETS[0]
                      )
                    }
                  >
                    <XCircle size={14} />
                    <span>{t('Reject Version')}</span>
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading === previewState.item.id}
                    className="adm-btn adm-btn--danger adm-btn--sm"
                    onClick={() =>
                      executeReviewDecision(
                        previewState.item,
                        'REJECTED',
                        previewState.inlineNote || REJECTION_NOTE_PRESETS[0]
                      )
                    }
                  >
                    <CheckCircle2 size={14} />
                    <span>{t('Approve Version')}</span>
                  </button>
                </div>
              )}
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

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
            <span>Approved</span>
          </span>
        )
      case 'REJECTED':
        return (
          <span className="adm-badge adm-badge--rose">
            <XCircle size={12} />
            <span>Rejected</span>
          </span>
        )
      case 'SUBMITTED':
      case 'PENDING':
      default:
        return (
          <span className="adm-badge adm-badge--amber">
            <Clock size={12} />
            <span>Awaiting Gate</span>
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
            <div>
              <div style={{ fontSize: '1.55rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
                {stats.awaiting}
              </div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', marginTop: '0.2rem' }}>
                Awaiting Quality Gate
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
            <div>
              <div style={{ fontSize: '1.55rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
                {stats.totalRecords.toLocaleString()}
              </div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', marginTop: '0.2rem' }}>
                Trajectory Rows to Inspect
              </div>
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
        </div>

        <div className="adm-panel__body--flush">
          {isLoading ? (
            <div className="adm-empty">
              <div className="adm-empty__icon adm-tone--blue">
                <RefreshCw size={24} className="animate-spin" />
              </div>
              <h4 className="adm-empty__title">Loading Quality Gate Queue...</h4>
            </div>
          ) : error ? (
            <div className="adm-empty">
              <div className="adm-empty__icon adm-tone--rose">
                <AlertCircle size={24} />
              </div>
              <h4 className="adm-empty__title">Error Loading Datasets</h4>
              <p className="adm-empty__desc">{error}</p>
            </div>
          ) : filteredDatasets.length === 0 ? (
            <div className="adm-empty">
              <div className="adm-empty__icon adm-tone--emerald">
                <FileCheck size={24} />
              </div>
              <h4 className="adm-empty__title">No Dataset Versions Pending Review</h4>
              <p className="adm-empty__desc">
                All submitted pNEUMA trajectory versions have been processed.
              </p>
            </div>
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Dataset Name</th>
                    <th>Version</th>
                    <th>Format</th>
                    <th>Trajectory Rows</th>
                    <th>Gate Status</th>
                    <th>Review Note</th>
                    <th>Submitted</th>
                    <th style={{ textAlign: 'right' }}>Quality Gate Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDatasets.map((item) => {
                    const isProcessing = actionLoading === item.id
                    return (
                      <tr key={item.id}>
                        <td>
                          <div style={{ fontWeight: 800, color: '#0f172a' }}>
                            {item.dataset_name}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                            ID: {String(item.dataset_id || '').slice(0, 12)}
                          </div>
                        </td>
                        <td>
                          <span className="adm-code-tag">{item.version_tag}</span>
                        </td>
                        <td>
                          <span className="adm-badge adm-badge--blue">{item.file_format}</span>
                        </td>
                        <td style={{ fontWeight: 700 }}>
                          {(item.total_records || 0).toLocaleString()}
                        </td>
                        <td>{getStatusBadge(item.approval_status)}</td>
                        <td style={{ maxWidth: '220px' }}>
                          {item.approval_note ? (
                            <span style={{ fontSize: '0.78rem', color: '#334155' }}>
                              {item.approval_note}
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                              Pending inspection
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.78rem', color: '#64748b' }}>
                          {item.created_at
                            ? new Date(item.created_at).toLocaleDateString('en-US')
                            : '—'}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.45rem',
                            }}
                          >
                            <button
                              type="button"
                              className="adm-btn adm-btn--ghost adm-btn--sm"
                              onClick={() => handleOpenPreview(item)}
                            >
                              <Eye size={13} />
                              <span>Inspect</span>
                            </button>

                            <button
                              type="button"
                              disabled={isProcessing}
                              className="adm-btn adm-btn--emerald adm-btn--sm"
                              onClick={() => handleOpenReviewModal(item, 'APPROVED')}
                            >
                              <CheckCircle2 size={13} />
                              <span>Approve</span>
                            </button>

                            <button
                              type="button"
                              disabled={isProcessing}
                              className="adm-btn adm-btn--danger adm-btn--sm"
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
      </div>

      {/* 5. Review Decision Modal */}
      {reviewModal.isOpen && reviewModal.item && (
        <div
          className="adm-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseReviewModal()
          }}
        >
          <div className="adm-modal" style={{ maxWidth: '560px' }}>
            <div className="adm-modal__header">
              <div>
                <h3 className="adm-modal__title">
                  {reviewModal.decision === 'APPROVED'
                    ? 'Approve Dataset Version'
                    : 'Reject Dataset Version'}
                </h3>
                <div style={{ fontSize: '0.78rem', color: '#cbd5e1', marginTop: '0.2rem' }}>
                  {reviewModal.item.dataset_name} ({reviewModal.item.version_tag})
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

              {/* Decision Switcher */}
              <div className="adm-field">
                <label className="adm-label">Quality Gate Verdict</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <button
                    type="button"
                    className={`adm-btn ${
                      reviewModal.decision === 'APPROVED' ? 'adm-btn--emerald' : 'adm-btn--ghost'
                    }`}
                    onClick={() =>
                      setReviewModal((prev) => ({
                        ...prev,
                        decision: 'APPROVED',
                        note: APPROVAL_NOTE_PRESETS[0],
                      }))
                    }
                  >
                    <CheckCircle2 size={16} />
                    <span>Approve for ML</span>
                  </button>

                  <button
                    type="button"
                    className={`adm-btn ${
                      reviewModal.decision === 'REJECTED' ? 'adm-btn--danger' : 'adm-btn--ghost'
                    }`}
                    onClick={() =>
                      setReviewModal((prev) => ({
                        ...prev,
                        decision: 'REJECTED',
                        note: REJECTION_NOTE_PRESETS[0],
                      }))
                    }
                  >
                    <XCircle size={16} />
                    <span>Reject & Request Fix</span>
                  </button>
                </div>
              </div>

              {/* Quick Presets */}
              <div className="adm-field">
                <label className="adm-label">
                  <Sparkles size={13} style={{ display: 'inline', marginRight: '0.3rem' }} />
                  Standard Audit Note Templates
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
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

              {/* Custom Note */}
              <div className="adm-field" style={{ marginBottom: 0 }}>
                <label className="adm-label">Official Audit Note</label>
                <textarea
                  rows={3}
                  value={reviewModal.note}
                  onChange={(e) => setReviewModal((prev) => ({ ...prev, note: e.target.value }))}
                  className="adm-textarea"
                  placeholder="Enter detailed quality review feedback..."
                />
              </div>
            </div>

            <div className="adm-modal__footer">
              <button
                type="button"
                className="adm-btn adm-btn--ghost"
                onClick={handleCloseReviewModal}
              >
                Cancel
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
                <Check size={15} />
                <span>
                  {actionLoading === reviewModal.item.id
                    ? 'Submitting...'
                    : `Confirm ${reviewModal.decision}`}
                </span>
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
          <div className="adm-modal adm-modal--xl">
            <div className="adm-modal__header">
              <div>
                <h3 className="adm-modal__title">
                  Trajectory Schema & Record Inspector — {previewState.item?.dataset_name}
                </h3>
                <div style={{ fontSize: '0.78rem', color: '#cbd5e1', marginTop: '0.2rem' }}>
                  Version: {previewState.item?.version_tag} • Format:{' '}
                  {previewState.item?.file_format}
                </div>
              </div>
              <button type="button" className="adm-modal__close" onClick={handleClosePreview}>
                <X size={18} />
              </button>
            </div>

            {/* Representation Toggle & Quick Decision Bar */}
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
                    Approve
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
                    Reject
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

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, FileText, GitBranch, Eye, Workflow, Send, AlertCircle } from 'lucide-react'
import { pipelineService } from '../../../services/pipelineService'
import {
  formatBytes,
  resolveEffectiveVersionTag,
  resolveEffectiveRecordCount,
  resolveEffectiveApprovalNote,
} from '../utils/engineerHelpers'

export function DatasetStatusBadge({ status }) {
  switch ((status || '').toUpperCase()) {
    case 'APPROVED':
      return <span className="adm-badge adm-badge--emerald">Approved</span>
    case 'REJECTED':
      return <span className="adm-badge adm-badge--rose">Rejected</span>
    case 'SUBMITTED':
      return <span className="adm-badge adm-badge--blue">Submitted</span>
    default:
      return <span className="adm-badge adm-badge--amber">Pending</span>
  }
}

export default function DatasetDetailModal({
  item,
  versionLineageMap = {},
  recordCountsMap = {},
  onClose,
  onStartNewVersion,
  onPreviewDataset,
  onOpenPipelineStudio,
  onResubmitted,
}) {
  const navigate = useNavigate()
  const [isResubmitting, setIsResubmitting] = useState(false)
  const [showResubmitForm, setShowResubmitForm] = useState(false)
  const [resubmitNote, setResubmitNote] = useState(
    'Updated mapping and resolved trajectory quality issues'
  )
  const [resubmitError, setResubmitError] = useState(null)
  const [resubmitSuccess, setResubmitSuccess] = useState(false)

  useEffect(() => {
    if (!item) return
    setShowResubmitForm(false)
    setResubmitError(null)
    setResubmitSuccess(false)

    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [item, onClose])

  if (!item) return null

  const effectiveVersion = resolveEffectiveVersionTag(item, versionLineageMap)
  const effectiveRecordCount = resolveEffectiveRecordCount(item, recordCountsMap)
  const reviewNote = resolveEffectiveApprovalNote(item)
  const lineageInfo = versionLineageMap[item.dataset_id]

  const alertVariant =
    item.approval_status === 'REJECTED'
      ? 'eng-alert--error'
      : item.approval_status === 'APPROVED'
        ? 'eng-alert--success'
        : item.approval_status === 'SUBMITTED'
          ? 'eng-alert--info'
          : 'eng-alert--warning'

  const handleResubmit = async (e) => {
    e.preventDefault()
    if (!item?.dataset_id || !item?.version_id) return
    setIsResubmitting(true)
    setResubmitError(null)
    try {
      await pipelineService.resubmitVersionForReview(
        item.dataset_id,
        item.version_id,
        resubmitNote.trim() || 'Resubmitted after review'
      )
      setResubmitSuccess(true)
      setShowResubmitForm(false)
      onResubmitted?.()
    } catch (err) {
      setResubmitError(
        err.response?.data?.detail || 'Resubmission failed. Please check version status.'
      )
    } finally {
      setIsResubmitting(false)
    }
  }

  return (
    <div
      className="adm-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dataset-detail-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div className="adm-modal" style={{ maxWidth: '640px' }}>
        <div className="adm-modal__header">
          <h3 id="dataset-detail-modal-title" className="adm-modal__title">
            Dataset Metadata & Review
          </h3>
          <button
            type="button"
            className="adm-modal__close"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="adm-modal__body">
          {/* Summary Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '1rem',
              padding: '0.85rem 1rem',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              marginBottom: '1rem',
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                className="eng-truncate"
                title={item.name}
                style={{ fontWeight: 700, fontSize: '0.98rem', color: '#0f172a' }}
              >
                {item.name}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.78rem',
                  color: '#64748b',
                  marginTop: '0.25rem',
                  flexWrap: 'wrap',
                }}
              >
                <span className="adm-code-tag">{item.code}</span>
                <span>Version {effectiveVersion}</span>
              </div>
            </div>
            <DatasetStatusBadge status={item.approval_status} />
          </div>

          {/* Review Note */}
          {reviewNote && (
            <div className={`eng-alert ${alertVariant}`} style={{ marginBottom: '1rem' }}>
              <div className="eng-alert__content">
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: '0.2rem' }}>
                    Administrator Review Note
                  </div>
                  <div className="eng-break-all">{reviewNote}</div>
                </div>
              </div>
            </div>
          )}

          {resubmitSuccess && (
            <div className="eng-alert eng-alert--success" style={{ marginBottom: '1rem' }}>
              <span>Version resubmitted for Administrator approval.</span>
            </div>
          )}

          {resubmitError && (
            <div className="eng-alert eng-alert--error" style={{ marginBottom: '1rem' }}>
              <div className="eng-alert__content">
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>{resubmitError}</span>
              </div>
            </div>
          )}

          {/* Inline Resubmit Form */}
          {showResubmitForm && (
            <form
              onSubmit={handleResubmit}
              style={{
                padding: '0.9rem 1rem',
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '12px',
                marginBottom: '1rem',
              }}
            >
              <label htmlFor="resubmit-note-input" className="adm-label">
                Response Note for Administrator
              </label>
              <textarea
                id="resubmit-note-input"
                className="adm-textarea"
                rows={2}
                value={resubmitNote}
                onChange={(e) => setResubmitNote(e.target.value)}
                placeholder="Describe what was fixed..."
                style={{ minHeight: '68px', marginBottom: '0.65rem' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="adm-btn adm-btn--ghost adm-btn--sm"
                  onClick={() => setShowResubmitForm(false)}
                  disabled={isResubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="adm-btn adm-btn--emerald adm-btn--sm"
                  disabled={isResubmitting}
                >
                  <Send size={14} />
                  <span>{isResubmitting ? 'Resubmitting...' : 'Confirm Resubmit'}</span>
                </button>
              </div>
            </form>
          )}

          {/* Lineage */}
          {lineageInfo && (
            <div
              style={{
                padding: '0.75rem 0.95rem',
                background: '#faf5ff',
                border: '1px solid #e9d5ff',
                borderRadius: '10px',
                marginBottom: '1rem',
                fontSize: '0.82rem',
                color: '#581c87',
              }}
            >
              <strong>Version Lineage:</strong> Upgraded from{' '}
              <span className="adm-code-tag">{lineageInfo.parentDatasetName}</span>
              {lineageInfo.changeSummary && (
                <div style={{ marginTop: '0.25rem' }}>
                  <strong>Changelog:</strong> {lineageInfo.changeSummary}
                </div>
              )}
            </div>
          )}

          {/* Metadata Details Grid */}
          <div className="eng-kv-grid" style={{ marginBottom: '1rem' }}>
            <div className="eng-kv-item">
              <span className="eng-kv-item__label">Original File</span>
              <span className="eng-kv-item__value eng-truncate" title={item.original_filename}>
                {item.original_filename || '—'}
              </span>
            </div>
            <div className="eng-kv-item">
              <span className="eng-kv-item__label">Format & Size</span>
              <span className="eng-kv-item__value">
                {item.file_format || '—'} ({formatBytes(item.file_size_bytes)})
              </span>
            </div>
            <div className="eng-kv-item">
              <span className="eng-kv-item__label">Source</span>
              <span className="eng-kv-item__value eng-truncate" title={item.source}>
                {item.source || '—'}
              </span>
            </div>
            <div className="eng-kv-item">
              <span className="eng-kv-item__label">Location / Corridor</span>
              <span className="eng-kv-item__value eng-truncate" title={item.location_name}>
                {item.location_name || '—'}
              </span>
            </div>
            <div className="eng-kv-item">
              <span className="eng-kv-item__label">Capture Date</span>
              <span className="eng-kv-item__value">{item.capture_date || '—'}</span>
            </div>
            <div className="eng-kv-item">
              <span className="eng-kv-item__label">Total Records</span>
              <span className="eng-kv-item__value" style={{ color: '#059669' }}>
                {effectiveRecordCount != null
                  ? Number(effectiveRecordCount).toLocaleString()
                  : 'Open Preview to compute'}
              </span>
            </div>
          </div>

          {item.description && (
            <div
              style={{
                padding: '0.85rem 1rem',
                background: '#f8fafc',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                fontSize: '0.85rem',
                lineHeight: 1.55,
                color: '#334155',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: '#64748b',
                  marginBottom: '0.35rem',
                }}
              >
                <FileText size={13} />
                <span>Description</span>
              </div>
              <div className="eng-break-all">{item.description}</div>
            </div>
          )}
        </div>

        <div className="adm-modal__footer" style={{ flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="adm-btn adm-btn--ghost adm-btn--sm"
              onClick={() => {
                onClose?.()
                onStartNewVersion?.(item)
              }}
            >
              <GitBranch size={14} />
              <span>New Version</span>
            </button>
            {item.approval_status === 'REJECTED' && item.version_id && !showResubmitForm && (
              <button
                type="button"
                className="adm-btn adm-btn--emerald adm-btn--sm"
                onClick={() => setShowResubmitForm(true)}
              >
                <Send size={14} />
                <span>Resubmit</span>
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" className="adm-btn adm-btn--ghost" onClick={onClose}>
              Close
            </button>
            <button
              type="button"
              className="adm-btn adm-btn--ghost"
              onClick={() => {
                const id = item.dataset_id
                onClose?.()
                onPreviewDataset?.(id)
              }}
            >
              <Eye size={15} />
              <span>Preview</span>
            </button>
            <button
              type="button"
              className="adm-btn adm-btn--primary"
              onClick={() => {
                const id = item.dataset_id
                onClose?.()
                if (onOpenPipelineStudio) {
                  onOpenPipelineStudio(id)
                } else {
                  navigate(`/engineer/pipeline-studio?datasetId=${encodeURIComponent(id)}`)
                }
              }}
            >
              <Workflow size={15} />
              <span>Open Pipeline Studio</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

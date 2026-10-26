import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, FileText, GitBranch, Eye, Workflow, Send } from 'lucide-react'
import { pipelineService } from '../../../services/pipelineService'
import {
  formatBytes,
  resolveEffectiveVersionTag,
  resolveEffectiveRecordCount,
  resolveEffectiveApprovalNote,
} from '../utils/engineerHelpers'

export function DatasetStatusBadge({ status }) {
  switch (status) {
    case 'APPROVED':
      return <span className="badge badge--approved">Approved</span>
    case 'REJECTED':
      return <span className="badge badge--rejected">Rejected</span>
    default:
      return <span className="badge badge--pending">Pending</span>
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
}) {
  const navigate = useNavigate()
  if (!item) return null

  const effectiveVersion = resolveEffectiveVersionTag(item, versionLineageMap)
  const effectiveRecordCount = resolveEffectiveRecordCount(item, recordCountsMap)
  const reviewNote = resolveEffectiveApprovalNote(item)
  const lineageInfo = versionLineageMap[item.dataset_id]
  const [isResubmitting, setIsResubmitting] = useState(false)

  const handleResubmit = async () => {
    if (!item?.dataset_id || !item?.version_id) return
    const note = prompt(
      'Enter feedback response or update note for Administrator:',
      'Updated mapping and resolved trajectory quality issues'
    )
    if (note === null) return

    setIsResubmitting(true)
    try {
      await pipelineService.resubmitVersionForReview(item.dataset_id, item.version_id, note)
      alert('Version resubmitted successfully for Administrator approval.')
      onClose()
    } catch (err) {
      alert(err.response?.data?.detail || 'Resubmission failed. Please check version status.')
    } finally {
      setIsResubmitting(false)
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal-dialog" style={{ maxWidth: '580px' }}>
        <div className="modal-header">
          <h3>Dataset Metadata & Review Feedback</h3>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.85rem 1rem',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              marginBottom: '1rem',
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a' }}>
                {item.name}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.15rem' }}>
                Code: <code>{item.code}</code> • Version: <strong>{effectiveVersion}</strong>
              </div>
            </div>
            <DatasetStatusBadge status={item.approval_status} />
          </div>

          {/* Admin Review Note Box */}
          <div
            style={{
              padding: '0.9rem 1rem',
              borderRadius: '10px',
              marginBottom: '1rem',
              background:
                item.approval_status === 'REJECTED'
                  ? '#fef2f2'
                  : item.approval_status === 'APPROVED'
                  ? '#f0fdf4'
                  : '#fffbeb',
              border:
                item.approval_status === 'REJECTED'
                  ? '1px solid #fecaca'
                  : item.approval_status === 'APPROVED'
                  ? '1px solid #bbf7d0'
                  : '1px solid #fde68a',
              color:
                item.approval_status === 'REJECTED'
                  ? '#991b1b'
                  : item.approval_status === 'APPROVED'
                  ? '#166534'
                  : '#92400e',
              fontSize: '0.84rem',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>
              Administrator Review Note:
            </div>
            <div>{reviewNote}</div>
          </div>

          {/* Lineage Info (if upgraded version) */}
          {lineageInfo && (
            <div
              style={{
                padding: '0.8rem 1rem',
                background: '#faf5ff',
                border: '1px solid #e9d5ff',
                borderRadius: '10px',
                marginBottom: '1rem',
                fontSize: '0.82rem',
                color: '#581c87',
              }}
            >
              <strong>Version Lineage:</strong> Upgraded from{' '}
              <code>{lineageInfo.parentDatasetName}</code>
              {lineageInfo.changeSummary && (
                <div style={{ marginTop: '0.25rem' }}>
                  <strong>Changelog:</strong> {lineageInfo.changeSummary}
                </div>
              )}
            </div>
          )}

          {/* Metadata Details Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0.75rem',
              fontSize: '0.83rem',
              marginBottom: '1rem',
            }}
          >
            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: '0.74rem' }}>
                Original File
              </span>
              <strong style={{ color: '#1e293b' }}>{item.original_filename}</strong>
            </div>
            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: '0.74rem' }}>
                Format & Size
              </span>
              <strong style={{ color: '#1e293b' }}>
                {item.file_format} ({formatBytes(item.file_size_bytes)})
              </strong>
            </div>
            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: '0.74rem' }}>
                Source
              </span>
              <strong style={{ color: '#1e293b' }}>{item.source}</strong>
            </div>
            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: '0.74rem' }}>
                Location / Corridor
              </span>
              <strong style={{ color: '#1e293b' }}>{item.location_name}</strong>
            </div>
            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: '0.74rem' }}>
                Capture Date
              </span>
              <strong style={{ color: '#1e293b' }}>{item.capture_date || '—'}</strong>
            </div>
            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: '0.74rem' }}>
                Total Records
              </span>
              <strong style={{ color: '#059669' }}>
                {effectiveRecordCount != null
                  ? Number(effectiveRecordCount).toLocaleString()
                  : 'Click Preview to compute'}
              </strong>
            </div>
          </div>

          {item.description && (
            <div
              style={{
                padding: '1rem 1.15rem',
                background: '#f8fafc',
                borderRadius: '12px',
                border: '1px solid #cbd5e1',
                fontSize: '0.94rem',
                lineHeight: 1.6,
                color: '#0f172a',
                marginBottom: '1.25rem',
              }}
            >
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  color: '#1d4ed8',
                  marginBottom: '0.4rem',
                }}
              >
                <FileText size={15} />
                <span>Description</span>
              </span>
              {item.description}
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Close
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
              onClick={() => {
                onClose()
                onStartNewVersion?.(item)
              }}
            >
              <GitBranch size={14} />
              <span>Upload New Version</span>
            </button>
            {item.approval_status === 'REJECTED' && item.version_id && (
              <button
                type="button"
                className="btn-action btn-action--success"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                disabled={isResubmitting}
                onClick={handleResubmit}
              >
                <Send size={14} />
                <span>{isResubmitting ? 'Resubmitting...' : 'Resubmit to Admin'}</span>
              </button>
            )}
            <button
              type="button"
              className="btn-action"
              style={{
                background: '#eff6ff',
                color: '#1d4ed8',
                border: '1px solid #bfdbfe',
                fontWeight: 700,
              }}
              onClick={() => {
                const id = item.dataset_id
                onClose()
                if (onOpenPipelineStudio) {
                  onOpenPipelineStudio(id)
                } else {
                  navigate(`/engineer/pipeline-studio?datasetId=${encodeURIComponent(id)}`)
                }
              }}
            >
              <Workflow size={14} />
              <span>Pipeline Studio</span>
            </button>
            <button
              type="button"
              className="btn-action btn-action--primary"
              onClick={() => {
                const id = item.dataset_id
                onClose()
                onPreviewDataset?.(id)
              }}
            >
              <Eye size={14} />
              <span>Preview Dataset</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

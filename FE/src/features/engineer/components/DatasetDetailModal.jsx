import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Eye, Workflow, Send } from 'lucide-react'
import { useLanguage } from '../../../hooks/useLanguage'
import { useEngineerDatasetReview } from '../../../hooks/useEngineerDatasetReview'
import { useEngineerDatasetDetail } from '../../../hooks/useEngineerDatasetDetail'
import { formatBytes } from '../utils/engineerHelpers'

export function DatasetStatusBadge({ status }) {
  const { t } = useLanguage()
  const variants = {
    APPROVED: ['emerald', 'Approved'],
    REJECTED: ['rose', 'Rejected'],
    SUBMITTED: ['blue', 'Pending Review'],
    PENDING: ['amber', 'Not submitted'],
    MIXED: ['slate', 'Mixed review statuses'],
  }
  const [tone, label] = variants[status] || ['slate', 'Unknown status']
  return <span className={`adm-badge adm-badge--${tone}`}>{t(label)}</span>
}

function MetadataField({ label, children }) {
  return (
    <div className="eng-kv-item">
      <span className="eng-kv-item__label">{label}</span>
      <span className="eng-kv-item__value">{children || '—'}</span>
    </div>
  )
}

export default function DatasetDetailModal(props) {
  if (!props.item) return null
  return <DatasetDetailContent key={`${props.item.dataset_id}:${props.item.file_id}`} {...props} />
}

function DatasetDetailContent({
  item: selectedItem, onClose, onPreviewDataset, onOpenPipelineStudio, onResubmitted,
}) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const detail = useEngineerDatasetDetail(selectedItem.dataset_id)
  const item = detail.data
  const review = useEngineerDatasetReview(item, () => { detail.reload(); onResubmitted?.() })

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [item, onClose])

  const openPipeline = () => {
    onClose?.()
    if (onOpenPipelineStudio) onOpenPipelineStudio(item.dataset_id)
    else navigate(`/engineer/pipeline-studio?datasetId=${encodeURIComponent(item.dataset_id)}`)
  }

  return (
    <div className="adm-modal-backdrop" role="dialog" aria-modal="true"
      aria-labelledby="dataset-detail-modal-title"
      onClick={(event) => { if (event.target === event.currentTarget) onClose?.() }}>
      <div className="adm-modal eng-dataset-detail" style={{ maxWidth: '800px' }}>
        <div className="adm-modal__header">
          <h3 id="dataset-detail-modal-title" className="adm-modal__title">{t('Dataset Metadata & Review')}</h3>
          <button type="button" className="adm-modal__close" onClick={onClose} aria-label={t('Close')}>
            <X size={18} />
          </button>
        </div>
        <div className="adm-modal__body">
          {detail.loading && <div role="status">{t('Đang tải thông tin tập dữ liệu...')}</div>}
          {detail.error && <div role="alert" className="eng-alert eng-alert--error">
            <span>{detail.error}</span>
            <button type="button" className="adm-btn adm-btn--ghost adm-btn--sm" onClick={detail.reload}>{t('Retry')}</button>
          </div>}
          {item && <>
          <div className="eng-detail-summary">
            <div>
              <h4>{item.name || t('Dataset')}</h4>
              <div className="eng-detail-summary__meta">
                {item.group_name && <span>{t('Batch')}: {item.group_name}</span>}
              </div>
            </div>
            <DatasetStatusBadge status={review.success ? 'SUBMITTED' : item.approval_status} />
          </div>

          {item.approval_note && ['APPROVED', 'REJECTED'].includes(item.approval_status) && (
            <div className={`eng-alert ${item.approval_status === 'REJECTED' ? 'eng-alert--error' : 'eng-alert--info'}`}>
              <div>
                <strong>{t('Administrator Review Note')}</strong>
                <div className="eng-break-all">{item.approval_note}</div>
              </div>
            </div>
          )}
          {review.success && <div role="status" className="eng-alert eng-alert--success">{t('File resubmitted for Administrator approval.')}</div>}
          {review.error && <div role="alert" className="eng-alert eng-alert--error">{t(review.error)}</div>}

          {review.showForm && (
            <form className="eng-detail-resubmit" onSubmit={review.resubmit}>
              <label htmlFor="resubmit-note-input" className="adm-label">{t('Response Note for Administrator')}</label>
              <textarea id="resubmit-note-input" className="adm-textarea" rows={2}
                value={review.note} onChange={(event) => review.setNote(event.target.value)}
                placeholder={t('Describe what was fixed...')} disabled={review.busy} />
              <div className="eng-detail-actions">
                <button type="button" className="adm-btn adm-btn--ghost adm-btn--sm"
                  onClick={() => review.setShowForm(false)} disabled={review.busy}>{t('Cancel')}</button>
                <button type="submit" className="adm-btn adm-btn--primary adm-btn--sm" disabled={review.busy}>
                  {t(review.busy ? 'Resubmitting...' : 'Confirm Resubmit')}
                </button>
              </div>
            </form>
          )}

          <div className="eng-kv-grid">
            <MetadataField label={t('Tệp dữ liệu')}>
              {item.original_filename || item.filename || (item.source_session_count > 0 ? `${item.source_session_count} ${t('tệp ghi hình gốc')}` : t('Chưa có tệp dữ liệu'))}
            </MetadataField>
            <MetadataField label={t('Format & Size')}>
              {item.file_format ? `${item.file_format} (${formatBytes(item.file_size_bytes)})` : null}
            </MetadataField>
            <MetadataField label={t('Source')}>{item.source}</MetadataField>
            <MetadataField label={t('Location / Corridor')}>{item.location_name}</MetadataField>
            <MetadataField label={t('Capture Date')}>{item.capture_date || item.recording_date}</MetadataField>
          </div>

          {item.source_sessions?.length > 0 && (
            <div className="eng-detail-description">
              <strong>{t('Source recording files')} ({item.source_sessions.length})</strong>
              <ul>{item.source_sessions.map((session) => (
                <li key={session.session_id}>{session.original_filename}</li>
              ))}</ul>
            </div>
          )}
          {item.description && (
            <div className="eng-detail-description"><strong>{t('Description')}</strong><p>{item.description}</p></div>
          )}
          </>}
        </div>
        <div className="adm-modal__footer eng-detail-actions">
          {item?.approval_status === 'REJECTED' && item.file_id && !review.success && !review.showForm && (
            <button type="button" className="adm-btn adm-btn--emerald" onClick={() => review.setShowForm(true)}>
              <Send size={15} />{t('Resubmit')}
            </button>
          )}
          <button type="button" className="adm-btn adm-btn--ghost" onClick={onClose}>{t('Close')}</button>
          <button type="button" className="adm-btn adm-btn--ghost"
            disabled={!item || !onPreviewDataset}
            onClick={() => { onClose?.(); onPreviewDataset?.(item.dataset_id) }}>
            <Eye size={15} />{t('Preview')}
          </button>
          <button type="button" className="adm-btn adm-btn--primary" onClick={openPipeline} disabled={!item}>
            <Workflow size={15} />{t('Open Pipeline Studio')}
          </button>
        </div>
      </div>
    </div>
  )
}

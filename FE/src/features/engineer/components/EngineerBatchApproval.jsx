import { useLanguage } from '../../../hooks/useLanguage'

const STATUS_LABELS = {
  APPROVED: 'Đã phê duyệt', SUBMITTED: 'Chờ phê duyệt', PENDING: 'Chưa gửi duyệt',
  REJECTED: 'Đã từ chối', MIXED: 'Nhiều trạng thái', UNKNOWN: 'Chưa rõ trạng thái',
}

export default function EngineerBatchApproval({ status, counts = {} }) {
  const { t } = useLanguage()
  const approved = counts.APPROVED || 0
  const tone = status === 'APPROVED' ? 'active' : status === 'REJECTED' ? 'rejected' : 'pending'
  const label = status === 'MIXED' && approved > 0 ? 'Duyệt một phần' : STATUS_LABELS[status] || STATUS_LABELS.UNKNOWN
  return <div>
    <span className={`badge badge--${tone}`}>{t(label)}</span>
  </div>
}

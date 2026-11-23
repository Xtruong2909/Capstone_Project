import { Trash2 } from 'lucide-react'
import { useLanguage } from '../../../hooks/useLanguage'
import { AdminFeedback, AdminModal } from '../../admin/components/AdminUi'

export default function EngineerDeleteBatchModal({ deletion }) {
  const { t } = useLanguage()
  if (!deletion.target) return null
  return <AdminModal title={t('Delete batch')} onClose={deletion.close} busy={deletion.busy}>
    <p>{t('Delete this batch and all its datasets and recording sessions?')}</p>
    <p><strong>{deletion.target.group_name || deletion.target.drone_id}</strong></p>
    <p className="admin-cell-note">{t('Associated files will also be removed. This action cannot be undone.')}</p>
    <AdminFeedback mutation={deletion} />
    <div className="admin-actions de-delete-batch-actions">
      <button type="button" className="btn-secondary" onClick={deletion.close} disabled={deletion.busy}>{t('Cancel')}</button>
      <button type="button" className="btn-secondary de-delete-batch" onClick={deletion.confirm}
        disabled={deletion.busy || deletion.target.can_delete !== true}>
        <Trash2 size={16} />{t(deletion.busy ? 'Deleting...' : 'Delete batch')}
      </button>
    </div>
  </AdminModal>
}

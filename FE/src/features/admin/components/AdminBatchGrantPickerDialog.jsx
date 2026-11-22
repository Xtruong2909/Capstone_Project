import { FolderOpen } from 'lucide-react'
import { useAdminBatchGrantPicker } from '../../../hooks/useAdminAccessGrants'
import { useLanguage } from '../../../hooks/useLanguage'
import AdminBatchGrantDialog from './AdminBatchGrantDialog'
import { AdminModal, AdminPagination, AdminState } from './AdminUi'

export default function AdminBatchGrantPickerDialog({ onClose, onGranted }) {
  const { t } = useLanguage()
  const { batches, selected, setSelected } = useAdminBatchGrantPicker()
  if (selected) return <AdminBatchGrantDialog batch={selected} onClose={onClose} onGranted={onGranted} />
  return <AdminModal title={t('Grant Batch Access')} onClose={onClose}>
    <p className="admin-cell-note">{t('Select a batch to grant access.')}</p>
    <AdminState resource={{ ...batches, items: batches.items.filter((batch) => batch.group_id) }}>
      <div className="admin-batch-grants__picker">{batches.items.filter((batch) => batch.group_id).map((batch) => (
        <button type="button" className="btn-secondary" key={batch.group_id} onClick={() => setSelected(batch)}>
          <FolderOpen size={18} /><strong>{batch.group_name || t('Batch')}</strong>
          <span>{batch.dataset_count} {t('Datasets')}</span>
        </button>
      ))}</div>
    </AdminState>
    <AdminPagination {...batches} />
  </AdminModal>
}

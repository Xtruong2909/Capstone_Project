import { ArrowUpRight, Check, FileSpreadsheet, FolderOpen, MessageSquare, X } from 'lucide-react'
import { useLanguage } from '../../../hooks/useLanguage'
import { AdminBadge } from './AdminUi'

export default function AdminApprovalBatchList({ items, batchName, onOpen, onReview, busy }) {
  const { t } = useLanguage()
  return <ul className="admin-approval-list">{items.map((item) => {
    const canReview = item.group_id && ['SUBMITTED', 'MIXED'].includes(item.approval_status)
    return <li className="admin-approval-batch" key={item.group_id || 'ungrouped'}>
      <div className="admin-approval-batch__body">
        <div className="admin-approval-batch__identity">
          <span className="admin-approval-batch__icon"><FolderOpen size={26} strokeWidth={1.7} /></span>
          <div><button className="admin-batch-link" onClick={() => onOpen(item)}>{batchName(item)}</button><AdminBadge value={item.approval_status} /></div>
        </div>
        <div className="admin-approval-batch__count"><span><FileSpreadsheet size={16} />{t('Datasets')}</span><strong>{item.dataset_count.toLocaleString()}</strong></div>
        <div className="admin-approval-batch__comment"><span><MessageSquare size={15} />{t('Note')}</span>
          {item.approval_notes?.length ? item.approval_notes.map((note) => <p key={note}>{note}</p>) : <p className="admin-approval-batch__empty">{t('No comment yet.')}</p>}
        </div>
      </div>
      <div className="admin-approval-batch__footer">
        <button className="admin-approval-preview" onClick={() => onOpen(item)}>{t('View Datasets')}<ArrowUpRight size={16} /></button>
        {canReview && <div className="admin-approval-batch__decisions">
          <button className="admin-approval-reject" disabled={busy} onClick={() => onReview(item, 'REJECTED')}><X size={16} />{t('Reject')}</button>
          <button className="admin-approval-approve" disabled={busy} onClick={() => onReview(item, 'APPROVED')}><Check size={16} />{t('Approve Batch')}</button>
        </div>}
      </div>
    </li>
  })}</ul>
}

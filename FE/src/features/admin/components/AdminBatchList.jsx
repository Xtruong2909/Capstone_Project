import { ArrowUpRight, Database, FolderOpen, ShieldMinus, ShieldPlus } from 'lucide-react'
import { useLanguage } from '../../../hooks/useLanguage'
import { AdminBadge } from './AdminUi'

export default function AdminBatchList({ items, batchName, onOpen, onGrant, onRevoke }) {
  const { t } = useLanguage()
  return <div className="admin-batch-list">
    <div className="admin-batch-list__heading"><span>{t('Batch Library')}</span><span>{t('Select a batch to explore its datasets')}</span></div>
    <ul>{items.map((item) => <li className="admin-batch-row" key={item.group_id || 'ungrouped'}>
      <div className="admin-batch-row__identity">
        <span className="admin-batch-row__icon"><FolderOpen size={25} strokeWidth={1.7} /></span>
        <div><button className="admin-batch-link" onClick={() => onOpen(item)}>{batchName(item)}</button>
          <div className="admin-batch-row__status"><AdminBadge value={item.approval_status} /></div>
        </div>
      </div>
      <dl className="admin-batch-row__stats">
        <div><dt><Database size={15} />{t('Datasets')}</dt><dd>{item.dataset_count.toLocaleString()}</dd></div>
      </dl>
      <div className="admin-batch-row__notes"><span>{t('Note')}</span>{item.approval_notes?.length ? <ul>{item.approval_notes.map((note) => <li key={note}>{note}</li>)}</ul> : <p>—</p>}</div>
      <div className="admin-batch-row__actions">
        <button className="btn-secondary" onClick={() => onOpen(item)}>{t('View Datasets')}<ArrowUpRight size={16} /></button>
        {item.group_id && <button className="btn-action btn-action--primary" onClick={() => onGrant(item)}><ShieldPlus size={16} />{t('Grant Access')}</button>}
        {item.group_id && <button className="admin-batch-revoke" onClick={() => onRevoke(item)}><ShieldMinus size={16} />{t('Revoke Access')}</button>}
      </div>
    </li>)}</ul>
  </div>
}

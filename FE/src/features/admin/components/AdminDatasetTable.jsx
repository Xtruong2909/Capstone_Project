import { CalendarDays, Eye, FileSpreadsheet } from 'lucide-react'
import { useLanguage } from '../../../hooks/useLanguage'

export default function AdminDatasetTable({ items, onPreview }) {
  const { t } = useLanguage()
  return <div className="admin-dataset-table-wrap">
    <table className="admin-table admin-dataset-table">
      <thead><tr><th>{t('Dataset')}</th><th>{t('Records')}</th><th>{t('Action')}</th></tr></thead>
      <tbody>{items.map((item) => <tr key={item.id}>
        <td><div className="admin-dataset-name"><span className="admin-dataset-name__icon"><FileSpreadsheet size={21} strokeWidth={1.7} /></span><div>
          <strong>{item.dataset_name}</strong>
          <span className="admin-dataset-name__meta"><CalendarDays size={12} />{item.recording_date || '—'}{item.drone_id && <><span aria-hidden="true">·</span><span>{item.drone_id}</span></>}</span>
        </div></div></td>
        <td><span className="admin-dataset-records">{Number(item.total_records).toLocaleString()}</span></td>
        <td><button className="admin-dataset-preview" onClick={() => onPreview(item)}><Eye size={16} />{t('Preview')}</button></td>
      </tr>)}</tbody>
    </table>
  </div>
}

import { ArrowLeft, RefreshCw } from 'lucide-react'
import { useLanguage } from '../../../hooks/useLanguage'
import { AdminBadge, AdminState } from '../../admin/components/AdminUi'

export { AdminBadge as EngineerBadge, AdminFeedback as EngineerFeedback, AdminPagination as EngineerPagination, AdminState as EngineerState } from '../../admin/components/AdminUi'

export function EngineerHeader({ title, description, onRefresh, onBack, children }) {
  const { t } = useLanguage()
  return <header className="de-header"><div>{onBack && <button className="de-back" onClick={onBack}><ArrowLeft size={15} />{t('Back')}</button>}<p className="de-eyebrow">DATA ENGINEERING</p><h2>{t(title)}</h2>{description && <p>{t(description)}</p>}</div><div className="admin-actions">{children}{onRefresh && <button className="btn-secondary" onClick={onRefresh}><RefreshCw size={15} />{t('Refresh')}</button>}</div></header>
}

export function EngineerJob({ resource }) {
  const { t } = useLanguage()
  if (!resource.data && !resource.loading && !resource.error) return null
  const job = resource.data
  const count = job?.processed_datasets ?? job?.processed_files ?? 0
  const total = job?.total_datasets ?? job?.total_files ?? 0
  return <section className="admin-card de-job"><AdminState resource={resource}>{job && <>
    <div className="de-job__title"><strong>{t(job.operation || 'Upload Dataset')}</strong><AdminBadge value={job.status} /><span>{count} / {total}</span></div>
    <progress value={count} max={Math.max(1, total)} />
    {job.error_message && <p role="alert" className="admin-notice admin-notice--error">{job.error_message}</p>}
    {job.results?.length > 0 && <div className="admin-table-scroll"><table className="admin-table"><thead><tr>{['Dataset', 'Status', 'Records'].map((key) => <th key={key}>{t(key)}</th>)}</tr></thead><tbody>{job.results.map((row) => <tr key={row.dataset_id}><td>{row.dataset_name}{row.error_message && <small role="alert" className="admin-cell-note">{row.error_message}</small>}</td><td><AdminBadge value={row.status} /></td><td>{row.records_after?.toLocaleString() || '—'}</td></tr>)}</tbody></table></div>}
  </>}</AdminState></section>
}

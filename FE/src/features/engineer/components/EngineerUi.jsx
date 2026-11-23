import { ArrowLeft, RefreshCw, Workflow } from 'lucide-react'
import { useLanguage } from '../../../hooks/useLanguage'
import { AdminBadge, AdminState } from '../../admin/components/AdminUi'

export { AdminBadge as EngineerBadge, AdminFeedback as EngineerFeedback, AdminPagination as EngineerPagination, AdminState as EngineerState } from '../../admin/components/AdminUi'

export function EngineerHeader({ title, onRefresh, onBack, children }) {
  const { t } = useLanguage()
  return (
    <header className="de-header">
      <div className="de-header__left">
        {onBack && (
          <button type="button" className="de-back" onClick={onBack} aria-label={t('Back')}>
            <ArrowLeft size={16} />
            <span>{t('Back')}</span>
          </button>
        )}
        <div className="de-header__title-row">
          <div className="de-header__icon-badge">
            <Workflow size={20} />
          </div>
          <h2 className="de-header__title">{t(title)}</h2>
        </div>
      </div>
      <div className="admin-actions">
        {children}
        {onRefresh && (
          <button type="button" className="btn-secondary" onClick={onRefresh} aria-label={t('Refresh')}>
            <RefreshCw size={15} />
            <span>{t('Refresh')}</span>
          </button>
        )}
      </div>
    </header>
  )
}

export function EngineerJob({ resource }) {
  const { t } = useLanguage()
  if (!resource.data && !resource.loading && !resource.error) return null
  const job = resource.data
  const count = job?.processed_datasets ?? job?.processed_files ?? 0
  const total = job?.total_datasets ?? job?.total_files ?? 0
  const saving = ['SAVING', 'VERIFYING'].includes(job?.stage)
  const directUpload = Boolean(job?.stage)
  const title = job?.operation || (saving ? 'Saving dataset information' : directUpload ? 'Upload Results' : 'Upload Dataset')
  return <section className="admin-card de-job"><AdminState resource={resource}>{job && <>
    <div className="de-job__title"><strong>{t(title)}</strong><AdminBadge value={job.status} /><span>{saving ? `${t('Files registered')}: ` : ''}{count} / {total}</span></div>
    <progress aria-label={t(title)} value={count} max={Math.max(1, total)} />
    {directUpload && ['QUEUED', 'RUNNING'].includes(job.status) && <p className="admin-cell-note" role="status">{t('Files are on S3. Saving dataset and recording session information.')}</p>}
    {!directUpload && job.total_files != null && job.status === 'RUNNING' && <p className="admin-cell-note" role="status">{t(count >= total ? 'Files processed. Saving dataset information...'
      : 'Progress updates after each file. Dataset information is saved when the group completes.')}</p>}
    {job.error_message && <p role="alert" className="admin-notice admin-notice--error">{job.error_message}</p>}
    {job.results?.length > 0 && <div className="admin-table-scroll"><table className="admin-table"><thead><tr>{['Dataset', 'Status', 'Records'].map((key) => <th key={key}>{t(key)}</th>)}</tr></thead><tbody>{job.results.map((row) => <tr key={row.dataset_id}><td>{row.dataset_name}{row.error_message && <small role="alert" className="admin-cell-note">{row.error_message}</small>}</td><td><AdminBadge value={row.status} /></td><td>{row.records_after?.toLocaleString() || '—'}</td></tr>)}</tbody></table></div>}
  </>}</AdminState></section>
}

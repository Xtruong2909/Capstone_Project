import { AlertCircle, ChevronLeft, ChevronRight, RefreshCw, X } from 'lucide-react'
import { useLanguage } from '../../../hooks/useLanguage'

export function AdminPagination({ page, pageSize, total, setPage, setPageSize, loading }) {
  const { t } = useLanguage()
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return <nav className="admin-pagination" aria-label={t('Pagination')}>
    <span>{total ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, total)} / {total}</span>
    <div className="admin-pagination__controls">
      <select className="admin-select" aria-label={t('Rows per page')} value={pageSize}
        disabled={loading} onChange={(event) => setPageSize(Number(event.target.value))}>
        {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size} / {t('Page')}</option>)}
      </select>
      <button type="button" className="btn-secondary" aria-label={t('Previous')} disabled={loading || page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={16} /></button>
      <span>{t('Page')} {page} / {pages}</span>
      <button type="button" className="btn-secondary" aria-label={t('Next')} disabled={loading || page >= pages} onClick={() => setPage(page + 1)}><ChevronRight size={16} /></button>
    </div>
  </nav>
}

export function AdminState({ resource, children, empty = 'No results found.' }) {
  const { t } = useLanguage()
  if (resource.loading) return <div className="empty-state" role="status"><RefreshCw size={22} className="animate-spin" /><p>{t('Loading...')}</p></div>
  if (resource.error) return <div className="empty-state" role="alert"><AlertCircle size={22} /><p>{resource.error}</p><button type="button" className="btn-secondary" onClick={resource.reload}>{t('Retry')}</button></div>
  if (resource.items && resource.items.length === 0) return <div className="empty-state"><p>{t(empty)}</p></div>
  return children
}

export function AdminFeedback({ mutation }) {
  return <>{mutation.error && <p role="alert" className="admin-notice admin-notice--error">{mutation.error}</p>}
    {mutation.success && <p role="status" className="admin-notice admin-notice--success">{mutation.success}</p>}</>
}

export function AdminModal({ title, onClose, children, busy = false, className = '' }) {
  const { t } = useLanguage()
  return <div className="modal-backdrop" onMouseDown={(event) => { if (!busy && event.target === event.currentTarget) onClose() }}>
    <section className={`modal-dialog admin-dialog ${className}`} role="dialog" aria-modal="true" aria-label={title}>
      <header className="modal-header"><h3>{title}</h3><button type="button" className="modal-close-btn" disabled={busy} aria-label={t('Close')} onClick={onClose}><X size={20} /></button></header>
      <div className="modal-body">{children}</div>
    </section>
  </div>
}

export function AdminToolbar({ title, onRefresh, children, action }) {
  const { t } = useLanguage()
  return <><header className="admin-card__header"><h2 className="admin-card__title">{title}</h2><div className="admin-actions">{action}<button type="button" className="btn-secondary" onClick={onRefresh}><RefreshCw size={15} /> {t('Refresh')}</button></div></header>
    {children && <div className="admin-filters">{children}</div>}</>
}

export function AdminBadge({ value }) {
  const { t } = useLanguage()
  const status = ['APPROVED', 'COMPLETED', 'SUCCESS', 'ACTIVE'].includes(value) ? 'active'
    : ['FAILED', 'REJECTED', 'INACTIVE'].includes(value) ? 'rejected' : 'pending'
  return <span className={`badge badge--${status}`}>{t(value)}</span>
}

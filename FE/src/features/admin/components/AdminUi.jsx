import { AlertCircle, ChevronLeft, ChevronRight, Inbox, RefreshCw, X } from 'lucide-react'
import { useLanguage } from '../../../hooks/useLanguage'

export function AdminPagination({ page, pageSize, total, setPage, setPageSize, loading }) {
  const { t } = useLanguage()
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <nav className="admin-pagination" aria-label={t('Pagination')}>
      <span className="admin-pagination__info">
        {total ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, total)} / {total}
      </span>
      <div className="admin-pagination__controls">
        <select
          className="admin-select"
          aria-label={t('Rows per page')}
          value={pageSize}
          disabled={loading}
          onChange={(event) => setPageSize(Number(event.target.value))}
        >
          {[10, 20, 50, 100].map((size) => (
            <option key={size} value={size}>
              {size} / {t('Page')}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn-secondary admin-pagination__btn"
          aria-label={t('Previous')}
          disabled={loading || page <= 1}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <span className="admin-pagination__page-text">
          {t('Page')} <strong>{page}</strong> / {pages}
        </span>
        <button
          type="button"
          className="btn-secondary admin-pagination__btn"
          aria-label={t('Next')}
          disabled={loading || page >= pages}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </nav>
  )
}

export function AdminState({ resource, children, empty = 'No results found.' }) {
  const { t } = useLanguage()
  if (resource.loading) {
    return (
      <div className="empty-state" role="status">
        <div className="empty-state__icon-box">
          <RefreshCw size={24} className="animate-spin" />
        </div>
        <p className="empty-state__title">{t('Loading...')}</p>
      </div>
    )
  }
  if (resource.error && resource.data == null) {
    return (
      <div className="empty-state" role="alert">
        <div className="empty-state__icon-box empty-state__icon-box--error">
          <AlertCircle size={24} />
        </div>
        <p className="empty-state__title">{resource.error}</p>
        <button type="button" className="btn-secondary" onClick={resource.reload}>
          {t('Retry')}
        </button>
      </div>
    )
  }
  if (resource.items && resource.items.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon-box">
          <Inbox size={28} />
        </div>
        <p className="empty-state__title">{t(empty)}</p>
      </div>
    )
  }
  return <>{resource.error && <p className="admin-notice admin-notice--error" role="alert">{resource.error}</p>}{children}</>
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

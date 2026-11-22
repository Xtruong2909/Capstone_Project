import { useLanguage } from '../../../hooks/useLanguage'

export default function AdminPageSkeleton() {
  const { t } = useLanguage()
  return <div className="admin-page-skeleton" role="status" aria-label={t('Loading system overview...')} aria-busy="true">
    <div className="admin-page-skeleton__hero" aria-hidden="true">
      <span className="admin-page-skeleton__line admin-page-skeleton__line--short" />
      <span className="admin-page-skeleton__line" />
      <div className="admin-page-skeleton__stats">{[1, 2, 3, 4].map((item) => <div key={item} />)}</div>
    </div>
    <div className="admin-page-skeleton__panels" aria-hidden="true">{[1, 2].map((item) => <div key={item}><span className="admin-page-skeleton__line admin-page-skeleton__line--short" /><span className="admin-page-skeleton__line" /></div>)}</div>
  </div>
}

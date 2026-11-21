import { ChevronRight, Database, FlaskConical, TrendingUp } from 'lucide-react'
import { sharedResourceName } from '../utils/sharedResourceNames'

const ICONS = { DATASET: Database, EXPERIMENT: FlaskConical, PREDICTION: TrendingUp }

export default function BusinessResourceList({ resources, label, onSelect }) {
  return <section className="biz-resource-directory" aria-label={`Danh sách ${label.toLowerCase()}`}>
    <header className="biz-resource-directory__heading">
      <div><h3>Danh sách {label.toLowerCase()}</h3><p>Chọn một mục để xem chi tiết.</p></div>
      <span>{resources.length} mục</span>
    </header>
    {resources.length === 0 ? <p className="biz-empty-text">Chưa có mục nào được chia sẻ.</p>
      : <div className="biz-resource-directory__items">{resources.map((resource) => {
        const Icon = ICONS[resource.resource_type] || Database
        const sessionCount = resource.data?.statistics?.session_count ?? resource.data?.forecast_summary?.session_count
        return <button type="button" className="biz-resource-directory__item" key={resource.item_id}
          onClick={() => onSelect(resource.item_id)}>
          <span className="biz-resource-directory__icon"><Icon size={21} aria-hidden="true" /></span>
          <span className="biz-resource-directory__info">
            <strong>{sharedResourceName(resource)}</strong>
            <small>{sessionCount != null ? `${sessionCount} session · ` : ''}Mã: {resource.resource_id.slice(0, 8)}</small>
          </span>
          <span className="biz-resource-directory__action">Xem chi tiết <ChevronRight size={17} aria-hidden="true" /></span>
        </button>
      })}</div>}
  </section>
}

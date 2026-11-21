import { Database, Layers } from 'lucide-react'
import { useBusinessDatasetView } from '../../../hooks/useBusinessDatasetView'
import { sharedResourceName } from '../utils/sharedResourceNames'

export default function BusinessDatasetDetail({ resource, renderSection }) {
  const { views, activeView, setSelectedView } = useBusinessDatasetView(resource)
  const statistics = resource.data?.statistics || {}
  const name = sharedResourceName(resource)

  return <section className="biz-dataset-detail" aria-label={`Dataset · ${name}`}>
    <header className="biz-dataset-detail__heading">
      <span className="biz-dataset-detail__icon"><Database size={23} aria-hidden="true" /></span>
      <div className="biz-dataset-detail__identity">
        <span className="biz-dataset-detail__eyebrow">Dataset</span>
        <h3>{name}</h3>
      </div>
      {statistics.session_count != null && <span className="biz-dataset-detail__count">
        <Layers size={15} aria-hidden="true" /> {statistics.session_count} session
      </span>}
    </header>
    {views.length > 0 ? <>
      <nav className="biz-dataset-detail__nav" aria-label={`Nội dung dataset ${name}`}>
        {views.map((view) => <button type="button" key={view.id}
          aria-pressed={activeView.id === view.id}
          className={activeView.id === view.id ? 'active' : ''}
          onClick={() => setSelectedView(view.id)}>{view.label}</button>)}
      </nav>
      <div className="biz-dataset-detail__content" key={activeView.id}>
        {activeView.id === 'sessions' && <p className="biz-dataset-detail__hint">Các session thuộc dataset này, kèm ngày và khoảng thời gian ghi hình.</p>}
        {activeView.id === 'traffic' && <p className="biz-dataset-detail__hint">Lưu lượng được chia thành từng session. Dùng phân trang để xem các mốc tiếp theo.</p>}
        {activeView.sections.map(renderSection)}
      </div>
    </> : <p className="biz-empty-text">Dataset chưa có nội dung được chia sẻ.</p>}
  </section>
}

import { Eye, MapPin, ShieldCheck, Database } from 'lucide-react'

export default function DatasetCard({ item, onPreview }) {
  return (
    <article className="sci-card">
      <div className="sci-card__top">
        <div>
          <span className="sci-card__code">{item.dataset_code}</span>
          <h3 className="sci-card__title">{item.dataset_name}</h3>
        </div>
        <span className="sci-pill sci-pill--approved">
          <ShieldCheck size={12} /> {item.approval_status === 'APPROVED' ? 'Approved' : item.approval_status}
        </span>
      </div>

      <div className="sci-meta">
        <span><Database size={13} />{item.source}</span>
        <span><MapPin size={13} />{item.location_name}</span>
      </div>

      <div className="sci-card__footer">
        <span className="sci-pill sci-pill--version">{item.version_tag}</span>
        <button type="button" className="btn-action btn-action--primary" onClick={() => onPreview(item)}>
          <Eye size={14} /> Preview
        </button>
      </div>
    </article>
  )
}

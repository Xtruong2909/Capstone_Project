import { FileSearch, MapPin, ShieldCheck, Database, FlaskConical, TrendingUp } from 'lucide-react'

export default function DatasetCard({ item, onPreview, onTrain, onPredict }) {
  return (
    <article className="sci-card">
      <div className="sci-card__top">
        <div style={{ minWidth: 0 }}>
          <h3 className="sci-card__title" title={item.dataset_name}>
            {item.dataset_name}
          </h3>
        </div>
        <span className="sci-pill sci-pill--approved" style={{ flexShrink: 0 }}>
          <ShieldCheck size={12} /> {item.approval_status === 'APPROVED' ? 'Approved' : item.approval_status}
        </span>
      </div>

      <div className="sci-meta">
        <span title={item.source}>
          <Database size={13} />
          <em>{item.source}</em>
        </span>
        <span title={item.location_name}>
          <MapPin size={13} />
          <em>{item.location_name}</em>
        </span>
      </div>

      <div className="sci-card__footer">
        <span className="sci-pill sci-pill--version">{item.version_tag}</span>
        <div className="sci-icon-actions">
          {onTrain && (
            <button
              type="button"
              className="sci-action-chip"
              onClick={() => onTrain(item)}
              title="Open Training Pipeline"
            >
              <FlaskConical size={14} />
              <span>Train</span>
            </button>
          )}
          {onPredict && (
            <button
              type="button"
              className="sci-action-chip"
              onClick={() => onPredict(item)}
              title="Open Prediction Insight"
            >
              <TrendingUp size={14} />
              <span>Predict</span>
            </button>
          )}
          <button
            type="button"
            className="sci-action-chip sci-action-chip--primary"
            onClick={() => onPreview(item)}
            title="Open Dataset Detail & Preview"
          >
            <FileSearch size={15} strokeWidth={2} />
            <span>Preview</span>
          </button>
        </div>
      </div>
    </article>
  )
}

import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Database,
  ShieldCheck,
  FileSearch,
  FlaskConical,
  TrendingUp,
} from 'lucide-react'

/**
 * Dataset navigation and context shared by Training and Prediction pages.
 */
export default function DatasetInfoPanel({
  item,
  datasets = [],
  datasetId,
  versionId,
  isLoading,
}) {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const activeMode = pathname.endsWith('/train')
    ? 'train'
    : pathname.endsWith('/predict')
      ? 'predict'
      : 'preview'

  const basePath = `/scientist/datasets/${datasetId}/versions/${versionId}`

  const handleVersionSwitch = (e) => {
    const val = e.target.value
    if (!val) return
    const [dId, vId] = val.split('::')
    const suffix = activeMode === 'train' ? '/train' : activeMode === 'predict' ? '/predict' : ''
    navigate(`/scientist/datasets/${dId}/versions/${vId}${suffix}`)
  }

  return (
    <>
      {/* Top Bar: Back Link + Dataset Version Switcher */}
      <div className="sci-top-bar">
        <button
          type="button"
          className="sci-back"
          onClick={() => navigate('/scientist/datasets')}
        >
          <ArrowLeft size={16} /> Back to Approved Datasets
        </button>

        {datasets.length > 0 && (
          <div className="sci-top-bar__selector">
            <span className="sci-top-bar__selector-label">Select Dataset Version:</span>
            <select
              className="sci-dataset-select"
              value={datasetId && versionId ? `${datasetId}::${versionId}` : ''}
              onChange={handleVersionSwitch}
            >
              {datasets.map((d) => (
                <option key={d.version_id} value={`${d.dataset_id}::${d.version_id}`}>
                  {d.dataset_name} ({d.version_tag}) {d.location_name ? `• ${d.location_name}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {isLoading && !item ? (
        <div className="sci-skeleton" style={{ height: 90 }} />
      ) : !item ? (
        <div className="sci-state sci-state--error">
          <p style={{ margin: 0, fontWeight: 700 }}>
            This dataset version is not available in your approved list.
          </p>
        </div>
      ) : (
        <section className="admin-card">
          <div className="admin-card__header">
            <div className="admin-card__header-left">
              <div className="admin-card__icon-box admin-card__icon-box--blue">
                <Database size={18} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <h2 className="admin-card__title">{item.dataset_name}</h2>
                  <span className="sci-pill sci-pill--version">{item.version_tag}</span>
                  <span className="sci-pill sci-pill--approved">
                    <ShieldCheck size={12} /> {item.approval_status}
                  </span>
                </div>
                <p className="admin-card__subtitle">
                  {item.location_name && `${item.location_name} • `}
                  {item.source && `Source: ${item.source.toUpperCase()} • `}
                  Approved UAV traffic dataset
                </p>
              </div>
            </div>

            {/* Mode Switcher: Preview / Training / Prediction */}
            <div className="sci-mode-switch">
              <Link
                to={basePath}
                className={`sci-mode-switch__btn ${activeMode === 'preview' ? 'active' : ''}`}
              >
                <FileSearch size={15} strokeWidth={2} /> Data Preview
              </Link>
              <Link
                to={`${basePath}/train`}
                className={`sci-mode-switch__btn sci-mode-switch__btn--train ${activeMode === 'train' ? 'active' : ''}`}
              >
                <FlaskConical size={14} /> Training
              </Link>
              <Link
                to={`${basePath}/predict`}
                className={`sci-mode-switch__btn sci-mode-switch__btn--predict ${activeMode === 'predict' ? 'active' : ''}`}
              >
                <TrendingUp size={14} /> Prediction
              </Link>
            </div>
          </div>
        </section>
      )}
    </>
  )
}

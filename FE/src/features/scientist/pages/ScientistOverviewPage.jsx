import { Link, useNavigate } from 'react-router-dom'
import {
  Database,
  Layers,
  MapPin,
  Radio,
  FileSearch,
  Sparkles,
  FlaskConical,
  TrendingUp,
  ShieldCheck,
} from 'lucide-react'
import { useApprovedDatasets } from '../../../hooks/useScientistData'

const WORKFLOW = [
  ['Browse Approved Datasets', 'View cleaned and approved pNEUMA dataset versions shared by Admin.'],
  ['Inspect Schema & Preview', 'Examine columns, data types, detected structure, and paginated rows.'],
  ['Time-Series Aggregation', 'Aggregate trajectories into 1m, 3m, 5m temporal bins for forecasting.'],
  ['Model Training & Evaluation', 'Train Baseline, Random Forest, or LSTM models and evaluate MAE / RMSE.'],
]

export default function ScientistOverviewPage() {
  const { datasets, isLoading, error } = useApprovedDatasets('')
  const navigate = useNavigate()

  const goTo = (e, path) => {
    e.preventDefault()
    e.stopPropagation()
    navigate(path)
  }

  const uniqueDatasets = new Set(datasets.map((d) => d.dataset_id)).size
  const uniqueLocations = new Set(datasets.map((d) => d.location_name).filter(Boolean)).size
  const uniqueSources = new Set(datasets.map((d) => d.source).filter(Boolean)).size
  const latest = datasets.slice(0, 6)

  return (
    <div className="sci-page">
      {error && <div className="sci-state sci-state--error">{error}</div>}

      {/* 4 Professional KPI Stat Cards */}
      <div className="stats-grid">
        <div className="stat-card stat-card--blue">
          <Database size={96} className="stat-card__watermark" />
          <div className="stat-card__top">
            <div className="stat-card__info">
              <div className="stat-card__eyebrow">Approved Datasets</div>
              <h3>{isLoading ? '…' : uniqueDatasets}</h3>
              <p>Active traffic datasets</p>
            </div>
            <div className="stat-card__icon stat-card__icon--blue">
              <Database size={22} />
            </div>
          </div>
        </div>

        <div className="stat-card stat-card--purple">
          <Layers size={96} className="stat-card__watermark" />
          <div className="stat-card__top">
            <div className="stat-card__info">
              <div className="stat-card__eyebrow">Approved Versions</div>
              <h3>{isLoading ? '…' : datasets.length}</h3>
              <p>Verified by Admin</p>
            </div>
            <div className="stat-card__icon stat-card__icon--purple">
              <Layers size={22} />
            </div>
          </div>
        </div>

        <div className="stat-card stat-card--green">
          <MapPin size={96} className="stat-card__watermark" />
          <div className="stat-card__top">
            <div className="stat-card__info">
              <div className="stat-card__eyebrow">Locations</div>
              <h3>{isLoading ? '…' : uniqueLocations}</h3>
              <p>Traffic survey areas</p>
            </div>
            <div className="stat-card__icon stat-card__icon--green">
              <MapPin size={22} />
            </div>
          </div>
        </div>

        <div className="stat-card stat-card--amber">
          <Radio size={96} className="stat-card__watermark" />
          <div className="stat-card__top">
            <div className="stat-card__info">
              <div className="stat-card__eyebrow">Data Sources</div>
              <h3>{isLoading ? '…' : uniqueSources}</h3>
              <p>UAV & drone feeds</p>
            </div>
            <div className="stat-card__icon stat-card__icon--amber">
              <Radio size={22} />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Split: Available Datasets & Workflow */}
      <div className="sci-split">
        {/* Left: Available Approved Versions */}
        <section className="admin-card">
          <div className="admin-card__header">
            <div>
              <h2 className="admin-card__title">Available Approved Versions</h2>
              <p className="admin-card__subtitle">Verified datasets ready for time-series extraction & AI modeling</p>
            </div>
            <Link to="/scientist/datasets" className="btn-secondary" style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}>
              View all
            </Link>
          </div>

          {isLoading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem 1.25rem' }}>
              {[1, 2, 3].map((n) => (
                <div key={n} className="sci-skeleton" style={{ height: 75 }} />
              ))}
            </div>
          )}

          {!isLoading && datasets.length === 0 && (
            <div className="sci-state" style={{ margin: '1rem 1.25rem', padding: '2.5rem 1rem' }}>
              <p style={{ margin: 0, fontWeight: 600 }}>No approved datasets assigned yet.</p>
              <p style={{ margin: '0.3rem 0 0', fontSize: '0.82rem', color: '#94a3b8' }}>
                Contact your system administrator to grant dataset permissions.
              </p>
            </div>
          )}

          {!isLoading && datasets.length > 0 && (
            <div className="sci-overview-list">
              {latest.map((d) => {
                const basePath = `/scientist/datasets/${d.dataset_id}/versions/${d.version_id}`
                return (
                  <Link key={d.version_id} to={basePath} className="sci-overview-row">
                    <div className="sci-overview-row__left">
                      <div className="sci-overview-row__avatar">
                        <Database size={20} />
                      </div>

                      <div className="sci-overview-row__info">
                        <div className="sci-overview-row__title-line">
                          <span className="sci-overview-row__name" title={d.dataset_name}>
                            {d.dataset_name}
                          </span>
                          <span className="sci-pill sci-pill--version">{d.version_tag}</span>
                          <span className="sci-pill sci-pill--approved">
                            <ShieldCheck size={11} /> {d.approval_status}
                          </span>
                        </div>

                        <div
                          className="sci-overview-row__meta"
                          title={[d.location_name, d.source].filter(Boolean).join(' • ')}
                        >
                          {d.location_name && (
                            <span className="sci-overview-row__meta-item">
                              <MapPin size={12} />
                              <span>{d.location_name}</span>
                            </span>
                          )}
                          {d.source && (
                            <span className="sci-overview-row__meta-item">
                              <Layers size={12} />
                              <span>{d.source}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="sci-icon-actions">
                      <button
                        type="button"
                        className="sci-action-chip"
                        title="Open Training Pipeline"
                        onClick={(e) => goTo(e, `${basePath}/train`)}
                      >
                        <FlaskConical size={14} />
                        <span>Train</span>
                      </button>
                      <button
                        type="button"
                        className="sci-action-chip"
                        title="Open Prediction Insight"
                        onClick={(e) => goTo(e, `${basePath}/predict`)}
                      >
                        <TrendingUp size={14} />
                        <span>Predict</span>
                      </button>
                      <button
                        type="button"
                        className="sci-action-chip sci-action-chip--primary"
                        title="Open Dataset Detail & Preview"
                        onClick={(e) => goTo(e, basePath)}
                      >
                        <FileSearch size={15} strokeWidth={2} />
                        <span>Preview</span>
                      </button>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        {/* Right: Data Science Workflow */}
        <section className="admin-card">
          <div className="admin-card__header">
            <div>
              <h2 className="admin-card__title" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Sparkles size={17} style={{ color: '#1668e3' }} /> Data Science Workflow
              </h2>
              <p className="admin-card__subtitle">End-to-end traffic forecasting pipeline</p>
            </div>
          </div>

          <div style={{ padding: '1rem 1.25rem 1.25rem' }}>
            <ol className="sci-flow">
              {WORKFLOW.map(([title, text], i) => (
                <li key={title}>
                  <span className="sci-flow__num">{i + 1}</span>
                  <div>
                    <b>{title}</b>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', lineHeight: 1.45 }}>{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </div>
    </div>
  )
}

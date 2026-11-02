import { Link } from 'react-router-dom'
import { Database, Layers, MapPin, Radio } from 'lucide-react'
import { useApprovedDatasets } from '../../../hooks/useScientistData'

const WORKFLOW = [
  ['Browse Approved Datasets', 'View cleaned and approved pNEUMA dataset versions shared by Admin.'],
  ['Inspect Schema & Preview', 'Examine columns, data types, detected structure, and paginated rows.'],
  ['Time-Series Aggregation', 'Aggregate trajectories into 1m, 3m, 5m temporal bins for forecasting.'],
  ['Model Training & Evaluation', 'Train Baseline, Random Forest, or LSTM models and evaluate MAE / RMSE.'],
]

export default function ScientistOverviewPage() {
  const { datasets, isLoading, error } = useApprovedDatasets('')

  const uniqueDatasets = new Set(datasets.map((d) => d.dataset_id)).size
  const uniqueLocations = new Set(datasets.map((d) => d.location_name).filter(Boolean)).size
  const uniqueSources = new Set(datasets.map((d) => d.source).filter(Boolean)).size
  const latest = datasets.slice(0, 5)

  return (
    <div className="sci-page">
      <section className="admin-hero-banner">
        <div className="admin-hero-banner__content">
          <span className="admin-hero-banner__eyebrow">Data Science Lab</span>
          <h2 className="admin-hero-banner__title">Approved Traffic Datasets & ML Workspace</h2>
          <p className="admin-hero-banner__subtitle">
            Access preprocessed, validated UAV traffic trajectory data from Data Engineers approved by Admin.
          </p>
          <div className="admin-hero-banner__actions">
            <Link to="/scientist/datasets" className="btn-hero-primary">Browse Approved Datasets</Link>
          </div>
        </div>
      </section>

      {error && <div className="sci-state sci-state--error">{error}</div>}

      <div className="stats-grid">
        <div className="stat-card stat-card--blue">
          <div className="stat-card__icon"><Database size={20} /></div>
          <div className="stat-card__info">
            <span className="stat-card__eyebrow">Approved Datasets</span>
            <strong>{isLoading ? '…' : uniqueDatasets}</strong>
          </div>
        </div>
        <div className="stat-card stat-card--purple">
          <div className="stat-card__icon"><Layers size={20} /></div>
          <div className="stat-card__info">
            <span className="stat-card__eyebrow">Approved Versions</span>
            <strong>{isLoading ? '…' : datasets.length}</strong>
          </div>
        </div>
        <div className="stat-card stat-card--green">
          <div className="stat-card__icon"><MapPin size={20} /></div>
          <div className="stat-card__info">
            <span className="stat-card__eyebrow">Locations</span>
            <strong>{isLoading ? '…' : uniqueLocations}</strong>
          </div>
        </div>
        <div className="stat-card stat-card--amber">
          <div className="stat-card__icon"><Radio size={20} /></div>
          <div className="stat-card__info">
            <span className="stat-card__eyebrow">Data Sources</span>
            <strong>{isLoading ? '…' : uniqueSources}</strong>
          </div>
        </div>
      </div>

      <div className="sci-split">
        <section className="admin-card">
          <div className="admin-card__header">
            <div>
              <h2 className="admin-card__title">Available Approved Versions</h2>
              <p className="admin-card__subtitle">Ready for preview and modeling</p>
            </div>
          </div>
          {isLoading && <div className="sci-skeleton" style={{ height: 160 }} />}
          {!isLoading && datasets.length === 0 && (
            <div className="sci-state" style={{ padding: '2rem 1rem' }}>
              No approved datasets assigned yet. Contact your administrator to grant access.
            </div>
          )}
          {!isLoading && datasets.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {latest.map((d) => (
                <Link
                  key={d.version_id}
                  to={`/scientist/datasets/${d.dataset_id}/versions/${d.version_id}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.85rem 0',
                    borderBottom: '1px solid #f1f5f9',
                    textDecoration: 'none',
                    color: '#0f172a',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <strong style={{ fontSize: '0.92rem' }}>{d.dataset_name}</strong>
                      <span className="sci-pill sci-pill--version">{d.version_tag}</span>
                    </div>
                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                      {d.location_name} • {d.source}
                    </span>
                  </div>
                  <span className="sci-pill sci-pill--approved">{d.approval_status}</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="admin-card">
          <div className="admin-card__header">
            <div>
              <h2 className="admin-card__title">Data Science Workflow</h2>
              <p className="admin-card__subtitle">End-to-end traffic forecasting pipeline</p>
            </div>
          </div>
          <ol className="sci-flow">
            {WORKFLOW.map(([title, text], i) => (
              <li key={title}>
                <span className="sci-flow__num">{i + 1}</span>
                <span><b>{title}</b>{text}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  )
}

import { Link } from 'react-router-dom'
import { Database, Layers, MapPin, Radio, ChevronRight, Eye, Sparkles } from 'lucide-react'
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem' }}>
              {[1, 2, 3].map((n) => (
                <div key={n} className="sci-skeleton" style={{ height: 75 }} />
              ))}
            </div>
          )}

          {!isLoading && datasets.length === 0 && (
            <div className="sci-state" style={{ padding: '2.5rem 1rem' }}>
              <p style={{ margin: 0, fontWeight: 600 }}>No approved datasets assigned yet.</p>
              <p style={{ margin: '0.3rem 0 0', fontSize: '0.82rem', color: '#94a3b8' }}>
                Contact your system administrator to grant dataset permissions.
              </p>
            </div>
          )}

          {!isLoading && datasets.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', padding: '0.85rem' }}>
              {latest.map((d) => (
                <Link
                  key={d.version_id}
                  to={`/scientist/datasets/${d.dataset_id}/versions/${d.version_id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.9rem 1.1rem',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    background: '#ffffff',
                    textDecoration: 'none',
                    color: '#0f172a',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#93c5fd'
                    e.currentTarget.style.boxShadow = '0 6px 18px rgba(22, 104, 227, 0.1)'
                    e.currentTarget.style.transform = 'translateY(-2px)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e2e8f0'
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(15, 23, 42, 0.04)'
                    e.currentTarget.style.transform = 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                        color: '#1668e3',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Database size={20} />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                          {d.dataset_name}
                        </span>
                        <span className="sci-pill sci-pill--version">{d.version_tag}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', fontSize: '0.78rem', color: '#64748b' }}>
                        {d.location_name && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <MapPin size={12} /> {d.location_name}
                          </span>
                        )}
                        {d.source && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Layers size={12} /> {d.source}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <span className="sci-pill sci-pill--approved">{d.approval_status}</span>
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        color: '#1668e3',
                        padding: '0.35rem 0.65rem',
                        borderRadius: '8px',
                        background: '#eff6ff',
                      }}
                    >
                      <Eye size={13} /> Preview <ChevronRight size={14} />
                    </span>
                  </div>
                </Link>
              ))}
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

          <div style={{ padding: '0.5rem 1rem 1rem' }}>
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

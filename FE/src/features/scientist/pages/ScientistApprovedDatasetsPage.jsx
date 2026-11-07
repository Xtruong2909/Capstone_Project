import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, RefreshCw, FileSearch, LayoutGrid, List, Eye, ShieldCheck, MapPin, Database, FlaskConical, TrendingUp } from 'lucide-react'
import { useApprovedDatasets } from '../../../hooks/useScientistData'
import DatasetCard from '../components/DatasetCard'

export default function ScientistApprovedDatasetsPage() {
  const navigate = useNavigate()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'table'
  const { datasets, isLoading, error, reload } = useApprovedDatasets(search)

  const datasetPath = (item) => `/scientist/datasets/${item.dataset_id}/versions/${item.version_id}`
  const openPreview = (item) => navigate(datasetPath(item))
  const openTraining = (item) => navigate(`${datasetPath(item)}/train`)
  const openPrediction = (item) => navigate(`${datasetPath(item)}/predict`)

  return (
    <div className="sci-page">
      <section className="admin-card">
        <div className="admin-card__header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div>
              <h2 className="admin-card__title">Approved Datasets Browser</h2>
              <p className="admin-card__subtitle">
                Official UAV traffic datasets cleaned by Data Engineers and approved by Admin.
              </p>
            </div>
            {!isLoading && datasets.length > 0 && (
              <span className="badge badge--engineer" style={{ marginLeft: 'auto', alignSelf: 'flex-start' }}>
                {datasets.length} approved version{datasets.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        <form
          className="sci-toolbar"
          onSubmit={(e) => {
            e.preventDefault()
            setSearch(searchInput)
          }}
        >
          <div className="sci-toolbar__left">
            <div className="sci-search">
              <Search size={16} />
              <input
                className="admin-input"
                placeholder="Search by dataset name, code, or location..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <button type="submit" className="btn-action btn-action--primary">
              Search
            </button>
            {search && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setSearchInput('')
                  setSearch('')
                }}
              >
                Clear
              </button>
            )}
          </div>

          <div className="sci-toolbar__right">
            <div className="sci-tabs" style={{ background: '#f1f5f9' }}>
              <button
                type="button"
                className={viewMode === 'grid' ? 'active' : ''}
                onClick={() => setViewMode('grid')}
                title="Grid view"
              >
                <LayoutGrid size={15} style={{ verticalAlign: 'middle' }} />
              </button>
              <button
                type="button"
                className={viewMode === 'table' ? 'active' : ''}
                onClick={() => setViewMode('table')}
                title="Table view"
              >
                <List size={15} style={{ verticalAlign: 'middle' }} />
              </button>
            </div>
            <button type="button" className="btn-secondary" onClick={reload} title="Refresh dataset list">
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </form>
      </section>

      {isLoading && (
        <div className="sci-grid">
          {[1, 2, 3].map((n) => (
            <div key={n} className="sci-skeleton" />
          ))}
        </div>
      )}

      {!isLoading && error && (
        <div className="sci-state sci-state--error">
          <p style={{ margin: 0, fontWeight: 700 }}>{error}</p>
          <button
            type="button"
            className="btn-secondary"
            style={{ marginTop: '0.8rem' }}
            onClick={reload}
          >
            Retry Loading
          </button>
        </div>
      )}

      {!isLoading && !error && datasets.length === 0 && (
        <div className="sci-state">
          <FileSearch size={36} style={{ marginBottom: '0.6rem', color: '#94a3b8' }} />
          <h3 style={{ margin: '0 0 0.3rem', color: '#0f172a' }}>
            {search ? 'No datasets matched your search' : 'No approved datasets available'}
          </h3>
          <p style={{ margin: 0, fontSize: '0.85rem' }}>
            {search
              ? 'Try adjusting your search keywords.'
              : 'Datasets must be approved by Admin and granted access to your Data Scientist account.'}
          </p>
        </div>
      )}

      {!isLoading && !error && datasets.length > 0 && viewMode === 'grid' && (
        <div className="sci-grid">
          {datasets.map((item) => (
            <DatasetCard
              key={item.version_id}
              item={item}
              onPreview={openPreview}
              onTrain={openTraining}
              onPredict={openPrediction}
            />
          ))}
        </div>
      )}

      {!isLoading && !error && datasets.length > 0 && viewMode === 'table' && (
        <div className="admin-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Code / Name</th>
                  <th>Version</th>
                  <th>Source</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {datasets.map((item) => (
                  <tr key={item.version_id}>
                    <td>
                      <span className="sci-card__code">{item.dataset_code}</span>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{item.dataset_name}</div>
                    </td>
                    <td>
                      <span className="sci-pill sci-pill--version">{item.version_tag}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.82rem' }}>
                        <Database size={13} style={{ color: '#94a3b8' }} />
                        {item.source}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.82rem' }}>
                        <MapPin size={13} style={{ color: '#94a3b8' }} />
                        {item.location_name}
                      </div>
                    </td>
                    <td>
                      <span className="sci-pill sci-pill--approved">
                        <ShieldCheck size={12} /> {item.approval_status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div className="sci-icon-actions" style={{ justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="sci-action-chip"
                          onClick={() => openTraining(item)}
                          title="Open Training Pipeline"
                        >
                          <FlaskConical size={14} />
                          <span>Train</span>
                        </button>
                        <button
                          type="button"
                          className="sci-action-chip"
                          onClick={() => openPrediction(item)}
                          title="Open Prediction Insight"
                        >
                          <TrendingUp size={14} />
                          <span>Predict</span>
                        </button>
                        <button
                          type="button"
                          className="sci-action-chip sci-action-chip--primary"
                          onClick={() => openPreview(item)}
                          title="Open Dataset Detail & Preview"
                        >
                          <Eye size={14} />
                          <span>Preview</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

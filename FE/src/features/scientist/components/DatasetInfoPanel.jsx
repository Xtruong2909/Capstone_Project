import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Database,
  MapPin,
  ShieldCheck,
  FileSpreadsheet,
  HardDrive,
  Layers,
  Eye,
  FlaskConical,
  TrendingUp,
  Info,
} from 'lucide-react'
import { formatBytes, formatNumber } from '../utils/formatters'

/** Format dataset_code so auto-generated 32-char hex codes don't look like raw hashes. */
function formatDatasetCode(code) {
  if (!code) return 'DATASET'
  if (/^DATASET_[0-9A-F]{16,}$/i.test(code)) {
    return `DS-${code.slice(8, 14).toUpperCase()}`
  }
  return code
}

/**
 * Top navigation bar + Dataset detail card shared by Training and Prediction pages.
 */
export default function DatasetInfoPanel({
  item,
  datasets = [],
  datasetId,
  versionId,
  preview,
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

  const totalRows = preview?.pagination?.total_rows
  const returnedRows = preview?.pagination?.returned_rows ?? preview?.rows?.length ?? 0
  const rowCountLabel =
    totalRows != null
      ? `${formatNumber(totalRows)} rows`
      : returnedRows > 0
        ? `${formatNumber(returnedRows)}+ rows`
        : '—'

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
        <div className="sci-skeleton" style={{ height: 150 }} />
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
                  <span className="sci-card__code" title={item.dataset_code}>
                    {formatDatasetCode(item.dataset_code)}
                  </span>
                  <h2 className="admin-card__title">{item.dataset_name}</h2>
                  <span className="sci-pill sci-pill--version">{item.version_tag}</span>
                  <span className="sci-pill sci-pill--approved">
                    <ShieldCheck size={12} /> {item.approval_status}
                  </span>
                </div>
                <p className="admin-card__subtitle">
                  {item.location_name && `${item.location_name} • `}
                  {item.source && `Source: ${item.source.toUpperCase()} • `}
                  {preview?.original_filename ? `File: ${preview.original_filename}` : 'Approved UAV traffic dataset'}
                </p>
              </div>
            </div>

            {/* Mode Switcher: Preview / Training / Prediction */}
            <div className="sci-mode-switch">
              <Link
                to={basePath}
                className={`sci-mode-switch__btn ${activeMode === 'preview' ? 'active' : ''}`}
              >
                <Eye size={14} /> Data Preview
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

          <div className="sci-card-body">
            {/* 4 Clean Summary Tiles */}
            <div className="sci-info-grid">
              <div className="sci-info-tile">
                <div className="sci-info-tile__icon sci-info-tile__icon--blue">
                  <MapPin size={17} />
                </div>
                <div className="sci-info-tile__content">
                  <small>Location & Source</small>
                  <span>{item.location_name || '—'}</span>
                  <em>Source: {(item.source || 'uav').toUpperCase()}</em>
                </div>
              </div>

              <div className="sci-info-tile">
                <div className="sci-info-tile__icon sci-info-tile__icon--purple">
                  <FileSpreadsheet size={17} />
                </div>
                <div className="sci-info-tile__content">
                  <small>Dataset File</small>
                  <span title={preview?.original_filename || ''}>
                    {preview?.original_filename || 'Loading file info…'}
                  </span>
                  <em>Version {item.version_tag}</em>
                </div>
              </div>

              <div className="sci-info-tile">
                <div className="sci-info-tile__icon sci-info-tile__icon--green">
                  <HardDrive size={17} />
                </div>
                <div className="sci-info-tile__content">
                  <small>Format & Storage</small>
                  <span>
                    {(preview?.file_format || 'Parquet').toUpperCase()}
                    {preview?.file_size != null ? ` · ${formatBytes(preview.file_size)}` : ''}
                  </span>
                  <em>{preview?.detected_structure || 'Normalized trajectory'}</em>
                </div>
              </div>

              <div className="sci-info-tile">
                <div className="sci-info-tile__icon sci-info-tile__icon--amber">
                  <Layers size={17} />
                </div>
                <div className="sci-info-tile__content">
                  <small>Records & Schema</small>
                  <span>{rowCountLabel}</span>
                  <em>{preview?.columns ? `${preview.columns.length} schema columns` : 'Approved by Admin'}</em>
                </div>
              </div>
            </div>

            {/* Compact Schema Columns Bar */}
            {preview?.columns && preview.columns.length > 0 && (
              <div className="sci-schema-bar">
                <div className="sci-schema-bar__label">
                  <Info size={14} style={{ color: '#1668e3', flexShrink: 0 }} />
                  <span>Schema Columns ({preview.columns.length}):</span>
                </div>
                <div className="sci-chips">
                  {preview.columns.map((c) => (
                    <span key={c.name} className="sci-chip" title={`Data type: ${c.type}`}>
                      {c.name} <small>{c.type}</small>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </>
  )
}

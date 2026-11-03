import { useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Play,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Layers,
  Info,
  Clock,
  Database,
} from 'lucide-react'
import { useApprovedDatasets, useDatasetPreview } from '../../../hooks/useScientistData'
import {
  useAggregationJob,
  useAggregationStatus,
  useCalculationSummary,
} from '../../../hooks/useTrafficForecast'
import DatasetInfoPanel from '../components/DatasetInfoPanel'
import AggregationExplorer from '../components/AggregationExplorer'
import { formatDate, formatNumber } from '../utils/formatters'

const INTERVAL_OPTIONS = [60, 120, 180, 300, 600, 900]
const DEFAULT_ROI = 'MAIN_ROI'

export default function ScientistTrainingPage() {
  const { datasetId, versionId } = useParams()

  const { datasets, isLoading: isLoadingList } = useApprovedDatasets('')
  const meta = datasets.find((d) => d.dataset_id === datasetId && d.version_id === versionId)
  const { preview } = useDatasetPreview(datasetId, versionId, {
    page: 1,
    pageSize: 1,
    representation: 'normalized',
  })

  // Aggregation parameters (POST body / query of the aggregation APIs)
  const [aggregationInterval, setAggregationInterval] = useState(60)
  const [roiInput, setRoiInput] = useState(DEFAULT_ROI)
  const [replaceExisting, setReplaceExisting] = useState(false)
  const roiIdentifier = roiInput.trim() || DEFAULT_ROI

  const {
    status,
    isLoading: isLoadingStatus,
    error: statusError,
    reload: reloadStatus,
  } = useAggregationStatus(datasetId, { aggregationInterval, roiIdentifier })

  const { summary } = useCalculationSummary(datasetId, { aggregationInterval, roiIdentifier })

  // When the job finishes: refresh status and reload charts/table
  const [explorerRefreshKey, setExplorerRefreshKey] = useState(0)
  const handleJobFinished = () => {
    reloadStatus()
    setExplorerRefreshKey((k) => k + 1)
  }
  const { job, isStarting, isRunning, error: jobError, start } = useAggregationJob(
    datasetId,
    handleJobFinished
  )

  const handleRunAggregation = () => start({ aggregationInterval, roiIdentifier, replaceExisting })

  return (
    <div className="sci-page">
      <DatasetInfoPanel
        item={meta}
        datasets={datasets}
        datasetId={datasetId}
        versionId={versionId}
        preview={preview}
        isLoading={isLoadingList}
      />

      {/* Step 1 - Temporal aggregation */}
      <section className="admin-card">
        <div className="admin-card__header">
          <div className="admin-card__header-left">
            <div className="admin-card__icon-box admin-card__icon-box--purple">
              <Layers size={18} />
            </div>
            <div>
              <h2 className="admin-card__title">Step 1 · Temporal Aggregation Pipeline</h2>
              <p className="admin-card__subtitle">
                Aggregate raw UAV trajectories into fixed time buckets (vehicle count, average speed, traffic flow).
              </p>
            </div>
          </div>

          <button
            type="button"
            className="btn-secondary"
            onClick={reloadStatus}
            disabled={isLoadingStatus}
          >
            <RefreshCw size={14} /> Refresh Status
          </button>
        </div>

        <div className="sci-card-body">
          <div className="sci-params-bar">
            <div className="sci-params-bar__controls">
              <div className="sci-params-bar__group">
                <span className="sci-params-bar__label">Interval:</span>
                <select
                  className="sci-dataset-select"
                  value={aggregationInterval}
                  onChange={(e) => setAggregationInterval(Number(e.target.value))}
                  disabled={isRunning}
                >
                  {INTERVAL_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s} s ({s / 60} min)
                    </option>
                  ))}
                </select>
              </div>

              <div className="sci-params-bar__group">
                <span className="sci-params-bar__label">ROI:</span>
                <input
                  className="admin-input"
                  style={{ width: 160 }}
                  value={roiInput}
                  maxLength={64}
                  onChange={(e) => setRoiInput(e.target.value)}
                  disabled={isRunning}
                />
              </div>

              <label className="sci-params-bar__group" style={{ cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={replaceExisting}
                  onChange={(e) => setReplaceExisting(e.target.checked)}
                  disabled={isRunning}
                />
                <span className="sci-params-bar__label">Replace existing</span>
              </label>
            </div>

            <div className="sci-params-bar__actions">
              <button
                type="button"
                className="btn-action btn-action--primary"
                onClick={handleRunAggregation}
                disabled={isStarting || isRunning}
              >
                {isStarting || isRunning ? (
                  <Loader2 size={14} className="sci-spin" />
                ) : (
                  <Play size={14} />
                )}
                Run Aggregation
              </button>
            </div>
          </div>

          {jobError && <div className="sci-warning">{jobError}</div>}

          {job && (
            <div className="sci-job">
              <div className="sci-job__row">
                <span className={`sci-pill sci-job__status sci-job__status--${job.status}`}>
                  {job.status === 'completed' && <CheckCircle2 size={12} />}
                  {job.status === 'failed' && <XCircle size={12} />}
                  {isRunning && <Loader2 size={12} className="sci-spin" />}
                  {job.status}
                </span>
                <span className="sci-mono">Job ID: {job.job_id}</span>
                <span style={{ marginLeft: 'auto', fontWeight: 700, color: '#0f172a' }}>
                  {formatNumber(job.records_created)} records created
                </span>
              </div>
              <div className="sci-progress">
                <div style={{ width: `${job.progress_percent ?? 0}%` }} />
              </div>
              {job.error_message && <div className="sci-warning">{job.error_message}</div>}
            </div>
          )}

          {/* Aggregation Status Box */}
          <div className="sci-status-box">
            {statusError ? (
              <span style={{ color: '#b91c1c', fontWeight: 600 }}>{statusError}</span>
            ) : isLoadingStatus ? (
              <span>Loading aggregation status...</span>
            ) : (
              <>
                <span className={`sci-pill ${status?.is_ready ? 'sci-pill--approved' : 'sci-pill--format'}`}>
                  <CheckCircle2 size={12} />
                  {status?.is_ready ? 'Ready' : 'Not aggregated yet'}
                </span>
                <span className="sci-status-box__item">
                  <Database size={14} />
                  <strong>{formatNumber(status?.records_count ?? 0)}</strong> saved buckets
                </span>
                <span className="sci-status-box__item">
                  <Clock size={14} />
                  Last generated: <strong>{formatDate(status?.last_generated_at)}</strong>
                </span>
              </>
            )}
          </div>

          {summary && (
            <details className="sci-details">
              <summary>
                <Info size={15} /> View Metric Calculation Formulas & Logic
              </summary>
              <div className="sci-details__content">
                <div className="sci-table-wrap">
                  <table className="sci-table" style={{ fontFamily: 'inherit' }}>
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th>Formula</th>
                        <th>Unit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(summary.formulas || {}).map(([metric, formula]) => (
                        <tr key={metric}>
                          <td style={{ fontWeight: 700 }}>{metric}</td>
                          <td className="sci-mono">{formula}</td>
                          <td>{summary.units?.[metric]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {summary.notes && summary.notes.length > 0 && (
                  <div className="sci-details__notes">
                    {summary.notes.map((n) => (
                      <p key={n}>• {n}</p>
                    ))}
                  </div>
                )}
              </div>
            </details>
          )}
        </div>
      </section>

      {/* Step 2 - Aggregated charts + table (chart-data & preview APIs) */}
      <AggregationExplorer
        datasetId={datasetId}
        versionId={versionId}
        aggregationInterval={aggregationInterval}
        roiIdentifier={roiIdentifier}
        refreshKey={explorerRefreshKey}
        title="Step 2 · Aggregated Training Series & Charts"
        subtitle="Inspect time-series curves and aggregated rows generated in Step 1."
      />
    </div>
  )
}

import { useNavigate, useParams } from 'react-router-dom'
import { Eye, BarChart3, Loader2, FlaskConical, CheckCircle2 } from 'lucide-react'
import { useApprovedDatasets, useDatasetPreview } from '../../../hooks/useScientistData'
import {
  useOneMinuteVehicleAggregation,
  useTrainingFeatureEngineering,
} from '../../../hooks/useTrafficForecast'
import DatasetInfoPanel from '../components/DatasetInfoPanel'
import BarChart from '../components/BarChart'
import AggregationExplorer from '../components/AggregationExplorer'
import TrainingFeaturePanel from '../components/TrainingFeaturePanel'
import { formatDate, formatNumber } from '../utils/formatters'

export default function ScientistTrainingPage() {
  const { datasetId, versionId } = useParams()
  const navigate = useNavigate()

  const { datasets, isLoading: isLoadingList } = useApprovedDatasets('')
  const meta = datasets.find((d) => d.dataset_id === datasetId && d.version_id === versionId)
  const { preview } = useDatasetPreview(datasetId, versionId, {
    page: 1,
    pageSize: 1,
    representation: 'normalized',
  })

  const { chart, statusInfo, isLoading, isCalculating, progress, error, aggregateOneMinute } =
    useOneMinuteVehicleAggregation(datasetId)

  const {
    featureData,
    isLoading: isGeneratingFeatures,
    error: featureError,
    generateTrainingFeatures,
  } = useTrainingFeatureEngineering(datasetId, versionId)

  const handleReviewDataset = () => {
    navigate(`/scientist/datasets/${datasetId}/versions/${versionId}`)
  }

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

      {/* Section 1: Training Actions + 1-Minute Vehicle Aggregation Bar Chart */}
      <section className="admin-card">
        <div className="admin-card__header">
          <div className="admin-card__header-left">
            <div className="admin-card__icon-box admin-card__icon-box--purple">
              <FlaskConical size={18} />
            </div>
            <div>
              <h2 className="admin-card__title">Training · 1-Minute Vehicle Aggregation</h2>
              <p className="admin-card__subtitle">
                Review dataset records or aggregate vehicle counts into 1-minute buckets for model training.
              </p>
            </div>
          </div>

          <div className="sci-train-actions">
            <button
              type="button"
              className="btn-secondary sci-train-btn"
              onClick={handleReviewDataset}
            >
              <Eye size={16} />
              <span>Review Dataset</span>
            </button>

            <button
              type="button"
              className="btn-action btn-action--primary sci-train-btn"
              onClick={aggregateOneMinute}
              disabled={isLoading || isCalculating}
            >
              {isCalculating ? (
                <Loader2 size={16} className="sci-spin" />
              ) : (
                <BarChart3 size={16} />
              )}
              <span>
                {isCalculating
                  ? 'Calculating...'
                  : 'Aggregate Vehicles (1 Min)'}
              </span>
            </button>
          </div>
        </div>

        <div className="sci-card-body">
          {isLoading && (
            <div className="sci-state" role="status">
              <Loader2 size={20} className="sci-spin" /> Loading saved vehicle aggregation...
            </div>
          )}

          {/* Calculating state */}
          {isCalculating && (
            <div className="sci-job">
              <div className="sci-job__row">
                <span className="sci-pill sci-job__status">
                  <Loader2 size={12} className="sci-spin" />
                  Calculating 1-minute vehicle aggregation...
                </span>
                <span style={{ marginLeft: 'auto', fontWeight: 700 }}>{progress}%</span>
              </div>
              <div className="sci-progress">
                <div style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="sci-state sci-state--error">
              <p style={{ margin: 0, fontWeight: 700 }}>{error}</p>
            </div>
          )}

          {/* Show the empty prompt only after checking saved results. */}
          {!isLoading && !isCalculating && !error && !chart && (
            <div className="sci-state">
              <BarChart3 size={34} style={{ marginBottom: '0.5rem', color: '#94a3b8' }} />
              <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.25rem' }}>
                No vehicle aggregation generated yet
              </div>
              <div style={{ fontSize: '0.84rem' }}>
                Click <strong>&ldquo;Aggregate Vehicles (1 Min)&rdquo;</strong> above to compute and display the interactive bar chart.
              </div>
            </div>
          )}

          {/* Saved or newly generated aggregation results. */}
          {!isLoading && !isCalculating && chart && (
            <>
              {statusInfo && (
                <div className="sci-status-box">
                  <span className="sci-pill sci-pill--approved">
                    <CheckCircle2 size={12} /> Aggregated (60s / 1 min)
                  </span>
                  <span className="sci-status-box__item">
                    Total buckets: <strong>{formatNumber(statusInfo.records_count)}</strong> min
                  </span>
                  {statusInfo.last_generated_at && (
                    <span className="sci-status-box__item">
                      Last generated: <strong>{formatDate(statusInfo.last_generated_at)}</strong>
                    </span>
                  )}
                </div>
              )}

              <BarChart
                labels={chart.time_labels}
                values={chart.vehicle_count}
              />
            </>
          )}
        </div>
      </section>

      {!isLoading && !isCalculating && chart && (
        <AggregationExplorer
          key={`aggregation:${datasetId}:${versionId}`}
          datasetId={datasetId}
          versionId={versionId}
          aggregationInterval={60}
          roiIdentifier="MAIN_ROI"
          title="Training · 1-Minute Traffic Charts"
        />
      )}

      {/* Feature Engineering - Training Samples (POST /api/feature-engineering/training) */}
      <TrainingFeaturePanel
        key={`features:${datasetId}:${versionId}`}
        featureData={featureData}
        isLoading={isGeneratingFeatures}
        error={featureError}
        onGenerate={generateTrainingFeatures}
      />
    </div>
  )
}

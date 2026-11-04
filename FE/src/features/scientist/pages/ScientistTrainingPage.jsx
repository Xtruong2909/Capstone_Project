import { useNavigate, useParams } from 'react-router-dom'
import { Eye, BarChart3, Loader2, FlaskConical, CheckCircle2 } from 'lucide-react'
import { useApprovedDatasets, useDatasetPreview } from '../../../hooks/useScientistData'
import {
  useOneMinuteVehicleAggregation,
  useTrainingFeatureEngineering,
} from '../../../hooks/useTrafficForecast'
import DatasetInfoPanel from '../components/DatasetInfoPanel'
import BarChart from '../components/BarChart'
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

  const { chart, statusInfo, isCalculating, progress, error, aggregateOneMinute } =
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
              <h2 className="admin-card__title">Training · Tổng hợp phương tiện (1 phút)</h2>
              <p className="admin-card__subtitle">
                Xem chi tiết dữ liệu hoặc tổng hợp số lượng phương tiện trong từng khung 1 phút để phục vụ huấn luyện.
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
              disabled={isCalculating}
            >
              {isCalculating ? (
                <Loader2 size={16} className="sci-spin" />
              ) : (
                <BarChart3 size={16} />
              )}
              <span>
                {isCalculating
                  ? 'Đang tính toán...'
                  : 'Tổng hợp phương tiện trong 1 phút'}
              </span>
            </button>
          </div>
        </div>

        <div className="sci-card-body">
          {/* Calculating state */}
          {isCalculating && (
            <div className="sci-job">
              <div className="sci-job__row">
                <span className="sci-pill sci-job__status">
                  <Loader2 size={12} className="sci-spin" />
                  Đang tính toán tổng hợp phương tiện theo khung 1 phút...
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

          {/* Empty prompt before user clicks the aggregate button */}
          {!isCalculating && !error && !chart && (
            <div className="sci-state">
              <BarChart3 size={34} style={{ marginBottom: '0.5rem', color: '#94a3b8' }} />
              <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.25rem' }}>
                Chưa tổng hợp phương tiện
              </div>
              <div style={{ fontSize: '0.84rem' }}>
                Nhấn nút <strong>&ldquo;Tổng hợp phương tiện trong 1 phút&rdquo;</strong> ở góc trên để tính toán và hiển thị biểu đồ cột.
              </div>
            </div>
          )}

          {/* Bar chart result after clicking the button */}
          {!isCalculating && chart && (
            <>
              {statusInfo && (
                <div className="sci-status-box">
                  <span className="sci-pill sci-pill--approved">
                    <CheckCircle2 size={12} /> Đã tổng hợp (60s / 1 phút)
                  </span>
                  <span className="sci-status-box__item">
                    Tổng số khung: <strong>{formatNumber(statusInfo.records_count)}</strong> phút
                  </span>
                  {statusInfo.last_generated_at && (
                    <span className="sci-status-box__item">
                      Cập nhật lúc: <strong>{formatDate(statusInfo.last_generated_at)}</strong>
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

      {/* Section 2: Feature Engineering - Training Samples (POST /api/feature-engineering/training) */}
      <TrainingFeaturePanel
        featureData={featureData}
        isLoading={isGeneratingFeatures}
        error={featureError}
        onGenerate={generateTrainingFeatures}
      />
    </div>
  )
}

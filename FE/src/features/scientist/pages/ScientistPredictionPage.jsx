import { useRef } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { useApprovedDatasets } from '../../../hooks/useScientistData'
import {
  usePredictionFeatureEngineering,
  useTrafficPrediction,
  useModelTrainingExperiments,
  useTrainTestSplit,
} from '../../../hooks/useTrafficForecast'
import DatasetInfoPanel from '../components/DatasetInfoPanel'
import PredictionFeaturePanel from '../components/PredictionFeaturePanel'
import TrafficPredictionPanel from '../components/TrafficPredictionPanel'
import AggregationExplorer from '../components/AggregationExplorer'

/**
 * Prediction page:
 *  - Step 1: POST /api/feature-engineering/prediction (Lag features for prediction)
 *  - Step 2: POST /api/model-training/predict (Forecast +1, +3, +5 min & 3 visualizations)
 *  - Historical: GET .../traffic/aggregation/preview & chart-data
 */
export default function ScientistPredictionPage() {
  const { datasetId, versionId } = useParams()
  const { search } = useLocation()
  const preferredExperimentId = new URLSearchParams(search).get('experimentId')
  const predictSectionRef = useRef(null)

  const { datasets, isLoading: isLoadingList } = useApprovedDatasets('')
  const meta = datasets.find((d) => d.dataset_id === datasetId && d.version_id === versionId)
  const {
    featureData,
    isLoading: isGeneratingFeatures,
    error: featureError,
    generatePredictionFeatures,
  } = usePredictionFeatureEngineering(datasetId, versionId)

  const {
    forecastData,
    isPredicting,
    predictError,
    predictErrorCode,
    runTrafficPrediction,
  } = useTrafficPrediction(datasetId, versionId)

  const { experiments } = useModelTrainingExperiments(versionId)
  const { splitData } = useTrainTestSplit(datasetId, versionId)

  const handleProceedToPredict = () => {
    predictSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleAskAiAboutForecast = (forecast) => {
    const summaryText = Array.isArray(forecast?.predictions)
      ? forecast.predictions
          .map((p) => `+${p.horizon}m: ${p.predicted_flow} xe/phút`)
          .join(', ')
      : ''
    window.dispatchEvent(
      new CustomEvent('sci-ai-assistant:open', {
        detail: {
          action: 'CHAT',
          autoSend: true,
          datasetVersionId: versionId,
          modelId: forecast?.model_id,
          experimentIds: forecast?.experiment_id ? [forecast.experiment_id] : undefined,
          message: `Giải thích kết quả dự báo lưu lượng giao thông vừa chạy (quan sát cuối: ${forecast?.last_observed_flow} xe/phút; dự báo ${summaryText}) và nhận xét xu hướng.`,
          userDisplayLabel: 'Phân tích kết quả dự báo (+1, +3, +5 phút) bằng AI',
        },
      })
    )
  }

  return (
    <div className="sci-page">
      <DatasetInfoPanel
        item={meta}
        datasets={datasets}
        datasetId={datasetId}
        versionId={versionId}
        isLoading={isLoadingList}
      />

      {/* Historical Traffic Aggregation Explorer */}
      <AggregationExplorer
        key={`aggregation:${datasetId}:${versionId}`}
        datasetId={datasetId}
        versionId={versionId}
        title="Prediction · Traffic Flow & Speed Forecast Insight"
        subtitle="Analyze historical traffic trends and time-bucket metrics for forecasting."
      />

      {/* Step 1: Tạo Đặc trưng cho Dự báo (POST /api/feature-engineering/prediction) */}
      <PredictionFeaturePanel
        key={`pred-features:${datasetId}:${versionId}`}
        featureData={featureData}
        datasetMeta={meta}
        forecastData={forecastData}
        isLoading={isGeneratingFeatures}
        error={featureError}
        onGenerate={generatePredictionFeatures}
        onProceedToPredict={handleProceedToPredict}
      />

      {/* Step 2: Dự báo Lưu lượng +1, +3, +5 phút (POST /api/model-training/predict) */}
      <div ref={predictSectionRef}>
        <TrafficPredictionPanel
          key={`pred-model:${datasetId}:${versionId}`}
          versionId={versionId}
          datasetMeta={meta}
          experiments={experiments}
          preferredExperimentId={preferredExperimentId}
          savedSplitId={splitData?.split_id || null}
          forecastData={forecastData}
          isPredicting={isPredicting}
          predictError={predictError}
          predictErrorCode={predictErrorCode}
          onRunPrediction={runTrafficPrediction}
          onAskAiAboutForecast={handleAskAiAboutForecast}
        />
      </div>
    </div>
  )
}

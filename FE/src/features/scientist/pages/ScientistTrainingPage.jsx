import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Eye, BarChart3, Loader2, FlaskConical, CheckCircle2 } from 'lucide-react'
import { useApprovedDatasets } from '../../../hooks/useScientistData'
import {
  useOneMinuteVehicleAggregation,
  useTrainingFeatureEngineering,
  useTrainTestSplit,
  useModelTrainingExperiments,
} from '../../../hooks/useTrafficForecast'
import DatasetInfoPanel from '../components/DatasetInfoPanel'
import BarChart from '../components/BarChart'
import AggregationExplorer from '../components/AggregationExplorer'
import TrainingPipelineStepper from '../components/TrainingPipelineStepper'
import TrainingFeaturePanel from '../components/TrainingFeaturePanel'
import TrainTestSplitPanel from '../components/TrainTestSplitPanel'
import ExperimentConfigPanel from '../components/ExperimentConfigPanel'
import ExperimentListDetailPanel from '../components/ExperimentListDetailPanel'
import ExperimentComparePanel from '../components/ExperimentComparePanel'
import { formatDate, formatNumber } from '../utils/formatters'

export default function ScientistTrainingPage() {
  const { datasetId, versionId } = useParams()
  const navigate = useNavigate()
  const pipelineSectionRef = useRef(null)

  const [activeStep, setActiveStep] = useState(1)
  const [overrideSplitContext, setOverrideSplitContext] = useState(null)
  const [selectedCompareIds, setSelectedCompareIds] = useState([])

  const { datasets, isLoading: isLoadingList } = useApprovedDatasets('')
  const meta = datasets.find((d) => d.dataset_id === datasetId && d.version_id === versionId)
  const { chart, statusInfo, isLoading, isCalculating, progress, error, aggregateOneMinute } =
    useOneMinuteVehicleAggregation(datasetId)

  const {
    featureData,
    isLoading: isGeneratingFeatures,
    error: featureError,
    generateTrainingFeatures,
  } = useTrainingFeatureEngineering(datasetId, versionId)

  const {
    splitData,
    isSplitting,
    splitError,
    runTrainTestSplit,
  } = useTrainTestSplit(datasetId, versionId)

  const {
    experiments,
    isLoadingList: isLoadingExperiments,
    listError: experimentsError,
    reloadExperiments,
    latestExperiment,
    setLatestExperiment,
    isTraining,
    trainError,
    setTrainError,
    runExperiment,
    selectedExperiment,
    setSelectedExperiment,
    isLoadingDetail,
    detailError,
    loadExperimentDetail,
    comparisonData,
    isComparing,
    compareError,
    compareExperiments,
  } = useModelTrainingExperiments(versionId)

  const sampleCount = featureData?.sample_count ?? featureData?.samples?.length ?? 0

  // Resolve the active split context for Step 3 (from override, or splitData, or latest experiment)
  const activeSplitContext = useMemo(() => {
    if (overrideSplitContext?.splitId) {
      return overrideSplitContext
    }
    if (splitData?.split_id) {
      return {
        splitId: splitData.split_id,
        trainCount: splitData.train_count,
        testCount: splitData.test_count,
        officialEligible: splitData.official_evaluation_eligible,
        evaluationMode: 'exploratory',
      }
    }
    if (experiments.length > 0 && experiments[0]?.split_id) {
      const latest = experiments[0]
      const inferredTest = latest.result_tables?.horizon_forecasts?.[0]?.sample_count ?? null
      return {
        splitId: latest.split_id,
        trainCount: null,
        testCount: inferredTest,
        officialEligible: latest.official_evaluation_eligible,
        evaluationMode: latest.evaluation_mode || 'exploratory',
      }
    }
    return null
  }, [overrideSplitContext, splitData, experiments])

  const completedSteps = useMemo(() => {
    const done = []
    if (sampleCount >= 2) done.push(1)
    if (splitData?.split_id) done.push(2)
    if (latestExperiment || experiments.length > 0) done.push(3)
    if (experiments.length > 0) done.push(4)
    if (comparisonData?.experiments?.length >= 2) done.push(5)
    return done
  }, [sampleCount, splitData, latestExperiment, experiments.length, comparisonData])

  const unlockedSteps = useMemo(() => {
    const unlocked = [1, 4, 5]
    if (sampleCount >= 2 || splitData?.split_id) unlocked.push(2)
    if (activeSplitContext?.splitId) unlocked.push(3)
    return unlocked
  }, [sampleCount, splitData, activeSplitContext])

  const scrollToPipeline = () => {
    pipelineSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleReviewDataset = () => {
    navigate(`/scientist/datasets/${datasetId}/versions/${versionId}`)
  }

  // Step 1 -> Step 2
  const handleProceedToSplit = () => {
    setActiveStep(2)
    scrollToPipeline()
  }

  // Step 2: Run 70/30 Chronological Split
  const handleRunSplit = async () => {
    const res = await runTrainTestSplit(featureData, {
      trainRatio: 0.7,
      splitStrategy: 'chronological',
    })
    if (res?.split_id) {
      setOverrideSplitContext(null)
    }
  }

  // Step 2 -> Step 3
  const handleProceedToExperiment = () => {
    setOverrideSplitContext(null)
    setLatestExperiment(null)
    setTrainError(null)
    setActiveStep(3)
    scrollToPipeline()
  }

  // Step 3 -> View created experiment detail in Step 4
  const handleViewCreatedExperiment = async (exp) => {
    if (!exp?.experiment_id) return
    setSelectedExperiment(exp)
    setActiveStep(4)
    scrollToPipeline()
    await loadExperimentDetail(exp.experiment_id)
  }

  // Step 4 / Step 5 -> Reuse split_id in Step 3
  const handleCreateWithSameSplit = (exp) => {
    if (!exp?.split_id) return
    const matchesCurrentSplit =
      splitData && String(splitData.split_id) === String(exp.split_id)
    const inferredTest =
      exp.result_tables?.horizon_forecasts?.[0]?.sample_count ??
      (matchesCurrentSplit ? splitData.test_count : null)
    const inferredTrain = matchesCurrentSplit ? splitData.train_count : null

    setOverrideSplitContext({
      splitId: exp.split_id,
      trainCount: inferredTrain,
      testCount: inferredTest,
      officialEligible: exp.official_evaluation_eligible,
      evaluationMode: exp.evaluation_mode || 'exploratory',
    })
    setLatestExperiment(null)
    setTrainError(null)
    setActiveStep(3)
    scrollToPipeline()
  }

  // Step 4 -> Compare selected experiments in Step 5
  const handleCompareSelectedFromList = async (ids) => {
    setActiveStep(5)
    scrollToPipeline()
    await compareExperiments(ids)
  }

  // Step 5 -> Click "Chi tiết" on a column header
  const handleViewExperimentFromCompare = async (experimentId) => {
    setActiveStep(4)
    scrollToPipeline()
    await loadExperimentDetail(experimentId)
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

      {/* 5-Step Model Training & Experiment Pipeline */}
      <div ref={pipelineSectionRef} className="sci-train-pipeline-wrap">
        <TrainingPipelineStepper
          activeStep={activeStep}
          completedSteps={completedSteps}
          unlockedSteps={unlockedSteps}
          onStepClick={(step) => {
            if (step === 4) {
              setSelectedExperiment(null)
            }
            setActiveStep(step)
          }}
          sampleCount={sampleCount}
          splitData={splitData}
          experimentCount={experiments.length}
        />

        {/* Step 1: Tạo Lag Features (POST /api/feature-engineering/training) */}
        {activeStep === 1 && (
          <TrainingFeaturePanel
            key={`features:${datasetId}:${versionId}`}
            featureData={featureData}
            datasetMeta={meta}
            isLoading={isGeneratingFeatures}
            error={featureError}
            onGenerate={generateTrainingFeatures}
            onProceedToSplit={handleProceedToSplit}
          />
        )}

        {/* Step 2: Chia Train/Test 70/30 (POST /api/train-test-split/training) */}
        {activeStep === 2 && (
          <TrainTestSplitPanel
            key={`split:${datasetId}:${versionId}`}
            featureData={featureData}
            splitData={splitData}
            isSplitting={isSplitting}
            splitError={splitError}
            onRunSplit={handleRunSplit}
            onProceedToExperiment={handleProceedToExperiment}
            onBackToFeatures={() => setActiveStep(1)}
          />
        )}

        {/* Step 3: Cấu hình và chạy thí nghiệm (POST /api/model-training/experiment) */}
        {activeStep === 3 && (
          <ExperimentConfigPanel
            key={`exp-config:${datasetId}:${versionId}:${activeSplitContext?.splitId || 'none'}`}
            datasetMeta={meta}
            versionId={versionId}
            activeSplitContext={activeSplitContext}
            isTraining={isTraining}
            trainError={trainError}
            latestExperiment={latestExperiment}
            onRunExperiment={runExperiment}
            onViewExperimentDetail={handleViewCreatedExperiment}
            onResetLatestExperiment={() => {
              setLatestExperiment(null)
              setTrainError(null)
            }}
            onBackToSplit={() => setActiveStep(2)}
            onOpenExperimentList={() => {
              setSelectedExperiment(null)
              setActiveStep(4)
            }}
            experimentCount={experiments.length}
          />
        )}

        {/* Step 4: Danh sách và chi tiết thí nghiệm (GET /api/model-training/experiments & /{id}) */}
        {activeStep === 4 && (
          <ExperimentListDetailPanel
            key={`exp-list:${datasetId}:${versionId}`}
            datasetMeta={meta}
            versionId={versionId}
            experiments={experiments}
            isLoadingList={isLoadingExperiments}
            listError={experimentsError}
            onReloadList={reloadExperiments}
            selectedExperiment={selectedExperiment}
            isLoadingDetail={isLoadingDetail}
            detailError={detailError}
            onSelectExperiment={loadExperimentDetail}
            onBackToList={() => setSelectedExperiment(null)}
            onCreateWithSameSplit={handleCreateWithSameSplit}
            selectedCompareIds={selectedCompareIds}
            onChangeCompareIds={setSelectedCompareIds}
            onCompareSelected={handleCompareSelectedFromList}
            isComparing={isComparing}
          />
        )}

        {/* Step 5: So sánh thí nghiệm (POST /api/model-training/experiments/compare) */}
        {activeStep === 5 && (
          <ExperimentComparePanel
            key={`exp-compare:${datasetId}:${versionId}`}
            experiments={experiments}
            selectedCompareIds={selectedCompareIds}
            onChangeCompareIds={setSelectedCompareIds}
            onRunCompare={compareExperiments}
            comparisonData={comparisonData}
            isComparing={isComparing}
            compareError={compareError}
            onBackToList={() => {
              setSelectedExperiment(null)
              setActiveStep(4)
            }}
            onViewExperimentDetail={handleViewExperimentFromCompare}
            onCreateWithSameSplit={handleCreateWithSameSplit}
          />
        )}
      </div>
    </div>
  )
}

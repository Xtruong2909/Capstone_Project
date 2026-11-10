import { useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Eye, BarChart3, Loader2, CheckCircle2, GitCompareArrows, FlaskConical, ArrowRight, ArrowLeft, Clock3 } from 'lucide-react'
import { useApprovedDatasets } from '../../../hooks/useScientistData'
import { useTrainingWorkspace } from '../../../hooks/useTrainingWorkspace'
import {
  useOneMinuteVehicleAggregation,
  useTrainingFeatureEngineering,
  useTrainTestSplit,
  useModelTrainingExperiments,
} from '../../../hooks/useTrafficForecast'
import DatasetInfoPanel from '../components/DatasetInfoPanel'
import BarChart from '../components/BarChart'
import AggregationExplorer from '../components/AggregationExplorer'
import TrainingFeaturePanel from '../components/TrainingFeaturePanel'
import ExperimentSplitSection from '../components/ExperimentSplitSection'
import ExperimentConfigPanel from '../components/ExperimentConfigPanel'
import ExperimentListDetailPanel from '../components/ExperimentListDetailPanel'
import ExperimentComparePanel from '../components/ExperimentComparePanel'
import { formatDate, formatNumber, formatRecordingDateTime } from '../utils/formatters'

function TrainingWorkspace({ datasetId, versionId }) {
  const navigate = useNavigate()
  const location = useLocation()
  const reuseSplit = location.state?.reuseSplit || null
  const { activeTab, setActiveTab, showSplitDetails, setShowSplitDetails, comparisonOpen, setComparisonOpen } = useTrainingWorkspace(reuseSplit ? 'experiments' : 'preparation')
  const [overrideSplitContext, setOverrideSplitContext] = useState(reuseSplit)
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
    setComparisonData,
    isComparing,
    compareError,
    setCompareError,
    compareExperiments,
  } = useModelTrainingExperiments(versionId)

  const sampleCount = featureData?.sample_count ?? featureData?.samples?.length ?? 0
  const timeLabels = chart?.time_labels || []

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

  const aggregationStatus = error ? 'error' : isLoading || isCalculating ? 'processing' : chart ? 'completed' : 'pending'
  const splitOutdated = useMemo(() => {
    if (!splitData?.split_id || !featureData?.samples?.length) return false
    const samples = featureData.samples
    if (Number(splitData.total_samples) !== samples.length ||
      String(splitData.dataset_version_id) !== String(versionId) ||
      splitData.roi_identifier !== featureData.roi_identifier) return true
    const sampleByTime = new Map(samples.map((sample) => [new Date(sample.time_bucket).getTime(), sample]))
    for (const prefix of ['train', 'test']) {
      const times = splitData[prefix + '_times'] || []
      const xs = splitData['X_' + prefix] || []
      const ys = splitData['y_' + prefix] || []
      for (let index = 0; index < times.length; index += 1) {
        const sample = sampleByTime.get(new Date(times[index]).getTime())
        if (!sample || JSON.stringify(sample.x) !== JSON.stringify(xs[index]) || JSON.stringify(sample.y) !== JSON.stringify(ys[index])) return true
      }
    }
    return false
  }, [splitData, featureData, versionId])

  const handleAggregate = async () => {
    await aggregateOneMinute()
  }

  const handleReviewDataset = () => {
    navigate(`/scientist/datasets/${datasetId}/versions/${versionId}`)
  }

  // Step 2: Run 70/30 Chronological Split
  const handleRunSplit = async (sourceFeatures = featureData) => {
    const res = await runTrainTestSplit(sourceFeatures, {
      trainRatio: 0.7,
      splitStrategy: 'chronological',
    })
    if (res?.split_id) {
      setOverrideSplitContext(null)
    }
  }

  const handleProceedToSplit = async () => {
    if (splitData?.split_id) return
    setShowSplitDetails(true)
    let sourceFeatures = featureData
    if ((sourceFeatures?.samples?.length ?? 0) < 2) {
      sourceFeatures = await generateTrainingFeatures('MAIN_ROI')
    }
    if ((sourceFeatures?.samples?.length ?? 0) >= 2) {
      await handleRunSplit(sourceFeatures)
    }
  }

  // Step 2 -> Step 3
  const handleProceedToExperiment = () => {
    setOverrideSplitContext(null)
    setLatestExperiment(null)
    setTrainError(null)
    setShowSplitDetails(false)
    setActiveTab('experiments')
  }

  const handleRunExperiment = async (params) => {
    const experiment = await runExperiment(params)
    if (!experiment) return
    if (experiment.status === 'FAILED') {
      setTrainError(experiment.error || 'Thí nghiệm thất bại. Vui lòng kiểm tra cấu hình và thử lại.')
      return
    }
    if (!experiment.experiment_id) {
      setTrainError('Đã tạo thí nghiệm nhưng API không trả về mã thí nghiệm để mở trang kết quả.')
      return
    }
    navigate(`/scientist/experiments/${encodeURIComponent(datasetId)}/${encodeURIComponent(experiment.experiment_id)}`)
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
    setActiveTab('experiments')
  }

  // Step 4 -> Compare selected experiments in Step 5
  const handleCompareSelectedFromList = async (ids) => {
    setComparisonOpen(true)
    await compareExperiments(ids)
  }

  const openComparison = () => {
    setSelectedExperiment(null)
    setComparisonOpen(true)
    setActiveTab('analysis')
  }

  const handleChangeCompareIds = (ids) => {
    setSelectedCompareIds(ids)
    setComparisonData(null)
    setCompareError(null)
  }

  // Step 5 -> Click "Chi tiết" on a column header
  const handleViewExperimentFromCompare = async (experimentId) => {
    setSelectedExperiment(null)
    await loadExperimentDetail(experimentId)
  }

  return (
    <div className="sci-page">
      {activeTab === 'preparation' && (
        <>
          <DatasetInfoPanel
            item={meta}
            datasets={datasets}
            datasetId={datasetId}
            versionId={versionId}
            isLoading={isLoadingList}
          />
          <div className="sci-workspace-intro">
            <div>
              <span className="sci-workspace-eyebrow">DATA SCIENTIST WORKSPACE</span>
              <h1>Tổng hợp theo thời gian và biểu đồ giao thông</h1>
              <p>Theo dõi lưu lượng từ dữ liệu UAV theo từng phút, sau đó chuẩn bị dữ liệu để chạy và so sánh thí nghiệm.</p>
            </div>
          </div>
        </>
      )}

      <div id="workspace-panel-preparation" className="sci-workspace-panel" hidden={activeTab !== 'preparation'}>
        <div className="sci-workspace-section-heading">
          <div><h2>Tổng hợp thời gian</h2><p>Gom dữ liệu thành các mốc 1 phút và quan sát sự thay đổi lưu lượng, vận tốc theo thời gian.</p></div>
          {splitData?.split_id && <span className="sci-prep-status sci-prep-status--completed"><CheckCircle2 size={15} /> Sẵn sàng huấn luyện</span>}
        </div>
        {splitOutdated && <div className="sci-warning" role="alert">Lag Features hiện tại khác tập Train/Test đã lưu. Hãy chia lại Train/Test trước khi chạy thí nghiệm mới. Các thí nghiệm cũ vẫn gắn với tập Test trước đó.</div>}
        <section className="admin-card sci-training-aggregation">
          <div className="admin-card__header">
            <div className="admin-card__header-left">
              <div className="admin-card__icon-box admin-card__icon-box--blue"><Clock3 size={18} /></div>
              <div><h3 className="admin-card__title">Dữ liệu theo từng phút · Data Aggregation</h3><p className="admin-card__subtitle">Thời gian ghi nhận và số xe trong mỗi mốc 60 giây.</p></div>
            </div>
            <span className={`sci-prep-status sci-prep-status--${aggregationStatus}`}>
              {aggregationStatus === 'completed' ? 'Hoàn thành' : aggregationStatus === 'processing' ? 'Đang xử lý' : aggregationStatus === 'error' ? 'Lỗi' : 'Chưa thực hiện'}
            </span>
          </div>
          <div className="sci-card-body">
            <div className="sci-prep-actions">
              <button type="button" className="btn-secondary sci-train-btn" onClick={handleReviewDataset}><Eye size={16} /> Xem Dataset</button>
              {!chart && <button type="button" className="btn-action btn-action--primary sci-train-btn" onClick={handleAggregate} disabled={isLoading || isCalculating}>
                {isCalculating ? <Loader2 size={16} className="sci-spin" /> : <BarChart3 size={16} />}
                {isCalculating ? 'Đang tổng hợp...' : 'Tổng hợp theo phút'}
              </button>}
            </div>
            {chart && <p className="sci-workspace-help">Dữ liệu tổng hợp đã có sẵn. Bạn có thể xem biểu đồ hoặc tiếp tục bước tiếp theo.</p>}
            {isLoading && <div className="sci-state" role="status"><Loader2 size={20} className="sci-spin" /> Đang tải dữ liệu tổng hợp đã lưu...</div>}
            {isCalculating && <div className="sci-job" role="status"><div className="sci-job__row"><Loader2 size={16} className="sci-spin" /> Đang tổng hợp dữ liệu <strong>{progress}%</strong></div><div className="sci-progress"><div style={{ width: progress + '%' }} /></div></div>}
            {error && <div className="sci-state sci-state--error" role="alert">{error}</div>}
            {!isLoading && !isCalculating && !error && !chart && <div className="sci-state">Chưa có dữ liệu tổng hợp. Nhấn “Tổng hợp theo phút” để bắt đầu.</div>}
            {!isLoading && !isCalculating && chart && <>
              {statusInfo && <div className="sci-status-box">
                <span className="sci-pill sci-pill--approved"><CheckCircle2 size={12} /> Đã tổng hợp (60 giây)</span>
                <span className="sci-status-box__item">Số mốc: <strong>{formatNumber(statusInfo.records_count)}</strong></span>
                {statusInfo.last_generated_at && <span className="sci-status-box__item">Cập nhật: <strong>{formatDate(statusInfo.last_generated_at)}</strong></span>}
              </div>}
              <div className="sci-training-time-summary">
                <div><small>Bắt đầu</small><strong>{formatRecordingDateTime(timeLabels[0])}</strong></div>
                <div><small>Kết thúc</small><strong>{formatRecordingDateTime(timeLabels[timeLabels.length - 1])}</strong></div>
                <div><small>Số mốc</small><strong>{formatNumber(timeLabels.length)} mốc</strong></div>
                <div><small>Chu kỳ</small><strong>1 phút / mốc</strong></div>
              </div>
              <BarChart labels={chart.time_labels} values={chart.vehicle_count} />
            </>}
          </div>
        </section>

        {chart && <div className="sci-prep-explorer"><AggregationExplorer key={'aggregation:' + datasetId + ':' + versionId} datasetId={datasetId} versionId={versionId} aggregationInterval={60} roiIdentifier="MAIN_ROI" title="Các biểu đồ giao thông theo phút" subtitle="Đối chiếu số xe, vận tốc trung bình và lưu lượng giao thông theo thời gian." /></div>}

        {!chart && !isLoading && <div className="sci-warning">Chưa có dữ liệu tổng hợp theo phút. Khi tạo Lag Features, hệ thống sẽ kiểm tra và tổng hợp dữ liệu nếu cần.</div>}
        <TrainingFeaturePanel
          key={'features:' + datasetId + ':' + versionId}
          featureData={featureData}
          isLoading={isGeneratingFeatures}
          error={featureError}
          onGenerate={generateTrainingFeatures}
          hasDependentSplit={Boolean(splitData?.split_id)}
        />
      </div>

      <div id="workspace-panel-experiments" className="sci-workspace-panel" hidden={activeTab !== 'experiments'}>
        <div className="sci-experiment-context">
          <button type="button" className="sci-back" onClick={() => setActiveTab('preparation')}><ArrowLeft size={16} /> Về tổng hợp thời gian</button>
          <span>Dataset đang dùng: <strong>{meta?.dataset_name || 'Đang tải dataset'}{meta?.version_tag ? ` · ${meta.version_tag}` : ''}</strong></span>
        </div>
        <ExperimentSplitSection
          datasetKey={'split:' + datasetId + ':' + versionId}
          sampleCount={sampleCount}
          featureData={featureData}
          splitData={splitData}
          isSplitting={isSplitting}
          isPreparingFeatures={isGeneratingFeatures}
          featureError={featureError}
          splitError={splitError}
          splitOutdated={splitOutdated}
          activeSplitContext={activeSplitContext}
          showDetails={showSplitDetails}
          onToggleDetails={handleProceedToSplit}
          onRunSplit={handleRunSplit}
          onProceedToExperiment={handleProceedToExperiment}
        />
        <ExperimentConfigPanel
          key={'exp-config:' + datasetId + ':' + versionId}
          activeSplitContext={splitOutdated ? null : activeSplitContext}
          isTraining={isTraining}
          trainError={trainError}
          onRunExperiment={handleRunExperiment}
          onOpenExperimentList={() => { setSelectedExperiment(null); setActiveTab('analysis') }}
          experimentCount={experiments.length}
        />
      </div>

      <div id="workspace-panel-analysis" className="sci-workspace-panel" hidden={activeTab !== 'analysis'}>
        <div className="sci-workspace-section-heading">
          <div><h2>Phân tích thí nghiệm</h2><p>Tìm thí nghiệm, xem chi tiết dự báo và so sánh các lần chạy cùng điều kiện đánh giá.</p></div>
          <button type="button" className="btn-secondary sci-train-btn" onClick={() => setActiveTab('preparation')}><ArrowLeft size={16} /> Về biểu đồ</button>
        </div>
        <div className="sci-analysis-stack">
          <ExperimentListDetailPanel
            key={'exp-list:' + datasetId + ':' + versionId}
            datasetMeta={meta}
            recordingReference={featureData?.samples?.[0]?.time_bucket || chart?.time_labels?.[0]}
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
            onChangeCompareIds={handleChangeCompareIds}
            onCompareSelected={handleCompareSelectedFromList}
            isComparing={isComparing}
            onUseForPrediction={(exp) => navigate('/scientist/datasets/' + datasetId + '/versions/' + versionId + '/predict?experimentId=' + encodeURIComponent(exp.experiment_id))}
          />
          {!selectedExperiment && <div className="sci-analysis-compare-toggle">
            <div><strong>So sánh thí nghiệm</strong><p>Chọn ít nhất 2 thí nghiệm hoàn thành trên cùng tập Test.</p></div>
            <button type="button" className="btn-secondary sci-train-btn" onClick={() => setComparisonOpen(!comparisonOpen)} aria-expanded={comparisonOpen}><GitCompareArrows size={16} /> {comparisonOpen ? 'Thu gọn so sánh' : 'Mở so sánh'}</button>
          </div>}
          <div hidden={!comparisonOpen || Boolean(selectedExperiment)}>
            <ExperimentComparePanel
              key={'exp-compare:' + datasetId + ':' + versionId}
              experiments={experiments}
              selectedCompareIds={selectedCompareIds}
              onChangeCompareIds={handleChangeCompareIds}
              onRunCompare={compareExperiments}
              comparisonData={comparisonData}
              isComparing={isComparing}
              compareError={compareError}
              onBackToList={() => setComparisonOpen(false)}
              onViewExperimentDetail={handleViewExperimentFromCompare}
              onCreateWithSameSplit={handleCreateWithSameSplit}
              onUseForPrediction={(exp) => navigate('/scientist/datasets/' + datasetId + '/versions/' + versionId + '/predict?experimentId=' + encodeURIComponent(exp.experiment_id))}
            />
          </div>
        </div>
      </div>
      {activeTab !== 'experiments' && <nav className="sci-training-shortcuts" aria-label="Thí nghiệm và so sánh">
        <button type="button" className={`sci-training-shortcut${activeTab === 'experiments' ? ' is-active' : ''}`} onClick={() => setActiveTab('experiments')} aria-current={activeTab === 'experiments' ? 'page' : undefined}>
          <span className="sci-training-shortcut__icon"><FlaskConical size={24} /></span>
          <span><strong>Thí nghiệm</strong><small>Cấu hình và chạy mô hình Random Forest</small></span>
          <ArrowRight size={17} className="sci-training-shortcut__arrow" />
        </button>
        <button type="button" className={`sci-training-shortcut${activeTab === 'analysis' ? ' is-active' : ''}`} onClick={openComparison} aria-current={activeTab === 'analysis' ? 'page' : undefined}>
          <span className="sci-training-shortcut__icon"><GitCompareArrows size={24} /></span>
          <span><strong>So sánh</strong><small>Xem kết quả và đối chiếu các thí nghiệm</small></span>
          <ArrowRight size={17} className="sci-training-shortcut__arrow" />
        </button>
      </nav>}
    </div>
  )
}

export default function ScientistTrainingPage() {
  const { datasetId, versionId } = useParams()
  return <TrainingWorkspace key={datasetId + ':' + versionId} datasetId={datasetId} versionId={versionId} />
}

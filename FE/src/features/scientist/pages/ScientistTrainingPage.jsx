import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Eye, BarChart3, Loader2, CheckCircle2, GitCompareArrows, Database, FlaskConical, ArrowRight } from 'lucide-react'
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
import TrainingPreparationAccordion from '../components/TrainingPreparationAccordion'
import TrainingFeaturePanel from '../components/TrainingFeaturePanel'
import TrainTestSplitPanel from '../components/TrainTestSplitPanel'
import ExperimentConfigPanel from '../components/ExperimentConfigPanel'
import ExperimentListDetailPanel from '../components/ExperimentListDetailPanel'
import ExperimentComparePanel from '../components/ExperimentComparePanel'
import { formatDate, formatNumber } from '../utils/formatters'

function TrainingWorkspace({ datasetId, versionId }) {
  const navigate = useNavigate()
  const { activeTab, setActiveTab, openPreparation, setOpenPreparation, comparisonOpen, setComparisonOpen } = useTrainingWorkspace()
  const [overrideSplitContext, setOverrideSplitContext] = useState(null)
  const [selectedCompareIds, setSelectedCompareIds] = useState([])
  const [workspaceNotice, setWorkspaceNotice] = useState('')
  const [showAggregationDetails, setShowAggregationDetails] = useState(false)
  const [hasOpenedAggregationDetails, setHasOpenedAggregationDetails] = useState(false)

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
    setComparisonData,
    isComparing,
    compareError,
    setCompareError,
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

  const aggregationStatus = error ? 'error' : isLoading || isCalculating ? 'processing' : chart ? 'completed' : 'pending'
  const featureStatus = featureError ? 'error' : isGeneratingFeatures ? 'processing' : sampleCount >= 2 ? 'completed' : 'pending'
  const splitStatus = splitError ? 'error' : isSplitting ? 'processing' : activeSplitContext?.splitId ? 'completed' : 'pending'
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
    setWorkspaceNotice('')
    await aggregateOneMinute()
  }

  const handleReviewDataset = () => {
    navigate(`/scientist/datasets/${datasetId}/versions/${versionId}`)
  }

  const handleProceedToSplit = () => {
    setOpenPreparation('split')
  }

  // Step 2: Run 70/30 Chronological Split
  const handleRunSplit = async () => {
    const res = await runTrainTestSplit(featureData, {
      trainRatio: 0.7,
      splitStrategy: 'chronological',
    })
    if (res?.split_id) {
      setOverrideSplitContext(null)
      setWorkspaceNotice('Dữ liệu đã chia 70/30. Bạn có thể sang tab Thí nghiệm mô hình.')
    }
  }

  // Step 2 -> Step 3
  const handleProceedToExperiment = () => {
    setOverrideSplitContext(null)
    setLatestExperiment(null)
    setTrainError(null)
    setActiveTab('experiments')
  }

  // Step 3 -> View created experiment detail in Step 4
  const handleViewCreatedExperiment = async (exp) => {
    if (!exp?.experiment_id) return
    setSelectedExperiment(exp)
    setActiveTab('analysis')
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
    setActiveTab('experiments')
  }

  // Step 4 -> Compare selected experiments in Step 5
  const handleCompareSelectedFromList = async (ids) => {
    setComparisonOpen(true)
    await compareExperiments(ids)
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
          <h1>Huấn luyện và phân tích mô hình</h1>
          <p>Chuẩn bị dữ liệu một lần, chạy nhiều cấu hình Random Forest và đối chiếu kết quả trên cùng tập Test.</p>
        </div>
      </div>

      <nav className="sci-workspace-tabs" role="tablist" aria-label="Training Workspace">
        {[
          { id: 'preparation', icon: Database, label: 'Chuẩn bị dữ liệu', description: 'Aggregation · Lag Features · Train/Test' },
          { id: 'experiments', icon: FlaskConical, label: 'Thí nghiệm mô hình', description: 'Cấu hình và chạy Random Forest' },
          { id: 'analysis', icon: GitCompareArrows, label: 'Phân tích thí nghiệm', description: 'Kết quả và so sánh' },
        ].map(({ id, icon: Icon, label, description }) => (
          <button
            key={id}
            type="button"
            id={'workspace-tab-' + id}
            role="tab"
            aria-controls={'workspace-panel-' + id}
            aria-selected={activeTab === id}
            className={'sci-workspace-tab' + (activeTab === id ? ' is-active' : '')}
            onClick={() => setActiveTab(id)}
          >
            <Icon size={19} />
            <span><strong>{label}</strong><small>{description}</small></span>
          </button>
        ))}
      </nav>

      <div id="workspace-panel-preparation" role="tabpanel" aria-labelledby="workspace-tab-preparation" className="sci-workspace-panel" hidden={activeTab !== 'preparation'}>
        <div className="sci-workspace-section-heading">
          <div><h2>Chuẩn bị dữ liệu</h2><p>Thực hiện lần lượt ba mục bên dưới. Mỗi kết quả đã tạo đều có thể mở lại để xem.</p></div>
          {splitData?.split_id && <span className="sci-prep-status sci-prep-status--completed"><CheckCircle2 size={15} /> Sẵn sàng huấn luyện</span>}
        </div>
        {workspaceNotice && <div className="sci-notice" role="status">{workspaceNotice}</div>}
        {splitOutdated && <div className="sci-warning" role="alert">Lag Features hiện tại khác tập Train/Test đã lưu. Hãy chia lại Train/Test trước khi chạy thí nghiệm mới. Các thí nghiệm cũ vẫn gắn với tập Test trước đó.</div>}
        <div className="sci-preparation-stack">
          <TrainingPreparationAccordion
            id="prep-aggregation"
            index="01"
            title="Tổng hợp dữ liệu · Data Aggregation"
            description="Gom số xe thành các mốc 1 phút và xem biểu đồ lưu lượng."
            status={aggregationStatus}
            isOpen={openPreparation === 'aggregation'}
            onToggle={() => setOpenPreparation(openPreparation === 'aggregation' ? null : 'aggregation')}
          >
            <div className="sci-prep-actions">
              <button type="button" className="btn-secondary sci-train-btn" onClick={handleReviewDataset}><Eye size={16} /> Xem Dataset</button>
              {!chart && <button type="button" className="btn-action btn-action--primary sci-train-btn" onClick={handleAggregate} disabled={isLoading || isCalculating}>
                {isCalculating ? <Loader2 size={16} className="sci-spin" /> : <BarChart3 size={16} />}
                {isCalculating ? 'Đang tổng hợp...' : 'Tổng hợp theo phút'}
              </button>}
              {chart && <button type="button" className="btn-secondary sci-train-btn" aria-expanded={showAggregationDetails} onClick={() => { setHasOpenedAggregationDetails(true); setShowAggregationDetails(!showAggregationDetails) }}>{showAggregationDetails ? 'Ẩn phân tích chi tiết' : 'Xem phân tích chi tiết'}</button>}
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
              <BarChart labels={chart.time_labels} values={chart.vehicle_count} />
            </>}
            {chart && hasOpenedAggregationDetails && <div className="sci-prep-explorer" hidden={!showAggregationDetails}><AggregationExplorer key={'aggregation:' + datasetId + ':' + versionId} datasetId={datasetId} versionId={versionId} aggregationInterval={60} roiIdentifier="MAIN_ROI" title="Biểu đồ giao thông theo phút" /></div>}
            {chart && <div className="sci-prep-next"><button type="button" className="btn-action btn-action--primary sci-train-btn" onClick={() => setOpenPreparation('features')}>Tiếp tục tạo Lag Features <ArrowRight size={16} /></button></div>}
          </TrainingPreparationAccordion>

          <TrainingPreparationAccordion
            id="prep-features"
            index="02"
            title="Tạo đặc trưng trễ · Lag Features"
            description="Tạo 5 lag và nhãn dự báo +1, +3, +5 phút."
            status={featureStatus}
            isOpen={openPreparation === 'features'}
            onToggle={() => setOpenPreparation(openPreparation === 'features' ? null : 'features')}
          >
            {!chart && !isLoading && <div className="sci-warning">Chưa có tổng hợp 1 phút. Chức năng này có thể tạo dữ liệu tổng hợp khi cần; nên hoàn thành mục đầu tiên để kiểm tra đầu vào.</div>}
            <TrainingFeaturePanel
              key={'features:' + datasetId + ':' + versionId}
              featureData={featureData}
              datasetMeta={meta}
              isLoading={isGeneratingFeatures}
              error={featureError}
              onGenerate={generateTrainingFeatures}
              hasDependentSplit={Boolean(splitData?.split_id)}
              onProceedToSplit={handleProceedToSplit}
            />
          </TrainingPreparationAccordion>

          <TrainingPreparationAccordion
            id="prep-split"
            index="03"
            title="Chia dữ liệu · Train/Test Split"
            description="Chia theo thời gian: 70% Train và 30% Test."
            status={splitStatus}
            isOpen={openPreparation === 'split'}
            onToggle={() => setOpenPreparation(openPreparation === 'split' ? null : 'split')}
          >
            {!splitData?.split_id && activeSplitContext?.splitId && <div className="sci-notice">Split ID cũ vẫn dùng được để chạy thí nghiệm. Bảng Train/Test của phiên trước chưa thể tải lại vì API hiện tại chưa hỗ trợ đọc bảng theo Split ID. Nếu cần xem lại bảng, hãy tạo lại Lag Features rồi chia Train/Test mới.</div>}
            <TrainTestSplitPanel
              key={'split:' + datasetId + ':' + versionId}
              featureData={featureData}
              splitData={splitData}
              isSplitting={isSplitting}
              splitError={splitError}
              onRunSplit={handleRunSplit}
              onProceedToExperiment={handleProceedToExperiment}
              onBackToFeatures={() => setOpenPreparation('features')}
            />
          </TrainingPreparationAccordion>
        </div>
      </div>

      <div id="workspace-panel-experiments" role="tabpanel" aria-labelledby="workspace-tab-experiments" className="sci-workspace-panel" hidden={activeTab !== 'experiments'}>
        <div className="sci-workspace-section-heading">
          <div><h2>Thí nghiệm mô hình</h2><p>Thay đổi cấu hình Random Forest và chạy thí nghiệm mới trên dữ liệu đã chuẩn bị.</p></div>
          <span className={'sci-prep-status sci-prep-status--' + (activeSplitContext?.splitId && !splitOutdated ? 'completed' : 'pending')}>
            {activeSplitContext?.splitId && !splitOutdated ? 'Dữ liệu sẵn sàng' : 'Cần dữ liệu Train/Test'}
          </span>
        </div>
        {splitOutdated && <div className="sci-warning" role="alert">Tập Lag Features đã thay đổi. Hãy chia lại Train/Test trước khi chạy thí nghiệm.</div>}
        <ExperimentConfigPanel
          key={'exp-config:' + datasetId + ':' + versionId}
          datasetMeta={meta}
          versionId={versionId}
          activeSplitContext={splitOutdated ? null : activeSplitContext}
          isTraining={isTraining}
          trainError={trainError}
          latestExperiment={latestExperiment}
          onRunExperiment={runExperiment}
          onViewExperimentDetail={handleViewCreatedExperiment}
          onResetLatestExperiment={() => { setLatestExperiment(null); setTrainError(null) }}
          onBackToSplit={() => { setActiveTab('preparation'); setOpenPreparation('split') }}
          onOpenExperimentList={() => { setSelectedExperiment(null); setActiveTab('analysis') }}
          experimentCount={experiments.length}
        />
      </div>

      <div id="workspace-panel-analysis" role="tabpanel" aria-labelledby="workspace-tab-analysis" className="sci-workspace-panel" hidden={activeTab !== 'analysis'}>
        <div className="sci-workspace-section-heading">
          <div><h2>Phân tích thí nghiệm</h2><p>Tìm thí nghiệm, xem chi tiết dự báo và so sánh các lần chạy cùng điều kiện đánh giá.</p></div>
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
    </div>
  )
}

export default function ScientistTrainingPage() {
  const { datasetId, versionId } = useParams()
  return <TrainingWorkspace key={datasetId + ':' + versionId} datasetId={datasetId} versionId={versionId} />
}

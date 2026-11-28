import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { ArrowRight, Check, Clock3, Database, FlaskConical, Layers3, LoaderCircle, RefreshCw, Scissors, Sparkles } from 'lucide-react'
import { useApprovedDatasets, useApprovedGroups, useGroupDatasets, useGroupSessionMetadata } from '../../../hooks/useScientistData'
import { useAggregationResults, useFeaturePreview, useScienceTraining } from '../../../hooks/useScienceWorkflow'
import { AggregationTimeTable, ChronologicalSplitTable, FeaturePreviewTable } from '../components/TrainingTimeTables'
import ScientistBackLink from '../components/ScientistBackLink'
import ScientistAggregationProgress from '../components/ScientistAggregationProgress'
import ValidationStudyPanel from '../components/ValidationStudyPanel'

const RUNNING_STATUSES = ['PROCESSING', 'PENDING', 'QUEUED', 'RUNNING']

function getStepState(result, ready) {
  if (result?.status === 'COMPLETED') return 'complete'
  if (result?.status === 'PARTIAL_SUCCESS') return 'partial'
  if (result && RUNNING_STATUSES.includes(result.status)) return 'processing'
  if (result?.status === 'FAILED') return 'failed'
  return ready ? 'ready' : 'waiting'
}

const STATE_LABELS = {
  partial: 'Hoàn tất một phần',
  complete: 'Hoàn tất', processing: 'Đang xử lý', failed: 'Cần kiểm tra',
  ready: 'Sẵn sàng', waiting: 'Chưa mở',
}

function TrainingStep({ number, icon: Icon, title, description, state, headerActions, compact = false, children }) {
  const statusBadge = <span className={`sci-training-status sci-training-status--${state}`}>
    {state === 'processing' ? <LoaderCircle size={14} className="sci-training-spin" /> : state === 'waiting' ? <Clock3 size={14} /> : state === 'complete' ? <Check size={14} /> : null}
    {STATE_LABELS[state]}
  </span>
  return <section className={`sci-training-step sci-training-step--${state}${compact ? ' sci-training-step--compact' : ''}`}>
    <div className="sci-training-step__marker" aria-hidden="true">
      {state === 'complete' ? <Check size={21} /> : <Icon size={21} />}
    </div>
    <div className="sci-training-step__content">
      <div className="sci-training-step__heading">
        <div><span className="sci-training-step__eyebrow">BƯỚC {number}</span><h2>{title}</h2></div>
        {headerActions ? <div className="sci-training-step__heading-controls">{statusBadge}{headerActions}</div> : statusBadge}
      </div>
      {description && <p className="sci-training-step__description">{description}</p>}
      {children && <div className="sci-training-step__body">{children}</div>}
    </div>
  </section>
}

export default function ScientistTrainingPage({ trainingMode = 'preparation' }) {
  const { groupId, datasetId, fileId } = useParams()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedSessionId = searchParams.get('sessionId') || ''
  const preparationPath = groupId
    ? `/scientist/datasets/groups/${groupId}/train`
    : `/scientist/datasets/${datasetId}/files/${fileId}/train`
  const sessionQuery = selectedSessionId ? `?sessionId=${encodeURIComponent(selectedSessionId)}` : ''
  const isPreparation = trainingMode === 'preparation'
  const { groups, isLoading: groupsLoading, error: groupsError, reload: reloadGroups } = useApprovedGroups()
  const { datasets, isLoading: datasetsLoading, error: datasetsError, reload: reloadDatasets } = useApprovedDatasets()
  const dataset = datasets.find((item) => item.dataset_id === datasetId && item.file_id === fileId)
  const activeGroupId = groupId || dataset?.group_id
  const group = groups.find((item) => item.group_id === activeGroupId)
  const { datasets: groupDatasets } = useGroupDatasets(activeGroupId)
  const sessionsById = useGroupSessionMetadata(groupDatasets)
  const { workflow, busy, startingAggregation, aggregationProgressHidden, dismissAggregationProgress, error, loadError, isLoadingWorkflow, reloadWorkflow, startAggregation, refreshAggregation, generateFeatures, refreshFeatures, createSplit } = useScienceTraining(group?.group_id)
  const { aggregation, features, split, experiment } = workflow
  const incomingPreset = location.state?.validationPreset
  const validationPreset = incomingPreset?.groupId === activeGroupId
    && incomingPreset?.featureGenerationId === features?.feature_generation_id ? incomingPreset : null
  const aggregationTable = useAggregationResults(
    aggregation?.aggregation_id,
    ['COMPLETED', 'PARTIAL_SUCCESS'].includes(aggregation?.status),
    selectedSessionId,
  )
  const selectAggregationSession = (sessionId) => {
    aggregationTable.setSessionId(sessionId)
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (sessionId) next.set('sessionId', sessionId)
      else next.delete('sessionId')
      return next
    }, { replace: true })
  }
  const featureTable = useFeaturePreview(features?.feature_generation_id, features?.status === 'COMPLETED')
  const aggregationState = startingAggregation ? 'processing' : getStepState(aggregation, true)
  const featuresState = getStepState(features, aggregationState === 'complete')
  const splitState = getStepState(split?.train_ratio_requested === 0.75 && split?.split_strategy === 'DAY_BASED' ? split : null, featuresState === 'complete')
  const experimentState = getStepState(experiment, splitState === 'complete')
  const completedSteps = [aggregationState, featuresState, splitState, experimentState].filter((state) => state === 'complete').length
  const loading = groupsLoading || (!groupId && datasetsLoading)

  return <div className="sci-page sci-training-page">
    <ScientistBackLink to={isPreparation ? '/scientist/datasets' : `${preparationPath}${sessionQuery}`}>{isPreparation ? 'Tất cả batch' : 'Quay lại chuẩn bị dữ liệu'}</ScientistBackLink>
    <header className="sci-training-hero">
      <div className="sci-training-hero__icon"><FlaskConical size={27} /></div>
      <div className="sci-training-hero__text">
        <span className="sci-training-hero__eyebrow">DATA SCIENCE WORKFLOW</span>
        <h1>{isPreparation ? 'Huấn luyện mô hình' : trainingMode === 'validation' ? 'Train / Validation / Test' : 'Test/train'}</h1>
        <p>{group?.group_name || 'Batch'} · {isPreparation ? 'Tổng hợp dữ liệu và tạo đặc trưng trước khi chọn luồng đánh giá' : 'Sử dụng đặc trưng đã chuẩn bị để huấn luyện và đánh giá Random Forest'}</p>
      </div>
      {group && <div className="sci-training-hero__progress"><strong>{isPreparation ? `${[aggregationState, featuresState].filter((state) => state === 'complete').length}/2` : trainingMode === 'validation' ? '3 tập' : `${completedSteps}/4`}</strong><span>{isPreparation ? 'bước chuẩn bị' : trainingMode === 'validation' ? 'Train · Validation · Test' : 'bước hoàn tất'}</span></div>}
    </header>

    {loading && <div className="sci-state"><div className="sci-spinner" /> Đang tải batch…</div>}
    {(groupsError || (!groupId && datasetsError)) && <div role="alert" className="sci-state sci-state--error">
      <div>{groupsError || datasetsError}</div>
      <button type="button" className="sci-training-button sci-training-button--secondary sci-training-load-retry" onClick={groupsError ? reloadGroups : reloadDatasets}>
        <RefreshCw size={15} /> Thử lại
      </button>
    </div>}
    {!loading && !groupsError && (!groupId ? !datasetsError : true) && !group && <div role="alert" className="sci-state sci-state--error">Bạn không có quyền truy cập batch này.</div>}
    {error && <div role="alert" className="sci-training-alert">{error}</div>}
    {group && isLoadingWorkflow && <div className="sci-state"><div className="sci-spinner" /> Đang tải lần tổng hợp đã lưu…</div>}
    {group && loadError && <div role="alert" className="sci-state sci-state--error">{loadError} <button type="button" className="sci-training-button sci-training-button--secondary" onClick={reloadWorkflow}><RefreshCw size={15} /> Thử lại</button></div>}

    {group && !isLoadingWorkflow && !loadError && <div className="sci-training-content">
      {isPreparation && <div className="sci-training-flow">
      <TrainingStep number={1} icon={Database} title="Tổng hợp dữ liệu theo phút" description={aggregationState === 'complete' ? null : `Gộp các dataset đã duyệt trong ${group.group_name} thành dữ liệu theo phút.`} state={aggregationState} compact headerActions={<div className="sci-training-step__actions">
        {aggregationState !== 'processing' && <button type="button" className={`sci-training-button${aggregation ? ' sci-training-button--secondary' : ''}`} disabled={busy} onClick={startAggregation}><Database size={16} /> {aggregation ? 'Tổng hợp lại' : 'Bắt đầu tổng hợp'}</button>}
        {aggregation && aggregationState !== 'complete' && <button type="button" className="sci-training-button sci-training-button--secondary" disabled={busy} onClick={refreshAggregation}><RefreshCw size={15} /> Cập nhật</button>}
      </div>}>
        {!aggregationProgressHidden && <ScientistAggregationProgress aggregation={aggregation} starting={startingAggregation} sessionsById={sessionsById} onDismiss={dismissAggregationProgress} />}
        {['partial', 'failed'].includes(aggregationState) && <div className="sci-training-alert" role="alert">
          <strong>{(aggregation.sessions || []).filter((session) => session.status === 'COMPLETED').length}/{aggregation.total_sessions} phiên đã hoàn tất.</strong>
          <p>Các phiên thành công vẫn có thể xem bên dưới. Cần xử lý phiên lỗi và tổng hợp đầy đủ trước khi tạo đặc trưng.</p>
          <ul>{(aggregation.sessions || []).filter((session) => session.status === 'FAILED').map((session) => <li key={session.session_id}>
            <strong>{sessionsById[session.session_id]?.original_filename || session.session_id}</strong>: {session.error_message || 'Không xử lý được phiên ghi hình.'}
          </li>)}</ul>
        </div>}
        {['complete', 'partial'].includes(aggregationState) && <AggregationTimeTable {...aggregationTable} setSessionId={selectAggregationSession} aggregationId={aggregation.aggregation_id} groupId={activeGroupId} sessions={(aggregation.sessions || []).filter((session) => session.status === 'COMPLETED')} sessionsById={sessionsById} />}
      </TrainingStep>

      <TrainingStep number={2} icon={Layers3} title="Tạo lag features" description={featuresState === 'complete' ? null : 'Tạo các đặc trưng từ dữ liệu đã tổng hợp để đưa vào mô hình.'} state={featuresState} compact headerActions={<div className="sci-training-step__actions">
        {features && <span className="sci-training-step__metric"><b>{features.sample_count ?? '—'}</b> mẫu</span>}
        {featuresState !== 'processing' && <button type="button" className={`sci-training-button${features ? ' sci-training-button--secondary' : ''}`} disabled={busy || aggregationState !== 'complete'} onClick={generateFeatures}><Sparkles size={16} /> {features ? 'Tạo lại đặc trưng' : 'Tạo đặc trưng'}</button>}
        {features && featuresState !== 'complete' && <button type="button" className="sci-training-button sci-training-button--secondary" disabled={busy} onClick={refreshFeatures}><RefreshCw size={15} /> Cập nhật</button>}
        {aggregationState !== 'complete' && <span className="sci-training-hint">Hoàn tất bước 1 để tiếp tục</span>}
      </div>}>
        {featuresState === 'complete' && <FeaturePreviewTable {...featureTable} sessionsById={sessionsById} />}
      </TrainingStep>

      </div>}

      {isPreparation && <nav className="validation-actions" aria-label="Chọn trang đánh giá">
        <Link className="sci-training-button" to={`${preparationPath}/validation${sessionQuery}`}>Train / Validation / Test <ArrowRight size={16} /></Link>
        <Link className="sci-training-button sci-training-button--secondary" to={`${preparationPath}/reference${sessionQuery}`}>Test/train <ArrowRight size={16} /></Link>
      </nav>}
      {trainingMode === 'validation' && (featuresState === 'complete'
        ? <ValidationStudyPanel key={features.feature_generation_id} featureGenerationId={features.feature_generation_id}
          groupId={activeGroupId} referencePath={`${preparationPath}/reference${sessionQuery}`} />
        : <p className="sci-training-hint">Hoàn tất tạo lag features để chia Train / Validation / Test.</p>)}

      {trainingMode === 'reference' && <><TrainingStep number={3} icon={Scissors} title="Chia dữ liệu train/test" description={splitState === 'complete' ? null : 'Chia dữ liệu theo ngày với tỷ lệ 75/25, tương ứng Train + Validation và Test.'} state={splitState} compact headerActions={<div className="sci-training-step__actions">
        {split && <><span className="sci-training-step__metric">Train <b>{split.train_sample_count ?? '—'}</b> · Test <b>{split.test_sample_count ?? '—'}</b> mẫu</span>
          <span className={`sci-training-step__metric${split.leakage_check?.has_leakage ? ' sci-training-step__metric--warning' : ''}`}>
            Rò rỉ: <b>{split.leakage_check?.has_leakage ? 'Có' : 'Không'}</b>
          </span></>}
        {splitState !== 'processing' && <button type="button" className={`sci-training-button${split ? ' sci-training-button--secondary' : ''}`} disabled={busy || featuresState !== 'complete'} onClick={createSplit}><Scissors size={16} /> {split ? 'Chia lại' : 'Chia dữ liệu 75/25'}</button>}
          {featuresState !== 'complete' && <span className="sci-training-hint">Hoàn tất bước 2 để tiếp tục</span>}
        </div>}>
        {splitState === 'complete' && <ChronologicalSplitTable split={split} datasets={groupDatasets} sessionsById={sessionsById} />}
      </TrainingStep>

      <div className={`sci-training-experiments-cta${validationPreset ? ' sci-training-experiments-cta--preset' : ''}`}>
        <span className="sci-training-experiments-cta__marker" aria-hidden="true"><FlaskConical size={20} /></span>
        {validationPreset ? <div className="sci-training-experiments-cta__copy" role="status">
          <span className="sci-training-experiments-cta__label">BƯỚC 4 · CẤU HÌNH TỪ VALIDATION</span>
          <h3>Cấu hình C{validationPreset.candidateIndex + 1} đã sẵn sàng</h3>
          <p>Mở thí nghiệm để kiểm tra các tham số đã điền sẵn trước khi chạy.</p>
        </div> : <span className="sci-training-experiments-cta__label">BƯỚC 4</span>}
        {splitState === 'complete' && split?.split_id
          ? <Link className="sci-training-button" to={`/scientist/experiments/groups/${activeGroupId}/new?split_id=${encodeURIComponent(split.split_id)}`}
            state={{ validationPreset }}>
            Thí nghiệm <ArrowRight size={16} />
          </Link>
          : <><span className="sci-training-hint">Hoàn tất bước chia Train/Test để cấu hình thí nghiệm</span>
            <button type="button" className="sci-training-button" disabled>Thí nghiệm <ArrowRight size={16} /></button></>}
      </div></>}
    </div>}
  </div>
}

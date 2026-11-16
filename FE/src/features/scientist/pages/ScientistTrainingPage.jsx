import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Clock3, Database, FlaskConical, Layers3, LoaderCircle, RefreshCw, Scissors, Sparkles } from 'lucide-react'
import { useApprovedDatasets, useApprovedGroups, useGroupDatasets, useGroupSessionMetadata } from '../../../hooks/useScientistData'
import { useAggregationResults, useFeaturePreview, useScienceTraining } from '../../../hooks/useScienceWorkflow'
import { AggregationTimeTable, ChronologicalSplitTable, FeaturePreviewTable } from '../components/TrainingTimeTables'

const RUNNING_STATUSES = ['PROCESSING', 'PENDING', 'QUEUED', 'RUNNING']

function getStepState(result, ready) {
  if (result?.status === 'COMPLETED') return 'complete'
  if (result && RUNNING_STATUSES.includes(result.status)) return 'processing'
  if (result?.status === 'FAILED') return 'failed'
  return ready ? 'ready' : 'waiting'
}

const STATE_LABELS = {
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

export default function ScientistTrainingPage() {
  const { groupId, datasetId, versionId } = useParams()
  const { groups, isLoading: groupsLoading, error: groupsError, reload: reloadGroups } = useApprovedGroups()
  const { datasets, isLoading: datasetsLoading, error: datasetsError, reload: reloadDatasets } = useApprovedDatasets()
  const dataset = datasets.find((item) => item.dataset_id === datasetId && item.version_id === versionId)
  const activeGroupId = groupId || dataset?.group_id
  const group = groups.find((item) => item.group_id === activeGroupId)
  const { datasets: groupDatasets } = useGroupDatasets(activeGroupId)
  const sessionsById = useGroupSessionMetadata(groupDatasets)
  const { workflow, busy, error, loadError, isLoadingWorkflow, reloadWorkflow, startAggregation, refreshAggregation, generateFeatures, refreshFeatures, createSplit } = useScienceTraining(group?.group_id)
  const { aggregation, features, split, experiment } = workflow
  const aggregationTable = useAggregationResults(aggregation?.aggregation_id, aggregation?.status === 'COMPLETED')
  const featureTable = useFeaturePreview(features?.feature_generation_id, features?.status === 'COMPLETED')
  const aggregationState = getStepState(aggregation, true)
  const featuresState = getStepState(features, aggregationState === 'complete')
  const splitState = getStepState(split, featuresState === 'complete')
  const experimentState = getStepState(experiment, splitState === 'complete')
  const completedSteps = [aggregationState, featuresState, splitState, experimentState].filter((state) => state === 'complete').length
  const loading = groupsLoading || (!groupId && datasetsLoading)

  return <div className="sci-page sci-training-page">
    <Link className="sci-back" to="/scientist/datasets"><ArrowLeft size={16} /> Các batch</Link>
    <header className="sci-training-hero">
      <div className="sci-training-hero__icon"><FlaskConical size={27} /></div>
      <div className="sci-training-hero__text">
        <span className="sci-training-hero__eyebrow">DATA SCIENCE WORKFLOW</span>
        <h1>Huấn luyện mô hình</h1>
        <p>{group?.group_name || 'Batch'} · Tổng hợp dữ liệu, tạo đặc trưng và huấn luyện Random Forest</p>
      </div>
      {group && <div className="sci-training-hero__progress"><strong>{completedSteps}/4</strong><span>bước hoàn tất</span></div>}
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

    {group && !isLoadingWorkflow && !loadError && <div className="sci-training-flow">
      <TrainingStep number={1} icon={Database} title="Tổng hợp dữ liệu theo phút" description={aggregationState === 'complete' ? null : `Gộp các dataset đã duyệt trong ${group.group_name} thành dữ liệu theo phút.`} state={aggregationState} compact headerActions={<div className="sci-training-step__actions">
        {aggregationState !== 'processing' && <button type="button" className={`sci-training-button${aggregation ? ' sci-training-button--secondary' : ''}`} disabled={busy} onClick={startAggregation}><Database size={16} /> {aggregation ? 'Tổng hợp lại' : 'Bắt đầu tổng hợp'}</button>}
        {aggregation && aggregationState !== 'complete' && <button type="button" className="sci-training-button sci-training-button--secondary" disabled={busy} onClick={refreshAggregation}><RefreshCw size={15} /> Cập nhật</button>}
      </div>}>
        {aggregationState === 'complete' && <AggregationTimeTable {...aggregationTable} sessions={aggregation.sessions || []} sessionsById={sessionsById} />}
      </TrainingStep>

      <TrainingStep number={2} icon={Layers3} title="Tạo lag features" description={featuresState === 'complete' ? null : 'Tạo các đặc trưng từ dữ liệu đã tổng hợp để đưa vào mô hình.'} state={featuresState} compact headerActions={<div className="sci-training-step__actions">
        {features && <span className="sci-training-step__metric"><b>{features.sample_count ?? '—'}</b> mẫu</span>}
        {featuresState !== 'processing' && <button type="button" className={`sci-training-button${features ? ' sci-training-button--secondary' : ''}`} disabled={busy || aggregationState !== 'complete'} onClick={generateFeatures}><Sparkles size={16} /> {features ? 'Tạo lại đặc trưng' : 'Tạo đặc trưng'}</button>}
        {features && featuresState !== 'complete' && <button type="button" className="sci-training-button sci-training-button--secondary" disabled={busy} onClick={refreshFeatures}><RefreshCw size={15} /> Cập nhật</button>}
        {aggregationState !== 'complete' && <span className="sci-training-hint">Hoàn tất bước 1 để tiếp tục</span>}
      </div>}>
        {featuresState === 'complete' && <FeaturePreviewTable {...featureTable} sessionsById={sessionsById} />}
      </TrainingStep>

      <TrainingStep number={3} icon={Scissors} title="Chia dữ liệu train/test" description={splitState === 'complete' ? null : 'Chia dữ liệu theo thứ tự thời gian với tỷ lệ 70/30.'} state={splitState} compact headerActions={<div className="sci-training-step__actions">
        {split && <><span className="sci-training-step__metric">Train <b>{split.train_sample_count ?? '—'}</b> · Test <b>{split.test_sample_count ?? '—'}</b> mẫu</span>
          <span className={`sci-training-step__metric${split.leakage_check?.has_leakage ? ' sci-training-step__metric--warning' : ''}`}>
            Rò rỉ: <b>{split.leakage_check?.has_leakage ? 'Có' : 'Không'}</b>
          </span></>}
        {splitState !== 'processing' && <button type="button" className={`sci-training-button${split ? ' sci-training-button--secondary' : ''}`} disabled={busy || featuresState !== 'complete'} onClick={createSplit}><Scissors size={16} /> {split ? 'Chia lại' : 'Chia dữ liệu 70/30'}</button>}
          {featuresState !== 'complete' && <span className="sci-training-hint">Hoàn tất bước 2 để tiếp tục</span>}
        </div>}>
        {splitState === 'complete' && <ChronologicalSplitTable split={split} datasets={groupDatasets} sessionsById={sessionsById} />}
      </TrainingStep>

      <div className="sci-training-experiments-cta">
        <span className="sci-training-experiments-cta__marker" aria-hidden="true"><FlaskConical size={20} /></span>
        <span className="sci-training-experiments-cta__label">BƯỚC 4</span>
        {splitState === 'complete' && split?.split_id
          ? <Link className="sci-training-button" to={`/scientist/experiments/groups/${activeGroupId}/new?split_id=${encodeURIComponent(split.split_id)}`}>
            Thí nghiệm <ArrowRight size={16} />
          </Link>
          : <><span className="sci-training-hint">Hoàn tất bước chia Train/Test để cấu hình thí nghiệm</span>
            <button type="button" className="sci-training-button" disabled>Thí nghiệm <ArrowRight size={16} /></button></>}
      </div>
    </div>}
  </div>
}

import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { GitCompareArrows, Layers3 } from 'lucide-react'
import { useApprovedGroups } from '../../../hooks/useScientistData'
import { useScienceExperimentComparison, useScienceExperiments } from '../../../hooks/useScienceWorkflow'
import ExperimentComparePanel from '../components/ExperimentComparePanel'
import ScientistBackLink from '../components/ScientistBackLink'
import ComparisonHistoryPanel from '../components/ComparisonHistoryPanel'
import { useComparisonHistory } from '../../../hooks/useComparisonHistory'

export default function ScientistExperimentComparisonPage() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const [selection, setSelection] = useState({ groupId, ids: [] })
  const selectedCompareIds = selection.groupId === groupId ? selection.ids : []
  const { groups } = useApprovedGroups()
  const { experiments, loading, error } = useScienceExperiments()
  const { comparisonData, isComparing, compareError, compareExperiments, resultMode, clearComparison, restoreComparison } = useScienceExperimentComparison(`compare:${groupId}`)
  const history = useComparisonHistory(groupId)
  const runComparison = async (ids, mode = 'compare') => {
    const result = await compareExperiments(ids, mode, groupId)
    if (result) await history.reload()
  }
  const openHistory = async (id) => {
    const saved = await history.open(id)
    if (!saved) return
    setSelection({ groupId, ids: saved.experiment_ids })
    restoreComparison(saved.result, saved.mode)
  }

  const group = groups.find((item) => String(item.group_id) === String(groupId))
  const groupExperiments = useMemo(() => experiments
    .filter((item) => String(item.group_id) === String(groupId))
    .filter((item) => item.evaluation_subset !== 'VALIDATION')
    .sort((left, right) => new Date(right.created_at) - new Date(left.created_at)),
  [experiments, groupId])
  const completedCount = groupExperiments.filter((item) => item.status === 'COMPLETED').length

  return <div className="sci-page sci-comparison-page">
    <ScientistBackLink to={`/scientist/experiments/groups/${groupId}`}>Danh sách thí nghiệm</ScientistBackLink>
    <header className="sci-comparison-hero">
      <div className="sci-comparison-hero__icon"><GitCompareArrows size={28} /></div>
      <div className="sci-comparison-hero__content">
        <span>PHÂN TÍCH MÔ HÌNH</span>
        <h1>So sánh thí nghiệm</h1>
        <p>{group?.group_name || 'Batch'} · So sánh kết quả test cuối của các thí nghiệm trên cùng dữ liệu.</p>
      </div>
      <div className="sci-comparison-hero__stat"><strong>{completedCount}</strong><span>thí nghiệm hoàn thành</span></div>
    </header>
    {loading && <div className="sci-state"><div className="sci-spinner" /> Đang tải thí nghiệm…</div>}
    {error && <div className="sci-state sci-state--error" role="alert">{error}</div>}
    {!loading && !error && <ExperimentComparePanel
      experiments={groupExperiments}
      selectedCompareIds={selectedCompareIds}
      onChangeCompareIds={(ids) => { clearComparison(); setSelection({ groupId, ids }) }}
      onRunCompare={runComparison}
      rankingOnly
      onSelectBestOverall={(ids) => runComparison(ids, 'overall')}
      resultMode={resultMode}
      comparisonData={comparisonData}
      isComparing={isComparing || history.opening}
      compareError={compareError}
      onViewExperimentDetail={(experimentId) => navigate(`/scientist/experiments/groups/${groupId}/${experimentId}`)}
      onCreateWithSameSplit={(experiment) => navigate(`/scientist/experiments/groups/${groupId}/new?split_id=${encodeURIComponent(experiment.split_id)}`)}
      onUseForPrediction={(experiment) => navigate(`/scientist/datasets/groups/${groupId}/predict?experimentId=${encodeURIComponent(experiment.experiment_id)}`)}
    />}
    <ComparisonHistoryPanel rows={history.rows} loading={history.loading} error={history.error}
      disabled={isComparing || history.opening} onReload={history.reload} onOpen={openHistory} />
    {!loading && !error && completedCount < 2 && <div className="sci-comparison-hint"><Layers3 size={20} /><div><strong>Cần ít nhất 2 thí nghiệm COMPLETED</strong><span>Hãy tạo thêm thí nghiệm trên cùng Split ID để có thể đối chiếu công bằng.</span></div></div>}
  </div>
}

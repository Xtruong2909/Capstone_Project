import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { GitCompareArrows, Layers3 } from 'lucide-react'
import { useApprovedGroups } from '../../../hooks/useScientistData'
import { useScienceExperimentComparison, useScienceExperiments } from '../../../hooks/useScienceWorkflow'
import ExperimentComparePanel from '../components/ExperimentComparePanel'
import ScientistBackLink from '../components/ScientistBackLink'

export default function ScientistExperimentComparisonPage() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const [selectedCompareIds, setSelectedCompareIds] = useState([])
  const { groups } = useApprovedGroups()
  const { experiments, loading, error } = useScienceExperiments()
  const { comparisonData, isComparing, compareError, compareExperiments } = useScienceExperimentComparison()

  const group = groups.find((item) => String(item.group_id) === String(groupId))
  const groupExperiments = useMemo(() => experiments
    .filter((item) => String(item.group_id) === String(groupId))
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
        <p>{group?.group_name || 'Batch'} · Đối chiếu cấu hình, MAE và RMSE trên cùng tập Test.</p>
      </div>
      <div className="sci-comparison-hero__stat"><strong>{completedCount}</strong><span>thí nghiệm hoàn thành</span></div>
    </header>
    {loading && <div className="sci-state"><div className="sci-spinner" /> Đang tải thí nghiệm…</div>}
    {error && <div className="sci-state sci-state--error" role="alert">{error}</div>}
    {!loading && !error && <ExperimentComparePanel
      experiments={groupExperiments}
      selectedCompareIds={selectedCompareIds}
      onChangeCompareIds={setSelectedCompareIds}
      onRunCompare={compareExperiments}
      comparisonData={comparisonData}
      isComparing={isComparing}
      compareError={compareError}
      onViewExperimentDetail={(experimentId) => navigate(`/scientist/experiments/groups/${groupId}/${experimentId}`)}
      onCreateWithSameSplit={(experiment) => navigate(`/scientist/experiments/groups/${groupId}/new?split_id=${encodeURIComponent(experiment.split_id)}`)}
      onUseForPrediction={(experiment) => navigate(`/scientist/datasets/groups/${groupId}/predict?experimentId=${encodeURIComponent(experiment.experiment_id)}`)}
    />}
    {!loading && !error && completedCount < 2 && <div className="sci-comparison-hint"><Layers3 size={20} /><div><strong>Cần ít nhất 2 thí nghiệm COMPLETED</strong><span>Hãy tạo thêm thí nghiệm trên cùng Split ID để có thể đối chiếu công bằng.</span></div></div>}
  </div>
}

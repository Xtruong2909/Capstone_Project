import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronRight, Eye, FlaskConical, FolderOpen, GitCompareArrows } from 'lucide-react'
import { useApprovedGroups, useGroupDatasets, useGroupSessionMetadata } from '../../../hooks/useScientistData'
import { useScienceExperiments } from '../../../hooks/useScienceWorkflow'
import { MetricsTable, PredictionDetailsTable } from '../components/ExperimentDetailTables'
import ScientistBackLink from '../components/ScientistBackLink'
import { ActualPredictedChart } from '../components/ExperimentResultCharts'
import ForecastOriginAnalysis from '../components/ForecastOriginAnalysis'
import { isTrainTestExperiment } from '../utils/experimentPreset'

const UNASSIGNED_GROUP = 'unassigned'
export default function ScientistExperimentsPage() {
  const { groupId, experimentId } = useParams()
  const [search, setSearch] = useState('')
  const { groups, reload: reloadGroups } = useApprovedGroups()
  const { experiments, detail, loading, detailLoading, error, reload } = useScienceExperiments(experimentId)
  const activeDetail = detail?.experiment_id === experimentId ? detail : null
  const groupNames = useMemo(() => new Map(groups.map((group) => [group.group_id, group.group_name])), [groups])
  const groupName = (id) => id === UNASSIGNED_GROUP
    ? 'Chưa xác định batch'
    : groupNames.get(id) || `Batch ${id.slice(0, 8)}`
  const selectedGroupId = groupId || (experimentId && activeDetail ? activeDetail.group_id || UNASSIGNED_GROUP : null)
  const { datasets: groupDatasets } = useGroupDatasets(experimentId && selectedGroupId !== UNASSIGNED_GROUP ? selectedGroupId : null)
  const sessionsById = useGroupSessionMetadata(groupDatasets)
  const grouped = useMemo(() => {
    const byGroup = new Map()
    for (const experiment of experiments) {
      if (!isTrainTestExperiment(experiment)) continue
      const id = experiment.group_id || UNASSIGNED_GROUP
      if (!byGroup.has(id)) byGroup.set(id, [])
      byGroup.get(id).push(experiment)
    }
    return [...byGroup].map(([id, items]) => ({ id, items }))
  }, [experiments])
  const groupExperiments = useMemo(
    () => grouped.find(({ id }) => id === selectedGroupId)?.items || [],
    [grouped, selectedGroupId],
  )
  const selectedSplitId = useMemo(() => [...groupExperiments]
    .filter((item) => item.split_id)
    .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))[0]?.split_id || null,
  [groupExperiments])
  const splitQuery = selectedSplitId ? `?split_id=${encodeURIComponent(selectedSplitId)}` : ''
  const query = search.trim().toLocaleLowerCase()
  const visibleGroups = grouped.filter(({ id, items }) =>
    !query || groupName(id).toLocaleLowerCase().includes(query) || items.some((item) =>
      `${item.experiment_name} ${item.status}`.toLocaleLowerCase().includes(query)))
  const visibleExperiments = groupExperiments
    .filter((item) => `${item.experiment_name} ${item.experiment_id} ${item.status}`.toLocaleLowerCase().includes(query))
    .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))

  const refresh = () => { reload(); reloadGroups() }
  return <div className="sci-page">
    {selectedGroupId && <ScientistBackLink to={experimentId ? `/scientist/experiments/groups/${selectedGroupId}` : '/scientist/experiments'}>{experimentId ? 'Danh sách thí nghiệm' : 'Tất cả batch'}</ScientistBackLink>}
    {!experimentId && <section className="admin-card" style={{ marginTop: selectedGroupId ? '1rem' : 0 }}>
      <div className="admin-card__header"><div>
        <h2 className="admin-card__title">{selectedGroupId ? `Thí nghiệm · ${groupName(selectedGroupId)}` : 'Thí nghiệm theo batch'}</h2>
        <p className="admin-card__subtitle">{selectedGroupId ? 'Các thí nghiệm Train/Test của batch.' : 'Chọn batch để xem các thí nghiệm Train/Test đã tạo.'}</p>
      </div><div className="sci-experiments-header-actions">
        {groupId && groupExperiments.some((item) => item.status === 'COMPLETED') && <Link className="sci-training-button sci-training-button--secondary" to={`/scientist/experiments/groups/${groupId}/compare`}><GitCompareArrows size={16} /> So sánh thí nghiệm</Link>}
        {groupId && selectedSplitId && <Link className="sci-training-button" to={`/scientist/experiments/groups/${groupId}/new${splitQuery}`}><FlaskConical size={16} /> Tạo thí nghiệm mới</Link>}
        <span className="sci-pill sci-pill--data">{selectedGroupId ? visibleExperiments.length : grouped.length} {selectedGroupId ? 'thí nghiệm' : 'batch'}</span>
      </div></div>
      <div className="sci-toolbar sci-experiment-toolbar"><input className="admin-input" type="search" aria-label="Tìm thí nghiệm"
        placeholder={selectedGroupId ? 'Tìm thí nghiệm…' : 'Tìm batch hoặc thí nghiệm…'} value={search} onChange={(event) => setSearch(event.target.value)} />
        <button type="button" className="btn-secondary" disabled={loading} onClick={refresh}>Làm mới</button></div>
    </section>}
    {!experimentId && loading && <div className="sci-state"><div className="sci-spinner" /> Đang tải thí nghiệm…</div>}
    {error && <div className="sci-state sci-state--error" role="alert">{error}</div>}
    {!loading && !error && !experimentId && !selectedGroupId && visibleGroups.length === 0 &&
      <div className="sci-state">{query ? 'Không tìm thấy batch hoặc thí nghiệm phù hợp.' : 'Chưa có thí nghiệm.'}</div>}
    {!loading && !error && !experimentId && !selectedGroupId && visibleGroups.length > 0 && <div className="sci-overview-list sci-hierarchy-list">
      {visibleGroups.map(({ id, items }) => <Link key={id} className="sci-overview-row" to={`/scientist/experiments/groups/${id}`}>
        <span className="sci-overview-row__left"><span className="sci-overview-row__avatar"><FolderOpen size={22} /></span>
          <span className="sci-overview-row__info"><span className="sci-overview-row__name">{groupName(id)}</span>
            <span className="sci-overview-row__meta">{items.length} thí nghiệm · {items.filter((item) => item.status === 'COMPLETED').length} hoàn thành</span>
          </span></span><span className="sci-action-chip sci-action-chip--primary">Xem thí nghiệm <ChevronRight size={15} /></span>
      </Link>)}
    </div>}
    {!loading && !error && !experimentId && selectedGroupId && visibleExperiments.length === 0 &&
      <div className="sci-state">{query ? 'Không tìm thấy thí nghiệm phù hợp.' : 'Batch này chưa có thí nghiệm.'}</div>}
    {!loading && !error && !experimentId && selectedGroupId && visibleExperiments.length > 0 && <section className="admin-card" style={{ marginTop: '1rem' }}>
      <div className="sci-table-wrap"><table className="sci-table"><thead><tr>
        <th>Thí nghiệm</th><th>Cây / sâu / lá / chia</th><th>Trạng thái</th><th>Train/Test</th><th>Ngày tạo</th><th>Thao tác</th>
      </tr></thead><tbody>{visibleExperiments.map((item) => <tr key={item.experiment_id}>
        <td><FlaskConical size={15} style={{ verticalAlign: 'middle', marginRight: '.4rem' }} />{item.experiment_name}</td>
        <td>{[item.hyperparameters?.n_estimators, item.hyperparameters?.max_depth ?? '∞', item.hyperparameters?.min_samples_leaf, item.hyperparameters?.min_samples_split].join(' / ')}</td>
        <td>{item.status}</td><td>{item.train_samples ?? '—'} / {item.test_samples ?? '—'}</td>
        <td>{new Date(item.created_at).toLocaleString('vi-VN')}</td>
        <td><Link className="sci-action-chip sci-action-chip--primary sci-experiment-view"
          aria-label={`Xem thí nghiệm ${item.experiment_name}`}
          to={`/scientist/experiments/groups/${selectedGroupId}/${item.experiment_id}`}><Eye size={15} /> Xem</Link></td>
      </tr>)}</tbody></table></div>
    </section>}
    {experimentId && <section className="admin-card" style={{ marginTop: '1rem' }}><div className="sci-card-body sci-experiment-detail">
      {(detailLoading || !activeDetail && !error) ? <p>Đang tải chi tiết…</p>
        : activeDetail && (activeDetail.group_id || UNASSIGNED_GROUP) !== selectedGroupId
          ? <p role="alert" className="sci-state--error">Thí nghiệm này không thuộc batch đã chọn.</p>
          : activeDetail && <><h2>{activeDetail.experiment_name} · Kết quả huấn luyện</h2>
        <p>Trạng thái: <strong>{activeDetail.status}</strong> · Mô hình: {activeDetail.model}</p>
        <div className="sci-experiment-detail__summary"><span>Train <b>{activeDetail.train_samples ?? '—'} mẫu</b></span><span>Test <b>{activeDetail.test_samples ?? '—'} mẫu</b></span><span>Mốc dự báo <b>+1, +3, +5 phút</b></span></div>
        {activeDetail.error && <p role="alert" className="sci-state--error">{activeDetail.error}</p>}
        <PredictionDetailsTable rows={activeDetail.result_tables?.prediction_details?.length
          ? activeDetail.result_tables.prediction_details : activeDetail.prediction_rows || []} sessionsById={sessionsById} />
        <section className="sci-experiment-result-block">
          <h3>Đánh giá theo mô hình và mốc dự báo</h3>
          <div className="sci-experiment-metric-guide">
            <span><b>MAE</b> Sai số tuyệt đối trung bình</span>
            <span><b>RMSE</b> Căn bậc hai của sai số bình phương trung bình</span>
            <small>Hai chỉ số càng thấp thì dự báo càng sát thực tế. MAE và RMSE trong bảng chi tiết được tính theo từng mô hình và mốc của session.</small>
          </div>
          <MetricsTable metrics={activeDetail.performance_by_model_and_horizon} />
        </section>
        <ActualPredictedChart predictions={activeDetail.result_tables?.prediction_details?.length
          ? activeDetail.result_tables.prediction_details : activeDetail.prediction_rows || []} sessionsById={sessionsById} />
        {activeDetail.status === 'COMPLETED' && <ForecastOriginAnalysis key={activeDetail.experiment_id} experimentId={activeDetail.experiment_id} />}
        <details><summary>Siêu tham số đã dùng</summary><pre>{JSON.stringify(activeDetail.hyperparameters, null, 2)}</pre></details>
      </>}
    </div></section>}
  </div>
}

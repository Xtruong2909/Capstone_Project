import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronRight, Eye, FlaskConical, FolderOpen, GitCompareArrows } from 'lucide-react'
import { useApprovedGroups, useGroupDatasets, useGroupSessionMetadata } from '../../../hooks/useScientistData'
import { useScienceExperiments } from '../../../hooks/useScienceWorkflow'
import { formatAthensRecordingDateTime } from '../utils/formatters'
import { sortRecordingSessions } from '../utils/sortRecordingSessions'
import ScientistBackLink from '../components/ScientistBackLink'

const UNASSIGNED_GROUP = 'unassigned'
const formatMetric = (value) => value == null ? '—' : Number(value).toFixed(2)
const MODEL_DISPLAY_ORDER = new Map([
  ['RANDOM_FOREST', 0],
  ['PERSISTENCE', 1],
  ['HISTORICAL_AVERAGE', 2],
])

function predictionTimestamp(row) {
  const timestamp = new Date(row.target_time ?? row.target_timestamp).getTime()
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp
}

function predictionHorizon(row) {
  const value = Number(row.forecast_horizon ?? row.horizon_minutes)
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY
}

function predictionModelOrder(row) {
  return MODEL_DISPLAY_ORDER.get(String(row.model).toUpperCase()) ?? MODEL_DISPLAY_ORDER.size
}

function MetricsTable({ metrics }) {
  const rows = Object.entries(metrics || {}).flatMap(([model, horizons]) =>
    Object.entries(horizons || {}).map(([horizon, values]) => ({
      model,
      horizon: Number(String(horizon).replace(/\D/g, '')),
      values,
    })))
    .sort((left, right) => left.horizon - right.horizon
      || Number(left.values.mae) - Number(right.values.mae))
  if (!rows.length) return <p>Chưa có số liệu đánh giá.</p>
  const minimumByHorizon = new Map()
  for (const row of rows) {
    const current = minimumByHorizon.get(row.horizon) || { mae: Number.POSITIVE_INFINITY, rmse: Number.POSITIVE_INFINITY }
    minimumByHorizon.set(row.horizon, {
      mae: Math.min(current.mae, Number(row.values.mae)),
      rmse: Math.min(current.rmse, Number(row.values.rmse)),
    })
  }
  return <div className="sci-table-wrap sci-metrics-table"><table className="sci-table"><thead><tr>
    <th>Mốc dự báo</th><th>Mô hình</th><th title="Sai số tuyệt đối trung bình">MAE</th><th title="Căn bậc hai của sai số bình phương trung bình">RMSE</th><th>Số mẫu</th>
  </tr></thead><tbody>{rows.map((row, index) => {
    const minimum = minimumByHorizon.get(row.horizon)
    const startsGroup = index === 0 || rows[index - 1].horizon !== row.horizon
    return <tr className={`sci-metric-row sci-metric-row--h${row.horizon}${startsGroup ? ' sci-metric-row--group-start' : ''}`} key={`${row.model}:${row.horizon}`}>
      <td><span className={`sci-horizon-badge sci-horizon-badge--h${row.horizon}`}>+{row.horizon} phút</span></td>
      <td><span className={`sci-model-badge sci-model-badge--${String(row.model).toLowerCase()}`}>{row.model}</span></td>
      <td><span className={Number(row.values.mae) === minimum.mae ? 'sci-metric-best' : ''}>{formatMetric(row.values.mae)}</span></td>
      <td><span className={Number(row.values.rmse) === minimum.rmse ? 'sci-metric-best' : ''}>{formatMetric(row.values.rmse)}</span></td>
      <td>{row.values.sample_count ?? '—'}</td>
    </tr>
  })}</tbody></table></div>
}

function ForecastTable({ forecasts }) {
  if (!forecasts?.length) return null
  return <section className="sci-experiment-result-block"><h3>Dự báo cuối tập Test</h3><div className="sci-table-wrap"><table className="sci-table"><thead><tr>
    <th>Mốc</th><th>Thời điểm (Athens)</th><th>Thực tế</th><th>Dự báo</th><th>Sai số</th>
  </tr></thead><tbody>{forecasts.map((row) => <tr className={`sci-forecast-row sci-forecast-row--h${row.horizon_minutes}`} key={row.horizon_minutes}>
    <td><span className={`sci-horizon-badge sci-horizon-badge--h${row.horizon_minutes}`}>+{row.horizon_minutes} phút</span></td><td>{formatAthensRecordingDateTime(row.target_timestamp)}</td>
    <td>{formatMetric(row.actual_traffic_flow)}</td><td>{formatMetric(row.predicted_traffic_flow)}</td>
    <td>{formatMetric(row.absolute_error)}</td>
  </tr>)}</tbody></table></div></section>
}

function ModelSummaryTable({ summaries }) {
  if (!summaries?.length) return null
  return <section className="sci-experiment-results-section sci-experiment-results-section--primary">
    <h3>Tổng hợp sai số theo mô hình</h3>
    <div className="sci-table-wrap"><table className="sci-table"><thead><tr>
              <th>Mô hình</th><th>Số dự đoán</th><th title="Sai số tuyệt đối trung bình">MAE</th><th title="Căn bậc hai của sai số bình phương trung bình">RMSE</th>
    </tr></thead><tbody>{summaries.map((row) => <tr className={`sci-summary-row sci-summary-row--${String(row.model).toLowerCase()}`} key={row.model}>
      <td><span className={`sci-model-badge sci-model-badge--${String(row.model).toLowerCase()}`}>{row.model}</span></td><td>{row.sample_count}</td><td>{formatMetric(row.mae)}</td>
              <td>{formatMetric(row.rmse)}</td>
    </tr>)}</tbody></table></div>
  </section>
}

function PredictionDetailsTable({ rows, sessionsById }) {
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [model, setModel] = useState('all')
  const [horizon, setHorizon] = useState('all')
  const sessions = useMemo(() => {
    const firstTimestampBySession = new Map()
    for (const row of rows) {
      const id = row.session_id || 'unknown'
      const timestamp = String(row.forecast_origin_time || row.target_timestamp || '')
      if (!firstTimestampBySession.has(id) || timestamp < firstTimestampBySession.get(id)) {
        firstTimestampBySession.set(id, timestamp)
      }
    }
    const chronological = [...firstTimestampBySession]
      .sort((left, right) => left[1].localeCompare(right[1]))
      .map(([session_id]) => ({ session_id }))
    return sortRecordingSessions(chronological, sessionsById)
  }, [rows, sessionsById])
  const sessionId = sessions.some((session) => session.session_id === selectedSessionId)
    ? selectedSessionId : sessions[0]?.session_id || ''
  const sessionIndex = sessions.findIndex((session) => session.session_id === sessionId)
  const sessionRows = useMemo(() => rows.filter((row) => (row.session_id || 'unknown') === sessionId), [rows, sessionId])
  const models = useMemo(() => [...new Set(rows.map((row) => row.model))], [rows])
  const horizons = useMemo(() => [...new Set(rows.map((row) => row.horizon_minutes))].sort((a, b) => a - b), [rows])
  const visibleRows = useMemo(() => sessionRows
    .filter((row) => (model === 'all' || row.model === model) && (horizon === 'all' || String(row.horizon_minutes) === horizon))
    .sort((left, right) =>
      predictionTimestamp(left) - predictionTimestamp(right)
      || predictionHorizon(left) - predictionHorizon(right)
      || predictionModelOrder(left) - predictionModelOrder(right)),
  [sessionRows, model, horizon])

  return <section className="sci-experiment-results-section">
    <div className="sci-experiment-results-section__heading">
      <div><h3>Dự đoán trên tập Test theo session</h3>
        <p>Session {sessionIndex + 1}/{sessions.length} · Hiển thị {visibleRows.length} / {sessionRows.length} dự đoán trong session ({rows.length} dự đoán toàn bộ tập Test).</p></div>
      {rows.length > 0 && <div className="sci-experiment-results-filters">
        <label>Session <select value={sessionId} onChange={(event) => setSelectedSessionId(event.target.value)}>
          {sessions.map((session, index) => <option key={session.session_id} value={session.session_id}>
            {sessionsById[session.session_id]?.original_filename || `Session ${index + 1}`}
          </option>)}
        </select></label>
        <label>Mô hình <select value={model} onChange={(event) => setModel(event.target.value)}>
          <option value="all">Tất cả</option>
          {models.map((item) => <option key={item} value={item}>{item}</option>)}
        </select></label>
        <label>Mốc dự báo <select value={horizon} onChange={(event) => setHorizon(event.target.value)}>
          <option value="all">Tất cả</option>
          {horizons.map((item) => <option key={item} value={item}>+{item} phút</option>)}
        </select></label>
      </div>}
    </div>
    {sessionRows.length && !visibleRows.length && <p>Session này không có dự đoán phù hợp với bộ lọc.</p>}
    {visibleRows.length ? <div className="sci-table-wrap sci-experiment-predictions-table"><table className="sci-table"><thead><tr>
      <th>Mô hình</th><th>Mốc</th><th>Thời điểm dự báo (Athens)</th><th>Thời điểm cần dự báo (Athens)</th>
      <th>Thực tế</th><th>Dự báo</th><th>Sai số tuyệt đối</th>
    </tr></thead><tbody>{visibleRows.map((row, index) => <tr className={`sci-prediction-row sci-prediction-row--h${row.horizon_minutes}`} key={`${row.model}:${row.horizon_minutes}:${row.forecast_origin_time}:${row.target_timestamp}:${index}`}>
      <td><span className={`sci-model-badge sci-model-badge--${String(row.model).toLowerCase()}`}>{row.model}</span></td>
      <td><span className={`sci-horizon-badge sci-horizon-badge--h${row.horizon_minutes}`}>+{row.horizon_minutes} phút</span></td>
      <td>{formatAthensRecordingDateTime(row.forecast_origin_time)}</td>
      <td>{formatAthensRecordingDateTime(row.target_timestamp)}</td>
      <td>{formatMetric(row.actual_traffic_flow)}</td>
      <td>{formatMetric(row.predicted_traffic_flow)}</td>
      <td>{formatMetric(row.absolute_error)}</td>
    </tr>)}</tbody></table></div> : !sessionRows.length && <p>Chưa có dự đoán trên tập Test.</p>}
  </section>
}

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
        <p className="admin-card__subtitle">{selectedGroupId ? 'Tất cả thí nghiệm của batch được hiển thị trên cùng một trang.' : 'Chọn batch để xem các thí nghiệm đã tạo.'}</p>
      </div><div className="sci-experiments-header-actions">
        {groupId && visibleExperiments.filter((item) => item.status === 'COMPLETED').length >= 2 && <Link className="sci-training-button sci-training-button--secondary" to={`/scientist/experiments/groups/${groupId}/compare`}><GitCompareArrows size={16} /> So sánh thí nghiệm</Link>}
        {groupId && selectedSplitId && <Link className="sci-training-button" to={`/scientist/experiments/groups/${groupId}/new${splitQuery}`}><FlaskConical size={16} /> Tạo thí nghiệm mới</Link>}
        <span className="sci-pill sci-pill--version">{selectedGroupId ? visibleExperiments.length : grouped.length} {selectedGroupId ? 'thí nghiệm' : 'batch'}</span>
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
        <th>Thí nghiệm</th><th>Trạng thái</th><th>Train/Test</th><th>Ngày tạo</th><th>Thao tác</th>
      </tr></thead><tbody>{visibleExperiments.map((item) => <tr key={item.experiment_id}>
        <td><FlaskConical size={15} style={{ verticalAlign: 'middle', marginRight: '.4rem' }} />{item.experiment_name}</td>
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
            <small>Hai chỉ số càng thấp thì dự báo càng sát thực tế. Sai số tuyệt đối trong bảng chi tiết là sai số của từng dự đoán.</small>
          </div>
          <MetricsTable metrics={activeDetail.performance_by_model_and_horizon} />
        </section>
        <ModelSummaryTable summaries={activeDetail.result_tables?.model_summary} />
        <ForecastTable forecasts={activeDetail.result_tables?.horizon_forecasts} />
        <details><summary>Siêu tham số đã dùng</summary><pre>{JSON.stringify(activeDetail.hyperparameters, null, 2)}</pre></details>
      </>}
    </div></section>}
  </div>
}

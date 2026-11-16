import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useApprovedDatasets, useApprovedGroups, useGroupDatasets } from '../../../hooks/useScientistData'
import { useSciencePrediction } from '../../../hooks/useScienceWorkflow'

export default function ScientistPredictionPage() {
  const { groupId, datasetId, versionId } = useParams()
  const preferredExperimentId = new URLSearchParams(useLocation().search).get('experimentId')
  const [selectedVersionId, setSelectedVersionId] = useState('')
  const { groups, isLoading: groupsLoading, error: groupsError } = useApprovedGroups()
  const { datasets: groupDatasets, isLoading: groupDatasetsLoading, error: groupDatasetsError } = useGroupDatasets(groupId)
  const { datasets, isLoading: datasetsLoading, error: datasetsError } = useApprovedDatasets()
  const dataset = groupId
    ? groupDatasets.find((item) => item.version_id === selectedVersionId)
    : datasets.find((item) => item.dataset_id === datasetId && item.version_id === versionId)
  const activeGroupId = groupId || dataset?.group_id
  const group = groups.find((item) => item.group_id === activeGroupId)
  const activeVersionId = groupId ? selectedVersionId : versionId
  const { experiments, experimentId, setExperimentId, sessions, sessionsLoading, sessionIds, setSessionIds, forecast, history, busy, error, predict } = useSciencePrediction(activeVersionId, preferredExperimentId)
  const isLoading = groupsLoading || (groupId ? groupDatasetsLoading : datasetsLoading)
  return <div className="sci-page"><Link className="sci-back" to="/scientist/datasets">← Các batch</Link>
    <h1>Dự báo lưu lượng</h1><p>{group?.group_name || 'Batch'}{dataset ? ` · ${dataset.dataset_name}` : ''}</p>
    {isLoading && <p>Đang tải batch…</p>}
    {(groupsError || (groupId ? groupDatasetsError : datasetsError)) && <p role="alert" className="sci-state--error">{groupsError || groupDatasetsError || datasetsError}</p>}
    {!isLoading && !group && <p role="alert">Bạn không có quyền truy cập batch này.</p>}
    {error && <p role="alert" className="sci-state--error">{error}</p>}
    {group && <section className="admin-card"><div className="sci-card-body" style={{ display: 'grid', gap: '1rem' }}>
      {groupId && <label>Dataset trong batch<select className="sci-dataset-select" value={selectedVersionId} onChange={(event) => { setSelectedVersionId(event.target.value); setExperimentId('') }}>
        <option value="">Chọn dataset</option>{groupDatasets.map((item) => <option key={item.version_id} value={item.version_id}>{item.dataset_name}</option>)}
      </select></label>}
      {dataset && <>
      <label>Thí nghiệm đã hoàn thành<select className="sci-dataset-select" value={experimentId} onChange={(event) => setExperimentId(event.target.value)}>
        <option value="">Chọn thí nghiệm</option>{experiments.map((item) => <option key={item.experiment_id} value={item.experiment_id}>{item.experiment_name}</option>)}
      </select></label>
      {experimentId && <fieldset><legend>Recording Sessions đủ điều kiện</legend>{sessionsLoading ? <p>Đang tải session…</p> : sessions.length === 0 ? <p>Không có session phù hợp cho dataset này.</p> : sessions.map((session) => <label key={session.session_id} style={{ display: 'block', margin: '.5rem 0' }}>
        <input type="checkbox" checked={sessionIds.includes(session.session_id)} onChange={(event) => setSessionIds((current) => event.target.checked ? [...current, session.session_id] : current.filter((id) => id !== session.session_id))} /> {session.session_id} · {session.available_consecutive_minutes} phút liên tục
      </label>)}</fieldset>}
      <button type="button" disabled={busy || sessionsLoading || !experimentId || !sessionIds.length} onClick={predict}>Dự báo +1, +3, +5 phút</button>
      {forecast && <div><h2>Kết quả · {forecast.status}</h2>{forecast.results_by_session.map((session) => <div key={session.session_id}>
        <h3>Session {session.session_id}</h3><div className="sci-table-wrap"><table className="sci-table"><thead><tr><th>Mốc</th><th>Thời gian</th><th>Số xe dự báo</th><th>Thực tế</th></tr></thead><tbody>
          {session.predictions.map((point) => <tr key={point.horizon}><td>+{point.horizon} phút</td><td>{new Date(point.forecast_timestamp).toLocaleString('vi-VN')}</td><td>{point.predicted_vehicle_count}</td><td>{point.actual_vehicle_count ?? '—'}</td></tr>)}
        </tbody></table></div></div>)}
        {forecast.session_errors?.map((item, index) => <p role="alert" key={index}>{item.message || JSON.stringify(item)}</p>)}
      </div>}
      </>}
    </div></section>}
    <section className="admin-card" style={{ marginTop: '1rem' }}><div className="sci-card-body"><h2>Lịch sử dự báo</h2>
      {history.length === 0 ? <p>Chưa có dự báo.</p> : <div className="sci-table-wrap"><table className="sci-table"><thead><tr><th>Thí nghiệm</th><th>Trạng thái</th><th>Số session</th><th>Thời gian</th></tr></thead><tbody>
        {history.map((item) => <tr key={item.forecast_id}><td>{item.experiment_name}</td><td>{item.status}</td><td>{item.session_count}</td><td>{new Date(item.created_at).toLocaleString('vi-VN')}</td></tr>)}
      </tbody></table></div>}
    </div></section>
  </div>
}

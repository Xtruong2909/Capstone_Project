import { Activity, CheckCircle2, Clock3, Database, FlaskConical, History, LoaderCircle, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { useApprovedDatasets, useApprovedGroups, useGroupDatasets } from '../../../hooks/useScientistData'
import { useSciencePrediction } from '../../../hooks/useScienceWorkflow'
import ScientistBackLink from '../components/ScientistBackLink'

const shortId = (value) => value ? String(value).slice(0, 8) : '—'
const formatDateTime = (value) => value ? new Date(value).toLocaleString('vi-VN') : '—'

export default function ScientistPredictionPage() {
  const { groupId, datasetId, versionId } = useParams()
  const preferredExperimentId = new URLSearchParams(useLocation().search).get('experimentId')
  const [selectedVersionId, setSelectedVersionId] = useState('')
  const { groups, isLoading: groupsLoading, error: groupsError } = useApprovedGroups()
  const { datasets: groupDatasets, isLoading: groupDatasetsLoading, error: groupDatasetsError } = useGroupDatasets(groupId)
  const { datasets, isLoading: datasetsLoading, error: datasetsError } = useApprovedDatasets()

  const effectiveVersionId = selectedVersionId || groupDatasets[0]?.version_id || ''

  const dataset = groupId
    ? groupDatasets.find((item) => item.version_id === effectiveVersionId)
    : datasets.find((item) => item.dataset_id === datasetId && item.version_id === versionId)
  const activeGroupId = groupId || dataset?.group_id
  const group = groups.find((item) => item.group_id === activeGroupId)
  const activeVersionId = groupId ? effectiveVersionId : versionId
  const {
    experiments, experimentId, setExperimentId, sessions, sessionsLoading,
    sessionIds, setSessionIds, forecast, history, busy, error, predict,
  } = useSciencePrediction(activeVersionId, preferredExperimentId)
  const isLoading = groupsLoading || (groupId ? groupDatasetsLoading : datasetsLoading)
  const loadError = groupsError || (groupId ? groupDatasetsError : datasetsError)
  const canPredict = Boolean(experimentId && sessionIds.length && !sessionsLoading && !busy)

  const toggleSession = (sessionId, checked) => {
    setSessionIds((current) => checked
      ? [...new Set([...current, sessionId])]
      : current.filter((id) => id !== sessionId))
  }

  return <div className="sci-page sci-prediction-page">
    <ScientistBackLink to="/scientist/datasets">Tất cả batch</ScientistBackLink>

    <header className="sci-prediction-hero">
      <div className="sci-prediction-hero__icon"><Activity size={28} /></div>
      <div className="sci-prediction-hero__text">
        <span>DỰ BÁO GIAO THÔNG</span>
        <h1>Dự báo lưu lượng</h1>
        <p>{group?.group_name || 'Batch'}{dataset ? ` · ${dataset.dataset_name}` : ' · Chọn dữ liệu và thí nghiệm để bắt đầu'}</p>
      </div>
      <div className="sci-prediction-hero__horizons"><b>+1</b><b>+3</b><b>+5</b><span>phút</span></div>
    </header>

    {isLoading && <div className="sci-state"><div className="sci-spinner" /> Đang tải dữ liệu dự báo…</div>}
    {loadError && <div role="alert" className="sci-state sci-state--error">{loadError}</div>}
    {!isLoading && !loadError && !group && <div role="alert" className="sci-state sci-state--error">Bạn không có quyền truy cập batch này.</div>}
    {error && <div role="alert" className="sci-state sci-state--error">{error}</div>}

    {group && <section className="sci-prediction-card sci-prediction-setup">
      <div className="sci-prediction-section-heading">
        <div className="sci-prediction-section-heading__icon"><Sparkles size={20} /></div>
        <div><h2>Cấu hình dự báo</h2><p>Chọn nguồn dữ liệu, thí nghiệm đã huấn luyện và các session cần dự báo.</p></div>
      </div>

      <div className="sci-prediction-fields">
        {groupId && <label><span><b>1</b> Dataset trong batch</span>
          <select value={effectiveVersionId} onChange={(event) => { setSelectedVersionId(event.target.value); setExperimentId('') }}>
            <option value="">Chọn dataset</option>
            {groupDatasets.map((item) => <option key={item.version_id} value={item.version_id}>{item.dataset_name}</option>)}
          </select>
        </label>}
        <label className={!dataset ? 'is-disabled' : ''}><span><b>{groupId ? 2 : 1}</b> Thí nghiệm đã hoàn thành</span>
          <select value={experimentId} disabled={!dataset} onChange={(event) => setExperimentId(event.target.value)}>
            <option value="">Chọn thí nghiệm</option>
            {experiments.map((item) => <option key={item.experiment_id} value={item.experiment_id}>{item.experiment_name}</option>)}
          </select>
          {dataset && experiments.length === 0 && <small>Dataset này chưa có thí nghiệm đủ điều kiện dự báo.</small>}
        </label>
      </div>

      {experimentId && <div className="sci-prediction-sessions">
        <div className="sci-prediction-sessions__heading">
          <div><h3><Database size={17} /> {groupId ? '3' : '2'}. Chọn Recording Session</h3><p>Chọn một hoặc nhiều session có chuỗi dữ liệu liên tục.</p></div>
          {sessions.length > 0 && <button type="button" onClick={() => setSessionIds(sessionIds.length === sessions.length ? [] : sessions.map((item) => item.session_id))}>
            {sessionIds.length === sessions.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
          </button>}
        </div>
        {sessionsLoading ? <div className="sci-prediction-empty"><LoaderCircle className="sci-training-spin" size={20} /> Đang tải session…</div>
          : sessions.length === 0 ? <div className="sci-prediction-empty">Không có session phù hợp cho dataset này.</div>
            : <div className="sci-prediction-session-grid">{sessions.map((session) => <label key={session.session_id} className={sessionIds.includes(session.session_id) ? 'is-selected' : ''}>
              <input type="checkbox" checked={sessionIds.includes(session.session_id)} onChange={(event) => toggleSession(session.session_id, event.target.checked)} />
              <span><strong>Session {shortId(session.session_id)}</strong><small><Clock3 size={13} /> {session.available_consecutive_minutes} phút liên tục</small></span>
              <CheckCircle2 size={18} />
            </label>)}</div>}
      </div>}

      <div className="sci-prediction-actions">
        <span>{sessionIds.length ? `Đã chọn ${sessionIds.length} session` : 'Chọn session để chạy dự báo'}</span>
        <button type="button" className="sci-prediction-submit" disabled={!canPredict} onClick={predict}>
          {busy ? <LoaderCircle className="sci-training-spin" size={18} /> : <FlaskConical size={18} />}
          {busy ? 'Đang dự báo…' : 'Dự báo +1, +3, +5 phút'}
        </button>
      </div>
    </section>}

    {forecast && <section className="sci-prediction-card sci-prediction-results">
      <div className="sci-prediction-section-heading"><div className="sci-prediction-section-heading__icon sci-prediction-section-heading__icon--green"><CheckCircle2 size={20} /></div><div><h2>Kết quả dự báo</h2><p>Trạng thái: <strong>{forecast.status}</strong></p></div></div>
      {forecast.results_by_session.map((session) => <div className="sci-prediction-result-session" key={session.session_id}>
        <h3>Session {shortId(session.session_id)}</h3>
        <div className="sci-table-wrap"><table className="sci-table"><thead><tr><th>Mốc dự báo</th><th>Thời gian</th><th>Số xe dự báo</th><th>Thực tế</th></tr></thead><tbody>
          {session.predictions.map((point) => <tr key={point.horizon}><td><span className={`sci-horizon-badge sci-horizon-badge--h${point.horizon}`}>+{point.horizon} phút</span></td><td>{formatDateTime(point.forecast_timestamp)}</td><td><strong>{point.predicted_vehicle_count}</strong></td><td>{point.actual_vehicle_count ?? '—'}</td></tr>)}
        </tbody></table></div>
      </div>)}
      {forecast.session_errors?.map((item, index) => <div className="sci-state sci-state--error" role="alert" key={index}>{item.message || JSON.stringify(item)}</div>)}
    </section>}

    <section className="sci-prediction-card sci-prediction-history">
      <div className="sci-prediction-section-heading"><div className="sci-prediction-section-heading__icon sci-prediction-section-heading__icon--purple"><History size={20} /></div><div><h2>Lịch sử dự báo</h2><p>Các lần dự báo đã chạy gần đây.</p></div><span className="sci-prediction-history__count">{history.length} lần</span></div>
      {history.length === 0 ? <div className="sci-prediction-empty sci-prediction-empty--history"><History size={28} /><strong>Chưa có dự báo</strong><span>Kết quả sau khi chạy sẽ xuất hiện tại đây.</span></div>
        : <div className="sci-table-wrap"><table className="sci-table"><thead><tr><th>Thí nghiệm</th><th>Trạng thái</th><th>Số session</th><th>Thời gian tạo</th></tr></thead><tbody>
          {history.map((item) => <tr key={item.forecast_id}><td><strong>{item.experiment_name}</strong></td><td><span className={`sci-prediction-status sci-prediction-status--${String(item.status).toLowerCase()}`}>{item.status}</span></td><td>{item.session_count}</td><td>{formatDateTime(item.created_at)}</td></tr>)}
        </tbody></table></div>}
    </section>
  </div>
}

import { Activity, Database, Eye, FlaskConical, History, LoaderCircle, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link, Outlet, useLocation, useParams } from 'react-router-dom'
import { useApprovedDatasets, useApprovedGroups, useGroupDatasets, useGroupSessionMetadata } from '../../../hooks/useScientistData'
import { useSciencePrediction } from '../../../hooks/useScienceWorkflow'
import { useForecastCharts } from '../../../hooks/useForecastCharts'
import { usePredictionSessionAggregation } from '../../../hooks/usePredictionSessionAggregation'
import ForecastResultsPanel from '../components/ForecastResultsPanel'
import PredictionExperimentConfiguration from '../components/PredictionExperimentConfiguration'
import PredictionSessionAggregation from '../components/PredictionSessionAggregation'
import ScientistBackLink from '../components/ScientistBackLink'

const shortId = (value) => value ? String(value).slice(0, 8) : '—'
const formatDateTime = (value) => value ? new Date(value).toLocaleString('vi-VN') : '—'

export default function ScientistPredictionPage() {
  const { groupId, datasetId, versionId, forecastId } = useParams()
  const location = useLocation()
  const preferredExperimentId = new URLSearchParams(location.search).get('experimentId')
  const [selectedVersionId, setSelectedVersionId] = useState('')
  const { groups, isLoading: groupsLoading, error: groupsError } = useApprovedGroups()
  const { datasets: groupDatasets, isLoading: groupDatasetsLoading, error: groupDatasetsError } = useGroupDatasets(groupId)
  const { datasets, isLoading: datasetsLoading, error: datasetsError } = useApprovedDatasets()

  const effectiveVersionId = selectedVersionId || groupDatasets[0]?.version_id || ''

  const dataset = groupId
    ? groupDatasets.find((item) => item.version_id === effectiveVersionId)
    : datasets.find((item) => item.dataset_id === datasetId && item.version_id === versionId)
  const sessionsById = useGroupSessionMetadata(dataset ? [dataset] : [])
  const activeGroupId = groupId || dataset?.group_id
  const group = groups.find((item) => item.group_id === activeGroupId)
  const activeVersionId = groupId ? effectiveVersionId : versionId
  const {
    experiments, experimentId, setExperimentId, sessions, sessionsLoading, compatibleSessionIds, compatibilityLoading,
    sessionIds, setSessionIds, forecast, history, busy, error, predict,
  } = useSciencePrediction(activeVersionId, preferredExperimentId)
  const { charts, errors: chartErrors, loading: chartsLoading } = useForecastCharts(forecast)
  const isLoading = groupsLoading || (groupId ? groupDatasetsLoading : datasetsLoading)
  const loadError = groupsError || (groupId ? groupDatasetsError : datasetsError)
  const incompatibleSessionCount = compatibleSessionIds == null ? 0
    : sessionIds.filter((id) => !compatibleSessionIds.includes(id)).length
  const selectedSessionId = sessionIds[0] || ''
  const selectedSession = sessions.find((session) => session.session_id === selectedSessionId && session.dataset_version_id === activeVersionId)
  const selectedExperiment = experiments.find((item) => item.experiment_id === experimentId)
  const aggregationPreview = usePredictionSessionAggregation(selectedSession?.aggregation_id, selectedSession?.session_id)
  const canPredict = Boolean(experimentId && selectedSession && sessionIds.length === 1 && compatibleSessionIds
    && !incompatibleSessionCount && !sessionsLoading && !compatibilityLoading && !busy)

  return <>
    <div className={`sci-page sci-prediction-page${forecastId ? ' sci-prediction-page--preserved' : ''}`}>
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
        <div><h2>Cấu hình dự báo</h2><p>Chọn nguồn dữ liệu, session cần dự báo rồi chọn thí nghiệm đã huấn luyện.</p></div>
      </div>

      <div className="sci-prediction-fields">
        {groupId && <label><span><b>1</b> Dataset trong batch</span>
          <select value={effectiveVersionId} onChange={(event) => { setSelectedVersionId(event.target.value); setExperimentId('') }}>
            <option value="">Chọn dataset</option>
            {groupDatasets.map((item) => <option key={item.version_id} value={item.version_id}>{item.dataset_name}</option>)}
          </select>
        </label>}
      </div>

      {dataset && <div className="sci-prediction-sessions">
        <div className="sci-prediction-sessions__heading">
          <div><h3><Database size={17} /> {groupId ? '2' : '1'}. Chọn Recording Session cần dự báo</h3><p>Chọn một session để xem dữ liệu tổng hợp phương tiện theo thời gian.</p></div>
        </div>
        {sessionsLoading ? <div className="sci-prediction-empty"><LoaderCircle className="sci-training-spin" size={20} /> Đang tải session…</div>
          : sessions.length === 0 ? <div className="sci-prediction-empty">Không có session phù hợp cho dataset này.</div>
            : <>
              <label className="sci-prediction-session-select">
                <span>Recording Session</span>
                <select value={selectedSession?.session_id || ''} onChange={(event) => setSessionIds(event.target.value ? [event.target.value] : [])}>
                  <option value="">Chọn session</option>
                  {sessions.map((session) => <option key={session.session_id} value={session.session_id} disabled={compatibleSessionIds != null && !compatibleSessionIds.includes(session.session_id) && session.session_id !== selectedSessionId}>
                    {sessionsById[session.session_id]?.original_filename || `Session ${shortId(session.session_id)}`}{compatibleSessionIds && !compatibleSessionIds.includes(session.session_id) ? ' · Không thuộc thí nghiệm' : ''}
                  </option>)}
                </select>
              </label>
              {selectedSession && <PredictionSessionAggregation
                filename={sessionsById[selectedSessionId]?.original_filename || `Session ${shortId(selectedSessionId)}`}
                session={selectedSession}
                preview={aggregationPreview}
              />}
            </>}
      </div>}

      <div className="sci-prediction-fields sci-prediction-fields--experiment">
        <label className={!dataset || (!sessionIds.length && !experimentId) ? 'is-disabled' : ''}><span><b>{groupId ? 3 : 2}</b> Thí nghiệm đã hoàn thành</span>
          <select value={experimentId} disabled={!dataset || (!sessionIds.length && !experimentId)} onChange={(event) => setExperimentId(event.target.value)}>
            <option value="">Chọn thí nghiệm</option>
            {experiments.map((item) => <option key={item.experiment_id} value={item.experiment_id}>{item.experiment_name}</option>)}
          </select>
          {dataset && experiments.length === 0 && <small>Dataset này chưa có thí nghiệm đủ điều kiện dự báo.</small>}
        </label>
      </div>
      {selectedExperiment && <PredictionExperimentConfiguration experiment={selectedExperiment} />}
      {experimentId && compatibilityLoading && <p className="sci-prediction-compatibility" role="status">Đang kiểm tra session phù hợp với thí nghiệm…</p>}
      {experimentId && !compatibilityLoading && incompatibleSessionCount > 0 && <p className="sci-prediction-compatibility sci-prediction-compatibility--error" role="alert">{incompatibleSessionCount} session đã chọn không thuộc dữ liệu của thí nghiệm này. Hãy đổi thí nghiệm hoặc chọn session khác.</p>}
      {experimentId && !compatibilityLoading && compatibleSessionIds?.length === 0 && <p className="sci-prediction-compatibility sci-prediction-compatibility--error" role="alert">Thí nghiệm này không có session đủ điều kiện trong dataset đã chọn.</p>}

      <div className="sci-prediction-actions">
        <span>{!sessionIds.length ? 'Chọn session để chạy dự báo' : !experimentId ? 'Đã chọn session · Chọn thí nghiệm' : 'Đã chọn session'}</span>
        <button type="button" className="sci-prediction-submit" disabled={!canPredict} onClick={predict}>
          {busy ? <LoaderCircle className="sci-training-spin" size={18} /> : <FlaskConical size={18} />}
          {busy ? 'Đang dự báo…' : 'Dự báo +1, +3, +5 phút'}
        </button>
      </div>
    </section>}

    {forecast && <ForecastResultsPanel forecast={forecast} charts={charts} chartErrors={chartErrors} chartsLoading={chartsLoading} />}

    <section className="sci-prediction-card sci-prediction-history">
      <div className="sci-prediction-section-heading"><div className="sci-prediction-section-heading__icon sci-prediction-section-heading__icon--purple"><History size={20} /></div><div><h2>Lịch sử dự báo</h2><p>{selectedSessionId ? 'Các lần dự báo đã chạy cho session này.' : 'Chọn một session để xem lịch sử dự báo.'}</p></div>{selectedSessionId && <span className="sci-prediction-history__count">{history.length} lần</span>}</div>
      {!selectedSessionId ? null : history.length === 0 ? <div className="sci-prediction-empty sci-prediction-empty--history"><History size={28} /><strong>Chưa có dự báo</strong><span>Session này chưa có lần dự báo nào.</span></div>
        : <div className="sci-table-wrap"><table className="sci-table"><thead><tr><th>Thí nghiệm</th><th>Trạng thái</th><th>Session đã dự báo</th><th>Thời gian tạo</th><th>Kết quả</th></tr></thead><tbody>
          {history.map((item) => <tr key={item.forecast_id} className={forecast?.forecast_id === item.forecast_id ? 'sci-prediction-history-row--active' : ''}><td><strong>{item.experiment_name}</strong></td><td><span className={`sci-prediction-status sci-prediction-status--${String(item.status).toLowerCase()}`}>{item.status}</span></td><td><div className="sci-prediction-history-sessions">{item.sessions?.length ? item.sessions.map((session) => <span key={session.session_id}>{session.original_filename || `Session ${shortId(session.session_id)}`}</span>) : '—'}</div></td><td>{formatDateTime(item.created_at)}</td><td><Link className="sci-prediction-history-view" to={`${location.pathname}/forecasts/${item.forecast_id}`} state={{ returnTo: `${location.pathname}${location.search}` }}><Eye size={15} />Xem kết quả</Link></td></tr>)}
        </tbody></table></div>}
    </section>
    </div>
    <Outlet />
  </>
}

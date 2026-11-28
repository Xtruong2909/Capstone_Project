import { useMemo, useState } from 'react'
import { formatAthensRecordingDateTime, formatTrafficFlow } from '../utils/formatters'
import { sortRecordingSessions } from '../utils/sortRecordingSessions'
import ValidationSessionMetricsTable from './ValidationSessionMetricsTable'

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

export function MetricsTable({ metrics }) {
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

export function ModelSummaryTable({ summaries }) {
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

export function PredictionDetailsTable({ rows, sessionsById, subsetLabel = 'Test', showSessionSummary = false }) {
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
      <div><h3>Dự đoán trên tập {subsetLabel} theo session</h3>
        <p>Session {sessionIndex + 1}/{sessions.length} · Hiển thị {visibleRows.length} / {sessionRows.length} dự đoán trong session ({rows.length} dự đoán toàn bộ tập {subsetLabel}).</p></div>
      {rows.length > 0 && <div className="sci-experiment-results-filters">
        <label>Session <select value={sessionId} onChange={(event) => setSelectedSessionId(event.target.value)}>
          {sessions.map((session, index) => <option key={session.session_id} value={session.session_id}>
            {sessionsById[session.session_id]?.original_filename || `Session ${index + 1}`}
          </option>)}
        </select></label>
        {models.length > 1 && <label>Mô hình <select value={model} onChange={(event) => setModel(event.target.value)}>
          <option value="all">Tất cả</option>
          {models.map((item) => <option key={item} value={item}>{item}</option>)}
        </select></label>}
        <label>Mốc dự báo <select value={horizon} onChange={(event) => setHorizon(event.target.value)}>
          <option value="all">Tất cả</option>
          {horizons.map((item) => <option key={item} value={item}>+{item} phút</option>)}
        </select></label>
      </div>}
    </div>
    {sessionRows.length && !visibleRows.length && <p>Session này không có dự đoán phù hợp với bộ lọc.</p>}
    {visibleRows.length ? <div className="sci-table-wrap sci-experiment-predictions-table"><table className="sci-table"><thead><tr>
      <th>Mô hình</th><th>Mốc</th><th>Thời điểm dự báo (Athens)</th><th>Thời điểm cần dự báo (Athens)</th>
      <th>Thực tế</th><th>Dự báo</th>
    </tr></thead><tbody>{visibleRows.map((row, index) => {
      return <tr className={`sci-prediction-row sci-prediction-row--h${row.horizon_minutes}`} key={`${row.model}:${row.horizon_minutes}:${row.forecast_origin_time}:${row.target_timestamp}:${index}`}>
      <td><span className={`sci-model-badge sci-model-badge--${String(row.model).toLowerCase()}`}>{row.model}</span></td>
      <td><span className={`sci-horizon-badge sci-horizon-badge--h${row.horizon_minutes}`}>+{row.horizon_minutes} phút</span></td>
      <td>{formatAthensRecordingDateTime(row.forecast_origin_time)}</td>
      <td>{formatAthensRecordingDateTime(row.target_timestamp)}</td>
      <td>{formatTrafficFlow(row.actual_traffic_flow)}</td>
      <td>{formatTrafficFlow(row.predicted_traffic_flow)}</td>
    </tr>})}</tbody></table></div> : !sessionRows.length && <p>Chưa có dự đoán trên tập {subsetLabel}.</p>}
    {showSessionSummary && <ValidationSessionMetricsTable predictions={sessionRows} sessionsById={sessionsById} sessionId={sessionId} />}
  </section>
}

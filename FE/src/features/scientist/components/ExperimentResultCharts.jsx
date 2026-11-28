import { useMemo, useState } from 'react'
import { CartesianGrid, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatAthensRecordingDateTime, formatTrafficFlow } from '../utils/formatters'

const HORIZONS = [1, 3, 5]

function randomForestMetrics(metrics, horizon) {
  const models = metrics || {}
  return models.RANDOM_FOREST?.[String(horizon)]
    || models.RANDOM_FOREST?.[horizon]
    || models.random_forest?.[String(horizon)]
    || models.random_forest?.[horizon]
    || null
}

function metricLabel({ x, y, value, stroke }) {
  if (value == null) return null
  return <text x={x} y={y - 10} fill={stroke} textAnchor="middle" fontSize="11" fontWeight="700">{Number(value).toFixed(2)}</text>
}

function PredictionTooltip({ active, payload, mae, rmse }) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  if (!point) return null
  return <div className="sci-experiment-chart-tooltip">
    <strong>{point.timeLabel}</strong>
    <span>Thực tế: <b>{formatTrafficFlow(point.actual)}</b> xe/phút</span>
    <span>Dự báo: <b>{formatTrafficFlow(point.predicted)}</b> xe/phút</span>
    <span>MAE: <b>{mae.toFixed(2)}</b> xe/phút</span>
    <span>RMSE: <b>{rmse.toFixed(2)}</b> xe/phút</span>
  </div>
}

export function ForecastHorizonErrorChart({ metrics }) {
  const data = HORIZONS.map((horizon) => {
    const values = randomForestMetrics(metrics, horizon)
    return values ? { horizonLabel: `+${horizon} phút`, mae: Number(values.mae), rmse: Number(values.rmse) } : null
  }).filter(Boolean)

  return <section className="sci-experiment-chart-card">
    <div className="sci-experiment-chart-card__heading"><div>
      <h3>Ảnh hưởng của Forecast Horizon đến sai số Random Forest</h3>
      <p>Xu hướng MAE và RMSE trên tập Test tại các mốc +1, +3 và +5 phút.</p>
    </div></div>
    {data.length === 0 ? <div className="sci-state">Thí nghiệm chưa có MAE/RMSE của Random Forest theo Forecast Horizon.</div>
      : <div className="sci-experiment-chart-canvas" role="img" aria-label="Biểu đồ MAE và RMSE theo Forecast Horizon">
        <ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 28, right: 28, left: 4, bottom: 8 }}>
          <CartesianGrid strokeDasharray="4 4" stroke="#dbe6f2" />
          <XAxis dataKey="horizonLabel" tick={{ fill: '#526987', fontSize: 12 }} axisLine={{ stroke: '#b8cae0' }} />
          <YAxis tick={{ fill: '#526987', fontSize: 12 }} axisLine={false} tickLine={false} width={55} />
          <Tooltip formatter={(value, name) => [Number(value).toFixed(2), name]} /><Legend />
          <Line type="monotone" dataKey="mae" name="MAE" stroke="#1769e0" strokeWidth={3} dot={{ r: 5, fill: '#fff', strokeWidth: 3 }} activeDot={{ r: 7 }}>
            <LabelList dataKey="mae" content={metricLabel} stroke="#1769e0" />
          </Line>
          <Line type="monotone" dataKey="rmse" name="RMSE" stroke="#0b9b68" strokeWidth={3} dot={{ r: 5, fill: '#fff', strokeWidth: 3 }} activeDot={{ r: 7 }}>
            <LabelList dataKey="rmse" content={metricLabel} stroke="#0b9b68" />
          </Line>
        </LineChart></ResponsiveContainer>
      </div>}
  </section>
}

export function ActualPredictedChart({ predictions = [], sessionsById = {}, subsetLabel = 'Test' }) {
  const [horizon, setHorizon] = useState(1)
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const sessionSeries = useMemo(() => {
    const grouped = new Map()
    predictions
      .filter((row) => String(row.model).toUpperCase() === 'RANDOM_FOREST'
        && Number(row.horizon_minutes ?? row.forecast_horizon) === horizon)
      .forEach((row) => {
        const sessionId = String(row.session_id || 'unknown')
        if (!grouped.has(sessionId)) grouped.set(sessionId, [])
        grouped.get(sessionId).push({
          timestamp: row.target_timestamp ?? row.target_time,
          actual: Number(row.actual_traffic_flow), predicted: Number(row.predicted_traffic_flow),
        })
      })
    return [...grouped].map(([sessionId, rows]) => {
      const data = rows.filter((row) => row.timestamp && Number.isFinite(row.actual) && Number.isFinite(row.predicted))
        .sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp))
        .map((row) => ({ ...row, timeLabel: formatAthensRecordingDateTime(row.timestamp) }))
      return {
        sessionId,
        sessionName: sessionsById[sessionId]?.original_filename || (sessionId === 'unknown' ? 'Session chưa xác định' : `Session ${sessionId.slice(0, 8)}`),
        data,
        mae: data.length ? data.reduce((sum, row) => sum + Math.abs(row.actual - row.predicted), 0) / data.length : 0,
        rmse: data.length ? Math.sqrt(data.reduce((sum, row) => sum + (row.actual - row.predicted) ** 2, 0) / data.length) : 0,
      }
    }).filter((session) => session.data.length > 0)
      .sort((left, right) => new Date(left.data[0].timestamp) - new Date(right.data[0].timestamp))
  }, [horizon, predictions, sessionsById])
  const sessionId = sessionSeries.some((session) => session.sessionId === selectedSessionId)
    ? selectedSessionId : sessionSeries[0]?.sessionId || ''
  const visibleSessionSeries = sessionSeries.filter((session) => session.sessionId === sessionId)

  return <section className="sci-experiment-chart-card">
    <div className="sci-experiment-chart-card__heading sci-experiment-chart-card__heading--filter">
      <div><h3>Thực tế và dự báo Random Forest trên tập {subsetLabel}</h3><p>Mỗi phiên ghi hình là một chuỗi riêng để không nối qua khoảng thời gian gián đoạn.</p></div>
      <div className="sci-experiment-chart-card__filters">
        <label>Phiên ghi hình<select value={sessionId} onChange={(event) => setSelectedSessionId(event.target.value)}>
          {sessionSeries.map((session) => <option key={session.sessionId} value={session.sessionId}>{session.sessionName}</option>)}
        </select></label>
        <label>Mốc dự báo<select value={horizon} onChange={(event) => setHorizon(Number(event.target.value))}>
          {HORIZONS.map((value) => <option key={value} value={value}>+{value} phút</option>)}
        </select></label>
      </div>
    </div>
    {sessionSeries.length === 0 ? <div className="sci-state">Không có dữ liệu thực tế và dự báo Random Forest cho mốc +{horizon} phút.</div>
      : <div className="sci-experiment-session-charts">{visibleSessionSeries.map((session) => <article className="sci-experiment-session-chart" key={session.sessionId}>
        <div className="sci-experiment-session-chart__title"><strong>{session.sessionName}</strong><span>{session.data.length} mẫu dự báo</span></div>
        <div className="sci-experiment-chart-canvas sci-experiment-chart-canvas--prediction" role="img" aria-label={`Thực tế và dự báo của ${session.sessionName}`}>
          <ResponsiveContainer width="100%" height="100%"><LineChart data={session.data} margin={{ top: 12, right: 24, left: 4, bottom: 8 }}>
            <CartesianGrid strokeDasharray="4 4" stroke="#dbe6f2" />
            <XAxis dataKey="timeLabel" minTickGap={38} tickFormatter={(value) => value.split(', ').at(-1)} tick={{ fill: '#526987', fontSize: 11 }} axisLine={{ stroke: '#b8cae0' }} />
            <YAxis tick={{ fill: '#526987', fontSize: 11 }} tickFormatter={formatTrafficFlow} allowDecimals={false} axisLine={false} tickLine={false} width={58} label={{ value: 'xe/phút', angle: -90, position: 'insideLeft', fill: '#64748b' }} />
            <Tooltip content={<PredictionTooltip mae={session.mae} rmse={session.rmse} />} /><Legend />
            <Line type="linear" dataKey="actual" name="Thực tế" stroke="#1769e0" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} connectNulls={false} />
            <Line type="linear" dataKey="predicted" name="Dự báo Random Forest" stroke="#0b9b68" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} connectNulls={false} />
          </LineChart></ResponsiveContainer>
        </div>
      </article>)}</div>}
  </section>
}

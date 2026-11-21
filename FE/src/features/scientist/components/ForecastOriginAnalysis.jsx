import {
  Bar, BarChart, CartesianGrid, LabelList,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { useForecastOriginAnalysis } from '../../../hooks/useForecastOriginAnalysis'
import { formatAthensRecordingDateTime, formatTrafficFlow } from '../utils/formatters'

const formatValue = (value) => Number(value).toFixed(2)
const horizonLabel = (value) => `+${value} phút`

function ErrorTooltip({ active, payload }) {
  const point = active && payload?.[0]?.payload
  if (!point) return null
  return <div className="sci-experiment-chart-tooltip">
    <strong>{point.horizonLabel}</strong>
    <span>Thực tế: <b>{formatTrafficFlow(point.actual)} xe/phút</b></span>
    <span>Dự báo: <b>{formatTrafficFlow(point.predicted)} xe/phút</b></span>
    <span>Sai số tuyệt đối: <b>{formatValue(point.absolute_error)} xe/phút</b></span>
  </div>
}

export default function ForecastOriginAnalysis({ experimentId }) {
  const { data, loading, error, selectSession, selectOrigin } = useForecastOriginAnalysis(experimentId)
  const predictions = data?.predictions || []
  const errorData = predictions.map((row) => ({ ...row, horizonLabel: horizonLabel(row.horizon_minutes) }))

  return <section className="sci-experiment-chart-card sci-origin-analysis" aria-labelledby="sci-origin-analysis-title">
    <div className="sci-experiment-chart-card__heading">
      <div>
        <h3 id="sci-origin-analysis-title">Phân tích dự báo theo thời gian gốc</h3>
        <p>Chọn phiên ghi hình và thời gian gốc thuộc tập Test để so sánh ba mốc dự báo Random Forest.</p>
      </div>
    </div>
    <div className="sci-origin-analysis__filters">
      <label>Phiên ghi hình
        <select value={data?.selected_session_id || ''} onChange={(event) => selectSession(event.target.value)} disabled={loading || !data?.sessions?.length}>
            {(data?.sessions || []).map((session) => <option value={session.session_id} key={session.session_id}>{session.filename}</option>)}
        </select>
      </label>
      <label>Thời gian gốc (Athens)
        <select value={data?.selected_origin_time || ''} onChange={(event) => selectOrigin(event.target.value)} disabled={loading || !data?.origins?.length}>
          {(data?.origins || []).map((origin) => <option value={origin} key={origin}>{formatAthensRecordingDateTime(origin)}</option>)}
        </select>
      </label>
    </div>
    {loading && <p className="sci-state" role="status">Đang tải kết quả dự báo Test…</p>}
    {error && <p className="sci-state sci-state--error" role="alert">{error}</p>}
    {!loading && !error && data?.message && <p className="sci-state" role="status">{data.message}</p>}
    {!loading && !error && predictions.length > 0 && <>
      <div className="sci-origin-analysis__panel">
        <h4>Dự báo từ {formatAthensRecordingDateTime(data.selected_origin_time)}</h4>
        <div className="sci-table-wrap"><table className="sci-table">
          <thead><tr><th>Mốc dự báo</th><th>Thời gian gốc (Athens)</th><th>Thời điểm cần dự báo (Athens)</th><th>Thực tế (xe/phút)</th><th>Dự báo (xe/phút)</th><th>MAE (xe/phút)</th></tr></thead>
          <tbody>{predictions.map((row) => <tr key={row.horizon_minutes} className={`sci-forecast-row sci-forecast-row--h${row.horizon_minutes}`}>
            <td><span className={`sci-horizon-badge sci-horizon-badge--h${row.horizon_minutes}`}>{horizonLabel(row.horizon_minutes)}</span></td>
            <td>{formatAthensRecordingDateTime(row.origin_time)}</td>
            <td>{formatAthensRecordingDateTime(row.target_time)}</td>
            <td>{formatTrafficFlow(row.actual)}</td><td>{formatTrafficFlow(row.predicted)}</td><td>{formatValue(row.absolute_error)}</td>
          </tr>)}</tbody>
        </table></div>
      </div>
      <div className="sci-origin-analysis__panel">
        <h4>Sai số tuyệt đối theo mốc dự báo</h4>
        <p>Mỗi cột là sai số của một dự báo tại thời gian gốc đã chọn.</p>
        <div className="sci-experiment-chart-canvas" role="img" aria-label="Biểu đồ sai số tuyệt đối của ba mốc dự báo">
          <ResponsiveContainer width="100%" height="100%"><BarChart data={errorData} margin={{ top: 28, right: 24, bottom: 8, left: 4 }}>
            <CartesianGrid strokeDasharray="4 4" stroke="#dbe6f2" vertical={false} />
            <XAxis dataKey="horizonLabel" /><YAxis width={56} unit="" label={{ value: 'xe/phút', angle: -90, position: 'insideLeft' }} />
            <Tooltip content={<ErrorTooltip />} />
            <Bar dataKey="absolute_error" name="Sai số tuyệt đối" fill="#e87722" radius={[6, 6, 0, 0]} maxBarSize={100}>
              <LabelList dataKey="absolute_error" position="top" formatter={formatValue} />
            </Bar>
          </BarChart></ResponsiveContainer>
        </div>
      </div>
    </>}
  </section>
}

import { CheckCircle2, LoaderCircle } from 'lucide-react'
import ForecastResultCharts from './ForecastResultCharts'
import { formatAthensRecordingDateTime, formatTrafficFlow } from '../utils/formatters'

const shortId = (value) => value ? String(value).slice(0, 8) : '—'
const formatDateTime = (value) => value ? new Date(value).toLocaleString('vi-VN') : '—'

export default function ForecastResultsPanel({ forecast, charts, chartErrors, chartsLoading }) {
  return <section className="sci-prediction-card sci-prediction-results">
    <div className="sci-prediction-section-heading">
      <div className="sci-prediction-section-heading__icon sci-prediction-section-heading__icon--green"><CheckCircle2 size={20} /></div>
      <div><h2>Kết quả dự báo</h2><p>{forecast.experiment_name} · {formatDateTime(forecast.created_at)} · Trạng thái: <strong>{forecast.status}</strong></p></div>
    </div>
    {forecast.results_by_session.map((session) => <div className="sci-prediction-result-session" key={session.session_id}>
      <h3>{session.original_filename || `Session ${shortId(session.session_id)}`}</h3>
      <div className="sci-table-wrap"><table className="sci-table"><thead><tr><th>Mốc dự báo</th><th>Thời điểm cần dự báo (Athens)</th><th>Số xe dự báo (xe/phút)</th></tr></thead><tbody>
        {session.predictions.map((point) => <tr key={point.horizon}>
          <td><span className={`sci-horizon-badge sci-horizon-badge--h${point.horizon}`}>+{point.horizon} phút</span></td>
          <td>{formatAthensRecordingDateTime(point.forecast_timestamp)}</td>
          <td><strong>{formatTrafficFlow(point.predicted_vehicle_count)}</strong></td>
        </tr>)}
      </tbody></table></div>
      {charts[session.session_id]
        ? <ForecastResultCharts chart={charts[session.session_id]} />
        : chartErrors[session.session_id]
          ? <div className="sci-state sci-state--error" role="alert">{chartErrors[session.session_id]}</div>
          : chartsLoading && <div className="sci-prediction-empty" role="status"><LoaderCircle className="sci-training-spin" size={18} /> Đang tải biểu đồ…</div>}
    </div>)}
    {forecast.session_errors?.map((item, index) => <div className="sci-state sci-state--error" role="alert" key={index}>{item.message || JSON.stringify(item)}</div>)}
  </section>
}

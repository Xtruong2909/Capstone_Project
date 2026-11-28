import { useMemo } from 'react'
import { validationSessionMetrics } from '../utils/validationSessionMetrics'

const number = value => Number.isFinite(value) ? value.toFixed(2) : '—'

export default function ValidationSessionMetricsTable({ predictions, sessionsById, sessionId }) {
  const metrics = useMemo(() => validationSessionMetrics(
    predictions.filter(row => row.session_id === sessionId),
  ), [predictions, sessionId])
  const row = metrics.rows[0]
  if (!row) return null
  return <section className="sci-experiment-results-section">
    <h3>MAE và RMSE của phiên đang chọn</h3>
    <p>{sessionsById[sessionId]?.original_filename || 'Phiên ghi hình đang chọn'}</p>
    <div className="validation-table-scroll"><table className="validation-table"><thead><tr>
      <th>Khoảng dự báo</th><th>MAE</th><th>RMSE</th><th>Số mẫu của phiên</th>
    </tr></thead><tbody>{[1, 3, 5].map(h => <tr key={h}>
      <td>+{h} phút</td><td>{number(row.horizons[h]?.mae)}</td><td>{number(row.horizons[h]?.rmse)}</td><td>{row.horizons[h]?.count ?? '—'}</td>
    </tr>)}</tbody><tfoot><tr className="validation-winner">
      <td><strong>Trung bình 3 mốc của phiên</strong></td><td><strong>{number(row.meanMae)}</strong></td><td><strong>{number(row.meanRmse)}</strong></td><td>—</td>
    </tr></tfoot></table></div>
  </section>
}

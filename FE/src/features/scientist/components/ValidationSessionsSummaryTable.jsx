import { useMemo } from 'react'
import { validationSessionMetrics } from '../utils/validationSessionMetrics'

const number = value => Number.isFinite(value) ? value.toFixed(2) : '—'

export default function ValidationSessionsSummaryTable({ predictions, sessionsById, candidate }) {
  const metrics = useMemo(() => validationSessionMetrics(predictions), [predictions])
  const rows = [...metrics.rows].sort((left, right) =>
    (sessionsById[left.sessionId]?.original_filename || left.sessionId).localeCompare(
      sessionsById[right.sessionId]?.original_filename || right.sessionId,
    ))
  if (!rows.length) return null
  const label = `C${candidate.index + 1}`
  const pooled = candidate.metrics?.RANDOM_FOREST
  return <section className="sci-experiment-results-section">
    <h3>Tổng hợp các phiên validation · {label}</h3>
    <div className="validation-table-scroll"><table className="validation-table">
      <thead><tr><th>Phiên ghi hình</th><th>RMSE +1</th><th>RMSE +3</th><th>RMSE +5</th><th>RMSE TB</th><th>MAE TB</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.sessionId}>
        <td>{sessionsById[row.sessionId]?.original_filename || 'Phiên ghi hình'}</td>
        {[1, 3, 5].map(h => <td key={h}>{number(row.horizons[h]?.rmse)}</td>)}
        <td>{number(row.meanRmse)}</td><td>{number(row.meanMae)}</td>
      </tr>)}</tbody>
      <tfoot><tr className="validation-winner">
        <td><strong>Toàn tập validation · {label}</strong></td>
        {[1, 3, 5].map(h => <td key={h}><strong>{number(pooled?.[h]?.rmse)}</strong></td>)}
        <td><strong>{number(candidate.mean_rmse)}</strong></td><td><strong>{number(candidate.mean_mae)}</strong></td>
      </tr></tfoot>
    </table></div>
    <p>Mỗi dòng là kết quả của một phiên. RMSE TB và MAE TB là trung bình ba mốc +1, +3, +5 phút của dòng đó.</p>
    <p>Dòng toàn tập dùng tất cả mẫu validation, khớp bảng lựa chọn cấu hình. Với mỗi mốc: RMSE toàn tập = √[Σ(số mẫu phiên × RMSE phiên²) ÷ tổng số mẫu]; MAE toàn tập = Σ(số mẫu phiên × MAE phiên) ÷ tổng số mẫu. Các phép tính dùng số chưa làm tròn.</p>
  </section>
}
